---
id: faithfulness
type: judge
applies_to: compress
---
# Faithfulness (no hallucination) — universal judge axis

Applies to every compressed note. The judge is given the SOURCE and the NOTE.

## rubric
Score 1-5 (5 best), be harsh, default low when unsure:
- Every factual claim in the NOTE — every file path, line number, symbol, signature,
  and statement — must be grounded in the SOURCE.
- Any line number / symbol / claim in the NOTE that is NOT present in (or that
  contradicts) the SOURCE is a hallucination. List each one concretely (quote it).
- A confident, well-formatted note that invents a single line number still scores low:
  fabrication is the worst distillation failure because the agent trusts the note blindly.

Output the standard judge JSON. `faithfulness` is the score for this axis; put any
invented claims in `hallucinations`.
