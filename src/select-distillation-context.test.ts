import { describe, expect, it } from "vitest";
import { selectDistillationContext } from "./select-distillation-context.js";

describe("selectDistillationContext", () => {
	it("always builds the hook-only structured context", () => {
		const selection = selectDistillationContext("system", {
			originalSystemPrompt: "original system",
			visibleHistory: [{ role: "user", content: "history", timestamp: 1 }],
			toolName: "read",
			content: [{ type: "text", text: "result" }],
			taskPrompt: "compress result",
		});
		expect(selection.mode).toBe("structured");
		expect(selection.userPrompt).toBe("compress result");
		expect(selection.context.messages.map((message) => message.role)).toEqual([
			"user", "user", "user", "user", "user",
		]);
	});
});
