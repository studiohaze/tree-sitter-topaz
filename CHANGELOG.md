# Changelog

## 5.21.0 (2026-10-26)

- Reject line-comment newlines in single-line interpolations and malformed radix Length boundaries.
- Distinguish embedded NUL from EOF in external tokens and preserve lone CR in strings.

- Align the package with Topaz 5.21.
- Recognize numeric separators, hexadecimal and binary integers, and decimal Length literals.
- Preserve nested string and interpolation-comment boundaries, including lone CR.
- Check the final language candidate with frozen documentation and source inputs.

## 5.20.1 (2026-10-16)

- Remove the `links` block from `tree-sitter.json`. The tree-sitter CLI requires `repository` inside `links`, so it could not read the 5.20.0 metadata and skipped the grammar for file-type detection. The homepage stays in `package.json`.

## 5.20.0 (2026-10-16)

- Parse contextual record declarations as declarations with visible names and fields.
- Highlight contextual map/set literals and the !, | and ... operators.
- Add record-boundary and regex-template regressions; remove unreachable method rules.
- Align major.minor with the language; patch versions track grammar changes.
- Add a public documentation homepage and package description.
- Replace checkout-specific acceptance tooling with explicit frozen manifests.
- Audit the dry-run package file list; keep NOTICE limited to the product name.
- Surface a missing packaged node-type table as a binding load error.

## 0.1.1 (published 2026-09-07)

- Published to npm as tree-sitter-topaz@0.1.1; registry tarball verified
  byte-identical and clean-installed on Node 20.

- Accept list rest patterns at any element boundary, including nested rest
  subpatterns, while retaining at most one rest marker.
- Fix constructor and typed subpatterns in let/for destructuring.
- Allow map/set, contextual names, and all 21 keywords consistently as
  structural record field names.
- Accept nested member-based record updates and preserve empty map/set
  literals and control-flow bodies.
- Restore contextual declaration and library words as expression, parameter,
  binding, and field identifiers; preserve parameter highlighting.
- Handle keyword-named nested record patterns with multiline or-patterns.
- Mark reserved ~ and keyword-named call arguments as forbidden syntax.
- Expand tests from 33 to 97; improve real-source coverage from 4,416/4,447
  to 4,447/4,447 without ERROR or MISSING. Preserve all 31 baseline rejection
  flags and add two.
- Include 247 inline Rust build-script sources in the 4,896-input acceptance
  scan. Correct the former authority and coverage claims.

Known secondary gap: keyword-named nominal declaration fields remain
over-accepted through the existing opaque construction scanner. This release
does not claim complete rejection parity with the compiler.
