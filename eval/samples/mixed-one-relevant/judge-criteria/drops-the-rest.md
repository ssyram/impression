---
id: drops-the-rest
type: judge
applies_to: compress
---
The file has ~8 validators; the user wants ONLY validate_email. Score 5 if the note points at
validate_email (~line 160) as the answer and does NOT dump the other 7 validators (phone, zip,
username, password, url, ipv4, uuid) as if relevant — at most a one-line 'Also contains: other
validators'. Score 1-2 if it lists all validators equally (failed to select the one asked for).
