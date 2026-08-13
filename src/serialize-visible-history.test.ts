import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { describe, expect, it } from "vitest";
import { serializeVisibleHistory } from "./serialize-visible-history.js";

const target = {
	provider: "openai-codex",
	api: "openai-codex-responses",
	model: "gpt-5.6-sol",
};

const usage: AssistantMessage["usage"] = {
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0,
	totalTokens: 0,
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

function assistant(overrides: Partial<AssistantMessage> = {}): AssistantMessage {
	return {
		role: "assistant",
		content: [],
		api: target.api,
		provider: target.provider,
		model: target.model,
		usage,
		stopReason: "stop",
		timestamp: 1,
		...overrides,
	};
}

function serialize(message: AssistantMessage, historyTarget = target): string {
	return serializeVisibleHistory([message] satisfies AgentMessage[], historyTarget);
}

describe("serializeVisibleHistory", () => {
	it("removes current Codex signatures while preserving readable content", () => {
		const output = JSON.parse(serialize(assistant({
			content: [
				{
					type: "thinking",
					thinking: "summary",
					thinkingSignature: JSON.stringify({
						type: "reasoning",
						id: "rs_1",
						summary: [{ type: "summary_text", text: "summary" }],
						encrypted_content: "opaque",
						status: "completed",
					}),
				},
				{ type: "text", text: "answer", textSignature: JSON.stringify({ v: 1, id: "msg_1", phase: "final_answer" }) },
			],
		}))) as AssistantMessage;

		expect(output.content).toEqual([
			{ type: "thinking", thinking: "summary" },
			{ type: "text", text: "answer" },
		]);
	});

	it.each([
		["provider", { ...target, provider: "openai" }],
		["api", { ...target, api: "openai-responses" }],
		["model", { ...target, model: "gpt-5.6-terra" }],
	] as const)("preserves the canonical output for a mismatched %s", (_name, historyTarget) => {
		const message = assistant({
			content: [{ type: "text", text: "answer", textSignature: JSON.stringify({ v: 1, id: "msg_1" }) }],
		});
		expect(serialize(message, historyTarget)).toBe(JSON.stringify(message));
	});

	it("preserves unknown signature schemas and versions", () => {
		const message = assistant({
			content: [
				{
					type: "thinking",
					thinking: "summary",
					thinkingSignature: JSON.stringify({
						type: "reasoning",
						id: "rs_1",
						summary: [],
						protocol_version: 2,
					}),
				},
				{ type: "text", text: "answer", textSignature: JSON.stringify({ v: 2, id: "msg_1" }) },
			],
		});
		expect(serialize(message)).toBe(JSON.stringify(message));
	});

	it("preserves malformed signatures without failing", () => {
		const message = assistant({
			content: [{ type: "thinking", thinking: "summary", thinkingSignature: "not-json" }],
		});
		expect(serialize(message)).toBe(JSON.stringify(message));
	});
});
