import { describe, expect, it } from "vitest";
import type { Api, Model } from "@earendil-works/pi-ai";
import { selectDistillationModel } from "./select-distillation-model.js";

function model(provider: string, id: string, reasoning = true): Model<Api> {
	return {
		id,
		name: id,
		api: "faux",
		provider,
		baseUrl: "http://localhost:0",
		reasoning,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 8192,
		maxTokens: 1024,
	};
}

const hasProvider = (name: string) => ["codex-001", "zai", "openrouter"].includes(name);

describe("selectDistillationModel", () => {
	it("preserves the active model for _SELF and fails without one", () => {
		const current = model("codex-001", "gpt-6-sol");
		expect(selectDistillationModel("_SELF", current, [], hasProvider)).toEqual({
			ok: true, kind: "self", model: current,
		});
		expect(selectDistillationModel("_SELF", undefined, [], hasProvider)).toEqual({
			ok: false, reason: "no active model selected",
		});
	});

	it("uses a model under another provider when the current one has no match", () => {
		const current = model("codex-001", "gpt-6-sol");
		const glm = model("zai", "glm-5.3");
		expect(selectDistillationModel("glm-5.3", current, [current, glm], hasProvider)).toEqual({
			ok: true, kind: "fixed", model: glm, effort: undefined,
		});
	});

	it("prefers a current-provider fuzzy hit over another provider's exact hit", () => {
		const current = model("codex-001", "gpt-6-sol-preview");
		const other = model("zai", "gpt-6-sol");
		expect(selectDistillationModel("gpt-6-sol", current, [other, current], hasProvider)).toMatchObject({
			model: current,
		});
	});

	it("uses the first ranked match when there is no active provider", () => {
		const first = model("zai", "gpt-6-sol");
		const second = model("codex-001", "gpt-6-sol");
		expect(selectDistillationModel("gpt-6-sol", undefined, [first, second], hasProvider)).toMatchObject({
			model: first,
		});
	});

	it("restricts an explicit provider without reconstructing a model from the fuzzy name", () => {
		const current = model("codex-001", "gpt-6-sol");
		const other = model("zai", "glm-5.3");
		expect(selectDistillationModel("zai/glm-5", current, [current, other], hasProvider)).toMatchObject({
			model: other,
		});
		expect(selectDistillationModel("codex-001/glm-5", current, [current, other], hasProvider).ok).toBe(false);
	});

	it("retains valid effort and drops unsupported or unknown effort", () => {
		const capable = model("codex-001", "gpt-6-luna");
		const unable = model("zai", "glm-5.3", false);
		expect(selectDistillationModel("gpt-6-luna:high", undefined, [capable], hasProvider)).toMatchObject({
			model: capable, effort: "high",
		});
		expect(selectDistillationModel("glm-5.3:high", undefined, [unable], hasProvider)).toMatchObject({
			model: unable, effort: undefined,
		});
		expect(selectDistillationModel("gpt-6-luna:bad", undefined, [capable], hasProvider)).toMatchObject({
			model: capable, effort: undefined,
		});
	});

	it("treats a complete colon-bearing model id as literal and preserves slash ids", () => {
		const literal = model("openrouter", "openai/gpt-6-sol:high");
		expect(selectDistillationModel("openrouter/openai/gpt-6-sol:high", undefined, [literal], hasProvider)).toMatchObject({
			model: literal, effort: undefined,
		});
		expect(selectDistillationModel("openai/gpt-6-sol:high", undefined, [literal], hasProvider)).toMatchObject({
			model: literal, effort: undefined,
		});
	});

	it("does not mutate the catalog or invent a model when none matches", () => {
		const only = model("codex-001", "gpt-6-sol");
		const catalog = [only];
		expect(selectDistillationModel("glm-5.3", only, catalog, hasProvider)).toEqual({
			ok: false, reason: 'no model matches "glm-5.3"',
		});
		expect(catalog).toEqual([only]);
	});
});
