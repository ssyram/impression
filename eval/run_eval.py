#!/usr/bin/env python3
"""
Distillation eval — simple, dependency-light Python harness.

Pipeline (per model-config × sample):
  load sample dir (sys-prompt.md, history.md, tool-result.md, judge-criteria.md)
    -> assemble the REAL distiller system+user prompt (from ../prompts/*.md, same
       templating distill.ts uses)
    -> call the endpoint (OpenAI /chat/completions-compatible)
    -> parse note (strip <thinking>, detect <passthrough/> sentinel)
    -> Layer 1: deterministic checks parsed from judge-criteria.md (must_contain,
       must_not_contain, passthrough, shorter, also_contains, position_guide)
    -> Layer 2 (optional --judge MODEL): LLM-as-judge over the criteria rubric
  -> writes out/<config>/<sample>.txt and out/report.md

This replicates distill.ts faithfully (same prompt files, same {{var}} render, same
lengthNote thresholds, same sentinel/thinking parsing) but in standalone Python so it
needs no pi-mono build. The TS harness (run.ts) calls the real internal function; this
Python one is the zero-setup path the user asked for.

Usage:
  python3 run_eval.py                         # all configs × samples, grep layer
  python3 run_eval.py --judge gpt-5.5-high    # + LLM judge
  python3 run_eval.py --only real-softcheck-grep
  configs.json: each model may omit url/apiKey -> falls back to env (see resolve()).
"""

import argparse, json, os, re, sys, urllib.request, urllib.error
from pathlib import Path

HERE = Path(__file__).resolve().parent
PROMPTS = HERE.parent / "prompts"
SENTINEL = "<passthrough/>"


# ---------- real prompt assembly (mirrors distill.ts) ----------

def render(tmpl: str, vars: dict) -> str:
    for k, v in vars.items():
        tmpl = tmpl.replace("{{" + k + "}}", v)
    return tmpl.rstrip()

def build_prompts(variant: str, sys_prompt: str, history: str, tool_result: str,
                  tool_name: str, max_tokens: int):
    sys_tmpl = (PROMPTS / f"distiller-{variant}.md").read_text()
    usr_tmpl = (PROMPTS / f"distiller-user-{variant}.md").read_text()
    n = len(tool_result)
    if n > max_tokens * 10:
        length_note = " (considered very long, more aggressive compression expected)"
    elif n < max_tokens * 4:
        length_note = " (considered relatively short)"
    else:
        length_note = ""
    system = render(sys_tmpl, {"contentLength": str(n), "lengthNote": length_note, "sentinel": SENTINEL})
    user = render(usr_tmpl, {
        "originalSystemPrompt": sys_prompt or "[none]",
        "visibleHistory": history or "[none]",
        "toolName": tool_name,
        "toolResult": tool_result or "[empty]",
    })
    return system, user


# ---------- endpoint call (OpenAI chat-completions compatible) ----------

def resolve(cfg: dict):
    """url/apiKey fall back to env vars if absent in the model json."""
    url = cfg.get("url") or os.environ.get("IMPRESSION_EVAL_URL")
    key = cfg.get("apiKey") or (os.environ.get(cfg["apiKeyEnv"]) if cfg.get("apiKeyEnv") else None) \
          or os.environ.get("IMPRESSION_EVAL_KEY") or os.environ.get("OPENAI_API_KEY")
    if not url:
        raise RuntimeError(f"config '{cfg['name']}': no url (set url or env IMPRESSION_EVAL_URL)")
    if not key:
        raise RuntimeError(f"config '{cfg['name']}': no apiKey (set apiKey/apiKeyEnv or env IMPRESSION_EVAL_KEY)")
    return url.rstrip("/"), key

def call_llm(cfg: dict, system: str, user: str, max_tokens: int):
    url, key = resolve(cfg)
    body = json.dumps({
        "model": cfg["model"],
        "max_tokens": max_tokens,
        "stream": False,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
    }).encode()
    req = urllib.request.Request(url + "/chat/completions", data=body,
                                 headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"})
    last = None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                data = json.loads(r.read())
            choice = data["choices"][0]
            return choice["message"].get("content") or "", choice.get("finish_reason")
        except urllib.error.HTTPError as e:
            last = f"HTTP {e.code}"
            if e.code in (429, 500, 502, 503, 504) and attempt < 2:
                import time; time.sleep(2 * (attempt + 1)); continue
            raise RuntimeError(f"{last}: {e.read()[:200].decode(errors='replace')}")
        except Exception as e:
            last = str(e)
            if attempt < 2:
                import time; time.sleep(2 * (attempt + 1)); continue
            raise
    raise RuntimeError(last or "unknown")


# ---------- output parsing (mirrors distill.ts) ----------

def parse_distillation(text: str, finish: str, source_len: int):
    if finish == "length":
        return {"passthrough": True, "note": "[TRUNCATED hit max_tokens]", "thinking": ""}
    thinking = "\n".join(re.findall(r"<think(?:ing)?>([\s\S]*?)</think(?:ing)?>", text))
    stripped = re.sub(r"<think(?:ing)?>[\s\S]*?</think(?:ing)?>", "", text).strip()
    if not stripped:
        return {"passthrough": True, "note": SENTINEL, "thinking": thinking}
    core = re.sub(r'^["\'`]+|["\'`]+$', "", stripped)
    core = re.sub(r"[.!。]+$", "", core).strip()
    if core == SENTINEL or len(stripped) >= source_len:
        return {"passthrough": True, "note": stripped, "thinking": thinking}
    return {"passthrough": False, "note": stripped, "thinking": thinking}


# ---------- criteria: one file = one criterion ----------
#
# A criterion is a markdown file with optional frontmatter:
#   ---
#   id: short-id              (defaults to filename)
#   type: grep|judge|mode|invariant
#   applies_to: compress|passthrough|any   (skip criterion if the note's mode differs)
#   ---
#   <body>
#
# grep      : body has ## must_contain / ## must_contain_any / ## must_not_contain sections
# invariant : body has ## require with shorter_than_source / also_contains / position_guide
# mode      : body's first content word is "compress" or "passthrough" (the expected mode)
# judge     : body is free-text rubric handed to the LLM; scored 1-5 on ONE axis named by id
#
# Criteria come from two places, merged per sample:
#   eval/criteria/common/*.md           — auto-applied to EVERY sample (shared basics)
#   samples/<id>/judge-criteria/*.md     — that sample's own criteria

def parse_frontmatter(text: str):
    meta, body = {}, text
    if text.startswith("---"):
        end = text.find("\n---", 3)
        if end != -1:
            fm = text[3:end].strip()
            body = text[end + 4:].lstrip("\n")
            for line in fm.splitlines():
                if ":" in line:
                    k, v = line.split(":", 1)
                    meta[k.strip()] = v.strip()
    return meta, body

def _unquote(s: str) -> str:
    s = s.split("#")[0].strip()
    return s.strip().strip('"').strip("'")

def _collect_section(body: str, name: str):
    """Return the list of `- ` items under a `## <name>...` header."""
    out, active = [], False
    for raw in body.splitlines():
        low = raw.strip().lower()
        if low.startswith("## "):
            active = low[3:].split()[0].rstrip(":") == name
            continue
        if active and raw.strip().startswith("- "):
            out.append(raw.strip()[2:].strip())
    return out

def load_criterion(path: Path) -> dict:
    text = path.read_text()
    meta, body = parse_frontmatter(text)
    c = {"id": meta.get("id", path.stem), "type": meta.get("type", "grep"),
         "applies_to": meta.get("applies_to", "any"), "body": body, "source": path.name}
    if c["type"] == "grep":
        c["must_contain"] = [_unquote(x) for x in _collect_section(body, "must_contain")]
        c["must_contain_any"] = []
        for item in _collect_section(body, "must_contain_any"):
            try:
                c["must_contain_any"].append(json.loads(item))
            except Exception:
                c["must_contain_any"].append([s.strip().strip('"') for s in item.strip("[]").split(",")])
        c["must_not_contain"] = [_unquote(x) for x in _collect_section(body, "must_not_contain")]
    elif c["type"] == "invariant":
        reqs = [r.split(":")[0].strip().lower() for r in _collect_section(body, "require")]
        c["shorter"] = any("shorter" in r for r in reqs)
        c["also_contains"] = any("also_contains" in r for r in reqs)
        c["position_guide"] = any("position_guide" in r for r in reqs)
    elif c["type"] == "mode":
        first = next((l.strip().lower() for l in body.splitlines() if l.strip() and not l.startswith("#")), "")
        c["expect_passthrough"] = first.startswith("passthrough")
    return c

def load_all_criteria(sample_dir: Path):
    crits = []
    common = HERE / "criteria" / "common"
    if common.is_dir():
        crits += [load_criterion(p) for p in sorted(common.glob("*.md"))]
    own = sample_dir / "judge-criteria"
    if own.is_dir():
        crits += [load_criterion(p) for p in sorted(own.glob("*.md"))]
    elif (sample_dir / "judge-criteria.md").exists():
        # back-compat: single-file criteria still works, treated as one grep+invariant+rubric blob
        crits.append(load_criterion(sample_dir / "judge-criteria.md"))
    return crits

def applies(c: dict, out: dict) -> bool:
    if c["applies_to"] == "any":
        return True
    mode = "passthrough" if out["passthrough"] else "compress"
    return c["applies_to"] == mode


# ---------- Layer 1: deterministic evaluation of one criterion ----------

def eval_grep(c: dict, out: dict, source_len: int):
    """Return (pass, [failure strings]) for a grep/invariant/mode criterion."""
    fails = []
    if c["type"] == "mode":
        if c["expect_passthrough"] and not out["passthrough"]:
            fails.append("expected passthrough but compressed")
        if not c["expect_passthrough"] and out["passthrough"]:
            fails.append("expected compression but passed through")
        return (not fails, fails)
    if out["passthrough"]:
        return (True, [])  # content checks N/A on a passthrough note
    note, low = out["note"], out["note"].lower()
    if c["type"] == "grep":
        for n in c["must_contain"]:
            if n and n not in note: fails.append(f"must_contain missing: {n!r}")
        for grp in c["must_contain_any"]:
            if grp and not any(x in note for x in grp): fails.append(f"any unsatisfied: {grp}")
        for b in c["must_not_contain"]:
            if b and b.lower() in low: fails.append(f"present(banned): {b!r}")
    elif c["type"] == "invariant":
        if c.get("shorter") and len(note) >= source_len: fails.append(f"not shorter ({len(note)}>={source_len})")
        if c.get("also_contains") and "also contains:" not in low: fails.append("missing 'Also contains:'")
        if c.get("position_guide") and "position guide:" not in low: fails.append("missing 'Position guide:'")
    return (not fails, fails)


# ---------- Layer 2: LLM judge of one criterion ----------

JUDGE_SYS = """You are a strict, unflattering evaluator of a tool-output DISTILLATION.
A distiller compressed SOURCE into NOTE for an agent that sees ONLY the note.
Apply the single CRITERION rubric below. Score it 1-5 (5 best), be harsh, default low
when unsure. If the criterion is about hallucination/faithfulness, list every unsupported
claim in NOTE (quote it).
Output ONLY minified JSON: {"score":N,"issues":["..."],"notes":"one line"}"""

def _judge_once(cfg, judge_model, source, note, c, max_tokens=1024):
    """One judge call. Returns (score|None, issues). None score = parse failure (excluded,
    NOT counted as 0 — a parse fail is judge-side noise, not a 'fully fabricated' verdict)."""
    user = (f"CRITERION id={c['id']}:\n{c['body']}\n\n"
            f"===== SOURCE =====\n{source}\n\n===== NOTE =====\n{note}")
    jc = dict(cfg); jc["model"] = judge_model
    text, _ = call_llm(jc, JUDGE_SYS, user, max_tokens)
    m = re.search(r"\{[\s\S]*\}", text)
    if not m:
        return None, ["JUDGE_PARSE_FAIL"]
    try:
        o = json.loads(m.group(0))
        return int(o.get("score", 0)), o.get("issues", [])
    except Exception:
        return None, ["JUDGE_PARSE_FAIL"]


# K = how many times to judge each note; the score is the MEDIAN (robust to a single bad
# draw — the no-fabrication axis swings up to 3 points on identical notes). Set via --judge-k.
JUDGE_K = 1

def judge_one(cfg: dict, judge_model: str, source: str, note: str, c: dict, max_tokens=1024):
    import statistics as st
    scores, all_issues = [], []
    for _ in range(JUDGE_K):
        sc, iss = _judge_once(cfg, judge_model, source, note, c, max_tokens)
        if sc is not None:
            scores.append(sc)
        if iss and iss != ["JUDGE_PARSE_FAIL"]:
            all_issues.extend(iss)
    if not scores:
        return {"id": c["id"], "score": 0, "issues": ["ALL_JUDGE_PARSE_FAIL"], "scores": []}
    med = int(round(st.median(scores)))
    # keep issues only from runs at/below the median verdict (the critical ones)
    return {"id": c["id"], "score": med, "issues": all_issues[:4], "scores": scores}


# ---------- sample loading ----------

def load_sample(d: Path):
    def rd(name):
        p = d / name
        return p.read_text() if p.exists() else ""
    return {
        "id": d.name,
        "sys_prompt": rd("sys-prompt.md"),
        "history": rd("history.md"),
        "tool_result": rd("tool-result.md"),
        "criteria": load_all_criteria(d),
        "tool_name": (d / "tool-name.txt").read_text().strip() if (d / "tool-name.txt").exists() else "bash",
    }


# ---------- main ----------

def _distill_cell(cfg, s, rep, max_tokens):
    """One distillation: (model, sample, repeat-index). Returns a result dict."""
    variant = cfg.get("variant", "third-person")
    system, user = build_prompts(variant, s["sys_prompt"], s["history"],
                                 s["tool_result"], s["tool_name"], max_tokens)
    text, finish = call_llm(cfg, system, user, max_tokens)
    out = parse_distillation(text, finish, len(s["tool_result"]))
    out_dir = HERE / "out" / cfg["name"]; out_dir.mkdir(parents=True, exist_ok=True)
    suffix = "" if rep == 0 else f".r{rep}"
    (out_dir / f"{s['id']}{suffix}.txt").write_text(
        f"passthrough={out['passthrough']}\n--- thinking ---\n{out['thinking']}\n--- note ---\n{out['note']}")
    return {"cfg": cfg["name"], "sample": s["id"], "rep": rep, "out": out, "s": s}


def main():
    from concurrent.futures import ThreadPoolExecutor, as_completed
    ap = argparse.ArgumentParser()
    ap.add_argument("--judge", help="judge model id (enables Layer 2)")
    ap.add_argument("--only", help="comma list of sample ids")
    ap.add_argument("--configs", default=str(HERE / "configs.json"))
    ap.add_argument("--workers", type=int, default=16, help="concurrent API calls (e.g. 32, 128)")
    ap.add_argument("--samples", type=int, default=1,
                    help="distillation samples per (model,sample): the model re-runs the same input N times to measure its own output stability")
    ap.add_argument("--judge-k", type=int, default=1,
                    help="judge each note K times, take the MEDIAN (robust to noisy axes like no-fabrication)")
    args = ap.parse_args()
    global JUDGE_K; JUDGE_K = args.judge_k

    configs = json.loads(Path(args.configs).read_text())["configs"]
    only = set(args.only.split(",")) if args.only else None
    sample_dirs = [d for d in sorted((HERE / "samples").iterdir()) if d.is_dir()
                   and (only is None or d.name in only)]
    if not sample_dirs:
        print("no samples found under eval/samples/", file=sys.stderr); sys.exit(1)
    samples = [load_sample(d) for d in sample_dirs]

    pool = ThreadPoolExecutor(max_workers=args.workers)

    # ---- Phase 1: parallel distillation (model × sample × repeat) ----
    dfuts = {}
    for cfg in configs:
        for s in samples:
            for rep in range(args.samples):
                dfuts[pool.submit(_distill_cell, cfg, s, rep, cfg.get("maxTokens", 8192))] = (cfg["name"], s["id"], rep)
    cells = []
    for fut in as_completed(dfuts):
        name, sid, rep = dfuts[fut]
        try:
            cells.append(fut.result())
            tag = "" if rep == 0 else f" r{rep}"
            print(f"  distilled [{name}] {sid}{tag}: {'passthrough' if cells[-1]['out']['passthrough'] else 'compress'}")
        except Exception as e:
            cells.append({"cfg": name, "sample": sid, "rep": rep, "error": str(e)})
            print(f"  ERROR [{name}] {sid}: {e}", file=sys.stderr)

    # ---- Phase 2: parallel judging (every judge axis for every compressed cell) ----
    jfuts = {}
    for cell in cells:
        if cell.get("error") or cell["out"]["passthrough"]:
            continue
        s, out = cell["s"], cell["out"]
        cfg = next(c for c in configs if c["name"] == cell["cfg"])
        for c in s["criteria"]:
            if c["type"] == "judge" and args.judge and applies(c, out):
                jfuts[pool.submit(judge_one, cfg, args.judge, s["tool_result"], out["note"], c)] = (cell, c["id"])
    judge_scores = {}  # (cfg,sample,rep,critid) -> jr
    for fut in as_completed(jfuts):
        cell, cid = jfuts[fut]
        key = (cell["cfg"], cell["sample"], cell["rep"], cid)
        try: judge_scores[key] = fut.result()
        except Exception as e: judge_scores[key] = {"score": 0, "issues": [f"ERR:{e}"]}
    pool.shutdown()

    # ---- assemble rows (one per cell) ----
    rows = []
    for cell in cells:
        if cell.get("error"):
            rows.append({"cfg": cell["cfg"], "sample": cell["sample"], "rep": cell["rep"], "error": cell["error"]}); continue
        s, out = cell["s"], cell["out"]
        row = {"cfg": cell["cfg"], "sample": cell["sample"], "rep": cell["rep"], "criteria": []}
        for c in s["criteria"]:
            if not applies(c, out):
                row["criteria"].append({"id": c["id"], "type": c["type"], "skipped": True}); continue
            if c["type"] in ("grep", "invariant", "mode"):
                ok, fails = eval_grep(c, out, len(s["tool_result"]))
                row["criteria"].append({"id": c["id"], "type": c["type"], "pass": ok, "fails": fails})
            elif c["type"] == "judge":
                if args.judge:
                    jr = judge_scores.get((cell["cfg"], cell["sample"], cell["rep"], c["id"]), {"score": 0, "issues": []})
                    row["criteria"].append({"id": c["id"], "type": "judge", "score": jr["score"],
                                            "issues": jr.get("issues", []), "pass": jr["score"] >= 4})
                else:
                    row["criteria"].append({"id": c["id"], "type": "judge", "skipped": True})
        summarize_print(cell["cfg"], cell["sample"] + ("" if cell["rep"] == 0 else f" r{cell['rep']}"), row["criteria"])
        rows.append(row)

    write_report(rows)
    if args.samples > 1:
        write_stability(rows)
    print(f"\nreport -> {HERE / 'out' / 'report.md'}")


def summarize_print(cfg, sid, crits):
    grep = [c for c in crits if c["type"] in ("grep", "invariant", "mode") and not c.get("skipped")]
    jud = [c for c in crits if c["type"] == "judge" and not c.get("skipped")]
    gp = sum(1 for c in grep if c.get("pass"))
    parts = [f"grep {gp}/{len(grep)}"]
    if jud:
        parts.append("judge " + " ".join(f"{c['id']}={c.get('score','-')}" for c in jud))
    failed = [c["id"] for c in grep if not c.get("pass")]
    tail = f"  ✗ {failed}" if failed else ""
    print(f"[{cfg}] {sid}: {' | '.join(parts)}{tail}")


def write_report(rows):
    L = ["# Distillation eval report\n"]
    for r in rows:
        rep = r.get("rep", 0)
        L.append(f"## {r['cfg']} × {r['sample']}{'' if rep == 0 else f' (sample r{rep})'}\n")
        if r.get("error"):
            L.append(f"ERROR: {r['error']}\n"); continue
        L.append("| criterion | type | result | detail |")
        L.append("|---|---|:--:|---|")
        for c in r["criteria"]:
            if c.get("skipped"):
                res, det = "—", "skipped (mode mismatch or judge off)"
            elif c["type"] == "judge":
                res = f"{c['score']}/5"; det = "; ".join(c.get("issues", [])) or "ok"
            else:
                res = "✅" if c.get("pass") else "❌"; det = "; ".join(c.get("fails", [])) or "ok"
            L.append(f"| {c['id']} | {c['type']} | {res} | {det} |")
        L.append("")
    (HERE / "out" / "report.md").write_text("\n".join(L) + "\n")


def write_stability(rows):
    """When --samples>1: aggregate judge scores per (cfg, sample, criterion) across reps."""
    import statistics as st
    from collections import defaultdict
    agg = defaultdict(list)            # (cfg, sample, critid) -> [scores]
    passrate = defaultdict(list)       # (cfg, sample, critid) -> [pass bools for grep]
    for r in rows:
        if r.get("error"):
            continue
        for c in r["criteria"]:
            if c.get("skipped"):
                continue
            key = (r["cfg"], r["sample"], c["id"])
            if c["type"] == "judge":
                agg[key].append(c["score"])
            else:
                passrate[key].append(bool(c.get("pass")))
    L = ["# Stability across distillation samples (model re-runs same input)\n",
         "Judge axes: mean / sd of score over reps. Grep axes: pass fraction.\n",
         "| model | sample | criterion | scores | mean | sd |",
         "|---|---|---|---|--:|--:|"]
    for key in sorted(agg):
        sc = agg[key]
        L.append(f"| {key[0]} | {key[1]} | {key[2]} | {sc} | {st.mean(sc):.2f} | {st.pstdev(sc):.2f} |")
    for key in sorted(passrate):
        pr = passrate[key]
        L.append(f"| {key[0]} | {key[1]} | {key[2]} | {sum(pr)}/{len(pr)} pass | — | — |")
    (HERE / "out" / "stability.md").write_text("\n".join(L) + "\n")


if __name__ == "__main__":
    main()
