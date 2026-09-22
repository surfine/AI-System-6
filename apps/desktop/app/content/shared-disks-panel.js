// The Project Hard Disks that ship with the application, at the two doors a
// person arrives through.
//
// The disks themselves are a Finder folder on the Startup Disk: a disk is a
// Finder object, so it gets Finder chrome -- count, view controls, selection
// and a double click that opens -- instead of a window with a private list and
// a private button. That page is markup (index.html) drawn from data
// (getDemonstrationDiskItems in app.js).
//
// What is left for this file is what the Finder cannot own: the command behind
// the File menu row and the Startup Disk row, and the copy of the list inside
// the Import Utility, where someone already choosing a backup file should see
// that ready-made disks exist. Opening a row there and opening a row in the
// folder are the same command, so the two doors cannot disagree.
//
// Why it ships here: tooling/build-shared-project-disks.mjs appends this file
// to the generated index module, so the first look at the disks costs the boot
// payload nothing and fetches ~20 KB of names rather than 3.7 MB of
// manuscripts. The backups load when a row is actually opened.

function installDemoDisksPanel() {
  const WINDOW_NAME = "projectDisks";
  const inlineSectionSelector = ".backup-preview-section";
  const inlineHostId = "demo-disks-inline";
  const mountKeyPrefix = "aiSystem6SharedDisk:";
  const SUBJECT_LIMIT = 96;

  function isZh() {
    return !(typeof currentLanguage === "string" && currentLanguage.startsWith("en"));
  }

  function t2(key, zh, en) {
    let value = "";
    try {
      value = typeof t === "function" ? t(key) : "";
    } catch {
      value = "";
    }
    if (!value || value === key) value = isZh() ? zh : en;
    return value;
  }

  function mountedProject(route) {
    let id = "";
    try {
      id = localStorage.getItem(mountKeyPrefix + route) || "";
    } catch {
      id = "";
    }
    if (!id) return null;
    const list = typeof projects !== "undefined" && Array.isArray(projects) ? projects : [];
    return list.find((project) => project.id === id) || null;
  }

  // One line per disk, straight from the generated index. The subject is the
  // writer's own first line under "## 主题", so a row cannot drift away from
  // what the project says about itself; a disk that has none falls back to what
  // the row actually is, two counts.
  function disks() {
    const index = window.AISystem6SharedProjectDisksIndex || {};
    return Object.keys(index).map((route) => ({ route, ...index[route] }));
  }

  function summary(disk) {
    const subject = String(disk?.subject || "").replace(/\s+/g, " ").trim();
    if (subject) return subject.length > SUBJECT_LIMIT ? `${subject.slice(0, SUBJECT_LIMIT)}…` : subject;
    const files = Number(disk?.files) || 0;
    const scraps = Number(disk?.scraps) || 0;
    return isZh() ? `${files} 个文件 · ${scraps} 条摘录` : `${files} files · ${scraps} excerpts`;
  }

  function button(label, handler) {
    const element = document.createElement("button");
    element.type = "button";
    element.className = "btn";
    element.textContent = label;
    element.addEventListener("click", handler);
    return element;
  }

  function rowFor(disk) {
    const row = document.createElement("div");
    // .import-row is icon | flexible label | trailing control, which is exactly
    // this row's shape. .backup-preview-row re-cut those columns for a preview
    // that carries no button, so it is not reused here: a fourth grid child
    // would fall out of its three columns.
    row.className = "import-row";
    const icon = document.createElement("span");
    icon.className = "mini-icon project-disk-icon";
    const label = document.createElement("span");
    const name = document.createElement("b");
    name.textContent = disk.name || disk.route;
    const line = document.createElement("small");
    // The row is one line, so the name and the subject need a mark between
    // them: without it the two read as one run-on word.
    line.textContent = ` · ${summary(disk)}`;
    label.append(name, line);
    row.append(icon, label);

    const here = Boolean(mountedProject(disk.route));
    row.append(button(
      here
        ? t2("demo_disk_open_existing", "打开已有的", "Open existing")
        : t2("demo_disk_open", "打开", "Open"),
      () => {
        if (typeof openSharedProjectDisk !== "function") return;
        Promise.resolve(openSharedProjectDisk(disk.route)).then(renderInline, renderInline);
      },
    ));
    return row;
  }

  function listFor(entries) {
    const list = document.createElement("div");
    list.className = "demo-disks-list";
    entries.forEach((entry) => list.append(rowFor(entry)));
    return list;
  }

  function inlineHost() {
    const section = document.querySelector(inlineSectionSelector);
    if (!section) return null;
    let host = document.getElementById(inlineHostId);
    if (!host) {
      host = document.createElement("div");
      host.id = inlineHostId;
      section.append(host);
    }
    return host;
  }

  // The Import Utility gets the rows and one line saying what they are, without
  // the folder's chrome: whoever is already in that window wants the disks, not
  // a second Finder page.
  function renderInline() {
    const host = inlineHost();
    if (!host) return;
    host.replaceChildren();
    const entries = disks();
    if (!entries.length) return;
    const blurb = document.createElement("p");
    blurb.className = "hint";
    blurb.textContent = t2(
      "demo_disks_blurb",
      "每块演示盘都是作者走完整条路线之后的现场。打开即在这台电脑上新建一份副本。",
      "Each demonstration disk is the site its writer left after walking the whole route. Opening one makes a copy on this computer.",
    );
    host.append(blurb, listFor(entries));
  }

  // The File menu row and the Startup Disk row both dispatch this. The command
  // is lazy (app/core/app-admissions.js names the loader), so a module that
  // fails to arrive greys the row and says why instead of opening an empty
  // folder; by the time this runs, the folder's rows are loaded.
  function open() {
    if (typeof openWindow !== "function") return;
    openWindow(WINDOW_NAME);
  }

  // Everything the Import Utility's copy shows is drawn from t() rather than
  // declared as data-i18n, so a language switch has to draw it again. The
  // folder itself repaints with the other Finder pages (app.js
  // finderContainerWindowNames); the name this hook is declared under lives on
  // the window's admission row, which persistence-status.js iterates.
  function renderDemoDisksPanel() {
    renderInline();
  }
  window.renderDemoDisksPanel = renderDemoDisksPanel;

  window.AISystem6Runtime?.registerCommand?.("open-demo-disks", { handler: open, isAvailable: () => true });

  const section = document.querySelector(inlineSectionSelector);
  if (section) section.addEventListener("toggle", renderInline);
  renderInline();

  return Object.freeze({ open, renderInline, disks });
}

window.AISystem6DemoDisksPanel = installDemoDisksPanel();
