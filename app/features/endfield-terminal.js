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
  "管理员为什么会被重新唤醒？",
  "终末地早期主线的关键冲突是什么？",
  "塔卫二基地承担了哪些任务？",
  "佩里卡和管理员的关系透露了什么？",
  "目前资料里有哪些关于天灾和工业体系的线索？",
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
let endfieldRequestId = 0;
let endfieldAbortController = null;
let endfieldBusy = false;

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
  if (typeof cloudConfig !== "undefined" && cloudConfig?.active && cloudConfig?.provider && cloudConfig?.apiKey) {
    return {
      model: cloudConfig.model || "deepseek-v4-flash",
      _cloud_active: true,
      _cloud_api_key: cloudConfig.apiKey,
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

function renderEndfieldRecent(items = endfieldRecentQueries()) {
  if (!endfieldRecentListEl) return;
  endfieldRecentListEl.innerHTML = items.map((query, index) => `
    <button type="button" class="endfield-recent-item${query === endfieldLastQuery ? " is-selected" : ""}" data-query="${escapeHtml(query)}" aria-pressed="${query === endfieldLastQuery ? "true" : "false"}">
      <span>${index + 1}</span>
      <b>${escapeHtml(query.replace(/[？?].*$/, ""))}</b>
    </button>
  `).join("");
}

function renderEndfieldMatches(matches = []) {
  if (!endfieldMatchListEl) return;
  if (!matches.length) {
    endfieldMatchListEl.innerHTML = `<p class="endfield-empty">${escapeHtml(t("endfield_empty"))}</p>`;
    return;
  }
  endfieldMatchListEl.innerHTML = matches.slice(0, 14).map((item, index) => `
    <button type="button" class="endfield-match" data-evidence-index="${index + 1}">
      <span>${index + 1}</span>
      <b>${escapeHtml(item.missionTitle || item.title || item.id || t("endfield_untitled"))}</b>
      <small>${escapeHtml([item.section, item.chapter, item.process].filter(Boolean).join(" / "))}</small>
    </button>
  `).join("");
}

function renderEndfieldWelcome() {
  if (!endfieldOutputEl) return;
  endfieldOutputEl.innerHTML = `
    <article class="endfield-answer endfield-welcome">
      <p class="endfield-kicker">${escapeHtml(t("endfield_archive_label"))}</p>
      <h3>${escapeHtml(t("endfield_welcome_title"))}</h3>
      <p>${escapeHtml(t("endfield_welcome_body"))}</p>
      <div class="endfield-suggestions" role="group" aria-label="${escapeHtml(t("endfield_suggestions"))}">
        ${defaultEndfieldQueries.slice(0, 3).map((query) => `
          <button class="btn" type="button" data-query="${escapeHtml(query)}">${escapeHtml(query)}</button>
        `).join("")}
      </div>
    </article>
  `;
  renderEndfieldMatches([]);
}

function renderEndfieldResults(data) {
  const results = Array.isArray(data.results) ? data.results.slice(0, 14) : [];
  const answerHtml = typeof markdownToSystemHtml === "function"
    ? markdownToSystemHtml(data.answer || "")
    : escapeHtml(data.answer || "").replace(/\n/g, "<br>");
  const evidence = results.map((item, index) => `
    <details class="endfield-evidence" id="endfield-evidence-${index + 1}" tabindex="-1">
      <summary>
        <span class="endfield-evidence-index">【${index + 1}】</span>
        <span class="endfield-evidence-title">${escapeHtml([item.missionTitle, item.section, item.chapter, item.process].filter(Boolean).join(" / ") || item.missionId || t("endfield_untitled"))}</span>
        <span class="endfield-evidence-speaker">${escapeHtml(item.speaker || t("endfield_unknown_speaker"))}</span>
      </summary>
      <div class="endfield-evidence-body">
        <p>${escapeHtml(item.text || "")}</p>
        ${(item.context || []).map((ctx) => `<blockquote>${escapeHtml(ctx.speaker || t("endfield_unknown_speaker"))}: ${escapeHtml(ctx.text || "")}</blockquote>`).join("")}
      </div>
    </details>
  `).join("");

  endfieldOutputEl.innerHTML = `
    <article class="endfield-answer">
      <p class="endfield-kicker">${escapeHtml(t("endfield_answer_label"))}</p>
      <h3>${escapeHtml(data.query || endfieldLastQuery)}</h3>
      <div class="markdown-body">${answerHtml || `<p>${escapeHtml(t("endfield_no_answer"))}</p>`}</div>
    </article>
    ${evidence ? `<section class="endfield-evidence-list" aria-labelledby="endfield-evidence-heading"><h3 id="endfield-evidence-heading">${escapeHtml(t("endfield_evidence_heading", results.length))}</h3>${evidence}</section>` : ""}
  `;
  renderEndfieldMatches(results);
}

async function loadEndfieldMeta() {
  if (endfieldMetaLoaded || !endfieldCountEl) return;
  try {
    const response = await fetch("/api/endfield/search");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const meta = data.meta || {};
    endfieldCountEl.textContent = t("endfield_line_count", meta.transcriptLineCount || 0);
    endfieldRouteEl.textContent = `${meta.gameVersion || "v?"} / ${endfieldRouteLabel()}`;
    endfieldMetaLoaded = true;
  } catch {
    endfieldCountEl.textContent = t("endfield_archive_unavailable");
  }
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
  endfieldRouteEl.textContent = endfieldRouteLabel();
  setEndfieldBusy(true);
  endfieldOutputEl.innerHTML = `<article class="endfield-answer endfield-loading"><p class="endfield-kicker">${escapeHtml(t("endfield_searching_label"))}</p><h3>${escapeHtml(normalized)}</h3><p>${escapeHtml(t("endfield_searching"))}</p></article>`;
  renderEndfieldMatches([]);

  try {
    let data;
    const cloudActive = typeof cloudConfig !== "undefined" && cloudConfig?.active && cloudConfig.apiKey;
    if (cloudActive) {
      const response = await fetch("/api/endfield/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: normalized,
          limit: 18,
          ...endfieldRoutePayload(),
        }),
        signal: endfieldAbortController.signal,
      });
      data = await response.json();
      if (!response.ok) throw new Error(data.detail || data.error || `HTTP ${response.status}`);
    } else {
      const searchResponse = await fetch(`/api/endfield/search?q=${encodeURIComponent(normalized)}&limit=18`, {
        signal: endfieldAbortController.signal,
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
        const evidence = results.slice(0, 14).map((item, index) => [
          `【${index + 1}】${[item.missionTitle, item.section, item.chapter, item.process].filter(Boolean).join(" / ")}`,
          `${item.speaker || "Unknown"}：${item.text || ""}`,
          ...(Array.isArray(item.context) ? item.context.slice(0, 2).map((ctx) => `${ctx.speaker || ""}：${ctx.text || ""}`) : []),
        ].join("\n")).join("\n\n");
        const result = await sendLocalModelTask({
          payload: {
            model: getLocalModelRequestName(),
            messages: window.AISystem6ModelTaskRuntime.buildEndfieldMessages(normalized, evidence),
            temperature: 0.25,
            max_tokens: 1200,
            stream: false,
            ai_system6_task_kind: "endfield_rag",
          },
          taskKind: "endfield_rag",
          streamPreference: "json",
        });
        data = {
          query: normalized,
          answer: result.text,
          ...matches,
          results,
          ai_system6_metrics: {
            provider: "lmstudio",
            model: getLocalModelRequestName(),
            finish_reason: result.metrics?.stopReason || "",
          },
        };
      }
    }
    if (requestId !== endfieldRequestId) return;
    data.results = Array.isArray(data.results) ? data.results.slice(0, 14) : [];
    renderEndfieldResults(data);
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
  if (endfieldQueryInput) endfieldQueryInput.value = "";
  setEndfieldBusy(false);
  renderEndfieldTerminal();
  endfieldQueryInput?.focus();
}

function renderEndfieldTerminal() {
  renderEndfieldRecent();
  if (!endfieldLastQuery) renderEndfieldWelcome();
  loadEndfieldMeta();
  endfieldRouteEl.textContent = endfieldRouteLabel();
}

endfieldForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  if (endfieldBusy) return;
  askEndfield(endfieldQueryInput.value);
});

endfieldRecentListEl?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-query]");
  if (!button) return;
  endfieldQueryInput.value = button.dataset.query || "";
  askEndfield(endfieldQueryInput.value);
});

endfieldMatchListEl?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-evidence-index]");
  if (!button) return;
  const evidence = document.querySelector(`#endfield-evidence-${button.dataset.evidenceIndex}`);
  if (!evidence) return;
  evidence.open = true;
  evidence.scrollIntoView({ block: "nearest" });
  evidence.focus({ preventScroll: true });
});

endfieldOutputEl?.addEventListener("click", (event) => {
  const queryButton = event.target.closest("[data-query]");
  if (queryButton) {
    if (endfieldQueryInput) endfieldQueryInput.value = queryButton.dataset.query || "";
    askEndfield(queryButton.dataset.query || "");
    return;
  }
  const retryButton = event.target.closest("[data-retry-query]");
  if (retryButton) askEndfield(retryButton.dataset.retryQuery || "");
});

endfieldNewSessionBtn?.addEventListener("click", resetEndfieldQuery);

function runEndfieldMenuCommand(command) {
  if (command === "new-session") {
    return resetEndfieldQuery();
  }
  if (command === "run-query") return askEndfield(endfieldQueryInput.value);
}

window.AISystem6EndfieldTerminal = Object.freeze({
  attach: renderEndfieldTerminal,
  runMenuCommand: runEndfieldMenuCommand,
});
window.AISystem6EndfieldTerminalLoaded = true;
