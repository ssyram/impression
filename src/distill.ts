import { type Api, complete, type ImageContent, type Model, type TextContent } from "@mariozechner/pi-ai";
import { DISTILLER_SENTINEL } from "./types.js";
import { serializeContent } from "./serialize.js";
import { getDistillerSystemPrompt, getDistillerUserTemplate, renderTemplate } from "./prompt-loader.js";

export async function distillWithSameModel(
	model: Model<Api>,
	auth: { apiKey?: string; headers?: Record<string, string> },
	toolName: string,
	content: (TextContent | ImageContent)[],
	visibleHistory: string,
	originalSystemPrompt: string,
	maxTokens: number,
	signal?: AbortSignal,
	onPromptVersion?: (version: string) => void,
): Promise<{ passthrough: boolean; note: string; thinking?: string }> {
	const promptVersion = "default";
	if (onPromptVersion) onPromptVersion(promptVersion);

	const contentText = serializeContent(content);

	const lengthNote =
		contentText.length > maxTokens * 10
			? " (considered very long, more aggressive compression expected)"
			: contentText.length < maxTokens * 4
				? " (considered relatively short)"
				: "";

	const systemPrompt = renderTemplate(getDistillerSystemPrompt(), {
		contentLength: String(contentText.length),
		lengthNote,
		sentinel: DISTILLER_SENTINEL,
	});

	const userPrompt = renderTemplate(getDistillerUserTemplate(), {
		originalSystemPrompt: originalSystemPrompt || "[none]",
		visibleHistory: visibleHistory || "[none]",
		toolName,
		toolResult: contentText || "[empty]",
	});

	const response = await complete(
		model,
		{
			systemPrompt,
			messages: [
				{
					role: "user",
					content: [{ type: "text", text: userPrompt }],
					timestamp: Date.now(),
				},
			],
		},
		{ apiKey: auth.apiKey, headers: auth.headers, maxTokens, signal },
	);

	const text = response.content
		.filter((block): block is TextContent => block.type === "text")
		.map((block) => block.text)
		.join("\n")
		.trim();

	// Extract and strip <thinking> and <think> blocks
	const thinkingBlocks: string[] = [];
	const strippedText = text
		.replace(/<thinking>([\s\S]*?)<\/thinking>/g, (_match, content) => {
			thinkingBlocks.push(content.trim());
			return "";
		})
		.replace(/<think>([\s\S]*?)<\/think>/g, (_match, content) => {
			thinkingBlocks.push(content.trim());
			return "";
		})
		.trim();
	const thinking = thinkingBlocks.length > 0 ? thinkingBlocks.join("\n") : undefined;

	const normalized = strippedText.trim();
	if (!normalized) {
		return {
			passthrough: true,
			note: DISTILLER_SENTINEL,
			thinking,
		};
	}

	const sentinelLike = normalized
		.replace(/^["'`]+|["'`]+$/g, "")
		.replace(/[.!。]+$/g, "")
		.trim();

	if (sentinelLike === DISTILLER_SENTINEL) {
		return {
			passthrough: true,
			note: strippedText,
			thinking,
		};
	}
	if (strippedText.length >= contentText.length) {
		return {
			passthrough: true,
			note: "[FAILING DISTILLATION: " + strippedText.length + " >= " + contentText.length + "]" + strippedText,
			thinking,
		};
	}
	return {
		passthrough: false,
		note: strippedText,
		thinking,
	};
}
