import { getSupportedThinkingLevels, type Api, type Model, type ThinkingLevel } from "@earendil-works/pi-ai";
import { fuzzyFilter } from "@earendil-works/pi-tui";

export type DistillationModelSelection =
	| { ok: true; kind: "self" | "fixed"; model: Model<Api>; effort?: ThinkingLevel }
	| { ok: false; reason: string };

export function selectDistillationModel(
	spec: string,
	currentModel: Model<Api> | undefined,
	catalog: readonly Model<Api>[],
	hasProvider: (provider: string) => boolean,
): DistillationModelSelection {
	if (spec === "_SELF") {
		return currentModel
			? { ok: true, kind: "self", model: currentModel }
			: { ok: false, reason: "no active model selected" };
	}

	const slash = spec.indexOf("/");
	const prefix = slash > 0 ? spec.slice(0, slash) : "";
	const provider = prefix
		? (catalog.find((model) => model.provider.toLowerCase() === prefix.toLowerCase())?.provider ??
			(hasProvider(prefix) ? prefix : undefined))
		: undefined;
	const pool = provider
		? catalog.filter((model) => model.provider.toLowerCase() === provider.toLowerCase())
		: [...catalog];
	const query = provider ? spec.slice(slash + 1) : spec;
	const colon = query.lastIndexOf(":");
	const literal = colon >= 0 ? pool.filter((model) => model.id.toLowerCase() === query.toLowerCase()) : [];
	const modelName = literal.length === 0 && colon >= 0 ? query.slice(0, colon) : query;
	const requestedEffort = literal.length === 0 && colon >= 0 ? query.slice(colon + 1) : undefined;
	if (!modelName.trim()) return { ok: false, reason: `no model matches "${spec}"` };

	const matches = literal.length > 0
		? literal
		: fuzzyFilter(pool, modelName, (model) => `${model.id} ${model.name}`);
	const model = provider
		? matches[0]
		: (matches.find((candidate) => candidate.provider === currentModel?.provider) ?? matches[0]);
	if (!model) return { ok: false, reason: `no model matches "${spec}"` };

	const effort = requestedEffort
		? getSupportedThinkingLevels(model).find(
			(level): level is ThinkingLevel => level === requestedEffort && level !== "off",
		)
		: undefined;
	return { ok: true, kind: "fixed", model, effort };
}
