#!/usr/bin/env python3
"""
A/B consistency — impression's first-principles KPI: does compressing a tool result change
the DOWNSTREAM conclusion the agent reaches?

The regular eval (run_eval.py) tests the first hop only — is the distilled NOTE good. This
tests the second hop — does the agent, continuing from the note, reach the SAME conclusion it
would have reached from the raw tool result.

For each (model, sample):
  B (baseline, no impression): main model answers the concern from [sys + history + RAW tool_result]   -> concl_B
  A (with impression):         distill the tool_result into a note, then the main model answers the
                               same concern from [sys + history + NOTE]                                  -> concl_A
  judge: are concl_A and concl_B consistent? (does impression change/lose the conclusion)

Verdict semantics (this is the point of the test):
  - A and B agree            -> impression is FAITHFUL on this sample (compression didn't change the outcome)
  - A wrong, B right         -> impression's FAULT (compression introduced an error / lost info)
  - A right, B wrong         -> impression incidentally helped (or both-noise tie-broke)
  - A and B both wrong/equal -> NOT impression's fault (model's own behavior; e.g. both hallucinate
                                the same thing from garbled bytes — impression has no duty to fix that)

Usage:
  IMPRESSION_EVAL_URL=... IMPRESSION_EVAL_KEY=... \
    python3 ab_consistency.py --configs configs.local.json --judge claude-opus-4-8 \
      --workers 32 [--only id1,id2]
"""

import argparse, json, os, sys
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import run_eval as R  # reuse build_prompts, call_llm, parse_distillation, load_sample, roots

# The agent's "continue" prompt: answer the concern from whatever context it was given.
CONTINUE_SYS = ("You are a coding agent. Using ONLY the system prompt, the conversation so far, "
                "and the tool result provided, answer the user's current question concisely and "
                "concretely. Do not ask to read more; answer from what you have.")

def continue_answer(cfg, sys_prompt, history, context_block, max_tokens=800):
    """One 'agent continues' call. context_block is either the RAW tool result (B) or the
    distilled note (A). Returns the agent's answer text."""
    user = (f"{sys_prompt or ''}\n\n=== conversation so far ===\n{history}\n\n"
            f"=== latest tool result (this is what you have to work from) ===\n{context_block}\n\n"
            f"Now answer the user's current question, grounded only in the above.")
    text, _ = R.call_llm({**cfg}, CONTINUE_SYS, user, max_tokens)
    return text

JUDGE_SYS = """You compare two answers the same agent gave to the same question — one produced
from the RAW tool result (B), one from a COMPRESSED note of that same tool result (A). You judge
whether compression changed the downstream conclusion.

Output ONLY minified JSON:
{"consistent": true|false, "a_correct": true|false, "b_correct": true|false, "verdict": "agree|impression_fault|model_fault|impression_helped", "note": "one line"}

- consistent: do A and B reach the same substantive conclusion (same answer to the question)?
- a_correct / b_correct: judged against the SOURCE (provided), is each answer correct/faithful?
- verdict:
  - "agree"            : A and B consistent (compression preserved the outcome)
  - "impression_fault" : B correct but A wrong/lost-info (compression introduced the error)
  - "model_fault"      : A and B both wrong in the SAME way (model's own issue; impression not at fault)
  - "impression_helped": A correct but B wrong
Be strict and literal. The question is whether IMPRESSION changed things, not whether the model is smart."""

def judge_consistency(cfg, judge_model, source, question, ans_b, ans_a):
    user = (f"QUESTION the agent had to answer:\n{question}\n\n"
            f"===== SOURCE (ground truth, the raw tool result) =====\n{source}\n\n"
            f"===== ANSWER B (from RAW tool result) =====\n{ans_b}\n\n"
            f"===== ANSWER A (from COMPRESSED note) =====\n{ans_a}")
    jc = {**cfg, "model": judge_model}
    text, _ = R.call_llm(jc, JUDGE_SYS, user, 600)
    import re
    m = re.search(r"\{[\s\S]*\}", text)
    if not m:
        return {"consistent": None, "verdict": "PARSE_FAIL", "note": text[:120]}
    try:
        return json.loads(m.group(0))
    except Exception:
        return {"consistent": None, "verdict": "PARSE_FAIL", "note": text[:120]}

def last_user_question(history: str) -> str:
    """Pull the agent's current concern = the last '### user' block in history."""
    blocks = history.split("### ")
    users = [b[len("user"):].strip() for b in blocks if b.startswith("user")]
    return users[-1] if users else history[-300:]

def run_cell(cfg, s, judge_model, max_tokens):
    sysp, hist, tr = s["sys_prompt"], s["history"], s["tool_result"]
    question = last_user_question(hist)
    # B: baseline (no impression) — agent works from raw tool result
    ans_b = continue_answer(cfg, sysp, hist, tr, max_tokens)
    # A: with impression — distill, then agent works from the note
    dsys, duser = R.build_prompts(cfg.get("variant", "third-person"), sysp, hist, tr, s["tool_name"], cfg.get("maxTokens", 8192))
    dtext, dfin = R.call_llm(cfg, dsys, duser, cfg.get("maxTokens", 8192))
    dist = R.parse_distillation(dtext, dfin, len(tr))
    note = tr if dist["passthrough"] else dist["note"]  # passthrough → agent sees raw anyway
    ans_a = continue_answer(cfg, sysp, hist, note, max_tokens)
    jr = judge_consistency(cfg, judge_model, tr, question, ans_b, ans_a) if judge_model else {}
    return {"model": cfg["name"], "sample": s["id"], "passthrough": dist["passthrough"],
            "verdict": jr.get("verdict"), "consistent": jr.get("consistent"),
            "a_correct": jr.get("a_correct"), "b_correct": jr.get("b_correct"), "note": jr.get("note", "")}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--configs", default=str(HERE / "configs.json"))
    ap.add_argument("--judge", required=True)
    ap.add_argument("--only")
    ap.add_argument("--workers", type=int, default=16)
    ap.add_argument("--repeat", type=int, default=1,
                    help="run each (model,sample) N times — A/B continuation + judge are noisy, so repeat to see if a verdict (esp impression_fault) is stable or sampling noise")
    args = ap.parse_args()
    configs = json.loads(Path(args.configs).read_text())["configs"]
    only = set(args.only.split(",")) if args.only else None
    roots = [HERE / "samples"] + ([HERE / "local-testsuite"] if (HERE / "local-testsuite").is_dir() else [])
    sdirs = [d for root in roots for d in sorted(root.iterdir())
             if d.is_dir() and (only is None or d.name in only)]
    samples = [R.load_sample(d) for d in sdirs]
    pool = ThreadPoolExecutor(max_workers=args.workers)
    futs = {pool.submit(run_cell, c, s, args.judge, 800): (c["name"], s["id"])
            for c in configs for s in samples for _ in range(args.repeat)}
    rows = []
    for fut in as_completed(futs):
        name, sid = futs[fut]
        try:
            r = fut.result(); rows.append(r)
            print(f"[{r['model']}] {r['sample']}: {'PASS-THRU' if r['passthrough'] else 'compressed'} | "
                  f"verdict={r['verdict']} consistent={r['consistent']} (A={r['a_correct']} B={r['b_correct']})")
        except Exception as e:
            print(f"[{name}] {sid}: ERROR {e}", file=sys.stderr)
    pool.shutdown()
    # summary — aggregate per (model, sample) across repeats, so a recurrent fault is
    # distinguished from one-off sampling noise.
    from collections import Counter, defaultdict
    vc = Counter(r["verdict"] for r in rows)
    cells = defaultdict(list)
    for r in rows:
        cells[(r["model"], r["sample"])].append(r)
    out = ["# A/B consistency report (impression's first-principles KPI)\n",
           f"total runs: {len(rows)}  |  verdict tally: {dict(vc)}\n",
           "Per (model, sample): N runs, verdict counts. impression_fault = compression changed/lost",
           "the conclusion that the RAW result would have produced. model_fault = A and B wrong the",
           "same way (not impression's doing).\n",
           "| model | sample | runs | verdicts (count) | fault rate |", "|---|---|:--:|---|:--:|"]
    fault_cells = []
    for (m, sid), rs in sorted(cells.items(), key=lambda kv: (kv[0][1], kv[0][0])):
        vcount = Counter(x["verdict"] for x in rs)
        nf = vcount.get("impression_fault", 0)
        if nf: fault_cells.append((m, sid, nf, len(rs), rs))
        vstr = ", ".join(f"{k}:{v}" for k, v in vcount.most_common())
        out.append(f"| {m} | {sid} | {len(rs)} | {vstr} | {nf}/{len(rs)} |")
    if fault_cells:
        out.append("\n## ⚠️ impression_fault cells (compression changed/lost the conclusion)")
        for m, sid, nf, n, rs in sorted(fault_cells, key=lambda x: -x[2]/x[3]):
            ex = next((x["note"] for x in rs if x["verdict"] == "impression_fault"), "")
            out.append(f"- {m} / {sid}: {nf}/{n} runs — e.g. {ex}")
    (HERE / "out" / "ab_report.md").write_text("\n".join(out) + "\n")
    total_fault = sum(c[2] for c in fault_cells)
    print(f"\nimpression_fault runs: {total_fault}/{len(rows)} across {len(fault_cells)} cells  |  report -> out/ab_report.md")

if __name__ == "__main__":
    main()
