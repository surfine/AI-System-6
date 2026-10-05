// 兴趣｜内容｜并排 — a view of one Quick Draft inside 文字亮室.
//
// Interest is the writer's own body. Content is a full rewrite of that same
// body under a closed worldly standard, kept as a try-see until Develop.
// The header on Side by Side receives the piece. It does not explain the
// device, and the model never sees anything but this draft.

const TRAFFIC_STANDARDS = Object.freeze([
  "点赞",
  "评论",
  "转发",
  "收藏",
  "播放",
  "涨粉",
  "破圈",
  "三秒",
  "完播",
  "封标",
]);

const TRAFFIC_EMBRACE_BANNED = /流量|平台|右边|右栏|吃饭|商单|十年|你是一个|说明你|被人看见|为了让人/;

let quickDraftTrackMode = "interest";
let quickDraftTrackBusy = false;
let quickDraftTrafficReceiptId = "";
/** @type {Map<string, { sourceKey: string, title: string, cover: string, body: string, ledger: { before: string, after: string, standard: string }[] }>} */
const quickDraftTrafficMemory = new Map();

function trafficSourceKey(body = "") {
  const text = String(body || "").trim();
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) hash = (Math.imul(hash, 33) + text.charCodeAt(index)) >>> 0;
  return `${text.length}:${hash}`;
}

function trafficInterestBody() {
  if (typeof lightroomBodyText === "function") return lightroomBodyText();
  return String(refs.draft?.value || activeProjectQuickDraft({ create: false })?.record?.workspace?.body || "");
}

function trafficMemoryKey() {
  const slot = activeProjectQuickDraft({ create: false });
  const documentId = slot ? darkroomTargetDocumentId(slot.record, slot.project.id) : "";
  return `${slot?.project?.id || ""}:${documentId}`;
}

function readQuickDraftTraffic() {
  const key = trafficMemoryKey();
  if (key && quickDraftTrafficMemory.has(key)) return quickDraftTrafficMemory.get(key);
  const record = activeProjectQuickDraft({ create: false })?.record;
  const stored = record ? darkroomOf(record)?.traffic : null;
  if (stored && typeof stored === "object" && String(stored.body || "").trim()) return stored;
  return null;
}

function writeQuickDraftTraffic(traffic) {
  const key = trafficMemoryKey();
  if (key) quickDraftTrafficMemory.set(key, traffic);
  const slot = activeProjectQuickDraft({ create: false });
  const documentId = slot ? darkroomTargetDocumentId(slot.record, slot.project.id) : "";
  if (!slot || !documentId || !window.AISystem6DarkroomStore?.darkroomIsLoaded?.(slot.project.id, documentId)) return traffic;
  window.AISystem6DarkroomStore.setDarkroomRecord(slot.project.id, documentId, {
    ...darkroomOf(slot.record, slot.project.id),
    traffic,
  });
  window.AISystem6DarkroomStore.persistDarkroomRecord?.(slot.project.id, documentId).catch((error) => {
    console.warn("Could not keep the content track.", error);
  });
  return traffic;
}

function clearQuickDraftTraffic() {
  const key = trafficMemoryKey();
  if (key) quickDraftTrafficMemory.delete(key);
  const slot = activeProjectQuickDraft({ create: false });
  const documentId = slot ? darkroomTargetDocumentId(slot.record, slot.project.id) : "";
  if (!slot || !documentId || !window.AISystem6DarkroomStore?.darkroomIsLoaded?.(slot.project.id, documentId)) return;
  const current = { ...darkroomOf(slot.record, slot.project.id) };
  delete current.traffic;
  window.AISystem6DarkroomStore.setDarkroomRecord(slot.project.id, documentId, current);
  window.AISystem6DarkroomStore.persistDarkroomRecord?.(slot.project.id, documentId).catch(() => {});
}

function quickDraftTrackFitsSplit() {
  return window.innerWidth >= 840;
}

function quickDraftTrackOwnsPaper() {
  return quickDraftTrackMode === "content" || quickDraftTrackMode === "split";
}

function quickDraftTrackShouldDevelop() {
  if (typeof lightroomIsReadOnly === "function" && lightroomIsReadOnly()) return false;
  return quickDraftTrackOwnsPaper() && Boolean(String(readQuickDraftTraffic()?.body || "").trim());
}

function buildTrafficPrompt(body = "") {
  const zh = currentLanguage === "zh";
  const standards = TRAFFIC_STANDARDS.join("、");
  return zh
    ? [
        "把下面这一篇整篇重写一遍。只根据这一篇里已经写下的字，不使用任何别的材料。",
        "重写按这些世俗标准，可以同时用上多条：点赞（收成看完就能用）、评论（放一个争议或开放问题）、转发（磨成一句好转发的话）、收藏（收成框架或把结论留白）、播放（开头先打痛点或欲望）、涨粉（把答案留到下一次）、破圈（说得更门槛低）、三秒（开头三秒就留人）、完播（把会让人中途离开的长过程剪短）、封标（另给标题和一句封标）。",
        "可以改开头、顺序、把没说死的判断说死、把失败的长过程剪短、把一段推荐写进正文。这一篇里已经有的口气和口头禅可以留下。",
        "不准新增这一篇里没有的亲历、数字、场景和对白。不准解释作者是怎样的人。",
        "只输出一个 JSON 对象，不要 Markdown 围栏：",
        '{"title":"","cover":"","body":"","ledger":[{"before":"原句","after":"改后","standard":"播放"}]}',
        `standard 只能是：${standards}。`,
        "原稿：",
        String(body || "").trim(),
      ].join("\n\n")
    : [
        "Rewrite the whole piece below. Use only the words already in this piece.",
        "Apply these worldly standards, several at once: likes (make it immediately usable), comments (open a controversy), shares (one forwardable line), saves (a framework, or leave the conclusion open), views (open on a pain or a desire), follows (withhold the answer), breakout (lower the threshold), three-second hold, completion (shorten a long failure), cover (a new title and one cover line).",
        "You may change the opening and the order, close a hedge, shorten a long failure, and weave a recommendation into the body. Phrases already in the piece may stay.",
        "Do not add experiences, numbers, scenes, or dialogue that are not in the piece. Do not explain what kind of person the writer is.",
        "Return one JSON object and no Markdown fence:",
        '{"title":"","cover":"","body":"","ledger":[{"before":"","after":"","standard":"播放"}]}',
        `standard must be one of: ${standards}.`,
        "Source:",
        String(body || "").trim(),
      ].join("\n\n");
}

function parseTrafficAnswer(raw = "") {
  const text = String(raw || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let data;
  try {
    data = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  const body = String(data?.body || "").trim();
  if (!body) return null;
  const ledger = (Array.isArray(data?.ledger) ? data.ledger : [])
    .map((item) => ({
      before: String(item?.before || "").trim(),
      after: String(item?.after || "").trim(),
      standard: TRAFFIC_STANDARDS.includes(item?.standard) ? item.standard : "",
    }))
    .filter((item) => item.standard && (item.before || item.after))
    .slice(0, 12);
  return {
    title: String(data?.title || "").trim(),
    cover: String(data?.cover || "").trim(),
    body,
    ledger,
  };
}

function trafficQuote(body = "") {
  const lines = String(body || "")
    .split(/\n+/)
    .map((line) => line.replace(/^#+\s*/, "").trim())
    .filter((line) => line.length >= 8 && line.length <= 80);
  return lines[0] || "";
}

function trafficClip(text = "") {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  return value.length > 28 ? `${value.slice(0, 28)}…` : value;
}

function trafficEmbrace(body = "") {
  const quote = trafficQuote(body);
  if (!quote) return t("lightroom_track_embrace_empty");
  const quoted = currentLanguage === "zh" ? `「${quote}」` : `"${quote}"`;
  return `${quoted}\n${t("lightroom_track_embrace_after")}`;
}

function trafficEmbraceOk(text = "") {
  const value = String(text || "").trim();
  return Boolean(value) && !TRAFFIC_EMBRACE_BANNED.test(value);
}

function setTrackStatus(message) {
  if (typeof setQuickDraftStatus === "function") setQuickDraftStatus(message);
  const status = document.getElementById("lightroom-status");
  if (!status) return;
  if (message) {
    status.textContent = message;
    return;
  }
  status.textContent = typeof lightroomIsReadOnly === "function" && lightroomIsReadOnly()
    ? t("lightroom_read_only")
    : "";
}

function ensureTrackCopy() {
  const zh = {
    lightroom_track_group: "兴趣、内容、并排",
    lightroom_track_interest: "兴趣",
    lightroom_track_content: "内容",
    lightroom_track_split: "并排",
    balloon_lightroom_tracks: "兴趣是你写下的。内容是另一版。并排是两版都留着。",
    lightroom_track_need_interest: "先写下你想说的。",
    lightroom_track_embrace_after: "写下来，就很好。",
    lightroom_track_embrace_empty: "你写的，我接着看。",
    lightroom_track_writing: "正在写内容这一栏。",
    lightroom_track_empty: "内容这一栏还空着。",
    lightroom_track_failed: "这一栏没有写成。",
    lightroom_track_develop_confirm: "要把内容这一版写成正文吗？你现在的稿会先留一个版本。",
  };
  const en = {
    lightroom_track_group: "Interest, Content, Side by Side",
    lightroom_track_interest: "Interest",
    lightroom_track_content: "Content",
    lightroom_track_split: "Side by Side",
    balloon_lightroom_tracks: "Interest is what you wrote. Content is another version. Side by side keeps both.",
    lightroom_track_need_interest: "Write what you want to say first.",
    lightroom_track_embrace_after: "It is good that you wrote it down.",
    lightroom_track_embrace_empty: "I'm here with what you wrote.",
    lightroom_track_writing: "Writing the content column.",
    lightroom_track_empty: "The content column is still empty.",
    lightroom_track_failed: "That column did not get written.",
    lightroom_track_develop_confirm: "Write this content version into the draft? The current draft is kept as a version first.",
  };
  const fill = (bag, extra) => {
    const target = bag && typeof bag === "object" ? bag : {};
    for (const [key, value] of Object.entries(extra)) {
      if (target[key] == null) target[key] = value;
    }
    return target;
  };
  window.AISystem6TranslationsZh = fill(window.AISystem6TranslationsZh, zh);
  window.AISystem6TranslationsEn = fill(window.AISystem6TranslationsEn, en);
  const group = document.querySelector?.(".quick-draft-track-toggle");
  if (group) window.AISystem6TranslateWithin?.(group);
}

function showTrackOnOpenPaper() {
  if (quickDraftDisplayMode === "listen") window.AISystem6QuickDraftListen?.stop?.();
  quickDraftDisplayMode = "read";
  const container = typeof quickDraftPreviewHost === "function" ? quickDraftPreviewHost() : null;
  container?.classList.add("is-previewing");
  container?.classList.remove("is-graining", "is-listening");
  refs.preview?.classList.remove("is-hidden", "quick-draft-grain-pane", "draft-desk-listen-pane");
  if (typeof syncQuickDraftEli5Ui === "function") syncQuickDraftEli5Ui();
  if (typeof syncQuickDraftPreviewButtons === "function") syncQuickDraftPreviewButtons(true);
}

function syncQuickDraftTrackChrome(record = activeProjectQuickDraft({ create: false })?.record) {
  if (typeof syncQuickDraftMobileAdjustmentActions === "function") {
    syncQuickDraftMobileAdjustmentActions(record);
  } else if (typeof updateQuickDraftShellState === "function") {
    updateQuickDraftShellState(record);
  }
}

function syncQuickDraftTrackToggle() {
  ensureTrackCopy();
  const splitOk = quickDraftTrackFitsSplit();
  if (quickDraftTrackMode === "split" && !splitOk) quickDraftTrackMode = "interest";
  document.querySelectorAll("[data-quick-draft-track]").forEach((button) => {
    const mode = button.getAttribute("data-quick-draft-track") || "";
    const on = mode === quickDraftTrackMode;
    button.hidden = mode === "split" && !splitOk;
    button.setAttribute("aria-pressed", on ? "true" : "false");
  });
  syncQuickDraftTrackChrome();
}

function renderQuickDraftTrackPaper() {
  if (!refs.preview) return;
  const interest = trafficInterestBody().trim();
  const traffic = readQuickDraftTraffic();
  const fresh = traffic && traffic.sourceKey === trafficSourceKey(interest);
  const content = fresh ? traffic : null;
  const embrace = quickDraftTrackMode === "split"
    ? `<p class="quick-draft-track-embrace">${escapeHtml(trafficEmbrace(interest)).replaceAll("\n", "<br>")}</p>`
    : "";
  const interestHtml = interest
    ? quickDraftMarkdownHtml(interest)
    : `<p class="empty-folder-note">${escapeHtml(t("lightroom_track_need_interest"))}</p>`;
  const contentHtml = !interest
    ? `<p class="empty-folder-note">${escapeHtml(t("lightroom_track_need_interest"))}</p>`
    : content
      ? [
          content.title ? `<p class="quick-draft-track-title">${escapeHtml(content.title)}</p>` : "",
          content.cover ? `<p class="quick-draft-track-cover">${escapeHtml(content.cover)}</p>` : "",
          quickDraftMarkdownHtml(content.body),
          content.ledger.length
            ? `<ul class="quick-draft-track-ledger">${content.ledger.map((item) => `<li>${escapeHtml(item.standard)}　${escapeHtml(trafficClip(item.before))} → ${escapeHtml(trafficClip(item.after))}</li>`).join("")}</ul>`
            : "",
        ].join("")
      : `<p class="empty-folder-note">${escapeHtml(quickDraftTrackBusy ? t("lightroom_track_writing") : t("lightroom_track_empty"))}</p>`;
  if (quickDraftTrackMode === "split") {
    refs.preview.innerHTML = `${embrace}<div class="quick-draft-track-split"><div>${interestHtml}</div><div>${contentHtml}</div></div>`;
    return;
  }
  refs.preview.innerHTML = contentHtml;
}

function resetQuickDraftTrack() {
  quickDraftTrackMode = "interest";
  syncQuickDraftTrackToggle();
}

async function generateQuickDraftTraffic({ force = false } = {}) {
  const body = trafficInterestBody().trim();
  if (!body) {
    setTrackStatus(t("lightroom_track_need_interest"));
    renderQuickDraftTrackPaper();
    return false;
  }
  if (!quickDraftModelAvailable()) {
    setTrackStatus(t("quick_draft_connect_ai"));
    return false;
  }
  const existing = readQuickDraftTraffic();
  if (!force && existing && existing.sourceKey === trafficSourceKey(body) && !quickDraftTrackBusy) {
    renderQuickDraftTrackPaper();
    return true;
  }
  const requestGuard = beginQuickDraftRequest();
  quickDraftTrackBusy = true;
  setBusy(true);
  setTrackStatus(t("lightroom_track_writing"));
  renderQuickDraftTrackPaper();
  try {
    const response = await fetchModelPayload({
      model: typeof getLocalModelRequestName === "function" ? getLocalModelRequestName() : (modelInput?.value?.trim() || ""),
      messages: withMarkdownModelMessages([{ role: "user", content: buildTrafficPrompt(body) }]),
      temperature: 0.4,
      max_tokens: 5200,
      ai_system6_task_kind: "traffic_rewrite",
      stream: false,
    }, requestGuard.signal);
    if (!response.ok) throw new Error(serviceErrorDetail(response.status, await response.text()));
    const result = await response.json().catch(() => ({}));
    const raw = String(result?.choices?.[0]?.message?.content || "");
    const recorded = await window.AISystem6RunReceipts?.recordModelAnswer?.({
      projectId: activeProjectQuickDraft({ create: false })?.project?.id || "",
      sourceAppId: "quickDraft",
      intent: "traffic-rewrite",
      provider: (typeof cloudConfig !== "undefined" && cloudConfig?.active && cloudCredentialReady()) ? "cloud" : "local",
      model: window.AISystem6RunReceipts?.servedModelFromResponse?.(result) || "",
      answerText: raw,
    });
    quickDraftTrafficReceiptId = recorded?.receiptId || "";
    const parsed = parseTrafficAnswer(raw);
    if (!parsed) {
      setTrackStatus(t("lightroom_track_failed"));
      return false;
    }
    writeQuickDraftTraffic({ ...parsed, sourceKey: trafficSourceKey(body) });
    setTrackStatus("");
    return true;
  } catch (error) {
    if (error?.name === "AbortError") return false;
    setTrackStatus(quickDraftFailureMessage(error));
    return false;
  } finally {
    quickDraftTrackBusy = false;
    settleQuickDraftRequest(requestGuard);
    setBusy(false);
    if (quickDraftTrackOwnsPaper()) renderQuickDraftTrackPaper();
    syncQuickDraftTrackChrome();
  }
}

async function setQuickDraftTrack(mode = "interest") {
  const next = mode === "content" || mode === "split" ? mode : "interest";
  // Narrow desks hide 并排. Asking for it there lands on 内容, not a third
  // invisible segment; shrinking while already in 并排 falls back to 兴趣.
  quickDraftTrackMode = next === "split" && !quickDraftTrackFitsSplit() ? "content" : next;
  syncQuickDraftTrackToggle();
  if (quickDraftTrackOwnsPaper()) {
    showTrackOnOpenPaper();
    renderQuickDraftTrackPaper();
    if (trafficInterestBody().trim()) await generateQuickDraftTraffic();
    else syncQuickDraftTrackChrome();
    return;
  }
  if (typeof renderQuickDraftPreviewPane === "function") renderQuickDraftPreviewPane();
  syncQuickDraftTrackChrome();
}

async function developQuickDraftTraffic() {
  const slot = activeProjectQuickDraft({ create: false });
  const traffic = readQuickDraftTraffic();
  if (typeof lightroomIsReadOnly === "function" && lightroomIsReadOnly()) return false;
  if (!slot || !traffic?.body) {
    setTrackStatus(t("lightroom_track_empty"));
    return false;
  }
  const task = createQuickDraftAsyncTask({ create: false });
  if (!task) {
    setTrackStatus(t("quick_draft_no_project"));
    return false;
  }
  const confirmed = await showSystemModal(t("lightroom_track_develop_confirm"), "confirm");
  if (confirmed !== "yes") return false;
  if (!task.stillOwnsActiveProject()) return false;
  const previousBody = trafficInterestBody();
  if (slot.record.workspace.projectDocId && typeof createDocumentRevision === "function") {
    try {
      await createDocumentRevision({
        projectId: task.projectId,
        documentId: slot.record.workspace.projectDocId,
        body: previousBody,
        origin: "system",
        operation: "quick-draft-traffic-develop",
      });
    } catch {
      setTrackStatus(t("quick_draft_develop_revision_failed"));
      return false;
    }
  }
  const patch = { stage: "draft", workspace: { body: traffic.body } };
  if (traffic.title) {
    patch.workspace.title = traffic.title;
    patch.workspace.titleMode = "manual";
  }
  if (previousBody.trim()) {
    patch.workspace.versions = [...darkroomOf(slot.record).versions, normalizeQuickDraftVersion({
      id: stableId("version"),
      body: previousBody,
      title: slot.record.workspace.title,
      createdAt: new Date().toISOString(),
      reason: "before-develop",
      source: "quick-draft",
    })].slice(-100);
  }
  if (refs.draft) refs.draft.value = traffic.body;
  const committed = await task.commit(patch, { captureForm: false });
  if (!committed.ok) {
    if (refs.draft) refs.draft.value = previousBody;
    setTrackStatus(t("quick_draft_save_failed"));
    return false;
  }
  clearQuickDraftTraffic();
  if (quickDraftTrafficReceiptId) {
    window.AISystem6RunReceipts?.recordUserAction?.(quickDraftTrafficReceiptId, {
      action: "accept",
      finalBodyHash: typeof contentHash === "function" ? contentHash(traffic.body) : "",
    });
    quickDraftTrafficReceiptId = "";
  }
  quickDraftTrackMode = "interest";
  syncQuickDraftTrackToggle();
  renderQuickDraft(committed.record);
  syncQuickDraftTrackChrome(committed.record);
  setTrackStatus(t("quick_draft_develop_done"));
  return true;
}

window.addEventListener("resize", () => {
  if (!quickDraftTrackOwnsPaper() && quickDraftTrackMode !== "split") {
    syncQuickDraftTrackToggle();
    return;
  }
  const wasSplit = quickDraftTrackMode === "split";
  syncQuickDraftTrackToggle();
  if (wasSplit && quickDraftTrackMode !== "split") renderQuickDraftPreviewPane();
  else if (quickDraftTrackOwnsPaper()) renderQuickDraftTrackPaper();
});

ensureTrackCopy();
