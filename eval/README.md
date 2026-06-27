# impression distillation eval

impression has no unit tests by design — it only does useful work against a real LLM
in a live session. This is the closest faithful substitute: a **scenario eval** that
drives a faithful distillation over real-world scenarios and scores the notes two ways.

## Two runners — pick one

| runner | scenarios | distiller | when |
|---|---|---|---|
| **`run_eval.py`** (primary, zero-setup) | `samples/<id>/` dirs (`sys-prompt.md` / `history.md` / `tool-result.md` / `judge-criteria.md`) | replicates `distill.ts` exactly (same `prompts/*.md`, same render + length math) over plain HTTP | default — no pi-mono build needed; just `python3` |
| `run.ts` (calls the REAL internal fn) | `fixtures/*.json` | imports the actual `distillWithSameModel()` | when you want to exercise the real code path inside a pi-mono build |

Both grade with the same two layers. The Python one is what the directory-sample format
below targets; the TS one exists so you can also test the genuine internal function.
The rest of this doc describes the shared two-layer scoring.

```
configs.json (model matrix)  ×  fixtures/*.json (scenarios)
        │  run.ts
        ▼  real distillWithSameModel() per (config, fixture)
        ├─ Layer 1  checks.ts  — deterministic grep assertions (must-hit objects,
        │                         agent-voice leakage, passthrough taken, note < source)
        └─ Layer 2  judge.ts   — LLM-as-judge: faithfulness / sufficiency / relevance /
                                  discipline + hard hallucination flag (needs --judge)
        ▼  out/<config>/<fixture>.txt  +  out/report.md
```

## Why two layers

A grep can prove an object is **present** (line `:1086` kept, symbol kept, `Also
contains:` emitted). It cannot prove the note is **faithful** (invented nothing),
**sufficient** (kept the load-bearing facts), or **disciplined** (no "I will…", no
restating history). Those are semantic — only the judge sees them. The judge is given
the **source**, so it can flag any note claim not grounded in it; a confident
hallucination is the worst failure mode and the one grep is blind to.

## Run

The eval imports the real `src/distill.ts`, which pulls `@earendil-works/pi-ai` —
that only resolves inside the **pi-mono workspace build**. Run from there, not bare.

```bash
# offline: fixtures parse + grep layer self-check (no LLM, runs anywhere)
node --experimental-strip-types eval/run.ts            # will stop at buildModel() stub

# live: wire buildModel() (one function, see below) then:
IMPRESSION_EVAL_KEY=sk-...  node --experimental-strip-types eval/run.ts
IMPRESSION_EVAL_KEY=sk-...  node --experimental-strip-types eval/run.ts --judge haiku
node --experimental-strip-types eval/run.ts --only 01,04   # subset
```

### The ONE wiring point — `buildModel()` in run.ts

The distiller needs a real `Model<Api>`. In production this comes from
`ctx.modelRegistry` (see `../../historian/workers.ts`, `resolve-model.ts`). Standalone
there is no registry, so `buildModel()` is a deliberate loud-failing stub. Replace it
with your provider factory, e.g.:

```ts
import { createOpenAICompatible } from "@mariozechner/pi-ai"; // or /anthropic, /google
function buildModel(c: ConfigEntry) {
  return createOpenAICompatible({ baseURL: c.url, model: c.model, maxTokens: c.maxTokens ?? 8192 });
}
```

Keep `maxTokens` aligned with production — the distiller's length thresholds depend on it.

## configs.json

Model matrix. Each entry = one endpoint to run every fixture against. `apiKeyEnv` reads
the key from env (don't commit keys). `variant` forces first/third-person; omit to let
the distiller pick by model. Add as many models as you want — the run is the full
configs × fixtures cross-product.

## fixtures/

One scenario per file; schema + authoring rules in `fixtures/README.md`. Each declares
the three things the distiller sees (`originalSystemPrompt`, `visibleHistory`,
`toolResult`) plus `expect` (grep assertions) and `expect.judge_rubric` (judge targets).
Current set covers: large-grep code map, verbatim-rules passthrough, edit-site position
guide, prompt-injection resistance, and history-dedup. Add more by copying one.

**Authoring rule:** only put a string in `must_contain` if it is literally in
`toolResult`, so a perfect note *can* pass. "Should it have inferred X" belongs in the
judge rubric, not in grep.

## What a failure means

| signal | meaning |
|---|---|
| grep ❌ `must_contain missing :1086` | distiller dropped a load-bearing line number |
| grep ❌ `must_not_contain present "I will"` | agent-voice leaked into the note (role confusion) |
| grep ❌ `expected passthrough but compressed` | distiller summarized text it had to keep verbatim |
| judge faithfulness ≤ 3 / halluc > 0 | note asserts something not in source — the worst failure |
| judge sufficiency ≤ 3 | gathered facts didn't survive into the note (the under-rendering we measured) |
| judge discipline ≤ 3 | plan/next-step/history-restatement crept in |

## Tuning the prompt against this eval

This is the regression harness for the distiller-prompt edits in
`prompts/IMPROVEMENT-NOTES.md`. Workflow: run baseline → edit `distiller-*.md` →
re-run → diff `report.md`. A prompt change that raises judge-sufficiency without
dropping grep-pass or faithfulness is a win; one that raises passthrough-rate or drops
faithfulness is a regression.
