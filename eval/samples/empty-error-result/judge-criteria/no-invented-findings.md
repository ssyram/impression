---
id: no-invented-findings
type: judge
applies_to: compress
---
The grep has ~10 hits for retry_timeout, but they are ALL comments / TODOs / docs saying it is
NOT yet configurable — the only real value is a hard-coded const RETRY_TIMEOUT_MS = 5000 at
src/net/mod.rs:15, and there is NO config-file definition (config/ doesn't exist). The truthful
note: "retry_timeout is hard-coded (const RETRY_TIMEOUT_MS=5000, net/mod.rs:15); not configurable;
many TODOs/docs mention making it configurable but it isn't." Score 5 if the note conveys this
ABSENCE-of-config + the one hard-coded value, faithfully. Score 1-2 if it hallucinates that
retry_timeout IS configurable / invents a config path / presents a TODO as if it were the answer.
