import { loadConfig, saveLocalConfig } from "./config.js";
import { IMPRESSION_HELP, parseSetBody, parseToolNameList } from "./impression-command-arguments.js";
import { clampNumeric, CONFIG_KEY_DEFS, lookupConfigKey, validateConfigValue } from "./impression-config-fields.js";
import { applyConfigPatch, type ImpressionSessionState } from "./impression-session-state.js";
import { warnUnresolvedDistillationModel } from "./resolve-selected-distillation-model.js";
import { CONFIG_FILE_NAME } from "./types.js";
import type { ImpressionConfig } from "./types.js";

export function registerImpressionCommand(state: ImpressionSessionState, registerSkipTool: () => void): void {
	state.pi.registerCommand("impression", {
		description: "View or change session config. Try /impression help for full usage.",
		async handler(args, ctx) {
			const trimmed = args.trim();
			const lower = trimmed.toLowerCase();
			if (!lower || lower === "help" || lower === "h" || lower === "?" || lower === "-h" || lower === "--help") {
				ctx.ui.notify(IMPRESSION_HELP, "info");
				return;
			}
			if (lower === "status" || lower === "s" || lower === "config" || lower === "print" || lower === "read") {
				ctx.ui.notify(`[impression] Session config:\n${JSON.stringify(state.cfg, null, 2)}`, "info");
				return;
			}
			if (lower === "on") {
				applyConfigPatch(state, { enabled: true }, registerSkipTool);
				ctx.ui.notify("[impression] Enabled.", "info");
				return;
			}
			if (lower === "off") {
				applyConfigPatch(state, { enabled: false }, registerSkipTool);
				ctx.ui.notify("[impression] Disabled — all tool results pass through without distillation.", "info");
				return;
			}
			if (lower === "load") {
				const loaded = loadConfig();
				for (const warning of loaded.warnings) ctx.ui.notify(`[impression] ${warning}`, "warning");
				if (Object.keys(loaded.config).length === 0) {
					ctx.ui.notify(`[impression] ${CONFIG_FILE_NAME} is empty or missing — nothing to load.`, "warning");
					return;
				}
				const clamped: Partial<ImpressionConfig> = { ...loaded.config };
				for (const def of CONFIG_KEY_DEFS) {
					const value = (clamped as Record<string, unknown>)[def.key];
					if (value === undefined) continue;
					const error = validateConfigValue(def, value);
					if (error) {
						ctx.ui.notify(`[impression] Config ${def.display}: ${error} (got ${JSON.stringify(value)}); ignoring this field — falling back to default.`, "warning");
						delete (clamped as Record<string, unknown>)[def.key];
						continue;
					}
					if (def.type === "number") {
						const result = clampNumeric(def, value);
						if (result.warning) {
							ctx.ui.notify(`[impression] ${result.warning}`, "warning");
							(clamped as Record<string, unknown>)[def.key] = result.value;
						}
					}
				}
				applyConfigPatch(state, clamped, registerSkipTool);
				warnUnresolvedDistillationModel(ctx, state.cfg.distillModel);
				ctx.ui.notify(`[impression] Loaded ${CONFIG_FILE_NAME} into session.`, "info");
				return;
			}
			if (lower === "set" || lower.startsWith("set ")) {
				let body = trimmed.slice(3).trim();
				let persistent = false;
				if (body.toLowerCase() === "--persistent" || body.toLowerCase().startsWith("--persistent ")) {
					persistent = true;
					body = body.slice("--persistent".length).trim();
				}
				const parsed = parseSetBody(body);
				if (!parsed) {
					ctx.ui.notify('[impression] Usage: /impression set [--persistent] NAME VALUE  (VALUE is JSON; e.g. true / 5000 / ["a","b"])', "error");
					return;
				}
				const def = lookupConfigKey(parsed.name);
				if (!def) {
					ctx.ui.notify(`[impression] Unknown config field: ${parsed.name}. Known: ${CONFIG_KEY_DEFS.map((item) => item.display).join(", ")}.`, "error");
					return;
				}
				let value: unknown;
				try { value = JSON.parse(parsed.value); } catch { value = parsed.value; }
				const error = validateConfigValue(def, value);
				if (error) {
					ctx.ui.notify(`[impression] ${error}. Got ${JSON.stringify(parsed.value)}.`, "error");
					return;
				}
				const result = clampNumeric(def, value);
				if (result.warning) ctx.ui.notify(`[impression] ${result.warning}`, "warning");
				const patch = { [def.key]: result.value } as Partial<ImpressionConfig>;
				applyConfigPatch(state, patch, registerSkipTool);
				if (def.key === "distillModel") warnUnresolvedDistillationModel(ctx, state.cfg.distillModel);
				if (persistent) {
					saveLocalConfig(patch).catch((err) => {
						if (!ctx.hasUI) return;
						ctx.ui.notify(`[impression] Failed to persist to .pi/${CONFIG_FILE_NAME}: ${err instanceof Error ? err.message : String(err)}`, "warning");
					});
				}
				ctx.ui.notify(`[impression] Set ${def.display} = ${JSON.stringify(result.value)}${persistent ? ` (persisting to .pi/${CONFIG_FILE_NAME} in background)` : ""}.`, "info");
				return;
			}
			if (trimmed.includes(",") || trimmed.includes('"') || trimmed.includes("'")) {
				const names = parseToolNameList(trimmed);
				if (names.length === 0) {
					ctx.ui.notify(`[impression] Could not parse tool names from: ${trimmed}\n${IMPRESSION_HELP}`, "warning");
					return;
				}
				const merged = { ...state.cfg.skipDistillation };
				for (const name of names) if (!merged[name]) merged[name] = {};
				applyConfigPatch(state, { skipDistillation: merged }, registerSkipTool);
				ctx.ui.notify(`[impression] SkipDistillation updated: ${Object.keys(merged).join(", ")}`, "info");
				return;
			}
			ctx.ui.notify(`[impression] Unknown subcommand: ${trimmed}\n${IMPRESSION_HELP}`, "warning");
		},
	});
}
