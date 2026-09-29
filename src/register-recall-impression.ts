import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { distillWithSameModel } from "./distill.js";
import { captureProviderPayload } from "./impression-debug.js";
import { formatDistillationFailure } from "./format-distillation-failure.js";
import { formatOriginalCall } from "./format-call.js";
import { formatPassthroughReason } from "./format-passthrough-reason.js";
import { computeDistillMaxTokens } from "./impression-output-budget.js";
import { getPassthroughHardLimit } from "./impression-status.js";
import { deliverFullContent, getVisibleHistory, persistPassthroughRemaining, type ImpressionSessionState, updateRecallShowData } from "./impression-session-state.js";
import { createRecallToolResult, notifyImpressionSkip } from "./result-builders.js";
import { resolveSelectedDistillationModel } from "./resolve-selected-distillation-model.js";
import { DISTILL_LOG_ENTRY_TYPE, IMPRESSION_ENTRY_TYPE } from "./types.js";
import type { DistillLogEntry } from "./types.js";

const RecallImpressionParams = Type.Object({ id: Type.String({ description: "Impression ID" }) });
const PASSTHROUGH_OVERAGE_FACTOR = 1.5;

export function registerRecallImpressionTool(state: ImpressionSessionState): void {
	state.pi.registerTool({
		name: "recall_impression",
		label: "Recall Impression",
		description: "Recall a stored impression by ID. Returns distilled notes with updated context.",
		parameters: RecallImpressionParams,
		renderCall(args, theme, context) {
			const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
			const entry = state.impressions.get(args.id);
			const title = theme.fg("toolTitle", theme.bold("Recall Impression"));
			const idDisplay = theme.fg("muted", args.id);
			const line1 = `${title} ${idDisplay}`;
			if (entry) {
				const originalCall = formatOriginalCall(entry, theme);
				text.setText(`${line1}\n${theme.fg("muted", "> ")}${originalCall}`);
			} else {
				text.setText(line1);
			}
			return text;
		},
		renderResult(result, _options, theme, context) {
			const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
			const contentText = result.content
				.filter((block): block is { type: "text"; text: string } => block.type === "text")
				.map((block) => block.text)
				.join("\n");
			const rawDetails = result.details;
			const thinking = rawDetails && typeof rawDetails === "object" && typeof (rawDetails as Record<string, unknown>).thinking === "string"
				? ((rawDetails as Record<string, unknown>).thinking as string)
				: undefined;
			if (thinking) {
				const thinkingLabel = theme.fg("muted", "[thinking] ");
				const thinkingText = theme.fg("muted", thinking.replaceAll("\n", " ").slice(0, 200));
				text.setText(`${contentText}\n${thinkingLabel}${thinkingText}`);
			} else {
				text.setText(contentText);
			}
			return text;
		},
		async execute(_toolCallId, args, signal, _onUpdate, ctx) {
			const impression = state.impressions.get(args.id);
			if (!impression) throw new Error(`Impression not found: ${args.id}`);
			if (impression.delivered) {
				throw new Error(`Impression ${args.id} has already been fully delivered to your context. The full content is already in your message history; re-recall it from there, or use the standard write tool to persist it.`);
			}
			if (state.passthroughRemaining > 0) {
				const maxChars = getPassthroughHardLimit(state.cfg);
				const contentChars = impression.fullText.length;
				const overEstimate = state.lastEstimatedChars > 0 && contentChars > state.lastEstimatedChars * PASSTHROUGH_OVERAGE_FACTOR;
				const overMax = contentChars > maxChars;
				if (overEstimate || overMax) {
					state.passthroughRemaining--;
					persistPassthroughRemaining(state);
					const reason = overMax
						? `content ${contentChars} chars exceeds hard limit of ${maxChars}`
						: `content ${contentChars} chars exceeds ${PASSTHROUGH_OVERAGE_FACTOR}x estimated ${state.lastEstimatedChars}`;
					ctx.ui.notify(`[impression] Recall passthrough rejected: ${reason}.`, "warning");
					return { content: [{ type: "text", text: `Recall passthrough rejected: content too large (${reason}). Options: (1) skip_impression count=0 to cancel and recall for distilled notes, (2) save_impression to a file and use read/bash to inspect.` }], details: undefined };
				}
				state.passthroughRemaining--;
				persistPassthroughRemaining(state);
				ctx.ui.notify(`[impression] Passthrough mode (${state.passthroughRemaining} remaining)`, "info");
				updateRecallShowData(state, ctx, impression, "passthrough", 0);
				return deliverFullContent(state, impression);
			}
			if (impression.recallCount >= state.cfg.maxRecall) {
				updateRecallShowData(state, ctx, impression, "passthrough", 0);
				return deliverFullContent(state, impression);
			}
			const selected = resolveSelectedDistillationModel(ctx, state.cfg.distillModel);
			if (!selected.ok) {
				notifyImpressionSkip(ctx, selected.reason);
				updateRecallShowData(state, ctx, impression, "passthrough", 0);
				return deliverFullContent(state, impression);
			}
			const model = selected.model;
			const auth = selected.kind === "fixed"
				? { ok: true as const, apiKey: undefined, headers: undefined }
				: await ctx.modelRegistry.getApiKeyAndHeaders(model);
			if (!auth.ok) {
				notifyImpressionSkip(ctx, `missing auth for ${model.provider}/${model.id}: ${auth.error}`);
				impression.recallCount = state.cfg.maxRecall;
				updateRecallShowData(state, ctx, impression, "passthrough", 0);
				return deliverFullContent(state, impression);
			}
			const visibleHistory = getVisibleHistory(ctx);
			const originalSystemPrompt = ctx.getSystemPrompt();
			ctx.ui.notify(`[impression] Re-distilling ${impression.fullText.length} chars with ${model.provider}/${model.id}...`, "info");
			if (state.cfg.debug) ctx.ui.notify(`[impression:debug] Recall model ${model.provider}/${model.id} effort=${selected.effort ?? "null"} (${selected.kind})`, "info");
			const distillation = await distillWithSameModel(
				model,
				state.cfg.debugDistillMode,
				{ apiKey: auth.apiKey, headers: auth.headers },
				{ toolName: impression.toolName, content: impression.fullContent, visibleHistory, originalSystemPrompt },
				computeDistillMaxTokens(impression.fullText.length, model, state.cfg),
				signal,
				state.cfg.debug ? (version) => ctx.ui.notify(`[impression:debug] Using prompt version: ${version}`, "info") : undefined,
				state.cfg.debug
					? (payload) => {
						state.captureNextMainProviderPayload = true;
						captureProviderPayload(ctx, "distillation", payload, {
							toolCallId: _toolCallId,
							toolName: "recall_impression",
							toolResultChars: impression.fullText.length,
							visibleHistoryMessages: visibleHistory.length,
							originalSystemPromptChars: originalSystemPrompt.length,
							modelProvider: model.provider,
							modelId: model.id,
							modelApi: model.api,
							reasoningEffort: selected.effort ?? null,
							selection: selected.kind,
							recall: true,
						});
					}
					: undefined,
				selected.kind === "fixed" ? { registry: ctx.modelRegistry, effort: selected.effort } : undefined,
			);
			const ptLevel = state.cfg.debug ? "warning" : "info";
			if (distillation.passthrough) {
				if (distillation.thinking) ctx.ui.notify(`[impression] Recall passthrough thinking: ${distillation.thinking}`, ptLevel);
				if (distillation.failure) {
					state.pi.appendEntry(DISTILL_LOG_ENTRY_TYPE, {
						toolCallId: impression.toolCallId, toolName: impression.toolName, passthrough: true,
						passthroughReason: distillation.passthroughReason, originalChars: impression.fullText.length,
						noteChars: impression.fullText.length, thinkingChars: distillation.thinking?.length ?? 0,
						thinking: distillation.thinking, failure: distillation.failure, createdAt: Date.now(),
					} satisfies DistillLogEntry);
					ctx.ui.notify(`[impression] Recall distillation failed for ${impression.toolName}: ${formatDistillationFailure(distillation.failure)}`, "error");
				} else {
					ctx.ui.notify(`[impression] Recall passthrough for ${impression.toolName}: ${formatPassthroughReason(distillation.passthroughReason)}`, ptLevel);
				}
				impression.recallCount = state.cfg.maxRecall;
				updateRecallShowData(state, ctx, impression, "passthrough", distillation.note.length);
				return deliverFullContent(state, impression);
			}
			impression.recallCount += 1;
			state.pi.appendEntry(IMPRESSION_ENTRY_TYPE, impression);
			updateRecallShowData(state, ctx, impression, "distill", distillation.note.length);
			return createRecallToolResult(impression.id, distillation.note, { thinking: distillation.thinking });
		},
	});
}
