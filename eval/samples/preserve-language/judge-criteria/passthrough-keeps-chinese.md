---
id: passthrough-keeps-chinese
type: judge
applies_to: passthrough
---
The user will quote this Chinese documentation VERBATIM into a public release note, "每个字、每个
标点都要保持原样，不要翻译，不要改写或总结，先把原文给我". This is an all-relevant + needs-exact-
phrasing case (and the exact phrasing is in Chinese). The correct action is PASSTHROUGH — return
the original Chinese unchanged. Score 5 if the distiller PASSED THROUGH. Score 1-2 if it
compressed/summarized the Chinese, or (worse) translated it to English (losing the verbatim
Chinese the user explicitly needs). This guards: verbatim need + original language must survive.
