import type { SourceCollection } from "./source-collection.js";
import type { SourceIndex } from "./source-index.js";

export const escapeChunkText = (text: string): string => text.replace(/@(\|*)!/g, "@$1|!");

export const renderAnnotated = (index: SourceIndex): string => {
	let rendered = "";
	for (const chunk of index.chunks) rendered += `@!${chunk.id}@${escapeChunkText(chunk.text)}`;
	return rendered;
};

export const renderAnnotatedBlocks = (collection: SourceCollection): readonly string[] =>
	collection.chunksByBlock.map((chunks) => {
		if (chunks.length === 0) return "";
		let rendered = "";
		for (const chunk of chunks) rendered += `@!${chunk.id}@${escapeChunkText(chunk.text)}`;
		return `${rendered}@!@`;
	});
