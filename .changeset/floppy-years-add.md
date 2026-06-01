---
"@emdash-cms/plugin-audit-log": patch
---

Fix under-declared capabilities in audit-log plugin (#1263)

The plugin manifest declared only `content:read`, but its registered hooks require `content:write` (for `content:beforeSave`) and `media:read` (for `media:afterUpload`). This caused the host hook gate to silently skip those hooks, disabling before/after diffs on content updates and all media-upload audit entries.
