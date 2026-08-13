import type { PassthroughReason } from "./types.js";

const PASSTHROUGH_REASON_DESCRIPTIONS = {
	sentinel: "LLM deliberately chose passthrough",
	truncated: "distillation output hit the token limit",
	failing: "distillation output was not shorter",
	empty: "distiller returned no usable text",
	error: "distiller terminated abnormally",
} satisfies Record<PassthroughReason, string>;

export function formatPassthroughReason(reason: PassthroughReason | undefined): string {
	return reason ? `${reason} (${PASSTHROUGH_REASON_DESCRIPTIONS[reason]})` : "unknown reason";
}
