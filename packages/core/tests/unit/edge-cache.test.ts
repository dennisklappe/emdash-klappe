import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("virtual:emdash/wait-until", () => ({ waitUntil: undefined }), { virtual: true });

import { handleContentCreate } from "../../src/api/index.js";
import type { Database } from "../../src/database/types.js";
import {
	__setEdgeCacheInvalidatorForTests,
	invalidateEdgeCache,
	type EdgeCacheInvalidator,
} from "../../src/edge-cache/index.js";
import { runWithContext } from "../../src/request-context.js";
import { invalidateSiteSettingsCache } from "../../src/settings/index.js";
import { setupTestDatabaseWithCollections, teardownTestDatabase } from "../utils/test-db.js";

/** Flush the microtask + macrotask queue so deferred `after()` purges land. */
async function flush(): Promise<void> {
	await new Promise((r) => setTimeout(r, 0));
}

function spyInvalidator(): EdgeCacheInvalidator & { purgeAll: ReturnType<typeof vi.fn> } {
	return {
		purgeAll: vi.fn(() => Promise.resolve()),
		purgeTags: vi.fn(() => Promise.resolve()),
	};
}

describe("invalidateEdgeCache", () => {
	afterEach(() => {
		__setEdgeCacheInvalidatorForTests(null);
	});

	it("purges once, deferred, when invoked", async () => {
		const inv = spyInvalidator();
		__setEdgeCacheInvalidatorForTests(inv);

		invalidateEdgeCache();
		// Deferred — nothing synchronous.
		expect(inv.purgeAll).not.toHaveBeenCalled();

		await flush();
		expect(inv.purgeAll).toHaveBeenCalledTimes(1);
	});

	it("coalesces a burst of calls into a single purge", async () => {
		const inv = spyInvalidator();
		__setEdgeCacheInvalidatorForTests(inv);

		for (let i = 0; i < 10; i++) invalidateEdgeCache();
		await flush();

		expect(inv.purgeAll).toHaveBeenCalledTimes(1);

		// A later write (after the coalescing window) purges again.
		invalidateEdgeCache();
		await flush();
		expect(inv.purgeAll).toHaveBeenCalledTimes(2);
	});

	it("is a no-op when no edge cache is configured", async () => {
		__setEdgeCacheInvalidatorForTests(null);
		expect(() => invalidateEdgeCache()).not.toThrow();
		await flush();
		// Nothing to assert beyond "did not throw" — there is no invalidator.
	});

	it("purges on a site-settings write (chrome seam)", async () => {
		const inv = spyInvalidator();
		__setEdgeCacheInvalidatorForTests(inv);

		invalidateSiteSettingsCache();
		await flush();

		expect(inv.purgeAll).toHaveBeenCalledTimes(1);
	});
});

describe("invalidateEdgeCache: content write seam", () => {
	let db: Kysely<Database>;

	beforeEach(async () => {
		db = await setupTestDatabaseWithCollections();
	});

	afterEach(async () => {
		__setEdgeCacheInvalidatorForTests(null);
		await teardownTestDatabase(db);
	});

	it("purges after creating content", async () => {
		const inv = spyInvalidator();
		__setEdgeCacheInvalidatorForTests(inv);

		const result = await runWithContext({ editMode: false, db }, () =>
			handleContentCreate(db, "post", { data: { title: "Hello" }, status: "published" }),
		);
		expect(result.success).toBe(true);

		await flush();
		expect(inv.purgeAll).toHaveBeenCalledTimes(1);
	});

	it("does not purge when no edge cache is configured", async () => {
		__setEdgeCacheInvalidatorForTests(null);

		await runWithContext({ editMode: false, db }, () =>
			handleContentCreate(db, "post", { data: { title: "Hello" }, status: "published" }),
		);
		await flush();
		// No invalidator → no purge calls (and no throw). Nothing to assert
		// beyond the absence of errors.
		expect(true).toBe(true);
	});
});
