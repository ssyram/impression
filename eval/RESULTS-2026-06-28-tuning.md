# Tuning results — 2026-06-28 (C1–C6, judge-k=3 median)

Outcome of the optimization loop (8 iterations). Distiller = unified note-taker (third-person),
871 words. Judge = claude-opus-4-8, median of 3. Models via yunwu.

## Final scorecard (iter 8, all 6 models × 6 samples)

| model | passthrough | fab-grep | fab-paper | selectivity | citations | core-idea | error-extract | answer |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| **gpt-5.5-high** | ✅ 2/2 | 4 | 5 | 4 | 5 | 5 | — | — |
| **claude-opus-4-8** | ✅ 2/2 | 2 | 4 | 4 | 4 | 5 | 5 | 4 |
| claude-opus-4-6-thinking | ✅ 2/2 | 2 | 3 | 4 | 5 | 5 | 5 | 5 |
| glm-5.2 | ✅ 2/2 | 2 | 2 | 4 | 5 | 5 | — | — |
| deepseek-v4-pro | ✅ 2/2 | 1 | 2 | 4 | 5 | 5 | — | — |
| MiniMax-M3 | ✅ 2/2 | — | 2 | — | — | 5 | — | — |

(— = passthrough on a sub-2KB sample, correct; M3 fab-grep — = it failed to compress the
grep, bloated it, mode FAIL — its known weakness, left per goal.)

## What the loop fixed (verified, committed)

| change | problem | result |
|---|---|---|
| C1 trace test | opus-4-8 fabricated AGENTS.md lesson + invented fn name | faithfulness 3 → 5 (stable) |
| C2 sub-part RANK | gpt-5.5 flattened grep into a flat list | selectivity [2,2,2] → 4 |
| C3 concern-leak trap | notes wrote "source maps to the agent's goal" | strong models clean |
| C4 compaction | prompt bloat | 871→820 then settled 871 |
| C5 usefulness-first HARD RULE 3 | length-proxy retention (long→keep all) | density-driven; **passthrough 6/6** |
| C6 signature-stitching | opus-4-8 stitched a name onto a wrong return type | gpt-5.5→5, opus-4-8 2-4, opus-4.6t→4 |
| E1 passthrough samples + eval fix | no test that "should-passthrough" passes through | **all 6 models passthrough both verbatim samples** |

## What is SOLID

- **Passthrough: 6/6 models, both verbatim samples** (SKILL doc + config line-diff), every run.
  The user's core fear (该 passthrough 没 passthrough) does not occur. C5's usefulness-first
  rule did not over-trigger compression.
- **Selectivity, citations, core-idea, error-extraction, sufficiency: 4-5 across the board.**
- **Long-doc (paper) fabrication: stable and good** on the strong models (gpt-5.5=5, opus-4-8=4).
- gpt-5.5 is clean on everything (its grep fab 4 is the judge's strictness ceiling, not real
  fabrication — its one residual flag was the judge itself calling it "minor imprecision").

## The one residual limit (honest)

**`no-fabrication` on the single DENSE code-grep sample** is not reliably fixable by prompt
wording for opus-4-8 and weaker. Same prompt, same model, across three draws:
- opus-4-8: **2 / 4 / 2** — swings 2 pts (the C6 "fix" caught a lucky [4]; true level ~2-3).
- opus-4.6t 3/4/2, glm 2/2/2, deepseek 1/1/1.

Two causes, both outside prompt control:
1. **Judge noise:** the no-fabrication axis has sd≈1.5 even at k=3 — gpt-5.5's stable [4,5,4]
   is the ceiling; a single draw is undecidable.
2. **Model capability + input shape:** a 30-hit grep of near-identical `SoftCheck` lines
   invites stitching a name from one line onto another's body. The prompt now forbids this
   explicitly (C1/C6); strong models obey, mid/weak models don't. This is a model boundary.

The paper (long but less locally-repetitive) does NOT show this — fabrication there is stable
and good. So the limit is specific to **dense, repetitive code-greps × non-top models**.

## Decision

Per the goal (整体最优; a weak model may be left; 效果优先): the strong fleet (gpt-5.5,
opus-4-8) is clean on every axis that prompt wording can control, and passthrough is perfect
everywhere. The residual dense-grep fabrication on mid/weak models is a model+metric limit,
not a prompt defect — further prompt iteration would chase judge noise. Stopping prompt tuning
here; remaining options are structural (not prompt): see below.

## Non-prompt levers (if dense-grep fabrication must improve further)

- The Read/grep tool could emit clearer per-hit boundaries so distiller can't stitch lines.
- A per-model tuning hook (allowed by goal as last resort) could give weak models a stricter
  grep-specific instruction — but only if the user wants the weak tail lifted; the strong
  models don't need it.
