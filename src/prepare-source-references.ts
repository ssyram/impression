import { buildSourceCollection, renderAnnotatedBlocks, type SourceCollection } from "./source-indexing/index.js";

export interface SourceReferenceBlock {
	readonly type?: unknown;
	readonly text?: unknown;
}

type AnnotatedShape<Block extends SourceReferenceBlock> = Omit<Block, "text" | "type"> & {
	readonly type: "text";
	readonly text: string;
};

type AnnotatedBlock<Block extends SourceReferenceBlock> = Block extends unknown
	? Block extends { readonly type: infer Type }
		? "text" extends Type
			? AnnotatedShape<Block>
			: never
		: AnnotatedShape<Block>
	: never;

export interface InactiveSourceReferences<Block extends SourceReferenceBlock> {
	readonly active: false;
	readonly content: readonly Block[];
}

export interface ActiveSourceReferences<Block extends SourceReferenceBlock> {
	readonly active: true;
	readonly content: readonly AnnotatedBlock<Block>[];
	readonly index: SourceCollection;
}

export type PreparedSourceReferences<Block extends SourceReferenceBlock> =
	| ActiveSourceReferences<Block>
	| InactiveSourceReferences<Block>;

export function prepareSourceReferences<Block extends SourceReferenceBlock>(
	content: readonly Block[],
): PreparedSourceReferences<Block>;
export function prepareSourceReferences(
	content: readonly SourceReferenceBlock[],
): PreparedSourceReferences<SourceReferenceBlock> {
	let active = content.length > 0;
	let nonempty = false;
	const sources = content.map((block) => {
		if (block.type !== "text" || typeof block.text !== "string") {
			active = false;
			return "";
		}
		if (block.text.length > 0) nonempty = true;
		return block.text;
	});
	if (!active || !nonempty) return { active: false, content: content.map((block) => ({ ...block })) };
	const index = buildSourceCollection(sources);
	const rendered = renderAnnotatedBlocks(index);
	return {
		active: true,
		content: content.map((block, position) => ({
			...block,
			type: "text",
			text: rendered[position],
		})),
		index,
	};
}
