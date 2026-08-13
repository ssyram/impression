# Passthrough reason notices

## Intent

### Pursue

Make every distillation passthrough notice identify the stable machine-readable reason and explain it in concise user-facing language.

### Protect

- Preserve the distinction between an LLM deliberately choosing passthrough and a degenerate distillation failure.
- Keep notices short and deterministic.
- Persist abnormal distillation termination separately from normal empty output.

### Reject

- A generic `Passthrough for <tool>` notice that hides the cause.
- Quoting or truncating arbitrary model output as though it were a reason.
- Describing sentinel passthrough as "proactive"; the model deliberately chooses a protocol-defined response rather than acting unprompted.

## Existing behavior and evidence

`PassthroughReason` is a closed union with five values: `sentinel`, `truncated`, `failing`, `empty`, and `error`. The distiller emits no custom reason text. A deliberate model choice is represented by the `<passthrough/>` sentinel after normalizing optional surrounding quotes, backticks, and trailing punctuation. Any `stopReason` other than `stop` or `length`, and any thrown distillation exception, is classified as `error` rather than `empty`.

The generic notice made `empty` fallbacks from `get_search_content` appear to be tool-specific impression bypasses. Therefore the notice must expose the classification without presenting unstructured model text.

## Options considered

1. Print only the classification, such as `empty`. This is minimal but requires users to know internal terminology.
2. Print the classification plus a fixed explanation. This preserves diagnostic precision while remaining readable.
3. Print an excerpt of model output. This is rejected because the protocol defines no custom reason text, excerpts are unstable, and sentinel output contains no useful explanation.

Option 2 is selected.

## Contract

Function: `formatPassthroughReason(reason)`

Requires:
- `reason` is a `PassthroughReason` or `undefined`.

Ensures:
- A defined reason is retained verbatim at the start of the result.
- Each defined reason receives exactly the fixed explanation below.
- `undefined` produces `unknown reason`.
- No model-generated text is included.

Mappings:

| Reason | Explanation |
| --- | --- |
| `sentinel` | `LLM deliberately chose passthrough` |
| `truncated` | `distillation output hit the token limit` |
| `failing` | `distillation output was not shorter` |
| `empty` | `distiller returned no usable text` |
| `error` | `distiller terminated abnormally` |

The initial and recall notification formats are:

```text
[impression] Passthrough for <tool>: <reason> (<explanation>)
[impression] Recall passthrough for <tool>: <reason> (<explanation>)
[impression] Distillation failed for <tool>: <stopReason or exception>: <errorMessage>
[impression] Recall distillation failed for <tool>: <stopReason or exception>: <errorMessage>
```

For a missing reason either notice ends with `unknown reason` without parentheses.

## Implementation design

- `src/format-passthrough-reason.ts` owns the fixed exhaustive mapping and formatting function.
- `index.ts` remains responsible for composing and emitting the tool-specific notification for both initial distillation and recall re-distillation passthroughs.
- Abnormal `DistillLogEntry` values add a `failure` snapshot with the actual system/user prompts, model, token limit, response content, response identifiers, safe diagnostics, or thrown exception. It excludes auth credentials, stack traces, and non-primitive diagnostic detail values.
- Unit tests cover all five classifications and the defensive missing-reason fallback.
- Integration tests use the coding-agent harness, faux provider, a long-output tool, and a recording UI context. They cover an initial `empty` passthrough, an initial API-error passthrough with a persisted failure snapshot, and a sentinel passthrough during recall re-distillation.

Correctness argument: the mapping is checked with `satisfies Record<PassthroughReason, string>`, so adding a classification to the union requires adding a description. Formatting uses only the classification and its fixed mapping, which prevents accidental model-output leakage. The function is pure and has no side effects.

## Verification

- Run focused tests through the plugin Vitest configuration.
- Run the faux-provider integration test and verify every scripted outer and nested response is consumed.
- Run the repository `npm run check` command.
- Independently review the design, implementation diff, and tests for correctness, completeness, concision, and unnecessary complexity.
