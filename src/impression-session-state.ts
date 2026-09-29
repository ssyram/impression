import { randomUUID } from "node:crypto";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { buildSessionContext, convertToLlm } from "@earendil-works/pi-coding-agent";
import { resolveConfig } from "./config.js";
import { formatImpressionData, publishDataStatus } from "./impression-status.js";
import { createPassthroughToolResult } from "./result-builders.js";
import { IMPRESSION_CONFIG_ENTRY_TYPE, IMPRESSION_ENTRY_TYPE, PASSTHROUGH_MODE_ENTRY_TYPE, SESSION_STATS_ENTRY_TYPE } from "./types.js";
import type { ImpressionConfig, ImpressionEntry, ResolvedConfig } from "./types.js";

export interface ImpressionSessionState {
	pi: ExtensionAPI;
	impressions: Map<string, ImpressionEntry>;
	currentRaw: ImpressionConfig;
	cfg: ResolvedConfig;
	cumulativeOriginalChars: number;
	cumulativeImpressionChars: number;
	passthroughRemaining: number;
	lastEstimatedChars: number;
	captureNextMainProviderPayload: boolean;
}

export function createImpressionSessionState(pi: ExtensionAPI): ImpressionSessionState {
	return {
		pi,
		impressions: new Map(),
		currentRaw: {},
		cfg: resolveConfig({}),
		cumulativeOriginalChars: 0,
		cumulativeImpressionChars: 0,
		passthroughRemaining: 0,
		lastEstimatedChars: 0,
		captureNextMainProviderPayload: false,
	};
}

export function persistPassthroughRemaining(state: ImpressionSessionState): void {
	state.pi.appendEntry(PASSTHROUGH_MODE_ENTRY_TYPE, {
		remaining: state.passthroughRemaining,
		lastEstimatedChars: state.lastEstimatedChars,
	});
}

export function recordImpressionData(state: ImpressionSessionState, originalChars: number, impressionChars: number): void {
	state.cumulativeOriginalChars += originalChars;
	state.cumulativeImpressionChars += impressionChars;
	state.pi.appendEntry(SESSION_STATS_ENTRY_TYPE, {
		originalChars: state.cumulativeOriginalChars,
		impressionChars: state.cumulativeImpressionChars,
	});
}

export function updateShowDataStatus(state: ImpressionSessionState, ctx: ExtensionContext): void {
	const text = state.cfg.showData
		? formatImpressionData(state.cumulativeImpressionChars, state.cumulativeOriginalChars)
		: undefined;
	publishDataStatus(state.pi, ctx, text);
}

export function updateRecallShowData(
	state: ImpressionSessionState,
	ctx: ExtensionContext,
	impression: ImpressionEntry,
	mode: "passthrough" | "distill",
	noteChars: number,
): void {
	const originalChars = impression.originalChars ?? 0;
	const shownChars = mode === "passthrough" ? originalChars : noteChars;
	recordImpressionData(state, originalChars, shownChars);
	if (state.cfg.showData) ctx.ui.notify(formatImpressionData(shownChars, originalChars), "info");
	updateShowDataStatus(state, ctx);
}

export function deliverFullContent(
	state: Pick<ImpressionSessionState, "impressions"> & { pi: Pick<ExtensionAPI, "appendEntry"> },
	impression: ImpressionEntry,
) {
	const result = createPassthroughToolResult(impression.fullContent);
	const delivered: ImpressionEntry = { ...impression, fullContent: [], fullText: "", delivered: true };
	state.pi.appendEntry(IMPRESSION_ENTRY_TYPE, delivered);
	impression.fullContent = [];
	impression.fullText = "";
	impression.delivered = true;
	state.impressions.set(impression.id, delivered);
	return result;
}

export function newImpression(
	event: { toolName: string; toolCallId: string; input?: Record<string, unknown>; content: ImpressionEntry["fullContent"] },
	fullText: string,
): ImpressionEntry {
	return {
		id: randomUUID(), toolName: event.toolName, toolCallId: event.toolCallId, toolInput: event.input,
		fullContent: event.content, fullText, originalChars: fullText.length, recallCount: 0, createdAt: Date.now(),
	};
}

export function getVisibleHistory(ctx: ExtensionContext) {
	const messages = buildSessionContext(ctx.sessionManager.getEntries(), ctx.sessionManager.getLeafId()).messages;
	return convertToLlm(messages);
}

export function applyConfigPatch(state: ImpressionSessionState, patch: Partial<ImpressionConfig>, registerSkipTool: () => void): void {
	const safe = patch.skipDistillation
		? {
			...patch,
			skipDistillation: Object.fromEntries(
				Object.entries(patch.skipDistillation).map(([toolName, conditions]) => [toolName, { ...conditions }]),
			),
		}
		: patch;
	state.pi.appendEntry(IMPRESSION_CONFIG_ENTRY_TYPE, safe);
	state.currentRaw = { ...state.currentRaw, ...safe };
	state.cfg = resolveConfig(state.currentRaw);
	registerSkipTool();
}
