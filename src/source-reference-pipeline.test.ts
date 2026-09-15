import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { TextContent } from "@earendil-works/pi-ai";
import type { SourceReferenceBlock } from "./prepare-source-references.js";
import { getDistillerSystemPrompt, getImpressionTextTemplate } from "./prompt-loader.js";
import { buildImpressionText } from "./result-builders.js";
import { formatSourceReferenceNote, runSourceReferencePipeline } from "./source-reference-pipeline.js";
import { getSourceReferenceInstructions } from "./source-reference-prompts.js";

const textContent = (text: string): readonly SourceReferenceBlock[] => [{ type: "text", text }];

const run = (draft: string, originalLength: number, content = textContent("source")) =>
	runSourceReferencePipeline({
		content,
		taskPrompt: "Existing final task",
		cleanDraft: { kind: "note", text: draft },
		originalLength,
		noteTemplate: "note={{note}} id={{id}}   \n\t",
		templateVariables: { id: "$&{{note}}" },
	});

test("prompt assets are complete and composition ends the final task", () => {
	const on = getSourceReferenceInstructions(true);
	const off = getSourceReferenceInstructions(false);
	assert.match(on, /current tool result/i);
	assert.match(on, /dense and result-local/i);
	assert.match(on, /`@!@` is not an output reference/i);
	assert.match(on, /UNESCAPED original source/);
	assert.match(on, /bare reference preserves every source character/i);
	assert.match(on, /LF, CRLF, or CR line endings/);
	assert.match(on, /all trailing Python whitespace/);
	assert.match(on, /Expanded source is not trimmed afterward/);
	assert.match(on, /consecutive chunks/i);
	assert.match(on, /\[start\.\.end\]/i);
	assert.match(on, /one-pass expansion/i);
	assert.match(on, /Append terminal `\.pos\(\)`/);
	assert.match(on, /want literal `@!`, write `@\|!`/i);
	assert.match(on, /Never emit an escaped visible-ID label/i);
	assert.match(on, /`@\|\|!` becomes `@\|!`/);
	assert.match(on, /when `X` equals `Y`/i);
	assert.match(on, /@!1\.rstrip\(\)~1\[1\.\.\]@/);
	assert.match(on, /Invalid references become a diagnostic/i);
	assert.match(on, /normal whole-note length fallback still applies/i);
	assert.doesNotMatch(on, /@\|\+!/);
	const relatedParts = getDistillerSystemPrompt("third-person").slice(
		getDistillerSystemPrompt("third-person").indexOf("Related parts:"),
	);
	assert.match(getDistillerSystemPrompt("third-person"), /````\n<thinking>/);
	assert.match(relatedParts, /Fences are presentation only/);
	assert.match(relatedParts, /relevance statement says what source-grounded fact/i);
	assert.doesNotMatch(relatedParts, /@![0-9]/);
	assert.match(off, /no source-reference index/i);
	assert.match(off, /not expanded/i);
	assert.match(off, /not decoded/i);
	assert.equal(readFileSync("my-plugins/impression/prompts/source-references-on.md", "utf8").trim(), on);
	const result = run("@!1@", 7);
	assert.equal(result.prepared.active, true);
	assert.ok(result.taskPrompt.endsWith(on));
	const imageContent = [{ type: "image", data: "x" }];
	const inactive = run("@!1@", 9, imageContent);
	assert.equal(inactive.prepared.active, false);
	assert.ok(inactive.taskPrompt.endsWith(off));
	assert.equal(inactive.note, "note=@!1@ id=$&{{note}}");
});

test("pipeline preserves direct-literal and TextContent metadata through prepared output", () => {
	const direct = runSourceReferencePipeline({
		content: [
			{
				type: "text",
				text: "source",
				textSignature: "signature",
				metadata: { origin: "direct" },
			},
		],
		taskPrompt: "task",
		cleanDraft: { kind: "note", text: "@!1@" },
		originalLength: 10,
		noteTemplate: "{{note}}",
		templateVariables: {},
	});
	if (!direct.prepared.active) assert.fail("direct text literal must be active");
	assert.equal(direct.prepared.content[0].textSignature, "signature");
	assert.equal(direct.prepared.content[0].metadata.origin, "direct");

	const textContent: TextContent[] = [{ type: "text", text: "source", textSignature: "typed-signature" }];
	const typed = runSourceReferencePipeline({
		content: textContent,
		taskPrompt: "task",
		cleanDraft: { kind: "note", text: "@!1@" },
		originalLength: 10,
		noteTemplate: "{{note}}",
		templateVariables: {},
	});
	if (!typed.prepared.active) assert.fail("TextContent input must be active");
	const signature: string | undefined = typed.prepared.content[0].textSignature;
	assert.equal(signature, "typed-signature");
});

test("pipeline diagnoses invalid active references and keeps off literals", () => {
	const invalid = run("@!2@", 100, textContent("0123456789"));
	assert.equal(invalid.outcome, "note");
	assert.equal(invalid.note, "note=(unresolved source reference: @!2@) id=$&{{note}}");
	const imageContent = [{ type: "image", data: "x" }];
	const inactive = run("@|! @!2@", 20, imageContent);
	assert.equal(inactive.outcome, "note");
	assert.equal(inactive.note, "note=@|! @!2@ id=$&{{note}}");
});

test("pipeline expands only active cleaned drafts and never rescans returned source", () => {
	const result = run("prefix @!1@ @|!", 30, textContent("@!2@<passthrough/>"));
	assert.equal(result.outcome, "note");
	assert.equal(result.note, "note=prefix @!2@<passthrough/> @! id=$&{{note}}");
	const passthrough = runSourceReferencePipeline({
		content: textContent("x"),
		taskPrompt: "task",
		cleanDraft: { kind: "passthrough", text: "@!1@" },
		originalLength: 10,
		noteTemplate: "{{note}}",
		templateVariables: {},
	});
	assert.equal(passthrough.outcome, "passthrough");
	assert.equal(passthrough.note, undefined);
});

test("pipeline distinguishes exact empty expansion and all three legacy length branches", () => {
	assert.equal(run("@!1[1:1]@", 7).outcome, "empty");
	assert.equal(run("abc", 4).outcome, "note");
	assert.equal(run("abcd", 4).outcome, "failing");
	assert.equal(run("abcde", 4).outcome, "failing");
	assert.equal(run("   ", 4).outcome, "note");
});

test("note formatting trims only the template before one nonrecursive interpolation", () => {
	assert.equal(
		formatSourceReferenceNote(" {{note}} {{id}}  \n", {
			note: "tail  ",
			id: "{{note}}$&",
		}),
		" tail   {{note}}$&",
	);
	assert.equal(formatSourceReferenceNote("{{missing}}", { note: "x" }), "{{missing}}");
	const trailing = run("@!1@", 20, textContent("raw  "));
	assert.equal(trailing.note, "note=raw   id=$&{{note}}");
	const finalWhitespace = runSourceReferencePipeline({
		content: textContent("<think>raw\r\n@!1@\u001c  "),
		taskPrompt: "task",
		cleanDraft: { kind: "note", text: "@!1@" },
		originalLength: 100,
		noteTemplate: "prefix={{prefix}}\n{{note}}   \r\n\t",
		templateVariables: { prefix: "ok" },
	});
	assert.equal(finalWhitespace.note, "prefix=ok\n<think>raw\r\n@!1@\u001c  ");
	assert.equal(
		buildImpressionText("id", "raw  "),
		formatSourceReferenceNote(getImpressionTextTemplate(), { id: "id", note: "raw  " }),
	);
});

test("bounded amplification probe is explicit rather than a universal resource guarantee", () => {
	const references = "@!1@".repeat(256);
	const result = run(references, 10_000, textContent("abcd"));
	assert.equal(result.outcome, "note");
	assert.equal(result.note?.includes("abcd".repeat(256)), true);
});
