---
id: passthrough-for-edit
type: judge
applies_to: passthrough
---
The agent already read this file and has now re-read it for ONE reason: it is about to make a
precise, single-line `edit`, and an `edit`'s `old_string` must match the source byte-for-byte.
The agent explicitly said it needs the literal wording verbatim — the exact `"Please continue
working. For each task, either:"` line plus the surrounding string-array entries, with their
em-dash, bullet glyph (•), backticks (`task(done, id)`), and indentation intact. This is the
canonical passthrough case: the agent needs the raw source text to drive an edit, so the correct
action is to PASS THROUGH the code unchanged. A compressed note — even a faithful summary — would
strip or normalize whitespace, glyphs, and quoting, so the agent would build an `old_string` that
does not match and the edit would silently fail or hit the wrong line.

Score 5 if the distiller PASSED THROUGH (returned the sentinel / the verbatim source). Score 1-2
if it compressed or summarized the code into a note — a diluted note would mislead the edit and is
exactly the failure mode this sample guards against.
