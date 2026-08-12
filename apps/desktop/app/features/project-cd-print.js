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
