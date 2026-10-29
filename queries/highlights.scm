[
  "let"
  "mut"
  "const"
  "type"
  "function"
  "enum"
  "record"
  "newtype"
  "impl"
  "protocol"
  "derives"
] @keyword

[
  "if"
  "else"
  "match"
  "case"
  "for"
  "in"
  "by"
  "while"
  "loop"
  "break"
  "continue"
  "return"
  "defer"
  "using"
  "concurrent"
] @keyword.control

["import" "export" "as"] @keyword.import
["true" "false" "null"] @constant.builtin
["int" "float" "string" "bool"] @type.builtin
["Eq" "Order" "Show" "JSON"] @type.builtin

(integer_literal) @number
(float_literal) @number.float
(duration_literal) @number
(length_literal) @number
(string) @string
(tagged_template) @string.special
(line_comment) @comment
(block_comment) @comment

(function_declaration name: (identifier) @function)
(protocol_method_signature name: (identifier) @function.method)
(call_expression function: (identifier) @function.call)
(member_expression property: (field_identifier) @property)

(type_identifier) @type
(parameter
  name: (parameter_name (identifier) @variable.parameter))
(lambda_parameter name: (identifier) @variable.parameter)
(parameter
  name: (parameter_name
    [(contextual_identifier) (legacy_keyword_identifier)] @variable.parameter))
(lambda_parameter
  name: [(contextual_identifier) (legacy_keyword_identifier)] @variable.parameter)
(field_identifier) @property
(identifier) @variable

[
  "+"
  "-"
  "*"
  "/"
  "%"
  "!"
  "|"
  "..."
  "**"
  "=="
  "!="
  "<"
  "<="
  ">"
  ">="
  "&&"
  "||"
  "??"
  "??="
  "|>"
  ">>"
  ".."
  "..<"
  "?"
  "="
  "+="
  "-="
  "*="
  "/="
  "%="
  "=>"
  "->"
] @operator

; Ordinary bindings named map or set remain identifier nodes.
["set" "map"] @keyword

(member_expression operator: (_) @operator)
