// External drag and drop: one router for material that arrives from outside
// AI System 6. Loaded before app.js as a classic script; the routes call
// functions the feature modules declare, so they resolve at drop time.
//
// Before this module the Finder drop handler read "application/json" first
// and returned when it was absent, so a file, a link, or a paragraph from
// another app vanished without a word, while DocMap, ClioStage, and Reader
// each kept their own copy of the file rules.
//
// Two product rules hold here:
//   1. Dropped material is source data, never instruction. A file name or a
//      paragraph that reads "ignore the previous instructions" is filed as
//      text; nothing here treats it as a command.
//   2. No route claims an import, an index, a fetch, or a save that did not
//      happen. Each route reports the outcome it observed.

// Internal Finder drags carry "application/json"; they own their own routes
// and must never be re-read as outside material.
const internalDragDataType = "application/json";

function externalDropTypes(event) {
  return Array.from(event?.dataTransfer?.types || []);
}

// Safe during dragenter/dragover, where the browser hides the payload and
// only the type list is readable.
function isExternalDrop(event) {
  const types = externalDropTypes(event);
  if (!types.length) return false;
  if (types.includes(internalDragDataType)) return false;
  return types.includes("Files") || types.includes("text/uri-list") || types.includes("text/plain");
}

function externalDropHasFiles(event) {
  const types = externalDropTypes(event);
  if (types.includes(internalDragDataType)) return false;
  return types.includes("Files");
}

function externalDropUrlsFromText(value) {
  return String(value || "")
    .split(/[\r\n\s]+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry && !entry.startsWith("#"))
    .filter((entry) => {
      try {
        const parsed = new URL(entry);
        return parsed.protocol === "http:" || parsed.protocol === "https:";
      } catch {
        return false;
      }
    });
}

// Read the whole payload once, at drop time. Returns null for internal drags
// and for drops that carry nothing this app can use.
function readExternalDropPayload(event) {
  const transfer = event?.dataTransfer;
  if (!transfer) return null;
  const types = Array.from(transfer.types || []);
  if (types.includes(internalDragDataType)) return null;

  const files = Array.from(transfer.files || []).filter(Boolean);
  const uriList = types.includes("text/uri-list") ? transfer.getData("text/uri-list") : "";
  const text = types.includes("text/plain") ? transfer.getData("text/plain") : "";
  const uriListUrls = externalDropUrlsFromText(uriList);
  const textUrls = externalDropUrlsFromText(text);
  const urls = uriListUrls.length ? uriListUrls : textUrls;
  const trimmedText = String(text || "").trim();
  const textIsBareUrl = textUrls.length === 1 && textUrls[0] === trimmedText;

  if (!files.length && !urls.length && !trimmedText) return null;
  return {
    files,
    urls,
    text: trimmedText,
    hasUriList: uriListUrls.length > 0,
    textIsBareUrl,
  };
}

// Files win: a Finder drag is never a link or a quote. An explicit
// "text/uri-list" is a link drag and means "read this source". A bare URL
// typed into some other app's text is the only genuinely ambiguous case, and
// it is the only one that asks.
function classifyExternalDrop(payload) {
  if (!payload) return "none";
  if (payload.files.length) return "fileFloppy";
  if (payload.urls.length && payload.hasUriList) return "reader";
  if (payload.urls.length && payload.textIsBareUrl) return "choose";
  if (payload.text) return "clipboard";
  return "none";
}

// ---- Routes ---------------------------------------------------------------

async function fileExternalDropIntoFileFloppy(payload, { openAfter = "textDisk" } = {}) {
  const files = payload?.files || [];
  if (!files.length) return false;
  setStatus(t("reading_files"));
  const result = await insertFilesIntoFileFloppy(files, { source: "externalDrop", openAfter });
  const mounted = result?.mountedFileNames?.length || 0;
  if (!mounted) {
    // insertFilesIntoFileFloppy already wrote the real reason into the File
    // Floppy status line; the desktop must not invent a success on top of it.
    setStatus(t("file_disk_mount_failed_all", files.length));
    return false;
  }
  setStatus(t("external_drop_filed", mounted));
  return true;
}

// Reader reads one source. It is not a browser: the URL goes through the
// existing /api/reader extraction and lands as a reading tab, and a drop that
// carried several links opens the first one and says so.
async function readExternalDropInReader(payload) {
  const urls = payload?.urls || [];
  if (!urls.length) return false;
  openWindow("reader");
  if (readerUrlInput) readerUrlInput.value = urls[0];
  if (urls.length > 1) setStatus(t("reader_one_url_only"));
  await fetchReaderPage(urls[0]);
  return true;
}

// Text stops at the Clipboard on purpose. The user decides whether it becomes
// a Note Pad slip, a Scrapbook entry, TeachText prose, or a ClioTalk prompt;
// this router never writes into a document by itself.
function keepExternalDropOnClipboard(payload) {
  const text = payload?.text || "";
  if (!text) return false;
  setClipboard(text, t("external_drop_source"));
  openWindow("clipboard");
  setStatus(t("external_drop_kept_text", text.length));
  return true;
}

async function chooseExternalDropRouteForUrl(payload) {
  const url = payload.urls[0];
  const answer = await showSystemModal(t("external_drop_url_question", url), "confirm", {
    confirmKey: "external_drop_read_source",
    altKey: "external_drop_keep_text",
  });
  if (answer === "yes") return readExternalDropInReader(payload);
  if (answer === "no") return keepExternalDropOnClipboard(payload);
  setStatus(t("external_drop_canceled"));
  return false;
}

// ---- Surfaces -------------------------------------------------------------

// The desktop is the only surface that runs the full type routing. Every other
// surface states what it accepts, so a drop can never quietly do something the
// target window does not do.
async function routeExternalDropToDesktop(event) {
  const payload = readExternalDropPayload(event);
  if (!payload) {
    setStatus(t("external_drop_canceled"));
    return false;
  }
  const route = classifyExternalDrop(payload);
  if (route === "fileFloppy") return fileExternalDropIntoFileFloppy(payload);
  if (route === "reader") return readExternalDropInReader(payload);
  if (route === "clipboard") return keepExternalDropOnClipboard(payload);
  if (route === "choose") return chooseExternalDropRouteForUrl(payload);
  setStatus(t("external_drop_canceled"));
  return false;
}

// Windows that host an editable surface keep the browser's own text insertion,
// so only files are pulled out of the drop here.
async function routeExternalDropFilesOnly(event) {
  const payload = readExternalDropPayload(event);
  if (!payload?.files.length) return false;
  return fileExternalDropIntoFileFloppy(payload);
}

function declineExternalDrop() {
  setStatus(t("external_drop_use_desktop"));
  return false;
}

// Shared drag feedback and drop handling for a window that takes outside
// files: DocMap and ClioStage both used to spell this out by hand, with two
// slightly different copies of the same rules.
//
// The surface claims a drop (preventDefault + stopPropagation) only when it
// actually handles it. Every other drag — a Finder file, a folder, a Reader
// clipping — keeps bubbling to the Finder router, so the internal object
// routes are untouched.
function registerExternalFileDropSurface(element, {
  onFiles,
  onMountedFiles = null,
  activeClass = "is-dragging",
  internalDropEffect = dropEffectForFilesOrMountedFiles,
} = {}) {
  if (!element || typeof onFiles !== "function") return false;
  if (element.dataset.externalDropReady === "true") return false;
  element.dataset.externalDropReady = "true";

  const highlights = (event) => isExternalDrop(event) || dropHasFilesOrMountedFiles(event);

  element.addEventListener("dragenter", (event) => {
    if (!highlights(event)) return;
    event.preventDefault();
    element.classList.add(activeClass);
  });

  element.addEventListener("dragover", (event) => {
    if (!highlights(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = isExternalDrop(event) ? "copy" : internalDropEffect(event);
    element.classList.add(activeClass);
  });

  element.addEventListener("dragleave", (event) => {
    if (!element.contains(event.relatedTarget)) element.classList.remove(activeClass);
  });

  element.addEventListener("drop", (event) => {
    const mountedFileNames = typeof onMountedFiles === "function" ? mountedFileNamesFromDrop(event) : [];
    if (mountedFileNames.length) {
      event.preventDefault();
      event.stopPropagation();
      element.classList.remove(activeClass);
      onMountedFiles(mountedFileNames);
      return;
    }
    if (!isExternalDrop(event)) {
      element.classList.remove(activeClass);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    element.classList.remove(activeClass);
    const payload = readExternalDropPayload(event);
    if (payload?.files.length) {
      onFiles(payload.files);
      return;
    }
    setStatus(t("external_drop_needs_file"));
  });
  return true;
}

// Safety net. A file dropped on a window with no external handler used to make
// the browser navigate away from the desktop, which ends the session. Nothing
// is imported here — the drop is refused in place and the user is told where
// files do land.
function initExternalDropSafetyNet() {
  window.addEventListener("dragover", (event) => {
    if (event.defaultPrevented || !externalDropHasFiles(event)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
  });

  window.addEventListener("drop", (event) => {
    if (event.defaultPrevented || !externalDropHasFiles(event)) return;
    event.preventDefault();
    setStatus(t("external_drop_use_desktop"));
  });
}

