### assistant
(overview already given) AgentSpec rules are triples: a trigger (an event like before_action), predicate conditions, and an enforcement action (user_inspection / llm_self_examine / invoke_action / stop). Runtime checks each rule when its trigger fires.
### user
I have the trigger/predicate/enforce overview. Now the sharper question: what is the EXACT full shape of a rule — is it really just that flat triple, or is there recursion/nesting anywhere? Show me the complete grammar and where composition happens. Don't repeat the overview I already have.
### assistant
Re-reading the rule grammar section for the exact shape.
