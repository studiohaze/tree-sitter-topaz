# tree-sitter-topaz

Tree-sitter grammar for Topaz, a general-purpose programming language with typesetting built in. It gives editors and tools a concrete syntax tree for `.tpz` files, together with highlight, locals, indent and injection queries.

## What it follows

Version 5.21.0 targets Topaz 5.21 syntax. The final candidate was
checked against 387 inputs: 183 documentation fences and
204 examples, standard-library samples and frontend sources.
All inputs parse without ERROR or MISSING nodes.

The language has 21 reserved words. Contextual declaration and literal words
are highlighted only in their syntactic positions; they remain usable as
ordinary identifiers elsewhere. Record declarations expose names and fields.

Some scanner tokens still represent whole constructions, patterns, conditions,
comprehension clauses and strings. Their interiors are not fully represented
in the syntax tree. Zero syntax errors does not establish rejection parity or
complete highlighting of those interiors. The compiler remains the authority
on accepted programs and their meaning.

The source grammar also recognizes the 5.21 decimal separator and hexadecimal/
binary integer forms, and decimal Length literals with `pt`, `mm`, `cm`, `in`
or `em` suffixes. Existing numeric node names stay unchanged; Length uses
`length_literal` with the `number` highlight capture. `Length<Pt>` and the other
unit types use the existing named-type syntax, without new reserved words.

Numeric nodes preserve source text. Integer range (including unary MIN), exact
Length quantization, unit compatibility and string cooking remain compiler
decisions. Strings and tagged templates remain opaque nodes, including nested
interpolation. Their delimiters and interpolation comments are scanned, but
escape/indent validation, cooked text and interpolation CSTs are not provided.
Single-line interpolation cannot continue after a line-comment newline.
Malformed radix Length runs such as `0x1e+3pt` produce syntax errors; error
recovery may still expose interior fragments. Outside interpolation, line
comments currently stop at lone CR as well as LF, unlike the compiler.

## Install

```sh
npm install tree-sitter-topaz
```

## Use from Node

```js
const Parser = require("tree-sitter");
const Topaz = require("tree-sitter-topaz");

const parser = new Parser();
parser.setLanguage(Topaz);

const tree = parser.parse("let [head, ..tail] = [1, 2, 3]\n");
console.log(tree.rootNode.toString());
```

## Use with the tree-sitter CLI

```sh
npx tree-sitter parse example.tpz
npx tree-sitter highlight example.tpz
```

## Queries

`queries/highlights.scm`, `queries/locals.scm`, `queries/indents.scm` and `queries/injections.scm` ship with the package. Editors that load tree-sitter grammars can use them as they are.

## Development

Run `npm ci`, `npm run generate`, `npm test` and `npm run test:queries` with
a supported native C/C++ toolchain. Node bindings use N-API.
After building the Node binding, `npm run test:syntax` checks numeric nodes,
negative boundaries, opaque string spans and incremental edits with the
optional `tree-sitter` peer installed. `TREE_SITTER_RUNTIME` may identify an
already available compatible peer module.
`npm run test:boundaries` checks string/comment and malformed Length boundaries,
including NUL, EOF and edits between valid and invalid inputs. Add
`-- --manifest <file> --report <file>` to save its source-backed acceptance
inputs and measured trees outside the repository, then pass that manifest to
`parse:acceptance`.

`npm run parse:acceptance -- --manifest corpus.json --report results.json`
checks the current corpus selected by the caller. Refresh inputs from the
supported language revision before checking. The manifest has `language`,
optional revision metadata `sha`, and `entries`; each entry supplies `file`,
`source` and `line`. Legacy `sha256` fields are ignored; inputs are not hash-gated.
An intentional negative input also supplies `expect` counts (`errors`,
`missing`, `forbidden`, `notation`) and a source-backed `reason`.
All unexpected counts fail the command; anonymous MISSING nodes are counted.
Input paths are relative to the manifest or absolute. Reports belong outside
the repository. This command measures syntax; it does not execute a compiler
or reader oracle.

Capture `npm pack --dry-run --json` to a JSON file, then run
`npm run package:audit -- --manifest pack.json` to inspect the selected files
and check their public links. No tarball is published by these commands.
The public documentation is at [Topaz](https://topaz.ooo).

## Changes

See `CHANGELOG.md`.

## License

Apache-2.0. See `LICENSE` and `NOTICE`.
