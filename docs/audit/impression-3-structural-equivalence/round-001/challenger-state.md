# 功能正确性审查报告 — Challenger A：状态与回放

## 摘要

以嵌套仓库 `HEAD=5f1dcf323a085ececcbd55f70023f1fa05679cbb` 的架构、README、三个既有子计划及旧源码可达行为为上游，逐段对照旧 `index.ts` 与当前 `index.ts`、`extension.ts` 及相关 `src/` 运行文件。**默认 `distillModel` 未配置或为 `_SELF` 时，本次限定的配置回放、状态所有权、统计/透传持久化、recall/skip/save 路径未发现确定的结构迁移回归。**下列反例均在旧版已存在，不能算本次拆分引入；新增模型选择差异单列。

## 确定回归

无符合“具体可达输入、旧正确/新错误输出”条件的确定回归。此结论限于本报告覆盖的状态路径，不宣称已证明整套模型调用和其他模块全路径等价。

## 旧有缺陷（不得归因于本次迁移）

### 问题 1：负数 `count` 产生负的透传次数（Non-Decisional）

- **触发条件／输入**：会话起始默认配置 `maxPassthroughCount=2`，调用 `skip_impression({count:-1,justification:"需要精确保留空白",estimatedChars:10})`；数字参数满足两版 `Type.Number` 工具 schema，且现有逻辑只检查 `estimatedChars`。
- **旧源码位置**：`HEAD:index.ts:33-37,839-877`；**新源码位置**：`src/register-skip-impression.ts:8-11,32-56`、`src/impression-session-state.ts:36-40`。
- **要求**：上游 `HEAD:docs/design/impression/architecture.md` §5.1 的 `0 ≤ passthroughRemaining ≤ cfg.maxPassthroughCount`，README 工具表中的“next N”与 `count=0` 取消语义。
- **局部 NSP／callee 契约**：`requested=-1 ≠ 0`；justification 和 estimate 均通过；`Math.min(-1,2)=-1`；`persistPassthroughRemaining` 将 `remaining:-1` 交给 `appendEntry`，不存在后置约束把它还原为零。
- **旧可达状态／输出**：JSONL 追加 `{remaining:-1,lastEstimatedChars:10}`，工具返回 `Skipping distillation for next -1 tool result(s).`；新可达状态／输出：完全相同。再次 `session_start` 时旧 `HEAD:index.ts:440-444`、新 `src/register-impression-hooks.ts:30-35` 又都回放为 `-1`。
- **违反旧合同的理由／影响**：负数“剩余次数”与上游非负不变量和 next N 的有效数量相矛盾，用户实际收到不可能执行的负次数确认。**分类：旧有缺陷，非迁移回归**。

### 问题 2：调低上限时，活动透传次数未随新上限约束（Non-Decisional）

- **触发条件／输入**：默认配置先调用 `skip_impression({count:2,justification:"精确保留空白",estimatedChars:100})`，然后运行 `/impression set MaxPassthroughCount 1`，再接收两个文本长度各为 1 的普通工具结果。
- **旧源码位置**：`HEAD:index.ts:404-418,509-541,875-877,1019-1029`；**新源码位置**：`src/impression-session-state.ts:97-109`、`src/register-impression-command.ts:82-90`、`src/register-tool-result-hook.ts:22-47`、`src/register-skip-impression.ts:53-55`。
- **要求**：上游架构 §5.1 写明每次转移后 `passthroughRemaining ≤ cfg.maxPassthroughCount`，README 说明 `maxPassthroughCount` 为硬上限。
- **局部 NSP／callee 契约**：第一次 skip 后 `(remaining,max)=(2,2)`；`applyConfigPatch` 先成功追加配置补丁再 `resolveConfig` 得到新 `max=1`，却没有修改现存 `remaining=2`；两次 `tool_result` 的条件 `remaining>0` 分别成立并减至 1 和 0。
- **旧可达状态／输出**：设置上限后 `(remaining,max)=(2,1)`；两次普通工具结果均透传，依次通知 `Passthrough mode (1 remaining)`、`Passthrough mode (0 remaining)`，两条 passthrough JSONL 条目可回放；**新可达状态／输出相同**。
- **违反旧合同的理由／影响**：配置更改后仍允许多于当前硬上限的一次透传，且在下一条结果之前会话内状态已经违反上游不变量。需决定上限变更是否立即钳制既有额度；但这是旧有行为，**分类：旧有缺陷／其修正语义为 Decisional**，不可作为拆分回归。

### 问题 3：全文交付的持久化失败后内存提前标记 `delivered`（Non-Decisional；失败注入场景）

- **触发条件／输入**：活动分支已有未交付 impression `id="a"`，`fullContent=[{type:"text",text:"abc"}]`，`fullText="abc"`，`maxRecallBeforePassthrough=0`，`showData=false`；调用 `recall_impression({id:"a"})`，模拟本次统计 `appendEntry("impression-session-stats",…)` 成功而随后 `appendEntry("impression-v1",…)` 抛出 I/O 错误；同一进程内重试同一个 id。此情形只作静态故障注入推导，未运行真实 I/O。
- **旧源码位置**：`HEAD:index.ts:363-382,729-731,695-701`；**新源码位置**：`src/impression-session-state.ts:59-79`、`src/register-recall-impression.ts:58-63,84-86`。
- **要求**：架构 §5.1 声明 append 失败时内存状态不先行，并要求只有全文已经交付后才禁止再次 recall；§6 又注明 `deliverFullContent` 的内存先行实现，属于上游文档自身的局部矛盾。
- **局部 NSP／callee 契约**：`recall` 已验证 `!delivered` 后调用 `updateRecallShowData`，再调用 `deliverFullContent`；callee 先保留指向原数组的结果引用，再把 `impression.fullContent=[]`、`fullText=""`、`delivered=true`，最后调用会抛错的 append。因此第一次调用未能返回结果，第二次读取 map 中同一个对象时在 `delivered` guard 抛错。
- **旧可达状态／输出**：第一次返回工具错误而非 `"abc"`，第二次返回 `already been fully delivered` 错误；map 中 `delivered=true`，JSONL 中该 id 仍是 `delivered=false`。**新可达状态／输出相同**，重启后再回放可以恢复旧 JSONL 条目。
- **违反旧合同的理由／影响**：用户从未收到全文，同一进程却被告知已经交付、无法通过 recall/save 恢复，直到重新开始会话。**分类：旧有缺陷，非迁移回归**；上游“disk-first 全覆盖”陈述应限定异常路径。

## 预期新增：`distillModel`（非旧行为回归）

- 旧 `HEAD:src/config.ts:9-21` 不含 `distillModel`；旧 `HEAD:index.ts:555-568,734-751` 直接取 `ctx.model`。新 `src/config.ts:9-22` 默认 `_SELF`；`src/select-distillation-model.ts:14-17` 对 `_SELF` 返回同一个 `ctx.model` 或同一句 `no active model selected`；`src/register-tool-result-hook.ts:60-82,102` 和 `src/register-recall-impression.ts:88-113,134` 在 `kind="self"` 时继续使用同一鉴权分支、同一 `distillWithSameModel`（无 fixedTarget）、同一输出预算。默认状态下可达返回内容和持久化写入逻辑与旧版一致。
- `distillModel` 被显式指定为其他模型时的新选择器、provider 查询和 fixedTarget 请求，不在旧 `_SELF` 等价结论内；`/impression status` 现在多一个 `"distillModel":"_SELF"` 字段，帮助/配置列表多一个 `DistillModel`，属于预期新特性输出差异，不伪装成完全字节级等价。
- 新 `resolveSelectedDistillationModel` 即使 `_SELF` 也先调用 `ctx.modelRegistry.getAll()`（`src/resolve-selected-distillation-model.ts:4-10`），旧路径不调用；框架 catalog 读取的异常或副作用未在本次受限静态审查中验证。**分类：未闭合风险**，没有具体真实 registry 失败实例，不列为确定回归。

## 状态等价核对及 Hoare 局部证明

1. **状态所有权**：旧 `HEAD:index.ts:288-296` 在每次 extension factory 调用中建立一个 map 和一组可变状态；新 `extension.ts:10-18` 只创建一次 `state`，将**同一引用**注入 hooks、tool-result、recall、skip、save、command，`src/impression-session-state.ts:10-34` 保持同一组字段。旧在 factory 末尾预注册 skip（`HEAD:index.ts:885`），新在 factory 中预注册（`extension.ts:16`）；两者均在 `session_start` 解析配置后重注册。
2. **file → branch replay**：给定文件种子 `F={minLength:2048,enabled:true}`，活动分支按序含补丁 `{enabled:false}`、统计 `{originalChars:7,impressionChars:3}`、透传 `{remaining:1,lastEstimatedChars:20}`、impression `id=a`，旁支另有 `{enabled:true}`：旧 `HEAD:index.ts:427-487` 和新 `src/register-impression-hooks.ts:22-68` 均先重置状态，只遍历 `getBranch()`，依次以顶层 spread 合并补丁、以末条覆写统计/透传、以 `Map.set` 存最后版本；共同后置条件 `cfg.enabled=false`、计数 `7/3`、透传 `1/20`、map 存 `a`，旁支补丁不进入。遍历不变式：处理前 k 条时每种最近有效类型均取前 k 条活动链的最后对应记录，配置为 `F` 叠加前 k 条有效补丁；每前进一条保持不变式，结束后解析、验证、钳制。`getBranch()` 的活动链语义采用上游架构 §5.7 的 callee 契约；未读其他审查产物。
3. **配置操作**：旧 `HEAD:index.ts:404-418,929-1057` 与新 `src/impression-session-state.ts:97-109`、`src/register-impression-command.ts:12-113` 对 `on/off/load/set/工具名列表` 均先追加同型配置补丁，再替换 `currentRaw` 与 `cfg`；`loadConfig` 的全局/本地合并仍为 `HEAD:src/config.ts:55-65` 与新 `src/config.ts:56-66` 同形。数值钳制、无效类型丢弃、debug 模式关闭、再注册 skip 均在对应路径实现。`--persistent` 仍只另行异步写文件，不改变会话补丁的先后关系。
4. **passthrough、统计、recall/save**：拒绝超限工具结果时，旧 `HEAD:index.ts:514-540` 与新 `src/register-tool-result-hook.ts:27-47` 都先向 map 放入 impression 并追加，再消耗额度、追加 passthrough 状态；接受时都记录原长与展现长度。`recordImpressionData` 两版均先变更计数再追加 `impression-session-stats`（旧 `HEAD:index.ts:339-349`；新 `src/impression-session-state.ts:43-50`），为旧有异常安全弱点而非迁移差异。recall 的 delivered、额度拒绝/消耗、maxRecall、缺 model/auth、distill/pass-through、统计和最后交付的顺序逐支对应 `HEAD:index.ts:695-815` 与 `src/register-recall-impression.ts:58-161`；`save` 的路径和 delivered guard 对应 `HEAD:index.ts:896-925` 与 `src/register-save-impression.ts:14-38`。`createPassthroughToolResult`（`src/result-builders.ts:21-25`）直接引用传入数组，旧/新交付前先取结果再赋新空数组，正常 append 成功时正文均仍可返回。

## 设计文档问题

### [DESIGN_DOC_OUTDATED] §5.1/模块地图仍将所有状态放在 `index.ts`

- **文档**：仅上游 `HEAD:docs/design/impression/architecture.md` §5.1 称 `index.ts` 为包含所有状态与 handler 的 factory closure，§6 的输出预算也指向 `index.ts`。
- **实现**：`index.ts:1` 仅转导 `extension.ts`；`extension.ts:10-18` 负责 factory 与状态注入，`src/impression-session-state.ts:10-109` 维护状态/预算另见 `src/impression-output-budget.ts:3-8`。状态作用域语义保持，但文件定位不再正确。
- **影响／待文档化决定**：继续用旧文件名排查会漏读实际读写状态的模块。应记载单一 `state` 引用由 factory 建立并共享的注入契约，而非把工作树子计划倒推成旧行为。

### [DESIGN_DOC_OUTDATED] “始终使用活动模型”与新增固定模型选项

- **文档**：上游架构 §5.1/§6 和 `HEAD:README.md` 的 cost note 指向与主 agent 相同的模型。
- **实现**：默认 `_SELF` 符合旧设计；非 `_SELF` 通过 `src/select-distillation-model.ts:20-49` 选择 fixed 模型，由 `src/register-tool-result-hook.ts:60-102` 与 `src/register-recall-impression.ts:88-135` 走新增请求路径。
- **影响／待文档化决定**：需在新设计文档明确默认与显式固定模型的鉴权、模型路由、思考级别及输出预算归属；这属于新增特性设计说明，不是旧合同回归。

### [DESIGN_DOC_OUTDATED] §5.1 的全称 disk-first 保证与旧新实现均不符

- **文档**：§5.1 写成“若 appendEntry 抛出，内存状态不变”，§6 又承认部分内部状态先写。交付路径实际会先标记 delivered。
- **实现**：旧 `HEAD:index.ts:373-382` 和新 `src/impression-session-state.ts:73-79` 都在追加前清空全文；问题 3 给出可达错误输出。
- **影响**：开发者若误信该不变量，会漏掉一次 append 失败后当次会话内容不可恢复的旧有路径。

## 验证与剩余风险

- 只读执行 `git show HEAD:<文件>`、`nl`、`git diff`、范围限定的源码读取；完整扫描旧 1060 行入口三个区段、现行入口、所列状态/注册文件、相关配置和结果模块，并读取 HEAD 架构、README、三个既有 subplan 与 HoarePrompt 参考。**未读取**任何密钥、`.pi/impression-debug` 历史或其他审查产物；**未修改**运行代码、未调用模型。
- 校验方式为 CFG 分支与局部 NSP 静态演算；附故障注入只是条件推导，**未运行**需真实 extension 环境的集成测试。外部 `appendEntry` 的抛错可能性以架构 §5.1 已明示的 callee 前提为界；`getAll()` 的实际异常/副作用仍未闭合，不能据此宣称一个回归。
