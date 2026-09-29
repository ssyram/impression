import type { ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import { theme } from "../../../packages/coding-agent/src/modes/interactive/theme/theme.ts";

export function createRecordingImpressionUi(notifications: string[]): ExtensionUIContext {
	return {
		select: async () => undefined,
		confirm: async () => false,
		input: async () => undefined,
		notify: (message) => { notifications.push(message); },
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
		get theme() { return theme; },
		getAllThemes: () => [],
		getTheme: () => undefined,
		setTheme: () => ({ success: false, error: "Theme switching not available in tests" }),
		getToolsExpanded: () => false,
		setToolsExpanded: () => {},
	};
}
