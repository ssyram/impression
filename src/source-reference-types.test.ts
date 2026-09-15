import assert from "node:assert/strict";
import test from "node:test";
import type { ImageContent, TextContent } from "@earendil-works/pi-ai";

import type { StructuredDistillationInput } from "./build-structured-distillation-context.js";
import { prepareSourceReferences } from "./prepare-source-references.js";

const bridgeToStructuredInput = (content: (TextContent | ImageContent)[]): StructuredDistillationInput => {
	const prepared = prepareSourceReferences(content);
	if (prepared.active) {
		const annotated: string = prepared.content[0].text;
		void annotated;
		return {
			originalSystemPrompt: "system",
			visibleHistory: [],
			toolName: "tool",
			content: [...prepared.content],
			taskPrompt: "task",
		};
	}
	return {
		originalSystemPrompt: "system",
		visibleHistory: [],
		toolName: "tool",
		content: [...prepared.content],
		taskPrompt: "task",
	};
};

test("preparation bridges an actual text-image union in both discriminator branches", () => {
	const active = bridgeToStructuredInput([{ type: "text", text: "abc", textSignature: "signature" }]);
	const inactive = bridgeToStructuredInput([{ type: "image", data: "image", mimeType: "image/png" }]);
	assert.equal(active.content[0].type, "text");
	assert.equal(inactive.content[0].type, "image");
});

test("preparation widens literal text while retaining literal metadata", () => {
	const original = [{ type: "text", text: "abc", signature: "literal-metadata" }] as const;
	const prepared = prepareSourceReferences(original);
	if (!prepared.active) assert.fail("literal text input must be active");

	const widened: (typeof prepared.content)[number]["text"] = String("different text");
	const signature: "literal-metadata" = prepared.content[0].signature;
	void widened;
	assert.equal(prepared.content[0].text, "@!1@abc@!@");
	assert.equal(signature, "literal-metadata");
});

test("preparation retains metadata for structural views with an undeclared text or type key", () => {
	const full = { type: "text", text: "abc", signature: "preserved" };
	const tagView: { type: string; signature: string } = full;
	const textView: { text: string; signature: string } = full;
	const fromTag = prepareSourceReferences([tagView]);
	const fromText = prepareSourceReferences([textView]);
	if (!fromTag.active) assert.fail("text structural view must be active");
	if (!fromText.active) assert.fail("tag structural view must be active");

	const tagText: string = fromTag.content[0].text;
	const tagMetadata: string = fromTag.content[0].signature;
	const textText: string = fromText.content[0].text;
	const textMetadata: string = fromText.content[0].signature;
	assert.equal(tagText, "@!1@abc@!@");
	assert.equal(tagMetadata, "preserved");
	assert.equal(textText, "@!1@abc@!@");
	assert.equal(textMetadata, "preserved");
});
