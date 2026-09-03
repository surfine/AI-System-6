// System modal bridge.
//
// Loaded before app.js as a classic script; function bodies reference
// DOM handles that app.js initializes before any modal is opened.

function showSystemModal(message, type = "confirm", options = {}) {
  return new Promise((resolve) => {
    if (typeof closeMenus === "function") closeMenus();
    document.body.classList.add("has-system-modal");
    systemModalMessage.textContent = message;
    systemModalCancel.classList.toggle("default", options.defaultAction === "cancel");
    systemModalYes.classList.toggle("default", options.defaultAction !== "cancel");
    systemModalYes.classList.toggle("danger", options.danger === true);
    playSystemSound(type === "save" ? "save" : "alert");

    systemModal.onclose = () => {
      modalScrim.classList.add("is-hidden");
      document.body.classList.remove("has-system-modal");
      resolve(systemModal.returnValue || "cancel");
    };

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

    modalScrim.classList.remove("is-hidden");
    systemModal.showModal();
    // showModal()'s own initial-focus algorithm lands on the first focusable
    // descendant in tree order, which is Cancel — not whichever button just
    // received the "default" class above. Left alone, Enter fired the wrong
    // action on every dialog whose default is Yes/OK/Save (the common case:
    // only options.defaultAction === "cancel" was ever handled), including
    // the unsaved-changes prompt on close. Focus the actual default button.
    (options.defaultAction === "cancel" ? systemModalCancel : systemModalYes).focus();
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

    dialog.onclose = () => {
      modalScrim.classList.add("is-hidden");
      document.body.classList.remove("has-system-modal");
      resolve(dialog.returnValue === "ok" ? input.value : null);
    };

    playSystemSound("alert");
    modalScrim.classList.remove("is-hidden");
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
