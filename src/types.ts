import type { ImageContent, TextContent } from "@mariozechner/pi-ai";
import type { SessionEntry } from "@mariozechner/pi-coding-agent";

export const IMPRESSION_ENTRY_TYPE = "impression-v1";
export const PASSTHROUGH_MODE_ENTRY_TYPE = "impression-passthrough-mode";
export const DEFAULT_MIN_LENGTH = 2048;
export const DEFAULT_MAX_RECALL = 1;
export const DEFAULT_MAX_PASSTHROUGH_COUNT = 2;
export const DISTILLER_SENTINEL = "<passthrough/>";
export const CONFIG_FILE_NAME = "impression.json";

export interface ImpressionConfig {
	skipDistillation?: string[];
	minLength?: number;
	maxRecallBeforePassthrough?: number;
	maxPassthroughCount?: number;
	showData?: boolean;
}

export interface ResolvedConfig {
	skipDistillation: string[];
	minLength: number;
	maxRecall: number;
	maxPassthroughCount: number;
	showData: boolean;
}

export interface ImpressionEntry {
	id: string;
	toolName: string;
	toolCallId: string;
	toolInput?: Record<string, unknown>;
	fullContent: (TextContent | ImageContent)[];
	fullText: string;
	originalTokens?: number;
	recallCount: number;
	createdAt: number;
	modelProvider: string;
	modelId: string;
}

export function isImpressionEntry(value: unknown): value is ImpressionEntry {
	if (!value || typeof value !== "object") return false;
	const record = value as Record<string, unknown>;
	return (
		typeof record.id === "string" &&
		typeof record.toolName === "string" &&
		typeof record.toolCallId === "string" &&
		Array.isArray(record.fullContent) &&
		typeof record.fullText === "string" &&
		(record.originalTokens === undefined || typeof record.originalTokens === "number") &&
		typeof record.recallCount === "number" &&
		typeof record.createdAt === "number" &&
		typeof record.modelProvider === "string" &&
		typeof record.modelId === "string"
	);
}

export interface PassthroughModeEntry {
	remaining: number;
}

export function isPassthroughModeEntry(value: unknown): value is PassthroughModeEntry {
	if (!value || typeof value !== "object") return false;
	const record = value as Record<string, unknown>;
	return typeof record.remaining === "number";
}

export function getEntryData(entry: SessionEntry): unknown {
	if (entry.type !== "custom") return undefined;
	if (entry.customType !== IMPRESSION_ENTRY_TYPE) return undefined;
	return entry.data;
}

export function getPassthroughModeData(entry: SessionEntry): unknown {
	if (entry.type !== "custom") return undefined;
	if (entry.customType !== PASSTHROUGH_MODE_ENTRY_TYPE) return undefined;
	return entry.data;
}
