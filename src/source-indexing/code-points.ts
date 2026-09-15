export const toCodePoints = (text: string): string[] => Array.from(text);

export const codePointLength = (text: string): number => toCodePoints(text).length;

export const isPythonWhitespace = (character: string): boolean => {
	const point = character.codePointAt(0);
	if (point === undefined) return false;
	return (
		(point >= 0x09 && point <= 0x0d) ||
		(point >= 0x1c && point <= 0x1f) ||
		point === 0x20 ||
		point === 0x85 ||
		point === 0xa0 ||
		point === 0x1680 ||
		(point >= 0x2000 && point <= 0x200a) ||
		point === 0x2028 ||
		point === 0x2029 ||
		point === 0x202f ||
		point === 0x205f ||
		point === 0x3000
	);
};

export const isPunctuation = (character: string): boolean => /\p{P}/u.test(character);

export const pythonSlice = (text: string, start: bigint | undefined, end: bigint | undefined): string => {
	const characters = toCodePoints(text);
	const length = BigInt(characters.length);
	const normalize = (value: bigint | undefined, fallback: bigint): number => {
		let result = value ?? fallback;
		if (result < 0n) result += length;
		if (result < 0n) result = 0n;
		if (result > length) result = length;
		return Number(result);
	};
	const first = normalize(start, 0n);
	const last = normalize(end, length);
	return characters.slice(first, Math.max(first, last)).join("");
};

export const stripPythonWhitespace = (text: string, side: "left" | "right" | "both"): string => {
	const characters = toCodePoints(text);
	let first = 0;
	let last = characters.length;
	if (side !== "right") {
		while (first < last && isPythonWhitespace(characters[first])) first += 1;
	}
	if (side !== "left") {
		while (last > first && isPythonWhitespace(characters[last - 1])) last -= 1;
	}
	return characters.slice(first, last).join("");
};
