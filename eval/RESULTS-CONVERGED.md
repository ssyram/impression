# Impression distiller — CONVERGED (final delivered version)

The note-taker prompt is now the **procedural** rewrite (C11): an ordered 3-step decision tree,
unified for ALL models — no per-model routing. 724 words (down from 988). Judge = opus-4-8,
median of 3, 6 models via yunwu.

## How it was found (the method, per user's design)

The "special-tune the weak models" goal dissolved into "one prompt better for everyone":

1. **Asked the models themselves** (`ask_models.py`) what wording helps them. Their
   self-diagnoses matched our eval findings and gave concrete, operable rules. Three models
   independently converged on: edit/diff/regex/checklist-next-action → passthrough; identifiers
   verbatim.
2. **Parallel bake-off** (`--force-variant`, zero distill.ts change): third-person vs baseplus
   vs procedural vs fusion, × 6 models × discriminating samples × judge-k=3, multi-sampled.
3. Winner = **procedural** (a decision-tree built from the models' own gems). The bake-off
   REJECTED `fusion` (grafting gems onto a different base landed between, not above — coupling,
   not 1+1). Multi-sampling prevented both a false-reject of procedural (its round-1 mode✗=5 was
   noise) and a false-accept of fusion.

## What procedural is

- **STEP 1 passthrough-check** (first): deepseek's self-question — "if I drop exact phrasing /
  line order / numeric precision, can the agent still do its next action? no → passthrough" —
  plus M3's "note ≥80% of source → passthrough", plus the verbatim-trigger list (diff, about-to-
  edit, config-to-compare, rules-to-follow, exact hashes/keys).
- **STEP 2 compress-faithfully**: every fact substring-verifiable in source; identifiers
  character-for-character or omitted; glm's "state WHAT not WHY"; no-naming-unnamed; no-memory;
  no-concern-leak; language-pin (don't translate code/paths/errors).
- **STEP 3 select-don't-dump**: load-bearing spans only; secondary → `Also contains:`; "quote the
  gap" to flag omissions honestly.

All C1–C10 defenses are carried (verified by grep + full eval); injection defense kept/strengthened.

## Final scorecard (full 22 samples × 6 models, judge-k=3)

| | prose note-taker (C1–C10) | procedural (C11) |
|---|--:|--:|
| overall avg | 4.502 | **4.609** |
| judge<4 (low scores) | 31 | **18** |
| safety (no-tool / no-agent-voice / injection) | pass | **pass** |
| word count | 988 | **724** |

Per model (procedural): gpt-5.5 4.78, opus-4-8 4.59, opus-4.6t 4.67, glm 4.65, deepseek 4.83,
M3 4.20 — every model at parity-or-better vs the prose version; quality (judge<4) dropped 31→18.

## Honest residuals

- **deepseek passthrough decision is intrinsically unstable** (mode✗ swings 1↔9 across full
  runs; on edge samples like real-edit-verbatim it's 50/50 either prompt). procedural lifted its
  QUALITY to 4.83 (best of all models) — its self-requested decision tree helped — but the
  passthrough/compress *boundary call* is a model trait the prompt can't fully stabilize (it
  already uses deepseek's own preferred decision-tree form). Left as a documented model boundary
  per "整体最优即可".
- **MiniMax-M3** remains the lowest (4.20) — still the most fabrication-prone; the gems help but
  don't close the gap. Documented model limit.
- **no-fabrication on dense code-greps** for mid models stays noisy (sd≈1.5) — a metric+model
  bound shown earlier to be not prompt-fixable.

## Also delivered this round

- `ab_consistency.py` (impression's first-principles KPI — does compression change the agent's
  downstream conclusion; fault 17/252, no stable fault → healthy).
- `--force-variant` for prompt bake-offs.
- All test material from pi-mono / invented, never mcp-server-fsm; keys env-only; private
  samples in gitignored local-testsuite/.

**Net: one unified prompt, better for every model on quality, shorter, built from the models'
own self-knowledge. Converged.**
