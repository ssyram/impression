import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { formatPassthroughReason } from "./format-passthrough-reason.js";

describe("formatPassthroughReason", () => {
	it("describes deliberate LLM passthrough with the canned label", () => {
		assert.equal(formatPassthroughReason("sentinel"), "sentinel (LLM deliberately chose passthrough)");
	});

	it("describes degenerate fallback reasons", () => {
		assert.equal(formatPassthroughReason("truncated"), "truncated (distillation output hit the token limit)");
		assert.equal(formatPassthroughReason("failing"), "failing (distillation output was not shorter)");
		assert.equal(formatPassthroughReason("empty"), "empty (distiller returned no usable text)");
		assert.equal(formatPassthroughReason("error"), "error (distiller terminated abnormally)");
	});

	it("handles missing reasons", () => {
		assert.equal(formatPassthroughReason(undefined), "unknown reason");
	});

	it("returns the free-form reason text when provided", () => {
		assert.equal(formatPassthroughReason("sentinel", "A\n\nB"), "A\n\nB");
	});

	it("falls back to the canned label when the reason text is empty", () => {
		assert.equal(formatPassthroughReason("sentinel", ""), "sentinel (LLM deliberately chose passthrough)");
		assert.equal(formatPassthroughReason("sentinel", undefined), "sentinel (LLM deliberately chose passthrough)");
	});
});
