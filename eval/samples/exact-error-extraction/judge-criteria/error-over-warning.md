---
id: error-over-warning
type: judge
applies_to: compress
---
The SOURCE has one blocking ERROR (E0599 at config.rs:88) and a decoy unused-import
WARNING (util.rs:3) buried in compile chatter. Score 5 only if the NOTE prioritizes the
ERROR with its exact code/file/line; penalize if it leads with the warning or omits the
error location.
