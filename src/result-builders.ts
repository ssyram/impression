import type { ImageContent, TextContent } from "@earendil-works/pi-ai";
import { getImpressionTextTemplate } from "./prompt-loader.js";
import { formatSourceReferenceNote } from "./source-reference-pipeline.js";
import type { ImpressionDetails } from "./types.js";

export function buildImpressionText(id: string, note: string): string {
	return formatSourceReferenceNote(getImpressionTextTemplate(), { id, note });
}

export function createRecallToolResult(
	id: string,
	note: string,
	details?: ImpressionDetails,
): { content: TextContent[]; details: ImpressionDetails } {
	return {
		content: [{ type: "text", text: buildImpressionText(id, note) }],
		details: details ?? {},
	};
}

export function createPassthroughToolResult(
	content: (TextContent | ImageContent)[],
	details?: ImpressionDetails,
): { content: (TextContent | ImageContent)[]; details: ImpressionDetails } {
	return { content, details: details ?? {} };
}

export function notifyImpressionSkip(
	ctx: { ui: { notify(message: string, type?: "info" | "warning" | "error"): void } },
	reason: string,
): void {
	ctx.ui.notify(`[impression] Skipped: ${reason}`, "warning");
}
