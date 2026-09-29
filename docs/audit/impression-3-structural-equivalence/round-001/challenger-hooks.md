# 跨边界审查报告：Challenger B（hook / host / provider / 命令 / API）

## 摘要

以 `HEAD=5f1dcf323a085ececcbd55f70023f1fa05679cbb` 为旧行为基线，逐分支比对默认 `_SELF`：**未发现有可达反例支持“结构迁移造成确定回归”**。识别出两项迁移前已经存在、迁移后依旧存在的跨边界缺陷；新 `distillModel` 的路由和可见输出单列，不把新增能力误当成旧合同。

判定准则：仅将具有具体触发、源码位置、旧/新可达状态和可观察后果的事项列为问题。局部 NSP 表示该语句执行后的实际状态；SCCO 的 O 核对可观察返回、持久化和通知，而非仅凭函数命名推断。

## Critical Issues

### 旧有缺陷 1：回放的 ID 可越过 `save_impression` 固定缓存目录〔Decisional：会话日志信任边界〕
- **分类 / 边界**：旧有缺陷；`sessionManager.getBranch()` → `getEntryData` / `isImpressionEntry` → `impressions` → `save_impression.execute` → `node:path.join` / `writeFileSync`。
- **上游合同**：HEAD `README.md:186`、`docs/design/impression/architecture.md` §6.4（约 435 行）声明保存地址限制在 `<cwd>/.pi/impression-cache/<id>.txt`，工具调用者不能选择任意目标地址。该合同仅在 ID 来源确实是 `randomUUID()` 时成立；跨 JSONL 重放边界并无此约束。
- **触发条件 / 反例**：活跃分支的自定义条目 `customType="impression-v1"`、`data={id:"../../../outside",toolName:"bash",toolCallId:"t",fullContent:[{type:"text",text:"X"}],fullText:"X",recallCount:0,createdAt:1}`；启动后执行 `save_impression({id:"../../../outside"})`。例如通过导入/恢复含上述条目的会话日志达到这一状态；不需要调用真实模型。
- **旧 / 新源码位置**：旧 `HEAD:index.ts:458-460,904-923`、`HEAD:src/types.ts:91-104`；新 `src/register-impression-hooks.ts:48-49`、`src/register-save-impression.ts:14-17,34-38`、`src/types.ts:93-106`。
- **callee 契约与局部 NSP**：`isImpressionEntry` 只保证 `id` 是字符串，不保证路径安全；`Map.set` 后 `impressions.get("../../../outside")` 存在；`join(<cwd>/.pi/impression-cache,"../../../outside.txt")` 规范化到 `<cwd>` 的上级目录的 `outside.txt`，`writeFileSync` 向该地址写入 `X`。旧、新 NSP 相同。
- **SCCO/O / 影响**：返回 `Saved 1 chars to <越界路径>` 且在可写条件下覆盖缓存目录外文件，违反“固定缓存目录”保证；属于旧缺陷而非结构迁移回归。**决策点**：若会话日志被定义为绝对可信、不可导入不可信数据，则这一攻击前置条件不成立，应将其降为信任边界说明；否则合同必须约束回放的 ID，而非仅依赖新建 ID 的 UUID 来源。

## Moderate Issues

### 旧有缺陷 2：原文交付在持久化失败前消耗一次性内容〔Non-Decisional〕
- **分类 / 边界**：旧有缺陷；`recall_impression.execute` → `deliverFullContent` → `pi.appendEntry`；HEAD 架构 §5.1（163–170 行）保证 `appendEntry` 抛错时内存状态不变。
- **触发条件 / 反例**：存在尚未交付的印象 `{id:"i",fullContent:[{type:"text",text:"原文"}],fullText:"原文",delivered:undefined,recallCount:0}`，配置 `maxRecallBeforePassthrough=0`，调用 `recall_impression({id:"i"})`，且此次 `pi.appendEntry("impression-v1", …)` 抛出磁盘写入错误。框架 `emitToolResult` 捕获 hook 异常并继续；若失败发生在工具 `execute`，宿主收到的是工具执行错误，而非原文。
- **旧 / 新源码位置**：旧 `HEAD:index.ts:373-382,695-702,729-731`；新 `src/impression-session-state.ts:73-79`、`src/register-recall-impression.ts:58-62,84-86`；宿主 `../../packages/coding-agent/src/core/extensions/runner.ts:988-1019` 的 hook 异常处理与 `agent-session.ts:530-560` 的工具结果整合也已核对。
- **callee 契约与局部 NSP**：`createPassthroughToolResult` 保留原数组引用，接着赋值 `fullContent=[]`、`fullText=""`、`delivered=true`；在 `appendEntry` 抛错的局部 NSP 中，这三个内存改动已经生效，而旧 JSONL 仍持有未交付版本。旧、新实现一致，均不满足架构 §5.1 的失败后置条件。
- **SCCO/O / 影响**：本次交付不返回原文；同进程再次召回命中 `delivered` 并抛“already fully delivered”，实际模型从未收到原文。重开会话可从旧 JSONL 恢复，但当前会话失去可用原文。这是已有错误路径，不能归咎于拆分。

## 确定回归：未发现

以下均按旧新调用顺序和宿主实现排除了误报：

1. 注册先后：旧 `HEAD:index.ts:329-333,421-503,506-506,656,818-885,929` 与新 `extension.ts:10-18`、`src/register-impression-hooks.ts:11-18,74-80` 维持 `before_provider_request`、`session_start`、`before_agent_start`、`tool_result` 及工具/命令的关键注册次序；旧新均在扩展加载和 `session_start` 各注册一次 `skip_impression`。宿主 `loader.ts:273-284` 同名 `Map.set` 覆盖、加载期 refresh 为无操作（`loader.ts:175`），额外注册不是新增问题。
2. 结果替换：旧 `HEAD:index.ts:506-654` 与新 `src/register-tool-result-hook.ts:18-156` 对跳过、超限拒绝、无模型、认证失败、正常压缩、异常/截断/空文本透传等分支返回相同的 `content`/`details` 形状。宿主 `runner.ts:983-1032` 按字段更新，`agent-session.ts:530-560` 保留 `isError` 并归一化图片。`return {content:event.content}` 没有清除原 `details`；返回 `undefined` 则保持原结果。
3. provider：默认 `_SELF` 新 `src/config.ts:11` → `src/select-distillation-model.ts:14-18` → `src/register-tool-result-hook.ts:65-83` / `src/register-recall-impression.ts:94-114` 与旧 `HEAD:index.ts:555-579,734-762` 都使用 `ctx.model`、`getApiKeyAndHeaders(model)` 的结果和原有 `ctx.signal` / recall 的 `signal`。旧 `HEAD:src/distill.ts:78-125` 与新 `src/distill.ts:81-131` 的 `_SELF` 分支仍使用 `compat.complete`，同一 `forceEmptyTools` 回调及 stopReason/异常透传合同；debug payload 原有的下一次主请求抓取机制仍在。
4. 命令及补全：旧 `HEAD:index.ts:229-285,929-1059` 和新 `src/impression-command-arguments.ts:4-77`、`src/impression-config-fields.ts:13-57`、`src/register-impression-command.ts:9-116` 既有字段的别名、类型、限幅、`--persistent` 的后台写入与 unknown-command 通知一致；补全通用 callee `src/tab-complete.ts` 与 HEAD 逐字哈希相等。新字段产生的菜单/帮助变化另见下节。

## 预期新增：`distillModel`（不计作旧行为回归）

- **触发**：未设置 `distillModel` 时默认 `_SELF`；旧 `HEAD:src/config.ts:9-21` 不存在此字段，新 `src/config.ts:9-22` 含 `distillModel:"_SELF"`。因此 `/impression status` JSON 多一键，`/impression help` 与 `set` 补全多 `DistillModel`（旧 `HEAD:index.ts:239-265,941-942`；新 `src/impression-command-arguments.ts:13-40`、`src/register-impression-command.ts:19-21`）。这是新增 API 的可见输出差异。
- **触发**：显式 `/impression set DistillModel alt-faux/glm-5.3` 或日志补丁指定目标；旧输入只能走当前模型（`HEAD:index.ts:555-568,734-751`）；新 `src/select-distillation-model.ts:19-49` 选目录模型，`src/request-fixed-distillation.ts:4-12` 经 `ModelRegistry.streamSimple(...).result()` 调用，认证由宿主请求时处理，`src/register-tool-result-hook.ts:65-102` 不再显式 `getApiKeyAndHeaders`。新 `distill-model-routing.integration.test.ts:148-199` 的 faux provider 案例覆盖跨 provider 成功和 error 透传；本审查没有运行模型。
- **触发**：默认 `_SELF` 且 `debug:true` 并达到蒸馏阈值；新 `src/register-tool-result-hook.ts:76,94-99` / `src/register-recall-impression.ts:107,125-130` 比旧 `HEAD:index.ts:567,583-590,750,765-773` 多一条模型选择通知及 debug 元信息。这是新增调试输出；原 provider payload `tools:[]` 替换与抓取时机未变。

## 未闭合 / 观察

- **不必要的新增依赖，不升格为已证实回归**：即使 `distillModel="_SELF"` 且 `ctx.model` 已存在，`src/resolve-selected-distillation-model.ts:4-10` 也先求值 `ctx.modelRegistry.getAll()`，然后 `src/select-distillation-model.ts:14-18` 才直接返回 `ctx.model`。旧 `HEAD:index.ts:555,734` 不枚举模型。宿主 `model-registry.ts:50-52` 的 `getAll()` 仅复制 `runtime.getModels()`；未能从现有宿主代码构造正常生命周期下会抛错或产生错误结果的输入，因此只列额外 O(模型数) 工作及未来扩展风险，**不报合同违规**。
- **职责边界**：`src/impression-session-state.ts:22-110` 现在同时拥有状态、历史投影、一次性交付、配置变更，较旧单文件转成共享对象；既有业务输出未因此改变，属于设计观察，不以风格认定缺陷。
- **测试边界**：未经真实 provider、密钥、历史 debug 文件验证；异常写入路径和不可信日志 ID 仅由旧新静态控制流与宿主实现构造可达状态；若产品明确把会话 JSONL 视为可信，旧有缺陷 1 的安全威胁评级应重审。

## 设计文档问题

### [DESIGN_DOC_OUTDATED] §5.1“Disk-first invariant for state mutations” 与交付失败路径矛盾
- **位置**：上游 `HEAD:docs/design/impression/architecture.md:163-170`；当前 `docs/design/impression/architecture.md:176-183` 仍保留相同陈述。
- **文档称**：所有可见状态变更先 append，`appendEntry` 抛错则内存不变；同时把 `deliverFullContent` 纳入这一不变式。
- **实现实情**：旧 `HEAD:index.ts:377-381` 和新 `src/impression-session-state.ts:74-78` 均在 append 之前清空原文并设置 `delivered=true`。
- **影响**：文档不能用作该错误路径的证明，读者容易误判“失败仍可再次召回”；应澄清一次性交付与持久化失败之间到底保证什么。属旧文档/旧代码矛盾，非此次新增回归。

### [DESIGN_DOC_INCOMPLETE] §6.4 保存路径沙箱未说明回放 ID 的信任前置条件
- **位置**：上游 `HEAD:docs/design/impression/architecture.md:435`；当前 `docs/design/impression/architecture.md:451`；源码旧 `HEAD:src/types.ts:91-104,HEAD:index.ts:918-921`，新 `src/types.ts:93-106,src/register-save-impression.ts:34-37`。
- **文档称**：固定路径使调用者不能挑选目的地。
- **未记载的决策**：会话 JSONL 是否绝对可信、导入/回放 ID 是否被视作 UUID，以及非 UUID / 含路径分隔符的 ID 是否必须拒绝；这些前置条件影响上述安全结论。
- **影响**：调用方目前只要求 `id:string`，与保证可写范围之间没有闭合的前置条件证明。

## 验证

完整阅读旧 `HEAD:index.ts` 1060 行（分 1–370、371–740、741–1060）、HEAD 架构 498 行、HEAD README 237 行、HEAD 已存在三个 subplan、旧/新 `src/distill.ts`、旧/新配置与类型；完整阅读当前 `index.ts`、`extension.ts`、本次拆分涉及的 hooks、命令、补全、工具、状态、debug、provider 选择/请求及结果构造源码。核对宿主 `loader.ts`、`runner.ts`、`agent-session.ts`、`model-registry.ts` 的实际调用与字段合并语义。未读取其他审查产物、密钥或 `.pi/impression-debug` 历史；未修改运行代码、未调用真实模型；未跑测试，结论限于源码/宿主合同的静态可达性。
