import { DraftExpansionError, parseReference, type TrustedSource } from "./reference-parser.js";

export { DraftExpansionError } from "./reference-parser.js";

const unresolvedReference = (draft: string, offset: number): { text: string; next: number } => {
	const end = draft.indexOf("@", offset + 2);
	const next = end === -1 ? draft.length : end + 1;
	return { text: `(unresolved source reference: ${draft.slice(offset, next)})`, next };
};

export const expandDraft = (index: TrustedSource, draft: string): string => {
	let expanded = "";
	let offset = 0;
	while (offset < draft.length) {
		if (draft[offset] !== "@") {
			expanded += draft[offset];
			offset += 1;
			continue;
		}
		if (draft[offset + 1] === "|") {
			let end = offset + 1;
			while (draft[end] === "|") end += 1;
			if (draft[end] === "!") {
				expanded += `@${"|".repeat(end - offset - 2)}!`;
				offset = end + 1;
				continue;
			}
		}
		if (draft[offset + 1] === "!") {
			try {
				const reference = parseReference(index, draft, offset);
				expanded += reference.text;
				offset = reference.next;
				continue;
			} catch (error) {
				if (!(error instanceof DraftExpansionError)) throw error;
				const unresolved = unresolvedReference(draft, offset);
				expanded += unresolved.text;
				offset = unresolved.next;
				continue;
			}
		}
		expanded += "@";
		offset += 1;
	}
	return expanded;
};
