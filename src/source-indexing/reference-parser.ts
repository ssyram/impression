import type { SourceCollection } from "./source-collection.js";
import type { SourceIndex } from "./source-index.js";
import {
	formatSourcePosition,
	joinSourcedValues,
	type SourcedValue,
	sliceSourcedValue,
	sourceValueForId,
	stripSourcedValue,
} from "./source-provenance.js";

export type TrustedSource = SourceIndex | SourceCollection;
type WhitespaceSide = "left" | "right" | "both";

export class DraftExpansionError extends Error {
	readonly offset: number;

	constructor(message: string, offset: number) {
		super(`${message} at draft offset ${offset}`);
		this.name = "DraftExpansionError";
		this.offset = offset;
	}
}

interface ParsedInteger {
	readonly value: bigint | undefined;
	readonly next: number;
}

export interface ParsedValue extends SourcedValue {
	readonly next: number;
}

interface ParsedEndpoint extends ParsedValue {
	readonly id: bigint;
	readonly operationsStart: number;
}

const parseSliceInteger = (draft: string, offset: number, terminators: readonly string[]): ParsedInteger => {
	if (terminators.includes(draft[offset])) return { value: undefined, next: offset };
	let next = offset;
	if (draft[next] === "-") next += 1;
	const digitsStart = next;
	while (draft[next] >= "0" && draft[next] <= "9") next += 1;
	if (next === digitsStart) throw new DraftExpansionError("invalid slice integer", offset);
	return { value: BigInt(draft.slice(offset, next)), next };
};

const parseSlice = (draft: string, offset: number, value: SourcedValue): ParsedValue => {
	const start = parseSliceInteger(draft, offset + 1, [":", "."]);
	const separator = draft.startsWith("..", start.next) ? ".." : draft[start.next] === ":" ? ":" : undefined;
	if (separator === undefined) throw new DraftExpansionError("slice requires one colon or two dots", start.next);
	const end = parseSliceInteger(draft, start.next + separator.length, ["]"]);
	if (draft[end.next] !== "]") throw new DraftExpansionError("invalid slice", end.next);
	return { ...sliceSourcedValue(value, start.value, end.value), next: end.next + 1 };
};

const methodAt = (draft: string, offset: number): { side: WhitespaceSide; length: number } | undefined => {
	if (draft.startsWith(".lstrip()", offset)) return { side: "left", length: ".lstrip()".length };
	if (draft.startsWith(".rstrip()", offset)) return { side: "right", length: ".rstrip()".length };
	if (draft.startsWith(".strip()", offset) || draft.startsWith(".trim()", offset))
		return { side: "both", length: draft.startsWith(".strip()", offset) ? ".strip()".length : ".trim()".length };
	return undefined;
};

const parseOperations = (draft: string, offset: number, initial: SourcedValue): ParsedValue => {
	let next = offset;
	let value = initial;
	while (draft[next] === "[" || (draft[next] === "." && !draft.startsWith(".pos()", next))) {
		if (draft[next] === "[") {
			const slice = parseSlice(draft, next, value);
			value = slice;
			next = slice.next;
			continue;
		}
		const method = methodAt(draft, next);
		if (method === undefined) throw new DraftExpansionError("unsupported reference operation", next);
		value = stripSourcedValue(value, method.side);
		next += method.length;
	}
	return { ...value, next };
};

const parseEndpoint = (index: TrustedSource, draft: string, offset: number): ParsedEndpoint => {
	if (draft[offset] < "1" || draft[offset] > "9") throw new DraftExpansionError("invalid reference ID", offset);
	let next = offset;
	while (draft[next] >= "0" && draft[next] <= "9") next += 1;
	const id = BigInt(draft.slice(offset, next));
	if (id > BigInt(index.chunkCount)) throw new DraftExpansionError("unknown reference ID", offset);
	const value = sourceValueForId(index, Number(id));
	if (value === undefined) throw new DraftExpansionError("unknown reference ID", offset);
	const parsed = parseOperations(draft, next, value);
	return { ...parsed, id, operationsStart: next };
};

const rangeValue = (index: TrustedSource, first: bigint, last: bigint, offset: number): SourcedValue => {
	const values: SourcedValue[] = [];
	for (let id = first; id <= last; id += 1n) {
		const value = sourceValueForId(index, Number(id));
		if (value === undefined) throw new DraftExpansionError("unknown reference ID", offset);
		values.push(value);
	}
	return joinSourcedValues(values);
};

const finish = (index: TrustedSource, draft: string, value: ParsedValue): ParsedValue => {
	if (draft.startsWith(".pos()", value.next)) {
		const next = value.next + ".pos()".length;
		if (draft[next] !== "@") throw new DraftExpansionError("unsupported reference operation", next);
		return { text: formatSourcePosition(index, value), spans: [], next: next + 1 };
	}
	if (draft[value.next] !== "@") throw new DraftExpansionError("unsupported reference operation", value.next);
	return { ...value, next: value.next + 1 };
};

export const parseReference = (index: TrustedSource, draft: string, offset: number): ParsedValue => {
	const next = offset + 2;
	if (draft[next] === "(") {
		const firstStart = next + 1;
		const first = parseEndpoint(index, draft, firstStart);
		if (first.next !== first.operationsStart || draft[first.next] !== "~")
			throw new DraftExpansionError("group requires unmodified range endpoints", first.next);
		const last = parseEndpoint(index, draft, first.next + 1);
		if (last.next !== last.operationsStart || draft[last.next] !== ")")
			throw new DraftExpansionError("invalid grouped range", last.next);
		if (first.id > last.id) throw new DraftExpansionError("reversed reference range", firstStart);
		return finish(
			index,
			draft,
			parseOperations(draft, last.next + 1, rangeValue(index, first.id, last.id, firstStart)),
		);
	}
	const firstStart = next;
	const first = parseEndpoint(index, draft, firstStart);
	if (draft[first.next] !== "~") return finish(index, draft, first);
	const last = parseEndpoint(index, draft, first.next + 1);
	if (first.id > last.id) throw new DraftExpansionError("reversed reference range", firstStart);
	if (first.id === last.id) return finish(index, draft, parseOperations(draft, last.operationsStart, first));
	const value = joinSourcedValues([first, rangeValue(index, first.id + 1n, last.id - 1n, firstStart), last]);
	return finish(index, draft, { ...value, next: last.next });
};
