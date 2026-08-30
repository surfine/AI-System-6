// @ts-check
// Project Hard Disk backup validation, integrity, and identity remapping.

window.AISystem6ProjectDiskBackup = (() => {
  const format = "ai-system-6-project-disk";
  // v7 carries bounded ClioTalk image inputs and a v3 Working Session.
  const currentFormatVersion = 7;
  // Version history:
  //   v1 — no SHA-256 integrity, no counts, no documentRevisions
  //   v2 — SHA-256 integrity + counts, no documentRevisions
  //   v3 — SHA-256 integrity + counts + documentRevisions
  //   v4 — + optional workingSession (that disk's windows, selection, cursors)
  //   v5 — + darkroomRecords: the negative, the adjustment stack, the writer's
  //        locks and the version chain. Before v5 those lived in keyval and a
  //        backup did not carry them, so export-then-restore lost the darkroom
  //        without saying so.
  //   v6 — + imageAttachments: every picture the project holds, original and
  //        preview. Before v6 a backup carried none of them, so a restored disk
  //        lost every Question Sheet photo, left each Scrapbook clip pointing at
  //        a picture that was not there, and turned every manuscript figure back
  //        into raw `![](aisystem6-image:...)` markdown. Same silence the
  //        darkroom had before v5.
  //   v7 — + recoverable ClioTalk imageInputs. Only a bounded inline copy and
  //        safe metadata travel; File objects, object URLs, credentials and
  //        signed provider tokens are never backup material.
  const supportedFormatVersions = [1, 2, 3, 4, 5, 6, currentFormatVersion];
  const maxBackupBytes = 100 * 1024 * 1024;
  const maxArrayItems = 100000;
  const maxDepth = 40;
  const maxStringChars = 32 * 1024 * 1024;
  const maxTotalStringChars = 80 * 1024 * 1024;
  const maxClioImageCharsPerChat = 12 * 1024 * 1024;
  const maxClioImageCharsPerProject = 48 * 1024 * 1024;
  const maxClioImageDecodedBytes = 512 * 1024;
  const forbiddenKeys = new Set(["__proto__", "prototype", "constructor"]);
  const arrayKeys = Object.freeze([
    "folders",
    "files",
    "scraps",
    "trash",
    "projectCdItems",
    "references",
    "documentRevisions",
    "darkroomRecords",
    "imageAttachments",
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

  // A desktop scene is windows and cursors. It must never become a side door
  // for credentials, and the validator is the fail-closed half of that promise.
  const sessionPath = "backup.workingSession";
  const workingSessionForbiddenKeyPattern = /(api[-_]?key|secret|password|passphrase|token|credential|bearer)/i;

  const relationArrayFields = Object.freeze({
    images: "imageAttachment",
    childChatIds: "file",
    sourceFileIds: "file",
    referenceIds: "reference",
    scrapIds: "scrap",
  });
  // Run Receipt arrays pointing into Project file identity space. Remapped
  // only under the clio-run-record structural contract, never by name alone.
  const runReceiptRelationArrayFields = Object.freeze([
    "inputObjectIds",
    "affectedObjectIds",
    "outputObjectIds",
  ]);

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

  function clioInlineImageInfo(value) {
    const match = String(value || "").match(/^data:(image\/(?:jpeg|png|gif|webp));base64,([a-z0-9+/=\s]+)$/i);
    if (!match) return null;
    const encoded = match[2].replace(/\s+/g, "");
    if (!encoded || encoded.length % 4 !== 0
      || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
      return null;
    }
    const padding = encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0;
    const decodedBytes = Math.max(0, Math.floor((encoded.length * 3) / 4) - padding);
    let sample;
    try {
      const binary = atob(encoded.slice(0, 24));
      sample = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    } catch {
      return null;
    }
    const prefix = String.fromCharCode(...sample);
    const detected = sample.length >= 3 && sample[0] === 0xff && sample[1] === 0xd8 && sample[2] === 0xff
      ? "image/jpeg"
      : sample.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
          .every((byte, index) => sample[index] === byte)
        ? "image/png"
        : prefix.startsWith("GIF87a") || prefix.startsWith("GIF89a")
          ? "image/gif"
          : prefix.slice(0, 4) === "RIFF" && prefix.slice(8, 12) === "WEBP"
            ? "image/webp"
            : "";
    return detected === match[1].toLowerCase()
      ? { mimeType: detected, decodedBytes }
      : null;
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
      const inScene = path.startsWith(sessionPath);
      Object.entries(value).forEach(([key, item]) => {
        if (forbiddenKeys.has(key)) {
          error(`${path}.${key}`, "unsafe object key");
          return;
        }
        if (inScene && workingSessionForbiddenKeyPattern.test(key)) {
          error(`${path}.${key}`, "desktop scene must not carry credentials");
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
      if (key === "documentRevisions" && formatVersion < 3) return;
      if (key === "darkroomRecords" && formatVersion < 5) return;
      if (key === "imageAttachments" && formatVersion < 6) return;
      if (!Array.isArray(bundle[key])) {
        error(`backup.${key}`, "field must be an array");
      }
    });
    // workingSession is optional in every version: a v4 backup of a disk that
    // was never opened simply has no scene to carry. Its credential scan
    // already ran inside inspectValue, above.
    const scene = bundle.workingSession;
    if (scene !== undefined && scene !== null) {
      if (!isPlainObject(scene)) {
        error(sessionPath, "desktop scene must be an object");
      } else {
        const expectedSceneVersion = formatVersion >= 7 ? 3 : 2;
        if (Number(scene.version) !== expectedSceneVersion) {
          error(`${sessionPath}.version`, "unsupported desktop scene version");
        }
        if (!isPlainObject(scene.adapters)) {
          error(`${sessionPath}.adapters`, "desktop scene must carry an adapter map");
        }
      }
    }

    if (formatVersion >= 7 && Array.isArray(bundle.files)) {
      const allowedImageInputKeys = new Set([
        "clientId", "kind", "name", "type", "size", "width", "height",
        "inlineDataUrl", "transport", "expiresAt", "attachedAt", "removedAt",
      ]);
      const projectImages = new Map();
      const inspectChatImages = (messages, messagesPath) => {
        let chatImageChars = 0;
        const chatImages = new Set();
        const chatReferences = [];
        (Array.isArray(messages) ? messages : []).forEach((message, messageIndex) => {
          for (const transientKey of ["fileToken", "file_id", "providerFileId", "objectUrl", "credentialScope", "file"]) {
            if (Object.prototype.hasOwnProperty.call(message || {}, transientKey)) {
              error(`${messagesPath}[${messageIndex}].${transientKey}`, "transient image field is not backup material");
            }
          }
          if (message.imageInputIds !== undefined && (!Array.isArray(message.imageInputIds) || message.imageInputIds.length > 4)) {
            error(`${messagesPath}[${messageIndex}].imageInputIds`, "must be an array of at most four ids");
          }
          (Array.isArray(message.imageInputIds) ? message.imageInputIds : []).forEach((id, idIndex) => {
            const reference = recordId(id);
            if (!reference) error(`${messagesPath}[${messageIndex}].imageInputIds[${idIndex}]`, "image id is required");
            else chatReferences.push({ id: reference, path: `${messagesPath}[${messageIndex}].imageInputIds[${idIndex}]` });
          });
          if (message.imageInputs !== undefined && (!Array.isArray(message.imageInputs) || message.imageInputs.length > 4)) {
            error(`${messagesPath}[${messageIndex}].imageInputs`, "must be an array of at most four image descriptors");
          }
          (Array.isArray(message.imageInputs) ? message.imageInputs : []).forEach((input, inputIndex) => {
            const path = `${messagesPath}[${messageIndex}].imageInputs[${inputIndex}]`;
            if (!isPlainObject(input)) {
              error(path, "image input must be an object");
              return;
            }
            Object.keys(input).forEach((key) => {
              if (!allowedImageInputKeys.has(key)) error(`${path}.${key}`, "unsafe or transient image field");
            });
            const dataUrl = String(input.inlineDataUrl || "");
            const imageInfo = clioInlineImageInfo(dataUrl);
            if (!imageInfo) error(`${path}.inlineDataUrl`, "must contain matching JPEG, PNG, GIF, or WebP base64 bytes");
            if (imageInfo?.decodedBytes > maxClioImageDecodedBytes) error(`${path}.inlineDataUrl`, "decoded image exceeds 512 KiB");
            chatImageChars += dataUrl.length;
            const id = recordId(input.clientId);
            if (!id) error(`${path}.clientId`, "image id is required");
            else chatImages.add(id);
            if (id && projectImages.has(id) && projectImages.get(id) !== dataUrl) {
              error(`${path}.clientId`, "one image id cannot refer to different inline bytes");
            } else if (id && !projectImages.has(id)) {
              projectImages.set(id, dataUrl);
            }
          });
        });
        chatReferences.forEach((reference) => {
          if (!chatImages.has(reference.id)) error(reference.path, "must refer to an image descriptor in the same Chat");
        });
        if (chatImageChars > maxClioImageCharsPerChat) {
          error(messagesPath, "Chat image context exceeds 12 MiB characters");
        }
      };
      bundle.files.filter((file) => file?.type === "chat").forEach((file, fileIndex) => {
        inspectChatImages(file.messages, `backup.files[${fileIndex}].messages`);
      });
      const sceneConversation = scene?.adapters?.assistant?.conversation;
      if (Array.isArray(sceneConversation)) {
        inspectChatImages(sceneConversation, `${sessionPath}.adapters.assistant.conversation`);
      }
      const projectImageChars = [...projectImages.values()].reduce((sum, dataUrl) => sum + dataUrl.length, 0);
      if (projectImageChars > maxClioImageCharsPerProject) {
        error("backup.files", "project ClioTalk image context exceeds 48 MiB characters");
      }
    }
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

    if (formatVersion >= 3) {
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

    if (formatVersion >= 5) {
      // One record per document, keyed by the document rather than by an id of
      // its own — the same shape the keyval store uses. A record pointing at a
      // file this backup does not contain is a broken restore, not a warning:
      // it would come back as a darkroom belonging to nothing.
      const documentsSeen = new Set();
      bundle.darkroomRecords.forEach((record, recordIndex) => {
        const path = `backup.darkroomRecords[${recordIndex}]`;
        if (!isPlainObject(record)) {
          error(path, "darkroom record must be an object");
          return;
        }
        const documentId = recordId(record.documentId);
        if (!documentId) {
          error(`${path}.documentId`, "darkroom record documentId is required");
        } else if (!ids.file?.has(documentId)) {
          error(`${path}.documentId`, `darkroom record references missing file ${documentId}`);
        } else if (documentsSeen.has(documentId)) {
          error(`${path}.documentId`, `duplicate darkroom record for document ${documentId}`);
        } else {
          documentsSeen.add(documentId);
        }
        for (const field of ["negative", "composite"]) {
          if (typeof record[field] !== "string") error(`${path}.${field}`, "must be a string");
        }
        for (const field of ["adjustmentLayers", "protectedRanges", "versions"]) {
          if (!Array.isArray(record[field])) error(`${path}.${field}`, "must be an array");
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
          if (key === "documentRevisions" && formatVersion < 3) return;
          // Same for the darkroom, which arrived in v5.
          if (key === "darkroomRecords" && formatVersion < 5) return;
          if (key === "imageAttachments" && formatVersion < 6) return;
      if (key === "imageAttachments" && formatVersion < 6) return;
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
    // v5 the same way: a disk where nothing was ever developed exports an
    // explicit empty set, so "no darkroom" and "field forgotten" stay apart.
    if (!Array.isArray(copy.darkroomRecords)) copy.darkroomRecords = [];
    // v6 the same way: a disk with no pictures exports an explicit empty set, so
    // "no pictures" and "field forgotten" stay apart.
    if (!Array.isArray(copy.imageAttachments)) copy.imageAttachments = [];
    if (isPlainObject(copy.workingSession) && Number(copy.workingSession.version) === 2) {
      copy.workingSession = { ...copy.workingSession, version: 3, migratedFrom: 2 };
    }
    // The desktop scene stays optional: an absent field means "no scene", not
    // "empty scene", so re-exported legacy backups keep their exact shape.
    if (!isPlainObject(copy.workingSession)) delete copy.workingSession;
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

  function remapRelations(value, idMaps, key = "", fields = relationFields, arrayFields = relationArrayFields) {
    if (Array.isArray(value)) {
      const relationType = arrayFields[key];
      if (relationType) {
        return value.map((id) => idMaps[relationType]?.get(id) || "");
      }
      return value.map((item) => remapRelations(item, idMaps, "", fields, arrayFields));
    }
    if (!isPlainObject(value)) {
      return key === "sourceKey" ? sourceKeyWithRemappedId(value, idMaps) : value;
    }
    if (key === "aliasTarget" && recordId(value.id)) {
      const relationType = String(value.kind || "");
      return { ...value, id: idMaps[relationType]?.get(recordId(value.id)) || "" };
    }
    return Object.fromEntries(Object.entries(value).map(([field, item]) => {
      const relationType = fields[field];
      if (relationType && typeof item === "string") {
        return [field, item ? idMaps[relationType]?.get(item) || "" : ""];
      }
      return [field, remapRelations(item, idMaps, field, fields, arrayFields)];
    }));
  }

  // A backed-up desktop scene names project records with the same id space,
  // under its own selection field names. An id with no counterpart in the
  // imported project is cleared, never left pointing at the exporting machine.
  const sessionRelationFields = Object.freeze({
    ...relationFields,
    activeProjectId: "project",
    selectedProjectId: "project",
    activeChatFileId: "file",
    selectedChatFileId: "file",
    activeTextFileId: "file",
    selectedFolderId: "folder",
    selectedDocumentFolderId: "folder",
    selectedScrapId: "scrap",
    selectedProjectReferenceId: "reference",
    selectedProjectCdItemId: "projectCdItem",
  });
  const sessionRelationArrayFields = Object.freeze({
    ...relationArrayFields,
    selectedScrapIds: "scrap",
    selectedProjectCdItemIds: "projectCdItem",
  });

  function remapWorkingSession(session, idMaps, newProjectId, sourceFormatVersion) {
    if (!isPlainObject(session)) return null;
    const remapped = remapRelations(
      clone(session),
      idMaps,
      "",
      sessionRelationFields,
      sessionRelationArrayFields
    );
    const conversation = remapped?.adapters?.assistant?.conversation;
    if (Array.isArray(conversation)) {
      remapped.adapters.assistant.conversation = conversation.map((message) => {
        const copy = { ...message };
        if (sourceFormatVersion < 7) {
          delete copy.imageInputIds;
          delete copy.imageInputs;
          return copy;
        }
        copy.imageInputIds = (Array.isArray(copy.imageInputIds) ? copy.imageInputIds : [])
          .map((id) => idMaps.clioImageInput.get(recordId(id)) || "")
          .filter(Boolean);
        copy.imageInputs = (Array.isArray(copy.imageInputs) ? copy.imageInputs : []).map((input) => ({
          ...input,
          clientId: idMaps.clioImageInput.get(recordId(input?.clientId)) || "",
        })).filter((input) => input.clientId);
        return copy;
      });
    }
    return { ...remapped, version: 3, migratedFrom: Number(session.version || 0) || undefined, projectId: newProjectId };
  }

  function remapRunReceiptRelations(receipt, idMaps) {
    if (!isPlainObject(receipt)) return receipt;
    const copy = remapRelations(clone(receipt), idMaps);
    runReceiptRelationArrayFields.forEach((field) => {
      if (!Array.isArray(copy[field])) return;
      copy[field] = copy[field].map((id) => idMaps.file?.get(recordId(id)) || "");
    });
    const replay = copy.replayContract;
    if (isPlainObject(replay) && Array.isArray(replay.inputObjectIds)) {
      replay.inputObjectIds = replay.inputObjectIds.map((id) => idMaps.file?.get(recordId(id)) || "");
    }
    return copy;
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
      imageAttachment: new Map(),
      clioImageInput: new Map(),
    };
    const definitions = [
      ["folder", bundle.folders],
      ["file", bundle.files],
      ["scrap", bundle.scraps],
      ["trash", bundle.trash],
      ["projectCdItem", bundle.projectCdItems],
      ["reference", bundle.references],
      ["imageAttachment", bundle.imageAttachments || []],
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
    (bundle.files || []).forEach((file) => {
      (Array.isArray(file?.messages) ? file.messages : []).forEach((message) => {
        (Array.isArray(message?.imageInputs) ? message.imageInputs : []).forEach((input) => {
          const id = recordId(input?.clientId);
          if (id && !idMaps.clioImageInput.has(id)) idMaps.clioImageInput.set(id, uuid());
        });
      });
    });
    const sceneConversation = bundle.workingSession?.adapters?.assistant?.conversation;
    (Array.isArray(sceneConversation) ? sceneConversation : []).forEach((message) => {
      (Array.isArray(message?.imageInputs) ? message.imageInputs : []).forEach((input) => {
        const id = recordId(input?.clientId);
        if (id && !idMaps.clioImageInput.has(id)) idMaps.clioImageInput.set(id, uuid());
      });
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

    const importedFiles = remapRecords("file", bundle.files).map((file, index) => {
      const copy = { ...file, folderId: file.folderId || ensureDefaultFolder() };
      if (Array.isArray(copy.messages)) {
        copy.messages = copy.messages.map((message) => {
          const remappedMessage = { ...message };
          if (validation.formatVersion < 7) {
            delete remappedMessage.imageInputIds;
            delete remappedMessage.imageInputs;
            return remappedMessage;
          }
          remappedMessage.imageInputIds = (Array.isArray(message.imageInputIds) ? message.imageInputIds : [])
            .map((id) => idMaps.clioImageInput.get(recordId(id)) || "")
            .filter(Boolean);
          remappedMessage.imageInputs = (Array.isArray(message.imageInputs) ? message.imageInputs : []).map((input) => ({
            ...input,
            clientId: idMaps.clioImageInput.get(recordId(input?.clientId)) || "",
          })).filter((input) => input.clientId);
          return remappedMessage;
        });
      }
      // Figures cited in the body follow their picture to its new id.
      if (typeof copy.body === "string" && copy.body.includes("aisystem6-image:")) {
        copy.body = remapImageCitations(copy.body);
      }
      // Remap receipt relations from the original record (single pass). The
      // generic walker above already handled scalar relation fields; the
      // receipt-specific object-id arrays are handled here under the
      // clio-run-record structural contract only.
      const original = bundle.files[index];
      const isRunReceiptFile = original?.artifactKind === "clio-run-record"
        || isPlainObject(original?.runReceipt)
        || isPlainObject(original?.runRecord);
      if (isRunReceiptFile) {
        if (isPlainObject(original.runReceipt)) copy.runReceipt = remapRunReceiptRelations(original.runReceipt, idMaps);
        if (isPlainObject(original.runRecord)) copy.runRecord = remapRunReceiptRelations(original.runRecord, idMaps);
      }
      return copy;
    });
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
    // Quick Draft's durable linkage lives inside the project record; after
    // import it must point at the remapped Project document, or
    // "Continue in TeachText" would resolve a dead id.
    if (importedProject?.quickDraft?.workspace?.projectDocId) {
      const mappedDocumentId = idMaps.file.get(importedProject.quickDraft.workspace.projectDocId);
      if (mappedDocumentId) importedProject.quickDraft.workspace.projectDocId = mappedDocumentId;
    }

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

    // A manuscript cites a picture by id INSIDE its body text, as
    // `![alt](aisystem6-image:<id>)`. Every other pointer in a backup is a
    // field the remapper can see; this one is prose. Rewriting it is what keeps
    // a restored figure attached to its picture -- and remapping the picture
    // ids without this step would break every figure in the disk, which is
    // worse than not remapping at all.
    function remapImageCitations(text) {
      return String(text || "").replace(
        /(\]\(aisystem6-image:)([^)]+)(\))/g,
        (match, open, oldImageId, close) => {
          const mapped = idMaps.imageAttachment.get(recordId(oldImageId));
          return mapped ? `${open}${mapped}${close}` : match;
        },
      );
    }

    // A darkroom record has no id of its own — the document it belongs to IS
    // its identity — so only the two pointers are remapped. Validation already
    // refuses a record whose document is not in the bundle; the drop below is
    // the belt for a caller that reached this without it, because a darkroom
    // restored with a dead documentId belongs to nothing.
    const importedDarkroomRecords = (bundle.darkroomRecords || []).flatMap((record) => {
      const mappedDocumentId = idMaps.file.get(recordId(record?.documentId));
      if (!mappedDocumentId) return [];
      const copy = remapRelations(clone(record), idMaps);
      copy.projectId = newProjectId;
      copy.documentId = mappedDocumentId;
      return [copy];
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
      darkroomRecords: importedDarkroomRecords,
      imageAttachments: remapRecords("imageAttachment", bundle.imageAttachments || []),
      workingSession: remapWorkingSession(bundle.workingSession, idMaps, newProjectId, validation.formatVersion),
    };
  }

  return Object.freeze({
    attachIntegrity,
    currentFormatVersion,
    format,
    maxBackupBytes,
    remapBackup,
    remapRunReceiptRelations,
    stableStringify,
    validateBackup,
    verifyIntegrity,
  });
})();
