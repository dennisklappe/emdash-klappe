/**
 * Menu Editor component
 *
 * Edit menu items with basic reordering (simplified version without drag-and-drop)
 */

import { Button, Dialog, Input, Select, Toast } from "@cloudflare/kumo";
import { useLingui } from "@lingui/react/macro";
import {
	Plus,
	Trash,
	CaretUp,
	CaretDown,
	CaretLeft,
	CaretRight,
	Link as LinkIcon,
	X,
	File as FileIcon,
} from "@phosphor-icons/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import * as React from "react";

import {
	fetchMenu,
	createMenuItem,
	deleteMenuItem,
	updateMenuItem,
	reorderMenuItems,
	fetchMenuTranslations,
	createMenuTranslation,
	type MenuItem,
} from "../lib/api";
import { fetchManifest } from "../lib/api/client.js";
import { ArrowPrev } from "./ArrowIcons.js";
import { ContentPickerModal } from "./ContentPickerModal";
import { DialogError, getMutationError } from "./DialogError.js";
import { useI18nConfig } from "./LocaleSwitcher.js";
import { TranslationsPanel } from "./TranslationsPanel.js";

/**
 * A menu item paired with its computed nesting depth (0 = top level) for
 * rendering. We keep the original `MenuItem` plus a `depth` so the list can
 * indent children under their parent WordPress-style.
 */
interface FlatTreeItem {
	item: MenuItem;
	depth: number;
	/** Index of this item within its own sibling group (parent-scoped). */
	siblingIndex: number;
	/** Number of items sharing this item's parent. */
	siblingCount: number;
}

const MAX_MENU_DEPTH = 4;

/**
 * Turn the flat `parentId` list into a depth-first ordered list, where each
 * child immediately follows its parent and carries its nesting depth. Siblings
 * are ordered by `sortOrder` (falling back to array order). Items whose parent
 * is missing (orphans) are treated as top-level so nothing ever disappears,
 * keeping flat menus rendering exactly as before.
 */
function buildMenuTree(items: MenuItem[]): FlatTreeItem[] {
	const byId = new Map<string, MenuItem>();
	for (const item of items) byId.set(item.id, item);

	const childrenOf = new Map<string | null, MenuItem[]>();
	for (const item of items) {
		// Treat an unknown/missing parent as top-level (orphan safety).
		const parentKey = item.parentId && byId.has(item.parentId) ? item.parentId : null;
		const bucket = childrenOf.get(parentKey);
		if (bucket) bucket.push(item);
		else childrenOf.set(parentKey, [item]);
	}
	for (const bucket of childrenOf.values()) {
		bucket.sort((a, b) => a.sortOrder - b.sortOrder);
	}

	const result: FlatTreeItem[] = [];
	const seen = new Set<string>();
	const walk = (parentKey: string | null, depth: number) => {
		const bucket = childrenOf.get(parentKey) ?? [];
		bucket.forEach((item, siblingIndex) => {
			if (seen.has(item.id)) return; // cycle guard
			seen.add(item.id);
			result.push({ item, depth, siblingIndex, siblingCount: bucket.length });
			walk(item.id, depth + 1);
		});
	};
	walk(null, 0);

	// Safety net: if a cycle dropped items, append them flat at the end.
	if (result.length < items.length) {
		for (const item of items) {
			if (!seen.has(item.id)) {
				result.push({ item, depth: 0, siblingIndex: result.length, siblingCount: items.length });
				seen.add(item.id);
			}
		}
	}
	return result;
}

/**
 * Collect an item plus all of its descendants (used so re-parenting moves the
 * whole branch and so we can forbid making an item a child of itself).
 */
function collectSubtreeIds(items: MenuItem[], rootId: string): Set<string> {
	const ids = new Set<string>([rootId]);
	let changed = true;
	while (changed) {
		changed = false;
		for (const item of items) {
			if (item.parentId && ids.has(item.parentId) && !ids.has(item.id)) {
				ids.add(item.id);
				changed = true;
			}
		}
	}
	return ids;
}

/**
 * Recompute a normalised reorder payload from a tree, assigning each sibling a
 * contiguous `sortOrder` within its parent. This keeps the persisted ordering
 * stable after any indent/outdent/move.
 */
function toReorderPayload(
	tree: FlatTreeItem[],
): Array<{ id: string; parentId: string | null; sortOrder: number }> {
	const counters = new Map<string, number>();
	return tree.map(({ item }) => {
		const parentKey = item.parentId ?? "__root__";
		const next = counters.get(parentKey) ?? 0;
		counters.set(parentKey, next + 1);
		return { id: item.id, parentId: item.parentId, sortOrder: next };
	});
}

export function MenuEditor() {
	const { t } = useLingui();
	const { name } = useParams({ from: "/_admin/menus/$name" });
	const search = useSearch({ from: "/_admin/menus/$name" });
	const routeLocale = search.locale;
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const toastManager = Toast.useToastManager();
	const [isAddOpen, setIsAddOpen] = React.useState(false);
	const [isContentPickerOpen, setIsContentPickerOpen] = React.useState(false);
	const [editingItem, setEditingItem] = React.useState<MenuItem | null>(null);
	const [localItems, setLocalItems] = React.useState<MenuItem[]>([]);
	const [addError, setAddError] = React.useState<string | null>(null);
	const [editError, setEditError] = React.useState<string | null>(null);

	const { data: manifest } = useQuery({
		queryKey: ["manifest"],
		queryFn: fetchManifest,
	});
	const i18n = useI18nConfig(manifest);

	const { data: menu, isLoading } = useQuery({
		queryKey: ["menu", name, routeLocale ?? null],
		queryFn: () => fetchMenu(name, { locale: routeLocale }),
		staleTime: Infinity,
	});

	// The locale we lock mutations to: explicit URL param wins; else fall back
	// to whatever the loaded menu row says (handles entry from the old /menus/$name
	// URL without a locale query).
	const menuLocale = routeLocale ?? menu?.locale;

	const { data: translationsData } = useQuery({
		queryKey: ["menu-translations", name, menuLocale ?? null],
		queryFn: () => fetchMenuTranslations(name, { locale: menuLocale }),
		enabled: !!menu && !!i18n && i18n.locales.length > 1,
	});

	const translateMutation = useMutation({
		mutationFn: (targetLocale: string) =>
			createMenuTranslation(
				name,
				{ locale: targetLocale, label: menu?.label },
				{ locale: menuLocale },
			),
		onSuccess: (translated) => {
			void queryClient.invalidateQueries({ queryKey: ["menus"] });
			void queryClient.invalidateQueries({ queryKey: ["menu", name] });
			void queryClient.invalidateQueries({ queryKey: ["menu-translations", name] });
			toastManager.add({
				title: t`Translation created`,
				description: t`Menu "${translated.label}" (${translated.locale.toUpperCase()}) created.`,
			});
			// Switch the editor to the new locale so the user keeps editing.
			void navigate({
				to: "/menus/$name",
				params: { name },
				search: { locale: translated.locale },
			});
		},
		onError: (error: Error) => {
			toastManager.add({
				title: t`Error`,
				description: error.message,
				type: "error",
			});
		},
	});

	// Sync local items with fetched data
	React.useEffect(() => {
		if (menu?.items) {
			setLocalItems(menu.items);
		}
	}, [menu]);

	const createMutation = useMutation({
		mutationFn: (input: Parameters<typeof createMenuItem>[1]) =>
			createMenuItem(name, input, { locale: menuLocale }),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: ["menu", name] });
			setIsAddOpen(false);
			toastManager.add({ title: t`Item added`, description: t`Menu item has been added.` });
		},
		onError: (error: Error) => {
			setAddError(error.message);
		},
	});

	const deleteMutation = useMutation({
		mutationFn: (itemId: string) => deleteMenuItem(name, itemId, { locale: menuLocale }),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: ["menu", name] });
			toastManager.add({
				title: t`Item deleted`,
				description: t`Menu item has been deleted.`,
			});
		},
		onError: (error: Error) => {
			toastManager.add({
				title: t`Error`,
				description: error.message,
				type: "error",
			});
		},
	});

	const updateMutation = useMutation({
		mutationFn: ({
			itemId,
			input,
		}: {
			itemId: string;
			input: Parameters<typeof updateMenuItem>[2];
		}) => updateMenuItem(name, itemId, input, { locale: menuLocale }),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: ["menu", name] });
			setEditingItem(null);
			toastManager.add({
				title: t`Item updated`,
				description: t`Menu item has been updated.`,
			});
		},
		onError: (error: Error) => {
			setEditError(error.message);
		},
	});

	const reorderMutation = useMutation({
		mutationFn: (input: Parameters<typeof reorderMenuItems>[1]) =>
			reorderMenuItems(name, input, { locale: menuLocale }),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: ["menu", name] });
			toastManager.add({
				title: t`Order saved`,
				description: t`Menu order has been updated.`,
			});
		},
		onError: (error: Error) => {
			toastManager.add({
				title: t`Error`,
				description: error.message,
				type: "error",
			});
		},
	});

	const handleAddCustomLink = (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		setAddError(null);
		const formData = new FormData(e.currentTarget);
		const labelVal = formData.get("label");
		const urlVal = formData.get("url");
		const targetVal = formData.get("target");
		createMutation.mutate({
			type: "custom",
			label: typeof labelVal === "string" ? labelVal : "",
			customUrl: typeof urlVal === "string" ? urlVal : "",
			target: (typeof targetVal === "string" ? targetVal : "") || undefined,
		});
	};

	const handleAddContent = (item: { collection: string; id: string; title: string }) => {
		// The API's menuItemTypeEnum accepts singular values
		// ("custom" | "page" | "post" | "taxonomy" | "collection"), but the
		// ContentPickerModal hands us the collection slug (e.g. "pages",
		// "posts", or any custom collection slug). Map the slug to the
		// matching enum value and let the API resolve the real URL from
		// referenceCollection + referenceId.
		const type =
			item.collection === "pages" ? "page" : item.collection === "posts" ? "post" : "collection";
		createMutation.mutate({
			type,
			label: item.title,
			referenceCollection: item.collection,
			referenceId: item.id,
		});
	};

	const handleUpdateItem = (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		setEditError(null);
		if (!editingItem) return;
		const formData = new FormData(e.currentTarget);
		const uLabelVal = formData.get("label");
		const uUrlVal = formData.get("url");
		const uTargetVal = formData.get("target");
		updateMutation.mutate({
			itemId: editingItem.id,
			input: {
				label: typeof uLabelVal === "string" ? uLabelVal : "",
				customUrl:
					editingItem.type === "custom" ? (typeof uUrlVal === "string" ? uUrlVal : "") : undefined,
				target: (typeof uTargetVal === "string" ? uTargetVal : "") || undefined,
			},
		});
	};

	const tree = React.useMemo(() => buildMenuTree(localItems), [localItems]);

	/**
	 * Persist a freshly mutated copy of the items: optimistically update local
	 * state, recompute a normalised reorder payload from the resulting tree, and
	 * send it to the server.
	 */
	const persistItems = (nextItems: MenuItem[]) => {
		setLocalItems(nextItems);
		const payload = toReorderPayload(buildMenuTree(nextItems));
		reorderMutation.mutate({ items: payload });
	};

	/**
	 * Move an item up or down within its own sibling group (items sharing the
	 * same parent), swapping sortOrder with its neighbour. The whole subtree of
	 * the moved item travels with it because rendering rebuilds from parentId.
	 */
	const moveItem = (itemId: string, direction: "up" | "down") => {
		const current = localItems.find((i) => i.id === itemId);
		if (!current) return;
		const siblings = tree
			.filter((n) => n.item.parentId === current.parentId)
			.map((n) => n.item);
		const pos = siblings.findIndex((i) => i.id === itemId);
		const targetPos = direction === "up" ? pos - 1 : pos + 1;
		if (targetPos < 0 || targetPos >= siblings.length) return;
		const neighbour = siblings[targetPos];
		if (!neighbour) return;

		// Swap the two siblings' sortOrder values.
		const nextItems = localItems.map((item) => {
			if (item.id === current.id) return { ...item, sortOrder: neighbour.sortOrder };
			if (item.id === neighbour.id) return { ...item, sortOrder: current.sortOrder };
			return item;
		});
		persistItems(nextItems);
	};

	/**
	 * Indent: make this item a child of the sibling directly above it (the
	 * WordPress behaviour). No-op when there is no preceding sibling or when the
	 * resulting depth would exceed MAX_MENU_DEPTH.
	 */
	const indentItem = (itemId: string) => {
		const node = tree.find((n) => n.item.id === itemId);
		if (!node || node.siblingIndex === 0) return;
		const siblings = tree.filter((n) => n.item.parentId === node.item.parentId);
		const newParent = siblings[node.siblingIndex - 1]?.item;
		if (!newParent) return;

		// Respect a sane maximum depth (the item plus its deepest descendant).
		const subtree = collectSubtreeIds(localItems, itemId);
		const deepestInSubtree = Math.max(
			...tree.filter((n) => subtree.has(n.item.id)).map((n) => n.depth),
		);
		const addedDepth = node.depth + 1 - node.depth; // always 1
		if (deepestInSubtree + addedDepth > MAX_MENU_DEPTH - 1) return;

		// Append to the end of the new parent's existing children.
		const childCount = tree.filter((n) => n.item.parentId === newParent.id).length;
		const nextItems = localItems.map((item) =>
			item.id === itemId ? { ...item, parentId: newParent.id, sortOrder: childCount } : item,
		);
		persistItems(nextItems);
	};

	/**
	 * Outdent: promote this item to its grandparent's level, placing it directly
	 * after its former parent. No-op for items already at the top level.
	 */
	const outdentItem = (itemId: string) => {
		const node = tree.find((n) => n.item.id === itemId);
		if (!node || node.item.parentId === null) return;
		const parent = localItems.find((i) => i.id === node.item.parentId);
		if (!parent) return;
		const newParentId = parent.parentId; // grandparent (may be null)

		// Place it just after its former parent within the grandparent's group.
		const newSiblings = tree.filter((n) => n.item.parentId === newParentId).map((n) => n.item);
		const parentPos = newSiblings.findIndex((i) => i.id === parent.id);
		const insertOrder = parentPos + 1;

		const nextItems = localItems.map((item) => {
			if (item.id === itemId) return { ...item, parentId: newParentId, sortOrder: insertOrder - 0.5 };
			return item;
		});
		// Re-normalise sortOrder via the tree builder + payload pass.
		persistItems(nextItems);
	};

	if (isLoading) {
		return (
			<div className="flex items-center justify-center h-64">
				<div className="text-kumo-subtle">{t`Loading menu...`}</div>
			</div>
		);
	}

	if (!menu) {
		return (
			<div className="text-center py-12">
				<p className="text-kumo-subtle">{t`Menu not found`}</p>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-4">
					<Button
						variant="ghost"
						size="sm"
						aria-label={t`Back`}
						onClick={() => navigate({ to: "/menus" })}
					>
						<ArrowPrev className="h-4 w-4" />
					</Button>
					<div>
						<h1 className="text-3xl font-bold">{menu.label}</h1>
						<p className="text-kumo-subtle">{t`Edit menu items`}</p>
					</div>
				</div>
				<div className="flex gap-2">
					<Button
						icon={<FileIcon />}
						variant="outline"
						onClick={() => setIsContentPickerOpen(true)}
					>
						{t`Add Content`}
					</Button>
					<Dialog.Root
						open={isAddOpen}
						onOpenChange={(open) => {
							setIsAddOpen(open);
							if (!open) setAddError(null);
						}}
					>
						<Dialog.Trigger
							render={(props) => (
								<Button {...props} icon={<Plus />}>
									{t`Add Custom Link`}
								</Button>
							)}
						/>
						<Dialog className="p-6" size="lg">
							<div className="flex items-start justify-between gap-4 mb-4">
								<Dialog.Title className="text-lg font-semibold leading-none tracking-tight">
									{t`Add Custom Link`}
								</Dialog.Title>
								<Dialog.Close
									aria-label={t`Close`}
									render={(props) => (
										<Button
											{...props}
											variant="ghost"
											shape="square"
											aria-label={t`Close`}
											className="absolute end-4 top-4"
										>
											<X className="h-4 w-4" />
											<span className="sr-only">{t`Close`}</span>
										</Button>
									)}
								/>
							</div>
							<form onSubmit={handleAddCustomLink} className="space-y-4">
								<Input label={t`Label`} name="label" required placeholder={t`Home`} />
								<Input
									label={t`URL`}
									name="url"
									type="text"
									required
									pattern="(https?://.+|/.*)"
									title={t`Enter a URL (https://…) or a relative path (/…)`}
									placeholder={t`https://example.com or /about`}
								/>
								<Select
									label={t`Target`}
									name="target"
									defaultValue=""
									items={{ "": t`Same window`, _blank: t`New window` }}
								>
									<Select.Option value="">{t`Same window`}</Select.Option>
									<Select.Option value="_blank">{t`New window`}</Select.Option>
								</Select>
								<DialogError message={addError || getMutationError(createMutation.error)} />
								<div className="flex justify-end gap-2">
									<Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>
										{t`Cancel`}
									</Button>
									<Button type="submit" disabled={createMutation.isPending}>
										{createMutation.isPending ? t`Adding...` : t`Add`}
									</Button>
								</div>
							</form>
						</Dialog>
					</Dialog.Root>
				</div>
			</div>

			<ContentPickerModal
				open={isContentPickerOpen}
				onOpenChange={setIsContentPickerOpen}
				onSelect={handleAddContent}
			/>

			{i18n && i18n.locales.length > 1 && menu ? (
				<div className="border rounded-lg p-4">
					<TranslationsPanel
						locales={i18n.locales}
						defaultLocale={i18n.defaultLocale}
						currentLocale={menu.locale}
						translations={
							translationsData?.translations.map((tr) => ({ id: tr.id, locale: tr.locale })) ?? [
								{ id: menu.id, locale: menu.locale },
							]
						}
						onOpen={(tr) =>
							navigate({
								to: "/menus/$name",
								params: { name },
								search: { locale: tr.locale },
							})
						}
						onCreate={(target) => translateMutation.mutate(target)}
						pendingLocale={
							translateMutation.isPending ? (translateMutation.variables ?? null) : null
						}
					/>
				</div>
			) : null}

			{localItems.length === 0 ? (
				<div className="border rounded-lg p-12 text-center">
					<LinkIcon className="mx-auto h-12 w-12 text-kumo-subtle mb-4" />
					<h3 className="text-lg font-semibold mb-2">{t`No menu items yet`}</h3>
					<p className="text-kumo-subtle mb-4">{t`Add links to build your navigation menu`}</p>
					<div className="flex justify-center gap-2">
						<Button
							icon={<FileIcon />}
							variant="outline"
							onClick={() => setIsContentPickerOpen(true)}
						>
							{t`Add Content`}
						</Button>
						<Button icon={<Plus />} onClick={() => setIsAddOpen(true)}>
							{t`Add Custom Link`}
						</Button>
					</div>
				</div>
			) : (
				<ul className="space-y-2" role="tree" aria-label={menu.label}>
					{tree.map(({ item, depth, siblingIndex, siblingCount }) => {
						const isFirstSibling = siblingIndex === 0;
						const isLastSibling = siblingIndex === siblingCount - 1;
						const canIndent = !isFirstSibling && depth < MAX_MENU_DEPTH - 1;
						const canOutdent = item.parentId !== null;
						return (
							<li
								key={item.id}
								role="treeitem"
								aria-level={depth + 1}
								// Indent one step per nesting level. The padding (not margin)
								// keeps the connector guide aligned to the row's left edge.
								style={{ marginInlineStart: depth > 0 ? `${depth * 1.75}rem` : undefined }}
								className="relative"
							>
								{depth > 0 && (
									// Subtle WordPress-style connector: a vertical guide running
									// up into the parent plus a short elbow into this row.
									<span
										aria-hidden="true"
										className="pointer-events-none absolute -start-4 top-0 bottom-0 w-4"
									>
										<span className="absolute start-0 top-0 h-1/2 w-px bg-kumo-border" />
										<span className="absolute start-0 top-1/2 h-px w-3 bg-kumo-border" />
									</span>
								)}
								<div className="border rounded-lg p-4 flex items-center justify-between gap-3">
									<div className="flex-1 min-w-0">
										<div className="flex items-center gap-2">
											{depth > 0 && (
												<span className="inline-flex items-center rounded bg-kumo-base-200 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-kumo-subtle">
													{t`Sub`}
												</span>
											)}
											<span className="font-medium truncate">{item.label}</span>
										</div>
										<div className="text-sm text-kumo-subtle truncate">
											{item.type === "custom" ? (
												item.customUrl
											) : (
												<span className="inline-flex items-center rounded-full bg-kumo-brand/10 px-2 py-0.5 text-xs font-medium text-kumo-brand">
													{item.referenceCollection ?? item.type}
												</span>
											)}
											{item.target === "_blank" && t` (opens in new window)`}
										</div>
									</div>
									<div className="flex gap-1 shrink-0">
										<Button
											variant="ghost"
											size="sm"
											aria-label={t`Outdent (promote to parent level)`}
											onClick={() => outdentItem(item.id)}
											disabled={!canOutdent}
										>
											<CaretLeft className="h-4 w-4" />
										</Button>
										<Button
											variant="ghost"
											size="sm"
											aria-label={t`Indent (make a submenu item)`}
											onClick={() => indentItem(item.id)}
											disabled={!canIndent}
										>
											<CaretRight className="h-4 w-4" />
										</Button>
										<Button
											variant="ghost"
											size="sm"
											aria-label={t`Move up`}
											onClick={() => moveItem(item.id, "up")}
											disabled={isFirstSibling}
										>
											<CaretUp className="h-4 w-4" />
										</Button>
										<Button
											variant="ghost"
											size="sm"
											aria-label={t`Move down`}
											onClick={() => moveItem(item.id, "down")}
											disabled={isLastSibling}
										>
											<CaretDown className="h-4 w-4" />
										</Button>
										<Button variant="outline" size="sm" onClick={() => setEditingItem(item)}>
											{t`Edit`}
										</Button>
										<Button
											variant="outline"
											size="sm"
											aria-label={t`Delete`}
											onClick={() => deleteMutation.mutate(item.id)}
										>
											<Trash className="h-4 w-4" />
										</Button>
									</div>
								</div>
							</li>
						);
					})}
				</ul>
			)}

			<Dialog.Root
				open={editingItem !== null}
				onOpenChange={(open: boolean) => {
					if (!open) {
						setEditingItem(null);
						setEditError(null);
					}
				}}
			>
				<Dialog className="p-6" size="lg">
					<div className="flex items-start justify-between gap-4 mb-4">
						<Dialog.Title className="text-lg font-semibold leading-none tracking-tight">
							{t`Edit Menu Item`}
						</Dialog.Title>
						<Dialog.Close
							aria-label={t`Close`}
							render={(props) => (
								<Button
									{...props}
									variant="ghost"
									shape="square"
									aria-label={t`Close`}
									className="absolute end-4 top-4"
								>
									<X className="h-4 w-4" />
									<span className="sr-only">{t`Close`}</span>
								</Button>
							)}
						/>
					</div>
					{editingItem && (
						<form onSubmit={handleUpdateItem} className="space-y-4">
							<Input label={t`Label`} name="label" required defaultValue={editingItem.label} />
							{editingItem.type === "custom" && (
								<Input
									label={t`URL`}
									name="url"
									type="text"
									required
									pattern="(https?://.+|/.*)"
									title={t`Enter a URL (https://…) or a relative path (/…)`}
									defaultValue={editingItem.customUrl || ""}
								/>
							)}
							<Select
								label={t`Target`}
								name="target"
								defaultValue={editingItem.target || ""}
								items={{ "": t`Same window`, _blank: t`New window` }}
							>
								<Select.Option value="">{t`Same window`}</Select.Option>
								<Select.Option value="_blank">{t`New window`}</Select.Option>
							</Select>
							<DialogError message={editError || getMutationError(updateMutation.error)} />
							<div className="flex justify-end gap-2">
								<Button type="button" variant="outline" onClick={() => setEditingItem(null)}>
									{t`Cancel`}
								</Button>
								<Button type="submit" disabled={updateMutation.isPending}>
									{updateMutation.isPending ? t`Saving...` : t`Save`}
								</Button>
							</div>
						</form>
					)}
				</Dialog>
			</Dialog.Root>
		</div>
	);
}
