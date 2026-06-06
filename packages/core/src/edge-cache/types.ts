/**
 * Edge cache (platform Workers Caching) invalidation types.
 *
 * "Workers Caching" is the Cloudflare platform cache enabled with
 * `cache: { enabled: true }` in Wrangler. It sits *in front of* the Worker:
 * on a HIT, Cloudflare returns the stored response without invoking the Worker
 * at all — so the in-process and object/data caches never run. It only
 * invalidates on TTL expiry or an explicit `cache.purge()`.
 *
 * This is the HTML-layer analogue of EmDash's on-write data-cache
 * invalidation: when content or chrome changes, the platform cache must be
 * purged so edits appear without waiting for TTL. The purge mechanism is
 * Cloudflare-specific (`import { cache } from "cloudflare:workers"`), so the
 * implementation lives in `@emdash-cms/cloudflare`; core only defines the
 * interface and calls it at the write seams.
 *
 * Distinct from `cloudflareCache()` (the Astro route-cache provider using the
 * Cache API + zone REST purge) and from the object/data cache — a
 * zone/Cache-API purge does NOT affect Workers Caching, so this needs its own
 * `cache.purge()`.
 */

/**
 * Invalidates the platform edge cache. Implementations must be safe to call
 * when nothing is cached and must never throw on the response path (callers
 * defer and swallow errors).
 */
export interface EdgeCacheInvalidator {
	/** Purge the entire edge cache for the calling entrypoint. */
	purgeAll(): Promise<void>;
	/**
	 * Purge only entries tagged with the given `Cache-Tag` values. Used by the
	 * (future) precise tag mode; v1 uses {@link purgeAll}.
	 */
	purgeTags(tags: string[]): Promise<void>;
}

/** Serializable descriptor for an edge-cache backend (mirrors StorageDescriptor). */
export interface EdgeCacheDescriptor {
	/** Module path exporting a `createEdgeCache` function. */
	entrypoint: string;
	/** Serializable config passed to `createEdgeCache` at runtime. */
	config: EdgeCacheRuntimeConfig;
}

/** Runtime config shared by edge-cache backends. */
export interface EdgeCacheRuntimeConfig {
	/**
	 * Invalidation strategy.
	 *
	 * - `"purgeEverything"` (default): purge the whole edge cache on any
	 *   content/chrome write. Coarse but correct; no response tagging needed.
	 *
	 * Tag-based purging (purge only the affected pages) is planned and will be
	 * enabled here once per-request `Cache-Tag` emission is in place.
	 */
	mode?: "purgeEverything";
	[key: string]: unknown;
}

/** Factory exported as `createEdgeCache` from a backend entrypoint. */
export type CreateEdgeCacheFn = (config: EdgeCacheRuntimeConfig) => EdgeCacheInvalidator;
