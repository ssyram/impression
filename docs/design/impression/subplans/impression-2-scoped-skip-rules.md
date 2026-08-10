# Scoped skip-distillation rules

## Intent

Allow automatic passthrough for selected tool calls without turning the feature into an authorization engine. Rules must be deterministic, inspect only a tool result event's name and input, and make a missing or invalid condition fail closed.

## Decision

`skipDistillation` is a map from an exact tool name to its input conditions:

```json
{
  "skipDistillation": {
    "try_load_skill_or_prompt": {},
    "subagent": {
      "action": "list"
    }
  }
}
```

The map replaces the previous array form. Each condition value is a string pattern.

## Matching contract

`shouldSkipDistillation(toolName, toolInput, rules)` returns true only when all of the following hold:

1. `toolName` is an exact key in `config.skipDistillation`.
2. Every condition key exists in `toolInput` with a string value.
3. Every input value matches its pattern.

An empty condition object matches every input for its tool. Multiple conditions are conjunctive. A plain pattern uses exact equality. A `/.../` pattern is a JavaScript regular expression tested against the string value. An invalid regular expression and a missing or non-string input value do not match.

This iteration deliberately excludes tool-name globs, parameter wildcards, deep object matching, array matching, and model-mediated policy decisions. The configuration controls result distillation only; it never authorizes or denies a tool call.

## Integration

- `ImpressionConfig` and `ResolvedConfig` represent `skipDistillation` as the rule map.
- Config validation accepts only records whose values are records of string patterns.
- Configuration patches clone both rule-map levels before persistence.
- The `tool_result` handler passes `event.input` to the matcher.
- `/impression tool1,tool2,...` adds empty condition objects for the named tools.
- `/impression set SkipDistillation` accepts the JSON rule map.

## Acceptance cases

- `{ "subagent": { "action": "list" } }` matches only a `subagent` event with `input.action === "list"`.
- `{ "subagent": { "action": "/^(list|status)$/" } }` matches those two string actions.
- `{ "tool": {} }` matches every `tool` event, including events without input.
- A missing parameter, a non-string parameter, a non-matching value, an unknown tool, or an invalid regular expression does not match.
