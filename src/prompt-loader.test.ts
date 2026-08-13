import { describe, expect, it } from "vitest";
import { renderTemplate } from "./prompt-loader.js";

describe("renderTemplate", () => {
	it("inserts replacement tokens literally", () => {
		expect(renderTemplate("before {{value}} after", { value: "$& $` $' $$" })).toBe("before $& $` $' $$ after");
	});

	it("does not expand placeholders inside inserted values", () => {
		expect(renderTemplate("{{history}} {{toolResult}}", {
			history: "literal {{toolResult}}",
			toolResult: "expanded",
		})).toBe("literal {{toolResult}} expanded");
	});
});
