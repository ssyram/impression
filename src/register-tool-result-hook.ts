import { distillWithSameModel } from "./distill.js";
import { captureProviderPayload } from "./impression-debug.js";
import { formatDistillationFailure } from "./format-distillation-failure.js";
import { formatPassthroughReason } from "./format-passthrough-reason.js";
import { getToolResultDistillationSkipReason } from "./get-tool-result-distillation-skip-reason.js";
import { computeDistillMaxTokens } from "./impression-output-budget.js";
import { getPassthroughHardLimit, formatImpressionData } from "./impression-status.js";
import { getVisibleHistory, newImpression, persistPassthroughRemaining, recordImpressionData, type ImpressionSessionState, updateShowDataStatus } from "./impression-session-state.js";
import { buildImpressionText, notifyImpressionSkip } from "./result-builders.js";
import { resolveSelectedDistillationModel } from "./resolve-selected-distillation-model.js";
import { serializeContent } from "./serialize.js";
import { shouldSkipDistillation } from "./should-skip-distillation.js";
import { CONFIG_FILE_NAME, DISTILL_LOG_ENTRY_TYPE, IMPRESSION_ENTRY_TYPE } from "./types.js";
import type { DistillLogEntry, ImpressionDetails } from "./types.js";

const PASSTHROUGH_OVERAGE_FACTOR = 1.5;

export function registerToolResultHook(state: ImpressionSessionState): void {
	state.pi.on("tool_result", async (event, ctx) => {
		if (event.toolName === "recall_impression" || event.toolName === "skip_impression") return;
		if (!state.cfg.enabled) return;
		if (state.passthroughRemaining > 0) {
			const fullText = serializeContent(event.content);
			const maxChars = getPassthroughHardLimit(state.cfg);
			const overEstimate = state.lastEstimatedChars > 0 && fullText.length > state.lastEstimatedChars * PASSTHROUGH_OVERAGE_FACTOR;
			const overMax = fullText.length > maxChars;
			if (overEstimate || overMax) {
				const reason = overMax
					? `actual content ${fullText.length} chars exceeds hard limit of ${maxChars}`
					: `actual content ${fullText.length} chars exceeds ${PASSTHROUGH_OVERAGE_FACTOR}x estimated ${state.lastEstimatedChars}`;
				const impression = newImpression(event, fullText);
				state.impressions.set(impression.id, impression);
				state.pi.appendEntry(IMPRESSION_ENTRY_TYPE, impression);
				state.passthroughRemaining--;
				persistPassthroughRemaining(state);
				ctx.ui.notify(`[impression] Passthrough rejected: ${reason}.`, "warning");
				return {
					content: [{ type: "text", text: `Passthrough stored but content too large (${reason}). Impression ID: ${impression.id}. Options: (1) skip_impression again with a smaller range, (2) skip_impression count=0 to cancel and let distillation handle it, (3) save_impression to a file and use read/bash to inspect.` }],
				};
			}
			state.passthroughRemaining--;
			persistPassthroughRemaining(state);
			recordImpressionData(state, fullText.length, fullText.length);
			if (state.cfg.showData) ctx.ui.notify(formatImpressionData(fullText.length, fullText.length), "info");
			updateShowDataStatus(state, ctx);
			ctx.ui.notify(`[impression] Passthrough mode (${state.passthroughRemaining} remaining)`, "info");
			return;
		}
		if (shouldSkipDistillation(event.toolName, event.input, state.cfg.skipDistillation)) {
			ctx.ui.notify(`[impression] Skipped distillation for "${event.toolName}" (configured in ${CONFIG_FILE_NAME})`, "info");
			return;
		}
		const fullText = serializeContent(event.content);
		const thresholdSkipReason = getToolResultDistillationSkipReason(event.isError, fullText.length, state.cfg);
		if (thresholdSkipReason) {
			ctx.ui.notify(`[impression] Skipped: ${thresholdSkipReason}`, "info");
			return;
		}

		const selected = resolveSelectedDistillationModel(ctx, state.cfg.distillModel);
		if (!selected.ok) {
			notifyImpressionSkip(ctx, selected.reason);
			return { content: event.content };
		}
		const model = selected.model;
		const auth = selected.kind === "fixed"
			? { ok: true as const, apiKey: undefined, headers: undefined }
			: await ctx.modelRegistry.getApiKeyAndHeaders(model);
		if (!auth.ok) {
			notifyImpressionSkip(ctx, `missing auth for ${model.provider}/${model.id}: ${auth.error}`);
			return { content: event.content };
		}
		const visibleHistory = getVisibleHistory(ctx);
		const originalSystemPrompt = ctx.getSystemPrompt();
		ctx.ui.notify(`[impression] Distilling ${fullText.length} chars with ${model.provider}/${model.id}...`, "info");
		if (state.cfg.debug) ctx.ui.notify(`[impression:debug] Distillation model ${model.provider}/${model.id} effort=${selected.effort ?? "null"} (${selected.kind})`, "info");
		const distillation = await distillWithSameModel(
			model,
			state.cfg.debugDistillMode,
			{ apiKey: auth.apiKey, headers: auth.headers },
			{ toolName: event.toolName, content: event.content, visibleHistory, originalSystemPrompt },
			computeDistillMaxTokens(fullText.length, model, state.cfg),
			ctx.signal,
			state.cfg.debug ? (version) => ctx.ui.notify(`[impression:debug] Using prompt version: ${version}`, "info") : undefined,
			state.cfg.debug
				? (payload) => {
					state.captureNextMainProviderPayload = true;
					captureProviderPayload(ctx, "distillation", payload, {
						toolCallId: event.toolCallId,
						toolName: event.toolName,
						toolResultChars: fullText.length,
						visibleHistoryMessages: visibleHistory.length,
						originalSystemPromptChars: originalSystemPrompt.length,
						modelProvider: model.provider,
						modelId: model.id,
						modelApi: model.api,
						reasoningEffort: selected.effort ?? null,
						selection: selected.kind,
					});
				}
				: undefined,
			selected.kind === "fixed" ? { registry: ctx.modelRegistry, effort: selected.effort } : undefined,
		);

		const ptLevel = state.cfg.debug ? "warning" : "info";
		if (distillation.passthrough) {
			if (state.cfg.debug && distillation.thinking) ctx.ui.notify(`[impression] Passthrough thinking: ${distillation.thinking}`, "warning");
			recordImpressionData(state, fullText.length, fullText.length);
			state.pi.appendEntry(DISTILL_LOG_ENTRY_TYPE, {
				toolCallId: event.toolCallId,
				toolName: event.toolName,
				passthrough: true,
				passthroughReason: distillation.passthroughReason,
				originalChars: fullText.length,
				noteChars: fullText.length,
				thinkingChars: distillation.thinking?.length ?? 0,
				thinking: distillation.thinking,
				failure: distillation.failure,
				createdAt: Date.now(),
			} satisfies DistillLogEntry);
			if (state.cfg.showData) ctx.ui.notify(formatImpressionData(fullText.length, fullText.length), "info");
			updateShowDataStatus(state, ctx);
			if (distillation.failure) {
				ctx.ui.notify(`[impression] Distillation failed for ${event.toolName}: ${formatDistillationFailure(distillation.failure)}`, "error");
			} else {
				ctx.ui.notify(`[impression] Passthrough for ${event.toolName}: ${formatPassthroughReason(distillation.passthroughReason)}`, ptLevel);
			}
			return { content: event.content };
		}

		if (state.cfg.debug && distillation.thinking) {
			ctx.ui.notify(`[impression] Thinking detected (${distillation.thinking.length} chars): ${distillation.thinking.slice(0, 300)}`, "warning");
		}
		const impressionChars = distillation.note.length;
		recordImpressionData(state, fullText.length, impressionChars);
		if (state.cfg.showData) ctx.ui.notify(formatImpressionData(impressionChars, fullText.length), "info");
		updateShowDataStatus(state, ctx);
		const impression = newImpression(event, fullText);
		state.impressions.set(impression.id, impression);
		state.pi.appendEntry(IMPRESSION_ENTRY_TYPE, impression);
		state.pi.appendEntry(DISTILL_LOG_ENTRY_TYPE, {
			toolCallId: event.toolCallId,
			toolName: event.toolName,
			passthrough: false,
			originalChars: fullText.length,
			noteChars: impressionChars,
			thinkingChars: distillation.thinking?.length ?? 0,
			thinking: distillation.thinking,
			createdAt: Date.now(),
		} satisfies DistillLogEntry);
		return {
			content: [{ type: "text", text: buildImpressionText(impression.id, distillation.note) }],
			details: { thinking: distillation.thinking } satisfies ImpressionDetails,
		};
	});
}
