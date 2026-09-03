// Icon reversal (反白) is a system behavior, not a per-icon favor: any icon
// container that can sit inside a reversed or selected parent — a menu-bar
// title button, the active Control Panel chooser tab, a Control Strip module
// tile — must carry a matching reversal/legibility treatment, or the classic
// 1-bit art goes black-on-black (or the bare mask paints a black blob).
//
// The pinned lists below are DERIVED from the markup and module sources, so a
// new icon button added without the treatment fails here instead of shipping.

import { createFeatureTest, exists, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("icon-reversal");
const html = read("index.html");
const icons = read("styles/40-icons.css");
const strip = read("styles/89-control-strip.css");
const stripRuntime = read("app/features/control-strip.js");
const stripModules = read("app/features/control-strip-modules.js");
const systemIcons = read("app/core/system-icons.js");

// ---------------------------------------------------------------------------
// The classic vocabulary, read from the painter: only these ids render the
// mask+art pair (`has-classic-mask`) that the reversal rules act on.
// ---------------------------------------------------------------------------
const vocabularyMatch = systemIcons.match(
  /const completeEraSystemIconIds = new Set\(\(([\s\S]*?)\)\.split\(" "\)\)/,
);
test.assert(vocabularyMatch, "the classic-era icon vocabulary is readable from system-icons.js");
const classicVocabulary = new Set(
  [...vocabularyMatch[1].matchAll(/"([^"]+)"/g)]
    .flatMap(([, part]) => part.trim().split(/\s+/))
    .filter(Boolean),
);

// ---------------------------------------------------------------------------
// A tiny tag-stack walk over one markup block: yields every element carrying
// data-system-icon along with its open-ancestor chain (tag + class list).
// ---------------------------------------------------------------------------
const VOID_TAGS = new Set(["hr", "br", "img", "input", "meta", "link", "source"]);
function iconContainersIn(markup) {
  const found = [];
  const stack = [];
  const tagPattern = /<(\/)?([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)(\/)?>/g;
  for (const [, closing, rawTag, attrs, selfClosing] of markup.matchAll(tagPattern)) {
    const tag = rawTag.toLowerCase();
    if (closing) {
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].tag === tag) { stack.length = i; break; }
      }
      continue;
    }
    const classMatch = attrs.match(/class="([^"]*)"/);
    const node = { tag, classes: classMatch ? classMatch[1].trim().split(/\s+/) : [] };
    const iconMatch = attrs.match(/data-system-icon="([^"]*)"/);
    if (iconMatch) found.push({ iconId: iconMatch[1], node, ancestors: [...stack] });
    if (!VOID_TAGS.has(tag) && !selfClosing) stack.push(node);
  }
  return found;
}

function classicAssetsExist(iconId, size) {
  return exists(`assets/themes/classic/icons/${iconId}-${size}.svg`)
    && exists(`assets/themes/classic/icons/${iconId}-mask-${size}.svg`);
}

// ---------------------------------------------------------------------------
// 1. Menu bar. Every icon in the menu bar must live where the generic menu
//    reversal rules reach it: a button that is the direct child of a `.menu`
//    wrapper. An icon button parked anywhere else in the bar has no reversal
//    rule and fails here until one is written for its container.
// ---------------------------------------------------------------------------
const headerStart = html.indexOf('<header class="menu-bar"');
const headerEnd = html.indexOf("</header>");
test.assert(headerStart > -1 && headerEnd > headerStart, "the menu bar markup is where this contract expects it");
const menuBarIcons = iconContainersIn(html.slice(headerStart, headerEnd));
test.assert(menuBarIcons.length >= 2, "the menu bar still carries the model and project icons this contract was written for");
for (const { iconId, ancestors } of menuBarIcons) {
  const buttonDepth = ancestors.map((a) => a.tag).lastIndexOf("button");
  test.assert(buttonDepth > 0, `menu-bar icon "${iconId}" sits inside a button the reversal rules can address`);
  const parentOfButton = ancestors[buttonDepth - 1];
  test.assert(
    parentOfButton && parentOfButton.tag === "div" && parentOfButton.classes.includes("menu"),
    `menu-bar icon "${iconId}" is a direct .menu > button title icon; an icon button elsewhere in the bar needs its own reversal rule in 40-icons.css before this list admits it`,
  );
  test.assert(classicVocabulary.has(iconId), `menu-bar icon "${iconId}" is in the classic vocabulary, so it renders the mask+art pair the reversal rules act on`);
  test.assert(classicAssetsExist(iconId, 16), `menu-bar icon "${iconId}" owns 16px classic art and mask files`);
}

// The generic menu-title reversal treatment those containers rely on.
test.assertMatches(icons,
  /\.menu\.is-open > button \.sys-icon-svg\.has-classic-mask \.sys-icon-classic-art,\s*\.menu-bar > \.menu > button:focus-visible \.sys-icon-svg\.has-classic-mask \.sys-icon-classic-art \{\s*filter: invert\(1\);/,
  "a pulled-down or keyboard-focused menu title inverts its classic art");
test.assertMatches(icons,
  /\.menu-bar > \.menu > button:hover \.sys-icon-svg\.has-classic-mask \.sys-icon-classic-art \{\s*filter: invert\(1\);/,
  "a hovered menu title inverts its classic art on pointer devices");

// The warm-up: without a resting no-op filter, Chromium's first invert(1)
// composites a stale raster — a white plate on the menu title, a swallowed
// art layer (bare black mask) on the active chooser tab.
test.assertMatches(icons,
  /\.sys-icon-svg\.has-classic-mask \.sys-icon-classic-art \{\s*filter: invert\(0\);/,
  "classic art rests on the filter path (invert(0)) so state inverts repaint from live vectors, not a stale raster");

// ---------------------------------------------------------------------------
// 2. Control Panel chooser. The active tab shows the black mask silhouette
//    with the art reversed on top; every tab icon therefore needs real mask
//    and art assets, or selection paints a solid black blob.
// ---------------------------------------------------------------------------
const chooserStart = html.indexOf('class="system-tabs control-chooser"');
test.assert(chooserStart > -1, "the Control Panel chooser markup is present");
const chooserEnd = html.indexOf("</div>", chooserStart);
const chooserIcons = iconContainersIn(html.slice(chooserStart - 200, chooserEnd));
test.assert(chooserIcons.length >= 4, "the chooser still carries its four tab icons");
for (const { iconId, ancestors } of chooserIcons) {
  test.assert(
    ancestors.some((a) => a.classes.includes("system-tab")),
    `chooser icon "${iconId}" sits inside a .system-tab the active-tab reversal addresses`,
  );
  test.assert(classicVocabulary.has(iconId), `chooser icon "${iconId}" is in the classic vocabulary`);
  test.assert(classicAssetsExist(iconId, 32), `chooser icon "${iconId}" owns the 32px classic art and mask the active tab reverses`);
}
test.assertMatches(icons,
  /\.control-chooser \.system-tab\.is-active \.sys-icon-svg\.has-classic-mask \.sys-icon-classic-mask \{\s*display: block;/,
  "the active chooser tab reveals the classic mask silhouette");
test.assertMatches(icons,
  /\.control-chooser \.system-tab\.is-active \.sys-icon-svg\.has-classic-mask \.sys-icon-classic-art \{\s*filter: invert\(1\);/,
  "the active chooser tab reverses the art to white over the silhouette");

// ---------------------------------------------------------------------------
// 3. Control Strip. Module tiles become a full ink block on hover / focus /
//    open; the classic art must invert with them or it disappears.
// ---------------------------------------------------------------------------
test.assertIncludes(stripRuntime, 'button.className = "control-strip-module"', "strip modules are the buttons this contract pins");
test.assertIncludes(stripRuntime, 'button.innerHTML = renderSystemIcon(iconId, { size: "mini" })', "strip modules render system icons, so they carry classic art");
test.assertMatches(strip,
  /\.control-strip-module:hover \.sys-icon-svg\.has-classic-mask \.sys-icon-classic-art,\s*\.control-strip-module:focus-visible \.sys-icon-svg\.has-classic-mask \.sys-icon-classic-art,\s*\.control-strip-module\.is-open \.sys-icon-svg\.has-classic-mask \.sys-icon-classic-art \{\s*filter: invert\(1\);/,
  "a hovered, focused, or open strip module inverts its classic art instead of going black-on-black");

// Every icon a strip module can show either owns classic 16px assets (so the
// invert has art to reverse) or is a shared inline glyph that follows the
// tile's currentColor. A new module icon outside both sets fails here.
const stripIconIds = new Set(
  stripModules.split("\n")
    .filter((line) => /^\s*icon: /.test(line))
    // Comparison operands (`state.state === "ready"`) are state values, not
    // icon ids; drop them before collecting the quoted ids.
    .flatMap((line) => [...line.replace(/[!=]==?\s*"\w+"/g, "").matchAll(/"(\w+)"/g)].map((m) => m[1])),
);
test.assert(stripIconIds.size >= 5, "the strip module icon list is readable from control-strip-modules.js");
for (const iconId of stripIconIds) {
  if (classicVocabulary.has(iconId)) {
    test.assert(classicAssetsExist(iconId, 16), `strip module icon "${iconId}" owns 16px classic art and mask files`);
  } else {
    test.assertMatches(systemIcons, new RegExp(`(transportIconPaths = \\{[\\s\\S]*?|systemIconPaths = \\{[\\s\\S]*?)\\b${iconId}:`),
      `strip module icon "${iconId}" is a shared inline glyph that rides currentColor through the inverted tile`);
  }
}

test.finish();
