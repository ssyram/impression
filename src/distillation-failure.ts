import type { AssistantMessage } from "@earendil-works/pi-ai";

export interface DistillationContextSnapshot {
	model: {
		api: string;
		provider: string;
		id: string;
	};
	maxTokens: number;
	systemPrompt: string;
	userPrompt: string;
}

export interface DistillationDiagnostic {
	type: string;
	timestamp: number;
	error?: {
		name?: string;
		message: string;
		code?: string | number;
	};
	details?: Record<string, string | number | boolean | null>;
}

export type DistillationFailure =
	| {
		kind: "response";
		context: DistillationContextSnapshot;
		response: {
			content: AssistantMessage["content"];
			diagnostics?: DistillationDiagnostic[];
			errorMessage?: string;
			responseId?: string;
			stopReason: AssistantMessage["stopReason"];
			usage: AssistantMessage["usage"];
		};
	}
	| {
		kind: "exception";
		context: DistillationContextSnapshot;
		exception: {
			name: string;
			message: string;
		};
	};
