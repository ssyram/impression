import assert from "node:assert/strict";
import test from "node:test";

import { buildSourceCollection, expandDraft } from "./index.js";
import { DraftExpansionError, parseReference } from "./reference-parser.js";

const collection = () => buildSourceCollection(["  ab  ", "cd", "😀ef", "gh", "ij"]);

const expectError = (draft: string): void => {
	assert.throws(() => parseReference(collection(), draft, 0), DraftExpansionError);
};

const unresolved = (draft: string): string => `(unresolved source reference: ${draft})`;

test("ranges concatenate inclusive raw chunks and apply endpoint operations independently", () => {
	assert.equal(expandDraft(collection(), "@!1~3@"), "  ab  cd😀ef");
	assert.equal(expandDraft(buildSourceCollection(["\ud800", "\udc00@!"]), "@!1~2@"), "\ud800\udc00@!");
	assert.equal(expandDraft(collection(), "@!1.trim()~3[1..]@"), "abcdef");
	assert.equal(expandDraft(collection(), "@!1[2..]~3.trim()@"), "ab  cd😀ef");
	assert.equal(expandDraft(collection(), "@!1~2@@!4.trim()@@!5@"), "  ab  cdghij");
});

test("grouped ranges retain whole-value precedence and trim is Python-strip parity", () => {
	assert.equal(expandDraft(collection(), "@!(1~3).trim()[1..-1]@"), "b  cd😀e");
	assert.equal(expandDraft(collection(), "@!1.trim()@"), expandDraft(collection(), "@!1.strip()@"));
	assert.equal(expandDraft(collection(), "@!3[0..1]@"), "😀");
	assert.equal(expandDraft(collection(), "@!3[:-1]@"), "😀e");
	assert.equal(expandDraft(collection(), "@!3[-2..]@"), "ef");
	assert.equal(expandDraft(collection(), "@!3[:]@"), "😀ef");
	assert.equal(expandDraft(collection(), "@!3[..]@"), "😀ef");
	assert.equal(expandDraft(collection(), "@!3[..-1]@"), "😀e");
	assert.equal(expandDraft(collection(), "@!3[1:]@"), "ef");
});

test("same-ID endpoints and grouped ranges project positions after transformations", () => {
	const source = buildSourceCollection([" ab ", "cd", "ef"]);
	assert.equal(expandDraft(source, "@!1.rstrip()~1[1..].pos()@"), "(1:1~1:2)");
	assert.equal(
		expandDraft(source, "@!(1~2).trim().pos()@"),
		"(source position unavailable: selection spans multiple text blocks)",
	);
	assert.equal(expandDraft(buildSourceCollection(["x".repeat(200)]), "@!(1~2).pos()@"), "(1~1)");
});

test("deterministic range properties cover many blocks and endpoint expectations", () => {
	for (let seed = 1; seed <= 600; seed += 1) {
		const sources = Array.from({ length: 12 + (seed % 9) }, (_, position) => ` ${seed}-${position}😀 `);
		const index = buildSourceCollection(sources);
		const first = 1 + (seed % sources.length);
		const last = first + ((seed * 7) % (sources.length - first + 1));
		const raw = sources.slice(first - 1, last).join("");
		const endpoint = Array.from(sources[first - 1])
			.slice(1, -1)
			.join("");
		assert.equal(expandDraft(index, `@!${first}~${last}@`), raw);
		assert.equal(expandDraft(index, `@!${first}[1..-1]~${last}@`), endpoint + sources.slice(first, last).join(""));
	}
});

test("range parser is strict while expansion recovers invalid candidates", () => {
	for (const draft of [
		"@!2~1@",
		"@!1~999999999999999999999999999999999999999999999999@",
		"@!1~~2@",
		"@!1~@",
		"@!(1~2@",
		"@!(1)@",
		"@!(1~2)~3@",
		"@!1[1.2]@",
		"@!1[1:2..3]@",
		"@!1.unknown()@",
		"@!1.pos().trim()@",
		"@!999.pos()@",
	]) {
		expectError(draft);
		assert.equal(expandDraft(collection(), draft), unresolved(draft));
	}
	assert.equal(expandDraft(collection(), "@!999@@!2@"), `${unresolved("@!999@")}cd`);
	assert.equal(expandDraft(collection(), "@!999"), unresolved("@!999"));
});
