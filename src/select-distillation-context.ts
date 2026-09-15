import type { Context } from "@earendil-works/pi-ai";
import {
	buildStructuredDistillationContext,
	type StructuredDistillationInput,
} from "./build-structured-distillation-context.js";

export interface DistillationContextSelection {
	context: Context;
	mode: "structured";
	userPrompt: string;
}

export function selectDistillationContext(
	systemPrompt: string,
	structuredInput: StructuredDistillationInput,
): DistillationContextSelection {
	return {
		context: buildStructuredDistillationContext(systemPrompt, structuredInput),
		mode: "structured",
		userPrompt: structuredInput.taskPrompt,
	};
}
