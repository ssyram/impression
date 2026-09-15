import assert from "node:assert/strict";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { describe, it } from "../../../packages/coding-agent/node_modules/vitest/dist/index.js";
import type { ExtensionUIContext } from "../../../packages/coding-agent/src/core/extensions/index.ts";
import { type Theme, theme } from "../../../packages/coding-agent/src/modes/interactive/theme/theme.ts";
import { createHarness, getMessageText } from "../../../packages/coding-agent/test/suite/harness.ts";
import impressionExtension from "../index.js";
import { IMPRESSION_CONFIG_ENTRY_TYPE, IMPRESSION_ENTRY_TYPE } from "./types.js";

const errorOutputTool: AgentTool = {
	name: "error_output",
	label: "Error output",
	description: "Throw an error with a controlled message length",
	parameters: Type.Object({ length: Type.Number() }),
	execute: async (_toolCallId, params) => {
		throw new Error("E".repeat(params.length));
	},
};

type Notification = { message: string; type: "info" | "warning" | "error" | undefined };

function createUiContext(notifications: Notification[]): ExtensionUIContext {
	return {
		select: async () => undefined,
		confirm: async () => false,
		input: async () => undefined,
		notify: (message, type) => notifications.push({ message, type }),
		onTerminalInput: () => () => {},
		setStatus: () => {},
		setWorkingMessage: () => {},
		setWorkingVisible: () => {},
		setWorkingIndicator: () => {},
		setHiddenThinkingLabel: () => {},
		setWidget: () => {},
		setFooter: () => {},
		setHeader: () => {},
		setTitle: () => {},
		custom: async <T>() => undefined as T,
		pasteToEditor: () => {},
		setEditorText: () => {},
		getEditorText: () => "",
		editor: async () => undefined,
		addAutocompleteProvider: () => {},
		setEditorComponent: () => {},
		getEditorComponent: () => undefined,
		get theme() {
			return theme;
		},
		getAllThemes: () => [],
		getTheme: () => undefined,
		setTheme: (_theme: string | Theme) => ({ success: false, error: "Theme switching not available in tests" }),
		getToolsExpanded: () => false,
		setToolsExpanded: () => {},
	};
}

async function createErrorHarness(notifications: Notification[], errorMinLength?: number) {
	const harness = await createHarness({
		tools: [errorOutputTool],
		extensionFactories: [impressionExtension],
	});
	if (errorMinLength !== undefined) {
		harness.sessionManager.appendCustomEntry(IMPRESSION_CONFIG_ENTRY_TYPE, { errorMinLength });
	}
	await harness.session.bindExtensions({ uiContext: createUiContext(notifications), mode: "tui" });
	return harness;
}

describe("error-result distillation", () => {
	it("skips a short error at the default threshold with an explicit notice", async () => {
		const notifications: Notification[] = [];
		const harness = await createErrorHarness(notifications);
		try {
			harness.setResponses([
				fauxAssistantMessage(fauxToolCall("error_output", { length: 100 }), { stopReason: "toolUse" }),
				fauxAssistantMessage("done"),
			]);
			await harness.session.prompt("run the short error tool");
			const notice = notifications.find(({ message }) => message.includes("tool result is an error with length"));
			assert.ok(notice);
			assert.match(
				notice.message,
				/^\[impression\] Skipped: tool result is an error with length \d+, below error threshold 40960$/,
			);
			assert.equal(harness.getPendingResponseCount(), 0);
		} finally {
			harness.cleanup();
		}
	});

	it("distills a long error at the default threshold and preserves isError", async () => {
		const notifications: Notification[] = [];
		const harness = await createErrorHarness(notifications);
		try {
			harness.setResponses([
				fauxAssistantMessage(fauxToolCall("error_output", { length: 41000 }), { stopReason: "toolUse" }),
				fauxAssistantMessage("short distilled error note"),
				fauxAssistantMessage("done"),
			]);
			await harness.session.prompt("run the long error tool");
			assert.ok(
				harness.sessionManager
					.getEntries()
					.some((entry) => entry.type === "custom" && entry.customType === IMPRESSION_ENTRY_TYPE),
			);
			const result = harness.session.messages.find(
				(message) => message.role === "toolResult" && message.toolName === "error_output",
			);
			assert.ok(result && result.role === "toolResult");
			assert.equal(result.isError, true);
			assert.ok(getMessageText(result).includes("short distilled error note"));
		} finally {
			harness.cleanup();
		}
	});

	it("skips every error when disabled", async () => {
		const notifications: Notification[] = [];
		const harness = await createErrorHarness(notifications, -1);
		try {
			harness.setResponses([
				fauxAssistantMessage(fauxToolCall("error_output", { length: 41000 }), { stopReason: "toolUse" }),
				fauxAssistantMessage("done"),
			]);
			await harness.session.prompt("run the disabled error tool");
			assert.ok(
				notifications.some(
					({ message }) =>
						message === "[impression] Skipped: tool result is an error and error distillation is disabled",
				),
			);
			assert.equal(harness.getPendingResponseCount(), 0);
		} finally {
			harness.cleanup();
		}
	});

	it("attempts every error at zero and preserves the original on distillation failure", async () => {
		const notifications: Notification[] = [];
		const harness = await createErrorHarness(notifications, 0);
		try {
			harness.setResponses([
				fauxAssistantMessage(fauxToolCall("error_output", { length: 100 }), { stopReason: "toolUse" }),
				fauxAssistantMessage("", { stopReason: "error", errorMessage: "distiller failed" }),
				fauxAssistantMessage("done"),
			]);
			await harness.session.prompt("run the zero-threshold error tool");
			const result = harness.session.messages.find(
				(message) => message.role === "toolResult" && message.toolName === "error_output",
			);
			assert.ok(result && result.role === "toolResult");
			assert.equal(result.isError, true);
			assert.ok(getMessageText(result).includes("E".repeat(100)));
			assert.ok(notifications.some(({ message }) => message.includes("Distillation failed for error_output")));
		} finally {
			harness.cleanup();
		}
	});

	it("returns an unresolved source-reference diagnostic without an error", async () => {
		const notifications: Notification[] = [];
		const harness = await createErrorHarness(notifications, 0);
		try {
			harness.setResponses([
				fauxAssistantMessage(fauxToolCall("error_output", { length: 100 }), { stopReason: "toolUse" }),
				fauxAssistantMessage("@!2@"),
				fauxAssistantMessage("done"),
			]);
			await harness.session.prompt("run the zero-threshold error tool with an invalid reference");
			const result = harness.session.messages.find(
				(message) => message.role === "toolResult" && message.toolName === "error_output",
			);
			assert.ok(result && result.role === "toolResult");
			assert.equal(result.isError, true);
			assert.ok(getMessageText(result).includes("(unresolved source reference: @!2@)"));
			assert.ok(!getMessageText(result).includes("E".repeat(100)));
			assert.ok(!notifications.some(({ message }) => message.includes("distiller terminated abnormally")));
		} finally {
			harness.cleanup();
		}
	});
});
