import type { Api, Message } from "@earendil-works/pi-ai";
import type { ExpectBlock } from "./checks.js";
import type { JudgeRubric, JudgeScore } from "./judge.js";
import type { PromptVariant } from "../src/types.js";

export interface EvalConfig {
	name: string;
	url?: string;
	apiKey?: string;
	apiKeyEnv?: string;
	model: string;
	provider?: string;
	api?: Api;
	variant?: PromptVariant;
	maxTokens?: number;
}

export interface EvalFixture {
	id: string;
	mode: string;
	toolName: string;
	originalSystemPrompt: string;
	visibleHistory?: string;
	visibleHistoryMessages?: Message[];
	toolResult: string;
	expect: ExpectBlock & { judge_rubric?: JudgeRubric };
}

export interface EvalRow {
	config: string;
	fixture: string;
	mode: string;
	gripPass: boolean;
	gripFailures: string[];
	judge?: JudgeScore;
	error?: string;
}
