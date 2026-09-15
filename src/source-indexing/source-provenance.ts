import { isPythonWhitespace, toCodePoints } from "./code-points.js";
import type { SourceCollection } from "./source-collection.js";
import type { SourceIndex } from "./source-index.js";

export interface SourceSpan {
	readonly block: number;
	readonly start: number;
	readonly end: number;
}

export interface SourcedValue {
	readonly text: string;
	readonly spans: readonly SourceSpan[];
}

type TrustedSource = SourceIndex | SourceCollection;

const mergeSpans = (spans: readonly SourceSpan[]): readonly SourceSpan[] => {
	const merged: SourceSpan[] = [];
	for (const span of spans) {
		const previous = merged.at(-1);
		if (previous?.block === span.block && previous.end === span.start) {
			merged[merged.length - 1] = { ...previous, end: span.end };
		} else {
			merged.push(span);
		}
	}
	return merged;
};

const sliceBounds = (text: string, start: bigint | undefined, end: bigint | undefined): readonly [number, number] => {
	const length = BigInt(toCodePoints(text).length);
	const normalize = (value: bigint | undefined, fallback: bigint): number => {
		let normalized = value ?? fallback;
		if (normalized < 0n) normalized += length;
		if (normalized < 0n) normalized = 0n;
		if (normalized > length) normalized = length;
		return Number(normalized);
	};
	const first = normalize(start, 0n);
	return [first, Math.max(first, normalize(end, length))];
};

const sliceAt = (value: SourcedValue, first: number, last: number): SourcedValue => {
	const characters = toCodePoints(value.text);
	let cursor = 0;
	const spans: SourceSpan[] = [];
	for (const span of value.spans) {
		const spanLength = span.end - span.start;
		const overlapStart = Math.max(first, cursor);
		const overlapEnd = Math.min(last, cursor + spanLength);
		if (overlapStart < overlapEnd) {
			spans.push({
				block: span.block,
				start: span.start + overlapStart - cursor,
				end: span.start + overlapEnd - cursor,
			});
		}
		cursor += spanLength;
	}
	return { text: characters.slice(first, last).join(""), spans: mergeSpans(spans) };
};

export const sliceSourcedValue = (
	value: SourcedValue,
	start: bigint | undefined,
	end: bigint | undefined,
): SourcedValue => {
	const [first, last] = sliceBounds(value.text, start, end);
	return sliceAt(value, first, last);
};

export const stripSourcedValue = (value: SourcedValue, side: "left" | "right" | "both"): SourcedValue => {
	const characters = toCodePoints(value.text);
	let first = 0;
	let last = characters.length;
	if (side !== "right") while (first < last && isPythonWhitespace(characters[first])) first += 1;
	if (side !== "left") while (last > first && isPythonWhitespace(characters[last - 1])) last -= 1;
	return sliceAt(value, first, last);
};

export const joinSourcedValues = (values: readonly SourcedValue[]): SourcedValue => ({
	text: values.map((value) => value.text).join(""),
	spans: mergeSpans(values.flatMap((value) => value.spans)),
});

export const sourceValueForId = (index: TrustedSource, id: number): SourcedValue | undefined => {
	if ("source" in index) {
		const chunk = index.chunks[id - 1];
		return chunk === undefined
			? undefined
			: { text: chunk.text, spans: [{ block: 0, start: chunk.start, end: chunk.end }] };
	}
	for (let block = 0; block < index.chunksByBlock.length; block += 1) {
		const chunk = index.chunksByBlock[block].find((candidate) => candidate.id === id);
		if (chunk !== undefined) return { text: chunk.text, spans: [{ block, start: chunk.start, end: chunk.end }] };
	}
	return undefined;
};

const positionAt = (source: string, offset: number): { line: number; column: number; atLineEnd: boolean } => {
	const characters = toCodePoints(source);
	let line = 1;
	let column = 0;
	for (let position = 0; position < offset; position += 1) {
		if (characters[position] === "\r") {
			if (characters[position + 1] !== "\n") line += 1;
			column = 0;
		} else if (characters[position] === "\n") {
			line += 1;
			column = 0;
		} else {
			column += 1;
		}
	}
	const character = characters[offset];
	return {
		line,
		column,
		atLineEnd:
			character === "\r" ||
			character === "\n" ||
			characters[offset + 1] === "\r" ||
			characters[offset + 1] === "\n" ||
			offset + 1 === characters.length,
	};
};

export const formatSourcePosition = (index: TrustedSource, value: SourcedValue): string => {
	if (value.spans.length === 0) return "(source position unavailable: empty selection)";
	const blocks = new Set(value.spans.map((span) => span.block));
	if (blocks.size !== 1) return "(source position unavailable: selection spans multiple text blocks)";
	const block = value.spans[0].block;
	const first = Math.min(...value.spans.map((span) => span.start));
	const last = Math.max(...value.spans.map((span) => span.end)) - 1;
	const source = "source" in index ? index.source : index.sources[block];
	const start = positionAt(source, first);
	const end = positionAt(source, last);
	const renderStart = `${start.line}${start.column === 0 ? "" : `:${start.column}`}`;
	const renderEnd = `${end.line}${end.atLineEnd ? "" : `:${end.column}`}`;
	return `(${renderStart}~${renderEnd})`;
};
