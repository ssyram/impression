---
id: drops-the-payload
type: judge
applies_to: compress
---
The user asked ONLY for the subscription tier (subscription.tier = "enterprise"). Score 5 if
the note gives that one field/value and does NOT dump the rest of the payload (email, profile,
preferences, usage, org, flags, addresses, integrations) as if relevant — at most a one-line
'Also contains: full user payload'. Score 1-2 if it reproduces most of the JSON (failed to
extract the one field asked for). The tier value must be exactly "enterprise" (no fabrication).
