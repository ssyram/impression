# Impression Plugin — Agent Guidelines

Design principles and conventions for AI agents working on this codebase.

## Persistence-first principle

All observable state changes must be persisted before the corresponding in-memory mutation takes effect. The runtime behavior should always reflect the persisted state, not the other way around.

Concretely:
- Call `pi.appendEntry(...)` **before** updating in-memory fields (e.g. `impression.delivered`, `impression.fullContent`, `passthroughRemaining`).
- If `appendEntry` fails, in-memory state must remain unchanged — the system should behave as if the operation never happened.
- Never claim an action was performed based on persisted state if the persistence step has not yet completed.
- On session replay, the persisted JSONL log is the source of truth. In-memory state is reconstructed from it.

This is a core design invariant. When in doubt, persist first.

Exceptions documented in `docs/design/impression/architecture.md` §6.1 (e.g., `recallCount` non-terminal increment) are the only permitted deviations from this principle.
