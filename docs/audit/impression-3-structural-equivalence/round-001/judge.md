# Judge E：默认 `_SELF` 结构等价独立裁决

## 判决概要

基准是嵌套仓库 `HEAD=5f1dcf323a085ececcbd55f70023f1fa05679cbb` 的设计、README、三个**HEAD 已存在**的子计划及旧源码可达行为；工作树的新增子计划不作为旧合同。对已逐支核对的默认 `_SELF` 路径，成功执行及通常的失败回退在旧字段状态、原文/笔记、通知、追加条目顺序和请求调用上具有**有条件的观察等价**。没有从实际宿主源码找到可达的、足以列为**确定迁移回归**的输入；但新增无条件模型目录读取及 `_SELF` 下的新增配置/调试可见输出，阻止无条件、逐字宣称“所有旧稳定行为等价”。下述负额度、降额、一次性交付、默认召回说明和回放 ID 均不是迁移引入。

这里 `O` 包括最终工具 `content/details/isError`、错误工具结果、通知、UI、命令帮助/补全、JSONL 与文件写入、模型请求和可观察副作用，而不只比较函数返回值。以下每条均用 `Pre →` 逐语句局部 NSP `→ Post/O`，并核对 callee 的实际源码。**裁决不把条件性注入异常冒充真实宿主必现故障**。

## 确定迁移回归

在本次核对的默认 `_SELF` 路径中，**未确认**具有实际宿主触发条件、旧正确且新错误的确定迁移回归。此句不意味着全集形式化证明：见下文模型目录的未闭合边界及新增输出差异。

## 确认：旧有缺陷，不能归因于结构拆分

### 1. 负数 `skip_impression.count` 使透传余额成为 `-1`〔CONFIRMED；旧有缺陷，Non-Decisional〕

- **Pre**：默认 `maxPassthroughCount=2`，`skip_impression({count:-1,justification:"需要原样空白",estimatedChars:10})`。两版 schema 均为 `Type.Number`，且只有 `count===0` 被特别处理；正数校验仅施加在 `estimatedChars` 上。
- **旧/新位置**：`HEAD:index.ts:33-37,839-879` / `src/register-skip-impression.ts:8-11,32-56`，持久化旧 `HEAD:index.ts:335-337` / 新 `src/impression-session-state.ts:36-40`，回放旧 `HEAD:index.ts:440-444` / 新 `src/register-impression-hooks.ts:30-35`。
- **NSP、O**：两版执行 `Math.min(-1,2)=-1`、追加 `{remaining:-1,lastEstimatedChars:10}`、回复 `Skipping distillation for next -1 tool result(s).`；再次回放均接受负数（旧 `HEAD:src/types.ts:142-145`，新 `src/types.ts:144-147`）。下一次普通结果因 `remaining>0` 为假，不会得到承诺的次数。
- **合同及分类**：两版都违反 `HEAD:docs/design/impression/architecture.md:159` 的非负状态不变量及 README 所述 next N；**旧有缺陷**，不是拆分回归。

### 2. 已有透传额度高于新配置上限〔CONFIRMED；旧有缺陷，存量额度语义 Decisional〕

- **Pre**：默认额度 2；先 `skip_impression({count:2,justification:"保留空白",estimatedChars:100})`，随后 `/impression set MaxPassthroughCount 1`，再连续两次普通 `bash` 结果，文本均为 `x`。
- **旧/新位置**：`HEAD:index.ts:875-877,404-418,1019-1029,509-541` / `src/register-skip-impression.ts:53-55`、`src/impression-session-state.ts:97-109`、`src/register-impression-command.ts:82-90`、`src/register-tool-result-hook.ts:22-47`。
- **NSP、O**：skip 后 `(余额,上限)=(2,2)`；`applyConfigPatch` 只追加配置并更新 `cfg`，不改余额，两版均变 `(2,1)`。长度 1 未过硬限或预估限，两次 `tool_result` 分别扣至 1、0，原文均透传，通知分别为 `Passthrough mode (1 remaining)` 和 `(0 remaining)`，追加同型透传/统计条目。
- **合同及分类**：`HEAD` 架构 §5.1 每次转换后的余额上界不能推出，README `maxPassthroughCount` 硬上限解释也受到挑战；**旧有行为**。是否把新上限追溯应用到旧额度需产品选择，不能借迁移擅改旧合同。

### 3. 全文交付追加失败时，原文在同进程提前失效〔CONFIRMED；旧有缺陷，故障条件〕

- **Pre**：活动 map 有未交付 `id=a`、`fullContent=[{type:"text",text:"abc"}]`、`fullText="abc"`、`recallCount=0`；`maxRecall=0`、余额 0，统计追加成功，交付时 `appendEntry("impression-v1",…)` 在落盘之前因 I/O 失败抛出。这是**静态故障注入**，没有执行真实会话写入。
- **旧/新位置**：`HEAD:index.ts:695-703,729-731,373-382` / `src/register-recall-impression.ts:58-63,84-86`、`src/impression-session-state.ts:73-79`；引用构造 `src/result-builders.ts:21-25` 两版相同。
- **callee/NSP**：构造的待返回 `result.content` 仍指向旧数组（纯内存演算可得 `abc`），但两版先使 map 中对象 `fullContent=[]; fullText=""; delivered=true`，后调用抛错的 `appendEntry`，所以**没有正常 return**。宿主 `../../packages/agent/src/agent-loop.ts:741,763-769` 把工具 `execute` 异常变成错误工具结果；同进程随后再 recall/save 命中已交付 guard，不能取得正文。此处不能用 `tool_result` hook 的吞异常语义代替工具 execute 的语义。
- **合同及限定**：违反 `HEAD:docs/design/impression/architecture.md:163-170` 声称的追加失败内存不变及 §6“一旦交付到 LLM 才一次性失效”。旧新相同，非回归。**不能**笼统声称“JSONL 未变所以再次 `session_start` 一定恢复”：宿主 `session-manager.ts:1198-1208,1100-1105` 在 `_persist` 前已把传入同一 `data` 引用纳入内存索引、推进 leaf；同进程 branch 也可能已是清空对象。只有选定的写入前失败、原盘未损坏、重新从旧盘加载，才有恢复可能。

### 4. 默认第一次成功重蒸馏仍返回全文，而非 README 所称笔记〔CONFIRMED；旧文档/实现矛盾，语义 Decisional〕

- **Pre**：默认 `maxRecallBeforePassthrough=1`，未交付记录 `recallCount=0`、无额度，有活动模型和认证，重蒸馏返回比原文短的非空笔记 `ok`。
- **旧/新位置**：`HEAD:index.ts:806-814` / `src/register-recall-impression.ts:154-161`；规格 `HEAD:README.md:13-16,134,184`。
- **NSP、O**：成功蒸馏后两版先 `recallCount=1`，继而 `1>=maxRecall` 为真，统计并交付原 `fullContent`，记录 `delivered=true`；笔记未返回，同 ID 后续不能重取。README 的“首次召回重蒸馏”“默认 1 次返回笔记”解释不符合任一版本。是**旧有规格—实现缺陷**；修改计数还是修改承诺需要设计决策，而非结构回归。

### 5. 回放含路径分隔符的 ID 可越过保存缓存目录〔CONFIRMED，但只在有条件信任边界；旧有缺陷，Decisional〕

- **Pre**：宿主打开包含合法会话头和活动分支 custom 条目的可控 JSONL，`customType="impression-v1"`，`data={id:"../../../outside",toolName:"bash",toolCallId:"t",fullContent:[{type:"text",text:"X"}],fullText:"X",recallCount:0,createdAt:1}`；随后 `save_impression({id:"../../../outside"})`，目标父目录可写。干净 UUID 会话中**仅凭该工具参数不会成功**，因 map 查找失败。
- **旧/新位置**：`HEAD:index.ts:458-460,385-396,896-923`、`HEAD:src/types.ts:91-104` / `src/register-impression-hooks.ts:48-49`、`src/register-save-impression.ts:14-38`、`src/types.ts:93-106`。宿主 `session-manager.ts:527-580,940-959,1336-1345,1624-1643` 支持从指定会话文件解析并取活动链，未验证 custom `data.id` 为 UUID。
- **callee/NSP、O**：类型守卫只约束 ID 为 string；两版 map 中命中该 ID，`node:path.join('/workspace/example/.pi/impression-cache','../../../outside.txt')` 的**纯路径运算**结果为 `/workspace/outside.txt`；如果目标可写，两版写出 `X` 并返回越界路径。实际文件写入未执行。
- **合同及分类**：`HEAD:README.md:186`、架构 §6.4 的“固定在项目内、调用者不能选目的地”并非无条件成立。这是**旧有、以允许导入/恢复不可信会话或其他可写 custom 条目的扩展为前提**的缺陷，不是迁移回归。是否将这些会话记录认作受信边界是待定设计问题；不能将其说成正常 UUID 工具调用即可利用。

## 未闭合：模型目录依赖与争议裁决

### 默认 `_SELF` 无条件调用 `getAll()`〔条件性反例 CONFIRMED；作为「确定迁移回归」不予确认〕

- **旧/新位置**：`HEAD:index.ts:554-565,734-747` / `src/register-tool-result-hook.ts:60-71`、`src/register-recall-impression.ts:88-102`、`src/resolve-selected-distillation-model.ts:4-10`、`src/select-distillation-model.ts:14-18`。旧不调用模型目录，新在进入 `_SELF` 守卫前先求值第三实参 `ctx.modelRegistry.getAll()`。
- **条件性 Pre → NSP/O**：默认 `_SELF`，达到阈值的工具结果文本 `"x".repeat(2048)`、无模型且 registry **被替换为会抛 `Error('catalog unavailable')` 的实现**：旧通知 `no active model selected` 并返回原数组；新在目录求值处抛异常，宿主 `extensions/runner.ts:988-1024` 吞掉该 hook 错误、发 extension error、保留原结果；所以**原文并没有在 tool_result 丢失**，但旧通知不再发出。另取未交付记录、`maxRecall=1`、`recallCount=0`、无额度且相同注入目录错误：旧通知后交付全文并持久化，新的工具 `execute` 拒绝，宿主给错误结果，记录暂未 delivered。若有模型但认证将失败，目录错误也先于旧认证失败通知/回退发生。这个反例验证了**相对于可抛 API 的局部全称合同断链**，不能直接验证实际宿主必然可抛。
- **宿主边界裁决**：真实 `model-registry.ts:50-52` 的 `getAll()` 只复制 `runtime.getModels()`；`model-runtime.ts:393-395` 转发至 `../../packages/ai/src/models.ts:306-325`。后者遍历 provider，对各 `entry.getModels()` 抛错分别 `catch`，返回 best-effort 数组。没有构造出**正常宿主生命周期**里普通 provider 目录失败会透出 `getAll()` 的实例（不把内存耗尽或任意 monkeypatch 当真实证明）。因此将“存在确定迁移回归”**REJECTED/未证实**，将新增依赖、O(目录大小)及非常规异常/自定义运行时副作用列为**UNCLEAR（合同边界待定）**。如要求对任意 `ExtensionContext` 测试桩或不可控全局异常也保留旧回退，则上述条件性反例已经否定全称等价；如以本仓库实际宿主正常运行作论域，则仅据此不能报确定错误。设计方需明确论域及 `getAll()` 的可观察副作用/总函数保证。

## 新 `distillModel` 差异，非旧 `_SELF` 结构回归

- **默认显示差异**：旧 `HEAD:src/config.ts:9-21` 不含该字段，新 `src/config.ts:9-22` 默认 `distillModel:"_SELF"`。同一空配置 `/impression status`，旧 `HEAD:index.ts:941-943` 不含此键，新 `src/register-impression-command.ts:19-21` 多一键；帮助/补全增加 `DistillModel`（旧 `HEAD:index.ts:239-265` / 新 `src/impression-command-arguments.ts:13-42`、`src/impression-config-fields.ts:24`）。**O 非逐字相等，预期新增**。
- **默认 debug 差异**：debug 启用、阈值命中时，新 `src/register-tool-result-hook.ts:76,94-99`、`src/register-recall-impression.ts:107,125-130` 增加模型/effort/selection 通知和元数据；旧 `HEAD:index.ts:567-588,750-772` 没有。此 O 是新增特性；默认请求仍取同一 `ctx.model`，相同 `getApiKeyAndHeaders` 和预算，新 `src/distill.ts:90-92` 因 `fixedTarget=undefined` 继续调用旧 `complete`，不是强制改用 registry stream。
- **显式非 `_SELF`**：新 `src/select-distillation-model.ts:20-49` 与 `src/request-fixed-distillation.ts:4-12` 选择并请求固定模型，旧 `HEAD:index.ts:555-568,734-751` 只有活动模型；该输入不属旧稳定 `_SELF` 的等价论域。当前工作树子计划不能反向定义旧实现。

## 源码对应与 SCCO 覆盖裁决

- **Sound（合理性）**：旧 `HEAD:index.ts:288-296` 每 factory 创建的闭包状态，在新 `extension.ts:10-18` 投影为一次 `createImpressionSessionState`、一个共享引用传给各注册函数；旧新工厂注册顺序均为 provider hook、session hook、agent hook、tool_result、recall、预注册 skip、save、command，`session_start` 又各自重注册 skip。宿主 `extensions/loader.ts:273-284` 用同名 `Map.set` 覆盖并刷新，非新重复工具。宿主 `runner.ts:988-1032` 逐字段合并且吞 hook 异常，`agent-session.ts:530-560` 再按结果 content/isError 组合；不能将 `{content:event.content}` 误说成清除了 details，也不能将 hook 抛错误说成工具 execute 抛错。
- **Complete（完备性）**：给定共同文件种子和同一 `getBranch()`，旧 `HEAD:index.ts:427-497` / 新 `src/register-impression-hooks.ts:18-76` 都先清状态、逐活动链回放最近额度/统计、按序合并配置、每 ID 最后有效记录覆盖，再类型检查、钳制、解析和重注册；循环不变式是处理前 k 项后各最近记录/合并补丁只来自前 k 条活动链，处理一条对应同一类型转移，扫描结束保持投影。相应 `before_provider_request`、`before_agent_start`、额度拒绝/接受、规则与阈值短路、蒸馏成功/各失败原因、recall 各分支、skip/save 和命令的旧新分支次序已核查；复用的旧新 `src/config.ts`、`src/distill.ts`、`src/types.ts`、`src/result-builders.ts` 的实际变化主要是新增模型字段与 fixed 路由，不能声称外部模型回复/随机 ID/时间戳都经实验验证。**未闭合**的真实宿主 `getAll()` 异常或 provider 枚举副作用使全称证明仍需前提。
- **Concise（归因最小化）**：负 count、调低上限、append 失败、默认召回、会话 ID 均有**旧与新相同** NSP，不能重复报迁移 regression；回放路径逃逸必须带“可控活动会话条目及可写目标”前置条件。模型目录反例区分 hook 与 execute：前者保留原文但丢旧通知，后者不交付全文；不能混为“内容均丢失”。
- **Optimization（避免多余工作及保持语义）**：即使 `_SELF`，新目录遍历/复制 `O(目录模型数)`，旧读取 `ctx.model` 为直接访问；未证实直接用户损害，但新增工作及潜在 provider 回调副作用是非必要前提。未以性能猜测替代回归证明，也未读取任何密钥或运行实际模型。

**总体裁决**：可以说“默认 `_SELF` 的已核对核心路径在模型目录正常返回且没有额外可观察副作用、相同外部响应的前提下保持旧行为投影”，**不可**说“全部旧稳定行为逐字/无条件等价”：至少 status/help/debug 新 O 不等，`getAll()` 引入了未由旧合同闭合的调用与条件性故障出口；且旧规范本身包含五类旧有冲突。

## 设计文档核对

1. **[DESIGN_DOC_OUTDATED] HEAD 架构 §2/§5.1 模块地图：仅作历史版本差异，不列当前文档缺陷。** `HEAD:docs/design/impression/architecture.md:11-37,150-170` 将状态和 handler 放 `index.ts`；现在 `index.ts:1` 重导、`extension.ts:10-18` 组装。**当前** `docs/design/impression/architecture.md:13-29,157-166` 已改为 barrel / shared state 的模块地图，故“当前设计文档仍把所有状态放 index.ts”的判断 **REJECTED**；不能拿 HEAD 的历史导航冒充工作树现行错误。`../oh-my-pi-v2/docs/ARCHITECTURE.md` 是工作流架构，不规定本插件逻辑，不应强行在其章节添加本插件路由。
2. **[DESIGN_DOC_OUTDATED] HEAD 架构 §1/§5.3/§6 单活动模型：历史设计与新增能力之差，不是旧 `_SELF` 回归。** `HEAD:docs/design/impression/architecture.md:7,215-232,427-447` 只写活动模型；当前 `docs/design/impression/architecture.md:7-11,13-29,453-463` 已记载默认 `_SELF` 与显式固定模型及所选模型预算。故“当前文档仍只允许活动模型” **REJECTED**。文档新增的模型目录 `_SELF` 前置调用是否必要，仍见第 4 点。
3. **[DESIGN_DOC_OUTDATED] 当前与 HEAD 架构 §5.1/§5.7/§6：全称 disk-first 与代码相矛盾，CONFIRMED。** HEAD `:163-170,361-373,429-431` / 当前 `:176-183,443-447` 声称 append 抛错内存不变、重启/回放可恢复；旧 `HEAD:index.ts:373-382` / 新 `src/impression-session-state.ts:73-79` 先标记交付再 append，宿主 `session-manager.ts:1100-1105` 也先更新自己的索引才 `_persist`。问题 3 的故障 NSP 否定全称承诺；文档本身还同时记载“先变更、后追加”，具有内在矛盾。这是**旧有设计—代码冲突**，不是拆分新缺陷。
4. **[DESIGN_DOC_INCOMPLETE] 当前与 HEAD 架构 §6.4 保存路径的信任前提，CONFIRMED。** HEAD `:435` / 当前 `:451` 称写入局限于项目内且 LLM 不可挑目标，但旧新 `isImpressionEntry` 只检验 ID 为字符串；未规定回放 custom data 是否受信、ID 是否必须为 UUID。问题 5 的活动分支可控记录是反例；若会话文件绝对可信，应在该节显式写出前提，而非无条件称为沙箱。
5. **[DESIGN_DOC_INCOMPLETE] 当前架构 §5.3 模型选择/§5.1 状态边界，条件性。** `src/resolve-selected-distillation-model.ts:4-10` 即使 `_SELF` 也遍历目录；旧规格没有此依赖。若设计主张无条件保留旧无模型/鉴权失败回退，需要解释为何此依赖可被视作无异常、无可见副作用；若只保证真实宿主的正常生命周期，应将此前提写入模型选择合同。此项**待决定调用契约范围**，不将纯故障注入变成现行可证实回归。

## 验证与剩余风险

只读逐段读取旧 `HEAD:index.ts` 全 1060 行、HEAD 架构全 498 行、README 全 237 行及 HEAD 三个旧子计划；完整核对现行入口、注册、状态、命令、模型选择/请求、配置、类型、蒸馏和结果构造及其旧版本差异；读取当前插件架构相关节及 `oh-my-pi-v2/docs/ARCHITECTURE.md`，核对宿主 `model-registry`、`model-runtime`、`models`、extension loader/runner、agent-loop、agent-session、session-manager。仅执行纯 `node:path` 与数组引用演算；没有运行真实模型、读凭据或 `.pi/impression-debug` 历史，也没有读取其他审查报告或写运行代码。未运行依赖真实 extension/会话写入的集成测试。**剩余风险**：异常内存/非常规 registry 实现或有副作用的动态 provider 未得到真实宿主反例；导入不可信会话的攻击控制权取决于部署信任边界；文件落盘失败可能部分写入，不能承诺重启恢复。
