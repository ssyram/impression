/**
 * Layer 2 — LLM-as-judge scoring of a distilled note.
 *
 * Grep can confirm an object is PRESENT; it cannot confirm the note is FAITHFUL
 * (no hallucination), SUFFICIENT (kept the load-bearing facts), or DISCIPLINED
 * (no agent-voice / no conversation restatement). The judge sees the source, the
 * note, and the fixture rubric, and scores those four axes 1-5 plus a hard
 * hallucination flag.
 *
 * The judge is given the SOURCE so it can verify every note claim is grounded —
 * this is the single most important check, since a confident hallucination is the
 * worst distillation failure and the one grep is blind to.
 */

// NOTE: pi-ai is imported lazily inside judgeNote() so this module loads offline
// (the grep layer and parseJudge() need no LLM / no pi-ai module graph).

export interface JudgeRubric {
	key_facts?: string[];
	must_not_invent?: string;
	concern?: string;
}

export interface JudgeScore {
	faithfulness: number; // 1-5: every claim grounded in source (5 = nothing invented)
	sufficiency: number; // 1-5: load-bearing key_facts survived into the note
	relevance: number; // 1-5: selected by the agent's concern, not noise
	discipline: number; // 1-5: no agent-voice, no plan/next-step, no history restatement
	hallucinations: string[]; // concrete claims in note absent from / contradicting source
	notes: string;
}

const JUDGE_SYSTEM = `You are a strict, unflattering evaluator of a tool-output DISTILLATION.
A distiller compressed a raw tool result into a short note for an outer agent that will
see ONLY the note. You are given: the raw SOURCE, the produced NOTE, and a RUBRIC.

Score four axes 1-5 (5 best). Be harsh; default to the lower score when unsure:
- faithfulness: is every factual claim in the NOTE grounded in the SOURCE? Any line
  number, symbol, or statement not supported by SOURCE is a hallucination → low score.
- sufficiency: did the NOTE preserve the rubric's key_facts (the load-bearing ones)?
- relevance: did it select by the agent's concern rather than dumping or padding?
- discipline: NO agent-voice ("I will", "next, edit"), NO plan/next-steps, NO restating
  what conversation history already concluded.

List every hallucination concretely (quote the unsupported note claim). If none, [].
Output ONLY minified JSON:
{"faithfulness":N,"sufficiency":N,"relevance":N,"discipline":N,"hallucinations":["..."],"notes":"one line"}`;

export async function judgeNote(
	judgeModel: any,
	auth: { apiKey?: string; headers?: Record<string, string> },
	source: string,
	note: string,
	rubric: JudgeRubric,
	signal?: AbortSignal,
): Promise<JudgeScore> {
	const user = [
		`RUBRIC concern: ${rubric.concern ?? "(none given)"}`,
		`RUBRIC key_facts (sufficiency target):\n${(rubric.key_facts ?? []).map((f) => `- ${f}`).join("\n") || "(none)"}`,
		`RUBRIC must_not_invent: ${rubric.must_not_invent ?? "(none)"}`,
		`\n===== SOURCE (ground truth) =====\n${source}`,
		`\n===== NOTE (under evaluation) =====\n${note}`,
	].join("\n");

	const { complete } = await import("@mariozechner/pi-ai");
	const resp = await complete(
		judgeModel,
		{ systemPrompt: JUDGE_SYSTEM, messages: [{ role: "user", content: [{ type: "text", text: user }], timestamp: Date.now() }] },
		{ apiKey: auth.apiKey, headers: auth.headers, signal },
	);

	const text = (resp?.content ?? [])
		.filter((b: any) => b.type === "text")
		.map((b: any) => b.text)
		.join("\n");

	return parseJudge(text);
}

export function parseJudge(text: string): JudgeScore {
	const fallback: JudgeScore = {
		faithfulness: 0,
		sufficiency: 0,
		relevance: 0,
		discipline: 0,
		hallucinations: ["JUDGE_PARSE_FAILED"],
		notes: text.slice(0, 200),
	};
	const m = text.match(/\{[\s\S]*\}/);
	if (!m) return fallback;
	try {
		const o = JSON.parse(m[0]);
		return {
			faithfulness: Number(o.faithfulness) || 0,
			sufficiency: Number(o.sufficiency) || 0,
			relevance: Number(o.relevance) || 0,
			discipline: Number(o.discipline) || 0,
			hallucinations: Array.isArray(o.hallucinations) ? o.hallucinations : [],
			notes: String(o.notes ?? ""),
		};
	} catch {
		return fallback;
	}
}
