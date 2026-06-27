---
id: passthrough-justified
type: judge
applies_to: passthrough
---
The agent stated it will compare this prod config.yaml LINE-BY-LINE against staging and needs
the EXACT contents — every key and value, no summarizing. This is the file-comparison
passthrough case (case 2: this side must stay verbatim). A distilled note ("config has
service/tls/database/cache sections with these approximate settings") would DROP exact
values (port 8443, pool_max 64, ttl 3600, the cipher string, each replica host) and make the
line-by-line diff impossible — a direct execution degradation.
Score 5 if the distiller PASSED THROUGH (sentinel). Score 1-2 if it compressed the config
into a summary. This sample guards against losing precision the agent explicitly needs.
