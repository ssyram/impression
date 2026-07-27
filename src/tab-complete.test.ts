import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	type ArgumentCandidate,
	createCommandArgumentProvider,
	matchesLoosely,
	parseCommandArguments,
} from "./tab-complete.js";

const parse = (line: string, col = line.length) => parseCommandArguments([line], 0, col, "impression");

function makeCurrent() {
	const calls: string[] = [];
	const current = {
		async getSuggestions() {
			calls.push("getSuggestions");
			return { items: [{ value: "/etc/", label: "etc/" }], prefix: "" };
		},
		applyCompletion(lines: string[], cursorLine: number, cursorCol: number) {
			calls.push("applyCompletion");
			return { lines, cursorLine, cursorCol };
		},
	};
	return { current, calls };
}

const SUBCOMMANDS: ArgumentCandidate[] = [
	{ value: "status" },
	{ value: "help" },
	{ value: "on" },
	{ value: "off" },
	{ value: "load" },
	{ value: "set" },
];
const FIELDS: ArgumentCandidate[] = [{ value: "Enabled" }, { value: "MaxRecall" }, { value: "SkipDistillation" }];

const complete = (previousTokens: string[]): ArgumentCandidate[] | null => {
	if (previousTokens.length === 0) return SUBCOMMANDS;
	if (previousTokens[0] !== "set") return null;
	const afterSet = previousTokens.slice(1);
	if (afterSet.length === 0) return [{ value: "--persistent" }, ...FIELDS];
	if (afterSet.length === 1 && afterSet[0] === "--persistent") return FIELDS;
	return null;
};

const provider = (current: Parameters<typeof createCommandArgumentProvider>[0]) =>
	createCommandArgumentProvider(current, { command: "impression", complete });

const options = { signal: new AbortController().signal, force: true };

describe("matchesLoosely", () => {
	it("matches a subsequence, ignoring case", () => {
		assert.ok(matchesLoosely("wt", "--with-tools"));
		assert.ok(matchesLoosely("SD", "SkipDistillation"));
		assert.ok(matchesLoosely("", "anything"));
		assert.ok(!matchesLoosely("tw", "--with-tools"));
	});
});

describe("parseCommandArguments", () => {
	it("requires whitespace after the command name", () => {
		assert.equal(parse("/impression"), null);
		assert.equal(parse("/impressions"), null);
		assert.deepEqual(parse("/impression "), { previousTokens: [], token: "", tokenStart: 12 });
	});

	it("reads the token under the cursor and what precedes it", () => {
		assert.deepEqual(parse("/impression se"), { previousTokens: [], token: "se", tokenStart: 12 });
		assert.deepEqual(parse("/impression set "), { previousTokens: ["set"], token: "", tokenStart: 16 });
		assert.deepEqual(parse("/impression set Ena"), { previousTokens: ["set"], token: "Ena", tokenStart: 16 });
		assert.deepEqual(parse("/impression set --persistent M"), {
			previousTokens: ["set", "--persistent"],
			token: "M",
			tokenStart: 29,
		});
	});

	it("tolerates indentation and a cursor before the end of the line", () => {
		assert.deepEqual(parse("   /impression se"), { previousTokens: [], token: "se", tokenStart: 15 });
		assert.deepEqual(parse("/impression se ttings", 14), { previousTokens: [], token: "se", tokenStart: 12 });
	});

	it("ignores other commands and plain text", () => {
		assert.equal(parse("/save-msg out"), null);
		assert.equal(parse("hello /impression set"), null);
	});
});

describe("createCommandArgumentProvider", () => {
	it("lists subcommands right after the command", async () => {
		const { current, calls } = makeCurrent();
		const result = await provider(current).getSuggestions(["/impression "], 0, 12, options);
		assert.deepEqual(calls, []);
		assert.deepEqual(
			result?.items.map((i) => i.value),
			SUBCOMMANDS.map((c) => c.value),
		);
		assert.equal(result?.prefix, "");
	});

	it("narrows the menu as the token grows", async () => {
		const { current } = makeCurrent();
		const result = await provider(current).getSuggestions(["/impression s"], 0, 13, options);
		assert.deepEqual(
			result?.items.map((i) => i.value),
			["status", "set"],
		);
	});

	it("lists config fields after set, including --persistent", async () => {
		const { current } = makeCurrent();
		const result = await provider(current).getSuggestions(["/impression set "], 0, 16, options);
		assert.deepEqual(
			result?.items.map((i) => i.value),
			["--persistent", "Enabled", "MaxRecall", "SkipDistillation"],
		);
	});

	it("keeps listing fields after --persistent", async () => {
		const { current } = makeCurrent();
		const result = await provider(current).getSuggestions(["/impression set --persistent "], 0, 29, options);
		assert.deepEqual(
			result?.items.map((i) => i.value),
			FIELDS.map((c) => c.value),
		);
	});

	it("delegates the value position and every unrelated line", async () => {
		const { current, calls } = makeCurrent();
		const p = provider(current);
		await p.getSuggestions(["/impression set Enabled "], 0, 24, options);
		await p.getSuggestions(["/impression"], 0, 11, options);
		await p.getSuggestions(["/save-msg "], 0, 10, options);
		await p.getSuggestions(["/impression zzz"], 0, 15, options);
		assert.deepEqual(calls, ["getSuggestions", "getSuggestions", "getSuggestions", "getSuggestions"]);
	});

	it("replaces the token and leaves a trailing space", () => {
		const { current, calls } = makeCurrent();
		const result = provider(current).applyCompletion(["/impression se"], 0, 14, { value: "set", label: "set" }, "se");
		assert.deepEqual(calls, []);
		assert.deepEqual(result.lines, ["/impression set "]);
		assert.equal(result.cursorCol, 16);
	});

	it("keeps text after the cursor", () => {
		const { current } = makeCurrent();
		const result = provider(current).applyCompletion(
			["/impression se tail"],
			0,
			14,
			{ value: "set", label: "set" },
			"se",
		);
		assert.deepEqual(result.lines, ["/impression set  tail"]);
	});

	it("delegates an item it did not offer", () => {
		const { current, calls } = makeCurrent();
		provider(current).applyCompletion(["/impression se"], 0, 14, { value: "/etc/", label: "etc/" }, "se");
		assert.deepEqual(calls, ["applyCompletion"]);
	});
});
