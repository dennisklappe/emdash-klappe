# emdash-klappe

A personal fork of [emdash](https://github.com/emdash-cms/emdash) (MIT licensed). The internal package names (`emdash`, `@emdash-cms/*`) are kept unchanged so updates from upstream stay easy to merge. This fork only adds a handful of features on top.

## Features added on top of emdash

- **Collection folders / groups.** Collections can declare an optional `group` (for example `group: "Pages"`). Collections that share a group are rendered together under a collapsible folder header in the admin content sidebar; collections without a group render ungrouped, as before.
- **Nested subfolders.** The `group` value is a slash-delimited path, so folders can nest: `group: "Pages/Legal"` puts a "Legal" subfolder inside "Pages", and each extra path segment nests one level deeper.
- **Locked collections.** A collection whose `supports` array includes `"locked"` can be edited but not created or deleted. This fits fixed collections that map one to one to hardcoded routes (a "Pages" or "Site sections" collection). The admin hides the "Add New" and delete controls, and the create / delete API handlers return 403.
- **Singleton collections.** A collection whose `supports` array includes `"singleton"` holds exactly one entry. Its sidebar item links straight to that entry's editor (no list step) and the content-list route redirects to it, so a one-of-a-kind page (a homepage, an "over ons" page) is edited in a single click. Implies `"locked"` (the single entry can be edited but not created or deleted).
- **Nested menu items.** The menu editor renders items as a WordPress-style tree: each child is indented under its parent with a connector guide, built client-side from the flat `parentId` list. Indent / outdent controls nest and promote items, and up/down reordering works per sibling group, all persisted through the existing reorder API. Flat menus render unchanged; orphan and cycle guards keep items from disappearing, and nesting depth is capped at four.
- **Field sections in the content editor.** Fields on the edit screen are grouped into collapsible section cards based on the part of each field's label before the first `:` or `›` (a field labelled `Hero: title` lands in a "Hero" section, which shows the field as just "title"). A page with many fields then reads as a handful of titled, collapsible groups instead of one long stack of inputs. Purely visual: field names, order, values, validation and storage are all unchanged; fields whose label has no separator are bundled into an "Algemeen" card, a field with a self-sectioning plugin widget (`blocks:*`) renders bare so the widget supplies its own sections, and distraction-free mode renders flat.

  **How to use it (no config):** name your fields so the section comes first, then a `:` or `›`, then the field name — e.g. `Hero: titel`, `Hero: intro`, `Cases › kop`. Consecutive fields that share the prefix become one collapsible card titled by that prefix. Nothing else is needed; the grouping is derived entirely from the labels, so it works on any collection in any project.

  **Make the sections mirror the page.** Pick the prefix to match the page's visual sections in top-to-bottom order (`Hero`, `Vacatures`, `Diensten`, `Cases`, `Reviews`, `Contact`, …). Then the editor reads like the live page: one collapsible card per page block, in the same order. Two practical notes: (1) the card order follows field order, so order your fields/keys to match the page; (2) a field whose own widget already renders sub-sections (e.g. a key/value "blocks" widget that groups its items) should render bare so it supplies its own cards rather than being wrapped again.

  Section cards use the `kumo` surface tokens (`bg-kumo-tint` / `border-kumo-line`) so they read correctly in both light and dark mode. Implemented in `packages/admin/src/components/ContentEditor.tsx` (search for `emdash-field-group`).

- **Inline-editing a single row of a JSON list field on the page.** Stock emdash visual editing edits whole fields in place: a `string`/`text` field becomes contenteditable, anything else opens the admin. This fork adds editing **one row of a list/JSON field** (e.g. a `teksten` list of `{ sleutel, label, waarde }` rows) directly on the page. This sidesteps the practical ceiling of "one DB column per editable text" (Cloudflare D1 caps a table at ~100 columns), so a page with hundreds of editable strings can keep them all in a single JSON field and still edit each one inline.

  **How it works:** put `data-emdash-ref` on the element with the field plus a `tekstKey` (the row's `sleutel`), e.g. `{ "collection": "...", "id": "...", "field": "teksten", "tekstKey": "hero.titel" }`. In edit mode the toolbar treats any ref carrying a `tekstKey` as inline-editable (regardless of the field's manifest kind), and on save it `GET`s the entry, updates the row whose `sleutel` matches, and `PUT`s the whole array back — so a misconfigured ref errors without writing (no corruption). Implemented in `packages/core/src/visual-editing/toolbar.ts` (search for `saveTekstRow` / `tekstKey`). Consuming code builds the ref by reading the list field's base ref from the edit proxy and adding `tekstKey` (a small `tekstRef(edit, field, key)` helper on the project side).

Together these let the admin content sidebar read like a real site map. With
`group` paths and `singleton`, collections render as nested folders where each
one-of-a-kind page opens its editor directly:

```
Blogs
Pages/                           group: "Pages"
├─ Landing pages/                group: "Pages/Landing pages"
│  ├─ Home                       (singleton → opens editor)
│  └─ Pricing                    (singleton)
├─ Legal/                        group: "Pages/Legal"
│  ├─ Privacy policy             (singleton)
│  └─ Terms                      (singleton)
├─ Locations                     (normal collection: list of entries)
└─ About                         (singleton → opens editor)
Marketing/                       group: "Marketing"
├─ Testimonials
└─ Partners
```

A folder with one slash segment (`"Pages"`) is a top-level folder; each extra
segment nests one level deeper. Items without a `group` stay ungrouped and render
inline, as before.

Everything else is unchanged from upstream emdash. The original project documentation follows.

## Plugins I built for emdash

These live in their own repositories and install as regular emdash plugins, so they stay decoupled from this fork. Anything that fits the plugin API lives here rather than as a fork patch.

- **[emdash-plugin-stars](https://github.com/dennisklappe/emdash-plugin-stars).** Edit an integer field as clickable stars instead of a number input. `options.max` sets how many stars show (default 5); the stored value stays a plain integer.
- **[emdash-plugin-blocks](https://github.com/dennisklappe/emdash-plugin-blocks).** Edit key/value copy as clean, labeled text fields without exposing the technical lookup keys the templates rely on.
- **[emdash-plugin-emailit](https://github.com/dennisklappe/emdash-plugin-emailit).** Send emdash's transactional email (magic links, invites, password resets) through Emailit.
- **[emdash-plugin-github-backup](https://github.com/dennisklappe/emdash-plugin-github-backup).** Back up CMS content to a GitHub repository folder on every edit, for file-based backups and a full git change history.

---

# EmDash

A full-stack TypeScript CMS built on [Astro](https://astro.build/) and [Cloudflare](https://www.cloudflare.com/). EmDash takes the ideas that made WordPress dominant -- extensibility, admin UX, a plugin ecosystem -- and rebuilds them on serverless, type-safe foundations. Plugins run in sandboxed Worker isolates, solving the fundamental security problem with WordPress's plugin architecture.

## Get Started

> [!IMPORTANT]
> EmDash depends on Dynamic Workers to run secure sandboxed plugins. Dynamic Workers are currently only available on paid accounts. [Upgrade your account](https://www.cloudflare.com/plans/developer-platform/) (starting at $5/mo) or comment out the `worker_loaders` block of your `wrangler.jsonc` configuration file to disable plugins.

```bash
npm create emdash@latest
```

Or deploy directly to your Cloudflare account:

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/emdash-cms/templates/tree/main/blog-cloudflare)

EmDash runs on Cloudflare (D1 + R2 + Workers) or any Node.js server with SQLite. No PHP, no separate hosting tier -- just deploy your Astro site.

## Templates

EmDash ships with three starter templates:

<table>
<tr>
<td width="33%" valign="top">

### Blog

<a href="assets/templates/blog/latest/"><img src="assets/templates/blog/latest/homepage-light-desktop.jpg" alt="Blog template" width="100%"></a>

A classic blog with sidebar widgets, search, and RSS.

- Categories & tags
- Full-text search
- Comment-ready
- RSS feed
- Dark / light mode

</td>
<td width="33%" valign="top">

### Marketing

<a href="assets/templates/marketing/latest/"><img src="assets/templates/marketing/latest/homepage-light-desktop.jpg" alt="Marketing template" width="100%"></a>

A conversion-focused landing page with pricing and contact form.

- Hero with CTAs
- Feature grid
- Pricing cards
- FAQ and contact form
- Dark / light mode

</td>
<td width="33%" valign="top">

### Portfolio

<a href="assets/templates/portfolio/latest/"><img src="assets/templates/portfolio/latest/work-light-desktop.jpg" alt="Portfolio template" width="100%"></a>

A visual portfolio for showcasing creative work.

- Project grid
- Tag filtering
- Case study pages
- RSS feed
- Dark / light mode
<br /><br />
</td>
</tr>
</table>

## Why EmDash?

**WordPress was built for a different era.** Running WordPress today means managing PHP alongside JavaScript, layering caches to get acceptable performance, and knowing that [96% of WordPress security vulnerabilities come from plugins](https://patchstack.com/whitepaper/state-of-wordpress-security-in-2024/). EmDash is what WordPress would look like if you started from scratch with today's tools.

**Sandboxed plugins.** WordPress plugins have full access to the database, filesystem, and user data. A single vulnerable plugin can compromise the entire site. EmDash plugins run in isolated [Worker sandboxes](https://developers.cloudflare.com/workers/runtime-apis/bindings/worker-loader/) via Dynamic Worker Loaders, each with a declared capability manifest. A plugin that requests `read:content` and `email:send` can do exactly that and nothing else.

```typescript
export default () =>
	definePlugin({
		id: "notify-on-publish",
		capabilities: ["read:content", "email:send"],
		hooks: {
			"content:afterSave": async (event, ctx) => {
				if (event.content.status !== "published") return;
				await ctx.email.send({
					to: "editors@example.com",
					subject: `New post: ${event.content.title}`,
				});
			},
		},
	});
```

**Structured content, not serialized HTML.** WordPress stores rich text as HTML with metadata embedded in comments -- tying your content to its DOM representation. EmDash uses [Portable Text](https://www.portabletext.org/), a structured JSON format that decouples content from presentation. Your content can render as a web page, a mobile app, an email, or an API response without parsing HTML.

**Built for agents.** EmDash ships with agent skills for building plugins and themes, a CLI that lets agents manage content and schema programmatically, and a built-in [MCP server](https://modelcontextprotocol.io/) so AI tools like Claude and ChatGPT can interact with your site directly.

**Runs anywhere.** EmDash uses portable abstractions at every layer -- Kysely for SQL, S3 API for storage -- that work with SQLite, D1, Turso, PostgreSQL, R2, AWS S3, or local files. It runs best on Cloudflare, but it's not locked to it.

## How It Works

EmDash is an Astro integration. Add it to your config and you get a complete CMS: admin panel, REST API, authentication, media library, and plugin system.

```typescript
// astro.config.mjs
import emdash from "emdash/astro";
import { d1 } from "emdash/db";

export default defineConfig({
	integrations: [emdash({ database: d1() })],
});
```

Content types are defined in the database, not in code. Non-developers create and modify collections through the admin UI. Each collection gets a real SQL table with typed columns. Developers generate TypeScript types from the live schema:

```bash
npx emdash types
```

Query content using Astro's Live Collections -- no rebuilds, no separate API:

```astro
---
import { getEmDashCollection } from "emdash";
const { entries: posts } = await getEmDashCollection("posts");
---

{posts.map((post) => <article>{post.data.title}</article>)}
```

## Features

**Content** -- Blog posts, pages, custom content types. Rich text editing via TipTap with Portable Text storage. Revisions, drafts, scheduled publishing, full-text search (FTS5), inline visual editing.

**Admin** -- Full admin panel with visual schema builder, media library (drag-drop uploads via signed URLs), navigation menus, taxonomies, widgets, and a WordPress import wizard.

**Auth** -- Passkey-first (WebAuthn) with OAuth and magic link fallbacks. Role-based access control: Administrator, Editor, Author, Contributor.

**Plugins** -- `definePlugin()` API with lifecycle hooks, KV storage, settings, admin pages, dashboard widgets, custom block types, and API routes. Sandboxed execution on Cloudflare via Dynamic Worker Loaders.

**Agents** -- Skill files for AI-assisted plugin and theme development. CLI for programmatic site management. Built-in MCP server for direct AI tool integration.

**WordPress migration** -- Import posts, pages, media, and taxonomies from WXR exports, the WordPress REST API, or WordPress.com. Agent skills help port plugins and themes.

## Portable Platforms

| Layer    | Cloudflare                  | Also works with                                     |
| -------- | --------------------------- | --------------------------------------------------- |
| Database | D1                          | SQLite, Turso/libSQL, PostgreSQL                    |
| Storage  | R2                          | AWS S3, any S3-compatible service, local filesystem |
| Sessions | KV                          | Redis, file-based                                   |
| Plugins  | Worker isolates (sandboxed) | In-process (safe mode)                              |

## Status

EmDash is in **beta preview**. We welcome contributions, feedback, plugins, themes, and ideas.

```bash
npm create emdash@latest
```

See the [documentation](https://docs.emdashcms.com/) for guides, API reference, and plugin development.

## Development

This is a pnpm monorepo. To contribute:

```bash
git clone https://github.com/emdash-cms/emdash.git && cd emdash
pnpm install
pnpm build
```

Run the demo (Node.js + SQLite, no Cloudflare account needed):

```bash
pnpm --filter emdash-demo seed
pnpm --filter emdash-demo dev
```

Open the admin at [http://localhost:4321/\_emdash/admin](http://localhost:4321/_emdash/admin).

```bash
pnpm test          # run all tests
pnpm typecheck     # type check
pnpm lint:quick    # fast lint (< 1s)
pnpm format        # format with oxfmt
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full contributor guide.

## Repository Structure

```
packages/
  core/           Astro integration, APIs, admin UI, CLI
  auth/           Authentication library
  blocks/         Portable Text block definitions
  cloudflare/     Cloudflare adapter (D1, R2, Worker Loader)
  plugins/        First-party plugins (forms, embeds, SEO, audit-log, etc.)
  create-emdash/  npm create emdash scaffolding
  gutenberg-to-portable-text/  WordPress block converter

templates/        Starter templates (blog, marketing, portfolio, starter, blank)
demos/            Development and example sites
docs/             Documentation site (Starlight)
```
