#!/usr/bin/env python3
"""
ask_models.py — temporary, one-off probe.

Ask three weak/medium LLMs to introspect on their OWN weaknesses as a
"tool-output distiller" (the impression-plugin role), and to propose prompt
wording that would help them be more reliable.

Per model we ask 2 questions (2 separate API calls):
  Q1: self-reflection on its specific observed weakness + what prompt wording
      would help it (a) decide compress vs passthrough, (b) its weak point.
  Q2: write 3-5 concrete English prompt rules it thinks would help itself.

API config is read at RUNTIME from ~/.claude.yunwu.json. The auth token is
NEVER printed, NEVER written to disk. Raw answers are saved (token-free) to
ask_models_out.json next to this script.

Usage:
  python3 ask_models.py
"""

import json, os, sys, urllib.request, urllib.error, time
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE / "ask_models_out.json"
CONF = Path(os.path.expanduser("~/.claude.yunwu.json"))

MODELS = ["deepseek-v4-pro", "glm-5.2", "MiniMax-M3"]

# Per-model observed weakness, woven into the prompt so each model reflects on
# its *own* failure mode.
WEAKNESS = {
    "deepseek-v4-pro": (
        "你的压缩质量不错，但**判断该 passthrough（原样返回）还是压缩时不稳定**——"
        "经常在“内容接近 2KB、agent 似乎需要逐字原文”的临界情形下判错："
        "该 passthrough 的时候你压缩了，或者该压缩的时候你 passthrough 了。"
    ),
    "glm-5.2": (
        "你在压缩时**容易编造（hallucinate）**——会把原文没有明说的东西写进笔记。"
        "比如给一个源码里根本没命名的 struct 起个名字、或者断言一个原文里并不存在的结论。"
    ),
    "MiniMax-M3": (
        "你的**幻觉问题更严重**（编造原文没有的内容）；而且有时候面对很短的内容你"
        "**压不动、反而写得比原文还长**；偶尔还会发生语言漂移（输出突然跑到另一种语言）。"
    ),
}

# Per-model "weak point" phrase used inside Q1's (b) clause.
WEAK_POINT_B = {
    "deepseek-v4-pro": "更稳定地分辨“这次该逐字 passthrough”还是“该压缩成短笔记”",
    "glm-5.2": "在压缩时严格忠于原文、绝不编造原文没有的内容",
    "MiniMax-M3": "既避免编造、又在内容本就很短时知道该 passthrough（而不是把它越写越长），并且不发生语言漂移",
}

ROLE = (
    "你是一个“工具输出蒸馏器（tool-output distiller）”。背景：impression 是一个工具——"
    "每当一个 AI agent 调用某个工具（读文件、grep、跑命令）之后，在 agent 看到工具的原始返回**之前**，"
    "先由你（同一个 LLM，扮演 distiller）把那段可能很长的工具返回压缩成一条简短的“印象笔记”，"
    "原始返回随后被丢弃，agent 只能看到你写的那条笔记。所以你的判断直接决定 agent 看到什么。\n\n"
    "你每次要做两件事：\n"
    "(a) 先决定这次该**压缩**（写一条简短笔记）还是该 **passthrough**（原样把原文返回给 agent）。"
    "当 agent 接下来明显需要逐字原文时——比如要精确编辑某文件、逐行 diff 对比、或照着一份规则/清单严格执行——"
    "就应该 passthrough；否则压缩。\n"
    "(b) 如果压缩，必须**忠实**（绝不编造原文里没有的东西）并且**会选**（只保留对 agent 当前任务有用的信息）。"
)


def load_endpoint():
    """Read base url + token from the json at runtime. Token stays in memory only."""
    cfg = json.loads(CONF.read_text())
    base = cfg["env"]["ANTHROPIC_BASE_URL"].rstrip("/") + "/v1"
    key = cfg["env"]["ANTHROPIC_AUTH_TOKEN"]
    return base, key


def call(base, key, model, content, max_tokens=2000):
    body = json.dumps({
        "model": model,
        "max_tokens": max_tokens,
        "stream": False,
        "messages": [{"role": "user", "content": content}],
    }).encode()
    req = urllib.request.Request(
        base + "/chat/completions", data=body,
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"})
    last = None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                data = json.loads(r.read())
            choice = data["choices"][0]
            return choice["message"].get("content") or "", choice.get("finish_reason")
        except urllib.error.HTTPError as e:
            last = f"HTTP {e.code}: {e.read()[:200].decode(errors='replace')}"
            if e.code in (429, 500, 502, 503, 504) and attempt < 2:
                time.sleep(2 * (attempt + 1)); continue
            return f"[ERROR {last}]", "error"
        except Exception as e:
            last = str(e)
            if attempt < 2:
                time.sleep(2 * (attempt + 1)); continue
            return f"[ERROR {last}]", "error"
    return f"[ERROR {last}]", "error"


def build_q1(model):
    return (
        ROLE + "\n\n"
        f"我们在实测中发现：{WEAKNESS[model]}\n\n"
        "请你**站在你自己的视角**反思：作为这个蒸馏器，什么样的**提示词指令（prompt instruction）**"
        "能帮助你更可靠地做对？你希望提示词怎么对你说，你才能更清楚地：\n"
        f"  (a) 判断这次该压缩还是该 passthrough；\n"
        f"  (b) {WEAK_POINT_B[model]}。\n\n"
        "请给出你觉得对你**最有效的、具体的**提示词措辞建议（不要泛泛而谈“要忠实”“要准确”这类空话，"
        "而是给出你认为真正能改变你行为的具体表述、判定规则、自检步骤或触发条件）。"
        "你可以用中文说明你的思考。"
    )


def build_q2(model):
    return (
        ROLE + "\n\n"
        f"提醒：你已知的弱点是——{WEAKNESS[model]}\n\n"
        "现在请你**直接写出 3 到 5 条**你认为最能帮到你自己、专门针对上述弱点的提示词规则。\n"
        "要求：\n"
        "  - 用**英文**书写（因为最终的 distiller system prompt 是英文的）；\n"
        "  - 每条都要**具体、可执行**，像真的会被原样写进 system prompt 的句子（祈使句、可判定的条件）；\n"
        "  - 不要写“be faithful / be accurate”这种没有可操作性的空话；\n"
        "  - 针对你 (a) 压缩 vs passthrough 的判定、(b) 你自己的具体弱点各给出至少一条。\n\n"
        "只输出这 3-5 条英文规则本身（可加极简编号），不要别的解释。"
    )


def main():
    base, key = load_endpoint()
    print(f"endpoint: {base}  (token loaded into memory, not printed)")
    results = {}
    for model in MODELS:
        print(f"\n=== {model} ===")
        entry = {}
        for qid, builder in (("Q1", build_q1), ("Q2", build_q2)):
            print(f"  asking {qid} ...", flush=True)
            text, finish = call(base, key, model, builder(model))
            entry[qid] = {"finish_reason": finish, "answer": text}
            print(f"    -> {len(text)} chars, finish={finish}")
        results[model] = entry
    OUT.write_text(json.dumps(results, ensure_ascii=False, indent=2))
    print(f"\nsaved raw answers -> {OUT}")


if __name__ == "__main__":
    main()
