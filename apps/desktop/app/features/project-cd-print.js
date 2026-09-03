// Lazy feature module: project-cd-print.

// finishingReceipt's markup lived in index.html, downloaded by every boot for a
// window this module already loads on demand. Built here at module eval,
// before anything below queries its own elements. openWindow() installs
// the grow box.
function installFinishingReceiptWindow() {
  if (typeof document === "undefined") return;
  if (document.querySelector('[data-window="finishingReceipt"]')) return;
  window.AISystem6ApplicationShell.createWindow({
    windowName: "finishingReceipt",
    windowClass: "info-window finishing-receipt-window",
    labelledBy: "finishing-receipt-title",
    titleKey: "finishing_receipt",
    title: "Finishing Receipt",
    paneClass: "info-pane",
    paneHtml: `
          <div class="info-header">
            <span class="large-mini-icon sys-icon" data-system-icon="projectDisc" aria-hidden="true"></span>
            <div class="info-main">
              <h3 id="finishing-receipt-name">--</h3>
              <p class="hint" id="finishing-receipt-kind">--</p>
            </div>
          </div>
          <hr />
          <dl class="info-stats" id="finishing-receipt-stats"></dl>
          <div class="receipt-kept" id="finishing-receipt-kept" hidden></div>`,
  });
}

installFinishingReceiptWindow();
// Loaded during boot as a classic script; shares the AI System 6 global scope.



const defaultPageSetupSettings = Object.freeze({
  paper: "a4",
  orientation: "portrait",
  density: "manuscript",
});

function normalizePageSetupState(state = {}) {
  return {
    paper: ["a4", "letter"].includes(state.paper) ? state.paper : defaultPageSetupSettings.paper,
    orientation: ["portrait", "landscape"].includes(state.orientation) ? state.orientation : defaultPageSetupSettings.orientation,
    density: ["manuscript", "compact"].includes(state.density) ? state.density : defaultPageSetupSettings.density,
  };
}

function syncPageSetupControls() {
  pageSetupSettings = normalizePageSetupState(pageSetupSettings);
  pageSetupInputs.forEach((input) => {
    input.checked = pageSetupSettings[input.dataset.pageSetupKey] === input.value;
  });
}

function restorePageSetupState(state = {}) {
  pageSetupSettings = normalizePageSetupState(state);
  syncPageSetupControls();
}

function updatePageSetupFromControls() {
  const next = { ...pageSetupSettings };
  pageSetupInputs.forEach((input) => {
    if (input.checked) next[input.dataset.pageSetupKey] = input.value;
  });
  pageSetupSettings = normalizePageSetupState(next);
  syncPageSetupControls();
  saveDeskState();
  setStatus(t("page_setup_saved"));
}

function openPageSetup() {
  syncPageSetupControls();
  openWindow("pageSetup");
}

function pageSetupPaperCss() {
  return pageSetupSettings.paper === "letter" ? "Letter" : "A4";
}

function projectCdPrintDensityClass() {
  return pageSetupSettings.density === "compact" ? "compact" : "manuscript";
}

// --- One Page Setup, two kinds of paper -------------------------------------
//
// The printed page and the Word page must agree, and the only way to make two
// generators agree is to stop them choosing. Every measurement of the page --
// the sheet, the margin, the body size, the leading, the heading scale and
// the face -- is decided once, here, from the writer's Page Setup. The print
// stylesheet below reads this object; word-export.js reads the same object
// and converts it to twips. Neither one keeps a number of its own, so there
// is no second table to fall out of step.
const projectCdPaperSizes = Object.freeze({
  a4: Object.freeze({ css: "A4", widthMm: 210, heightMm: 297 }),
  letter: Object.freeze({ css: "Letter", widthMm: 215.9, heightMm: 279.4 }),
});

const projectCdDensityMetrics = Object.freeze({
  manuscript: Object.freeze({ marginMm: 20, fontPt: 11.5, lineHeight: 1.58, cellPadding: "0.35em 0.5em" }),
  compact: Object.freeze({ marginMm: 14, fontPt: 10.5, lineHeight: 1.42, cellPadding: "0.22em 0.35em" }),
});

// A heading is a multiple of the body size, so one setting moves the whole
// page together. Word gets the same three multipliers.
const projectCdHeadingScale = Object.freeze({ 1: 1.75, 2: 1.25, 3: 1.1 });

function projectCdPaperMetrics() {
  const paper = projectCdPaperSizes[pageSetupSettings.paper === "letter" ? "letter" : "a4"];
  const densityClass = projectCdPrintDensityClass();
  const density = projectCdDensityMetrics[densityClass];
  const zh = currentLanguage === "zh";
  return {
    paperCss: paper.css,
    widthMm: paper.widthMm,
    heightMm: paper.heightMm,
    orientation: pageSetupSettings.orientation === "landscape" ? "landscape" : "portrait",
    densityClass,
    marginMm: density.marginMm,
    fontPt: density.fontPt,
    lineHeight: density.lineHeight,
    cellPadding: density.cellPadding,
    headingScale: projectCdHeadingScale,
    // The two faces the printed page has always used. Word takes the family
    // name alone, because a .docx names one face and cannot carry a stack.
    fontFamilyCss: zh ? '"Songti SC", "SimSun", "STSong", serif' : 'Georgia, "Times New Roman", serif',
    wordFontName: zh ? "Songti SC" : "Georgia",
    language: zh ? "zh-Hans" : "en",
  };
}

/**
 * The pages of one document.
 *
 * `documentModel` lets a caller hand in a parse it already has. The Word
 * export does that: the pages the writer looks at and the .docx the button
 * writes must come from the same token stream, and the only way to be sure of
 * that is to parse once and pass the result.
 */
function buildProjectCdPrintHtml(item, { wordExport = false, documentModel = null } = {}) {
  documentModel = documentModel || parseMarkdownDocument(item.body || "");
  const title = item.title?.replace(/\.md$/i, "") || t("project_cd");
  const metrics = projectCdPaperMetrics();
  const orientation = metrics.orientation;
  const densityClass = metrics.densityClass;
  const paperWidth = orientation === "landscape" ? "1040px" : "760px";
  return `<!doctype html>
<html lang="${metrics.language}">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: ${metrics.paperCss} ${orientation}; margin: ${metrics.marginMm}mm; }
    :root {
      color: #111;
      background: #fff;
      font-family: ${metrics.fontFamilyCss};
      font-size: ${metrics.fontPt}pt;
      line-height: ${metrics.lineHeight};
    }
    body { margin: 0; background: #fff; color: #111; }
    main { max-width: 100%; }
    h1 { margin: 0 0 1.2em; text-align: center; font-size: ${metrics.headingScale[1]}em; line-height: 1.2; }
    h2 { margin: 1.7em 0 0.65em; font-size: ${metrics.headingScale[2]}em; border-bottom: 1px solid #111; padding-bottom: 0.18em; }
    h3 { margin: 1.25em 0 0.5em; font-size: ${metrics.headingScale[3]}em; }
    p { margin: 0.72em 0; }
    ul, ol { margin: 0.72em 0 0.72em 1.4em; padding: 0; }
    li { margin: 0.28em 0; }
    blockquote { margin: 1em 0; padding: 0.2em 0 0.2em 1em; border-left: 3px solid #555; }
    code { font-family: Menlo, Monaco, Consolas, monospace; font-size: 0.92em; }
    pre { white-space: pre-wrap; border: 1px solid #999; padding: 0.8em; break-inside: avoid; }
    table { width: 100%; border-collapse: collapse; margin: 1em 0; break-inside: auto; font-size: 0.92em; }
    th, td { border: 1px solid #999; padding: ${metrics.cellPadding}; vertical-align: top; }
    th { background: #eee; font-weight: bold; }
    img { max-width: 100%; height: auto; break-inside: avoid; }
    hr { border: 0; border-top: 1px solid #777; margin: 1.4em 0; }
    a { color: inherit; text-decoration: underline; }
    @media screen {
      body { padding: 24px; background: #d8d8d8; }
      main { max-width: ${paperWidth}; margin: 0 auto; padding: 48px; background: #fff; box-shadow: 0 2px 18px rgba(0,0,0,0.24); }
    }
    .word-export-foot { display: none; }
    @media screen {
      .word-export-foot { display: block; max-width: ${paperWidth}; margin: 0 auto; padding: 14px 48px 0; font: 12px -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif; text-align: right; }
      .word-export-refusal { margin: 0 0 8px; text-align: left; color: #111; white-space: pre-line; }
      .word-export-save { font: inherit; padding: 4px 14px; }
    }
  </style>
</head>
<body>
  <main class="${densityClass}">
    ${documentModel.html}
  </main>
${wordExport ? `  <div class="word-export-foot">
    <p class="word-export-refusal" data-word-export-refusal hidden></p>
    <button class="word-export-save" type="button" data-word-export-save>${escapeHtml(t("save_as_word"))}</button>
  </div>
` : ""}</body>
</html>`;
}

function printSelectedProjectCdPdf() {
  const item = getSelectedProjectCdItem();
  if (!item) return false;

  const printWindow = window.open("", "_blank", "width=960,height=720");
  if (!printWindow) {
    setStatus(t("project_cd_pdf_blocked"));
    return false;
  }

  printWindow.document.open();
  printWindow.document.write(buildProjectCdPrintHtml(item));
  printWindow.document.close();
  setStatus(t("project_cd_pdf_printing", item.title));
  setTimeout(() => {
    try {
      printWindow.focus();
      printWindow.print();
    } catch {
      setStatus(t("project_cd_pdf_blocked"));
    }
  }, 120);
  return true;
}

function printCurrentTeachTextDocument() {
  const body = String(teachTextBodyInput?.value || "");
  if (!body.trim()) return;
  const title = getTeachTextDocumentName({
    fallback: teachTextNameInput?.value?.trim() || t("untitled"),
  });
  const printWindow = window.open("", "_blank", "width=960,height=720");
  if (!printWindow) {
    setStatus(t("project_cd_pdf_blocked"));
    return;
  }
  printWindow.document.open();
  printWindow.document.write(buildProjectCdPrintHtml({ title, body }));
  printWindow.document.close();
  setStatus(t("project_cd_pdf_printing", title));
  setTimeout(() => {
    try {
      printWindow.focus();
      printWindow.print();
    } catch {
      setStatus(t("project_cd_pdf_blocked"));
    }
  }, 120);
}

// --- Word Document -----------------------------------------------------------
//
// A document is not finished until somebody has looked at it as pages. So
// "Word Document…" does not write a file. It opens the same preview the
// printed page opens -- grey ground, white paper, the writer's own Page Setup
// -- and puts one more way off that paper at its foot.
//
// The button writes the file. The preview is what the writer approves first.

const wordExportProblemKeys = Object.freeze({
  empty_body: "word_export_problem_empty_body",
  empty_heading: "word_export_problem_empty_heading",
  heading_skipped: "word_export_problem_heading_skipped",
  ragged_table: "word_export_problem_ragged_table",
  image_without_alt: "word_export_problem_image_without_alt",
});

const wordExportCommentSkipKeys = Object.freeze({
  anchor_not_found: "word_export_comment_skip_anchor_not_found",
  anchor_ambiguous: "word_export_comment_skip_anchor_ambiguous",
  anchor_empty: "word_export_comment_skip_anchor_empty",
  note_empty: "word_export_comment_skip_note_empty",
  anchor_unplaceable: "word_export_comment_skip_anchor_unplaceable",
});

// The detail is a fact read from the document: the two heading levels, the
// row and its cell counts, the address of the picture. It is not translated,
// because it is the writer's own material.
function wordExportProblemLine(problem) {
  const label = t(wordExportProblemKeys[problem.code] || "word_export_problem_empty_body");
  return problem.detail ? `${label} — ${problem.detail}` : label;
}

/**
 * The Review Desk's findings, read from the report it is showing.
 *
 * The report is the only place the findings exist -- it is model output the
 * writer has not saved anywhere yet -- so it is read where it is, and nothing
 * is stored on the way past. A report for another manuscript costs nothing
 * either: an anchor that is not in this document is refused, not moved.
 *
 * @returns {Array<{ anchor: string, note: string, author: string }>}
 */
function wordExportReviewFindings() {
  const host = typeof claimResultsEl !== "undefined" ? claimResultsEl : null;
  if (!host || host.classList.contains("is-hidden")) return [];
  const author = t("review_desk");
  const findings = [];

  // The review reports are tables whose first column is the sentence the
  // finding is about.
  host.querySelectorAll("table").forEach((table) => {
    const rows = [...table.querySelectorAll("tr")].map((row) =>
      [...row.querySelectorAll("th, td")].map((cell) => cell.textContent || "")
    );
    findings.push(...window.AISystem6WordExport.reviewFindingsFromRows(rows, { author }));
  });

  // An online claim check answers in cards instead: the claim in bold, the
  // verdict and the answer under it.
  host.querySelectorAll(".context-item").forEach((card) => {
    const anchor = String(card.querySelector("strong")?.textContent || "").trim();
    const note = [...card.querySelectorAll("p")].map((line) => String(line.textContent || "").trim()).filter(Boolean).join("\n");
    if (anchor && note) findings.push({ anchor, note, author });
  });

  return findings;
}

/**
 * Say what became of the review notes. Counts and reasons only: how many
 * became comments, and the words of every note that could not be anchored.
 *
 * @param {{ requested: number, placed: number, skipped: Array<any> }} report
 * @returns {string}
 */
function wordExportCommentLines(report) {
  if (!report || !report.requested) return "";
  const lines = [t("word_export_comments_planned", report.placed, report.requested)];
  if (report.skipped.length) {
    lines.push(t("word_export_comments_unanchored", report.skipped.length));
    for (const skipped of report.skipped) {
      const reason = t(wordExportCommentSkipKeys[skipped.reason] || "word_export_comment_skip_anchor_not_found");
      const quoted = skipped.anchor ? `“${skipped.anchor}” — ` : "";
      lines.push(`${quoted}${reason}${skipped.detail ? ` (${skipped.detail})` : ""}`);
    }
  }
  return lines.join("\n");
}

/**
 * Attach the Save button of one preview window.
 *
 * The listener is added from this side, not written into the preview as a
 * script, so the export keeps running in the application that owns the
 * document. The preview window only shows pages, and says what the export
 * refused: a structural problem, or a review note that could not be anchored.
 */
function wireWordExportPreview(previewWindow, { documentModel, metrics, title, findings }) {
  const saveButton = previewWindow.document.querySelector("[data-word-export-save]");
  const noticeEl = previewWindow.document.querySelector("[data-word-export-refusal]");
  if (!saveButton) return;

  // What the review notes will do, said before the writer chooses Save. The
  // same resolver runs again inside the export, so the line below is a plan,
  // and the line after the save is what the file actually carries.
  const showNotice = (text) => {
    if (!noticeEl) return;
    noticeEl.textContent = text;
    noticeEl.hidden = !text;
  };
  showNotice(wordExportCommentLines(
    window.AISystem6WordExport.planWordComments(documentModel.tokens, findings, { commentAuthor: t("review_desk") })
  ));

  saveButton.addEventListener("click", async () => {
    saveButton.disabled = true;
    try {
      const result = await window.AISystem6WordExport.exportDocumentAsWord({
        tokens: documentModel.tokens,
        pageSetup: metrics,
        title,
        fileName: title,
        language: metrics.language,
        savedAt: new Date().toISOString(),
        commentAuthor: t("review_desk"),
        findings,
      });

      if (result.problems.length) {
        // The refusal is shown on the paper the writer is looking at. A status
        // message would land in the application window behind this one.
        showNotice([t("word_export_refused"), ...result.problems.map(wordExportProblemLine)].join("\n"));
        setStatus(t("word_export_refused"));
        return;
      }

      showNotice(wordExportCommentLines(result.comments));
      // saveArtifact() confirming the download is the only reason to say the
      // file was written.
      setStatus(result.saved ? t("word_export_saved", title) : t("word_export_failed"));
    } catch {
      setStatus(t("word_export_failed"));
    } finally {
      saveButton.disabled = false;
    }
  });
}

/**
 * Show one document as pages, with Save as Word at the foot.
 *
 * @param {{ title?: string, body?: string }} source
 * @returns {Promise<boolean>} true when the preview opened
 */
async function openWordExportPreview(source) {
  const body = String(source?.body || "");
  const title = String(source?.title || "").replace(/\.md$/i, "") || t("untitled");
  if (!body.trim()) {
    setStatus(t("no_document_export"));
    return false;
  }

  await ensureWordExportModule();
  // Parse once. The pages below and the .docx the button writes are two views
  // of this one token stream, and the same Page Setup measures both.
  const documentModel = parseMarkdownDocument(body);
  const metrics = projectCdPaperMetrics();

  const previewWindow = window.open("", "_blank", "width=960,height=760");
  if (!previewWindow) {
    setStatus(t("project_cd_pdf_blocked"));
    return false;
  }
  previewWindow.document.open();
  previewWindow.document.write(buildProjectCdPrintHtml({ title, body }, { wordExport: true, documentModel }));
  previewWindow.document.close();
  wireWordExportPreview(previewWindow, { documentModel, metrics, title, findings: wordExportReviewFindings() });
  setStatus(t("word_export_preview_opened", title));
  return true;
}

/**
 * The document the writer is in. ClioTalk hands over the conversation;
 * every other writing surface hands over the TeachText manuscript, which is
 * the same choice "Download Markdown" makes on the menu above.
 */
function wordExportSourceDocument() {
  if (typeof activeAppId !== "undefined" && activeAppId === "clioTalk") {
    if (!conversation.length) return null;
    const file = currentClioTalkMarkdownFile();
    return { title: file.name, body: formatChatFileMarkdown(file) };
  }
  const { markdown, name } = getTeachTextMarkdown({ originalImages: true });
  return { title: name, body: markdown };
}

async function exportActiveDocumentAsWord() {
  const source = wordExportSourceDocument();
  if (!source || !String(source.body || "").trim()) {
    setStatus(t("no_document_export"));
    return false;
  }
  return openWordExportPreview(source);
}

async function exportSelectedProjectCdItemAsWord() {
  const item = getSelectedProjectCdItem();
  if (!item) {
    setStatus(t("no_document_export"));
    return false;
  }
  return openWordExportPreview(item);
}

// --- Finishing Receipt -------------------------------------------------------
//
// Burning the Project CD is where the writing route ends, so this is where the
// work is receipted. Every line is read back from what was actually stored --
// the burned item and the document revisions behind it. A field whose source
// is missing is dropped from the receipt; it is never estimated, rounded up,
// or filled with a compliment. The receipt states facts and stops; it does not
// grade the writing, score it, or encourage the writer to keep going.

const receiptQuoteMaxChars = 140;

// Markdown scaffolding (headings, list markers, rules, tables, fences) is not
// a sentence, so it cannot stand as "the line you wrote in the first draft".
// A title surviving to the final draft is a different, weaker fact.
const receiptStructuralLine = /^(?:#{1,6}\s|>|[-*+]\s|\d+[.)]\s|```|~~~|-{3,}|={3,}|\||!\[|\[)/;

function receiptContentLines(body) {
  return String(body || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function isReceiptQuotableLine(line) {
  const text = String(line || "").trim();
  if (!text) return false;
  return !receiptStructuralLine.test(text);
}

// "The opening" is the first line a reader actually reads, which is the first
// prose line, not the title.
function receiptOpeningLine(body) {
  return receiptContentLines(body).find(isReceiptQuotableLine) || "";
}

/**
 * Lines present in both the first draft and the burned text, in order.
 *
 * This is the machine behind "you wrote this in the first draft and it is
 * still here": a longest-common-subsequence over content lines, which is the
 * only comparison that survives repeated lines and moved paragraphs. Blank
 * lines are removed first so that a survivor means surviving text.
 *
 * lcsLineDiff builds an O(m*n) table, so above the cap the shipped guarded
 * comparison runs instead. Its fallback reports fewer survivors than really
 * exist, never more -- the receipt may under-claim, it may not over-claim.
 */
function receiptKeptLines(firstBody, finalBody) {
  const older = receiptContentLines(firstBody);
  const newer = receiptContentLines(finalBody);
  if (!older.length || !newer.length) return [];
  if (older.length * newer.length <= 250_000) {
    return lcsLineDiff(older, newer).unchangedLines;
  }
  return compareDocumentRevisions(
    { body: older.join("\n") },
    { body: newer.join("\n") }
  ).unchangedLines.filter(Boolean);
}

function receiptWholeDaysBetween(fromIso, toIso) {
  const from = Date.parse(String(fromIso || ""));
  const to = Date.parse(String(toIso || ""));
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return 0;
  return Math.floor((to - from) / 86400000);
}

/**
 * Assemble the receipt from stored facts only. Pure: it reads the burned item
 * and the revision list it is handed, and touches no DOM and no clock.
 */
function buildFinishingReceipt(item, revisions = []) {
  if (!item) return null;
  const body = String(item.body || "");
  const burnedAt = String(item.burnedAt || item.updatedAt || "");
  const ordered = revisions
    .filter((revision) => revision && typeof revision.body === "string")
    .slice()
    .sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
  const first = ordered[0] || null;
  // Compare drafts by their text, not by their bytes. The burn re-serializes
  // the manuscript, so a blank line or a trailing newline can differ without
  // anything having been written.
  const draftKeys = ordered.map((revision) => receiptContentLines(revision.body).join("\n"));

  const storedWordCount = Number(item.metadata?.wordCount);
  const receipt = {
    title: String(item.title || "").replace(/\.md$/i, ""),
    burnedAt,
    words: Number.isFinite(storedWordCount) && storedWordCount > 0
      ? storedWordCount
      : countMarkdownWords(body),
    // Distinct stored versions, not stored revisions. The burn writes its own
    // revision of text the writer already saved, and counting that as another
    // draft would inflate the work.
    drafts: draftKeys.reduce((count, key, index) => (
      index === 0 || key !== draftKeys[index - 1] ? count + 1 : count
    ), 0),
    startedAt: first ? String(first.createdAt || "") : "",
    elapsedDays: 0,
    openingRewrites: 0,
    keptLines: 0,
    totalLines: receiptContentLines(body).length,
    keptQuote: "",
    keptQuoteTruncated: false,
  };

  if (!first) return receipt;

  receipt.elapsedDays = receiptWholeDaysBetween(receipt.startedAt, burnedAt);

  // How many times the opening was replaced, counted over the stored chain.
  // The burn writes its own revision, so the final text is already the last
  // link and adding it again would count nothing twice.
  let opening = receiptOpeningLine(first.body);
  ordered.slice(1).forEach((revision) => {
    const next = receiptOpeningLine(revision.body);
    if (next && next !== opening) {
      receipt.openingRewrites += 1;
      opening = next;
    }
  });

  const kept = receiptKeptLines(first.body, body);
  receipt.keptLines = kept.length;
  const quotable = kept.find(isReceiptQuotableLine) || "";
  if (quotable.length > receiptQuoteMaxChars) {
    receipt.keptQuote = `${quotable.slice(0, receiptQuoteMaxChars)}…`;
    receipt.keptQuoteTruncated = true;
  } else {
    receipt.keptQuote = quotable;
  }
  return receipt;
}

function receiptLocaleTag() {
  return currentLanguage === "zh" ? "zh-CN" : "en-US";
}

function receiptDateText(iso) {
  const parsed = Date.parse(String(iso || ""));
  if (!Number.isFinite(parsed)) return "";
  return new Date(parsed).toLocaleDateString(receiptLocaleTag());
}

function appendReceiptRow(listEl, labelKey, value) {
  if (!value) return;
  const term = document.createElement("dt");
  term.textContent = t(labelKey);
  const detail = document.createElement("dd");
  detail.textContent = value;
  listEl.append(term, detail);
}

function renderFinishingReceipt(receipt) {
  const nameEl = document.querySelector("#finishing-receipt-name");
  const kindEl = document.querySelector("#finishing-receipt-kind");
  const statsEl = document.querySelector("#finishing-receipt-stats");
  const keptEl = document.querySelector("#finishing-receipt-kept");
  if (!nameEl || !kindEl || !statsEl || !keptEl) return false;

  nameEl.textContent = receipt.title || t("project_cd");
  const burnedOn = receiptDateText(receipt.burnedAt);
  kindEl.textContent = burnedOn ? t("receipt_burned_on", burnedOn) : t("project_cd");

  statsEl.replaceChildren();
  appendReceiptRow(statsEl, "receipt_words", t("receipt_words_value", receipt.words));
  if (receipt.drafts > 0) {
    appendReceiptRow(statsEl, "receipt_drafts", t("receipt_drafts_value", receipt.drafts));
  }
  appendReceiptRow(statsEl, "receipt_started", receiptDateText(receipt.startedAt));
  if (receipt.elapsedDays > 0) {
    appendReceiptRow(statsEl, "receipt_elapsed", t("receipt_elapsed_value", receipt.elapsedDays));
  }
  if (receipt.openingRewrites > 0) {
    appendReceiptRow(statsEl, "receipt_opening", t("receipt_opening_value", receipt.openingRewrites));
  }
  if (receipt.drafts > 0) {
    appendReceiptRow(
      statsEl,
      "receipt_kept",
      t("receipt_kept_value", receipt.keptLines, receipt.totalLines)
    );
  }

  keptEl.replaceChildren();
  keptEl.hidden = !receipt.keptQuote;
  if (receipt.keptQuote) {
    const lede = document.createElement("b");
    lede.textContent = t("receipt_kept_lede");
    const quote = document.createElement("p");
    quote.className = "receipt-kept-quote";
    quote.textContent = t("receipt_kept_quote", receipt.keptQuote);
    keptEl.append(lede, quote);
    const writtenOn = receiptDateText(receipt.startedAt);
    if (writtenOn) {
      const when = document.createElement("p");
      when.className = "hint";
      when.textContent = t("receipt_kept_written_on", writtenOn);
      keptEl.append(when);
    }
  }

  // The restore path fills this window AFTER the window manager has placed it:
  // attachFinishingReceipt reads the revision chain asynchronously, so an empty
  // receipt is positioned and clamped, and only then grows to its real height.
  // On a phone in landscape that left the lower rows below the fold. Re-assert
  // the clamp now that the height is the real one. The burn path renders before
  // the window opens, where the clamp correctly does nothing.
  //
  // Below 860px the stylesheet owns the frame and centres the window with a
  // transform, so an absolute left written here would shift it half its own
  // width off the screen. That is the same boundary applyWindowSessionFrame
  // keeps, and below it the CSS layout already holds the receipt on screen.
  const win = document.querySelector('[data-window="finishingReceipt"]');
  if (win
      && !win.classList.contains("is-hidden")
      && !window.matchMedia("(max-width: 860px)").matches
      && typeof clampWindowToViewport === "function") {
    clampWindowToViewport(win);
  }
  return true;
}

function clearFinishingReceipt() {
  const win = document.querySelector('[data-window="finishingReceipt"]');
  if (!win) return;
  delete win.dataset.receiptItemId;
  const nameEl = win.querySelector("#finishing-receipt-name");
  const kindEl = win.querySelector("#finishing-receipt-kind");
  if (nameEl) nameEl.textContent = "--";
  if (kindEl) kindEl.textContent = "--";
  win.querySelector("#finishing-receipt-stats")?.replaceChildren();
  const keptEl = win.querySelector("#finishing-receipt-kept");
  if (keptEl) {
    keptEl.replaceChildren();
    keptEl.hidden = true;
  }
}

async function renderFinishingReceiptForItem(item) {
  if (!item) return false;
  let revisions = [];
  const documentId = String(item.sourceDocumentId || "");
  if (documentId && typeof listDocumentRevisions === "function") {
    try {
      revisions = await listDocumentRevisions(documentId, item.projectId) || [];
    } catch (error) {
      // Version history could not be read. The receipt then states only what
      // the burned disc itself proves, rather than guessing at the history.
      console.warn("Could not read revisions for the finishing receipt.", error);
      revisions = [];
    }
  }
  const receipt = buildFinishingReceipt(item, revisions);
  if (!receipt || !renderFinishingReceipt(receipt)) return false;
  const win = document.querySelector('[data-window="finishingReceipt"]');
  if (win) win.dataset.receiptItemId = String(item.id || "");
  return true;
}

// Session restore reopens last session's windows directly, so the window must
// be able to fill itself in. A restored receipt re-reads the selected disc; if
// there is no disc to describe, it comes back empty rather than leaving last
// session's numbers standing next to nothing.
function attachFinishingReceipt() {
  const win = document.querySelector('[data-window="finishingReceipt"]');
  if (!win) return;
  const item = typeof getSelectedProjectCdItem === "function" ? getSelectedProjectCdItem() : null;
  if (!item) {
    clearFinishingReceipt();
    return;
  }
  if (win.dataset.receiptItemId === String(item.id || "")) return;
  renderFinishingReceiptForItem(item).catch((error) => {
    console.warn("Could not restore the finishing receipt.", error);
    clearFinishingReceipt();
  });
}

async function openFinishingReceipt(item) {
  if (!item) return false;
  if (!await renderFinishingReceiptForItem(item)) return false;
  await openWindow("finishingReceipt");
  return true;
}

function openFinishingReceiptForSelection() {
  const item = typeof getSelectedProjectCdItem === "function" ? getSelectedProjectCdItem() : null;
  if (!item) {
    setStatus(t("select_find_path_first"));
    return false;
  }
  openFinishingReceipt(item);
  return true;
}

// Called by the burn itself. A receipt that cannot be assembled stays silent:
// the burn already reported its own result, and an empty ceremony would be a
// claim that something was measured when nothing was.
function showFinishingReceiptForBurn(item) {
  return openFinishingReceipt(item).catch((error) => {
    console.warn("Could not open the finishing receipt.", error);
    return false;
  });
}
