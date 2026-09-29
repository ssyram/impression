import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { getPassthroughHardLimit } from "./impression-status.js";
import { type ImpressionSessionState, persistPassthroughRemaining } from "./impression-session-state.js";

const PASSTHROUGH_OVERAGE_FACTOR = 1.5;

const SkipImpressionParams = Type.Object({
	count: Type.Optional(Type.Number({ description: "Number of tool results to pass through unchanged (default 1). Capped by config. Set to 0 to cancel passthrough." })),
	justification: Type.Optional(Type.String({ description: "Why you need exact content including whitespace, indentation, and naming. Required when count > 0." })),
	estimatedChars: Type.Optional(Type.Number({ description: "Estimated characters to read. Hard limit enforced at runtime. Required when count > 0." })),
});

export function registerSkipImpressionTool(state: ImpressionSessionState): void {
	state.pi.registerTool({
		name: "skip_impression",
		label: "Skip Impression",
		description:
			"Skip distillation for the next N tool results (max " + state.cfg.maxPassthroughCount + "). Each call overwrites previous skip state. count=0 cancels passthrough. When count > 0: requires `justification` and `estimatedChars` (hard limit: " + getPassthroughHardLimit(state.cfg) + "). Actual content exceeding limit or " + PASSTHROUGH_OVERAGE_FACTOR + "x estimate is rejected.",
		promptSnippet: "skip_impression: Skip distillation for next N results (max " + state.cfg.maxPassthroughCount + "). Each call overwrites previous state. count=0 cancels. When count > 0: { count, justification, estimatedChars } all required. justification: why exact whitespace matters. estimatedChars hard limit: " + getPassthroughHardLimit(state.cfg) + ". Actual content over limit or " + PASSTHROUGH_OVERAGE_FACTOR + "x estimate is rejected and stored — use save_impression to inspect. NEVER to \"understand\" or \"analyze\" code.",
		parameters: SkipImpressionParams,
		renderCall(args, theme) {
			const title = theme.fg("toolTitle", theme.bold("Skip Impression"));
			const count = args.count ?? 1;
			if (count === 0) return new Text(`${title} ${theme.fg("warning", "cancel")}`, 0, 0);
			const justification = args.justification
				? theme.fg("muted", ` "${args.justification.length > 80 ? args.justification.slice(0, 77) + "..." : args.justification}"`)
				: "";
			const estimate = args.estimatedChars != null ? theme.fg("accent", ` ~${args.estimatedChars} chars`) : "";
			return new Text(`${title} count=${count}${estimate}${justification}`, 0, 0);
		},
		async execute(_toolCallId, args) {
			const requested = args.count ?? 1;
			if (requested === 0) {
				state.passthroughRemaining = 0;
				state.lastEstimatedChars = 0;
				persistPassthroughRemaining(state);
				return { content: [{ type: "text", text: "Passthrough cancelled." }], details: undefined };
			}
			if (!args.justification) {
				return { content: [{ type: "text", text: "Rejected: justification is required when count > 0." }], details: undefined };
			}
			if (args.estimatedChars == null) {
				return { content: [{ type: "text", text: "Rejected: estimatedChars is required when count > 0." }], details: undefined };
			}
			if (!Number.isFinite(args.estimatedChars) || args.estimatedChars <= 0) {
				return { content: [{ type: "text", text: `Rejected: estimatedChars must be a positive finite number. Got ${args.estimatedChars}.` }], details: undefined };
			}
			const maxChars = getPassthroughHardLimit(state.cfg);
			if (args.estimatedChars > maxChars) {
				return { content: [{ type: "text", text: `Rejected: estimatedChars ${args.estimatedChars} exceeds hard limit of ${maxChars}. Options: (1) skip_impression again with a smaller range and estimatedChars, (2) do not skip and rely on distilled notes.` }], details: undefined };
			}
			state.passthroughRemaining = Math.min(requested, state.cfg.maxPassthroughCount);
			state.lastEstimatedChars = args.estimatedChars;
			persistPassthroughRemaining(state);
			return { content: [{ type: "text", text: `Skipping distillation for next ${state.passthroughRemaining} tool result(s).` }], details: undefined };
		},
	});
}
