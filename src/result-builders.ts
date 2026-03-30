import type { Api, ImageContent, Model, TextContent } from "@mariozechner/pi-ai";
import type { ImpressionEntry } from "./types.js";
import { getImpressionTextTemplate, renderTemplate } from "./prompt-loader.js";

export function buildImpressionText(id: string, note: string): string {
	return renderTemplate(getImpressionTextTemplate(), { id, note });
}

export function createRecallToolResult(id: string, note: string): { content: TextContent[]; details: undefined } {
	return {
		content: [{ type: "text", text: buildImpressionText(id, note) }],
		details: undefined,
	};
}

export function createPassthroughToolResult(content: (TextContent | ImageContent)[]): {
	content: (TextContent | ImageContent)[];
	details: undefined;
} {
	return { content, details: undefined };
}

export function resolveStoredModel(
	entry: ImpressionEntry,
	currentModel: Model<Api> | undefined,
): Model<Api> | undefined {
	if (currentModel && currentModel.provider === entry.modelProvider && currentModel.id === entry.modelId) {
		return currentModel;
	}
	return undefined;
}

export function notifyImpressionSkip(
	ctx: { ui: { notify(message: string, type?: "info" | "warning" | "error"): void } },
	reason: string,
): void {
	ctx.ui.notify(`[impression] Skipped: ${reason}`, "warning");
}
