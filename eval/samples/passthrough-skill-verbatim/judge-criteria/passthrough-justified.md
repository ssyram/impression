---
id: passthrough-justified
type: judge
applies_to: passthrough
---
The agent explicitly asked to FOLLOW the commit-style skill EXACTLY, verbatim, applying every
rule. This is rules/skill text whose precise wording will be followed across the whole
content — the canonical passthrough case (case 1: prompts/skills/rules followed verbatim).
Compressing it into a note would lose the exact normative wording (the allowed type set, the
50/72 limits, the exact `BREAKING CHANGE:` / `This reverts commit <sha>.` strings, the
validation order) and DEGRADE execution.
Score 5 if the distiller PASSED THROUGH (returned the sentinel). Score 1-2 if it compressed
the skill into a summary/note — that is the failure mode this sample guards against.
