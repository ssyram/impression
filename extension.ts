import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createImpressionSessionState } from "./src/impression-session-state.js";
import { registerImpressionCommand } from "./src/register-impression-command.js";
import { registerImpressionHooks } from "./src/register-impression-hooks.js";
import { registerRecallImpressionTool } from "./src/register-recall-impression.js";
import { registerSaveImpressionTool } from "./src/register-save-impression.js";
import { registerSkipImpressionTool } from "./src/register-skip-impression.js";
import { registerToolResultHook } from "./src/register-tool-result-hook.js";

export default function impressionExtension(pi: ExtensionAPI): void {
	const state = createImpressionSessionState(pi);
	const registerSkipTool = () => registerSkipImpressionTool(state);
	registerImpressionHooks(state, registerSkipTool);
	registerToolResultHook(state);
	registerRecallImpressionTool(state);
	registerSkipTool();
	registerSaveImpressionTool(state);
	registerImpressionCommand(state, registerSkipTool);
}
