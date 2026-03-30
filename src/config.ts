import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CONFIG_FILE_NAME, DEFAULT_MAX_RECALL, DEFAULT_MIN_LENGTH } from "./types.ts";
import type { ImpressionConfig, ResolvedConfig } from "./types.ts";

export function resolveConfig(raw: ImpressionConfig): ResolvedConfig {
	return {
		skipDistillation: raw.skipDistillation ?? [],
		minLength: raw.minLength ?? DEFAULT_MIN_LENGTH,
		maxRecall: raw.maxRecallBeforePassthrough ?? DEFAULT_MAX_RECALL,
	};
}

export function loadConfig(): ImpressionConfig {
	try {
		const configPath = join(process.cwd(), ".pi", CONFIG_FILE_NAME);
		const raw = readFileSync(configPath, "utf-8");
		const parsed = JSON.parse(raw);
		if (parsed && typeof parsed === "object") {
			return parsed as ImpressionConfig;
		}
	} catch {
		// Config file missing or invalid — use defaults
	}
	return {};
}

export function shouldSkipDistillation(toolName: string, config: ResolvedConfig): boolean {
	const patterns = config.skipDistillation;
	if (patterns.length === 0) return false;
	for (const pattern of patterns) {
		if (pattern === toolName) return true;
		if (pattern.endsWith("*") && toolName.startsWith(pattern.slice(0, -1))) return true;
	}
	return false;
}
