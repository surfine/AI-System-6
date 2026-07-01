// Feature module: Endfield Terminal.

const endfieldForm = document.querySelector("#endfield-form");
const endfieldQueryInput = document.querySelector("#endfield-query");
const endfieldOutputEl = document.querySelector("#endfield-output");
const endfieldRecentListEl = document.querySelector("#endfield-recent-list");
const endfieldMatchListEl = document.querySelector("#endfield-match-list");
const endfieldCountEl = document.querySelector("#endfield-terminal-count");
const endfieldRouteEl = document.querySelector("#endfield-terminal-route");
const endfieldNewSessionBtn = document.querySelector("#endfield-new-session");
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
  if (typeof cloudConfig !== "undefined" && cloudConfig?.active && cloudConfig?.model) return `Cloud / ${cloudConfig.model}`;
  const model = typeof getLocalModelDisplayName === "function" ? getLocalModelDisplayName() : (modelInput?.value || "local model");
  return `Local / ${model}`;
}

function renderEndfieldRecent(items = endfieldRecentQueries()) {
  if (!endfieldRecentListEl) return;
  endfieldRecentListEl.innerHTML = items.map((query, index) => `
    <button type="button" class="endfield-recent-item${query === endfieldLastQuery ? " is-active" : ""}" data-query="${escapeHtml(query)}">
      <span>${index + 1}</span>
      <b>${escapeHtml(query.replace(/[？?].*$/, ""))}</b>
      <small>${escapeHtml(query)}</small>
    </button>
  `).join("");
}

function renderEndfieldMatches(matches = []) {
  if (!endfieldMatchListEl) return;
  if (!matches.length) {
    endfieldMatchListEl.innerHTML = `<p class="endfield-empty">${escapeHtml(t("endfield_empty"))}</p>`;
    return;
  }
  endfieldMatchListEl.innerHTML = matches.slice(0, 8).map((item) => `
    <article class="endfield-match">
      <b>${escapeHtml(item.title || item.id || "Untitled")}</b>
      <small>${escapeHtml([item.section, item.chapter, item.process].filter(Boolean).join(" / "))}</small>
    </article>
  `).join("");
}

function renderEndfieldWelcome() {
  if (!endfieldOutputEl) return;
  endfieldOutputEl.innerHTML = `
    <article class="endfield-answer endfield-welcome">
      <h3>WELCOME_MESSAGE</h3>
      <p><b>《明日方舟：终末地》本地剧情资料终端</b></p>
      <p>资料库已装载 Warfarin Wiki 文本，覆盖主线剧情、干员档案、语音、教学记录、见闻辑录、中枢档案与调查报告。</p>
      <p><b>先检索证据，再生成回答。</b> 模型调用沿用 AI System 6 当前的本地或云端模型设置；来源、章节和说话人会保留在证据卡中。</p>
    </article>
  `;
  renderEndfieldMatches([]);
}

function renderEndfieldResults(data) {
  const answerHtml = typeof markdownToSystemHtml === "function"
    ? markdownToSystemHtml(data.answer || "")
    : escapeHtml(data.answer || "").replace(/\n/g, "<br>");
  const evidence = (data.results || []).map((item) => `
    <article class="endfield-evidence">
      <div class="endfield-evidence-meta">
        <span>${escapeHtml(item.missionId || "")}</span>
        <b>${escapeHtml([item.section, item.chapter, item.process, item.missionTitle].filter(Boolean).join(" / "))}</b>
        <em>SCORE ${Math.round(item.score || 0)}</em>
      </div>
      <h4>${escapeHtml(item.speaker || "Unknown")}</h4>
      <p>${escapeHtml(item.text || "")}</p>
      ${(item.context || []).map((ctx) => `<blockquote>${escapeHtml(ctx.speaker || "")}: ${escapeHtml(ctx.text || "")}</blockquote>`).join("")}
    </article>
  `).join("");

  endfieldOutputEl.innerHTML = `
    <article class="endfield-answer">
      <h3>${escapeHtml((data.ai_system6_metrics?.provider || "model").toUpperCase())} MODEL ANSWER</h3>
      <div class="markdown-body">${answerHtml || "<p>模型没有返回正文。</p>"}</div>
    </article>
    ${evidence}
  `;
  renderEndfieldMatches(data.missionMatches || []);
}

async function loadEndfieldMeta() {
  if (endfieldMetaLoaded || !endfieldCountEl) return;
  try {
    const response = await fetch("/api/endfield/search");
    const data = await response.json();
    const meta = data.meta || {};
    endfieldCountEl.textContent = `${meta.transcriptLineCount || 0} lines`;
    endfieldRouteEl.textContent = `${meta.gameVersion || "v?"} / ${endfieldRouteLabel()}`;
    endfieldMetaLoaded = true;
  } catch {
    endfieldCountEl.textContent = "-- lines";
  }
}

async function askEndfield(query) {
  const normalized = String(query || "").trim();
  if (!normalized || !endfieldOutputEl) return;
  endfieldLastQuery = normalized;
  saveEndfieldRecentQuery(normalized);
  endfieldRouteEl.textContent = endfieldRouteLabel();
  endfieldOutputEl.innerHTML = `<article class="endfield-answer"><h3>QUERY_${escapeHtml(normalized)}</h3><p>${escapeHtml(t("endfield_searching"))}</p></article>`;
  renderEndfieldMatches([]);

  try {
    const response = await fetch("/api/endfield/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: normalized,
        limit: 18,
        ...endfieldRoutePayload(),
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || data.error || `HTTP ${response.status}`);
    renderEndfieldResults(data);
    setStatus(`Endfield: ${normalized}`);
  } catch (error) {
    endfieldOutputEl.innerHTML = `<article class="endfield-answer"><h3>ERROR</h3><p>${escapeHtml(error.message || String(error))}</p></article>`;
    setStatus(error.message || "Endfield request failed");
  }
}

function renderEndfieldTerminal() {
  renderEndfieldRecent();
  if (!endfieldLastQuery) renderEndfieldWelcome();
  loadEndfieldMeta();
  endfieldRouteEl.textContent = endfieldRouteLabel();
}

endfieldForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  askEndfield(endfieldQueryInput.value);
});

endfieldRecentListEl?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-query]");
  if (!button) return;
  endfieldQueryInput.value = button.dataset.query || "";
  askEndfield(endfieldQueryInput.value);
});

endfieldNewSessionBtn?.addEventListener("click", () => {
  endfieldLastQuery = "";
  endfieldQueryInput.value = "";
  renderEndfieldTerminal();
  endfieldQueryInput.focus();
});
