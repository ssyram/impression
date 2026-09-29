import { describe, expect, it, vi } from "vitest";
import {
	createAssistantMessageEventStream,
	fauxAssistantMessage,
	type Api,
	type Model,
	type ModelsSimpleStreamOptions,
} from "@earendil-works/pi-ai";
import type { ModelRegistry } from "@earendil-works/pi-coding-agent";
import { requestFixedDistillation } from "./request-fixed-distillation.js";

const target: Model<Api> = {
	id: "gpt-6-luna",
	name: "gpt-6-luna",
	api: "faux",
	provider: "codex-001",
	baseUrl: "http://localhost:0",
	reasoning: true,
	input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 8192,
	maxTokens: 1024,
};

describe("requestFixedDistillation", () => {
	it.each([undefined, "high" as const])("sends the selected model with effort %s", async (effort) => {
		const calls: Array<{ model: Model<Api>; options: ModelsSimpleStreamOptions | undefined }> = [];
		const registry: Pick<ModelRegistry, "streamSimple"> = {
			streamSimple(model, _context, options) {
				calls.push({ model, options });
				const stream = createAssistantMessageEventStream();
				stream.end(fauxAssistantMessage("distilled"));
				return stream;
			},
		};
		const onPayload = vi.fn((payload: unknown) => payload);
		const options = { maxTokens: 256, onPayload };
		const result = await requestFixedDistillation(registry, target, { messages: [], tools: [] }, options, effort);
		expect(result.content).toEqual([{ type: "text", text: "distilled" }]);
		expect(calls).toHaveLength(1);
		expect(calls[0]?.model).toBe(target);
		expect(calls[0]?.options?.maxTokens).toBe(256);
		expect(calls[0]?.options?.onPayload).toBe(onPayload);
		expect(calls[0]?.options?.reasoning).toBe(effort);
		expect(options).not.toHaveProperty("reasoning");
	});

	it("propagates a provider failure to the caller's existing passthrough path", async () => {
		const registry: Pick<ModelRegistry, "streamSimple"> = {
			streamSimple() {
				throw new Error("target provider unavailable");
			},
		};
		await expect(requestFixedDistillation(registry, target, { messages: [] }, {})).rejects.toThrow(
			"target provider unavailable",
		);
	});
});
