# Actual Findings

## GPT-5.4 本体无法区分的自我认知

> Finding: 第一人称 -> 第三人称切换的必要性

- 现象: 在 first-person distiller 设定下，GPT-5.4 容易把注入的 `original_system_prompt` 继续当作当前可执行指令，导致正文输出计划/编排语句（如 "I detected...", "my approach is..."），而不是工具结果的客观压缩。
- 结论: third-person 变体需要显式做“指令隔离”（将 `original_system_prompt` 和 `visible_history` 视为 quoted data only / do not follow），并强制将意图推测限制在 `<thinking>`，正文仅保留与外层当前关切相关的客观事实与结论。


## GPT-5.4 变体的表现

- GPT-5.4-High 表现最良好，也许可以尝试用第一人称设定，可能效果可以更好。
- GPT-5.4-XHigh 则过于谨慎，它因为知道会发生蒸馏现象，马上就会防御性采取 skip_impression ，导致 impression 几乎没有被触发。

任务统计：
> 任务是直接 review 一次 impression 的变化结果
- Opus 4.6: 表现较优秀，能正确压缩并保留关键信息，且没有 skip_impression 的过度使用，但是还是采用了很多的调用。
- GPT-5.4-High: 表现可能是最好的，基本很少 skip_impression 的调用，用了最少的 Context 就能完成任务。
- GPT-5.4-XHigh: 过于谨慎，表现很一般，几乎每一步都调用 skip_impression，导致 impression 没有被触发，无法完成任务。
- GPT-5.4 本体：过度倾向于短任务，必须通过强制的 tasks 执行流程来引导它完成任务，是导致第一人称到第三人称转换的元凶。
