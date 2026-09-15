import { describe, expect, it } from "vitest";
import { resolveConfig } from "./config.js";
import { DEFAULT_ERROR_MIN_LENGTH } from "./types.js";

describe("resolveConfig errorMinLength", () => {
	it("uses the independent default", () => {
		expect(resolveConfig({}).errorMinLength).toBe(DEFAULT_ERROR_MIN_LENGTH);
	});

	it.each([-1, 0, 8192])("preserves an explicit value of %s", (errorMinLength) => {
		expect(resolveConfig({ errorMinLength }).errorMinLength).toBe(errorMinLength);
	});
});
