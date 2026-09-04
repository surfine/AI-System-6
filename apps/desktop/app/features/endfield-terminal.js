// Feature module: Endfield Terminal.

const endfieldForm = document.querySelector("#endfield-form");
const endfieldQueryInput = document.querySelector("#endfield-query");
const endfieldOutputEl = document.querySelector("#endfield-output");
const endfieldRecentListEl = document.querySelector("#endfield-recent-list");
const endfieldMatchListEl = document.querySelector("#endfield-match-list");
const endfieldCountEl = document.querySelector("#endfield-terminal-count");
const endfieldRouteEl = document.querySelector("#endfield-terminal-route");
const endfieldNewSessionBtn = document.querySelector("#endfield-new-session");
const endfieldSubmitBtn = document.querySelector("#endfield-submit");
const ENDFIELD_RECENT_KEY = "ai-system6-endfield-recent";

const defaultEndfieldQueries = [
  "管理员什么时候认识的提弗洛斯？",
  "旁白是安玛还是萨米？",
  "安玛就是萨米吗？巨兽和兽主的区别在哪？",
  "老雪祀最后怎么样了？",
  "命运的明示要怎么解锁？",
];

const legacyDefaultEndfieldQueries = [
  "庄方宜和管理员是什么关系？",
  "陈千语在主线里参与了哪些事件？",
  "四号谷地和枢纽区基地有什么关系？",
  "艾尔黛拉的性格是什么样的？",
  "武陵城在主线剧情中发生了哪些事件？",
];

let endfieldLastQuery = "";
let endfieldMetaLoaded = false;
let endfieldMeta = null;
let endfieldRequestId = 0;
let endfieldAbortController = null;
let endfieldBusy = false;
let endfieldProgress = "all";

const ENDFIELD_PROGRESS_ORDER = { prologue: 1, chapter1: 2, chapter2: 3, v1_5: 4 };
const ENDFIELD_KIND_LABEL_KEYS = {
  "对话": "dialogue",
  "日志": "log",
  "通讯": "comms",
  "档案": "files",
  "语音": "voice",
  "教学": "tutorial",
  "见闻辑录": "lore",
  "中枢档案": "hub",
};

function endfieldKindLabel(kind) {
  const key = ENDFIELD_KIND_LABEL_KEYS[kind] || "dialogue";
  return t(`endfield_kind_${key}`);
}

function endfieldProgressLabel(progress = endfieldProgress) {
  return t(`endfield_progress_${progress}`);
}

function endfieldRecentQueries() {
  try {
    const saved = JSON.parse(localStorage.getItem(ENDFIELD_RECENT_KEY) || "[]");
    if (Array.isArray(saved) && saved.length && saved.every((item) => legacyDefaultEndfieldQueries.includes(item))) {
      localStorage.setItem(ENDFIELD_RECENT_KEY, JSON.stringify(defaultEndfieldQueries));
      return defaultEndfieldQueries;
    }
    return [...new Set([...saved, ...defaultEndfieldQueries].filter(Boolean))].slice(0, 8);
  } catch {
    return defaultEndfieldQueries;
  }
}

function saveEndfieldRecentQuery(query) {
  const normalized = String(query || "").trim();
  if (!normalized) return;
  const next = [normalized, ...endfieldRecentQueries().filter((item) => item !== normalized)].slice(0, 8);
  localStorage.setItem(ENDFIELD_RECENT_KEY, JSON.stringify(next));
  renderEndfieldRecent(next);
}

function endfieldRoutePayload() {
  if (typeof cloudConfig !== "undefined" && cloudConfig?.active && cloudConfig?.provider && cloudCredentialReady()) {
    return {
      model: cloudConfig.model || "deepseek-v4-flash",
      _cloud_active: true,
      ...cloudCredentialTransportFields(),
      _cloud_base_url: cloudConfig.baseUrl || "https://api.deepseek.com",
      _cloud_model: cloudConfig.model || "deepseek-v4-flash",
    };
  }
  return {
    model: typeof getLocalModelRequestName === "function" ? getLocalModelRequestName() : (modelInput?.value || "local-model"),
    _local_provider: document.querySelector("#local-provider")?.value || "lm-studio",
    _local_endpoint: endpointInput?.value?.trim() || "",
    ...(typeof currentContextRouteConfig === "function" ? currentContextRouteConfig() : {}),
  };
}

function endfieldRouteLabel() {
  if (typeof cloudConfig !== "undefined" && cloudConfig?.active && cloudConfig?.model) return `${t("endfield_route_cloud")} / ${cloudConfig.model}`;
  const model = typeof getLocalModelDisplayName === "function" ? getLocalModelDisplayName() : (modelInput?.value || "local model");
  return `${t("endfield_route_local")} / ${model}`;
}

// The header has ONE writer. Three places used to write the model label
// straight into it, so whichever ran last erased the archive's version and
// oldest scrape date that loadEndfieldMeta had just put there.
//
// The version is the missions file's, but the evidence comes from five
// datasets scraped separately. Show the OLDEST scrape beside it, so a partial
// refresh reads as what it is instead of announcing a version the other four
// datasets cannot support.
function renderEndfieldRoute() {
  if (!endfieldRouteEl) return;
  renderEndfieldStatusChrome();
  const label = endfieldRouteLabel();
  const meta = endfieldMeta;
  if (!meta) {
    endfieldRouteEl.textContent = label;
    return;
  }
  const oldest = String(meta.oldestScrapedAt || "").slice(0, 10);
  const stale = (meta.datasets || []).filter((set) => set.scrapedAt
    && String(set.scrapedAt).slice(0, 10) !== oldest).length > 0;
  endfieldRouteEl.textContent = oldest
    ? `${meta.gameVersion || "v?"} · ${oldest}${stale ? " ⚠" : ""} / ${label}`
    : `${meta.gameVersion || "v?"} / ${label}`;
  endfieldRouteEl.title = (meta.datasets || [])
    .map((set) => `${set.id}: ${String(set.scrapedAt || "?").slice(0, 10)}${set.gameVersion ? ` (${set.gameVersion})` : ""}`)
    .join("\n");
}

function renderEndfieldStatusChrome() {
  const bar = document.querySelector(".endfield-status-bar");
  if (!bar) return;
  let stamps = bar.querySelector(".endfield-stamps");
  if (!stamps) {
    stamps = document.createElement("span");
    stamps.className = "endfield-stamps";
    bar.prepend(stamps);
  }
  stamps.innerHTML = [
    `<span class="endfield-stamp">${escapeHtml(t("endfield_stamp_dialogue"))} v1.4</span>`,
    `<span class="endfield-stamp">${escapeHtml(t("endfield_stamp_log"))} v1.5</span>`,
    `<span class="endfield-stamp">${escapeHtml(t("endfield_stamp_files"))} v1.5</span>`,
    `<span class="endfield-stamp is-gap">${escapeHtml(t("endfield_stamp_structure"))} ${escapeHtml(t("endfield_not_wired"))}</span>`,
  ].join("");
  ensureEndfieldProgressControl(bar);
}

function ensureEndfieldProgressControl(bar) {
  let progress = document.getElementById("endfield-progress");
  if (!progress) {
    const wrap = document.createElement("span");
    wrap.className = "endfield-progress";
    const label = document.createElement("span");
    label.textContent = t("endfield_progress_label");
    const selectWrap = document.createElement("span");
    selectWrap.className = "select-wrap";
    progress = document.createElement("select");
    progress.id = "endfield-progress";
    progress.setAttribute("aria-label", t("endfield_progress_label"));
    ["prologue", "chapter1", "chapter2", "v1_5", "all"].forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = t(`endfield_progress_${value}`);
      if (value === endfieldProgress) option.selected = true;
      progress.append(option);
    });
    progress.dataset.progressOrder = "prologue,chapter1,chapter2,v1_5,all";
    progress.addEventListener("change", () => {
      endfieldProgress = progress.value;
      if (endfieldLastQuery) askEndfield(endfieldLastQuery);
    });
    selectWrap.append(progress);
    wrap.append(label, selectWrap);
    (bar || document.body).append(wrap);
  }
}

function renderEndfieldRecent(items = endfieldRecentQueries()) {
  if (!endfieldRecentListEl) return;
  endfieldRecentListEl.innerHTML = items.map((query, index) => `
    <button type="button" class="endfield-recent-item${query === endfieldLastQuery ? " is-selected" : ""}" data-query="${escapeHtml(query)}" aria-pressed="${query === endfieldLastQuery ? "true" : "false"}">
      <span>${index + 1}</span>
      <b>${escapeHtml(query.replace(/[？?].*$/, ""))}</b>
    </button>
  `).join("");
}

function renderEndfieldMatches(groups = []) {
  if (!endfieldMatchListEl) return;
  if (!groups.length) {
    endfieldMatchListEl.innerHTML = `<p class="endfield-empty">${escapeHtml(t("endfield_empty"))}</p>`;
    return;
  }
  endfieldMatchListEl.innerHTML = groups.map((group) => `
    <div class="endfield-source-group" role="button" tabindex="0" data-source-group="${escapeHtml(group.id || "")}">
      <span>${escapeHtml(group.label)}</span><small>${group.count}</small>
    </div>
  `).join("");
}

function endfieldBuildSourceGroups(resultKinds, foldedCount, missingCount) {
  const counters = {};
  for (const kind of resultKinds) counters[kind] = (counters[kind] || 0) + 1;
  const groups = Object.entries(counters).map(([kind, count]) => ({
    id: `kind:${kind}`,
    label: endfieldKindLabel(kind),
    count,
  }));
  if (missingCount) groups.push({ id: "missing", label: t("endfield_group_missing"), count: missingCount });
  if (foldedCount) groups.push({ id: "folded", label: t("endfield_group_folded"), count: foldedCount });
  return groups;
}

function renderEndfieldWelcome() {
  if (!endfieldOutputEl) return;
  endfieldOutputEl.innerHTML = `
    <article class="endfield-answer endfield-welcome">
      <p class="endfield-kicker">${escapeHtml(t("endfield_kicker_audience"))}</p>
      <h3>${escapeHtml(t("endfield_welcome_title"))}</h3>
      <p>${escapeHtml(t("endfield_welcome_body"))}</p>
      <div class="endfield-question-list" role="group" aria-label="${escapeHtml(t("endfield_suggestions"))}">
        ${defaultEndfieldQueries.map((query) => {
          const available = query !== defaultEndfieldQueries[defaultEndfieldQueries.length - 1];
          return `
          <button class="btn" type="button" data-query="${escapeHtml(query)}">
            <span>${escapeHtml(query)}</span>
            <span class="endfield-stamp${available ? "" : " is-gap"}" data-availability>${escapeHtml(t(available ? "endfield_avail_yes" : "endfield_avail_no"))}</span>
          </button>`;
        }).join("")}
      </div>
    </article>
  `;
  renderEndfieldMatches([]);
}

function renderEndfieldResults(data) {
  const rawResults = Array.isArray(data.results) ? data.results.slice(0, 14) : [];
  let foldedCount = Number(data.meta?.foldedCount) || 0;
  let results;
  if (data.meta?.foldedCount === undefined) {
    // Fixture / client-side path (no server fold): fold locally.
    const order = ENDFIELD_PROGRESS_ORDER;
    const progress = endfieldProgress;
    if (progress === "all") {
      results = rawResults;
      foldedCount = 0;
    } else {
      const threshold = order[progress] || 5;
      results = rawResults.filter((item) => {
        const key = item.chapterKey;
        if (!key || order[key] === undefined) return true;
        return order[key] <= threshold;
      });
      foldedCount = rawResults.length - results.length;
    }
  } else {
    results = rawResults;
  }
  const questionType = data.meta?.questionType || data.questionType || "general";
  const answerHtml = typeof markdownToSystemHtml === "function"
    ? markdownToSystemHtml(data.answer || "")
    : escapeHtml(data.answer || "").replace(/\n/g, "<br>");
  const sources = endfieldSourceCardsHTML(results, questionType);
  const verdicts = endfieldVerdictBlocks(data.answer || "");

  endfieldOutputEl.innerHTML = `
    <article class="endfield-answer">
      <p class="endfield-kicker">${escapeHtml(t("endfield_sources_kicker", results.length, endfieldProgressLabel()))}</p>
      <h3>${escapeHtml(data.query || endfieldLastQuery)}</h3>
      <div class="endfield-sources">${sources}</div>
      ${verdicts}
      ${foldedCount ? `<div class="endfield-fold" data-endfield-fold>${escapeHtml(t("endfield_fold", foldedCount))}</div>` : ""}
    </article>
  `;
  linkEndfieldInlineCitationsInHtml(endfieldOutputEl);
  const missingCount = endfieldSourceCardsHTML(results, questionType, true).missing;
  renderEndfieldMatches(endfieldBuildSourceGroups(results.map((r) => r.kind || "对话"), foldedCount, missingCount));
}

const endfieldShowMissing = (item, questionType) =>
  (item.kind === "日志" || item.kind === "通讯")
  && (questionType === "when" || questionType === "general");

function endfieldSourceCardsHTML(results, questionType, countOnly = false) {
  let missing = 0;
  const cards = [];
  const missingSet = new Set();
  results.forEach((item, index) => {
    const kind = item.kind || "对话";
    const route = [item.missionTitle, item.process || item.section, item.chapter].filter(Boolean).join(" · ");
    cards.push(`
      <div class="endfield-source" id="endfield-evidence-${index + 1}" tabindex="-1" data-kind="${escapeHtml(kind)}" data-evidence-index="${index + 1}">
        <span class="endfield-evidence-index">${index + 1}</span>
        <div class="endfield-source-head">
          <span class="endfield-source-kind">${escapeHtml(endfieldKindLabel(kind))}</span>
          <span>${escapeHtml(route)}</span>
          <span class="endfield-stamp" title="${escapeHtml(item.versionBasis === "mission" ? "按条目" : "按数据集")}">${escapeHtml(item.version || "v?")}</span>
          ${item.missionIndex != null ? `<span class="endfield-stamp" data-stamp-mission>#${item.missionIndex + 1}</span>` : ""}
        </div>
        <p class="endfield-source-quote">${escapeHtml(item.text || "")}</p>
        <button class="btn mini-btn" type="button" data-clip-source="${index + 1}" data-clip-text="${escapeHtml(item.text || "")}">${escapeHtml(t("endfield_clip_source"))}</button>
      </div>
    `);
    if (endfieldShowMissing(item, questionType) && !missingSet.has(`${item.missionId}:${item.speaker}:${item.text}`)) {
      missingSet.add(`${item.missionId}:${item.speaker}:${item.text}`);
      missing += 1;
      cards.push(`
        <div class="endfield-source is-missing" id="endfield-evidence-${index + 1}-missing" data-kind="对话" data-evidence-index="${index + 1}">
          <span class="endfield-evidence-index">${index + 1}</span>
          <div class="endfield-source-head">
            <span class="endfield-source-kind">${escapeHtml(t("endfield_kind_dialogue"))}</span>
            <span>${escapeHtml(item.missionTitle || "")}</span>
            <span class="endfield-stamp is-gap">${escapeHtml(t("endfield_missing_stamp"))}</span>
          </div>
          <p class="endfield-source-quote">${escapeHtml(t("endfield_missing_dialogue"))}</p>
        </div>
      `);
    }
  });
  return countOnly ? { missing } : cards.join("");
}

function endfieldVerdictBlocks(answer) {
  let verdict = "";
  let gap = "";
  const extra = [];
  for (const rawLine of String(answer || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (/^结论[\s：:]/.test(line)) verdict = line.replace(/^结论[\s：:]\s*/, "");
    else if (/^留白[\s：:]/.test(line)) gap = line.replace(/^留白[\s：:]\s*/, "");
    else if (line) extra.push(line);
  }
  const blocks = [];
  if (verdict) blocks.push(`<p class="endfield-verdict"><b>${escapeHtml(t("endfield_verdict_label"))}</b>${markdownToSystemHtml(verdict)}</p>`);
  if (gap) blocks.push(`<p class="endfield-verdict"><b>${escapeHtml(t("endfield_gap_label"))}</b>${markdownToSystemHtml(gap)}</p>`);
  if (extra.length) blocks.push(`<div class="markdown-body">${markdownToSystemHtml(extra.join("\n"))}</div>`);
  return blocks.join("");
}

async function clipEndfieldSource(button) {
  const sourceIndex = Number(button?.dataset?.clipSource) || 0;
  const text = String(button?.dataset?.clipText || "").trim();
  if (!sourceIndex || !text) return;
  const source = document.getElementById(`endfield-evidence-${sourceIndex}`);
  const name = source ? `${source.dataset.kind || "endfield"}-source-${sourceIndex}.md` : `endfield-source-${sourceIndex}.md`;
  const file = typeof File === "function"
    ? new File([`${text}\n`], name, { type: "text/markdown" })
    : { name, size: text.length, text: () => Promise.resolve(`${text}\n`) };
  try {
    if (typeof insertFilesIntoFileFloppy === "function") {
      await insertFilesIntoFileFloppy([file], { source: "endfieldTerminal", openAfter: "rag" });
    }
    button.textContent = t("endfield_clipped");
    button.disabled = true;
  } catch {
    button.textContent = t("endfield_clip_failed");
  }
}

// Extra delegation without touching the existing (minified) mount handler.
endfieldOutputEl?.addEventListener("click", (event) => {
  const clip = event.target.closest("[data-clip-source]");
  if (clip) {
    event.preventDefault();
    clipEndfieldSource(clip);
  }
});
endfieldMatchListEl?.addEventListener("click", (event) => {
  const group = event.target.closest("[data-source-group]");
  if (!group) return;
  const id = group.dataset.sourceGroup || "";
  if (id === "folded") {
    document.querySelector("[data-endfield-fold]")?.scrollIntoView({ block: "nearest" });
    return;
  }
  if (id === "missing") {
    document.querySelector(".endfield-source.is-missing")?.scrollIntoView({ block: "nearest" });
    return;
  }
  const kind = String(id).replace(/^kind:/, "");
  document.querySelector(`.endfield-source[data-kind="${CSS.escape(kind)}"]`)?.scrollIntoView({ block: "nearest" });
});

// The model cites evidence as 【1】 inside the answer. Turn those markers into
// tappable citation chips that open and scroll to the matching evidence item
// below — the number means the same thing in the answer and in the list.
function linkEndfieldInlineCitationsInHtml(root) {
  if (!root) return;
  root.innerHTML = root.innerHTML.replace(/【(\d+)】/g, (match, n) =>
    `<button type="button" class="endfield-inline-citation" data-endfield-citation="${n}" aria-label="${escapeHtml(t("endfield_evidence_heading", 1))} ${n}">${n}</button>`);
}

async function loadEndfieldMeta() {
  if (endfieldMetaLoaded || !endfieldCountEl) return;
  try {
    const response = await window.AISystem6Capabilities.requestService("endfield.search", {});
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const meta = data.meta || {};
    endfieldCountEl.textContent = t("endfield_line_count", meta.transcriptLineCount || 0);
    endfieldMeta = meta;
    endfieldMetaLoaded = true;
    renderEndfieldRoute();
  } catch {
    endfieldCountEl.textContent = t("endfield_archive_unavailable");
  }
}

function endfieldPromptLanguage() {
  return typeof currentLanguage !== "undefined"
    && String(currentLanguage).toLowerCase().startsWith("en")
    ? "en"
    : "zh";
}

function endfieldLoreSystemPrompt() {
  const lang = endfieldPromptLanguage();
  const runtime = window.AISystem6PromptFilesRuntime;
  const resolved = typeof runtime?.resolvePromptFile === "function"
    ? runtime.resolvePromptFile("other-apps.endfield-lore", null, lang)
    : null;
  if (resolved?.status === "ready" && String(resolved.body || "").trim()) {
    return String(resolved.body).trim();
  }
  const record = (window.AISystem6PromptFiles || []).find((item) => item.id === "other-apps.endfield-lore");
  return String(record?.bodies?.[lang] || record?.bodies?.zh || "").trim();
}

function endfieldLocalEvidenceBlock(results) {
  return results.slice(0, 14).map((item, index) => {
    const route = [item.missionTitle, item.section, item.chapter, item.process].filter(Boolean).join(" / ");
    const before = (Array.isArray(item.context) ? item.context : [])
      .filter((line) => Number(line?.lineIndex) < Number(item.lineIndex))
      .map((line) => `${line.speaker || ""}：${line.text || ""}`)
      .slice(-2)
      .join("\n");
    const after = (Array.isArray(item.context) ? item.context : [])
      .filter((line) => Number(line?.lineIndex) > Number(item.lineIndex))
      .map((line) => `${line.speaker || ""}：${line.text || ""}`)
      .slice(0, 2)
      .join("\n");
    return [
      `【${index + 1}】${route}`,
      item.missionId ? `任务ID: ${item.missionId}` : "",
      before ? `前文:\n${before}` : "",
      `命中台词:\n${item.speaker || "未知"}: ${item.text || ""}`,
      after ? `后文:\n${after}` : "",
    ].filter(Boolean).join("\n");
  }).join("\n\n---\n\n");
}

function endfieldCloudActive() {
  return typeof cloudConfig !== "undefined"
    && cloudConfig?.active
    && cloudConfig?.provider
    && cloudCredentialReady();
}

async function askEndfieldBrowserLocally(query, results, signal) {
  const localTask = typeof window.AISystem6SendLocalModelTask === "function"
    ? window.AISystem6SendLocalModelTask
    : (typeof sendLocalModelTask === "function" ? sendLocalModelTask : null);
  if (!localTask) return "";
  const systemBody = endfieldLoreSystemPrompt();
  const evidence = endfieldLocalEvidenceBlock(results);
  const payload = {
    messages: [
      { role: "system", content: systemBody },
      {
        role: "user",
        content: `用户问题：${query}\n\n【剧情证据】\n${evidence}`,
      },
    ],
    temperature: 0.25,
    max_tokens: 1200,
    stream: false,
    ai_system6_task_kind: "endfield_rag",
  };
  const modelName = typeof getLocalModelRequestName === "function"
    ? getLocalModelRequestName()
    : "";
  if (modelName) payload.model = modelName;
  const result = await localTask({
    payload,
    taskKind: "endfield_rag",
    streamPreference: "json",
    signal,
  });
  return String(result?.text || "").trim();
}

async function askEndfield(query) {
  const normalized = String(query || "").trim();
  if (!normalized || !endfieldOutputEl) {
    endfieldQueryInput?.focus();
    return;
  }
  const requestId = ++endfieldRequestId;
  endfieldAbortController?.abort();
  endfieldAbortController = new AbortController();
  endfieldLastQuery = normalized;
  saveEndfieldRecentQuery(normalized);
  renderEndfieldRoute();
  setEndfieldBusy(true);
  endfieldOutputEl.innerHTML = `<article class="endfield-answer endfield-loading"><p class="endfield-kicker">${escapeHtml(t("endfield_searching_label"))}</p><h3>${escapeHtml(normalized)}</h3><p>${escapeHtml(t("endfield_searching"))}</p></article>`;
  renderEndfieldMatches([]);

  try {
    let data = null;
    const cloudActive = endfieldCloudActive();
    const browserLocalAvailable = !cloudActive && (
      (typeof isLocalModelIndicatorReady === "function" && isLocalModelIndicatorReady())
      || (typeof isLocalModelIndicatorReady !== "function"
        && typeof window.AISystem6SendLocalModelTask === "function")
    );
    if (browserLocalAvailable) {
      // Deterministic retrieval stays on the VPS: /api/endfield/search never
      // calls a model. Only the answer is generated in the browser through the
      // same local task runtime ClioTalk uses, so an LM Studio connection here
      // is used here, not proxied through the server a second time.
      const searchResponse = await window.AISystem6Capabilities.requestService("endfield.search", {
        init: {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: normalized,
            limit: 18,
            progress: endfieldProgress,
          }),
          signal: endfieldAbortController.signal,
        },
      });
      const matches = await searchResponse.json().catch(() => ({}));
      if (!searchResponse.ok) throw new Error(matches.detail || matches.error || `HTTP ${searchResponse.status}`);
      const results = Array.isArray(matches.results) ? matches.results.slice(0, 14) : [];
      if (!results.length) {
        data = {
          query: normalized,
          answer: t("endfield_no_evidence"),
          ...matches,
          results,
          ai_system6_metrics: { provider: "local", finish_reason: "no_evidence" },
        };
      } else {
        try {
          const answer = await askEndfieldBrowserLocally(normalized, results, endfieldAbortController.signal);
          if (String(answer || "").trim()) {
            data = {
              query: normalized,
              answer,
              ...matches,
              results,
              ai_system6_metrics: {
                provider: "lmstudio",
                model: typeof getLocalModelRequestName === "function"
                  ? getLocalModelRequestName()
                  : "",
                finish_reason: "stop",
              },
            };
          }
        } catch (localError) {
          if (localError?.name === "AbortError" || requestId !== endfieldRequestId) throw localError;
          // A reachable-but-not-usable local model (evicted, context overflow,
          // offline mid-flight) falls through to the shared server ask route,
          // which owns autoload and provider routing.
        }
      }
    }
    if (!data) {
      // Cloud mode and the local fallback share one server route: the server
      // owns corpus search, evidence budgeting, and cloud/local provider
      // routing when the browser has no direct model connection.
      const response = await window.AISystem6Capabilities.requestService("endfield.ask", {
        init: {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: normalized,
            limit: 18,
            progress: endfieldProgress,
            ...endfieldRoutePayload(),
          }),
          signal: endfieldAbortController.signal,
        },
      });
      data = await response.json();
      if (!response.ok) throw new Error(data.detail || data.error || `HTTP ${response.status}`);
    }
    if (requestId !== endfieldRequestId) return;
    data.results = Array.isArray(data.results) ? data.results.slice(0, 14) : [];
    renderEndfieldResults(data);
    updateEndfieldSideAskContext(data, normalized);
    setStatus(`Endfield: ${normalized}`);
  } catch (error) {
    if (error?.name === "AbortError" || requestId !== endfieldRequestId) return;
    endfieldOutputEl.innerHTML = `
      <article class="endfield-answer endfield-error" role="alert">
        <p class="endfield-kicker">${escapeHtml(t("endfield_error_label"))}</p>
        <h3>${escapeHtml(t("endfield_error_title"))}</h3>
        <p>${escapeHtml(t("endfield_error_body"))}</p>
        <button class="btn" type="button" data-retry-query="${escapeHtml(normalized)}">${escapeHtml(t("endfield_retry"))}</button>
      </article>
    `;
    setStatus(t("endfield_error_title"));
  } finally {
    if (requestId === endfieldRequestId) {
      endfieldAbortController = null;
      setEndfieldBusy(false);
    }
  }
}

function setEndfieldBusy(busy) {
  endfieldBusy = busy;
  endfieldOutputEl?.setAttribute("aria-busy", String(busy));
  endfieldForm?.setAttribute("aria-busy", String(busy));
  endfieldRecentListEl?.querySelectorAll("button").forEach((button) => {
    button.disabled = busy;
  });
  if (typeof setControlLoading === "function") {
    if (busy && endfieldSubmitBtn?.dataset.loading !== "true") {
      setControlLoading(endfieldSubmitBtn, true, t("endfield_searching_short"));
    } else if (!busy && endfieldSubmitBtn?.dataset.loading === "true") {
      setControlLoading(endfieldSubmitBtn, false);
    }
  } else if (endfieldSubmitBtn) {
    endfieldSubmitBtn.disabled = busy;
  }
}

function resetEndfieldQuery() {
  endfieldRequestId += 1;
  endfieldAbortController?.abort();
  endfieldAbortController = null;
  endfieldLastQuery = "";
  window.AISystem6EndfieldSideAsk = null;
  if (endfieldQueryInput) endfieldQueryInput.value = "";
  setEndfieldBusy(false);
  renderEndfieldTerminal();
  endfieldQueryInput?.focus();
}

// Keep the latest question + numbered evidence available to SideAsk/ClioTalk,
// so a paired follow-up conversation is grounded in the same story corpus the
// terminal retrieved, with the same 【n】 citation contract.
function updateEndfieldSideAskContext(data, query) {
  const results = (Array.isArray(data?.results) ? data.results : []).map((item, index) => ({
    n: index + 1,
    missionId: item.missionId || item.id || "",
    missionTitle: item.missionTitle || item.title || "",
    section: item.section || "",
    chapter: item.chapter || "",
    process: item.process || "",
    speaker: item.speaker || "",
    text: item.text || "",
    url: item.missionUrl || item.url || "",
  }));
  window.AISystem6EndfieldSideAsk = {
    query: String(query || "").trim(),
    answer: String(data?.answer || "").trim(),
    results,
    groundingSources: window.AISystem6EndfieldGrounding?.buildFromResults?.(results) || null,
    updatedAt: new Date().toISOString(),
  };
}

function renderEndfieldTerminal() {
  renderEndfieldRecent();
  if (!endfieldLastQuery) renderEndfieldWelcome();
  loadEndfieldMeta();
  renderEndfieldRoute();
}

let eftmounted=!1;function mountEndfieldTerminalRuntime(){if(eftmounted)return!0;eftmounted=!0;endfieldForm?.addEventListener("submit",event=>{event.preventDefault();if(endfieldBusy)return;askEndfield(endfieldQueryInput.value)});endfieldRecentListEl?.addEventListener("click",event=>{const button=event.target.closest("[data-query]");if(!button)return;endfieldQueryInput.value=button.dataset.query||"";askEndfield(endfieldQueryInput.value)});endfieldMatchListEl?.addEventListener("click",event=>{const button=event.target.closest("[data-evidence-index]");if(!button)return;const evidence=document.querySelector(`#endfield-evidence-${button.dataset.evidenceIndex}`);if(!evidence)return;evidence.open=!0;evidence.scrollIntoView({block:"nearest"});evidence.focus({preventScroll:!0})});endfieldOutputEl?.addEventListener("click",event=>{const citation=event.target.closest("[data-endfield-citation]");if(citation){const evidence=document.querySelector(`#endfield-evidence-${citation.dataset.endfieldCitation}`);if(evidence){evidence.open=!0;evidence.scrollIntoView({behavior:"smooth",block:"nearest"});evidence.focus({preventScroll:!0})}return}const queryButton=event.target.closest("[data-query]");if(queryButton){if(endfieldQueryInput)endfieldQueryInput.value=queryButton.dataset.query||"";askEndfield(queryButton.dataset.query||"");return}const retryButton=event.target.closest("[data-retry-query]");if(retryButton)askEndfield(retryButton.dataset.retryQuery||"")});endfieldNewSessionBtn?.addEventListener("click",resetEndfieldQuery);return!0}

function runEndfieldMenuCommand(command) {
  if (command === "new-session") {
    return resetEndfieldQuery();
  }
  if (command === "run-query") return askEndfield(endfieldQueryInput.value);
  if (command === "menu-progress") {
    document.getElementById("endfield-progress")?.focus();
    return true;
  }
  if (command === "menu-clip") {
    document.querySelector("[data-clip-source]")?.click();
    return true;
  }
  if (command === "sideask") {
    if (typeof arrangeWindowAssistantSplit === "function") {
      return arrangeWindowAssistantSplit("endfieldTerminal");
    }
    if (typeof openWindow === "function") return openWindow("assistant");
    return false;
  }
  return false;
}

window.AISystem6EndfieldTerminal = Object.freeze({
  attach: renderEndfieldTerminal,
  runMenuCommand: runEndfieldMenuCommand,
});
window.AISystem6EndfieldTerminalLoaded = true;
window.AISystem6Runtime?.registerApplication({
  id: "endfieldTerminal",
  windowName: "endfieldTerminal",
  mount: mountEndfieldTerminalRuntime,
  restore: () => mountEndfieldTerminalRuntime(),
  commands: {
    "open-endfield-terminal": {
      handler: () => openWindow("endfieldTerminal"),
      isAvailable: () => true,
    },
    "endfield-new-session": {
      handler: () => runEndfieldMenuCommand("new-session"),
      isAvailable: () => document.querySelector(".window.is-active")?.dataset.window === "endfieldTerminal",
    },
    "endfield-run-query": {
      handler: () => runEndfieldMenuCommand("run-query"),
      isAvailable: () => {
        const activeWindow = document.querySelector(".window.is-active");
        return activeWindow?.dataset.window === "endfieldTerminal"
          && !!endfieldQueryInput?.value.trim();
      },
    },
    "endfield-menu-progress": {
      handler: () => runEndfieldMenuCommand("menu-progress"),
      isAvailable: () => document.querySelector(".window.is-active")?.dataset.window === "endfieldTerminal",
    },
    "endfield-menu-clip": {
      handler: () => runEndfieldMenuCommand("menu-clip"),
      isAvailable: () => !!document.querySelector(".window.is-active .endfield-source [data-clip-source]"),
    },
    "endfield-sideask": {
      handler: () => runEndfieldMenuCommand("sideask"),
      isAvailable: () => document.querySelector(".window.is-active")?.dataset.window === "endfieldTerminal",
    },
  },
});
