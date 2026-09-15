import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "../../packages/coding-agent/node_modules/vitest/dist/config.js";

const aiSrcIndex = fileURLToPath(new URL("../../packages/ai/src/index.ts", import.meta.url));
const aiSrcCompat = fileURLToPath(new URL("../../packages/ai/src/compat.ts", import.meta.url));
const aiSrcOAuth = fileURLToPath(new URL("../../packages/ai/src/oauth.ts", import.meta.url));
const aiSrcProviders = fileURLToPath(new URL("../../packages/ai/src/providers", import.meta.url));
const agentSrcIndex = fileURLToPath(new URL("../../packages/agent/src/index.ts", import.meta.url));
const tuiSrcIndex = fileURLToPath(new URL("../../packages/tui/src/index.ts", import.meta.url));
const codingAgentSrcIndex = fileURLToPath(new URL("../../packages/coding-agent/src/index.ts", import.meta.url));
const generatedModelDataDir = fileURLToPath(new URL("../../packages/ai/src/providers/data", import.meta.url));
const emptyModelDataId = "\0impression-empty-model-data";

export default defineConfig({
	test: {
		environment: "node",
		testTimeout: 30_000,
	},
	resolve: {
		alias: [
			{ find: /^@earendil-works\/pi-ai$/, replacement: aiSrcIndex },
			{ find: /^@earendil-works\/pi-ai\/compat$/, replacement: aiSrcCompat },
			{ find: /^@earendil-works\/pi-ai\/oauth$/, replacement: aiSrcOAuth },
			{ find: /^@earendil-works\/pi-ai\/providers\/(.+)$/, replacement: `${aiSrcProviders}/$1.ts` },
			{ find: /^@earendil-works\/pi-agent-core$/, replacement: agentSrcIndex },
			{ find: /^@earendil-works\/pi-tui$/, replacement: tuiSrcIndex },
			{ find: /^@earendil-works\/pi-coding-agent$/, replacement: codingAgentSrcIndex },
			{ find: /^@mariozechner\/pi-ai$/, replacement: aiSrcIndex },
			{ find: /^@mariozechner\/pi-ai\/oauth$/, replacement: aiSrcOAuth },
			{ find: /^@mariozechner\/pi-agent-core$/, replacement: agentSrcIndex },
			{ find: /^@mariozechner\/pi-tui$/, replacement: tuiSrcIndex },
		],
	},
	plugins: [
		{
			name: "impression-empty-generated-model-data",
			enforce: "pre",
			resolveId(source, importer) {
				if (!importer || !source.startsWith("./data/") || !source.endsWith(".json")) return;
				const path = resolve(dirname(importer), source);
				if (dirname(path) === generatedModelDataDir && !existsSync(path)) return emptyModelDataId;
			},
			load(id) {
				if (id === emptyModelDataId) return "export default {};";
			},
		},
	],
});
