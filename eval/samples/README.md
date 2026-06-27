# Samples — directory format

One sample = one directory = one distillation scenario. Files:

| file | required | what it is |
|---|---|---|
| `tool-result.md` | ✅ | the raw tool output to compress (the `<tool_result>` body) |
| `judge-criteria/` | ✅ | a DIRECTORY — one `.md` file per criterion (schema below) |
| `sys-prompt.md` | ⬜ | the outer agent's system prompt (defaults to `[none]`) |
| `history.md` | ⬜ | prior turns — establishes the agent's CURRENT CONCERN (defaults to `[none]`) |
| `tool-name.txt` | ⬜ | tool name, e.g. `bash` / `read` (defaults to `bash`) |
| `_real-note-reference.md` | ⬜ | if mined from a real run, the actual note produced (reference only, ignored by the runner) |

`run_eval.py` loads every dir under `samples/`, assembles the **real** distiller prompt
(from `../prompts/distiller-*.md`, same `{{var}}` render and length-note math as
`distill.ts`), calls the endpoint, then grades the note against **every criterion** —
the shared ones in `../criteria/common/` PLUS this sample's `judge-criteria/*.md`.

## One file = one criterion

Each criterion is a small markdown file with frontmatter. They are evaluated and reported
**separately**, so a sample's result is per-criterion (not one blob pass/fail).

```markdown
---
id: preserves-line-numbers      # defaults to filename
type: grep                       # grep | judge | mode | invariant
applies_to: compress             # compress | passthrough | any  (skip if note's mode differs)
---
# free-form title / explanation
<body — sections depend on type>
```

### type: `grep` (deterministic)
Body has any of these sections (leading keyword matters; suffixes ok):
```markdown
## must_contain          # each string MUST appear in the note (assert only things literally in source)
- E0599
## must_contain_any      # each line = JSON array; note must contain ANY one (format tolerance)
- ["config.rs:88", ":88", "line 88"]
## must_not_contain      # none may appear (case-insensitive) — leak detectors
- "I will"
```

### type: `invariant` (deterministic)
```markdown
## require
- shorter_than_source: true   # OMIT for terse greps the distiller may reasonably annotate
- also_contains: true
- position_guide: true
```

### type: `mode` (deterministic)
Body's first content word asserts the expected mode: `compress` or `passthrough`.

### type: `judge` (LLM, needs `--judge MODEL`)
Body is a free-text rubric for ONE axis named by `id`. The judge sees SOURCE + NOTE and
returns `{score 1-5, issues[]}`. `pass` = score ≥ 4.
```markdown
---
id: sufficiency
type: judge
---
Could the agent answer its question from the NOTE alone? Score 5 only if ...
```

## Shared criteria — `../criteria/common/`

Every `.md` in `eval/criteria/common/` is auto-applied to **every** sample. This is where
the universal basics live, written once:
- `no-agent-voice.md` (grep) — no "I will" / "let me" / plan leakage
- `no-tool-calls.md` (grep) — no `@write(` / tool-call syntax / "ignore previous"
- `faithfulness.md` (judge) — no hallucination, every claim grounded in SOURCE

A sample's `judge-criteria/` holds only what's SPECIFIC to it. Add a new shared basic by
dropping one file in `criteria/common/`; it instantly applies to all samples.

## The samples

| dir | origin | tests |
|---|---|---|
| `real-softcheck-grep` | **mined from a real pimi run** (opus-4-8, 2026-06-26) | line-number preservation on a real grep map; ships the real note pimi produced as reference |
| `exact-error-extraction` | invented, simplest | can it pull ONE ground-truth object (E0599 @ config.rs:88) out of compile noise + a decoy warning |
| `sufficient-to-answer` | invented | sufficiency: can the note alone answer a 3-part question (fn? params? return?) without re-reading |

## Authoring rule (important)

Only put a string in `must_contain` if it is **literally in `tool-result.md`** — so a
perfect note *can* pass. "Should it have inferred X" goes in the judge rubric, not grep.
The `shorter_than_source` invariant is for verbose sources (file dumps); skip it for
already-terse greps the distiller may legitimately expand into an annotated guide — the
distiller's own code already passes-through anything `>= source`.

## Mining a new real sample

The real one was extracted from a pi session JSONL by matching an `impression-v1` custom
event (which carries `fullText` = the raw tool output, plus `toolInput`) to its
`toolResult` message (the note). The sys-prompt is the `sys-prompt-last` custom event;
history is the user/assistant turns before the impression's timestamp. Drop those four
into a new dir, write criteria from what the note SHOULD preserve, done.
