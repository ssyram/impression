import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { codePointLength } from "./code-points.js";
import { buildSourceCollection, buildSourceIndex, escapeChunkText, expandDraft, renderAnnotated } from "./index.js";
import { DraftExpansionError, parseReference } from "./reference-parser.js";
import { formatSourcePosition } from "./source-provenance.js";

const texts = (source: string): string[] => buildSourceIndex(source).chunks.map((chunk) => chunk.text);

const expectDraftError = (index: ReturnType<typeof buildSourceIndex>, draft: string): void => {
	assert.throws(() => parseReference(index, draft, 0), DraftExpansionError);
};

const unresolved = (draft: string): string => `(unresolved source reference: ${draft})`;

describe("source indexing", () => {
	it("uses inclusive bounds and preserves a final unterminated line", () => {
		assert.deepEqual(texts(`${"a".repeat(79)}\n`), [`${"a".repeat(79)}\n`]);
		assert.deepEqual(texts(`${"a".repeat(159)}\n`), [`${"a".repeat(159)}\n`]);
		assert.deepEqual(texts("x".repeat(70)), ["x".repeat(70)]);
	});

	it("flushes a short chunk before an ordinary line that would overflow it", () => {
		const source = `${"a".repeat(69)}\n${"b".repeat(99)}\n`;
		assert.deepEqual(texts(source), [`${"a".repeat(69)}\n`, `${"b".repeat(99)}\n`]);
	});

	it("recalculates global-ID bounds at 9-to-10 and 99-to-100 transitions", () => {
		const before = (chunkCount: number, source: string) =>
			buildSourceCollection([...Array.from({ length: chunkCount }, () => "x".repeat(80)), source]).chunksByBlock[
				chunkCount
			].map((chunk) => codePointLength(chunk.text));
		assert.deepEqual(before(8, "a".repeat(180)), [160, 20]);
		assert.deepEqual(before(9, "a".repeat(180)), [180]);
		assert.deepEqual(before(98, "b".repeat(220)), [200, 20]);
		assert.deepEqual(before(99, "b".repeat(220)), [220]);
		assert.deepEqual(before(98, "c".repeat(440)), [200, 240]);
	});

	it("returns no chunks for empty source and never splits an oversized blank run", () => {
		assert.deepEqual(buildSourceIndex("").chunks, []);
		const source = "\n".repeat(200);
		assert.deepEqual(texts(source), [source]);
	});

	it("uses the first eligible punctuation or whitespace boundary, then falls back at U", () => {
		const boundary = `${"a".repeat(79)}. ${"b".repeat(100)}`;
		assert.equal(codePointLength(texts(boundary)[0]), 80);
		const fallback = texts("c".repeat(200));
		assert.equal(codePointLength(fallback[0]), 160);
		assert.equal(codePointLength(fallback[1]), 40);
	});

	it("keeps CRLF and astral characters intact while using code-point intervals", () => {
		const crlf = `${"x".repeat(159)}\r\n`;
		const indexed = buildSourceIndex(crlf);
		assert.equal(codePointLength(indexed.chunks[0].text), 159);
		assert.equal(indexed.chunks[1].text, "\r\n");
		const astral = buildSourceIndex(`😀${"z".repeat(79)}`);
		assert.equal(astral.chunks[0].start, 0);
		assert.equal(astral.chunks[0].end, 80);
		assert.equal(expandDraft(astral, "@!1[0:1]@"), "😀");
		assert.equal(expandDraft(astral, "@!1[-1:]@"), "z");
	});

	it("escapes every raw prefix depth and decodes labels adjacent to escaped text", () => {
		for (let depth = 0; depth <= 64; depth += 1) {
			const bars = "|".repeat(depth);
			const source = `left@${bars}!right`;
			const index = buildSourceIndex(source);
			assert.equal(renderAnnotated(index), `@!1@left@${bars}|!right`);
			assert.equal(expandDraft(index, escapeChunkText(source)), source);
		}
		const index = buildSourceIndex("q".repeat(80));
		assert.equal(expandDraft(index, "@|!@!1@"), `@!${"q".repeat(80)}`);
		assert.equal(expandDraft(index, "@|+!"), "@|+!");
	});

	it("projects source positions across line endings, astral columns, slices, and whitespace", () => {
		const index = buildSourceIndex("a😀b\r\ncd\ref\ngh");
		assert.equal(expandDraft(index, "@!1[1:2].pos()@"), "(1:1~1:1)");
		assert.equal(expandDraft(index, "@!1[0:3].pos()@"), "(1~1)");
		assert.equal(expandDraft(index, "@!1[0:4].pos()@"), "(1~1)");
		assert.equal(expandDraft(index, "@!1[4:5].pos()@"), "(1~1)");
		assert.equal(expandDraft(index, "@!1[5:7].pos()@"), "(2~2)");
		assert.equal(expandDraft(index, "@!1[7:8].pos()@"), "(2:2~2)");
		assert.equal(expandDraft(index, "@!1[8:10].pos()@"), "(3~3)");
		assert.equal(expandDraft(index, "@!1[10:11].pos()@"), "(3:2~3)");
		assert.equal(expandDraft(index, "@!1[11:].pos()@"), "(4~4)");
		assert.equal(expandDraft(buildSourceIndex("  abc  "), "@!1.strip().pos()@"), "(1:2~1:4)");
		assert.equal(
			expandDraft(buildSourceIndex("abc"), "@!1[1:1].pos()@"),
			"(source position unavailable: empty selection)",
		);
		assert.equal(
			formatSourcePosition(buildSourceIndex("abcde"), {
				text: "ac",
				spans: [
					{ block: 0, start: 0, end: 1 },
					{ block: 0, start: 2, end: 3 },
				],
			}),
			"(1~1:2)",
		);
	});

	it("keeps strict parser errors internal while public expansion diagnoses candidates", () => {
		const index = buildSourceIndex("q".repeat(80));
		for (const draft of ["@!0@", "@!01@", "@!2@", "@!1[1:2:3]@", "@!1.unknown()@", "@!1[1]@", "@!1"]) {
			expectDraftError(index, draft);
			assert.equal(expandDraft(index, draft), unresolved(draft));
		}
		assert.equal(expandDraft(index, "before @!2@ after @!1[0:2]@"), `before ${unresolved("@!2@")} after qq`);
		assert.equal(expandDraft(index, "@!1[999999999999999999999999:]@"), "");
		assert.equal(expandDraft(index, "@!1[-999999999999999999999999:2]@"), "qq");
	});

	it("evaluates supported method chains left to right and never rescans returned source", () => {
		const source = `\u001c\t${"q".repeat(76)}\u3000\n`;
		const index = buildSourceIndex(source);
		assert.equal(expandDraft(index, "@!1.strip()[1:-1].rstrip()@"), "q".repeat(74));
		assert.equal(expandDraft(index, "@!1@"), source);
		assert.equal(expandDraft(buildSourceIndex(`@!1@${"x".repeat(75)}`), "@!1@"), `@!1@${"x".repeat(75)}`);
	});
});
