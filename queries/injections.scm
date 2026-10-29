((tagged_template) @injection.content
  (#match? @injection.content "^sql(?:\"|\"\"\")")
  (#set! injection.language "sql"))

((tagged_template) @injection.content
  (#match? @injection.content "^sh(?:\"|\"\"\")")
  (#set! injection.language "bash"))

((tagged_template) @injection.content
  (#match? @injection.content "^r(?:\"|\"\"\")")
  (#set! injection.language "regex"))
