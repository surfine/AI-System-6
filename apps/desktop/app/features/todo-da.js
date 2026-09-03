// Feature module: To Do 待办 — the cross-project next-action list.
//
// A SECOND object beside ClioProject, never folded into it: a plan belongs to
// a project and dies with it, a next action belongs to a person and follows
// them across projects. The naming law says which is which — Clio- marks an
// application, a plain noun marks a desk accessory. This is the desk
// accessory.
//
// One action per line, checkable, no cap, and never auto-dropped: the items
// live in the desk settings (Note Pad's storage pattern) with an eager
// normalizer, so they survive every boot whether or not this lazy window is
// ever summoned. A finished action folds its ink, not its existence; only the
// writer's own Remove Done takes it off the list.
//
// Contract: tests/features/todo-da.test.mjs

function buildTodoDaWindow() {
  if (!window.AISystem6ApplicationShell) return null;
  const win = window.AISystem6ApplicationShell.createWindow({
    windowName: "todo",
    windowClass: "todo-da-window",
    labelledBy: "todo-da-title",
    titleKey: "todo_da",
    title: "To Do",
    resizable: false,
    shade: false,
    statusClass: "compact-status-bar",
    statusHtml: `
      <span class="status-bar-leading" id="todo-da-count"></span>
      <span class="status-bar-trailing" id="todo-da-scope" data-i18n="todo_da_scope">Every project</span>`,
    paneClass: "todo-da-pane",
    paneHtml: `
      <ul class="todo-da-list" id="todo-da-list" hidden></ul>
      <p class="hint todo-da-empty" id="todo-da-empty" data-i18n="todo_da_empty" hidden></p>
      <label class="visually-hidden" for="todo-da-input" data-i18n="todo_da_placeholder">Next action, one line</label>
      <input id="todo-da-input" type="text" maxlength="240" autocomplete="off" data-i18n-placeholder="todo_da_placeholder" placeholder="Next action, one line" />
      <div class="button-row is-one-line">
        <button class="btn" type="button" id="todo-da-remove-done" data-action="todo-da-remove-done" data-i18n="todo_da_remove_done">Remove Done</button>
        <span class="spacer"></span>
        <button class="btn default" type="button" id="todo-da-add" data-action="todo-da-add" data-i18n="todo_da_add">Add</button>
      </div>`,
  });
  // The provenance row the writing accessories share: it says which project a
  // new action will be filed under, and hides when no disk is mounted rather
  // than inventing an owner.
  const origin = document.createElement("div");
  origin.className = "da-origin";
  origin.id = "todo-da-origin";
  origin.hidden = true;
  win.insertBefore(origin, win.applicationPane);
  if (typeof applyLanguage === "function") applyLanguage();
  return win;
}

let todoDaParts = null;
let todoDaWired = false;

function todoDaFields() {
  if (todoDaParts?.root.isConnected) return todoDaParts;
  const root = document.querySelector('[data-window="todo"]') || buildTodoDaWindow();
  if (!root) return null;
  const part = (id) => root.querySelector(`#todo-da-${id}`);
  todoDaParts = {
    root,
    count: part("count"),
    origin: part("origin"),
    list: part("list"),
    empty: part("empty"),
    input: part("input"),
    removeDone: part("remove-done"),
    add: part("add"),
  };
  return todoDaParts;
}

function renderTodoDa() {
  const parts = todoDaFields();
  if (!parts) return;
  todoDaItems = normalizeTodoDaItems(todoDaItems);
  const open = todoDaItems.filter((item) => !item.done).length;

  parts.count.textContent = t("todo_da_count", open, todoDaItems.length);
  parts.list.hidden = !todoDaItems.length;
  parts.empty.hidden = !!todoDaItems.length;
  parts.removeDone.disabled = !todoDaItems.some((item) => item.done);

  const project = typeof getActiveProject === "function" ? getActiveProject() : null;
  const mounted = project && (typeof isProjectMounted === "undefined" || isProjectMounted);
  parts.origin.textContent = mounted ? t("todo_da_origin", projectDisplayName(project)) : "";
  parts.origin.hidden = !mounted;

  parts.list.replaceChildren();
  todoDaItems.forEach((item) => {
    const row = document.createElement("li");
    row.className = `todo-da-item${item.done ? " is-done" : ""}`;
    const check = document.createElement("input");
    check.type = "checkbox";
    check.checked = item.done;
    check.dataset.todoDaToggle = item.id;
    check.setAttribute("aria-label", item.text);
    const text = document.createElement("span");
    text.className = "todo-da-item-text";
    text.textContent = item.text;
    row.append(check, text);
    // The action remembers which project it came from; a row from another
    // project says so, quietly, the way a scrap names its source.
    if (item.projectName && item.projectId !== (project?.id || "")) {
      const from = document.createElement("small");
      from.textContent = item.projectName;
      row.append(from);
    }
    parts.list.append(row);
  });
}

function addTodoDaItem() {
  const parts = todoDaFields();
  if (!parts) return;
  const text = parts.input.value.trim();
  if (!text) return setStatus(t("todo_da_add_empty"));
  const project = typeof getActiveProject === "function" ? getActiveProject() : null;
  todoDaItems.push(...normalizeTodoDaItems([{
    text,
    createdAt: new Date().toISOString(),
    projectId: project?.id || "",
    projectName: project ? projectDisplayName(project) : "",
  }]));
  parts.input.value = "";
  saveDeskState();
  renderTodoDa();
  parts.input.focus();
}

function toggleTodoDaItem(id, done) {
  const item = todoDaItems.find((candidate) => candidate.id === id);
  if (!item) return;
  item.done = done === true;
  item.doneAt = item.done ? new Date().toISOString() : "";
  saveDeskState();
  renderTodoDa();
}

// The one way an action leaves the list, and the writer presses it.
function removeDoneTodoDaItems() {
  if (!todoDaItems.some((item) => item.done)) return;
  todoDaItems = todoDaItems.filter((item) => !item.done);
  saveDeskState();
  renderTodoDa();
}

function attachTodoDa() {
  const parts = todoDaFields();
  if (!parts) return;
  if (!todoDaWired) {
    todoDaWired = true;
    parts.list.addEventListener("change", (event) => {
      const toggle = event.target.closest("[data-todo-da-toggle]");
      if (toggle) toggleTodoDaItem(toggle.dataset.todoDaToggle, toggle.checked);
    });
    parts.input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || (typeof eventIsTextComposition === "function" && eventIsTextComposition(event))) return;
      event.preventDefault();
      addTodoDaItem();
    });
  }
  renderTodoDa();
}

window.AISystem6Runtime?.registerApplication({
  id: "todoDa",
  windowName: "todo",
  mount: attachTodoDa,
  restore: attachTodoDa,
  commands: {
    "open-todo-da": { handler: () => openWindow("todo"), isAvailable: () => true },
    "todo-da-add": { handler: () => addTodoDaItem(), isAvailable: () => true },
    "todo-da-remove-done": { handler: () => removeDoneTodoDaItems(), isAvailable: () => true },
  },
});

window.AISystem6TodoDa = Object.freeze({
  attach: attachTodoDa,
  render: renderTodoDa,
});

window.AISystem6TodoDaLoaded = true;
