# Impression: Identity-Preserving Context Distillation for Agentic LLM Systems

**Anonymous Authors**

## Abstract

Agentic LLM workflows consume large context windows because tool outputs are often verbose, transiently useful, and then rarely revisited. We propose **Impression**, a plug-in memory distillation mechanism that preserves task-relevant information while dramatically reducing context occupancy. The core idea is **identity-preserving self-distillation**: the model that later acts is the same model that first reads and compresses the tool output, under prompts that explicitly enforce continuity of intent and reasoning identity.

Impression intercepts tool results, distills them into compact actionable memory notes, stores full originals for optional recall, and exposes a controlled recall interface only when necessary. In one illustrative coding-session case study, Impression compresses tool-result payload from 86,689 to 4,341 chars (approximately 95% compression on raw tool text), reducing estimated end-to-end context occupancy from 106,156 to 23,808 chars (approximately 78% reduction), with no obvious failure observed in that run.

We present an operational definition of identity-preserving memory compression, implementation details in an open-source agent framework, and a benchmark plan spanning coding, document-heavy, and web-reading workloads. We hypothesize that Impression is most beneficial when raw inputs contain high structural redundancy (e.g., web pages), and less impactful for short pure-writing tasks. The method requires no model-specific fine-tuning and is portable across providers when distillation and acting share the same model identity.

## 1. Introduction

Modern LLM agents solve tasks through repeated tool use: file reads, shell outputs, search results, logs, and web content. This creates a mismatch between **what the model once needed to read** and **what it still needs to carry in context**. In practice, most tool output is consumed once, partially internalized, and then left idle while still occupying expensive context budget.

Humans do not memorize every line before acting. We read, retain an impression aligned with our intent, and continue. This motivates a question: can an LLM agent do the same while preserving reliability?

[footnote: We use this human analogy only as intuition; our claims are empirical and specific to agent-loop behavior.]

We present **Impression**, a memory distillation layer for agentic systems. Instead of retaining full raw tool output, the system asks the same acting model to generate an internal memory note optimized for immediate downstream action. The original output is archived and recoverable via explicit recall, but not carried by default.

The central hypothesis is that **subject identity continuity** improves compression usefulness and stability:

1. The distiller and the downstream actor are the same model identity.
2. Distillation prompts encode future-task intent and forbid generic detached summarization.
3. Recall is an exception path, not a default path.

### Contributions

1. We introduce identity-preserving self-distillation for inference-time memory management in agent loops.
2. We release and analyze a practical plug-in implementation in an open agent framework.
3. We provide a first real-session case study showing large context savings.
4. We outline a benchmark-oriented evaluation protocol covering task success, faithfulness, recall pressure, and efficiency.

## 2. Positioning and Scope

This work addresses **inference-time context management**, not parameter-level catastrophic forgetting in continual learning. We therefore position Impression under **agent memory and context allocation**, adjacent to summarization, retrieval memory, and prompt compression.

The framing is related to bounded-memory consolidation and utility-conditioned retention at inference time: the agent should preserve decision-relevant information while dropping low-utility observation mass.

A key distinction from generic summarization is operational identity:

- Generic summarization: an external narrator compresses for a future consumer.
- Impression: the same acting subject compresses for itself under explicit continuity constraints.

This distinction matters when compression must remain action-ready for subsequent tool decisions.

We treat identity as an operational design assumption and testable systems hypothesis, so the paper's claims remain empirical and reproducible.

## 3. Related Work (Draft)

### 3.1 Prompt and context compression

Prior work compresses prompts by token pruning, salience filtering, or learned compression modules (e.g., prompt compression and token-level filtering methods).

### 3.2 Long-context and recurrent memory for LLMs

Approaches including retrieval-augmented memory and recurrent memory buffers maintain external stores and selectively re-inject relevant context.

### 3.3 Agent frameworks and tool-use loops

Recent agent systems expose explicit tool trajectories where context growth is dominated by observations rather than plans.

### 3.4 Distinctive point of this paper

Impression is orthogonal to most prior methods: no model fine-tuning, no new retriever requirement, and no mandatory extra model. It inserts a lightweight self-distillation stage at the observation boundary.

> TODO in final version: add concrete citations and bib entries for LLMLingua-style compression, MemGPT-style memory, and long-context baselines.

## 4. Method

### 4.1 Problem setup

At step $t$, an agent receives tool output $o_t$ and maintains context state $C_t$. Naively:

$$
C_{t+1} = C_t \cup o_t
$$

Impression introduces a gating function $g(o_t) \in \{0,1\}$, a distillation operator $D_\theta$, archive $A$, and recall state $R$.

If $g(o_t)=0$ (below threshold or skipped tool), no distillation occurs:

$$
C_{t+1} = C_t \cup o_t
$$

If $g(o_t)=1$, we create memory note $m_t$ and archive raw content:

$$
m_t = D_\theta(o_t, C_t, s),\; A[id_t] \leftarrow o_t,\; R[id_t] \leftarrow 0,\; C_{t+1} = C_t \cup m_t
$$

where $s$ is the original system intent and $R[id]$ is recall count for item $id$.

### 4.2 Identity-preserving self-distillation

We define identity in two operational layers.

1. **Outer identity**: distillation and downstream acting use the same provider, model ID, and system-level task specification.
2. **Inner identity**: distillation-side and acting-side prompts mutually enforce continuity, i.e., the note is treated as the actor's own memory rather than an external summary.

Distillation prompts enforce:

1. continuity of self (same subject before/after compression),
2. actionability (notes should directly support next decisions),
3. anti-over-recall behavior (recall only when needed).

Acting-side prompts complement this by requiring trust in impression notes unless a concrete information gap is detected. The dual-task tension is explicit: note-taking and action execution are different modes, so prompt coupling is used to reduce identity fragmentation across these modes.

Our central hypothesis is falsifiable: holding token budget fixed, stronger inner/outer identity coupling should improve downstream utility relative to detached summarization.

In practice, this coupling is a design problem rather than a one-shot prompt tweak. Naive or weakly coupled prompts tend to produce either generic summaries (good compression, poor actionability) or over-detailed notes (good fidelity, poor compression). We therefore design the two prompt roles to align: the inner role writes for the outer role's next decisions, and the outer role trusts inner notes unless concrete gaps are detected. Some gap remains because compression and action are different tasks; we treat this as an inherent limitation and an ablation target.

### 4.3 System pipeline

1. Intercept tool result and compute gate $g(o_t)$.
2. If $g(o_t)=1$, distill with same model identity and create impression note; else keep raw output.
3. For distilled items, store raw payload in local archive and initialize recall state.
4. Expose `recall_impression(id)` tool for on-demand fallback.
5. Log per-tool compression, recall, and cost signals for audit.

### 4.4 Recall policy and state machine

Recall behavior is deterministic and per-ID.

1. `state=distilled`, `R[id]=k < K`: recall returns re-distilled note and increments `R[id]`.
2. `state=distilled`, `R[id]=K`: recall returns raw archived payload (passthrough) and marks `state=passthrough`.
3. `state=passthrough`: subsequent recalls return raw payload directly.
4. If `id` is not archived (e.g., below-threshold item), recall is unavailable for that item.

This policy bounds repeated lossy cycles and makes boundary conditions explicit.

Recall triggers are policy-driven: recall should be invoked when the agent detects uncertainty, exact-span requirements (e.g., code edits/citations), or inconsistency between note content and current tool needs.

### 4.5 Why degradation can be bounded (informal, testable argument)

The key causal argument is goal-conditioned encoding: at compression time, the model has already read observations while pursuing a concrete downstream task. Its internal encoding is therefore biased toward action-relevant content before summarization is produced. Impression attempts to preserve this useful bias by keeping distiller and actor identity aligned.

This yields a practical risk model: **lossy fast path + lossless fallback**. However, bounded degradation requires two conditions, not one:

1. raw-content fallback must exist for distilled items, and
2. the agent must detect when impression information is insufficient and trigger recall.

If insufficiency is not detected, fallback availability alone does not prevent failure. We therefore treat recall sensitivity as a first-class evaluation target.

## 5. Implementation

We implement Impression as a plug-in in the open-source pi-mono framework. The implementation:

1. hooks tool-result events,
2. computes length-based trigger,
3. calls same provider/model for distillation,
4. records archive entries with metadata,
5. renders impression notes in place,
6. provides recall tool and usage counters.

The design requires no model-specific retraining and is portable across providers, provided distillation and acting share the same model identity.

## 6. Experiments

## 6.1 Research questions

1. How much context/cost reduction is achieved?
2. Does task success degrade under compression?
3. When does recall become necessary?
4. Which workload types benefit most?

## 6.2 Motivating single-run case study (current)

Observed run (coding migration check task):

- Final total context occupancy: 23,808 chars
- System prompt occupancy: approximately 10k chars
- Distilled impression occupancy: 4,341 chars
- Raw original tool payload: 86,689 chars
- Estimated no-Impression occupancy: 106,156 chars
- Estimated occupancy reduction: approximately 78%
- Raw tool payload compression ratio: approximately 95%
- Recall calls: 0 in this run

Interpretation: this run is a motivating case study showing strong efficiency gains. It is not yet sufficient to claim general non-degradation.

## 6.3 Planned benchmark suite (multiple design options)

### Plan A: Coding-agent benchmark (recommended first)

Goal: evaluate practical coding reliability under memory compression.

Candidate tasks:

1. SWE-bench Lite or SWE-bench Verified subset (issue-fix tasks).
2. Repo-level editing tasks with long read/search traces.
3. Migration/refactor tasks that require cross-file consistency.

Metrics:

1. task success rate,
2. patch correctness / test pass rate,
3. total input tokens or chars,
4. latency and model calls,
5. recall frequency and recall success.

All baselines use matched compression budgets (or report full performance-vs-length Pareto frontiers).

Baselines:

1. No compression.
2. Truncation heuristic.
3. External summarizer model (different model identity).
4. Same-model summarization without identity prompt coupling (same input context, same max output budget, same recall API; only identity-coupling language differs).
5. Impression (ours).

### Plan B: Web-reading heavy benchmark (expected strongest gains)

Goal: test high-noise observations with layout/boilerplate redundancy.

Candidate tasks:

1. WebArena-style browsing tasks,
2. scripted web QA from documentation/news pages,
3. extraction tasks requiring precise fact retention across multiple pages.

Metrics:

1. end-task success,
2. faithfulness of extracted facts,
3. compression ratio,
4. hallucination and omission rates,
5. recall-trigger rate.

Baselines: same five baselines as Plan A with matched budgets.

Hypothesis: web tasks yield larger savings than coding due to higher irrelevant-token density.

To directly test the web-noise hypothesis, include raw-page versus cleaned-content controls and stratify results by measured boilerplate density.

### Plan C: Long-document analysis benchmark

Goal: isolate memory compression quality independent of code execution.

Candidate tasks:

1. long technical reports,
2. multi-file API docs,
3. policy/legal style documents requiring citation-grounded answers.

Metrics:

1. exact-span support rate,
2. answer correctness with citation check,
3. recall need per question,
4. compression-efficiency frontier.

Baselines: same five baselines as Plan A with matched budgets.

### Plan D: Stress and ablation benchmark

Ablations:

1. remove identity wording in distillation prompts,
2. use different model for distillation vs acting,
3. vary min-length threshold,
4. vary max-recall-before-passthrough,
5. disable anti-over-recall instructions.

All ablations are length-matched against Impression notes to isolate identity effects from token-budget effects.

Goal: quantify the specific value of inner/outer identity coupling.

## 6.4 Information-retention evaluation protocol

For each task episode, annotate required information units using a written annotation handbook:

1. critical exact units (must be exact, e.g., API signature, line edits),
2. semantic units (approximate paraphrase acceptable),
3. irrelevant units.

Annotation protocol:

1. two independent annotators per episode on a blinded variant label,
2. adjudication by a third annotator on disagreements,
3. report inter-annotator agreement on a subset.

Then measure:

$$
\\text{Retention@critical},\; \\text{Retention@semantic},\; \\text{NoiseDrop}
$$

with

$$
\\text{Retention@critical}=\frac{\#\\text{critical units preserved}}{\#\\text{critical units required}},\quad
\\text{Retention@semantic}=\frac{\#\\text{semantic units preserved}}{\#\\text{semantic units required}},
$$

$$
\\text{NoiseDrop}=1-\frac{\#\\text{irrelevant units retained}}{\#\\text{irrelevant units observed}}.
$$

This directly tests whether compression keeps what matters and drops what does not.

## 6.5 Statistical plan

1. report mean and 95% confidence intervals,
2. use paired tests per seed and mixed-effects models for task success,
3. define task-specific one-sided non-inferiority margins for quality metrics,
4. apply multiplicity control for multi-metric comparisons,
5. stratify by workload type, tool type, and observation-length quantiles.

## 6.6 Efficiency accounting

We report full amortized efficiency, not only context occupancy:

1. distillation-call and recall-call counts,
2. distillation input/output tokens,
3. net token delta versus baselines,
4. latency distribution and tail overhead,
5. per-tool breakdown (`read`, `edit`, `bash`, `search`, web tools).

## 7. Recommended NeurIPS Submission Strategy

### 7.1 Track and contribution-type recommendation

Primary recommendation:

1. **Main Track** with topic alignment to **Language/LLM Agents + SysML Infrastructure**.
2. Contribution type: **General** (safer and broad), with practical framing that can still include use-inspired evidence.

Reasoning:

- The idea is simple but the empirical systems impact is strong.
- The method is not only a narrow vertical application; it proposes a reusable mechanism for agent loops.
- Concept & Feasibility can be used, but often expects high-risk/high-reward framing and may raise bar for speculative novelty claims.

### 7.2 Claim discipline for reviewers

Use restrained claims:

1. do not claim universal no-degradation,
2. claim bounded-risk via recall fallback,
3. claim strongest gains where observation noise is high,
4. clearly separate measured results from hypotheses.

## 8. Discussion

### 8.1 When Impression helps most

1. large tool outputs with high redundancy,
2. multi-step tasks with many intermediate observations,
3. workflows where context pressure degrades planning quality.

### 8.2 When gains are limited

1. short pure writing tasks with minimal tool output,
2. tasks needing exact raw tokens repeatedly,
3. settings with strict zero-latency constraints where distillation overhead dominates.

### 8.3 Failure modes

1. over-compression of rare but critical details,
2. failure to detect insufficiency, causing under-recall,
3. domain-specific jargon loss if prompts are too generic.

### 8.4 Mitigations

1. conservative recall policy for edit operations,
2. explicit recall-trigger rules (uncertainty, exact-span requirements, tool-specific triggers),
3. operation-specific compression profiles by tool type.

## 9. Ethics, Transparency, and Reproducibility

1. no human-subject data in core experiments unless later added,
2. release implementation and config for replication,
3. disclose compute and model-provider differences,
4. discuss risks of hidden omission from compression and safeguards via recall.

## 10. Conclusion

Impression introduces a simple but effective principle for agent memory management: the acting model should leave itself an identity-consistent impression rather than carry full raw observations indefinitely. A motivating case study suggests large context savings, while broader claims remain contingent on planned controlled benchmarks. Future large-scale experiments will test generality across coding, document, and web workloads, and clarify when identity-preserving compression delivers the greatest advantage.

---

## Appendix A. Draft Figure and Table Plan

Figure 1: Impression pipeline (intercept -> distill -> replace -> recall).

Figure 2: Token/context occupancy over time with and without Impression.

Table 1: Main efficiency-quality tradeoff across baselines.

Table 2: Ablation on identity coupling and recall policy.

Table 3: Breakdown by workload type (coding/doc/web).

## Appendix B. Camera-ready checklist placeholders

1. Reproducibility assets status: TODO
2. Compute reporting: TODO
3. Limitations statement: included
4. Broader impact notes: included

## Appendix C. Immediate next experiments (actionable)

1. Re-run the migration-check task on 20 seeds with fixed model/version.
2. Implement external-summarizer baseline with same token budget.
3. Add web-page reading benchmark subset (50 tasks) for high-noise validation.
4. Log recall calls by operation type (`read`, `edit`, `bash`, `search`).
5. Build retention annotation sheet for critical/semantic/irrelevant units.

---

## Appendix D. Design Rationale and Q&A (Author Notes)

This section documents the core conceptual and design decisions that led to the Impression framework, captured in the design phase Q&A.

### D.1 Contribution type and venue positioning

**Q: What is this work most like—Use-Inspired or Concept & Feasibility?**

**A**: Use-Inspired is the right framing. The idea is simple and appears somewhat incremental in isolation, but the empirical impact in real agent loops is substantial, and this kind of small-but-direct-and-effective innovation aligns well with NeurIPS community values. Concept & Feasibility, while possible, raises the bar artificially high and invites speculation about risk rather than impact focus.

### D.2 Novelty positioning

**Q: Where does the novelty lie—the "leaving an impression" framing, system design, or empirical results?**

**A**: The core novelty is the **self-as-compressor** framing and the commitment to subject identity continuity. This is distinct from generic summarization because:

1. The same agent that will later act is the one that reads and compresses.
2. Distillation prompts explicitly enforce continuity of intent and identity.
3. Compression is not "for someone else to use later," but "for my future self to use now."

This touch-point also connects to the broader LLM memory and forgetting literature: we are not claiming parameter-level forgetting improvements, but rather proposing an inference-time identity-aware memory management strategy.

### D.3 Relationship to LLM forgetting/memory literature

**Q: Does this relate to catastrophic forgetting or the forgetting literature?**

**A**: Not directly. Catastrophic forgetting is a parameter-level phenomenon in continual learning. Impression is an inference-time context allocation strategy. However, the philosophical principle is aligned: if a human reads a book without memorizing it word-for-word, and still effectively later uses what they learned, it is because they retained a coherent *impression* aligned with their future intent. Carrying impression instead of full text is a lightweight form of intentional memory curation, operationalized at inference time.

### D.4 Experimental baseline and task characterization

**Q: What was the task in the baseline run?**

**A**: A project-migration integrity-check: validating that the breakdown of a monolithic agentic module (`impression-system.ts`) into a distributed pi-mono plugin was successful and that the refactored system's outputs were strict supersets of the original. The task involved many cross-file reads, comparisons, and search traces—representative of real agentic coding sessions.

### D.5 Model consistency and identity

**Q: Is the model the same for distillation and acting?**

**A**: Yes, strict model identity is a core design requirement. The same model provider and model ID are used for both phases. This is essential to the identity-preservation hypothesis: if compression and acting use different models, the fidelity loss increases and the "same subject" assumption breaks.

### D.6 Recall behavior in practice

**Q: Was recall triggered in the baseline run? Expectations for edit tasks?**

**A**: Recall was not triggered in that particular migration-check run (0 recalls). However, based on earlier session experience, we expect recall to be triggered more frequently in edit-heavy workflows. For instance, when editing code based on precise line ranges or API signatures extracted from earlier reads, the agent may need to re-check exact syntax. This is an important ablation: comparing baseline coding (low recall) with edit-and-fix workflows (expected higher recall).

### D.7 Large-scale experiment design

**Q: What experimental protocols and baselines should we implement?**

**A**: Four complementary plans:

- **Plan A (Coding Agent)**: SWE-bench or repo-level edit tasks. Baselines: no compression, truncation, external summarizer, same-model but identity-agnostic summarization, plus Impression.
  
- **Plan B (Web Reading Heavy)**: WebArena-style navigation or document QA on noisy web pages. Key hypothesis: high boilerplate/layout redundancy should yield largest compression gains.
  
- **Plan C (Document Analysis)**: Long technical documents with fact-grounding requirements. Isolates compression quality independent of code execution.
  
- **Plan D (Ablations)**: Remove identity prompts, use different distillers, vary thresholds, disable anti-over-recall directives.

Evaluation: task success rate, compression ratio, recall frequency, retention of critical/semantic/irrelevant units, latency, cost per task.

### D.8 Baselines and related comparisons

**Q: Should we compare against existing compression methods like LLMLingua?**

**A**: Comparison baselines should include:

1. LLMLingua-style token-pruning (if comparable API available),
2. external document summarization followed by agent action,
3. retrieval-memory methods like MemGPT or similar,
4. and importantly, the **same model with non-identity-aware summarization** to isolate the effect of the identity framing itself.

This isolates the value of identity continuity vs. basic compression.

### D.9 Author and institutional details

**A**: Anonymous submission (standard for NeurIPS double-blind).

### D.10 NeurIPS track recommendation

**Q: Which track and topic area should this target?**

**A**: Main Track, with primary topic alignment to **Language Models and Multimodal Language Models** and secondary alignment to **SysML Infrastructure**. The framing balances an agent-systems perspective (infrastructure-oriented) with an LLM-memory perspective (language-focused), making it a natural fit for the conference's current themes around agentic and interactive AI.

### D.11 Operational identity emphasis

The most important thread uniting Design Rationale D.1 through D.10 is **inner-outer identity consistency**:

1. **Outer identity**: The presentation layer emphasizes the same subject (same model instance identity) compressing and later acting.
2. **Inner identity**: The distillation prompt and recall-control prompts are designed to mutually reinforce continuity and to explicitly discourage generic detached summarization.

This dual emphasis is not merely rhetorical; it directly informs:

- Prompt engineering (distillation system prompt, anti-over-recall instruction),
- technical design (same-model requirement, recall-control policy),
- evaluation criteria (measuring whether recalls are truly necessary, or whether pre-emptive over-recalls reflect prompt failure),
- and baseline comparisons (identity-agnostic summarization as a deliberate ablation).

### D.12 Expected compression frontiers

Based on the baseline data (95% reduction on raw tool text; ~78% on total observed context occupancy):

- **Coding tasks** (moderate noise): expect 70–85% context reduction, low recall rate for pure read tasks, higher for edits.
- **Web-reading tasks** (high noise from layout/boilerplate): expect 80–95% context reduction, moderate recall rate for fact verification.
- **Document QA** (lower but more precise noise): expect 50–75% context reduction, high recall rate if exact citations needed.
- **Pure writing / short tasks** (minimal tool output): expect <30% reduction or no benefit.

