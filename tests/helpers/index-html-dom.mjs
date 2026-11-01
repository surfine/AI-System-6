// A tiny HTML reader for `apps/desktop/index.html`, for the boot VM's DOM shim.
//
// WHY this file exists. The shim used to make an element only when some code
// asked for it: an unknown `#id` or `[data-window="x"]` made a bare, empty
// `div` on the spot. That answers a lookup, but it does not answer a SHAPE.
// index.html is where the app declares the shape of its static markup — which
// window holds which pane, which pane holds which bar — and boot-time code
// reads that shape constantly (`win.querySelector(".window-pane")`). An empty
// stub has no pane, so the query gives null and the caller stops or throws.
// This reader gives the shim the same tree the browser gets.
//
// WHY it does not use an HTML library. The repo has no runtime dependency and
// must keep none. index.html is authored by hand and is well formed, so a
// small scanner is sufficient. The scanner reads the file one time for each
// node process (see `indexHtmlTree`), which keeps the cost off each VM boot.
//
// LIMITS, on purpose. The output is plain data: tag, attributes, direct text,
// children. There are no text nodes between elements, no comments, and no
// contents for `<script>` or `<style>`. The shim does not model those.

import { read } from "./feature-test-harness.mjs";

// Elements that close themselves. A void element must not become a container,
// or every element after it becomes its child and the tree is wrong.
const VOID_TAGS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr",
]);

// Elements whose contents are text, not markup. The scanner must jump to the
// close tag; a `<` inside a script is not a tag.
const RAW_TEXT_TAGS = new Set(["script", "style"]);

const ATTRIBUTE_PATTERN = /([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;

function parseAttributes(source) {
  const attrs = {};
  ATTRIBUTE_PATTERN.lastIndex = 0;
  let match = ATTRIBUTE_PATTERN.exec(source);
  while (match) {
    const [, name, doubleQuoted, singleQuoted, bare] = match;
    attrs[name.toLowerCase()] = doubleQuoted ?? singleQuoted ?? bare ?? "";
    match = ATTRIBUTE_PATTERN.exec(source);
  }
  return attrs;
}

// Finds the `>` that ends an open tag. It cannot be a plain `indexOf(">")`:
// an attribute value can hold a `>` (a CSS selector in a data attribute, for
// example), and stopping there splits the tag in the middle.
function findTagEnd(html, from) {
  let quote = null;
  for (let index = from; index < html.length; index += 1) {
    const character = html[index];
    if (quote) {
      if (character === quote) quote = null;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === ">") {
      return index;
    }
  }
  return html.length;
}

function makeNode(tag, attrs) {
  return { tag, attrs, text: "", children: [] };
}

export function parseHtml(html) {
  const root = makeNode("#root", {});
  const stack = [root];
  const top = () => stack[stack.length - 1];
  let index = 0;

  while (index < html.length) {
    const open = html.indexOf("<", index);
    if (open < 0) break;
    if (open > index) {
      // Direct text of the element that is open now. Whitespace-only runs
      // are dropped: the markup is indented, and every indent would otherwise
      // become text content that the real browser trims away anyway.
      const text = html.slice(index, open).trim();
      if (text) top().text += (top().text ? " " : "") + text;
    }

    if (html.startsWith("<!--", open)) {
      const end = html.indexOf("-->", open);
      index = end < 0 ? html.length : end + 3;
      continue;
    }
    if (html[open + 1] === "!" || html[open + 1] === "?") {
      index = findTagEnd(html, open) + 1;
      continue;
    }
    if (html[open + 1] === "/") {
      const end = findTagEnd(html, open);
      const name = html.slice(open + 2, end).trim().toLowerCase();
      // Close the nearest open element with this name. An unmatched close tag
      // closes nothing, which is what a browser does too.
      for (let depth = stack.length - 1; depth > 0; depth -= 1) {
        if (stack[depth].tag === name) {
          stack.length = depth;
          break;
        }
      }
      index = end + 1;
      continue;
    }

    const end = findTagEnd(html, open);
    const raw = html.slice(open + 1, end);
    const selfClosing = raw.endsWith("/");
    const body = selfClosing ? raw.slice(0, -1) : raw;
    const nameMatch = body.match(/^([a-zA-Z][\w:.-]*)/);
    if (!nameMatch) {
      index = end + 1;
      continue;
    }
    const tag = nameMatch[1].toLowerCase();
    const node = makeNode(tag, parseAttributes(body.slice(nameMatch[1].length)));
    top().children.push(node);
    index = end + 1;

    if (RAW_TEXT_TAGS.has(tag)) {
      const close = html.toLowerCase().indexOf(`</${tag}`, index);
      index = close < 0 ? html.length : findTagEnd(html, close) + 1;
      continue;
    }
    if (!selfClosing && !VOID_TAGS.has(tag)) stack.push(node);
  }

  return root;
}

// The same reader, for a run-time `element.innerHTML = "…"` assignment. A
// module that builds its own window writes its parts as one markup string,
// so a shim that keeps that string and makes no children leaves the window
// empty and every part lookup inside it answers null.
export function parseFragment(html) {
  return parseHtml(html).children;
}

let cachedTree = null;

// One read and one parse for each node process. Every VM boot builds its own
// elements from this shared, never-mutated data — element objects cannot be
// shared, because a test writes to them.
export function indexHtmlTree() {
  if (!cachedTree) cachedTree = parseHtml(read("apps/desktop/index.html"));
  return cachedTree;
}

export function findNode(node, predicate) {
  if (predicate(node)) return node;
  for (const child of node.children) {
    const found = findNode(child, predicate);
    if (found) return found;
  }
  return null;
}
