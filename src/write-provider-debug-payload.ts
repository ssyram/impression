import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function writeProviderDebugPayload(
	cwd: string,
	sessionId: string,
	source: "main" | "distillation",
	payload: unknown,
	metadata: Record<string, unknown>,
): string {
	const dir = join(cwd, ".pi", "impression-debug", sessionId);
	mkdirSync(dir, { recursive: true });
	const timestamp = new Date().toISOString();
	const basePath = join(dir, `${timestamp.replaceAll(":", "-")}-${source}`);
	const requestPath = `${basePath}.request.json`;
	const metadataPath = `${basePath}.meta.json`;
	const requestBody = JSON.stringify(payload);
	writeFileSync(requestPath, requestBody, "utf-8");
	writeFileSync(
		metadataPath,
		JSON.stringify({ timestamp, source, requestPath, requestBytes: new TextEncoder().encode(requestBody).byteLength, metadata }, null, "\t") + "\n",
		"utf-8",
	);
	return requestPath;
}
