import { describe, expect, it } from "vitest";
import type { Api, Model } from "@earendil-works/pi-ai";
import { resolveSelectedDistillationModel } from "./resolve-selected-distillation-model.js";

const current: Model<Api> = {
	id: "gpt-6-sol",
	name: "gpt-6-sol",
	api: "faux",
	provider: "codex-001",
	baseUrl: "http://localhost:0",
	reasoning: true,
	input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 8192,
	maxTokens: 1024,
};

describe("resolveSelectedDistillationModel", () => {
	it("does not query the model directory on the _SELF path", () => {
		const context = {
			model: current,
			modelRegistry: {
				getAll(): Model<Api>[] { throw new Error("catalog unavailable"); },
				getProvider() { throw new Error("provider lookup should not run"); },
			},
		};
		expect(resolveSelectedDistillationModel(context, "_SELF")).toEqual({
			ok: true, kind: "self", model: current,
		});
		expect(resolveSelectedDistillationModel({ ...context, model: undefined }, "_SELF")).toEqual({
			ok: false, reason: "no active model selected",
		});
		expect(() => resolveSelectedDistillationModel(context, "gpt-6-sol")).toThrow("catalog unavailable");
	});
});
