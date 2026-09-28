// Feature module: rebuild-flow — 「还原写作对象」 on the desk itself.
//
// The window turns a finished article back into writing objects. It used to
// ask the local model for a whole study pack from someone else's article and
// wrote it straight into a new disk. It now does what the guests over MCP do:
// it builds a rebuild pack (app/core/rebuild-pack.js), checks it with the same
// validator, and hands it over the same way. A round of the writer's own
// project waits in Review Desk for the writer's click (owner decision D4); a
// new disk has nothing to overwrite and is built at once.
//
// The window reads top to bottom in the order the decisions are made: which
// article, whose it is, where it goes; then the sections; then the checks.
// Sections follow the article (one per `##` heading, neighbours may be
// merged, at least two), are split by rules first and can be renamed or
// merged in the list; the model only drafts what the rules cannot: the
// question sheet's round, the fact ledger, the lineage and a note per section.
// Without a model nothing is handed in (owner decision 2026-09-26).
//
// Loaded with Writing Flow (config.js ensureWritingFlowModule), after it, so
// its helpers (inferRebuildTitle, getRebuildParagraphs) are in scope.
// Contract: tests/features/rebuild-flow.test.mjs

function installRebuildFlowWindow() {
  if (typeof document === "undefined") return;
  if (document.querySelector('[data-window="rebuildFlow"]')) return;
  window.AISystem6ApplicationShell?.createWindow({
    windowName: "rebuildFlow",
    windowClass: "rebuild-flow-window",
    labelledBy: "rebuild-flow-title",
    title: "Rebuild Writing Objects",
    titleKey: "rebuild_writing_flow_title",
    resizable: false,
    shade: false,
    statusClass: "compact-status-bar",
    statusHtml: `<span class="status-bar-leading" id="rebuild-flow-count"></span>
          <span class="status-bar-trailing" id="rebuild-flow-state"></span>`,
    paneClass: "rebuild-flow-pane",
    paneHtml: `
          <div class="rebuild-form">
            <label class="rebuild-label" for="rebuild-flow-source-kind" data-i18n="rebuild_source_label">Article from:</label>
            <div class="select-wrap"><select id="rebuild-flow-source-kind"></select></div>
            <span class="rebuild-label" id="rebuild-flow-mode-label" data-i18n="rebuild_mode_label">Written by:</span>
            <div class="rebuild-choices" role="radiogroup" aria-labelledby="rebuild-flow-mode-label">
              <label><input type="radio" name="rebuild-flow-mode" value="own" /> <span data-i18n="rebuild_mode_own">Me (not a word changed)</span></label>
              <label><input type="radio" name="rebuild-flow-mode" value="study" /> <span data-i18n="rebuild_mode_study">Someone else (take it apart to learn)</span></label>
            </div>
            <span class="rebuild-label" id="rebuild-flow-target-label" data-i18n="rebuild_target_label">Put it in:</span>
            <div class="rebuild-choices" role="radiogroup" aria-labelledby="rebuild-flow-target-label">
              <label><input type="radio" name="rebuild-flow-target" value="round" /> <span id="rebuild-flow-round-label"></span></label>
              <label><input type="radio" name="rebuild-flow-target" value="new-project" /> <span data-i18n="rebuild_target_new">A new Project Hard Disk</span></label>
            </div>
            <label class="rebuild-label" for="rebuild-flow-disk-name" data-rebuild-new-only hidden data-i18n="rebuild_disk_name_label">Disk name:</label>
            <input id="rebuild-flow-disk-name" type="text" data-rebuild-new-only hidden />
            <span class="rebuild-label" data-rebuild-study-only hidden></span>
            <label class="rebuild-check-option" data-rebuild-study-only hidden><input type="checkbox" id="rebuild-flow-docmap" /> <span data-i18n="rebuild_with_docmap">Also make a DocMap</span></label>
          </div>
          <textarea id="rebuild-flow-paste" class="rebuild-paste" rows="8" hidden data-i18n-placeholder="rebuild_paste_hint" placeholder="Paste the article here…"></textarea>
          <div class="rebuild-subhead">
            <p id="rebuild-flow-sections-label" data-i18n="rebuild_sections_label">Sections</p>
            <button class="btn mini-btn" type="button" id="rebuild-flow-merge" data-action="rebuild-merge-section" data-i18n="rebuild_merge_next" disabled>Merge with next</button>
          </div>
          <div class="finder-list rebuild-sections" id="rebuild-flow-sections" role="listbox" tabindex="0" aria-labelledby="rebuild-flow-sections-label"></div>
          <p class="rebuild-carry" id="rebuild-flow-carry" hidden></p>
          <div class="rebuild-run" id="rebuild-flow-run" hidden>
            <div class="progress-meter rebuild-progress-meter" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span id="rebuild-flow-progress-bar"></span></div>
            <p id="rebuild-flow-run-text" aria-live="polite"></p>
          </div>
          <p class="rebuild-subhead-text" id="rebuild-flow-checks-label" data-i18n="rebuild_checks_label">Checks</p>
          <div class="rebuild-check" id="rebuild-flow-checks" role="status" aria-live="polite" aria-labelledby="rebuild-flow-checks-label"></div>
          <div class="button-row rebuild-actions" data-action-availability="independent">
            <button class="btn" type="button" id="rebuild-flow-cancel" data-action="close-rebuild-flow" data-i18n="cancel">Cancel</button>
            <span class="spacer"></span>
            <button class="btn" type="button" id="rebuild-flow-split" data-action="run-rebuild-flow" data-i18n="rebuild_split">Split</button>
            <button class="btn default" type="button" id="rebuild-flow-hand-in" data-action="hand-in-rebuild-flow" data-i18n="rebuild_hand_in">Hand to Review Desk</button>
          </div>`,
  });
}

installRebuildFlowWindow();

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const rebuildFlow = {
  sourceKind: "",
  text: "",
  label: "",
  mode: "own",
  target: "round",
  diskName: "",
  withDocMap: false,
  sections: [],
  // What the model drafted for the current split, or null.
  drafted: null,
  docMap: null,
  verdict: null,
  // empty | split | running | ready | sent | created
  phase: "empty",
  step: 0,
  steps: 0,
  runText: "",
  selected: -1,
  editing: -1,
  receiptId: "",
  createdProjectId: "",
  roundProjectName: "",
  failure: "",
};

function rebuildFlowParts() {
  const win = getWindow("rebuildFlow");
  if (!win) return null;
  const find = (id) => win.querySelector(`#${id}`);
  return {
    win,
    count: find("rebuild-flow-count"),
    state: find("rebuild-flow-state"),
    source: find("rebuild-flow-source-kind"),
    roundLabel: find("rebuild-flow-round-label"),
    diskName: find("rebuild-flow-disk-name"),
    docMap: find("rebuild-flow-docmap"),
    paste: find("rebuild-flow-paste"),
    merge: find("rebuild-flow-merge"),
    list: find("rebuild-flow-sections"),
    carry: find("rebuild-flow-carry"),
    run: find("rebuild-flow-run"),
    bar: find("rebuild-flow-progress-bar"),
    runText: find("rebuild-flow-run-text"),
    checks: find("rebuild-flow-checks"),
    cancel: find("rebuild-flow-cancel"),
    split: find("rebuild-flow-split"),
    handIn: find("rebuild-flow-hand-in"),
  };
}

function rebuildFlowTitleOf(text) {
  const heading = String(text || "").match(/^#\s+(.+)$/m);
  return (heading ? heading[1] : inferRebuildTitle(text)).replace(/\s*\{#[0-9a-f]{6}\}\s*$/, "").trim();
}

// The rebuild pack wants a `# title` first line; an article that has none is
// given its inferred title. The body is never touched.
function rebuildFlowManuscript(text) {
  const clean = String(text || "").replace(/\r\n?/g, "\n").trim();
  if (/^# .+\n/.test(`${clean}\n`)) return clean;
  return `# ${rebuildFlowTitleOf(clean)}\n\n${clean}`;
}

function rebuildFlowCharCount(text) {
  return String(text || "").replace(/\s+/g, "").length;
}

function rebuildFlowSourceText() {
  return rebuildFlow.text || "";
}

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

function rebuildFlowSourceOptions() {
  const teachText = (typeof teachTextBodyInput !== "undefined" ? teachTextBodyInput?.value : "") || "";
  const reader = (typeof currentReaderPage !== "undefined" ? currentReaderPage?.text : "") || "";
  return [
    { value: "teachText", label: t("rebuild_source_teachtext"), disabled: !teachText.trim() },
    { value: "reader", label: t("rebuild_source_reader"), disabled: !reader.trim() },
    { value: "clipboard", label: t("rebuild_source_clipboard") },
    { value: "paste", label: t("rebuild_source_paste") },
    { value: "", label: "──────", disabled: true },
    { value: "sample", label: t("rebuild_source_sample") },
  ];
}

function buildRebuildSampleArticle() {
  const articles = window.AISystem6Content?.rebuildSampleArticles || {};
  return articles[currentLanguage] || articles.en || "";
}

async function readRebuildFlowSource(kind) {
  if (kind === "teachText") return { text: teachTextBodyInput?.value || "", label: t("rebuild_source_teachtext") };
  // The loaded page, never the pane: the pane's innerText is the Reader's own
  // empty-state sentence when nothing is open.
  if (kind === "reader") return { text: currentReaderPage?.text || "", label: currentReaderPage?.title || t("rebuild_source_reader") };
  if (kind === "clipboard") {
    let text = clipboardTextInput?.value || "";
    try {
      const nativeText = await navigator.clipboard?.readText?.();
      if (nativeText?.trim()) text = nativeText;
    } catch {
      // Browser clipboard permission can fail; the AI System 6 Clipboard still works.
    }
    return { text, label: t("rebuild_source_clipboard") };
  }
  if (kind === "paste") return { text: rebuildFlowParts()?.paste?.value || "", label: t("rebuild_source_paste") };
  if (kind === "sample") return { text: buildRebuildSampleArticle(), label: t("rebuild_source_sample") };
  return { text: "", label: "" };
}

async function chooseRebuildFlowSource(kind) {
  rebuildFlow.sourceKind = kind;
  const { text, label } = await readRebuildFlowSource(kind);
  rebuildFlow.text = String(text || "").trim();
  rebuildFlow.label = label;
  // The sample is someone else's article by definition.
  if (kind === "sample") rebuildFlow.mode = "study";
  if (rebuildFlow.mode === "study") rebuildFlow.target = "new-project";
  if (!rebuildFlow.diskName || rebuildFlow.phase === "empty") rebuildFlow.diskName = rebuildFlowDefaultDiskName();
  resetRebuildFlowSplit();
  renderRebuildFlow();
}

function rebuildFlowDefaultDiskName() {
  const title = rebuildFlow.text ? rebuildFlowTitleOf(rebuildFlow.text) : "";
  if (!title) return "";
  return rebuildFlow.mode === "study" ? t("rebuild_study_disk_name", title) : title;
}

function resetRebuildFlowSplit() {
  Object.assign(rebuildFlow, { sections: [], drafted: null, docMap: null, verdict: null, phase: "empty", selected: -1, editing: -1, receiptId: "", createdProjectId: "", failure: "" });
}

// ---------------------------------------------------------------------------
// Sections by rules
// ---------------------------------------------------------------------------

const REBUILD_HEADING = /^## (.+?)(?:\s*\{#[0-9a-f]{6}\})?\s*$/;

// One section per `##` heading. Without headings, paragraphs: each its own
// section up to eight, grouped evenly into six beyond that. A section that
// starts at a paragraph names the words that start it (startQuote), long
// enough that no earlier paragraph starts the same way.
function splitRebuildFlowByRules(markdown) {
  const body = String(markdown || "").replace(/^# .+\n+/, "");
  const headings = body.split("\n").map((line) => line.match(REBUILD_HEADING)).filter(Boolean).map((match) => match[1].trim());
  if (headings.length >= 2) return headings.map((heading) => ({ title: heading, covers: [heading] }));
  const paragraphs = body.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean);
  if (paragraphs.length < 2) return [];
  const size = paragraphs.length <= 8 ? 1 : Math.ceil(paragraphs.length / 6);
  const sections = [];
  for (let start = 0; start < paragraphs.length; start += size) {
    sections.push({ title: t("rebuild_section_n", sections.length + 1), startQuote: start === 0 ? "" : rebuildFlowStartQuote(paragraphs, start) });
  }
  return sections;
}

function rebuildFlowStartQuote(paragraphs, index) {
  const paragraph = paragraphs[index];
  for (let length = 12; length < paragraph.length; length += 6) {
    const quote = paragraph.slice(0, length);
    if (paragraphs.findIndex((entry) => entry.startsWith(quote)) === index) return quote;
  }
  return paragraph;
}

// Word counts and the quote each row shows come from the module's own split,
// so the list shows exactly what the pack will carry.
function rebuildFlowSectionFacts(module, markdown, sections) {
  const split = module.splitSections(markdown, sections);
  return sections.map((section, index) => {
    const part = split.parts[index]?.sourceMarkdown || "";
    const firstLine = part.split("\n").find((line) => line.trim() && !REBUILD_HEADING.test(line)) || "";
    return { ...section, chars: rebuildFlowCharCount(part.replace(/^## .*$/gm, "")), opening: firstLine.trim().slice(0, 40) };
  });
}

// ---------------------------------------------------------------------------
// The model's part
// ---------------------------------------------------------------------------

function rebuildFlowHeadings() {
  const zh = currentLanguage === "zh";
  return {
    round: zh ? "问题单这一轮" : "Question Sheet Round",
    preface: zh ? "大纲前言" : "Outline Preface",
    notes: zh ? "分节说明" : "Section Notes",
    ledger: zh ? "事实账" : "Fact Ledger",
    lineage: zh ? "谱系" : "Lineage",
  };
}

function buildRebuildFlowPrompt(manuscript, sections) {
  const zh = currentLanguage === "zh";
  const h = rebuildFlowHeadings();
  const own = rebuildFlow.mode === "own";
  const sectionLines = sections.map((section, index) => `${index + 1}. ${section.title}${section.opening ? ` — ${zh ? "起句" : "opens with"}「${section.opening}」` : ""}`).join("\n");
  const labels = "官方 / 公开 / 实测 / 作者数据 / 推测";
  return `${own
    ? (zh ? "这是作者自己的文章。正文一个字都不改；你只为它起草写作对象。" : "This is the writer's own article. Do not change a word of it; only draft the writing objects around it.")
    : (zh ? "这是别人的文章，作者拿它来学写法。只写结构和做法，不照抄它的句子。" : "This is someone else's article, studied for how it is written. Describe structure and moves; do not copy its sentences.")}
${zh ? "缺的事实就写不知道，不要补。别人说的话照原话引，并写明谁说的。" : "Missing facts stay unknown; do not fill them in. Quote other people verbatim and say who said it."}

Use these exact level-2 headings:

## ${h.round}
${zh ? "3 到 6 条这一轮要回答的问题，每条一行，以 - 开头。" : "3 to 6 questions this round must answer, one per line starting with -."}

## ${h.preface}
${zh ? "论：一句话主轴（尽量用作者原话）\n做法：一句话\n不写：一句话（写类别，不写具体词）" : "论: the through-line in one sentence (the writer's own words where possible)\n做法: the method in one sentence\n不写: what stays out, as a category"}

## ${h.notes}
${zh ? "为下面每一节写一个 ### 小标题（用序号和节名），下面两行：" : "For each section below write a ### heading (number and title), then two lines:"}
HKRR: H / K / R / Rhythm ${zh ? "中最主要的一个" : "— the main one"}
${zh ? "说明：这一节做什么（一两句）" : "说明: what this section does, in one or two sentences"}
${sections.some((section) => section.startQuote !== undefined) ? (zh ? "这些节没有小标题，再加一行「节名：」给一个四到十个字的节名。" : "These sections have no headings; add a line 「节名:」 with a short title.") : ""}

${zh ? "节：" : "Sections:"}
${sectionLines}

## ${h.ledger}
${zh ? "文章里可核查的说法，每行一条：- 说法 ｜ 来源 ｜ 可信度 ｜ 网址" : "Checkable claims in the article, one per line: - claim | source | label | URL"}
${zh ? `可信度只用：${labels}（两个可用＋连接）。官方和公开要有 https 网址；给不出网址就标推测。` : `Label is one of: ${labels} (two may be joined with ＋). 官方 and 公开 need an https URL; without one, label it 推测.`}

## ${h.lineage}
${zh ? "文章里出现的时间线，每行一条：- 时间 ｜ 事件 ｜ 出处" : "The timeline the article mentions, one per line: - when | event | source"}

${zh ? "文章：" : "Article:"}
${clipContextContent(manuscript, 9000)}`;
}

function rebuildFlowListLines(body) {
  return String(body || "").split("\n").map((line) => line.replace(/^\s*[-*+]\s+/, "").trim()).filter((line) => line && !/^#/.test(line));
}

function rebuildFlowCells(line) {
  return line.split(/\s*[｜|]\s*/).map((cell) => cell.trim());
}

// Read the model's Markdown into pack fields. What cannot stand is dropped and
// counted, never repaired into a claim the model did not make.
function parseRebuildFlowDraft(markdown, sections, module) {
  const clean = stripRebuildMarkdownFence(markdown);
  const blocks = markdownDocumentSectionBlocks(clean, 2);
  const h = rebuildFlowHeadings();
  const find = (...names) => blocks.find((block) => names.some((name) => String(block.title || "").trim().toLowerCase() === name.toLowerCase()))?.body || "";
  const bullets = rebuildFlowListLines(find(h.round, "问题单这一轮", "Question Sheet Round")).slice(0, 8);
  const prefaceText = find(h.preface, "大纲前言", "Outline Preface");
  const prefaceLine = (key) => (prefaceText.match(new RegExp(`${key}\\s*[:：]\\s*(.+)`)) || [])[1]?.trim() || "";
  const noteBlocks = markdownDocumentSectionBlocks(find(h.notes, "分节说明", "Section Notes"), 3);
  const notes = sections.map((section, index) => {
    const block = noteBlocks[index] || {};
    const body = String(block.body || "");
    const hkrr = (body.match(/HKRR\s*[:：]\s*(.+)/i) || [])[1]?.trim() || "";
    const note = (body.match(/说明\s*[:：]\s*(.+)/) || [])[1]?.trim() || rebuildFlowListLines(body).find((line) => !/HKRR|节名/.test(line)) || "";
    const title = (body.match(/节名\s*[:：]\s*(.+)/) || [])[1]?.trim() || "";
    return { hkrr, note, title };
  });
  let dropped = 0;
  const factLedger = rebuildFlowListLines(find(h.ledger, "事实账", "Fact Ledger")).map((line, index) => {
    const [claim = "", source = "", label = "", url = ""] = rebuildFlowCells(line);
    const confidence = module.normalizeConfidence(label);
    const valid = claim && source && confidence.split("＋").every((part) => module.CONFIDENCE_LABELS.includes(part));
    const grounded = /^https:\/\//.test(url) || /作者数据|推测|实测/.test(confidence);
    if (!valid || !grounded) {
      dropped += 1;
      return null;
    }
    return { key: `fact-${index + 1}`, claim, source, confidence, ...(/^https:\/\//.test(url) ? { url } : {}) };
  }).filter(Boolean);
  const timeline = rebuildFlowListLines(find(h.lineage, "谱系", "Lineage")).map((line) => {
    const [when = "", event = "", source = ""] = rebuildFlowCells(line);
    return when && event ? { when, event, source } : null;
  }).filter(Boolean);
  return {
    bullets,
    preface: { thesis: prefaceLine("论"), method: prefaceLine("做法"), avoid: prefaceLine("不写") },
    notes,
    factLedger,
    timeline,
    dropped,
    complete: bullets.length > 0 && notes.some((entry) => entry.note),
  };
}

function rebuildFlowModelLabel() {
  return typeof getLocalModelRequestName === "function" ? String(getLocalModelRequestName() || "") : "";
}

// Streamed: a local model that writes for a minute before its first byte
// would otherwise trip the server's first-byte timeout. An empty stream gets
// one plain retry, as every writing-route pack does.
async function draftRebuildFlowWithModel(manuscript, sections, module, onChars = null) {
  const payload = (stream) => ({
    model: getLocalModelRequestName(),
    messages: withMarkdownModelMessages([
      { role: "system", content: resolveWritingRoutePrompt("writing-route.rebuild-pack") },
      { role: "user", content: buildRebuildFlowPrompt(manuscript, sections) },
    ]),
    temperature: 0.18,
    max_tokens: 3200,
    ai_system6_task_kind: "rebuild",
    stream,
  });
  let markdown = "";
  try {
    const response = await fetchModelPayload(payload(true), getLongTaskSignal());
    markdown = await readRebuildMarkdownPackStream(response, (text) => onChars?.(String(text || "").length));
  } catch (error) {
    if (isAbortError(error) || !/empty writing object pack stream/i.test(String(error?.message || error))) throw error;
    const retry = await fetchModelPayload(payload(false), getLongTaskSignal());
    const data = await readChatJson(retry);
    markdown = data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text || "";
  }
  return parseRebuildFlowDraft(markdown, sections, module);
}

// While the model writes, only the meter and its line move.
function showRebuildFlowDraftProgress(chars) {
  const parts = rebuildFlowParts();
  if (!parts || rebuildFlow.phase !== "running") return;
  rebuildFlow.runText = t("rebuild_run_received", rebuildFlow.sections.length, chars);
  const fraction = Math.min(0.9, chars / 4000);
  const percent = Math.round(((rebuildFlow.step - 1 + fraction) / rebuildFlow.steps) * 100);
  parts.bar.style.setProperty("--progress-fill-width", `${percent}%`);
  parts.bar.parentElement.setAttribute("aria-valuenow", String(percent));
  parts.runText.textContent = rebuildFlow.runText;
}

// ---------------------------------------------------------------------------
// The pack
// ---------------------------------------------------------------------------

function rebuildFlowToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function buildRebuildFlowPack(snapshot) {
  const manuscript = rebuildFlowManuscript(rebuildFlow.text);
  const drafted = rebuildFlow.drafted || { bullets: [], preface: {}, notes: [], factLedger: [], timeline: [] };
  const project = typeof getActiveProject === "function" ? getActiveProject() : null;
  const title = rebuildFlowTitleOf(manuscript);
  const target = rebuildFlow.target === "round" && project
    ? { kind: "round", projectId: project.id, sourceRevision: snapshot?.sourceRevision || "" }
    : { kind: "new-project", name: (rebuildFlow.diskName || title).trim() };
  const pack = {
    packVersion: 1,
    mode: rebuildFlow.mode,
    target,
    roundDate: rebuildFlowToday(),
    roundTitle: t("rebuild_round_title", title),
    manuscript: { title, markdown: manuscript, changes: [] },
    sections: rebuildFlow.sections.map((section, index) => {
      const entry = { title: section.title, hkrrIntent: drafted.notes[index]?.hkrr || "", note: drafted.notes[index]?.note || "", dossierKeys: [] };
      if (section.covers) entry.covers = section.covers;
      else entry.startQuote = section.startQuote || "";
      return entry;
    }),
    outlinePreface: drafted.preface,
    questionSheetRound: { theme: title, bullets: drafted.bullets, stance: [] },
    factLedger: drafted.factLedger,
    dossiers: [],
    lineage: { timeline: drafted.timeline },
    reviewRecord: { selfCheck: t("rebuild_self_check") },
    reviewNote: t("rebuild_review_note", rebuildFlow.label),
  };
  // own: the base is the article itself, so nothing is undeclared; the pack
  // never changes the writer's words.
  if (rebuildFlow.mode === "own") pack.manuscript.base = { text: manuscript };
  if (rebuildFlow.docMap) pack.extraFiles = [{ name: t("rebuild_docmap_file", title), markdown: formatDocMapMarkdown(rebuildFlow.docMap) }];
  return pack;
}

async function checkRebuildFlowPack() {
  await ensureGuestToolsModule();
  const context = await window.AISystem6GuestTools.deskRebuildContext();
  const snapshot = rebuildFlow.target === "round" ? context.snapshot : { project: null, scraps: [], references: [], files: [], baseManuscript: "", sourceRevision: "" };
  const pack = buildRebuildFlowPack(context.snapshot);
  rebuildFlow.verdict = context.module.validateRebuildPack(pack, snapshot);
  return { pack, module: context.module };
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function rebuildFlowSetRun(step, steps, text) {
  Object.assign(rebuildFlow, { step, steps, runText: text });
  renderRebuildFlow();
}

// 「分节」: split by rules at once, then let the model draft the rest.
async function runRebuildFlow() {
  if (rebuildFlow.phase === "running") return;
  if (rebuildFlow.sourceKind === "paste" || rebuildFlow.sourceKind === "clipboard") {
    const fresh = await readRebuildFlowSource(rebuildFlow.sourceKind);
    rebuildFlow.text = String(fresh.text || "").trim();
  }
  if (rebuildFlow.text.length < rebuildMinSourceChars) {
    rebuildFlow.failure = rebuildFlow.text ? t("rebuild_source_too_short") : t("rebuild_need_source");
    renderRebuildFlow();
    return;
  }
  await ensureRebuildPackModule();
  const module = window.AISystem6RebuildPack;
  const manuscript = rebuildFlowManuscript(rebuildFlow.text);
  resetRebuildFlowSplit();
  const sections = splitRebuildFlowByRules(manuscript);
  rebuildFlow.sections = rebuildFlowSectionFacts(module, manuscript, sections);
  rebuildFlow.phase = "split";
  const docMapWanted = rebuildFlow.mode === "study" && rebuildFlow.withDocMap;
  const steps = docMapWanted ? 4 : 3;

  if (rebuildFlow.sections.length >= module.MIN_SECTIONS && modelReadyForRequests()) {
    if (!beginLongTask("rebuild-flow", t("rebuild_drafting"))) return;
    rebuildFlow.phase = "running";
    try {
      rebuildFlowSetRun(1, steps, t("rebuild_run_drafting", rebuildFlow.sections.length));
      rebuildFlow.drafted = await draftRebuildFlowWithModel(manuscript, rebuildFlow.sections, module, showRebuildFlowDraftProgress);
      // Sections split by paragraphs take the titles the model suggested.
      rebuildFlow.sections = rebuildFlow.sections.map((section, index) => {
        const suggested = rebuildFlow.drafted.notes[index]?.title;
        return section.covers || !suggested ? section : { ...section, title: suggested.slice(0, 24) };
      });
      if (docMapWanted) {
        rebuildFlowSetRun(2, steps, t("rebuild_run_docmap"));
        await ensureDocMapModule();
        const docMap = await buildDocMapWithModel({ text: rebuildFlow.text, label: rebuildFlow.label, scope: "rebuildFlow", threshold: rebuildMinSourceChars });
        rebuildFlow.docMap = docMapHasMinimumHierarchy(docMap.nodes, docMap.edges) ? docMap : null;
        if (!rebuildFlow.docMap) rebuildFlow.failure = t("rebuild_docmap_skipped");
      }
      rebuildFlowSetRun(steps - 1, steps, t("rebuild_run_checking"));
      const cancelled = endLongTask("rebuild-flow");
      if (cancelled) {
        resetRebuildFlowSplit();
        renderRebuildFlow();
        return;
      }
    } catch (error) {
      endLongTask("rebuild-flow");
      if (isAbortError(error)) {
        resetRebuildFlowSplit();
        renderRebuildFlow();
        return;
      }
      console.warn("Rebuild Writing Objects model pass failed.", error);
      rebuildFlow.drafted = null;
      rebuildFlow.failure = t("rebuild_model_failed", error.message || "");
    }
  }
  await refreshRebuildFlowChecks();
}

async function refreshRebuildFlowChecks() {
  if (rebuildFlow.sections.length) {
    await checkRebuildFlowPack();
    rebuildFlow.phase = "ready";
  }
  renderRebuildFlow();
}

function rebuildFlowCanHandIn() {
  return rebuildFlow.phase === "ready"
    && Boolean(rebuildFlow.drafted?.complete)
    && rebuildFlow.verdict?.ok === true
    && rebuildFlow.editing < 0;
}

async function handInRebuildFlow() {
  if (rebuildFlow.phase === "sent" || rebuildFlow.phase === "created") {
    openRebuildFlowResult();
    return;
  }
  if (!rebuildFlowCanHandIn()) return;
  const { pack } = await checkRebuildFlowPack();
  if (!rebuildFlow.verdict.ok) {
    renderRebuildFlow();
    return;
  }
  const tools = window.AISystem6GuestTools;
  const meta = { provider: typeof cloudConfig !== "undefined" && cloudConfig?.active ? "cloud" : "local", model: rebuildFlowModelLabel() };
  try {
    if (pack.target.kind === "round") {
      const result = await tools.submitDeskRebuildPack(pack, meta);
      if (!result.ok) {
        rebuildFlow.verdict = { ok: false, errors: result.errors, warnings: result.warnings };
      } else {
        rebuildFlow.receiptId = result.receiptId;
        rebuildFlow.phase = "sent";
        setStatus(t("rebuild_sent_status"));
      }
    } else {
      const result = await tools.createProjectFromRebuildPack(pack, meta);
      if (!result.ok) {
        rebuildFlow.verdict = { ok: false, errors: result.errors, warnings: result.warnings };
      } else {
        rebuildFlow.createdProjectId = result.projectId;
        rebuildFlow.phase = "created";
        setStatus(t("rebuild_created_status", pack.target.name));
        if (rebuildFlow.docMap) showDocMap(rebuildFlow.docMap, { focus: false });
        // Mounting the new disk closes the old project's windows, this one
        // with them; bring it back so the result and its next step show.
        openWindow("rebuildFlow");
      }
    }
  } catch (error) {
    console.warn("Rebuild hand-in failed.", error);
    rebuildFlow.failure = t("rebuild_hand_in_failed", error.message || "");
  }
  renderRebuildFlow();
}

// Stop is the same abort every long model task on the desk listens to.
function stopRebuildFlow() {
  if (rebuildFlow.phase === "running") activeAbortController?.abort();
}

function openRebuildFlowResult() {
  if (rebuildFlow.phase === "sent") {
    openReviewDesk("guests");
    return;
  }
  if (rebuildFlow.phase === "created") {
    openWindow("questionSheet");
    focusWindow(getWindow("questionSheet"));
  }
}

function mergeRebuildSection() {
  const index = rebuildFlow.selected;
  const next = rebuildFlow.sections[index + 1];
  const here = rebuildFlow.sections[index];
  if (!here || !next || rebuildFlow.phase === "running") return;
  const merged = { ...here, chars: (here.chars || 0) + (next.chars || 0) };
  if (here.covers) merged.covers = [...here.covers, ...(next.covers || [])];
  rebuildFlow.sections.splice(index, 2, merged);
  if (rebuildFlow.drafted) {
    const notes = rebuildFlow.drafted.notes;
    const joined = [notes[index]?.note, notes[index + 1]?.note].filter(Boolean).join(" ");
    notes.splice(index, 2, { ...(notes[index] || {}), note: joined });
  }
  refreshRebuildFlowChecks();
}

// ---------------------------------------------------------------------------
// In-list editing (owner decision D4): Return on a selected row edits its
// title and, for a paragraph-split section, the words it starts with.
// ---------------------------------------------------------------------------

function beginRebuildSectionEdit(index) {
  if (!rebuildFlow.sections[index] || rebuildFlow.phase === "running") return;
  rebuildFlow.editing = index;
  renderRebuildFlow();
  rebuildFlowParts()?.list?.querySelector(".rebuild-edit-title")?.focus();
}

function commitRebuildSectionEdit(save) {
  const index = rebuildFlow.editing;
  const parts = rebuildFlowParts();
  const section = rebuildFlow.sections[index];
  if (save && section && parts) {
    const title = parts.list.querySelector(".rebuild-edit-title")?.value.trim();
    const quote = parts.list.querySelector(".rebuild-edit-quote")?.value.trim();
    if (title) section.title = title;
    if (quote !== undefined && !section.covers && index > 0) section.startQuote = quote;
  }
  rebuildFlow.editing = -1;
  refreshRebuildFlowChecks().then(() => rebuildFlowParts()?.list?.focus());
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function rebuildFlowCheckLines() {
  const verdict = rebuildFlow.verdict || { errors: [], warnings: [] };
  const errors = verdict.errors || [];
  const has = (code) => errors.some((entry) => entry.code === code);
  const lines = [];
  const count = rebuildFlow.sections.length;
  if (rebuildFlow.mode === "own") {
    lines.push(has("E3") ? ["bad", t("rebuild_check_text_differs")] : ["ok", t("rebuild_check_text_same")]);
  } else {
    lines.push(["ok", t("rebuild_check_study_reading")]);
  }
  if (has("E0")) lines.push(["bad", t("rebuild_check_title")]);
  if (has("E1")) {
    lines.push(["bad", errors.find((entry) => entry.code === "E1" && /at least/.test(entry.message)) ? t("rebuild_check_min_sections") : t("rebuild_check_section_names")]);
  }
  const badStarts = errors.filter((entry) => entry.code === "E2").map((entry) => Number((entry.path.match(/\[(\d+)\]/) || [])[1]));
  if (badStarts.length) {
    badStarts.filter(Number.isInteger).forEach((index) => lines.push(["bad", t("rebuild_check_start_missing", index + 1)]));
  } else if (!has("E1")) {
    const byHeadings = rebuildFlow.sections.every((section) => section.covers);
    lines.push(["ok", byHeadings ? t("rebuild_check_by_headings", count) : t("rebuild_check_by_paragraphs", count)]);
  }
  if (!rebuildFlow.drafted) {
    lines.push(["bad", modelReadyForRequests() ? t("rebuild_check_not_drafted") : t("rebuild_check_no_model")]);
  } else if (!rebuildFlow.drafted.complete) {
    lines.push(["bad", t("rebuild_check_draft_incomplete")]);
  } else {
    const ledger = rebuildFlow.drafted.factLedger.length;
    if (has("E4")) lines.push(["bad", t("rebuild_check_ledger_bad")]);
    else if (!ledger) lines.push(["warn", t("rebuild_check_ledger_empty", rebuildFlow.drafted.bullets.length)]);
    else lines.push(["ok", t("rebuild_check_ledger", ledger, rebuildFlow.drafted.bullets.length)]);
    if (rebuildFlow.drafted.dropped) lines.push(["warn", t("rebuild_check_dropped", rebuildFlow.drafted.dropped)]);
    const guesses = (verdict.warnings || []).filter((entry) => entry.code === "W4").length;
    if (guesses) lines.push(["warn", t("rebuild_check_guesses", guesses)]);
  }
  const privacy = errors.filter((entry) => entry.code === "E6");
  lines.push(privacy.length ? ["bad", t("rebuild_check_private", privacy.length)] : ["ok", t("rebuild_check_no_private")]);
  if (has("E7")) lines.push(["bad", t("rebuild_check_stale")]);
  if (has("E8")) lines.push(["bad", t("rebuild_check_target")]);
  if (has("E5")) lines.push(["bad", t("rebuild_check_dossiers")]);
  if (rebuildFlow.failure) lines.push(["warn", rebuildFlow.failure]);
  return lines;
}

function rebuildFlowSummary(lines) {
  if (rebuildFlow.phase === "sent") return t("rebuild_summary_sent");
  if (rebuildFlow.phase === "created") return t("rebuild_summary_created", rebuildFlow.diskName);
  if (lines.some(([kind]) => kind === "bad")) return rebuildFlow.drafted || modelReadyForRequests() ? t("rebuild_summary_fix") : t("rebuild_summary_no_model");
  return rebuildFlow.target === "round" ? t("rebuild_summary_ready_round") : t("rebuild_summary_ready_new");
}

function renderRebuildFlowSources(parts) {
  const options = rebuildFlowSourceOptions();
  if (!rebuildFlow.sourceKind) rebuildFlow.sourceKind = options.find((option) => option.value && !option.disabled)?.value || "paste";
  parts.source.innerHTML = options.map((option) => `<option value="${escapeHtml(option.value)}"${option.disabled ? " disabled" : ""}${option.value === rebuildFlow.sourceKind ? " selected" : ""}>${escapeHtml(option.label)}</option>`).join("");
}

function renderRebuildFlowSections(parts) {
  const list = parts.list;
  if (!rebuildFlow.sections.length) {
    list.innerHTML = `<div class="rebuild-empty"><p><b>${escapeHtml(t("rebuild_empty_title"))}</b></p><p>${escapeHtml(t("rebuild_empty_rule"))}</p><p>${escapeHtml(t("rebuild_empty_edit"))}</p></div>`;
    list.removeAttribute("aria-activedescendant");
    return;
  }
  const badIndexes = new Set((rebuildFlow.verdict?.errors || []).filter((entry) => entry.code === "E2").map((entry) => Number((entry.path.match(/\[(\d+)\]/) || [])[1])));
  const header = `<div class="finder-list-header" aria-hidden="true"><span>№</span><span>${escapeHtml(t("rebuild_col_title"))}</span><span>${escapeHtml(t("rebuild_col_start"))}</span><span>${escapeHtml(t("rebuild_col_chars"))}</span></div>`;
  const rows = rebuildFlow.sections.map((section, index) => {
    const selected = index === rebuildFlow.selected;
    const bad = badIndexes.has(index);
    const start = section.covers ? section.opening : (index === 0 ? section.opening : section.startQuote);
    if (index === rebuildFlow.editing) {
      const quoteField = !section.covers && index > 0
        ? `<input class="rebuild-edit-quote" type="text" value="${escapeHtml(section.startQuote || "")}" aria-label="${escapeHtml(t("rebuild_col_start"))}" />`
        : `<span>「${escapeHtml(start || "")}…」</span>`;
      return `<div class="finder-list-row is-selected is-editing" id="rebuild-row-${index}" role="option" aria-selected="true"><span>${index + 1}</span><input class="rebuild-edit-title" type="text" value="${escapeHtml(section.title)}" aria-label="${escapeHtml(t("rebuild_col_title"))}" />${quoteField}<span>${section.chars ?? ""}</span></div>`;
    }
    return `<div class="finder-list-row${selected ? " is-selected" : ""}${bad ? " is-bad" : ""}" id="rebuild-row-${index}" role="option" aria-selected="${selected}" data-rebuild-row="${index}"><span>${index + 1}</span><span>${escapeHtml(section.title)}</span><span>「${escapeHtml(start || "")}…」</span><span>${bad ? "—" : section.chars ?? ""}</span></div>`;
  });
  list.innerHTML = header + rows.join("");
  if (rebuildFlow.selected >= 0) list.setAttribute("aria-activedescendant", `rebuild-row-${rebuildFlow.selected}`);
  else list.removeAttribute("aria-activedescendant");
}

function renderRebuildFlow() {
  const parts = rebuildFlowParts();
  if (!parts) return;
  const project = typeof getActiveProject === "function" ? getActiveProject() : null;
  const running = rebuildFlow.phase === "running";
  const done = rebuildFlow.phase === "sent" || rebuildFlow.phase === "created";
  if (!project && rebuildFlow.target === "round") rebuildFlow.target = "new-project";
  if (rebuildFlow.mode === "study") rebuildFlow.target = "new-project";

  renderRebuildFlowSources(parts);
  parts.win.querySelectorAll('input[name="rebuild-flow-mode"]').forEach((input) => {
    input.checked = input.value === rebuildFlow.mode;
    input.disabled = running || done;
  });
  parts.win.querySelectorAll('input[name="rebuild-flow-target"]').forEach((input) => {
    input.checked = input.value === rebuildFlow.target;
    input.disabled = running || done || (input.value === "round" && (rebuildFlow.mode === "study" || !project));
  });
  // Once the work has left, the label keeps naming the project it was for,
  // even after a new disk has become the active one.
  if (!done) rebuildFlow.roundProjectName = project ? project.name : "";
  parts.roundLabel.textContent = rebuildFlow.roundProjectName ? t("rebuild_target_round", rebuildFlow.roundProjectName) : t("rebuild_target_round_none");
  const isNew = rebuildFlow.target === "new-project";
  parts.win.querySelectorAll("[data-rebuild-new-only]").forEach((element) => { element.hidden = !isNew; });
  parts.win.querySelectorAll("[data-rebuild-study-only]").forEach((element) => { element.hidden = rebuildFlow.mode !== "study"; });
  if (document.activeElement !== parts.diskName) parts.diskName.value = rebuildFlow.diskName;
  parts.diskName.disabled = running || done;
  parts.docMap.checked = rebuildFlow.withDocMap;
  parts.docMap.disabled = running || done;
  parts.source.disabled = running || done;
  // The System 6 select draws its own face; redraw it after the options and
  // the disabled state are both settled.
  if (typeof refreshSystemSelectControl === "function") refreshSystemSelectControl(parts.source);
  parts.paste.hidden = rebuildFlow.sourceKind !== "paste" || rebuildFlow.sections.length > 0;

  renderRebuildFlowSections(parts);
  parts.merge.disabled = running || done || rebuildFlow.selected < 0 || rebuildFlow.selected >= rebuildFlow.sections.length - 1;

  const drafted = rebuildFlow.drafted;
  parts.carry.hidden = !drafted?.complete || running;
  if (drafted?.complete) parts.carry.textContent = t("rebuild_carry", drafted.bullets.length, drafted.factLedger.length, drafted.timeline.length);

  parts.run.hidden = !running;
  const percent = rebuildFlow.steps ? Math.round((rebuildFlow.step / rebuildFlow.steps) * 100) : 0;
  parts.bar.style.setProperty("--progress-fill-width", `${percent}%`);
  parts.bar.parentElement.setAttribute("aria-valuenow", String(percent));
  parts.bar.parentElement.classList.toggle("is-working", running);
  parts.runText.textContent = rebuildFlow.runText;

  const hasSplit = rebuildFlow.sections.length > 0 && !running;
  parts.checks.hidden = !hasSplit;
  parts.win.querySelector("#rebuild-flow-checks-label").hidden = !hasSplit;
  if (hasSplit) {
    const lines = rebuildFlowCheckLines();
    const marks = { ok: "✓", warn: "!", bad: "✕" };
    parts.checks.innerHTML = lines.map(([kind, text]) => `<p class="is-${kind}"><span aria-hidden="true">${marks[kind]}</span><span>${escapeHtml(text)}</span></p>`).join("")
      + `<p class="rebuild-summary">${escapeHtml(rebuildFlowSummary(lines))}</p>`;
  } else if (rebuildFlow.failure) {
    parts.checks.hidden = false;
    parts.checks.innerHTML = `<p class="is-warn"><span aria-hidden="true">!</span><span>${escapeHtml(rebuildFlow.failure)}</span></p>`;
  }

  const chars = rebuildFlowCharCount(rebuildFlow.text);
  parts.count.textContent = rebuildFlow.sections.length ? t("rebuild_count_sections", rebuildFlow.sections.length, chars) : (chars ? t("rebuild_count_chars", chars) : t("rebuild_no_source"));
  parts.state.textContent = {
    empty: rebuildFlow.text ? t("rebuild_state_unsplit") : "",
    split: t("rebuild_state_unsplit"),
    running: t("rebuild_state_running"),
    ready: rebuildFlowCanHandIn() ? (isNew ? t("rebuild_state_ready_new") : t("rebuild_state_ready_round")) : t("rebuild_state_fix"),
    sent: t("rebuild_state_sent"),
    created: t("rebuild_state_created"),
  }[rebuildFlow.phase] || "";

  // Buttons: the default moves with the state. Cancel becomes Stop while the
  // model runs and Close once the work has left the window.
  parts.cancel.dataset.action = running ? "rebuild-stop" : "close-rebuild-flow";
  parts.cancel.textContent = running ? t("stop") : (done ? t("close") : t("cancel"));
  parts.split.hidden = done;
  parts.split.textContent = rebuildFlow.sections.length ? t("rebuild_resplit") : t("rebuild_split");
  parts.split.disabled = running || rebuildFlow.text.length < rebuildMinSourceChars && rebuildFlow.sourceKind !== "paste" && rebuildFlow.sourceKind !== "clipboard";
  parts.handIn.textContent = done
    ? (rebuildFlow.phase === "sent" ? t("rebuild_open_review_desk") : t("rebuild_open_new_disk"))
    : (isNew ? t("rebuild_create_disk") : t("rebuild_hand_in"));
  parts.handIn.disabled = !done && !rebuildFlowCanHandIn();
  const defaultButton = rebuildFlow.sections.length || done ? parts.handIn : parts.split;
  parts.split.classList.toggle("default", defaultButton === parts.split);
  parts.handIn.classList.toggle("default", defaultButton === parts.handIn);
}

function rebuildFlowDefaultButton() {
  const parts = rebuildFlowParts();
  if (!parts) return null;
  const button = parts.handIn.classList.contains("default") ? parts.handIn : parts.split;
  return button.disabled || button.hidden ? null : button;
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

function wireRebuildFlowWindow() {
  const parts = rebuildFlowParts();
  if (!parts || parts.win.dataset.rebuildWired) return;
  parts.win.dataset.rebuildWired = "true";
  parts.source.addEventListener("change", () => chooseRebuildFlowSource(parts.source.value));
  parts.win.querySelectorAll('input[name="rebuild-flow-mode"]').forEach((input) => input.addEventListener("change", () => {
    rebuildFlow.mode = input.value;
    rebuildFlow.target = input.value === "study" ? "new-project" : (typeof getActiveProject === "function" && getActiveProject() ? "round" : "new-project");
    rebuildFlow.diskName = rebuildFlowDefaultDiskName();
    resetRebuildFlowSplit();
    renderRebuildFlow();
  }));
  parts.win.querySelectorAll('input[name="rebuild-flow-target"]').forEach((input) => input.addEventListener("change", () => {
    rebuildFlow.target = input.value;
    if (rebuildFlow.sections.length) refreshRebuildFlowChecks();
    else renderRebuildFlow();
  }));
  parts.diskName.addEventListener("input", () => {
    rebuildFlow.diskName = parts.diskName.value;
  });
  parts.diskName.addEventListener("change", () => {
    if (rebuildFlow.sections.length) refreshRebuildFlowChecks();
  });
  parts.docMap.addEventListener("change", () => {
    rebuildFlow.withDocMap = parts.docMap.checked;
  });
  parts.paste.addEventListener("input", () => {
    rebuildFlow.text = parts.paste.value.trim();
    renderRebuildFlowCountOnly();
  });
  parts.list.addEventListener("click", (event) => {
    const row = event.target.closest("[data-rebuild-row]");
    if (!row || rebuildFlow.editing >= 0) return;
    rebuildFlow.selected = Number(row.dataset.rebuildRow);
    renderRebuildFlow();
  });
  parts.list.addEventListener("dblclick", (event) => {
    const row = event.target.closest("[data-rebuild-row]");
    if (row) beginRebuildSectionEdit(Number(row.dataset.rebuildRow));
  });
  parts.list.addEventListener("keydown", (event) => {
    if (rebuildFlow.editing >= 0) {
      if (event.key === "Enter") {
        event.preventDefault();
        commitRebuildSectionEdit(true);
      } else if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        commitRebuildSectionEdit(false);
      }
      return;
    }
    const last = rebuildFlow.sections.length - 1;
    if (last < 0) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      rebuildFlow.selected = Math.max(0, Math.min(last, (rebuildFlow.selected < 0 ? (step > 0 ? -1 : last + 1) : rebuildFlow.selected) + step));
      renderRebuildFlow();
    } else if (event.key === "Enter" && rebuildFlow.selected >= 0) {
      event.preventDefault();
      event.stopPropagation();
      beginRebuildSectionEdit(rebuildFlow.selected);
    }
  });
  // Return presses the default button and Esc cancels, as in a dialog; the
  // list and text fields keep their own keys.
  parts.win.addEventListener("keydown", (event) => {
    if (event.defaultPrevented || event.target.closest(".rebuild-sections, textarea, input[type='text']")) return;
    if (event.key === "Enter" && !event.metaKey && !event.ctrlKey) {
      const button = rebuildFlowDefaultButton();
      if (button) {
        event.preventDefault();
        button.click();
      }
    } else if (event.key === "Escape" && rebuildFlow.phase !== "running") {
      event.preventDefault();
      closeWindow("rebuildFlow", true);
    }
  });
  if (typeof initSystemSelectControls === "function") initSystemSelectControls();
}

function renderRebuildFlowCountOnly() {
  const parts = rebuildFlowParts();
  if (!parts) return;
  const chars = rebuildFlowCharCount(rebuildFlow.text);
  parts.count.textContent = chars ? t("rebuild_count_chars", chars) : t("rebuild_no_source");
  parts.split.disabled = rebuildFlow.text.length < rebuildMinSourceChars;
}

function openRebuildFlow() {
  wireRebuildFlowWindow();
  const project = typeof getActiveProject === "function" ? getActiveProject() : null;
  if (rebuildFlow.phase === "sent" || rebuildFlow.phase === "created" || !rebuildFlow.sourceKind) {
    resetRebuildFlowSplit();
    rebuildFlow.sourceKind = "";
    rebuildFlow.mode = "own";
    rebuildFlow.target = project ? "round" : "new-project";
    renderRebuildFlowSources(rebuildFlowParts());
    chooseRebuildFlowSource(rebuildFlow.sourceKind);
  } else {
    renderRebuildFlow();
  }
  openWindow("rebuildFlow");
  rebuildFlowParts()?.source?.focus();
}

window.AISystem6RebuildFlowLoaded = true;
