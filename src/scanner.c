#include "tree_sitter/parser.h"

#include <stdbool.h>
#include <stdint.h>
#include <string.h>

#include "duration_unicode.h"

enum TokenType {
  NOMINAL_RECORD_CONSTRUCTION,
  RECORD_LBRACE,
  CALL_TYPE_ARGUMENTS,
  CASE_PATTERN,
  STRING,
  TAGGED_TEMPLATE,
  COMPREHENSION_CLAUSES,
  BINDING_CONDITION,
  RECORD_DECLARATION_START,
  DURATION_LITERAL,
  DURATION_ERROR_SENTINEL,
  INTEGER_LITERAL,
  FLOAT_LITERAL,
  LENGTH_LITERAL,
};

void *tree_sitter_topaz_external_scanner_create(void) { return NULL; }
void tree_sitter_topaz_external_scanner_destroy(void *payload) {
  (void)payload;
}
unsigned tree_sitter_topaz_external_scanner_serialize(void *payload,
                                                      char *buffer) {
  (void)payload;
  (void)buffer;
  return 0;
}
void tree_sitter_topaz_external_scanner_deserialize(void *payload,
                                                    const char *buffer,
                                                    unsigned length) {
  (void)payload;
  (void)buffer;
  (void)length;
}

static bool is_space(int32_t character) {
  return character == ' ' || character == '\t' || character == '\r' ||
         character == '\n' || character == '\f';
}

static bool is_identifier_start(int32_t character) {
  return character == '_' || character >= 0x80 ||
         (character >= 'A' && character <= 'Z') ||
         (character >= 'a' && character <= 'z');
}

static bool is_identifier_continue(int32_t character) {
  return is_identifier_start(character) ||
         (character >= '0' && character <= '9');
}

// Duration boundaries use the pinned compiler contract, not the older helpers
// above. Keep that change local to this token; opaque constructions are separate.
static bool is_duration_identifier_continue(int32_t character) {
  uint32_t scalar = (uint32_t)character;
  size_t low = 0;
  size_t high = sizeof(topaz_duration_identifier_continue) /
                sizeof(topaz_duration_identifier_continue[0]);
  while (low < high) {
    size_t middle = low + (high - low) / 2;
    if (scalar < topaz_duration_identifier_continue[middle][0]) {
      high = middle;
    } else if (scalar > topaz_duration_identifier_continue[middle][1]) {
      low = middle + 1;
    } else {
      return true;
    }
  }
  return false;
}

static bool is_digit(int32_t c, unsigned radix) {
  if (c >= '0' && c <= '9') return (unsigned)(c - '0') < radix;
  return radix == 16 && ((c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F'));
}

// Only lexical shape/boundaries live here. Magnitude, MIN, unit scaling and
// cooked values remain facts owned by the language compiler.
static bool scan_digits(TSLexer *lexer, unsigned radix, int32_t *last) {
  if (!is_digit(lexer->lookahead, radix)) return false;
  while (is_digit(lexer->lookahead, radix)) {
    if (last) *last = lexer->lookahead;
    lexer->advance(lexer, false);
    if (lexer->lookahead == '_') {
      lexer->advance(lexer, false);
      if (!is_digit(lexer->lookahead, radix)) return false;
    }
  }
  return true;
}

// raw::number keeps exponent-like signs in a malformed radix Length token.
// Look ahead without moving the marked integer end; ordinary hex arithmetic
// such as 0x1e+3 and 0x1e + 3pt must still split at the operator.
static bool scan_radix_length_tail(TSLexer *lexer, int32_t previous) {
  int32_t penultimate = 0;
  while (!lexer->eof(lexer)) {
    int32_t c = lexer->lookahead;
    if (is_digit(c, 10) || (c >= 'a' && c <= 'z') ||
        (c >= 'A' && c <= 'Z') || c == '_' ||
        ((c == '+' || c == '-') && (previous == 'e' || previous == 'E'))) {
      penultimate = previous;
      previous = c;
      lexer->advance(lexer, false);
    } else if (c == '.') {
      lexer->advance(lexer, false);
      if (!is_digit(lexer->lookahead, 10) && lexer->lookahead != '_') break;
      penultimate = previous;
      previous = c;
    } else {
      break;
    }
  }
  return (penultimate == 'p' && previous == 't') ||
         (penultimate == 'm' && previous == 'm') ||
         (penultimate == 'c' && previous == 'm') ||
         (penultimate == 'i' && previous == 'n') ||
         (penultimate == 'e' && previous == 'm');
}

static bool scan_number(TSLexer *lexer, const bool *valid_symbols) {
  unsigned radix = 10;
  int32_t last = 0;
  bool fraction = false;
  if (lexer->lookahead == '0') {
    lexer->advance(lexer, false);
    if (lexer->lookahead == 'x' || lexer->lookahead == 'X' ||
        lexer->lookahead == 'b' || lexer->lookahead == 'B') {
      radix = lexer->lookahead == 'x' || lexer->lookahead == 'X' ? 16 : 2;
      lexer->advance(lexer, false);
      if (!scan_digits(lexer, radix, &last)) return false;
    } else if (lexer->lookahead == '_') {
      lexer->advance(lexer, false);
      if (!scan_digits(lexer, 10, NULL)) return false;
    } else if (is_digit(lexer->lookahead, 10) && !scan_digits(lexer, 10, NULL)) {
      return false;
    }
  } else if (!scan_digits(lexer, 10, NULL)) {
    return false;
  }
  lexer->mark_end(lexer);
  if (radix == 16 && (last == 'e' || last == 'E') &&
      (lexer->lookahead == '+' || lexer->lookahead == '-')) {
    if (scan_radix_length_tail(lexer, last) || !valid_symbols[INTEGER_LITERAL])
      return false;
    lexer->result_symbol = INTEGER_LITERAL;
    return true;
  }
  if (lexer->lookahead == '.') {
    lexer->advance(lexer, false);
    if (lexer->lookahead == '_') return false;
    if (is_digit(lexer->lookahead, 10)) {
      if (radix != 10 || !scan_digits(lexer, 10, NULL)) return false;
      fraction = true;
      lexer->mark_end(lexer);
    } else {
      // Keep 1..5 / 1..<5 / 3.member at the end before the dot.
      if (!valid_symbols[INTEGER_LITERAL]) return false;
      lexer->result_symbol = INTEGER_LITERAL;
      return true;
    }
  }
  char suffix[4] = {0};
  unsigned size = 0;
  while (is_duration_identifier_continue(lexer->lookahead)) {
    if (size >= sizeof(suffix) - 1 || lexer->lookahead >= 0x80) return false;
    suffix[size++] = (char)lexer->lookahead;
    lexer->advance(lexer, false);
  }
  enum TokenType symbol = fraction ? FLOAT_LITERAL : INTEGER_LITERAL;
  if (size) {
    if (radix != 10) return false;
    if (!strcmp(suffix, "pt") || !strcmp(suffix, "mm") ||
        !strcmp(suffix, "cm") || !strcmp(suffix, "in") || !strcmp(suffix, "em")) {
      symbol = LENGTH_LITERAL;
    } else if (!fraction && (!strcmp(suffix, "ms") || !strcmp(suffix, "s") ||
                             !strcmp(suffix, "m"))) {
      symbol = DURATION_LITERAL;
    } else {
      return false;
    }
    lexer->mark_end(lexer);
  }
  if (!valid_symbols[symbol]) return false;
  lexer->result_symbol = symbol;
  return true;
}

static void skip_space_and_comments(TSLexer *lexer, bool skip) {
  for (;;) {
    while (is_space(lexer->lookahead)) {
      lexer->advance(lexer, skip);
    }
    if (lexer->lookahead != '/') {
      return;
    }
    lexer->advance(lexer, skip);
    if (lexer->lookahead == '/') {
      while (!lexer->eof(lexer) && lexer->lookahead != '\n' &&
             lexer->lookahead != '\r') {
        lexer->advance(lexer, skip);
      }
      continue;
    }
    if (lexer->lookahead == '*') {
      lexer->advance(lexer, skip);
      int32_t previous = 0;
      while (!lexer->eof(lexer)) {
        int32_t current = lexer->lookahead;
        lexer->advance(lexer, skip);
        if (previous == '*' && current == '/') {
          break;
        }
        previous = current;
      }
      continue;
    }
    return;
  }
}

// Commit only the contextual head, leaving the name and fields to the grammar.
// Otherwise the nominal-construction token consumes `Name { ... }` after
// `record` has been reduced to an ordinary identifier.
static bool scan_string_body(TSLexer *lexer, bool single_line_ancestor);
static bool scan_record_declaration_start(TSLexer *lexer, bool tagged_template) {
  static const char head[] = "record";
  for (unsigned i = 0; i < sizeof(head) - 1; i++) {
    if (lexer->lookahead != head[i]) {
      if (i == 1 && tagged_template && lexer->lookahead == '"' &&
          scan_string_body(lexer, false)) {
        lexer->result_symbol = TAGGED_TEMPLATE;
        return true;
      }
      return false;
    }
    lexer->advance(lexer, false);
  }
  if (is_identifier_continue(lexer->lookahead)) return false;
  lexer->mark_end(lexer);
  skip_space_and_comments(lexer, false);
  if (!is_identifier_start(lexer->lookahead)) return false;
  do {
    lexer->advance(lexer, false);
  } while (is_identifier_continue(lexer->lookahead));
  skip_space_and_comments(lexer, false);
  if (lexer->lookahead != '{' && lexer->lookahead != '<') {
    static const char derives[] = "derives";
    for (unsigned i = 0; i < sizeof(derives) - 1; i++) {
      if (lexer->lookahead != derives[i]) return false;
      lexer->advance(lexer, false);
    }
    if (is_identifier_continue(lexer->lookahead)) return false;
  }
  lexer->result_symbol = RECORD_DECLARATION_START;
  return true;
}

static bool scan_nominal_record_construction(TSLexer *lexer) {
  if (!is_identifier_start(lexer->lookahead)) {
    return false;
  }
  char head[24] = {0};
  unsigned head_length = 0;
  do {
    if (lexer->lookahead < 0x80 && head_length + 1 < sizeof(head)) {
      head[head_length++] = (char)lexer->lookahead;
    }
    lexer->advance(lexer, false);
  } while (is_identifier_continue(lexer->lookahead));
  // These heads need grammar-level disambiguation (declarations, collection
  // literals, or contextual identifiers). This is not the keyword registry.
  static const char *grammar_heads[] = {
      "break",    "case",     "concurrent", "const",    "continue",
      "defer",    "else",     "enum",       "export",   "false",
      "for",      "function", "if",         "impl",     "import",
      "let",      "loop",     "map",        "match",    "mut",
      "newtype",  "null",     "protocol",   "record",   "return",
      "set",      "true",     "type",       "using",    "while",
  };
  for (unsigned i = 0; i < sizeof(grammar_heads) / sizeof(grammar_heads[0]); i++) {
    if (strcmp(head, grammar_heads[i]) == 0) {
      return false;
    }
  }
  while (is_space(lexer->lookahead)) {
    lexer->advance(lexer, false);
  }
  if (lexer->lookahead != '{') {
    return false;
  }

  lexer->advance(lexer, false);
  while (is_space(lexer->lookahead)) {
    lexer->advance(lexer, false);
  }
  bool valid_head = lexer->lookahead == '}' || lexer->lookahead == '.';
  if (!valid_head && is_identifier_start(lexer->lookahead)) {
    do {
      lexer->advance(lexer, false);
    } while (is_identifier_continue(lexer->lookahead));
    while (is_space(lexer->lookahead)) {
      lexer->advance(lexer, false);
    }
    valid_head = lexer->lookahead == ':';
  }
  if (!valid_head) {
    return false;
  }

  unsigned depth = 1;
  bool string = false;
  bool escaped = false;
  while (!lexer->eof(lexer)) {
    int32_t character = lexer->lookahead;
    lexer->advance(lexer, false);
    if (string) {
      if (escaped) {
        escaped = false;
      } else if (character == '\\') {
        escaped = true;
      } else if (character == '"') {
        string = false;
      }
      continue;
    }
    if (character == '"') {
      string = true;
    } else if (character == '{') {
      depth += 1;
    } else if (character == '}') {
      depth -= 1;
      if (depth == 0) {
        lexer->mark_end(lexer);
        return true;
      }
    }
  }
  return false;
}

static bool scan_string_body(TSLexer *lexer, bool single_line_ancestor) {
  if (lexer->lookahead != '"') {
    return false;
  }

  lexer->advance(lexer, false);
  bool triple = false;
  if (lexer->lookahead == '"') {
    lexer->advance(lexer, false);
    if (lexer->lookahead == '"') {
      lexer->advance(lexer, false);
      triple = true;
    } else {
      return true;
    }
  }

  unsigned interpolation_depth = 0;
  bool escaped = false;
  while (!lexer->eof(lexer)) {
    int32_t character = lexer->lookahead;
    // Line comments leave LF for this check. Lone CR is text, not a line end.
    // Nested triple strings cannot bypass a single-line interpolation owner.
    if (character == '\n' && (!triple || single_line_ancestor)) return false;
    if (escaped) {
      lexer->advance(lexer, false);
      escaped = false;
      continue;
    }
    if (character == '\\') {
      lexer->advance(lexer, false);
      escaped = true;
      continue;
    }

    if (interpolation_depth > 0) {
      if (character == '"') {
        if (!scan_string_body(lexer, single_line_ancestor || !triple)) return false;
        continue;
      }
      if (character == '/') {
        lexer->advance(lexer, false);
        if (lexer->lookahead == '/') {
          while (!lexer->eof(lexer) && lexer->lookahead != '\n')
            lexer->advance(lexer, false);
        } else if (lexer->lookahead == '*') {
          lexer->advance(lexer, false);
          int32_t previous = 0;
          while (!lexer->eof(lexer)) {
            int32_t current = lexer->lookahead;
            lexer->advance(lexer, false);
            if (previous == '*' && current == '/') break;
            previous = current;
          }
        }
        continue;
      }
      if (character == '{') {
        interpolation_depth += 1;
      } else if (character == '}') {
        interpolation_depth -= 1;
      }
      lexer->advance(lexer, false);
      continue;
    }

    if (character == '{') {
      interpolation_depth = 1;
      lexer->advance(lexer, false);
      continue;
    }
    if (character == '\n') {
      lexer->advance(lexer, false);
      continue;
    }
    if (character != '"') {
      lexer->advance(lexer, false);
      continue;
    }

    lexer->advance(lexer, false);
    if (!triple) {
      lexer->mark_end(lexer);
      return true;
    }
    if (lexer->lookahead != '"') {
      continue;
    }
    lexer->advance(lexer, false);
    if (lexer->lookahead != '"') {
      continue;
    }
    lexer->advance(lexer, false);
    lexer->mark_end(lexer);
    return true;
  }
  return false;
}

static bool scan_tagged_template(TSLexer *lexer) {
  if (lexer->lookahead == 'p' || lexer->lookahead == 'r') {
    lexer->advance(lexer, false);
  } else if (lexer->lookahead == 's') {
    lexer->advance(lexer, false);
    if (lexer->lookahead == 'h') {
      lexer->advance(lexer, false);
    } else if (lexer->lookahead == 'q') {
      lexer->advance(lexer, false);
      if (lexer->lookahead != 'l') {
        return false;
      }
      lexer->advance(lexer, false);
    } else {
      return false;
    }
  } else {
    return false;
  }
  return scan_string_body(lexer, false);
}

static bool scan_until_arrow(TSLexer *lexer, enum TokenType symbol) {
  unsigned parentheses = 0;
  unsigned brackets = 0;
  unsigned braces = 0;
  bool consumed = false;
  bool string = false;
  bool escaped = false;
  while (!lexer->eof(lexer)) {
    int32_t character = lexer->lookahead;
    if (string) {
      lexer->advance(lexer, false);
      consumed = true;
      if (escaped) {
        escaped = false;
      } else if (character == '\\') {
        escaped = true;
      } else if (character == '"') {
        string = false;
      }
      continue;
    }
    if (character == '"') {
      string = true;
      lexer->advance(lexer, false);
      consumed = true;
      continue;
    }
    if (character == '(') {
      parentheses += 1;
    } else if (character == ')' && parentheses > 0) {
      parentheses -= 1;
    } else if (character == '[') {
      brackets += 1;
    } else if (character == ']' && brackets > 0) {
      brackets -= 1;
    } else if (character == '{') {
      braces += 1;
    } else if (character == '}' && braces > 0) {
      braces -= 1;
    } else if (character == '=' && parentheses == 0 && brackets == 0 &&
               braces == 0) {
      lexer->mark_end(lexer);
      lexer->advance(lexer, false);
      if (lexer->lookahead == '>' && consumed) {
        lexer->result_symbol = symbol;
        return true;
      }
      consumed = true;
      continue;
    }
    lexer->advance(lexer, false);
    consumed = true;
  }
  return false;
}

static bool scan_comprehension_clauses(TSLexer *lexer) {
  if (lexer->lookahead != 'f') {
    return false;
  }
  lexer->advance(lexer, false);
  if (lexer->lookahead != 'o') {
    return false;
  }
  lexer->advance(lexer, false);
  if (lexer->lookahead != 'r') {
    return false;
  }
  lexer->advance(lexer, false);
  if (!is_space(lexer->lookahead)) {
    return false;
  }
  return scan_until_arrow(lexer, COMPREHENSION_CLAUSES);
}

static bool scan_binding_condition(TSLexer *lexer) {
  static const char head[] = "let";
  for (unsigned i = 0; i < sizeof(head) - 1; i++) {
    if (lexer->lookahead != head[i]) {
      return false;
    }
    lexer->advance(lexer, false);
  }
  if (!is_space(lexer->lookahead)) {
    return false;
  }

  unsigned parentheses = 0;
  unsigned brackets = 0;
  unsigned braces = 0;
  bool seen_equals = false;
  bool string = false;
  bool escaped = false;
  while (!lexer->eof(lexer)) {
    int32_t character = lexer->lookahead;
    if (string) {
      lexer->advance(lexer, false);
      if (escaped) {
        escaped = false;
      } else if (character == '\\') {
        escaped = true;
      } else if (character == '"') {
        string = false;
      }
      continue;
    }
    if (character == '"') {
      string = true;
      lexer->advance(lexer, false);
      continue;
    }
    if (character == '(') {
      parentheses += 1;
    } else if (character == ')' && parentheses > 0) {
      parentheses -= 1;
    } else if (character == '[') {
      brackets += 1;
    } else if (character == ']' && brackets > 0) {
      brackets -= 1;
    } else if (character == '{') {
      if (seen_equals && parentheses == 0 && brackets == 0 && braces == 0) {
        lexer->mark_end(lexer);
        lexer->result_symbol = BINDING_CONDITION;
        return true;
      }
      braces += 1;
    } else if (character == '}' && braces > 0) {
      braces -= 1;
    } else if (character == '=' && parentheses == 0 && brackets == 0 &&
               braces == 0) {
      seen_equals = true;
    }
    lexer->advance(lexer, false);
  }
  return false;
}

bool tree_sitter_topaz_external_scanner_scan(void *payload, TSLexer *lexer,
                                             const bool *valid_symbols) {
  (void)payload;
  while (is_space(lexer->lookahead)) {
    lexer->advance(lexer, true);
  }

  // The unused sentinel is valid only when recovery allows every external.
  // Do not turn an interior numeric fragment into a duration during recovery.
  if ((valid_symbols[DURATION_LITERAL] || valid_symbols[LENGTH_LITERAL] ||
       valid_symbols[INTEGER_LITERAL] || valid_symbols[FLOAT_LITERAL]) &&
      !valid_symbols[DURATION_ERROR_SENTINEL] &&
      lexer->lookahead >= '0' && lexer->lookahead <= '9') {
    return scan_number(lexer, valid_symbols);
  }

  if (valid_symbols[RECORD_DECLARATION_START] && lexer->lookahead == 'r') {
    // On failure the lexer rolls back; let the ordinary lexer handle `record`.
    return scan_record_declaration_start(lexer, valid_symbols[TAGGED_TEMPLATE]);
  }

  if (valid_symbols[COMPREHENSION_CLAUSES] && lexer->lookahead == 'f') {
    return scan_comprehension_clauses(lexer);
  }

  if (valid_symbols[BINDING_CONDITION] && lexer->lookahead == 'l') {
    return scan_binding_condition(lexer);
  }

  if (valid_symbols[CASE_PATTERN]) {
    unsigned parentheses = 0;
    unsigned brackets = 0;
    unsigned braces = 0;
    bool consumed = false;
    bool string = false;
    bool escaped = false;
    while (!lexer->eof(lexer)) {
      int32_t character = lexer->lookahead;
      if (string) {
        lexer->advance(lexer, false);
        consumed = true;
        if (escaped) {
          escaped = false;
        } else if (character == '\\') {
          escaped = true;
        } else if (character == '"') {
          string = false;
        }
        continue;
      }
      if (character == '"') {
        string = true;
        lexer->advance(lexer, false);
        consumed = true;
        continue;
      }
      if (character == '(') {
        parentheses += 1;
      } else if (character == ')' && parentheses > 0) {
        parentheses -= 1;
      } else if (character == '[') {
        brackets += 1;
      } else if (character == ']' && brackets > 0) {
        brackets -= 1;
      } else if (character == '{') {
        braces += 1;
      } else if (character == '}' && braces > 0) {
        braces -= 1;
      } else if (character == '=' && parentheses == 0 && brackets == 0 &&
                 braces == 0) {
        lexer->mark_end(lexer);
        lexer->advance(lexer, false);
        if (lexer->lookahead == '>' && consumed) {
          lexer->result_symbol = CASE_PATTERN;
          return true;
        }
        consumed = true;
        continue;
      }
      lexer->advance(lexer, false);
      consumed = true;
    }
    return false;
  }

  if (valid_symbols[STRING] && lexer->lookahead == '"') {
    if (scan_string_body(lexer, false)) {
      lexer->result_symbol = STRING;
      return true;
    }
    return false;
  }

  if (valid_symbols[TAGGED_TEMPLATE] &&
      (lexer->lookahead == 'p' || lexer->lookahead == 'r' ||
       lexer->lookahead == 's')) {
    if (scan_tagged_template(lexer)) {
      lexer->result_symbol = TAGGED_TEMPLATE;
      return true;
    }
    return false;
  }

  if (valid_symbols[CALL_TYPE_ARGUMENTS] && lexer->lookahead == '<') {
    unsigned depth = 0;
    do {
      if (lexer->lookahead == '<') {
        depth += 1;
      } else if (lexer->lookahead == '>') {
        depth -= 1;
      }
      lexer->advance(lexer, false);
      if (depth == 0) {
        lexer->mark_end(lexer);
        if (lexer->lookahead == '(') {
          lexer->result_symbol = CALL_TYPE_ARGUMENTS;
          return true;
        }
        return false;
      }
    } while (!lexer->eof(lexer));
    return false;
  }

  if (valid_symbols[RECORD_LBRACE] && lexer->lookahead == '{') {
    lexer->advance(lexer, false);
    lexer->mark_end(lexer);
    skip_space_and_comments(lexer, true);

    // Empty braces belong to collection literals or control-flow bodies here.
    // Empty nominal construction is handled by NOMINAL_RECORD_CONSTRUCTION.
    if (lexer->lookahead == '.') {
      lexer->advance(lexer, true);
      if (lexer->lookahead != '.') {
        return false;
      }
      lexer->advance(lexer, true);
      if (lexer->lookahead != '.') {
        return false;
      }
      lexer->result_symbol = RECORD_LBRACE;
      return true;
    }
    if (!is_identifier_start(lexer->lookahead)) {
      return false;
    }
    do {
      lexer->advance(lexer, true);
    } while (is_identifier_continue(lexer->lookahead));
    skip_space_and_comments(lexer, true);
    if (lexer->lookahead != ':') {
      return false;
    }

    lexer->result_symbol = RECORD_LBRACE;
    return true;
  }

  if (valid_symbols[NOMINAL_RECORD_CONSTRUCTION] &&
      is_identifier_start(lexer->lookahead)) {
    if (scan_nominal_record_construction(lexer)) {
      lexer->result_symbol = NOMINAL_RECORD_CONSTRUCTION;
      return true;
    }
    return false;
  }

  return false;
}
