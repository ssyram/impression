---
id: finds-the-error
type: grep
applies_to: compress
---
# Surfaces the real blocking error (not the decoy warning at util.rs:3)
## must_contain
- E0599
- config.rs
## must_contain_any
- ["config.rs:88", ":88", "line 88"]
