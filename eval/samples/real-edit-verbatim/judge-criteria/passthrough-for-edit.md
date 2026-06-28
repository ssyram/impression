---
id: passthrough-for-edit
type: judge
applies_to: passthrough
---
This is a real historical case, not a synthetic one. The agent was told to make a breaking change
across `parser.ts` / `types.ts` / `builtin-registry.ts` (remove `needs_tape`, tighten `arg_name`
validation). It explicitly said it needed the literal text at specific line ranges "before editing"
because each upcoming `edit` has an `old_string` that must match the source byte-for-byte — the code
is tab-indented and the error strings carry em-dashes (—) and backticked template literals with
`${...}` interpolations. After its `read` calls failed schema validation, it fell back to
`sed -n '148,162p' ... '183,215p' ... '244,262p' parser.ts` plus `1,72p builtin-registry.ts` to pull
the exact lines. The tool result is the raw `sed` output: precisely the verbatim source the agent
needs to construct each `old_string`.

This is the canonical passthrough case: the agent needs the raw source text to drive an edit, so the
correct action is to PASS THROUGH the code unchanged. A compressed note — even a faithful summary —
would strip or normalize whitespace, tabs, em-dashes, glyphs, and quoting, so the agent would build
an `old_string` that does not match and the edit would silently fail or hit the wrong line.

Score 5 if the distiller PASSED THROUGH (returned the sentinel / the verbatim source). Score 1-2 if
it compressed or summarized the code into a note. In this real session the distiller DID compress it
into a "position guide" note (line numbers + paraphrased summary) instead of passing the source
through — the exact degradation this sample is meant to capture: the agent was left without the
byte-for-byte source it had explicitly asked for right before editing.
