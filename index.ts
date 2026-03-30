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
import { loadConfig, resolveConfig, shouldSkipDistillation } from "./src/config.ts";
import { distillWithSameModel } from "./src/distill.ts";
import { formatOriginalCall } from "./src/format-call.ts";
import { buildImpressionText, createPassthroughToolResult, createRecallToolResult, notifyImpressionSkip, resolveStoredModel } from "./src/result-builders.ts";
import { serializeContent } from "./src/serialize.ts";
import { CONFIG_FILE_NAME, getEntryData, isImpressionEntry } from "./src/types.ts";
import type { ImpressionEntry, ResolvedConfig } from "./src/types.ts";

const RecallImpressionParams = Type.Object({
	id: Type.String({ description: "Impression ID" }),
});

function serializeVisibleHistory(messages: ReturnType<typeof buildSessionContext>["messages"]): string {
	return messages.map((m) => JSON.stringify(m)).join("\n");
}

export default function (pi: ExtensionAPI) {
	const impressions = new Map<string, ImpressionEntry>();
	let cfg: ResolvedConfig = resolveConfig(loadConfig());

	pi.on("session_start", async (_event, ctx) => {
		cfg = resolveConfig(loadConfig());
		impressions.clear();
		for (const entry of ctx.sessionManager.getEntries()) {
			const data = getEntryData(entry);
			if (!isImpressionEntry(data)) continue;
			impressions.set(data.id, data);
		}
	});

	pi.on("tool_result", async (event, ctx) => {
		if (event.toolName === "recall_impression") return;
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
		ctx.ui.setStatus("impression-distill", `[impression] Distilling ${fullText.length} chars with ${model.provider}/${model.id}...`);
		let distillation: { passthrough: boolean; note: string; thinking?: string };
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

		if (distillation.thinking) {
			ctx.ui.notify(`[impression] Thinking: ${distillation.thinking}`, "info");
		}

		if (distillation.passthrough) {
			ctx.ui.notify(`[impression] Distillation passthrough with text: ${distillation.note}`, "info");
			return { content: event.content };
		}

		const id = randomUUID();
		const impression: ImpressionEntry = {
			id,
			toolName: event.toolName,
			toolCallId: event.toolCallId,
			toolInput: event.input,
			fullContent: event.content,
			fullText,
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
				return createPassthroughToolResult(impression.fullContent);
			}

			const activeModel = ctx.model;
			const model = resolveStoredModel(impression, activeModel);
			if (!model) {
				notifyImpressionSkip(ctx, `model changed or unavailable (stored ${impression.modelProvider}/${impression.modelId})`);
				impression.recallCount = cfg.maxRecall;
				pi.appendEntry("impression-v1", impression);
				return createPassthroughToolResult(impression.fullContent);
			}

			const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
			if (!auth.ok) {
				notifyImpressionSkip(ctx, `missing auth for ${model.provider}/${model.id}: ${auth.error}`);
				impression.recallCount = cfg.maxRecall;
				pi.appendEntry("impression-v1", impression);
				return createPassthroughToolResult(impression.fullContent);
			}
			const visibleHistory = serializeVisibleHistory(buildSessionContext(ctx.sessionManager.getEntries()).messages);
			const originalSystemPrompt = ctx.getSystemPrompt();
			ctx.ui.setStatus("impression-distill", `[impression] Re-distilling ${impression.fullText.length} chars with ${model.provider}/${model.id}...`);
			let distillation: { passthrough: boolean; note: string; thinking?: string };
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
				return createPassthroughToolResult(impression.fullContent);
			}

			impression.recallCount += 1;
			if (impression.recallCount >= cfg.maxRecall) {
				pi.appendEntry("impression-v1", impression);
				return createPassthroughToolResult(impression.fullContent);
			}

			pi.appendEntry("impression-v1", impression);
			return createRecallToolResult(impression.id, distillation.note);
		},
	});
}
