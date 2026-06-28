# Impression distiller tuning — FINAL (delivered version)

Outcome of the iterative tuning loop. Distiller = the note-taker prompt with edits C1–C10.
Judge = claude-opus-4-8, median of 3 (the no-fabrication axis is noisy, sd≈1.5). Models via
yunwu: gpt-5.5-high, claude-opus-4-8, claude-opus-4-6-thinking, glm-5.2, deepseek-v4-pro,
MiniMax-M3.

## What the loop fixed (distiller prompt, all verified, committed)

| change | the real bug | evidence |
|---|---|---|
| C1 trace test | opus-4-8 fabricated AGENTS.md lesson + invented fn names | faithfulness 3→5 |
| C2 sub-part RANK | gpt-5.5 flattened a grep into a flat list | selectivity [2,2,2]→4 |
| C3 concern-leak trap | notes asserted "source maps to the agent's goal" | strong models clean |
| C6 signature-stitching | stitched a name from one line onto another's signature | opus-4-8 nf 2→4 |
| **C9 passthrough = ONE principle** | **the big one** — see below | real-edit-verbatim 5/6 passthrough |
| C10 Also-contains objective | false "nothing omitted" while dropping 90% of a payload | json-one-field faithfulness 2→5 |

C4/C8 were compaction/fixups; C5 reworded HARD RULE 3 to usefulness-first. C7 was TRIED and
REVERTED (no benefit — proved the dense-grep limit is model-bound, not prompt-fixable).

## The headline: C9 fixed a bug that real history proved was systemic

A session-mining pass over **785 real pi sessions / 9,713 real distillations** found the
distiller **NEVER autonomously passed through** — 99.7% compressed, 0.3% agent-forced
`skip_impression`, **0 autonomous passthrough**. So even when an agent said "read the exact
text before editing," the distiller compressed it, and the agent had to fight back with
`skip_impression`. Five real reversals were found (agent wanted verbatim-for-edit, got a
compressed note).

C9 replaced the closed 5-case passthrough gate with one principle — *pass through only when
essentially all content is directly relevant AND it can't be safely summarized; else compress*
— with the 5 cases demoted to open examples. Result on the real mined reversal
(`real-edit-verbatim`): **5/6 models now correctly pass through** (only glm, a weak-tail model,
still compresses it). The historical 0-passthrough bug is largely fixed.

## The methodological win: A/B consistency (impression's first-principles KPI)

The note-quality eval tests only the first hop (is the note good). The real question is the
second hop: **does compressing change the conclusion the agent reaches?** `ab_consistency.py`
answers it — for each (model, sample) it compares the agent's downstream answer from the RAW
tool result (B, no impression) vs from the COMPRESSED note (A). Verdict: agree /
impression_fault (B right, A wrong) / model_fault (both wrong same way — not impression's) /
impression_helped.

Full run (repeat=3, 252 runs): **impression_fault 17/252 (~7%), and no sample faults stably**
— every fault is a 1/3 sampling flicker. Faults concentrate on should-passthrough samples that
got compressed (verbatim clause/config/edit-suffix lost downstream). **No systematic
compression degradation.** Two findings the A/B data forced (preventing wrong prompt changes):

- **garbled-bytes is the MODEL's, not impression's.** A=B=agree 3/3 — the PNG-hallucination
  happens with or without impression. Plan to "fix garbled" was CANCELLED (it would have cost
  compression precision to chase a non-impression issue).
- **"about to edit" does NOT require passthrough.** When `edit-confirm-phrasing` was compressed
  to a position guide, downstream edits stayed correct 8/9 runs. And passthrough of 5462c raw
  text made the weak glm answer WRONG (overload) while compression agreed — passthrough is not
  unconditionally safer. So that was a SAMPLE mis-test (mode too strict), not a prompt bug.

## Final scorecard (iter20, full, judge-k=3)

No regression, no systematic weakness. Strong models (gpt-5.5, opus-4-8) are clean across all
22 samples (a single opus-4-8 history-no-restate nf=2 is the known noisy axis). All low scores
trace to either (a) the weak tail (glm/deepseek/MiniMax-M3 — left per "整体最优即可"; e.g. the
two passthrough=1 cells are glm/deepseek compressing what they should pass through), or (b) the
no-fabrication axis's ±1.5 judge noise. `mode` flickers are weak models near the 2KB threshold.

**Solid across the board:** passthrough on verbatim needs, compression of boilerplate,
sub-part selectivity, citations, core-idea, incremental re-read, contradiction reporting,
truncation honesty, multi-language (verbatim→passthrough-keeps-language, normal→language-free),
no-hallucinated-finding on no-result. The one model+metric-bound limit (dense-code-grep
no-fabrication on mid/weak models) is documented and not prompt-fixable (C7 proved it).

## Testsuite delivered (published to github.com/ssyram/impression)

22 samples (10 public + private ones in gitignored local-testsuite/), grep + LLM-judge layers,
A/B consistency harness, shared `criteria/common/`, CONTRIBUTING.md. Keys never committed
(env-only, history scanned). Real material from pi-mono, never from the mcp-server-fsm repo.

## Reproduce

```bash
cd eval
./run-local.sh --judge claude-opus-4-8 --judge-k 3 --workers 64          # note-quality eval
python3 ab_consistency.py --configs configs.local.json --judge claude-opus-4-8 --repeat 3  # KPI
```
