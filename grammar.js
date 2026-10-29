// Canonical keyword_registry! in Topaz 5.20 token.rs; all other words are contextual.
const KEYWORDS = [
  "let", "mut", "const", "type", "function", "return", "if", "else",
  "match", "case", "for", "in", "by", "while", "break", "continue",
  "defer", "concurrent", "true", "false", "null",
];

const PREC = {
  assignment: 1,
  lambda: 2,
  pipe: 3,
  compose: 4,
  coalesce: 5,
  logicalOr: 6,
  logicalAnd: 7,
  compare: 8,
  range: 9,
  additive: 10,
  multiplicative: 11,
  unary: 12,
  power: 13,
  postfix: 14,
};

module.exports = grammar({
  name: "topaz",

  word: ($) => $.identifier,

  inline: ($) => [$._identifier],

  externals: ($) => [
    $._nominal_record_construction,
    $._record_lbrace,
    $._call_type_arguments,
    $._case_pattern,
    $._string,
    $._tagged_template,
    $._comprehension_clauses,
    $._binding_condition,
    $._record_declaration_start,
    $.duration_literal, $._duration_error_sentinel,
    $.integer_literal, $.float_literal, $.length_literal,
  ],

  extras: ($) => [
    /[ \t\r\n\f\uFEFF]/,
    $.line_comment,
    $.block_comment,
    $.forbidden_unterminated_block_comment,
  ],

  conflicts: ($) => [
    [$.expression_statement, $.block],
    [$._expression, $.lambda_parameter],
    [$.binding_pattern, $.type_pattern],
    [$._expression, $._const_expression],
    [$._expression, $.literal_pattern],
    [$._expression, $.record_pattern_field],
    [$.array_literal, $.list_pattern],
    [$.array_element, $.type_identifier],
    [$._expression, $.argument],
    [$._expression, $.binding_pattern],
    // Range endpoints can start with calls; keep the constructor-pattern branch.
    [$._expression, $.constructor_pattern],
    [$._top_level_item, $._statement],
    [$.refutable_let_declaration, $._pattern],
    [$.refutable_let_declaration, $._primary_pattern],
  ],

  rules: {
    source_file: ($) =>
      repeat(
        choice(
          $._top_level_item,
          $.forbidden_legacy_export_item,
          $.forbidden_legacy_import_item,
          $.forbidden_legacy_match_record_line,
          $.forbidden_empty_record_pattern_line,
          $.forbidden_empty_record_type_line,
          $.forbidden_invalid_let_line,
          $.forbidden_mut_let_line,
          $.forbidden_increment_line,
          $.forbidden_keyword_line,
          $.forbidden_template_line,
          $.forbidden_invalid_assignment_line,
          $.forbidden_refutable_let_line,
          $.forbidden_explicit_record_spread_line,
          $.forbidden_qualified_record_spread_line,
          $.forbidden_unknown_token,
          $.non_source_signature_declaration,
          $.non_source_signature_value,
        ),
      ),

    _top_level_item: ($) =>
      choice(
        $.import_declaration,
        $.export_declaration,
        $._declaration,
        $._statement,
      ),

    _declaration: ($) =>
      choice(
        $.function_declaration,
        $.type_declaration,
        $.enum_declaration,
        $.record_declaration,
        $.newtype_declaration,
        $.receiver_impl_declaration,
        $.protocol_declaration,
        $.protocol_impl_declaration,
      ),

    import_declaration: ($) =>
      prec.right(
        seq(
          "import",
          field("path", $.module_path),
          optional(
            choice(
              seq("as", field("alias", $._identifier)),
              field("selections", $.import_list),
            ),
          ),
          optional(";"),
        ),
      ),

    module_path: ($) =>
      prec.right(
        seq($._identifier, repeat(seq(".", field("segment", $._identifier)))),
      ),

    import_list: ($) =>
      seq(
        "{",
        optional(
          commaSep1(
            seq(
              field("name", $._identifier),
              optional(seq("as", field("alias", $._identifier))),
            ),
          ),
        ),
        optional(","),
        "}",
      ),

    export_declaration: ($) =>
      seq(
        "export",
        choice(
          $.function_declaration,
          $.type_declaration,
          $.enum_declaration,
          $.record_declaration,
          $.newtype_declaration,
          $.let_declaration,
          $.const_declaration,
        ),
      ),

    forbidden_legacy_export_item: ($) =>
      choice(
        seq("export", "import", $.module_path),
        seq(
          "export",
          "{",
          optional(commaSep1($.identifier)),
          optional(","),
          "}",
        ),
        seq("export", "*"),
        seq(
          "export",
          "function",
          field("name", $._identifier),
          "as",
          field("alias", $._identifier),
          $.parameter_list,
          optional($.return_type),
          $.block,
        ),
      ),

    forbidden_legacy_import_item: ($) =>
      seq("import", choice($.string, $.tagged_template)),

    forbidden_legacy_match_record_line: (_) =>
      token(prec(20, /let r = match x \{ case: 1 \}/)),

    forbidden_invalid_let_line: (_) =>
      token(prec(20, /let = [^\n\r]+/)),

    forbidden_empty_record_pattern_line: (_) =>
      token(prec(20, /let \{\} = [^\n\r]+/)),

    forbidden_empty_record_type_line: (_) =>
      token(prec(20, /type [A-Za-z_][A-Za-z0-9_]* = \{\}/)),

    forbidden_mut_let_line: (_) =>
      token(prec(30, /mut[ \t]+let(?:[ \t]+[^\n\r]+)?/)),

    forbidden_increment_line: (_) =>
      token(
        prec(
          30,
          /[_\p{L}][_\p{L}\p{N}.]*[ \t]*(?:\+\+|--)(?:[ \t]*;)?/u,
        ),
      ),

    forbidden_keyword_line: (_) =>
      token(
        prec(
          30,
          /(?:async|await|try|use)[ \t]+[^\n\r]+|assert[ \t]+[^\n\r(][^\n\r]*/,
        ),
      ),

    forbidden_template_line: (_) =>
      token(
        prec(
          30,
          /(?:[_\p{L}][_\p{L}\p{N}]*[ \t]*)?`[^\n\r]*`|[_\p{L}][_\p{L}\p{N}]*[ \t]*"[^"\n\r]*\$\{[^"\n\r]*"/u,
        ),
      ),

    forbidden_invalid_assignment_line: (_) =>
      token(
        prec(
          30,
          /[_\p{L}][_\p{L}\p{N}]*\([^)\n\r]*\)[ \t]*=[^=>\n\r][^\n\r]*/u,
        ),
      ),

    forbidden_refutable_let_line: (_) =>
      token(
        prec(
          30,
          /let[ \t]+[A-Z][_\p{L}\p{N}]*\([^)\n\r]*\)(?:[ \t]*\|[ \t]*[A-Z][_\p{L}\p{N}]*\([^)\n\r]*\))*[ \t]*=[^\n\r]+/u,
        ),
      ),

    forbidden_explicit_record_spread_line: (_) =>
      token(
        prec(
          30,
          /[_\p{L}][_\p{L}\p{N}]*<[^>\n\r]+>[ \t]*\{[ \t]*\.\.\.[^\n\r]+\}/u,
        ),
      ),

    forbidden_qualified_record_spread_line: (_) =>
      token(
        prec(
          30,
          /[_\p{L}][_\p{L}\p{N}]*\.[_\p{L}][_\p{L}\p{N}]*[ \t]*\{[ \t]*\.\.\.[^\n\r]+\}/u,
        ),
      ),

    forbidden_unknown_token: (_) => token(prec(30, /[@#$\\]/)),

    // SPEC §22 explicitly labels these lines as declaration-style notation,
    // not Topaz grammar. They remain named in the tree so the historical
    // `.tpz` fixtures can be scanned without pretending the notation is code.
    non_source_signature_declaration: (_) =>
      token(
        prec(
          10,
          /(?:Some|Ok|Err|print|toInt|s\.|Array\.of|arr\.|Map\.new|m\.|Set\.of|map|filter|reduce|open|file\.|assert)[^\n\r]*->[^\n\r]*/,
        ),
      ),

    non_source_signature_value: (_) =>
      token(prec(10, /(?:None|arr\.length|m\.keys):[^\n\r]+/)),

    type_declaration: ($) =>
      seq(
        "type",
        field("name", $.type_identifier),
        optional($.type_parameters),
        "=",
        field("value", $._type),
        optional(";"),
      ),

    enum_declaration: ($) =>
      seq(
        "enum",
        field("name", $.type_identifier),
        optional($.type_parameters),
        optional($.derives_clause),
        field("body", $.enum_body),
      ),

    enum_body: ($) =>
      seq("{", optional(commaSep1($.enum_variant)), optional(","), "}"),

    enum_variant: ($) =>
      seq(
        field("name", $.type_identifier),
        optional(seq("(", optional(commaSep1($._type)), optional(","), ")")),
      ),

    record_declaration: ($) =>
      seq(
        alias($._record_declaration_start, "record"),
        field("name", $.type_identifier),
        optional($.type_parameters),
        optional($.derives_clause),
        field("body", $.record_body),
      ),

    record_body: ($) =>
      seq("{", optional(commaSep1($.record_field)), optional(","), "}"),

    record_field: ($) =>
      seq(
        field("name", $.field_identifier),
        ":",
        field("type", $._type),
        optional(seq("=", field("default", $._expression))),
      ),

    newtype_declaration: ($) =>
      seq(
        "newtype",
        field("name", $.type_identifier),
        optional($.type_parameters),
        "=",
        field("base", $._type),
        optional(";"),
      ),

    derives_clause: ($) =>
      seq(
        "derives",
        commaSep1(choice("Eq", "Order", "Show", "JSON", $.identifier)),
      ),

    receiver_impl_declaration: ($) =>
      seq(
        "impl",
        field("type", $.type_identifier),
        "{",
        repeat(
          choice(
            $.function_declaration,
            $.export_declaration,
            $.receiver_impl_declaration,
          ),
        ),
        "}",
      ),

    protocol_declaration: ($) =>
      seq(
        "protocol",
        field("name", $.type_identifier),
        optional($.type_parameters),
        "{",
        repeat($.protocol_method_signature),
        "}",
      ),

    protocol_method_signature: ($) =>
      seq(
        "function",
        field("name", $._identifier),
        optional($.function_type_parameters),
        $.parameter_list,
        optional($.return_type),
        optional(";"),
      ),

    protocol_impl_declaration: ($) =>
      seq(
        "impl",
        field("protocol", $.type_identifier),
        "<",
        field("type", $.type_identifier),
        ">",
        "{",
        repeat(
          choice(
            $.function_declaration,
            $.export_declaration,
          ),
        ),
        "}",
      ),

    function_declaration: ($) =>
      seq(
        "function",
        field("name", $._identifier),
        optional($.function_type_parameters),
        $.parameter_list,
        optional($.return_type),
        field("body", $.block),
      ),

    function_type_parameters: ($) =>
      seq("<", commaSep1($.function_type_parameter), ">"),

    function_type_parameter: ($) =>
      seq(
        field("name", $.type_identifier),
        optional(
          seq(
            ":",
            field(
              "bounds",
              seq(
                $.type_identifier,
                repeat(seq("+", $.type_identifier)),
              ),
            ),
          ),
        ),
      ),

    parameter_list: ($) =>
      seq("(", optional(commaSep1($.parameter)), optional(","), ")"),

    parameter: ($) =>
      choice(
        seq(
          "...",
          field("name", $.parameter_name),
          ":",
          field("type", $._type),
        ),
        seq(
          field("name", $.parameter_name),
          optional(seq(":", field("type", $._type))),
          optional(seq("=", field("default", $._expression))),
        ),
      ),

    parameter_name: ($) => $._identifier,

    return_type: ($) => seq("->", field("type", $._type)),

    type_parameters: ($) =>
      seq("<", commaSep1(field("parameter", $.type_identifier)), ">"),

    type_arguments: ($) =>
      seq("<", commaSep1(field("argument", $._type)), ">"),

    _type: ($) => $.union_type,

    union_type: ($) =>
      prec.left(seq($._primary_type, repeat(seq("|", $._primary_type)))),

    _primary_type: ($) =>
      choice(
        $.named_type,
        $.literal_type,
        $.record_type,
        $.function_type,
        $.unit_type,
        seq("(", $._type, ")"),
      ),

    named_type: ($) =>
      seq(
        field("name", choice($.type_identifier, $.primitive_type)),
        optional(seq(".", field("member", $.type_identifier))),
        optional($.type_arguments),
      ),

    primitive_type: (_) => choice("int", "float", "string", "bool"),

    literal_type: ($) =>
      choice(
        $.integer_literal,
        $.float_literal,
        $.string,
        $.boolean_literal,
        $.null_literal,
      ),

    record_type: ($) =>
      seq("{", commaSep1($.field_type), optional(","), "}"),

    field_type: ($) =>
      seq(field("name", $.field_identifier), ":", field("type", $._type)),

    function_type: ($) =>
      seq(
        "(",
        optional(
          commaSep1(
            choice($._type, seq("...", field("variadic_type", $._type))),
          ),
        ),
        optional(","),
        ")",
        "->",
        field("result", $._type),
      ),

    unit_type: (_) => seq("(", ")"),

    _statement: ($) =>
      choice(
        $._declaration,
        $.let_declaration,
        $.refutable_let_declaration,
        $.const_declaration,
        $.using_statement,
        $.return_statement,
        $.defer_statement,
        $.while_statement,
        $.break_statement,
        $.continue_statement,
        $.assignment_statement,
        $.expression_statement,
      ),

    let_declaration: ($) =>
      seq(
        "let",
        optional("mut"),
        field("pattern", $._pattern),
        optional(seq(":", field("type", $._type))),
        "=",
        field("value", $._expression),
        optional(";"),
      ),

    refutable_let_declaration: ($) =>
      prec.dynamic(
        5,
        seq(
          "let",
          optional("mut"),
          field("pattern", choice($.constructor_pattern, $.or_pattern)),
          optional(seq(":", field("type", $._type))),
          "=",
          field("value", $._expression),
          optional(";"),
        ),
      ),

    const_declaration: ($) =>
      seq(
        "const",
        field("name", $._identifier),
        optional(seq(":", field("type", $._type))),
        "=",
        field("value", $._expression),
        optional(";"),
      ),

    using_statement: ($) =>
      prec.dynamic(
        2,
        seq(
          "using",
          field("name", $._identifier),
          "=",
          field("value", $._expression),
          field("body", $.block),
        ),
      ),

    return_statement: ($) =>
      prec.right(seq("return", optional($._expression), optional(";"))),

    defer_statement: ($) =>
      seq("defer", $._expression, optional(";")),

    while_statement: ($) =>
      prec.dynamic(
        2,
        seq(
          "while",
          choice(
            $._expression,
            alias($._binding_condition, $.binding_condition),
          ),
          field("body", $.block),
        ),
      ),

    break_statement: ($) =>
      prec.right(
        seq(
          "break",
          optional(field("label", $.loop_label)),
          optional(field("value", $._expression)),
          optional(";"),
        ),
      ),

    continue_statement: ($) =>
      seq(
        "continue",
        optional(field("label", $.loop_label)),
        optional(";"),
      ),

    loop_label: ($) => seq("'", field("name", $._identifier)),

    assignment_statement: ($) =>
      prec.right(
        PREC.assignment,
        seq(
          field("left", $._assignable),
          field(
            "operator",
            choice("=", "+=", "-=", "*=", "/=", "%=", "??="),
          ),
          field("right", $._expression),
          optional(";"),
        ),
      ),

    _assignable: ($) =>
      choice(
        $.identifier,
        $.contextual_identifier,
        $.legacy_keyword_identifier,
        $.member_expression,
        $.index_expression,
      ),

    expression_statement: ($) => seq($._expression, optional(";")),

    _expression: ($) =>
      choice(
        $.literal,
        $.identifier,
        $.contextual_identifier,
        $.legacy_keyword_identifier,
        $.pipeline_placeholder,
        $.pipe_expression,
        $.block,
        $.if_expression,
        $.match_expression,
        $.for_expression,
        $.loop_expression,
        $.concurrent_expression,
        $.lambda_expression,
        $.record_literal,
        $.array_literal,
        $.set_literal,
        $.map_literal,
        $.array_comprehension,
        $.set_comprehension,
        $.map_comprehension,
        $.tagged_template,
        $.unary_expression,
        $.binary_expression,
        $.call_expression,
        $.generic_call_expression,
        $.member_expression,
        $.index_expression,
        $.record_construction,
        $.record_update,
        $.postfix_try_expression,
        $.parenthesized_expression,
      ),

    literal: ($) =>
      choice(
        $.integer_literal,
        $.float_literal,
        $.length_literal,
        $.string,
        $.boolean_literal,
        $.null_literal,
        $.unit_literal,
      ),

    block: ($) =>
      seq(
        "{",
        repeat($._statement),
        optional($._expression),
        "}",
      ),

    if_expression: ($) =>
      prec.dynamic(
        2,
        prec.right(
        seq(
          "if",
          choice(
            field("condition", $._expression),
            alias($._binding_condition, $.binding_condition),
          ),
          field("consequence", $.block),
          optional(
            seq(
              "else",
              field("alternative", choice($.if_expression, $.block)),
            ),
          ),
        ),
        ),
      ),

    match_expression: ($) =>
      prec.dynamic(
        4,
        seq(
          "match",
          field("value", $._expression),
          "{",
          repeat1($.case_clause),
          "}",
        ),
      ),

    case_clause: ($) =>
      prec.dynamic(
        4,
        seq(
          "case",
          field("pattern", alias($._case_pattern, $.case_pattern)),
          "=>",
          field("body", choice($.return_statement, $._expression)),
          optional(";"),
        ),
      ),

    for_expression: ($) =>
      prec.dynamic(
        2,
        seq(
          "for",
          field("pattern", $._pattern),
          "in",
          field("iterable", $._expression),
          field("body", $.block),
        ),
      ),

    loop_expression: ($) =>
      seq("loop", optional($.loop_label), field("body", $.block)),

    concurrent_expression: ($) =>
      choice(
        seq("concurrent", field("body", $.concurrent_body)),
        seq(
          "concurrent",
          "(",
          "timeout",
          ":",
          field("timeout", $.duration_literal),
          ")",
          field("body", $.concurrent_body),
          optional(seq("else", field("fallback", $.block))),
        ),
      ),

    concurrent_body: ($) => seq("{", repeat1($.concurrent_arm), "}"),

    concurrent_arm: ($) =>
      seq(
        field("name", $._identifier),
        ":",
        field("value", $._expression),
        optional(choice(",", ";")),
      ),

    lambda_expression: ($) =>
      prec.right(
        PREC.lambda,
        seq(
          field(
            "parameters",
            choice(
              $.identifier,
              $.contextual_identifier,
              $.legacy_keyword_identifier,
              seq(
                "(",
                optional(commaSep1($.lambda_parameter)),
                optional(","),
                ")",
              ),
            ),
          ),
          "=>",
          field("body", $._expression),
        ),
      ),

    lambda_parameter: ($) =>
      seq(
        field("name", $._identifier),
        optional(seq(":", field("type", $._type))),
      ),

    call_expression: ($) =>
      prec.left(
        PREC.postfix,
        seq(
          field("function", $._expression),
          field("arguments", $.call_argument_list),
        ),
      ),

    generic_call_expression: ($) =>
      prec.left(
        PREC.postfix,
        seq(
          field("function", $._expression),
          field(
            "type_arguments",
            alias($._call_type_arguments, $.call_type_arguments),
          ),
          field("arguments", $.call_argument_list),
        ),
      ),

    call_argument_list: ($) =>
      seq(
        token.immediate("("),
        optional(
          seq(
            $.argument,
            repeat(seq(choice(",", ";"), $.argument)),
            optional(choice(",", ";")),
          ),
        ),
        ")",
      ),

    argument: ($) =>
      choice(
        field("value", $.record_construction),
        $.forbidden_keyword_argument,
        seq("...", field("value", $._expression)),
        seq(field("name", $._identifier), ":", field("value", $._expression)),
        field("value", $._expression),
      ),

    forbidden_keyword_argument: ($) =>
      seq(field("name", choice(...KEYWORDS)), ":", field("value", $._expression)),

    member_expression: ($) =>
      prec.left(
        PREC.postfix,
        seq(
          field("object", $._expression),
          field("operator", choice(".", "?.")),
          field("property", $.field_identifier),
        ),
      ),

    pipeline_placeholder: (_) => "_",

    _identifier: ($) =>
      choice($.identifier, $.contextual_identifier, $.legacy_keyword_identifier),

    contextual_identifier: ($) =>
      prec(-1, alias(choice("map", "set"), $.identifier)),

    legacy_keyword_identifier: ($) =>
      prec(
        -2,
        alias(
          choice(
            "import", "export", "use", "loop", "record", "self",
            "enum", "impl", "newtype", "protocol", "using",
            "derives", "Eq", "Order", "Show", "JSON", "as", "timeout",
            "int", "float", "string", "bool",
          ),
          $.identifier,
        ),
      ),

    index_expression: ($) =>
      prec.left(
        PREC.postfix,
        seq(
          field("object", $._expression),
          token.immediate("["),
          field("index", $._expression),
          "]",
        ),
      ),

    postfix_try_expression: ($) =>
      prec.left(
        PREC.postfix,
        seq(field("value", $._expression), token.immediate("?")),
      ),

    record_construction: ($) => $._nominal_record_construction,

    record_update: ($) =>
      prec.left(
        PREC.postfix,
        seq(
          field(
            "value",
            choice(
              $.identifier,
              $.contextual_identifier,
              $.legacy_keyword_identifier,
              $.member_expression,
              $.index_expression,
              $.call_expression,
              $.record_update,
              $.parenthesized_expression,
            ),
          ),
          $._record_lbrace,
          commaSep1($.field_initializer),
          optional(","),
          "}",
        ),
      ),

    record_literal: ($) =>
      prec(
        20,
        seq("{", commaSep1($.field_initializer), optional(","), "}"),
      ),

    field_initializer: ($) =>
      seq(field("name", $.field_identifier), ":", field("value", $._expression)),

    array_literal: ($) =>
      seq("[", optional(commaSep1($.array_element)), optional(","), "]"),

    array_element: ($) =>
      choice(
        alias(
          seq($.identifier, field("body", $.record_literal)),
          $.record_construction,
        ),
        $._expression,
        seq("...", $._expression),
      ),

    set_literal: ($) =>
      prec(
        2,
        seq("set", "{", optional(commaSep1($._expression)), optional(","), "}"),
      ),

    map_literal: ($) =>
      prec(
        2,
        seq("map", "{", optional(commaSep1($.map_entry)), optional(","), "}"),
      ),

    map_entry: ($) =>
      seq(field("key", $._expression), ":", field("value", $._expression)),

    array_comprehension: ($) =>
      prec(
        3,
        seq(
          "[",
          alias($._comprehension_clauses, $.comprehension_clauses),
          "=>",
          $._expression,
          "]",
        ),
      ),

    set_comprehension: ($) =>
      prec(
        3,
        seq(
          "set",
          "{",
          alias($._comprehension_clauses, $.comprehension_clauses),
          "=>",
          $._expression,
          "}",
        ),
      ),

    map_comprehension: ($) =>
      prec(
        3,
        seq(
          "map",
          "{",
          alias($._comprehension_clauses, $.comprehension_clauses),
          "=>",
          field("key", $._expression),
          optional(seq(":", field("value", $._expression))),
          "}",
        ),
      ),

    unary_expression: ($) =>
      prec.right(
        PREC.unary,
        seq(
          field("operator", choice("+", "-", "!", $.forbidden_reserved_operator)),
          field("argument", $._expression),
        ),
      ),

    forbidden_reserved_operator: (_) => "~",

    binary_expression: ($) =>
      choice(
        ...[
          [">>", PREC.compose, "right"],
          ["??", PREC.coalesce, "left"],
          ["||", PREC.logicalOr, "left"],
          ["&&", PREC.logicalAnd, "left"],
          ["<", PREC.compare, "left"],
          ["<=", PREC.compare, "left"],
          [">", PREC.compare, "left"],
          [">=", PREC.compare, "left"],
          ["==", PREC.compare, "left"],
          ["!=", PREC.compare, "left"],
          ["in", PREC.compare, "left"],
          ["..", PREC.range, "left"],
          ["..<", PREC.range, "left"],
          ["+", PREC.additive, "left"],
          ["-", PREC.additive, "left"],
          ["*", PREC.multiplicative, "left"],
          ["/", PREC.multiplicative, "left"],
          ["%", PREC.multiplicative, "left"],
          ["**", PREC.power, "right"],
        ].map(([operator, precedence, associativity]) =>
          (associativity === "right" ? prec.right : prec.left)(
            precedence,
            seq(
              field("left", $._expression),
              field("operator", operator),
              field("right", $._expression),
            ),
          ),
        ),
        prec.left(
          PREC.range,
          seq(
            field("left", $._expression),
            field("operator", choice("..", "..<")),
            field("right", $._expression),
            "by",
            field("step", $._expression),
          ),
        ),
      ),

    pipe_expression: ($) =>
      prec.left(
        PREC.pipe,
        seq(
          field("left", $._expression),
          "|>",
          field(
            "right",
            choice(
              $._expression,
              seq(".", field("property", $.field_identifier)),
            ),
          ),
        ),
      ),

    parenthesized_expression: ($) => seq("(", $._expression, ")"),

    _const_expression: ($) =>
      choice(
        $.literal,
        $.identifier,
        $.array_literal,
        $.record_literal,
        $.unary_expression,
        $.binary_expression,
        $.parenthesized_expression,
      ),

    _pattern: ($) => choice($.or_pattern, $._primary_pattern),

    or_pattern: ($) =>
      prec.left(seq($._primary_pattern, repeat1(seq("|", $._primary_pattern)))),

    _primary_pattern: ($) =>
      choice(
        $.wildcard_pattern,
        $.literal_pattern,
        $.range_pattern,
        $.type_pattern,
        $.constructor_pattern,
        $.list_pattern,
        $.record_pattern,
        $.nominal_record_pattern,
        $.binding_pattern,
      ),

    wildcard_pattern: (_) => prec(1, "_"),
    literal_pattern: ($) => $.literal,
    binding_pattern: ($) =>
      choice(
        $.identifier,
        $.contextual_identifier,
        $.legacy_keyword_identifier,
      ),
    type_pattern: ($) =>
      seq(field("name", $._identifier), ":", field("type", $._type)),
    constructor_pattern: ($) =>
      seq(
        field("name", $._identifier),
        // Share the adjacent call token while also allowing spaced constructors.
        choice("(", token.immediate("(")),
        optional(commaSep1($._pattern)),
        optional(","),
        ")",
      ),
    range_pattern: ($) =>
      seq($._const_expression, field("operator", choice("..", "..<")), $._const_expression),
    // One optional rest marker, with ordinary patterns on either side.
    list_pattern: ($) =>
      seq(
        "[",
        optional(
          seq(
            choice(
              seq($.list_rest_pattern, repeat(seq(",", $._pattern))),
              seq(
                commaSep1($._pattern),
                optional(seq(
                  ",",
                  $.list_rest_pattern,
                  repeat(seq(",", $._pattern)),
                )),
              ),
            ),
            optional(","),
          ),
        ),
        "]",
      ),
    list_rest_pattern: ($) => seq("..", optional($._pattern)),
    record_pattern: ($) =>
      seq("{", commaSep1($.record_pattern_field), optional(","), "}"),
    nominal_record_pattern: ($) =>
      seq(
        field("name", $.type_identifier),
        "{",
        commaSep1($.record_pattern_field),
        optional(","),
        "}",
      ),
    record_pattern_field: ($) =>
      choice(
        seq(field("name", $.field_identifier), ":", field("pattern", $._pattern)),
        field("name", $._identifier),
      ),

    tagged_template: ($) => $._tagged_template,

    string: ($) => $._string,

    boolean_literal: (_) => choice("true", "false"),
    null_literal: (_) => "null",
    unit_literal: (_) => seq("(", ")"),

    identifier: (_) =>
      token(
        prec(
          -1,
          /[_\p{L}\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}][_\p{L}\p{N}\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]*/u,
        ),
      ),
    type_identifier: ($) => alias($._identifier, $.type_identifier),
    field_identifier: ($) =>
      choice(
        alias($.identifier, $.field_identifier),
        alias($.contextual_identifier, $.field_identifier),
        alias($.legacy_keyword_identifier, $.field_identifier),
        ...KEYWORDS,
      ),

    line_comment: (_) => token(seq("//", /[^\n\r]*/)),
    block_comment: (_) =>
      token(seq("/*", /[^*]*\*+([^/*][^*]*\*+)*/, "/")),
    forbidden_unterminated_block_comment: (_) =>
      token(prec(-1, seq("/*", /[^*]*(?:\*+[^/*][^*]*)*/))),
  },
});

function commaSep1(rule) {
  return seq(rule, repeat(seq(",", rule)));
}
