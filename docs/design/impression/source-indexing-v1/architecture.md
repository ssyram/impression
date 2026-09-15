# Source indexing v1 architecture

## Scope and contracts

This feature preserves raw JavaScript strings and is wired into current-result distillation. It does not change result ingestion, storage, recall limits, multimedia handling, thresholds, history selection, or configuration. It does update the active third-person compression format and append ON/OFF reference instructions. `SourceIndex` is a single-source component. `SourceCollection` is the opaque current-result index for eligible all-text block arrays; it owns dense result-local IDs across blocks and no caller-provided resolver.

`createChunks(source, firstId = 1)` returns ordered `{ id, start, end, text }` records. Its caller establishes an integer `firstId`; emitted IDs begin exactly at that value, while `start`/`end` remain zero-based, end-exclusive Unicode-code-point offsets local to `source`. `SourceIndex.from` calls it with 1. `SourceCollection.from` calls it once per original text block with `1 +` the earlier global chunk count. Empty source blocks retain their position but add no chunk or ID.

For prospective ID `N`, label length `h = |@!N@|` in code points gives `L = 20h` and `U = 40h`. Chunking recalculates this using the actual global ID before every emission decision, including global 9→10 and 99→100 transitions. Physical lines retain LF, CRLF, or CR terminators; adjacent Python-whitespace-only lines are one indivisible blank unit. Normal long lines split at the first punctuation/Python-whitespace boundary in `[L,U]`, else at `U` without splitting CRLF. Chunks partition their original block exactly.

`renderAnnotated(index)` is retained as an unterminated low-level single-index primitive. Complete model-input preparation always uses `renderAnnotatedBlocks(collection)`: it maps blocks without joining them, escapes raw `@|*!` prefixes, and appends one display-only `@!@` to each nonempty rendered block. This terminator is never an output reference or raw source. `reference-parser.ts` owns strict reference parsing and evaluation; `source-provenance.ts` carries call-local block-relative spans through expression operations; `expansion.ts` owns the tolerant outer one-pass scan.

## Chunk accumulation algorithm

Split a source block into physical lines while retaining each LF, CRLF, or CR terminator. Retain a final unterminated tail as its own line. A line is blank only when every code point is Python whitespace; merge adjacent blank physical lines into one indivisible blank unit. Process each block independently, with `firstId` set to one plus the count of every earlier block's chunks.

```text
pending = empty; offset = 0
for unit in block units:
  if unit is an indivisible blank run:
    bounds = boundsFor(firstId + emittedCount)
    if pending is nonempty and pending.length + unit.length > bounds.upper:
      emit pending
    append the whole blank run to pending
    bounds = boundsFor(firstId + emittedCount)
    if unit.length > bounds.upper or pending.length >= bounds.lower:
      emit pending
    continue

  remaining = unit
  while remaining is nonempty:
    bounds = boundsFor(firstId + emittedCount)
    if remaining.length > bounds.upper:
      if pending is nonempty:
        emit pending
        continue
      split at the first punctuation/Python-whitespace boundary in [lower, upper]
      (otherwise at upper, except never between CR and LF)
      emit that prefix; continue with the suffix
    if pending.length + remaining.length <= bounds.upper:
      append remaining
      if pending.length >= bounds.lower: emit pending
      break
    emit pending
emit pending
```

`emit` creates one chunk with the current global ID, local code-point interval `[offset, offset + pending.length)`, then advances `offset` and clears `pending`. Bounds are recalculated before every emission decision from that actual global ID. For the initial `L = 80, U = 160` bounds, a 70-code-point ordinary line followed by a 100-code-point ordinary line first emits the 70-code-point pending chunk rather than overfilling it; an oversized ordinary line splits using fresh bounds after every emitted prefix, including global 9→10 and 99→100 transitions. Blank runs are never split even if oversized. CRLF remains one physical terminator, and the final unterminated tail enters the same ordinary-line path.

## Output grammar

Expansion is one left-to-right pass. An escaped literal has one or more consecutive pipe characters directly between `@` and `!`; expansion removes exactly one pipe: `@|!` becomes `@!`, and `@||!` becomes `@|!`. Returned source is appended directly and is never recursively parsed, cleaned, trimmed, sentinel-classified, or decoded again.

```text
reference = "@!" expression position? "@"
expression = endpoint operations*
           | endpoint operations* "~" endpoint operations*
           | "(" id "~" id ")" operations*
endpoint   = id
id         = [1-9][0-9]*
operations = slice | method
position   = ".pos()"  ; terminal only
slice      = "[" signed? ( ":" | ".." ) signed? "]"
signed     = "-"? [0-9]+
method     = ".lstrip()" | ".rstrip()" | ".strip()" | ".trim()"
```

An unparenthesized range is inclusive and requires dense IDs `X <= Y`. It concatenates raw interior chunks with no added separator; endpoint operations apply independently. When endpoints are equal, left operations then right operations apply once to that one value. A parenthesized range has raw IDs only, concatenates the entire range first, then applies its one outer operation chain left-to-right. There is no nesting, chained range, arithmetic, variable, step, or arbitrary method. The strict parser throws `DraftExpansionError` for invalid, reversed, malformed, or unknown references. Public `expandDraft` catches that parser error, consumes the complete candidate through its first closing `@` (or draft end), emits `(unresolved source reference: XX)` with that internal candidate as `XX`, and continues. It never throws a citation error or substitutes an empty string; the later whole-note length fallback remains unchanged. `.trim()` is exactly the Python-whitespace `.strip()` alias. Both slice separators are zero-based, end-exclusive code-point slicing with omitted/negative/clamped endpoints.

## Source provenance and `.pos()`

Each raw chunk begins with one span `{ block, start, end }`, using block-local code-point offsets. Slicing intersects the selected output interval with its ordered spans; strip operations reduce that interval; range and grouped-range evaluation concatenate and merge adjacent spans. The selected text length equals the total surviving span lengths. Same-block gaps remain separate spans, allowing `.pos()` to report their bounding first-to-last range without claiming the omitted gap is selected.

Terminal `.pos()` calls `formatSourcePosition` instead of emitting selected text. Lines are 1-based and columns are 0-based code-point columns. Starting column zero and an ending column at the physical line end are omitted. CRLF is one line terminator: its `\r` and `\n` both belong to the preceding line for display, and the next code point begins the next line. Empty selections return `(source position unavailable: empty selection)`. Selections spanning more than one original text block return `(source position unavailable: selection spans multiple text blocks)`. Coordinates are relative to the returned text block; the index has no underlying file path or `read` offset.

## Runtime composition

`prepareSourceReferences` makes the only eligibility decision: nonempty array, every block `type === "text"` with a string `text`, and at least one nonempty original string. Active preparation preserves other block metadata but types rewritten `text` as `string`, not an original literal refinement. Inactive preparation copies ordinary blocks. The same active state selects ON/OFF instructions, annotation, and expansion.

`runSourceReferencePipeline` assumes existing cleanup and sentinel/passthrough classification already occurred. It preserves passthrough drafts, expands active note drafts once, converts invalid candidates to unresolved diagnostics, treats only `""` as empty, applies the existing `>= originalLength` fallback, and formats only successful notes. Template trailing whitespace is removed before callback interpolation, never after inserted note data.

`distillWithSameModel` prepares the current result, appends the selected ON/OFF instructions to the existing final task message, passes a copied prepared block array into structured context, then expands only after existing cleanup and sentinel classification. `buildImpressionText` uses `formatSourceReferenceNote`, so the template is trimmed before note interpolation. The active third-person prompt emits `Related parts` above `Relevant summary`: short citations may be inline, while multiline citations may be paired with `.pos()` and an optional fence. Successful items never deliberately expose internal IDs; unresolved diagnostics are the only allowed exception. `FUTURE-INTEGRATION.md` records the exact wiring and reload/live-test gate.
