import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { buildSessionContext } from "@earendil-works/pi-coding-agent";
import { writeProviderDebugPayload } from "./write-provider-debug-payload.js";

export function captureProviderPayload(
	ctx: ExtensionContext,
	source: "main" | "distillation",
	payload: unknown,
	metadata: Record<string, unknown> = {},
): void {
	try {
		const entries = ctx.sessionManager.getEntries();
		const leafId = ctx.sessionManager.getLeafId();
		const branch = ctx.sessionManager.getBranch();
		const contextMessages = buildSessionContext(entries, leafId).messages;
		const path = writeProviderDebugPayload(ctx.sessionManager.getCwd(), ctx.sessionManager.getSessionId(), source, payload, {
			leafId,
			allEntryCount: entries.length,
			branchEntryCount: branch.length,
			branchEntries: branch.map((entry) => ({ id: entry.id, parentId: entry.parentId, type: entry.type })),
			contextMessageCount: contextMessages.length,
			...metadata,
		});
		ctx.ui.notify(`[impression:debug] Saved ${source} provider payload to ${path}`, "info");
	} catch (error) {
		ctx.ui.notify(`[impression:debug] Failed to save ${source} provider payload: ${error instanceof Error ? error.message : String(error)}`, "warning");
	}
}
