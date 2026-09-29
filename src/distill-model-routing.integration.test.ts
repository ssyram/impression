import assert from "node:assert/strict";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { describe, it } from "vitest";
import { createRecordingImpressionUi as ui } from "./create-recording-impression-ui.js";
import { createHarness, getMessageText } from "../../../packages/coding-agent/test/suite/harness.ts";
import impressionExtension from "../index.js";
import { getEntryData, IMPRESSION_CONFIG_ENTRY_TYPE, isImpressionEntry } from "./types.js";

const LONG_OUTPUT = "long tool output ".repeat(300);
const longOutputTool: AgentTool = {
	name: "long_output",
	label: "Long output",
	description: "Return a long result",
	parameters: Type.Object({}),
	execute: async () => ({ content: [{ type: "text", text: LONG_OUTPUT }], details: {} }),
};

const models = [
	{ id: "faux-1", name: "Main", reasoning: false },
	{ id: "gpt-6-luna", name: "gpt-6-luna", reasoning: true },
];

describe("distillModel runtime routing", () => {
	it("applies /impression set immediately and uses the selected model and effort", async () => {
		const notifications: string[] = [];
		const harness = await createHarness({ models, tools: [longOutputTool], extensionFactories: [impressionExtension] });
		harness.sessionManager.appendCustomEntry(IMPRESSION_CONFIG_ENTRY_TYPE, { debug: true });
		await harness.session.bindExtensions({ uiContext: ui(notifications), mode: "tui" });
		try {
			await harness.session.prompt("/impression set DistillModel gpt-6-luna:high");
			const requests: Array<{ model: string; reasoning: string | undefined }> = [];
			harness.setResponses([
			(_ctx, options, _state, model) => {
				requests.push({ model: model.id, reasoning: options?.reasoning });
				return fauxAssistantMessage(fauxToolCall("long_output", {}), { stopReason: "toolUse" });
			},
			(_ctx, options, _state, model) => {
				requests.push({ model: model.id, reasoning: options?.reasoning });
				return fauxAssistantMessage("short distilled note");
			},
			(_ctx, options, _state, model) => {
				requests.push({ model: model.id, reasoning: options?.reasoning });
				return fauxAssistantMessage("done");
			},
			]);
			await harness.session.prompt("run long_output");
			assert.deepEqual(requests.map((request) => request.model), ["faux-1", "gpt-6-luna", "faux-1"]);
			assert.equal(requests[1]?.reasoning, "high");
			assert.ok(notifications.some((message) => message.includes("Distillation model faux/gpt-6-luna effort=high (fixed)")));
			const toolResult = harness.session.messages.find((message) => message.role === "toolResult" && message.toolName === "long_output");
			assert.ok(toolResult && toolResult.role === "toolResult");
			assert.ok(getMessageText(toolResult).includes("short distilled note"));
			assert.equal(harness.getPendingResponseCount(), 0);

			await harness.session.prompt("/impression set DistillModel _SELF");
			const subsequent: string[] = [];
			harness.setResponses([
				(_ctx, _options, _state, model) => {
					subsequent.push(model.id);
					return fauxAssistantMessage(fauxToolCall("long_output", {}), { stopReason: "toolUse" });
				},
				(_ctx, _options, _state, model) => { subsequent.push(model.id); return fauxAssistantMessage("self note"); },
				(_ctx, _options, _state, model) => { subsequent.push(model.id); return fauxAssistantMessage("done"); },
			]);
			await harness.session.prompt("run long_output again");
			assert.deepEqual(subsequent, ["faux-1", "faux-1", "faux-1"]);
			assert.ok(notifications.some((message) => message.includes("Distillation model faux/faux-1 effort=null (self)")));
			assert.equal(harness.getPendingResponseCount(), 0);
		} finally {
			harness.cleanup();
		}
	});

	it("warns at startup and delivers raw content when no model matches", async () => {
		const notifications: string[] = [];
		const harness = await createHarness({ models, tools: [longOutputTool], extensionFactories: [impressionExtension] });
		harness.sessionManager.appendCustomEntry(IMPRESSION_CONFIG_ENTRY_TYPE, { distillModel: "missing-model" });
		await harness.session.bindExtensions({ uiContext: ui(notifications), mode: "tui" });
		try {
			const requests: string[] = [];
			harness.setResponses([
			(_ctx, _options, _state, model) => {
				requests.push(model.id);
				return fauxAssistantMessage(fauxToolCall("long_output", {}), { stopReason: "toolUse" });
			},
			(_ctx, _options, _state, model) => {
				requests.push(model.id);
				return fauxAssistantMessage("done");
			},
			]);
			await harness.session.prompt("run long_output");
			assert.deepEqual(requests, ["faux-1", "faux-1"]);
			assert.ok(notifications.some((message) => message.includes('DistillModel: no model matches "missing-model"')));
			const toolResult = harness.session.messages.find((message) => message.role === "toolResult" && message.toolName === "long_output");
			assert.ok(toolResult && toolResult.role === "toolResult");
			assert.equal(getMessageText(toolResult), LONG_OUTPUT);
			assert.equal(harness.getPendingResponseCount(), 0);
		} finally {
			harness.cleanup();
		}
	});

	it("uses the selected model for recall re-distillation", async () => {
		const notifications: string[] = [];
		const harness = await createHarness({ models, tools: [longOutputTool], extensionFactories: [impressionExtension] });
		harness.sessionManager.appendCustomEntry(IMPRESSION_CONFIG_ENTRY_TYPE, {
			distillModel: "gpt-6-luna:high", maxRecallBeforePassthrough: 2, debug: true,
		});
		await harness.session.bindExtensions({ uiContext: ui(notifications), mode: "tui" });
		try {
			const requests: string[] = [];
			harness.setResponses([
			(_ctx, _options, _state, model) => {
				requests.push(model.id);
				return fauxAssistantMessage(fauxToolCall("long_output", {}), { stopReason: "toolUse" });
			},
			(_ctx, _options, _state, model) => {
				requests.push(model.id);
				return fauxAssistantMessage("initial note");
			},
			(_ctx, _options, _state, model) => {
				requests.push(model.id);
				const impression = harness.sessionManager.getEntries().map(getEntryData).find((entry) => isImpressionEntry(entry) && entry.toolName === "long_output");
				assert.ok(isImpressionEntry(impression));
				return fauxAssistantMessage(fauxToolCall("recall_impression", { id: impression.id }), { stopReason: "toolUse" });
			},
			(_ctx, options, _state, model) => {
				requests.push(model.id);
				assert.equal(options?.reasoning, "high");
				return fauxAssistantMessage("updated note");
			},
			(_ctx, _options, _state, model) => {
				requests.push(model.id);
				return fauxAssistantMessage("done");
			},
			]);
			await harness.session.prompt("run and recall long_output");
			assert.deepEqual(requests, ["faux-1", "gpt-6-luna", "faux-1", "gpt-6-luna", "faux-1"]);
			assert.ok(notifications.some((message) => message.includes("Recall model faux/gpt-6-luna effort=high (fixed)")));
			assert.equal(harness.getPendingResponseCount(), 0);
		} finally {
			harness.cleanup();
		}
	});

	it("dispatches to the matched provider rather than the outer agent provider", async () => {
		const target = fauxProvider({ provider: "alt-faux", models: [{ id: "glm-5.3" }] });
		const notifications: string[] = [];
		const harness = await createHarness({
			tools: [longOutputTool],
			extensionFactories: [(pi) => pi.registerProvider(target.provider), impressionExtension],
		});
		harness.sessionManager.appendCustomEntry(IMPRESSION_CONFIG_ENTRY_TYPE, { distillModel: "alt-faux/glm-5.3", debug: true });
		await harness.session.bindExtensions({ uiContext: ui(notifications), mode: "tui" });
		try {
			target.setResponses([(_context, _options, _state, model) => {
				assert.equal(model.provider, "alt-faux");
				return fauxAssistantMessage("note from alternate provider");
			}]);
			harness.setResponses([
				fauxAssistantMessage(fauxToolCall("long_output", {}), { stopReason: "toolUse" }),
				fauxAssistantMessage("done"),
			]);
			await harness.session.prompt("run long_output");
			assert.equal(target.state.callCount, 1, notifications.join("\n"));
			assert.ok(notifications.some((message) => message.includes("Distillation model alt-faux/glm-5.3 effort=null")));
			const toolResult = harness.session.messages.find((message) => message.role === "toolResult" && message.toolName === "long_output");
			assert.ok(toolResult && toolResult.role === "toolResult");
			assert.ok(getMessageText(toolResult).includes("note from alternate provider"));
		} finally {
			harness.cleanup();
		}
	});

	it("passes through the original when the selected provider fails without trying the main model", async () => {
		const target = fauxProvider({ provider: "alt-faux", models: [{ id: "glm-5.3" }] });
		const harness = await createHarness({
			tools: [longOutputTool], extensionFactories: [(pi) => pi.registerProvider(target.provider), impressionExtension],
		});
		harness.sessionManager.appendCustomEntry(IMPRESSION_CONFIG_ENTRY_TYPE, { distillModel: "alt-faux/glm-5.3" });
		await harness.session.bindExtensions({ uiContext: ui([]), mode: "tui" });
		try {
			target.setResponses([fauxAssistantMessage("", { stopReason: "error", errorMessage: "target failure" })]);
			harness.setResponses([
				fauxAssistantMessage(fauxToolCall("long_output", {}), { stopReason: "toolUse" }),
				fauxAssistantMessage("done"),
			]);
			await harness.session.prompt("run long_output");
			assert.equal(target.state.callCount, 1);
			assert.equal(harness.faux.state.callCount, 2);
			const result = harness.session.messages.find((message) => message.role === "toolResult" && message.toolName === "long_output");
			assert.ok(result && result.role === "toolResult");
			assert.equal(getMessageText(result), LONG_OUTPUT);
		} finally {
			harness.cleanup();
		}
	});
});
