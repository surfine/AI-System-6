// ClioPaint — the first Claris piece, a 1-bit painting surface in the
// MacPaint lineage, plus 草图变大纲 (sketch to outline).
//
// This contract holds four things: the module is lazy and actually
// reachable (not just listed), the window is declared through the registry
// rather than improvised, drawing state round-trips through the EXISTING
// imageAttachments store (no new persistence boundary), and sketch-to-outline
// routes its answer through the Outline's own guardrail and validated funnel
// rather than inventing a second one, with an AI run receipt recorded either
// way. See internal/evidence/drafts/sketch-to-outline/index.html for the
// prior design draft whose reading-mechanics evidence this reuses.

import vm from "node:vm";

import { createFeatureTest, read, windowRegistryRecords } from "../helpers/feature-test-harness.mjs";
import { lazyRuntimePaths } from "../../tooling/runtime-manifest.mjs";
import { lazyStyleBundles } from "../../tooling/style-manifest.mjs";
import { windowInterfaceRegistry } from "../../tooling/interface-guidelines-contract.mjs";

const test = createFeatureTest("clio-paint");

const source = read("app/features/clio-paint.js");
const config = read("app/core/config.js");
const html = read("index.html");
const actions = read("app/core/actions.js");
const multiFinder = read("app/core/multi-finder.js");
const windowManager = read("app/core/window-manager.js");
const icons = read("app/core/system-icons.js");
const en = read("app/data/translations-en.js");
const zh = read("app/data/translations-zh.js");

// ---- Lazy, and actually reachable -------------------------------------------
test.assert(lazyRuntimePaths.includes("app/features/clio-paint.js"), "the module is a lazy runtime file, not a boot cost");
test.assertIncludes(
  config,
  'createLazyModuleLoader("AISystem6ClioPaintLoaded", ["app/core/application-shell.js", "app/features/clio-paint.js"], false, ["styles.clio-paint.css"])',
  "one loader names the shell, the module, and its stylesheet together"
);
test.assertIncludes(actions, '"open-clio-paint",{ensure:ensureClioPaintModule}', "the opener is a lazy command, so the first click loads the module");
test.assertIncludes(source, "window.AISystem6ClioPaintLoaded = true;", "the module installs its loaded flag");

const clioPaintStyleBundle = lazyStyleBundles.find((bundle) => bundle.id === "clio-paint");
test.assert(!!clioPaintStyleBundle, "a lazy style bundle is declared for ClioPaint");
test.assert(clioPaintStyleBundle?.output === "styles.clio-paint.css", "its output name matches what the loader requests");

// ---- The window is declared, not improvised ---------------------------------
const record = windowRegistryRecords().clioPaint;
test.assert(!!record, "clioPaint has a window-registry record");
test.assert(record.app === "clioPaint", "and it declares its own application id");
test.assert(record.builtByModule === true, "the markup is built by the module, not shipped in index.html on every boot");
test.assert(!!record.lazy, "the registry knows the window arrives lazily");
test.assertIncludes(source, 'function installClioPaintWindow()', "the module builds its own window, following ClioProject's pattern");
test.assertNotIncludes(html, 'data-window="clioPaint"', "the window is not duplicated as static markup in index.html");

test.assertIncludes(multiFinder, 'clioPaint: "ClioPaint"', "MultiFinder can name the running application");
test.assertMatches(
  windowManager,
  /mobileFullScreenAppIds = new Set\(\[(?:(?!\]\))[\s\S])*"clioPaint"/,
  "the phone shell covers ClioPaint like its sibling creative labs"
);
test.assertIncludes(html, 'data-action="open-clio-paint"', "Applications lists the opener beside the other Clio- applications");
test.assertIncludes(icons, "clioPaint: `", "a system icon is registered for ClioPaint");
test.assert(windowInterfaceRegistry.clioPaint?.role === "creative-lab", "the interface guidelines register ClioPaint as a creative lab");

// ---- The naming law: ClioPaint is untranslated in both languages -----------
test.assertMatches(en, /clio_paint_label: "ClioPaint"/, "the English label is exactly ClioPaint");
test.assertMatches(zh, /clio_paint_label: "ClioPaint/, "the Chinese label keeps ClioPaint untranslated, like its Clio- siblings");

// ---- Storage: the EXISTING imageAttachments store, no new boundary ---------
test.assertIncludes(source, 'surface: "clioPaint"', "pictures are tagged with their own surface on the shared store");
test.assertIncludes(source, "buildImageAttachments(", "saving reuses the existing attachment builder");
test.assertIncludes(source, "saveImageAttachments(", "saving reuses the existing attachment writer");
test.assertIncludes(source, "imageAttachmentsForProject(", "loading reuses the existing per-project reader");
test.assertNotMatches(source, /indexedDB\.open|createObjectStore/i, "no new IndexedDB store is introduced");
test.assertIncludes(
  source,
  "if (clioPaintState.attachmentId) record.id = clioPaintState.attachmentId;",
  "re-saving updates the same attachment record instead of piling up copies"
);
test.assertIncludes(
  source,
  "record?.originalDataUrl || canvas.toDataURL",
  "a sketch read uses the lossless original, not the compressed JPEG preview"
);

// ---- Sketch to Outline: the SAME funnel, the SAME guardrail, a receipt -----
test.assertIncludes(source, "ensureOutlineClaimModule", "the Outline's own lazy module is ensured before its entry points are called");
test.assertIncludes(source, "validateGeneratedWritingOutline(markdown)", "the model's answer is checked by the Outline's own guardrail, not a new one");
test.assertIncludes(source, "confirmAndApplyAiOutline(", "applying the result goes through the Outline's own confirm-and-apply entry point");
test.assertNotIncludes(source, "function validateGeneratedWritingOutline", "ClioPaint does not carve its own copy of the guardrail into outline-claim.js");
test.assertNotIncludes(source, "function confirmAndApplyAiOutline", "ClioPaint does not carve its own copy of the apply funnel into outline-claim.js");
test.assertIncludes(source, "window.AISystem6RunReceipts?.createReceipt", "a sketch read opens a run receipt");
test.assertMatches(source, /finishReceipt\(receiptId, \{\s*status: "completed"/, "a successful read closes its receipt");
test.assertMatches(source, /status: "failed", publicErrorReason: rawReason/, "a failed read closes its receipt honestly instead of leaving it running");

// ---- The four loss-stop rules from the evidence draft ----------------------
// (1) the sketch never writes back to itself -- the result panel is a
// one-shot read, dismissible, never bound back to the canvas.
test.assertIncludes(source, "function hideClioPaintResult()", "the result panel is dismissible, not a permanent second surface");
// (2) an always-visible "could not read" acknowledgment, never silently
// dropped -- rendered every time, even when nothing was unreadable.
test.assertIncludes(source, "clio_paint_unread_empty", "the unreadable-parts note renders even when nothing was flagged");
// (3) the model is told not to invent more chapters than it can see boxes for.
test.assertMatches(source, /Do not output more sections than you can clearly make out/, "the prompt tells the model to under-produce rather than invent");
test.assertMatches(source, /章节数不要超过图里能看清的方框数/, "the Chinese prompt carries the same under-produce instruction");
// (4) nothing here reaches into the writing route on its own -- applying is
// one explicit writer click (clio-paint-result-apply), never automatic. The
// apply funnel is called from exactly one place: the dedicated apply command,
// not from the read itself.
test.assert(
  (source.match(/confirmAndApplyAiOutline\(/g) || []).length === 1,
  "the apply funnel is called from exactly one place"
);
test.assertMatches(
  source,
  /async function applyClioPaintOutlineResult\(\)\s*\{[\s\S]*?confirmAndApplyAiOutline\(/,
  "applying the outline is its own explicit command, not folded into the read itself"
);
const sketchReadBody = source.slice(
  source.indexOf("async function clioPaintRunSketchRead"),
  source.indexOf("function runClioPaintSketchToOutline"),
);
test.assertNotIncludes(sketchReadBody, "confirmAndApplyAiOutline(", "the read step never applies the outline on its own");

// ---- Pure logic, executed: the unread-note split and its empty check -------
const pureSlice = source.slice(source.indexOf("function splitClioPaintUnreadNote"), source.indexOf("function renderClioPaintResult"));
const context = vm.createContext({});
vm.runInContext(pureSlice, context);
const splitClioPaintUnreadNote = vm.runInContext("splitClioPaintUnreadNote", context);
const clioPaintUnreadIsEmpty = vm.runInContext("clioPaintUnreadIsEmpty", context);

const withUnread = splitClioPaintUnreadNote("## Setup\n## Payoff\nCould not read: the bottom-left corner");
test.assert(withUnread.markdown === "## Setup\n## Payoff", "the unread line is stripped from the outline markdown");
test.assert(withUnread.unread === "the bottom-left corner", "and captured on its own");
test.assert(!clioPaintUnreadIsEmpty(withUnread.unread), "a real note is not treated as empty");

const withoutUnread = splitClioPaintUnreadNote("## Setup\n## Payoff\nCould not read: none");
test.assert(withoutUnread.markdown === "## Setup\n## Payoff", "a 'none' unread line still comes off the outline");
test.assert(clioPaintUnreadIsEmpty(withoutUnread.unread), "'none' reads as nothing unreadable");
test.assert(clioPaintUnreadIsEmpty(""), "a missing note also reads as nothing unreadable");

const zhUnread = splitClioPaintUnreadNote("## 开场\n## 收尾\n读不出：涂改的那一块");
test.assert(zhUnread.markdown === "## 开场\n## 收尾", "the Chinese unread line is stripped the same way");
test.assert(zhUnread.unread === "涂改的那一块", "and captured the same way");
test.assert(clioPaintUnreadIsEmpty(splitClioPaintUnreadNote("## 开场\n读不出：无").unread), "'无' reads as nothing unreadable");

// ---- New, asked of a picture that is already new ---------------------------
// The window says "New picture." from the moment it opens, so New on an
// untouched canvas repainted nothing and repeated a sentence already on
// screen: to a person that is the same event as a command that is broken.
test.assertIncludes(
  source,
  "const alreadyNew = !clioPaintState.dirty && !clioPaintState.attachmentId;",
  "New asks whether there is anything to clear before it clears it"
);
test.assertIncludes(
  source,
  'statusLabel.textContent = t("clio_paint_status_already_new")',
  "and answers in the window's own status line when there was not"
);
test.assert(
  en.includes("clio_paint_status_already_new:") && zh.includes("clio_paint_status_already_new:"),
  "clio_paint_status_already_new exists in both languages"
);

test.finish();
