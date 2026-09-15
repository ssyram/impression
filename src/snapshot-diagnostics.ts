import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { DistillationDiagnostic } from "./distillation-failure.js";

export function snapshotDiagnostics(diagnostics: AssistantMessage["diagnostics"]): DistillationDiagnostic[] | undefined {
	return diagnostics?.map((diagnostic) => {
		const details: Record<string, string | number | boolean | null> = {};
		for (const [key, value] of Object.entries(diagnostic.details ?? {})) {
			if (/signature|encrypted/i.test(key)) continue;
			if (value === null || ["string", "number", "boolean"].includes(typeof value)) details[key] = value;
		}
		return {
			type: diagnostic.type,
			timestamp: diagnostic.timestamp,
			error: diagnostic.error && {
				name: diagnostic.error.name,
				message: diagnostic.error.message,
				code: diagnostic.error.code,
			},
			...(Object.keys(details).length > 0 ? { details } : {}),
		};
	});
}
