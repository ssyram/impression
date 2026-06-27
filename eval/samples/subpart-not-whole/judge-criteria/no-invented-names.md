---
id: no-invented-names
type: judge
applies_to: compress
---
Faithfulness focused on the two known hallucination modes:
1. EXTERNAL KNOWLEDGE: does the NOTE add any project lesson/convention/fact NOT present in
   SOURCE (e.g. "the codebase convention is...", a named design rule)? Any such addition,
   even if plausibly true, is a hallucination — list it.
2. INVENTED NAMING: does the NOTE give a name/role to something SOURCE left unnamed, or
   attach a symbol name from one line to a different span? List each.
Score 5 only if neither occurs. Every name/number in the NOTE must be locatable in SOURCE.
