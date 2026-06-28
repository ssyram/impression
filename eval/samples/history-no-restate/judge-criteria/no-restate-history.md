---
id: no-restate-history
type: judge
applies_to: compress
---
The history ALREADY established the answer to "is it thread-safe": Mutex-based, thread-safe but
poison-on-panic + .unwrap() risk. The NEW tool result is the EVICTION code, which contains a
SECOND, different issue: capacity eviction does `guard.keys().next()` on a HashMap expecting
"oldest" order, but HashMap has no insertion order (line 100 — evicts an arbitrary entry).
Score 5 if the note compresses the NEW result — i.e. surfaces the eviction logic and the
HashMap-no-order bug at line 100 — and does NOT restate the already-known Mutex/poison
thread-safety conclusion from history. Score 1-2 if it re-explains the thread-safety/Mutex
answer (restating the conversation instead of compressing the new tool result).
