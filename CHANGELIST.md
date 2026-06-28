# Impression CHANGELIST

Distiller-prompt tuning log. Each entry: what changed, **why**, whether original meaning
was preserved or deliberately loosened, and the eval evidence. Driven by the eval harness
under `eval/` (real + invented samples, grep + LLM-judge layers, N≥3 resampling for
stability since single judge scores carry ±0.5 noise).

Baseline note-taker prompt = commit `27aef5d` ("try better prompting"). Word count there:
distiller-third-person.md ≈ 613 words. Target: keep total length roughly comparable while
tuning behavior.

---

## [C0] system-append: collapse skip_impression rules into "two modes"

**Files:** `prompts/impression-system-append.md`

**Problem:** the working-memory append (injected into the outer agent's system prompt,
paid once per session) had grown to 24 lines with a verbose standalone `### skip_impression
rules` section that largely duplicated the `skip_impression` tool's own schema description,
and scattered the read-aggressively guidance across separate paragraphs that could read as
contradictory ("read whole files" vs "no whole-file reads" — actually two different modes).

**Change:** rewrote to ~10 lines built around an explicit **two-mode** contrast: NORMAL
(distilled) = read generously, background self distills; skip_impression (raw passthrough) =
only when exact characters matter, one small range. Dropped the schema-duplicating mechanics
(count=0 / overwrite state) — those live in the tool description (single source of truth).

**Original meaning preserved?** Yes — every behavioral instruction survives: trust the notes,
read generously under distillation, use Position guide instead of re-reading, skip_impression
only for verbatim needs with justification + estimatedChars limit. Only the schema-mechanics
duplication was removed (still enforced by the tool itself). The previously-scattered
"read whole file is fine" vs "no whole-file reads" are now explicitly scoped to their modes,
resolving the apparent contradiction.

**Loosened anything?** No — consolidation only.

---

## [C1] Anti-hallucination: trace test + sub-part rule

**Files:** `prompts/distiller-third-person.md`

**Problem (from real eval run 2026-06-27):** claude-opus-4-8 distilling the SoftCheck grep
produced the richest, best-formatted note in the batch — and fabricated in exactly that
richness. Judge (N=1) scored faithfulness **3/5**, flagging two real hallucinations:
1. Invented external knowledge: asserted *"AGENTS.md lesson warns against hand-copied
   cross-crate type mirrors (prefer `pub use`)"* — the grep source contained NO AGENTS.md
   content. Pulled from training/memory, presented as grounded.
2. Invented naming: labeled an unnamed signature span a *"resolve_criteria helper"* — that
   name only appeared in an unrelated test elsewhere in the grep.

A grep layer can never catch these (the line numbers were all real); only the LLM judge saw
them. This is the load-bearing justification for the judge layer.

**Change:**
- Reworded "facts grounded in `<tool_result>`" → "facts **traceable** to `<tool_result>`"
  and replaced the single deletion-test line with a **Trace test**: for every name / symbol
  / line number / claim, you must be able to point at the exact span in the source; if not,
  delete it. Names two violation modes explicitly: (a) adding project knowledge / lessons
  from memory the source lacks (even if true — "record what was found, not what you know"),
  (b) naming a thing the source left unnamed ("a line range is not a license to label it").
- Added to POSITION GUIDE: "Point at sub-parts, not the whole" — each entry names a SPECIFIC
  span and why it matters, never "the whole file is relevant" nor one entry restating the
  whole result; if almost everything matters, that is passthrough not a guide.

**Original meaning preserved?** Yes. The old deletion test ("if a sentence still makes sense
with `<tool_result>` deleted, delete it") is **retained verbatim inside** the Trace test —
it was a relevance check; the Trace test is a strict superset that also catches fabrication.
Nothing removed; two failure modes made explicit. POSITION GUIDE already said "do NOT state
the whole result"; the sub-part rule strengthens wording the model was ignoring.

**Loosened anything?** No. Pure tightening.

**Word count:** 613 → 733 (+120, +20%). Slightly over the "comparable" target; flagged for
possible reclaim in a later entry (the Trace test was condensed once already from +155).

**Eval evidence (N=3 resample, judge=claude-opus-4-8):**
- opus-4-8 / real-softcheck-grep faithfulness: **3 (before) → [5,5,5] mean 5.0 sd 0** ✅ fixed,
  zero variance. AGENTS.md / resolve_criteria fabrications gone; note also got *shorter*
  (1907c → 1770c), so compression did not regress.
- Stability finding: the sharper `no-fabrication` judge axis sits at 3–4 with sd≈0.47 (it
  catches milder external-knowledge phrasing that plain faithfulness passes) — single runs
  unreliable, hence N≥3 from here on.
- Open issue surfaced by the same resample: `subpart-selectivity` on gpt-5.5-high is a
  **stable [2,2,2]** on the high-relevance-density SoftCheck grep — it compresses well and
  doesn't fabricate, but flattens the grep instead of selecting sub-parts. The sub-part rule
  is not yet strong enough for inputs where every hit looks relevant. → C2.

---

## [C2] Sub-part RANKING (not just "don't restate the whole")

**Files:** `prompts/distiller-third-person.md` (POSITION GUIDE)

**Problem:** C1's "point at sub-parts" didn't fix gpt-5.5 flattening the SoftCheck grep —
it listed all ~17 hits (incl. test/log sites that should be `Also contains:`) at equal
weight. selectivity stuck at [2,2,2]. The model needs a *selection* instruction, not just
a prohibition.

**Change:** added "When many hits look relevant, RANK — do not re-emit the search." The
guide carries only the few load-bearing spans (definition, entry point, wiring); secondary
occurrences (tests, log/tag sites, repeated mentions, incidental call sites) go to
`Also contains:`. "A guide that lists every hit at equal weight has selected nothing."

**Original meaning preserved?** Yes — extends the existing sub-part rule; nothing removed.
**Loosened?** No.

**Eval evidence (iter 1, parallel baseline, judge=opus-4-8):** gpt-5.5 real-softcheck
`subpart-selectivity` **[2,2,2] → 4**; opus-4-8 / opus-4.6t / deepseek all 5. ✅

---

## [C3] Trace test 3rd violation: editorializing through the concern (IN TEST)

**Files:** `prompts/distiller-third-person.md` (Trace test)

**Problem (iter 1 surfaced):** `no-fabrication` (the sharp judge axis) failed hard on the
two long/dense samples — opus-4.6t real-softcheck **faithfulness=2 no-fabrication=1**,
opus-4.6t paper no-fabrication=1, opus-4-8 real-softcheck no-fabrication=2. The fabrications
were a NEW mode, distinct from C1's memory-injection: the note **cross-references the source
against the agent's concern/history and writes the connection as a source fact** —
e.g. "the authoritative shape to model the new soft-rule guard on", "AgentSpec maps directly
to the user's soft-rules ITE concept", "essentially the same as the haiku stop-hook". The
concern is meant to SELECT relevance; the model crossed into INTERPRETING the source through
the concern + its own knowledge.

**Change:** Trace test's "two ways" → "three ways", adding: "editorializing through the
concern: the concern decides WHAT to keep, never licenses adding it as a fact. Do NOT write
that the source maps-to / is-the-same-as / is-the-authoritative-thing-to-model the agent's
goal, nor cross-link to systems only the history mentions. Record what the source says; the
agent draws the connection itself."

**Original meaning preserved?** Yes — sharpens the existing trace boundary; the "select by
concern" instruction (line 9, in `<thinking>`) is untouched, this only forbids letting the
concern leak into the note body as asserted fact.
**Loosened?** No.
**Word count:** 809 → 871 (+62). Prompt is accreting (+42% over 613 baseline) — length
reclaim is queued once behavior is locked (the three trace clauses can likely be tightened).

**Eval evidence (iter 3, judge-k=3 median — stable after the eval added median resampling,
since no-fabrication swings ±1.5 on identical notes):**
- gpt-5.5: no-fabrication **5** on both softcheck & paper, faithfulness 5/5. Clean.
- opus-4-8: softcheck nf **2→3**, paper nf **5**, faithfulness 4-5. Good.
- opus-4.6t / deepseek: still fabricate (nf 1-2) — residual mode is **invented naming**
  (calling an unnamed `pub soft: Vec<..>` line's struct, labeling a param a "helper").
  Per the goal (整体最优; a weak model may be left), the strong models are the win target
  and they are clean. C2 selectivity held (4-5 everywhere), no regression on other axes.

**Decision:** C2+C3 kept — verified net-positive on the strong models, no regression.
The weak-tail invented-naming is addressed by a sharper naming example in C4's compaction
(may or may not lift them; not gating).

---

## [C4] Compaction: merge sub-part redundancy, tighten trace test

**Files:** `prompts/distiller-third-person.md`

**Problem:** prompt accreted to 871 words (+42% over 613 baseline). POSITION GUIDE stated
the sub-part point ~3× (the "point at sub-parts" para + the "RANK" para + the OUTPUT FORMAT
hint); the trace test was verbose.

**Change:** merged the two sub-part paragraphs into one (keeps both the sub-part rule AND
the ranking rule — definition/entry/wiring vs secondary→Also-contains). Tightened the trace
test's three traps and gave the naming trap a concrete example (`pub soft: Vec<..>` → don't
supply the struct name) aimed squarely at the weak-model failure.

**Original meaning preserved?** Yes — pure densification; every rule (memory/naming/concern
traps, sub-part, rank) survives. The naming trap gained a worked example (net clearer).
**Loosened?** No.
**Word count:** 871 → 820 (+34% over baseline; was +42%). Still above baseline but the
content genuinely grew (3 fabrication modes + ranking) vs the original 1-line deletion test.

**Eval evidence (iter 4, judge-k=3):** compacted version statistically equivalent to verbose
(all deltas within the ±1 judge noise floor) — gpt-5.5 clean 5/5 softcheck, selectivity
held. No regression. Committed C2+C3+C4 as `1a3c9a3`.

---

## [C5] HARD RULE 3 → usefulness-first lexicographic principle

**Files:** `prompts/distiller-third-person.md` (HARD RULE 3)

**Problem (user-flagged):** the old rule — "Output MUST be shorter than the original, yet if
the original is long and complex, retain ALL relevant details" — tied retention to LENGTH.
Two failures: (a) a long paper that is mostly boilerplate gets "retain all" → bloated note;
(b) "MUST be shorter" can pressure dropping useful info from a short dense input. The user's
principle is cleaner and is the whole point of impression: **don't degrade execution** —
usefulness first, compression second; retention set by DENSITY not length.

**Change:** "Usefulness first, brevity second: keep every fact the concern needs, then
compress as hard as you can. Never trade a load-bearing fact for a shorter note, and never
pad. How much you keep is set by how much is USEFUL, not how long the source is — a long
paper full of boilerplate compresses a lot; a short dense diff compresses little. (If keeping
the useful part would not be shorter than the source, that is a passthrough.)"

**Original meaning preserved?** The TRUE intent of the old rule (don't drop essential detail
from long complex inputs) is preserved and generalized — it was a length-proxy for "high
useful-information content"; the new rule states the real criterion (density) directly. The
"must be shorter" hard constraint is reframed: shorter is the GOAL, but if the useful core
isn't shorter, that is correctly a passthrough (not a forced lossy compression). This is a
deliberate, user-approved **loosening** of "MUST be shorter" — it was causing the wrong
behavior (lossy compression of dense content that should passthrough).

**Word count:** 820 → 874 (the principle is longer than the one-line rule, but folds in the
passthrough condition).

**Eval evidence (iter 5, judge-k=3, + 2 new passthrough samples):**
- **Passthrough: 4/4 models passed through BOTH the SKILL doc and the config-compare file**
  (mode 1/1, passthrough-justified=5). The new rule did NOT over-trigger compression. The
  user's fear (该 passthrough 没 passthrough) does not occur.
- **Compression not broken:** paper still compresses on all 4 (compression-ratio 3-4,
  keeps-core-idea 5); softcheck selectivity 4-5, faithful-citations 5. No degradation.

---

## [E1] eval: passthrough samples + judge passthrough-scoped criteria

**Files:** `eval/run_eval.py`, `eval/samples/passthrough-{skill-verbatim,file-compare}/`

**Problem:** no sample tested "should-passthrough-but-compressed" (a real execution-degrading
failure: a SKILL or file-compare summarized loses the exact wording the agent needs). Also a
bug: phase-2 judging skipped ALL passthrough cells, so a `applies_to: passthrough` judge
criterion never ran.

**Change:** (1) two >2KB passthrough samples — a commit-style SKILL the agent must follow
verbatim, and a prod config.yaml for line-by-line diff. mode=passthrough + a
passthrough-justified judge. (2) run_eval: phase-2 no longer blanket-skips passthrough cells;
`applies()` already gates correctly (compress judges skip passthrough notes; passthrough
judges run only on passthrough notes). Infra + tests, no prompt change.

---

## [C6] naming trap: forbid signature-stitching (+ trim redundant examples)

**Files:** `prompts/distiller-third-person.md`

**Problem (iter 6 full run pinpointed):** the one persistent weak axis is `no-fabrication`
on the dense real-softcheck grep. Inspecting the best models' residual flags: opus-4-8
**misattributed a signature** — cited `build_review_logs(...) -> Vec<SoftCheck>` by stitching
a name seen in a doc-comment (review.rs:134) onto an assumed body; the real fn is at
tools.rs:478 returning `Vec<SoftCheckLog>`. gpt-5.5's only flag was the judge's own
"minor imprecision" (guard.soft vs transition.soft) — judge-ceiling, not real fabrication.

**Change:** extended the naming trap: "don't stitch one line's name onto another's body. If a
name appears in a comment/call but its definition+signature aren't both shown, don't state
its signature or return type. Each line stands for itself." Also trimmed the now-redundant
"BAD: agent-voice" examples (covered by the concern-leak trap + the grep-deterministic
common `no-agent-voice`/`no-tool-calls` criteria), keeping one GOOD anchor.

**Original meaning preserved?** Yes — sharpens the naming trap; the trimmed BAD examples are
redundant with existing rules (no behavior lost, agent-voice still grep-tested).
**Loosened?** No.
**Word count:** 901 → 871 (the stitching clause +27, the example trim −30).

**Eval evidence (iter 7, judge-k=3, real-softcheck):**
- opus-4-8 no-fabrication **2→4**, faithfulness **2→5** (the exact stitching error fixed).
- gpt-5.5 **4→5**, opus-4.6t **3→4**. The three strong models now nf 4-5.
- glm/deepseek flat (2/1) — weak tail unresponsive, left per 整体最优. No selectivity regression.
  (Caveat: iter 8 full-run drew opus-4-8 back to 2 — the [2,4,2] swing shows this axis is at
  the judge noise floor on dense greps; C6 is a real but noise-limited gain. See RESULTS.)

---

## [E2] eval: incremental-reread sample (the re-read-under-sharper-concern feature)

**Files:** `eval/samples/incremental-reread/`

**Why:** the user was curious whether a SECOND distillation of (a section of) the same source,
now under a SPECIFIC concern, can incrementally surface detail the broad first read skipped —
without re-emitting the overview already in history. Mined from the real agent-spec session:
first read was open-ended ("理解全文"), then a sharp follow-up ("intervention point? rule
shape? trigger/predicate/enforcement? pitfalls?") triggered a re-read.

**Sample:** history carries the prior BROAD note (title/authors/SMU/"framework"/95.56%) plus
the sharp re-read concern; tool-result is the real paper rule-mechanism section (7.3KB). Tests
(a) grep: surfaces trigger/predicate/enforcement; (b) judge `incremental-not-restate`: extracts
the NEW mechanism, does NOT re-state the overview already in history.

**Eval evidence (iter 9, judge-k=3, 5 models):** **clean across the board** — grep 4/4 all
models; incremental-not-restate **5,5,5,5,4**; faithfulness 5, no-fabrication 4-5. Even the
weak-tail models (glm, deepseek) do this well (it is not the dense-grep-stitching trap).
gpt-5.5's note extracted the exact rule shape + the `@inspect_transfer` syntax example + the
four enforcement kinds, dropped all overview, and honestly reported the source has no separate
pitfall list (answering "有没有坑" by what the source does/doesn't say, no fabrication).
The RELEVANCE rule ("compress the NEW result, not the conversation") works as designed.
**Conclusion: the incremental re-read mechanism is a strength, not a weak spot.**

---

## [C7] grep-quote rule — TRIED, REVERTED (no benefit)

**Files:** `prompts/distiller-third-person.md` (reverted)

**Hypothesis:** a GENERAL rule (not per-model special-casing, which the goal says to avoid)
— "for a grep result, quote each kept hit as shown; your words are only the relevance gloss;
don't upgrade a hit into a fuller fact" — might lift the residual dense-grep no-fabrication on
mid/weak models without special-casing.

**Result (iter 10, 2 distiller draws × judge-k=3 — robust double resampling):** **no lift.**
gpt-5.5 nf 4.5 (already ceiling), opus-4-8 3.0, opus-4.6t **2.0 sd=0**, glm 1.5, deepseek 2.0 —
all within prior noise. Worse, it nudged two cells to `mode FAIL` (the "quote each hit"
phrasing pushing toward verbatim/passthrough on a grep) and dropped opus-4-8 faithful-citations
once. +31 words for zero gain + slight passthrough-nudge risk.

**Decision: REVERTED** (per "minor rules that hurt can be removed" + "不增加特调那最好" +
不劣化执行). This negative result is the proof that the dense-grep fabrication limit is a
genuine MODEL + JUDGE-NOISE boundary, not a prompt-wording gap — a general rule can't move it,
and the goal prefers no per-model special-casing. The prompt stays at the C6 state (871 words).

## [C11] note-taker rewritten as ordered decision-tree (procedural) — unified, all models

**Files:** `prompts/distiller-third-person.md` (full rewrite), `eval/run_eval.py` (--force-variant)

**Why:** to push past the residual weak-tail gaps (deepseek's unstable passthrough decision,
glm/M3 fabrication) WITHOUT special-casing models. Probed deepseek/glm/MiniMax-M3 about
themselves (ask_models.py) — their self-diagnoses matched our eval findings and gave concrete,
operable wording. Three independently converged on: (1) edit/diff/regex/checklist next-action →
passthrough; (2) identifiers verbatim. Ran a PARALLEL bake-off (--force-variant) of 3 candidates
× 6 models × 8 discriminating samples × judge-k=3, repeated to suppress noise.

**Change:** the winning candidate `procedural` replaces the prose note-taker. It is an ordered
3-step decision tree: STEP 1 passthrough-check (with deepseek's self-question "if I drop exact
phrasing/line-order/numeric precision, can the agent still do its next action? no → passthrough"
+ M3's "note ≥80% of source → passthrough"), STEP 2 compress-faithfully (substring-verifiable
facts, character-for-character identifiers, glm's "state WHAT not WHY", no-naming-unnamed,
no-memory, no-concern-leak, language-pin), STEP 3 select-don't-dump (+ "quote the gap"). All
C1-C10 defenses verified present; injection defense kept.

**Original meaning preserved?** Yes — every C1-C10 behavior is carried (verified by grep +
full-sample eval). The structure changed from prose to a decision tree; the wording is the
models' own where they had sharper intuition about themselves.
**Loosened?** No. **Word count:** 988 → 724 (SHORTER).

**Eval evidence (full 22 samples × 6 models, judge-k=3, procedural vs third-person):**
- Overall avg 4.502 → **4.632**; judge<4 31 → 24; strong-model regressions: **ZERO**.
- Per model: gpt-5.5 4.69→4.92, opus-4-8 4.69→4.74, opus-4.6t 4.32→4.65, glm 4.44→4.77,
  M3 4.15→4.34 (all up); deepseek 4.46→4.35 — a single-sample sampling artifact
  (real-edit-verbatim passthrough is 50/50 on deepseek either way; that run drew the compress
  side). deepseek's mode✗ went 6→1 (its self-diagnosed "needs an ordered decision tree" fixed
  by exactly that).
- The bake-off also REJECTED a `fusion` candidate (grafting gems onto a different base landed
  between, not above — coupling, not 1+1). Multi-sampling prevented both a false-reject of
  procedural (its round-1 mode✗=5 was noise) and a false-accept of fusion.

**Net: one prompt, better for ALL models, 27% shorter. The "special-tune the weak ones" goal
dissolved into a single superior prompt — no per-model routing needed.**

## [C10] Also-contains: objective "what's beyond the note", not subjective "significant omitted"

**Files:** `prompts/distiller-third-person.md` (OUTPUT FORMAT)

**Problem (iter 15, json-one-field sample surfaced it):** when the task needs ONE field of a
large source (e.g. "give me subscription.tier" from a 2KB user-payload JSON), models correctly
extracted the field — but wrote `Also contains: nothing significant omitted` while dropping
~90% of the payload. The judge flagged the false claim (faithfulness 2 on opus-4-8/4.6t/M3).
Root cause: the old format hint `[ONE line of significant omitted material, or "nothing
significant omitted"]` gave a subjective "significant" escape hatch the model used to wave away
a large omitted body.

**Change:** reworded Also-contains to be OBJECTIVE — name what the source holds beyond the note
(even if not needed for the task: "the rest of the user payload", "the other validators"); say
"nothing omitted" ONLY if the note truly covers essentially all of the source; explicitly forbid
claiming nothing-omitted when keeping one span of a large source.

**Original meaning preserved?** Yes — Also-contains still points at omitted material; the change
removes the subjective "significant" loophole that let a true omission be denied. This aligns
with the original purpose (a pointer to what was set aside, in case it's needed later).
**Loosened?** No.

**Eval evidence (iter 16, judge-k=3):** json-one-field faithfulness **2→5** on opus-4-8 and
opus-4.6t (and gpt-5.5/glm 5); the false "nothing omitted" gone. trap-looks-verbatim no
regression. Net positive.

## [C9] passthrough: single principle, cases demoted to open examples

**Files:** `prompts/distiller-third-person.md` (PASSTHROUGH + HARD RULE 3)

**Why (the long design conversation behind this):** the 5-case passthrough list was a closed
gate ("Use it ONLY when [1-5] ... otherwise compress"). A closed enumeration of an open set
(tool outputs are open-ended) necessarily leaks — and it pushed the model toward "doesn't match
a case → must compress", which risks compressing content that should stay verbatim (execution
degradation). We chased a more fundamental criterion through several rounds (can-it-be-replaced →
recall cost → future-attention of dropped info) and landed on the user's collapse: the deepest
correct criterion, stated as a single direct test the model can actually act on.

**Change:**
- PASSTHROUGH rewritten to ONE principle: **pass through only when, for the current task,
  essentially ALL the content is directly relevant AND it can't be safely summarized (the agent
  needs exact phrasing); otherwise compress.** Default is compress, stated up front.
- The 5 cases are kept but **demoted to open examples** ("examples, not an exhaustive list") —
  they illustrate the bar, they are no longer the gate. The "ONLY when [list] ... otherwise
  compress" closed frame is removed.
- Added the actionable tie-breaker that replaces "estimate future value" (which the model can't
  do) with "evaluate present certainty" (which it can): **"When unsure whether a part is
  droppable, treat it as needed."**
- HARD RULE 3's trailing length-based passthrough hint ("if keeping the useful part would not be
  shorter than the source → passthrough") was **replaced** by a pointer to the single principle —
  it was a weaker, length-flavored second criterion the user had explicitly rejected ("retention
  by value, not length"); two different passthrough triggers would dilute the single rule.

**Original meaning preserved?** The 5 cases' content is fully preserved (as examples). What
changed is their STATUS (gate → examples) and the default's clarity (compress, explicitly). The
length-based passthrough hint was intentionally dropped (user-rejected criterion), not lost by
accident.
**Loosened?** The gate is loosened (a verbatim need outside the 5 cases can now pass through);
the default (compress) is unchanged. This is the intended direction: don't force-compress
something that needs exact phrasing just because it doesn't match a listed case.

**Eval evidence:** [full re-test in progress — watch passthrough rate on the 2 verbatim samples
stays 6/6, compression not over-triggered nor under-triggered]

## [C8] fix passthrough-case off-by-one

Trivial: the passthrough format said "which case, 1-4" but there are 5 cases (case 5 added
earlier). Corrected to 1-5. No behavior change.

---

## [E3] eval: tolerate malformed-thinking-tag passthrough (measurement fix)

**Files:** `eval/run_eval.py` (`parse_distillation`)

**Problem (iter 11 surfaced):** glm-5.2 and deepseek-v4-pro showed `mode FAIL` on the
verbatim passthrough samples — looked like a regression. Inspecting the raw output: **both
models correctly DECIDED to passthrough** (their reasoning is textbook: "case 1 applies,
summarizing would lose normative wording") and emitted `<passthrough/>`. The eval parser
mismarked them because:
- glm emitted its thinking prose with NO opening `<thinking>` tag, then `<passthrough/>...`
  (trailing dots). The strip regex needs balanced tags, so the prose stayed and the trailing
  `...` made `!= SENTINEL`.
- deepseek emitted a lone `</thinking>` (no opener) + `<passthrough/>`.

So this was a **measurement bug, not a model failure** — the weak models passthrough correctly.

**Change:** `parse_distillation` now (1) strips unbalanced/stray `<thinking>`/`</thinking>`
tags, (2) tolerates trailing dots/space on the sentinel, (3) treats a sentinel that appears
as the final non-empty line (after preamble prose) as passthrough. Verified: glm & deepseek
malformed outputs → passthrough=True; a clean compress note still → False.

**⚠️ Finding for `src/distill.ts` (NOT changed — flagged for user):** the production parser
has the SAME strictness (`sentinelLike === DISTILLER_SENTINEL` after only quote/punct strip,
balanced-tag thinking strip). So in production, glm/deepseek's correct passthrough decisions
would ALSO be mismarked as compressions → the agent gets a compressed note when it asked for
verbatim = execution degradation on weaker models. This is a real robustness gap in
distill.ts worth the same tolerance. Left for user decision per "测试好了最后我确定了再动
impression 的机制" — the eval is fixed; the mechanism fix is proposed, not applied.
