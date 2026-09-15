import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const promptsDirectory = join(dirname(fileURLToPath(import.meta.url)), "..", "prompts");

export const getSourceReferenceInstructions = (active: boolean): string =>
	readFileSync(join(promptsDirectory, active ? "source-references-on.md" : "source-references-off.md"), "utf8").trim();

export const appendSourceReferenceInstructions = (taskPrompt: string, active: boolean): string =>
	`${taskPrompt}\n\n${getSourceReferenceInstructions(active)}`;
