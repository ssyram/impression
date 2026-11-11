import type { Model } from "@earendil-works/pi-ai";
import { normalizeContext } from "@earendil-works/pi-ai/utils/transcript";
import { describe, expect, it } from "vitest";
import { convertResponsesMessages } from "../../../packages/ai/src/api/openai-responses-shared.ts";
import { buildStructuredDistillationContext } from "../src/build-structured-distillation-context.js";

const model: Model<"openai-responses"> = {
	id: "eval-responses-model",
	name: "Eval Responses model",
	api: "openai-responses",
	provider: "eval",
	baseUrl: "https://example.test/v1",
	reasoning: false,
	input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 128000,
	maxTokens: 8192,
};

describe("eval Responses structured-message parity", () => {
	it("puts the current tool result data in the provider input", () => {
		const marker = "CURRENT_TOOL_RESULT_MARKER";
		const context = buildStructuredDistillationContext("distiller system", {
			originalSystemPrompt: "outer system",
			visibleHistory: [{ role: "user", content: "historical user message", timestamp: 1 }],
			toolName: "bash",
			content: [{ type: "text", text: marker }],
			taskPrompt: "write the distillation note",
		});
		const input = convertResponsesMessages(model, normalizeContext(context), new Set());

		expect(input).toHaveLength(6);
		expect(input[4]).toEqual({
			role: "user",
			content: [
				{ type: "input_text", text: '<tool_result tool_name="bash">\n' },
				{ type: "input_text", text: marker },
				{ type: "input_text", text: "\n</tool_result>" },
			],
		});
		expect(input[5]).toEqual({
			role: "user",
			content: [{ type: "input_text", text: "write the distillation note" }],
		});
	});
});
