import { describe, expect, it } from "vitest";
import { snapshotResponseContent } from "./snapshot-response-content.js";

describe("snapshotResponseContent", () => {
	it("removes opaque text and thinking signatures from failure snapshots", () => {
		expect(snapshotResponseContent([
			{ type: "thinking", thinking: "summary", thinkingSignature: "opaque-thinking" },
			{ type: "text", text: "answer", textSignature: "opaque-text" },
		])).toEqual([
			{ type: "thinking", thinking: "summary" },
			{ type: "text", text: "answer" },
		]);
	});
});
