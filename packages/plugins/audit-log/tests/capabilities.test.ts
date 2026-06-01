/**
 * Reproduces emdash/emdash#1263
 *
 * `@emdash-cms/plugin-audit-log@0.2.0` declares capabilities `["content:read"]`
 * in its plugin manifest, but its sandbox entry registers hooks that require
 * additional capabilities. Under emdash@0.15's hook gate, hooks declared
 * without the required capability are silently skipped at registration time:
 *
 *   content:beforeSave  -> requires content:write
 *   media:afterUpload   -> requires media:read
 *
 * That mismatch silently disables before/after diffs on content updates and
 * disables media upload audit entries entirely.
 *
 * This test reads the built manifest (`dist/manifest.json`) directly so the
 * assertion mirrors what the host runtime actually consumes.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, it, expect } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Hook -> required capability map mirrors
// `HookPipeline.HOOK_REQUIRED_CAPABILITY` in
// packages/core/src/plugins/hooks.ts. If the host updates the map, this
// table needs to follow.
const HOOK_REQUIRED_CAPABILITY: Record<string, string> = {
	"email:beforeSend": "hooks.email-events:register",
	"email:afterSend": "hooks.email-events:register",
	"email:deliver": "hooks.email-transport:register",
	"content:beforeSave": "content:write",
	"content:afterSave": "content:read",
	"content:beforeDelete": "content:read",
	"content:afterDelete": "content:read",
	"content:afterPublish": "content:read",
	"content:afterUnpublish": "content:read",
	"media:beforeUpload": "media:write",
	"media:afterUpload": "media:read",
	"comment:beforeCreate": "users:read",
	"comment:moderate": "users:read",
	"comment:afterCreate": "users:read",
	"comment:afterModerate": "users:read",
	"page:fragments": "hooks.page-fragments:register",
};

interface Manifest {
	id: string;
	capabilities: string[];
	hooks: string[];
}

describe("audit-log plugin manifest", () => {
	it("reproduces #1263: declares every capability its registered hooks require", () => {
		const manifestPath = resolve(__dirname, "..", "dist", "manifest.json");
		const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;

		const requiredByHooks = new Set<string>();
		const missing: Array<{ hook: string; capability: string }> = [];

		for (const hook of manifest.hooks) {
			const cap = HOOK_REQUIRED_CAPABILITY[hook];
			if (!cap) continue;
			requiredByHooks.add(cap);
			if (!manifest.capabilities.includes(cap)) {
				missing.push({ hook, capability: cap });
			}
		}

		// Fail with a list of (hook, missing capability) pairs so the diagnose
		// stage sees the exact mismatch.
		expect(missing).toEqual([]);
		// Sanity check: the union of all required caps should be a subset of
		// the declared caps. Equivalent to `missing.length === 0` but reads
		// cleanly in the failure output.
		for (const cap of requiredByHooks) {
			expect(manifest.capabilities).toContain(cap);
		}
	});
});
