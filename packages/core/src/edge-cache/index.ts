/**
 * Edge cache invalidation — purge the platform Workers Cache on writes.
 *
 * Optional and off by default: when no `edgeCache` descriptor is configured,
 * `virtual:emdash/edge-cache` exports `createEdgeCache = undefined`, the
 * invalidator resolves to `null`, and {@link invalidateEdgeCache} is a no-op.
 * Configure with `workersCache()` from `@emdash-cms/cloudflare`.
 *
 * Calls are coalesced and deferred: many writes within a tick collapse into a
 * single purge run via `after()`, so writes never block on the purge and a
 * bulk import doesn't fan out into one purge per row (respecting the shared
 * zone purge rate limit).
 *
 * The singleton invalidator lives on `globalThis` behind a `Symbol.for` key so
 * Vite SSR chunk duplication can't fork it (same pattern as request-context).
 */

import { after } from "../after.js";
import type { CreateEdgeCacheFn, EdgeCacheInvalidator, EdgeCacheRuntimeConfig } from "./types.js";

interface InvalidatorHolder {
	initialized: boolean;
	invalidator: EdgeCacheInvalidator | null;
	initPromise: Promise<EdgeCacheInvalidator | null> | null;
}

const HOLDER_KEY = Symbol.for("emdash:edge-cache:invalidator");
const PENDING_KEY = Symbol.for("emdash:edge-cache:pending");
const g = globalThis as Record<symbol, unknown>;

const holder: InvalidatorHolder =
	// eslint-disable-next-line typescript/no-unsafe-type-assertion -- globalThis singleton pattern (see request-context.ts)
	(g[HOLDER_KEY] as InvalidatorHolder | undefined) ??
	(() => {
		const h: InvalidatorHolder = { initialized: false, invalidator: null, initPromise: null };
		g[HOLDER_KEY] = h;
		return h;
	})();

/**
 * Resolve (once per isolate) the configured edge-cache invalidator from the
 * `virtual:emdash/edge-cache` module. Returns `null` when none is configured,
 * or when the virtual module can't be imported (Node/tests).
 */
async function getInvalidator(): Promise<EdgeCacheInvalidator | null> {
	if (holder.initialized) return holder.invalidator;
	if (holder.initPromise) return holder.initPromise;

	holder.initPromise = (async () => {
		try {
			const mod: {
				createEdgeCache?: CreateEdgeCacheFn;
				edgeCacheConfig?: EdgeCacheRuntimeConfig;
				// eslint-disable-next-line @typescript-eslint/ban-ts-comment
				// @ts-ignore - virtual module
			} = await import("virtual:emdash/edge-cache");
			holder.invalidator =
				typeof mod.createEdgeCache === "function"
					? mod.createEdgeCache(mod.edgeCacheConfig ?? {})
					: null;
		} catch {
			holder.invalidator = null;
		}
		holder.initialized = true;
		holder.initPromise = null;
		return holder.invalidator;
	})();

	return holder.initPromise;
}

/** Whether an edge-cache purge run is already scheduled for this tick. */
const pending = {
	get value(): boolean {
		return g[PENDING_KEY] === true;
	},
	set value(v: boolean) {
		g[PENDING_KEY] = v;
	},
};

/**
 * Test-only override of the invalidator, bypassing the virtual module.
 * @internal
 */
export function __setEdgeCacheInvalidatorForTests(invalidator: EdgeCacheInvalidator | null): void {
	holder.initialized = true;
	holder.initPromise = null;
	holder.invalidator = invalidator;
	pending.value = false;
}

/**
 * Invalidate the platform edge cache after a content or chrome write.
 *
 * Sync and non-blocking: the purge is deferred via `after()` and coalesced —
 * repeated calls within a tick result in a single purge run. No-ops when no
 * edge cache is configured, so it's safe to call unconditionally at write
 * seams.
 */
export function invalidateEdgeCache(): void {
	if (pending.value) return;
	pending.value = true;
	after(async () => {
		pending.value = false;
		try {
			const invalidator = await getInvalidator();
			if (!invalidator) return;
			await invalidator.purgeAll();
		} catch (error) {
			console.error("[edge-cache] purge failed:", error);
		}
	});
}

export type {
	EdgeCacheInvalidator,
	EdgeCacheDescriptor,
	EdgeCacheRuntimeConfig,
	CreateEdgeCacheFn,
} from "./types.js";
