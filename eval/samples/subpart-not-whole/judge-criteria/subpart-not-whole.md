---
id: subpart-not-whole
type: judge
applies_to: compress
---
The user asked ONLY where the retry DELAY is computed and said to ignore the rest of the
retry system. The SOURCE grep has ~30 hits but only compute_backoff_delay (retry.rs:180-184)
and its call site (retry.rs:120) answer that. Score the NOTE on SELECTIVITY:
- 5 = points specifically at compute_backoff_delay:180-184 (and optionally its call at :120)
  as THE delay computation, and does NOT dump the whole retry surface (RetryConfig fields,
  should_retry, record_attempt, run_with_retry loop, tests) as if all equally relevant.
- 2 or below = the note restates the whole file / lists most hits as a flat guide / has a
  single entry that re-states the entire result. Pointing at the whole defeats the note.
Penalize a Position guide that is just the grep re-emitted with little selection.
