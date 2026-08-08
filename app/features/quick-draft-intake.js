// 钟点稿 / Quick Draft — material intake.
//
// Everything that brings material in and organizes it: pasted sources, vent /
// treehole entries, chat screenshots and recordings, File Floppy mounting,
// strategy signals, the source map, and the read-only material summary shown
// beside the editor. Pure text helpers stay data-only; the rendering helpers
// only write to the Quick Draft window's own DOM.

function intakeSnapshot(record = activeProjectQuickDraft({ create: false })?.record) {
  return normalizeQuickDraftWorkspace(record?.workspace, record).intake;
}

function strategySnapshot(record = activeProjectQuickDraft({ create: false })?.record) {
  return normalizeQuickDraftWorkspace(record?.workspace, record).strategy;
}

function humanAnchorSnapshot(record = activeProjectQuickDraft({ create: false })?.record) {
  const workspace = normalizeQuickDraftWorkspace(record?.workspace, record);
  return workspace.composition?.negative || workspace.versions?.[0]?.body || "";
}

function textExcerpt(text = "", limit = 240) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  return value.length > limit ? `${value.slice(0, limit)}...` : value;
}

function dumpEntries(intake = intakeSnapshot()) {
  return [];
}

function nonDumpVentEntries(intake = intakeSnapshot()) {
  return (intake.ventLog || []).filter((entry) => entry.sourceKind !== "quick-draft-dump");
}

function listSlot(el, items, emptyText, renderItem) {
  if (!el) return;
  el.replaceChildren();
  if (!items.length) {
    el.textContent = emptyText;
    el.classList.add("is-empty");
    return;
  }
  el.classList.remove("is-empty");
  const list = document.createElement("ul");
  items.forEach((item, index) => {
    const li = document.createElement("li");
    li.textContent = renderItem(item, index);
    list.append(li);
  });
  el.append(list);
}

function renderStanceCandidates(items = []) {
  if (!refs.stanceCandidates) return;
  refs.stanceCandidates.replaceChildren();
  if (!items.length) {
    refs.stanceCandidates.textContent = t("quick_draft_stance_empty");
    refs.stanceCandidates.classList.add("is-empty");
    return;
  }
  refs.stanceCandidates.classList.remove("is-empty");
  const label = document.createElement("strong");
  label.className = "quick-draft-result-label";
  label.textContent = t("quick_draft_talk_points");
  const row = document.createElement("div");
  row.className = "quick-draft-chip-row";
  items.forEach((item, index) => {
    const button = document.createElement("button");
    button.className = "btn mini-btn quick-draft-suggestion-chip";
    button.type = "button";
    button.dataset.quickDraftStanceIndex = String(index);
    button.textContent = textExcerpt(item, 42);
    row.append(button);
  });
  refs.stanceCandidates.append(label);
  refs.stanceCandidates.append(row);
}

function renderIntake(record = activeProjectQuickDraft({ create: false })?.record || blankQuickDraft()) {
  const intake = normalizeQuickDraftRecord(record).workspace.intake;
  const dumps = normalizeQuickDraftRecord(record).workspace.versions || [];
  listSlot(
    refs.ventLog,
    nonDumpVentEntries(intake),
    t("quick_draft_vent_empty"),
    (entry) => textExcerpt(entry.text)
  );
  listSlot(
    refs.dump,
    dumps,
    t("quick_draft_dump_empty"),
    (entry) => textExcerpt(entry.body, 320)
  );
  if (refs.restoreDumpButton) refs.restoreDumpButton.disabled = !dumps.length;
  listSlot(
    refs.chatMaterials,
    intake.chatMaterials,
    t("quick_draft_chat_empty"),
    (entry) => `${entry.name} · ${entry.platform}: ${textExcerpt(entry.text)}`
  );
  renderStanceCandidates(intake.stanceCandidates);
  const hasStanceCandidate = intake.stanceCandidates.some((item) => String(item || "").trim());
  if (refs.stanceCandidates) refs.stanceCandidates.hidden = !hasStanceCandidate;
  if (refs.adoptImpressionButton) {
    refs.adoptImpressionButton.hidden = !hasStanceCandidate;
    refs.adoptImpressionButton.disabled = !hasStanceCandidate;
  }
  markdownSlot(refs.outlineSeed, intake.outlineSeed || "");
}

function hasStrategyReport(record = normalizeQuickDraftRecord()) {
  return hasStrategyReportValue(normalizeQuickDraftRecord(record).workspace.strategy);
}

function hasStrategyReportValue(strategyReport = {}) {
  return Boolean(
    String(strategyReport.editorial || "").trim()
    || String(strategyReport.materialLedger || "").trim()
    || String(strategyReport.adoptionTable || "").trim()
  );
}

function renderStrategyReport(record = activeProjectQuickDraft({ create: false })?.record || blankQuickDraft()) {
  const strategy = normalizeQuickDraftRecord(record).workspace.strategy;
  markdownSlot(refs.editorialStrategy, strategy.editorial || "");
  markdownSlot(refs.materialLedger, strategy.materialLedger || "");
  markdownSlot(refs.adoptionTable, strategy.adoptionTable || "");
}

function setPostDraftChipsVisible(visible) {
  document.querySelectorAll("[data-quick-draft-after-draft]").forEach((button) => {
    button.hidden = !visible;
  });
}

function renderClassifySummaries(record = activeProjectQuickDraft({ create: false })?.record || blankQuickDraft()) {
  const setup = normalizeQuickDraftRecord(record).workspace.intake.setup;
  markdownSlot(refs.officialSummary, setup.officialMaterials || "");
  markdownSlot(refs.unavailableSummary, setup.unavailableNotes || "");
  markdownSlot(refs.audienceSummary, setup.audienceConcerns || "");
}

function inlineStatusText(text = "", max = 48) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  return value.length > max ? `${value.slice(0, max - 1)}...` : value;
}

function renderDecisionStatuses(record = activeProjectQuickDraft({ create: false })?.record || blankQuickDraft()) {
  const workspace = normalizeQuickDraftRecord(record).workspace;
  const setup = workspace.intake.setup;
  const firstImpression = inlineStatusText(setup.firstImpression);
  if (refs.firstImpressionStatus) {
    refs.firstImpressionStatus.textContent = firstImpression
      ? t("quick_draft_first_impression_set", firstImpression)
      : t("quick_draft_first_impression_unset");
    refs.firstImpressionStatus.classList.toggle("is-missing", !firstImpression);
  }
  const handsOnNotes = inlineStatusText(setup.handsOnNotes);
  if (refs.handsOnStatus) {
    refs.handsOnStatus.textContent = handsOnNotes
      ? t("quick_draft_hands_on_set", handsOnNotes)
      : t("quick_draft_hands_on_unset");
    refs.handsOnStatus.classList.toggle("is-missing", !handsOnNotes);
  }
  const hasHandsOnChoice = Boolean(
    handsOnNotes
    || String(workspace.intake.annotations?.firsthand || "").trim()
    || isHandsOnReviewFormat(setup.scenario)
  );
  if (refs.handsOnCard) {
    refs.handsOnCard.hidden = false;
    refs.handsOnCard.classList.toggle("has-hands-on-choice", hasHandsOnChoice);
  }
}

function appendUniqueMarkdownLine(text = "", line = "") {
  const value = String(text || "").trim();
  const next = String(line || "").trim();
  if (!next) return value;
  const lines = value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  if (lines.includes(next)) return value;
  return [...lines, next].join("\n").trim();
}

function appendAdoptionRow(table = "", row = []) {
  const cells = row.map((cell) => String(cell || "").replace(/\|/g, "/").trim());
  if (!cells.some(Boolean)) return String(table || "").trim();
  const next = `| ${cells.join(" | ")} |`;
  const value = String(table || "").trim();
  const base = value || "| 策略/素材 | 稿子处理 | 状态 |\n|---|---|---|";
  if (base.split(/\r?\n/).map((line) => line.trim()).includes(next)) return base;
  return `${base}\n${next}`;
}

function inferStrategySignals(text = "") {
  const value = String(text || "").trim();
  if (!value) return { editorial: [], materialLedger: [], adoptionRows: [] };
  const excerpt = textExcerpt(value, 180);
  const signals = { editorial: [], materialLedger: [], adoptionRows: [] };
  const addEditorial = (label, detail = excerpt) => signals.editorial.push(`- ${label}：${detail}`);
  const addMaterial = (label, status = "聊天/ClioTalk 捕捉") => signals.materialLedger.push(`- ${label}：[聊天建议] [待确认] ${status}；原话：${excerpt}`);
  const addRow = (item, handling, status = "待检查") => signals.adoptionRows.push([item, handling, status]);

  const deadline = value.match(/(?:deadline|ddl|截稿|截止|交稿|出来|发出|发布)?\s*(\d{1,2})\s*(?:点|:|：)(?:\d{1,2})?/i);
  if (deadline && /(deadline|ddl|截稿|截止|交稿|出来|发出|发布|\d{1,2}\s*(?:点|:|：))/i.test(value)) {
    addEditorial("deadline/时间压力", deadline[0].trim());
  }
  if (/(先别|别|不要|不讲|少讲|降权|一笔带过).*(AI|Siri|人工智能)|(?:AI|Siri|人工智能).*(先别|别|不要|不讲|少讲|降权|一笔带过)/i.test(value)) {
    addEditorial("降权", "AI/Siri 先降权，不作为主线");
    addRow("AI/Siri 降权", "只一笔带过或放入不好展示/待核边界", "待检查");
  }
  if (/(iOS|iPadOS|macOS).*(一起|三件套|一起讲)|三件套/i.test(value)) {
    addEditorial("主线", "iOS / iPadOS / macOS 作为三件套一起讲");
    addRow("三系统一起讲", "用“三件套升级”串联结构", "待检查");
  }
  if (/(设计|视觉|美学).*(不敢|不好乱|别乱|说不准|不下结论)/.test(value)) {
    addEditorial("作者边界", "设计类只说可观察变化，不下大结论");
    addRow("设计类不好乱说", "改成可观察变化和画面描述", "待检查");
  }
  if (/(自己表述|我自己说|自己的语言|别替我|不要替我|Aaron.*语言|落落.*语言)/i.test(value)) {
    addEditorial("作者边界", "最终用 Aaron/落落自己的语言，ClioTalk 只做编辑建议");
    addRow("作者自己的语言", "只建议改法，不默认替换正文", "待检查");
  }
  if (/(官方|发布会|官网|资料)/.test(value)) addMaterial("官方资料", "适合放入快速扫功能段，不能替代亲测");
  if (/(亲测|我试了|我看到了|实测|上手)/.test(value)) addMaterial("亲测体验", "优先进入可拍展示段");
  if (/(能拍|录屏|画面|展示|演示)/.test(value)) addMaterial("可拍画面", "优先映射成口播镜头");
  if (/(没测|未测|不能测|不好展示|不能展示|待核|不确定)/.test(value)) {
    addMaterial("未测/不好展示", "标边界、降权或删除");
    addRow("未测功能", "标边界或删除，不能写成亲测结论", "待处理");
  }
  if (/(Liquid Glass|液态玻璃|玻璃)/i.test(value)) {
    addMaterial("Liquid Glass", "可拍，适合开头或第一段画面");
    addRow("Liquid Glass", "翻成开头可拍画面", "待检查");
  }
  if (/(iPhone Mirroring|镜像)/i.test(value)) {
    addMaterial("iPhone Mirroring", "能演示时适合中段");
    addRow("iPhone Mirroring", "放在中段演示，不能演示则标边界", "待检查");
  }
  if (/(Apple Music|音乐)/i.test(value)) {
    addMaterial("Apple Music", "一句带过，避免展开太多");
    addRow("Apple Music", "一句带过", "待检查");
  }
  if (/(Apple Pay|支付)/i.test(value)) {
    addMaterial("Apple Pay", "能录就放，不能录就删");
    addRow("Apple Pay", "能录才进稿，否则删除或标边界", "待检查");
  }
  return signals;
}

function mergeStrategySignals(strategyReport = {}, signals = {}) {
  const next = normalizeStrategy(strategyReport);
  (signals.editorial || []).forEach((line) => {
    next.editorial = appendUniqueMarkdownLine(next.editorial, line);
  });
  (signals.materialLedger || []).forEach((line) => {
    next.materialLedger = appendUniqueMarkdownLine(next.materialLedger, line);
  });
  (signals.adoptionRows || []).forEach((row) => {
    next.adoptionTable = appendAdoptionRow(next.adoptionTable, row);
  });
  return next;
}

function hasStrategySignals(signals = {}) {
  return Boolean(
    signals.editorial?.length
    || signals.materialLedger?.length
    || signals.adoptionRows?.length
  );
}

function mountedSourceRecords() {
  if (!mountedTextDisk || mountedTextDisk.projectId !== activeProjectId) return [];
  return mountedTextDisk.files
    .map((name, index) => {
      const text = String(mountedTextDisk.fileBodies[name] || "").trim();
      if (!text) return null;
      return {
        id: `M${index + 1}`,
        label: name,
        text: text.length > 12000 ? `${text.slice(0, 12000)}\n\n[...]` : text,
      };
    })
    .filter(Boolean);
}

function intakeSourceRecords() {
  const intake = intakeSnapshot();
  const records = [];
  const ventEntries = nonDumpVentEntries(intake);
  if (ventEntries.length) {
    records.push({
      id: "V1",
      label: t("quick_draft_vent_source_label"),
      text: ventEntries
        .map((entry, index) => `${index + 1}. ${entry.text}`)
        .join("\n")
        .slice(0, 12000),
    });
  }
  intake.chatMaterials.forEach((item, index) => {
    records.push({
      id: `C${index + 1}`,
      label: `${t("quick_draft_chat_source_label")} / ${item.name}`,
      text: String(item.text || "").slice(0, 12000),
      sourceKind: item.sourceKind,
      platform: item.platform,
    });
  });
  if (intake.outlineSeed.trim()) {
    records.push({
      id: "G1",
      label: t("quick_draft_outline_seed"),
      text: intake.outlineSeed.slice(0, 12000),
    });
  }
  return records;
}

function sourceRecordsFromForm() {
  const sources = [];
  if (isLaunchDayFormat()) {
    const firstDay = firstDaySnapshot();
    const pasted = String(refs.sources?.value || "").trim();
    if (pasted) {
      sources.push({
        id: "P1",
        label: currentLanguage === "zh" ? "素材" : "Material",
        text: pasted.length > 12000 ? `${pasted.slice(0, 12000)}\n\n[...]` : pasted,
      });
    }
    [
      { id: "H1", label: t("quick_draft_first_day_annotated_hands_on"), text: firstDay.handsOnNotes },
      { id: "A1", label: t("quick_draft_audience_concerns"), text: firstDay.audienceConcerns },
      { id: "O1", label: t("quick_draft_first_day_annotated_official"), text: firstDay.officialMaterials },
      { id: "N1", label: t("quick_draft_first_day_annotated_followup"), text: firstDay.unavailableNotes },
      { id: "I1", label: t("quick_draft_first_impression"), text: firstDay.firstImpression },
    ].forEach((source) => {
      const text = String(source.text || "").trim();
      if (text) sources.push({ ...source, text: text.length > 12000 ? `${text.slice(0, 12000)}\n\n[...]` : text });
    });
    sources.push(...intakeSourceRecords());
    sources.push(...mountedSourceRecords());
    return sources;
  }
  const pasted = String(refs.sources?.value || "").trim();
  if (pasted) {
    sources.push({
      id: "P1",
      label: currentLanguage === "zh" ? "粘贴资料" : "Pasted sources",
      text: pasted.length > 12000 ? `${pasted.slice(0, 12000)}\n\n[...]` : pasted,
    });
  }
  sources.push(...mountedSourceRecords());
  return sources;
}

function formatQuickDraftSourcesForMingming(sources = []) {
  return sources
    .map((source, index) => {
      const id = source.id || `S${index + 1}`;
      const label = source.label || id;
      const text = String(source.text || "").trim();
      return text ? `[${id}] ${label}\n${text}` : "";
    })
    .filter(Boolean)
    .join("\n\n");
}

function updateSourceCount() {
  const count = sourceRecordsFromForm().length;
  const label = t("quick_draft_source_count", count);
  if (refs.sourceCount) refs.sourceCount.textContent = label;
  if (refs.sourceSummary) refs.sourceSummary.textContent = label;
}

// The shelf holds material as objects, one row each: what it is called, how
// big it is, and whether the body actually cites it. "Cited" is only claimed
// when the body carries the source tag the draft route asks the model to use;
// absence is silence, never a "not cited" verdict.
function materialRowMeta(item, body = "") {
  const size = String(item.text || "").trim().length;
  const parts = [];
  if (size) parts.push(t("quick_draft_material_size", size.toLocaleString()));
  const tag = String(item.id || "").trim();
  if (tag && body.includes(`[${tag}]`)) parts.push(t("quick_draft_material_cited"));
  return parts.join(" · ");
}

function renderSourceMap(record = normalizeQuickDraftRecord(), sources = sourceRecordsFromForm()) {
  if (!refs.sourceMap) return;
  refs.sourceMap.replaceChildren();
  const byId = new Map(sources.map((source) => [String(source.id || ""), source]));
  const map = Array.isArray(record.sourceMap) && record.sourceMap.length
    ? record.sourceMap.map((item) => ({ ...byId.get(String(item.id || "")), ...item }))
    : sources;
  const body = String(refs.draft?.value || record.workspace?.body || "");

  if (refs.shelfTitle) {
    refs.shelfTitle.textContent = map.length
      ? t("quick_draft_materials_count", map.length)
      : t("quick_draft_materials_label");
  }

  if (!map.length) {
    const empty = document.createElement("p");
    empty.className = "quick-draft-source-empty";
    empty.textContent = t("quick_draft_material_empty");
    refs.sourceMap.append(empty);
    return;
  }

  map.forEach((item) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "btn quick-draft-material-row";
    row.dataset.sourceLabel = item.label || item.id || "";
    const name = document.createElement("b");
    name.textContent = item.label || item.id || "S";
    row.append(name);
    const meta = materialRowMeta(item, body);
    if (meta) {
      const small = document.createElement("small");
      small.textContent = meta;
      row.append(small);
    }
    refs.sourceMap.append(row);
  });

  const preview = document.createElement("pre");
  preview.className = "quick-draft-source-preview";
  preview.textContent = "";
  refs.sourceMap.append(preview);
}

function hasEvidence(record) {
  return Boolean(
    String(record.brief?.support || "").trim()
    || String(record.brief?.counter || "").trim()
    || String(record.brief?.uncertainty || "").trim()
    || String(record.risks || "").trim()
    || (Array.isArray(record.sourceMap) && record.sourceMap.length)
  );
}

function hasOrganizedCards(record = normalizeQuickDraftRecord()) {
  const source = normalizeQuickDraftRecord(record);
  const setup = source.workspace.intake.setup;
  const intake = source.workspace.intake;
  return Boolean(
    hasEvidence(source)
    || hasStrategyReport(source)
    || String(setup.officialMaterials || "").trim()
    || String(setup.unavailableNotes || "").trim()
    || String(setup.audienceConcerns || "").trim()
    || String(intake.outlineSeed || "").trim()
  );
}

function previewSource(label) {
  const preview = refs.sourceMap?.querySelector(".quick-draft-source-preview");
  if (!preview) return;
  const source = sourceRecordsFromForm().find((item) => item.label === label || item.id === label);
  preview.textContent = source ? `[${source.label}]\n${source.text.slice(0, 900)}` : "";
}

function useMountedSources() {
  const count = mountedSourceRecords().length;
  updateSourceCount();
  setQuickDraftStatus(t("quick_draft_mounted_added", count));
  saveQuickDraft({}, { debounce: false });
}

function stableId(prefix = "item") {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function inferChatPlatform(name = "", text = "") {
  const value = `${name}\n${text}`.toLowerCase();
  if (/telegram|tg\b/.test(value)) return "Telegram";
  if (/imessage|messages|facetime/.test(value)) return "iMessage";
  if (/wechat|微信|朋友圈/.test(value)) return "WeChat";
  if (/\bqq\b|腾讯qq|群聊/.test(value)) return "QQ";
  return "generic-chat";
}

function cleanChatScreenshotText(text = "") {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => {
      if (!line) return false;
      if (/^(发送|send|message|type a message|输入消息)$/i.test(line)) return false;
      if (/^\d{1,2}:\d{2}$/.test(line)) return false;
      return true;
    })
    .join("\n")
    .trim();
}

function chatTextFingerprint(text = "") {
  return cleanChatScreenshotText(text)
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function isChatRecordingFile(file) {
  const name = String(file?.name || "").toLowerCase();
  const type = String(file?.type || "").toLowerCase();
  return type.startsWith("video/") || /\.(mp4|m4v|mov|webm)$/i.test(name);
}

function seekVideo(video, time) {
  return new Promise((resolve, reject) => {
    const done = () => {
      cleanup();
      resolve();
    };
    const fail = () => {
      cleanup();
      reject(new Error("Could not seek this chat recording."));
    };
    const cleanup = () => {
      video.removeEventListener("seeked", done);
      video.removeEventListener("error", fail);
    };
    video.addEventListener("seeked", done, { once: true });
    video.addEventListener("error", fail, { once: true });
    video.currentTime = Math.max(0, time);
  });
}

function canvasToPngBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Could not render a chat recording frame."));
    }, "image/png");
  });
}

function frameTimeLabel(seconds = 0) {
  const value = Math.max(0, Math.round(Number(seconds) || 0));
  const minutes = Math.floor(value / 60);
  const rest = String(value % 60).padStart(2, "0");
  return `${minutes}m${rest}s`;
}

async function extractChatRecordingFrames(file) {
  if (typeof document === "undefined" || typeof URL === "undefined") {
    throw new Error("Chat recording frame extraction needs the browser runtime.");
  }
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "metadata";
  video.src = url;

  try {
    await new Promise((resolve, reject) => {
      video.addEventListener("loadedmetadata", resolve, { once: true });
      video.addEventListener("error", () => reject(new Error("Could not read this chat recording.")), { once: true });
    });
    const duration = Number.isFinite(video.duration) ? Math.max(0, video.duration) : 0;
    const width = Number(video.videoWidth || 0);
    const height = Number(video.videoHeight || 0);
    if (!duration || !width || !height) {
      throw new Error("This chat recording has no readable video track.");
    }

    const interval = duration > 120 ? 2 : 1.25;
    const maxFrames = 90;
    const times = [];
    for (let time = Math.min(0.4, duration); time < duration; time += interval) {
      times.push(Math.min(time, Math.max(0, duration - 0.1)));
      if (times.length >= maxFrames) break;
    }
    if (!times.length) times.push(0);

    const longEdge = Math.max(width, height);
    const scale = Math.min(1, 1600 / Math.max(longEdge, 1));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Could not prepare a canvas for chat recording frames.");

    const frames = [];
    for (const time of times) {
      await seekVideo(video, time);
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await canvasToPngBlob(canvas);
      const safeName = String(file.name || "chat-recording").replace(/\.[^.]+$/, "");
      frames.push(new File([blob], `${safeName}-${frameTimeLabel(time)}.png`, {
        type: "image/png",
        lastModified: file.lastModified || Date.now(),
      }));
    }
    return frames;
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

function chatMaterialBlock(item = {}) {
  const name = String(item.name || t("quick_draft_chat_source_label")).trim();
  const text = cleanChatScreenshotText(item.text || "");
  return text ? `【${t("quick_draft_chat_source_label")}：${name}】\n${text}` : "";
}

function appendBlocksToSources(blocks = []) {
  if (!refs.sources) return false;
  const existing = String(refs.sources.value || "").trim();
  const seen = new Set(
    existing
      .split(/\n{2,}/)
      .map(chatTextFingerprint)
      .filter(Boolean)
  );
  const nextBlocks = [];
  blocks.forEach((block) => {
    const text = String(block || "").trim();
    const fingerprint = chatTextFingerprint(text);
    if (!text || !fingerprint || seen.has(fingerprint)) return;
    seen.add(fingerprint);
    nextBlocks.push(text);
  });
  if (!nextBlocks.length) return false;
  refs.sources.value = [existing, ...nextBlocks].filter(Boolean).join("\n\n").trim();
  refs.sources.dispatchEvent(new Event("input", { bubbles: true }));
  refs.sources.scrollTop = refs.sources.scrollHeight;
  return true;
}

function appendChatMaterialsToSources(items = []) {
  return appendBlocksToSources(items.map(chatMaterialBlock));
}

function ventLogMaterialBlock(entries = []) {
  const lines = entries
    .map((entry) => String(entry?.text || "").trim())
    .filter(Boolean)
    .map((text) => `- ${text}`);
  if (!lines.length) return "";
  const stamp = new Date().toLocaleTimeString(currentLanguage === "zh" ? "zh-CN" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `【${t("quick_draft_vent_material_label")}：${stamp}】\n${lines.join("\n")}`;
}

function flushVentLogToSources(intake = intakeSnapshot()) {
  const entries = nonDumpVentEntries(intake);
  return entries.length ? appendBlocksToSources([ventLogMaterialBlock(entries)]) : false;
}

function captureVentText(text = "", options = {}) {
  collectRefs();
  const value = String(text || "").trim();
  if (!value) return false;
  const slot = activeProjectQuickDraft();
  if (!slot) {
    setQuickDraftStatus(t("quick_draft_no_project"));
    return false;
  }
  const intake = intakeSnapshot(slot.record);
  const entry = normalizeVentEntry({
    id: stableId("vent"),
    text: value,
    createdAt: new Date().toISOString(),
    sourceKind: options.sourceKind || "clioTalk-vent",
  }, intake.ventLog.length);
  const nextIntake = normalizeIntake({
    ...intake,
    ventLog: [...intake.ventLog, entry],
  });
  const signals = inferStrategySignals(value);
  const strategyCaptured = hasStrategySignals(signals);
  const workspacePatch = strategyCaptured
    ? { intake: nextIntake, strategy: mergeStrategySignals(strategySnapshot(slot.record), signals) }
    : { intake: nextIntake };
  const saved = saveQuickDraft({ workspace: workspacePatch }, { debounce: false });
  renderIntake(saved);
  renderStrategyReport(saved);
  updateSourceCount();
  const count = nonDumpVentEntries(nextIntake).length;
  setQuickDraftStatus(t(strategyCaptured ? "quick_draft_strategy_captured" : "quick_draft_vent_captured", count));
  return { captured: true, strategyCaptured, count };
}

function setVentMode(enabled = true, options = {}) {
  collectRefs();
  const slot = activeProjectQuickDraft();
  if (!slot) {
    setQuickDraftStatus(t("quick_draft_no_project"));
    return false;
  }
  if (refs.format && !isLaunchDayFormat(refs.format.value)) refs.format.value = FIRST_DAY_FORMAT;
  syncQuickDraftTemplateUi();
  const intake = intakeSnapshot(slot.record);
  const count = nonDumpVentEntries(intake).length;
  const shouldFlush = enabled !== true && options.flushToSources !== false;
  const transferred = shouldFlush ? flushVentLogToSources(intake) : false;
  const nextIntake = normalizeIntake({
    ...intake,
    ventMode: enabled === true,
    ventLog: enabled === true ? intake.ventLog : [],
  });
  const saved = saveQuickDraft({ workspace: { intake: nextIntake } }, { debounce: false });
  renderIntake(saved);
  updateSourceCount();
  setQuickDraftStatus(t(nextIntake.ventMode ? "quick_draft_vent_mode_on" : "quick_draft_vent_mode_off", count));
  return { active: nextIntake.ventMode, count, transferred };
}

function clearVentLog(options = {}) {
  collectRefs();
  const slot = activeProjectQuickDraft({ create: false });
  if (!slot?.record?.workspace?.intake) return { cleared: false, count: 0 };
  const intake = intakeSnapshot(slot.record);
  const count = nonDumpVentEntries(intake).length;
  const wasActive = intake.ventMode === true;
  if (!count && !wasActive) return { cleared: false, count: 0 };
  const nextIntake = normalizeIntake({
    ...intake,
    ventMode: false,
    ventLog: [],
  });
  const saved = saveQuickDraft({ workspace: { intake: nextIntake } }, { debounce: false });
  renderIntake(saved);
  updateSourceCount();
  if (!options.silent) setQuickDraftStatus(t("quick_draft_vent_cleared", count));
  return { cleared: true, count };
}

function ventEntryCount() {
  return nonDumpVentEntries(intakeSnapshot()).length;
}

function isVentIntakeActive() {
  const workspace = activeProjectQuickDraft({ create: false })?.record.workspace;
  return isLaunchDayFormat(workspace?.intake?.setup?.scenario) && workspace?.intake?.ventMode === true;
}

async function importChatScreenshots() {
  if (!getActiveProject()) {
    setQuickDraftStatus(t("quick_draft_no_project"));
    openWindow("projects");
    return false;
  }
  if (typeof openTransientFilePicker !== "function" || typeof extractFileText !== "function") {
    setQuickDraftStatus(t("quick_draft_chat_import_unavailable"));
    return false;
  }
  openTransientFilePicker({
    accept: ".bmp,.jpg,.jpeg,.png,.webp,.heic,.heif,.mp4,.m4v,.mov,.webm,image/*,video/mp4,video/*",
    multiple: true,
    async onSelect(files) {
      const selected = Array.from(files || []).filter(Boolean);
      if (!selected.length) return;
      setBusy(true);
      setQuickDraftStatus(t("quick_draft_chat_importing"));
      try {
        const imported = [];
        const slot = activeProjectQuickDraft();
        const intake = intakeSnapshot(slot?.record);
        const seen = new Set(
          intake.chatMaterials
            .map((item) => chatTextFingerprint(item.text))
            .filter(Boolean)
        );
        for (const file of selected) {
          const frameFiles = isChatRecordingFile(file)
            ? await extractChatRecordingFrames(file)
            : [file];
          for (const frame of frameFiles) {
            const extracted = await extractFileText(frame);
            const text = cleanChatScreenshotText(extracted.text || "");
            if (!text) continue;
            const fingerprint = chatTextFingerprint(text);
            if (!fingerprint || seen.has(fingerprint)) continue;
            seen.add(fingerprint);
            imported.push(normalizeChatMaterial({
              id: stableId("chat"),
              name: frame.name || file.name || `chat-${imported.length + 1}`,
              text,
              platform: inferChatPlatform(file.name, text),
              sourceKind: isChatRecordingFile(file) ? "chat-recording-frame" : "chat-screenshot",
              createdAt: new Date().toISOString(),
            }, imported.length));
          }
        }
        if (!imported.length) {
          setQuickDraftStatus(t("quick_draft_chat_import_empty"));
          return;
        }
        const nextIntake = normalizeIntake({
          ...intake,
          chatMaterials: [...intake.chatMaterials, ...imported],
        });
        appendChatMaterialsToSources(imported);
        const saved = saveQuickDraft({ workspace: { intake: nextIntake } }, { debounce: false });
        renderIntake(saved);
        updateSourceCount();
        setQuickDraftStatus(t("quick_draft_chat_imported", imported.length));
      } catch (error) {
        setQuickDraftStatus(t("quick_draft_failed", error?.message || String(error)));
      } finally {
        setBusy(false);
      }
    },
  });
  return true;
}

function firstStanceCandidate(index = -1) {
  const intake = intakeSnapshot();
  const candidates = intake.stanceCandidates.filter((item) => String(item || "").trim());
  const candidate = index >= 0 ? candidates[index] : candidates[0];
  return String(candidate || "")
    .replace(/^\s*[-*•\d.、]+\s*/, "")
    .trim();
}

function adoptFirstImpression(index = -1) {
  const candidate = firstStanceCandidate(Number(index));
  if (!candidate) {
    setQuickDraftStatus(t("quick_draft_no_stance_candidate"));
    return false;
  }
  refs.firstImpression.value = candidate;
  if (refs.format && !isLaunchDayFormat(refs.format.value)) refs.format.value = FIRST_DAY_FORMAT;
  syncQuickDraftTemplateUi();
  renderDecisionStatuses(saveQuickDraft({}, { debounce: false }));
  setQuickDraftStatus(t("quick_draft_adopted_impression"));
  return true;
}

function confirmHandsOnFromAnnotations() {
  const annotations = currentAnnotations();
  const candidate = String(annotations.firsthand || "").trim();
  if (!candidate) {
    setQuickDraftStatus(t("quick_draft_no_hands_on_candidate"));
    return false;
  }
  refs.handsOn.value = refs.handsOn.value
    ? `${refs.handsOn.value.trim()}\n${candidate}`.trim()
    : candidate;
  renderDecisionStatuses(saveQuickDraft({}, { debounce: false }));
  setQuickDraftStatus(t("quick_draft_hands_on_confirmed"));
  return true;
}

window.AISystem6QuickDraftIntake = Object.freeze({
  adoptFirstImpression,
  appendChatMaterialsToSources,
  captureVentText,
  clearVentLog,
  confirmHandsOnFromAnnotations,
  dumpEntries,
  flushVentLogToSources,
  formatQuickDraftSourcesForMingming,
  humanAnchorSnapshot,
  importChatScreenshots,
  intakeSnapshot,
  isVentIntakeActive,
  mountedSourceRecords,
  nonDumpVentEntries,
  renderClassifySummaries,
  renderDecisionStatuses,
  renderIntake,
  renderSourceMap,
  renderStanceCandidates,
  renderStrategyReport,
  setVentMode,
  sourceRecordsFromForm,
  strategySnapshot,
  updateSourceCount,
  useMountedSources,
  ventEntryCount,
});
