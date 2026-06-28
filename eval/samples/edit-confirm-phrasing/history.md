### user
In my-plugins/task-tracker.ts, the `agent_end` follow-up message tells the agent to "Please continue working." I want it to be a bit firmer: change that one line to "Please keep going and finish the remaining tasks." Leave everything else in that message exactly as-is.

### assistant
I read task-tracker.ts a moment ago, so I know roughly where that string lives — it's the `message` array built inside the `pi.on("agent_end", ...)` handler, around line 211. But this is a single-line `edit`, and the `old_string` has to match the source byte-for-byte: the array uses an em-dash header, a bullet glyph (•), backticks around `task(done, id)`, and the exact indentation of the string-array entries. If I paraphrase any of that, the edit won't apply.

Let me re-read the exact lines around the `agent_end` enforcement block to confirm the precise wording before editing — I need the literal `"Please continue working. For each task, either:"` line and its surrounding entries verbatim so the `old_string` matches.
