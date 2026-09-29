import type { Api, AssistantMessage, Context, Model, ModelsSimpleStreamOptions, ThinkingLevel } from "@earendil-works/pi-ai";
import type { ModelRegistry } from "@earendil-works/pi-coding-agent";

export async function requestFixedDistillation(
	registry: Pick<ModelRegistry, "streamSimple">,
	model: Model<Api>,
	context: Context,
	options: ModelsSimpleStreamOptions,
	effort?: ThinkingLevel,
): Promise<AssistantMessage> {
	return registry.streamSimple(model, context, effort ? { ...options, reasoning: effort } : options).result();
}
