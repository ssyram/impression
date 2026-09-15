import { describe, expect, it, vi } from "vitest";
import { forceEmptyTools } from "./force-empty-tools.js";

describe("forceEmptyTools", () => {
	it("returns and reports the same replacement payload with explicit empty tools", () => {
		const onPayload = vi.fn();
		const replacement = forceEmptyTools({ input: "request", tools: [{ type: "function" }] }, onPayload);
		expect(replacement).toEqual({ input: "request", tools: [] });
		expect(onPayload).toHaveBeenCalledWith(replacement);
		expect(onPayload.mock.calls[0]?.[0]).toBe(replacement);
	});
});
