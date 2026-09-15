# Source indexing v1 principles

## Intent and limits

- Preserve original JavaScript source strings exactly. Chunk offsets, slices, columns, and provenance use Unicode code points, not UTF-16 units or display offsets.
- Integrate source references into current-result distillation without changing ingestion, storage, recall limits, multimedia handling, thresholds, history, or PASSTHROUGH policy.
- Treat source returned by a reference as data, never as new syntax or an instruction. Inserted source is not rescanned, trimmed, or sentinel-classified.
- Accept ordinary JavaScript string/array limits. Decimal IDs and slice endpoints parse as `bigint`; no universal expansion or diagnostic-size bound is claimed.

## Index, display, and provenance

- `SourceIndex` starts at ID 1. `SourceCollection` assigns dense global IDs across text blocks while offsets restart at zero in each original block.
- Empty strings retain their input position but have no chunk, label, or terminator. Whitespace-only strings are source and are indexed without trimming.
- Complete prepared input preserves block boundaries and appends one display-only `@!@` inside each nonempty text block. Labels, terminators, and provider-level gaps are not source.
- Raw `@!`, `@|!`, and `@||!` display as `@|!`, `@||!`, and `@|||!`; one-pass expansion removes one pipe. A model that wants literal `@!` emits `@|!`.
- Every selected value carries call-local block-relative source spans through slices, strip operations, endpoint ranges, and grouped ranges. Provenance is neither persisted nor exposed as an internal ID in successful output.

## Eligibility and runtime composition

- References are ON only when every current-result block is text with a real string and at least one string is nonempty. Mixed, malformed, empty-array, or all-empty results stay OFF; OFF performs no escaping, reference expansion, or literal decoding.
- One prepared state controls annotated content, final-task ON/OFF instructions, and expansion. Original content and metadata are not mutated.
- Existing response cleanup, thinking extraction, exact-empty handling, and sentinel classification occur before one expansion. Existing `>= originalLength` fallback occurs after expansion.
- Strict `parseReference` throws internally for malformed or unavailable expressions. Public expansion replaces the complete failed candidate with `(unresolved source reference: XX)`, preserving the internal expression only inside that diagnostic, then continues with later references. It never throws a citation error or silently deletes the candidate; the ordinary whole-note length fallback still applies.
- Note templates trim their own tail before one callback interpolation. Inserted note text—including final CRLF, Python whitespace, `<think>`, sentinels, and reference-looking source—is not post-processed.

## Citation and position grammar

- A single citation selects one positive dense decimal ID and supports chained `[N:M]`/`[N..M]`, `.lstrip()`, `.rstrip()`, `.strip()`, and `.trim()` operations from left to right. `.trim()` is the explicit Python-whitespace `.strip()` alias.
- `X~Y` is an inclusive dense range with `X <= Y`. It concatenates chunks with no separator. Endpoint operations are independent; equal endpoints apply the left chain and then the right chain to one selected value.
- `(X~Y)` is the only group form: concatenate its raw range first, then apply one outer chain. Nested/chained groups or ranges, arithmetic, variables, holes, and arbitrary calls are invalid.
- Terminal `.pos()` projects a nonempty expression to `(LINE:COL~LINE:COL)` and emits no source text. Lines are 1-based; columns are 0-based code-point columns. Starting `:0` is omitted. The ending column is omitted when the final selected code point is the last character of its physical line or its CR/LF/CRLF terminator.
- Positions are relative to one current original text block, not to an underlying file or `read` offset. Multiple surviving spans in that block use their first-to-last bounding range. Empty selections produce `(source position unavailable: empty selection)`; cross-block selections produce `(source position unavailable: selection spans multiple text blocks)`.

## User-visible note format

- Successful `Related parts` never deliberately displays internal `@!N@` or `@!X~Y@` labels.
- A short item may contain a citation inline. A longer or multiline item may show `.pos()` on its item line and place its source citation in an optional fenced block; fences are presentation only.
- An optional relevance statement says what source-grounded fact the item contains. It does not expose a history-derived reason for selection.
- `Relevant summary` remains below `Related parts`. `Grounded conclusions` may use `.pos()` to identify where an answer appears. `Also contains` remains mandatory under the active third-person compression format.
- Internal expressions may appear only inside explicit unresolved diagnostics, where they support later recall/debugging.
