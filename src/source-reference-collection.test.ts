import assert from "node:assert/strict";
import test from "node:test";

import { prepareSourceReferences, type SourceReferenceBlock } from "./prepare-source-references.js";
import { buildSourceCollection, expandDraft, renderAnnotatedBlocks } from "./source-indexing/index.js";
import { DraftExpansionError, parseReference } from "./source-indexing/reference-parser.js";

const blocks = (values: readonly string[]) =>
	values.map((text, position) => ({ type: "text", text, position, metadata: `m${position}` }));

const expectDraftError = (collection: ReturnType<typeof buildSourceCollection>, draft: string): void => {
	assert.throws(() => parseReference(collection, draft, 0), DraftExpansionError);
};

const unresolved = (draft: string): string => `(unresolved source reference: ${draft})`;

test("collection assigns dense global IDs while preserving local offsets and empty positions", () => {
	const collection = buildSourceCollection(["ab", "", "😀\r\ncd", "ef"]);
	assert.equal(collection.chunkCount, 3);
	assert.deepEqual(collection.sources, ["ab", "", "😀\r\ncd", "ef"]);
	assert.deepEqual(
		collection.chunksByBlock.map((chunks) => chunks.map(({ id, start, end }) => ({ id, start, end }))),
		[[{ id: 1, start: 0, end: 2 }], [], [{ id: 2, start: 0, end: 5 }], [{ id: 3, start: 0, end: 2 }]],
	);
	assert.equal(expandDraft(collection, "@!1@@!2@@!3@"), "ab😀\r\ncdef");
});

test("collection crosses global digit boundaries with actual line budgets", () => {
	const line80 = `${"x".repeat(79)}\n`;
	const toTen = buildSourceCollection([...Array.from({ length: 9 }, () => line80), line80.repeat(2)]);
	const toHundred = buildSourceCollection([...Array.from({ length: 99 }, () => line80), line80.repeat(2)]);
	assert.equal(toTen.chunkCount, 10);
	assert.equal(toTen.chunksByBlock[9][0].text, line80.repeat(2));
	assert.equal(toHundred.chunkCount, 100);
	assert.equal(toHundred.chunksByBlock[99][0].text, line80.repeat(2));
	assert.equal(expandDraft(toHundred, "@!9~10@,@!99~100@"), `${line80.repeat(2)},${line80.repeat(3)}`);
});

test("block renderer preserves arrays and places one display terminator in nonempty blocks", () => {
	const collection = buildSourceCollection(["a@!b", "", " @|! "]);
	assert.deepEqual(renderAnnotatedBlocks(collection), ["@!1@a@|!b@!@", "", "@!2@ @||! @!@"]);
	assert.equal(collection.getChunk(3), undefined);
	expectDraftError(collection, "@!@");
	assert.equal(expandDraft(collection, "@!@"), unresolved("@!@"));
});

test("collection positions remain block-local and cross-block selections are unavailable", () => {
	const collection = buildSourceCollection(["one\ntwo", "three"]);
	assert.equal(expandDraft(collection, "@!1[4:].pos()@"), "(2~2)");
	assert.equal(
		expandDraft(collection, "@!1~2.pos()@"),
		"(source position unavailable: selection spans multiple text blocks)",
	);
});

test("collection snapshots cannot mutate private chunks or sources", () => {
	const collection = buildSourceCollection(["first", "second"]);
	const sources = collection.sources as string[];
	const chunks = collection.chunksByBlock as unknown as { text: string; id: number }[][];
	sources[0] = "changed";
	chunks[0][0].text = "changed";
	chunks[0][0].id = 99;
	assert.equal(collection.sources[0], "first");
	assert.equal(collection.getChunk(1), "first");
	assert.equal(expandDraft(collection, "@!1@@!2@"), "firstsecond");
});

test("preparation enables only complete nonempty text results and retains metadata", () => {
	const original = blocks(["a@!b", "", " \r\n"]);
	const prepared = prepareSourceReferences(original);
	assert.equal(prepared.active, true);
	if (!prepared.active) throw new Error("expected active preparation");
	assert.deepEqual(
		prepared.content.map((block) => block.text),
		["@!1@a@|!b@!@", "", "@!2@ \r\n@!@"],
	);
	assert.deepEqual(
		original.map((block) => block.text),
		["a@!b", "", " \r\n"],
	);
	assert.deepEqual(
		prepared.content.map((block) => block.metadata),
		["m0", "m1", "m2"],
	);
	for (const content of [[], blocks(["", ""]), [{ type: "image", data: "x" }], [{ type: "text", text: 3 }]]) {
		const inactive = prepareSourceReferences(content as readonly SourceReferenceBlock[]);
		assert.equal(inactive.active, false);
		assert.deepEqual(inactive.content, content);
		assert.notEqual(inactive.content, content);
	}
});

test("strict collection parsing and total expansion handle malformed and huge references", () => {
	const collection = buildSourceCollection(["\u001c abc \u3000", "@!1@<passthrough/>"]);
	assert.equal(expandDraft(collection, "@!1.lstrip()@"), "abc \u3000");
	assert.equal(expandDraft(collection, "@!1.rstrip()@"), "\u001c abc");
	assert.equal(expandDraft(collection, "@!1.strip()@"), "abc");
	assert.equal(expandDraft(collection, "@|||!@!2@"), "@||!@!1@<passthrough/>");
	for (const draft of ["@!0@", "@!01@", "@!999999999999999999999999999999999999999999999999@", "@!1[::]@"]) {
		expectDraftError(collection, draft);
		assert.equal(expandDraft(collection, draft), unresolved(draft));
	}
});
