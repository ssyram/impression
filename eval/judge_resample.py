#!/usr/bin/env python3
# Re-judge already-distilled notes N times to measure score stability (variance).
# Reuses out/<model>/<sample>.txt notes — does NOT re-distill.
import sys, json, statistics as st
sys.path.insert(0,".")
import run_eval as E
from pathlib import Path

JUDGE="claude-opus-4-8"
N=int(sys.argv[1]) if len(sys.argv)>1 else 3
cells=[("claude-opus-4-8","real-softcheck-grep"),
       ("gpt-5.5-high","real-softcheck-grep"),
       ("claude-opus-4-6-thinking","real-softcheck-grep"),
       ("gpt-5.5-high","subpart-not-whole"),
       ("claude-opus-4-6-thinking","subpart-not-whole")]
# only the faithfulness-family axes (the ones the fix targets)
AXES={"faithfulness","no-fabrication","faithful-citations","subpart-selectivity","subpart-not-whole","no-invented-names"}
cfg={"name":"j","model":JUDGE}
print(f"resampling N={N} per axis, judge={JUDGE}\n")
for model,sid in cells:
    f=Path(f"out/{model}/{sid}.txt")
    if not f.exists(): continue
    note=f.read_text().split("--- note ---\n",1)[1]
    s=E.load_sample(Path(f"samples/{sid}"))
    src=s["tool_result"]
    print(f"### {model} / {sid} (note {len(note)/len(src):.0%} of src) ###")
    for c in s["criteria"]:
        if c["type"]!="judge" or c["id"] not in AXES: continue
        scores=[]
        for _ in range(N):
            try: scores.append(E.judge_one(cfg,JUDGE,src,note,c)["score"])
            except Exception as ex: scores.append(-1)
        good=[x for x in scores if x>=0]
        m=st.mean(good) if good else 0
        sd=st.pstdev(good) if len(good)>1 else 0
        print(f"  {c['id']:22} {scores}  mean={m:.1f} sd={sd:.2f}")
    print()
