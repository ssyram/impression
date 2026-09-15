import type { AssistantMessage } from "@earendil-works/pi-ai";

export function snapshotResponseContent(content: AssistantMessage["content"]): AssistantMessage["content"] {
	return content.map((block) => {
		if (block.type === "thinking") {
			const { thinkingSignature: _thinkingSignature, ...snapshot } = block;
			return snapshot;
		}
		if (block.type === "text") {
			const { textSignature: _textSignature, ...snapshot } = block;
			return snapshot;
		}
		return block;
	});
}
