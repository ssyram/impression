/**
 * Impression System — pi extension that distills long tool results into
 * compact notes, storing the originals for on-demand recall.
 *
 * See README.md for full documentation.
 */
import { randomUUID } from "node:crypto";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { buildSessionContext } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import { loadConfig, resolveConfig, shouldSkipDistillation } from "./src/config.js";
import { distillWithSameModel } from "./src/distill.js";
import { formatOriginalCall } from "./src/format-call.js";
import { buildImpressionText, createPassthroughToolResult, createRecallToolResult, notifyImpressionSkip, resolveStoredModel } from "./src/result-builders.js";
import { serializeContent } from "./src/serialize.js";
import { CONFIG_FILE_NAME, PASSTHROUGH_MODE_ENTRY_TYPE, getEntryData, getPassthroughModeData, isImpressionEntry, isPassthroughModeEntry } from "./src/types.js";
import type { ImpressionEntry, ResolvedConfig } from "./src/types.js";

const RecallImpressionParams = Type.Object({
	id: Type.String({ description: "Impression ID" }),
});

function serializeVisibleHistory(messages: ReturnType<typeof buildSessionContext>["messages"]): string {
	return messages.map((m) => JSON.stringify(m)).join("\n");
}

const SetImpressionModeParams = Type.Object({
	mode: Type.Union([Type.Literal("normal"), Type.Literal("passthrough")], {
		description: "'passthrough' skips distillation for the next N tool results; 'normal' cancels passthrough mode.",
	}),
	count: Type.Optional(Type.Number({ description: "Number of tool results to pass through unchanged (default 1). Capped by config." })),
});

export default function (pi: ExtensionAPI) {
	const impressions = new Map<string, ImpressionEntry>();
	let cfg: ResolvedConfig = resolveConfig(loadConfig());
	let cumulativeOriginalTokens = 0;
	let cumulativeImpressionTokens = 0;
	let passthroughRemaining = 0;

	function persistPassthroughRemaining() {
		pi.appendEntry(PASSTHROUGH_MODE_ENTRY_TYPE, { remaining: passthroughRemaining });
	}

	function updateShowDataStatus(ctx: { ui: { setStatus(key: string, text: string | undefined): void } }) {
		if (!cfg.showData) {
			ctx.ui.setStatus("impression-data", undefined);
			return;
		}
		const total = cumulativeOriginalTokens + cumulativeImpressionTokens;
		ctx.ui.setStatus(
			"impression-data",
			`[impression:data] original ${cumulativeOriginalTokens}; impression ${cumulativeImpressionTokens} = ${total}`,
		);
	}

	function updateRecallShowData(
		ctx: { ui: { notify(message: string, type?: "info" | "warning" | "error"): void; setStatus(key: string, text: string | undefined): void } },
		impression: ImpressionEntry,
		mode: "passthrough" | "distill",
		newTokens: number,
	) {
		if (!cfg.showData) return;
		const ori = impression.originalTokens ?? 0;
		const add = mode === "passthrough" ? ori : newTokens;
		cumulativeImpressionTokens += add;
		ctx.ui.notify(`[impression:data] recall ${mode}: ori=${ori}, new=${newTokens}, add=${add}`, "info");
		updateShowDataStatus(ctx);
	}

	pi.on("session_start", async (_event, ctx) => {
		cfg = resolveConfig(loadConfig());
		cumulativeOriginalTokens = 0;
		cumulativeImpressionTokens = 0;
		passthroughRemaining = 0;
		impressions.clear();
		for (const entry of ctx.sessionManager.getEntries()) {
			const ptData = getPassthroughModeData(entry);
			if (isPassthroughModeEntry(ptData)) {
				passthroughRemaining = ptData.remaining;
				continue;
			}
			const data = getEntryData(entry);
			if (!isImpressionEntry(data)) continue;
			impressions.set(data.id, data);
		}
		updateShowDataStatus(ctx);
	});

	pi.on("tool_result", async (event, ctx) => {
		if (event.toolName === "recall_impression" || event.toolName === "set_impression_mode") return;
		if (passthroughRemaining > 0) {
			passthroughRemaining--;
			persistPassthroughRemaining();
			ctx.ui.notify(`[impression] Passthrough mode (${passthroughRemaining} remaining)`, "info");
			return;
		}
		if (shouldSkipDistillation(event.toolName, cfg)) {
			ctx.ui.notify(`[impression] Skipped distillation for "${event.toolName}" (configured in ${CONFIG_FILE_NAME})`, "info");
			return;
		}
		if (event.isError) {
			notifyImpressionSkip(ctx, "tool result is an error");
			return;
		}

		const fullText = serializeContent(event.content);
		if (fullText.length < cfg.minLength) {
			ctx.ui.notify(`[impression] Skipped: content length ${fullText.length} is below threshold of ${cfg.minLength}`, "info");
			return;
		}

		const model = ctx.model;
		if (!model) {
			notifyImpressionSkip(ctx, "no active model selected");
			return { content: event.content };
		}
		const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
		if (!auth.ok) {
			notifyImpressionSkip(ctx, `missing auth for ${model.provider}/${model.id}: ${auth.error}`);
			return { content: event.content };
		}
		const visibleHistory = serializeVisibleHistory(buildSessionContext(ctx.sessionManager.getEntries()).messages);
		const originalSystemPrompt = ctx.getSystemPrompt();
		const oldTokens = ctx.getContextUsage()?.tokens ?? 0;
		ctx.ui.setStatus("impression-distill", `[impression] Distilling ${fullText.length} chars with ${model.provider}/${model.id}...`);
		let distillation: { passthrough: boolean; note: string; thinking?: string; usage: { input: number; output: number; outputVisible: number } };
		try {
			distillation = await distillWithSameModel(
				model,
				{ apiKey: auth.apiKey, headers: auth.headers },
				event.toolName,
				event.content,
				visibleHistory,
				originalSystemPrompt,
				Math.max(Math.ceil(cfg.minLength / 2), 1024),
				ctx.signal,
			);
		} finally {
			ctx.ui.setStatus("impression-distill", undefined);
		}

		if (cfg.showData) {
			const ori = distillation.usage.input;
			const impressionTokens = distillation.usage.outputVisible;
			const originalTokens = Math.max(ori - oldTokens, 0);
			cumulativeOriginalTokens += originalTokens;
			cumulativeImpressionTokens += impressionTokens;
			ctx.ui.notify(
				`[impression:data] old=${oldTokens}, ori=${ori}, new=${impressionTokens}, original=${originalTokens}, impression=${impressionTokens}`,
				"info",
			);
			updateShowDataStatus(ctx);
		}

		if (distillation.thinking) {
			ctx.ui.notify(`[impression] Thinking: ${distillation.thinking}`, "info");
		}

		if (distillation.passthrough) {
			ctx.ui.notify(`[impression] Distillation passthrough with text: ${distillation.note}`, "info");
			return { content: event.content };
		}

		const id = randomUUID();
		const originalTokens = Math.max(distillation.usage.input - oldTokens, 0);
		const impression: ImpressionEntry = {
			id,
			toolName: event.toolName,
			toolCallId: event.toolCallId,
			toolInput: event.input,
			fullContent: event.content,
			fullText,
			originalTokens,
			recallCount: 0,
			createdAt: Date.now(),
			modelProvider: model.provider,
			modelId: model.id,
		};
		impressions.set(id, impression);
		pi.appendEntry("impression-v1", impression);

		return {
			content: [{ type: "text", text: buildImpressionText(id, distillation.note) }],
		};
	});

	pi.registerTool({
		name: "recall_impression",
		label: "Recall Impression",
		description:
			"Recall a stored impression by ID. Before " + cfg.maxRecall + " recalls it returns distilled notes; after that it returns full passthrough content.",
		parameters: RecallImpressionParams,
		renderCall(args, theme, context) {
			const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
			const entry = impressions.get(args.id);
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
		async execute(_toolCallId, args, signal, _onUpdate, ctx) {
			const impression = impressions.get(args.id);
			if (!impression) {
				throw new Error(`Impression not found: ${args.id}`);
			}

			if (impression.recallCount >= cfg.maxRecall) {
				updateRecallShowData(ctx, impression, "passthrough", 0);
				return createPassthroughToolResult(impression.fullContent);
			}

			const activeModel = ctx.model;
			const model = resolveStoredModel(impression, activeModel);
			if (!model) {
				notifyImpressionSkip(ctx, `model changed or unavailable (stored ${impression.modelProvider}/${impression.modelId})`);
				impression.recallCount = cfg.maxRecall;
				pi.appendEntry("impression-v1", impression);
				updateRecallShowData(ctx, impression, "passthrough", 0);
				return createPassthroughToolResult(impression.fullContent);
			}

			const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
			if (!auth.ok) {
				notifyImpressionSkip(ctx, `missing auth for ${model.provider}/${model.id}: ${auth.error}`);
				impression.recallCount = cfg.maxRecall;
				pi.appendEntry("impression-v1", impression);
				updateRecallShowData(ctx, impression, "passthrough", 0);
				return createPassthroughToolResult(impression.fullContent);
			}
			const visibleHistory = serializeVisibleHistory(buildSessionContext(ctx.sessionManager.getEntries()).messages);
			const originalSystemPrompt = ctx.getSystemPrompt();
			ctx.ui.setStatus("impression-distill", `[impression] Re-distilling ${impression.fullText.length} chars with ${model.provider}/${model.id}...`);
			let distillation: { passthrough: boolean; note: string; thinking?: string; usage: { input: number; output: number; outputVisible: number } };
			try {
				distillation = await distillWithSameModel(
					model,
					{ apiKey: auth.apiKey, headers: auth.headers },
					impression.toolName,
					impression.fullContent,
					visibleHistory,
					originalSystemPrompt,
					Math.max(Math.ceil(cfg.minLength / 2), 1024),
					signal,
				);
			} finally {
				ctx.ui.setStatus("impression-distill", undefined);
			}

			if (distillation.thinking) {
				ctx.ui.notify(`[impression] Recall thinking: ${distillation.thinking}`, "info");
			}

			if (distillation.passthrough) {
				impression.recallCount = cfg.maxRecall;
				pi.appendEntry("impression-v1", impression);
				updateRecallShowData(ctx, impression, "passthrough", distillation.usage.outputVisible);
				return createPassthroughToolResult(impression.fullContent);
			}

			impression.recallCount += 1;
			if (impression.recallCount >= cfg.maxRecall) {
				pi.appendEntry("impression-v1", impression);
				updateRecallShowData(ctx, impression, "passthrough", distillation.usage.outputVisible);
				return createPassthroughToolResult(impression.fullContent);
			}

			pi.appendEntry("impression-v1", impression);
			updateRecallShowData(ctx, impression, "distill", distillation.usage.outputVisible);
			return createRecallToolResult(impression.id, distillation.note);
		},
	});

	pi.registerTool({
		name: "set_impression_mode",
		label: "Set Impression Mode",
		description:
			"Temporarily skip distillation for the next N tool results (max " + cfg.maxPassthroughCount + "). Use when you need exact original content for comparison, diff, or code review.",
		promptSnippet: "set_impression_mode: Temporarily skip distillation. Call with { mode: 'passthrough', count: N } (max " + cfg.maxPassthroughCount + ") before reads that need exact original content (e.g., line-by-line diff, code review). Call with { mode: 'normal' } to cancel.",
		parameters: SetImpressionModeParams,
		async execute(_toolCallId, args, _signal, _onUpdate, ctx) {
			if (args.mode === "normal") {
				passthroughRemaining = 0;
				persistPassthroughRemaining();
				ctx.ui.notify("[impression] Passthrough mode cancelled", "info");
				return { content: [{ type: "text", text: "Impression mode set to normal. Distillation resumed." }], details: undefined };
			}
			const requested = args.count ?? 1;
			passthroughRemaining = Math.min(Math.max(requested, 1), cfg.maxPassthroughCount);
			persistPassthroughRemaining();
			ctx.ui.notify(`[impression] Passthrough mode: next ${passthroughRemaining} tool result(s) will skip distillation`, "info");
			return {
				content: [{ type: "text", text: `Passthrough mode active. Next ${passthroughRemaining} tool result(s) will return original content without distillation.` }],
				details: undefined,
			};
		},
	});
}
