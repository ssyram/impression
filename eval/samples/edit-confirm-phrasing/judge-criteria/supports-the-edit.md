---
id: supports-the-edit
type: judge
applies_to: any
---
The agent is about to make a precise edit and re-read the lines to confirm wording. The note
(or passthrough) must let the agent perform a correct byte-for-byte edit. A/B testing showed
that for THIS sample (moderate edit intent, code with em-dash/bullet/backticks), BOTH outcomes
work downstream: passthrough (raw source) OR a precise Position guide with exact line numbers +
verbatim snippets of the lines to change. Score 5 if the result supports the edit — either
passthrough, OR a compressed note that preserves the exact line numbers AND the verbatim text of
the editable lines (so old_string can match byte-for-byte). Score 1-2 ONLY if it compressed away
the exact wording of the editable lines (gives a vague location but not the verbatim text), which
would force a re-read or risk a wrong old_string. (Lesson: moderate edit-intent does NOT require
passthrough — a precise position guide suffices; only strong verbatim need forces passthrough.)
