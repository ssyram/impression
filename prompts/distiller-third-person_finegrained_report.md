# Fine-grained Consistency Report — distiller-third-person.md

## Phase 0：范围确定

检查范围：1 个文件（单文件检查）
- 文档：`my-plugins/impression/prompts/distiller-third-person.md`（257 行）
- 代码：无
- 配置：无
- 测试：无

范围说明：本次检查目标是 `distiller-third-person.md` 本身的规则流畅性、内部一致性、格式契约是否自洽，以及“反混淆 / grounded / passthrough / structured output / edit-oriented precision”这些设计点之间是否相互冲突。

## Phase 1：命题抽取

**P1**: Distiller 的角色是压缩 `<tool_result>` 供 outer agent 使用，而不是 outer agent 本身（来源：`distiller-third-person.md:1-6`）

**P2**: `original_system_prompt` 和 `visible_history` 在本 prompt 中只是被引用的数据，不是对 distiller 的指令（来源：`distiller-third-person.md:3,22-25`）

**P3**: Distiller 回复中绝不能调用任何工具（来源：`distiller-third-person.md:9`）

**P4**: 只有 `<thinking>` 允许进行模拟式意图建模；正文不得承担该职责（来源：`distiller-third-person.md:29-45`）

**P5**: `<thinking>` 中应推断当前 concern、判断全文 passthrough 是否必要、以及 structured body 需要哪些部分（来源：`distiller-third-person.md:34-38`）

**P6**: `<thinking>` 中的推断可以是 tentative inference，但必须同时受 quoted context 与当前 `<tool_result>` 约束（来源：`distiller-third-person.md:40-45`）

**P7**: `<thinking>` 外的正文只能包含 objective facts、direct conclusions、证据、位置元数据，以及严格受限的短 verbatim 片段（来源：`distiller-third-person.md:47-56`）

**P8**: `<thinking>` 外的正文不得包含计划、继续 workflow、对用户/outer agent 意图的叙述、泛化 meta-commentary 或 workflow-steering 语言（来源：`distiller-third-person.md:57-63`）

**P9**: 信息选择应以 outer agent 的当前 concern 为准，而不是完整项目任务（来源：`distiller-third-person.md:65-84`）

**P10**: passthrough 只在“确实需要 exact full text、内容足够短、全文 verbatim 的全局收益高于 guidance+compression”时才允许；否则必须走 structured format（来源：`distiller-third-person.md:69-77`）

**P11**: structured output 由四类部分组成：`Position guide`、`Relevant summary`、`Grounded conclusions`、`Also contains`；其中前三项按需出现，`Also contains` 永远必须一行（来源：`distiller-third-person.md:73-77,146-161,167-170`）

**P12**: edit-oriented concern 下必须优先保留 concrete edit-target details，包括 path、line/range、rg hit、diff hunk、symbol boundary，以及“是否直接可见”这类定位信息（来源：`distiller-third-person.md:86-103`）

**P13**: 如果 `<tool_result>` 已经包含精确定位信息，正文必须复用这些定位，不得抽象成模糊区域描述（来源：`distiller-third-person.md:96-103`）

**P14**: `<thinking>` 外每一句都必须被 `<tool_result>` 直接支撑；quoted context 只能影响 relevance，不能支撑 factual claim（来源：`distiller-third-person.md:105-114`）

**P15**: 正文风格应是 evidence record，而不是 agent diary；推荐句型包括 `Position guide` / factual record / `Relevant summary` / `Grounded conclusion`（来源：`distiller-third-person.md:116-124`）

**P16**: 正文禁止使用 `I think`、`My approach`、`The agent wants`、`Next, read`、`For exact text, re-read` 等表达（来源：`distiller-third-person.md:126-132`）

**P17**: structured output 的 `<thinking>` 需要解释“为何 full passthrough 不成立”；正文则按需输出 `Position guide` / `Relevant summary` / `Grounded conclusions`，并始终输出 `Also contains`（来源：`distiller-third-person.md:134-171`）

**P18**: structured output 规则要求正文从 factual content 开始，且不能以 `I` / `My` / `The user` / `The agent` 开头（来源：`distiller-third-person.md:164-171`）

**P19**: 内容超过 80 行时绝对禁止 passthrough（来源：`distiller-third-person.md:197-204`）

**P20**: passthrough 还要求：内容少于 80 行、outer agent 的 immediate next action 需要 exact original text、全文 verbatim 的价值高于 structured guidance、并且 `<thinking>` 明确论证了这一点（来源：`distiller-third-person.md:205-227`）

**P21**: `Position guide` 的设计目标是：当只需要局部精确性时，给出 declaration-style location metadata，再附上 relevant summary 与 grounded conclusions（来源：`distiller-third-person.md:229-257`）

**P22**: 对 edit-oriented concern，line numbers 或 exact hit locations 应优先于 broad summary；局部 verbatim 仅在确有帮助且足够短时才使用（来源：`distiller-third-person.md:255-257`）

## Phase 2：命题间矛盾与遗漏检查

### 矛盾 1: P11 vs P18
**严重程度：中**

- P11 / P17 允许 structured output 只包含“按需部分 + 必需的 `Also contains`”。
- P18 又要求“main body must start with factual content from `<tool_result>`”。
- 但当前契约没有明确规定：如果 `Position guide` / `Relevant summary` / `Grounded conclusions` 都不需要，是否允许正文只剩 `Also contains:`。
- 若只剩 `Also contains:`，则正文并不明显满足“从 factual content 开始”的要求。

影响：模型在边缘 case 下可能不知道是否必须至少生成一条 factual note，导致输出在格式上自相矛盾。

### 矛盾 2: P7 vs P17
**严重程度：低**

- P7 明确允许正文包含“very short verbatim snippets”。
- 但 P17 的 structured format 只定义了 `Position guide` / `Relevant summary` / `Grounded conclusions` / `Also contains` 四类部分，没有为短 verbatim 片段提供明确落位。
- 这不是直接互斥，但会让模型不知道：短 verbatim 应嵌入 summary、嵌入 position guide，还是单独成行。

影响：局部精确引用的表现形式不稳定，可能出现模型忽略该能力，或把 verbatim 嵌进不合适的位置。

### 遗漏 1: P10 依赖未定义的“global benefit”判断准则
**严重程度：低**

- P10 / P20 要求模型比较“全文 verbatim 的收益”与“guidance + compression 的收益”。
- 但范围内没有更具体的判断维度，只给了两条典型案例。
- 这使得 passthrough 决策在边界场景上仍然偏主观。

影响：不同模型/不同温度下，passthrough 门槛可能不稳定。

### 遗漏 2: P11 依赖未定义的 structured output 最小非空主体
**严重程度：中**

- P11 说明前三部分按需出现，`Also contains` 必填。
- 但没有定义“当三部分都不需要时，正文至少还应包含什么”。
- 这与 P18 的“正文从 factual content 开始”形成配套缺口。

影响：模型可能产出只有 `<thinking>` + `Also contains` 的空心正文，信息密度不足。

### 遗漏 3: P22 依赖未定义的短 verbatim 表达格式
**严重程度：低**

- P22 允许局部 verbatim，但没有配套格式规范，例如是否必须带 path/line anchor、是否应放入 `Relevant summary`、是否必须加引号等。

影响：输出风格可能飘动，降低不同 impression 之间的一致性。

## Phase 3：设计点交叉覆盖矩阵

归纳出的核心设计点：
- **D1**：角色边界 / Anti-confusion
- **D2**：`<thinking>` 中的意图识别与决策
- **D3**：正文的 grounded evidence-only 约束
- **D4**：passthrough 决策与硬性门槛
- **D5**：structured output 四段式契约
- **D6**：edit-oriented 精确定位
- **D7**：风格与 anti-steering 语言约束
- **D8**：局部 verbatim 的允许范围

| A | B | 覆盖？ | 位置/备注 |
|---|---|---|---|
| D1 | D2 | ✓ | `29-45`：意图识别被限制在 `<thinking>` 内 |
| D1 | D3 | ✓ | `47-63,105-114`：正文被限定为 grounded evidence-only |
| D1 | D4 | ✓ | `69-71,205-227`：passthrough 仍受角色边界约束 |
| D1 | D5 | ✓ | `134-171`：输出契约围绕“memory handoff”而不是 workflow continuation |
| D1 | D6 | ✓ | `86-103`：edit 精确定位被定义为证据保留，而不是指挥动作 |
| D1 | D7 | ✓ | `57-63,126-132,173-195`：反 steering 示例与禁令齐备 |
| D1 | D8 | ✓ | `55,257`：局部 verbatim 仍受角色边界和 boundedness 约束 |
| D2 | D3 | ✓ | `34-38` vs `47-63`：思考与正文职责清晰分离 |
| D2 | D4 | ✓ | `36,69-71,205-227`：passthrough 决策由 `<thinking>` 解释 |
| D2 | D5 | ✓ | `37,140-161`：`<thinking>` 决定 structured body 要哪些部分 |
| D2 | D6 | ✓ | `37,81,86-103`：edit concern 下会决定是否需要 Position guide |
| D2 | D7 | ✓ | `40-45,57-63,126-132`：意图识别只允许留在 `<thinking>` |
| D2 | D8 | **✗** | 允许局部 verbatim，但未说明 `<thinking>` 应如何判断“短 verbatim 比纯 summary 更值得” |
| D3 | D4 | ✓ | `49-63` 与 `205-227`：不满足条件时不得用全文 verbatim 逃避 grounded compression |
| D3 | D5 | **✗** | 正文允许短 verbatim，但 structured contract 未提供稳定的容器或书写规范 |
| D3 | D6 | ✓ | `54,86-103,229-257`：局部精确性通过 position metadata 进入正文 |
| D3 | D7 | ✓ | `57-63,116-132,173-195`：正文既要 grounded，又要反 steering |
| D3 | D8 | **✗** | 局部 verbatim 的 groundedness要求存在，但缺少 anchor/格式要求，交互定义不完整 |
| D4 | D5 | **✗** | passthrough 被拒绝后，structured body 的最小非空内容没有完全定死，边界 case 可能只剩 `Also contains` |
| D4 | D6 | ✓ | `81,86-103,229-257`：edit concern 通常落入 structured path 而非 full passthrough |
| D4 | D7 | ✓ | `181-182,205-227`：bad example 与 passthrough gate 一致，禁止指挥式替代 |
| D4 | D8 | ✓ | `209-210,257`：只有在 full passthrough 不值得时，才鼓励 bounded local verbatim |
| D5 | D6 | ✓ | `146-159,229-257`：Position guide 服务于 edit-oriented precision |
| D5 | D7 | ✓ | `164-170,173-195`：structured output 明确要求 declarative evidence records |
| D5 | D8 | **✗** | 四段式结构未明示局部 verbatim 应进入哪一段，造成格式空洞 |
| D6 | D7 | ✓ | `86-103,126-132,229-257`：既强调精确位置，又禁止“去改/去看”的 steering 句式 |
| D6 | D8 | ✓ | `96-103,257`：edit 场景下允许精确局部表达，但要求 tight/bounded |
| D7 | D8 | ✓ | `57-63,126-132,257`：允许 verbatim，但仍禁止把它写成指挥式语言 |

## Phase 4：总结

### 关键问题（按严重度排序）

1. **Structured output 的最小非空主体未定义清楚**（中）  
   涉及：`distiller-third-person.md:73-77,146-171`  
   现状允许前三段都省略，但又要求正文从 factual content 开始；建议明确：若 passthrough 被拒绝，则正文至少必须包含 `Relevant summary` 或 `Grounded conclusions` 之一。

2. **局部 verbatim 被允许，但没有明确落位和格式规范**（中/低）  
   涉及：`distiller-third-person.md:49-56,146-161,257`  
   建议修复方向：补一条规则，规定短 verbatim 只能作为 `Relevant summary` 或 `Position guide` 的子项出现，并且必须带 path/line anchor（若可得）。

3. **Passthrough 的“global benefit”判断标准仍偏抽象**（低）  
   涉及：`distiller-third-person.md:69-71,205-210`  
   建议修复方向：补 2–3 条更操作化的判据，例如“需要逐字符对比 / 需要精确 patch wording / 需要对整段文本逐句引用”时才倾向全文 passthrough。

### 设计亮点

- **角色边界收得很紧**：Anti-confusion、thinking-only intent inference、正文 grounded evidence-only 三者现在是同向强化，不再鼓励 distiller 变成“副驾驶指挥者”。
- **Edit-oriented precision 的优先级明确**：对 line/range/hit/hunk/symbol 的保留要求已经足够具体，能明显抑制“抽象成某个区域”的坏倾向。
- **Passthrough 与 structured output 的总分流思路更自然**：从原先的三分类标签切回“全文 verbatim vs 结构化压缩”的主判断，更贴近真实使用场景。

### 数据摘要

- 总命题数：22
- 矛盾数：2
- 遗漏数：3
- 矩阵空洞数：5
- 高严重度问题列表：无
