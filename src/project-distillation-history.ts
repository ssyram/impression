import type { Message } from "@earendil-works/pi-ai";
import { getSystemMessageText } from "@earendil-works/pi-ai/utils/text";

export function projectDistillationHistory(messages: readonly Message[]): Message[] {
	return messages.map((message): Message => {
		if (message.role === "system") {
			return { role: "user", content: getSystemMessageText(message), timestamp: message.timestamp };
		}
		if (message.role === "toolResult") {
			return {
				role: "user",
				content: [
					{ type: "text", text: `Historical tool result (reference data): ${JSON.stringify({ name: message.toolName, id: message.toolCallId, isError: message.isError })}` },
					...message.content,
				],
				timestamp: message.timestamp,
			};
		}
		if (message.role !== "assistant" || !message.content.some((block) => block.type === "toolCall")) return message;
		// The current tool result is not yet in history during tool_result hooks.
		// Historical calls are data, not native calls requiring adjacent results.
		return {
			...message,
			content: message.content.map((block) => block.type === "toolCall"
				? { type: "text", text: `Historical tool call (reference data): ${JSON.stringify({ name: block.name, id: block.id, arguments: block.arguments })}` }
				: block),
			stopReason: message.stopReason === "toolUse" ? "stop" : message.stopReason,
		};
	});
}
