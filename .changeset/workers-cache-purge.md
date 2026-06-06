---
"emdash": minor
"@emdash-cms/cloudflare": minor
---

Add optional purging of Cloudflare Workers Caching on content and chrome writes.

Workers Caching (the platform cache enabled with `cache: { enabled: true }` in Wrangler) sits in front of the Worker and serves HITs without running it, so a long `Cache-Control` max-age on public pages would otherwise serve stale HTML until the TTL lapses. When configured, EmDash now purges that cache on writes, so edits appear without waiting for TTL.

Off by default. Enable it with the `edgeCache` adapter:

```ts
import { workersCache } from "@emdash-cms/cloudflare";

emdash({
	database: d1({ binding: "DB" }),
	edgeCache: workersCache(), // mode: "purgeEverything" (default)
});
```

and enable the platform cache in `wrangler.jsonc` (`"cache": { "enabled": true }`) with a cacheable `Cache-Control` on public responses.

v1 uses `purgeEverything`: any content or chrome write (content create/update/delete/publish/unpublish/schedule, settings, taxonomies, menus, bylines, slug-change redirects) triggers a single `cache.purge({ purgeEverything: true })`. Purges are deferred via `after()` (never block the write response) and coalesced (a bulk import collapses into one purge, respecting the zone purge rate limit). On non-Cloudflare runtimes or older runtimes without `cache.purge`, it's a safe no-op. Tag-based purging (purge only affected pages) is planned behind the same config.

This is independent of, and complements, the Astro route cache (`cloudflareCache()`) and the data/object cache: Workers Caching (HTML, in front) → Worker → data cache → DB.

New API: `invalidateEdgeCache()` and the `EdgeCache*` types (from `emdash`), and `workersCache()` (from `@emdash-cms/cloudflare`). Existing sites are unaffected until they opt in.
