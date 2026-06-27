/**
 * Layer 1 — deterministic grep checks on a distilled note.
 * No LLM. Pure string assertions derived from a fixture's `expect` block.
 * These catch the objective failures: a must-hit object missing, agent-voice
 * leakage, passthrough not taken, note not shorter than source.
 */

export interface ExpectBlock {
	passthrough?: boolean;
	must_contain?: string[];
	must_contain_any?: string[][];
	must_not_contain?: string[];
	shorter_than_source?: boolean;
	require_also_contains?: boolean;
	require_position_guide?: boolean;
}

export interface CheckResult {
	pass: boolean;
	failures: string[];
}

export interface DistillOutput {
	passthrough: boolean;
	note: string;
}

/**
 * Run the deterministic layer. `sourceLen` = original toolResult length,
 * used for the shorter-than-source invariant.
 */
export function runChecks(out: DistillOutput, expect: ExpectBlock, sourceLen: number): CheckResult {
	const failures: string[] = [];
	const note = out.note ?? "";

	// passthrough contract: if expected, the call MUST have taken passthrough; if not, MUST have compressed.
	if (typeof expect.passthrough === "boolean") {
		if (expect.passthrough && !out.passthrough) {
			failures.push(`expected passthrough but distiller compressed (note ${note.length} chars)`);
		}
		if (!expect.passthrough && out.passthrough) {
			failures.push(`expected compression but distiller passed through`);
		}
	}

	// All further string checks only make sense on a compressed note.
	if (!out.passthrough) {
		const hay = note;
		const hayLower = hay.toLowerCase();

		for (const needle of expect.must_contain ?? []) {
			if (!hay.includes(needle)) failures.push(`must_contain missing: ${JSON.stringify(needle)}`);
		}

		for (const group of expect.must_contain_any ?? []) {
			if (!group.some((n) => hay.includes(n))) {
				failures.push(`must_contain_any unsatisfied: none of ${JSON.stringify(group)}`);
			}
		}

		for (const banned of expect.must_not_contain ?? []) {
			// case-insensitive: agent-voice leakage like "I will" / "Next, edit"
			if (hayLower.includes(banned.toLowerCase())) {
				failures.push(`must_not_contain present: ${JSON.stringify(banned)}`);
			}
		}

		if (expect.shorter_than_source && note.length >= sourceLen) {
			failures.push(`note (${note.length}) not shorter than source (${sourceLen})`);
		}

		if (expect.require_also_contains && !/Also contains:/i.test(hay)) {
			failures.push(`missing mandatory "Also contains:" line`);
		}

		if (expect.require_position_guide && !/Position guide:/i.test(hay)) {
			failures.push(`missing required "Position guide:" section`);
		}
	}

	return { pass: failures.length === 0, failures };
}
