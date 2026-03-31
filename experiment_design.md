# Impression 有效性实验设计

> 从顶会 reviewer 会怎么攻击出发，逆向设计实验。

---

## 核心问题：Reviewer 会问什么？

1. **"这不就是 summarization 吗？和现有的 context compression 方法（LLMLingua、MemGPT）比有什么区别？"**
2. **"identity coupling 到底贡献了多少？还是说任何 summarization 都行？"**
3. **"你的 compression 会不会丢关键信息，导致下游任务变差？"**
4. **"只有一个 case study，N=1，这能说明什么？"**
5. **"额外的 distillation call 的成本值得吗？"**
6. **"recall 机制真的有用吗？还是你的 compression 足够好根本不需要 recall？"**
7. **"不同模型上效果一样吗？弱模型能做好 distiller 吗？"**

---

## 实验设计

### 实验 1：End-to-End Task Performance（回应质疑 3、4）

**目标**：证明 impression 在真实任务上不降低甚至提升成功率。

**任务选择**（3 个 domain，各 30-50 个 instance）：

| Domain | Benchmark | 为什么选 |
|--------|-----------|----------|
| 代码修复 | SWE-bench Lite（300 个 subset 抽 50） | Agent coding 是主要应用场景，tool result 大量长文件读取 |
| 信息检索 | 自建：给 agent 10 个长文档（每个 5k-20k token），问需要跨文档推理的问题 | 测试 impression 在纯信息密集场景的保真度 |
| 多步骤 Web 操作 | WebArena 子集（30 个） | tool result 含大量 HTML boilerplate，impression 理论优势最大 |

**Conditions**（5 个，within-subject）：

| ID | Condition | 说明 |
|----|-----------|------|
| C0 | No compression | 原始 tool result 直接进 context（baseline） |
| C1 | Truncation | 保留前 N tokens 使总 context 与 C4 匹配（token-budget matched） |
| C2 | External summarizer | 用 **不同的、更小的模型**（如 GPT-4o-mini）做 summarization，**无 identity framing** |
| C3 | Same-model, no identity | 用同一模型做 summarization，但 system prompt 是第三方观察者口吻（"Summarize this tool output"） |
| C4 | Impression（完整版） | 当前系统，identity framing + relevance filter + grounding rules |

**关键设计点**：
- C1 做 **token-budget matching**——这是 reviewer 最容易抓的漏洞。C1 的截断长度设为和 C4 的 impression 输出等长，这样 C1 vs C4 是纯粹的"同等 budget 下谁保留的信息更有用"
- C2 vs C3 vs C4 隔离了两个变量：模型差异（C2 vs C3）和 identity framing（C3 vs C4）

**Metrics**：
- 任务成功率（主指标）
- Token 总消耗（含 distillation overhead）
- 任务完成时间（wall-clock）
- Recall 调用次数（仅 C4）

---

### 实验 2：Identity Coupling Ablation（回应质疑 1、2）

**目标**：证明 identity framing 不是噱头，是因果性地影响压缩质量。

**这是最关键的实验。** Reviewer 如果只能看一个实验，应该看这个。

**设计**：收集 100 个真实的 (tool_result, visible_history, system_prompt) 三元组。对每个三元组，用 5 种 distiller prompt 做压缩：

| ID | Distiller Prompt | 关键差异 |
|----|------------------|----------|
| D1 | "Summarize this text" | 零 context，纯 summarization |
| D2 | "Summarize this tool output. The user's task is: {task_summary}" | 有 task context，无 identity |
| D3 | 当前 third-person prompt（无 identity，有 visible history + relevance filter） | 有完整 context，无 identity |
| D4 | 当前 first-person prompt（"You ARE the same agent"） | 完整 impression |
| D5 | D4 + 去掉 grounding rules | 测试 grounding rules 的独立贡献 |

**评估方法**（人工 + 自动混合）：
1. **Information retention scoring**：两个标注员独立标注原始 tool result 中的"关键信息单元"（每个 instance 约 5-15 个），然后检查每个 compression 保留了多少。计算 Retention@critical 和 Retention@semantic
2. **Downstream proxy**：把每个 compression 喂给一个 fresh agent，问它一个需要用到 tool result 信息的问题。正确率 = 间接衡量信息保真度
3. **Contamination rate**：人工检查 compression 中有多少句是"编造"的（不能 ground 到原始 tool result）。这直接回应"会不会引入幻觉"

**统计**：Paired comparison（每个 instance 是自己的 control），Wilcoxon signed-rank test，Bonferroni 校正。

---

### 实验 3：Recall Sensitivity Analysis（回应质疑 6）

**目标**：量化 recall 机制的实际价值和触发行为。

**设计**：在实验 1 的 C4 condition 上做进一步分析：

1. **Recall frequency by task phase**：把每个任务分成 early/mid/late phase，统计各 phase 的 recall 频率。假设：后期（关注点漂移后）recall 更频繁
2. **Recall necessity test**：对每个实际发生的 recall，创建一个 counterfactual：如果 agent 没有 recall 而是继续用旧 note，任务结果会变吗？方法：在 recall 点 fork 执行，一条路 recall，一条路不 recall，比较最终结果
3. **Over-recall ablation**：移除 anti-over-recall 指令（"Do not call recall_impression just to verify"），测量 recall 频率是否暴增、token 消耗是否上升、任务成功率是否变化

---

### 实验 4：Cross-Model Robustness（回应质疑 7）

**目标**：impression 不是某个模型的 trick，是通用的。

**设计**：

| Outer Agent Model | Distiller Model | 组合 |
|-------------------|-----------------|------|
| Claude 3.5 Sonnet | Same (Sonnet) | Identity match |
| Claude 3.5 Sonnet | GPT-4o-mini | Cross-model distiller |
| GPT-4o | Same (4o) | Identity match |
| GPT-4o | Claude Haiku | Cross-model distiller |
| Gemini 2.5 Pro | Same (Pro) | Identity match |
| Gemini 2.5 Pro | GPT-4o-mini | Cross-model distiller |

在实验 1 的代码修复 subset（20 个 instance）上跑所有 6 个组合。

**核心假设**：same-model distiller 始终优于 cross-model，因为 identity framing 在同一模型时更 "真实"。如果 cross-model 也表现不错，那说明 identity framing 的价值在于 **prompt 设计** 而非模型匹配——这也是一个有趣的发现。

---

### 实验 5：Efficiency Frontier（回应质疑 5）

**目标**：展示 impression 的 token 经济学。

**不是独立实验**，而是从实验 1 的数据中提取：

- **Net token delta**：每个 instance 的 `(distillation_tokens + compressed_context_tokens) - original_context_tokens`。画 distribution plot
- **Amortization curve**：context 长度 vs. net savings。找到 break-even point（几轮对话后 impression 开始净省 token）
- **Latency overhead**：distillation call 的 wall-clock 时间（可以和 agent 的思考时间并行吗？如果可以，实际 latency overhead 接近零）
- **Per-tool-type breakdown**：哪类 tool result（文件读取 vs. 搜索 vs. 执行结果）的压缩收益最大

---

## 面对质疑的防线

| 质疑 | 哪个实验回应 | 如果结果不支持怎么办 |
|------|-------------|---------------------|
| "就是 summarization" | 实验 2（D1-D5 梯度清楚地展示 identity 的增量贡献） | 如果 D1≈D4，那确实就是 summarization，但这本身也是有价值的 negative result |
| "会丢信息" | 实验 1 成功率 + 实验 2 retention scoring | 如果成功率下降，报告 non-inferiority margin |
| "N=1" | 实验 1 的 110-130 个 instances × 5 conditions | — |
| "成本不值得" | 实验 5 | 如果 break-even 要 50+ 轮才到，那对短对话确实不值得，但这是 honest reporting |
| "recall 没用" | 实验 3 | 如果 recall 几乎不触发，那说明 compression 本身足够好——这是好消息 |
| "只在某个模型上 work" | 实验 4 | 如果 cross-model 全面崩塌，那 scope claim 缩小到 same-model setting |

---

## 优先级

如果资源有限，**只做实验 1 和实验 2**。实验 2 是学术贡献的核心（identity coupling 的因果证据），实验 1 是 reviewer 的基本信任门槛（end-to-end 不降性能）。实验 3-5 是加分项。
