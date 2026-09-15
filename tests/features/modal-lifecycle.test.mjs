// Dialogs finish exactly once and leave the keyboard where it was.
//
// The harness has no native <dialog> implementation, so the few methods the
// real browsers provide (showModal / close / returnValue / the close event)
// are shimmed here; everything being tested is the module's own behaviour.

import { createFeatureTest } from "../helpers/feature-test-harness.mjs";
import { createAppBootVm } from "../helpers/app-boot-vm.mjs";

const test = createFeatureTest("modal-lifecycle");

const vmw = createAppBootVm();
const run = (code) => vmw.run(code);

run(`
  window.__closed = [];
  function shimDialog(dialog) {
    if (!dialog || dialog.__shimmed) return dialog;
    dialog.__shimmed = true;
    dialog.returnValue = "";
    dialog.open = false;
    dialog.showModal = function showModal() {
      dialog.open = true;
      dialog.dispatchEvent(new Event("open"));
    };
    dialog.close = function close(value) {
      if (!dialog.open) return;
      dialog.returnValue = value === undefined ? "" : String(value);
      dialog.open = false;
      window.__closed.push(dialog.id || "(dialog)");
      const event = new Event("close");
      dialog.dispatchEvent(event);
      if (typeof dialog.onclose === "function") dialog.onclose(event);
    };
  }
  window.__shimDialog = shimDialog;
  shimDialog(document.querySelector("#system-modal"));
  shimDialog(document.querySelector("#app-input-modal"));

`);

// --- One question, one answer ----------------------------------------------
const singleSettle = await run(`
  (async () => {
    const first = showSystemModal("First question", "confirm");
    const second = showSystemModal("Second question", "confirm");
    const firstAnswer = await first;
    const dialog = document.querySelector("#system-modal");
    dialog.close("yes");
    const secondAnswer = await second;
    // A close after the answer must not produce a second answer.
    dialog.close("no");
    return { firstAnswer, secondAnswer, closes: window.__closed.slice() };
  })()
`);
test.assert(
  singleSettle.firstAnswer === "cancel",
  "a question replaced by another is answered as a cancel instead of waiting forever"
);
test.assert(singleSettle.secondAnswer === "yes", "the question on screen gets the answer");
test.assert(
  singleSettle.closes.length === 2,
  "each dialog closes once: the replaced one, and the one that answered"
);

// --- Escape belongs to the dialog -----------------------------------------
const escapeOutcome = await run(`
  (async () => {
    let sawKeydownAtDocument = 0;
    const watcher = (event) => { if (event.key === "Escape") sawKeydownAtDocument += 1; };
    document.addEventListener("keydown", watcher);
    const pending = showSystemModal("Escape question", "confirm");
    const dialog = document.querySelector("#system-modal");
    const escapeEvent = new Event("keydown", { bubbles: true, cancelable: true });
    escapeEvent.key = "Escape";
    // Dispatched on the dialog itself: the listener lives there, and the
    // question is whether the desk behind it also hears the key (it must not).
    dialog.dispatchEvent(escapeEvent);
    const answer = await pending;
    document.removeEventListener("keydown", watcher);
    return { answer, sawKeydownAtDocument };
  })()
`);
test.assert(escapeOutcome.answer === "cancel", "Escape answers the dialog with Cancel");
test.assert(
  escapeOutcome.sawKeydownAtDocument === 0,
  "and is consumed by the dialog instead of reaching the desk's own Escape"
);

// --- The keyboard goes back where it was -----------------------------------
const focusReturn = await run(`
  (async () => {
    const invoker = document.createElement("button");
    invoker.id = "focus-invoker";
    invoker.textContent = "Ask";
    document.body.append(invoker);
    invoker.focus();
    const pending = showSystemModal("Focus question", "confirm");
    document.querySelector("#system-modal").close("yes");
    await pending;
    const returned = document.activeElement === invoker;

    // The invoking control was removed while the dialog was open: focus must
    // land somewhere usable rather than on the document body.
    const win = document.querySelector('[data-window="projects"]') || document.querySelector(".window");
    win?.classList.remove("is-hidden", "is-collapsed");
    document.querySelectorAll(".window").forEach((other) => other.classList.remove("is-active"));
    win?.classList.add("is-active");
    const gone = document.createElement("button");
    document.body.append(gone);
    gone.focus();
    const pendingAgain = showSystemModal("Owner gone", "confirm");
    gone.remove();
    document.querySelector("#system-modal").close("yes");
    await pendingAgain;
    return {
      returned,
      fallbackFocus: document.activeElement?.id || document.activeElement?.tagName || "",
      onBody: document.activeElement === document.body,
    };
  })()
`);
test.assert(focusReturn.returned === true, "focus returns to the control that asked the question");
test.assert(
  focusReturn.onBody === false,
  "when that control is gone, focus goes to the window rather than the document body"
);

test.finish();
