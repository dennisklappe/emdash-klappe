/**
 * WXR taxonomy import helpers.
 *
 * Bridges parsed WordPress taxonomy data (`WxrCategory`, `WxrTag`, `WxrTerm`,
 * and per-item `WxrPost.categories` / `WxrPost.tags` / `WxrPost.customTaxonomies`)
 * onto EmDash's term + content_taxonomies tables.
 *
 * Why this isn't inline in `execute.ts`: pre-creating all terms before any
 * post is created lets us (a) build a lookup once for every (taxonomy, slug)
 * the import needs, and (b) keep the per-post attachment loop cheap. It also
 * makes the logic testable without spinning up an Astro request.
 *
 * Behaviour:
 *   - `wp:category` -> EmDash `category` taxonomy (seeded by migration 006).
 *   - `wp:tag`      -> EmDash `tag` taxonomy.
 *   - `wp:term`     -> matching EmDash taxonomy by `name` (case-sensitive).
 *                      If no matching def exists in the target locale, the
 *                      term is skipped — we don't auto-create defs because
 *                      the user controls their schema through the admin.
 *   - Terms are created idempotently by `(taxonomy, slug, locale)`. Existing
 *     terms are reused.
 *   - Assignments respect the def's `collections` array. If the post's target
 *     collection isn't listed on the taxonomy def, the assignment is skipped
 *     (matches admin UI behaviour: you can't tag a "products" post with a
 *     "category" if `category.collections` only includes "posts").
 */

import type { Kysely } from "kysely";

import type { WxrCategory, WxrPost, WxrTag, WxrTerm } from "../cli/wxr/parser.js";
import { TaxonomyRepository } from "../database/repositories/taxonomy.js";
import type { Database } from "../database/types.js";
import { invalidateTermCache } from "../taxonomies/index.js";

/**
 * Result of pre-importing taxonomy terms from a WXR file.
 */
export interface TaxonomyImportPlan {
	/** terms created during this run (per taxonomy name) */
	termsCreated: Record<string, number>;
	/** terms that already existed and were reused (per taxonomy name) */
	termsReused: Record<string, number>;
	/** custom taxonomies (`wp:term`) skipped because no matching EmDash def exists */
	missingTaxonomies: string[];
	/**
	 * Lookup table: `taxonomy name` -> `term slug` -> term id.
	 * Used by `attachPostTaxonomies` to translate WXR assignments into pivot rows.
	 */
	termIdByNameAndSlug: Map<string, Map<string, string>>;
	/**
	 * Lookup table: `taxonomy name` -> set of collection slugs the def allows.
	 * Empty (or missing) means "any collection" — we only enforce the filter
	 * when the def explicitly lists collections.
	 */
	collectionsByTaxonomy: Map<string, Set<string>>;
}

/**
 * Track running counts plus the lookup maps.
 */
interface TaxonomyImportState {
	plan: TaxonomyImportPlan;
}

function makeState(): TaxonomyImportState {
	return {
		plan: {
			termsCreated: {},
			termsReused: {},
			missingTaxonomies: [],
			termIdByNameAndSlug: new Map(),
			collectionsByTaxonomy: new Map(),
		},
	};
}

/**
 * Record-keeping helpers — keep mutations centralised so the result object
 * stays consistent.
 */
function bump(record: Record<string, number>, key: string): void {
	record[key] = (record[key] ?? 0) + 1;
}

function rememberTerm(
	state: TaxonomyImportState,
	taxonomyName: string,
	slug: string,
	termId: string,
): void {
	let bySlug = state.plan.termIdByNameAndSlug.get(taxonomyName);
	if (!bySlug) {
		bySlug = new Map();
		state.plan.termIdByNameAndSlug.set(taxonomyName, bySlug);
	}
	bySlug.set(slug, termId);
}

/**
 * Look up an EmDash taxonomy def by name. Definitions are per-locale but
 * `(name, locale)` uniquely identifies one — when no locale is supplied we
 * take the lowest-locale-code match (deterministic across calls) so a single-
 * locale install behaves identically.
 */
async function findTaxonomyDef(
	db: Kysely<Database>,
	name: string,
	locale: string | undefined,
): Promise<{ id: string; collections: string[] } | null> {
	let query = db.selectFrom("_emdash_taxonomy_defs").selectAll().where("name", "=", name);
	if (locale !== undefined) query = query.where("locale", "=", locale);
	const row = await query.orderBy("locale", "asc").executeTakeFirst();
	if (!row) return null;
	let collections: string[] = [];
	if (row.collections) {
		try {
			const parsed: unknown = JSON.parse(row.collections);
			if (Array.isArray(parsed)) {
				collections = parsed.filter((c): c is string => typeof c === "string");
			}
		} catch {
			// malformed JSON in the def — treat as "no collection filter"
			collections = [];
		}
	}
	return { id: row.id, collections };
}

/**
 * Find or create a term in the given taxonomy. Returns the term id. Callers
 * must verify the taxonomy def exists before calling — this helper assumes
 * the def is present.
 *
 * Note: we don't resolve WordPress parent slugs into EmDash parent ids in
 * this pass. WXR exports list categories in arbitrary order, so a category's
 * parent may not exist yet when we first see it. Hierarchy is preserved at
 * the data level (the parent slug is on `WxrCategory.parent`) but flattens
 * in EmDash for now; restoring the tree is a follow-up improvement.
 */
async function ensureTerm(
	repo: TaxonomyRepository,
	state: TaxonomyImportState,
	taxonomyName: string,
	slug: string,
	label: string,
	description: string | undefined,
	locale: string | undefined,
): Promise<string> {
	// Already resolved in this run (e.g. seen in `wp:category` AND in a per-
	// item `<category>` element).
	const cached = state.plan.termIdByNameAndSlug.get(taxonomyName)?.get(slug);
	if (cached) return cached;

	const existing = await repo.findBySlug(taxonomyName, slug, locale);
	if (existing) {
		bump(state.plan.termsReused, taxonomyName);
		rememberTerm(state, taxonomyName, slug, existing.id);
		return existing.id;
	}

	const created = await repo.create({
		name: taxonomyName,
		slug,
		label,
		data: description ? { description } : undefined,
		locale,
	});
	bump(state.plan.termsCreated, taxonomyName);
	rememberTerm(state, taxonomyName, slug, created.id);
	return created.id;
}

/**
 * Pre-import every term referenced by the WXR file.
 *
 * Pass 1: `wp:category` blocks. Each becomes a term in EmDash's seeded
 *         `category` taxonomy.
 * Pass 2: `wp:tag` blocks. Each becomes a term in `tag`.
 * Pass 3: `wp:term` blocks (custom taxonomies). Skipped when no matching
 *         EmDash def exists.
 * Pass 4: per-item `<category domain="…" nicename="…">` assignments. WXR
 *         exports sometimes reference taxonomies/terms that weren't declared
 *         at the top level (older exports especially), so we backfill terms
 *         from per-item assignments. Categories and tags use the seeded defs
 *         and pick up the assignment text as the label; custom domains fall
 *         back to the same "def must exist" rule.
 */
export async function preImportWxrTaxonomies(
	db: Kysely<Database>,
	posts: WxrPost[],
	categories: WxrCategory[],
	tags: WxrTag[],
	terms: WxrTerm[],
	locale: string | undefined,
): Promise<TaxonomyImportPlan> {
	const state = makeState();
	const repo = new TaxonomyRepository(db);

	// Cache def lookups for the duration of the import. Keyed by name; value
	// is `null` when we've already determined the def is missing in this
	// locale (so we only report the "missing" warning once per taxonomy).
	const defCache = new Map<string, { id: string; collections: string[] } | null>();
	const lookupDef = async (name: string): Promise<{ id: string; collections: string[] } | null> => {
		if (defCache.has(name)) return defCache.get(name) ?? null;
		const def = await findTaxonomyDef(db, name, locale);
		defCache.set(name, def);
		if (def) {
			state.plan.collectionsByTaxonomy.set(name, new Set(def.collections));
		}
		return def;
	};

	// Pass 1: top-level <wp:category> blocks -> EmDash `category` taxonomy.
	const categoryDef = await lookupDef("category");
	if (categoryDef) {
		for (const cat of categories) {
			const slug = cat.nicename;
			const label = cat.name;
			if (!slug || !label) continue;
			await ensureTerm(repo, state, "category", slug, label, cat.description, locale);
		}
	} else if (categories.length > 0) {
		// Seeded `category` def was deleted by the user — record so the
		// import response can surface why none of the categories landed.
		state.plan.missingTaxonomies.push("category");
	}

	// Pass 2: top-level <wp:tag> blocks -> EmDash `tag` taxonomy.
	const tagDef = await lookupDef("tag");
	if (tagDef) {
		for (const tag of tags) {
			const slug = tag.slug;
			const label = tag.name;
			if (!slug || !label) continue;
			await ensureTerm(repo, state, "tag", slug, label, tag.description, locale);
		}
	} else if (tags.length > 0) {
		state.plan.missingTaxonomies.push("tag");
	}

	// Pass 3: <wp:term> blocks for custom taxonomies (genre, etc.). We skip
	// `nav_menu` here — menus are handled by `importMenusFromWxr` which has
	// its own model.
	for (const term of terms) {
		if (term.taxonomy === "nav_menu") continue;
		// Normalize WordPress' `post_tag` synonym -> EmDash `tag`. WordPress
		// emits `<wp:tag>` for some exports and `<wp:term wp:term_taxonomy="post_tag">`
		// for others; both must land in the same EmDash taxonomy.
		const taxonomyName = term.taxonomy === "post_tag" ? "tag" : term.taxonomy;
		const def = await lookupDef(taxonomyName);
		if (!def) {
			if (!state.plan.missingTaxonomies.includes(taxonomyName)) {
				state.plan.missingTaxonomies.push(taxonomyName);
			}
			continue;
		}
		await ensureTerm(repo, state, taxonomyName, term.slug, term.name, term.description, locale);
	}

	// Pass 4: per-item assignments. Backfills terms missing from the top-level
	// blocks (rare, but observed in hand-edited or partial exports).
	let recordedMissingCategoryFromPosts = false;
	let recordedMissingTagFromPosts = false;
	for (const post of posts) {
		for (const slug of post.categories) {
			if (!categoryDef) {
				if (
					!recordedMissingCategoryFromPosts &&
					!state.plan.missingTaxonomies.includes("category")
				) {
					state.plan.missingTaxonomies.push("category");
					recordedMissingCategoryFromPosts = true;
				}
				break;
			}
			if (state.plan.termIdByNameAndSlug.get("category")?.has(slug)) continue;
			// Use the slug as a stand-in label — these came from per-item
			// elements where the text content is the term label. We don't
			// have it on the WxrPost (parser drops it), so the slug is the
			// best we can do.
			await ensureTerm(repo, state, "category", slug, slug, undefined, locale);
		}
		for (const slug of post.tags) {
			if (!tagDef) {
				if (!recordedMissingTagFromPosts && !state.plan.missingTaxonomies.includes("tag")) {
					state.plan.missingTaxonomies.push("tag");
					recordedMissingTagFromPosts = true;
				}
				break;
			}
			if (state.plan.termIdByNameAndSlug.get("tag")?.has(slug)) continue;
			await ensureTerm(repo, state, "tag", slug, slug, undefined, locale);
		}
		if (post.customTaxonomies) {
			for (const [rawName, slugs] of post.customTaxonomies) {
				if (rawName === "nav_menu") continue;
				const taxonomyName = rawName === "post_tag" ? "tag" : rawName;
				const def = await lookupDef(taxonomyName);
				if (!def) {
					if (!state.plan.missingTaxonomies.includes(taxonomyName)) {
						state.plan.missingTaxonomies.push(taxonomyName);
					}
					continue;
				}
				for (const slug of slugs) {
					if (state.plan.termIdByNameAndSlug.get(taxonomyName)?.has(slug)) continue;
					await ensureTerm(repo, state, taxonomyName, slug, slug, undefined, locale);
				}
			}
		}
	}

	// `content_taxonomies` writes happen later in `attachPostTaxonomies`, but
	// term inserts above already invalidate the in-memory "has any terms" probe.
	// We flush once at the end of the pre-import to keep the runtime cache hot.
	invalidateTermCache();

	return state.plan;
}

/**
 * Attach the taxonomy assignments parsed for a single WXR post to a freshly-
 * created EmDash content row.
 *
 * Returns the number of pivot rows written, so the caller can roll them up
 * into the import summary.
 */
export async function attachPostTaxonomies(
	db: Kysely<Database>,
	collection: string,
	entryId: string,
	post: WxrPost,
	plan: TaxonomyImportPlan,
): Promise<number> {
	const repo = new TaxonomyRepository(db);
	let attached = 0;

	const tryAttach = async (taxonomyName: string, slug: string): Promise<void> => {
		const termId = plan.termIdByNameAndSlug.get(taxonomyName)?.get(slug);
		if (!termId) return;
		const collectionFilter = plan.collectionsByTaxonomy.get(taxonomyName);
		// Empty set means "no filter" (def has no collections array). A non-
		// empty set is enforced: skip assignments to collections the def
		// doesn't list. This matches admin UI: a `category` term linked only
		// to `posts` shouldn't end up on a `products` row just because the
		// WXR happened to mention it.
		if (collectionFilter && collectionFilter.size > 0 && !collectionFilter.has(collection)) {
			return;
		}
		await repo.attachToEntry(collection, entryId, termId);
		attached++;
	};

	for (const slug of post.categories) {
		await tryAttach("category", slug);
	}
	for (const slug of post.tags) {
		await tryAttach("tag", slug);
	}
	if (post.customTaxonomies) {
		for (const [rawName, slugs] of post.customTaxonomies) {
			if (rawName === "nav_menu") continue;
			const taxonomyName = rawName === "post_tag" ? "tag" : rawName;
			for (const slug of slugs) {
				await tryAttach(taxonomyName, slug);
			}
		}
	}

	return attached;
}
