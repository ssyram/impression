import { loadConfig, resolveConfig } from "./config.js";
import { captureProviderPayload } from "./impression-debug.js";
import { completeImpressionArgument } from "./impression-command-arguments.js";
import { clampNumeric, CONFIG_KEY_DEFS, validateConfigValue } from "./impression-config-fields.js";
import { type ImpressionSessionState, updateShowDataStatus } from "./impression-session-state.js";
import { getImpressionSystemAppendTemplate } from "./prompt-loader.js";
import { warnUnresolvedDistillationModel } from "./resolve-selected-distillation-model.js";
import { createCommandArgumentProvider } from "./tab-complete.js";
import { getEntryData, getImpressionConfigData, getPassthroughModeData, getSessionStatsData, isImpressionConfigPatch, isImpressionEntry, isPassthroughModeEntry, isSessionStatsEntry } from "./types.js";

export function registerImpressionHooks(state: ImpressionSessionState, registerSkipTool: () => void): void {
	state.pi.on("before_provider_request", (event, ctx) => {
		if (!state.cfg.debug || !state.captureNextMainProviderPayload) return;
		state.captureNextMainProviderPayload = false;
		captureProviderPayload(ctx, "main", event.payload);
	});

	state.pi.on("session_start", async (_event, ctx) => {
		ctx.ui.addAutocompleteProvider((current) =>
			createCommandArgumentProvider(current, { command: "impression", complete: completeImpressionArgument }),
		);
		const loaded = loadConfig();
		state.currentRaw = loaded.config;
		for (const warning of loaded.warnings) ctx.ui.notify(`[impression] ${warning}`, "warning");
		state.cumulativeOriginalChars = 0;
		state.cumulativeImpressionChars = 0;
		state.passthroughRemaining = 0;
		state.lastEstimatedChars = 0;
		state.impressions.clear();
		for (const entry of ctx.sessionManager.getBranch()) {
			const passthroughData = getPassthroughModeData(entry);
			if (isPassthroughModeEntry(passthroughData)) {
				state.passthroughRemaining = passthroughData.remaining;
				state.lastEstimatedChars = passthroughData.lastEstimatedChars ?? 0;
				continue;
			}
			const statsData = getSessionStatsData(entry);
			if (isSessionStatsEntry(statsData)) {
				state.cumulativeOriginalChars = statsData.originalChars;
				state.cumulativeImpressionChars = statsData.impressionChars;
				continue;
			}
			const configData = getImpressionConfigData(entry);
			if (isImpressionConfigPatch(configData)) {
				state.currentRaw = { ...state.currentRaw, ...configData };
				continue;
			}
			const data = getEntryData(entry);
			if (isImpressionEntry(data)) state.impressions.set(data.id, data);
		}
		for (const def of CONFIG_KEY_DEFS) {
			const value = (state.currentRaw as Record<string, unknown>)[def.key];
			if (value === undefined) continue;
			const error = validateConfigValue(def, value);
			if (error) {
				ctx.ui.notify(`[impression] Config ${def.display}: ${error} (got ${JSON.stringify(value)}); ignoring this field — falling back to default.`, "warning");
				delete (state.currentRaw as Record<string, unknown>)[def.key];
				continue;
			}
			if (def.type === "number") {
				const result = clampNumeric(def, value);
				if (result.warning) {
					ctx.ui.notify(`[impression] ${result.warning}`, "warning");
					(state.currentRaw as Record<string, unknown>)[def.key] = result.value;
				}
			}
		}
		state.cfg = resolveConfig(state.currentRaw);
		if (state.cfg.debugDistillMode && !state.cfg.debug) {
			ctx.ui.notify('[impression] Ignoring "debug:distill-mode" because "debug" is not enabled.', "warning");
			delete state.currentRaw["debug:distill-mode"];
			state.cfg.debugDistillMode = undefined;
		}
		registerSkipTool();
		warnUnresolvedDistillationModel(ctx, state.cfg.distillModel);
		updateShowDataStatus(state, ctx);
	});

	state.pi.on("before_agent_start", async (event) => ({
		systemPrompt: `${event.systemPrompt}\n\n${getImpressionSystemAppendTemplate()}`,
	}));
}
