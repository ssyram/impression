---
id: keeps-api-surface
type: grep
applies_to: compress
---
# Keeps the refresh_token API surface
## must_contain
- refresh_token
- TokenPair
- AuthError
## must_contain_any
- ["scope", "Option<&str>"]
- ["Result<TokenPair", "TokenPair, AuthError", "Result"]
