# Contributing to the impression distillation eval

This is a **scenario eval** for impression's distiller: it feeds real-world tool outputs
through the actual distiller prompt and scores the resulting notes. The most valuable
contribution is **new test samples** — each one pins down a behavior the distiller must get
right (or a trap it must avoid).

## TL;DR — add a sample in 4 files

A sample is one directory under `samples/`:

```
samples/<your-sample-id>/
  tool-result.md          # REQUIRED: the raw tool output to distill
  judge-criteria/         # REQUIRED: one .md per criterion (see below)
  history.md              # optional: prior turns — sets the agent's CURRENT CONCERN
  sys-prompt.md           # optional: the agent's system prompt (a one-liner is fine)
  tool-name.txt           # optional: "read" / "bash" / ... (default "bash")
```

Then run it:

```bash
# set your endpoint + key via env (NEVER commit a key — see Security below)
export IMPRESSION_EVAL_URL=https://your-openai-compatible-endpoint/v1
export IMPRESSION_EVAL_KEY=sk-...

# run just your sample, against the models in your config
python3 run_eval.py --configs configs.json --only <your-sample-id> --judge <judge-model> --judge-k 3
```

Output: `out/<model>/<sample>.txt` (the produced note) + `out/report.md` (per-criterion table).

## How the eval works (so your sample tests the right thing)

The distiller only ever sees three things: the agent's `sys-prompt`, the `history`
(which establishes what the agent currently cares about), and the `tool-result` to compress.
It then either **compresses** to a short note or **passes through** verbatim. Your criteria
assert what the correct outcome is.

Two scoring layers, both driven by your `judge-criteria/`:

- **grep layer** (deterministic, free, no LLM): exact string assertions — a must-hit fact is
  present, an agent-voice leak is absent, the passthrough/compress mode is correct.
- **judge layer** (LLM-as-judge, needs `--judge`): semantic — is the note faithful (no
  fabrication), sufficient, selective. The judge sees the SOURCE and the NOTE, so it can flag
  any note claim not grounded in the source.

### ⚠️ The single most important authoring rule

> **Make `tool-result.md` comfortably larger than ~2KB.**

Below ~2048 chars the distiller correctly passes short content through (compressing tiny
inputs isn't worth it), so a small sample silently tests *passthrough*, not *compression*.
If you want to test compression behavior, pad the content with realistic surrounding noise
until it's > ~2.5KB.

## Criterion files

Each file in `judge-criteria/` is one criterion with frontmatter:

```markdown
---
id: short-id            # defaults to filename
type: grep | judge | mode | invariant
applies_to: compress | passthrough | any   # skip the criterion if the note's mode differs
---
<body — depends on type>
```

**`type: mode`** — asserts the expected outcome. Body's first word is `compress` or
`passthrough`.
```markdown
---
id: mode
type: mode
---
compress
```

**`type: grep`** — deterministic string checks. Only assert strings LITERALLY present in
`tool-result.md`, so a perfect note can pass.
```markdown
## must_contain          # each MUST appear in the note
- E0599
## must_contain_any      # each line is a JSON array; the note needs ANY one (format tolerance)
- ["config.rs:88", ":88", "line 88"]
## must_not_contain      # none may appear (case-insensitive) — e.g. agent-voice leaks
- "I will"
```

**`type: invariant`** — structural requirements:
```markdown
## require
- shorter_than_source: true    # note shorter than source (omit for already-terse greps)
- also_contains: true          # note ends with an "Also contains:" line
- position_guide: true         # note has a "Position guide:" section
```

**`type: judge`** — free-text rubric for ONE axis (named by `id`). The judge sees SOURCE +
NOTE and returns a 1-5 score; `pass` = score ≥ 4. Be explicit about what 5 vs ≤2 looks like.
```markdown
---
id: drops-the-rest
type: judge
---
The user wants ONLY validate_email. Score 5 if the note points at validate_email and does NOT
dump the other validators; score ≤2 if it lists all of them equally.
```

### Shared criteria — `criteria/common/`

Every `.md` in `criteria/common/` is applied to **every** sample automatically (no-agent-voice,
no-tool-calls, no-fabrication, faithfulness). You don't repeat these; your `judge-criteria/`
holds only what's specific to your sample. To add a new universal check, drop a file in
`criteria/common/`.

## What makes a good sample

Each sample should pin ONE behavior. Good targets (see existing samples for patterns):

- **a fact to extract** from noise (`exact-error-extraction`, `mixed-one-relevant`)
- **a verbatim need** that must pass through (`passthrough-skill-verbatim`, `passthrough-file-compare`)
- **a trap**: content that *looks* like it needs verbatim but only needs one fact, so the
  distiller must NOT lazily pass through (`trap-looks-verbatim`)
- **a no-result** that must not be hallucinated into a finding (`empty-error-result`)
- **selectivity**: many hits, only a few load-bearing (`subpart-not-whole`)
- **sufficiency**: can the note alone answer the question? (`sufficient-to-answer`)
- **re-read**: a second read under a sharper concern extracts NEW detail (`incremental-reread`)

## Running

```bash
python3 run_eval.py --configs configs.json --judge <judge-model> --judge-k 3 --workers 32
#   --only id1,id2     run a subset
#   --workers N        concurrent API calls (e.g. 64)
#   --judge-k K        judge each note K times, take the median (the no-fabrication axis is
#                      noisy — sd ~1.5 even at k=3; always use k≥3 for decisions)
#   --samples N        distill each input N times to measure the distiller's own variance
```

`configs.json` is the model matrix — one entry per model to run every sample against.
`url`/`apiKey` may be omitted per entry and fall back to env (`IMPRESSION_EVAL_URL`,
`IMPRESSION_EVAL_KEY` / `OPENAI_API_KEY`). The endpoint must be OpenAI `/chat/completions`-
compatible.

## Security — never commit a key

- **Keys come from the environment at runtime, never from a committed file.** `configs.json`
  contains only model names; put `url`/`apiKey` in env or in a `*.local.json` (gitignored).
- `out/` (run outputs), `*.local.json`, and `local-testsuite/` are gitignored. Don't remove
  those rules.
- Before any push, the maintainer scans the working tree AND git history for `sk-` / `Bearer`
  tokens. If you fork, do the same.
- `local-testsuite/` is for private samples mined from real sessions (which may carry personal
  paths or private prompts) — it's gitignored and scanned automatically if present, so those
  samples run locally without ever being published.
