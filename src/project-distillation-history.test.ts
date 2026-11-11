import type { Message } from "@earendil-works/pi-ai";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import { describe, expect, it } from "vitest";
import { projectDistillationHistory } from "./project-distillation-history.js";

describe("projectDistillationHistory", () => {
	it("turns an in-flight call with no result into reference text without mutating history", () => {
		const call = fauxAssistantMessage(fauxToolCall("read", { path: "target.ts" }, { id: "pending" }), { stopReason: "toolUse" });
		const projected = projectDistillationHistory([call]);
		expect(projected[0]).toMatchObject({
			role: "assistant", stopReason: "stop",
			content: [{ type: "text", text: 'Historical tool call (reference data): {"name":"read","id":"pending","arguments":{"path":"target.ts"}}' }],
		});
		expect(call.content[0]).toMatchObject({ type: "toolCall", id: "pending" });
		expect(call.stopReason).toBe("toolUse");
	});

	it("projects partial parallel results without inventing a missing result", () => {
		const history: Message[] = [
			fauxAssistantMessage([
				{ type: "text", text: "Read both files" },
				fauxToolCall("read", { path: "a" }, { id: "a" }),
				fauxToolCall("read", { path: "b" }, { id: "b" }),
			], { stopReason: "toolUse" }),
			{ role: "toolResult", toolName: "read", toolCallId: "a", content: [{ type: "text", text: "result a" }], isError: false, timestamp: 1 },
		];
		const projected = projectDistillationHistory(history);
		expect(projected).toHaveLength(2);
		expect(projected[0]).toMatchObject({ content: [
			{ type: "text", text: "Read both files" },
			{ type: "text", text: expect.stringContaining('"id":"a"') },
			{ type: "text", text: expect.stringContaining('"id":"b"') },
		] });
		expect(projected[1]).toMatchObject({ role: "user", content: [
			{ type: "text", text: expect.stringContaining('"id":"a"') },
			{ type: "text", text: "result a" },
		] });
	});

	it("preserves error results and images even when their call is outside retained history", () => {
		const content = [{ type: "image" as const, data: "aW1hZ2U=", mimeType: "image/png" }, { type: "text" as const, text: "partial output" }];
		const projected = projectDistillationHistory([
			{ role: "toolResult", toolName: "fetch_content", toolCallId: "old", content, isError: true, timestamp: 3 },
		]);
		expect(projected[0]).toEqual({ role: "user", timestamp: 3, content: [
			{ type: "text", text: 'Historical tool result (reference data): {"name":"fetch_content","id":"old","isError":true}' },
			...content,
		] });
	});

	it("retains ordinary messages and strips executable system declarations", () => {
		const user: Message = { role: "user", content: "question", timestamp: 1 };
		const answer = fauxAssistantMessage("answer");
		const projected = projectDistillationHistory([user, answer, {
			role: "system", content: "historical policy", timestamp: 2,
			toolsAdded: [{ name: "read", description: "Read", parameters: { type: "object", properties: {} } }],
		}]);
		expect(projected[0]).toBe(user);
		expect(projected[1]).toBe(answer);
		expect(projected[2]).toEqual({ role: "user", content: "historical policy", timestamp: 2 });
	});
});
