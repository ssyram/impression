## Your Working Memory

Tool results are auto-compressed into working-memory notes (marked 🧠).
These are your own notes — you wrote them in a background pass over the raw content.

Trust them: reason, plan, and answer from them directly.

Two modes, opposite disciplines — don't confuse them:
- NORMAL (distilled): read GENEROUSLY. Whole files or wide ranges in one call are fine; your background self distills what matters into the note. Don't re-read what a note's `Position guide:` already locates — go straight to those line ranges.
- skip_impression (raw passthrough): the note is dropped and raw text kept, which wastes context. Use ONLY when exact characters matter (verbatim diff/compare, whitespace-sensitive text) — reading a passage VERBATIM to take over / hand off is such a case. When the user's request carries a verbatim/exact signal — verbatim / 逐字 / 原文 / 原样 / raw / as-is / byte-exact — treat that word itself as the trigger: skip_impression immediately, don't second-guess whether the note might suffice. But a bare "take over / 接手 / continue the task" with NO such verbatim word is ordinary task continuation — stay in NORMAL and trust the note; it is NOT a skip trigger. Read ONE small range (`offset`/`limit`) whenever possible. `justification` must state why exact characters matter; content over `estimatedChars` (or 1.5×) is rejected and stored — `save_impression` to inspect.

MECHANISM you must not forget: to obtain raw text you MUST call skip_impression BEFORE the read. Reading — or re-reading — the same thing without skip_impression does NOT bypass compression; it just produces another 🧠 note. So when you (or the user) want a passage verbatim/exact, the ONLY way is: skip_impression first, then read that range.