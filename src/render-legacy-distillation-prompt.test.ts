import type { AssistantMessage } from "@earendil-works/pi-ai";
import { describe, expect, it } from "vitest";
import { renderLegacyDistillationPrompt } from "./render-legacy-distillation-prompt.js";

const usage: AssistantMessage["usage"] = {
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0,
	totalTokens: 0,
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

describe("renderLegacyDistillationPrompt", () => {
	it("includes the original context and tool result while omitting opaque signatures", () => {
		const prompt = renderLegacyDistillationPrompt("third-person", {
			originalSystemPrompt: "original system",
			visibleHistory: [{
				role: "assistant",
				content: [{ type: "text", text: "visible answer", textSignature: "opaque-signature" }],
				api: "openai-codex-responses",
				provider: "openai-codex",
				model: "test-model",
				usage,
				stopReason: "stop",
				timestamp: 1,
			}],
			toolName: "read",
			toolResult: "actual result",
			contentLength: 13,
			lengthNote: "",
		});
		expect(prompt).toContain("original system");
		expect(prompt).toContain("visible answer");
		expect(prompt).toContain("actual result");
		expect(prompt).not.toContain("opaque-signature");
	});
});
