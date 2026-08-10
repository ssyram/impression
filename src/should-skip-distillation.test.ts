import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shouldSkipDistillation } from "./should-skip-distillation.js";
import { isSkipDistillationRules } from "./types.js";

function rules(skipDistillation: Record<string, Record<string, string>>) {
	return skipDistillation;
}

describe("isSkipDistillationRules", () => {
	it("accepts only tool maps with string conditions", () => {
		assert.equal(isSkipDistillationRules({ read: {}, subagent: { action: "list" } }), true);
		assert.equal(isSkipDistillationRules(["read"]), false);
		assert.equal(isSkipDistillationRules({ subagent: { count: 1 } }), false);
		assert.equal(isSkipDistillationRules({ subagent: ["list"] }), false);
	});
});

describe("shouldSkipDistillation", () => {
	it("matches all exact input conditions for a tool", () => {
		const skipRules = rules({ subagent: { action: "list", scope: "global" } });

		assert.equal(shouldSkipDistillation("subagent", { action: "list", scope: "global" }, skipRules), true);
		assert.equal(shouldSkipDistillation("subagent", { action: "status", scope: "global" }, skipRules), false);
		assert.equal(shouldSkipDistillation("subagent", { action: "list" }, skipRules), false);
		assert.equal(shouldSkipDistillation("other", { action: "list", scope: "global" }, skipRules), false);
	});

	it("matches string inputs with regular-expression patterns", () => {
		const skipRules = rules({ subagent: { action: "/^(list|status)$/" } });

		assert.equal(shouldSkipDistillation("subagent", { action: "list" }, skipRules), true);
		assert.equal(shouldSkipDistillation("subagent", { action: "status" }, skipRules), true);
		assert.equal(shouldSkipDistillation("subagent", { action: "stop" }, skipRules), false);
	});

	it("matches every call for an empty condition object", () => {
		const skipRules = rules({ try_load_skill_or_prompt: {} });

		assert.equal(shouldSkipDistillation("try_load_skill_or_prompt", undefined, skipRules), true);
		assert.equal(shouldSkipDistillation("try_load_skill_or_prompt", { query: "workflow" }, skipRules), true);
	});

	it("does not match non-string inputs or invalid regular expressions", () => {
		const numericRule = rules({ tool: { count: "1" } });
		const invalidRegexRule = rules({ tool: { action: "/[/" } });

		assert.equal(shouldSkipDistillation("tool", { count: 1 }, numericRule), false);
		assert.equal(shouldSkipDistillation("tool", { action: "list" }, invalidRegexRule), false);
	});
});
