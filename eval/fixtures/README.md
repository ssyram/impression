# Fixtures — distillation eval scenarios

Each `*.json` fixture is ONE distillation call: a real tool output + the surrounding
context the distiller sees, plus the assertions its note must satisfy.

## Why fixtures look like this

The distiller only ever sees three things from the agent's world:
`originalSystemPrompt`, `visibleHistory`, and the `<tool_result>` to compress.
A fixture supplies all three plus the tool name, then declares what a correct note
must / must not contain. We assert in two layers because they catch different failures:

- **grep layer** (deterministic, in `checks.ts`): is a *must-hit object* present? line
  numbers preserved, a key symbol kept, passthrough taken when required, note shorter
  than source, `Also contains:` present. Objective, fast, zero-cost, no LLM.
- **judge layer** (LLM-as-judge, in `judge.ts`): did it select the *right* facts, are
  conclusions actually grounded, did it hallucinate anything absent from source, did it
  leak the agent's voice (plan/next-step). Semantic — grep can't see these.

## Schema

```jsonc
{
  "id": "kebab-id",
  "mode": "code-read | large-grep | passthrough-rules | passthrough-diff | history-dedup | recall | non-code",
  "toolName": "read | bash | ...",
  "originalSystemPrompt": "the outer agent's system prompt (or a representative slice)",
  "visibleHistory": "prior turns — establishes the agent's CURRENT CONCERN",
  "toolResult": "the raw tool output to compress (the <tool_result> body)",

  "expect": {
    "passthrough": false,                  // true => note MUST be the sentinel; false => MUST compress

    // ---- grep layer (checks.ts) ----
    "must_contain":     ["check_tool_permission", "automaton.rs", ":1086"],
    "must_contain_any": [[":1086", "1086", "line 1086"]],   // any-of groups (format tolerance)
    "must_not_contain": ["I will", "Next, edit", "let me read more"],  // agent-voice leakage
    "shorter_than_source": true,           // note length < toolResult length
    "require_also_contains": true,         // note must end with an `Also contains:` line
    "require_position_guide": false,       // note must include a `Position guide:` section

    // ---- judge layer (judge.ts) ----
    "judge_rubric": {
      "key_facts": [                       // facts the source CONTAINS; judge scores how many survived
        "check_tool_permission_detail returns at three points",
        "requires_dispatch is the bypass precedent"
      ],
      "must_not_invent": "any line number, symbol, or claim not present in the source",
      "concern": "outer agent is mapping the permission-gate code before adding a soft-rule layer"
    }
  }
}
```

Tips for authoring `must_contain`: only assert objects that are LITERALLY in `toolResult`,
so a perfect note can pass. Asserting a fact the source doesn't contain tests the source,
not the distiller. The judge layer handles "should it have inferred X".
