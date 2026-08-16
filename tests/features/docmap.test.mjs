// DocMap is a visual reading map. It must remain exportable as a printable
// object, not only as saved Markdown, so users can carry the map out as PDF.

import vm from "node:vm";
import { createFeatureTest, read, readAppSurface } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("docmap");
const app = readAppSurface([
  "app/features/docmap.js",
  "app/core/docmap-source-policy.js",
  // The synchronous entry layer (source resolution, button gating) is eager
  // while the tool itself is lazy; the DocMap contract spans both files.
  "app/core/docmap-entry.js",
  "app/core/chat-messages.js",
  "app/core/dom-handles.js",
  "app/core/wireup.js",
]);
const css = read("styles/20-reader-docmap.css");
const index = read("index.html");
const bootstrap = read("app.js");
const cloudRoute = read("apps/server/server/routes/cloud-chat.js");
const taskPolicy = read("apps/server/server/task-policy.js");
const localChat = read("apps/server/server/chat.js");
const actions = read("app/core/actions.js");
const sourcePolicy = read("app/core/docmap-source-policy.js");

const policyContext = vm.createContext({});
vm.runInContext(sourcePolicy, policyContext);
const chooseSource = policyContext.chooseDocMapSourceCandidate;
const shortSelection = { text: "s".repeat(86), threshold: 200, rangeMode: "selection" };
const readySelection = { text: "s".repeat(240), threshold: 200, rangeMode: "selection" };
const readySource = { text: "d".repeat(900), threshold: 800, rangeMode: "source" };

const automaticFallback = chooseSource(shortSelection, readySource);
test.assert(automaticFallback.ready && automaticFallback.source === readySource, "a short selection falls back to an eligible whole source");
test.assert(automaticFallback.fellBackToSource, "the shared policy reports the short-selection fallback for status feedback");
test.assert(chooseSource(readySelection, readySource).source === readySelection, "an eligible selection remains the automatic DocMap source");
test.assert(chooseSource(shortSelection, readySource, "selection").state === "too-short", "an explicit selection command never silently maps the whole source");
test.assert(chooseSource(readySelection, readySource, "source").source === readySource, "an explicit whole-source command ignores an eligible selection");

test.assertIncludes(app, 'id="docmap-print-pdf"', "DocMap command menu exposes Print Map to PDF");
test.assertIncludes(index, 'class="teachtext-command-menu command-menu-opens-down docmap-command-menu is-disabled"', "DocMap marks its top-toolbar command menu to open into the window");
test.assertIncludes(app, 'id="docmap-layout-toggle"', "DocMap toolbar exposes the layout picker group");
test.assertIncludes(actions, '"open-docmap": async () => {', "the DocMap open command awaits the lazy module");
test.assertIncludes(actions, "await ensureDocMapModule();", "the DocMap open command loads the tool before choosing the tabbed open path");
test.assertIncludes(app, 'id="docmap-layout-right"', "DocMap exposes the one-side layout as a direct choice");
test.assertIncludes(app, 'id="docmap-layout-balanced"', "DocMap exposes the symmetric layout as a direct choice");
// The Map > Layout submenu offered Tree / Radial / Fishbone. The renderer has
// two layouts, so all three set the same one, and Symmetric could be reached
// only from the toolbar. Menu and toolbar now name the same two, and the one in
// use carries a check.
const menus = read("app/data/menus.js");
const windowManager = read("app/core/window-manager.js");
for (const removedLayout of ["docmap-layout-tree", "docmap-layout-radial", "docmap-layout-fishbone"]) {
  test.assertNotIncludes(menus, removedLayout, `the Layout menu no longer offers ${removedLayout}, which the renderer never had`);
  test.assertNotIncludes(actions, removedLayout, `${removedLayout} does not survive as a hidden command handler`);
}
test.assertIncludes(menus, 'menuItem("docmap-layout-right", "docmap_layout_right", "", { layoutChoice: "right" })', "the Layout menu names the one-side layout exactly as the toolbar does");
test.assertIncludes(menus, 'menuItem("docmap-layout-balanced", "docmap_layout_balanced", "", { layoutChoice: "balanced" })', "Symmetric is reachable from the menu, not only from the toolbar");
test.assertIncludes(windowManager, "btn.dataset.layoutChoice === docMapLayoutFor(currentDocMap)", "the Layout menu checks the layout the open map is using");
test.assertIncludes(app, "function docMapLayoutFor(map = currentDocMap)", "the layout resolver stays eager so a menu redraw never summons the lazy tool");
test.assertIncludes(app, 'id="docmap-focus-root"', "DocMap exposes a phone-sized branch focus action");
test.assertIncludes(app, 'data-i18n="docmap_mobile_hint"', "DocMap touch guidance is localized instead of hard-coded");
test.assertNotIncludes(app, 'id="docmap-detailed"', "DocMap no longer exposes detailed hierarchy as a user toggle");
test.assertIncludes(app, "const docMapPrintPdfButton", "DocMap PDF button is captured in DOM handles");
test.assertIncludes(app, "const docMapLayoutToggleButton", "DocMap layout toggle is captured in DOM handles");
test.assertIncludes(app, "const docMapLayoutButtons", "DocMap layout choices are captured in DOM handles");
test.assertIncludes(bootstrap, "docMapFocusRootButton,", "DocMap phone focus handle is exposed to the event bootstrap");
test.assertIncludes(app, "docMapPrintPdfButton?.addEventListener", "DocMap PDF command is wired");
test.assertIncludes(app, "docMapFocusRootButton?.addEventListener", "DocMap root focus action is wired");
test.assertIncludes(app, "setCurrentDocMapLayout(button.dataset.docmapLayoutOption)", "DocMap layout choices are wired directly");
test.assertIncludes(app, 'layout: "right"', "DocMap defaults new and restored maps to right-side layout");
test.assertIncludes(app, "await inst.centerNode(root, padding)", "phone focus positions the root instead of merely enlarging the full map");
test.assertIncludes(app, "const padding = { left: 18, right: 18, top: 36, bottom: 36 }", "phone root focus uses symmetric padding and therefore a true viewport center");
test.assertIncludes(app, "queueDocMapFitToView(8, { focusCompact: true })", "new phone maps enter the readable focus view automatically");
test.assertIncludes(app, "currentDocMap.layout = nextLayout", "DocMap layout changes are saved on the active map");
test.assertIncludes(app, "savedMap.layout = docMapLayoutFor(currentDocMap)", "Saved DocMaps preserve the chosen layout");
test.assertIncludes(app, "Layout: ${docMapLayoutFor(map)}", "Exported DocMap metadata records layout");
// Balanced (two-sided) DocMap is rendered by Markmap itself, then mirrored —
// one rendering path, so labels/colors/curves always match the right-side view.
test.assertNotIncludes(app, "function renderBalancedDocMapSvg", "Balanced DocMap no longer hand-rolls a separate SVG renderer");
test.assertNotIncludes(app, "function balancedDocMapNodeWidth", "Balanced DocMap drops the bespoke node-width helper");
test.assertNotIncludes(app, "function balancedDocMapLabel", "Balanced DocMap drops bespoke label cleaning; Markmap parses markdown");
test.assertIncludes(app, "const balanced = map.kind !== \"videoDocMap\" && docMapLayoutFor(map) === \"balanced\"", "Balanced layout flows through the same Markmap create path");
test.assertIncludes(app, "token === renderToken) {", "Balanced mirror runs only for the latest render, after Markmap finishes laying out the tree");
test.assertIncludes(app, "mirrorMarkmapBalanced(inst)", "Balanced mirror is invoked from the wrapped renderData");
test.assertIncludes(app, "inst.renderData = async (origin)", "Balanced mirror re-applies after every Markmap render (ResizeObserver, highlight, refresh)");
test.assertIncludes(app, "requestAnimationFrame(() => requestAnimationFrame(resolve))", "Balanced mirror waits for Markmap's zero-duration transitions to flush");
test.assertIncludes(app, 'sideOf.get(datum) === "left"', "Balanced mirror reflects only the left half of the first-level branches");
test.assertIncludes(app, 'group.classList.add("docmap-mm-left")', "Balanced mirror marks left-side branches (so their connector dot flips inward)");
test.assertIncludes(app, "path.markmap-link", "Balanced mirror redraws Markmap links for the mirrored side");

// Balanced center: the Markmap root is promoted into one real boxed anchor, with
// the first-level branches meeting explicit left/right ports on the box.
test.assertIncludes(app, 'rootGroup.classList.add("docmap-mm-balanced-root")', "Balanced center marks the single Markmap root as the anchor");
test.assertIncludes(app, "docmap-balanced-center-box", "Balanced center draws a framing box behind the title");
test.assertIncludes(app, "const isRootLink = datum.source === root", "First-level branches connect to the center, not the raw root rect edge");
test.assertIncludes(app, "leftPort", "Balanced center exposes an explicit left connection port");
test.assertIncludes(app, "rightPort", "Balanced center exposes an explicit right connection port");
test.assertNotIncludes(css, ".docmap-balanced-node-text", "Old hand-rolled balanced text style is removed");
test.assertNotIncludes(css, ".docmap-mm-left .markmap-foreign", "Removed the broken left-label text-align rule that clipped labels");

// fit + print must wait for the mirror + center pass, not frame the raw one-sided render.
test.assertIncludes(app, 'docMapLayoutFor() === "balanced" && docMapBalancedPending', "fitDocMapCanvasToView waits for the balanced center pass");
test.assertIncludes(app, "docMapBalancedReadyPromise", "Print waits for the balanced mirror + center pass before cloning");
// d3-zoom's default extent reads svg.width.baseVal.value; a root <svg> without
// width/height attributes defaults to a relative 100% length and throws while
// a staged window has no resolved layout. Pin absolute pixel attributes.
test.assertIncludes(app, "syncDocMapSvgSizeAttributes(docMapMarkmapInstance)", "fit refreshes the svg size attributes before zooming");
test.assertIncludes(app, 'syncDocMapSvgSizeAttributes({ svg: { node: () => svg } })', "render pins svg size attributes before creating markmap");
test.assertIncludes(app, "document.styleSheets", "DocMap PDF copies the active app stylesheet rules");
test.assertIncludes(app, 'bodyClass = getCurrentTheme() === "liquid-glass"', "DocMap PDF preserves the active Liquid Glass compatibility class through the canonical Appearance API");
test.assertIncludes(app, '".docmap-balanced-center-box"', "DocMap PDF copies the balanced center-box style");
test.assertIncludes(app, '".docmap-mm-balanced-root"', "DocMap PDF copies balanced root ornament rules");
test.assertIncludes(app, 'page: "A4 landscape"', "DocMap PDF uses landscape A4 for symmetric maps");
test.assertIncludes(app, 'page: "A4 portrait"', "DocMap PDF keeps one-side maps on portrait A4");
test.assertIncludes(app, "widthMm: 297", "DocMap PDF has a physical landscape A4 width");
test.assertIncludes(app, "heightMm: 297", "DocMap PDF has a physical portrait A4 height");
test.assertIncludes(app, "@page { size: ${printMetrics.page}; margin: 0; }", "DocMap PDF controls A4 paper margins from layout metrics");
test.assertIncludes(app, "html, body { width: ${printMetrics.widthMm}mm; height: ${printMetrics.heightMm}mm; }", "DocMap PDF applies layout-specific physical paper size");
test.assertIncludes(app, "cloneDocMapSvgForPrint", "DocMap print output uses the rendered SVG map");
test.assertIncludes(app, "docMapMarkmapInstance.fit()", "DocMap PDF fits the live map before cloning it");
test.assertIncludes(app, "getBoundingClientRect", "DocMap PDF measures the rendered map geometry instead of raw data bounds");
test.assertIncludes(app, "getScreenCTM", "DocMap PDF accounts for Markmap's fitted SVG transform before cropping");
test.assert(!/function docMapSvgVisibleElementBox[\s\S]*scale[XY]/.test(app), "DocMap PDF crop box no longer mixes screen pixels with SVG user coordinates");
test.assertIncludes(app, 'svg.querySelectorAll(".markmap-node, .docmap-balanced-center-box, text, foreignObject, circle")', "DocMap PDF crops from visible nodes and center box instead of oversized curve path boxes");
test.assertIncludes(app, 'balancedLayout ? Math.max(48, base * 0.05) : Math.max(8, base * 0.01)', "DocMap PDF keeps the right-side layout tight and balanced layout symmetric");
test.assertIncludes(app, 'layout === "balanced"', "DocMap PDF uses a separate balanced-layout crop");
test.assertIncludes(app, 'balancedLayout ? Math.max(48, base * 0.05) : Math.max(72, base * 0.075)', "DocMap PDF reserves right-side breathing room for right-side maps");
test.assertIncludes(app, "aspect: 297 / 210", "DocMap PDF matches symmetric crop to landscape A4 aspect");
test.assertIncludes(app, "aspect: 210 / 296", "DocMap PDF matches one-side crop to portrait A4 aspect");
test.assertIncludes(app, "const pageAspect = docMapPrintPageMetrics(layout).aspect", "DocMap PDF crop aspect follows the active layout");
test.assertIncludes(app, "const balancedCenterX = centerBox && centerBox.width > 0", "DocMap PDF centers balanced maps on the real center box");
test.assertIncludes(app, "Math.max(contentWidth, contentHeight * pageAspect)", "DocMap PDF expands the crop to fill the selected paper shape");
test.assertIncludes(app, ".docmap-print-tree { box-sizing: border-box; width: 100%; height: 100%;", "DocMap PDF lets the map canvas fill the one-page sheet");
test.assertIncludes(app, ".docmap-print-tree .docmap-markmap-svg { width: 100%; height: 100%; min-height: 0; background: #fff; }", "DocMap PDF forces the SVG sheet background to white");
test.assertIncludes(app, ".docmap-print-tree .docmap-balanced-center-box { fill: #fff; stroke: #111; stroke-width: 2px; }", "DocMap PDF prevents the balanced center box from printing as a black default SVG rect");
test.assertIncludes(app, "body { display: grid; place-items: center", "DocMap PDF centers the fitted canvas page");
test.assertIncludes(app, '"xMidYMid meet" : "xMinYMid meet"', "DocMap PDF centers balanced maps and left-anchors right-side maps");
test.assertIncludes(app, "docMapSvgVisibleElementBox(svg, layout) || docMapSvgFallbackViewportBox(svg)", "DocMap PDF removes wasted viewport whitespace before printing");
test.assertIncludes(app, "width=${printMetrics.popupWidth},height=${printMetrics.popupHeight}", "DocMap PDF export opens a print surface that matches the selected paper orientation");
test.assertIncludes(app, "printWindow.print()", "DocMap PDF export invokes the browser print flow");
test.assertIncludes(app, "/^(?:deepseek-)?v4-(?:pro|flash)$/i", "DeepSeek v4 detection accepts provider short names such as v4-flash");
test.assertIncludes(app, "delete nextPayload.reasoning_effort", "DeepSeek v4 cloud requests do not send reasoning_effort=none");
test.assertIncludes(app, "delete nextPayload.chat_template_kwargs", "DeepSeek v4 cloud requests do not leak local chat-template kwargs");
test.assertIncludes(app, "delete nextPayload.top_k", "DeepSeek v4 cloud requests do not leak local top_k sampling");
test.assertIncludes(app, 'nextPayload.thinking = { type: "disabled" }', "DeepSeek v4 product requests disable thinking client-side");
test.assertIncludes(cloudRoute, "payload.thinking = policy.thinking", "DeepSeek v4 cloud proxy decides thinking server-side by task type");
test.assertIncludes(taskPolicy, 'chat: { tier: "fast", thinking: false', "only whitelisted writing tasks can run chain-of-thought");
test.assertIncludes(cloudRoute, "function stripDeepseekV4LocalOnlyFields", "DeepSeek v4 cloud proxy strips local-only tuning fields server-side");
test.assertIncludes(cloudRoute, "\"v4-flash\"", "DeepSeek v4 cloud proxy accepts short model names");
test.assertIncludes(cloudRoute, "delete payload.reasoning_effort", "DeepSeek v4 cloud proxy removes invalid reasoning_effort=none");
test.assertIncludes(cloudRoute, "delete payload.chat_template_kwargs", "DeepSeek v4 cloud proxy removes local chat-template kwargs");
test.assertIncludes(app, 'max_tokens: structuredTask ? cloudTaskMaxTokens(kind) : cloudTaskMaxTokens("chat")', "DeepSeek v4 chat requests have a bounded default output");
test.assertIncludes(cloudRoute, "answerBudget + reasoningAllowance", "DeepSeek v4 cloud proxy budgets the answer and the thinking chain separately");
test.assertIncludes(localChat, "nextPayload.thinking = { type: \"disabled\" }", "Local proxy sends a generic thinking-off hint");
test.assertIncludes(localChat, "tuneGemma4ChatPayload(tuneQwen35ChatPayload(basePayload))", "Local proxy preserves Qwen family-specific tuning");
test.assertIncludes(app, 'ai_system6_task_kind: "docmap"', "DocMap model calls identify their structured task kind");
test.assertIncludes(app, "Each top-level branch must have 2 to 3 second-level child nodes.", "DocMap overview hierarchy is the default prompt contract");
test.assertIncludes(app, "Do not create fourth-level bullets or standalone evidence/source nodes.", "DocMap prompt prevents dense evidence-only branches");
test.assertIncludes(app, "Maximum depth: # title, ## branch, - child, nested - detail.", "DocMap prompt documents overview depth");
test.assertIncludes(app, "优先少节点、短节点、清楚分组", "DocMap prompt asks for scannable grouped nodes");
test.assertIncludes(app, "const supplemented = ensureDocMapSubBranches(map.nodes, map.edges, source)", "DocMap supplements shallow model output after repair");
test.assertNotIncludes(app, "addSupplementChild(detail, 4)", "DocMap deterministic fallback no longer adds fourth-level evidence nodes");
test.assertIncludes(app, "max_tokens: 2600", "DocMap uses an overview-sized output budget by default");

test.assertIncludes(app, 'window.AISystem6TimeMachine?.docMapSource?.(rangeMode)', "DocMap reaches both Time Machine selection and whole-page candidates through the lazy window's accessor");
test.assertIncludes(app, 'if (surface === "timeMachine") return docMapSourceFromTimeMachine("source")', "a Time Machine page in front resolves through the same whole-source policy as Reader");
test.assertIncludes(app, '|| docMapSourceFromTimeMachine("source")', "DocMap's own entry points still find the Time Machine page once its window is no longer active");
// Registered as a lambda, not a bare reference: DocMap is lazy, and wireup runs
// at boot, so the name has to resolve when the ask bar calls it.
test.assertMatches(app, /registerAskBarSource\("docMap", \(\.\.\.args\) => describeDocMapAskScope\(\.\.\.args\)\)/, "DocMap asks through the shared ask bar");
test.assertIncludes(app, 't("ask_scope_focus", node.title)', "DocMap still derives the focused branch carried along with the whole map");
test.assertIncludes(app, "sourceMeta?.rangeMode", "DocMap status chrome keeps the generated map's selection or whole-source identity");
test.assertIncludes(app, "beginPendingDocMap(source", "DocMap opens a pending handoff before the model finishes");
test.assertIncludes(app, 'data-action="docmap-retry-pending"', "a failed pending DocMap remains retryable");
test.assertIncludes(index, 'id="reader-docmap-button" data-action="reader-make-docmap" data-i18n="docmap"', "the Reader button keeps the compact DocMap label");
test.assertIncludes(index, 'data-action="reader-docmap-source" data-i18n="docmap_from_source"', "Reader Commands exposes the whole-source override without widening the main button");
test.assertIncludes(app, "syncDocMapEntryButton(readerDocMapButton, readerReadiness)", "Reader uses the shared DocMap readiness receipt");
test.assertIncludes(app, "syncDocMapEntryButton(teachTextDocMapButton, teachTextReadiness)", "TeachText uses the shared DocMap readiness receipt");
test.assertIncludes(app, "syncDocMapEntryButton(clipboardDocMapButton, clipboardReadiness)", "Clipboard uses the shared DocMap readiness receipt");
test.assertIncludes(app, "syncDocMapEntryButton(scrapbookDocMapButton, scrapbookReadiness)", "Scrapbook uses the shared DocMap readiness receipt");
test.assertIncludes(app, "syncDocMapEntryButton(chatFileDocMapButton, documentsReadiness)", "Documents uses the shared DocMap readiness receipt");
test.assertIncludes(app, "window.AISystem6TimeMachine?.docMapReadiness?.()", "Time Machine exposes its readiness to the shared entry synchronizer");
test.assertIncludes(index, 'id="teachtext-docmap" data-i18n="docmap">DocMap</button>', "TeachText keeps the compact DocMap label");
test.assertIncludes(index, 'id="scrapbook-docmap" data-action="make-docmap" data-i18n="docmap">DocMap</button>', "Scrapbook keeps the compact DocMap label");
test.assertIncludes(index, 'id="clipboard-docmap" data-i18n="docmap">DocMap</button>', "Clipboard keeps the compact DocMap label");

test.finish();
