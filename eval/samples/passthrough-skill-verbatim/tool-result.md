# Commit Style Skill

Apply these rules to EVERY commit message. Each rule is normative; follow the exact wording.

## Subject line
- Format: `<type>(<scope>): <subject>` — type and scope lowercase, subject in imperative mood.
- `<type>` MUST be one of: feat, fix, refactor, perf, test, docs, build, ci, chore, revert.
- `<scope>` is the affected module in lowercase, no spaces; omit the parens entirely if no single scope applies.
- Subject: imperative present ("add" not "added"/"adds"), no trailing period, <= 50 characters.
- Capitalize only proper nouns in the subject; the first word stays lowercase unless it is a proper noun.

## Body
- Separate subject from body with exactly one blank line.
- Wrap body at 72 columns.
- Explain WHAT and WHY, never HOW (the diff shows how).
- Use bullet points with "- " for multiple distinct changes.
- Reference issues as `#123` on their own line near the end, prefixed `Refs:` or `Closes:`.

## Breaking changes
- A breaking change MUST add a footer line starting exactly with `BREAKING CHANGE: ` followed by a description.
- The subject of a breaking change MUST also append `!` after the type/scope, e.g. `feat(api)!: ...`.

## Trailers
- Co-authors: `Co-authored-by: Name <email>` — one per line, at the very bottom.
- Sign-off when required: `Signed-off-by: Name <email>` as the final line.
- Never invent trailers; only use the two above.

## Forbidden
- No emoji anywhere in the message.
- No "WIP", "tmp", "misc", or "various fixes" as a subject.
- No past tense, no gerunds ("adding"), no questions.
- Do not exceed 50 chars on the subject even if it means dropping detail to the body.

## Revert commits
- A revert MUST use type `revert` and the subject `revert: <original subject>`.
- The body MUST contain the line `This reverts commit <full-40-char-sha>.` exactly.

## Merge commits
- Do not hand-edit merge commit subjects; keep the default `Merge ...` wording.
- If a merge needs explanation, add it to the body, never the subject.

## Examples (follow these patterns exactly)
- `feat(parser): add support for nested arrays`
- `fix(auth): reject tokens with future iat`
- `refactor(store)!: drop legacy v1 key format`  (with `BREAKING CHANGE:` footer)
- `docs(readme): clarify install prerequisites`
- `chore(deps): bump serde to 1.0.210`

## Validation order (apply in this exact sequence before committing)
1. Check subject matches `<type>(<scope>): <subject>` and type is in the allowed set.
2. Check subject length <= 50 and imperative mood.
3. Check blank line separates subject and body.
4. Check body wraps at 72.
5. Check breaking-change footer + `!` are both present or both absent.
6. Check trailers are only Co-authored-by / Signed-off-by, at the bottom.
If any check fails, fix and re-run from step 1.
