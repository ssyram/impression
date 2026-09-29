import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { ResolvedConfig } from "./types.js";

const STATUS_KEY = "impression-data";
const DOCKER_UPDATE = "docker:update";
const DOCKER_REMOVE = "docker:remove";
const DOCKER_AVAILABLE_FLAG = "$__docker_available__";

export function getPassthroughHardLimit(cfg: ResolvedConfig): number {
	return Math.max(cfg.minLength * 10, 10240);
}

function formatCompactChars(value: number): string {
	const abs = Math.abs(value);
	if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
	if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
	if (abs >= 1_000) return `${(value / 1_000).toFixed(2)}k`;
	return value.toFixed(2);
}

export function formatImpressionData(impressionChars: number, originalChars: number): string {
	const ratio = originalChars > 0 ? (impressionChars / originalChars) * 100 : 0;
	return `[impression:data] ${formatCompactChars(impressionChars)} / ${formatCompactChars(originalChars)} = ${ratio.toFixed(2)}%`;
}

export function publishDataStatus(pi: ExtensionAPI, ctx: ExtensionContext, text: string | undefined): void {
	if ((globalThis as Record<string, unknown>)[DOCKER_AVAILABLE_FLAG] === true) {
		if (text) {
			pi.events.emit(DOCKER_UPDATE, { id: STATUS_KEY, title: "Impression", order: 30, lines: text.split("\n") });
		} else {
			pi.events.emit(DOCKER_REMOVE, { id: STATUS_KEY });
		}
		if (ctx.hasUI) ctx.ui.setStatus(STATUS_KEY, undefined);
		return;
	}
	if (ctx.hasUI) ctx.ui.setStatus(STATUS_KEY, text);
}
