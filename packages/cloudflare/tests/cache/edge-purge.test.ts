import { afterEach, describe, expect, it, vi } from "vitest";

// Control whether cloudflare:workers exposes `cache.purge`, per-test.
const state = vi.hoisted(() => ({
	purge: undefined as undefined | ((opts: unknown) => Promise<unknown>),
}));

vi.mock("cloudflare:workers", () => ({
	get cache() {
		return state.purge ? { purge: state.purge } : undefined;
	},
}));

import { createEdgeCache } from "../../src/cache/edge.js";

describe("workersCache edge purge backend", () => {
	afterEach(() => {
		state.purge = undefined;
	});

	it("calls cache.purge({ purgeEverything: true }) on purgeAll", async () => {
		const purge = vi.fn(() => Promise.resolve());
		state.purge = purge;

		await createEdgeCache({ mode: "purgeEverything" }).purgeAll();

		expect(purge).toHaveBeenCalledTimes(1);
		expect(purge).toHaveBeenCalledWith({ purgeEverything: true });
	});

	it("calls cache.purge({ tags }) on purgeTags", async () => {
		const purge = vi.fn(() => Promise.resolve());
		state.purge = purge;

		await createEdgeCache({}).purgeTags(["content:posts", "entry:posts:1"]);

		expect(purge).toHaveBeenCalledWith({ tags: ["content:posts", "entry:posts:1"] });
	});

	it("no-ops purgeTags when given no tags", async () => {
		const purge = vi.fn(() => Promise.resolve());
		state.purge = purge;

		await createEdgeCache({}).purgeTags([]);

		expect(purge).not.toHaveBeenCalled();
	});

	it("no-ops gracefully when cache.purge is unavailable (older runtime / Node)", async () => {
		state.purge = undefined; // cloudflare:workers exposes no `cache`
		const backend = createEdgeCache({ mode: "purgeEverything" });

		await expect(backend.purgeAll()).resolves.toBeUndefined();
		await expect(backend.purgeTags(["x"])).resolves.toBeUndefined();
	});
});
