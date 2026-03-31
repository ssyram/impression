# Prompt Evolution & Design Discussion

Companion document to the finegrained check report. Contains implementation analysis, git history tracing, and open design questions — material for informing paper writing, not direct paper corrections.

Source: `my-plugins/impression-system.ts` across 8 substantive versions (Mar 27-30 2026, commits `ad4b2d3` through `ad11452`), plus the V6 refactored version in `my-plugins/impression/`.

---

## Two Prompts, Two Roles

The system has TWO distinct prompts that must work in concert:

1. **Distillation prompt** (`systemPrompt` in `distillWithSameModel`) — tells the "inner self" how to compress
2. **Acting-side prompt** (`buildImpressionText`) — tells the "outer self" how to treat the compressed notes

These serve fundamentally different purposes (compression vs. action), yet must present a unified identity. The git history reveals this was the central engineering challenge.

---

## Evolution of the Distillation Prompt (Inner Self)

### V1 (Mar 27, `ad4b2d3`) — Third-Person Narrator

```
"You are replaying the agent state right before tool output was returned."
"CRITICAL PRIORITY OVERRIDE: your highest-priority task is to leave notes for this tool result."
"You MUST preserve decision-relevant facts and constraints..."
"Also preserve high-signal structured facts likely needed by follow-up questions..."
```

**Character**: A detached note-taker with a priority override. No identity language. The distiller is framed as "replaying" the agent state — observing from outside, not being the agent. This is exactly what the paper later calls "generic detached summarization."

**Key absence**: No concept of self. No "you are the same agent." No awareness of what the outer self will do next.

### V2 (Mar 28, `8609d83`) — Smarter But Still External

```
"You are replaying the agent state right before tool output was returned."
"Think of you are executing the given task after reading <tool_result>, what information would be relevant?"
"Minimize the chances that you recall the information again right after taking these notes -- that is a severe failure."
```

**Character**: More goal-aware — now considers "what would be relevant for executing the task." Introduces the key insight that immediate recall = failure. But still framed as "replaying" rather than "being."

**Key addition**: "Minimize recall" appears for the first time — the anti-over-recall principle.
**Still missing**: Self-identity language. The distiller is still an observer.

### V3 (Mar 29, `12f2632`) — The Identity Breakthrough: "You ARE the same agent"

```
"You are the same agent as the one in the visible history — the same identity, the same mind."
"Your outer self (the main thread) will only see what you write here, not the original content."
"Think of this as choosing what to remember: you are compressing your own memory, not summarizing for someone else."
"Your goal: with your notes, your outer self should be able to continue working without needing to recall the original immediately — immediate recall is a **failure** of your compression."
```

**Character**: RADICAL SHIFT. The distiller is no longer replaying or observing — it IS the agent. First-person framing throughout. "Your outer self" establishes the inner/outer relationship. "Compressing your own memory, not summarizing for someone else" is the exact distinction the paper claims as its core novelty.

**Key additions**:
- `<thinking>` tags introduced — giving the inner self a private reasoning space
- Action-awareness: "reason about what your outer self will do NEXT"
- Navigation guidance: "give navigation guidance so your outer self can re-read only what's needed"
- Context-awareness: "If the file was already read earlier, be MORE aggressive"

This commit is the conceptual birth of "identity-preserving self-distillation."

### V4 (Mar 29, `d8576e5`) — Grounding Constraints: Preventing Hallucinated Synthesis

```
"Your notes must be grounded ONLY in the <tool_result> content — history provides intent context, not reasoning material."
"NEVER synthesize conclusions by combining tool output with conversation history."
"Action guidance must focus SOLELY on navigating or using the <tool_result> content."
"Do NOT answer questions from the conversation history, do NOT diagnose problems..."
```

**Character**: Same identity framing, but with critical guardrails added. The inner self was "too helpful" — it would combine tool output with history to draw conclusions, essentially acting as a reasoner rather than a compressor. The implementation treats this as a failure mode to be corrected. However, whether this is genuinely a failure or a consequence of the identity assumption working too well is an open question (see Insight 2 below).

**Key insight for the paper**: This reveals a fundamental tension in the identity design. If the inner self truly IS the outer self, why constrain its reasoning? The current answer is pragmatic — notes can't be audited — but the question itself is worth discussing openly.

### V5 (Mar 30, `ad11452` / current) — Adaptive Compression + Refined Passthrough

```
"New content length: X characters (considered very long / relatively short)"
"For short output or when the entire content is operationally needed, especially when already in more precise reading as per your guidance in (a): return <passthrough/>"
```

**Character**: Same identity framework as V3/V4, but with content-length awareness and refined passthrough logic. The system now tells the inner self how long the content is and adjusts compression expectations accordingly. Also refines the passthrough condition for when the outer self is doing a targeted re-read (the "already in more precise reading" clause).

---

## Evolution of the Acting-Side Prompt (Outer Self)

### V1 (Mar 27, `ad4b2d3`) — Neutral Wrapper

```
<impression id="...">
[note]
</impression>
Note: this impression is not the full original output, and may omit details.
If you need exact values, exact wording, full lists, or verification, call recall_impression with id "..." before answering.
```

**Character**: A plain XML wrapper with a disclaimer. No identity language. The outer self is told the impression "may omit details" and should recall "if you need exact values." This frames the impression as an external artifact to be cautiously trusted.

### V2 (Mar 29, `12f2632`) — First-Person Ownership: "MY INTERNAL MEMORY"

```
[MY INTERNAL MEMORY | ID: ...]
I have already processed the raw output of this tool in the background for further processing.
I trust these notes completely (EXCEPT WHEN REPORTING ERRORS). They are sufficient for all reasoning, planning, and answering for the CURRENT needs.

--- MY NOTES ---
[note]
----------------

CRITICAL INSTRUCTION FOR MYSELF:
- I MUST NOT call `recall_impression` just to 'verify' or 'get more context'.
- However, I should NOT hesitate to use `recall_impression` when precise, verbatim information is required for the next action (e.g., `edit`, `write`), or new information is needed...
```

**Character**: RADICAL SHIFT matching V3 of the distillation prompt. The impression is now framed as the agent's OWN memory ("MY INTERNAL MEMORY"), written in first person ("I have already processed... I trust these notes..."). The recall instruction is also first-person: "CRITICAL INSTRUCTION FOR MYSELF."

**Key design decisions**:
- "I trust these notes completely" — establishes that the outer self should not second-guess the inner self
- "EXCEPT WHEN REPORTING ERRORS" — acknowledges that error-reporting needs raw data
- Anti-recall: "I MUST NOT call recall_impression just to verify" — prevents the outer self from reflexively distrusting its own memory
- Pro-recall: "I should NOT hesitate... when precise, verbatim information is required" — carves out the exact cases where recall is appropriate

### V3 (Mar 30, `ad11452` / current) — Refined Recall Instructions

```
- If my notes above contain specific read instructions (e.g., `read(offset=X, limit=Y)`), for `edit`/`write`, I MUST use those (or a slightly larger range) to get exact text — NOT `recall_impression`.
- I should ONLY use `recall_impression` when my notes lack the information I need OR no read instructions are provided for the relevant section.
```

**Character**: Same identity framework, but with a critical refinement: the outer self is now told to prefer targeted re-reading over full recall. This is important because:
1. It reduces recall frequency (better compression ROI)
2. It teaches the outer self to use the inner self's navigation hints
3. It creates a graduated retrieval strategy: notes first -> targeted re-read -> full recall

---

## Key Insights from the Evolution (for the paper)

### Insight 1: The Identity Transition Was Not Gradual — It Was a Phase Change

V1-V2 (Mar 27-28) use third-person observer framing. V3 (Mar 29, `12f2632` "better consistency in impression") switches to first-person identity framing in BOTH prompts simultaneously. This was not incremental refinement — it was a fundamental reframing of what the distiller IS. The commit message "better consistency in impression" understates the significance: this is the moment the system went from "summarization with context" to "self-compression under identity."

**Paper recommendation**: Present this as a design discovery, not an obvious choice. The early versions were conventional summarization with progressively better prompts. The breakthrough was realizing that the FRAMING of the distiller's relationship to the actor matters more than the specific compression instructions.

### Insight 2: The Over-Identification Question — An Open Problem

V4 (`d8576e5`) adds guardrails against the inner self "being too helpful" — synthesizing conclusions, answering questions, diagnosing problems. The implementation treats this as a failure mode to be corrected. But is it actually a failure? This deserves open discussion rather than a settled conclusion.

**The practical observation**: When the inner self identified too strongly with the outer self's goals, it started combining tool output with conversation history to draw conclusions and answer questions — acting as a reasoner rather than a compressor. The V4 guardrails ("NEVER synthesize conclusions") were added to fix this.

**The philosophical tension**: If the inner self truly IS the outer self (same identity, same mind), then reasoning and synthesizing is exactly what a self would do. Telling yourself "don't think too hard about this, just take notes" is paradoxical — you are simultaneously asserting identity ("you are the same agent") and constraining it ("but don't be fully yourself"). There is no natural basis for "protecting yourself from yourself" if the identity assumption holds fully.

**Possible framings**:

1. **It IS a failure (current implementation's position)**: The inner self's job is compression, not reasoning. Even if they share identity, they have different ROLES at this moment. A surgeon and a patient can be the same person (self-surgery), but the surgical role still has specific constraints. The inner self's role is "record what matters," not "solve the problem."

2. **It is NOT a failure, but a resource allocation problem**: The inner self reasoning is not wrong per se — it's just happening in the wrong place. Conclusions drawn during compression are invisible to the outer self's verification process. The issue isn't that the self shouldn't reason, but that reasoning results stored in compressed notes can't be audited, questioned, or revised by the outer self. It's not distrust — it's about preserving the outer self's epistemic autonomy.

3. **It reveals a fundamental limitation of the identity abstraction**: Maybe a single LLM call cannot simultaneously serve as compressor AND reasoner. The identity assumption works for compression (same model -> same relevance judgments), but breaks down for reasoning (conclusions drawn in compressed form lose their justification chain). The "over-identification" guardrails are evidence that the identity metaphor has a BOUNDARY — it applies to what-to-remember but not to what-to-conclude.

4. **It is an empirical question that should be tested**: Perhaps the guardrails HURT more than they help in some cases. An ablation removing the anti-synthesis constraints could show whether the inner self's reasoning is actually useful or harmful. If the inner self's conclusions are consistently correct (because it has the same context), the guardrails may be over-conservative.

**Paper recommendation**: This should appear in Discussion (Section 8) as an open question — not as a solved problem. The current guardrails are a pragmatic engineering choice, but whether "over-identification" is truly a failure or a mischaracterized feature is unresolved. Possible framing:

> "We observed that without grounding constraints, the distiller begins synthesizing conclusions by combining tool output with conversation history — effectively reasoning rather than compressing. We treat this as a failure mode and constrain the distiller to ground its notes only in the tool result. However, whether this constraint is optimal remains an open question. If the identity assumption holds, the distiller's reasoning should be as reliable as the actor's. The constraint may reflect a fundamental boundary of the identity metaphor: shared identity enables aligned memory selection, but does not license delegating reasoning to a phase where conclusions cannot be later verified or revised. We leave empirical investigation of this boundary to future work."

This is one of the most intellectually interesting aspects of the system and deserves prominent treatment.

**A possible deeper-identity-consistent redesign**: Rather than banning reasoning, the guardrail could be rewritten to DEEPEN identity consistency by respecting both the inner self's intelligence and the outer self's epistemic autonomy. The core insight: the real problem isn't that the inner self reasons — it's that the outer self receives conclusions without being able to distinguish them from observations. The fix is labeling, not prohibition.

Current V4 approach (bans reasoning):
```
"Your notes must be grounded ONLY in the <tool_result> content."
"NEVER synthesize conclusions by combining tool output with conversation history."
```

Proposed identity-consistent approach (labels reasoning):
```
"You ARE reasoning as yourself — you may think freely about what this tool result
means for your ongoing task.
However, your future self will see ONLY these notes, not the raw content. So:
- FACTS from the tool result: state them directly. Your future self will trust
  them as ground truth.
- YOUR CONCLUSIONS (combining tool result with what you know from history):
  mark them explicitly as '[My reading: ...]' so your future self knows
  these are inferences, not verbatim data, and can verify if the stakes demand it.
- NAVIGATION: when your future self might need exact original text, provide
  read instructions rather than reproducing it.

Your future self is you — equally capable of reasoning. Give yourself the
facts and the pointers; don't pre-digest conclusions your future self could
reach on their own. But when a conclusion is obvious and saves significant
reasoning effort, include it — just label it."
```

Key design shifts in this proposed approach:

1. **Don't ban reasoning — label it.** "[My reading: ...]" vs raw facts. The outer self can distinguish observation from inference and choose whether to trust or verify. This preserves identity while solving the epistemic-asymmetry problem.

2. **Respect the outer self's autonomy without denying the inner self's capability.** The principle becomes: "your future self is equally smart — give facts preferentially, but don't withhold useful inferences; just be transparent." This is how a person actually takes notes for themselves: they write down what they observed AND what they think it means, but they know which is which.

3. **The boundary becomes epistemic transparency, not cognitive restriction.** The inner self's problem was never "thinking too much" — it was that its conclusions arrived in the outer self's context disguised as facts. Labeling solves this without breaking the identity claim.

4. **It creates a natural ablation axis for the paper.** Three conditions: (a) no reasoning (current V4), (b) labeled reasoning (proposed), (c) unrestricted reasoning (no guardrails). This directly tests whether the identity assumption extends to delegated inference.

Whether this proposed redesign actually works better is an empirical question — and an excellent ablation for the paper to run. The current V4 constraints are conservative and demonstrably safe. The proposed alternative is more identity-consistent but adds complexity (the model must reliably label inferences). Both approaches are defensible; the choice between them is itself a contribution to understanding the limits of the identity assumption.

**Case study: The `promptSnippet` incident — when ALL framings fail equally**

A real debugging session reveals a case that complicates the entire over-identification debate:

> The user asked: "Why doesn't the system prompt mention the recall_impression tool?"
> The distiller received two pieces of evidence: (1) `config.json` showing `extensions: []`, and (2) the full content of `impression-system.ts`.
> The distiller concluded: "Obviously — extensions is empty in config, so the plugin isn't loading. The file itself is fine." It compressed away the file content and stated this conclusion as its note.
> This was wrong. The plugin was actually loaded via symlink to `.pi/extensions/`, not through the config array. The real problem was a missing `promptSnippet` field inside `impression-system.ts`.
> The premature conclusion effectively terminated the investigation — the outer self accepted the diagnosis and moved on.

At first glance, this looks like a textbook argument for the V4 "ban reasoning" guardrail: the distiller drew a wrong conclusion that foreclosed further investigation.

But here is the critical complication: **would the outer self have done any better with the full text?**

Almost certainly not. At that point in the session, neither the inner nor the outer self knew that `promptSnippet` was a relevant API field. Given the same evidence — `extensions: []` alongside a seemingly complete plugin file — the outer self would have drawn the exact same conclusion. The distiller's error came from shared ignorance, not from a distillation-specific failure.

This means:
- **V4 (ban reasoning)**: The distiller passes through the facts without concluding. The outer self reads the same evidence, concludes the same wrong thing. Same outcome, one step later.
- **Labeled reasoning (proposed)**: The distiller writes `[My reading: the issue is extensions: [], the file is fine]`. The outer self sees the label, agrees with the reasoning, moves on. Same outcome.
- **Unrestricted reasoning**: The distiller states the conclusion confidently. Same outcome.

All three approaches fail identically. The error is pre-distillation — it's a gap in the model's knowledge, not in the compression mechanism. No amount of guardrailing or labeling changes the outcome when the mistake comes from what the agent doesn't know rather than what the distiller mishandles.

**What this case actually reveals**: The real failure mode isn't "the distiller reasoned when it shouldn't have" — it's that **a conclusion, whether drawn by inner or outer self, can prematurely close an investigation.** The compression made this slightly worse by removing the raw evidence that might have been revisited later if the first hypothesis failed. But the same premature-closure error would have occurred without compression.

This suggests a different design response than guardrailing the distiller:
- **On the distiller side**: When the conclusion is a diagnosis (especially "the problem is X, not Y"), always preserve enough raw material for the outer self to revisit if the diagnosis fails. The inner self should think: "If I'm wrong about this, what would my future self need to re-investigate?" This is not about banning reasoning — it's about hedging conclusions.
- **On the acting side**: When an impressed diagnosis leads to a dead end, the outer self should be prompted to question the impression's conclusion and recall the original for re-examination. Currently, the acting prompt says "trust these notes" — it could add: "If my diagnosis from these notes leads nowhere, I should recall and re-examine the original evidence."

**Paper recommendation**: Include this case study (anonymized/generalized) in the Discussion. It demonstrates that:
1. The over-identification debate (ban vs. label vs. unrestrict) may be less important than it appears — all three fail when the error is in shared knowledge
2. The more important design question is: **how does the system recover when a compressed conclusion turns out to be wrong?** This connects back to the recall mechanism — and suggests that recall should be triggered not just by "I need more detail" but by "my current hypothesis isn't working"
3. The residual gap between inner and outer isn't just about reasoning authority — it's about **evidence preservation for hypothesis revision**

### Insight 3: The Two Prompts Co-Evolved to Enforce Mutual Obligations

The distillation prompt says: "Your outer self should be able to continue working without needing to recall." The acting prompt says: "I trust these notes completely... I MUST NOT call recall_impression just to verify."

These are mutual obligations:
- **Inner to Outer**: "I will give you everything you need so you don't have to recall."
- **Outer to Inner**: "I will trust what you gave me and not second-guess it."

This reciprocal trust contract is the essence of what the paper calls "inner identity." But the paper never describes it as a BILATERAL agreement — it only describes the distillation side. The acting-side prompt is equally important and equally carefully designed.

**Paper recommendation**: Present both sides of the prompt in the method section. Show how they create a closed loop of trust: inner anticipates outer's needs -> outer trusts inner's output -> reduced recall -> better compression ROI.

### Insight 4: Recall Policy Evolved from "If Needed" to a Graduated Strategy

- V1: "If you need exact values... call recall_impression" (binary: use notes or recall)
- V2: "MUST NOT recall just to verify... should NOT hesitate when precise info needed" (selective recall)
- V3: "Use read instructions first... ONLY recall when notes lack info" (graduated: notes -> targeted re-read -> recall)

This progression shows recall becoming increasingly nuanced — from a simple fallback to a multi-tier retrieval strategy. The current design has THREE tiers:
1. Use the notes directly (default)
2. Follow the inner self's read instructions for targeted re-access
3. Full recall only when notes are genuinely insufficient

**Paper recommendation**: Present this graduated recall strategy explicitly. It's more sophisticated than the "binary recall" described in Section 4.4, and it emerged from practical iteration.

### Insight 5: The Threshold Changed from 800 -> 2048 and maxRecall from 2 -> 1

- V1: `MIN_LENGTH = 800`, `MAX_RECALL = 2`
- V2+: `MIN_LENGTH = 2048`, `MAX_RECALL = 1`

The threshold doubled and recall cap halved. This suggests the system became MORE aggressive about compressing (higher threshold means only longer content gets compressed, but when it does, it compresses more aggressively) and MORE confident in its compressions (1 recall instead of 2 before passthrough).

**Paper recommendation**: These numbers tell a story about growing confidence in the identity-coupling mechanism. As prompts improved, less recall was needed. Report these changes as evidence of prompt-quality -> compression-confidence correlation.

### Insight 6: The `<thinking>` Tag Is a Private Inner Monologue

V3 introduced `<thinking>` tags — stripped from the final impression but used for reasoning. This gives the inner self a private space to reason about what the outer self needs WITHOUT polluting the final notes. This is architecturally interesting: it's a form of chain-of-thought reasoning that improves compression quality but doesn't cost context space.

**Paper recommendation**: Discuss `<thinking>` as a design feature, not an implementation detail. It's the inner self's private reasoning about the outer self's needs — a meta-cognitive layer that improves compression without inflating the compressed output.

### Summary of Evolution Arc

| Phase | Commits | Distillation Framing | Acting Framing | Key Change |
|-------|---------|---------------------|----------------|-----------|
| **Observer** | V1-V2 (Mar 27-28) | "Replaying agent state" | Neutral XML wrapper with disclaimer | Conventional summarization with context |
| **Identity** | V3 (Mar 29) | "You ARE the same agent — same identity, same mind" | "MY INTERNAL MEMORY — I trust these notes" | Phase transition to self-compression |
| **Guardrails** | V4 (Mar 29) | + "NEVER synthesize... ONLY ground in tool_result" | Same | Fix over-identification (see open question) |
| **Refinement** | V5 (Mar 30) | + Content-length awareness, refined passthrough | + Graduated recall (notes -> re-read -> recall) | Maturation of the identity mechanism |
| **Epistemic Humility** | V6 (Mar 31, refactored) | + Task-type passthrough detection | + Temporal trust qualifier + manual `set_impression_mode` tool | Conclusions acknowledged as revisable; outer self gains override agency |

This evolution — from detached observer to identified self, with subsequent guardrailing, and then a partial relaxation of absolutism toward epistemic humility — is itself a contribution worth documenting.

---

## V6 Analysis: The Refactored Version (Mar 31, `my-plugins/impression/`)

The system was refactored into a proper modular package with separated prompt templates. Two prompt changes and one new tool are the significant design moves:

### Change 1 (Distillation): Task-Type Passthrough Detection

New line in `distiller-system.txt`:
```
If visible history shows the outer self is doing line-by-line comparison, diff, code review,
or any task that requires exact textual fidelity across multiple files: return <passthrough/>.
Semantic summaries destroy the precision these tasks depend on.
```

**Analysis**: This is excellent — it's the inner self using its identity-awareness (knowing what the outer self is doing) to make a CORRECT decision to NOT compress. Previous versions relied on content-length heuristics; this version adds task-type awareness. The inner self recognizes: "my outer self is doing a diff, and a semantic summary would destroy the exactness it needs."

This is a strong example of identity coupling working properly: the inner self's knowledge of the outer self's intent leads to better compression decisions. It's not about what the content IS, but about what the outer self NEEDS FROM the content.

**Paper implication**: This is evidence for the causal non-degradation argument (I2). The inner self's goal-directed awareness doesn't just preserve relevant information — it can also recognize when NO compression is the right answer. This is a form of meta-cognition: "I know enough about my future self's task to know that compression would harm it."

### Change 2 (Acting-side): Temporal Trust Qualifier

New line in `impression-text.txt`:
```
The conclusions made within my notes might become less reliable when new evidence are found
and I should not hesitate to use `recall_impression` in the future when more information is needed.
```

**Analysis**: This is a direct response to the `promptSnippet` incident and the over-identification discussion. It addresses the problem without abandoning identity:

- The old prompt said: "I trust these notes completely" (absolute trust)
- The new prompt adds: "...but conclusions might become less reliable when new evidence arrives" (temporal qualifier)

This is epistemically sound. It's not "don't trust yourself" — it's "trust yourself NOW, but remain open to revision." This is exactly how a rational agent handles its own prior beliefs: confidence is default, but it's defeasible in the face of new evidence.

**Evaluation of the balance**: The wording is careful. It doesn't say "my notes might be wrong" (which would undermine trust and increase unnecessary recall). It says "conclusions might become less reliable when new evidence are found" — specifically targeting the failure mode where a compressed diagnosis prematurely closes an investigation. The trigger for re-examination is "new evidence," not "general uncertainty."

**One suggestion**: The current phrasing could be slightly tightened. "Less reliable" is vague. Consider:

```
- If new evidence contradicts or complicates what my notes concluded, I should
  recall the original to re-examine rather than defending my earlier interpretation.
```

This makes the trigger more specific ("contradicts or complicates") and the action more concrete ("recall to re-examine rather than defending"). But the current version is already a significant improvement.

### Change 3: `set_impression_mode` Tool — Manual Override

A new tool that lets the outer self explicitly switch to passthrough mode for N tool results:

```typescript
pi.registerTool({
    name: "set_impression_mode",
    description: "Temporarily skip distillation. Call with { mode: 'passthrough', count: N }
                  before reads that need exact original content (e.g., line-by-line diff, code review).",
    promptSnippet: "set_impression_mode: Temporarily skip distillation..."
});
```

**Analysis**: This is architecturally significant. It gives the outer self explicit AGENCY over the compression mechanism. Previously, the outer self could only react (recall after compression). Now it can pre-empt (disable compression before it happens).

This solves the distiller-system.txt line 18 problem from the other side. Line 18 tries to make the inner self detect when passthrough is needed. `set_impression_mode` lets the outer self decide directly. Together, they create a two-sided safety net:
- Inner self detects task-type and passthroughs proactively (line 18)
- Outer self can override when the inner self fails to detect (set_impression_mode)

**Paper implication**: This is the first mechanism in the system where the outer self can INSTRUCT the inner self (indirectly, by disabling compression). Previously the relationship was: inner compresses -> outer trusts. Now the outer self has a control channel back. This makes the system more symmetric and the identity relationship more bidirectional.

**Potential issue**: The `promptSnippet` feature means this tool's description appears in the system prompt. This is good (the outer self knows it exists), but it's also context budget overhead. Worth tracking whether this tool is actually used frequently enough to justify the prompt space.

### Overall V6 Assessment

| Aspect | Rating | Notes |
|--------|--------|-------|
| **Identity consistency** | Improved | Temporal trust qualifier is more honest than absolute trust |
| **Failure mode coverage** | Significantly improved | Task-type detection + manual override + temporal revisability |
| **Architectural maturity** | Major step | Modular code, template prompts, token tracking, separated concerns |
| **Remaining gap** | Still present | The "NEVER synthesize" guardrail (line 4) still fully bans reasoning; the temporal trust qualifier on the acting side partially contradicts this by acknowledging conclusions exist in notes |

The most interesting tension remaining: `distiller-system.txt` line 4 says "NEVER synthesize conclusions by combining tool output with conversation history," but `impression-text.txt` line 13 says "The conclusions made within my notes might become less reliable..." — acknowledging that conclusions DO exist in the notes. If the ban were fully enforced, there would be no conclusions to become unreliable. This suggests the ban is aspirational rather than absolute — the model sometimes synthesizes despite the instruction, and the acting-side prompt is pragmatically prepared for that.

**This tension itself is interesting for the paper**: it shows that the guardrail is not a hard boundary but a soft bias. The system works in practice because both prompts are designed to be resilient: the inner self TRIES not to over-conclude, and the outer self REMAINS open to revision if it did. This is a more realistic and robust design than either extreme (hard ban or no ban).
