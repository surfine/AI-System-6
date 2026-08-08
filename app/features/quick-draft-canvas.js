// 钟点稿 / Quick Draft — 拼台 canvas (Phase 1).
//
// The article is an ordered path through objects; Phase 1 has exactly one
// text object holding the draft. The object level carries only the visual
// transform (position, size, angle) — separate from the semantic adjustment
// stack — and the text stays in workspace.body: the canvas object is a view
// of the same Markdown. Transform state persists in workspace.canvas so a
// refresh restores it, and switching back to Article never loses the body.

function blankQuickDraftCanvas() {
  return {
    objects: [{
      id: "obj-1",
      x: 120,
      y: 72,
      width: 560,
      height: 0,
      angle: 0,
    }],
    path: ["obj-1"],
  };
}

function normalizeQuickDraftCanvas(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  const defaults = blankQuickDraftCanvas();
  let objectIndex = 0;
  const objects = (Array.isArray(source.objects) ? source.objects : [])
    .map((item) => {
      const object = item && typeof item === "object" ? item : {};
      objectIndex += 1;
      return {
        id: String(object.id || `obj-${objectIndex}`),
        x: Number.isFinite(Number(object.x)) ? Math.round(Number(object.x)) : defaults.objects[0].x,
        y: Number.isFinite(Number(object.y)) ? Math.round(Number(object.y)) : defaults.objects[0].y,
        width: Number.isFinite(Number(object.width)) ? Math.max(160, Math.round(Number(object.width))) : defaults.objects[0].width,
        height: Number.isFinite(Number(object.height)) ? Math.max(0, Math.round(Number(object.height))) : 0,
        angle: Number.isFinite(Number(object.angle)) ? Math.round(Number(object.angle)) : 0,
      };
    })
    .filter((object) => object.id);
  if (!objects.length) return defaults;
  const ids = new Set(objects.map((object) => object.id));
  const path = (Array.isArray(source.path) ? source.path : defaults.path)
    .map((id) => String(id || ""))
    .filter((id) => ids.has(id));
  if (!path.length) path.push(objects[0].id);
  return { objects, path };
}

function quickDraftMaterialChars(record = activeProjectQuickDraft({ create: false })?.record) {
  const workspace = normalizeQuickDraftWorkspace(record?.workspace, record);
  const pieces = [
    workspace.intake.setup.pastedSources,
    (workspace.intake?.ventLog || []).map((entry) => entry.text).join("\n"),
    (workspace.intake?.chatMaterials || []).map((entry) => entry.text).join("\n"),
    workspace.intake?.outlineSeed || "",
    workspace.strategy?.editorial || "",
    workspace.strategy?.materialLedger || "",
    workspace.strategy?.adoptionTable || "",
  ];
  return pieces.join("\n").length;
}

function quickDraftCanvasSuggests(record = activeProjectQuickDraft({ create: false })?.record) {
  const workspace = normalizeQuickDraftWorkspace(record?.workspace, record);
  const body = String(workspace.body || "").trim();
  if (!body) return false;
  return quickDraftMaterialChars(record) > body.length;
}

function renderQuickDraftCanvas(record = activeProjectQuickDraft({ create: false })?.record) {
  if (!refs.canvasObject) return;
  const workspace = normalizeQuickDraftWorkspace(record?.workspace, record);
  const canvas = normalizeQuickDraftCanvas(workspace.canvas);
  const object = canvas.objects[0];
  if (!object) return;
  refs.canvasObject.dataset.quickDraftCanvasObject = object.id;
  refs.canvasObject.classList.toggle("is-selected", canvas.path[0] === object.id);
  refs.canvasObject.style.setProperty("--canvas-x", `${object.x}px`);
  refs.canvasObject.style.setProperty("--canvas-y", `${object.y}px`);
  refs.canvasObject.style.setProperty("--canvas-w", `${object.width}px`);
  refs.canvasObject.style.setProperty("--canvas-h", `${object.height || 0}px`);
  refs.canvasObject.style.setProperty("--canvas-angle", `${object.angle}deg`);
  const textEl = refs.canvasObject.querySelector("[data-quick-draft-canvas-object-text]");
  if (textEl) {
    const body = String(workspace.body || "").trim();
    textEl.textContent = body || t("quick_draft_canvas_empty");
    textEl.classList.toggle("is-empty", !body);
  }
  if (refs.canvasAngle) refs.canvasAngle.textContent = `${object.angle}°`;
}

function bindQuickDraftCanvasInteractions() {
  const objectEl = refs.canvasObject;
  if (!objectEl || objectEl.dataset.canvasBound) return;
  objectEl.dataset.canvasBound = "true";

  const beginDrag = (event, mode, handle = "") => {
    if (event.button !== undefined && event.button !== 0) return;
    event.preventDefault();
    const slot = activeProjectQuickDraft();
    if (!slot) return;
    const canvas = normalizeQuickDraftCanvas(slot.record.workspace.canvas);
    const object = canvas.objects[0];
    if (!object) return;
    objectEl.classList.add("is-selected");
    const startX = event.clientX;
    const startY = event.clientY;
    const startLeft = object.x;
    const startTop = object.y;
    const startWidth = object.width;
    const startHeight = object.height || 0;
    const startAngle = object.angle;
    const rect = objectEl.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const grabAngle = Math.atan2(startY - centerY, startX - centerX) * 180 / Math.PI + 90;

    const onMove = (moveEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      if (mode === "move") {
        objectEl.style.setProperty("--canvas-x", `${Math.round(startLeft + dx)}px`);
        objectEl.style.setProperty("--canvas-y", `${Math.round(startTop + dy)}px`);
        return;
      }
      if (mode === "rotate") {
        const currentAngle = Math.atan2(moveEvent.clientY - centerY, moveEvent.clientX - centerX) * 180 / Math.PI + 90;
        const angle = Math.round((startAngle + currentAngle - grabAngle) * 10) / 10;
        objectEl.style.setProperty("--canvas-angle", `${angle}deg`);
        if (refs.canvasAngle) refs.canvasAngle.textContent = `${angle}°`;
        return;
      }
      const hHandle = handle.includes("e") ? 1 : handle.includes("w") ? -1 : 0;
      const vHandle = handle.includes("s") ? 1 : handle.includes("n") ? -1 : 0;
      if (hHandle !== 0) {
        const width = Math.max(160, Math.round(startWidth + hHandle * dx));
        objectEl.style.setProperty("--canvas-w", `${width}px`);
        if (hHandle < 0) objectEl.style.setProperty("--canvas-x", `${Math.round(startLeft + dx)}px`);
      }
      if (vHandle !== 0) {
        const baseHeight = startHeight || Math.max(96, Math.round(rect.height));
        const height = Math.max(96, Math.round(baseHeight + vHandle * dy));
        objectEl.style.setProperty("--canvas-h", `${height}px`);
      }
    };
    const onUp = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      const nextObject = {
        ...object,
        x: Math.round(parseFloat(objectEl.style.getPropertyValue("--canvas-x")) || object.x),
        y: Math.round(parseFloat(objectEl.style.getPropertyValue("--canvas-y")) || object.y),
        width: Math.round(parseFloat(objectEl.style.getPropertyValue("--canvas-w")) || object.width),
        height: Math.round(parseFloat(objectEl.style.getPropertyValue("--canvas-h")) || object.height || 0),
        angle: Math.round(parseFloat(objectEl.style.getPropertyValue("--canvas-angle")) || object.angle),
      };
      const next = normalizeQuickDraftCanvas({
        ...normalizeQuickDraftCanvas(slot.record.workspace.canvas),
        objects: [nextObject],
      });
      saveQuickDraft({ workspace: { canvas: next } }, { debounce: false });
      renderQuickDraftCanvas(activeProjectQuickDraft({ create: false })?.record);
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  };

  objectEl.addEventListener("pointerdown", (event) => {
    if (event.target.closest("[data-quick-draft-canvas-handle]")) return;
    if (event.target.closest("[data-quick-draft-canvas-rotate]")) return;
    beginDrag(event, "move");
  });
  objectEl.querySelectorAll("[data-quick-draft-canvas-handle]").forEach((handle) => {
    handle.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
      beginDrag(event, "resize", handle.dataset.quickDraftCanvasHandle);
    });
  });
  objectEl.querySelector("[data-quick-draft-canvas-rotate]")?.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
    beginDrag(event, "rotate");
  });
  objectEl.addEventListener("dblclick", () => {
    quickDraftEditingCanvasObject = true;
    setQuickDraftSurface("linear");
    requestAnimationFrame(() => {
      refs.draft?.focus();
      if (refs.draft) refs.draft.scrollTop = 0;
    });
  });
}

window.AISystem6QuickDraftCanvas = Object.freeze({
  blankQuickDraftCanvas,
  normalizeQuickDraftCanvas,
  quickDraftCanvasSuggests,
  renderQuickDraftCanvas,
});
