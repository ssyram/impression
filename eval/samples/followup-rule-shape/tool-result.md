AgentSpec Rule Grammar (normative)

A rule set is an ordered list of rules; rules are evaluated top-to-bottom and the first whose
trigger fires AND whose predicate holds applies its enforcement.

Grammar (EBNF):

  rule_set    ::= rule+
  rule        ::= "rule" IDENT "trigger" trigger "check" predicate "enforce" enforcement "end"
  trigger     ::= "before_action" | "after_observation" | "agent_finish" | event_name
  predicate   ::= atom
                | "not" predicate
                | predicate "and" predicate
                | predicate "or" predicate
                | "(" predicate ")"
  atom        ::= IDENT "(" arg ("," arg)* ")"        // a domain predicate call, e.g. is_to_family_member(tx)
  enforcement ::= action
                | enforcement ";" enforcement          // sequence: run left, then right
  action      ::= "user_inspection"
                | "llm_self_examine" "(" STRING ")"
                | "invoke_action" "(" IDENT ")"
                | "stop"

Key shape facts:
- The rule HEADER is the flat triple (trigger, predicate, enforcement) — that part is as simple
  as the overview said.
- Recursion lives in TWO places, both inside the triple's slots:
  (1) `predicate` is recursive: it composes via `not` / `and` / `or` / parentheses, so a check
      can be an arbitrarily nested boolean expression over atoms.
  (2) `enforcement` is recursive via `;` (sequence): an enforcement can chain multiple actions.
- `atom` is NOT recursive — it is a leaf call into a domain predicate function (the only
  place user Python is plugged in). So nesting depth comes from boolean composition of atoms,
  not from atoms themselves.
- There is no recursion in `trigger`: a trigger is always a single event token.

Example (nested predicate + sequenced enforcement):

  rule guard_transfer
    trigger before_action
    check is_transfer(a) and (amount(a) > 10000 or not is_to_known_payee(a))
    enforce llm_self_examine("is this transfer safe?") ; user_inspection
  end

So a rule is "a flat triple whose check-slot and enforce-slot are each their own little
recursive grammar". The simplicity ("just a triple") and the power (nested predicates,
sequenced enforcement) coexist: the top level is flat, the two inner slots recurse.
