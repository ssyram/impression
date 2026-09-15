import type { Message } from "@earendil-works/pi-ai";
import { snapshotResponseContent } from "./snapshot-response-content.js";

export function serializeDistillationHistory(messages: readonly Message[]): string {
	return messages
		.map((message) => JSON.stringify(message.role === "assistant"
			? { ...message, content: snapshotResponseContent(message.content) }
			: message))
		.join("\n");
}
