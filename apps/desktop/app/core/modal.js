// System modal bridge.
//
// Loaded before app.js as a classic script; function bodies reference
// DOM handles that app.js initializes before any modal is opened.

/**
 * Give focus back to whatever opened the dialog, while it still exists and can
 * take it; otherwise to the front window's first usable control. A dialog that
 * closes onto the document body leaves the writer with nothing to type into and
 * no visible sign of where the keyboard went.
 * @param {Element | null} invoker
 */
function restoreFocusAfterModal(invoker) {
  const target = invoker && invoker.isConnected !== false ? invoker : null;
  if (target && target.disabled !== true && typeof target.focus === "function" && target.isConnected !== false) {
    try {
      target.focus();
      if (document.activeElement === target) return true;
    } catch {}
  }
  const win = document.querySelector(".window.is-active:not(.is-hidden)");
  const fallback = win?.querySelector(
    "button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"
  );
  try {
    fallback?.focus?.();
  } catch {}
  return false;
}

/** The control that asked the question, when there was one. */
function modalInvoker() {
  const active = document.activeElement;
  if (!active || active === document.body || active === document.documentElement) return null;
  return active;
}

// One modal, one answer, and only one.
//
// A second question opened while the first is still waiting used to overwrite
// the first dialog's onclose handler: the first promise then never settled, and
// whatever awaited it waited forever. The open dialog is tracked here so a new
// one settles the old one as a cancel, and every close path goes through one
// settle() that runs once.
let activeSystemModal = null;
/** The input dialog that is currently waiting for an answer, if any. */
let activeInputDialog = null;

/** The scrim is decorative; a missing one must never break a dialog. */
function setModalScrimHidden(hidden) {
  const scrim = typeof modalScrim !== "undefined" ? modalScrim : null;
  if (!scrim) return;
  scrim.classList.toggle("is-hidden", hidden === true);
}

function showSystemModal(message, type = "confirm", options = {}) {
  return new Promise((resolve) => {
    const previousModal = activeSystemModal;
    if (previousModal) {
      // Close the dialog that is on screen as well as settling its promise:
      // settling alone would leave the old question open under the new one.
      try {
        previousModal.dialog?.close?.("cancel");
      } catch {}
      previousModal.settle("cancel");
    }
    const invoker = modalInvoker();
    let settled = false;
    const settle = (value) => {
      if (settled) return;
      settled = true;
      if (activeSystemModal?.settle === settle) activeSystemModal = null;
      setModalScrimHidden(true);
      document.body.classList.remove("has-system-modal");
      restoreFocusAfterModal(invoker);
      resolve(value);
    };
    activeSystemModal = { dialog: systemModal, settle };
    if (typeof closeMenus === "function") closeMenus();
    document.body.classList.add("has-system-modal");
    systemModalMessage.textContent = message;
    systemModalCancel.classList.toggle("default", options.defaultAction === "cancel");
    systemModalYes.classList.toggle("default", options.defaultAction !== "cancel");
    systemModalYes.classList.toggle("danger", options.danger === true);
    playSystemSound(type === "save" ? "save" : "alert");

    systemModal.onclose = () => settle(systemModal.returnValue || "cancel");
    // Escape answers Cancel here and stops there. Left to bubble, the desk's
    // own Escape also brakes the running task behind the dialog (wireup's
    // keydown handler), so one press meant two things at once.
    if (!systemModal.dataset.escapeWired) {
      systemModal.dataset.escapeWired = "true";
      systemModal.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        systemModal.close("cancel");
      });
    }

    if (type === "save") {
      systemModalCancel.hidden = false;
      systemModalNo.hidden = false;
      systemModalCancel.textContent = t("cancel_close");
      systemModalYes.textContent = t("save_document");
      systemModalNo.textContent = t("dont_save_document");
    } else if (type === "alert") {
      systemModalCancel.hidden = true;
      systemModalNo.hidden = true;
      systemModalYes.textContent = t("ok");
    } else {
      // A confirm dialog can offer one named alternative besides Cancel, for
      // the rare question with two real answers ("read this source" versus
      // "keep the text"). It returns "no" so callers keep three outcomes.
      // hideCancel is for the question whose alternatives are already both
      // named: a third "Cancel" would duplicate one of them.
      systemModalCancel.hidden = options.hideCancel === true;
      systemModalNo.hidden = !options.altKey;
      if (options.altKey) systemModalNo.textContent = t(options.altKey);
      systemModalCancel.textContent = t("cancel");
      systemModalYes.textContent = t(options.confirmKey || "ok");
    }

    setModalScrimHidden(false);
    systemModal.showModal();
    // showModal()'s own initial-focus algorithm lands on the first focusable
    // descendant in tree order, which is Cancel — not whichever button just
    // received the "default" class above. Left alone, Enter fired the wrong
    // action on every dialog whose default is Yes/OK/Save (the common case:
    // only options.defaultAction === "cancel" was ever handled), including
    // the unsaved-changes prompt on close. Focus the actual default button.
    (options.defaultAction === "cancel" ? systemModalCancel : systemModalYes).focus();
    // Say out loud what that focus means: Return presses this button. The
    // NeXTSTEP appearance draws its Return mark from this attribute, so the
    // mark can only appear on a dialog where Enter really is wired to the
    // default (see styles/10-windows.css, "The Return mark").
    systemModal.dataset.enterDefaultWired = "true";
  });
}

// Shared in-app text input dialog. Replaces native window.prompt so the same
// control works in the browser and in the packaged WebKit shell (which cannot
// show a native prompt). Resolves the field value on OK, or null on Cancel.
function showInputDialog({
  title = "",
  message = "",
  defaultValue = "",
  placeholder = "",
  multiline = false,
} = {}) {
  return new Promise((resolve) => {
    if (typeof closeMenus === "function") closeMenus();
    const dialog = document.querySelector("#app-input-modal");
    const field = document.querySelector("#app-input-field");
    const textarea = document.querySelector("#app-input-textarea");
    const titleEl = document.querySelector("#app-input-title");
    const messageEl = document.querySelector("#app-input-message");
    const cancelButton = document.querySelector("#app-input-cancel");
    const okButton = document.querySelector("#app-input-confirm");
    if (!dialog || !field || !textarea || !titleEl || !messageEl || !cancelButton || !okButton) {
      resolve(null);
      return;
    }
    // The same rule as the system modal: one question, one answer. A second
    // input dialog settles the first as a cancel instead of leaving its caller
    // waiting forever behind a replaced handler.
    const previousDialog = activeInputDialog;
    if (previousDialog) {
      try {
        previousDialog.dialog?.close?.("cancel");
      } catch {}
      previousDialog.settle(null);
    }
    const invoker = modalInvoker();
    let settled = false;
    const settle = (value) => {
      if (settled) return;
      settled = true;
      if (activeInputDialog?.settle === settle) activeInputDialog = null;
      setModalScrimHidden(true);
      document.body.classList.remove("has-system-modal");
      restoreFocusAfterModal(invoker);
      resolve(value);
    };
    activeInputDialog = { dialog, settle };

    const input = multiline ? textarea : field;
    field.hidden = multiline;
    textarea.hidden = !multiline;
    titleEl.textContent = title;
    titleEl.hidden = !title;
    messageEl.textContent = message;
    messageEl.hidden = !message;
    input.value = defaultValue;
    input.placeholder = placeholder;
    input.setAttribute("aria-label", title || message || t("ok"));
    okButton.textContent = t("ok");
    cancelButton.textContent = t("cancel");

    if (!dialog.dataset.inputWired) {
      dialog.dataset.inputWired = "true";
      field.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !eventIsTextComposition(event)) {
          event.preventDefault();
          dialog.close("ok");
        }
      });
    }

    dialog.onclose = () => settle(dialog.returnValue === "ok" ? input.value : null);

    playSystemSound("alert");
    setModalScrimHidden(false);
    document.body.classList.add("has-system-modal");
    if (dialog.open) dialog.close("cancel");
    dialog.showModal();
    window.requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
  });
}

// A dialog whose first focusable control is a radio (or another native
// form field that isn't the "default" button itself) inherits a browser
// behavior distinct from the buttons-only case above: pressing Enter while
// that field has focus submits the form through its OWN default-button
// algorithm, which is always the first submit button in DOM order — never
// whichever button the dialog's own markup marks "default". Moving initial
// focus onto the default button (as showSystemModal now does) is the wrong
// fix here, since it would stop arrow keys from changing the radio
// selection before the writer has tabbed anywhere. This instead intercepts
// Enter at the dialog and fires the real default explicitly, leaving
// initial focus on the radio group alone. Call once per dialog; the getter
// is re-read on every Enter, so it can point at a default that changes as
// the writer picks a different option (see clio-use-result-modal, whose
// default target changes with selection).
function wireDialogEnterDefault(dialog, getDefaultButton) {
  dialog.__enterDefaultGetter = getDefaultButton;
  if (dialog.dataset.enterDefaultWired) return;
  dialog.dataset.enterDefaultWired = "true";
  dialog.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.defaultPrevented || eventIsTextComposition(event)) return;
    const target = event.target;
    if (target?.tagName === "BUTTON" || target?.tagName === "TEXTAREA") return;
    const button = dialog.__enterDefaultGetter?.();
    if (!button || button.disabled) return;
    event.preventDefault();
    button.click();
  });
}
