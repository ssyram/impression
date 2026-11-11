import type { Api, AssistantMessage, Context, Model, ModelsSimpleStreamOptions, StreamOptions } from "@earendil-works/pi-ai";
import { streamSimple as streamOpenAICodexResponses } from "@earendil-works/pi-ai/api/openai-codex-responses";
import { streamSimple as streamOpenAICompletions } from "@earendil-works/pi-ai/api/openai-completions";
import { normalizeContext } from "@earendil-works/pi-ai/utils/transcript";

export function streamSimple(model: Model<Api>, context: Context, options: ModelsSimpleStreamOptions = {}) {
	if (model.api === "openai-completions") {
		return streamOpenAICompletions(model as Model<"openai-completions">, normalizeContext(context), options);
	}
	if (model.api === "openai-codex-responses") {
		return streamOpenAICodexResponses(model as Model<"openai-codex-responses">, normalizeContext(context), options);
	}
	throw new Error(`eval runtime does not support ${model.api}`);
}

export async function complete(
	model: Model<Api>,
	context: Context,
	options: StreamOptions = {},
): Promise<AssistantMessage> {
	return streamSimple(model, context, options).result();
}
