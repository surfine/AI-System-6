// A document window's frame is one object: the content area reaches the window's
// inner edge and carries both scroll bar lanes, the grow box occupies the single
// corner cell the two lanes leave empty, and dragging it draws the same dotted
// outline System 6 uses for a selection marquee — committing on release.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("window-frame");
const foundation = read("styles/00-foundation.css");
const windows = read("styles/10-windows.css");
const icons = read("styles/40-icons.css");
const apps = read("styles/50-apps.css");
const liquid = read("styles/70-liquid-glass.css");
const responsive = read("styles/60-responsive.css");
const windowManager = read("app/core/window-manager.js");
const frameBars = read("app/core/window-frame-bars.js");
const wireup = read("app/core/wireup.js");
const manifest = read("scripts/runtime-manifest.mjs");
const html = read("index.html");
const en = read("app/data/translations-en.js");
const zh = read("app/data/translations-zh.js");
const zoomWindowContract = windowManager.match(/function zoomWindow\(win\) \{[\s\S]*?\n\}\n\nfunction maximizeWindow/)?.[0] || "";

test.assertIncludes(html, 'data-i18n-aria-label="close"', "close boxes localize their accessible name");
test.assertIncludes(html, 'data-i18n-aria-label="zoom"', "zoom boxes localize their accessible name");
test.assertIncludes(html, 'data-i18n-aria-label="view_icon"', "the icon-view toggle localizes its accessible name");
test.assertIncludes(html, 'data-i18n-aria-label="view_list"', "the list-view toggle localizes its accessible name");
test.assertIncludes(html, 'data-i18n-aria-label="view_controls"', "the view control group localizes its accessible name");
test.assertIncludes(windowManager, 'data-i18n-aria-label", "grow_box_aria"', "the grow box localizes its accessible name");
test.assertIncludes(en, 'grow_box_aria: "Resize window"', "English names the grow box action");
test.assertIncludes(zh, 'grow_box_aria: "调整窗口大小"', "Chinese names the grow box action");
test.assertIncludes(en, 'zoom: "Zoom"', "English names the zoom box");
test.assertIncludes(zh, 'zoom: "缩放"', "Chinese names the zoom box");
for (const key of ["view_controls", "view_icon", "view_list", "writing_path", "resize_tabs"]) {
  test.assertIncludes(en, `${key}:`, `English has the ${key} accessible label`);
  test.assertIncludes(zh, `${key}:`, `Chinese has the ${key} accessible label`);
}

test.assertMatches(
  windows,
  /\.window\.is-collapsed > \.title-bar \{[^}]*margin-bottom: 0;[^}]*border-bottom: 0;/,
  "WindowShade ends at the outer frame without a duplicate title-bar seam"
);

// One band, one token: the lanes and the grow box are the same 16px of chrome,
// so the corner cell can never be a different size from the bars it terminates.
test.assertIncludes(foundation, "--window-frame-lane: 16px", "Frame lane width is a single token");
test.assertIncludes(windows, "width: var(--window-frame-lane)", "Grow box takes its width from the frame lane token");
test.assertIncludes(windows, "height: var(--window-frame-lane)", "Grow box takes its height from the frame lane token");
test.assertMatches(
  windows,
  /\.window-frame-bar\.is-vertical \{[^}]*width: var\(--window-frame-lane\)/,
  "Scroll bar lanes are the same width as the grow box"
);
// One px of difference between the corner cell and the lanes leaves a white
// seam exactly where the two lanes are supposed to meet.
test.assertNotIncludes(
  responsive,
  ".grow-box {\n  width: 15px;",
  "Nothing overrides the corner cell's size behind the lane token's back"
);
test.assertMatches(
  frameBars,
  /bar\.style\.setProperty\("--frame-bar-start", vertical \? `\$\{frameBarTop\(win, host\)\}px` : "0px"\)/,
  "The horizontal lane spans the whole frame width; only the vertical one starts at the content"
);
// The lane's line has to join the line above it: starting at the content's own
// top edge leaves a gap wherever that content carries padding.
test.assertMatches(
  frameBars,
  /return Math\.round\(above \? above\.offsetTop \+ above\.offsetHeight : region\.offsetTop\)/,
  "The vertical lane starts on the seam below the strip above it"
);
test.assertMatches(
  windows,
  /\.window-frame-bar\.is-vertical \{[^}]*bottom: var\(--window-frame-lane\)/,
  "The vertical bar stops one cell short — that cell is the grow box"
);
test.assertMatches(
  windows,
  /\.window-frame-bar\.is-horizontal \{[^}]*right: var\(--window-frame-lane\)/,
  "The horizontal bar stops at the same corner cell"
);

// The bars are ours, not the engine's: Chrome parks both scrollbar buttons at
// one end and :start/:end/:single-button do not match, so arrows at both ends
// are only possible with real elements.
test.assertMatches(
  windows,
  /\.window \.window-frame-scroller \{[^}]*scrollbar-width: var\(--window-frame-scrollbar-width\)/,
  "A framed content area hides the engine's own bars by token"
);

test.assertIncludes(foundation, "--window-frame-scrollbar-width: none", "Classic suppresses the native bars");
test.assertIncludes(frameBars, "function installWindowFrameBars()", "Framed scrollers get System 6 bars");
test.assertIncludes(wireup, "installWindowFrameBars();", "Frame bars are installed with the rest of the window chrome");
test.assertIncludes(manifest, '"app/core/window-frame-bars.js"', "The frame bar module loads at startup, not lazily");
test.assertMatches(
  frameBars,
  /bar\.append\(createFrameArrow\(axis === "vertical" \? "up" : "left"\), track, createFrameArrow\(axis === "vertical" \? "down" : "right"\)\)/,
  "Each bar is arrow, track, arrow — one arrow box at each end"
);
test.assertIncludes(frameBars, "frameBarRepeatInterval", "Holding an arrow or the track keeps scrolling");
// Drawn the way the vendored system.css reference draws them: a 2px checker for
// the track, and every line in the lane drawn exactly once.
test.assertMatches(
  foundation,
  /--window-frame-track-bg:\s*linear-gradient\(45deg[^;]*4px 4px,\s*linear-gradient\(45deg[^;]*2px 2px \/ 4px 4px/,
  "The lane's gray is a 2px checker, not a flat fill"
);
test.assertMatches(
  windows,
  /\.is-vertical \.window-frame-thumb \{[^}]*border-right: 0/,
  "The thumb does not double the window frame's line"
);
test.assertMatches(
  windows,
  /\.is-vertical \.window-frame-arrow\.is-up \{\s*border-bottom: var\(--window-frame-track-border\)/,
  "An arrow box is closed against the track and open against the frame"
);
test.assertMatches(
  windows,
  /\.window-frame-arrow:active \{[^}]*--window-frame-arrow-bg: var\(--ink\);[^}]*--window-frame-arrow-ink: var\(--paper\)/,
  "A pressed arrow box inverts, as System 6's does"
);
test.assertMatches(
  frameBars,
  /observe\(document\.body, \{ attributes: true, attributeFilter: \["class"\] \}\)/,
  "Switching themes at runtime re-syncs the bars instead of needing a reload"
);
test.assertMatches(
  frameBars,
  /onFramePress\(target, handler\)|function onFramePress/,
  "Bars respond to pointer and legacy mouse input alike"
);
test.assertMatches(
  frameBars,
  /bar\.classList\.toggle\("is-empty", !scrollable\)/,
  "A bar with nothing to scroll goes empty instead of showing a full-length thumb"
);
test.assertMatches(
  windows,
  /\.window-frame-bar\.is-empty \.window-frame-thumb,\n\.window:not\(\.is-active\) \.window-frame-thumb,\n\.window:not\(\.is-active\) \.window-frame-arrow \{\n  visibility: hidden/,
  "An inactive window's bars show no thumb and no arrows"
);
test.assertMatches(
  responsive,
  /body \{\n    --window-frame-bar-display: none;\n    --window-frame-reserve: 0px;/,
  "A phone gets neither the bars nor the reserved lanes"
);

// Scrollbar styling stays opt-in (see css-no-pingpong: a global selector hits
// every nested pane in the app).
test.assertNotIncludes(windows, "*::-webkit-scrollbar", "Classic scroll bar styling never uses a global selector");

// Theme split: the structure is shared, the material is not.
test.assertIncludes(liquid, "--window-frame-lane: 12px", "Liquid Glass overrides the lane by token, not by a new twin selector");
test.assertIncludes(liquid, "--window-frame-bar-display: none", "Liquid Glass keeps its own native scroll bars");
test.assertIncludes(liquid, "--window-frame-reserve: 0px", "Liquid Glass reserves no lane, since it draws no bars");
test.assertNotIncludes(liquid, ".window-frame-scroller", "Liquid Glass needs no frame-scroller twin at all");
test.assertNotIncludes(liquid, ".window-frame-bar", "Liquid Glass needs no frame-bar twin at all");

// Inactive windows draw no grow box, exactly as System 6 erases the scroll bars
// and grow icon of a window that is not in front.
// A background window keeps the *shape* of its frame — the corner cell's two
// hairlines stay, so the lanes still end somewhere — and loses only the icon
// inside it and the ability to drag it.
test.assertMatches(
  windows,
  /\.window:not\(\.is-active\) \.grow-box \{[^}]*background-image: none;\s*pointer-events: none/,
  "An inactive window keeps its empty corner cell but no grow icon"
);

// Resize feedback: dotted outline in Classic, live sizing in Liquid Glass.
test.assertIncludes(apps, ".window-outline", "The resize outline shares the marquee's dotted primitive");
test.assertMatches(
  apps,
  /\.finder-marquee,\n\.window-outline \{[^}]*var\(--drag-outline-dashes-x\)/,
  "Marquee and window outline are drawn by one rule, not two lookalikes"
);
// System 6's outlines are the 50% gray pattern XOR'd over whatever is beneath,
// not the browser's round-dot `dotted` border.
test.assertMatches(
  apps,
  /\.finder-marquee,\n\.window-outline \{(?:(?!\}|border:)[\s\S])*\}/,
  "Drag outlines no longer rely on the browser's dotted border rendering"
);
test.assertIncludes(foundation, "--drag-outline-unit: 1px", "The dash unit is a one-pixel hairline, like the gray pattern");
test.assertIncludes(foundation, "--drag-outline-blend: difference", "Classic outlines invert the pixels underneath");
test.assertIncludes(liquid, "--drag-outline-blend: normal", "Glass draws a plain ink line instead of an invert");
// The grow image previews the frame it will produce — the seam under the title
// bar and both scroll bar lanes — so the corner cell being dragged is visible.
test.assertIncludes(apps, ".window-outline.is-frame", "Sizing previews the frame, not just the area");
test.assertMatches(
  apps,
  /\.window-outline\.is-frame \{[^}]*--outline-lane: var\(--window-frame-lane\)/,
  "The ghost's lanes are the same width as the real ones"
);
test.assertMatches(
  apps,
  /\.window-outline\.is-frame \{[^}]*var\(--drag-outline-dashes-x\) left var\(--outline-titlebar, 0\)/,
  "The ghost carries the seam under the title bar"
);
// The lanes meet at the bottom-right cell and nowhere else: the vertical lane
// starts below the title bar seam, as a real scroll bar does.
test.assertMatches(
  apps,
  /var\(--drag-outline-dashes-y\) calc\(100% - var\(--outline-lane, 0px\)\) bottom \/\s*var\(--drag-outline-unit\) calc\(100% - var\(--outline-titlebar, 0px\)\)/,
  "The ghost's vertical lane does not cut through the title bar"
);
test.assertIncludes(windowManager, "function createWindowOutline(rect, win = null)", "Resize can draw a prospective frame");
test.assertMatches(
  windowManager,
  /outline\.className = win \? "window-outline is-frame" : "window-outline"/,
  "Only a sized window gets the frame skeleton; a moved one gets the plain outline"
);
test.assertMatches(
  windowManager,
  /if \(!win\.querySelector\("\.window-frame-scroller"\)\) \{\s*outline\.style\.setProperty\("--outline-lane", "0px"\)/,
  "A window with no lanes previews none"
);
test.assertIncludes(
  windowManager,
  'document.body.classList.contains("use-liquid-glass")\n    ? null\n    : createWindowOutline(rect, win)',
  "Liquid Glass keeps live sizing; Classic gets the outline"
);

// One rule for "not in front", applied to all three parts of the frame: an
// inactive window keeps its name and its shape and loses every control.
test.assertIncludes(
  foundation,
  "--system-titlebar-inactive-control-visibility: hidden",
  "Classic hides an inactive window's close and zoom boxes"
);
test.assertIncludes(
  liquid,
  "--system-titlebar-inactive-control-visibility: visible",
  "Glass keeps its dimmed traffic lights on background windows"
);
test.assertMatches(
  responsive,
  /\.window:not\(\.is-active\) \.close-box,\n\.window:not\(\.is-active\) \.resize-box \{[^}]*visibility: var\(--system-titlebar-inactive-control-visibility\)/,
  "The inactive title bar drops its controls by token"
);
// macOS states the same thing its own way: a background window's traffic lights
// go one flat gray and drop their glyphs, rather than being dimmed in colour.
test.assertIncludes(liquid, "--glass-lamp-inactive: #d4d5d7", "Glass has one flat gray for background lamps");
test.assertMatches(
  liquid,
  /body\.use-liquid-glass \.close-box \{[^}]*var\(--glass-lamp-close\)/,
  "The close lamp's colour comes from a token, so state can swap it"
);
test.assertMatches(
  responsive,
  /\.window:not\(\.is-active\) \.close-box,\n\.window:not\(\.is-active\) \.resize-box \{[^}]*--glass-lamp-close: var\(--glass-lamp-inactive\)/,
  "One inactive rule serves both themes: stripes and controls in Classic, gray lamps in glass"
);
test.assertMatches(
  responsive,
  /\.window:not\(\.is-active\) \.close-box,\n\.window:not\(\.is-active\) \.resize-box \{[^}]*--glass-lamp-mark-opacity: 0/,
  "A background window's lamps show no glyphs"
);
test.assertIncludes(
  liquid,
  "--system-titlebar-inactive-control-filter: none",
  "Gray is the signal now, so glass stops desaturating the lamps"
);
test.assertIncludes(
  foundation,
  "--system-titlebar-inactive-title-color: var(--ink)",
  "An inactive window's name stays black; only its stripes and controls go"
);
test.assertIncludes(
  foundation,
  "--system-titlebar-inactive-bg: var(--paper)",
  "An inactive title bar loses its stripes"
);
test.assertIncludes(foundation, "--system-titlebar-padding-y: 2px", "Classic title bars expose the native six-rule stripe field");
test.assertIncludes(foundation, "--system-titlebar-height: 17px", "Classic title bars keep the native compact window-chrome height");
test.assertIncludes(foundation, "--system-titlebar-stripe-size: 2px", "Classic title bars use the native two-pixel six-rule rhythm");
test.assertIncludes(foundation, "--system-titlebar-control-art-size: 11px", "Classic close and zoom boxes keep the native 11-pixel outer art");
test.assertMatches(windows, /\.resize-box::before \{[^}]*width: 6px;[^}]*height: 6px;/, "Classic zoom's stroked pseudo-element resolves to the native 7-by-7 inner square inside its 11-pixel frame");
test.assertIncludes(foundation, "--system-titlebar-title-height: 12px", "Classic reserves the native twelve-pixel title field");
test.assertIncludes(foundation, "--system-titlebar-font-size: 12px", "Classic titles use the Chicago 12-pixel face");
test.assertIncludes(foundation, "--system-titlebar-control-art-offset-y: calc((var(--system-titlebar-control-size) - var(--system-titlebar-title-height)) / 2)", "Classic aligns the native control art with the title field inside its larger hit target");
test.assertIncludes(windows, "grid-template-rows: var(--system-titlebar-title-height)", "The larger title-bar hit targets cannot enlarge the painted title row");
test.assertIncludes(windows, "align-content: center", "The native title row stays centered inside the title-bar box");
test.assertMatches(responsive, /\.title-bar h1,\n\.title-bar h2 \{[^}]*font-size: var\(--system-titlebar-font-size\)/, "The later responsive layer preserves Chicago 12 in Classic title bars");
test.assertNotMatches(responsive, /html:lang\(zh-Hans\) \.title-bar h1,\nhtml:lang\(zh-Hans\) \.title-bar h2 \{\n  font-size: var\(--system-title-size\)/, "The final Chinese locale rule cannot enlarge Classic titles after native sizing");
test.assertMatches(windows, /\.title-bar h1,\n\.title-bar h2 \{[^}]*align-self: center/, "Classic window titles share the title-bar vertical center");
test.assertMatches(windows, /\.close-box,\n\.resize-box \{[^}]*align-self: center/, "Classic close and zoom hit targets share the title-bar vertical center");
test.assertMatches(liquid, /body\.use-liquid-glass \.close-box,\nbody\.use-liquid-glass \.resize-box \{[^}]*align-self: center;[^}]*margin: 0;/, "Liquid close and zoom lamps use grid centering instead of a manual top offset");
test.assertIncludes(foundation, "--system-titlebar-control-focus-outline: 0", "Classic title-bar controls do not expose a browser-coloured focus rectangle around the full hit target");
test.assertIncludes(foundation, "--system-titlebar-control-focus-shadow: none", "Classic title-bar focus does not manufacture a second oversized frame");
test.assertIncludes(windows, "--system-titlebar-control-art-offset-x: var(--system-titlebar-close-art-offset-x)", "The close box sits at the native leading inset while retaining its larger hit target");
test.assertIncludes(windows, "--system-titlebar-control-art-offset-x: var(--system-titlebar-resize-art-offset-x)", "The zoom box sits at the native trailing inset while retaining its larger hit target");
test.assertMatches(wireup, /bar\.addEventListener\("dblclick"[\s\S]*const win = bar\.closest\("\.window"\);\s*if \(win\) toggleCollapsed\(win\);/, "Double-clicking an ordinary title bar keeps the separate WindowShade action");
test.assertMatches(wireup, /win\.querySelector\("\.resize-box"\)\?\.addEventListener\("click", \(\) => \{\s*zoomWindow\(win\);/, "The right-side title-bar box invokes Zoom, not WindowShade");
test.assertNotIncludes(zoomWindowContract, "toggleCollapsed", "Zoom never falls back to WindowShade on a narrow or fixed-size window");
test.assertMatches(windowManager, /function isZoomableWindow\(win\) \{[\s\S]*\.resize-box:not\(\[disabled\]\)/, "Zoom capability follows the title-bar Zoom box instead of the grow-box allowlist");
test.assertIncludes(html, 'aria-label="Zoom"', "Title-bar Zoom boxes expose their actual semantic name");
test.assertNotIncludes(html, 'aria-label="Resize"', "No Zoom box is announced as the separate grow/resize action");
test.assertIncludes(foundation, "--window-border: 1px solid var(--ink)", "Classic window frames keep the native one-pixel outer hairline");
test.assertIncludes(foundation, "--window-frame-track-border: 1px solid var(--ink)", "Classic scroll-bar lanes use one-pixel seams");
test.assertMatches(responsive, /\.window \{[^}]*border: var\(--window-border\)/, "The later responsive layer cannot restore the old two-pixel window border");
test.assertMatches(responsive, /\.title-bar \{[^}]*border-bottom: var\(--window-frame-track-border\)/, "The later responsive layer keeps the title-bar bottom seam at one native pixel");
test.assertNotMatches(responsive, /\.window,\n\.writing-spine-panel,\n\.spine-toolbox-panel \{[^}]*border: var\(--system-border\)/, "The final responsive window rule no longer shares the two-pixel panel border");
test.assertIncludes(foundation, "--active-window-shadow: none", "Classic windows do not invent a drop shadow absent from System 6");
test.assertMatches(responsive, /\.window \{[^}]*box-shadow: var\(--active-window-shadow\)/, "Later window layers preserve the active-window shadow contract");
test.assertMatches(responsive, /\.writing-spine-panel \{[^}]*border: 0;[^}]*box-shadow: none;/, "Writing Flow's transparent placement wrapper cannot double its panel frame or shadow");
test.assertMatches(responsive, /\.spine-toolbox-panel \{[^}]*border: var\(--window-border\);[^}]*box-shadow: var\(--active-window-shadow\);/, "Writing Flow's visible panel shares Classic window frame weight");
test.assertNotMatches(responsive, /\.title-bar,\n\.spine-title-row \{[^}]*border-bottom: 2px solid var\(--ink\)/, "The late title-bar layer cannot restore a two-pixel seam");
test.assertMatches(windows, /\.window-frame-arrow\.is-up \{[^}]*background-size: 1px 1px, 3px 1px, 5px 1px, 7px 1px/, "Classic scroll arrows are stepped 1-bit pixels instead of smooth diagonals");
// System 6 had no resize pointer at all: the arrow stays an arrow.
test.assertMatches(
  windows,
  /\.grow-box \{[^}]*cursor: default/,
  "The grow box does not invent a modern resize cursor"
);
test.assertMatches(
  windowManager,
  /if \(outline\) \{\s*sizeWindowOutline\(outline, width, height\);\s*return;/,
  "While an outline is up, the window itself does not reflow"
);
test.assertMatches(
  windowManager,
  /if \(outline\) \{\s*outline\.remove\(\);\s*applyWindowSize\(pendingWidth, pendingHeight\);/,
  "Releasing the grow box commits the outlined frame"
);
test.assertIncludes(
  windowManager,
  'outline.style.setProperty("--outline-left"',
  "Outline geometry travels as custom properties, not inline layout styles"
);

// Moving a window speaks the same language as sizing one.
test.assertMatches(
  wireup,
  /const outline = compactViewport \|\| document\.body\.classList\.contains\("use-liquid-glass"\)\s*\?\s*null\s*:\s*createWindowOutline\(rect\)/,
  "Classic drags a window by its outline; Liquid Glass and phones move it live"
);
test.assertMatches(
  wireup,
  /if \(outline\) \{\s*positionWindowOutline\(outline, left, top\);\s*return;/,
  "While the move outline is up, the window itself stays put"
);
test.assertMatches(
  wireup,
  /if \(outline\) \{\s*outline\.remove\(\);\s*applyWindowPosition\(pendingLeft, pendingTop\);/,
  "Releasing the title bar moves the window to the outlined position"
);

// Every document window's content area is framed.
for (const marker of [
  'class="finder-grid project-disk-grid window-frame-scroller"',
  'class="window-pane finder-grid window-frame-scroller"',
  'class="window-pane finder-grid help-folder-grid window-frame-scroller"',
  'class="window-pane finder-grid applications-grid window-frame-scroller"',
  'class="window-pane finder-grid disk-grid window-frame-scroller"',
  'class="finder-grid document-icon-grid window-frame-scroller"',
  'class="trash-list window-frame-scroller"',
  'class="finder-grid project-cd-grid window-frame-scroller"',
  'class="finder-grid text-disk-grid window-frame-scroller"',
]) {
  test.assertIncludes(html, marker, `Document window content area is framed: ${marker}`);
}

// Sizing and lanes are the same fact: a window that can be sized shows the two
// lanes whose corner cell is the grow box, so dialogs and desk accessories —
// which System 6 opens at one size — are not resizable and carry no zoom box.
for (const dialog of ["pageSetup", "printDirectory", "importUtility", "findPath", "modelMeter", "dictionary", "chatFile"]) {
  test.assertMatches(
    read("app/core/config.js"),
    new RegExp(`resizableWindowNames: Object\\.freeze\\(\\[(?:(?!\\]\\))[\\s\\S])*?\\]\\)`),
    `resizable list is readable while checking ${dialog}`
  );
  test.assert(
    !read("app/core/config.js")
      .split("resizableWindowNames")[1]
      .split("]),")[0]
      .includes(`"${dialog}"`),
    `${dialog} is a dialog: no grow box, so it is not resizable`
  );
}

// The lanes belong to the window: the content region and everything below it —
// a composer, an ask row — leaves room for them.
test.assertIncludes(frameBars, "function markFrameReserve(scroller, win)", "Reserve is marked per window region, not just on the scroller");
test.assertMatches(
  windows,
  /\.window \.is-frame-margin \{\s*border-right: var\(--window-frame-reserve\) solid transparent/,
  "A framed region stops at the vertical lane"
);
test.assertMatches(
  windows,
  /\.window \.is-frame-tail \{\s*border-bottom: var\(--window-frame-reserve\) solid transparent/,
  "The bottom-most region stops at the horizontal lane"
);
test.assertMatches(
  windows,
  /\.window \.composer\.is-frame-margin \{\s*border-right: var\(--clio-composer-border\)/,
  "ClioTalk's own framed composer keeps its visible right edge"
);
test.assertMatches(
  windows,
  /\.window \.composer\.is-frame-tail \{\s*border-bottom: var\(--clio-composer-border\)/,
  "ClioTalk's own framed composer keeps its visible bottom edge"
);
test.assertIncludes(html, 'class="window-pane messages window-frame-scroller"', "ClioTalk's message list carries the window's lanes");

// A split window's lanes belong to its bottom-right region, and some of those
// regions are rebuilt at runtime — so they are named here, not in the markup,
// and the bars re-resolve them instead of holding a stale reference.
test.assertIncludes(frameBars, "const frameHostSelectors = {", "Rebuilt surfaces name their frame region in one table");
for (const [win, selector] of [
  ["teachText", ".teachtext-editor-container"],
  ["reader", "#reader-content"],
  ["scrapbook", "#scrap-form"],
  ["systemHelp", "#system-help-detail"],
]) {
  test.assertIncludes(frameBars, `${win}: "${selector}"`, `${win}'s lanes belong to its bottom-right region`);
}
test.assertMatches(
  frameBars,
  /const next = win\.querySelector\(selector\);/,
  "The bars look their region up again rather than holding it"
);
test.assertMatches(
  frameBars,
  /scroller\.classList\.add\("is-frame-scroll-surface"\)/,
  "Whatever actually scrolls gives up its own scroll bar to the lane"
);
test.assertMatches(
  windows,
  /\.window \.is-frame-scroll-surface \{\s*scrollbar-width: var\(--window-frame-scrollbar-width\)/,
  "That hand-over is a token, so glass and phones keep native bars"
);
// Every write inside a sync can re-trigger the observers watching the window.
test.assertMatches(
  frameBars,
  /if \(frame\) return;\s*frame = requestAnimationFrame/,
  "Frame syncs are coalesced, so observer feedback cannot spin"
);

// A framed window needs a grow box, or the corner cell is a dead square: Help
// Folder carried a zoom box without one.
test.assertMatches(
  read("app/core/config.js"),
  /resizableWindowNames: Object\.freeze\(\[[^\]]*"helpFolder"/,
  "Help Folder can be sized like its sibling Finder windows"
);

// Action rows sit above the framed content area — a row below it would put the
// grow box next to buttons instead of at the end of the scroll bars.
for (const [source, selector, label] of [
  [apps, ".trash-pane > .button-row", "Trash"],
  [apps, ".project-cd-pane > .button-row", "Project CD"],
  [windows, ".text-disk-pane > .button-row", "File Floppy"],
]) {
  test.assertMatches(
    source,
    new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\{[^}]*border-bottom: 1px solid var\\(--ink\\)`),
    `${label}'s action row is the seam above its content area`
  );
}
test.assertMatches(
  html,
  /<div class="window-pane trash-pane">\s*<div class="button-row">/,
  "Trash's action row comes before its list in the markup, not after"
);

// The content area may never impose a floor of its own; that is what pushed the
// bottom lane and the corner out of the Documents window.
test.assertMatches(
  windows,
  /\.window \.window-frame-scroller \{[^}]*min-height: 0/,
  "A framed content area can always shrink to the frame"
);

// A window dragged shorter than its opening height still has to show the bottom
// lane and the corner, so the pane's opening height is a basis, not a floor.
test.assertMatches(
  icons,
  /\.window-pane\.project-disk-pane \{[^}]*min-height: 0;\s*flex-basis: 430px/,
  "Project Hard Disk's pane can shrink inside a smaller frame"
);

// WindowShade is a vertical state change. A narrow screen must not turn an
// application window into Writing Spine's deliberately tiny 116px tab.
test.assertIncludes(
  responsive,
  "width: var(--window-shade-width, 116px);",
  "WindowShade uses the window's captured width while Writing Spine keeps the compact fallback"
);
test.assertMatches(
  windowManager,
  /function toggleCollapsed\(win\) \{[\s\S]*getBoundingClientRect\(\)[\s\S]*setInlineStyleValue\(win, "--window-shade-width", `\$\{width\}px`\)[\s\S]*classList\.add\("is-collapsed"\)/,
  "WindowShade captures the rendered frame before hiding the window body"
);
// The shade rolls up and down in place. A centring transform, or a compact
// layout that re-anchors a collapsed window from the viewport to the desk,
// moved the title bar out from under the pointer — the second double-click
// then missed it and the shade could not be unrolled.
test.assertMatches(
  windowManager,
  /function toggleCollapsed\(win\) \{[\s\S]*keepWindowCornerAfterShade\(win, before\)/,
  "WindowShade restores the window corner it was rolled from"
);
test.assertMatches(
  windowManager,
  /function keepWindowCornerAfterShade\(win, before\) \{[\s\S]*win\.style\.transform = "none"/,
  "the shade corner is held in the window's own positioning context"
);
test.assertMatches(
  windowManager,
  /classList\.remove\("is-collapsed"\);\s*setInlineStyleValue\(win, "--window-shade-width", ""\)/,
  "Unshading releases the captured width so responsive layout can resume"
);

test.finish();
