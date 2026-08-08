// @ts-check
// Project Hard Disk backup validation, integrity, and identity remapping.

window.AISystem6ProjectDiskBackup = (() => {
  const format = "ai-system-6-project-disk";
  // v3 adds document revisions to the backup schema and the integrity hash.
  const currentFormatVersion = 3;
  // Version history:
  //   v1 — no SHA-256 integrity, no counts, no documentRevisions
  //   v2 — SHA-256 integrity + counts, no documentRevisions
  //   v3 — SHA-256 integrity + counts + documentRevisions
  const supportedFormatVersions = [1, 2, currentFormatVersion];
  const maxBackupBytes = 100 * 1024 * 1024;
  const maxArrayItems = 100000;
  const maxDepth = 40;
  const maxStringChars = 32 * 1024 * 1024;
  const maxTotalStringChars = 80 * 1024 * 1024;
  const forbiddenKeys = new Set(["__proto__", "prototype", "constructor"]);
  const arrayKeys = Object.freeze([
    "folders",
    "files",
    "scraps",
    "trash",
    "projectCdItems",
    "references",
    "documentRevisions",
  ]);

  const relationFields = Object.freeze({
    projectId: "project",
    folderId: "folder",
    sourceFolderId: "folder",
    parentChatId: "file",
    sourceChatId: "file",
    sourceFileId: "file",
    sourceDocumentId: "file",
    claimCheckId: "file",
    referenceId: "reference",
    sourceReferenceId: "reference",
    scrapId: "scrap",
    sourceScrapId: "scrap",
    projectCdItemId: "projectCdItem",
  });

  const relationArrayFields = Object.freeze({
    childChatIds: "file",
    sourceFileIds: "file",
    referenceIds: "reference",
    scrapIds: "scrap",
  });

  function isPlainObject(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === null || Object.getPrototypeOf(prototype) === null;
  }

  function clone(value) {
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function recordId(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function validateBackup(bundle) {
    const errors = [];
    const warnings = [];
    let totalStringChars = 0;
    let totalNodes = 0;

    function error(path, message) {
      if (errors.length < 100) errors.push(`${path}: ${message}`);
    }

    function inspectValue(value, path, depth, seen) {
      totalNodes += 1;
      if (totalNodes > 500000) {
        error(path, "backup contains too many values");
        return;
      }
      if (depth > maxDepth) {
        error(path, `nesting exceeds ${maxDepth} levels`);
        return;
      }
      if (typeof value === "string") {
        totalStringChars += value.length;
        if (value.length > maxStringChars) {
          error(path, `string exceeds ${maxStringChars} characters`);
        }
        if (totalStringChars > maxTotalStringChars) {
          error(path, `total text exceeds ${maxTotalStringChars} characters`);
        }
        return;
      }
      if (value === null || ["boolean", "number"].includes(typeof value)) {
        if (typeof value === "number" && !Number.isFinite(value)) {
          error(path, "number must be finite");
        }
        return;
      }
      if (Array.isArray(value)) {
        if (value.length > maxArrayItems) {
          error(path, `array exceeds ${maxArrayItems} items`);
          return;
        }
        value.forEach((item, index) => inspectValue(item, `${path}[${index}]`, depth + 1, seen));
        return;
      }
      if (!isPlainObject(value)) {
        error(path, "value must be JSON-compatible");
        return;
      }
      if (seen.has(value)) {
        error(path, "cyclic values are not supported");
        return;
      }
      seen.add(value);
      Object.entries(value).forEach(([key, item]) => {
        if (forbiddenKeys.has(key)) {
          error(`${path}.${key}`, "unsafe object key");
          return;
        }
        inspectValue(item, `${path}.${key}`, depth + 1, seen);
      });
      seen.delete(value);
    }

    if (!isPlainObject(bundle)) {
      return {
        valid: false,
        errors: ["backup: top-level value must be an object"],
        warnings,
        formatVersion: 0,
      };
    }
    inspectValue(bundle, "backup", 0, new Set());

    if (bundle.format !== format) error("backup.format", `must equal ${format}`);
    const formatVersion = Number(bundle.formatVersion || 1);
    if (!Number.isInteger(formatVersion) || !supportedFormatVersions.includes(formatVersion)) {
      error("backup.formatVersion", `unsupported version ${String(bundle.formatVersion)}`);
    }
    if (formatVersion === 1 || formatVersion === 2) {
      warnings.push(
        `Legacy v${formatVersion} backup has no document revision history; an empty revision set is imported.`
      );
    }
    if (!isPlainObject(bundle.project)) {
      error("backup.project", "project must be an object");
    } else {
      if (!recordId(bundle.project.id)) error("backup.project.id", "project id is required");
      if (!recordId(bundle.project.name)) error("backup.project.name", "project name is required");
    }

    arrayKeys.forEach((key) => {
      if (key === "documentRevisions" && formatVersion < currentFormatVersion) return;
      if (!Array.isArray(bundle[key])) {
        error(`backup.${key}`, "field must be an array");
      }
    });
    if (errors.length) {
      return { valid: false, errors, warnings, formatVersion };
    }

    const typeDefinitions = [
      ["folder", bundle.folders, true],
      ["file", bundle.files, true],
      ["scrap", bundle.scraps, true],
      ["trash", bundle.trash, false],
      ["projectCdItem", bundle.projectCdItems, true],
      ["reference", bundle.references, true],
    ];
    const ids = {};
    typeDefinitions.forEach(([type, items, requireId]) => {
      const typeIds = new Set();
      ids[type] = typeIds;
      items.forEach((item, index) => {
        const path = `backup.${type === "projectCdItem" ? "projectCdItems" : `${type}s`}[${index}]`;
        if (!isPlainObject(item)) {
          error(path, "record must be an object");
          return;
        }
        const id = recordId(item.id);
        if (requireId && !id) {
          error(`${path}.id`, "record id is required");
          return;
        }
        if (id && typeIds.has(id)) {
          error(`${path}.id`, `duplicate ${type} id ${id}`);
          return;
        }
        if (id) typeIds.add(id);
      });
    });

    function requireRelation(value, targetType, path) {
      const id = recordId(value);
      if (!id) return;
      if (!ids[targetType]?.has(id)) {
        error(path, `references missing ${targetType} ${id}`);
      }
    }

    bundle.folders.forEach((folder, index) => {
      requireRelation(folder.parentId, "folder", `backup.folders[${index}].parentId`);
    });
    bundle.files.forEach((file, index) => {
      requireRelation(file.folderId, "folder", `backup.files[${index}].folderId`);
      requireRelation(file.parentChatId, "file", `backup.files[${index}].parentChatId`);
      requireRelation(file.sourceChatId, "file", `backup.files[${index}].sourceChatId`);
      requireRelation(file.sourceDocumentId, "file", `backup.files[${index}].sourceDocumentId`);
      requireRelation(file.referenceId, "reference", `backup.files[${index}].referenceId`);
      if (file.type === "alias") {
        const alias = file.aliasTarget;
        if (!isPlainObject(alias) || !recordId(alias.id)) {
          error(`backup.files[${index}].aliasTarget`, "alias requires a target id");
        } else if (["file", "scrap", "reference"].includes(alias.kind)) {
          requireRelation(alias.id, alias.kind, `backup.files[${index}].aliasTarget.id`);
        }
      }
    });
    bundle.scraps.forEach((scrap, index) => {
      requireRelation(scrap.sourceFileId, "file", `backup.scraps[${index}].sourceFileId`);
      requireRelation(scrap.sourceDocumentId, "file", `backup.scraps[${index}].sourceDocumentId`);
      requireRelation(scrap.sourceReferenceId, "reference", `backup.scraps[${index}].sourceReferenceId`);
      requireRelation(scrap.referenceId, "reference", `backup.scraps[${index}].referenceId`);
    });
    bundle.projectCdItems.forEach((item, index) => {
      requireRelation(item.sourceDocumentId, "file", `backup.projectCdItems[${index}].sourceDocumentId`);
      requireRelation(item.claimCheckId, "file", `backup.projectCdItems[${index}].claimCheckId`);
    });
    bundle.references.forEach((reference, referenceIndex) => {
      if (reference.chunks !== undefined && !Array.isArray(reference.chunks)) {
        error(`backup.references[${referenceIndex}].chunks`, "chunks must be an array");
        return;
      }
      (reference.chunks || []).forEach((chunk, chunkIndex) => {
        if (!isPlainObject(chunk)) {
          error(`backup.references[${referenceIndex}].chunks[${chunkIndex}]`, "chunk must be an object");
          return;
        }
        const chunkReferenceId = recordId(chunk.referenceId);
        if (chunkReferenceId && chunkReferenceId !== reference.id) {
          error(
            `backup.references[${referenceIndex}].chunks[${chunkIndex}].referenceId`,
            "chunk referenceId must match its parent reference"
          );
        }
      });
    });

    if (formatVersion === currentFormatVersion) {
      const revisionIdsByDocument = new Map();
      bundle.documentRevisions.forEach((revision, revisionIndex) => {
        const path = `backup.documentRevisions[${revisionIndex}]`;
        if (!isPlainObject(revision)) {
          error(path, "revision must be an object");
          return;
        }
        const revisionId = recordId(revision.id);
        const documentId = recordId(revision.documentId);
        if (!revisionId) error(`${path}.id`, "revision id is required");
        if (!documentId) {
          error(`${path}.documentId`, "revision documentId is required");
        } else if (!ids.file?.has(documentId)) {
          error(`${path}.documentId`, `revision references missing file ${documentId}`);
        }
        if (revisionId && documentId) {
          const documentRevisions = revisionIdsByDocument.get(documentId) || new Set();
          if (documentRevisions.has(revisionId)) {
            error(`${path}.id`, `duplicate revision id ${revisionId}`);
          }
          documentRevisions.add(revisionId);
          revisionIdsByDocument.set(documentId, documentRevisions);
        }
        for (const field of ["body", "contentHash", "operation", "origin"]) {
          if (typeof revision[field] !== "string") error(`${path}.${field}`, "must be a string");
        }
      });
      // Second pass: parents declared before their children are still valid.
      bundle.documentRevisions.forEach((revision, revisionIndex) => {
        const parentId = recordId(revision?.parentRevisionId);
        if (!parentId) return;
        const documentRevisions = revisionIdsByDocument.get(recordId(revision?.documentId));
        if (documentRevisions && !documentRevisions.has(parentId)) {
          error(
            `backup.documentRevisions[${revisionIndex}].parentRevisionId`,
            `revision parent ${parentId} is not part of the same document tree`
          );
        }
      });
    }

    const visiting = new Set();
    const visited = new Set();
    const foldersById = new Map(bundle.folders.map((folder) => [folder.id, folder]));
    function visitFolder(id) {
      if (!id || visited.has(id)) return;
      if (visiting.has(id)) {
        error("backup.folders", `folder cycle includes ${id}`);
        return;
      }
      visiting.add(id);
      visitFolder(foldersById.get(id)?.parentId);
      visiting.delete(id);
      visited.add(id);
    }
    bundle.folders.forEach((folder) => visitFolder(folder.id));

    if (formatVersion >= 2) {
      if (!isPlainObject(bundle.integrity)) {
        error("backup.integrity", "v2+ backup requires an integrity record");
      } else {
        if (bundle.integrity.algorithm !== "SHA-256") {
          error("backup.integrity.algorithm", "must equal SHA-256");
        }
        if (!/^[a-f0-9]{64}$/i.test(String(bundle.integrity.contentHash || ""))) {
          error("backup.integrity.contentHash", "must be a SHA-256 hex digest");
        }
      }
      if (!isPlainObject(bundle.counts)) {
        error("backup.counts", "v2+ backup requires counts");
      } else {
        arrayKeys.forEach((key) => {
          // v2 ships counts without documentRevisions (revisions arrived in v3).
          if (key === "documentRevisions" && formatVersion < currentFormatVersion) return;
          if (Number(bundle.counts[key]) !== bundle[key].length) {
            error(`backup.counts.${key}`, "count does not match the array");
          }
        });
      }
    } else {
      warnings.push("Legacy v1 backup has no cryptographic integrity record.");
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      formatVersion,
    };
  }

  function stableStringify(value) {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) {
      return `[${value.map((item) => stableStringify(item)).join(",")}]`;
    }
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${stableStringify(value[key])}`
    ).join(",")}}`;
  }

  async function sha256Hex(value) {
    const bytes = new TextEncoder().encode(String(value));
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  function bundleWithoutIntegrity(bundle) {
    const copy = JSON.parse(JSON.stringify(bundle));
    delete copy.integrity;
    return copy;
  }

  async function attachIntegrity(bundle) {
    const copy = bundleWithoutIntegrity(bundle);
    copy.format = format;
    copy.formatVersion = currentFormatVersion;
    // v3 always carries the revision array; legacy sources migrate to an
    // explicit empty set rather than silently omitting the field.
    if (!Array.isArray(copy.documentRevisions)) copy.documentRevisions = [];
    copy.counts = Object.fromEntries(arrayKeys.map((key) => [key, copy[key].length]));
    const contentHash = await sha256Hex(stableStringify(copy));
    return {
      ...copy,
      integrity: {
        algorithm: "SHA-256",
        contentHash,
      },
    };
  }

  async function verifyIntegrity(bundle) {
    const validation = validateBackup(bundle);
    if (!validation.valid) return { valid: false, errors: validation.errors };
    if (validation.formatVersion === 1) return { valid: true, legacy: true, errors: [] };
    const expected = await sha256Hex(stableStringify(bundleWithoutIntegrity(bundle)));
    const actual = String(bundle.integrity.contentHash || "").toLowerCase();
    return {
      valid: expected === actual,
      legacy: false,
      errors: expected === actual ? [] : ["backup.integrity.contentHash: backup content has changed"],
    };
  }

  function sourceKeyWithRemappedId(value, idMaps) {
    const text = String(value || "");
    const match = text.match(/^(file|reference|scrap|projectCdItem):(.+)$/);
    if (!match) return value;
    const mapped = idMaps[match[1]]?.get(match[2]);
    return mapped ? `${match[1]}:${mapped}` : value;
  }

  function remapRelations(value, idMaps, key = "") {
    if (Array.isArray(value)) {
      const relationType = relationArrayFields[key];
      if (relationType) {
        return value.map((id) => idMaps[relationType]?.get(id) || "");
      }
      return value.map((item) => remapRelations(item, idMaps));
    }
    if (!isPlainObject(value)) {
      return key === "sourceKey" ? sourceKeyWithRemappedId(value, idMaps) : value;
    }
    if (key === "aliasTarget" && recordId(value.id)) {
      const relationType = String(value.kind || "");
      return { ...value, id: idMaps[relationType]?.get(recordId(value.id)) || "" };
    }
    return Object.fromEntries(Object.entries(value).map(([field, item]) => {
      const relationType = relationFields[field];
      if (relationType && typeof item === "string") {
        return [field, item ? idMaps[relationType]?.get(item) || "" : ""];
      }
      return [field, remapRelations(item, idMaps, field)];
    }));
  }

  function remapBackup(bundle, options = {}) {
    const validation = validateBackup(bundle);
    if (!validation.valid) {
      throw new Error(validation.errors.join("\n"));
    }
    const suppliedUuid = typeof options.uuid === "function" ? options.uuid : null;
    const uuid = suppliedUuid || (() => crypto.randomUUID());
    const now = String(options.now || new Date().toISOString());
    const newProjectId = suppliedUuid ? suppliedUuid() : crypto.randomUUID();
    const idMaps = {
      project: new Map([[bundle.project.id, newProjectId]]),
      folder: new Map(),
      file: new Map(),
      scrap: new Map(),
      trash: new Map(),
      projectCdItem: new Map(),
      reference: new Map(),
      revision: new Map(),
    };
    const definitions = [
      ["folder", bundle.folders],
      ["file", bundle.files],
      ["scrap", bundle.scraps],
      ["trash", bundle.trash],
      ["projectCdItem", bundle.projectCdItems],
      ["reference", bundle.references],
    ];
    definitions.forEach(([type, items]) => {
      items.forEach((item, index) => {
        const oldId = recordId(item.id) || `${type}:${index}`;
        idMaps[type].set(oldId, uuid());
      });
    });
    (bundle.documentRevisions || []).forEach((revision, index) => {
      idMaps.revision.set(recordId(revision?.id) || `revision:${index}`, uuid());
    });

    function registerNestedRecord(type, record) {
      const id = recordId(record?.id);
      if (id && !idMaps[type].has(id)) idMaps[type].set(id, uuid());
    }

    bundle.trash.forEach((trashItem) => {
      const original = trashItem?.originalData;
      if (!isPlainObject(original)) return;
      if (trashItem.originalType === "file") registerNestedRecord("file", original);
      if (trashItem.originalType === "scrap") registerNestedRecord("scrap", original);
      if (trashItem.originalType === "projectCd") registerNestedRecord("projectCdItem", original);
      if (trashItem.originalType === "projectReference") registerNestedRecord("reference", original);
      if (trashItem.originalType === "folder") {
        registerNestedRecord("folder", original.folder);
        (original.folders || []).forEach((folder) => registerNestedRecord("folder", folder));
        (original.files || []).forEach((file) => registerNestedRecord("file", file));
      }
    });

    const importedFolders = bundle.folders.map((folder, index) => {
      const oldId = recordId(folder.id) || `folder:${index}`;
      const copy = remapRelations(clone(folder), idMaps);
      copy.id = idMaps.folder.get(oldId);
      copy.projectId = newProjectId;
      copy.parentId = folder.parentId ? idMaps.folder.get(folder.parentId) || null : null;
      return copy;
    });

    let defaultFolderId = importedFolders[0]?.id || "";
    function ensureDefaultFolder() {
      if (defaultFolderId) return defaultFolderId;
      defaultFolderId = uuid();
      importedFolders.push({
        id: defaultFolderId,
        projectId: newProjectId,
        name: "General",
        parentId: null,
        createdAt: now,
        updatedAt: now,
      });
      return defaultFolderId;
    }

    function remapRecords(type, items) {
      return items.map((item, index) => {
        const oldId = recordId(item.id) || `${type}:${index}`;
        const copy = remapRelations(clone(item), idMaps);
        copy.id = idMaps[type].get(oldId);
        copy.projectId = newProjectId;
        return copy;
      });
    }

    function remapNestedRecord(type, record) {
      if (!isPlainObject(record)) return record;
      const copy = remapRelations(clone(record), idMaps);
      const id = recordId(record.id);
      if (idMaps[type]?.has(id)) copy.id = idMaps[type].get(id);
      copy.projectId = newProjectId;
      if (type === "folder") {
        copy.parentId = record.parentId ? idMaps.folder.get(record.parentId) || null : null;
      }
      if (type === "reference") {
        copy.chunks = (Array.isArray(record.chunks) ? record.chunks : []).map((chunk) => ({
          ...remapRelations(chunk, idMaps),
          projectId: newProjectId,
          referenceId: copy.id,
        }));
      }
      return copy;
    }

    function remapTrashRecord(trashItem, index) {
      const oldId = recordId(trashItem.id) || `trash:${index}`;
      const copy = remapRelations(clone(trashItem), idMaps);
      copy.id = idMaps.trash.get(oldId);
      copy.projectId = newProjectId;
      const original = trashItem.originalData;
      if (!isPlainObject(original)) return copy;
      if (trashItem.originalType === "file") {
        copy.originalData = remapNestedRecord("file", original);
      } else if (trashItem.originalType === "scrap") {
        copy.originalData = remapNestedRecord("scrap", original);
      } else if (trashItem.originalType === "projectCd") {
        copy.originalData = remapNestedRecord("projectCdItem", original);
      } else if (trashItem.originalType === "projectReference") {
        copy.originalData = remapNestedRecord("reference", original);
      } else if (trashItem.originalType === "folder") {
        copy.originalData = {
          ...remapRelations(clone(original), idMaps),
          folder: remapNestedRecord("folder", original.folder),
          folders: (original.folders || []).map((folder) => remapNestedRecord("folder", folder)),
          files: (original.files || []).map((file) => remapNestedRecord("file", file)),
        };
      }
      return copy;
    }

    const importedFiles = remapRecords("file", bundle.files).map((file) => ({
      ...file,
      folderId: file.folderId || ensureDefaultFolder(),
    }));
    const importedReferences = remapRecords("reference", bundle.references).map((reference) => ({
      ...reference,
      chunks: (Array.isArray(reference.chunks) ? reference.chunks : []).map((chunk) => ({
        ...remapRelations(chunk, idMaps),
        projectId: newProjectId,
        referenceId: reference.id,
      })),
    }));
    const originalProject = remapRelations(clone(bundle.project), idMaps);
    const baseName = String(originalProject.name || "Untitled Project");
    const projectName = typeof options.projectName === "function"
      ? options.projectName(baseName)
      : `${baseName} Restored`;
    const importedProject = {
      ...originalProject,
      id: newProjectId,
      name: projectName,
      createdAt: now,
      updatedAt: now,
      archived: false,
      importedFrom: {
        format: bundle.format,
        formatVersion: validation.formatVersion,
        exportedAt: bundle.exportedAt || "",
        originalProjectId: bundle.project.id,
        importedAt: now,
      },
    };

    const importedDocumentRevisions = (bundle.documentRevisions || []).map((revision, index) => {
      const oldId = recordId(revision?.id) || `revision:${index}`;
      const copy = remapRelations(clone(revision), idMaps);
      copy.id = idMaps.revision.get(oldId);
      copy.projectId = newProjectId;
      if (revision?.documentId) {
        copy.documentId = idMaps.file.get(revision.documentId) || "";
      }
      if (revision?.parentRevisionId) {
        copy.parentRevisionId = idMaps.revision.get(revision.parentRevisionId) || "";
      }
      return copy;
    });

    return {
      project: importedProject,
      folders: importedFolders,
      files: importedFiles,
      scraps: remapRecords("scrap", bundle.scraps),
      trash: bundle.trash.map(remapTrashRecord),
      projectCdItems: remapRecords("projectCdItem", bundle.projectCdItems),
      references: importedReferences,
      documentRevisions: importedDocumentRevisions,
    };
  }

  return Object.freeze({
    attachIntegrity,
    currentFormatVersion,
    format,
    maxBackupBytes,
    remapBackup,
    stableStringify,
    validateBackup,
    verifyIntegrity,
  });
})();
