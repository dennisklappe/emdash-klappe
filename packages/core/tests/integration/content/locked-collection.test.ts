import { it, expect, beforeEach, afterEach } from "vitest";

import {
	handleContentCreate,
	handleContentDelete,
	handleContentPermanentDelete,
	handleContentUpdate,
} from "../../../src/api/handlers/content.js";
import { ContentRepository } from "../../../src/database/repositories/content.js";
import { SchemaRegistry } from "../../../src/schema/registry.js";
import {
	describeEachDialect,
	setupForDialect,
	teardownForDialect,
	type DialectTestContext,
} from "../../utils/test-db.js";

describeEachDialect("locked collection create/delete enforcement", (dialect) => {
	let ctx: DialectTestContext;
	let lockedEntryId: string;

	beforeEach(async () => {
		ctx = await setupForDialect(dialect);

		const registry = new SchemaRegistry(ctx.db);

		// A locked collection: editable, but no creates or deletes.
		await registry.createCollection({
			slug: "pages",
			label: "Pages",
			labelSingular: "Page",
			supports: ["drafts", "locked"],
		});
		await registry.createField("pages", { slug: "title", label: "Title", type: "string" });

		// A normal collection for the control cases.
		await registry.createCollection({
			slug: "posts",
			label: "Posts",
			labelSingular: "Post",
			supports: ["drafts"],
		});
		await registry.createField("posts", { slug: "title", label: "Title", type: "string" });

		// Seed one existing page through the repository directly. This bypasses
		// the create handler's lock guard so the update/delete cases have a real
		// row to act on (simulating an entry created before the lock, or seeded).
		const repo = new ContentRepository(ctx.db);
		const seeded = await repo.create({
			type: "pages",
			slug: "home",
			data: { title: "Home" },
			status: "draft",
		});
		lockedEntryId = seeded.id;
	});

	afterEach(async () => {
		await teardownForDialect(ctx);
	});

	it("rejects creating an entry in a locked collection", async () => {
		const result = await handleContentCreate(ctx.db, "pages", {
			slug: "home",
			data: { title: "Home" },
		});
		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.error.code).toBe("FORBIDDEN");
	});

	it("still allows creating an entry in a normal collection", async () => {
		const result = await handleContentCreate(ctx.db, "posts", {
			slug: "first",
			data: { title: "First" },
		});
		expect(result.success).toBe(true);
	});

	it("allows editing an existing entry in a locked collection", async () => {
		const result = await handleContentUpdate(ctx.db, "pages", lockedEntryId, {
			data: { title: "Home (edited)" },
		});
		expect(result.success).toBe(true);
	});

	it("rejects moving a locked-collection entry to trash", async () => {
		const result = await handleContentDelete(ctx.db, "pages", lockedEntryId);
		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.error.code).toBe("FORBIDDEN");
	});

	it("rejects permanently deleting a locked-collection entry", async () => {
		const result = await handleContentPermanentDelete(ctx.db, "pages", lockedEntryId);
		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.error.code).toBe("FORBIDDEN");
	});
});
