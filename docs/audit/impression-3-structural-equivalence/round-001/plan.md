# Impression 结构迁移等价性审查 — round 001

## 对象与来源

- 审查对象：嵌套仓库 `my-plugins/impression/` 当前工作树的 `index.ts`、`extension.ts` 与本轮新增/修改的 `src/` 运行文件；重点是把原 `index.ts` 拆分到模块后，默认 `_SELF` 路径的旧稳定行为是否被改变。
- 原始一手基准：该嵌套仓库 commit `5f1dcf323a085ececcbd55f70023f1fa05679cbb` 的 `index.ts`、`src/config.ts`、`src/distill.ts`、`src/types.ts`、`docs/design/impression/architecture.md`、相关 subplans。用 `git -C my-plugins/impression show HEAD:<path>` 读取；旧架构文档与旧源码冲突时陈述冲突，不用当前新文档反向定义旧行为。
- 新功能 `distillModel` 的允许差异单独列示，不用它掩盖旧分支行为回归。`index.ts` 仅导出、新模块拆分属有意的组织变更，不等于授权改变状态、日志、通知、工具返回与错误行为。

## 本轮判据及边界

1. Sound/Hoare：对 session_start replay、配置 patch、before_agent_start、tool_result 的 skip/阈值/成功/透传/异常、Recall 的次数/已交付/失败、skip/save、debug 捕获，逐分支比较相同前置条件下的状态和可见输出；用自然 strongest postcondition 标注状态变换与调用方前置条件。
2. Complete：枚举所有迁移出的调用点，检查注册顺序、状态归属、分支覆盖、持久化次序和错误路径；可用旧源码与新源码、宿主 API 源码和离线 faux 测试作证据，不以测试全绿当等价证明。
3. Concise/Optimization：指出本轮拆分是否产生不必要职责变化或新增共享状态；建议若不属于本职等价问题须说明为什么影响用户目标，不擅改代码。
4. finding 必须给旧/新文件位置、可达触发、旧/新输出或状态、为何违反旧合同；无足够证据标未闭合。区分 preexisting bug、预期新功能、确定回归与风险假设。不要访问真实 provider、密钥、私人会话或 `.pi/impression-debug` 历史材料。

## 独立角色和交付

- A `challenger-state.md`：session/config/persistence、skip/save/recall 生命周期反例。
- B `challenger-hooks.md`：事件顺序、host/provider API、tool result/debug/错误路径反例，兼查 O。
- C `prover.md`：从旧契约出发建立 Hoare 逐分支等价证明并列明不能证明的假设。
- D `counter.md`：独立逐条反驳 A/B 的候选，亲自核对旧新源码及运行机制。
- E `judge.md`：独立核实 A/B/C/D 关键事实，按 SCCO 裁定成立/伪问题/未闭合与是否可宣称安全。

A/B/C 互不读取对方产物；D 在前三份交付后启动，E 在 D 后启动。仅此一轮，不因 agent 自述触发无限追加轮次。未覆盖或不能证明的条件如实交给用户，不以形式上的“收敛”宣称全称安全；本轮不修改运行代码。
