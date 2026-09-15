import type { Message } from "@earendil-works/pi-ai";
import { getLegacyDistillerUserTemplate, renderTemplate } from "./prompt-loader.js";
import { serializeDistillationHistory } from "./serialize-distillation-history.js";
import type { PromptVariant } from "./types.js";

interface LegacyDistillationPromptInput {
	originalSystemPrompt: string;
	visibleHistory: readonly Message[];
	toolName: string;
	toolResult: string;
	contentLength: number;
	lengthNote: string;
}

export function renderLegacyDistillationPrompt(variant: PromptVariant, input: LegacyDistillationPromptInput): string {
	return renderTemplate(getLegacyDistillerUserTemplate(variant), {
		originalSystemPrompt: input.originalSystemPrompt || "[none]",
		visibleHistory: serializeDistillationHistory(input.visibleHistory) || "[none]",
		toolName: input.toolName,
		toolResult: input.toolResult || "[empty]",
		contentLength: String(input.contentLength),
		lengthNote: input.lengthNote,
	});
}
