---
id: answers-three-parts
type: judge
applies_to: compress
---
The user asked three things: (1) which fn refreshes a token, (2) what params, (3) what
return. Score 5 only if ALL THREE are answerable from the NOTE alone: fn=refresh_token,
params=client/refresh_token/scope, returns=Result<TokenPair,AuthError> with TokenPair
fields access_token/refresh_token/expires_in. Any of the three missing → score <= 2.
The NOTE should drop build_header and unrelated_helper (noise).
