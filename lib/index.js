/**
 * Host loader entry for the settings-nav-fold plugin.
 *
 * Provides the `settingsNavManage` Remote service so the browser UI can
 * disable / enable / uninstall profile-patch plugins (rows written in the
 * profile's `cordis.patch.yml`, i.e. user-managed plugins like this one).
 * Bundle-owned rows are reported read-only (`manageable: false`).
 *
 * Persistence is file-based on the profile layer:
 *  - disable/enable rewrite the entry's block in `cordis.patch.yml`;
 *  - uninstall additionally drops the dependency from the profile
 *    `package.json` and stops the running entry.
 * Runtime effect (fiber stop/start) goes through the Loader entry.
 */
import { Remote, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import { join } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";

/** Mirror of the Cordis FiberState const enum (values must match). */
const FIBER_STATE = { PENDING: 0, LOADING: 1, ACTIVE: 2, FAILED: 3, DISPOSED: 4, UNLOADING: 5 };

/** Public projection of Cordis Fiber states. */
const FIBER_PHASE = {
	[FIBER_STATE.PENDING]: "pending",
	[FIBER_STATE.LOADING]: "loading",
	[FIBER_STATE.ACTIVE]: "active",
	[FIBER_STATE.FAILED]: "failed",
	[FIBER_STATE.DISPOSED]: null,
	[FIBER_STATE.UNLOADING]: "unloading"
};

function success(value) {
	return Object.freeze({ ok: true, value: Object.freeze(value) });
}
function rejected(error) {
	return Object.freeze({ ok: false, error: Object.freeze(error) });
}

/**
 * Locate one entry block in a loader patch YAML text by its `id`.
 * Returns [startLine, endLineExclusive] of the block (the `- id: x` line and
 * every following more-indented line), or null when the id is absent.
 */
function patchBlockRange(lines, id) {
	let start = -1;
	let indent = 0;
	for (let i = 0; i < lines.length; i++) {
		const m = /^(\s*)- id:\s*(\S+)\s*$/.exec(lines[i]);
		if (m !== null && m[2] === id) {
			start = i;
			indent = m[1].length;
			break;
		}
	}
	if (start < 0) return null;
	let end = lines.length;
	for (let i = start + 1; i < lines.length; i++) {
		const line = lines[i];
		if (line.trim() === "") continue;
		const sibling = /^(\s*)- /.exec(line);
		if (sibling !== null && sibling[1].length <= indent) {
			end = i;
			break;
		}
		const key = /^(\s*)\S/.exec(line);
		if (key !== null && key[1].length < indent) {
			end = i;
			break;
		}
	}
	return [start, end];
}

/**
 * Set (or clear) `disabled:` on an entry block by id. Returns the new text,
 * or null when the id is not present in the patch.
 */
function setPatchDisabled(text, id, disabled) {
	const lines = text.split("\n");
	const range = patchBlockRange(lines, id);
	if (range === null) return null;
	const block = lines.slice(range[0], range[1]);
	const childIndent = /^(\s*)- id:/.exec(block[0])[1].length + 2;
	const has = block.findIndex((l) => /^\s*disabled:/.test(l));
	if (disabled && has < 0) block.splice(1, 0, `${" ".repeat(childIndent)}disabled: true`);
	else if (!disabled && has >= 0) block.splice(has, 1);
	else return text;
	return [...lines.slice(0, range[0]), ...block, ...lines.slice(range[1])].join("\n");
}

/**
 * Remove an entry block by id, plus its parent `- insert:` wrapper when the
 * wrapper would become empty. Returns the new text, or null when absent.
 */
function removePatchEntry(text, id) {
	const lines = text.split("\n");
	const range = patchBlockRange(lines, id);
	if (range === null) return null;
	// find the nearest enclosing `- insert:` line before the block
	let insertAt = -1;
	let insertIndent = -1;
	for (let i = range[0] - 1; i >= 0; i--) {
		const m = /^(\s*)- insert:/.exec(lines[i]);
		if (m !== null) {
			insertAt = i;
			insertIndent = m[1].length;
			break;
		}
	}
	const rest = lines.slice(range[1]);
	const kept = [...lines.slice(0, range[0]), ...rest];
	if (insertAt >= 0) {
		// does any other `- id:` survive inside the wrapper before the next
		// sibling (same-or-less indentation) or EOF? (empty lines and
		// comments do not end the wrapper)
		const tail = kept.slice(insertAt + 1);
		let orphan = true;
		for (const l of tail) {
			if (l.trim() === "" || l.trim().startsWith("#")) continue;
			const s = /^(\s*)- id:/.exec(l);
			if (s !== null && s[1].length > insertIndent) {
				orphan = false;
				break;
			}
			const k = /^(\s*)\S/.exec(l);
			if (k !== null && k[1].length <= insertIndent) break; // next sibling/key ends the wrapper
		}
		if (orphan) {
			// drop the wrapper line (and any immediately following blank line)
			const idx = kept.indexOf(lines[insertAt]);
			if (idx >= 0) {
				kept.splice(idx, 1);
				if (kept[idx] !== undefined && kept[idx].trim() === "") kept.splice(idx, 1);
			}
		}
	}
	return kept.join("\n");
}

/** Remote service backing the browser plugin-management UI. */
class SettingsNavManageService extends TypertRemoteService {
	static inject = ["loader"];
	constructor(ctx) {
		super(ctx, "settingsNavManage");
	}
	/** Profile user patch layer path (the only writable plugin surface). */
	patchPath() {
		return join(this.ctx.baseUrl ?? "", "cordis.patch.yml");
	}
	/** Read the ids+names currently written in the profile patch. */
	patchEntries() {
		try {
			const text = readFileSync(this.patchPath(), "utf8");
			const names = new Set();
			for (const m of text.matchAll(/^(\s*)- id:\s*(\S+)\s*$/gm)) {
				// the sibling `name:` line right below the id
				const after = text.slice(m.index + m[0].length).split("\n", 4);
				for (const line of after) {
					const n = /^\s*name:\s*(\S+)\s*$/.exec(line);
					if (n !== null) {
						names.add(n[1]);
						break;
					}
					if (line.trim() !== "" && !/^\s*(#|disabled:|config:|inject:)/.test(line)) break;
				}
			}
			return names;
		} catch (_ignored) {
			return new Set();
		}
	}
	findEntry(moduleName) {
		for (const entry of this.ctx.loader.entries()) {
			if (entry.options.name === moduleName && !entry.options.group) return entry;
		}
		return undefined;
	}
	/**
	 * List every loader entry with its runtime state and whether it is
	 * manageable from the profile patch layer.
	 */
	list() {
		const entries = [];
		const patchNames = this.patchEntries();
		for (const entry of this.ctx.loader.entries()) {
			if (entry.options.group) continue;
			entries.push({
				entryId: entry.id,
				moduleName: entry.options.name,
				enabled: !entry.disabled,
				fiberPhase: entry.fiber === undefined ? null : FIBER_PHASE[entry.fiber.state] ?? null,
				manageable: patchNames.has(entry.options.name)
			});
		}
		return success({ entries });
	}
	/** Disable or enable one profile-patch plugin (persisted + runtime effect). */
	async setEnabled(request) {
		const moduleName = typeof request?.moduleName === "string" ? request.moduleName : "";
		const enabled = request?.enabled === true;
		if (moduleName === "") return rejected({ code: "bad-request", message: "moduleName required" });
		const entry = this.findEntry(moduleName);
		if (entry === undefined) return rejected({ code: "not-found", message: `no loader entry named ${moduleName}` });
		if (entry.disabled === !enabled) return success({ changed: false });
		const next = setPatchDisabled(readFileSync(this.patchPath(), "utf8"), entry.id, !enabled);
		if (next === null) return rejected({ code: "not-manageable", message: `${moduleName} is not a profile-patch entry` });
		try {
			await entry.update({ disabled: !enabled }, false, true);
			writeFileSync(this.patchPath(), next, "utf8");
			return success({ changed: true });
		} catch (error) {
			return rejected({ code: "update-failed", message: error instanceof Error ? error.message : String(error) });
		}
	}
	/** Uninstall one profile-patch plugin: stop it, drop its patch row and dependency. */
	async uninstall(request) {
		const moduleName = typeof request?.moduleName === "string" ? request.moduleName : "";
		if (moduleName === "") return rejected({ code: "bad-request", message: "moduleName required" });
		const entry = this.findEntry(moduleName);
		if (entry === undefined) return rejected({ code: "not-found", message: `no loader entry named ${moduleName}` });
		const patch = this.patchPath();
		const next = removePatchEntry(readFileSync(patch, "utf8"), entry.id);
		if (next === null) return rejected({ code: "not-manageable", message: `${moduleName} is not a profile-patch entry` });
		try {
			if (!entry.disabled) await entry.update({ disabled: true }, false, true);
		} catch (_ignored) {
			/* best effort: the row is gone from the patch, restart will not load it */
		}
		try {
			writeFileSync(patch, next, "utf8");
			const pkgPath = join(this.ctx.baseUrl ?? "", "package.json");
			const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
			if (pkg.dependencies !== undefined && moduleName in pkg.dependencies) {
				delete pkg.dependencies[moduleName];
				writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
			}
		} catch (error) {
			return rejected({ code: "uninstall-failed", message: error instanceof Error ? error.message : String(error) });
		}
		return success({ removed: true });
	}
}

/** Provides no host-side behavior beyond the manage service. */
function apply(ctx) {
	new SettingsNavManageService(ctx);
}

export { apply, patchBlockRange, setPatchDisabled, removePatchEntry };
