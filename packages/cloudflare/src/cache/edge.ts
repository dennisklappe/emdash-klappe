/**
 * Cloudflare Workers Caching purge backend — RUNTIME ENTRY
 *
 * Purges the platform cache that sits in front of the Worker, via
 * `cache.purge()` from `cloudflare:workers`. EmDash calls this on content and
 * chrome writes so edits appear on cached public pages without waiting for TTL.
 *
 * Entrypoint scoping (critical): Workers Caching purge is scoped to the
 * entrypoint that calls it, and the cache is keyed by entrypoint + path +
 * query + ctx.props. Public pages and EmDash's content-write API routes both
 * run under the Worker's DEFAULT entrypoint, so this purge must run from the
 * default entrypoint to hit the page cache. It must NOT be called from a named
 * entrypoint (e.g. the PluginBridge export), which has a different cache.
 * EmDash invokes it from the request/`after()` path of the default worker, so
 * this holds.
 *
 * Distinct from `cloudflareCache()` (Astro route cache via the Cache API + zone
 * REST purge): a zone/Cache-API purge does not affect Workers Caching.
 *
 * Do NOT import this at config time — use `workersCache()` from
 * `@emdash-cms/cloudflare`.
 */

import * as cfWorkers from "cloudflare:workers";
import type { CreateEdgeCacheFn, EdgeCacheInvalidator } from "emdash";

/** Shape of the optional `cache` export on `cloudflare:workers`. */
interface WorkersCacheApi {
	purge?: (options: { purgeEverything?: boolean; tags?: string[] }) => Promise<unknown>;
}

/**
 * Feature-detect `cache.purge`. It exists only on a Cloudflare Worker with
 * Workers Caching enabled (`cache: { enabled: true }`) on a recent runtime.
 * Accessed via a namespace import so a missing `cache` export doesn't break
 * module loading on older runtimes — it's simply `undefined`.
 */
function getPurge(): WorkersCacheApi["purge"] | undefined {
	// eslint-disable-next-line typescript/no-unsafe-type-assertion -- optional newer export; undefined on older runtimes
	const cache = (cfWorkers as { cache?: WorkersCacheApi }).cache;
	return typeof cache?.purge === "function" ? cache.purge.bind(cache) : undefined;
}

export const createEdgeCache: CreateEdgeCacheFn = (_config): EdgeCacheInvalidator => {
	return {
		async purgeAll(): Promise<void> {
			const purge = getPurge();
			if (!purge) return; // No-op on Node/tests/older runtimes.
			await purge({ purgeEverything: true });
		},
		async purgeTags(tags: string[]): Promise<void> {
			if (tags.length === 0) return;
			const purge = getPurge();
			if (!purge) return;
			await purge({ tags });
		},
	};
};
