// DocMap is a visual reading map. It must remain exportable as a printable
// object, not only as saved Markdown, so users can carry the map out as PDF.

import { createFeatureTest, read, readAppSurface } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("docmap");
const app = readAppSurface([
  "app/features/docmap.js",
  "app/core/chat-messages.js",
  "app/core/dom-handles.js",
  "app/core/wireup.js",
]);
const en = read("app/data/translations-en.js");
const zh = read("app/data/translations-zh.js");
const css = read("styles/20-reader-docmap.css");
const bootstrap = read("app.js");
const cloudRoute = read("src/server/routes/cloud-chat.js");
const localChat = read("src/server/chat.js");

test.assertIncludes(app, 'id="docmap-print-pdf"', "DocMap command menu exposes Print Map to PDF");
test.assertIncludes(app, 'id="docmap-layout-toggle"', "DocMap toolbar exposes the layout picker group");
test.assertIncludes(app, 'id="docmap-layout-right"', "DocMap exposes the one-side layout as a direct choice");
test.assertIncludes(app, 'id="docmap-layout-balanced"', "DocMap exposes the symmetric layout as a direct choice");
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
test.assertIncludes(app, "async function printCurrentDocMapPdf()", "DocMap has an async PDF print entry point");
test.assertIncludes(app, 'layout: "right"', "DocMap defaults new and restored maps to right-side layout");
test.assertIncludes(app, "function docMapLayoutFor", "DocMap normalizes missing legacy layout values");
test.assertIncludes(app, "async function focusDocMapRootForCompactView()", "DocMap has a readable branch-level phone view");
test.assertIncludes(app, "await inst.centerNode(root, padding)", "phone focus positions the root instead of merely enlarging the full map");
test.assertIncludes(app, "const padding = { left: 18, right: 18, top: 36, bottom: 36 }", "phone root focus uses symmetric padding and therefore a true viewport center");
test.assertIncludes(app, "queueDocMapFitToView(8, { focusCompact: true })", "new phone maps enter the readable focus view automatically");
test.assertIncludes(css, "@container (max-width: 520px)", "DocMap owns a compact-width layout");
test.assertIncludes(css, "grid-template-columns: repeat(4, minmax(0, 1fr))", "DocMap view controls share one compact phone row");
test.assertIncludes(css, ".docmap-layout-picker > span", "DocMap can remove the redundant phone layout label");
test.assertIncludes(css, ".docmap-map-toolbar .btn,\n  .docmap-map-toolbar .view-switch-option", "DocMap toolbar controls keep a phone-sized touch target");
test.assertIncludes(en, 'docmap_fit_short: "Fit"', "English supplies a compact Fit label");
test.assertIncludes(en, 'docmap_focus_short: "Root"', "English supplies a compact Root label");
test.assertIncludes(zh, 'docmap_fit_short: "适应"', "Chinese supplies a compact Fit label");
test.assertIncludes(zh, 'docmap_focus_short: "根节点"', "Chinese supplies a compact Root label");
test.assertIncludes(css, "justify-content: center", "DocMap phone controls center their content");
test.assertIncludes(css, "touch-action: none", "DocMap reserves direct touch gestures for map navigation");
test.assertIncludes(app, "currentDocMap.layout = nextLayout", "DocMap layout changes are saved on the active map");
test.assertIncludes(app, "savedMap.layout = docMapLayoutFor(currentDocMap)", "Saved DocMaps preserve the chosen layout");
test.assertIncludes(app, "Layout: ${docMapLayoutFor(map)}", "Exported DocMap metadata records layout");
// Balanced (two-sided) DocMap is rendered by Markmap itself, then mirrored —
// one rendering path, so labels/colors/curves always match the right-side view.
test.assertIncludes(app, "function mirrorMarkmapBalanced", "Balanced DocMap reflects a real Markmap render into a two-sided mind map");
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
test.assertIncludes(css, ".docmap-balanced-center-box", "Balanced center box is styled in CSS");
test.assertIncludes(css, ".docmap-mm-balanced-root > circle", "Balanced center hides the root's ordinary connector dot / underline");
test.assertNotIncludes(css, ".docmap-balanced-node-text", "Old hand-rolled balanced text style is removed");
test.assertNotIncludes(css, ".docmap-mm-left .markmap-foreign", "Removed the broken left-label text-align rule that clipped labels");

// fit + print must wait for the mirror + center pass, not frame the raw one-sided render.
test.assertIncludes(app, 'docMapLayoutFor() === "balanced" && docMapBalancedPending', "fitDocMapCanvasToView waits for the balanced center pass");
test.assertIncludes(app, "docMapBalancedReadyPromise", "Print waits for the balanced mirror + center pass before cloning");
test.assertIncludes(app, "function buildDocMapPrintHtml", "DocMap builds a dedicated print document");
test.assertIncludes(app, "function docMapPrintMarkmapCss", "DocMap PDF reuses Markmap CSS from the app");
test.assertIncludes(app, "document.styleSheets", "DocMap PDF copies the active app stylesheet rules");
test.assertIncludes(app, "bodyClass = document.body?.classList.contains(\"use-liquid-glass\")", "DocMap PDF preserves the active DocMap theme class");
test.assertIncludes(app, '".docmap-balanced-center-box"', "DocMap PDF copies the balanced center-box style");
test.assertIncludes(app, '".docmap-mm-balanced-root"', "DocMap PDF copies balanced root ornament rules");
test.assertIncludes(app, "function docMapPrintPageMetrics", "DocMap PDF chooses paper geometry from the map layout");
test.assertIncludes(app, 'page: "A4 landscape"', "DocMap PDF uses landscape A4 for symmetric maps");
test.assertIncludes(app, 'page: "A4 portrait"', "DocMap PDF keeps one-side maps on portrait A4");
test.assertIncludes(app, "widthMm: 297", "DocMap PDF has a physical landscape A4 width");
test.assertIncludes(app, "heightMm: 297", "DocMap PDF has a physical portrait A4 height");
test.assertIncludes(app, "@page { size: ${printMetrics.page}; margin: 0; }", "DocMap PDF controls A4 paper margins from layout metrics");
test.assertIncludes(app, "html, body { width: ${printMetrics.widthMm}mm; height: ${printMetrics.heightMm}mm; }", "DocMap PDF applies layout-specific physical paper size");
test.assertIncludes(app, "cloneDocMapSvgForPrint", "DocMap print output uses the rendered SVG map");
test.assertIncludes(app, "function prepareDocMapSvgForPrint", "DocMap PDF uses Markmap's own fitted viewport");
test.assertIncludes(app, "docMapMarkmapInstance.fit()", "DocMap PDF fits the live map before cloning it");
test.assertIncludes(app, "function docMapSvgVisibleElementBox", "DocMap PDF crops fitted SVG viewport to visible map elements");
test.assertIncludes(app, "getBoundingClientRect", "DocMap PDF measures the rendered map geometry instead of raw data bounds");
test.assertIncludes(app, "function docMapSvgScreenRectToUserBox", "DocMap PDF converts visible screen rectangles into SVG user-space crop boxes");
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
test.assertIncludes(app, "function deepSeekV4CloudDefaults", "Cloud requests have DeepSeek v4 task defaults");
test.assertIncludes(app, "/^(?:deepseek-)?v4-(?:pro|flash)$/i", "DeepSeek v4 detection accepts provider short names such as v4-flash");
test.assertIncludes(app, "function sanitizeDeepSeekV4CloudPayload", "DeepSeek v4 cloud requests strip local-only tuning fields client-side");
test.assertIncludes(app, "delete nextPayload.reasoning_effort", "DeepSeek v4 cloud requests do not send reasoning_effort=none");
test.assertIncludes(app, "delete nextPayload.chat_template_kwargs", "DeepSeek v4 cloud requests do not leak local chat-template kwargs");
test.assertIncludes(app, "delete nextPayload.top_k", "DeepSeek v4 cloud requests do not leak local top_k sampling");
test.assertIncludes(app, 'nextPayload.thinking = { type: "disabled" }', "DeepSeek v4 product requests disable thinking client-side");
test.assertIncludes(cloudRoute, 'payload.thinking = { type: "disabled" }', "DeepSeek v4 cloud proxy enforces thinking off server-side");
test.assertIncludes(cloudRoute, "function stripDeepseekV4LocalOnlyFields", "DeepSeek v4 cloud proxy strips local-only tuning fields server-side");
test.assertIncludes(cloudRoute, "\"v4-flash\"", "DeepSeek v4 cloud proxy accepts short model names");
test.assertIncludes(cloudRoute, "delete payload.reasoning_effort", "DeepSeek v4 cloud proxy removes invalid reasoning_effort=none");
test.assertIncludes(cloudRoute, "delete payload.chat_template_kwargs", "DeepSeek v4 cloud proxy removes local chat-template kwargs");
test.assertIncludes(app, 'max_tokens: structuredTask ? cloudTaskMaxTokens(kind) : cloudTaskMaxTokens("chat")', "DeepSeek v4 chat requests have a bounded default output");
test.assertIncludes(cloudRoute, "payload.max_tokens = 1800", "DeepSeek v4 cloud proxy adds a fast default output cap");
test.assertIncludes(app, "function localChatDefaults", "Local model requests have product defaults");
test.assertIncludes(app, "function localNoThinkingDefaults", "Local model requests disable thinking client-side");
test.assertIncludes(localChat, "function tuneLocalNoThinkingPayload", "Local model proxy disables thinking server-side");
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
test.assertIncludes(en, "docmap_print_pdf", "English copy includes the DocMap PDF command");
test.assertIncludes(zh, "docmap_print_pdf", "Chinese copy includes the DocMap PDF command");
test.assertIncludes(en, "docmap_layout_balanced", "English copy includes the balanced layout command");
test.assertIncludes(zh, "docmap_layout_balanced", "Chinese copy includes the balanced layout command");
test.assertIncludes(en, "docmap_focus_root", "English copy includes the phone focus action");
test.assertIncludes(zh, "docmap_focus_root", "Chinese copy includes the phone focus action");
test.assertIncludes(en, "docmap_mobile_hint", "English copy explains DocMap touch navigation");
test.assertIncludes(zh, "docmap_mobile_hint", "Chinese copy explains DocMap touch navigation");

test.assertIncludes(app, 'window.AISystem6TimeMachine?.docMapSource?.()', "DocMap reaches the loaded Time Machine page through the lazy window's accessor");
test.assertIncludes(app, 'if (activeName === "timeMachine") {', "a Time Machine page in front is a DocMap source like a Reader page");
test.assertIncludes(app, "const timeMachineSource = docMapSourceFromTimeMachine();", "DocMap's own entry points still find the Time Machine page once its window is no longer active");
test.assertIncludes(app, 'registerAskBarSource("docMap", describeDocMapAskScope)', "DocMap asks through the shared ask bar");
test.assertIncludes(app, 't("ask_scope_focus", node.title)', "the DocMap ask bar names the focused branch that rides along with the whole map");

test.finish();
