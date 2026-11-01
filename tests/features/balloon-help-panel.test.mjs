// Which panel does this object own?
//
// The balloon stands down for the panel its own control opens. That rule reads
// one answer — balloonHelpOwnedPanel(target) — and that answer was wrong for
// every select the harness had converted: the visible control is the button,
// and the balloon keys sat on the transparent native select behind it, so the
// lookup asked the select for a wrap *inside itself* and found nothing. With no
// owned panel the balloon could not stand down, and the list opened underneath
// it — the report that began "说了很多次气球帮助不要挡住菜单".
//
// Three shapes have to resolve to the same listbox: the button a person points
// at, the native select behind it, and a label wrapping the whole control. This
// contract runs the real module against a DOM stub and asks for each.

import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("balloon-help-panel");
const source = read("app/core/balloon-help.js");

/** One element, with the four lookups the panel search actually uses. */
function makeElement(tag = "div", classes = []) {
  const element = {
    tagName: tag.toUpperCase(),
    classList: {
      _set: new Set(classes),
      add(name) { this._set.add(name); },
      remove(name) { this._set.delete(name); },
      contains(name) { return this._set.has(name); },
    },
    dataset: {},
    parentElement: null,
    children: [],
    hidden: false,
    get className() { return [...element.classList._set].join(" "); },
    append(child) {
      child.parentElement = element;
      element.children.push(child);
      return child;
    },
    matches(selector) {
      return selector.split(",").some((part) => {
        const trimmed = part.trim();
        if (trimmed === ":scope") return false;
        const pieces = trimmed.split(".").filter(Boolean);
        return pieces.every((piece) => element.classList.contains(piece));
      });
    },
    closest(selector) {
      let node = element;
      while (node) {
        if (node.matches?.(selector)) return node;
        node = node.parentElement;
      }
      return null;
    },
    querySelector(selector) {
      // Only the two forms the module uses: ":scope > .x" and ".x".
      const scoped = selector.startsWith(":scope > ");
      const wanted = (scoped ? selector.slice(":scope > ".length) : selector).trim();
      const search = (node) => {
        for (const child of node.children) {
          if (child.matches?.(wanted)) return child;
          if (!scoped) {
            const nested = search(child);
            if (nested) return nested;
          }
        }
        return null;
      };
      return search(element);
    },
    querySelectorAll() { return []; },
    getBoundingClientRect() { return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }; },
  };
  return element;
}

const context = vm.createContext({ window: {}, document: {} });
vm.runInContext(source, context);
const { balloonHelpOwnedPanel, balloonHelpOwnedPanelIsOpen } = context;
test.assert(typeof balloonHelpOwnedPanel === "function", "the module still answers which panel an object owns");
test.assert(typeof balloonHelpOwnedPanelIsOpen === "function", "the module still asks whether that panel is open");

function makeControl() {
  const label = makeElement("label");
  const wrap = makeElement("span", ["select-wrap", "has-system-select"]);
  const select = makeElement("select");
  const button = makeElement("button", ["system-select-button"]);
  const menu = makeElement("div", ["system-select-menu"]);
  label.append(wrap);
  wrap.append(select);
  wrap.append(button);
  wrap.append(menu);
  return { label, wrap, select, button, menu };
}

for (const shape of ["button", "select", "label"]) {
  const control = makeControl();
  const target = control[shape];
  test.assert(
    balloonHelpOwnedPanel(target) === control.menu,
    `a converted select found its listbox from the ${shape}`
  );
  test.assert(
    balloonHelpOwnedPanelIsOpen(target) === false,
    `the ${shape} reports its listbox closed while it is closed`
  );
  control.wrap.classList.add("is-system-select-open");
  test.assert(
    balloonHelpOwnedPanelIsOpen(target) === true,
    `the ${shape} reports its listbox open once it opens — this is what makes the balloon stand down`
  );
}

// A control with no panel of its own is never told to stand down.
{
  const plain = makeElement("button");
  test.assert(balloonHelpOwnedPanel(plain) === null, "a button with no panel owns nothing");
  test.assert(balloonHelpOwnedPanelIsOpen(plain) === false, "and is never suppressed");
}

test.finish();
