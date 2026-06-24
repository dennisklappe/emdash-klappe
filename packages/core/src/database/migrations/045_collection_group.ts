import type { Kysely } from "kysely";

import { columnExists } from "../dialect-helpers.js";

/**
 * Migration: collection sidebar group
 *
 * Adds a `group_name` column to `_emdash_collections` so each collection can
 * declare an optional sidebar group (for example "Pages"). Collections that
 * share a group are rendered together under a collapsible header in the admin
 * content sidebar. Collections without a group render ungrouped, as before.
 *
 * The column is named `group_name` (not `group`) because `group` is a reserved
 * SQL keyword. The add is guarded by `columnExists` so re-running a partially
 * applied migration (the migrator may replay trailing entries) is a no-op
 * rather than a "duplicate column" failure.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
	if (await columnExists(db, "_emdash_collections", "group_name")) return;

	await db.schema
		.alterTable("_emdash_collections")
		.addColumn("group_name", "text")
		.execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
	if (!(await columnExists(db, "_emdash_collections", "group_name"))) return;

	await db.schema.alterTable("_emdash_collections").dropColumn("group_name").execute();
}
