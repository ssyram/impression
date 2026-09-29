# Impression：已确认的局部 Q

本页只记录已由用户确认、会改变设计判断的局部意图；不是整个 Impression 功能的完整 Q，也不因现有代码恰好如此而取得权威。

## Q.I — 已授透传额度不追溯回收

- **来源**：用户在讨论 `skip_impression` 已授额度与后续 `maxPassthroughCount` 调低时，明确确认“3 是我们已经接受的”，并要求将这项非追溯原则记入 Q。
- **意图**：一次 `skip_impression` 调用已经授予而尚未使用的透传次数，不因**随后**降低 `maxPassthroughCount` 自动减少；新上限约束之后的领取，不撤销此前已授次数。
- **范围**：只管同一会话的已授 `skip_impression` 余额，不推广为所有配置、授权、历史会话或错误输入的全局规则；对负 `count` 不作规范性认可。

实现层的配置与状态合同由 [架构 §5.1／§6](design/impression/architecture.md) 承接：领取时按当时上限限定本次额度，之后调整上限不改既有余额。
