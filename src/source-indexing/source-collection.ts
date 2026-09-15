import { type BuiltChunk, createChunks } from "./chunking.js";
import type { SourceChunk } from "./source-index.js";

const copyChunk = (chunk: BuiltChunk): SourceChunk => ({ ...chunk });

export class SourceCollection {
	readonly #sources: readonly string[];
	readonly #chunksByBlock: readonly (readonly BuiltChunk[])[];
	readonly #chunks: readonly BuiltChunk[];

	private constructor(sources: readonly string[], chunksByBlock: readonly (readonly BuiltChunk[])[]) {
		this.#sources = sources;
		this.#chunksByBlock = chunksByBlock;
		this.#chunks = chunksByBlock.flat();
	}

	static from(sources: readonly string[]): SourceCollection {
		let firstId = 1;
		const chunksByBlock = sources.map((source) => {
			const chunks = createChunks(source, firstId);
			firstId += chunks.length;
			return chunks;
		});
		return new SourceCollection([...sources], chunksByBlock);
	}

	get sources(): readonly string[] {
		return [...this.#sources];
	}

	get chunksByBlock(): readonly (readonly SourceChunk[])[] {
		return this.#chunksByBlock.map((chunks) => chunks.map(copyChunk));
	}

	get chunkCount(): number {
		return this.#chunks.length;
	}

	getChunk(id: number): string | undefined {
		return this.#chunks[id - 1]?.text;
	}
}

export const buildSourceCollection = (sources: readonly string[]): SourceCollection => SourceCollection.from(sources);
