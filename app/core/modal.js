// System modal bridge.
//
// Loaded before app.js as a classic script; function bodies reference
// DOM handles that app.js initializes before any modal is opened.

function showSystemModal(message, type = "confirm") {
  return new Promise((resolve) => {
    if (typeof closeMenus === "function") closeMenus();
    document.body.classList.add("has-system-modal");
    systemModalMessage.textContent = message;
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
      systemModalCancel.hidden = false;
      systemModalNo.hidden = true;
      systemModalCancel.textContent = t("cancel");
      systemModalYes.textContent = t("ok");
    }

    modalScrim.classList.remove("is-hidden");
    systemModal.showModal();
  });
}
