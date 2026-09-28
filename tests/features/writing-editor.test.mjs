// The writing editor: CodeMirror 6 behind the writing surfaces' textareas
// (2026-09-25, the TeachText redesign).
//
// What this pins, each one a thing that was built on purpose or a trap that
// was hit while building it:
//
//   A  the editor is a lazy vendor file, declared everywhere a lazy runtime
//      file must be, so it never rides the boot floppy;
//   B  the textarea stays the API: the facade answers value / selection /
//      scroll / focus for the thirty-odd modules that talk to a textarea, and
//      document.activeElement keeps naming the textarea while CodeMirror asks
//      its own root the real question;
//   C  the editor is laid on the paper absolutely. CodeMirror's base theme pins
//      its root to position: relative !important; losing that override lets the
//      editor grow to the document's full length and an overflow-hidden
//      ancestor scroll instead of the editor (found 2026-09-25);
//   D  the Format menu: contextual (a fifth stable menu breaks the menu-bar
//      rule), every row a command the editor can run, every key equivalent
//      display-only because the editor answers the keys itself;
//   E  the phone keeps ONE row: while the keyboard is up the format bar takes
//      the place of the four buttons, and 听写 lives in it;
//   F  the textarea overlay is the fallback, not dead code: one stored switch
//      puts every surface back on it;
//   G  heading navigation is a document command (Writing › Go to Heading…,
//      Commands…), never a second identity in the status bar: a § crumb there
//      put the section beside the document's name, and on the first heading
//      showed the document's title twice (HIG: one identity in that slot).

import { readFileSync } from "node:fs";
import vm from "node:vm";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("writing-editor");
const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const tool = (path) => readFileSync(join(repo, path), "utf8");

const entry = tool("tooling/vendor/writing-editor/entry.mjs");
const facade = tool("tooling/vendor/writing-editor/facade.mjs");
const style = tool("tooling/vendor/writing-editor/style.mjs");
const ui = tool("tooling/vendor/writing-editor/ui.mjs");
const format = tool("tooling/vendor/writing-editor/format.mjs");
const editor = read("app/core/markdown-editor.js");
const actions = read("app/core/actions.js");
const menus = read("app/data/menus.js");
const windowManager = read("app/core/window-manager.js");
const en = read("app/data/translations-en.js");
const zh = read("app/data/translations-zh.js");

// --- A. lazy, and declared ------------------------------------------------
test.assertIncludes(tool("tooling/runtime-manifest.mjs"), '"app/vendor/writing-editor.js"', "the editor is a lazy runtime file");
test.assertIncludes(tool("tooling/build-preapp.mjs"), 'name: "writing-editor-vendor"', "prebuild builds it, with declared inputs");
test.assertIncludes(tool("tooling/verify-release.mjs"), '"app/vendor/writing-editor.js"', "the release treats it as third-party code");
test.assertIncludes(tool("apps/desktop/sw.js"), '"app/vendor/writing-editor.js"', "the service worker keeps it for restored writing surfaces");
test.assertIncludes(editor, 'createLazyModuleLoader("AISystem6WritingEditor", ["app/vendor/writing-editor.js"])', "markdown-editor.js loads it on demand");
test.assertNotMatches(entry, /from "@codemirror\/lang-markdown"/, "Markdown comes straight from Lezer, without the HTML/CSS/JS grammars");

// --- B. the textarea stays the API ---------------------------------------
for (const name of ["value", "selectionStart", "selectionEnd", "setSelectionRange", "setRangeText", "focus", "blur", "scrollTop", "scrollHeight", "clientHeight"]) {
  test.assertIncludes(facade, `define("${name}"`, `the facade answers textarea.${name}`);
}
test.assertMatches(facade, /Object\.defineProperty\(document, "activeElement"/, "document.activeElement keeps naming the textarea");
test.assertMatches(facade, /export const editorRoot = new Proxy\(document[\s\S]*?"activeElement"\) return realActiveElement\(\)/, "while CodeMirror's own root answers with the real focus");
test.assertIncludes(entry, "root: editorRoot", "and the editor is built on that root");
test.assertMatches(facade, /case "undo":\s*return undo\(view\)/, "Edit › Undo reaches the editor's history");
test.assertMatches(facade, /if \(update\.docChanged && !external\)/, "the writer's edits fire input; code's writes stay silent, as a programmatic value= always was");

// --- C. the editor lies on the paper -------------------------------------
test.assertMatches(style, /\.mde-surface\.is-cm > \.cm-editor\.cm-editor \{\s*position: absolute !important; inset: 0;/, "the editor is laid absolutely on the paper, outranking CodeMirror's own position rule");

// --- D. the Format menu ----------------------------------------------------
test.assertMatches(menus, /menu\("format", "menu_format", \[[\s\S]*?\{ menuCondition: "writing-format-menu" \}\)/, "Format is a contextual menu");
test.assertIncludes(windowManager, '"writing-format-menu": !!MDE_FORMAT_SURFACES[winName]', "shown while a writing surface is in front");
// The menu the app builds, not the text that describes it: menus.js runs in a
// VM over the boot theme registry, as the browser runs it.
const menuWindow = {};
vm.runInNewContext(read("app/core/theme-registry.js"), { window: menuWindow });
const menuContext = { document: {}, activeAppId: "teachText", window: menuWindow };
vm.runInNewContext(`${menus}\nglobalThis.__menuSets = applicationMenuSets;`, menuContext);
const formatMenu = menuContext.__menuSets.teachText.find((definition) => definition.id === "format");
test.assert(formatMenu?.menuCondition === "writing-format-menu", "the writing windows' bar carries Format, contextually");
const menuCommands = (formatMenu?.items || [])
  .filter((item) => item.type === "item" && item.action.startsWith("format-"))
  .map((item) => item.action.slice("format-".length));
const { formatMarkdown, FORMAT_COMMANDS: formatCommands } = await import("../../tooling/vendor/writing-editor/format.mjs");
const registered = [...(actions.match(/\[([^\]]*)\]\s*\.forEach\(\(command\)=>window\.AISystem6Runtime\?\.registerCommand\?\.\(`format-\$\{command\}`/)?.[1] || "").matchAll(/"([a-z0-9-]+)"/g)].map((match) => match[1]);
// Every row, run on a real line of the DTK manuscript, changes the text.
const sample = "我桌面上这台 Mac mini 本该在 2021 年消失。";
test.assert(
  menuCommands.every((command) => {
    const result = formatMarkdown(sample, 0, 5, command);
    // Body text and Outdent have nothing to take away from a plain line.
    return result && (result.insert !== sample.slice(result.from, result.to) || ["heading-0", "outdent"].includes(command));
  }),
  "every Format row edits the text when run",
);
test.assert((formatMenu?.items || []).every((item) => item.type !== "item" || item.labelKey), "every row has a label");
test.assert(menuCommands.length >= 18, `the menu lists the Markdown commands (${menuCommands.length})`);
test.assert(menuCommands.every((command) => formatCommands.includes(command)), "every menu row is a command the editor knows");
test.assert(menuCommands.every((command) => registered.includes(command)), "and every one is registered as an application command");
test.assertMatches(actions, /\(\{ id: `format-\$\{id\}`, key, display: [^}]*, dispatch: false \}\)/, "the key equivalents are display-only: the editor answers the keys");
for (const key of ["menu_format", "format_body", "format_heading_1", "format_bold", "format_link", "format_task", "format_table", "format_code_block", "heading_navigator", "writing_mode_write", "writing_mode_read", "writing_mode_split", "hide_keyboard"]) {
  test.assertIncludes(en, `    ${key}:`, `English defines ${key}`);
  test.assertIncludes(zh, `    ${key}:`, `Chinese defines ${key}`);
}

// --- E. one row on a phone ------------------------------------------------
test.assertIncludes(style, ".window.has-format-bar .teachtext-actions { display: none; }", "the format bar takes the place of the four buttons");
test.assertIncludes(ui, '["dictate", "听写", "dictation_pad", "Dictation"]', "and carries 听写");
test.assertIncludes(ui, "if (on && !view.dom.getClientRects().length) on = false;", "a page turned to Read never shows the bar");
test.assertIncludes(read("app/features/dictation.js"), 'textTarget.closest(".mde-surface.is-cm")', "the floating dictation button stays off the writing surfaces' header");

// --- F. the fallback -------------------------------------------------------
test.assertIncludes(editor, 'const MDE_ENGINE_STORAGE_KEY = "ai-system6-writing-engine";', "one stored switch returns every surface to the textarea");
test.assertIncludes(editor, "if (window.AISystem6WritingEditor?.isMounted(textarea)) return true;", "a mounted surface has no overlay to repaint");

// --- G. headings are a command, not a second title --------------------------
const writingMenu = menuContext.__menuSets.teachText.find((definition) => definition.id === "writing");
test.assert((writingMenu?.items || []).some((item) => item.action === "open-heading-navigator"), "Writing offers Go to Heading…");
test.assertIncludes(actions, 'registerCommand?.("open-heading-navigator",{handler:mdeOpenHeadings', "and it is a real command");
test.assertMatches(read("index.html"), /teachtext-command-popover">[\s\S]*?data-action="open-heading-navigator"/, "Commands… carries it on TeachText, which is where a phone reaches it");
test.assertNotMatches(read("index.html"), /teachtext-heading-crumb/, "the status bar has no heading control");
test.assertNotIncludes(ui, "teachtext-heading-crumb", "and the editor does not add one");

test.finish();
