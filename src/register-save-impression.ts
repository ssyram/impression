import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Type } from "typebox";
import type { ImpressionSessionState } from "./impression-session-state.js";

const SaveImpressionParams = Type.Object({ id: Type.String({ description: "Impression ID to save." }) });

export function registerSaveImpressionTool(state: ImpressionSessionState): void {
	state.pi.registerTool({
		name: "save_impression",
		label: "Save Impression",
		description: "Save the original content of an impression to .pi/impression-cache/<id>.txt for inspection with read/bash/python. Useful for long non-file content (e.g., command output) or file content that may have changed or been deleted since.",
		parameters: SaveImpressionParams,
		async execute(_toolCallId, args, _signal, _onUpdate, ctx) {
			const impression = state.impressions.get(args.id);
			if (!impression) throw new Error(`Impression not found: ${args.id}`);
			if (impression.delivered) {
				throw new Error(`Impression ${args.id}'s full content was already delivered to the LLM and discarded from internal state. Save unavailable; the content is in your context — write it via the standard write tool instead.`);
			}
			if (impression.toolName === "read" && impression.toolInput) {
				const candidate = impression.toolInput.file_path ?? impression.toolInput.path;
				const originalPath = typeof candidate === "string" ? candidate : undefined;
				if (originalPath && existsSync(originalPath)) {
					try {
						const currentContent = readFileSync(originalPath, "utf-8");
						if (currentContent === impression.fullText || impression.fullText.startsWith(currentContent) || currentContent.includes(impression.fullText)) {
							ctx.ui.notify(`[impression] Warning: file ${originalPath} still exists and appears unmodified. Consider reading it directly instead.`, "warning");
						}
					} catch {
						// file unreadable, proceed with save
					}
				}
			}
			const cacheDir = join(process.cwd(), ".pi", "impression-cache");
			const outPath = join(cacheDir, `${impression.id}.txt`);
			mkdirSync(cacheDir, { recursive: true });
			writeFileSync(outPath, impression.fullText, "utf-8");
			return { content: [{ type: "text", text: `Saved ${impression.fullText.length} chars to ${outPath}. Use read/bash to inspect.` }], details: undefined };
		},
	});
}
