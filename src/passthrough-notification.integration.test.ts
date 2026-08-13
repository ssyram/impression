import assert from "node:assert/strict";
import { describe, it } from "../../../packages/coding-agent/node_modules/vitest/dist/index.js";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import type { ExtensionUIContext } from "../../../packages/coding-agent/src/core/extensions/index.ts";
import { type Theme, theme } from "../../../packages/coding-agent/src/modes/interactive/theme/theme.ts";
import { createHarness, getMessageText } from "../../../packages/coding-agent/test/suite/harness.ts";
import impressionExtension from "../index.js";
import { DISTILL_LOG_ENTRY_TYPE, getEntryData } from "./types.js";

const LONG_OUTPUT = "long tool output ".repeat(300);

const longOutputTool: AgentTool = {
	name: "long_output",
	label: "Long output",
	description: "Return a long result",
	parameters: Type.Object({}),
	execute: async () => ({
		content: [{ type: "text", text: LONG_OUTPUT }],
		details: {},
	}),
};

type Notification = {
	message: string;
	type: "info" | "warning" | "error" | undefined;
};

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

async function createNotificationHarness(notifications: Notification[]) {
	const harness = await createHarness({
		tools: [longOutputTool],
		extensionFactories: [impressionExtension],
	});
	await harness.session.bindExtensions({ uiContext: createUiContext(notifications), mode: "tui" });
	return harness;
}

describe("passthrough notifications", () => {
	it("reports an empty initial distillation", async () => {
		const notifications: Notification[] = [];
		const harness = await createNotificationHarness(notifications);
		try {
			harness.setResponses([
				fauxAssistantMessage(fauxToolCall("long_output", {}), { stopReason: "toolUse" }),
				fauxAssistantMessage(""),
				fauxAssistantMessage("done"),
			]);

			await harness.session.prompt("run the long output tool");

			assert.ok(
				notifications.some(
					(notification) =>
						notification.message ===
						"[impression] Passthrough for long_output: empty (distiller returned no usable text)",
				),
			);
			assert.equal(harness.getPendingResponseCount(), 0);
		} finally {
			harness.cleanup();
		}
	});

	it("records and reports an abnormal initial distillation", async () => {
		const notifications: Notification[] = [];
		const harness = await createNotificationHarness(notifications);
		try {
			harness.setResponses([
				fauxAssistantMessage(fauxToolCall("long_output", {}), { stopReason: "toolUse" }),
				fauxAssistantMessage("", {
					stopReason: "error",
					errorMessage: "Codex error: fetch failed",
					responseId: "response-error",
				}),
				fauxAssistantMessage("done"),
			]);

			await harness.session.prompt("run the long output tool");

			assert.ok(
				notifications.some(
					(notification) =>
						notification.message ===
							"[impression] Distillation failed for long_output: stopReason=error: Codex error: fetch failed" &&
						notification.type === "error",
				),
			);
			const entry = harness.sessionManager
				.getEntries()
				.find((candidate) => candidate.type === "custom" && candidate.customType === DISTILL_LOG_ENTRY_TYPE);
			assert.ok(entry);
			if (entry.type !== "custom") throw new Error("Expected a custom distillation log entry");
			const failure = (entry.data as { failure?: { kind?: string; context?: { userPrompt?: string }; response?: { errorMessage?: string; responseId?: string; stopReason?: string } } }).failure;
			assert.equal(failure?.kind, "response");
			assert.equal(failure?.response?.stopReason, "error");
			assert.equal(failure?.response?.errorMessage, "Codex error: fetch failed");
			assert.equal(failure?.response?.responseId, "response-error");
			assert.ok(failure?.context?.userPrompt?.includes(LONG_OUTPUT.trim()));
			assert.equal(harness.getPendingResponseCount(), 0);
		} finally {
			harness.cleanup();
		}
	});

	it("reports a deliberate LLM passthrough during recall", async () => {
		const notifications: Notification[] = [];
		const harness = await createNotificationHarness(notifications);
		try {
			harness.setResponses([
				fauxAssistantMessage(fauxToolCall("long_output", {}), { stopReason: "toolUse" }),
				fauxAssistantMessage("short distilled note"),
				() => {
					const impression = harness.sessionManager
						.getEntries()
						.map((entry) => getEntryData(entry))
						.find((entry) => entry?.toolName === "long_output");
					assert.ok(impression);
					return fauxAssistantMessage(fauxToolCall("recall_impression", { id: impression.id }), {
						stopReason: "toolUse",
					});
				},
				fauxAssistantMessage("<passthrough/>"),
				fauxAssistantMessage("done"),
			]);

			await harness.session.prompt("run the long output tool and recall its impression");

			assert.ok(
				notifications.some(
					(notification) =>
						notification.message ===
						"[impression] Recall passthrough for long_output: sentinel (LLM deliberately chose passthrough)",
				),
				JSON.stringify({
					notifications,
					pendingResponses: harness.getPendingResponseCount(),
					activeTools: harness.session.getActiveToolNames(),
					messages: harness.session.messages.map((message) => ({
						role: message.role,
						text: getMessageText(message),
						content: "content" in message ? message.content : undefined,
					})),
					toolEvents: harness.events.filter((event) => event.type.startsWith("tool_execution")),
				}),
			);
			assert.equal(harness.getPendingResponseCount(), 0);
		} finally {
			harness.cleanup();
		}
	});
});
