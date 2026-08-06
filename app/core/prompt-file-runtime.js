// Runtime resolver for user-visible prompt files. The generated system record is
// also the Finder record and the only production fallback for this prompt.

window.AISystem6PromptFilesRuntime = (() => {
  const defaultPromptId = "writing-tools.proofread";
  const overrideKind = "ai-prompt-override";
  const disabledKind = "ai-prompt-disabled";
  const receiptKind = "ai-prompt-receipt";

  function hashPromptBody(body = "") {
    let hash = 2166136261;
    for (const char of String(body)) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
  }

  function systemPrompt(id = defaultPromptId) {
    return (window.AISystem6PromptFiles || []).find((item) => item.id === id) || null;
  }

  function systemPromptPath(system) {
    return `System Folder/AI 提示词/${system.category}/${system.name}`;
  }

  function projectPromptFile(projectId, id, artifactKind) {
    const folderName = artifactKind === overrideKind ? "提示词覆盖" : artifactKind === disabledKind ? "已停用提示词" : "运行记录";
    const folderKind = artifactKind === overrideKind ? "prompt-overrides" : artifactKind === disabledKind ? "disabled-prompts" : "run-records";
    const folder = (typeof chatFolders === "undefined" ? [] : chatFolders).find((item) => item.projectId === projectId
      && (item.promptFolderKind === folderKind || (id === defaultPromptId && item.name === folderName)));
    const fileInFolder = folder && (typeof chatFiles === "undefined" ? [] : chatFiles).find((file) => file.projectId === projectId
      && file.folderId === folder.id && (file.promptId === id || (id === defaultPromptId && file.name === "校对")));
    if (fileInFolder) return fileInFolder;
    const direct = (typeof chatFiles === "undefined" ? [] : chatFiles).find((file) => file.projectId === projectId
      && file.artifactKind === artifactKind && file.promptId === id);
    if (direct) return direct;
    const disabledFolder = (typeof chatFolders === "undefined" ? [] : chatFolders).find((item) => item.projectId === projectId
      && (item.promptFolderKind === "disabled-prompts" || (id === defaultPromptId && item.name === "已停用提示词")));
    return (typeof chatFiles === "undefined" ? [] : chatFiles).find((file) => file.projectId === projectId
      && file.artifactKind === artifactKind && file.promptId === id && file.folderId !== disabledFolder?.id) || null;
  }

  function resolvePromptFile(id = defaultPromptId, projectId = null, language = "zh") {
    // Precedence: 项目停用 > 项目覆盖 > system prompt.
    const system = systemPrompt(id);
    if (!system) return { status: "missing", source: null, path: "", body: "", hash: "" };
    // System-boundary records are auditable system files, never project policy.
    if (system.editable !== "project") {
      const body = system.bodies?.[String(language).startsWith("en") ? "en" : "zh"];
      return body ? { status: "ready", source: "system-forced", path: systemPromptPath(system), body, hash: system.hash } : { status: "missing", source: null, path: systemPromptPath(system), body: "", hash: "" };
    }
    const disabled = projectId && projectPromptFile(projectId, id, disabledKind);
    if (disabled) return { status: "disabled", source: null, path: disabled.path || `ClioTalk/已停用提示词/${system.name}`, body: "", hash: disabled.hash || "" };
    const override = projectId && projectPromptFile(projectId, id, overrideKind);
    if (override) {
      const body = String(override.body || "").trim();
      if (!body) return { status: "missing", source: null, path: override.path || `ClioTalk/提示词覆盖/${system.name}`, body: "", hash: "" };
      return { status: "ready", source: "project", path: override.path || `ClioTalk/提示词覆盖/${system.name}`, body, hash: hashPromptBody(body) };
    }
    const body = system.bodies?.[String(language).startsWith("en") ? "en" : "zh"];
    if (!body) return { status: "missing", source: null, path: systemPromptPath(system), body: "", hash: "" };
    return { status: "ready", source: "system", path: systemPromptPath(system), body, hash: system.hash };
  }

  function upsertProjectPromptOverride(projectId, id = defaultPromptId, body = "") {
    if (!projectId || typeof chatFiles === "undefined") return null;
    if (arguments.length === 2 && !String(id).startsWith("writing-tools.")) {
      body = id;
      id = defaultPromptId;
    }
    const clean = String(body || "").trim();
    const system = systemPrompt(id);
    if (!system || system.editable !== "project") return null;
    const existing = projectPromptFile(projectId, id, overrideKind);
    if (!clean) {
      if (existing) chatFiles.splice(chatFiles.indexOf(existing), 1);
      return null;
    }
    const folder = ensureProjectPromptFolder(projectId, "提示词覆盖");
    const record = existing || { id: crypto.randomUUID(), projectId, folderId: folder?.id || null, type: "text", artifactKind: overrideKind, promptId: id, createdAt: new Date().toISOString() };
    Object.assign(record, { name: system.name, path: `ClioTalk/提示词覆盖/${system.name}`, body: clean, hash: hashPromptBody(clean), updatedAt: new Date().toISOString() });
    if (!existing) chatFiles.unshift(record);
    return record;
  }

  function ensureProjectPromptOverrideForEditing(projectId, id = defaultPromptId) {
    const existing = projectPromptFile(projectId, id, overrideKind);
    if (existing) return existing;
    const system = systemPrompt(id);
    if (!system?.bodies?.zh || system.editable !== "project" || !projectId || typeof chatFiles === "undefined") return null;
    const folder = ensureProjectPromptFolder(projectId, "提示词覆盖");
    const now = new Date().toISOString();
    const record = {
      id: crypto.randomUUID(), projectId, folderId: folder?.id || null, type: "text",
      artifactKind: overrideKind, promptId: id, name: system.name, path: `ClioTalk/提示词覆盖/${system.name}`,
      body: system.bodies.zh, hash: hashPromptBody(system.bodies.zh), createdAt: now, updatedAt: now,
    };
    chatFiles.unshift(record);
    return record;
  }

  function ensureProjectPromptFolder(projectId, name) {
    if (!projectId || typeof chatFolders === "undefined") return null;
    const folderKinds = { "提示词覆盖": "prompt-overrides", "已停用提示词": "disabled-prompts", "运行记录": "run-records" };
    const promptFolderKind = folderKinds[name] || "";
    let folder = chatFolders.find((item) => item.projectId === projectId && (item.promptFolderKind === promptFolderKind || item.name === name));
    if (!folder) {
      const now = new Date().toISOString();
      folder = { id: crypto.randomUUID(), projectId, name, promptFolderKind, parentId: null, createdAt: now, updatedAt: now };
      chatFolders.unshift(folder);
    } else if (promptFolderKind && !folder.promptFolderKind) {
      folder.promptFolderKind = promptFolderKind;
    }
    return folder;
  }

  function setProjectPromptDisabled(projectId, id = defaultPromptId, disabled = true) {
    if (!projectId || typeof chatFiles === "undefined") return null;
    if (typeof id === "boolean") {
      disabled = id;
      id = defaultPromptId;
    }
    const system = systemPrompt(id);
    if (!system || system.editable !== "project") return null;
    const existing = projectPromptFile(projectId, id, disabledKind);
    if (!disabled) {
      if (existing) chatFiles.splice(chatFiles.indexOf(existing), 1);
      return null;
    }
    if (existing) return existing;
    const folder = ensureProjectPromptFolder(projectId, "已停用提示词");
    const record = { id: crypto.randomUUID(), projectId, folderId: folder?.id || null, type: "text", artifactKind: disabledKind, promptId: id, name: system.name, path: `ClioTalk/已停用提示词/${system.name}`, body: "", hash: "disabled", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    chatFiles.unshift(record);
    return record;
  }

  function recordPromptRun(projectId, id = defaultPromptId, resolved) {
    if (id && typeof id === "object") {
      resolved = id;
      id = defaultPromptId;
    }
    if (!projectId || !resolved || typeof chatFiles === "undefined") return null;
    const now = new Date().toISOString();
    const folder = ensureProjectPromptFolder(projectId, "运行记录");
    const system = systemPrompt(id);
    const receipt = { time: now, feature: system?.name || id, path: resolved.path, source: resolved.source, hash: resolved.hash };
    const record = { id: crypto.randomUUID(), projectId, folderId: folder?.id || null, type: "text", artifactKind: receiptKind, promptId: id, name: `${receipt.feature}运行记录 ${new Date(now).toLocaleString()}`, path: "ClioTalk/运行记录", body: [`时间：${receipt.time}`, `功能：${receipt.feature}`, `实际提示词：${receipt.path}`, `来源：${receipt.source}`, `hash：${receipt.hash}`].join("\n"), receipt, createdAt: now, updatedAt: now };
    chatFiles.unshift(record);
    return record;
  }

  return Object.freeze({ resolvePromptFile, upsertProjectPromptOverride, ensureProjectPromptOverrideForEditing, setProjectPromptDisabled, recordPromptRun, ensureProjectPromptFolder, hashPromptBody });
})();
