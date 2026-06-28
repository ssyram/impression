---
id: not-lazy-passthrough
type: judge
applies_to: compress
---
The log LOOKS like exact text (timestamps, verbatim lines) but the agent explicitly said it
only needs ONE fact: which step failed + the error line, "I don't need the full log". So the
correct action is COMPRESS to that fact — NOT passthrough. Score 5 if the note compressed to
the failing step (test) + the failed test name + the assertion line (automaton_test.rs:441),
dropping the ~80 lines of setup/build/passing-test noise. Score 1-2 if it passed through the
whole log (lazy passthrough — the trap: mistaking 'looks verbatim' for 'needs verbatim' when
the task only needs one extracted fact).
