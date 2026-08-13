import type { Message } from "@earendil-works/pi-ai";
import { convertToLlm } from "@earendil-works/pi-coding-agent";
import type { buildSessionContext } from "@earendil-works/pi-coding-agent";

interface HistoryTarget {
	api: string;
	provider: string;
	model: string;
}

const CODEX_API = "openai-codex-responses";
const CODEX_PROVIDER = "openai-codex";
const REASONING_ITEM_KEYS = new Set(["content", "encrypted_content", "id", "status", "summary", "type"]);
const TEXT_SIGNATURE_KEYS = new Set(["id", "phase", "v"]);

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
	return Object.keys(value).every((key) => allowed.has(key));
}

function isTypedText(value: unknown, type: "reasoning_text" | "summary_text"): boolean {
	return isRecord(value) && hasOnlyKeys(value, new Set(["text", "type"])) && value.type === type && typeof value.text === "string";
}

function isCurrentCodexTextSignature(value: string): boolean {
	let parsed: unknown;
	try {
		parsed = JSON.parse(value);
	} catch {
		return false;
	}
	if (!isRecord(parsed) || !hasOnlyKeys(parsed, TEXT_SIGNATURE_KEYS)) return false;
	if (parsed.v !== 1 || typeof parsed.id !== "string") return false;
	return parsed.phase === undefined || parsed.phase === "commentary" || parsed.phase === "final_answer";
}

function isCurrentCodexReasoningSignature(value: string): boolean {
	let parsed: unknown;
	try {
		parsed = JSON.parse(value);
	} catch {
		return false;
	}
	if (!isRecord(parsed) || !hasOnlyKeys(parsed, REASONING_ITEM_KEYS)) return false;
	if (parsed.type !== "reasoning" || typeof parsed.id !== "string" || !Array.isArray(parsed.summary)) return false;
	if (!parsed.summary.every((item) => isTypedText(item, "summary_text"))) return false;
	if (parsed.content !== undefined && (!Array.isArray(parsed.content) || !parsed.content.every((item) => isTypedText(item, "reasoning_text")))) return false;
	if (parsed.encrypted_content !== undefined && parsed.encrypted_content !== null && typeof parsed.encrypted_content !== "string") return false;
	return parsed.status === undefined || parsed.status === "in_progress" || parsed.status === "completed" || parsed.status === "incomplete";
}

function projectCodexMessage(message: Message, target: HistoryTarget): Message {
	if (
		message.role !== "assistant" ||
		message.provider !== target.provider ||
		message.api !== target.api ||
		message.model !== target.model
	) return message;
	let changed = false;
	const content = message.content.map((block) => {
		if (block.type === "thinking" && block.thinkingSignature && isCurrentCodexReasoningSignature(block.thinkingSignature)) {
			const { thinkingSignature: _, ...projected } = block;
			changed = true;
			return projected;
		}
		if (block.type === "text" && block.textSignature && isCurrentCodexTextSignature(block.textSignature)) {
			const { textSignature: _, ...projected } = block;
			changed = true;
			return projected;
		}
		return block;
	});
	return changed ? { ...message, content } : message;
}

function serialize(messages: readonly Message[]): string {
	return messages.map((message) => JSON.stringify(message)).join("\n");
}

export function serializeVisibleHistory(
	messages: ReturnType<typeof buildSessionContext>["messages"],
	target: HistoryTarget,
): string {
	const llmMessages = convertToLlm(messages);
	const fallback = serialize(llmMessages);
	if (target.provider !== CODEX_PROVIDER || target.api !== CODEX_API) return fallback;
	try {
		return serialize(llmMessages.map((message) => projectCodexMessage(message, target)));
	} catch {
		return fallback;
	}
}
