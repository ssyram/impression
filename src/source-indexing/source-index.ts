import { type BuiltChunk, createChunks } from "./chunking.js";

export interface SourceChunk {
	readonly id: number;
	readonly start: number;
	readonly end: number;
	readonly text: string;
}

export class SourceIndex {
	readonly #source: string;
	readonly #chunks: readonly BuiltChunk[];

	private constructor(source: string, chunks: readonly BuiltChunk[]) {
		this.#source = source;
		this.#chunks = chunks;
	}

	static from(source: string): SourceIndex {
		return new SourceIndex(source, createChunks(source));
	}

	get source(): string {
		return this.#source;
	}

	get chunks(): readonly SourceChunk[] {
		return this.#chunks.map((chunk) => ({ ...chunk }));
	}

	getChunk(id: number): string | undefined {
		return this.#chunks[id - 1]?.text;
	}

	get chunkCount(): number {
		return this.#chunks.length;
	}
}

export const buildSourceIndex = (source: string): SourceIndex => SourceIndex.from(source);
