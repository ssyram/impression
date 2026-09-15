import {
	type PreparedSourceReferences,
	prepareSourceReferences,
	type SourceReferenceBlock,
} from "./prepare-source-references.js";
import { expandDraft } from "./source-indexing/index.js";
import { appendSourceReferenceInstructions } from "./source-reference-prompts.js";

export interface CleanDraft {
	readonly kind: "note" | "passthrough";
	readonly text: string;
}

export interface SourceReferencePipelineInput<Block extends SourceReferenceBlock = SourceReferenceBlock> {
	readonly content: readonly Block[];
	readonly taskPrompt: string;
	readonly cleanDraft: CleanDraft;
	readonly originalLength: number;
	readonly noteTemplate: string;
	readonly templateVariables: Readonly<Record<string, string>>;
}

export interface SourceReferencePipelineResult<Block extends SourceReferenceBlock = SourceReferenceBlock> {
	readonly prepared: PreparedSourceReferences<Block>;
	readonly taskPrompt: string;
	readonly outcome: "note" | "empty" | "failing" | "passthrough";
	readonly note?: string;
}

export const formatSourceReferenceNote = (template: string, variables: Readonly<Record<string, string>>): string => {
	const trimmedTemplate = template.trimEnd();
	return trimmedTemplate.replace(/\{\{([^{}]+)\}\}/g, (placeholder, key: string) =>
		Object.hasOwn(variables, key) ? variables[key] : placeholder,
	);
};

export const runSourceReferencePipeline = <Block extends SourceReferenceBlock>(
	input: SourceReferencePipelineInput<Block>,
): SourceReferencePipelineResult<Block> => {
	const prepared = prepareSourceReferences(input.content);
	const taskPrompt = appendSourceReferenceInstructions(input.taskPrompt, prepared.active);
	if (input.cleanDraft.kind === "passthrough") return { prepared, taskPrompt, outcome: "passthrough" };
	const expanded = prepared.active ? expandDraft(prepared.index, input.cleanDraft.text) : input.cleanDraft.text;
	if (expanded === "") return { prepared, taskPrompt, outcome: "empty" };
	if (expanded.length >= input.originalLength) return { prepared, taskPrompt, outcome: "failing" };
	const note = formatSourceReferenceNote(input.noteTemplate, {
		...input.templateVariables,
		note: expanded,
	});
	return { prepared, taskPrompt, outcome: "note", note };
};
