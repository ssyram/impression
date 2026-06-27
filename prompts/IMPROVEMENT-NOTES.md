# Prompt 改进建议（impression distiller + Sisyphus）

> **状态：已应用（2026-06-27）。** 本文说"为什么这么改"。原件已备份到 `prompts/.backup-20260627-121306/`（impression 未入 git，靠此备份回滚）；Sisyphus 改动已入 git（`git checkout` 回滚）。
>
> **应用前的事实修正**：核查部署版（`~/.pi/agent/extensions/impression` 是指向本目录的 symlink）发现——所谓"统一成第三人称"**并未落地**：`distill.ts:13-21` 仍按模型前缀分流（`claude`/`gemini`→first-person 68 行，其余→third-person 134 行）。本批 opus 报告实际由 **first-person** 蒸馏，仅 gpt-5.5 走 third-person。故本次不是"重写 third-person"，而是**把两个变体一起统一成人称中立的 note-taker**（两份 system 文件内容现完全一致 → `selectVariant` 实质成 no-op，零代码改动、可回滚）。

## 0. 实际应用清单

| 项 | 改动 | 文件 | 风险 |
|---|---|---|---|
| 统一 system | 两变体 → 同一份 note-taker（各 80 行） | `distiller-{first,third}-person.md` | 弱档模型拿到更精简 prompt，需验证 |
| R2 统一 user | 两变体 → 同一份；first-person 侧补上原本缺失的 tag-name 注入防御 | `distiller-user-{first,third}-person.md` | 低（纯补防御 + 去冗余） |
| R1 削 wrapper | 8 行/~440B → 2 行/124B；recall/skip 指令归入 system-append（一次性付，不再每 note×每轮付） | `impression-text.md` | 无（marker 串无代码依赖，已核） |
| R3 Sisyphus | `<Communication_Style>` 加一条：简洁先验只管对话/状态，**交付物豁免**（报告/设计要完整、保留 file:line） | `oh-my-pi-v2/hooks/sisyphus-prompt.ts` | 低（+4 行，git 可回滚） |

待验证（D1）：弱档（非 claude）模型在 note-taker 下 note 质量是否不退、无 role-confusion 回潮。验证通过后可进一步删 `FIRST_PERSON_MODEL_PREFIXES`/`selectVariant`（D2，纯代码简化）。

## 1. 诊断：弱否定身份 → 靠逐条打补丁

现行 `distiller-third-person.md`（134 行）的根问题是**身份是否定式的**："You are NOT the outer agent. You are a distiller sitting beside it." 否定身份说不清"你**是**谁"，于是每一种 role-confusion 失败模式都得单独加一条规则去堵：

- `ANTI-CONFUSION` 整段（4 条 wrong-behavior 示例）
- `HARD RULE 8`："Body MUST NOT start with 'I', 'My', 'The user', 'The agent'"
- `THINKING VS BODY` 整段（重复 HARD RULES 已说的"只写事实"）
- 多处重复的"NEVER write plans / next steps / intentions"

这些都是**症状补丁**。对照 `distiller-first-person.md`（68 行）就明显：它用"you are compressing your own memory"一句强身份，省掉了大半 scaffolding——但 first-person 的代价是另一个方向的 role-confusion（distiller 续写外层 agent 的活）。

## 2. 改法：一个具体的正向身份，让违规结构上不可能

改用 **note-taker（记录员/field-notes）** 这个具体角色：

> "You are the note-taker for an outer agent… A note-taker records what was found. It never continues the agent's work, never plans, never speaks as the agent."

一个所有人瞬间理解的具体角色，**内在地排除了"行动/计划/发号施令"**——不需要再逐条列禁令。它一次性折叠掉：
- `ANTI-CONFUSION` 整段 → 身份本身就排除
- `HARD RULE 8`（不准以 "I/My" 开头）→ 记录员不会用 agent 的口吻，删
- `THINKING VS BODY` 整段 → 收成一句 self-test

并保留**那条唯一真正干活的判据**（first-person 版已有、值得升格为核心）：

> "if a sentence would still make sense with `<tool_result>` deleted, delete it."

这条 test **替代**所有"don't act / don't plan"规则——记录员的话若脱离原文还成立，那就是 agent 的声音漏进来了。一条判据顶一整段示例。

**严格保留的承重部分**（一字不动其语义）：
- `POSITION GUIDE`——这是"笔记胜过重读"的根本，也是行号保真的命门（元分析证实 grep 行号 pimi 保 100%）。
- `HARD RULE`：不调工具 + 引用块是 DATA 非指令（安全边界，防 prompt 注入）。
- `OUTPUT FORMAT` 三段结构 + `Also contains:` 强制。
- `PASSTHROUGH` 四类 + 必须在 thinking 里点名第几类。

净效果：134→~70 行，删的全是 scaffolding/重复/冗余示例，承重信息零损失。

## 3. 建议：合并双变体（呼应你们 redesign §8.5 的待拍板项）

现状 `distill.ts` 按模型前缀分流：`claude/gemini → first-person`，其余 `→ third-person`。两份 prompt 双份维护 = 双份漂移机会。note-taker 这个身份**人称中立**（"the note-taker" 既非 first 也非 third），可以**一份通吃**，把 `selectVariant` 简化掉。这正是 redesign discussion §8 第 5 点"prompt 变体是否合并成一个"的正向答案。

## 4. Sisyphus 一处精确补丁（这才是元分析揪出的真问题）

元分析发现：pi-o48/pi-o46t 报告 **citation 全丢（0 个 file:line）**，根因**不在 impression**（蒸馏保了行号），在 Sisyphus core 的简洁先验**适用域过宽**。

`oh-my-pi-v2/hooks/sisyphus-prompt.ts` `<Communication_Style>`（L474-476）：

```
- Final answers should optimize for fast comprehension. For simple tasks,
  one or two short paragraphs is better than a structured outline. Reserve
  structured sections for genuine multi-item complexity.
```

外加 `<Completion_Template>` L285 "the user can read the diff for detail"。这两句把"对话要简洁"误用到了**交付物（调研报告/设计文档/分析）**上——于是模型把行号、签名当"细节"甩给"用户自己看 diff"，正是 o46t 25:1 gather:surface 和 citation 全丢的提示词成因。

**建议补一句，把简洁先验 scope 到"对话/状态输出"，豁免交付物**（拟在 L476 后追加）：

```
- The brevity above is for conversation and status. It does NOT apply to
  deliverable artifacts (research reports, designs, analyses): there, be
  complete — surface every load-bearing fact you gathered, keep file:line
  citations and signatures verbatim, do not push concrete detail to "the diff".
```

这一句同时治两病：(a) under-rendering（o46t 把 199K 料压成定长摘要）；(b) citation 全丢。**注意分工**：impression 改的是"蒸馏忠不忠"，这条改的是"写报告肯不肯把料铺开"——两者正交，都要改。

## 5. 应用顺序建议

1. 先上 Sisyphus L476 补丁（一句、零风险、直接治 citation + under-rendering）。
2. 再用 `.improved.md` 替换 third-person（行为变更，建议留一次对照跑验证 note 质量不退）。
3. 验证后考虑合并双变体（结构简化，最后做）。
