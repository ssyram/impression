import type { ResolvedConfig } from "./types.js";

export function computeDistillMaxTokens(originalLength: number, model: { maxTokens?: number }, cfg: ResolvedConfig): number {
	const value = model.maxTokens;
	const cap = typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 8192;
	const scaled = Math.floor(originalLength * cfg.distillRateFloor);
	return Math.min(Math.max(1024, scaled), cap);
}
