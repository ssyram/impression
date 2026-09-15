import assert from "node:assert/strict";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { describe, it } from "../../../packages/coding-agent/node_modules/vitest/dist/index.js";
import { type Theme, theme } from "../../../packages/coding-agent/src/modes/interactive/theme/theme.ts";
import { createHarness, getMessageText } from "../../../packages/coding-agent/test/suite/harness.ts";
import impressionExtension from "../index.js";
import { DISTILL_LOG_ENTRY_TYPE, type DistillLogEntry, getEntryData, IMPRESSION_CONFIG_ENTRY_TYPE } from "./types.js";

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

describe("recall distillation failures", () => {
	it("records and reports an aborted recall", async () => {
		const notifications: Array<{ message: string; type: "info" | "warning" | "error" | undefined }> = [];
		const harness = await createHarness({ tools: [longOutputTool], extensionFactories: [impressionExtension] });
		await harness.session.bindExtensions({
			uiContext: {
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
			},
			mode: "tui",
		});
		try {
			harness.setResponses([
				fauxAssistantMessage(fauxToolCall("long_output", {}), { stopReason: "toolUse" }),
				fauxAssistantMessage("short distilled note"),
				() => {
					const impression = harness.sessionManager
						.getEntries()
						.map(getEntryData)
						.find((entry) => entry?.toolName === "long_output");
					assert.ok(impression);
					return fauxAssistantMessage(fauxToolCall("recall_impression", { id: impression.id }), {
						stopReason: "toolUse",
					});
				},
				fauxAssistantMessage("", { stopReason: "aborted", errorMessage: "request aborted" }),
				fauxAssistantMessage("done"),
			]);

			await harness.session.prompt("run the long output tool and recall its impression");

			assert.ok(
				notifications.some(
					(notification) =>
						notification.message ===
							"[impression] Recall distillation failed for long_output: stopReason=aborted: request aborted" &&
						notification.type === "error",
				),
			);
			const failureLog = harness.sessionManager
				.getEntries()
				.flatMap((entry) => {
					if (entry.type !== "custom" || entry.customType !== DISTILL_LOG_ENTRY_TYPE) return [];
					const log = entry.data as DistillLogEntry;
					return log.failure ? [log] : [];
				})
				.at(-1);
			assert.equal(failureLog?.failure?.kind, "response");
			assert.equal(
				failureLog?.failure?.kind === "response" ? failureLog.failure.response.stopReason : undefined,
				"aborted",
			);
			assert.equal(harness.getPendingResponseCount(), 0);
		} finally {
			harness.cleanup();
		}
	});

	it("returns an unresolved recall diagnostic without an error", async () => {
		const notifications: Array<{ message: string; type: "info" | "warning" | "error" | undefined }> = [];
		const harness = await createHarness({ tools: [longOutputTool], extensionFactories: [impressionExtension] });
		harness.sessionManager.appendCustomEntry(IMPRESSION_CONFIG_ENTRY_TYPE, { maxRecallBeforePassthrough: 2 });
		await harness.session.bindExtensions({
			uiContext: {
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
			},
			mode: "tui",
		});
		try {
			harness.setResponses([
				fauxAssistantMessage(fauxToolCall("long_output", {}), { stopReason: "toolUse" }),
				fauxAssistantMessage("short distilled note"),
				() => {
					const impression = harness.sessionManager
						.getEntries()
						.map(getEntryData)
						.find((entry) => entry?.toolName === "long_output");
					assert.ok(impression);
					return fauxAssistantMessage(fauxToolCall("recall_impression", { id: impression.id }), {
						stopReason: "toolUse",
					});
				},
				fauxAssistantMessage("@!999999@"),
				fauxAssistantMessage("done"),
			]);
			await harness.session.prompt("run the long output tool and recall its invalid reference");
			assert.ok(
				!notifications.some((notification) => notification.message.includes("distiller terminated abnormally")),
			);
			const recallResult = harness.session.messages.find(
				(message) => message.role === "toolResult" && message.toolName === "recall_impression",
			);
			assert.ok(recallResult && recallResult.role === "toolResult");
			assert.ok(getMessageText(recallResult).includes("(unresolved source reference: @!999999@)"));
			assert.ok(!getMessageText(recallResult).includes(LONG_OUTPUT));
			assert.equal(harness.getPendingResponseCount(), 0);
		} finally {
			harness.cleanup();
		}
	});
});
