// Menu keyboard navigation contract.
//
// A desktop user opens a menu with Enter and expects arrow keys to work:
// Down / Up walk the items with a visible focus ring, Right opens a submenu,
// Left closes it, Home / End jump to the ends, and Escape closes everything.
// This pins that behavior in the shared menu keydown handler, and pins the
// guard that arrow keys are only captured while focus is on the open menu —
// typing in a textarea with a menu open must never be hijacked.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("menu-keyboard");
const wireup = read("app/core/wireup.js");
const actions = read("app/core/actions.js");

// The shared menu-bar keydown handler owns the arrows (wireup.js), while
// Escape continues to route through the existing closeMenus() path (actions).
test.assertIncludes(wireup, "ArrowDown", "ArrowDown is handled in the shared keydown path");
test.assertIncludes(wireup, "ArrowUp", "ArrowUp is handled in the shared keydown path");
test.assertIncludes(wireup, "ArrowRight", "ArrowRight is handled in the shared keydown path");
test.assertIncludes(wireup, "ArrowLeft", "ArrowLeft is handled in the shared keydown path");
test.assertIncludes(wireup, '"Home", "End"', "Home and End jump to the ends of an open menu");
test.assertIncludes(wireup, "function handleMenuArrowKey(event)", "the arrow handler is a named, testable helper");
test.assertIncludes(wireup, "function menuPopoverButtons(popover)", "menu items are enumerated through one helper");
test.assertIncludes(wireup, "menu-submenu-trigger", "submenu triggers participate in the walk and open with ArrowRight");
test.assertIncludes(wireup, "toggleMenuSubItem(item)", "ArrowRight reuses the same submenu open/close path as hover and click");
test.assertIncludes(wireup, "item.classList.remove(\"is-open\")", "ArrowLeft closes the submenu");
test.assertIncludes(wireup, "trigger.focus()", "ArrowLeft returns focus to the parent trigger");

// The guard: arrows only fire while focus is on the open menu or its bar
// button, so typing elsewhere with a menu open is never hijacked.
test.assertMatches(
  wireup,
  /\["ArrowDown", "ArrowUp", "ArrowRight", "ArrowLeft", "Home", "End"\]\.includes\(event\.key\)[\s\S]*?openMenu && \(insidePopover \|\| onOpenMenuButton\)/,
  "arrow navigation is gated to the open menu and its bar button"
);

// Escape keeps its existing global behavior (close menus, then refocus the
// compose toggle if it was open).
test.assertIncludes(wireup, 'if (event.key === "Escape")', "Escape handling stays in the shared keydown");
test.assertIncludes(actions, "function closeMenus()", "Escape still routes through the existing closeMenus()");
test.assertMatches(wireup, /closeMenus\(\);[\s\S]*closeTeachTextCommandMenus\(\);[\s\S]*closeComposeToolsMenu\(\);/, "Escape closes system, TeachText, and compose menus together");

test.finish();
