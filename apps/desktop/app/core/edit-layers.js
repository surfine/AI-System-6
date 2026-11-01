// Edit kernel: the layers panel and the inspector every canvas shares.
//
// Cover Glass had a layer list of its own; the ClioChart canvas, the ClioStage
// page and ClioPaint had none. This is one list and one Get Info pane, after
// the layer panels of the MIT/Apache photocraft and vectorcraft editors:
//
// Layers panel — one row per object, top of the stack first: an eye (shown /
// hidden), a lock, a colour tag, the name (double-click renames), drag to
// restack, click to select, Shift- or Command-click to add to the selection.
// Selecting is not an edit and records nothing; every other change is handed
// to the editor, which records it in its own history.
//
// Inspector — a Get Info pane drawn from a field list. A field reports while
// it is being scrubbed ({ final: false }) and once more when it settles
// ({ final: true }), so the editor can make the whole scrub one history step
// (begin / preview / commit in app/core/edit-history.js).
//
// Both are plain DOM with the desk's own controls (buttons, the System 6
// select harness's .select-wrap, native inputs) and the shared lazy sheet
// styles/99-edit-kernel.css.

(function installEditLayers(root) {
  if (root.AISystem6EditLayers) return;

  const text = (key, fallback) => (typeof t === "function" ? t(key) : fallback);

  /**
   * @param {{
   *   host: HTMLElement,
   *   items: () => { id: string, name: string, hidden?: boolean, locked?: boolean, tag?: string, depth?: number }[],
   *   selection: () => string[],
   *   onSelect: (ids: string[]) => void,
   *   onToggle?: (id: string, flag: "hidden" | "locked") => void,
   *   onRename?: (id: string, name: string) => void,
   *   onReorder?: (id: string, toIndex: number) => void,
   *   label?: string,
   * }} options
   */
  function createLayersPanel(options) {
    const { host } = options;
    const list = document.createElement("ol");
    list.className = "edit-kernel-layers";
    list.setAttribute("role", "listbox");
    list.setAttribute("aria-multiselectable", "true");
    list.setAttribute("aria-label", options.label || text("edit_kernel_layers", "Layers"));
    host.append(list);
    let dragId = "";
    let anchorId = "";

    function render() {
      const items = options.items();
      const selected = new Set(options.selection());
      const fragment = document.createDocumentFragment();
      items.forEach((item, index) => {
        const row = document.createElement("li");
        row.className = "edit-kernel-layer";
        row.dataset.layer = item.id;
        row.dataset.index = String(index);
        row.setAttribute("role", "option");
        row.setAttribute("aria-selected", selected.has(item.id) ? "true" : "false");
        row.classList.toggle("is-selected", selected.has(item.id));
        row.classList.toggle("is-hidden-layer", !!item.hidden);
        row.classList.toggle("is-locked-layer", !!item.locked);
        row.draggable = !!options.onReorder;
        if (item.depth) row.style.setProperty("--edit-kernel-depth", String(item.depth));
        if (options.onToggle) {
          for (const flag of /** @type {("hidden"|"locked")[]} */ (["hidden", "locked"])) {
            const toggle = document.createElement("button");
            toggle.type = "button";
            toggle.className = `edit-kernel-layer-${flag === "hidden" ? "eye" : "lock"}`;
            toggle.dataset.toggle = flag;
            const on = flag === "hidden" ? !item.hidden : !!item.locked;
            toggle.setAttribute("aria-pressed", on ? "true" : "false");
            toggle.setAttribute("aria-label", text(flag === "hidden" ? "edit_kernel_layer_visible" : "edit_kernel_layer_locked", flag === "hidden" ? "Shown" : "Locked"));
            row.append(toggle);
          }
        }
        const tag = document.createElement("span");
        tag.className = "edit-kernel-layer-tag";
        if (item.tag) tag.dataset.tag = item.tag;
        const name = document.createElement("span");
        name.className = "edit-kernel-layer-name";
        name.textContent = item.name;
        row.append(tag, name);
        fragment.append(row);
      });
      list.replaceChildren(fragment);
    }

    function idsBetween(fromId, toId) {
      const ids = options.items().map((item) => item.id);
      const [a, b] = [ids.indexOf(fromId), ids.indexOf(toId)].sort((x, y) => x - y);
      return a < 0 || b < 0 ? [toId] : ids.slice(a, b + 1);
    }

    list.addEventListener("click", (event) => {
      const row = /** @type {HTMLElement} */ (event.target).closest(".edit-kernel-layer");
      if (!row) return;
      const id = row.dataset.layer || "";
      const toggle = /** @type {HTMLElement} */ (event.target).closest("[data-toggle]");
      if (toggle && options.onToggle) {
        options.onToggle(id, /** @type {any} */ (toggle).dataset.toggle);
        return;
      }
      const current = options.selection();
      let next;
      if (event.shiftKey && anchorId) next = idsBetween(anchorId, id);
      else if (event.metaKey || event.ctrlKey) next = current.includes(id) ? current.filter((value) => value !== id) : [...current, id];
      else next = [id];
      if (!event.shiftKey) anchorId = id;
      options.onSelect(next);
    });

    list.addEventListener("dblclick", (event) => {
      const name = /** @type {HTMLElement} */ (event.target).closest(".edit-kernel-layer-name");
      const row = name?.closest(".edit-kernel-layer");
      if (!name || !row || !options.onRename) return;
      const field = document.createElement("input");
      field.type = "text";
      field.className = "edit-kernel-layer-rename";
      field.value = name.textContent || "";
      name.replaceWith(field);
      field.focus();
      field.select();
      let done = false;
      const finish = (keep) => {
        if (done) return;
        done = true;
        const value = field.value.trim();
        if (keep && value && value !== name.textContent) options.onRename?.(row.dataset.layer || "", value);
        else render();
      };
      field.addEventListener("keydown", (keyEvent) => {
        // Enter that ends an input-method composition is the IME's, not ours.
        if (typeof eventIsTextComposition === "function" ? eventIsTextComposition(keyEvent) : keyEvent.isComposing) return;
        if (keyEvent.key === "Enter") { keyEvent.preventDefault(); finish(true); }
        if (keyEvent.key === "Escape") { keyEvent.preventDefault(); finish(false); }
      });
      field.addEventListener("blur", () => finish(true));
    });

    list.addEventListener("dragstart", (event) => {
      const row = /** @type {HTMLElement} */ (event.target).closest(".edit-kernel-layer");
      if (!row) return;
      dragId = row.dataset.layer || "";
      event.dataTransfer?.setData("text/plain", dragId);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
    });
    list.addEventListener("dragover", (event) => {
      if (!dragId) return;
      event.preventDefault();
      const row = /** @type {HTMLElement} */ (event.target).closest(".edit-kernel-layer");
      list.querySelectorAll(".is-drop-before, .is-drop-after").forEach((element) => element.classList.remove("is-drop-before", "is-drop-after"));
      if (!row) return;
      const rect = row.getBoundingClientRect();
      row.classList.add(event.clientY < rect.top + rect.height / 2 ? "is-drop-before" : "is-drop-after");
    });
    list.addEventListener("drop", (event) => {
      if (!dragId) return;
      event.preventDefault();
      const row = /** @type {HTMLElement} */ (event.target).closest(".edit-kernel-layer");
      const ids = options.items().map((item) => item.id);
      let index = row ? Number(row.dataset.index) : ids.length - 1;
      if (row?.classList.contains("is-drop-after")) index += 1;
      const from = ids.indexOf(dragId);
      if (from < index) index -= 1;
      const id = dragId;
      dragId = "";
      if (from !== index) options.onReorder?.(id, Math.max(0, Math.min(ids.length - 1, index)));
      else render();
    });
    list.addEventListener("dragend", () => {
      dragId = "";
      list.querySelectorAll(".is-drop-before, .is-drop-after").forEach((element) => element.classList.remove("is-drop-before", "is-drop-after"));
    });

    render();
    return { render, element: list };
  }

  /**
   * @param {{
   *   host: HTMLElement,
   *   fields: () => { id: string, label: string, type: "text"|"number"|"range"|"select"|"check"|"color",
   *     value: any, options?: { value: string, label: string }[], min?: number, max?: number, step?: number,
   *     disabled?: boolean, mixed?: boolean }[],
   *   onChange: (id: string, value: any, meta: { final: boolean }) => void,
   *   label?: string,
   * }} options
   */
  function createInspector(options) {
    const { host } = options;
    const form = document.createElement("div");
    form.className = "edit-kernel-inspector";
    form.setAttribute("role", "group");
    form.setAttribute("aria-label", options.label || text("edit_kernel_inspector", "Info"));
    host.append(form);

    function control(field) {
      const id = `edit-kernel-field-${field.id}`;
      const row = document.createElement("div");
      row.className = "edit-kernel-field";
      row.dataset.field = field.id;
      const label = document.createElement("label");
      label.htmlFor = id;
      label.textContent = field.label;
      let input;
      if (field.type === "select") {
        const wrap = document.createElement("div");
        wrap.className = "select-wrap";
        input = document.createElement("select");
        (field.options || []).forEach((option) => {
          const element = document.createElement("option");
          element.value = option.value;
          element.textContent = option.label;
          input.append(element);
        });
        wrap.append(input);
        row.append(label, wrap);
      } else {
        input = document.createElement("input");
        input.type = field.type === "check" ? "checkbox" : field.type;
        if (field.min !== undefined) input.min = String(field.min);
        if (field.max !== undefined) input.max = String(field.max);
        if (field.step !== undefined) input.step = String(field.step);
        row.append(label, input);
      }
      input.id = id;
      input.disabled = !!field.disabled;
      if (field.type === "check") input.checked = !!field.value;
      else input.value = field.mixed ? "" : String(field.value ?? "");
      if (field.mixed) input.placeholder = text("edit_kernel_mixed", "Mixed");
      const read = () => {
        if (field.type === "check") return input.checked;
        if (field.type === "number" || field.type === "range") return input.value === "" ? null : Number(input.value);
        return input.value;
      };
      // Scrubbing reports as it goes; the step lands once, on change / blur.
      if (field.type === "range" || field.type === "number" || field.type === "text" || field.type === "color") {
        input.addEventListener("input", () => options.onChange(field.id, read(), { final: false }));
      }
      input.addEventListener("change", () => options.onChange(field.id, read(), { final: true }));
      return row;
    }

    function render() {
      const focusedId = /** @type {HTMLElement|null} */ (document.activeElement)?.closest?.(".edit-kernel-field")?.getAttribute("data-field");
      const fields = options.fields();
      // A field being typed in is left alone; only the others are refreshed.
      if (focusedId && form.querySelector(`[data-field="${focusedId}"]`) && fields.some((field) => field.id === focusedId)) {
        fields.forEach((field) => {
          if (field.id === focusedId) return;
          const old = form.querySelector(`[data-field="${field.id}"]`);
          if (old) old.replaceWith(control(field));
        });
        return;
      }
      form.replaceChildren(...fields.map(control));
    }

    render();
    return { render, element: form };
  }

  root.AISystem6EditLayers = Object.freeze({ createLayersPanel, createInspector });
})(typeof window !== "undefined" ? window : globalThis);
