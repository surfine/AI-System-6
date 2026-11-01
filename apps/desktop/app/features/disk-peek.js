// Feature module: disk-peek — looking inside a demonstration Project Hard Disk.
//
// The demonstration disks are what a video description or a README sends a
// person to, and until this window a person could see thirty-five names and
// nothing else: reading any of them meant making a copy of it on this computer
// and being moved into the Writing view first. This is the look before that.
//
// It shows the disk as a site rather than as an article: the rail names what
// the writer left at each stop of the route -- the question sheet, the outline,
// the manuscript, the review record -- and the manuscript is where it opens,
// because the article is what the visitor came for and the rest is one click
// away. That difference is the whole point of a disk over a blog post.
//
// It is read-only by construction, and says so rather than dressing it up (the
// rule projectPeek set): the text is rendered, never an editable surface, and
// nothing here writes a record. The one way out is "Open a Copy", which runs
// the same command a /go/<route> link runs.
//
// It is not projectPeek. That window answers "which of my projects did I file
// that in?" from this computer's own records; these disks are not on this
// computer until they are copied. Folding them in would give one window two
// data sources and a third mode.
//
// The reading pane is TeachText's own preview sheet, so each appearance reads
// it in its own face and measure, and a disk reads here exactly as it will
// after "Open a Copy" lands on the rendered manuscript.
//
// Contract: tests/features/demo-disks-panel.test.mjs

const DISK_PEEK_WINDOW = "diskPeek";
const DISK_PEEK_LINK_ORIGIN = "https://system6.aaronlau.me";
// The appearances whose Finder opened a window with ZoomRects: dotted outlines
// stepping from the icon to the window. Later Finders grew the window out of the
// icon instead, so those scale from it.
const DISK_PEEK_ZOOM_RECT_THEMES = new Set(["classic", "system-7", "platinum"]);

function installDiskPeekWindow() {
  const shell = window.AISystem6ApplicationShell;
  if (!shell || typeof document === "undefined") return;
  if (document.querySelector(`[data-window="${DISK_PEEK_WINDOW}"]`)) return;
  shell.createWindow({
    windowName: DISK_PEEK_WINDOW,
    windowClass: "disk-peek-window",
    labelledBy: "disk-peek-title",
    title: "Project Hard Disk",
    beforePaneHtml: `
      <div class="disk-peek-toolbar">
        <button class="btn disk-peek-step" type="button" data-disk-peek-step="-1" aria-label="Previous disk" data-i18n-aria-label="demo_disk_previous">&lsaquo;</button>
        <span class="disk-peek-count" id="disk-peek-count" aria-live="polite"></span>
        <button class="btn disk-peek-step" type="button" data-disk-peek-step="1" aria-label="Next disk" data-i18n-aria-label="demo_disk_next">&rsaquo;</button>
        <span class="spacer"></span>
        <span class="disk-peek-actions">
          <button class="btn" type="button" data-disk-peek-copy data-i18n="demo_disk_copy_link">Copy Link</button>
          <button class="btn default" type="button" data-disk-peek-open data-i18n="demo_disk_open_copy">Open a Copy</button>
        </span>
      </div>`,
    paneClass: "disk-peek-pane",
    paneHtml: `
      <nav class="disk-peek-rail" aria-label="On this disk" data-i18n-aria-label="demo_disk_on_this_disk">
        <p class="disk-peek-caption" data-i18n="demo_disk_peek_caption">Read only. What this disk holds:</p>
        <div class="disk-peek-docs" role="tablist" id="disk-peek-docs"></div>
        <dl class="disk-peek-facts" id="disk-peek-facts"></dl>
        <p class="disk-peek-note" data-i18n="demo_disk_open_copy_note">Open a Copy puts an editable copy on this computer and leaves this disk as it is.</p>
      </nav>
      <div class="disk-peek-reader teachtext-preview" id="disk-peek-reader" role="tabpanel" tabindex="0" aria-labelledby="disk-peek-title"></div>`,
  });
}

installDiskPeekWindow();

let diskPeekRoute = "";
let diskPeekDoc = "manuscript";
let diskPeekToken = 0;

function diskPeekParts() {
  const root = document.querySelector(`[data-window="${DISK_PEEK_WINDOW}"]`);
  if (!root) return null;
  return {
    root,
    title: root.querySelector("#disk-peek-title"),
    count: root.querySelector("#disk-peek-count"),
    docs: root.querySelector("#disk-peek-docs"),
    facts: root.querySelector("#disk-peek-facts"),
    reader: root.querySelector("#disk-peek-reader"),
  };
}

function diskPeekPanel() {
  return window.AISystem6DemoDisksPanel || null;
}

function diskPeekIndexEntry(route) {
  return (window.AISystem6SharedProjectDisksIndex || {})[route] || null;
}

// What the disk holds at each stop, read from the backup the copy would be made
// from. A stop the writer left empty is not offered: an empty tab asks a
// question and never answers it.
function diskPeekDocuments(backup) {
  const project = backup?.project || {};
  const files = Array.isArray(backup?.files) ? backup.files : [];
  const manuscript = files.find((file) => file.label === "final")
    || files.find((file) => file.name === project.name);
  const review = files.find((file) => /审校|review/i.test(String(file.name || "")));
  return [
    { id: "questionSheet", label: t("question_sheet"), body: project.questionSheet },
    { id: "outline", label: t("outline"), body: project.outline },
    { id: "manuscript", label: t("manuscript"), body: manuscript?.body },
    { id: "review", label: t("review_desk"), body: review?.body },
  ].filter((doc) => String(doc.body || "").trim());
}

function renderDiskPeekFacts(parts, route) {
  const panel = diskPeekPanel();
  const disk = diskPeekIndexEntry(route) || {};
  const rows = [
    [t("demo_disk_column_released"), panel?.releasedLabel(disk) || "--"],
    [t("demo_disk_column_words"), panel?.wordsLabel(disk) || ""],
    [t("demo_disk_fact_scraps"), String(Number(disk.scraps) || 0)],
  ];
  parts.facts.replaceChildren(...rows.flatMap(([term, value]) => {
    const dt = document.createElement("dt");
    dt.textContent = term;
    const dd = document.createElement("dd");
    dd.textContent = value;
    return [dt, dd];
  }));
}

function renderDiskPeekChrome(parts, route) {
  const panel = diskPeekPanel();
  const disk = diskPeekIndexEntry(route) || {};
  const routes = panel?.orderedRoutes() || [route];
  parts.title.textContent = panel?.diskLabel(disk, route) || route;
  parts.count.textContent = t("demo_disk_count", routes.indexOf(route) + 1, routes.length);
  renderDiskPeekFacts(parts, route);
}

function renderDiskPeekDocuments(parts, documents) {
  if (!documents.some((doc) => doc.id === diskPeekDoc)) diskPeekDoc = documents.find((doc) => doc.id === "manuscript") ? "manuscript" : documents[0]?.id || "";
  parts.docs.replaceChildren(...documents.map((doc) => {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = "disk-peek-doc";
    tab.setAttribute("role", "tab");
    tab.dataset.diskPeekDoc = doc.id;
    tab.setAttribute("aria-selected", String(doc.id === diskPeekDoc));
    tab.classList.toggle("is-selected", doc.id === diskPeekDoc);
    const icon = document.createElement("span");
    icon.className = "mini-icon doc-icon";
    icon.setAttribute("aria-hidden", "true");
    const label = document.createElement("span");
    label.textContent = doc.label;
    tab.append(icon, label);
    return tab;
  }));
  const current = documents.find((doc) => doc.id === diskPeekDoc);
  parts.reader.innerHTML = current ? markdownToSystemHtml(current.body) : "";
  parts.reader.scrollTop = 0;
}

function diskPeekMessage(parts, key) {
  const note = document.createElement("p");
  note.className = "hint disk-peek-message";
  note.textContent = t(key);
  parts.reader.replaceChildren(note);
}

// Switching disks is done dozens of times in one sitting, so the text changes
// in place with no motion; the backup arrives on its own and a later request
// wins over an earlier one that lands after it.
async function renderDiskPeek() {
  const parts = diskPeekParts();
  const route = diskPeekRoute;
  if (!parts || !route) return;
  const token = ++diskPeekToken;
  renderDiskPeekChrome(parts, route);
  let backup = (window.AISystem6SharedProjectDisks || {})[route];
  if (!backup) {
    parts.docs.replaceChildren();
    diskPeekMessage(parts, "demo_disk_loading");
    try {
      await ensureSharedProjectDiskModule(route);
    } catch {
      if (token === diskPeekToken) diskPeekMessage(parts, "demo_disk_load_failed");
      return;
    }
    if (token !== diskPeekToken) return;
    backup = (window.AISystem6SharedProjectDisks || {})[route];
  }
  if (!backup) {
    diskPeekMessage(parts, "demo_disk_load_failed");
    return;
  }
  renderDiskPeekDocuments(parts, diskPeekDocuments(backup));
  // The next and previous disks are the likely next look; fetch them while
  // this one is being read, so walking the shelf never waits.
  const panel = diskPeekPanel();
  [panel?.step(route, 1), panel?.step(route, -1)]
    .filter((next) => next && next !== route)
    .forEach((next) => ensureSharedProjectDiskModule(next).catch(() => {}));
}

function diskPeekIsOpen() {
  const root = diskPeekParts()?.root;
  return !!root && !root.classList.contains("is-hidden");
}

function diskPeekRect(element) {
  const rect = element?.getBoundingClientRect?.();
  return rect && rect.width && rect.height ? rect : null;
}

function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
}

// System 6 opened a window by drawing dotted rectangles stepping from the icon
// out to the window's frame, a trail of three, with no fade: a 1-bit screen has
// no opacity. Nine steps at a frame each is about 200ms, the length of the
// original's sweep. Closing runs the same path back into the icon.
function playDiskPeekZoomRects(from, to) {
  const host = document.querySelector(".desktop") || document.body;
  const steps = 9;
  const trail = 3;
  const rects = Array.from({ length: steps }, (_, index) => {
    const eased = 1 - (1 - (index + 1) / steps) ** 2;
    const rect = document.createElement("div");
    // The drag outline's own primitive: System 6 drew both with the same
    // gray-pattern hairline, inverted against whatever lies beneath.
    rect.className = "window-outline disk-peek-zoom-rect";
    rect.setAttribute("aria-hidden", "true");
    rect.style.setProperty("--outline-left", `${from.left + (to.left - from.left) * eased}px`);
    rect.style.setProperty("--outline-top", `${from.top + (to.top - from.top) * eased}px`);
    rect.style.setProperty("--outline-width", `${from.width + (to.width - from.width) * eased}px`);
    rect.style.setProperty("--outline-height", `${from.height + (to.height - from.height) * eased}px`);
    rect.style.visibility = "hidden";
    host.append(rect);
    return rect;
  });
  return new Promise((resolve) => {
    let frame = 0;
    const tick = () => {
      if (rects[frame]) rects[frame].style.visibility = "visible";
      rects[frame - trail]?.remove();
      frame += 1;
      if (frame < steps + trail) requestAnimationFrame(tick);
      else {
        rects.forEach((rect) => rect.remove());
        resolve();
      }
    };
    requestAnimationFrame(tick);
  });
}

// Later Finders grew the window out of the icon. It starts at 90% rather than
// from nothing, and eases out: an entrance should move fastest when it starts.
function playDiskPeekGrow(win, from, to, reverse = false) {
  if (!win.animate) return Promise.resolve();
  const originX = from.left + from.width / 2 - to.left;
  const originY = from.top + from.height / 2 - to.top;
  const frames = [
    { transform: "scale(0.9)", opacity: 0, transformOrigin: `${originX}px ${originY}px` },
    { transform: "scale(1)", opacity: 1, transformOrigin: `${originX}px ${originY}px` },
  ];
  return win.animate(reverse ? frames.reverse() : frames, {
    duration: reverse ? 150 : 200,
    easing: "cubic-bezier(0.23, 1, 0.32, 1)",
  }).finished.catch(() => {});
}

async function animateDiskPeek(win, source, closing) {
  const from = diskPeekRect(source);
  const to = diskPeekRect(win);
  if (!from || !to || prefersReducedMotion() || win.classList.contains("is-mobile-accessory")) return;
  const theme = typeof getCurrentTheme === "function" ? getCurrentTheme() : "";
  if (DISK_PEEK_ZOOM_RECT_THEMES.has(theme)) {
    await (closing ? playDiskPeekZoomRects(to, from) : playDiskPeekZoomRects(from, to));
    return;
  }
  await playDiskPeekGrow(win, from, to, closing);
}

async function openDiskPeek(route, { from = null } = {}) {
  if (!route) return;
  const already = diskPeekIsOpen();
  diskPeekRoute = route;
  diskPeekDoc = "manuscript";
  const parts = diskPeekParts();
  if (already) {
    renderDiskPeek();
    return;
  }
  // The zoom starts from the icon and ends at the frame, and the window appears
  // when it arrives, so it is placed hidden first and measured there.
  if (parts) parts.root.style.visibility = "hidden";
  await openWindow(DISK_PEEK_WINDOW);
  renderDiskPeek();
  const win = diskPeekParts()?.root;
  if (!win) return;
  const zoomRects = DISK_PEEK_ZOOM_RECT_THEMES.has(typeof getCurrentTheme === "function" ? getCurrentTheme() : "");
  if (zoomRects) {
    await animateDiskPeek(win, from, false);
    win.style.visibility = "";
  } else {
    win.style.visibility = "";
    animateDiskPeek(win, from, false);
  }
  diskPeekParts()?.reader?.focus({ preventScroll: true });
}

// Closing folds back into the disk that is selected now, which after walking the
// shelf is not the one it opened from -- the Finder's own behaviour.
async function closeDiskPeek() {
  const win = diskPeekParts()?.root;
  if (!win || win.classList.contains("is-hidden")) return;
  const source = document.querySelector(
    `[data-window="projectDisks"] [data-static-finder-action="look-shared-disk-${diskPeekRoute}"]`,
  );
  if (!DISK_PEEK_ZOOM_RECT_THEMES.has(typeof getCurrentTheme === "function" ? getCurrentTheme() : "")) {
    await animateDiskPeek(win, source, true);
  }
  const frame = diskPeekRect(win);
  await closeWindow(DISK_PEEK_WINDOW);
  if (frame && DISK_PEEK_ZOOM_RECT_THEMES.has(typeof getCurrentTheme === "function" ? getCurrentTheme() : "")) {
    const icon = diskPeekRect(source);
    if (icon && !prefersReducedMotion()) playDiskPeekZoomRects(frame, icon);
  }
}

function stepDiskPeek(delta) {
  const panel = diskPeekPanel();
  if (!panel || !diskPeekRoute) return;
  const next = panel.step(diskPeekRoute, delta);
  if (!next || next === diskPeekRoute) return;
  diskPeekRoute = next;
  panel.selectRoute(next);
  renderDiskPeek();
}

async function copyDiskPeekLink() {
  if (!diskPeekRoute) return;
  const link = `${DISK_PEEK_LINK_ORIGIN}/go/${diskPeekRoute}`;
  try {
    await navigator.clipboard.writeText(link);
    setStatus(t("demo_disk_link_copied", link));
  } catch {
    setStatus(link);
  }
}

// The copy is made by the command a /go/<route> link runs, so the two doors
// cannot disagree about what a copy is or where it lands.
async function openDiskPeekCopy() {
  const route = diskPeekRoute;
  if (!route) return;
  await closeWindow(DISK_PEEK_WINDOW);
  await handleAction(`open-shared-disk-${route}`);
}

function wireDiskPeek() {
  const parts = diskPeekParts();
  if (!parts || parts.root.dataset.diskPeekWired === "true") return;
  parts.root.dataset.diskPeekWired = "true";
  parts.root.addEventListener("click", (event) => {
    const stepButton = event.target.closest("[data-disk-peek-step]");
    if (stepButton) {
      stepDiskPeek(Number(stepButton.dataset.diskPeekStep) || 0);
      return;
    }
    const doc = event.target.closest("[data-disk-peek-doc]");
    if (doc) {
      diskPeekDoc = doc.dataset.diskPeekDoc;
      renderDiskPeek();
      return;
    }
    if (event.target.closest("[data-disk-peek-copy]")) {
      copyDiskPeekLink();
      return;
    }
    if (event.target.closest("[data-disk-peek-open]")) openDiskPeekCopy();
  });
  // The close box goes back into the disk the way the space bar does.
  parts.root.querySelector(":scope > .title-bar .close-box")?.addEventListener("click", (event) => {
    event.stopImmediatePropagation();
    event.preventDefault();
    closeDiskPeek();
  }, true);
}

// Quick Look's keys: the space bar and Escape put it away, left and right walk
// the shelf, Return is the default button. Up and down stay with the reader,
// because the text is what is being scrolled.
function onDiskPeekKeydown(event) {
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
  const active = document.querySelector(".window.is-active:not(.is-hidden)");
  if (active?.dataset.window !== DISK_PEEK_WINDOW) return;
  if (document.querySelector(".menu.is-open")) return;
  const onButton = !!event.target?.closest?.("button");
  if (event.key === "Escape" || (event.key === " " && !onButton)) {
    event.preventDefault();
    closeDiskPeek();
  } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    event.preventDefault();
    stepDiskPeek(event.key === "ArrowLeft" ? -1 : 1);
  } else if (event.key === "Enter" && !onButton) {
    event.preventDefault();
    openDiskPeekCopy();
  }
}

wireDiskPeek();
document.addEventListener("keydown", onDiskPeekKeydown);

window.AISystem6DiskPeek = Object.freeze({
  open: openDiskPeek,
  close: closeDiskPeek,
  render: () => {
    if (diskPeekIsOpen()) renderDiskPeek();
  },
  attach: wireDiskPeek,
});
window.AISystem6DiskPeekLoaded = true;
