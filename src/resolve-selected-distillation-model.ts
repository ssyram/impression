import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { selectDistillationModel } from "./select-distillation-model.js";

type SelectionContext = Pick<ExtensionContext, "model"> & {
	modelRegistry: Pick<ExtensionContext["modelRegistry"], "getAll" | "getProvider">;
};

export function resolveSelectedDistillationModel(ctx: SelectionContext, spec: string) {
	return selectDistillationModel(
		spec,
		ctx.model,
		spec === "_SELF" ? [] : ctx.modelRegistry.getAll(),
		(provider) => ctx.modelRegistry.getProvider(provider) !== undefined,
	);
}

export function warnUnresolvedDistillationModel(ctx: ExtensionContext, spec: string): void {
	if (spec === "_SELF") return;
	const result = resolveSelectedDistillationModel(ctx, spec);
	if (!result.ok) ctx.ui.notify(`[impression] DistillModel: ${result.reason}`, "warning");
}
