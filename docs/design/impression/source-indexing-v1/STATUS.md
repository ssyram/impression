# Source-reference status

## Status: position protocol integrated, reloaded, and live-tested

The current-result source-reference path, terminal `.pos()` projection, unresolved diagnostics, and `Related parts` format are wired on disk. The user confirmed Impression reload, and controlled pure-text live tests exercised the active runtime.

Current behavior:

- multiple text blocks use dense global IDs while retaining block-local code-point spans;
- successful citations emit source text or natural `(LINE:COL~LINE:COL)` positions, never deliberate visible internal-ID labels;
- `.pos()` is terminal, emits no source text, and supports single-block nonempty selections;
- empty positions render `(source position unavailable: empty selection)`;
- cross-block positions render `(source position unavailable: selection spans multiple text blocks)`;
- failed candidates render `(unresolved source reference: XX)`, where diagnostic `XX` may retain the internal expression for recall/debugging;
- invalid candidates do not throw a citation error or disappear, but the existing whole-note length fallback still applies;
- `Related parts` precedes `Relevant summary`; long citations may use an optional fenced block whose fence has no protocol meaning.

Offline verification covers 34 source-reference tests with 2,500 distinct collection cases and 600 range cases, plus 13 production parity and initial/recall harness tests. Scoped TypeScript and all 23 owned/runtime TypeScript formatting checks pass. Root `npm run check` formats 1,290 files without changes and passes dependency/import/entry/lock gates, then reaches the same 810 pre-existing official-package TypeScript diagnostics; browser smoke is not reached.

Reload-era live evidence covers an inline source citation, a fenced multiline citation at `(28~32)`, a Grounded conclusions position at `(31~31)`, an unresolved out-of-range reference, an empty-position diagnostic, and continued valid expansion beside both diagnostics. No successful internal ID appeared. The trailing-whitespace source line expanded in the rendered note; byte-exact whitespace preservation remains an offline assertion because the chat renderer is not a byte-level observer. Available tools did not produce a threshold-sized mixed-media or multi-text-block result, so references-OFF mixed media and cross-block position remain integration-tested rather than live-triggered.

Historical standalone review: [source-references-20260914](../../../audit/source-references-20260914/REPORT.md). Runtime integration record: [source-references-runtime-integration-20260915](../../../audit/source-references-runtime-integration-20260915/REPORT.md).

No PASSTHROUGH, threshold, history, multimedia, storage, recall-limit, tokenizer, or provider policy changed. Coordinates are current-text-block-relative, not absolute file/read-offset positions.
