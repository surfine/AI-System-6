// iPhone Duo, folded either way. Like a laptop the upright half is the desk and
// the flat half a keyboard. Sideways that keyboard is the trackpad when pressed;
// upright a palm-rest pad is drawn too. Like a book one page sits
// beside the crease. core/window-manager.js decides whether to ask for this
// module; here the posture is read, the two tokens are published (--duo-fold-y,
// --duo-page-w) and the deck is drawn. The stylesheet travels with the module,
// so a desk that never folds pays nothing.
//
// Three rules shape the input, and each one is a bug the deck must not have:
//   - One gesture, one outcome. A slide that starts on a keycap types nothing;
//     a two-finger scroll never also clicks. Every path ends in one branch.
//   - Leave as you found it. Turning the mode off restores every inputmode the
//     deck changed and releases the modifiers it latched; focus, caret and the
//     undo stack are not ours to reset.
//   - The system keyboard is the escape hatch, not a rival. Editable elements
//     carry inputmode="none" so the caret lands without a keyboard; the globe
//     key hands the focused field back to iOS for real IME input.
//
// Contract: tests/features/device-matrix.test.mjs (the Duo's laptop posture).

(function () {
  const KEY_ROWS = [
    [["esc", "Escape", 1.4], ["1", "1"], ["2", "2"], ["3", "3"], ["4", "4"], ["5", "5"], ["6", "6"],
      ["7", "7"], ["8", "8"], ["9", "9"], ["0", "0"], ["-", "-"], ["=", "="], ["⌫", "Backspace", 1.6]],
    [["tab", "Tab", 1.5], ["q", "q"], ["w", "w"], ["e", "e"], ["r", "r"], ["t", "t"], ["y", "y"],
      ["u", "u"], ["i", "i"], ["o", "o"], ["p", "p"], ["[", "["], ["]", "]"], ["\\", "\\", 1.2]],
    [["caps", "CapsLock", 1.7], ["a", "a"], ["s", "s"], ["d", "d"], ["f", "f"], ["g", "g"], ["h", "h"],
      ["j", "j"], ["k", "k"], ["l", "l"], [";", ";"], ["'", "'"], ["return", "Enter", 1.8]],
    [["⇧", "Shift", 2.1], ["z", "z"], ["x", "x"], ["c", "c"], ["v", "v"], ["b", "b"], ["n", "n"],
      ["m", "m"], [",", ","], [".", "."], ["/", "/"], ["⇧", "Shift", 2.1]],
    [["🌐", "globe", 1.2], ["⌃", "Control"], ["⌥", "Alt"], ["⌘", "Meta", 1.2], ["space", " ", 5],
      ["⌘", "Meta", 1.2], ["⌥", "Alt"], ["‹", "ArrowLeft"], ["‹", "ArrowUp"], ["›", "ArrowDown"], ["›", "ArrowRight"]],
  ];
  // Shift pairs, so ⇧ is a real modifier rather than a label the deck ignores.
  const SHIFTED = {
    "1": "!", "2": "@", "3": "#", "4": "$", "5": "%", "6": "^", "7": "&", "8": "*", "9": "(",
    "0": ")", "-": "_", "=": "+", "[": "{", "]": "}", "\\": "|", ";": ":", "'": "\"", ",": "<",
    ".": ">", "/": "?", "`": "~",
  };
  const MODIFIER_NAMES = { Meta: "meta", Control: "ctrl", Alt: "alt", Shift: "shift" };
  const EDITABLE_QUERY = "input:not([type=checkbox]):not([type=radio]):not([type=button])"
    + ":not([type=submit]):not([type=reset]):not([type=file]):not([type=range]):not([type=color]),"
    + " textarea, [contenteditable]:not([contenteditable='false'])";
  const SYNTHETIC_POINTER = 7;
  const TAP_MS = 550;
  const TAP_SLOP = 9;
  // iOS 9's QuickType trackpad was a press on the keyboard, not a second
  // surface. Without a force reading, a press that stays is that press, and a
  // tap that ends first is still a key.
  const PRESS_MS = 220;
  const DECK_PX = 890;

  // One portable per appearance. Millimetres are copied from machines.json;
  // a null pitch is unpublished and the keys keep the shared flex instead of
  // an invented one. Contract: internal/evidence/drafts/duo-machines/.
  // wordmark is the line printed under the display, which is how you name one
  // of these across a desk. The 14-inch has none on the inside face.
  const MACHINES = {
    portable: { theme: "classic", widthMm: 387.35, trackballMm: 33, pointing: "side", badge: "none", hinge: "knuckles", wordmark: "Macintosh Portable", latch: true, radius: "0px" },
    "powerbook-170": { theme: "system-7", widthMm: 286, keyPitchXMm: 18.63, trackballMm: 30, pointing: "center-ball", badge: "rainbow", hinge: "barrel", wordmark: "PowerBook 170", radius: "10px" },
    "powerbook-5300": { theme: "nextstep", pointing: "pad-buttons", badge: "none", hinge: "twin", wordmark: "PowerBook 5300", latch: true, radius: "8px" },
    wallstreet: { theme: "drawing-board", pointing: "pad-buttons", badge: "none", speakers: "sides", hinge: "cover", wordmark: "PowerBook G3", lip: true, latch: true, radius: "6px" },
    lombard: { theme: "platinum", pointing: "pad-buttons", badge: "oval", keyMaterial: "bronze", hinge: "cover", wordmark: "PowerBook G3", sleep: true, radius: "8px" },
    titanium: { theme: "aqua", pointing: "pad-buttons", badge: "oval", speakers: "sides", hinge: "cover", wordmark: "PowerBook G4", sleep: true, radius: "4px" },
    aluminum: { theme: "tiger", widthMm: 348, pointing: "pad-buttons", speakers: "above", hinge: "barrel", wordmark: "PowerBook G4", sleep: true, radius: "6px" },
    unibody: { theme: "snow-leopard", pointing: "pad-glass", badge: "none", hinge: "barrel", wordmark: "MacBook Pro", sleep: true, radius: "8px" },
    "air-2011": { theme: "lion", pointing: "pad-glass", wedge: true, hinge: "continuous", wordmark: "MacBook Air", radius: "10px" },
    "retina-2014": { theme: "yosemite", pointing: "pad-glass", hinge: "continuous", wordmark: "MacBook Pro", radius: "8px" },
    "air-m1": { theme: "big-sur", pointing: "pad-glass", functionRow: true, touchId: true, wedge: true, hinge: "continuous", wordmark: "MacBook Air", radius: "10px" },
    "macbook-pro-14": { theme: "liquid-glass", widthMm: 312.6, pointing: "pad-glass", functionRow: true, touchId: true, keyboardWell: true, notch: true, hinge: "continuous", radius: "12px" },
  };
  const THEME_MACHINE = Object.fromEntries(Object.entries(MACHINES).map(([id, machine]) => [machine.theme, id]));
  const FUNCTION_ROW = ["F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12"]
    .map((code) => [code.toLowerCase(), code, 1]);

  let machineId = "portable";
  // A machine stood up by hand (a test, a stored shot) survives a remount; the
  // theme is still the entrance for everyone else.
  let machinePinned = null;

  const POCKET_QUERY = "(device-posture: folded) and (vertical-viewport-segments: 2)";
  const BOOK_QUERY = "(device-posture: folded) and (horizontal-viewport-segments: 2)";

  function matches(query) {
    return typeof matchMedia === "function" && matchMedia(query).matches;
  }

  // Where the fold is, and which half is the page. The segments EXCLUDE the
  // crease, so the hinge is the gap between the two rects; without the flag
  // there is no second segment and the split is half the height.
  function posture() {
    const segments = window.viewport?.segments?.length === 2 ? window.viewport.segments : null;
    const book = matches(BOOK_QUERY);
    // Shut, the device reports the fold but has one display to lay out. That is
    // the A side: the outside face, which is the only place it is ever seen.
    const closed = !segments && !book && matches("(device-posture: folded)");
    return {
      book,
      closed,
      pocket: !book && !closed && (window.AISystem6PocketDesk?.isOn?.() ?? true),
      fold: segments ? segments[1].top : Math.round((window.innerHeight || 0) / 2),
      page: segments ? segments[0].width : (window.innerWidth || 0) / 2,
    };
  }

  // The lid is the A side: the machine's outside face, shut. Off by default, so
  // a closed phone is a phone until someone asks for the lid from the Apple
  // menu; a tap gives the phone back for the rest of that closing.
  function lidWanted() {
    try { return localStorage.getItem("ais6-duo-lid") === "on"; } catch { return false; }
  }

  // The module's single entrance: class, tokens, then the deck. Called at load,
  // on a posture change, on a resize and on every mode toggle.
  function sync() {
    const { book, closed, pocket, fold, page } = posture();
    const root = document.documentElement.style;
    document.body.classList.toggle("duo-pocket-desk", pocket);
    if (book) root.setProperty("--duo-page-w", `${Math.round(page)}px`);
    if (pocket) {
      root.setProperty("--duo-fold-y", `${Math.round(fold)}px`);
      geometry();
      mount();
      applyAxis();
    } else if (closed && lidWanted() && !lidDismissed) {
      mountLid();
    } else {
      if (!closed) lidDismissed = false;
      unmount();
    }
    // After the mount decision: unmount clears the laptop class, and the book
    // class is this function's alone, so a pose change never leaves a page
    // pinned by a rule whose mode is already over.
    document.body.classList.toggle("duo-book-desk", book);
  }

  let mounted = false;
  let root = null;
  let rail = null;
  let keysEl = null;
  let capsEl = null;
  let palm = null;
  let pointing = null;
  let cursor = null;
  let wordmark = null;
  let lidEl = null;
  let lidDismissed = false;
  let status = null;
  // The field the desk is typing into. A deck key takes focus when it is
  // reached with Tab, so "the focused element" stops being the answer; this is
  // the last editable that had it, and it is what a physical keyboard would
  // still be typing into.
  let lastField = null;
  let fieldObserver = null;
  let gesture = null;
  let handingOff = null;
  const touches = new Map();
  let scroll = null;
  let keyGesture = null;

  // The inner panel is 1878×2670 px, 445:313. At 3x that is 626×890 upright
  // and 890×626 sideways. Sideways has no height for a separate pad.
  function applyAxis() {
    const axis = (window.innerWidth || 0) >= (window.innerHeight || 1) ? "landscape" : "portrait";
    document.body.dataset.duoAxis = axis;
    if (root) root.dataset.axis = axis;
  }

  function label(key) {
    const api = window.t;
    return typeof api === "function" && api(key) !== key ? api(key) : null;
  }

  function sound() {
    if (typeof playSystemSound === "function") playSystemSound("click");
  }

  // ---- Typing -------------------------------------------------------------

  // The writing route's editors are CodeMirror behind a backing textarea. The
  // module that owns them exposes the view for the focused editor, and going
  // through dispatch keeps CodeMirror's own state (and Cmd-Z) correct. A plain
  // field takes the same execCommand path markdown-editor.js uses.
  function writingView() {
    const editor = window.AISystem6WritingEditor;
    const active = editor?.focusedTextarea?.();
    const field = active || (lastField?.isConnected && editor?.isMounted?.(lastField) ? lastField : null);
    return field ? editor.viewFor?.(field) || null : null;
  }

  function editableTarget() {
    const el = document.activeElement;
    if (el && el !== document.body && (el.isContentEditable || el.matches?.("input, textarea"))) return el;
    if (el && root?.contains(el) && lastField?.isConnected) return lastField;
    return null;
  }

  function insert(text) {
    if (!text) return;
    const view = writingView();
    if (view) {
      const head = view.state.selection.main.head;
      view.dispatch({
        changes: { from: head, insert: text },
        selection: { anchor: head + text.length },
        userEvent: "input",
        scrollIntoView: true,
      });
      return;
    }
    const el = editableTarget();
    if (!el) return;
    const before = el.value;
    let ok = false;
    try { ok = document.execCommand("insertText", false, text); } catch { ok = false; }
    // execCommand can report success and change nothing when the caret is not
    // in the field, so the buffer is what decides, exactly as markdown-editor
    // does before trusting the return value.
    if ((!ok || el.value === before) && typeof el.setRangeText === "function") {
      const at = el.selectionStart ?? (el.value || "").length;
      el.setRangeText(text, at, el.selectionEnd ?? at, "end");
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  function deleteBackward() {
    const view = writingView();
    if (view) {
      const head = view.state.selection.main.head;
      const from = Math.max(0, head - 1);
      if (from === head) return;
      view.dispatch({
        changes: { from, to: head },
        selection: { anchor: from },
        userEvent: "delete",
        scrollIntoView: true,
      });
      return;
    }
    const el = editableTarget();
    let ok = false;
    try { ok = document.execCommand("delete"); } catch { ok = false; }
    // Focus sits on the key that was pressed, not in the field, so the native
    // command has nothing to act on. Take the character before the caret by
    // hand and fire the event the editor listens for.
    if (!ok && el && typeof el.setRangeText === "function") {
      const from = el.selectionStart ?? 0;
      const to = el.selectionEnd ?? 0;
      if (from !== to || from > 0) {
        el.setRangeText("", from === to ? from - 1 : from, to, "end");
        el.dispatchEvent(new Event("input", { bubbles: true }));
      }
    }
  }

  function moveCaret(step, extend) {
    const view = writingView();
    if (view) {
      const { anchor, head } = view.state.selection.main;
      const next = Math.max(0, Math.min(view.state.doc.length, head + step));
      // Shift extends the selection the way the real key does, so ⌘C after a
      // shifted arrow is the same gesture here it is on a keyboard.
      view.dispatch({ selection: { anchor: extend ? anchor : next, head: next }, scrollIntoView: true });
      return;
    }
    const el = editableTarget();
    if (!el || typeof el.setSelectionRange !== "function") return;
    const length = (el.value || "").length;
    const from = el.selectionStart ?? 0;
    const to = el.selectionEnd ?? 0;
    if (!extend) {
      const next = Math.max(0, Math.min(length, (from === to ? to : step < 0 ? from : to) + step));
      el.setSelectionRange(next, next);
      return;
    }
    // Shift keeps the end that did not move and moves the other one.
    const backward = el.selectionDirection === "backward";
    const anchor = from === to ? to : backward ? to : from;
    const head = Math.max(0, Math.min(length, (from === to ? to : backward ? from : to) + step));
    el.setSelectionRange(Math.min(anchor, head), Math.max(anchor, head), head < anchor ? "backward" : "forward");
  }

  function characterFor(key, mods) {
    if (key.length !== 1) return key;
    if (mods.shift && SHIFTED[key]) return SHIFTED[key];
    const upper = mods.shift !== capsLocked;
    return upper ? key.toUpperCase() : key;
  }

  // One path per key: the app sees a real keydown first, so every shortcut the
  // desk already knows works from the deck. Only a press nobody handled falls
  // through to the default edit.
  function press(key, code) {
    const mods = activeModifiers();
    const target = document.activeElement || document.body;
    const event = new KeyboardEvent("keydown", {
      key,
      code: code.length === 1 ? "" : code,
      bubbles: true,
      cancelable: true,
      composed: true,
      metaKey: mods.meta,
      ctrlKey: mods.ctrl,
      altKey: mods.alt,
      shiftKey: mods.shift,
    });
    const allowed = target.dispatchEvent(event);
    // Read shift from the event, not the latch: consumeLatches below is what
    // makes everything else a one-shot, and the arrow keys need it first.
    const extend = event.shiftKey;
    consumeLatches();
    if (!allowed || event.defaultPrevented) return;
    if (code === "Backspace") { deleteBackward(); return; }
    if (code === "Enter") { insert("\n"); return; }
    if (code === "ArrowLeft" || code === "ArrowUp") { moveCaret(-1, extend); return; }
    if (code === "ArrowRight" || code === "ArrowDown") { moveCaret(1, extend); return; }
    if (code.length === 1) insert(characterFor(key, mods));
  }

  // ---- Modifier latches ---------------------------------------------------

  const latched = { meta: false, ctrl: false, alt: false, shift: false };
  const locked = { meta: false, ctrl: false, alt: false, shift: false };
  let capsLocked = false;
  let lastModifierTap = { name: "", at: 0 };

  function activeModifiers() {
    return {
      meta: latched.meta || locked.meta,
      ctrl: latched.ctrl || locked.ctrl,
      alt: latched.alt || locked.alt,
      shift: latched.shift || locked.shift,
    };
  }

  function consumeLatches() {
    Object.keys(latched).forEach((name) => { if (!locked[name]) latched[name] = false; });
    syncLatches();
  }

  function syncLatches() {
    if (!root) return;
    root.querySelectorAll("[data-modifier]").forEach((key) => {
      const name = key.dataset.modifier;
      const on = !!(latched[name] || locked[name]);
      key.classList.toggle("is-latched", on);
      key.classList.toggle("is-locked", !!locked[name]);
      key.setAttribute("aria-pressed", on ? "true" : "false");
    });
    capsEl?.classList.toggle("is-locked", capsLocked);
    capsEl?.setAttribute("aria-pressed", capsLocked ? "true" : "false");
    rail?.querySelectorAll("[data-rail-modifier]").forEach((dot) => {
      const name = dot.dataset.railModifier;
      dot.classList.toggle("is-on", !!(latched[name] || locked[name]));
    });
  }

  // A tap latches a modifier for the next key; a double tap locks it, the way a
  // phone keyboard offers shift. Nothing latched survives a pose change.
  function toggleModifier(name) {
    const now = Date.now();
    const double = lastModifierTap.name === name && now - lastModifierTap.at < 350;
    lastModifierTap = { name, at: now };
    if (name === "caps") { capsLocked = !capsLocked; syncLatches(); return; }
    if (double) {
      locked[name] = !locked[name];
      latched[name] = false;
    } else if (locked[name]) {
      locked[name] = false;
    } else {
      latched[name] = !latched[name];
    }
    syncLatches();
  }

  // ---- Fields the deck types into -----------------------------------------

  function quietField(el) {
    if (!el || el.dataset.duoQuiet) return;
    el.dataset.duoInputmode = el.getAttribute("inputmode") ?? "";
    el.dataset.duoKeyboardPolicy = el.getAttribute("virtualkeyboardpolicy") ?? "";
    el.setAttribute("inputmode", "none");
    el.setAttribute("virtualkeyboardpolicy", "manual");
    el.dataset.duoQuiet = "true";
  }

  function releaseField(el) {
    if (!el?.dataset?.duoQuiet) return;
    const inputmode = el.dataset.duoInputmode;
    const policy = el.dataset.duoKeyboardPolicy;
    if (inputmode) el.setAttribute("inputmode", inputmode);
    else el.removeAttribute("inputmode");
    if (policy) el.setAttribute("virtualkeyboardpolicy", policy);
    else el.removeAttribute("virtualkeyboardpolicy");
    delete el.dataset.duoInputmode;
    delete el.dataset.duoKeyboardPolicy;
    delete el.dataset.duoQuiet;
  }

  function quietFieldsIn(scope) {
    if (!scope?.querySelectorAll) return;
    scope.querySelectorAll(EDITABLE_QUERY).forEach(quietField);
  }

  function releaseAllFields() {
    document.querySelectorAll("[data-duo-quiet]").forEach(releaseField);
  }

  // The globe key is the way to a real IME: it unquiets the field in front and
  // focuses it again, which is what makes iOS raise its keyboard.
  function handToSystemKeyboard() {
    const el = editableTarget();
    if (!el || !el.matches?.(EDITABLE_QUERY)) return false;
    const caret = el.selectionEnd ?? 0;
    handingOff = el;
    releaseField(el);
    el.blur();
    el.focus({ preventScroll: true });
    try { el.setSelectionRange?.(caret, caret); } catch {}
    setTimeout(() => { if (handingOff === el) handingOff = null; }, 0);
    return true;
  }

  // ---- Synthetic pointer (the palm rest) ----------------------------------
  //
  // A trackpad is a RELATIVE pointing device: the finger never touches what it
  // is pointing at. The pointer lives in the screen segment, the pad only moves
  // it, and every click is resolved where the pointer is — not under the finger,
  // which is a key cap two hundred pixels away. This is also what keeps the pad
  // from clicking through whatever it happens to be covering.

  const pointer = { x: 0, y: 0, placed: false };

  // The screen is the upright segment: from the menu bar down to the deck's own
  // top edge, which is the crease plus the hinge's half.
  // The pointer lives in the screen hole, inside the B-side bezel. The lid's
  // used border is the hole; a custom property would still be a percentage.
  function screenRect() {
    const lid = document.querySelector(".duo-pocket-lid");
    const lidStyle = lid ? getComputedStyle(lid) : null;
    const insetX = lidStyle ? Number.parseFloat(lidStyle.borderLeftWidth) || 0 : 0;
    const insetTop = lidStyle ? Number.parseFloat(lidStyle.borderTopWidth) || 0 : 0;
    const chin = lidStyle ? Number.parseFloat(lidStyle.borderBottomWidth) || 0 : 0;
    const lidBox = lid?.getBoundingClientRect();
    const deckTop = document.querySelector(".duo-pocket-deck-ui")?.getBoundingClientRect().top;
    const fold = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--duo-fold-y"));
    const holeBottom = lidBox ? lidBox.bottom - chin : (deckTop ?? fold);
    return {
      left: insetX,
      top: insetTop,
      right: (window.innerWidth || 0) - insetX,
      bottom: Math.max(insetTop + 1, holeBottom || 0),
    };
  }

  function clampPointer() {
    const rect = screenRect();
    pointer.x = Math.max(rect.left + 1, Math.min(rect.right - 2, pointer.x));
    pointer.y = Math.max(rect.top + 1, Math.min(rect.bottom - 2, pointer.y));
  }

  function placePointer() {
    if (pointer.placed) { clampPointer(); return; }
    const rect = screenRect();
    pointer.x = (rect.left + rect.right) / 2;
    pointer.y = (rect.top + rect.bottom) / 2;
    pointer.placed = true;
  }

  function hitTest(x, y) {
    const stack = document.elementsFromPoint(x, y) || [];
    return stack.find((el) => !el.closest?.(".duo-pocket-deck-ui, .duo-pocket-cursor")) || document.body;
  }

  function pointerEvent(type, x, y, buttons) {
    return new PointerEvent(type, {
      bubbles: true, cancelable: true, composed: true, pointerId: SYNTHETIC_POINTER,
      pointerType: "mouse", isPrimary: true, button: 0, buttons,
      clientX: x, clientY: y, width: 1, height: 1, pressure: buttons ? 0.5 : 0,
    });
  }

  function moveCursor() {
    if (!cursor) return;
    cursor.style.transform = `translate(${Math.round(pointer.x)}px, ${Math.round(pointer.y)}px)`;
    cursor.classList.add("is-visible");
  }

  function hideCursor() {
    cursor?.classList.remove("is-visible");
  }

  function palmDown(event) {
    if (event.pointerType === "mouse") return;
    event.preventDefault();
    placePointer();
    touches.set(event.pointerId, {
      x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY,
      at: Date.now(), moved: false,
    });
    try { palm.setPointerCapture(event.pointerId); } catch {}
    moveCursor();
    if (touches.size === 1) {
      const target = hitTest(pointer.x, pointer.y);
      gesture = { target, moved: false };
      target.dispatchEvent(pointerEvent("pointerdown", pointer.x, pointer.y, 1));
      return;
    }
    if (touches.size === 2) {
      // A second finger cancels the press it interrupted: one gesture, one
      // outcome, so the element under the pointer never also sees a click.
      if (gesture) {
        gesture.target.dispatchEvent(pointerEvent("pointercancel", pointer.x, pointer.y, 0));
        gesture = null;
      }
      const [a, b] = [...touches.values()];
      scroll = {
        x: (a.x + b.x) / 2,
        y: (a.y + b.y) / 2,
        moved: false,
        at: Date.now(),
        target: hitTest(pointer.x, pointer.y),
      };
    }
  }

  function palmMove(event) {
    const touch = touches.get(event.pointerId);
    if (!touch) return;
    event.preventDefault();
    const dx = event.clientX - touch.x;
    const dy = event.clientY - touch.y;
    touch.x = event.clientX;
    touch.y = event.clientY;
    if (Math.abs(event.clientX - touch.startX) > TAP_SLOP
      || Math.abs(event.clientY - touch.startY) > TAP_SLOP) touch.moved = true;
    if (touches.size >= 2 && scroll) {
      // Scrolling is a two-finger GESTURE, not pointer motion: the content
      // moves with the fingers the way it does on a trackpad, and the pointer
      // stays where it was.
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) scroll.moved = true;
      scrollBy(scroll.target, dx, dy);
      return;
    }
    if (!gesture) return;
    gesture.moved = true;
    pointer.x += dx;
    pointer.y += dy;
    clampPointer();
    moveCursor();
    gesture.target.dispatchEvent(pointerEvent("pointermove", pointer.x, pointer.y, 1));
  }

  function palmUp(event) {
    const touch = touches.get(event.pointerId);
    if (!touch) return;
    const wasSingle = touches.size === 1;
    touches.delete(event.pointerId);
    if (scroll && touches.size < 2) {
      // Two fingers that never moved is a right-click, the way a trackpad
      // answers it. A scroll that moved is only a scroll.
      if (!scroll.moved && Date.now() - scroll.at < TAP_MS) {
        scroll.target.dispatchEvent(new MouseEvent("contextmenu", {
          bubbles: true, cancelable: true, composed: true, clientX: pointer.x, clientY: pointer.y, button: 2,
        }));
      }
      scroll = null;
      if (!touches.size) hideCursor();
      return;
    }
    if (gesture) {
      gesture.target.dispatchEvent(pointerEvent("pointerup", pointer.x, pointer.y, 0));
      const tap = wasSingle && !gesture.moved && !touch.moved && Date.now() - touch.at < TAP_MS;
      if (tap) {
        gesture.target.dispatchEvent(new MouseEvent("click", {
          bubbles: true, cancelable: true, composed: true, clientX: pointer.x, clientY: pointer.y, button: 0,
        }));
      }
      gesture = null;
    }
    if (!touches.size) hideCursor();
  }

  // Synthetic wheel events scroll nothing, so the scroller is found and moved
  // by hand — innermost first, which is what a trackpad over content does.
  function scrollBy(target, dx, dy) {
    for (let node = target; node && node !== document.body; node = node.parentElement) {
      const style = getComputedStyle(node);
      const canY = /auto|scroll/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 1;
      const canX = /auto|scroll/.test(style.overflowX) && node.scrollWidth > node.clientWidth + 1;
      if (!canY && !canX) continue;
      if (canY) node.scrollTop += dy;
      if (canX) node.scrollLeft += dx;
      return;
    }
    if (dy) window.scrollBy(0, dy);
  }

  // ---- The deck -----------------------------------------------------------

  function buildKey(spec) {
    const [text, code, flex] = spec;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "duo-pocket-key";
    button.dataset.code = code;
    if (flex) button.style.setProperty("--duo-key-flex", String(flex));
    // The label is its own box: the button itself must not clip, because its
    // hit area grows past the drawn key and a clipped pseudo-element would take
    // the extra touch area with it.
    if (text === "space") button.setAttribute("aria-label", "Space");
    else {
      const caption = document.createElement("span");
      caption.className = "duo-pocket-key-label";
      caption.textContent = text;
      button.appendChild(caption);
    }
    if (code === "globe") {
      button.setAttribute("aria-label", label("pocket_desk_globe") || "Hand typing to the system keyboard");
    } else if (code === "TouchID") {
      button.setAttribute("aria-label", "Touch ID");
    } else if (code === "CapsLock") {
      button.setAttribute("aria-pressed", "false");
    } else if (MODIFIER_NAMES[code]) {
      button.dataset.modifier = MODIFIER_NAMES[code];
      button.setAttribute("aria-pressed", "false");
    }
    // One press, one action. Enter on a focused key is a click with detail 0.
    // Sideways, a touch waits: a tap types on release, a press that stays
    // becomes the trackpad, so the two cannot both fire.
    function activate() {
      if (code === "globe") handToSystemKeyboard();
      else if (code === "TouchID") return;
      else if (code === "CapsLock") toggleModifier("caps");
      else if (button.dataset.modifier) toggleModifier(button.dataset.modifier);
      else press(code, code);
      sound();
    }
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (root?.dataset.axis === "landscape" && event.pointerType !== "mouse" && !keyGesture) {
        armKeyPress(button, event, activate);
        return;
      }
      button.classList.add("is-pressed");
      activate();
    });
    button.addEventListener("pointermove", (event) => moveKeyPress(event));
    button.addEventListener("pointerup", (event) => endKeyPress(event));
    button.addEventListener("pointercancel", (event) => endKeyPress(event, true));
    button.addEventListener("click", (event) => {
      // detail 0 is a keyboard activation (Enter or Space on the focused key).
      // The caret belongs in the field, not on the key that was pressed, so the
      // field takes focus back before the key types into it.
      if (event.detail !== 0) return;
      if (lastField?.isConnected) lastField.focus({ preventScroll: true });
      activate();
    });
    ["pointerup", "pointercancel", "pointerleave"].forEach((type) => {
      button.addEventListener(type, () => button.classList.remove("is-pressed"));
    });
    return button;
  }

  function armKeyPress(button, event, activate) {
    button.classList.add("is-pressed");
    const timer = setTimeout(() => {
      if (!keyGesture || keyGesture.button !== button) return;
      keyGesture.tracking = true;
      button.classList.remove("is-pressed");
      root.classList.add("is-trackpad");
      placePointer();
      moveCursor();
    }, PRESS_MS);
    keyGesture = {
      button, activate, timer, pointerId: event.pointerId,
      x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY,
      tracking: false, moved: false,
    };
    try { button.setPointerCapture(event.pointerId); } catch {}
  }

  function moveKeyPress(event) {
    if (!keyGesture || event.pointerId !== keyGesture.pointerId) return;
    const dx = event.clientX - keyGesture.x;
    const dy = event.clientY - keyGesture.y;
    keyGesture.x = event.clientX;
    keyGesture.y = event.clientY;
    const slipped = Math.abs(event.clientX - keyGesture.startX) > TAP_SLOP
      || Math.abs(event.clientY - keyGesture.startY) > TAP_SLOP;
    if (!keyGesture.tracking) {
      if (!slipped) return;
      clearTimeout(keyGesture.timer);
      keyGesture.button.classList.remove("is-pressed");
      keyGesture = null;
      return;
    }
    if (slipped) keyGesture.moved = true;
    pointer.x += dx;
    pointer.y += dy;
    clampPointer();
    moveCursor();
  }

  function endKeyPress(event, cancelled) {
    if (!keyGesture || event.pointerId !== keyGesture.pointerId) return;
    clearTimeout(keyGesture.timer);
    const gestureNow = keyGesture;
    keyGesture = null;
    gestureNow.button.classList.remove("is-pressed");
    root?.classList.remove("is-trackpad");
    if (cancelled) { hideCursor(); return; }
    if (gestureNow.tracking) {
      if (!gestureNow.moved) {
        const target = hitTest(pointer.x, pointer.y);
        target.dispatchEvent(pointerEvent("pointerdown", pointer.x, pointer.y, 1));
        target.dispatchEvent(pointerEvent("pointerup", pointer.x, pointer.y, 0));
        target.dispatchEvent(new MouseEvent("click", {
          bubbles: true, cancelable: true, composed: true, clientX: pointer.x, clientY: pointer.y, button: 0,
        }));
      }
      hideCursor();
      return;
    }
    if (lastField?.isConnected) lastField.focus({ preventScroll: true });
    gestureNow.activate();
  }

  function cancelKeyPress() {
    if (!keyGesture) return;
    clearTimeout(keyGesture.timer);
    keyGesture.button.classList.remove("is-pressed");
    root?.classList.remove("is-trackpad");
    keyGesture = null;
  }

  function fillKeys() {
    if (!keysEl) return;
    const machine = MACHINES[machineId] || MACHINES.portable;
    const functionRow = machine.touchId ? [...FUNCTION_ROW, ["", "TouchID", 1.2]] : FUNCTION_ROW;
    const rows = machine.functionRow ? [functionRow, ...KEY_ROWS] : KEY_ROWS;
    keysEl.replaceChildren();
    rows.forEach((row) => {
      const line = document.createElement("div");
      line.className = "duo-pocket-key-row";
      if (row === FUNCTION_ROW) line.classList.add("is-function-row");
      row.forEach((spec) => line.appendChild(buildKey(spec)));
      keysEl.appendChild(line);
    });
    capsEl = keysEl.querySelector('[data-code="CapsLock"]');
    syncLatches();
  }

  // Project the appearance's portable onto the chassis. Published millimetres
  // become a width-normalized pitch and ball; everything unpublished stays on
  // the shared flex so a guess never ships as a measurement.
  function applyMachine(id) {
    const next = MACHINES[id] ? id : THEME_MACHINE[document.body.dataset.theme] || "portable";
    const machine = MACHINES[next];
    machineId = next;
    if (!root) return;
    root.dataset.duoMachine = next;
    root.dataset.pointing = machine.pointing;
    root.dataset.badge = machine.badge || "none";
    root.dataset.speakers = machine.speakers || "none";
    root.dataset.well = machine.keyboardWell ? "true" : "false";
    root.dataset.wedge = machine.wedge ? "true" : "false";
    root.dataset.notch = machine.notch ? "true" : "false";
    root.dataset.lip = machine.lip ? "true" : "false";
    root.dataset.latch = machine.latch ? "true" : "false";
    root.dataset.sleep = machine.sleep ? "true" : "false";
    root.dataset.hinge = machine.hinge || "barrel";
    if (wordmark) {
      wordmark.textContent = machine.wordmark || "";
      wordmark.hidden = !machine.wordmark;
    }
    const board = root.querySelector(".duo-pocket-board");
    const palmEl = root.querySelector(".duo-pocket-palm");
    if (pointing && board && palmEl) {
      (machine.pointing === "center-ball" ? palmEl : board).append(pointing);
    }
    root.dataset.keyMaterial = machine.keyMaterial || "neutral";
    root.style.setProperty("--duo-radius", machine.radius);
    if (machine.widthMm && machine.keyPitchXMm) {
      root.style.setProperty("--duo-key-pitch", `${(machine.keyPitchXMm / machine.widthMm) * DECK_PX}px`);
    } else root.style.removeProperty("--duo-key-pitch");
    if (machine.widthMm && machine.trackballMm) {
      root.style.setProperty("--duo-ball", `${(machine.trackballMm / machine.widthMm) * DECK_PX}px`);
    } else root.style.removeProperty("--duo-ball");
    const hadFunction = keysEl?.querySelector(".is-function-row");
    const hadTouch = keysEl?.querySelector('[data-code="TouchID"]');
    if (Boolean(hadFunction) !== Boolean(machine.functionRow) || Boolean(hadTouch) !== Boolean(machine.touchId)) fillKeys();
  }

  function build() {
    const surface = document.createElement("div");
    surface.className = "duo-pocket";
    surface.setAttribute("data-duo-pocket", "");

    // The chassis is drawing, not content: a screen reader announcing a lid, a
    // hinge and a deck would be announcing furniture.
    const lid = document.createElement("div");
    lid.className = "duo-pocket-lid";
    const notch = document.createElement("span");
    notch.className = "duo-pocket-notch";
    notch.setAttribute("aria-hidden", "true");
    const badge = document.createElement("span");
    badge.className = "duo-pocket-badge";
    badge.setAttribute("aria-hidden", "true");
    wordmark = document.createElement("span");
    wordmark.className = "duo-pocket-wordmark";
    wordmark.setAttribute("aria-hidden", "true");
    lid.append(notch, badge, wordmark);
    const hinge = document.createElement("div");
    hinge.className = "duo-pocket-hinge";
    const deck = document.createElement("div");
    deck.className = "duo-pocket-deck";
    [lid, hinge, deck].forEach((part) => part.setAttribute("aria-hidden", "true"));

    const ui = document.createElement("div");
    ui.className = "duo-pocket-deck-ui";

    rail = document.createElement("div");
    rail.className = "duo-pocket-rail";
    const brand = document.createElement("span");
    brand.className = "duo-pocket-brand";
    brand.textContent = label("pocket_desk") || "Pocket Desk";
    const lamps = document.createElement("span");
    lamps.className = "duo-pocket-lamps";
    [["ctrl", "⌃"], ["alt", "⌥"], ["meta", "⌘"]].forEach(([name, glyph]) => {
      const lamp = document.createElement("span");
      lamp.className = "duo-pocket-lamp";
      lamp.dataset.railModifier = name;
      lamp.textContent = glyph;
      lamps.append(lamp);
    });
    rail.append(brand, lamps);

    keysEl = document.createElement("div");
    keysEl.className = "duo-pocket-keys";
    keysEl.setAttribute("role", "group");
    keysEl.setAttribute("aria-label", label("pocket_desk_keys") || "Pocket Desk keyboard");
    fillKeys();
    pointing = document.createElement("div");
    pointing.className = "duo-pocket-pointing";
    pointing.setAttribute("aria-hidden", "true");

    palm = document.createElement("div");
    palm.className = "duo-pocket-palm";
    // The pad is a pointer surface with nothing focusable inside it, so it is
    // hidden from assistive technology: a VoiceOver reader navigates by focus,
    // and the globe key is the path to typing, not a rectangle with no elements.
    palm.setAttribute("aria-hidden", "true");
    palm.setAttribute("aria-label", label("pocket_desk_trackpad") || "Palm rest trackpad");
    const latch = document.createElement("span");
    latch.className = "duo-pocket-latch";
    latch.setAttribute("aria-hidden", "true");
    palm.append(latch);

    cursor = document.createElement("span");
    cursor.className = "duo-pocket-cursor";
    cursor.setAttribute("aria-hidden", "true");

    // A pose change rearranges the screen; a reader using VoiceOver is told
    // rather than left to discover it. The text is the mode's own name.
    status = document.createElement("p");
    status.className = "visually-hidden";
    status.setAttribute("aria-live", "polite");
    status.textContent = label("pocket_desk") || "Pocket Desk";

    const board = document.createElement("div");
    board.className = "duo-pocket-board";
    board.append(keysEl, pointing);
    ui.append(rail, board, palm);
    surface.append(lid, deck, hinge, ui, cursor, status);
    return surface;
  }

  // ---- Lifecycle ----------------------------------------------------------

  function onFocusIn(event) {
    const el = event.target;
    if (!el || el === handingOff || !el.matches?.(EDITABLE_QUERY)) return;
    lastField = el;
    quietField(el);
  }

  function mount() {
    if (!mounted) {
      root = build();
      document.body.appendChild(root);
      palm.addEventListener("pointerdown", palmDown);
      palm.addEventListener("pointermove", palmMove);
      palm.addEventListener("pointerup", palmUp);
      palm.addEventListener("pointercancel", palmUp);
      document.addEventListener("focusin", onFocusIn, true);
      // Windows and editors arrive after the deck does; a field born into the
      // DOM while the mode is on must not raise the system keyboard.
      fieldObserver = new MutationObserver((records) => {
        records.forEach((record) => {
          record.addedNodes.forEach((node) => {
            if (node.nodeType !== 1) return;
            quietField(node);
            quietFieldsIn(node);
          });
        });
      });
      fieldObserver.observe(document.body, { childList: true, subtree: true });
      mounted = true;
    }
    quietFieldsIn(document);
    syncLatches();
    ensureLidRow();
    applyMachine(machinePinned || THEME_MACHINE[document.body.dataset.theme] || machineId);
    if (!root.dataset.duoListening) {
      root.dataset.duoListening = "true";
      document.addEventListener("ai-system6-themechange", () => {
        applyMachine(THEME_MACHINE[document.body.dataset.theme] || "portable");
      });
    }
    root.classList.add("is-on");
  }

  // The A side's switch, in the Apple menu beside the mode it belongs to. It is
  // inserted here rather than in the boot markup because the boot budget pays
  // for what every desk needs, and a closed lid is asked for, never assumed.
  function ensureLidRow() {
    const pocket = document.querySelector("[data-pocket-desk-menu]");
    if (!pocket || document.querySelector("[data-duo-lid-menu]")) return document.querySelector("[data-duo-lid-menu]");
    const row = document.createElement("button");
    row.type = "button";
    row.className = "is-hidden";
    row.dataset.duoLidMenu = "";
    row.dataset.i18n = "duo_lid";
    row.textContent = label("duo_lid") || "Lid when closed";
    row.addEventListener("click", () => {
      const next = !lidWanted();
      try { localStorage.setItem("ais6-duo-lid", next ? "on" : "off"); } catch {}
      paintLidRow(next);
      lidDismissed = false;
      sync();
      document.querySelectorAll(".menu.is-open").forEach((menu) => menu.classList.remove("is-open"));
    });
    pocket.after(row);
    paintLidRow(lidWanted());
    return row;
  }

  function paintLidRow(on) {
    const row = document.querySelector("[data-duo-lid-menu]");
    if (!row) return;
    row.classList.remove("is-hidden");
    row.classList.toggle("is-checked", on);
    row.setAttribute("aria-pressed", on ? "true" : "false");
  }

  // The A side: shut, the outside face of the machine is what a person sees.
  // One button covers the phone, because a lid that swallows the screen has to
  // give it back to a keyboard as readily as to a thumb. No logo is invented --
  // the mark left the lid in 2021 and a wrong silhouette is worse than none --
  // so the era shows through material, hinge edge and the parts that era had.
  function mountLid() {
    if (mounted && !lidEl) unmount();
    if (!root) {
      root = document.createElement("div");
      root.className = "duo-pocket";
      root.setAttribute("data-duo-pocket", "");
      lidEl = document.createElement("button");
      lidEl.type = "button";
      lidEl.className = "duo-lid";
      lidEl.addEventListener("click", () => { lidDismissed = true; unmount(); });
      const face = document.createElement("span");
      face.className = "duo-lid-face";
      face.setAttribute("aria-hidden", "true");
      const hint = document.createElement("span");
      hint.className = "duo-lid-hint";
      hint.textContent = label("duo_lid_open") || "Tap to open";
      lidEl.append(face, hint);
      root.append(lidEl);
      document.body.append(root);
      mounted = true;
    }
    applyMachine(machinePinned || THEME_MACHINE[document.body.dataset.theme] || machineId);
    if (lidEl) lidEl.setAttribute("aria-label", label("duo_lid_open") || "Tap to open");
    ensureLidRow();
    root.classList.add("is-on");
  }

  function unmount() {
    if (!mounted) return;
    // Latches are ours; the caret, the focus and the undo stack are not.
    Object.keys(latched).forEach((name) => { latched[name] = false; locked[name] = false; });
    capsLocked = false;
    document.body.classList.remove("duo-pocket-desk");
    delete document.body.dataset.duoAxis;
    releaseAllFields();
    status?.remove();
    status = null;
    if (palm) {
      palm.removeEventListener("pointerdown", palmDown);
      palm.removeEventListener("pointermove", palmMove);
      palm.removeEventListener("pointerup", palmUp);
      palm.removeEventListener("pointercancel", palmUp);
    }
    document.removeEventListener("focusin", onFocusIn, true);
    fieldObserver?.disconnect();
    fieldObserver = null;
    touches.clear();
    gesture = null;
    scroll = null;
    cancelKeyPress();
    root?.remove();
    root = null;
    rail = null;
    keysEl = null;
    capsEl = null;
    palm = null;
    pointing = null;
    cursor = null;
    wordmark = null;
    lidEl = null;
    mounted = false;
  }

  // Called when the fold moves or the screen turns. The deck's own layout is the
  // stylesheet's, so what is left is the state a moved crease invalidates: a
  // finger that was down when it moved must not leave a press, a scroll or a
  // captured pointer behind, and the drawn cursor no longer points at anything.
  function geometry() {
    if (gesture) gesture.target.dispatchEvent(pointerEvent("pointercancel", gesture.x, gesture.y, 0));
    gesture = null;
    scroll = null;
    touches.forEach((touch, id) => {
      try { if (palm?.hasPointerCapture?.(id)) palm.releasePointerCapture(id); } catch {}
    });
    touches.clear();
    cancelKeyPress();
    applyAxis();
    clampPointer();
    hideCursor();
  }

  // The switch has to exist even when the desk is not drawn, or a reload with
  // the lid on would leave no way back.
  ensureLidRow();
  window.AISystem6PocketDeskLoaded = true;
  window.AISystem6PocketDeskSurface = Object.freeze({
    sync, unmount, geometry,
    setMachine: (id) => {
      if (!MACHINES[id]) return false;
      machinePinned = id;
      applyMachine(id);
      return true;
    },
    machines: () => Object.keys(MACHINES),
    lid: (show) => {
      if (show) { lidDismissed = false; mountLid(); return true; }
      lidDismissed = true;
      unmount();
      return false;
    },
  });
})();
