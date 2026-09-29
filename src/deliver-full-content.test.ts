import { describe, expect, it } from "vitest";
import { deliverFullContent } from "./impression-session-state.js";
import { IMPRESSION_ENTRY_TYPE, type ImpressionEntry } from "./types.js";

function createImpression(): ImpressionEntry {
	return {
		id: "record-id",
		toolName: "read",
		toolCallId: "tool-id",
		fullContent: [{ type: "text", text: "original" }],
		fullText: "original",
		recallCount: 0,
		createdAt: 1,
	};
}

describe("deliverFullContent", () => {
	it("keeps the original in plugin memory when appendEntry fails", () => {
		const impression = createImpression();
		const state = {
			impressions: new Map([[impression.id, impression]]),
			pi: { appendEntry() { throw new Error("disk full"); } },
		};
		expect(() => deliverFullContent(state, impression)).toThrow("disk full");
		expect(state.impressions.get(impression.id)).toBe(impression);
		expect(impression.fullContent).toEqual([{ type: "text", text: "original" }]);
		expect(impression.fullText).toBe("original");
		expect(impression.delivered).toBeUndefined();
	});

	it("writes an independent delivered snapshot before replacing the map entry", () => {
		const impression = createImpression();
		const writes: Array<{ type: string; data: unknown }> = [];
		const state = {
			impressions: new Map([[impression.id, impression]]),
			pi: { appendEntry(type: string, data?: unknown) { writes.push({ type, data }); } },
		};
		const originalContent = impression.fullContent;
		const result = deliverFullContent(state, impression);
		expect(result.content).toBe(originalContent);
		expect(result.content).toEqual([{ type: "text", text: "original" }]);
		expect(writes).toEqual([{
			type: IMPRESSION_ENTRY_TYPE,
			data: { ...impression, fullContent: [], fullText: "", delivered: true },
		}]);
		expect(state.impressions.get(impression.id)).toBe(writes[0]?.data);
		expect(impression.fullContent).toEqual([]);
		expect(impression.fullText).toBe("");
		expect(impression.delivered).toBe(true);
	});
});
