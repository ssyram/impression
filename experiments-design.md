# Impression 实验设计

## 文档目标

本文档针对当前论文草稿（`neurips2026_impression_draft.md`）和精细化审查报告（`neurips2026_impression_draft_finegrained_report.md`）中标记的薄弱点，设计一套可执行的实验，目标是在顶会审稿语境下站得住脚。

报告中的引用编号（C1-C6、H1-H11、M1-M12）均对应同一份审查报告，方便追溯。

---

## 实验设计框架

每个实验一句话说清"打哪个质疑"，然后给出设计细节。

---

## E1  核心消融：身份耦合 vs 单纯同模型摘要
**打靶质疑**：C3（identity 未定义）+ H4（Baseline 4 未操作化）+ H7（identity 假设非假说）

### 目标
证明 Impression 相比"同模型、无身份耦合"的中性摘要有可量化的优势，而这个优势不是来自 token 数量差异，而是来自 prompt 语义设计。

### 实验设置
一共五组，全部使用同一个模型和同一个任务集：

| 组别 | 蒸馏 prompt | 行动 prompt | 模型 |
|------|-------------|-------------|------|
| Baseline-NoComp | — (原始输入全程传递) | 标准 pi 系统 prompt | M |
| Baseline-Generic | 中性第三人称：「请压缩这段内容」 | 标准 pi 系统 prompt | M |
| Baseline-SameModel | 中性第三人称 + 同模型 | 标准 pi 系统 prompt | M |
| Ablation-InnerOnly | Impression 蒸馏 prompt | 标准（无 acting-side 身份锚点） | M |
| **Impression-Full** | Impression 蒸馏 prompt | Impression acting-side prompt | M |

关键约束：
- 所有组的 max 压缩输出 token 数相同，不允许 Impression 通过更长的笔记来「作弊」。
- 全组 recall API 相同（同一套工具，同一套触发条件）。
- Ablation-InnerOnly 和 Impression-Full 的唯一差异就是行动侧 prompt 里有无「这是你自己的记忆」和「非必要不要 recall」的锚定语言。

### 评估指标
1. 任务成功率（task success rate，主指标）
2. 平均每个 episode 的上下文字符数（context chars per episode）
3. recall 次数 / 总工具调用次数（recall rate）
4. 关键信息保留率：Retention@critical（见 E4 的标注协议）

### 预期结果形式
一张五行对比表 + 非劣效性检验（non-inferiority test with pre-specified margin δ）。Impression-Full 必须在 task success 上不劣于 Baseline-NoComp，且在 context chars 上显著低于它。Ablation-InnerOnly 应该低于 Impression-Full，且 Baseline-SameModel 低于 Ablation-InnerOnly，建立一条身份耦合强度的有序梯度。

---

## E2  跨模型身份破坏实验：不同模型蒸馏
**打靶质疑**：H1（"model-agnostic" 与 strict identity 矛盾）+ M6（same-model identity 内部有多种含义）

### 目标
证明"同模型蒸馏"对性能的贡献，并厘清"同模型"到底意味着什么（same weights / same trajectory / same prompt role）。

### 实验设置

| 组别 | 蒸馏模型 | 行动模型 |
|------|----------|----------|
| Same-Strict | claude-opus-4.6 | claude-opus-4.6 |
| Same-Family | claude-haiku-3.5  | claude-opus-4.6 |
| Cross-Provider | gpt-4.1 | claude-opus-4.6 |
| Impression-Full | claude-opus-4.6 | claude-opus-4.6（含身份 prompt）|

所有组使用相同的蒸馏 input context 和行动任务，token budget 也相同。

### 评估指标
同 E1 全套指标，重点看 recall rate（跨模型身份破坏时回溯频率会否升高）和任务成功率。

### 预期
Same-Strict（无 impression prompt）< Impression-Full（有 identity coupling），但 Same-Strict 优于 Cross-Provider，说明即使没有 prompt 加持，模型身份本身也有作用，但不是全部效果来源。

---

## E3  工作负载类型分层：web / coding / doc
**打靶质疑**：I6 假设（web 受益最多，纯写作受益最少；需实证）+ H5（plan D 无匹配长度的对比）+ M10（Plan B 未直接验证噪声密度假设）

### 目标
实证验证「高冗余输入受益更多」的假设，给出各工作负载类型的 compression-vs-success Pareto 曲线。

### 工作负载分层设计

**W1: Web 阅读任务**（预测受益最多）
- 候选数据集：WebArena 生产类任务子集（nav + extract），或自建脚本：给定一个 URL 列表和一批问答题，要求跨页收集事实。
- 控制变量：用「真实原始页面」和「手工去除 boilerplate 之后的版本」分别做实验，量化 boilerplate density 和压缩率的相关性。

**W2: Coding 任务**（预测中等受益）
- 候选数据集：SWE-bench Verified 子集，选 repair/refactor 类型（需大量跨文件阅读）。
- 重点跟踪：recall 被触发时的操作类型（edit 前的 recall 是否显著高于其他操作）。

**W3: 长文档分析任务**
- 候选：给定长技术文档或 RFC，要求回答精确引用型问题（"哪个章节说了 X？"）。
- 重点指标：Retention@critical（精确 span）。

**W4: 纯写作任务**（预测受益最少）
- 候选：给定需求描述，要求输出代码注释、Changelog、文档草稿，工具调用少、观察短。
- 预期：impression 基本不触发，compression/success 都和 baseline 接近。

### 每个工作负载的对比
两组：Baseline-NoComp vs Impression-Full，同等 token budget。

### 分析输出
- 四类任务的 (compression_ratio, task_success) 散点图
- boilerplate_density vs compression_ratio 回归分析（仅 W1）
- recall_rate vs task_type 的箱线图

---

## E4  信息保留标注协议（supporting study）
**打靶质疑**：H9（标注协议未具体化）+ C2（causal non-degradation 的微观机制需要有人工检验支撑）

### 目标
为"蒸馏是否保留了行动所需的关键信息"提供可复现的人类标注基准。

### 标注流程

1. 抽取 30 个蒸馏 episode（均匀分布于 W1-W3）。
2. 每个 episode 有：原始工具结果、Impression 笔记、任务描述。
3. 两人独立标注，盲化处理（不看对方结果亦不看结果是否对应 Impression 还是 baseline），按以下三类标记每个信息单元：
   - **Critical-Exact**：若缺失，任务失败或需要 recall。（例：函数签名、行号范围、具体错误码。）
   - **Semantic**：缺失可接受，粗略理解即可完成任务。（例：文件整体结构、段落大意。）
   - **Noise**：无关信息，理想情况下应丢弃。
4. 标注员不一致时由第三人裁决。
5. 报告 Cohen's κ，目标 κ > 0.70。

### 度量公式
$$
\text{Retention@critical} = \frac{\#\text{critical units preserved in note}}{\#\text{critical units in original}}
$$
$$
\text{Retention@semantic} = \frac{\#\text{semantic units preserved in note}}{\#\text{semantic units in original}}
$$
$$
\text{NoiseDrop} = 1 - \frac{\#\text{noise units retained in note}}{\#\text{noise units in original}}
$$

### 对比维度
Impression-Full vs Baseline-Generic，同样 token budget 下哪个保留关键信息多、丢掉噪声多。

---

## E5  recall 灵敏度实验：压缩不足时模型是否能识别并触发 recall
**打靶质疑**：H8（bounded degradation 要求的不只是 fallback 可用，而是模型能感知压缩不足）+ H3（recall 机制在边界条件下未定义）

### 目标
测量"压缩失真后，acting 模型触发 recall 的概率"，即召回灵敏度（recall sensitivity）。

### 实验设计
人工构造两类注入场景：

**场景 A：关键信息静默丢失**
手工从 Impression 笔记里删除一个 Critical-Exact 单元（如 API 返回值的 error code），然后让模型继续执行。记录：
- 模型是否在下一步行动前 recall；
- 若不 recall，是否产生任务失败。

**场景 B：错误信息植入**
将笔记里的某个关键值改成错误值（如函数参数顺序颠倒），然后让模型继续执行。记录同上。

**基准场景 C：完整笔记**
不做任何注入，作为 false-positive 基准（模型不应该 recall）。

### 评估指标
- Recall Sensitivity：场景 A/B 中触发 recall 的 episode 比例
- Recall Specificity：场景 C 中不触发 recall 的比例（衡量过度 recall 问题）
- 失败模式分类：任务失败 / 错误行动 / 正确恢复

### 关联 empirical-findings.md
已有发现：GPT-5.4-XHigh 过度 recall（specificity 低），GPT-5.4-High 表现最好，Opus 4.6 recall 偏多但任务成功。本实验可以为这些观察提供量化框架。

---

## E6  蒸馏 compute cost 核算
**打靶质疑**：H2（蒸馏成本从未被统计）

### 目标
给出一次 Impression 加持会话的完整成本账：不只看节省的 input token，还要算上所有蒸馏和 recall 调用的额外 token 消耗，以及净收益。

### 统计维度

对每个 episode，记录：

| 指标 | 含义 |
|------|------|
| `original_input_tokens` | 无压缩情况下的累计 input tokens（估算） |
| `compressed_input_tokens` | 使用 Impression 后的实际 input tokens |
| `distill_call_tokens` | 所有蒸馏调用的 input + output tokens |
| `recall_call_tokens` | 所有 recall 调用的 input + output tokens |
| `net_token_saving` | `original_input_tokens - compressed_input_tokens - distill_call_tokens - recall_call_tokens` |
| `cost_per_task` | 用各 provider 的 price-per-token 算出金额 |
| `latency_overhead` | 蒸馏调用引入的端到端延迟增量 |

### 分析
- 确认 net_token_saving 在 W1-W3 中均为正值（如果 web 任务在某些情况下 net saving 为负，需如实报告）。
- 给出 break-even 曲线：原始内容需要多长、召回多少次，才开始亏本？
- 单独报告 system-prompt 的 ~10k chars 基线（对应审查报告 I8 的遗漏）。

---

## E7  阈值 × 召回策略 sensitivity 分析
**打靶质疑**：M4（threshold 和 recall policy 相互作用未分析）+ D4×D10 矩阵 gap

### 变量网格

| `minLength` | `maxRecallBeforePassthrough` |
|-------------|------------------------------|
| 1024 | 0 |
| 2048（默认）| 1（默认） |
| 4096 | 2 |
| 8192 | 3 |

每个组合在相同的任务集上跑（建议用 W2 coding 任务，因为有明确的 pass/fail 判断）。

### 输出
- (minLength, maxRecall) → (task success, context size, recall rate) 的三维热图
- 找出 Pareto 最优区域
- 验证默认参数是否合理

---

## E8  行为不变性指标（supporting study）
**打靶质疑**：M7（evaluation 只测保留率，没有测行动一致性）

### 目标
比较"有 impression"和"无 impression"的模型在同一任务状态下，下一步工具选择是否一致。

### 方法
在每个 episode 的每一步行动前，克隆出一个无 impression 的"幻影情境"（把压缩笔记替换回原始内容），让模型在相同对话历史下重新预测下一步行动，对比：
- 工具选择一致率（exact tool match）
- 工具参数相似度（fuzzy match）
- 行动序列 Levenshtein 距离

注意：这是一个分析性实验，不是端到端评估，目的是诊断 impression 对决策路径的「干扰面」。

---

## 执行优先级

| 优先级 | 实验 | 理由 |
|--------|------|------|
| **P0（必需，缺一不能投）** | E1（核心消融）、E6（成本核算）、E4（标注协议） | 审查报告 C3/H4/H2 是直接拒稿级质疑，E1 打 C3/H4，E6 打 H2，E4 为所有实验提供标注基础 |
| **P1（强支撑）** | E3（工作负载分层）、E5（recall 灵敏度） | 支撑核心假设 I6、直接回应 H8 |
| **P2（丰满论文）** | E2（跨模型身份破坏）、E7（参数 sensitivity） | 支撑 H1/M4，让消融更完整 |
| **P3（可选但有价值）** | E8（行为不变性） | 回应 M7，如果 page limit 不够可以放到扩展材料 |

---

## 关键注意事项

### 统计学设计（对应 M5、H6）

- **非劣效性检验**：主要指标（task success）使用预先设定的非劣效性 margin δ（建议 δ = 0.05，即可接受的最大成功率下降 5%），做单侧检验 H₀: Δ ≤ -δ。
- **多重比较校正**：E1 有 5 组比较，用 Bonferroni 或 Holm-Bonferroni。
- **样本量估算**：以 task success rate 为主要指标，假设 baseline 成功率 0.75、δ = 0.05、α = 0.05、power = 0.80，双侧检验需约 n = 320 个 episode（每组 64）。
- **随机化和种子控制**：所有运行报告 random seed，SWE-bench 类实验记录 split/subset，避免 cherry-pick。
- 所有「N=1 case study 数据」（现有 86689→4341 case）只作引言 motivation，不作 evidence，对应 C5 修复。

### Token budget 匹配（对应 H5、M8）

E1、E2、E3 所有组强制 max\_output\_tokens 相同，确保不是因为 Impression 输出更长的笔记而性能更好。如果某组的 median 笔记长度差异超过 10%，做敏感性分析。

### Baseline 4 操作化（对应 H4）

Baseline-Generic 的具体 prompt：
```
Summarize the following tool output concisely. Output only the summary.
Tool: {{toolName}}
Output:
{{toolResult}}
```
不包含任何「你是 agent 自身」「这是你的记忆」「帮你未来行动」等身份锚定语言。Recall API 与 Impression-Full 完全相同。Prompt 全文放在论文附录。
