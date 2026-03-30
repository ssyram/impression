import type { ImageContent, TextContent } from "@mariozechner/pi-ai";
import type { SessionEntry } from "@mariozechner/pi-coding-agent";

export const IMPRESSION_ENTRY_TYPE = "impression-v1";
export const DEFAULT_MIN_LENGTH = 2048;
export const DEFAULT_MAX_RECALL = 1;
export const DISTILLER_SENTINEL = "<passthrough/>";
export const CONFIG_FILE_NAME = "impression.json";

export interface ImpressionConfig {
	skipDistillation?: string[];
	minLength?: number;
	maxRecallBeforePassthrough?: number;
}

export interface ResolvedConfig {
	skipDistillation: string[];
	minLength: number;
	maxRecall: number;
}

export interface ImpressionEntry {
	id: string;
	toolName: string;
	toolCallId: string;
	toolInput?: Record<string, unknown>;
	fullContent: (TextContent | ImageContent)[];
	fullText: string;
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
		typeof record.recallCount === "number" &&
		typeof record.createdAt === "number" &&
		typeof record.modelProvider === "string" &&
		typeof record.modelId === "string"
	);
}

export function getEntryData(entry: SessionEntry): unknown {
	if (entry.type !== "custom") return undefined;
	if (entry.customType !== IMPRESSION_ENTRY_TYPE) return undefined;
	return entry.data;
}
