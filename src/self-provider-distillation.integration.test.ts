import assert from "node:assert/strict";
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai";
import { getApiProvider } from "@earendil-works/pi-ai/compat";
import { getDeclaredTools } from "@earendil-works/pi-ai/utils/transcript";
import { Type } from "typebox";
import type { ModelRegistry } from "@earendil-works/pi-coding-agent";
import { it } from "vitest";
import { createHarness, getMessageText } from "../../../packages/coding-agent/test/suite/harness.ts";
import impressionExtension from "../index.js";
import { createRecordingImpressionUi } from "./create-recording-impression-ui.js";
import { getEntryData, IMPRESSION_CONFIG_ENTRY_TYPE, isImpressionEntry } from "./types.js";

it("distills and recalls with a self provider absent from the legacy API registry", async () => {
	const target = fauxProvider({ provider: "session-only-distiller", models: [{ id: "session-model" }] });
	assert.equal(getApiProvider(target.api), undefined);
	const notifications: string[] = [];
	let registry: ModelRegistry | undefined;
	const harness = await createHarness({
		tools: [{
			name: "long_output", label: "Long output", description: "Return fixture text", parameters: Type.Object({}),
			execute: async () => ({ content: [{ type: "text", text: "fixture text ".repeat(500) }], details: {} }),
		}],
		extensionFactories: [(pi) => {
			pi.registerProvider(target.provider);
			pi.on("session_start", async (_event, ctx) => { registry = ctx.modelRegistry; });
		}, impressionExtension],
	});
	harness.sessionManager.appendCustomEntry(IMPRESSION_CONFIG_ENTRY_TYPE, {
		distillModel: "_SELF", maxRecallBeforePassthrough: 2,
	});
	try {
		await harness.session.bindExtensions({ uiContext: createRecordingImpressionUi(notifications), mode: "tui" });
		assert.ok(registry);
		harness.session.agent.streamFunction = registry.streamSimple.bind(registry);
		await harness.session.setModel(target.getModel());
		target.setResponses([
			fauxAssistantMessage(fauxToolCall("long_output", {}), { stopReason: "toolUse" }),
			(context) => {
				assert.deepEqual(getDeclaredTools(context.messages), []);
				assert.ok(context.messages.every((message) => message.role !== "toolResult"));
				assert.ok(context.messages.every((message) => message.role !== "assistant" || message.content.every((block) => block.type !== "toolCall")));
				assert.ok(JSON.stringify(context.messages).includes("Historical tool call (reference data)"));
				return fauxAssistantMessage("initial session note");
			},
			() => {
				const entry = harness.sessionManager.getEntries().map(getEntryData).find(isImpressionEntry);
				assert.ok(isImpressionEntry(entry));
				return fauxAssistantMessage(fauxToolCall("recall_impression", { id: entry.id }), { stopReason: "toolUse" });
			},
			(context) => {
				assert.deepEqual(getDeclaredTools(context.messages), []);
				assert.ok(context.messages.every((message) => message.role !== "toolResult"));
				assert.ok(context.messages.every((message) => message.role !== "assistant" || message.content.every((block) => block.type !== "toolCall")));
				assert.ok(JSON.stringify(context.messages).includes("Historical tool result (reference data)"));
				return fauxAssistantMessage("recalled session note");
			},
			fauxAssistantMessage("done"),
		]);
		await harness.session.prompt("Read and recall fixture");
		const results = harness.session.messages.filter((message) => message.role === "toolResult");
		assert.ok(results.some((message) => getMessageText(message).includes("initial session note")), notifications.join("\n"));
		assert.ok(results.some((message) => getMessageText(message).includes("recalled session note")), notifications.join("\n"));
		assert.equal(target.state.callCount, 5);
		assert.equal(target.getPendingResponseCount(), 0);
		assert.equal(getApiProvider(target.api), undefined);
		assert.ok(!notifications.some((message) => message.includes("failed")), notifications.join("\n"));
	} finally {
		harness.cleanup();
	}
});
