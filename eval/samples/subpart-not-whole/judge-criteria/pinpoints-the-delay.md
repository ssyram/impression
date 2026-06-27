---
id: pinpoints-the-delay
type: grep
applies_to: compress
---
# Surfaces the ONE relevant span: where the backoff delay is computed
## must_contain
- compute_backoff_delay
## must_contain_any
- ["retry.rs:180", ":180", "180-184", "line 180"]
