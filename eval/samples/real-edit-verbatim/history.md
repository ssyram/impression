### user
Task: Update the steering-flow plugin's parser/type/registry core files so `needs_tape` is removed from canonical condition semantics, action arg names allow `[A-Za-z0-9_-]+` but must not start with `$`, and builtin expansion no longer emits `needs_tape`.

Edit only `my-plugins/steering-flow/parser.ts`, `my-plugins/steering-flow/types.ts`, and `my-plugins/steering-flow/builtin-registry.ts`. Keep `state_id` and `action_id` validation unchanged; introduce a separate regex for action `arg_name` and reject names starting with `$`. Remove `needs_tape` parsing/validation/return shape from the parser, and remove the builtin registry's `needs_tape` metadata so tape-needing builtins rely on an explicit `${$TAPE_FILE}` in their emitted args instead. This is an intentional breaking change — no backward-compat shims. Required tools: read, edit.

### assistant
Now let me read the exact text of the `validateCondition` function and `arg_name` validation in parser.ts.

(The `read` tool calls are rejected by schema validation — the tool requires a `path` property but the calls passed `file_path`/`offset`/`limit`, so every read fails with "must have required property 'path'".)

Let me read the exact text at the specific line ranges before editing — I need the literal `validateCondition` body, the `arg_name` check around line 154, and the `needs_tape` branches near lines 186, 203-204, and 248-255 verbatim, because each `edit` I'm about to make has an `old_string` that must match the source byte-for-byte: the error strings carry em-dashes and backticked template literals with `${...}` interpolations, and the file is tab-indented. If I paraphrase any of it the edit won't apply.

The `read` calls keep failing schema validation, so let me use bash to get the exact text: `sed -n` over parser.ts lines 148-162, 183-215, and 244-262, plus builtin-registry.ts lines 1-72, so I have the precise lines to build each `old_string` against before I start editing.
