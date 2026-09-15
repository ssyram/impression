function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function forceEmptyTools(payload: unknown, onPayload?: (payload: unknown) => void): unknown {
	const replacement = isRecord(payload) ? { ...payload, tools: [] } : payload;
	onPayload?.(replacement);
	return replacement;
}
