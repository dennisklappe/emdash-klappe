---
"@emdash-cms/admin": minor
"emdash": minor
---

Add a `locked` collection support flag. A locked collection can be edited but not created or deleted, which fits fixed collections that map one to one to hardcoded routes (for example a "Pages" or "Site sections" collection). The admin hides the "Add New" button and the trash/delete controls and blocks the create form route, and the create, delete, and permanent-delete handlers return 403. Add `"locked"` to a collection's `supports` array to enable it.
