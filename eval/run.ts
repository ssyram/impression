/**
 * Distillation eval runner.
 *
 *   configs.json (model matrix)  ×  fixtures/*.json (scenarios)
 *      → real distillWithSameModel() call per pair
 *      → Layer 1 grep checks (checks.ts)
 *      → Layer 2 LLM judge   (judge.ts, optional via --judge)
 *      → out/<config>/<fixture>.txt + report.md
 *
 * This is an EVAL, not a unit test: the distiller has no mock seam, it must hit a
 * real endpoint. configs.json supplies url+key+model; fixtures supply the scenario
 * and assertions.
 *
 * Usage:
 *   node --experimental-strip-types run.ts                 # grep layer only
 *   node --experimental-strip-types run.ts --judge haiku   # + LLM judge (model id substring)
 *   node --experimental-strip-types run.ts --only 01,04    # subset of fixtures
 *
 * IMPORTANT — model construction: the distiller needs a real `Model<Api>` plus an
 * auth resolver. In production these come from `ctx.modelRegistry` (see
 * ../../historian/workers.ts). Standalone we cannot reach that registry, so
 * `buildModel()` below is the ONE integration point you must wire to your endpoint.
 * It is intentionally a stub that throws with instructions, so the harness fails
 * loudly rather than silently testing a fake model.
 */

import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// distill.ts is imported lazily (inside the run loop) because it transitively pulls
// in @earendil-works/pi-ai, which only resolves inside the pi-mono workspace build.
// Keeping it lazy lets --check-only run anywhere with zero heavy deps.
import { runChecks, type ExpectBlock } from "./checks.ts";
import { judgeNote, type JudgeRubric, type JudgeScore } from "./judge.ts";

const HERE = dirname(fileURLToPath(import.meta.url));

interface ConfigEntry {
	name: string;
	url: string;
	apiKey?: string;
	apiKeyEnv?: string;
	model: string;
	variant?: "first-person" | "third-person";
	maxTokens?: number;
}

interface Fixture {
	id: string;
	mode: string;
	toolName: string;
	originalSystemPrompt: string;
	visibleHistory: string;
	toolResult: string;
	expect: ExpectBlock & { judge_rubric?: JudgeRubric };
}

function resolveKey(c: ConfigEntry): string {
	if (c.apiKey) return c.apiKey;
	if (c.apiKeyEnv) {
		const v = process.env[c.apiKeyEnv];
		if (v) return v;
		throw new Error(`config "${c.name}": env ${c.apiKeyEnv} is not set`);
	}
	throw new Error(`config "${c.name}": no apiKey or apiKeyEnv`);
}

/**
 * THE ONE WIRING POINT. Build a Model<Api> for the endpoint in `c`.
 * Replace the throw with your provider factory, e.g. from @mariozechner/pi-ai:
 *
 *   import { createOpenAICompatible } from "@mariozechner/pi-ai";
 *   return createOpenAICompatible({ baseURL: c.url, model: c.model, maxTokens: c.maxTokens ?? 8192 });
 *
 * The exact factory depends on your provider (OpenAI-compatible / anthropic / google).
 * Keep maxTokens so the distiller's length math matches production.
 */
function buildModel(c: ConfigEntry): any {
	throw new Error(
		`buildModel() is a stub — wire it to your pi-ai provider factory for "${c.model}" at ${c.url}. ` +
			`See the comment above this function in run.ts.`,
	);
}

function loadFixtures(only?: Set<string>): Fixture[] {
	const dir = join(HERE, "fixtures");
	return readdirSync(dir)
		.filter((f) => f.endsWith(".json") && f !== "README.md")
		.map((f) => JSON.parse(readFileSync(join(dir, f), "utf-8")) as Fixture)
		.filter((fx) => !only || only.has(fx.id) || only.has(fx.id.split("-")[0]));
}

interface Row {
	config: string;
	fixture: string;
	mode: string;
	gripPass: boolean;
	gripFailures: string[];
	judge?: JudgeScore;
	error?: string;
}

async function main() {
	const args = process.argv.slice(2);
	const judgeIdx = args.indexOf("--judge");
	const judgeModelId = judgeIdx >= 0 ? args[judgeIdx + 1] : undefined;
	const onlyIdx = args.indexOf("--only");
	const only = onlyIdx >= 0 ? new Set(args[onlyIdx + 1].split(",")) : undefined;

	const cfgDoc = JSON.parse(readFileSync(join(HERE, "configs.json"), "utf-8"));
	const configs: ConfigEntry[] = cfgDoc.configs;
	const fixtures = loadFixtures(only);

	console.log(`configs=${configs.length} fixtures=${fixtures.length} judge=${judgeModelId ?? "off"}`);
	const rows: Row[] = [];

	for (const c of configs) {
		const outDir = join(HERE, "out", c.name);
		mkdirSync(outDir, { recursive: true });
		let model: any, auth: { apiKey: string };
		try {
			model = buildModel(c);
			auth = { apiKey: resolveKey(c) };
		} catch (e: any) {
			console.error(`[${c.name}] setup failed: ${e.message}`);
			for (const fx of fixtures) rows.push({ config: c.name, fixture: fx.id, mode: fx.mode, gripPass: false, gripFailures: [], error: e.message });
			continue;
		}

		const { distillWithSameModel } = await import("../src/distill.ts");
		for (const fx of fixtures) {
			try {
				const out = await distillWithSameModel(
					model,
					c.variant,
					auth,
					fx.toolName,
					[{ type: "text", text: fx.toolResult }],
					fx.visibleHistory,
					fx.originalSystemPrompt,
					c.maxTokens ?? 8192,
				);
				writeFileSync(join(outDir, `${fx.id}.txt`), `passthrough=${out.passthrough}\n--- thinking ---\n${out.thinking ?? ""}\n--- note ---\n${out.note}`);

				const grip = runChecks(out, fx.expect, fx.toolResult.length);
				let judge: JudgeScore | undefined;
				if (judgeModelId && !out.passthrough && fx.expect.judge_rubric) {
					judge = await judgeNote(buildModel({ ...c, model: judgeModelId }), auth, fx.toolResult, out.note, fx.expect.judge_rubric);
				}
				rows.push({ config: c.name, fixture: fx.id, mode: fx.mode, gripPass: grip.pass, gripFailures: grip.failures, judge });
				console.log(`[${c.name}] ${fx.id}: grep=${grip.pass ? "PASS" : "FAIL"}${judge ? ` judge=F${judge.faithfulness}/S${judge.sufficiency}/D${judge.discipline}` : ""}`);
			} catch (e: any) {
				rows.push({ config: c.name, fixture: fx.id, mode: fx.mode, gripPass: false, gripFailures: [], error: e.message });
				console.error(`[${c.name}] ${fx.id}: ERROR ${e.message}`);
			}
		}
	}

	writeFileSync(join(HERE, "out", "report.md"), renderReport(rows));
	console.log(`\nreport → eval/out/report.md`);
}

function renderReport(rows: Row[]): string {
	const L: string[] = ["# Distillation eval report\n"];
	L.push("| config | fixture | mode | grep | judge F/S/R/D | halluc | failures |");
	L.push("|---|---|---|:--:|:--:|:--:|---|");
	for (const r of rows) {
		const j = r.judge;
		const js = j ? `${j.faithfulness}/${j.sufficiency}/${j.relevance}/${j.discipline}` : "—";
		const h = j ? (j.hallucinations.length ? `⚠️${j.hallucinations.length}` : "0") : "—";
		const fail = r.error ? `ERR: ${r.error}` : r.gripFailures.join("; ");
		L.push(`| ${r.config} | ${r.fixture} | ${r.mode} | ${r.gripPass ? "✅" : "❌"} | ${js} | ${h} | ${fail} |`);
	}
	// aggregate
	const byCfg = new Map<string, { n: number; pass: number }>();
	for (const r of rows) {
		const a = byCfg.get(r.config) ?? { n: 0, pass: 0 };
		a.n++;
		if (r.gripPass) a.pass++;
		byCfg.set(r.config, a);
	}
	L.push("\n## grep pass-rate per config\n");
	for (const [c, a] of byCfg) L.push(`- ${c}: ${a.pass}/${a.n}`);
	return L.join("\n") + "\n";
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
