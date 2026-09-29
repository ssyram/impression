# Impression 结构迁移等价性：有界裁决

> **历史审查快照，非当前代码的重新裁决。** 此报告记录审查时的旧新对照。之后按用户确认做了三处定向修改：`_SELF` 在读取目录前短路；原文交付先 append 独立快照、成功后才清理旧内存引用；Recall 达上限的当次仍交付笔记、下一次入口才交原文。新增回归用例与受影响测试共 63/63 通过，聚焦类型检查及 `npm run check` 通过。本轮未重新运行 tribunal；以下关于旧工作树的 finding 保留作历史证据，不得用于声称当前代码仍有同一缺口或已经获得全称安全证明。第 3 点的非追溯额度已由用户确认为局部 Q.I，见 `../../../principles.md`。

审查基准：嵌套仓库 `HEAD=5f1dcf323a085ececcbd55f70023f1fa05679cbb` 的原 `index.ts`、`src/` 与原架构/README/既有子计划；审查对象为当前拆分后的 `index.ts → extension.ts → src/`，主要比较默认 `_SELF` 下的旧行为投影。方法：三份 fresh-context `gpt-6-sol:high` 独立 challenger/prover → 一份 counter → 一份 judge；原工作流 20 分钟超时中断 judge，按原模型/角色恢复后从 child 会话中的写入调用恢复其 83 行原始报告。原报告均在同目录；本页仅综合，不替代其中的逐路径证明。

## 裁决

- **没有确认正常宿主生命周期下的确定结构迁移回归**。源头对照覆盖启动回放、注册次序、配置命令/补全、skip/save、首次工具结果、Recall、旧 `_SELF` 的 compat 调用及异常分类。58 个先前离线用例及真实 `pi -e` 短路/压缩样本只能支持被覆盖路径，不能证明全称。
- **全称等价证明不成立**。旧 `HEAD:index.ts:555-559,734-738` 在无当前模型时直接原文回退，或已有当前模型时直接做鉴权；新 `src/register-tool-result-hook.ts:60` / `src/register-recall-impression.ts:88` 调用 `src/resolve-selected-distillation-model.ts:4-10`，该函数即使 `spec==="_SELF"` 也先求值 `ctx.modelRegistry.getAll()`，才由下层 selector 判断 `_SELF`。若目录查询抛错，旧通知/Recall 全文交付与新路径不同：`tool_result` hook 抛错后宿主保留原工具内容但旧通知缺失；Recall 工具 execute 抛错而不交付该次全文。这是**条件性合同断链**，不是已证实的正常宿主线上故障。
- **实际宿主限制**：`packages/coding-agent/src/core/model-registry.ts::getAll()` 复制 `ModelRuntime.getModels()`；`packages/ai/src/models.ts::getModels()` 对单个 provider 的 `getModels()` 抛错做 best-effort 捕获，审查未找到正常宿主生命周期下让上述异常透出的具体输入。额外 O(目录模型数) 工作却确定存在；比旧 `_SELF` 路径增加了非必需依赖。若要证明旧路径对异常环境也等价，应在 `getAll()` 前短路 `_SELF`；本轮**未修改运行代码**。
- **预期新增差异**：配置 `distillModel` 默认字段、status/help/补全及 debug 输出扩大，属于授权的新功能，不是逐字旧输出；固定模型路由另有认证/模型质量边界，不通过本轮旧行为等价性审查自动验收。

## 旧有问题（不得归因于拆分）

1. 负 `skip_impression.count` 可产生负透传额度；降低 `maxPassthroughCount` 不追溯钳制现有额度。旧新路径同形。
2. `deliverFullContent` 在 `appendEntry` 前已清空内存并标记 delivered；若持久化失败，同进程原文交付与恢复合同不成立。旧新路径同形，旧架构声称全局 disk-first 与两版源码冲突。
3. 在**可控活动会话 JSONL 条目**的条件下，回放的 `impression-v1.id` 可含路径分隔符，`save_impression` 使用该 ID 拼接路径后可能写到缓存目录外。干净会话中的新 UUID 无此输入，单靠工具调用参数不能制造已存在的该 ID；这是旧有、取决于会话文件信任边界的风险。
4. 默认 `maxRecallBeforePassthrough=1` 时，首次 Recall 重蒸馏后计数达到上限仍直接返回完整原文；旧新一致，不是拆分导致的性能问题。

## SCCO 与余项

- Sound：默认 `_SELF` 的已核对正常路径有条件同构；新增目录查询使无条件 Hoare 合同断链。
- Complete：五份报告覆盖上述入口、主要状态/消费者；没有真实宿主下异常目录枚举的可达反例，也没有证明全环境等价。
- Concise：将预期新功能、旧有问题、条件性新增依赖分别归因；不从旧缺陷推出迁移失败。
- Optimization：`_SELF` 新增目录枚举无助于选当前模型，建议仅对固定模型读取 catalog。是否修改行为与其后的直接测试由用户另行决定。

**对外结论**：不能宣称“拆分保证安全/全部旧行为无条件不变”；可以说“在模型目录正常返回且无额外可观察副作用、相同输入/外部响应时，已核路径未见确定行为回归”。本轮仅审查与记录，不改运行代码，也不以多份报告一致代替实际证明。
