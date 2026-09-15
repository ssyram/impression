import { describe, expect, it } from "vitest";
import { DEFAULT_ERROR_MIN_LENGTH } from "./types.js";
import { getToolResultDistillationSkipReason } from "./get-tool-result-distillation-skip-reason.js";

const defaults = { minLength: 2048, errorMinLength: DEFAULT_ERROR_MIN_LENGTH };

describe("getToolResultDistillationSkipReason", () => {
	it("skips an error below the default threshold", () => {
		expect(getToolResultDistillationSkipReason(true, 40959, defaults)).toBe(
			"tool result is an error with length 40959, below error threshold 40960",
		);
	});

	it("distills an error at the default threshold", () => {
		expect(getToolResultDistillationSkipReason(true, 40960, defaults)).toBeUndefined();
	});

	it("disables error distillation at -1", () => {
		expect(getToolResultDistillationSkipReason(true, 100000, { ...defaults, errorMinLength: -1 })).toBe(
			"tool result is an error and error distillation is disabled",
		);
	});

	it("distills every error at zero", () => {
		expect(getToolResultDistillationSkipReason(true, 0, { ...defaults, errorMinLength: 0 })).toBeUndefined();
	});

	it("does not apply the normal threshold to errors", () => {
		expect(getToolResultDistillationSkipReason(true, 1, { minLength: 100, errorMinLength: 1 })).toBeUndefined();
	});

	it("keeps the normal threshold for non-error results", () => {
		expect(getToolResultDistillationSkipReason(false, 2047, defaults)).toBe(
			"content length 2047 is below threshold of 2048",
		);
		expect(getToolResultDistillationSkipReason(false, 2048, defaults)).toBeUndefined();
	});
});
