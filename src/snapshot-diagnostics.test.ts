import { describe, expect, it } from "vitest";
import { snapshotDiagnostics } from "./snapshot-diagnostics.js";

describe("snapshotDiagnostics", () => {
	it("keeps scalar diagnostics while removing opaque signature fields", () => {
		expect(snapshotDiagnostics([{
			type: "request",
			timestamp: 1,
			details: {
				transport: "websocket",
				thinkingSignature: "opaque-thinking",
				encrypted_content: "opaque-encrypted",
			},
		}])).toEqual([{
			type: "request",
			timestamp: 1,
			details: { transport: "websocket" },
		}]);
	});
});
