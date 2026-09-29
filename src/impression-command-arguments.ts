import { CONFIG_KEY_DEFS } from "./impression-config-fields.js";
import type { ArgumentCandidate } from "./tab-complete.js";

const SUBCOMMANDS: { value: string; alias?: string; description: string }[] = [
	{ value: "status", alias: "s", description: "Print current session config" },
	{ value: "help", alias: "h", description: "Show this help" },
	{ value: "on", description: "Shorthand for `set Enabled true`" },
	{ value: "off", description: "Shorthand for `set Enabled false`" },
	{ value: "load", description: "Re-read .pi/impression.json into the session as a patch" },
	{ value: "set", description: "Set one config field: set [--persistent] NAME VALUE" },
];

export const IMPRESSION_HELP = [
	"/impression — view or change session config. Bare /impression shows this help.",
	...SUBCOMMANDS.map((command) => {
		const invocation = `  /impression ${command.value}${command.alias ? ` | ${command.alias}` : ""}`;
		return `${invocation.padEnd(36)}${command.description}.`;
	}),
	"                                    NAME is case- and separator-insensitive (Enabled, enabled,",
	"                                    max-recall, max_recall, \"max recall\" all work); VALUE is JSON,",
	"                                    type-checked against the field. --persistent also writes back",
	"                                    to .pi/impression.json.",
	"  /impression tool1,tool2,...       Append tools to SkipDistillation for this session.",
	"Tab after `/impression ` lists subcommands; after `set ` it lists field names.",
	"Known fields: " + CONFIG_KEY_DEFS.map((def) => def.display).join(", "),
].join("\n");

export function completeImpressionArgument(previousTokens: string[]): ArgumentCandidate[] | null {
	if (previousTokens.length === 0) {
		return SUBCOMMANDS.map((command) => ({
			value: command.value,
			description: command.alias ? `${command.description} (alias: ${command.alias})` : command.description,
		}));
	}
	if (previousTokens[0]?.toLowerCase() !== "set") return null;
	const fields: ArgumentCandidate[] = CONFIG_KEY_DEFS.map((def) => ({ value: def.display, description: def.type }));
	const afterSet = previousTokens.slice(1);
	if (afterSet.length === 0) {
		return [{ value: "--persistent", description: "also write the change to .pi/impression.json" }, ...fields];
	}
	if (afterSet.length === 1 && afterSet[0]?.toLowerCase() === "--persistent") return fields;
	return null;
}

export function parseSetBody(body: string): { name: string; value: string } | null {
	const match = body.match(/^(?:"([^"]*)"|'([^']*)'|(\S+))\s+(.+)$/);
	if (!match) return null;
	const name = (match[1] ?? match[2] ?? match[3] ?? "").trim();
	const value = match[4].trim();
	return name && value ? { name, value } : null;
}

export function parseToolNameList(input: string): string[] {
	const names: string[] = [];
	let i = 0;
	while (i < input.length) {
		while (i < input.length && (input[i] === " " || input[i] === ",")) i++;
		if (i >= input.length) break;
		const ch = input[i];
		if (ch === '"' || ch === "'" || ch === "`") {
			const close = input.indexOf(ch, i + 1);
			if (close === -1) {
				names.push(input.slice(i + 1).trim());
				break;
			}
			const name = input.slice(i + 1, close).trim();
			if (name) names.push(name);
			i = close + 1;
		} else {
			let end = i;
			while (end < input.length && input[end] !== ",") end++;
			const name = input.slice(i, end).trim();
			if (name) names.push(name);
			i = end + 1;
		}
	}
	return names;
}
