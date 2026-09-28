// The Project Hard Disks that ship with the application, at the two doors a
// person arrives through.
//
// The disks themselves are a Finder folder on the Startup Disk: a disk is a
// Finder object, so it gets Finder chrome -- count, view controls, selection
// and a double click that opens -- instead of a window with a private list and
// a private button. That page is markup (index.html) drawn from data
// (getDemonstrationDiskItems in app.js).
//
// Opening a disk here means looking inside it. A visitor from a video or a
// README comes to read, and a copy on this computer is a second, deliberate
// step, so a double click (or the space bar, the way Quick Look answers it)
// opens the disk's read-only window, app/features/disk-peek.js, and that
// window carries the button that makes the copy. A /go/<route> link still
// mounts its disk straight away: whoever shares one has already chosen it.
//
// What is left for this file is what the Finder cannot own: the rows and their
// columns, the keys that walk them, the command behind the File menu row and
// the Startup Disk row, and the copy of the list inside the Import Utility,
// where someone already choosing a backup file should see that ready-made
// disks exist.
//
// Why it ships here: tooling/build-shared-project-disks.mjs appends this file
// to the generated index module, so the first look at the disks costs the boot
// payload nothing and fetches ~20 KB of names rather than every manuscript.
// A backup loads when its disk is actually looked into or opened.

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

  // A disk wears the object on it -- "iPhone 12 Pro Max" -- and the article
  // it holds is the second column, because thirty-five article titles folded
  // into six-line icon labels named nothing. The label comes from the disk
  // registry, in both languages.
  function diskLabel(disk, route) {
    const label = disk?.label || {};
    return (isZh() ? label.zh : label.en) || label.zh || disk?.name || route;
  }

  // The month the finished piece came out. The video folders record a month,
  // not a day, so a month is all the column claims; a disk written ahead of its
  // video has none and says so with the Finder's own blank.
  function releasedLabel(disk) {
    const match = /^(\d{4})-(\d{2})$/.exec(String(disk?.released || ""));
    return match ? `${match[1]}/${match[2]}` : "--";
  }

  function wordsLabel(disk) {
    return t("demo_disk_words", Number(disk?.words) || 0);
  }

  // Newest piece first; within a month, the project that began later; a disk
  // with no release yet goes after every one that has one.
  function orderedRoutes() {
    const index = window.AISystem6SharedProjectDisksIndex || {};
    return Object.keys(index).sort((a, b) => {
      const left = index[a] || {};
      const right = index[b] || {};
      return String(right.released || "").localeCompare(String(left.released || ""))
        || String(right.createdAt || "").localeCompare(String(left.createdAt || ""));
    });
  }

  // The rows the Startup Disk's folder draws. They live here rather than in
  // app.js because this module is where the index they read arrives: the boot
  // bundle then carries one guarded call instead of a mapper for data it never
  // has. The folder's own page asks for them through the window manager, which
  // ensures this module first.
  function finderItems() {
    const index = window.AISystem6SharedProjectDisksIndex || {};
    return orderedRoutes().map((route) => {
      const disk = index[route] || {};
      const size = wordsLabel(disk);
      return {
        name: diskLabel(disk, route),
        iconId: "projectDisk",
        icon: "project-disk-icon",
        action: `look-shared-disk-${route}`,
        kind: t("project_disk"),
        description: disk.subject || "",
        sizeLabel: size,
        createdAt: disk.createdAt || disk.exportedAt || "",
        // Sorting by date follows the release month; a disk without one sorts
        // by the day its project began, which is the only date it has.
        updatedAt: disk.released ? `${disk.released}-01T00:00:00.000Z` : (disk.createdAt || ""),
        listCells: [disk.name || route, size, releasedLabel(disk)],
      };
    });
  }
  // The metadata every Finder item carries (built-in size, the folder as its
  // location, the description Get Info shows) is the boot bundle's helper, and
  // this module runs in the same scope, so the rows come back finished.
  window.AISystem6DemonstrationDiskItems = () => (
    typeof withStaticFinderMetadata === "function"
      ? withStaticFinderMetadata(finderItems(), t("demo_disks_title"))
      : finderItems()
  );
  // The list view's columns for this folder: kind and size say the same thing
  // on all thirty-five rows, so the columns carry what differs -- the article,
  // its length and when it came out. A function, so a language switch redraws
  // the headings with the rows.
  window.AISystem6FinderListHeads = {
    ...(window.AISystem6FinderListHeads || {}),
    [WINDOW_NAME]: () => [
      t("demo_disk_column_title"),
      t("demo_disk_column_words"),
      t("demo_disk_column_released"),
    ],
  };

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
    window.AISystem6DiskPeek?.render?.();
  }
  window.renderDemoDisksPanel = renderDemoDisksPanel;

  // Looking inside a disk. The window is its own lazy module; this is the one
  // door to it, so a double click, the space bar and the /go/disks link all
  // arrive at the same place with the same disk.
  async function look(route) {
    if (!route || typeof ensureDiskPeekModule !== "function") return;
    await ensureDiskPeekModule();
    await window.AISystem6DiskPeek?.open?.(route, { from: rowElement(route) });
  }

  function rowElement(route) {
    return document.querySelector(
      `[data-window="${WINDOW_NAME}"] [data-static-finder-action="look-shared-disk-${route}"]`,
    );
  }

  function selectedRoute() {
    const item = typeof getSelectedStaticFinderItem === "function" ? getSelectedStaticFinderItem(WINDOW_NAME) : null;
    const match = /^look-shared-disk-([a-z0-9-]+)$/.exec(item?.action || "");
    return match ? match[1] : "";
  }

  // Select a disk in the folder the way a click would, and keep it in view. The
  // peek window calls this when its arrows walk the shelf, so the folder behind
  // it always shows which disk is being read.
  function selectRoute(route) {
    if (!route || typeof selectStaticFinderItem !== "function") return;
    selectStaticFinderItem(WINDOW_NAME, `look-shared-disk-${route}`);
    rowElement(route)?.scrollIntoView?.({ block: "nearest" });
  }

  // The newest finished piece: what /go/disks opens on, so a visitor arriving
  // from a video sees an article at once instead of thirty-five icons.
  async function openLatest() {
    if (typeof openWindow !== "function") return;
    await openWindow(WINDOW_NAME);
    const route = orderedRoutes()[0];
    if (!route) return;
    selectRoute(route);
    await look(route);
  }

  // Walking the folder with the keyboard. The Finder has no arrow keys of its
  // own, and this folder is the one place a person goes through items one by
  // one to read them, so the keys live with it. Icon view moves by a row with
  // up and down, list view by one; the space bar and Return look inside.
  function gridColumns() {
    const cells = [...document.querySelectorAll(`[data-window="${WINDOW_NAME}"] .finder-item`)];
    if (cells.length < 2) return 1;
    const top = cells[0].offsetTop;
    const index = cells.findIndex((cell) => cell.offsetTop !== top);
    return index === -1 ? cells.length : index;
  }

  function step(route, delta) {
    const routes = orderedRoutes();
    const at = routes.indexOf(route);
    if (at < 0) return routes[0] || "";
    return routes[Math.max(0, Math.min(routes.length - 1, at + delta))];
  }

  function onKeydown(event) {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
    const active = document.querySelector(".window.is-active:not(.is-hidden)");
    if (active?.dataset.window !== WINDOW_NAME) return;
    if (document.querySelector(".menu.is-open")) return;
    if (typeof getActiveEditableElement === "function" && getActiveEditableElement()) return;
    const route = selectedRoute();
    const list = active.querySelector(".finder-list-row") !== null;
    const moves = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: list ? -1 : -gridColumns(),
      ArrowDown: list ? 1 : gridColumns(),
    };
    if (event.key in moves) {
      event.preventDefault();
      selectRoute(route ? step(route, moves[event.key]) : orderedRoutes()[0]);
      return;
    }
    if (event.key === " " || event.key === "Enter") {
      if (event.target?.closest?.("button, a, input, textarea, select") && !event.target.closest("[data-static-finder-action]")) return;
      event.preventDefault();
      const target = route || orderedRoutes()[0];
      selectRoute(target);
      look(target);
    }
  }
  document.addEventListener("keydown", onKeydown);

  window.AISystem6Runtime?.registerCommand?.("open-demo-disks", { handler: open, isAvailable: () => true });
  window.AISystem6Runtime?.registerCommand?.("open-demo-disks-latest", { handler: openLatest, isAvailable: () => true });
  Object.keys(window.AISystem6SharedProjectDisksIndex || {}).forEach((route) => {
    window.AISystem6Runtime?.registerCommand?.(`look-shared-disk-${route}`, { handler: () => look(route), isAvailable: () => true });
  });

  const section = document.querySelector(inlineSectionSelector);
  if (section) section.addEventListener("toggle", renderInline);
  renderInline();

  return Object.freeze({ open, openLatest, look, selectRoute, selectedRoute, step, orderedRoutes, diskLabel, releasedLabel, wordsLabel, renderInline, disks });
}

window.AISystem6DemoDisksPanel = installDemoDisksPanel();
