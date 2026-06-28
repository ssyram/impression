---
id: finds-failing-step
type: grep
applies_to: compress
---
# Must surface the ONE fact asked for: test step failed + the error line
## must_contain
- test
## must_contain_any
- ["soft_rule_routing_denies_unreviewed", "automaton_test.rs:441", "1 failed"]
