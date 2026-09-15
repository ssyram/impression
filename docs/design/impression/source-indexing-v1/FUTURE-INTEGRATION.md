# Source-reference runtime integration record

## Current state and reload gate

Source references, unresolved diagnostics, source-position projection, and the `Related parts` summary format are present on disk. The already-running Pi process does not use the new module/prompt bytes until the user reloads the Impression plugin. Live/provider validation waits for that confirmation.

Runtime wiring remains limited to:

- `src/distill.ts`: prepare and annotate the current result, append ON/OFF instructions to the existing final user task, then expand the cleaned draft once;
- `src/result-builders.ts`: trim the impression template before one callback interpolation, preserving inserted note whitespace.

The active third-person prompt is intentionally changed from `Position guide` to `Related parts`. Production expectations are in `eval/structured-message-parity.test.ts`, `src/error-result-distillation.integration.test.ts`, and `src/recall-distillation-failure.integration.test.ts`. The low-level raw builder/Responses converter test `eval/structured-responses-message-parity.test.ts` remains unchanged.

## Exact runtime sequence

### Current-result preparation

```ts
const contentText = serializeContent(request.content);
const preparedReferences = prepareSourceReferences(request.content);
```

The selected capability instructions are appended to the existing final task message, and structured context receives a copied prepared array:

```ts
const taskPrompt = appendSourceReferenceInstructions(
	baseTaskPrompt,
	preparedReferences.active,
);

content: [...preparedReferences.content],
```

One `preparedReferences.active` value controls annotation, ON/OFF instructions, and later expansion. Original request blocks and history are not mutated. Mixed/non-text/all-empty results remain ordinary distillation with references OFF.

### Cleanup, expansion, and fallback

Existing response collection, trimming, thinking extraction, empty handling, and sentinel classification run before expansion:

```ts
const finalNote = preparedReferences.active
	? expandDraft(preparedReferences.index, strippedText)
	: strippedText;
```

Valid references expand once; inserted source is never rescanned. Strict parser errors are contained by public expansion. A failed candidate becomes `(unresolved source reference: XX)`, where `XX` is the complete internal candidate through its closing `@`, or through draft end if unclosed. Expansion continues with later references. This diagnostic is the only normal final-output context where an internal ID may appear.

After expansion:

- exactly `""` from a valid empty selection uses the existing empty fallback;
- `finalNote.length >= contentText.length` uses the existing failing-length fallback, including when an unresolved diagnostic increases length;
- otherwise `finalNote` is retained.

Citation mistakes do not create an error/passthrough category by themselves. No cleanup, trim, sentinel classification, or decoding runs on inserted source.

## Position projection

Terminal `.pos()` projects an already-evaluated expression instead of emitting its text. Each raw chunk starts with a block-local code-point span; slicing, Python-whitespace strip operations, endpoint ranges, and grouped ranges carry the surviving spans.

A nonempty selection wholly inside one original text block renders `(LINE:COL~LINE:COL)`:

- lines are 1-based;
- columns are 0-based Unicode-code-point columns;
- starting `:0` is omitted;
- the ending column is omitted when the final selected code point is the last character or terminator of its physical line;
- multiple surviving spans in that block use their first-to-last bounding range.

Coordinates are relative to the current returned text block, not an underlying file or `read` offset. Empty selections render `(source position unavailable: empty selection)`. Cross-block selections render `(source position unavailable: selection spans multiple text blocks)`. Invalid `E` in `@!E.pos()@` inherits the unresolved-source-reference diagnostic.

## Related parts and formatting

Successful `Related parts` items do not display internal ID labels. The model may place a short citation inline. For a longer or multiline excerpt, it may place `.pos()` on the item line and put the source citation in an optional following fenced block. Fences affect presentation only. An optional relevance statement must describe a source-grounded fact, not a history-derived reason for selection.

`Relevant summary` remains below `Related parts`. `Grounded conclusions` may use `.pos()` to identify where an answer appears. When references are OFF, the model emits no citation syntax and uses only source-provided text or natural locations.

`buildImpressionText` calls:

```ts
return formatSourceReferenceNote(getImpressionTextTemplate(), { id, note });
```

The formatter trims the template before one interpolation pass and preserves inserted whitespace and reference-looking source.

## Preserved policies

No change was made to result thresholds, history selection, multimedia transport, ingestion/storage, recall limits, token budgeting, exactness guidance, repeated-read guidance, sentinel rules, or PASSTHROUGH policy. Removing or narrowing PASSTHROUGH remains a separate future discussion.

## Offline and live-test order

Before reload:

1. run all source-indexing/source-reference tests;
2. run production structured-message parity and initial/recall harness regressions;
3. run scoped TypeScript, owned-file formatting, and root `npm run check`;
4. record unrelated repository blockers without repairing official source.

After those gates, ask the user to reload. Only after reload confirmation run live checks for:

- short inline and longer `.pos()` plus optional fenced `Related parts`;
- no successful visible `@!N@`/`@!X~Y@` labels;
- unresolved diagnostics retaining their failed internal expression;
- empty and cross-block position messages;
- references-OFF mixed media;
- observable trailing-whitespace preservation.
