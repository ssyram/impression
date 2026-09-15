# Error Result Distillation Threshold

## Status

Implemented. Error results now use the independent threshold below; faux-provider integration tests cover default, disabled, zero-threshold, and failure-preservation behavior.

## Required behavior

Error tool results use an independent `errorMinLength` threshold rather than `minLength`:

- Missing `errorMinLength` resolves to `40960`.
- `errorMinLength === -1` disables error-result distillation and preserves the current passthrough behavior for every error result.
- `errorMinLength >= 0` distills an error result when `fullText.length >= errorMinLength`.
- `errorMinLength >= 0` passes an error result through when `fullText.length < errorMinLength`.
- Non-error results continue to use `minLength` unchanged.
- Distillation failure preserves and returns the original error tool result through the existing failure path.

Skip notifications are explicit:

```text
[impression] Skipped: tool result is an error with length <actual>, below error threshold <threshold>
```

For the disabled value:

```text
[impression] Skipped: tool result is an error and error distillation is disabled
```

## Minimal implementation

### `src/types.ts`

- Add `DEFAULT_ERROR_MIN_LENGTH = 40960`.
- Add optional `errorMinLength` to `ImpressionConfig`.
- Add required `errorMinLength` to `ResolvedConfig`.

### `src/config.ts`

Resolve with nullish fallback:

```ts
errorMinLength: raw.errorMinLength ?? DEFAULT_ERROR_MIN_LENGTH
```

### `index.ts`

- Add `ErrorMinLength` to `CONFIG_KEY_DEFS` with numeric minimum `-1`.
- Serialize `fullText` before the error check.
- For errors, apply only `errorMinLength`; do not apply `minLength`.
- Keep the existing normal-result `minLength` branch for `!event.isError`.
- Reuse the existing distillation, failure logging, and passthrough paths.

### Tests

Cover:

1. Missing configuration: `40959` error characters pass through.
2. Missing configuration: `40960` error characters trigger distillation.
3. `errorMinLength: -1`: arbitrarily long errors pass through.
4. `errorMinLength: 0`: every error result attempts distillation.
5. Short-error notification includes actual length and threshold.
6. Disabled notification identifies error distillation as disabled.
7. Non-error `minLength` behavior remains unchanged.

## Excluded scope

- No context-window budgeting or history truncation.
- No provider changes.
- No distiller prompt changes.
- No recall behavior changes.
