# Counter D：对 Challenger A／B 的对抗性复核

## 摘要

基准仅为 `HEAD=5f1dcf323a085ececcbd55f70023f1fa05679cbb` 的架构、README、三个已存在子计划及旧源码可达行为；当前子计划不倒灌为旧合同。**默认 `_SELF` 下，A/B 所列五条反例均不能证明结构迁移造成新回归**：A 的三项和 B 的持久化项是旧新同形行为；B 的越界写入在加载不可信会话记录时是真实的**旧有、附带信任边界前提的安全漏洞**，不是一次普通 `save_impression` 参数即可从干净会话触发。无证据将模型目录读取的故障注入升格为真实宿主上的确定回归。

## 确定的迁移回归

无。此判断仅覆盖下列五项、所涉默认 `_SELF` 路径及已阅读的消费者，**不是对全部外部环境的等价性证明**。

## Critical Issues：逐条挑战 B 的安全 finding

### B-1：回放 ID 越界写入——保留为有条件的旧有漏洞〔Decisional：会话文件信任边界〕

- **触发／攻击向量**：攻击者能够使宿主打开或恢复一份自己可控且具有有效会话头、有效活动分支 `parentId` 链的 JSONL；活动链包含 `type:"custom"`、`customType:"impression-v1"`、`data:{"id":"../../../outside","toolName":"bash","toolCallId":"t","fullContent":[{"type":"text","text":"X"}],"fullText":"X","recallCount":0,"createdAt":1}`。启动回放后调用 `save_impression({id:"../../../outside"})`。目标父目录可写时形成项目外文件写入；如果日志不受攻击者控制，不能声称干净会话中的模型仅凭这个工具参数可写任意路径。
- **旧／新位置及 callee 前提**：旧 `HEAD:index.ts:458-460,896-923`、`HEAD:src/types.ts:91-104,154-157`；新 `src/register-impression-hooks.ts:30-49`、`src/register-save-impression.ts:14-38`、`src/types.ts:93-106,156-160`。宿主 `../../packages/coding-agent/src/core/session-manager.ts:527-580,940-954,1624-1643` 从指定文件逐行 JSON 解析，主要校验会话头，不验证 custom `data.id`；`:1336-1345` 的 `getBranch()` 取活动链。`isImpressionEntry` 只要求 `id` 为字符串；`newImpression` 的 `randomUUID()` 只保证**新生成**记录，不约束被回放的记录。
- **局部 NSP／SCCO 的 O**：若上述 custom 条目在活动链，旧、新均 `Map.set("../../../outside", data)`；`save` 命中且 `delivered` 不为真，计算 `join(<cwd>/.pi/impression-cache,"../../../outside.txt")` 为 `<cwd>/../outside.txt`；成功写入 `X` 并返回 `Saved 1 chars to <cwd>/../outside.txt` 的规范化绝对路径。纯 `node:path` 计算在 `/workspace/example` 下得到 `/workspace/outside.txt`；未执行文件写入。与 `HEAD:README.md:186`、`HEAD:docs/design/impression/architecture.md` §6.4 `:435` 所称“写入限于项目内／不能选择目的地”冲突；两版输出、状态和危险性一致，**分类：旧有缺陷**。
- **挑战结论／限制**：接受 B 的路径代数与类型守卫证据，**反驳无条件可利用性**：仅 `save_impression({id:"../../../outside"})` 在正常 UUID map 中会 `Impression not found`；需要恶意会话日志或其他可写同名 custom 条目的扩展。会话日志是否允许不可信导入是 Decisional；宿主存在 `SessionManager.open(path)` 加载任意指定会话文件这一可达入口，但未验证攻击者能在特定产品部署中替用户选取会话文件。不能把路径构造的危险性误判为本次拆分新增。

## Moderate Issues：逐条挑战 A 及 B 的其他 finding

### A-1：负 `count`——确认旧有不变量冲突，不能作为迁移回归〔Non-Decisional〕

- **触发**：默认 `maxPassthroughCount=2`，`skip_impression({count:-1,justification:"精确保留空白",estimatedChars:10})`。旧 `HEAD:index.ts:33-37,839-879` 与新 `src/register-skip-impression.ts:8-11,32-56` 均使用 `Type.Number`，只将 `count===0` 视为取消；无 `count>0` 检查。`estimatedChars` 正数且低于硬限。
- **NSP／旧新 O**：两版 `Math.min(-1,2)=-1`；旧 `HEAD:index.ts:335-337`／新 `src/impression-session-state.ts:36-40` 追加 `remaining:-1,lastEstimatedChars:10`，返回 `Skipping distillation for next -1 tool result(s).`；旧 `HEAD:index.ts:440-444`／新 `src/register-impression-hooks.ts:30-35` 回放相同负值，`HEAD:src/types.ts:142-145`／新 `src/types.ts:144-147` 只检查类型。`tool_result` 的 `remaining>0` 不成立，实际不会透传任何一条。
- **挑战结论**：挑战其被当作“新增回归”的任何推论，不否认其旧合同违背：`HEAD:docs/design/impression/architecture.md` §5.1 `:159` 明定非负余额；旧、新均不满足。不是命令执行、泄漏或提权，故不冒充安全漏洞。

### A-2：配置上限调低后余额未钳制——确认旧有，附上可观察轨迹〔Decisional：存量额度的生效语义〕

- **触发**：默认配置先调用 `skip_impression({count:2,justification:"精确保留空白",estimatedChars:100})`，再执行 `/impression set MaxPassthroughCount 1`，随后两个普通 `bash` 工具各返回文本 `"x"`。
- **旧／新位置与 NSP**：旧 `HEAD:index.ts:875-877,404-419,1019-1029,509-542`，新 `src/register-skip-impression.ts:53-55`、`src/impression-session-state.ts:97-109`、`src/register-impression-command.ts:82-90`、`src/register-tool-result-hook.ts:22-47`。skip 使 `(remaining,max)=(2,2)`；配置补丁只重算 `cfg.maxPassthroughCount=1`，不改余额，故两版 `(2,1)`；每个长度 1 的结果依次使余额 `1,0`，两次通知分别为 `Passthrough mode (1 remaining)` 和 `(0 remaining)`，返回原工具内容，记录同型余额／统计条目。
- **挑战结论**：与 `HEAD` 架构 §5.1 `:159` 的每次转移后上界和 `HEAD:README.md:135`“hard cap”相冲突，但两版都如此，**旧有缺陷**。是“新上限是否追溯现存配额”的设计选择，不凭直觉把追溯钳制规定成迁移合同。

### A-3／B-2：交付时 append 失败——共同缺陷成立，但纠正对宿主内存和 JSONL 的过强描述〔Non-Decisional，静态故障注入〕

- **触发**：map 中有未交付 `{id:"a",fullContent:[{type:"text",text:"abc"}],fullText:"abc",recallCount:0}`，`maxRecallBeforePassthrough=0`、无额度；`recall_impression({id:"a"})` 的统计 append 成功，而交付时的 `appendEntry("impression-v1",...)` 在落盘前抛 `Error("disk full")`。旧 `HEAD:index.ts:695-703,729-731,363-382`；新 `src/register-recall-impression.ts:58-63,84-86`、`src/impression-session-state.ts:59-79`；结果构造 callee 旧／新 `src/result-builders.ts:21-25`。
- **局部 NSP／旧新 O**：两版先取原数组引用作为待返回结果，随后令 map 对象的 `fullContent=[]`、`fullText=""`、`delivered=true`，**才**调用会抛出的 append；首次 `execute` 拒绝而未返回 `abc`，同进程下一次 `recall`／`save` 命中已交付 guard 并报错。`HEAD` 架构 §5.1 `:163-170` 与当前 §5.1 `:176-183` 的 append 失败内存不变陈述被两版推翻。纯内存运算已核对返回数组引用仍指向 `abc`，但异常使结果不可交付。
- **对 challenger 的反例／限定**：B 引的 `runner.ts:988-1019` 是 **`tool_result` hook** 抛错后保留原结果的消费者，不应直接用于解释工具 `execute` 抛错；`recall_impression.execute` 自己的拒绝才是此处的 O。并且宿主 `session-manager.ts:1100-1105` **先**将 custom entry 放入 `fileEntries/byId/leafId` **再**调用 `_persist`；map 对象也可能别名先前 live entry 的 `data`。因此“磁盘原 JSONL 未记录交付”仅在选定的**写入前失败且原文件仍完整**场景成立；不能推出同进程 `getBranch()` 未变化，更不能声称同进程单纯 `session_start` 必可恢复。重新**开启进程并从未损坏的旧盘上记录加载**时才可能恢复。这一限定不推翻 A/B 的核心同进程一次性交付故障，分类仍为**旧有缺陷**，非结构回归。

## 预期新增、未闭合与其他观察

- **预期新增**：旧 `HEAD:src/config.ts:9-21` 不含 `distillModel`、旧 `HEAD:index.ts:555-565,734-748` 使用活动模型；新 `src/config.ts:9-22` 默认 `_SELF`，`src/select-distillation-model.ts:14-18` 使用同一活动模型，新 `src/distill.ts:90-92` 在 `fixedTarget` 缺失时仍调用旧 `complete`。`/impression status` 多 `distillModel`、help／补全多 `DistillModel`，debug 可新增模型选择通知／元数据；显式配置非 `_SELF` 时的固定模型、registry streaming 属新功能，不倒推为旧合同回归。旧新 `index.ts → extension.ts:10-18` 对同一 state 对象依次注册 hooks、结果、recall、skip、save、command；回放都是活动 `getBranch()`，`save_impression` 均未列入 `tool_result` 自调用排除表（旧 `HEAD:index.ts:506-508`；新 `src/register-tool-result-hook.ts:19-21`）。
- **未闭合，反例针对 A/B 的“无确定回归”结论之边界**：新 `src/resolve-selected-distillation-model.ts:4-10` 即使 `_SELF` 仍在选择器守卫前求值 `ctx.modelRegistry.getAll()`；旧 `HEAD:index.ts:555-559,734-738` 无此目录读取。若构造 `ctx.model=undefined`、结果文本 `"x".repeat(2048)` 且 `getAll()` 抛错，旧 hook 通知无模型并返回原文，新 hook 异常由 `runner.ts:988-1019` 捕获、原文由宿主保留但**旧通知缺失**；召回路径下旧交付全文、新工具执行拒绝且保留 impression 未交付。宿主 `model-registry.ts:50-52` 的真实 `getAll()` 仅复制 `runtime.getModels()`；未发现正常宿主生命周期中攻击者可使其抛出的具体输入，故这是**条件性控制流断链／未闭合**，不是已证实的新安全漏洞或确定回归。也不能断言 tool_result 抛错会造成原文丢失。

## 设计文档问题

### [DESIGN_DOC_OUTDATED] HEAD §5.1、§2、§6 的入口／状态定位及单模型表述

- **旧文档**：HEAD 架构 `:11-37,150-170,427-435` 把 factory 状态和 handler 定位于 `index.ts`，只叙述活动模型；**现行实现**：`index.ts:1` 只重导出，`extension.ts:10-18` 创建并注入共享状态，`src/impression-session-state.ts:10-109` 管理状态，非 `_SELF` 走固定模型路径。该模块地图作为历史 HEAD 是正确的，但若当作现行导航便已过时；应记录默认与固定模型路由及边界，不能以新增工作树子计划篡改旧 `_SELF` 合同。

### [DESIGN_DOC_OUTDATED] §5.1、§5.7 的全局 disk-first 保证

- **文档／实现**：旧架构 `:163-170,369-373` 与当前架构 `:176-183` 声称 `appendEntry` 抛错内存不变；旧 `HEAD:index.ts:373-382`、新 `src/impression-session-state.ts:73-79` 都先改变 map 对象，宿主 `_appendEntry` 又先更新自身内存再持久化。文档与旧、新行为冲突，并非本次新引入；需明确哪些路径有强异常保证、哪些没有。

### [DESIGN_DOC_INCOMPLETE] §6.4 save 路径沙箱的信任前提

- **文档／实现**：HEAD 架构 `:435`、HEAD README `:186` 断言目标限于项目内；旧、新 `isImpressionEntry` 容许路径分隔符，回放的 id 进入 `join`。设计需说明 session JSONL／其他扩展是否受信、导入 ID 的格式前置条件。否则文档不能无条件得出“LLM 不可选择任意目的地”。

## 验证与剩余风险

完整只读检查了 `git show HEAD:index.ts` 1060 行（分段）、HEAD 架构 498 行、README 237 行、三个 HEAD 既有子计划及旧／新 `src/types.ts`、`src/config.ts`、`src/distill.ts`、`src/result-builders.ts`；阅读现行 `index.ts`、`extension.ts` 和所涉 hooks、状态、三个工具、命令、选择器、预算、debug、状态 UI 与序列化模块；核对宿主 session manager、extension loader／runner、agent-session、model registry 的消费者。按 HoarePrompt 局部 `Pre → NSP → callee 契约 → Post` 做分支对照，并按 SCCO 的 O 核对实际内容、错误、通知、追加条目与写入路径；仅运行纯 `node:path`／纯内存数值与数组引用演算。未调用真实模型、未读取凭据或 `.pi/impression-debug` 历史、未运行会改写会话的测试；不可信会话来源的现实攻击控制权、目录查询的真实抛错场景及真实磁盘部分写入行为均为剩余风险。未修改运行代码。
