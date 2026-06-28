}
		const seen = new Set<string>();
		for (const arg of a.arguments) {
			if (typeof arg !== "object" || arg === null) throw new ParseError(`Invalid argument in action '${a.action_id}'`);
			const argObj = arg as Record<string, unknown>;
			if (typeof argObj.arg_name !== "string") throw new ParseError(`Argument missing 'arg_name' in action '${a.action_id}'`);
			if (!IDENT_RE.test(argObj.arg_name)) {
				throw new ParseError(`arg_name '${argObj.arg_name}' in action '${a.action_id}' must match /^[A-Za-z_][A-Za-z0-9_]*$/ to be env-var-safe`);
			}
			if (isReservedJsName(argObj.arg_name)) {
				throw new ParseError(`arg_name '${argObj.arg_name}' in action '${a.action_id}' is a reserved JS property name`);
			}
			if (seen.has(argObj.arg_name)) {
				throw new ParseError(`Duplicate arg_name '${argObj.arg_name}' in action '${a.action_id}'`);
			}
---
	isLast: boolean,
): Condition {
	if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
	throw new ParseError(`Action '${actionId}' in state '${stateId}': 'condition' must be an object (either { default: true }, { builtin, args? }, or { cmd, args?, needs_tape? })`);
	}
	const c = raw as Record<string, unknown>;

	if (isBuiltinCondition(c)) {
		let expanded: Record<string, unknown>;
		try {
			expanded = expandBuiltinCondition(c, actionId, stateId);
		} catch (e) {
			throw new ParseError((e as Error).message);
		}
		return validateCondition(expanded, actionId, stateId, isEpsilon, isLast);
	}

	const isDefault = c.default === true;
	const hasCmd = c.cmd !== undefined;

	if (isDefault && (hasCmd || c.args !== undefined || c.needs_tape !== undefined)) {
		throw new ParseError(`Action '${actionId}' in state '${stateId}': condition cannot mix 'default: true' with 'cmd'/'args'/'needs_tape' (pick one form)`);
	}
	if (!isDefault && c.default !== undefined) {
		throw new ParseError(`Action '${actionId}' in state '${stateId}': condition.default must be omitted or equal to true (got ${JSON.stringify(c.default)})`);
	}

	// Epsilon-state default-placement rules
	if (isEpsilon) {
		if (isLast && !isDefault) {
			throw new ParseError(`Epsilon state '${stateId}' last action '${actionId}' must have condition { default: true }`);
		}
		if (!isLast && isDefault) {
---
			}
			return v;
		});
	}
	let needs_tape: boolean | undefined;
	if (c.needs_tape !== undefined) {
		if (typeof c.needs_tape !== "boolean") {
			throw new ParseError(`Action '${actionId}' in state '${stateId}': condition.needs_tape must be a boolean`);
		}
		needs_tape = c.needs_tape;
	}
	return needs_tape === undefined ? { cmd: c.cmd, args } : { cmd: c.cmd, args, needs_tape };
}

export function buildFSM(config: FlowConfig): ParsedFSM {
	const stateMap = new Map<string, State>();
	let hasStart = false;
	let hasEnd = false;

---
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const BUILTINS_DIR = join(dirname(fileURLToPath(import.meta.url)), "builtins");

/** Script filename and needs_tape flag for each known builtin name. */
interface BuiltinDef {
	script: string;
	needs_tape: boolean;
}

const BUILTIN_DEFS: Record<string, BuiltinDef> = {
	"submit/required-fields": { script: "submit-required-fields.mjs", needs_tape: true },
	"self-check/basic": { script: "self-check-basic.mjs", needs_tape: false },
	"validate/non-empty-args": { script: "validate-non-empty-args.mjs", needs_tape: false },
	"soft-review/claude": { script: "soft-review-claude.mjs", needs_tape: true },
	"soft-review/pi": { script: "soft-review-pi.mjs", needs_tape: true },
};

export const KNOWN_BUILTINS: ReadonlySet<string> = new Set(Object.keys(BUILTIN_DEFS));

/**
 * Returns true when `raw` is a condition object that uses the `builtin` sugar key.
 * Does not validate the name — call expandBuiltinCondition for full expansion.
 */
export function isBuiltinCondition(raw: Record<string, unknown>): boolean {
	return "builtin" in raw;
}

/**
 * Expands a `{ builtin, args? }` condition record into canonical
 * `{ cmd, args, needs_tape }` form.
 *
 * Throws a plain Error with a descriptive message on unknown names or bad args.
 * The caller (validateCondition) is responsible for wrapping this in a ParseError.
 */
export function expandBuiltinCondition(
	raw: Record<string, unknown>,
	actionId: string,
	stateId: string,
): Record<string, unknown> {
	const name = raw["builtin"];
	if (typeof name !== "string" || name.trim().length === 0) {
		throw new Error(
			`Action '${actionId}' in state '${stateId}': builtin name must be a non-empty string (got ${JSON.stringify(name)})`,
		);
	}

	const def = BUILTIN_DEFS[name];
	if (def === undefined) {
		throw new Error(
			`Action '${actionId}' in state '${stateId}': unknown builtin '${name}'. Known builtins: ${[...KNOWN_BUILTINS].join(", ")}`,
		);
	}

	const userArgs = raw["args"];
	let expandedArgs: string[];
	if (userArgs === undefined) {
		expandedArgs = [join(BUILTINS_DIR, def.script)];
	} else if (Array.isArray(userArgs) && userArgs.every((a) => typeof a === "string")) {
		expandedArgs = [join(BUILTINS_DIR, def.script), ...(userArgs as string[])];
	} else {
		throw new Error(
			`Action '${actionId}' in state '${stateId}': builtin '${name}' args must be an array of strings`,
		);
	}

	const extra = Object.keys(raw).filter((k) => k !== "builtin" && k !== "args");
	if (extra.length > 0) {
		throw new Error(
			`Action '${actionId}' in state '${stateId}': builtin condition has unexpected keys: ${extra.join(", ")}`,
		);