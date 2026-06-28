---
id: reports-contradiction
type: judge
applies_to: compress
---
The source CONTRADICTS itself: the doc comment says connect_timeout defaults to "30 seconds",
but the Default impl sets Duration::from_secs(5) — 5s, not 30s. The user asked both the value
AND whether the doc is accurate. Score 5 if the note reports BOTH facts and flags the mismatch
(doc says 30s, code defaults to 5s — they disagree). Score 1-2 if it silently picks one (reports
only 30s OR only 5s without noting the conflict), or "resolves" the contradiction by inventing a
reason. Faithfully reporting a contradiction WITHOUT taking sides or fabricating a resolution is
the behavior this guards.
