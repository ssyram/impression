import type { SkipDistillationRules } from "./types.js";

export function shouldSkipDistillation(
	toolName: string,
	toolInput: Record<string, unknown> | undefined,
	rules: SkipDistillationRules,
): boolean {
	const conditions = rules[toolName];
	if (!conditions) return false;
	return Object.entries(conditions).every(([parameter, pattern]) => {
		const value = toolInput?.[parameter];
		if (typeof value !== "string") return false;
		if (pattern.length >= 2 && pattern.startsWith("/") && pattern.endsWith("/")) {
			try {
				return new RegExp(pattern.slice(1, -1)).test(value);
			} catch {
				return false;
			}
		}
		return value === pattern;
	});
}
