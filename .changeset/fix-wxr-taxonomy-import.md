---
"emdash": patch
---

Fixes WordPress WXR import (admin UI → Import → WordPress) silently discarding categories, tags, and custom taxonomy assignments. The parser correctly extracts `wp:category`, `wp:tag`, `wp:term`, and per-item `<category domain="…">` data, but the HTTP execute handler never wrote terms to `taxonomies` or pivot rows to `content_taxonomies`. Now creates terms idempotently in the seeded `category` / `tag` taxonomies (and any custom taxonomies that have a matching EmDash definition), attaches them to imported posts, and reports the result counts in the import response. Custom taxonomies without a matching EmDash definition are surfaced as `missingTaxonomies` rather than silently dropped.
