interface ToolResultDistillationThresholds {
	minLength: number;
	errorMinLength: number;
}

export function getToolResultDistillationSkipReason(
	isError: boolean,
	contentLength: number,
	thresholds: ToolResultDistillationThresholds,
): string | undefined {
	if (isError) {
		if (thresholds.errorMinLength === -1) {
			return "tool result is an error and error distillation is disabled";
		}
		if (contentLength < thresholds.errorMinLength) {
			return `tool result is an error with length ${contentLength}, below error threshold ${thresholds.errorMinLength}`;
		}
		return undefined;
	}
	if (contentLength < thresholds.minLength) {
		return `content length ${contentLength} is below threshold of ${thresholds.minLength}`;
	}
	return undefined;
}
