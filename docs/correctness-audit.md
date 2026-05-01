# Impression Plugin — Correctness Audit Report

**Date:** 2025-01-27
**Scope:** Full correctness audit of `impression` plugin against `docs/design/impression/architecture.md` and `agents.md` contracts.
**Rounds:** 8 (converged at Round 8)
**Dimensions:** functional-correctness, crash-safety, resource-lifecycle, spec-implementation, cross-boundary

## Round 1 — Initial Audit

10 findings (F1–F10). F7 rejected by confirmation + adversarial challenge.

| ID | Severity | File | Status | Description |
|----|----------|------|--------|-------------|
| F1 | High | `index.ts` | Fixed | `deliverFullContent` mutated memory before persisting |
| F2 | High | `src/distill.ts` | Fixed | `distillWithSameModel` could throw; `stopReason === "length"` too narrow; blowup returned debug string |
| F3 | Info | — | No action | Image placeholder is intentional |
| F4 | Info | — | No action | Shallow validators sufficient for typed JSONL |
| F5 | Info | — | No action | Truncation is upstream responsibility |
| F6 | Medium | `index.ts` | Fixed | `skip_impression` count accepted negative/fractional |
| F7 | Info | — | Rejected | Config replay ordering — `getBranch()` is correct |
| F8 | Medium | `src/types.ts` | Fixed | `isImpressionEntry` fullContent element shape check missing |
| F9 | Low | `architecture.md` | Fixed | Doc didn't reflect new distill contract |
| F10 | Info | — | No action | maxPassthroughCount rebound not needed |

## Round 2 — Post-fix Re-audit

13 deduplicated findings. Key new issues:

| ID | Severity | Status | Description |
|----|----------|--------|-------------|
| R2-1 | High | Fixed | distill.ts catch block calls `serializeContent` — can re-throw |
| R2-2 | Medium | Fixed | `passthroughRemaining--` before persist at 6 locations |
| R2-3 | Low | Fixed | Session stats memory-first |
| R2-4 | Low | Fixed | `impressions.set` before `appendEntry` |
| R2-5 | — | Exempted | `recallCount` persist-first — architecture doc explicitly exempts |
| R2-6 | Medium | Fixed | Sentinel comparison not case-insensitive |
| R2-7 | High | Fixed | Recall flow: recallCount incremented before threshold check |
| R2-8 | Accepted | Recall passthrough keeps both overage checks — by design |
| R2-9 | — | No action | Element shape check — sufficient for JSONL |
| R2-10 | — | No action | Replay validation — runtime guards sufficient |
| R2-11 | Medium | Fixed | `serializeContent` unguarded in tool_result handler |
| R2-12 | Low | Fixed | `save_impression` fs error handling |
| R2-13 | Info | Fixed | Architecture doc deliverFullContent ordering outdated |

## Round 3

3 findings — missed locations from Round 2 fixes:

| ID | Status | Description |
|----|--------|-------------|
| R3-Fn-1 | Fixed | `impressions.set` before `appendEntry` on normal distillation path (not just passthrough-rejected) |
| R3-Fn-2 | Fixed | `serializeContent` unguarded in passthrough `tool_result` branch (not just non-passthrough) |
| R3-F1 | Fixed | Recall passthrough `recallCount = cfg.maxRecall` reordered before `deliverFullContent` |

## Round 4

3 findings:

| ID | Status | Description |
|----|--------|-------------|
| R4-F1 | Repeat | Recall passthrough overage (= R2-8, awaiting decision) |
| R4-F2 | Exempted | `recallCount` persist-first (repeat) |
| R4-F3 | Fixed | Sentinel multi-wrapper: regex stripped ALL quote/backtick layers, not one |

Also fixed:
- `process.cwd()` moved inside `save_impression` try/catch
- `agents.md` exception clause referencing architecture.md §6.1

## Round 5

3 findings:

| ID | Status | Description |
|----|--------|-------------|
| R5-F1 | Fixed | `applyConfigPatch` lowering `maxPassthroughCount` didn't clamp `passthroughRemaining` |
| R5-F2 | Fixed | Sentinel punctuation/quote order: strip punctuation BEFORE single-layer unwrap |
| R5-F3 | Fixed | Architecture doc `--persist` → `--persistent` |

**Crash-safety CONVERGED at Round 5.**

## Round 6

2 findings:

| ID | Status | Description |
|----|--------|-------------|
| R6-Fn | Rejected | Bare tool name shorthand — design choice (requires comma) |
| R6-F1 | Fixed | `session_start` replay didn't clamp `passthroughRemaining` after `resolveConfig` |

## Round 7

5 findings:

| ID | Status | Description |
|----|--------|-------------|
| R7-Fn | Fixed | Fractional `maxPassthroughCount` — added `Math.floor` in `resolveConfig` |
| R7-F1 | Accepted | `applyConfigPatch` non-atomic two-entry write — risk accepted, session_start self-heals |
| R7-F2 | Accepted | Sentinel punctuation: `.!。` only — conservative by design |
| R7-F3 | Fixed | Architecture doc: removed `recordImpressionData` from memory-first exception |
| R7-F4 | Accepted | `skip_impression` count optional in schema, required in prompt — runtime enforces |

## Round 8 — Convergence

Narrow verification of Round 7 fixes. **CONVERGED — no new findings.**

## Decisional Items — Resolved

| ID | Decision | Rationale |
|----|----------|-----------|
| R2-D4 | C) Keep both overage checks | Recall passthrough retains overEstimate + hardLimit checks. Prevents agent from using recall to bypass estimatedChars limits. |
| R7-F1 | A) Accept risk | Non-atomic two-entry write in `applyConfigPatch` is acceptable. `appendEntry` is synchronous JSONL; failure is near-impossible. `session_start` clamp provides self-healing. |
| R7-F2 | B) Keep `.!。` only | Sentinel punctuation strip stays conservative. LLMs rarely append `?;:` after sentinel. Broader stripping increases false-positive risk. |

## Files Modified

- `index.ts` — persist-first at all mutation sites, serializeContent try/catch, save_impression error handling, recall flow fix, config clamp, session_start clamp
- `src/distill.ts` — never-throws outer try/catch, stopReason guard, blowup fix, sentinel single-layer unwrap + case-insensitive + punctuation-first
- `src/types.ts` — fullContent element shape validation
- `src/config.ts` — `Math.floor` on integer config values
- `docs/design/impression/architecture.md` — updated contracts, defense lines, persist-first doc, --persistent, exception list
- `agents.md` — persist-first exception clause
