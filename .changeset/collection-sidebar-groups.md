---
"@emdash-cms/admin": minor
"emdash": minor
---

Add an optional `group` to collections. Collections that share a `group` value (for example `group: "Pages"`) are rendered together under a collapsible folder header in the admin content sidebar, while collections without a group render ungrouped as before. The group is stored on the collection definition (a new `group_name` column), exposed through the create and update collection APIs and the seed config, and surfaced in the admin manifest so the sidebar can render the folders.
