import type { Api, Message, Model } from "@earendil-works/pi-ai";
import type { DistillationRequest } from "../src/distill.js";
import type { EvalFixture } from "./distillation-eval-types.js";

export function buildEvalDistillationRequest(
	fixture: EvalFixture,
	_model: Model<Api>,
): DistillationRequest {
	if (fixture.visibleHistoryMessages) {
		return {
			toolName: fixture.toolName,
			content: [{ type: "text", text: fixture.toolResult }],
			visibleHistory: fixture.visibleHistoryMessages,
			originalSystemPrompt: fixture.originalSystemPrompt,
		};
	}

	const visibleHistory: Message[] = [
		{ role: "user", content: fixture.visibleHistory ?? "[none]", timestamp: 1 },
	];
	return {
		toolName: fixture.toolName,
		content: [{ type: "text", text: fixture.toolResult }],
		visibleHistory,
		originalSystemPrompt: fixture.originalSystemPrompt,
	};
}
