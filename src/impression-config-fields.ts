import { isPromptVariant, isSkipDistillationRules, PROMPT_VARIANTS } from "./types.js";
import type { ImpressionConfig } from "./types.js";

type ConfigValueKind = "boolean" | "number" | "rule-map" | "distill-mode" | "string";

export interface ConfigKeyDef {
	key: keyof ImpressionConfig;
	display: string;
	type: ConfigValueKind;
	min?: number;
}

export const CONFIG_KEY_DEFS: ConfigKeyDef[] = [
	{ key: "enabled", display: "Enabled", type: "boolean" },
	{ key: "debug", display: "Debug", type: "boolean" },
	{ key: "showData", display: "ShowData", type: "boolean" },
	{ key: "minLength", display: "MinLength", type: "number", min: 1 },
	{ key: "errorMinLength", display: "ErrorMinLength", type: "number", min: -1 },
	{ key: "maxRecallBeforePassthrough", display: "MaxRecall", type: "number", min: 0 },
	{ key: "maxPassthroughCount", display: "MaxPassthroughCount", type: "number", min: 0 },
	{ key: "distillRateFloor", display: "DistillRateFloor", type: "number", min: 0 },
	{ key: "skipDistillation", display: "SkipDistillation", type: "rule-map" },
	{ key: "debug:distill-mode", display: "DebugDistillMode", type: "distill-mode" },
	{ key: "distillModel", display: "DistillModel", type: "string" },
];

function normalizeName(name: string): string {
	return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function lookupConfigKey(name: string): ConfigKeyDef | undefined {
	const normalized = normalizeName(name);
	return CONFIG_KEY_DEFS.find((def) => normalizeName(def.key) === normalized || normalizeName(def.display) === normalized);
}

export function validateConfigValue(def: ConfigKeyDef, value: unknown): string | null {
	switch (def.type) {
		case "boolean": return typeof value === "boolean" ? null : `${def.display} must be a boolean (true / false)`;
		case "number": return typeof value === "number" && Number.isFinite(value) ? null : `${def.display} must be a finite number`;
		case "rule-map": return isSkipDistillationRules(value)
			? null
			: `${def.display} must be a JSON object of tool names to string parameter patterns, e.g. {"read":{},"subagent":{"action":"list"}}`;
		case "distill-mode": return isPromptVariant(value)
			? null
			: `${def.display} must be one of: ${PROMPT_VARIANTS.join(", ")}`;
		case "string": return typeof value === "string" && value.trim().length > 0
			? null
			: `${def.display} must be a non-empty string`;
	}
}

export function clampNumeric(def: ConfigKeyDef, value: unknown): { value: unknown; warning?: string } {
	if (def.type !== "number" || def.min === undefined) return { value };
	if (typeof value !== "number" || !Number.isFinite(value)) return { value };
	if (value < def.min) return { value: def.min, warning: `${def.display}=${value} is below the minimum ${def.min}; clamped to ${def.min}.` };
	return { value };
}
