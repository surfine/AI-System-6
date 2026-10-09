// Key Caps' command sheet: every command the application in front offers, with
// its key, searchable and runnable.
//
// The *craft editors generate their cheat sheet from the same command table
// that builds their menus and dispatches their keys, so it cannot drift. The
// desk already has that table on screen: the menu bar the foreground
// application rendered, with each row's action, label, key equivalent and
// enabled state kept current by updateMenuState(). The sheet reads those rows
// rather than a second list, so a command added to a menu shows up here, and a
// command that is greyed in the menu is greyed here.
//
// Key Caps is a desk accessory, so opening it leaves the menu bar with the
// application behind it; that is the application the sheet describes.

(function installCommandSheet() {
  if (window.AISystem6CommandSheet) return;

  const sheetState = { query: "", rows: [] };

  function commandSheetRows() {
    const rows = [];
    document.querySelectorAll(".menu-bar .menu[data-app-menu]").forEach((menu) => {
      if (menu.classList.contains("is-hidden")) return;
      const menuTitle = menu.querySelector(":scope > button")?.textContent.trim() || "";
      menu.querySelectorAll(".menu-popover button[data-action]").forEach((button) => {
        if (button.closest(".is-hidden")) return;
        const action = button.dataset.action;
        // Rows that only open another document are a list, not a command.
        if (!action || action.startsWith("open-chat-file:")) return;
        const label = typeof shortcutRowText === "function" ? shortcutRowText(button) : button.textContent.trim();
        if (!label) return;
        rows.push({
          action,
          label,
          menu: menuTitle,
          key: button.dataset.shortcut || "",
          enabled: !button.disabled,
        });
      });
    });
    // One action can sit in two menus; the sheet lists it once.
    const seen = new Set();
    return rows.filter((row) => (seen.has(row.action) ? false : seen.add(row.action)));
  }

  function commandSheetMatches(row, query) {
    if (!query) return true;
    const haystack = `${row.label} ${row.menu} ${row.key}`.toLocaleLowerCase();
    return query.toLocaleLowerCase().split(/\s+/).filter(Boolean).every((word) => haystack.includes(word));
  }

  function commandSheetHost() {
    const pane = document.querySelector('[data-window="keyCaps"] .key-caps-pane');
    if (!pane) return null;
    let host = pane.querySelector(".command-sheet");
    if (host) return host;
    host = document.createElement("section");
    host.className = "command-sheet";
    host.innerHTML = `
      <h3 class="command-sheet-title"></h3>
      <label class="visually-hidden" for="command-sheet-search"></label>
      <input class="command-sheet-search" id="command-sheet-search" type="search" autocomplete="off" spellcheck="false">
      <ul class="command-sheet-list" role="list"></ul>
      <p class="command-sheet-empty" hidden></p>`;
    pane.prepend(host);
    const search = host.querySelector(".command-sheet-search");
    search.addEventListener("input", () => {
      sheetState.query = search.value;
      renderCommandSheetList();
    });
    search.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        host.querySelector(".command-sheet-row:not(:disabled)")?.focus();
      } else if (event.key === "Enter" && !event.isComposing) {
        event.preventDefault();
        host.querySelector(".command-sheet-row:not(:disabled)")?.click();
      }
    });
    host.querySelector(".command-sheet-list").addEventListener("keydown", (event) => {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      const buttons = [...host.querySelectorAll(".command-sheet-row:not(:disabled)")];
      const index = buttons.indexOf(document.activeElement);
      if (index < 0) return;
      event.preventDefault();
      const next = buttons[index + (event.key === "ArrowDown" ? 1 : -1)];
      if (next) next.focus();
      else if (event.key === "ArrowUp") search.focus();
    });
    host.addEventListener("click", (event) => {
      const button = event.target.closest(".command-sheet-row");
      if (!button || button.disabled) return;
      // The command runs for the application behind Key Caps, exactly as its
      // menu row would.
      handleAction(button.dataset.action);
    });
    return host;
  }

  function renderCommandSheetList() {
    const host = commandSheetHost();
    if (!host) return;
    const list = host.querySelector(".command-sheet-list");
    const visible = sheetState.rows.filter((row) => commandSheetMatches(row, sheetState.query.trim()));
    const fragment = document.createDocumentFragment();
    let lastMenu = "";
    visible.forEach((row) => {
      if (row.menu !== lastMenu) {
        lastMenu = row.menu;
        const heading = document.createElement("li");
        heading.className = "command-sheet-menu";
        heading.textContent = row.menu;
        fragment.append(heading);
      }
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "command-sheet-row";
      button.dataset.action = row.action;
      button.disabled = !row.enabled;
      const label = document.createElement("span");
      label.className = "command-sheet-label";
      label.textContent = row.label;
      const key = document.createElement("kbd");
      key.className = "command-sheet-key";
      key.textContent = row.key;
      button.append(label, key);
      item.append(button);
      fragment.append(item);
    });
    list.replaceChildren(fragment);
    const empty = host.querySelector(".command-sheet-empty");
    empty.hidden = visible.length > 0;
    empty.textContent = t("command_sheet_none");
  }

  function renderCommandSheet({ focus = false } = {}) {
    const host = commandSheetHost();
    if (!host) return;
    sheetState.rows = commandSheetRows();
    const appName = document.querySelector("#current-app-menu-label")?.textContent.trim() || "";
    host.querySelector(".command-sheet-title").textContent = appName ? t("command_sheet_title_for", appName) : t("command_sheet_title");
    host.querySelector('label[for="command-sheet-search"]').textContent = t("command_sheet_search");
    const search = host.querySelector(".command-sheet-search");
    search.placeholder = t("command_sheet_search");
    search.value = sheetState.query;
    renderCommandSheetList();
    if (focus) search.focus();
  }

  window.AISystem6CommandSheet = Object.freeze({
    render: renderCommandSheet,
    rows: commandSheetRows,
    matches: commandSheetMatches,
  });
})();
