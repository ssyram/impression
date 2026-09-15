import assert from "node:assert/strict";
import test from "node:test";
import { prepareSourceReferences, type SourceReferenceBlock } from "./prepare-source-references.js";
import { buildSourceCollection, expandDraft, renderAnnotatedBlocks } from "./source-indexing/index.js";

const samples = 2_500;

const next = (state: number): number => (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;

const generatedText = (seed: number, length: number): string => {
	const alphabet = ["a", " ", "\n", "\r", "@!", "@|!", "😀", "。", "\u001c", "\ud800"];
	let state = seed;
	let text = `case-${seed}:`;
	for (let index = 0; index < length; index += 1) {
		state = next(state);
		text += alphabet[state % alphabet.length];
	}
	return text;
};

const sourceBlocks = (seed: number): readonly string[] => [
	generatedText(seed, (seed % 17) + 1),
	seed % 7 === 0 ? "" : generatedText(seed ^ 0x9e3779b9, (seed % 13) + 1),
	generatedText(seed ^ 0x85ebca6b, (seed % 11) + 1),
];

test(`deterministic collection and preparation properties (${samples} distinct generated cases; seed range 1..${samples})`, () => {
	const seen = new Set<string>();
	for (let seed = 1; seed <= samples; seed += 1) {
		const sources = sourceBlocks(seed);
		seen.add(sources.join("\u0000"));
		const collection = buildSourceCollection(sources);
		assert.deepEqual(collection.sources, sources);
		assert.equal(
			collection.chunksByBlock.map((chunks) => chunks.map((chunk) => chunk.text).join("")).join("\u0000"),
			sources.join("\u0000"),
		);
		const references = Array.from({ length: collection.chunkCount }, (_, index) => `@!${index + 1}@`).join("");
		assert.equal(expandDraft(collection, references), sources.join(""));
		const rendered = renderAnnotatedBlocks(collection);
		assert.equal(rendered.length, sources.length);
		for (let position = 0; position < sources.length; position += 1) {
			assert.equal(rendered[position].endsWith("@!@"), sources[position].length > 0);
		}
		const content: readonly SourceReferenceBlock[] = sources.map((text, position) => ({
			type: "text",
			text,
			position,
		}));
		const prepared = prepareSourceReferences(content);
		assert.equal(prepared.active, true);
		if (prepared.active)
			assert.deepEqual(
				prepared.content.map((block) => block.text),
				rendered,
			);
	}
	assert.equal(seen.size, samples);
});

test("bounded malformed-input probe diagnoses a 10,000-digit unknown ID", () => {
	const collection = buildSourceCollection(["x"]);
	const huge = `@!${"9".repeat(10_000)}@`;
	assert.equal(expandDraft(collection, huge), `(unresolved source reference: ${huge})`);
});
