# 子计划 3：选择蒸馏模型（已接入，离线测试通过；真实模型待用户实测）

## 1. 目标与既有边界

用户确认的目标：`distillModel` 可写 `_SELF`（默认）或 `[provider/]model[:effort]`；不写 provider 时搜索模型目录，优先当前 provider 的匹配模型，否则取搜索结果首项；无模型告警。effort 是**可空**附加值：缺省、无效或所选模型不支持时不附带，不使模型选择失败。`/impression set` 应立刻更新会话有效配置。让另一模型蒸馏可能降低耗时或费用，但效果待实测。

现状证据：`src/register-tool-result-hook.ts` 与 `src/register-recall-impression.ts` 各通过 `resolveSelectedDistillationModel` 选择模型后调用 `distillWithSameModel`；`src/config.ts::resolveConfig` 填充 `_SELF` 默认值，`src/impression-session-state.ts::applyConfigPatch` 先持久化再更新 `cfg`；`src/result-builders.ts::buildImpressionText` 把 ID 和笔记插入 `🧠` 模板，原文留在 `impression-v1` session entry。**本方案不改变**阈值、skip、system-prompt 追加、蒸馏请求的历史/当前结果结构、原文存储、标记、Recall 上限或提示词。当前架构见 `../architecture.md`；以下是已实施的路由合同，离线测试证据及未验证的真实服务边界在文末。

外部事实：`ModelRegistry.getAll()` 返回 `Model<Api>[]`，`find(provider,id)` 只做指定 provider 下的查找（`packages/coding-agent/src/core/model-registry.ts`）；TUI 已导出的 `fuzzyFilter(items,query,getText)` 返回同一批模型对象的匹配子集，按分数升序排列，稳定同分保留原顺序（`packages/tui/src/fuzzy.ts`）。Pi CLI 的 `parseModelPattern` **只返回一个模型**，不是本方案需要的候选列表；本方案不复制 CLI 解析器。`ModelRegistry.complete/streamSimple` 由目标 provider 的运行时准备认证、baseUrl、env 和 headers（`packages/coding-agent/src/core/model-runtime.ts::prepareRequest`）。

## 2. 可判定合同（P）与例子

**配置**：`ImpressionConfig.distillModel?: string`；`ResolvedConfig.distillModel` 缺省 `_SELF`。值是可持久化选择字符串而非 Pi `Model` 对象。全局/本地文件在 `session_start` 合并，活动 branch 的 `impression-config-v1` patch 按先后覆盖；显式 `_SELF` 可以撤销旧的固定设置。现有 `/impression set [--persistent] DistillModel VALUE` 通道只需增加字段定义/字符串校验：`applyConfigPatch` 已更新本会话，`--persistent` 另写本地文件。`/impression load` 沿现有路径应用文件 patch。磁盘文件在同一会话中不会自行热加载。

**选择**（在每次待蒸馏请求前重新计算；启动或显式 set/load 后另作无匹配提示）：

1. `_SELF` → 返回 `ctx.model` 和 `effort=undefined`，保持旧认证与调用方式；`ctx.model` 缺失时沿原文退出。
2. 其余字符串先识别可选 provider 与末尾 effort。仅当 `/` 前缀对应注册表中的 provider 时，把前缀作为显式 provider；否则完整斜线串仍可作为模型 ID（如目录中含斜线的 ID）。先允许完整字面 ID（含冒号）**精确命中**，以免把真实模型 ID 后缀误作 effort；否则只在最后一个冒号处拆出 `modelName` 和候选 effort。候选档位未知或该模型不支持时 effort 为 `undefined`，仍按拆出的 `modelName` 搜索；例如 `gpt-6-sol:bad` 搜索 `gpt-6-sol` 而不报档位错误。空模型查询无候选。
3. `matches = fuzzyFilter(ctx.modelRegistry.getAll() 中显式 provider 的模型或全部模型, modelName, m => m.id + " " + m.name)`。有显式 provider 时取 `matches[0]`；否则取 `matches.find(m => m.provider === ctx.model?.provider) ?? matches[0]`。这里直接保留选中的 **Model 对象**，不把候选变成 provider Set 再用模糊字符串调用精确 `find`。
4. `matches.length === 0` → `no model`；有匹配则若 `effort` 属于所选模型的 `getSupportedThinkingLevels(model)`，保留，否则置 `undefined`。输出为 `{ model, effort? }`，provider/id 从所选模型读取。不会因无效 effort 改选 provider。

| 输入、候选 | 结果 |
|---|---|
| 无配置 / `_SELF` | 当前模型，既有请求 |
| 当前 `codex-001`，输入 `glm-5.3`，只有 `zai/glm-5.3` 命中 | `zai/glm-5.3` |
| 当前 provider 与别的 provider 都命中 `gpt-6-sol` | 当前 provider 的最高排序命中 |
| `codex-001/gpt-6-luna:high`，目标支持 high | 固定该实例，附带 high |
| 相同模型但不支持 high，或 `gpt-6-sol:bad` | 仍选择匹配模型，effort 空 |
| 目录无匹配 | 启动或显式 set/load 时 warning；请求时原文透传 |

`getAll()` 含未登录模型：**目录命中不等于认证成功**。同分排序、模型目录变化或不同 provider 同名会使省略 provider 的选择变化；需要稳定身份时写全 `provider/model`。以上例子是条件句，不保证例子模型在当前运行时存在。

**当前执行**：首次蒸馏和 Recall 重蒸馏复用这一选择，预算按所选模型 `maxTokens` 计算。`_SELF` 保持原先 `getApiKeyAndHeaders + compat.complete`；固定模型交给已实现的 `requestFixedDistillation`，由 `ctx.modelRegistry.streamSimple` 按目标 provider 发送请求，仅在 effort 有值时附带 `reasoning`。调用方原有的 `onPayload` 仍调用 `forceEmptyTools`；保留原异常/停止原因分类，不能在固定模型失败时改用主模型。模型无法解析时，首次返回原工具结果；Recall 调用已有 `deliverFullContent`。固定调用认证/传输失败时通过现有失败透传路径返回原文，不生成伪笔记。`/impression status` 自动显示新的 `cfg` 字段，无新存储协议。`debug: true` 时首次与 Recall 的通知显示选中的 provider/id、实际指定的 effort（未附带显示 `null`；Codex wire 请求可编码为 `none`，不是 `low`）和 `_SELF`/fixed；若目标 provider 调用 `onPayload`，同样的身份与 effort 写入 debug payload 元数据，不含凭据。

## 3. 代码落点与必要性（I 来自 P）

| 文件 | 仅修改 |
|---|---|
| `src/types.ts` / `src/config.ts` | 增加原始/有效配置字段并填充 `_SELF` 缺省 |
| `index.ts` / `extension.ts` | `index.ts` 只导出入口；`extension.ts` 创建每扩展实例的状态并按原次序注册工具、命令及事件 |
| `src/select-distillation-model.ts`（已接入） | 薄包装 `fuzzyFilter + 当前 provider 优先 + 可空 effort`；返回所选模型或无匹配原因，不缓存、无网络请求 |
| `src/request-fixed-distillation.ts`（已接入） | 把所选模型、原请求选项及可空 effort 交给注册表的 `streamSimple`，不自行解析认证 |
| `src/distill.ts` | 保留请求构造与结果分类；固定目标交给 registry.streamSimple，`_SELF` 仍用兼容调用 |
| `src/register-impression-hooks.ts`、`src/register-impression-command.ts`、`src/register-tool-result-hook.ts`、`src/register-recall-impression.ts` | 分别负责启动告警、set/load、首次与 Recall 接入；两处 debug 输出选择身份与 effort |
| `src/impression-session-state.ts` 等按职责拆出的模块 | 保留原会话内状态、skip/save 和原文交付，不引入跨会话可变全局 |
| 聚焦单测与 faux-provider 集成测试 | 验证首次、Recall、同会话切回 `_SELF`、跨 provider 请求和失败原文透传 |
| `README.md`、`README_cn.md`、`../architecture.md` | 同步当前配置、实际入口及所选模型的成本/调试边界 |

不新建模型池、全局缓存、provider 轮换、模型专属提示词、标记处理层或原文持久化层。用户另行批准既存 `index.ts` 的结构迁移后，入口已拆为仅 re-export，运行状态仍归每扩展实例所有；这项搬迁是遵守源文件结构规则的独立成本，不是选模机制自身的复杂性。

## 4. 条件正确性论证（Hoare/NSP，不是运行证明）

**分支覆盖表**（旧 skip/阈值、已交付 Recall 等未进入蒸馏的分支保持现状）：

| 进入蒸馏后的条件 | 结果 |
|---|---|
| `_SELF` 且有活动模型 / 无活动模型 | 旧请求 / 原文 |
| 固定串匹配为空 | 启动或设置时提示；调用时原文，不调用模型 |
| 固定串匹配非空，effort 有效 / 无效或不支持 | 同一目标模型，附带 effort / effort 空 |
| 目标 provider 认证、传输或模型响应异常 | 沿已有失败分支交原文，不换主模型 |
| 正常回应且笔记合格 / sentinel、截断、空或笔记不短于原文 | 旧存储与替换分支 / 旧原文分支 |
| `/impression set` 的值类型非法 / 合法 | 不写配置 / 按已有 patch 顺序使新值生效 |

**选择函数**。前置：非空配置串或 `_SELF`；本次 `getAll()` 为有限快照；`ctx.model` 与 provider 查询在一次同步选择中不变。`fuzzyFilter` 的源码保证：它只返回原列表中的项，匹配成功才进入结果，并按匹配分数排序。令 `M` 为这一结果。`M=[]` → 无匹配，不构造模型；`M≠[]` 且显式 provider → `M[0]` 属于该 provider；省略 provider → `find(current)` 若存在必属于 `M` 且优先，否则 `M[0]` 属于 `M`。因此后置：成功的 `model` 是目录原对象，并遵守用户选择顺序。候选扫描的进展量为剩余有限元素数，终止；匹配集合已由宿主函数产生，不另写排序循环。effort 判断只有“支持 → 保留 / 其余 → 空”两支，不影响所选模型。此论证依赖本次目录快照，不声称两次调用期间候选不变。

**配置与请求组合**。前置：session_start 已重放配置；`applyConfigPatch` 原有顺序为 append 成功后才改 `currentRaw/cfg`。故配置写入成功后下一次选择见新值；append 失败时内存仍旧值。首次调用先经过旧 skip/阈值门，Recall 先经过旧计数/交付门：未触发蒸馏时不查模型。触发后模型无匹配 → 不发蒸馏请求且原文仍在原事件/ImpressionEntry 中，故可透传；有匹配 → 同一个所选模型进入预算、诊断和实际请求。固定请求由 registry 按该模型 provider 准备认证；失败进入既有 distill 异常/透传出口，不得向另一模型重试。正常输出仍经旧 sentinel、截断、空值、长度与引用展开门，只有接受的 note 能替换工具结果。组合推出本子计划的路由/原文保留性质，**不推出摘要内容真实、服务端真的接受档位、速度提高或永不发生异常**。

**已执行的直接证据**：`src/select-distillation-model.test.ts` 与 `src/request-fixed-distillation.test.ts` 共 11 个离线用例通过；它们覆盖 `_SELF`、跨 provider 与当前 provider 优先、显式 provider、斜线/冒号 ID、可空 effort、无匹配、请求选项与模型身份转交以及同步 provider 异常转成 Promise 拒绝。根 `npm run check` 通过；根配置不包含 `my-plugins/`，故另用 `tsgo -p my-plugins/impression/tsconfig.json --noEmit` 检查新增文件并通过。接入后以 faux provider 执行了首次蒸馏、同会话 `/impression set` 后切回 `_SELF`、Recall、显式跨 provider、无匹配原文以及目标返回错误时不重试主模型的测试；11 个受影响文件共 58 个用例通过。代码入口和配置行为已变，尚未对真实服务测速。

**剩余边界**：离线测试覆盖注册表实际向不同 faux provider 发请求与异常原文透传；faux provider 不触发真实传输的 `onPayload`，因此 debug payload 文件中模型/effort 字段仍需你的真实调用观察；`/impression load` 的新字段路径沿现有通用命令分支，未单独覆盖端到端测试。模糊排序可能选中目录首个**未认证**账号：曾在离线探针中对 `glm-5.3` 选到未配置的 `opencode/glm-5.3`，并原文透传。显式写 `provider/model` 可固定账号。真实模型的延迟、计费与笔记质量另需实际样本；这些测试不能证明“不会出错”。
