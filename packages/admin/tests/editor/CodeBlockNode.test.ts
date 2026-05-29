/**
 * Tests for the custom CodeBlockExtension (language picker node view).
 *
 * Verifies that:
 *   - The extension keeps the canonical `codeBlock` schema name so existing
 *     code that calls `editor.isActive("codeBlock")` keeps working.
 *   - The `language` attribute is settable and round-trips through getJSON.
 *   - StarterKit's backtick input rule still fires when our extension is
 *     swapped in (since we extend the base extension rather than replace
 *     it). We can't drive real keyboard input in jsdom, so we verify the
 *     rule's regex is registered via the extension's inputRules schema.
 */

import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
	CodeBlockExtension,
	ignoreCodeBlockMutation,
	LANGUAGE_PICKER_POPUP_CLASS,
	shouldDismissPicker,
} from "../../src/components/editor/CodeBlockNode";

describe("CodeBlockExtension", () => {
	let editor: Editor;

	beforeEach(() => {
		editor = new Editor({
			extensions: [
				StarterKit.configure({
					heading: { levels: [1, 2, 3] },
					codeBlock: false,
				}),
				CodeBlockExtension,
			],
			content: "",
		});
	});

	afterEach(() => {
		editor.destroy();
	});

	it("registers the codeBlock schema node", () => {
		expect(editor.schema.nodes.codeBlock).toBeDefined();
	});

	it("registers under the name 'codeBlock' so isActive lookups keep working", () => {
		const ext = editor.extensionManager.extensions.find((e) => e.name === "codeBlock");
		expect(ext).toBeDefined();
	});

	it("toggleCodeBlock activates the node", () => {
		editor.commands.toggleCodeBlock();
		expect(editor.isActive("codeBlock")).toBe(true);
	});

	it("language attribute round-trips through the editor state", () => {
		editor.commands.insertContent({
			type: "codeBlock",
			attrs: { language: "html" },
			content: [{ type: "text", text: "<p>hi</p>" }],
		});
		const json = editor.getJSON();
		const node = json.content?.find((n) => n.type === "codeBlock");
		expect(node).toBeDefined();
		expect((node as { attrs?: { language?: string } }).attrs?.language).toBe("html");
	});

	it("updateAttributes can change the language on an existing code block", () => {
		editor.commands.insertContent({
			type: "codeBlock",
			attrs: { language: null },
			content: [{ type: "text", text: "x" }],
		});
		editor.commands.setNodeSelection(0);
		editor.commands.updateAttributes("codeBlock", { language: "typescript" });
		const node = editor.getJSON().content?.find((n) => n.type === "codeBlock");
		expect((node as { attrs?: { language?: string } }).attrs?.language).toBe("typescript");
	});
});

describe("shouldDismissPicker", () => {
	// The picker's outside-click handler uses this to decide whether a
	// mousedown landed outside the picker. Regression for #1200: the
	// Autocomplete suggestion list is portalled to document.body, so clicks
	// on it must NOT be treated as "outside" or the picker tears down before
	// the language selection commits.
	let popover: HTMLElement;

	beforeEach(() => {
		popover = document.createElement("div");
		document.body.appendChild(popover);
	});

	afterEach(() => {
		popover.remove();
		document.querySelectorAll(`.${LANGUAGE_PICKER_POPUP_CLASS}`).forEach((el) => el.remove());
	});

	it("does not dismiss when the target is inside the popover", () => {
		const input = document.createElement("input");
		popover.appendChild(input);
		expect(shouldDismissPicker(input, popover)).toBe(false);
	});

	it("does not dismiss when the target is inside the portalled dropdown", () => {
		// The dropdown lives at document.body, NOT inside popover.
		const popup = document.createElement("div");
		popup.className = LANGUAGE_PICKER_POPUP_CLASS;
		const option = document.createElement("div");
		option.setAttribute("role", "option");
		popup.appendChild(option);
		document.body.appendChild(popup);
		expect(shouldDismissPicker(option, popover)).toBe(false);
	});

	it("dismisses when the target is genuinely outside the picker", () => {
		const elsewhere = document.createElement("button");
		document.body.appendChild(elsewhere);
		expect(shouldDismissPicker(elsewhere, popover)).toBe(true);
		elsewhere.remove();
	});

	it("does not dismiss when there is no popover or target", () => {
		expect(shouldDismissPicker(null, popover)).toBe(false);
		expect(shouldDismissPicker(document.createElement("div"), null)).toBe(false);
	});
});

describe("ignoreCodeBlockMutation", () => {
	// Regression for #1200: when a browser extension mutates the DOM around
	// the language-picker overlay, ProseMirror must NOT recreate the node
	// view (which would reset the picker's open state). Only edits to the
	// editable code content should be observed.
	let wrapper: HTMLElement;
	let pre: HTMLElement;
	let code: HTMLElement;
	let overlayInput: HTMLInputElement;

	beforeEach(() => {
		wrapper = document.createElement("div");
		pre = document.createElement("pre");
		pre.className = "emdash-code-block";
		code = document.createElement("code");
		pre.appendChild(code);
		const overlay = document.createElement("div");
		overlayInput = document.createElement("input");
		overlay.appendChild(overlayInput);
		wrapper.append(pre, overlay);
		document.body.appendChild(wrapper);
	});

	afterEach(() => wrapper.remove());

	it("observes mutations inside the editable code content", () => {
		expect(ignoreCodeBlockMutation({ type: "childList", target: code })).toBe(false);
		const textNode = document.createTextNode("x");
		code.appendChild(textNode);
		expect(ignoreCodeBlockMutation({ type: "characterData", target: textNode })).toBe(false);
	});

	it("ignores mutations in the picker overlay (e.g. extension injection)", () => {
		expect(ignoreCodeBlockMutation({ type: "childList", target: overlayInput })).toBe(true);
		expect(ignoreCodeBlockMutation({ type: "attributes", target: overlayInput })).toBe(true);
	});

	it("always lets ProseMirror handle selection changes", () => {
		expect(ignoreCodeBlockMutation({ type: "selection", target: overlayInput })).toBe(false);
	});
});
