import type { Api, AssistantMessage, ImageContent, Message, Model, TextContent } from "@earendil-works/pi-ai";
import { complete } from "@earendil-works/pi-ai/compat";
import type { DistillationContextSnapshot, DistillationFailure } from "./distillation-failure.js";
import { forceEmptyTools } from "./force-empty-tools.js";
import { prepareSourceReferences } from "./prepare-source-references.js";
import { getDistillerSystemPrompt, getDistillerUserTemplate, renderTemplate } from "./prompt-loader.js";
import { selectDistillationContext } from "./select-distillation-context.js";
import { serializeContent } from "./serialize.js";
import { snapshotDiagnostics } from "./snapshot-diagnostics.js";
import { snapshotResponseContent } from "./snapshot-response-content.js";
import { expandDraft } from "./source-indexing/index.js";
import { appendSourceReferenceInstructions } from "./source-reference-prompts.js";
import type { PassthroughReason, PromptVariant } from "./types.js";
import { DISTILLER_SENTINEL } from "./types.js";

export interface DistillationRequest {
	toolName: string;
	content: (TextContent | ImageContent)[];
	visibleHistory: readonly Message[];
	originalSystemPrompt: string;
}

interface DistillationResult {
	passthrough: boolean;
	note: string;
	thinking?: string;
	passthroughReason?: PassthroughReason;
	failure?: DistillationFailure;
}

function resolveVariant(_model: Model<Api>, debugDistillMode?: PromptVariant): PromptVariant {
	return debugDistillMode ?? "third-person";
}

export async function distillWithSameModel(
	model: Model<Api>,
	debugDistillMode: PromptVariant | undefined,
	auth: { apiKey?: string; headers?: Record<string, string> },
	request: DistillationRequest,
	maxTokens: number,
	signal?: AbortSignal,
	onPromptVersion?: (version: string) => void,
	onProviderPayload?: (payload: unknown) => void,
): Promise<DistillationResult> {
	const variant = resolveVariant(model, debugDistillMode);
	onPromptVersion?.(variant);
	const contentText = serializeContent(request.content);
	const preparedReferences = prepareSourceReferences(request.content);
	const lengthNote =
		contentText.length > maxTokens * 10
			? " (considered very long, more aggressive compression expected)"
			: contentText.length < maxTokens * 4
				? " (considered relatively short)"
				: "";
	const systemPrompt = renderTemplate(getDistillerSystemPrompt(variant), { sentinel: DISTILLER_SENTINEL });
	const baseTaskPrompt = renderTemplate(getDistillerUserTemplate(variant), {
		toolName: request.toolName,
		contentLength: String(contentText.length),
		lengthNote,
	});
	const taskPrompt = appendSourceReferenceInstructions(baseTaskPrompt, preparedReferences.active);

	const selection = selectDistillationContext(systemPrompt, {
		originalSystemPrompt: request.originalSystemPrompt,
		visibleHistory: request.visibleHistory,
		toolName: request.toolName,
		content: [...preparedReferences.content],
		taskPrompt,
	});
	const context: DistillationContextSnapshot = {
		model: { api: model.api, provider: model.provider, id: model.id },
		maxTokens,
		systemPrompt,
		userPrompt: selection.userPrompt,
		mode: selection.mode,
	};

	let response: AssistantMessage;
	try {
		response = await complete(model, selection.context, {
			apiKey: auth.apiKey,
			headers: auth.headers,
			maxTokens,
			signal,
			onPayload: (payload) => forceEmptyTools(payload, onProviderPayload),
		});
	} catch (error) {
		const exception =
			error instanceof Error
				? { name: error.name, message: error.message }
				: { name: "NonErrorThrown", message: String(error) };
		return {
			passthrough: true,
			note: DISTILLER_SENTINEL,
			passthroughReason: "error",
			failure: { kind: "exception", context, exception },
		};
	}

	if (response.stopReason !== "stop" && response.stopReason !== "length") {
		return {
			passthrough: true,
			note: DISTILLER_SENTINEL,
			passthroughReason: "error",
			failure: {
				kind: "response",
				context,
				response: {
					content: snapshotResponseContent(response.content),
					diagnostics: snapshotDiagnostics(response.diagnostics),
					errorMessage: response.errorMessage,
					responseId: response.responseId,
					stopReason: response.stopReason,
					usage: response.usage,
				},
			},
		};
	}
	if (response.stopReason === "length") {
		return {
			passthrough: true,
			note: `[DISTILLATION TRUNCATED — output hit max_tokens=${maxTokens}; falling back to passthrough]`,
			passthroughReason: "truncated",
		};
	}

	const text = response.content
		.filter((block): block is TextContent => block.type === "text")
		.map((block) => block.text)
		.join("\n")
		.trim();
	const thinkingBlocks: string[] = [];
	const strippedText = text
		.replace(/<thinking>([\s\S]*?)<\/thinking>/g, (_match, thinkingContent) => {
			thinkingBlocks.push(thinkingContent.trim());
			return "";
		})
		.replace(/<think>([\s\S]*?)<\/think>/g, (_match, thinkingContent) => {
			thinkingBlocks.push(thinkingContent.trim());
			return "";
		})
		.trim();
	const thinking = thinkingBlocks.length > 0 ? thinkingBlocks.join("\n") : undefined;
	if (!strippedText) return { passthrough: true, note: DISTILLER_SENTINEL, thinking, passthroughReason: "empty" };
	const sentinelLike = strippedText
		.replace(/^["'`]+|["'`]+$/g, "")
		.replace(/[.!。]+$/g, "")
		.trim();
	if (sentinelLike === DISTILLER_SENTINEL) {
		return { passthrough: true, note: strippedText, thinking, passthroughReason: "sentinel" };
	}
	const finalNote = preparedReferences.active ? expandDraft(preparedReferences.index, strippedText) : strippedText;
	if (finalNote === "") return { passthrough: true, note: DISTILLER_SENTINEL, thinking, passthroughReason: "empty" };
	if (finalNote.length >= contentText.length) {
		return {
			passthrough: true,
			note: `[FAILING DISTILLATION: ${finalNote.length} >= ${contentText.length}]${finalNote}`,
			thinking,
			passthroughReason: "failing",
		};
	}
	return { passthrough: false, note: finalNote, thinking };
}
