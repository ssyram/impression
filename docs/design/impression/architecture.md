# Impression — Architecture

> Single-file architecture document for the `impression` pi-coding-agent extension. Captures module boundaries, runtime data flow, persistence contracts, and key design decisions. Intended as the entry point for anyone reasoning about correctness or extending the plugin.

## 1. Purpose

`impression` watches the agent's `tool_result` stream. When a non-error result is long per `minLength`, or an error result is long per the independent `errorMinLength`, it asks the active LLM by default, or a model selected by `distillModel`, to produce a compact distilled note, replaces the tool result with a placeholder text referencing an opaque `id`, and stores the full original content in the session JSONL log. The agent can later `recall_impression(id)` to retrieve a (re-distilled or full) view, `skip_impression(...)` to opt out of distillation for the next N tool results, or `save_impression(id)` to dump the full original to a sandboxed cache file for inspection.

Goal: **let the agent stay productive on long tool outputs without paying full token cost on every turn**, while keeping the original content recoverable. The user-confirmed non-retroactive skip-quota intention is recorded in [Impression's local Q](../../principles.md).

**Implemented routing:** [subplan 3 — distillation model selection](subplans/impression-3-distill-model-routing.md) specifies optional `distillModel`, fuzzy catalog selection across providers, nullable effort, and unchanged result-storage behavior. The active-model path remains the `_SELF` default. Offline faux-provider tests cover first-result, Recall, `/impression set`, cross-provider dispatch and failure passthrough; real provider speed, pricing and note quality remain unmeasured.

## 2. Module map

```
impression/
├── index.ts                          # Barrel export only
├── extension.ts                      # Creates session-owned state and registers hooks/tools/command
└── src/
    ├── impression-session-state.ts   # Per-extension-session state, persistence and recall delivery
    ├── impression-config-fields.ts   # Config field definitions and validation
    ├── register-impression-hooks.ts  # Session start, system prompt and debug hooks
    ├── register-tool-result-hook.ts  # First-result distillation and passthrough
    ├── register-recall-impression.ts # Recall rendering and re-distillation
    ├── register-skip-impression.ts   # Explicit passthrough tool
    ├── register-save-impression.ts   # Original-content file tool
    ├── register-impression-command.ts # Config command and set/load
    ├── select-distillation-model.ts # Fuzzy selection with current-provider priority
    ├── request-fixed-distillation.ts # Target provider request with optional effort
    ├── types.ts                      # Custom-entry constants, ImpressionConfig / ResolvedConfig / ImpressionEntry shapes, type guards
    ├── config.ts                     # File load + parse-error reporting + resolveConfig + saveLocalConfig
    ├── should-skip-distillation.ts   # Input-aware automatic passthrough matcher
    ├── get-tool-result-distillation-skip-reason.ts # Normal/error threshold policy
    ├── distill.ts                    # Single-shot LLM call and passthrough classification
    ├── build-structured-distillation-context.ts # Native history + current result data-message framing
    ├── select-distillation-context.ts # Hook-only structured context selection
    ├── render-legacy-distillation-prompt.ts # Retained historical single-text renderer; not used by production distillation
    ├── serialize-distillation-history.ts # Retained historical serialization helper; not used by production distillation
    ├── force-empty-tools.ts          # Provider payload replacement with explicit tools: []
    ├── prompt-loader.ts              # Lazy-cached load of prompts/*.md + {{var}} template substitution
    ├── result-builders.ts            # Build the AgentToolResult payloads returned to the framework
    ├── format-call.ts                # UI rendering for the recall_impression tool call display
    ├── format-passthrough-reason.ts  # Stable user-facing descriptions for passthrough classifications
    ├── format-distillation-failure.ts # User-facing abnormal distillation diagnostics
    ├── distillation-failure.ts        # Persisted abnormal distillation snapshot types
    ├── snapshot-diagnostics.ts        # JSON-safe diagnostic projection without stacks/signatures
    ├── snapshot-response-content.ts   # Failure response projection without opaque signatures
    ├── write-provider-debug-payload.ts # Debug-only provider payload snapshots
    └── serialize.ts                  # Tool content (text + image blocks) → flat string for length / hashing / display
```

External coupling:
- `pi.appendEntry(customType, data)` — append to session JSONL.
- `ctx.sessionManager.{getBranch, getEntries, getLeafId}` — replay history on the active branch.
- `ctx.ui.notify` / `ctx.ui.setStatus` — user-visible warnings / status line.
- `convertToLlm` (re-exported by `pi-coding-agent`) — project `AgentMessage[]` to provider-format `Message[]` for the distiller's `visibleHistory` input.
- `globalThis["$__docker_available__"]` — read-only flag set by the optional `docker` plugin to switch the data-status display from the footer status line to the docker sidebar.

## 3. Runtime data flow

```
┌───────────────────────┐
│ user prompt / tool    │
└──────────┬────────────┘
           ▼
┌──────────────────────────────────────┐
│ tool_result (event hook)             │
│   if recall/skip self-call → return  │
│   if !cfg.enabled         → return   │
│   if passthroughRemaining > 0:       │
│     overEstimate || overMax →        │
│       store impression (full),       │
│       decrement passthrough,         │
│       return rejection text          │
│     else → pass through              │
│   if shouldSkipDistillation → return │
│   serialize fullText                 │
│   if error and errorMinLength == -1  │
│     → return (disabled)              │
│   if error below errorMinLength      │
│     → return                         │
│   if non-error below minLength       │
│     → return                         │
│   else → select model, then distill: │
│     • visibleHistory = convertToLlm( │
│         buildSessionContext(         │
│           getEntries(), getLeafId()) │
│       )                              │
│     • on passthrough: persist reason,│
│       notify, return original content│
│     • else: store impression,        │
│       return placeholder text        │
└──────────────────────────────────────┘
                      ⋮ JSONL append
                      ▼
        custom-type entries on the active branch
        (impression-v1 / impression-passthrough-mode /
         impression-session-stats / impression-config-v1)
                      ▲
                      │ session_start replay (getBranch)
┌──────────────────────────────────────┐
│ recall_impression(id)                │
│   if delivered → throw (already in   │
│     LLM context)                     │
│   if passthroughRemaining: deliver   │
│     full content                     │
│   if recallCount ≥ maxRecall:        │
│     deliver full content             │
│   else: re-distill; on passthrough,  │
│     notify reason + deliver full;    │
│     otherwise return note, bump      │
│     recallCount, persist             │
└──────────────────────────────────────┘

┌──────────────────────────────────────┐
│ save_impression(id)                  │
│   if delivered → throw               │
│   write fullText to                  │
│     <cwd>/.pi/impression-cache/      │
│         <id>.txt                     │
└──────────────────────────────────────┘

┌──────────────────────────────────────┐
│ skip_impression(count, justification,│
│   estimatedChars)                    │
│   count = 0 → cancel passthrough     │
│   else: validate, set                │
│     passthroughRemaining = min(N,    │
│       cfg.maxPassthroughCount)       │
└──────────────────────────────────────┘

┌──────────────────────────────────────┐
│ /impression command                  │
│   config / print / read / (bare)     │
│   on / off / load / set [--persist]  │
│   help / -h / --help / ?             │
│   tool1,tool2,... shorthand          │
└──────────────────────────────────────┘
```

## 4. State machine — `ImpressionEntry.delivered`

```
       creation                         recall_impression
   (tool_result distill OR             passthrough deliver
   passthrough rejection)               (any branch that
           │                            returns full content)
           ▼                                  ▼
   delivered = undefined          delivered = true
   fullContent populated  ─────►  fullContent = []
   fullText populated             fullText = ""
                                  (LLM has the content now)

After delivered=true:
  - recall_impression(id): throws, content already in LLM context
  - save_impression(id):    throws, content discarded
```

`deliverFullContent` appends a separate stripped/delivered snapshot, then clears the old in-memory entry and replaces the plugin's map entry; the returned result still references the original populated array. On `session_start` replay, `Map.set(id, data)` keeps the LAST entry per id, so that snapshot wins. If plugin append throws, the old entry and plugin map still retain the original content; host-level persistence may already have mutated host memory before throwing (see §5.1).

## 5. Module specs (functional)

### 5.1 `extension.ts` / `src/impression-session-state.ts` — session-owned state

**State** (created once per extension instance by `createImpressionSessionState(pi)`, never as module-level mutable state):

| Variable | Invariant |
|---|---|
| `currentRaw: ImpressionConfig` | Result of `loadConfig()` overlaid by all `impression-config-v1` patches replayed from the active branch, with out-of-range numerics clamped. |
| `cfg: ResolvedConfig` | `cfg === resolveConfig(currentRaw)` after any handler completes. |
| `cumulativeOriginalChars`, `cumulativeImpressionChars: number` | Mirror the most recent `impression-session-stats` entry on the active branch. |
| `passthroughRemaining: number` | Persisted outstanding skip count. A positive new grant is capped by `cfg.maxPassthroughCount` **at grant time**; reducing that config later does not alter already granted balance (local Q.I). The legacy negative-count input can produce a negative value, so no unconditional nonnegative invariant is claimed. |
| `lastEstimatedChars: number` | Most recent `skip_impression.estimatedChars`, or `0`. Read only when `passthroughRemaining > 0`. |
| `impressions: Map<string, ImpressionEntry>` | For every entry in the map, the JSONL log on the active branch contains an `impression-v1` entry with the same id; the map holds the latest version. |

**Plugin-side write ordering (not a global transaction)**:

- `src/impression-session-state.ts::applyConfigPatch` appends before changing `currentRaw` / `cfg` and re-registering the skip tool.
- `src/register-tool-result-hook.ts` appends an over-limit impression before decreasing passthrough balance.
- `deliverFullContent` captures the original array, appends a *new* stripped/delivered snapshot, then clears the old in-memory entry and replaces the plugin's map entry. The original result array remains available for delivery. If append throws, the plugin map and old entry remain intact, so a same-session retry is possible while that map is retained.

These statements do **not** guarantee every state transition is disk-first: `recordImpressionData` still increments counters before appending, and the host `SessionManager._appendEntry` updates its own in-memory index before `_persist`. Host append failures can therefore leave host memory and disk divergent; this plugin change provides local map safety, not cross-layer atomicity.

### 5.2 `src/config.ts`

```
loadConfig(): { config: ImpressionConfig; warnings: string[] }
  Pre:  none
  Ensures: config = merge(global file, local file) with parse failures replaced by {}
           warnings includes one entry per file that parsed-but-failed
           (file-missing is silent; file-existed-but-bad-JSON is a warning)
  Side:  none

saveLocalConfig(patch): Promise<void>
  Pre: patch is a partial ImpressionConfig
  Ensures: .pi/impression.json reflects merge(existing on disk, patch)
           OR the operation rejected and .pi is left clean
           (atomic: writeFile(tmp) + rename(tmp, target); on rename failure tmp is unlinked)
  Concurrency: read-modify-write is NOT serialized — concurrent calls each
               read their own baseline + atomic-rename independently; the
               LATER rename overwrites the EARLIER, and the earlier writer's
               patch is lost ENTIRELY (not just reordered). Atomic rename
               guarantees no half-written state observable. See §7 for the
               full Rely-Guarantee statement.
  Side:  filesystem write to <cwd>/.pi/impression.json

shouldSkipDistillation(toolName, toolInput, rules): boolean
  Pre:  toolName is a string; toolInput is an optional input record;
        rules maps exact tool names to string conditions
  Ensures: returns true iff toolName has a rule and every condition matches a
           string input value by exact equality or /regex/ pattern; an empty
           condition object matches every call; missing, non-string, and
           invalid-regex conditions do not match and never throw
  Side:  none

resolveConfig(raw): ResolvedConfig
  Pre:  raw is a partial ImpressionConfig (caller may have unvalidated values)
  Ensures: every field of ResolvedConfig is set (default substituted for missing)
           NOTE: does NOT clamp out-of-range numerics — caller is expected to
           clamp via src/impression-config-fields.ts:clampNumeric BEFORE resolveConfig
  Side:  none
```

### 5.3 `src/distill.ts`

```
distillWithSameModel(model, mode, auth, request, maxTokens, signal,
                     onPromptVersion?, onProviderPayload?, fixedTarget?)
  Pre: model is selected from the active model or the runtime model catalog;
       self requests carry active-model auth; fixed requests carry a registry target
       maxTokens > 0
       request carries the current result, converted visible history, original
       system prompt, and current tool name
  Ensures: constructs hook-only structured framing with historical system
           reference, native visible history, a named current-result boundary,
           a `<tool_result>` user data message, and the final task
           both context and outgoing provider payload contain tools: []
           onProviderPayload receives the exact replacement payload being sent
           passthrough=true with a stable reason when output is truncated,
           empty after thinking-block stripping, a normalized <passthrough/>
           sentinel, or not shorter than the original content
           abnormal toolUse/error/aborted or future unknown stop reasons return
           passthroughReason=error with a signature-free diagnostic snapshot
           passthrough=false only for non-empty output shorter than the original
  Side: one streaming LLM call billed to the selected provider/account;
        fixed requests use ModelRegistry.streamSimple with optional reasoning;
        `_SELF` retains the former compat.complete route
```

### 5.3.1 `src/format-passthrough-reason.ts`

```
formatPassthroughReason(reason)
  Pre:  reason is PassthroughReason | undefined
  Ensures: a defined reason remains verbatim at the start of the result and is
           followed by its fixed explanation; undefined returns "unknown reason"
           no model-generated text is included
  Side: none
```

The exhaustive mapping and notice format are specified by [subplan impression-1-passthrough-reason-notices](subplans/impression-1-passthrough-reason-notices.md).

### 5.4 `src/result-builders.ts`

```
createPassthroughToolResult(content, details?)
  Ensures: returns { content, details: details ?? {} }
           CALLER is responsible for any subsequent mutation of `content` via
           reassignment (NOT splice) so the captured array reference still
           points at the original populated array
           (deliverFullContent in src/impression-session-state.ts relies on this)

createRecallToolResult(id, note, details?)
  Ensures: returns { content: [{type:"text", text: buildImpressionText(id, note)}],
                     details: details ?? {} }

buildImpressionText(id, note)
  Ensures: returns a string built from impression-text.md template
           with {{id}} and {{note}} substituted
```

### 5.5 Custom-entry types (declared in `src/types.ts`)

| customType | Purpose | Replay behavior |
|---|---|---|
| `impression-v1` | Per-impression record (id, toolName, fullContent, fullText, recallCount, delivered, ...) | Map.set(id, data) — last writer wins per id |
| `impression-passthrough-mode` | `{ remaining, lastEstimatedChars }` | Last entry on branch overwrites |
| `impression-session-stats` | `{ originalChars, impressionChars }` cumulative | Last entry on branch overwrites |
| `impression-config-v1` | Per-mutation partial `ImpressionConfig` patch | Spread-merged in append order over `loadConfig()` baseline |
| `impression-distill-log` | Per-distillation metadata; abnormal entries additionally contain the exact system/user prompt, model, output response or thrown exception | Diagnostic only; not replayed into plugin state |

All five are stored as pi `custom` entries (not `custom_message`), so `buildSessionContext.appendMessage` filters them out — they never reach the LLM. Distillation diagnostic snapshots never include API keys, auth headers, error stacks, non-primitive diagnostic detail values, or opaque text/thinking/encrypted signatures.

When `debug` is enabled, logical provider payloads for the main agent and distiller are also written to `.pi/impression-debug/<session-id>/`. Each file includes the current leaf, its parent-chain branch entries, context message count, and source-specific size metadata; these files are diagnostic artifacts rather than session entries.

### 5.6 Session-state and config-field helpers — additional function specs

Specs for helpers now in `src/impression-session-state.ts` and `src/impression-config-fields.ts`. Each block follows §3.1 of `prompts/current/workflow.md` (Pre / Ensures / Invariants / Side effects).

```
applyConfigPatch(state, patch, registerSkipTool) (src/impression-session-state.ts)
  Pre:  patch is a Partial<ImpressionConfig>.
  Ensures:
    On normal return:
      1. appendEntry(IMPRESSION_CONFIG_ENTRY_TYPE, safe) is appended FIRST (disk-first).
      2. THEN currentRaw = { ...currentRaw, ...safe }.
      3. THEN cfg = resolveConfig(currentRaw).
      4. THEN registerSkipImpressionTool() is called (the LLM-visible tool
         description re-embeds the new cfg.maxPassthroughCount /
         getPassthroughHardLimit(cfg)).
    `safe` is `patch` with `skipDistillation` (if present) defensively
    copied at both map levels so subsequent caller mutations do not leak into
    the JSONL entry / currentRaw.
    On appendEntry throw: currentRaw / cfg are unchanged AND the
    skip_impression tool registration is unchanged. The caller observes
    the throw; in-memory state stays consistent with the JSONL log.
  Invariants:
    After any normal return: cfg === resolveConfig(currentRaw)
    AND the latest config patch has been written to JSONL.
  Side effects:
    One pi.appendEntry write (custom entry on the active branch);
    up to one re-registration of the skip_impression tool.

deliverFullContent(state, impression)          (src/impression-session-state.ts)
  Pre:  impression is an ImpressionEntry with delivered !== true.
        (Caller's responsibility — recall_impression.execute and
         save_impression.execute early-throw on delivered === true.)
  Ensures:
    Returns an AgentToolResult referencing the ORIGINAL populated array.
    A distinct delivered snapshot with fullContent=[], fullText="", delivered=true
    is appended first; only on successful append are the old argument's
    fullContent/fullText cleared and delivered set, then the plugin map points
    to the snapshot. This also releases the old host entry's in-memory original
    when it shares the same object reference. Replay uses the last entry per id.
    If append throws, the argument and plugin map are unchanged and this call
    does not deliver a result; no host-level transactionality is claimed.
  Side effects:
    One pi.appendEntry attempt; one plugin map replacement on success.

clampNumeric(def, value)                       (src/impression-config-fields.ts)
  Pre:  def is a ConfigKeyDef; value is unknown.
  Ensures:
    Returns { value, warning? }.
    Passthrough { value } iff ANY of:
      - def.type !== "number"
      - def.min === undefined
      - typeof value !== "number" || !Number.isFinite(value)
      - value >= def.min
    Otherwise returns { value: def.min, warning: <human-readable string> }.
  Invariant: pure function — no side effects, no I/O, no mutation.
  Side effects: none.
```

### 5.7 Host-coupling interface specs

Plugin → host boundaries. Each block follows §3.2 of `prompts/current/workflow.md` (接口 / 输入数据 / 输出数据 / 协议约定).

```
接口：impression plugin → pi.appendEntry(customType: string, data: unknown)

输入数据：
  customType — one of the five constants declared in src/types.ts:
    IMPRESSION_ENTRY_TYPE         = "impression-v1"
    PASSTHROUGH_MODE_ENTRY_TYPE   = "impression-passthrough-mode"
    SESSION_STATS_ENTRY_TYPE      = "impression-session-stats"
    IMPRESSION_CONFIG_ENTRY_TYPE  = "impression-config-v1"
    DISTILL_LOG_ENTRY_TYPE        = "impression-distill-log"
  data — payload whose shape matches the type (per §5.5 above).

输出数据：
  void. Entry is durable in the session JSONL on return (synchronous
  append per pi-coding-agent's session-manager contract).

协议约定：
  - 调用方：MUST use one of the five declared customType strings;
    payload shape MUST match the corresponding type guard in
    src/types.ts (so replay round-trips cleanly).
  - 被调用方：guarantees the entry is on the ACTIVE branch and is
    reflected in subsequent getEntries() / getBranch() calls.
    On framework error (e.g. disk-write failure) the call THROWS;
    the plugin's disk-first ordering means in-memory state has not
    yet been mutated, so a throw is recoverable on next session_start.
```

```
接口：impression plugin → convertToLlm(messages: AgentMessage[]): Message[]
      (re-exported by @earendil-works/pi-coding-agent — src/index.ts:150)

输入数据：
  AgentMessage[] — taken from buildSessionContext(getEntries(), getLeafId()).messages.

输出数据：
  Generic pi-ai Message[] shape. Provider adapters later convert this
  shape to their wire protocol; assistant provider/model/usage metadata
  and opaque signatures can still be present at this stage.

协议约定：
  - 调用方：passes the result of buildSessionContext (with leafId
    honored, so fork siblings don't leak in).
  - impression keeps visible history as native messages. The current transaction
    is not recovered from history: the `tool_result` hook appends a named boundary
    and a separate user `<tool_result>` data message containing the current result.
  - No compatibility single-text request is sent from this path. The current
    result remains directly represented as text/image user content.
  - No message budgeting, truncation, or selection occurs in this layer.
  - 已知 Gap：the transformContext mutator chain (sibling extensions'
    "context" event hooks) is NOT applied by convertToLlm — see Known
    Gap 1 in §8 and upstream issue badlogic/pi-mono#3953.
```

```
接口：impression plugin → ctx.sessionManager.{getEntries, getBranch, getLeafId}

输入数据：
  none for getEntries() / getLeafId();
  optional fromId for getBranch() (active leaf when omitted).

输出数据：
  SessionEntry[] / id.
  - getEntries() returns ALL entries across ALL branches.
  - getBranch()  returns the active-branch chain via parent-id walk.
  - getLeafId()  returns the active leaf id.

协议约定：
  - 调用方 (replay / state reconstruction): use getBranch() so fork
    siblings don't leak in (round-3 D2).
  - 调用方 (per-distill-call visibleHistory construction): use
    getEntries() + getLeafId() and pass them to the free
    buildSessionContext — pi's free function rebuilds `byId`
    internally and walks from the leaf.
  - 被调用方：read-only view of the JSONL log on the active session;
    no mutation, no I/O on call (all loads happened at session_start
    inside the framework).
```

## 6. Key design decisions

1. **Scoped plugin-side append-first ordering.** `applyConfigPatch` and the `tool_result` passthrough-rejected branch append before their own state transitions. `deliverFullContent` now appends a separate delivered snapshot before clearing the old in-memory entry and replacing the plugin map. This prevents a failed append from consuming the plugin's original content without retaining the old large entry after a successful delivery. It does not make every path disk-first or host persistence atomic: `recordImpressionData` and non-terminal Recall still have memory-first steps, and the host updates its own memory before writing to disk.

2. **`delivered` flag as one-shot lifecycle.** Once a recall delivers the full content to the LLM (whether via passthrough mode, recallCount cap, or sentinel), `fullContent` and `fullText` are emptied and `delivered=true` is appended. Subsequent `recall_impression` and `save_impression` throw — the LLM already has the content in its message history, so re-fetching is wasted. This trades "always recoverable" for "memory-bounded long sessions".

3. **Config is session-scoped + branch-aware.** The disk file is a one-shot seed. Mid-session changes via `/impression on|off|set|load` go to the JSONL log only. Effective cfg = file → JSONL replay (active branch only) → defaults. Forking a session does NOT carry passthrough/stats/impressions across branches (round-3 D2: replay walks `getBranch()`, not `getEntries()`). Under [local Q.I](../../principles.md), changing `maxPassthroughCount` constrains later `skip_impression` grants only; already granted, unused skips are not retroactively revoked.

4. **Sandboxed `save_impression`.** Path is hard-coded to `<cwd>/.pi/impression-cache/<id>.txt`; the LLM cannot pick a destination. Round-3 D1 closed an arbitrary-path-write surface that an earlier upstream version exposed.

5. **Distill `max_tokens` budget — three defense lines + a documented unit caveat.**

   **Formula** (`computeDistillMaxTokens` in `src/impression-output-budget.ts`):

   ```
   clamp(originalLength * cfg.distillRateFloor,  1024,  model.maxTokens || 8192)
   ```

   - Lower floor `1024` ensures the model has room on tiny inputs.
   - `originalLength * distillRateFloor` is the input-scaled allowance (default `distillRateFloor = 0.02`).
   - Upper cap is the selected distillation model's per-call output ceiling, with `8192` fallback when `Model.maxTokens` is missing / 0 / NaN (custom-provider misconfig).

   **Unit caveat — explicitly accepted.** The formula mixes units: `originalLength` is in chars, but the result is used as a token budget. For English text `1 token ≈ 4 chars`, so default `0.02` chars-per-char rate corresponds to roughly an 8% output-to-input token ratio. The mismatch only meaningfully affects budgets in the ~50K–400K char input range — outside that range either the 1024 floor or the model cap dominates. We chose to document the mismatch rather than introduce a `CHARS_PER_TOKEN_APPROX` conversion constant: the prompt's length instructions, not this number, are what actually keep the digest concise. The formula is a safety ceiling, not a precision dial.

   **Three defense lines** keep the distillation safe even when the budget is wrong:

   1. **Truncation guard** (`src/distill.ts`): if `response.stopReason === "length"`, the LLM hit `max_tokens` mid-output. The note's tail may be a half sentence or even split inside a `<thinking>` block. Returning `passthrough: true` falls back to the original tool result instead of handing the agent a torn note. Defends against under-sized cap.
   2. **Length blowup guard** (`src/distill.ts`, original upstream behavior): if `strippedText.length >= contentText.length` after sentinel/thinking strip, the digest defeats its own purpose — return `passthrough: true`. Defends against the model writing a digest that is longer than the original.
   3. **Budget formula**: bounds `max_tokens` between 1024 and the model's per-call ceiling.

   **`distillRateFloor` lower-bound clamp.** Like the other numeric config fields, `distillRateFloor` is bounded below by `0` via `clampNumeric`; out-of-range values get a `ctx.ui.notify` warning and are silently coerced.

6. **Numeric range clamping with warning.** `minLength`, `errorMinLength`, `maxRecallBeforePassthrough`, `maxPassthroughCount` have lower bounds (`1`, `-1`, `0`, `0`). Out-of-range values from file / replay / `/impression set` are clamped with a `ctx.ui.notify` warning. Type-incompatible values (string where number expected, etc.) are still hard-rejected by `validateConfigValue`. `errorMinLength = -1` is the intentional disabled sentinel, `0` attempts every error result, and missing configuration resolves to `40960`.

7. **`visibleHistory` stays native and excludes the current transaction.** `convertToLlm(messages)` produces Pi `Message[]`; structured distillation preserves those historical messages unchanged, then the `tool_result` hook appends a named boundary and a user `<tool_result>` data message containing the current result. No history JSON serialization, current-call replay, message budgeting, or truncation occurs in this layer. **Known gap**: the `transformContext` mutator chain (which lets sibling extensions rewrite messages via the `"context"` event hook) is NOT applied; today no plugin in this monorepo mutates that way, but a future trimming extension would diverge. Tracked as a feature request to badlogic/pi-mono — when upstream exposes `ctx.getLlmContext()` (or `emitContext`), this plugin will switch to it.

## 7. Concurrency

Single-threaded JS event loop. The only concurrent surface is `saveLocalConfig`, where two rapid `--persistent` invocations race on disk:

```
Rely-Guarantee for saveLocalConfig:
  Rely:      OS provides POSIX-atomic rename(2) within the same filesystem;
             no other process truncates .pi/.
  Guarantee: each call emits exactly one atomic visible state transition
             (tmp → target); on rename failure leaves no orphan tmp.
  Race:      concurrent writes are NOT serialized — each call reads its
             own baseline, merges its own patch, atomic-renames. The LATER
             rename overwrites the EARLIER. The earlier writer's patch is
             lost ENTIRELY (not just reordered) because the later writer's
             on-disk result reflects only the later-baseline + later-patch,
             with no awareness of the earlier patch that briefly existed
             between the two reads. Acceptable for a manual user command.
```

## 8. KNOWN GAPS

1. **`transformContext` chain not applied to `visibleHistory`** — see decision 7 above. Tracked upstream: <https://github.com/badlogic/pi-mono/issues/3953>.
2. **Remaining integration-test gaps.** Command tab completion and passthrough reason formatting have focused unit tests. Provider-payload parity covers both `openai-completions` and OpenAI Responses conversion of the `<tool_result>` user data message, and `eval/run-pi-structured-eval.py` exercises classification through isolated `pi -p` sessions with the real extension, credential registry, provider transport, and persisted distill log. Faux-provider integration tests still do not exercise `truncated` and `failing` through the full extension flow.
3. **`impressions: Map` is unbounded for non-delivered entries.** Long sessions where the LLM never recalls accumulate stripped (post-delivery) entries plus full undelivered entries. Currently considered acceptable; a TTL / LRU eviction policy would be a separate design iteration.

## Structured distillation request framing

`distillWithSameModel` sends the same structured message sequence via `compat.complete` for `_SELF` or `ModelRegistry.streamSimple` for a fixed model. The sequence is: a user message that labels the enclosed original system prompt as historical reference that must not be executed; converted visible history; a user boundary that prohibits executing historical instructions and names the current tool; a user `<tool_result>` data message containing the complete current result; and the final passthrough-or-compress classification task. The current result is supplied directly by the `tool_result` hook, never recovered from `visibleHistory`. Explicit verbatim/edit intent and repeated reads of the same or substantially overlapping content take priority and require passthrough; only when no such rule applies does uncertainty and increasing result length favor compression. Recall uses the same result-data framing while the final task identifies the stored original tool.

The context has `tools: []`. The provider `onPayload` replacement also has explicit `tools: []`, and debug capture observes that replacement. There is no legacy model request when a current call is absent from historical messages. Failure snapshots record the structured mode and final task prompt, not serialized history or provider signatures.

The production prompt splits stable authority from call-local procedure. The system prompt retains the note-taker role, passthrough precedence, source-only provenance firewall, faithfulness constraints, output grammar, and the rule that historical context is control context rather than factual evidence. The final user message, placed immediately after the `<tool_result>` data message, runs the call-local transaction in order: classify exactness, apply the compression default, audit every factual clause against the current result alone, then emit the existing sentinel-or-note format. History may influence only intent, immediate next action, exactness classification, and relevance selection; it may not contribute entities, events, statuses, causes, relations, numbers, conclusions, or factual wording to the note.

This split was selected by measured prompt iteration rather than prompt aesthetics. Eight isolated candidates were exercised through real `pi -p` sessions. On the critical history/current-result conflict, the previous production prompt passed 2/5 repetitions, the smaller result-local gate passed 4/5, and the provenance-firewall transaction passed 5/5 on `gpt-5.6-sol`. After promotion, production passed the same provenance case 5/5 plus first-read edit passthrough, repeated-read correction, long-result compression, source prompt-injection handling, code-map compression, and history-dedup guards 6/6 on that executor. `eval/structured-message-parity.test.ts` fixes the provider message shape, while `eval/run-pi-structured-eval.py` is the behavioral runner.

A subsequent cross-model matrix measured both pre-firewall and firewall prompts as executors rather than proposal authors: 238 real sessions across five OpenLux models plus `gpt-5.6-terra` and `gpt-5.6-sol`. The firewall improved aggregate provenance from 12/35 to 22/35 and total acceptance from 85/119 to 93/119, but the gain is model-dependent: `gpt-5.6-sol` scored 17/17 and Claude Opus rose from 11/17 to 16/17, while DeepSeek Pro fell from 16/17 to 15/17, Kimi and Terra had no net change, and DeepSeek Flash remained 6/17 because it frequently exhausted the output budget. The firewall is therefore the measured default-model winner, not a universal prompt. Full evidence is in `docs/audit/prompt-iter-cross-model.md`.
