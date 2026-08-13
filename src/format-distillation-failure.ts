import type { DistillationFailure } from "./distillation-failure.js";

export function formatDistillationFailure(failure: DistillationFailure): string {
	if (failure.kind === "exception") {
		return `${failure.exception.name}: ${failure.exception.message}`;
	}
	const reason = `stopReason=${failure.response.stopReason}`;
	return failure.response.errorMessage ? `${reason}: ${failure.response.errorMessage}` : reason;
}
