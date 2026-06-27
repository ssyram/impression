---
id: no-agent-voice
type: grep
applies_to: compress
---
# No agent-voice leak

The note is field-notes, not the agent. It must not slip into the agent's voice
(planning, next-steps, first-person action). Any of these substrings (case-insensitive)
is a role-confusion leak.

## must_not_contain
- "I will"
- "I'll "
- "let me "
- "Next, I"
- "Next, edit"
- "my approach is"
- "my plan"
- "I detected"
- "I should"
