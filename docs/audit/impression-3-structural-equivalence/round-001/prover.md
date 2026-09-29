# 规格—实现审计报告：Prover C（拆分后默认 `_SELF`）

## 摘要

以 `5f1dcf323a085ececcbd55f70023f1fa05679cbb` 的设计、README、三个既有子计划和旧源码可达行为为**上游合同**，逐分支对照现行 `index.ts → extension.ts → src/`。默认 `_SELF` 的主要成功路径、持久化顺序及结果内容保持同构；**不能证明全入口结构等价**：两条蒸馏入口新增了旧路径不需要的模型目录查询，查询失败时旧的保留原文/正常召回后置条件断裂。其余明确的文档冲突是拆分前已有缺陷；新 `distillModel` 字段和非 `_SELF` 路由另列，不反向当作旧行为规范。

## 证明边界与观察等价

- 记旧会话状态 `S₀=(raw,cfg₀,stats,remaining,estimate,map,captureFlag)`；新状态 `S₁` 是 `createImpressionSessionState(pi)` 返回的同名字段对象，投影 `π(S₁)` 忽略新增 `cfg.distillModel`。在已完成 `session_start`、原始配置及活跃分支记录都未指定新字段时，`cfg₁.distillModel="_SELF"`，其余 `π(S₁)=S₀`。比较 `O`：工具事件的 `content/details/isError`（未显式覆盖时保留宿主原字段）、UI 通知/状态、系统提示词、工具注册描述与补全、JSONL 自定义条目次序/数据、模型调用上下文及选用模型/预算、保存文件、异常与原始内容可恢复性；新字段的显示、额外 debug 元数据另记为新增观测，不伪装成逐字相等。
- 使用局部 NSP：只在某分支的 `Pre` 成立时按语句更新可达状态，逐层应用 callee 合同；不把“源码含某个检查”误当调用者保证。外部 `appendEntry` 的前提/保证来自 HEAD `architecture.md` §5.5（同步、活跃分支、失败抛出），`buildSessionContext/convertToLlm` 取活跃叶来自 §5.5，`distillWithSameModel` 来自 §5.3；旧 `src/` 中内容构造、阈值、格式化函数保持原文件，旧/新调用顺序另行核对。`getAll()` 在 HEAD 的旧蒸馏合同中没有前提或效果保证，因此不能偷偷添加“不抛错”前提。
- 证明仅是源码控制流的相对等价证明，**未调用真实模型或读取任何密钥、`.pi/impression-debug` 历史、其他审查产物**。对随机 ID、时间戳按相同 nondeterministic 选择耦合；对宿主钩子、文件系统、模型回复按相同输入/回复耦合。不能由源码独立证明跨扩展修改、网络模型语义或宿主对 `getAll()` 永不失败。

## Critical Issues

### Issue 1：默认 `_SELF` 仍无条件读取模型目录，旧的无模型/鉴权回退不再是封闭合同【确定回归；Non-Decisional】

- **位置**：旧 `HEAD:index.ts:554-565,734-748`；新 `src/register-tool-result-hook.ts:60-71`、`src/register-recall-impression.ts:88-102`、`src/resolve-selected-distillation-model.ts:4-10`、`src/select-distillation-model.ts:14-18`。
- **旧合同**：HEAD `architecture.md` §3、§5.3 和 `README.md:11-16,141` 指定以当前活动模型蒸馏；旧实现先取 `ctx.model`，无模型则通知并返回原始 `event.content`（召回则直接交付全文），有模型才调用 `getApiKeyAndHeaders(model)`。模型目录不是这两个分支的前提。
- **新 NSP／触发条件**：默认 `cfg.distillModel="_SELF"`，给定一条达到阈值的非错误 `tool_result`（例如 `toolName="bash"`、`content=[{type:"text",text:"x".repeat(2048)}]`、无跳过/透传）、`ctx.model=undefined`、`ctx.modelRegistry.getAll()` 抛 `Error("catalog unavailable")`。旧在 `HEAD:index.ts:556-559` 正常返回 `{content:event.content}` 并告知 `no active model selected`；新先在 `resolveSelectedDistillationModel` 的第 8 行求值 `getAll()`，**在** `selectDistillationModel("_SELF",...)` 能走无模型分支**之前**抛错，`tool_result` 的 Promise 拒绝，不返回旧有原文回退/通知。存在已存未交付印象、`recallCount=0<maxRecall=1`、无透传额度、同样无模型且目录查询抛错时，旧 `HEAD:index.ts:734-739` 正常 `deliverFullContent`、写回已交付记录；新 `register-recall-impression.ts:88` 即拒绝，原文未交付、`delivered` 不变。即使 `ctx.model` 存在且鉴权会失败，`getAll` 抛错也阻断旧的鉴权失败回退。
- **影响／为何违反**：对于模型目录暂时不可用但当前模型或其缺失已可判断的上下文，旧保证原文仍然可达、召回不被目录查询阻塞；新多出无保护的外部依赖和异常路径。不是“模型选择器 `_SELF` 分支会回退”即可证明，因为实参先求值。根因是把仅固定模型需要的 `getAll()` 放在 `_SELF` 选择前。
- **必要限定**：若宿主另有可核验的强保证 `getAll()` 在所有这些时点总正常返回，正常路径的输出仍等价；该强保证**不在指定旧上游合同内**，因此全称证明在此断链。这不是宣称真实宿主通常会抛错。

## Moderate Issues（旧有缺陷，非结构迁移回归）

### Issue 2：README 中默认“首次召回返回重蒸馏笔记”与旧/新实际返回全文相反【旧有缺陷；Decisional】

- **位置**：上游 `HEAD:README.md:13-16,134,184`；旧 `HEAD:index.ts:806-814`，新 `src/register-recall-impression.ts:154-161`。
- **触发条件**：默认 `maxRecallBeforePassthrough=1`，已有未交付印象 `recallCount=0`、无透传额度、有效模型与鉴权，重蒸馏响应为一个非空且短于原文的笔记（例如 `"ok"`）。
- **旧/新可达状态与输出**：两版均先把 `recallCount` 加到 `1`，立即检查 `1 >= maxRecall` 并调用 `deliverFullContent`；本次返回原始 `fullContent`、重追加 `delivered=true/fullContent=[]/fullText=""`，而非返回笔记；后续同 ID 召回抛错。README 的“On the first recall ... re-distills ... After the configured number of recalls, full content”及表格“if recallCount < maxRecall returns re-distilled notes”让用户将默认第一次召回当作获取更新笔记；实际第一次就交付全文。HEAD `architecture.md` §3 也把“否则返回笔记、增加计数”概括成同一分支，未体现先加计数再判断上限。
- **影响／根因**：用户不能依赖默认值取得一次压缩召回，可能额外消耗长原文上下文。是旧计数顺序与旧文档冲突，非新拆分引入；改文档还是改计数行为涉及语义/兼容性决策。

### Issue 3：设计文档的全局 disk-first 断言在原版已被交付路径否证【旧有缺陷；Decisional】

- **位置**：上游 `HEAD:docs/design/impression/architecture.md:152-170,309-329,361-374`；旧 `HEAD:index.ts:373-382`、新 `src/impression-session-state.ts:73-79`（统计同类旧 `HEAD:index.ts:346-350`，新 `src/impression-session-state.ts:43-50`）。
- **触发条件**：`recall_impression` 已定位未交付 ID，满足 `recallCount>=maxRecall`（如配置 `maxRecallBeforePassthrough=0`），`pi.appendEntry("impression-v1",...)` 在交付时抛 `Error("disk full")`。
- **旧/新可达状态与输出**：两版 `deliverFullContent` 均先建立引用原数组的结果，随后把内存对象的 `fullContent=[]`、`fullText=""`、`delivered=true`，**再**追加；抛错使执行未正常返回，却留下内存中已交付状态且活跃 JSONL 未写入交付记录。再次调用同 ID 召回会报“已经完全交付”，尽管本次内容因抛错没有返回给 LLM；重新 `session_start` 才从旧 JSONL 恢复全文。与 §5.1/§5.5 的“append 抛错时内存不变”断言冲突；§6 再承认部分 memory-first 例外，但未消除交付路径和全称断言的矛盾。
- **影响／根因**：持久化故障时同会话无法召回本应仍未交付的内容，误导按设计文档证明恢复性质；旧代码原本如此，迁移没有新增故障。应由设计方确定要收窄文档还是改变交付异常语义。

## 新 `distillModel` 特性差异（与迁移回归隔离）

1. 【预期新增；Non-Decisional】默认 `_SELF` 的配置显示多出 `"distillModel":"_SELF"`：旧 `HEAD:src/config.ts:9-21` 不生成此字段，旧 `HEAD:index.ts:941-943` 的 `/impression status` JSON 不含它；新 `src/config.ts:9-22` 与 `src/register-impression-command.ts:19-21` 会显示它，`/impression help` 字段列表和 `set` 补全也分别在 `src/impression-command-arguments.ts:13-42` 多出 `DistillModel`。`Pre`：默认空原始配置、`/impression status`；`NSP`：旧 JSON 不含该键，新 JSON 含该键；`Post/O`：显示输出非逐字相同，但属于新增字段暴露，不将新增工作树子计划反过来当旧规范。
2. 【预期新增；Non-Decisional】`debug=true` 且默认 `_SELF` 达阈值时，新 `src/register-tool-result-hook.ts:76,94-99` 和 `src/register-recall-impression.ts:107,125-130` 额外通知所选模型/effort，并在 debug provider 捕获元数据增加 `modelProvider/modelId/modelApi/reasoningEffort/selection`；旧 `HEAD:index.ts:567-588,750-772` 没这些输出。正常蒸馏请求仍走 `complete`：新 `src/distill.ts:90-92` 仅 `fixedTarget` 时改走 `requestFixedDistillation`，两入口在 `_SELF` 下传 `undefined`。额外 debug 输出是新特性 O 差异，而非笔记/持久化回归。
3. 【预期新增；未作旧合同外推】显式 `/impression set DistillModel "provider/model"` 或磁盘配置/活跃分支补丁指定非 `_SELF` 后，新 `src/select-distillation-model.ts:20-49` 可以选择固定模型，`src/request-fixed-distillation.ts:4-12` 使用 `modelRegistry.streamSimple(...).result()`；旧 `HEAD:index.ts:554-579,734-762` 只用活动模型。HEAD README/设计的“same active model”只用于本报告基准旧行为，不用**当前工作树**子计划重定义旧 `_SELF` 路径。此分支不是默认 `_SELF` 的结构迁移结论。

## Prover C：从旧合同出发的逐入口 Pre → 局部 NSP → Post 对照

表中 `≃` 表示上述投影和相同外部回复/随机值条件下 O 等价，`×` 表示明确反例或尚未建立额外前提；`append(X)` 表示相同类型、数据和先后顺序的会话记录。必要的隐含前提：`session_start` 已建立配置、所有旧配置字段经相同验证钳制；hook 获得相同事件和 session 分支；被复用的原 `src/` callee 保持其旧合同；成功 `appendEntry` 同步落在活跃分支；模型目录查询正常返回时不改变外部状态。最后一项**不**来自旧合同，故相关行只作条件证明。

| 入口/分支 Pre | 旧局部 NSP → Post（旧位置） | 新局部 NSP → Post（新位置） | 结论／必要前提 |
|---|---|---|---|
| 扩展工厂注册一次；默认配置 | 闭包初始化 map、raw、cfg、统计、剩余额度、捕获标志；按 `before_provider_request`, `session_start`, `before_agent_start`, `tool_result`, `recall`, `skip`, `save`, command 注册（`HEAD:index.ts:288-296,329,421,499,506,658,818,887,929`）。 | `index.ts:1 → extension.ts:10-18` 构造状态对象并以相同顺序注册；`cfg.distillModel="_SELF"`。 | 投影下 ≃；注册时 `registerSkipTool()` 对同一 cfg 嵌入相同上限。 |
| `session_start`：文件缺失/解析错或正常；活跃分支含任意顺序的五类 custom | 加载磁盘、通知错误、计数和 map 清零；分支逐项最后写胜出；非法字段通知并删、数值下界警告钳制；不启用 debug 时删除 debug mode；重新注册 skip、刷新状态（`HEAD:index.ts:421-497`）。 | 同样的循环、分支 `continue`、钳制和后置效果（`src/register-impression-hooks.ts:18-76`）；新字段校验及 `_SELF` 跳过 `warnUnresolved...`。 | 对旧字段与旧日志 ≃；循环不变式：扫描前 k 项所得每类最新有效记录 = 旧/新对应字段，map 中每 ID 最后一条胜出；k→k+1 由四个 `continue`/最后 map 更新维持，有限分支项终止。新字段显示单列。 |
| `before_provider_request`：`!debug∨!capture` / 两者真 | 前者无变化；后者先清标志、尝试保存主载荷，异常只发 warning（`HEAD:index.ts:298-333`）。 | 同 guard、先清后调用同捕获体（`src/register-impression-hooks.ts:12-16`，`src/impression-debug.ts:5-28`）。 | ≃；只读静态分析未读取 debug 目录。 |
| `before_agent_start`：任意 `systemPrompt` | 返回原提示词加双换行及 `getImpressionSystemAppendTemplate()`（`HEAD:index.ts:499-503`）。 | 同一表达式（`src/register-impression-hooks.ts:79-81`）。 | ≃；模板 callee 相同。 |
| `tool_result`：工具名 recall/skip / `!enabled` | 原样不介入；状态及统计不变（`HEAD:index.ts:506-508`）。 | 同分支、相同顺序（`src/register-tool-result-hook.ts:19-21`）。 | ≃。`save_impression` 的 `tool_result` **两版都**不在自调用免除列表中；不能擅自补排除。 |
| `tool_result`：`remaining>0` 且长度 `>1.5*estimate` 或 `>max(10*minLength,10240)` | 构造 ID，先 map.set 再 append impression、递减后 append passthrough 状态、warning、返回包含 ID 的拒绝文本（`HEAD:index.ts:509-530`）。 | 完全相同的赋值、append、文本顺序（`src/register-tool-result-hook.ts:22-39`）。 | 正常 append 下 ≃；任一 append 抛错时逐语句相同旧有异常窗口，不能据文档的全局 disk-first 假定无内存变化。 |
| `tool_result`：额度>0 且不过限 | 递减、append 模式、累加并 append 全文字数统计、可选显示/状态、通知，返回 `undefined`（`HEAD:index.ts:531-542`）。 | 对应 `src/register-tool-result-hook.ts:41-47`、`src/impression-session-state.ts:36-56`。 | ≃；原事件内容透传而非新建 `{content}`。 |
| `tool_result`：额度=0，配置规则命中 / 未命中但错误 `errorMinLength=-1` / 错误长度未达阈值 / 正常长度未达阈值 | 规则通知或由阈值 callee 生成各自 skip 文本；无蒸馏、无 append，`undefined`（`HEAD:index.ts:544-553`）。 | 同一 matcher/阈值 callee、相同通知与返回（`src/register-tool-result-hook.ts:49-58`）；错误边界 `< threshold`，恰等于阈值继续（HEAD 既有子计划 error-result 第 7–16 行）。 | ≃；匹配器的精确工具名/字符串条件/非法正则 fail closed 仍由同一 `src/should-skip-distillation.ts` 保证。 |
| `tool_result`：需要蒸馏、无模型 / 有模型但鉴权失败 | 无模型立即 warning + `{content:原数组}`；有模型仅鉴权后失败时同样回退（`HEAD:index.ts:554-564`）。 | `resolveSelected...` **先** `getAll()`；若成功则 `_SELF` 分支得到原模型/无模型，同样鉴权与回退（`src/register-tool-result-hook.ts:60-71`）。 | 成功目录查询时 ≃；目录查询抛错时 ×（Issue 1），这是旧 `Pre` 不包含的新增必需前提。 |
| `tool_result`：模型、鉴权、目录均可用；蒸馏抛错/异常 stop、`length`、空、哨兵或不短于原文 | `getEntries()+getLeafId()` → 原生历史；相同预算、内容和提示词、`complete()`；callee 按原因回退；累加原文字数、append stats → log、通知原因/失败、返回 `{content:原数组}`（`HEAD:index.ts:565-626`；`HEAD:src/distill.ts:35-162`）。 | `src/impression-session-state.ts:92-94`、`src/impression-output-budget.ts:3-8`、`src/register-tool-result-hook.ts:73-128`；`src/distill.ts:90-92` 在 `_SELF` 下 `fixedTarget=undefined` 仍调用 `complete()`；结果分类后半段不变。 | 核心内容、条目及原因 ≃；debug 的额外通知/元数据不逐字等价，归新增 O。callee 异常分类只覆盖 `complete` try 内抛错，旧/新相同。 |
| `tool_result`：蒸馏产出非空且短笔记 | append stats、map.set + append impression、append distill-log、返回模板化 ID+笔记及 thinking（`HEAD:index.ts:628-653`）。 | 同次序同内容构造（`src/register-tool-result-hook.ts:131-154`）。 | ≃（新字段/debug 增量除外）；对 `append` 故障的 memory-first 窗口也相同。 |
| `recall_impression`：ID 不存在 / 已交付 | 分别抛相同错误；无副作用（`HEAD:index.ts:695-703`）。 | 相同错误/顺序（`src/register-recall-impression.ts:58-63`）。 | ≃。 |
| `recall_impression`：额度>0 且超估计/硬上限 / 不超限 | 前者额度--、append、warning、返回拒绝文本但保留 impression；后者额度--、append、累计 stats、引用原数组交付并清空存储/append 已交付记录（`HEAD:index.ts:704-727`）。 | 对应 `src/register-recall-impression.ts:64-82` + `src/impression-session-state.ts:59-79`。 | 正常返回 ≃；交付 callee 返回数组引用且只**重赋值**原字段，保留 LLM 内容；append 失败旧有缺陷见 Issue 3。 |
| `recall_impression`：无额度且 `recallCount>=maxRecall` | 先统计再交付全文（`HEAD:index.ts:729-732`）。 | 同序（`src/register-recall-impression.ts:84-87`）。 | ≃；`maxRecall=0` 直接命中。 |
| `recall_impression`：未达上限、无模型 / 有模型但鉴权失败 | 无模型通知并统计/交付；鉴权失败先将计数设为上限，再统计/交付（`HEAD:index.ts:734-747`）。 | 先读目录再走 `_SELF`/鉴权对应分支（`src/register-recall-impression.ts:88-103`）。 | 目录正常返回时 ≃；目录抛错时 ×（Issue 1）。 |
| `recall_impression`：目录及鉴权成功，重蒸馏透传（含 failure） | 原工具名/全文/历史重蒸馏；failure 时先 append 异常日志并报错，否则原因通知；计数置上限、统计、全文交付（`HEAD:index.ts:748-804`）。 | 同一请求/预算/分支（`src/register-recall-impression.ts:104-153`）；`_SELF` 仍是 `complete`。 | 核心 O ≃，debug 扩展输出单列；若日志 append 抛错，两版均在计数更新前中断。 |
| `recall_impression`：有效短笔记且计数加一后 `>=maxRecall` / `<maxRecall` | 前者统计后全文交付；后者 append 更新记录、统计、返回笔记（`HEAD:index.ts:806-814`）。 | 同序（`src/register-recall-impression.ts:154-161`）。 | 源码间 ≃；前者同时给出旧文档反例（Issue 2）。 |
| `skip_impression`：`count=0` / 缺理由 / 缺估计 / 非正有限估计 / 超硬限 / 有效正数 | 依次：取消并 append；四类拒绝且状态不变；最后覆写 `remaining=min(request,max)`, `estimate` 并 append、回显（`HEAD:index.ts:818-885`）。 | 相同参数 schema、描述、校验次序和结果（`src/register-skip-impression.ts:8-59`）。 | ≃；`count` 省略取 1、非整数/负数未专门校验的旧可达行为仍旧，不将其误记为新缺陷。 |
| `save_impression`：ID 不存在 / 已交付 / 其余（read 原文件存在/不存在） | 前两支抛错；read 文件可比对则可选提醒，随后写固定 `process.cwd()/.pi/impression-cache/<id>.txt` 并返回字符数/路径（`HEAD:index.ts:887-927`）。 | 同检查、提醒条件及固定路径（`src/register-save-impression.ts:8-41`）。 | ≃；文件系统调用是否成功是共同外部前提，不读取真实缓存/密钥。 |
| `/impression`：空/help 别名 / status 别名 / on-off / load 空文件 / load 有效或无效字段 / set 解析失败、未知字段、值类型错、钳制成功、持久化失败 / 工具列表空或有效 / 未知命令 | 按优先级相应 notify；正常 patch 先 append、然后 raw/cfg 更新和重新注册 skip；`--persistent` 后台写文件；未知项警告（`HEAD:index.ts:404-419,929-1059`）。 | 分支与 patch 顺序对照 `src/register-impression-command.ts:12-116`、`src/impression-session-state.ts:97-109`、`src/impression-command-arguments.ts:45-78`、`src/impression-config-fields.ts:13-57`。 | 旧字段效果 ≃；status/help/字段补全增加 `distillModel` 为新增 O；旧 README 将空命令描述为打印配置但旧源码已打印帮助，见观察。 |
| 命令补全、三个工具 `renderCall/renderResult`、showData docker/UI 发布 | 补全基于子命令和旧字段；recall UI 显示调用/截断 thinking；skip UI 显示 count/理由/估计；showData 的 docker/sidebar 或 footer 分流（`HEAD:index.ts:39-124,254-285,353-370,660-694,826-839`）。 | `src/impression-command-arguments.ts:4-78`、`src/register-recall-impression.ts:25-57`、`src/register-skip-impression.ts:22-31`、`src/impression-status.ts:4-37`、`src/impression-session-state.ts:52-71`。 | 旧候选、已有工具 UI 和旧状态 ≃；`DistillModel` 是新增候选。 |

### callee 合同与完整性缺口

1. `loadConfig()/resolveConfig()/saveLocalConfig()`：旧 `HEAD:src/config.ts:9-90` 与现行 `src/config.ts:9-91` 除 `resolveConfig` 多一字段外一致；调用者在 `session_start`/`load` 钳制并去除不兼容旧字段。`applyConfigPatch` 的旧合同要求成功 append 后再更新内存（HEAD `architecture.md` §5.1），旧 `HEAD:index.ts:404-419` 与新 `src/impression-session-state.ts:97-109` 都满足这一**局部**断言；不能将其泛化到 `deliverFullContent`。
2. `distillWithSameModel()`：旧 `HEAD:src/distill.ts:35-163` 与新 `src/distill.ts:37-169` 除可选 `fixedTarget`/headers 类型外正文相同；在 `_SELF` 的两处调用第九实参均为 `undefined`，故没有迁移到 registry streaming，仍由 `complete(model, context,{apiKey,headers,maxTokens,signal,onPayload})` 发起。`forceEmptyTools` 和结构化上下文两个 callee 在 HEAD 未变；对实际 provider 原始回包/副作用没有真实模型实验，证明是“同一外部响应 ⇒ 同一处理结果”。
3. `resolveSelectedDistillationModel()` 的 callee 前提不能闭合：`src/resolve-selected-distillation-model.ts:5-10` 在 `selectDistillationModel` 的 `_SELF` 守卫前执行 `getAll()`。**逐分支穷尽后的唯一新控制流断链**是目录读取失败；自调用/禁用/额度/规则/阈值提前返回支根本不触发它。需由代码或宿主明确提供 `getAll()` 总成功的强保证才能将条件性等价提升为全称等价。
4. SCCO 的 `O` 不仅比较用户可见笔记：JSONL 的 stats/impression/log 顺序及失败窗口、save 绝对路径、通知、状态和调试输出已逐行比较。旧 README `/impression` 空命令“打印 JSON”（`HEAD:README.md:162`）与旧源码 `HEAD:index.ts:937-943` 的“帮助”冲突，现行 `src/register-impression-command.ts:15-21` 延续帮助——**旧有文档缺陷**，不是迁移引入的 finding。HEAD 设计 §2/§5.1 将所有状态/入口置于 `index.ts` 的**模块地图**随着拆分过时，详见下节；现行工作树设计文档未作上游依据。
5. 没有运行真实模型/访问凭据或 debug 历史；未核验宿主 `getAll()` 的无异常承诺、与其他插件叠加的事件改写、随机 ID/系统时间和文件系统竞争。只读源码证明不能消除这些环境前提；尤其不要把 `getAll()` 的新前提默默包装成旧合同。

## Design Documentation Issues

### [DESIGN_DOC_OUTDATED]：旧模块地图和“相同模型”表述已不适用于新结构【预期新增/迁移记录缺口；Non-Decisional】

- **ARCHITECTURE.md 节**：HEAD §2 `index.ts` 模块地图（`HEAD:docs/design/impression/architecture.md:11-37`）、§5.1 factory closure（`:150-170`）、§5.3 distill 入口（`:212-233`）、§6 same-active-model 决策（`:427-435`）。
- **旧文档／新代码**：旧文档描述所有事件/工具/闭包状态位于 `index.ts`、蒸馏只用当前模型；现行 `index.ts:1` 只重导出，`extension.ts:10-18` 组合 `register-*`，状态在 `src/impression-session-state.ts:10-34`，非 `_SELF` 可以经 `src/request-fixed-distillation.ts:4-12` 走固定模型。默认 `_SELF` 请求仍由原 `complete()` 发出，不应将旧“相同模型”句子据此误报为默认分支回归。
- **影响／待记录设计决策**：未来维护者按旧模块地图在 `index.ts` 查找事件与状态会误判真实调用图；设计文档应说明共享可变状态对象、默认 `_SELF` 与固定模型的不同请求/鉴权边界，以及是否允许 `_SELF` 依赖目录读取。若只将 HEAD 文档视为历史快照，则是版本差异而非声称当前工作树文档缺内容。

### [DESIGN_DOC_OUTDATED]：disk-first 全称断言原本就与实现不符【旧有缺陷；Decisional】

- **ARCHITECTURE.md 节**：HEAD §5.1、§5.4、§5.5（尤其 `:163-170,309-329,361-374`）。
- **旧文档／旧新代码／影响**：文档称 append 抛错内存不变；旧 `HEAD:index.ts:373-382` 及新 `src/impression-session-state.ts:73-79` 都先清空/标记交付再 append。具体同会话故障反例与设计选择见 Issue 3；这不是迁移造成的设计过时。

## Verification

- 阅读上游 `git show HEAD:docs/design/impression/architecture.md` 全 498 行、`git show HEAD:README.md` 全 237 行、三个 `git show HEAD:docs/design/impression/subplans/...` 全文、旧 `HEAD:index.ts` 全 1060 行及旧相关 `src/config.ts`、`src/distill.ts`、`src/types.ts`；读取现行 `index.ts`、`extension.ts` 和本报告逐行引用的 `src/` 注册、会话状态、配置、蒸馏、模型选择、预算、命令/UI 文件。对未修改的被调用 `src/` 文件只依赖 HEAD 与当前相同的调用界面并核查旧实现；未运行任何模型/访问受保护内容。
- 源码静态对照与反例构造；未运行会调用真实 provider 或写业务状态的集成测试。主结论：**条件性等价 + 一处可构造的默认 `_SELF` 控制流回归 + 两处旧有合同缺陷**。残余风险：模型目录真实异常频率未经现场测试，宿主 API 额外保证未经核验；强语义和跨扩展互操作不在该源码证明内。
