import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = join(__dirname, "..", "prompts");

function readPrompt(name: string): string {
	return readFileSync(join(PROMPTS_DIR, name), "utf-8");
}

let cachedDistillerSystem: string | undefined;
let cachedImpressionText: string | undefined;
let cachedDistillerUser: string | undefined;

export function getDistillerSystemPrompt(): string {
	cachedDistillerSystem ??= readPrompt("distiller-system.txt");
	return cachedDistillerSystem;
}

export function getImpressionTextTemplate(): string {
	cachedImpressionText ??= readPrompt("impression-text.txt");
	return cachedImpressionText;
}

export function getDistillerUserTemplate(): string {
	cachedDistillerUser ??= readPrompt("distiller-user.txt");
	return cachedDistillerUser;
}

export function renderTemplate(template: string, vars: Record<string, string>): string {
	let result = template;
	for (const [key, value] of Object.entries(vars)) {
		result = result.replaceAll(`{{${key}}}`, value);
	}
	return result.trimEnd();
}
