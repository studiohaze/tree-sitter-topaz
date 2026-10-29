(source_file) @local.scope
(block) @local.scope
(function_declaration) @local.scope
(lambda_expression) @local.scope

(function_declaration name: (identifier) @local.definition)
(parameter
  name: (parameter_name (identifier) @local.definition))
(lambda_parameter name: (identifier) @local.definition)
(let_declaration pattern: (binding_pattern (identifier) @local.definition))
(const_declaration name: (identifier) @local.definition)

(identifier) @local.reference
