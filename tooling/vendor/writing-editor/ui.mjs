// The editor's own small pieces of chrome, built only when first needed so the
// boot page carries none of them:
//
// - the heading navigator (Writing › Go to Heading…, Commands…): a menu by
//   the Commands button on a desk, a sheet from the bottom on a phone;
// - the phone format bar: while a writing surface has the keyboard on a touch
//   screen, the window's row of four buttons gives its place to Markdown keys.
//   Still one row, as the writing windows have always had.

import { EditorView } from "@codemirror/view";

const say = (key, fallback) => {
  if (typeof window.t !== "function") return fallback;
  const text = window.t(key);
  return text && text !== key ? text : fallback;
};

const coarse = () => window.matchMedia?.("(hover: none) and (pointer: coarse)").matches === true;

// ---------------------------------------------------------------- headings

let openMenu = null;

function closeHeadings() {
  if (!openMenu) return;
  openMenu.dispose();
  openMenu = null;
}

export function openHeadings(view, headings, anchor) {
  if (openMenu) { closeHeadings(); return; }
  const head = view.state.selection.main.head;
  let current = -1;
  headings.forEach((heading, index) => { if (heading.from <= head) current = index; });

  const sheet = coarse();
  const menu = document.createElement("div");
  menu.className = `writing-heading-menu${sheet ? " is-sheet" : ""}`;
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", say("heading_navigator", "Headings"));
  const scrim = sheet ? document.createElement("div") : null;
  if (scrim) scrim.className = "writing-heading-scrim";

  if (!headings.length) {
    const empty = document.createElement("div");
    empty.className = "writing-heading-empty";
    empty.textContent = say("heading_navigator_empty", "No headings yet");
    menu.append(empty);
  }
  const items = headings.map((heading, index) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = `writing-heading-item level-${Math.min(heading.level, 3)}${index === current ? " is-current" : ""}`;
    item.setAttribute("role", "menuitem");
    item.textContent = heading.title || "—";
    item.addEventListener("click", () => {
      closeHeadings();
      view.dispatch({
        selection: { anchor: heading.from },
        effects: EditorView.scrollIntoView(heading.from, { y: "start", yMargin: 24 }),
      });
      view.focus();
    });
    menu.append(item);
    return item;
  });

  if (scrim) document.body.append(scrim);
  document.body.append(menu);
  if (!sheet) {
    // Below the button when it fits, above it when it does not (Commands…
    // sits at the foot of the window).
    const box = anchor.getBoundingClientRect();
    const height = menu.offsetHeight;
    const below = box.bottom + 2;
    const top = below + height <= window.innerHeight - 8 ? below : Math.max(8, box.top - height - 2);
    menu.style.left = `${Math.round(Math.min(box.left, window.innerWidth - menu.offsetWidth - 8))}px`;
    menu.style.top = `${Math.round(top)}px`;
  }
  anchor.setAttribute("aria-expanded", "true");
  (items[Math.max(0, current)] || menu).focus?.({ preventScroll: true });

  const onKey = (event) => {
    const at = items.indexOf(document.activeElement);
    if (event.key === "Escape") { event.preventDefault(); closeHeadings(); anchor.focus(); return; }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      items[(at + step + items.length) % items.length]?.focus();
    }
  };
  const onPointer = (event) => {
    if (menu.contains(event.target) || anchor.contains(event.target)) return;
    closeHeadings();
  };
  menu.addEventListener("keydown", onKey);
  document.addEventListener("pointerdown", onPointer, true);
  openMenu = {
    dispose() {
      document.removeEventListener("pointerdown", onPointer, true);
      menu.remove();
      scrim?.remove();
      anchor.setAttribute("aria-expanded", "false");
    },
  };
}

// ---------------------------------------------------------------- format bar

const BAR_KEYS = [
  ["heading", "#", "format_heading_cycle", "Heading level"],
  ["bold", "B", "format_bold", "Bold"],
  ["italic", "I", "format_italic", "Italic"],
  ["link", "链", "format_link", "Link"],
  ["quote", "“", "format_quote", "Quote"],
  ["bullet", "•", "format_bullet", "Bulleted List"],
  ["numbered", "1.", "format_numbered", "Numbered List"],
  ["task", "☐", "format_task", "Checklist"],
  ["indent", "⇥", "format_indent", "Indent"],
  ["outdent", "⇤", "format_outdent", "Outdent"],
  ["undo", "↶", "undo", "Undo"],
  ["dictate", "听写", "dictation_pad", "Dictation"],
];

const bars = new WeakMap(); // window element -> bar

function headingLevelAt(view) {
  const line = view.state.doc.lineAt(view.state.selection.main.head).text;
  const match = line.match(/^(#{1,6})[ \t]/);
  return match ? match[1].length : 0;
}

function barFor(win, actions) {
  if (bars.has(win)) return bars.get(win);
  const row = win.querySelector(".teachtext-surface-actions, .teachtext-actions");
  if (!row) return null;
  const bar = document.createElement("div");
  bar.className = "writing-format-bar";
  bar.setAttribute("role", "toolbar");
  bar.setAttribute("aria-label", say("format_bar", "Formatting"));
  const keys = document.createElement("div");
  keys.className = "writing-format-keys";
  for (const [command, glyph, key, fallback] of BAR_KEYS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `writing-format-key is-${command}`;
    button.textContent = glyph;
    button.setAttribute("aria-label", say(key, fallback));
    button.dataset.command = command;
    keys.append(button);
  }
  const done = document.createElement("button");
  done.type = "button";
  done.className = "writing-format-key is-done";
  done.textContent = "⌄";
  done.setAttribute("aria-label", say("hide_keyboard", "Hide Keyboard"));
  done.dataset.command = "done";
  bar.append(keys, done);
  // Keys act on press, and never take the focus: the keyboard must stay up.
  bar.addEventListener("pointerdown", (event) => {
    const button = event.target.closest("button[data-command]");
    if (!button) return;
    event.preventDefault();
    actions(button.dataset.command);
  });
  bar.addEventListener("click", (event) => {
    // A keyboard or switch-control activation arrives as a click alone.
    if (event.detail !== 0) return;
    const button = event.target.closest("button[data-command]");
    if (button) actions(button.dataset.command);
  });
  row.after(bar);
  bars.set(win, bar);
  return bar;
}

export function formatBar(runFormat, undoCommand) {
  let blurTimer = 0;
  const setOn = (view, on) => {
    const win = view.dom.closest(".window");
    if (!win) return;
    // A page turned to Read hides the editor but can leave the focus in it.
    if (on && !view.dom.getClientRects().length) on = false;
    if (on) {
      const bar = barFor(win, (command) => {
        if (command === "done") { view.contentDOM.blur(); return; }
        if (command === "undo") { undoCommand(view); return; }
        if (command === "dictate") {
          const target = view.dom.closest(".mde-surface")?.querySelector("textarea");
          if (typeof window.openDictationPad === "function" && target) window.openDictationPad({ target });
          return;
        }
        if (command === "heading") {
          const level = headingLevelAt(view);
          runFormat(view, `heading-${level >= 3 ? 0 : level + 1}`);
          return;
        }
        runFormat(view, command);
      });
      if (!bar) return;
    }
    win.classList.toggle("has-format-bar", on);
  };
  return EditorView.domEventHandlers({
    focus(event, view) {
      window.clearTimeout(blurTimer);
      if (coarse()) setOn(view, true);
      return false;
    },
    blur(event, view) {
      // The bar's own keys never blur the editor, but a tap on the paper
      // around it can, for a frame. Only a blur that lasts takes the bar away.
      blurTimer = window.setTimeout(() => setOn(view, false), 120);
      return false;
    },
  });
}
