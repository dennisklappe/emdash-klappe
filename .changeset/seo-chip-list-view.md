---
"@emdash-cms/admin": patch
---

Fix Content Types list view not showing the `seo` feature chip after enabling SEO on a collection. SEO state lives on the dedicated `hasSeo` field (the editor strips `"seo"` from `supports` before saving), so the list view now synthesizes the chip from `collection.hasSeo` in addition to `collection.supports`. (#1153)
