import { codePointLength, isPunctuation, isPythonWhitespace, toCodePoints } from "./code-points.js";

export interface BuiltChunk {
	readonly id: number;
	readonly start: number;
	readonly end: number;
	readonly text: string;
}

interface Unit {
	readonly characters: readonly string[];
	readonly blank: boolean;
}

const boundsFor = (id: number): { lower: number; upper: number } => {
	const labelLength = codePointLength(`@!${id}@`);
	return { lower: 20 * labelLength, upper: 40 * labelLength };
};

const physicalLines = (source: string): Unit[] => {
	const characters = toCodePoints(source);
	const lines: Unit[] = [];
	let start = 0;
	for (let index = 0; index < characters.length; index += 1) {
		if (characters[index] === "\r") {
			const end = characters[index + 1] === "\n" ? index + 2 : index + 1;
			const line = characters.slice(start, end);
			lines.push({ characters: line, blank: line.every(isPythonWhitespace) });
			start = end;
			if (end === index + 2) index += 1;
		} else if (characters[index] === "\n") {
			const line = characters.slice(start, index + 1);
			lines.push({ characters: line, blank: line.every(isPythonWhitespace) });
			start = index + 1;
		}
	}
	if (start < characters.length) {
		const line = characters.slice(start);
		lines.push({ characters: line, blank: line.every(isPythonWhitespace) });
	}
	return lines;
};

const unitsFor = (source: string): Unit[] => {
	const units: Unit[] = [];
	for (const line of physicalLines(source)) {
		const previous = units[units.length - 1];
		if (line.blank && previous?.blank) {
			units[units.length - 1] = {
				characters: previous.characters.concat(line.characters),
				blank: true,
			};
		} else {
			units.push(line);
		}
	}
	return units;
};

const splitLength = (characters: readonly string[], lower: number, upper: number): number => {
	for (let length = lower; length <= upper; length += 1) {
		const last = characters[length - 1];
		if ((isPunctuation(last) || isPythonWhitespace(last)) && !(last === "\r" && characters[length] === "\n")) {
			return length;
		}
	}
	return characters[upper - 1] === "\r" && characters[upper] === "\n" ? upper - 1 : upper;
};

export const createChunks = (source: string, firstId = 1): readonly BuiltChunk[] => {
	const chunks: BuiltChunk[] = [];
	let pending: string[] = [];
	let pendingLength = 0;
	let offset = 0;
	const append = (characters: readonly string[]): void => {
		for (const character of characters) pending.push(character);
		pendingLength += characters.length;
	};
	const emit = (): void => {
		if (pendingLength === 0) return;
		const text = pending.join("");
		chunks.push({
			id: firstId + chunks.length,
			start: offset,
			end: offset + pendingLength,
			text,
		});
		offset += pendingLength;
		pending = [];
		pendingLength = 0;
	};

	for (const unit of unitsFor(source)) {
		let remaining = unit.characters;
		if (unit.blank) {
			let bounds = boundsFor(firstId + chunks.length);
			if (pendingLength > 0 && pendingLength + remaining.length > bounds.upper) emit();
			bounds = boundsFor(firstId + chunks.length);
			append(remaining);
			if (remaining.length > bounds.upper || pendingLength >= bounds.lower) emit();
			continue;
		}
		while (remaining.length > 0) {
			const bounds = boundsFor(firstId + chunks.length);
			if (remaining.length > bounds.upper) {
				if (pendingLength > 0) {
					emit();
					continue;
				}
				const length = splitLength(remaining, bounds.lower, bounds.upper);
				append(remaining.slice(0, length));
				emit();
				remaining = remaining.slice(length);
				continue;
			}
			if (pendingLength + remaining.length <= bounds.upper) {
				append(remaining);
				if (pendingLength >= bounds.lower) emit();
				break;
			}
			emit();
		}
	}
	emit();
	return chunks;
};
