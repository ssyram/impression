import assert from "node:assert/strict";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { describe, it } from "vitest";
import { createHarness, getMessageText } from "../../../packages/coding-agent/test/suite/harness.ts";
import impressionExtension from "../index.js";
import { createRecordingImpressionUi } from "./create-recording-impression-ui.js";
import { getEntryData, IMPRESSION_CONFIG_ENTRY_TYPE, isImpressionEntry } from "./types.js";

const LONG_OUTPUT = "long tool output ".repeat(300);
const longOutputTool: AgentTool = {
	name: "long_output",
	label: "Long output",
	description: "Return a long result",
	parameters: Type.Object({}),
	execute: async () => ({ content: [{ type: "text", text: LONG_OUTPUT }], details: {} }),
};

describe("recall limit delivery", () => {
	it("returns the first re-distilled note, then the original at the default limit of one", async () => {
		const harness = await createHarness({ tools: [longOutputTool], extensionFactories: [impressionExtension] });
		harness.sessionManager.appendCustomEntry(IMPRESSION_CONFIG_ENTRY_TYPE, { maxRecallBeforePassthrough: 1 });
		await harness.session.bindExtensions({ uiContext: createRecordingImpressionUi([]), mode: "tui" });
		try {
			harness.setResponses([
				fauxAssistantMessage(fauxToolCall("long_output", {}), { stopReason: "toolUse" }),
				fauxAssistantMessage("initial note"),
				() => {
					const impression = harness.sessionManager.getEntries().map(getEntryData)
						.find((entry) => isImpressionEntry(entry) && entry.toolName === "long_output");
					assert.ok(isImpressionEntry(impression));
					return fauxAssistantMessage(fauxToolCall("recall_impression", { id: impression.id }), { stopReason: "toolUse" });
				},
				fauxAssistantMessage("updated note"),
				() => {
					const impression = harness.sessionManager.getEntries().map(getEntryData)
						.find((entry) => isImpressionEntry(entry) && entry.toolName === "long_output");
					assert.ok(isImpressionEntry(impression));
					return fauxAssistantMessage(fauxToolCall("recall_impression", { id: impression.id }), { stopReason: "toolUse" });
				},
				fauxAssistantMessage("done"),
			]);
			await harness.session.prompt("run and recall long_output twice");
			const recalls = harness.session.messages.filter((message) => message.role === "toolResult" && message.toolName === "recall_impression");
			assert.equal(recalls.length, 2);
			assert.ok(recalls[0]?.role === "toolResult" && getMessageText(recalls[0]).includes("updated note"));
			assert.ok(recalls[1]?.role === "toolResult" && getMessageText(recalls[1]).includes(LONG_OUTPUT));
			assert.equal(harness.getPendingResponseCount(), 0);
		} finally {
			harness.cleanup();
		}
	});

	it("returns original immediately without re-distillation when the limit is zero", async () => {
		const harness = await createHarness({ tools: [longOutputTool], extensionFactories: [impressionExtension] });
		harness.sessionManager.appendCustomEntry(IMPRESSION_CONFIG_ENTRY_TYPE, { maxRecallBeforePassthrough: 0 });
		await harness.session.bindExtensions({ uiContext: createRecordingImpressionUi([]), mode: "tui" });
		try {
			harness.setResponses([
				fauxAssistantMessage(fauxToolCall("long_output", {}), { stopReason: "toolUse" }),
				fauxAssistantMessage("initial note"),
				() => {
					const impression = harness.sessionManager.getEntries().map(getEntryData)
						.find((entry) => isImpressionEntry(entry) && entry.toolName === "long_output");
					assert.ok(isImpressionEntry(impression));
					return fauxAssistantMessage(fauxToolCall("recall_impression", { id: impression.id }), { stopReason: "toolUse" });
				},
				fauxAssistantMessage("done"),
			]);
			await harness.session.prompt("run and recall long_output");
			const result = harness.session.messages.find((message) => message.role === "toolResult" && message.toolName === "recall_impression");
			assert.ok(result && result.role === "toolResult");
			assert.ok(getMessageText(result).includes(LONG_OUTPUT));
			assert.equal(harness.getPendingResponseCount(), 0);
		} finally {
			harness.cleanup();
		}
	});
});
