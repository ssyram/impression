import assert from "node:assert/strict";
import { describe, it } from "../../../packages/coding-agent/node_modules/vitest/dist/index.js";
import { formatPassthroughReason } from "./format-passthrough-reason.js";

describe("formatPassthroughReason", () => {
	it("describes deliberate LLM passthrough without quoting model output", () => {
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
});
