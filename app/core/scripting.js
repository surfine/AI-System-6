// Droplets.
//
// Droplets are real Application-folder icons that accept file drops and run a
// declared command on the dropped files (source -> DocMap, Markdown ->
// slides, draft -> Project CD, article -> review, document -> .md export).
//
// Every command declares its id, input and output types, project requirement,
// permissions, and undoability, and runs through one runScriptableCommand()
// entry point, so a drop is validated the same way whatever it lands on.
//
// A user-facing Script Editor was considered and dropped (2026-08-06): the
// declarations below describe the Droplets themselves and are not groundwork
// for a scripting UI. Do not re-add command-listing or contract-describing
// helpers here without a caller.
//
// Extending the droplet set was also considered and dropped (2026-08-06). The
// five above are the set; OCR, Transcribe, PDF Printer, and a Bilibili
// publisher are not planned. Adding one means new input types (images, audio,
// video are not project objects), a raw-OS-file drop path, and — for the two
// server-backed ones — a capability that is off in the public deployment.

window.AISystem6ScriptingLoaded = true;

const dropletDefinitions = Object.freeze([
  {
    id: "droplet-docmap",
    nameZh: "DocMap 制作器",
    nameEn: "DocMap Maker",
    iconId: "docMap",
    iconClass: "folder-icon",
    inputType: "text-file",
    outputType: "docmap",
    requiresProject: true,
    permissions: Object.freeze({ model: true, network: false }),
    undoable: false,
    accepts: Object.freeze(["text"]),
    handler: runDocMapDroplet,
  },
  {
    id: "droplet-slides",
    nameZh: "演示制作器",
    nameEn: "Slides Maker",
    iconId: "clioStage",
    iconClass: "tools-icon",
    inputType: "text-file",
    outputType: "slides",
    requiresProject: true,
    permissions: Object.freeze({ model: true, network: false }),
    undoable: false,
    accepts: Object.freeze(["text"]),
    handler: runSlidesDroplet,
  },
  {
    id: "droplet-projectcd",
    nameZh: "加入项目光盘",
    nameEn: "Add to Project CD",
    iconId: "projectDisc",
    iconClass: "hard-disk-icon",
    inputType: "text-file",
    outputType: "projectCd",
    requiresProject: true,
    permissions: Object.freeze({ model: false, network: false }),
    undoable: false,
    accepts: Object.freeze(["text"]),
    handler: runProjectCdDroplet,
  },
  {
    id: "droplet-review",
    nameZh: "审校",
    nameEn: "Review",
    iconId: "reviewDesk",
    iconClass: "tools-icon",
    inputType: "text-file",
    outputType: "review",
    requiresProject: true,
    permissions: Object.freeze({ model: true, network: false }),
    undoable: false,
    accepts: Object.freeze(["text"]),
    handler: runReviewDroplet,
  },
  {
    id: "droplet-markdown",
    nameZh: "导出 Markdown",
    nameEn: "Export Markdown",
    iconId: "document",
    iconClass: "doc-icon",
    inputType: "text-file",
    outputType: "markdown",
    requiresProject: false,
    permissions: Object.freeze({ model: false, network: false }),
    undoable: false,
    accepts: Object.freeze(["text"]),
    handler: runMarkdownDroplet,
  },
]);

const scriptableCommandById = new Map(dropletDefinitions.map((command) => [command.id, command]));

function dropletName(command) {
  return currentLanguage === "zh" ? command.nameZh : command.nameEn;
}

function getScriptableCommand(id) {
  return scriptableCommandById.get(String(id || "")) || null;
}

function getDropletItems() {
  return dropletDefinitions.map((command) => ({
    name: dropletName(command),
    iconId: command.iconId,
    icon: command.iconClass,
    action: `open-droplet:${command.id}`,
    dropletAction: command.id,
    type: "droplet",
    kind: "Droplet",
  }));
}

// Droplet input resolution. Aliases are consumed as their original document
// (Project Hard Disk content semantics), while a broken alias or an alias to
// Scrapbook / Project Reference blocks the run: those objects are valid
// Finder objects but cannot masquerade as project documents. Dragging an
// original together with its alias collapses to one target by id, so a
// droplet never runs twice for the same document.
async function resolveDropletFiles(fileIds = []) {
  if (typeof ensureFinderObjectsModule === "function") await ensureFinderObjectsModule();
  const resolver = window.AISystem6FinderObjects?.resolveProjectFileForUse;
  const files = [];
  const seenTargetIds = new Set();
  for (const fileId of fileIds) {
    const selected = chatFiles.find((file) => file.id === fileId && isInActiveProject(file));
    if (!selected) continue;
    const resolution = typeof resolver === "function" ? resolver(selected) : null;
    if (!resolution || resolution.reason === "broken-alias") {
      return { blocked: true, reason: "broken-alias", file: selected, files: [] };
    }
    if (resolution.reason === "non-file-alias") {
      return { blocked: true, reason: "non-file-alias", file: selected, files: [] };
    }
    const target = resolution.target || selected;
    if (target && !seenTargetIds.has(target.id)) {
      seenTargetIds.add(target.id);
      files.push(target);
    }
  }
  return { blocked: false, reason: "", files };
}

async function runScriptableCommand(id, context = {}) {
  const command = getScriptableCommand(id);
  if (!command) {
    setStatus(currentLanguage === "zh" ? "找不到这个命令" : "Unknown command");
    return false;
  }
  if (command.requiresProject && !getActiveProject()) {
    openWindow("projects");
    setStatus(t("no_project_mounted"));
    return false;
  }
  const resolved = await resolveDropletFiles(context.fileIds || []);
  if (resolved.blocked) {
    if (resolved.reason === "broken-alias") {
      setStatus(t("alias_broken", resolved.file?.name || ""));
    } else {
      setStatus(currentLanguage === "zh" ? "这个 Droplet 只接受文稿" : "This droplet accepts documents only");
    }
    return false;
  }
  const files = resolved.files;
  if (!files.length) {
    setStatus(currentLanguage === "zh" ? "请先把项目硬盘里的文稿拖到 Droplet 上" : "Drag a Project Hard Disk document onto the droplet");
    return false;
  }
  if (files.some((file) => !command.accepts.includes(file.type))) {
    setStatus(currentLanguage === "zh" ? "这个 Droplet 只接受文稿" : "This droplet accepts documents only");
    return false;
  }
  return command.handler(files, context);
}

async function runDocMapDroplet(files) {
  const file = files[0];
  if (!file?.body?.trim()) return;
  await ensureDocMapModule();
  await makeDocMapFromCurrentSource({
    text: file.body.trim(),
    label: file.name,
    scope: "documents",
    meta: { fileId: file.id, fileType: file.type },
    threshold: docMapMinDocumentChars,
  });
}

async function runSlidesDroplet(files) {
  const file = files[0];
  if (!file?.body?.trim()) return;
  if (typeof ensureSlidesExportModule === "function") await ensureSlidesExportModule();
  await generateMarpMarkdownAndOpenClioStage({
    markdown: file.body,
    title: file.name,
    folder: typeof preferredFolderName === "function" ? preferredFolderName() : "",
  });
}

function runProjectCdDroplet(files) {
  const file = files[0];
  if (!file?.body?.trim()) return;
  const item = addProjectCdItem(file.body, file.name);
  if (item) {
    item.sourceDocumentId = file.id;
    saveDeskState();
    openWindow("projectCd");
  }
}

async function runReviewDroplet(files) {
  const file = files[0];
  if (!file?.body?.trim()) return;
  openTextFile(file.id);
  openWindow("teachText");
  if (typeof runClaimCheck === "function") await runClaimCheck();
}

function runMarkdownDroplet(files) {
  const file = files[0];
  if (!file?.body) return;
  downloadMarkdown(file.body, file.name);
}

async function runDropletDrop(action, dragData = {}) {
  if (!action) return;
  if (dragData.type === "clipping-selection") {
    if (typeof ensureFinderObjectsModule === "function") await ensureFinderObjectsModule();
    if (typeof createClippingFile !== "function") return;
    const clipping = createClippingFile({ ...dragData, folderId: null });
    if (!clipping) return;
    await runScriptableCommand(action, { fileIds: [clipping.id] });
    return;
  }
  const fileIds = Array.isArray(dragData.items)
    ? dragData.items.filter((item) => item.type === "file").map((item) => item.id)
    : (dragData.type === "file" && dragData.id ? [dragData.id] : []);
  await runScriptableCommand(action, { fileIds });
}

window.AISystem6Scripting = Object.freeze({
  getDropletItems,
  runDropletDrop,
  runScriptableCommand,
  getScriptableCommand,
});
