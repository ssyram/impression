---
id: no-fabrication
type: judge
applies_to: compress
---
# No fabrication — universal regression guard for the two known hallucination modes

Applies to every compressed note. The judge has SOURCE and NOTE. Score 1-5, harsh.

This is sharper than plain faithfulness: it targets the two failure modes a real run caught
(opus-4-8 on the SoftCheck grep). Score 5 ONLY if BOTH are clean:

1. NO EXTERNAL KNOWLEDGE INJECTION — the NOTE must not add any project lesson, convention,
   rule, or fact that the SOURCE does not itself contain, even if the addition is true.
   Example caught in the wild: a note asserting "AGENTS.md lesson warns against hand-copied
   cross-crate type mirrors (prefer pub use)" when SOURCE contained no AGENTS.md content at
   all. The distiller records what was FOUND, not what the model knows.

2. NO INVENTED NAMING — the NOTE must not give a name/role to something SOURCE left unnamed,
   nor attach a symbol name seen at one location to a different span. Example caught: labeling
   an unnamed signature span a "resolve_criteria helper" when that name only appeared in an
   unrelated test elsewhere in the grep.

For every name, symbol, line number, and claim in the NOTE, you must be able to point at the
exact span in SOURCE it came from. List each violation concretely (quote it) in `issues`.
A confident, well-formatted note that injects one external fact still scores low — that is
the most dangerous failure because the agent trusts the note blindly.
