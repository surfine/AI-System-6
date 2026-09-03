// Runtime resolver for user-visible prompt files. The generated system record is
// also the Finder record and the only production fallback for this prompt.

window.AISystem6PromptFilesRuntime = (() => {
  const defaultPromptId = "writing-tools.proofread";
  const overrideKind = "ai-prompt-override";
  const disabledKind = "ai-prompt-disabled";
  const receiptKind = "ai-prompt-receipt";

  const promptFolderLabels = Object.freeze({
    "prompt-overrides": Object.freeze({ zh: "提示词覆盖", en: "Prompt Overrides" }),
    "disabled-prompts": Object.freeze({ zh: "已停用提示词", en: "Disabled Prompts" }),
    "run-records": Object.freeze({ zh: "运行记录", en: "Run Records" }),
  });

  function promptLanguage(language = "") {
    const requested = String(language || (typeof currentLanguage !== "undefined" ? currentLanguage : "zh"));
    return requested.toLowerCase().startsWith("en") ? "en" : "zh";
  }

  function promptDisplayName(recordOrId, language = "") {
    const record = typeof recordOrId === "string" ? systemPrompt(recordOrId) : recordOrId;
    if (!record) return typeof recordOrId === "string" ? recordOrId : "";
    const lang = promptLanguage(language);
    return record.names?.[lang] || (lang === "en" ? record.nameEn : record.name) || record.name || record.id;
  }

  function promptFolderDescriptor(kindOrName, language = "") {
    const kind = Object.keys(promptFolderLabels).find((candidate) => (
      candidate === kindOrName
      || promptFolderLabels[candidate].zh === kindOrName
      || promptFolderLabels[candidate].en === kindOrName
    )) || "";
    const labels = promptFolderLabels[kind] || { zh: String(kindOrName || ""), en: String(kindOrName || "") };
    return { kind, name: labels[promptLanguage(language)] || labels.zh };
  }

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

  function systemPromptPath(system, language = "") {
    const lang = promptLanguage(language);
    const systemFolder = lang === "en" ? "System Folder" : "系统文件夹";
    const promptFolder = lang === "en" ? "AI Prompts" : "AI 提示词";
    return `${systemFolder}/${promptFolder}/${system.category}/${promptDisplayName(system, lang)}`;
  }

  function promptDocument(recordOrId, language = "") {
    const system = typeof recordOrId === "string" ? systemPrompt(recordOrId) : recordOrId;
    if (!system) return null;
    const lang = promptLanguage(language);
    const body = String(system.bodies?.[lang] || "").trim();
    if (!body) return null;
    return Object.freeze({
      id: `system-prompt:${system.id}:${lang}`,
      promptId: system.id,
      type: "text",
      artifactKind: "ai-prompt-system",
      name: promptDisplayName(system, lang),
      path: systemPromptPath(system, lang),
      body,
      hash: system.hash,
      category: system.category,
      editable: system.editable,
      language: lang,
      readOnly: true,
      source: "system",
    });
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
    const lang = promptLanguage(language);
    const path = systemPromptPath(system, lang);
    // System-boundary records are auditable system files, never project policy.
    if (system.editable !== "project") {
      const body = system.bodies?.[lang];
      return body ? { status: "ready", source: "system-forced", path, body, hash: system.hash, language: lang } : { status: "missing", source: null, path, body: "", hash: "", language: lang };
    }
    const disabled = projectId && projectPromptFile(projectId, id, disabledKind);
    if (disabled) {
      const folder = promptFolderDescriptor("disabled-prompts", lang);
      return { status: "disabled", source: null, path: disabled.path || `ClioTalk/${folder.name}/${promptDisplayName(system, lang)}`, body: "", hash: disabled.hash || "", language: lang };
    }
    const override = projectId && projectPromptFile(projectId, id, overrideKind);
    if (override) {
      const body = String(override.body || "").trim();
      const folder = promptFolderDescriptor("prompt-overrides", lang);
      if (!body) return { status: "missing", source: null, path: override.path || `ClioTalk/${folder.name}/${promptDisplayName(system, lang)}`, body: "", hash: "", language: lang };
      return { status: "ready", source: "project", path: override.path || `ClioTalk/${folder.name}/${promptDisplayName(system, lang)}`, body, hash: hashPromptBody(body), language: lang };
    }
    const body = system.bodies?.[lang];
    if (!body) return { status: "missing", source: null, path, body: "", hash: "", language: lang };
    return { status: "ready", source: "system", path, body, hash: system.hash, language: lang };
  }

  // Skill routing. Only these six surfaces offer a skill; every other caller of
  // resolvePromptFile() keeps the behavior it has, because routing adds no
  // second resolution path — each step below calls resolvePromptFile().
  const routableStops = Object.freeze(["questionSheet", "outline", "sectionDrafts", "teachText", "reviewDesk", "cliotalk"]);

  function promptDescription(record, language = "") {
    return String(record?.descriptions?.[promptLanguage(language)] || "").trim();
  }

  function skillParts(skillId, language = "") {
    return (window.AISystem6PromptFiles || [])
      .filter((record) => record.partOf === skillId)
      .map((record) => Object.freeze({ id: record.id, name: promptDisplayName(record, language) }));
  }

  // Progressive disclosure, in three steps. The choices carry the descriptions
  // and no body, so an unchosen skill costs one line. The body arrives on the
  // choice. A reference part arrives only when that part is used. A project that
  // disabled or replaced a skill gets its own answer at every step, because the
  // precedence lives in resolvePromptFile() and nowhere else.
  function routeSkillsForTask(stop = "", projectId = null, language = "zh") {
    const lang = promptLanguage(language);
    const surface = routableStops.includes(String(stop)) ? String(stop) : "";
    const choices = (surface ? (window.AISystem6PromptFiles || []) : [])
      .filter((record) => !record.partOf && promptDescription(record, lang))
      .map((record) => ({ record, resolved: resolvePromptFile(record.id, projectId, lang) }))
      .filter((entry) => entry.resolved.status === "ready")
      .map(({ record, resolved }) => Object.freeze({
        id: record.id,
        name: promptDisplayName(record, lang),
        description: promptDescription(record, lang),
        source: resolved.source,
      }));
    return Object.freeze({
      surface,
      language: lang,
      choices: Object.freeze(choices),
      // What the descriptions cost the context, so the saving is measurable.
      contextChars: choices.reduce((total, choice) => total + choice.name.length + choice.description.length, 0),
      openSkill(id) {
        if (!choices.some((choice) => choice.id === id)) return null;
        const resolved = resolvePromptFile(id, projectId, lang);
        if (resolved.status !== "ready") return null;
        return Object.freeze({ ...resolved, id, parts: Object.freeze(skillParts(id, lang)) });
      },
      openPart(skillId, partId) {
        if (!choices.some((choice) => choice.id === skillId)) return null;
        if (!skillParts(skillId, lang).some((part) => part.id === partId)) return null;
        const resolved = resolvePromptFile(partId, projectId, lang);
        return resolved.status === "ready" ? Object.freeze({ ...resolved, id: partId }) : null;
      },
    });
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
    const lang = promptLanguage();
    const folder = ensureProjectPromptFolder(projectId, "prompt-overrides", lang);
    const name = promptDisplayName(system, lang);
    const record = existing || { id: crypto.randomUUID(), projectId, folderId: folder?.id || null, type: "text", artifactKind: overrideKind, promptId: id, createdAt: new Date().toISOString() };
    Object.assign(record, { name, path: `ClioTalk/${folder?.name || promptFolderDescriptor("prompt-overrides", lang).name}/${name}`, body: clean, hash: hashPromptBody(clean), promptLanguage: lang, updatedAt: new Date().toISOString() });
    if (!existing) chatFiles.unshift(record);
    return record;
  }

  function ensureProjectPromptOverrideForEditing(projectId, id = defaultPromptId, language = "") {
    const existing = projectPromptFile(projectId, id, overrideKind);
    if (existing) return existing;
    const system = systemPrompt(id);
    const lang = promptLanguage(language);
    const body = system?.bodies?.[lang];
    if (!body || system.editable !== "project" || !projectId || typeof chatFiles === "undefined") return null;
    const folder = ensureProjectPromptFolder(projectId, "prompt-overrides", lang);
    const name = promptDisplayName(system, lang);
    const now = new Date().toISOString();
    const record = {
      id: crypto.randomUUID(), projectId, folderId: folder?.id || null, type: "text",
      artifactKind: overrideKind, promptId: id, name, path: `ClioTalk/${folder?.name || promptFolderDescriptor("prompt-overrides", lang).name}/${name}`,
      body, hash: hashPromptBody(body), promptLanguage: lang, createdAt: now, updatedAt: now,
    };
    chatFiles.unshift(record);
    return record;
  }

  function ensureProjectPromptFolder(projectId, kindOrName, language = "") {
    if (!projectId || typeof chatFolders === "undefined") return null;
    const descriptor = promptFolderDescriptor(kindOrName, language);
    const promptFolderKind = descriptor.kind;
    const legacyNames = promptFolderLabels[promptFolderKind] ? Object.values(promptFolderLabels[promptFolderKind]) : [descriptor.name];
    let folder = chatFolders.find((item) => item.projectId === projectId && (item.promptFolderKind === promptFolderKind || legacyNames.includes(item.name)));
    if (!folder) {
      const now = new Date().toISOString();
      folder = { id: crypto.randomUUID(), projectId, name: descriptor.name, promptFolderKind, parentId: null, createdAt: now, updatedAt: now };
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
    const lang = promptLanguage();
    const folder = ensureProjectPromptFolder(projectId, "disabled-prompts", lang);
    const name = promptDisplayName(system, lang);
    const record = { id: crypto.randomUUID(), projectId, folderId: folder?.id || null, type: "text", artifactKind: disabledKind, promptId: id, name, path: `ClioTalk/${folder?.name || promptFolderDescriptor("disabled-prompts", lang).name}/${name}`, body: "", hash: "disabled", promptLanguage: lang, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
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
    const lang = promptLanguage(resolved.language);
    const folder = ensureProjectPromptFolder(projectId, "run-records", lang);
    const system = systemPrompt(id);
    const feature = promptDisplayName(system || id, lang);
    const sourceLabels = lang === "en"
      ? { system: "System", "system-forced": "Required system", project: "Project override" }
      : { system: "系统", "system-forced": "系统强制", project: "项目覆盖" };
    const receipt = { time: now, feature, path: resolved.path, source: resolved.source, hash: resolved.hash, language: lang };
    const stamp = new Date(now).toLocaleString(lang === "en" ? "en-US" : "zh-CN");
    const body = lang === "en"
      ? [`Time: ${receipt.time}`, `Feature: ${receipt.feature}`, `Effective prompt: ${receipt.path}`, `Source: ${sourceLabels[receipt.source] || receipt.source}`, `Hash: ${receipt.hash}`]
      : [`时间：${receipt.time}`, `功能：${receipt.feature}`, `实际提示词：${receipt.path}`, `来源：${sourceLabels[receipt.source] || receipt.source}`, `Hash：${receipt.hash}`];
    const suffix = lang === "en" ? "Prompt Run" : "运行记录";
    const record = { id: crypto.randomUUID(), projectId, folderId: folder?.id || null, type: "text", artifactKind: receiptKind, promptId: id, name: `${receipt.feature} ${suffix} ${stamp}`, path: `ClioTalk/${folder?.name || promptFolderDescriptor("run-records", lang).name}`, body: body.join("\n"), receipt, createdAt: now, updatedAt: now };
    chatFiles.unshift(record);
    return record;
  }

  return Object.freeze({ resolvePromptFile, routeSkillsForTask, upsertProjectPromptOverride, ensureProjectPromptOverrideForEditing, setProjectPromptDisabled, recordPromptRun, ensureProjectPromptFolder, hashPromptBody, promptDisplayName, promptDocument });
})();
