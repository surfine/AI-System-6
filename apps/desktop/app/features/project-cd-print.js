// Lazy feature module: project-cd-print.

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

function buildProjectCdPrintHtml(item) {
  const documentModel = parseMarkdownDocument(item.body || "");
  const title = item.title?.replace(/\.md$/i, "") || t("project_cd");
  const paper = pageSetupPaperCss();
  const orientation = pageSetupSettings.orientation === "landscape" ? "landscape" : "portrait";
  const densityClass = projectCdPrintDensityClass();
  const lang = currentLanguage === "zh" ? "zh-Hans" : "en";
  return `<!doctype html>
<html lang="${lang}">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: ${paper} ${orientation}; margin: ${densityClass === "compact" ? "14mm" : "20mm"}; }
    :root {
      color: #111;
      background: #fff;
      font-family: ${currentLanguage === "zh" ? '"Songti SC", "SimSun", "STSong", serif' : 'Georgia, "Times New Roman", serif'};
      font-size: ${densityClass === "compact" ? "10.5pt" : "11.5pt"};
      line-height: ${densityClass === "compact" ? "1.42" : "1.58"};
    }
    body { margin: 0; background: #fff; color: #111; }
    main { max-width: 100%; }
    h1 { margin: 0 0 1.2em; text-align: center; font-size: 1.75em; line-height: 1.2; }
    h2 { margin: 1.7em 0 0.65em; font-size: 1.25em; border-bottom: 1px solid #111; padding-bottom: 0.18em; }
    h3 { margin: 1.25em 0 0.5em; font-size: 1.1em; }
    p { margin: 0.72em 0; }
    ul, ol { margin: 0.72em 0 0.72em 1.4em; padding: 0; }
    li { margin: 0.28em 0; }
    blockquote { margin: 1em 0; padding: 0.2em 0 0.2em 1em; border-left: 3px solid #555; }
    code { font-family: Menlo, Monaco, Consolas, monospace; font-size: 0.92em; }
    pre { white-space: pre-wrap; border: 1px solid #999; padding: 0.8em; break-inside: avoid; }
    table { width: 100%; border-collapse: collapse; margin: 1em 0; break-inside: auto; font-size: 0.92em; }
    th, td { border: 1px solid #999; padding: ${densityClass === "compact" ? "0.22em 0.35em" : "0.35em 0.5em"}; vertical-align: top; }
    th { background: #eee; font-weight: bold; }
    img { max-width: 100%; height: auto; break-inside: avoid; }
    hr { border: 0; border-top: 1px solid #777; margin: 1.4em 0; }
    a { color: inherit; text-decoration: underline; }
    @media screen {
      body { padding: 24px; background: #d8d8d8; }
      main { max-width: ${orientation === "landscape" ? "1040px" : "760px"}; margin: 0 auto; padding: 48px; background: #fff; box-shadow: 0 2px 18px rgba(0,0,0,0.24); }
    }
  </style>
</head>
<body>
  <main class="${densityClass}">
    ${documentModel.html}
  </main>
</body>
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
