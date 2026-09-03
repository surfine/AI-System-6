// Feature module: file-disk.

// Loaded before app.js as a classic script; shares the AI System 6 global scope.



function fileDiskKindFromName(name) {
  const ext = (name.match(/\.([^.]+)$/)?.[1] || "").toLowerCase();
  if (["aac", "aif", "aiff", "amr", "caf", "flac", "m4a", "mp3", "oga", "ogg", "opus", "wav", "webm"].includes(ext)) return "audio";
  if (["csv", "tsv", "xlsx", "numbers"].includes(ext)) return "table";
  if (ext === "pdf") return "pdf";
  if (["bmp", "jpg", "jpeg", "png", "webp", "heic", "heif"].includes(ext)) return "ocr";
  if (["pages", "key"].includes(ext)) return "iwork";
  if (["webarchive", "epub"].includes(ext)) return "archive";
  if (["docx", "pptx", "rtf"].includes(ext)) return "document";
  return "text";
}

function fileDiskKindLabel(kind) {
  return t({
    table: "file_disk_kind_table",
    pdf: "file_disk_kind_pdf",
    ocr: "file_disk_kind_ocr",
    iwork: "file_disk_kind_iwork",
    archive: "file_disk_kind_archive",
    document: "file_disk_kind_document",
    audio: "file_disk_kind_audio",
    text: "file_disk_kind_text",
  }[kind] || "file_disk_kind_text");
}

function mountedFileChunks(name) {
  return ragChunks.filter((chunk) =>
    chunk.source === name && chunk.projectId === activeProjectId && !chunk.fromProjectReference
  );
}

function buildMountedFileDiagnostic(file, text, chunks) {
  const value = String(text || "");
  const readable = value.match(/[\p{Script=Han}\p{L}\p{N}]/gu)?.length || 0;
  const replacementCount = value.match(/\uFFFD/g)?.length || 0;
  const warnings = [];

  if (!chunks.length) warnings.push("no_chunks");
  if (value.trim().length > 0 && value.trim().length < 160) warnings.push("short");
  if (value.length > 200 && readable / Math.max(value.length, 1) < 0.18) warnings.push("unreadable");
  if (replacementCount >= 3) warnings.push("replacement");

  return {
    bytes: Number(file?.size || 0),
    chars: value.length,
    chunks: chunks.length,
    kind: fileDiskKindFromName(file?.name || ""),
    warnings,
  };
}

function diagnosticWarningLabel(warning) {
  return t({
    short: "file_disk_warn_short",
    unreadable: "file_disk_warn_unreadable",
    replacement: "file_disk_warn_replacement",
    no_chunks: "file_disk_warn_no_chunks",
  }[warning] || "file_disk_warning");
}

function mountedFileDiagnostic(name) {
  const report = mountedTextDisk.fileDiagnostics[name];
  if (report) return report;
  const chunks = mountedFileChunks(name);
  return buildMountedFileDiagnostic({ name, size: 0 }, mountedTextDisk.fileBodies[name] || "", chunks);
}

function compactFileDiskCount(value) {
  const count = Number(value || 0);
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return String(count);
}

function mountedFileMeta(report) {
  return t("file_disk_meta", compactFileDiskCount(report.chars), report.chunks || 0);
}

function mountedFileDiagnosticTitle(name, report) {
  const lines = [
    name,
    `${fileDiskKindLabel(report.kind)} · ${report.bytes || 0} bytes`,
    t("file_disk_meta", report.chars || 0, report.chunks || 0),
  ];
  if (report.warnings?.length) {
    lines.push(`${t("file_disk_warning")}: ${report.warnings.map(diagnosticWarningLabel).join(", ")}`);
  }
  return lines.join("\n");
}

function formatFileDiskFailureSummary(failures, limit = 3) {
  if (!failures.length) return "";
  return failures
    .slice(0, limit)
    .map((failure) => t("file_disk_file_failed", failure.name, failure.message))
    .join("\n");
}

function formatFileDiskFailureTitle(failures) {
  return failures
    .map((failure) => t("file_disk_file_failed", failure.name, failure.message))
    .join("\n");
}

function renderMountedTextDisk() {
  const mountedChunkCount = getMountedTextDiskChunks().length;
  const mounted = isProjectMounted && mountedChunkCount > 0 && mountedTextDisk.projectId === activeProjectId;
  mountedTextDiskEl.hidden = !mounted;
  const starter = document.querySelector("#desktop-file-floppy-starter");
  if (starter) starter.hidden = mounted;
  if (spineFileFloppyButtonEl) spineFileFloppyButtonEl.hidden = mounted;
  indexFilesButton.textContent = fileDiskImportController ? t("cancel") : mounted ? t("add_to_text_disk") : t("mount");
  const files = mounted ? mountedTextDisk.files : [];
  const visibleNames = new Set(files);
  Array.from(selectedMountedFileNames).forEach((name) => {
    if (!visibleNames.has(name)) selectedMountedFileNames.delete(name);
  });
  if (selectedMountedFile && !selectedMountedFileNames.size && visibleNames.has(selectedMountedFile)) {
    selectedMountedFileNames.add(selectedMountedFile);
  }
  textDiskCountEl.textContent = t("files_count", files.length);
  textDiskGridEl.replaceChildren();

  if (files.length) {
    files.forEach((name) => {
      const report = mountedFileDiagnostic(name);
      const hasWarning = report.warnings?.length > 0;
      const button = document.createElement("button");
      button.type = "button";
      button.draggable = true;
      button.className = `finder-item${selectedMountedFileNames.has(name) || name === selectedMountedFile ? " is-selected" : ""}`;
      button.dataset.dragType = "mounted-file";
      button.dataset.id = name;
      button.dataset.projectId = activeProjectId || "";
      button.dataset.mountedFile = name;
      button.innerHTML = `
        ${renderSystemIcon("document", { size: "finder"})}
        <span>${escapeHtml(name)}</span>
        <small>${escapeHtml(mountedFileMeta(report))}</small>
        ${hasWarning ? `<small>${escapeHtml(t("file_disk_warning"))}</small>` : ""}
      `;
      button.title = mountedFileDiagnosticTitle(name, report);
      button.addEventListener("click", (event) => {
        if (event.metaKey || event.ctrlKey) {
          if (selectedMountedFileNames.has(name) && selectedMountedFileNames.size > 1) selectedMountedFileNames.delete(name);
          else selectedMountedFileNames.add(name);
        } else if (event.shiftKey && selectedMountedFile) {
          const anchorIndex = files.indexOf(selectedMountedFile);
          const itemIndex = files.indexOf(name);
          selectedMountedFileNames.clear();
          if (anchorIndex >= 0 && itemIndex >= 0) {
            files.slice(Math.min(anchorIndex, itemIndex), Math.max(anchorIndex, itemIndex) + 1).forEach((fileName) => selectedMountedFileNames.add(fileName));
          } else {
            selectedMountedFileNames.add(name);
          }
        } else {
          selectedMountedFileNames.clear();
          selectedMountedFileNames.add(name);
        }
        selectedMountedFile = selectedMountedFileNames.has(name) ? name : selectedMountedFileNames.values().next().value || null;
        renderMountedTextDisk();
      });
      button.addEventListener("dblclick", () => {
        selectedMountedFileNames.clear();
        selectedMountedFileNames.add(name);
        selectedMountedFile = name;
        renderMountedTextDisk();
        openMountedTextFile(name);
      });
      textDiskGridEl.append(button);
    });
  } else {
    const empty = document.createElement("div");
    empty.className = "empty-folder-note";
    empty.textContent = t("no_mounted_files");
    textDiskGridEl.append(empty);
  }

  if (mounted) {
    ragStatusEl.textContent = t("text_disk_mounted", files.length, mountedChunkCount);
  } else {
    ragStatusEl.textContent = t("no_text_disk_mounted");
  }

  if (!getWindow("projects")?.classList.contains("is-hidden")) {
    renderProjectDisks();
  }
  if (!getWindow("disk")?.classList.contains("is-hidden") && typeof renderStaticFinderWindow === "function") {
    renderStaticFinderWindow("disk");
  }
  updateProjectLabels();
  updateDocMapEntryButtons();
  updateMenuState();
}

function ejectTextDisk({ silent = false } = {}) {
  if (!silent) playSystemSound("eject");
  for (let index = ragChunks.length - 1; index >= 0; index -= 1) {
    if (!ragChunks[index].fromProjectReference) {
      ragChunks.splice(index, 1);
    }
  }
  mountedTextDisk.files = [];
  mountedTextDisk.fileBodies = {};
  mountedTextDisk.fileDiagnostics = {};
  mountedTextDisk.fileSources = {};
  mountedTextDisk.chunks = 0;
  mountedTextDisk.projectId = null;
  selectedMountedFile = null;
  selectedMountedFileNames.clear();
  filesInput.value = "";
  updateFilePickerLabels();
  renderMountedTextDisk();
  if (typeof closeReaderFileDocumentTabs === "function") closeReaderFileDocumentTabs();
  closeWindow("textDisk");
  updateMenuState();
  if (!silent) {
    setStatus(t("text_disk_ejected"));
    saveDeskState();
  }
}

function removeMountedFileChunks(fileNames, projectId = activeProjectId) {
  const names = new Set(Array.from(fileNames || []).map((name) => String(name || "")).filter(Boolean));
  if (!names.size) return 0;

  let removed = 0;
  for (let index = ragChunks.length - 1; index >= 0; index -= 1) {
    if (
      names.has(ragChunks[index].source)
      && ragChunks[index].projectId === projectId
      && !ragChunks[index].fromProjectReference
    ) {
      ragChunks.splice(index, 1);
      removed += 1;
    }
  }

  return removed;
}

function removeMountedFilesByName(fileNames, projectId = activeProjectId) {
  const names = new Set(Array.from(fileNames || []).map((name) => String(name || "")).filter(Boolean));
  if (!names.size || mountedTextDisk.projectId !== projectId) return 0;

  const removed = removeMountedFileChunks(names, projectId);
  mountedTextDisk.files = mountedTextDisk.files.filter((fileName) => !names.has(fileName));
  names.forEach((name) => {
    delete mountedTextDisk.fileBodies[name];
    delete mountedTextDisk.fileDiagnostics[name];
    delete mountedTextDisk.fileSources[name];
  });
  mountedTextDisk.chunks = getMountedTextDiskChunks().length;
  if (selectedMountedFile && names.has(selectedMountedFile)) selectedMountedFile = mountedTextDisk.files[0] || null;
  names.forEach((name) => selectedMountedFileNames.delete(name));
  if (removed || names.size) {
    renderMountedTextDisk();
    if (typeof closeReaderFileDocumentTabs === "function") closeReaderFileDocumentTabs([...names]);
  }
  return removed;
}

function removeSelectedMountedFile() {
  const names = selectedMountedFileNames.size ? [...selectedMountedFileNames] : selectedMountedFile ? [selectedMountedFile] : [];
  if (!names.some((name) => mountedTextDisk.files.includes(name))) {
    setStatus(t("no_mounted_file_selected"));
    return;
  }

  removeMountedFilesToTrash(names);
}

function ejectSelectedMountedFile({ silent = false } = {}) {
  const names = selectedMountedFileNames.size ? [...selectedMountedFileNames] : selectedMountedFile ? [selectedMountedFile] : [];
  const mountedNames = names.filter((name) => mountedTextDisk.files.includes(name));
  if (!mountedNames.length) {
    setStatus(t("no_mounted_file_selected"));
    return 0;
  }

  playSystemSound("eject");
  removeMountedFilesByName(mountedNames, activeProjectId);
  selectedMountedFileNames.clear();
  selectedMountedFile = mountedTextDisk.files[0] || null;
  if (selectedMountedFile) selectedMountedFileNames.add(selectedMountedFile);
  renderMountedTextDisk();
  saveDeskState();
  if (!silent) {
    setStatus(mountedNames.length === 1 ? t("ejected_mounted_file", mountedNames[0]) : t("ejected_mounted_files", mountedNames.length));
  }
  if (!mountedTextDisk.chunks) closeWindow("textDisk");
  return mountedNames.length;
}

function removeMountedFilesToTrash(fileNames = []) {
  const names = [...new Set(Array.from(fileNames || []).filter((name) => mountedTextDisk.files.includes(name)))];
  if (!names.length) return 0;
  names.forEach((name) => {
    trashItems.unshift({
      projectId: activeProjectId,
      title: name,
      body: mountedTextDisk.fileBodies[name] || "",
      originalPath: [projectDisplayName(getActiveProject()), t("mounted_text_disk")].filter(Boolean).join(" / "),
      originalType: "mountedFile",
      originalData: {
        name,
        body: mountedTextDisk.fileBodies[name] || "",
        diagnostics: mountedTextDisk.fileDiagnostics[name] || null,
        source: mountedTextDisk.fileSources[name] || null,
      },
    });
  });
  removeMountedFilesByName(names, activeProjectId);
  purgeContextForTrashedItems(names.map((name) => ({ type: "mountedFile", id: name, name })));
  selectedMountedFileNames.clear();
  selectedMountedFile = mountedTextDisk.files[0] || null;
  renderMountedTextDisk();
  renderTrash();
  saveDeskState();
  setStatus(names.length === 1 ? t("removed_mounted_file", names[0]) : t("mounted_files_moved_trash", names.length));
  if (!mountedTextDisk.chunks) closeWindow("textDisk");
  return names.length;
}

async function addMountedTextDiskToProject() {
  const mountedChunks = getMountedTextDiskChunks();

  if (!mountedChunks.length || mountedTextDisk.projectId !== activeProjectId) {
    setStatus(t("no_text_disk_to_save"));
    return;
  }

  const files = mountedTextDisk.files.filter((name) =>
    mountedChunks.some((chunk) => chunk.source === name)
  );

  if (!files.length) {
    setStatus(t("no_text_disk_to_save"));
    return;
  }

  try {
    const now = new Date().toISOString();
    let savedCount = 0;

    for (const name of files) {
      const body = mountedTextDisk.fileBodies[name] || "";
      const chunks = mountedChunks
        .filter((chunk) => chunk.source === name)
        .map((chunk) => ({
          source: name,
          content: chunk.content,
          embedding: chunk.embedding,
          chunkIndex: chunk.chunkIndex,
          start: chunk.start,
          end: chunk.end,
        }));

      if (!chunks.length) continue;

      const isCloud = typeof cloudConfig !== "undefined" && cloudConfig?.active && cloudCredentialReady();
      const localEmbeddingModel = String((embeddingModelInput?.value || "")).trim();
      const cloudEmbeddingModel = String((cloudConfig?.model || "")).trim();
      const isDeepSeekCloud = isCloud && String(cloudConfig?.provider || "").toLowerCase() === "deepseek";
      const embeddingModelName = isCloud && !isDeepSeekCloud
        ? (cloudEmbeddingModel || localEmbeddingModel || "cloud-embedding")
        : (localEmbeddingModel || "local-embedding");
      const hash = await hashText(`${embeddingModelName}\n${body || chunks.map((chunk) => chunk.content).join("\n\n")}`);
      const existing = projectReferences.find((reference) => reference.name === name);
      const reference = {
        id: existing?.id || crypto.randomUUID(),
        projectId: activeProjectId,
        name,
        body,
        hash,
        chunks,
        embeddingModel: embeddingModelName,
        enabled: true,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      };

      await putStoredProjectReference(reference);
      savedCount += 1;
    }

    ejectTextDisk({ silent: true });
    await loadActiveProjectReferences();
    openWindow("projects");
    setStatus(t("project_reference_saved", savedCount));
  } catch (error) {
    setStatus(t("project_reference_error", friendlyErrorDetail(error)));
  }
}
