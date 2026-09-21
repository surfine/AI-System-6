// The list of the Project Hard Disks that ship with the application.
//
// Two people need this and neither is a developer: a reader who has just met
// one of the two disks and wants to know where it lands, and a person opening
// the Writing route who wonders what a finished disk looks like. Both arrive
// with an intention, so the list lives where that intention already is -- a
// small window the File menu opens, and the Project backup section of the
// Import Utility -- rather than on the desk where it would be decoration.
//
// Why it ships here: this file is appended to the generated shared-disks data
// module by tooling/build-shared-project-disks.mjs. The boot payload is
// measured against the floppy budget, so a window that costs nothing until it
// is opened is the only honest way to add one. It reuses the Import Utility's
// row classes and the standard window chrome; no new stylesheet is needed.
//
// installDemoDisksPanel() is the mount symbol the interface registry points at
// (tooling/interface-guidelines-contract.mjs), the same shape every other
// module-built window uses, so the appearance and HIG instruments can mount
// this window the way they mount theirs.

function installDemoDisksPanel() {
  const APP_ID = "projectDisks";
  const WINDOW_NAME = "projectDisks";
  const TITLE_ID = "project-disks-title";
  const inlineSectionSelector = ".backup-preview-section";
  const inlineHostId = "demo-disks-inline";
  const mountKeyPrefix = "aiSystem6SharedDisk:";

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

  // One line per disk, taken from the writer's own question sheet rather than
  // from a hand-kept blurb: a new disk cannot arrive without one, and the line
  // cannot drift away from what the project says about itself.
  function summary(bundle) {
    const sheet = String(bundle?.project?.questionSheet || "");
    const lines = sheet.split("\n");
    const start = lines.findIndex((line) => /^#{2,3}\s*(主题|Subject|Topic)\s*$/i.test(line.trim()));
    if (start >= 0) {
      for (let index = start + 1; index < lines.length; index += 1) {
        const line = lines[index].trim();
        if (!line) continue;
        if (line.startsWith("#")) break;
        const cleaned = line.replace(/^[-*]\s*/, "").replace(/\s+/g, " ");
        if (cleaned) return cleaned.length > 96 ? `${cleaned.slice(0, 96)}…` : cleaned;
      }
    }
    const files = Array.isArray(bundle?.files) ? bundle.files.length : 0;
    const scraps = Array.isArray(bundle?.scraps) ? bundle.scraps.length : 0;
    return isZh() ? `${files} 个文件 · ${scraps} 条摘录` : `${files} files · ${scraps} excerpts`;
  }

  function disks() {
    const published = window.AISystem6SharedProjectDisks || {};
    return Object.keys(published)
      .map((route, index) => ({ route, index, bundle: published[route] }))
      .sort((left, right) => {
        const leftTime = Date.parse(left.bundle?.exportedAt || "") || 0;
        const rightTime = Date.parse(right.bundle?.exportedAt || "") || 0;
        if (rightTime !== leftTime) return rightTime - leftTime;
        return left.index - right.index;
      });
  }

  function button(label, handler) {
    const element = document.createElement("button");
    element.type = "button";
    element.className = "btn";
    element.textContent = label;
    element.addEventListener("click", handler);
    return element;
  }

  function rowFor({ route, bundle }) {
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
    name.textContent = bundle?.project?.name || route;
    const line = document.createElement("small");
    // The row is one line, so the name and the subject need a mark between
    // them: without it the two read as one run-on word.
    line.textContent = ` · ${summary(bundle)}`;
    label.append(name, line);
    row.append(icon, label);

    const here = Boolean(mountedProject(route));
    const open = button(
      here
        ? t2("demo_disk_open_existing", "打开已有的", "Open existing")
        : t2("demo_disk_open", "打开", "Open"),
      () => {
        if (typeof openSharedProjectDisk !== "function") return;
        Promise.resolve(openSharedProjectDisk(route)).then(() => {
          renderWindow();
          renderInline();
        }, () => {
          renderWindow();
          renderInline();
        });
      },
    );
    row.append(open);
    return row;
  }

  function listFor(entries) {
    const list = document.createElement("div");
    list.className = "demo-disks-list";
    entries.forEach((entry) => list.append(rowFor(entry)));
    return list;
  }

  function windowFrame() {
    let win = document.querySelector(`.window[data-window="${WINDOW_NAME}"]`);
    if (win) return win;
    win = document.createElement("section");
    win.className = "window project-disks-window is-hidden";
    win.setAttribute("data-window", WINDOW_NAME);
    win.setAttribute("aria-labelledby", TITLE_ID);
    const bar = document.createElement("div");
    bar.className = "title-bar";
    const close = document.createElement("button");
    close.className = "close-box";
    close.type = "button";
    close.setAttribute("aria-label", t2("close", "关闭", "Close"));
    const title = document.createElement("h2");
    title.id = TITLE_ID;
    title.textContent = t2("demo_disks_title", "演示用项目硬盘", "Demonstration Project Disks");
    const zoom = document.createElement("button");
    zoom.className = "resize-box";
    zoom.type = "button";
    zoom.setAttribute("aria-label", t2("zoom", "缩放", "Zoom"));
    const shade = document.createElement("button");
    shade.className = "shade-box";
    shade.type = "button";
    shade.setAttribute("aria-label", t2("collapse", "折叠", "Collapse"));
    bar.append(close, title, zoom, shade);
    const pane = document.createElement("div");
    pane.className = "window-pane";
    win.append(bar, pane);
    document.querySelector(".desk")?.append(win) || document.body.append(win);
    return win;
  }

  function pane() {
    return windowFrame().querySelector(".window-pane");
  }

  function renderWindow() {
    const container = pane();
    if (!container) return;
    container.replaceChildren();

    const blurb = document.createElement("p");
    blurb.className = "hint";
    blurb.textContent = t2(
      "demo_disks_blurb",
      "两块演示盘，是作者走完整条路线之后的现场。打开即在这台电脑上新建一份副本。",
      "Two demonstration disks, the site each writer left after walking the whole route. Opening one makes a copy on this computer.",
    );
    const readme = button(
      t2("demo_disks_how", "这是怎么来的？", "How did these get here?"),
      () => {
        if (typeof openSystemFolderDocument === "function") openSystemFolderDocument("shared");
      },
    );
    container.append(blurb, readme);

    const published = window.AISystem6SharedProjectDisks;
    if (!published || typeof published !== "object" || !Object.keys(published).length) {
      const failed = document.createElement("p");
      failed.className = "hint";
      failed.textContent = t2(
        "demo_disks_failed",
        "暂时读不出演示用项目硬盘。",
        "The demonstration disks cannot be read right now.",
      );
      const retry = button(
        t2("demo_disks_retry", "重试", "Try again"),
        async () => {
          loading();
          try {
            if (typeof ensureSharedProjectDisksModule === "function") await ensureSharedProjectDisksModule();
          } catch {
            // The loader reports its own failure; the pane shows the outcome.
          }
          renderWindow();
          renderInline();
        },
      );
      container.append(failed, retry);
      return;
    }
    container.append(listFor(disks()));
  }

  function loading() {
    const container = pane();
    if (!container) return;
    container.replaceChildren();
    const status = document.createElement("p");
    status.className = "hint";
    status.textContent = t2(
      "demo_disks_loading",
      "正在读取演示用项目硬盘…",
      "Reading the demonstration disks…",
    );
    container.append(status);
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

  // The Import Utility gets the rows without the window's two-sentence
  // explanation: whoever is already in that window wants the disks, not the
  // introduction.
  function renderInline() {
    const host = inlineHost();
    if (!host) return;
    host.replaceChildren();
    const published = window.AISystem6SharedProjectDisks;
    if (!published || typeof published !== "object" || !Object.keys(published).length) return;
    host.append(listFor(disks()));
  }

  function open() {
    windowFrame();
    if (typeof openWindow === "function") openWindow(WINDOW_NAME);
    loading();
    Promise.resolve()
      .then(() => (typeof ensureSharedProjectDisksModule === "function" ? ensureSharedProjectDisksModule() : null))
      .catch(() => null)
      .then(() => {
        renderWindow();
        renderInline();
      });
  }

  const section = document.querySelector(inlineSectionSelector);
  if (section) section.addEventListener("toggle", renderInline);
  renderInline();

  window.AISystem6Runtime?.registerApplication?.({
    id: APP_ID,
    windowName: WINDOW_NAME,
    mount: renderWindow,
    restore: renderWindow,
    commands: {
      "open-demo-disks": { handler: open },
    },
  });

  return Object.freeze({ open, renderWindow, renderInline, disks });
}

window.AISystem6DemoDisksPanel = installDemoDisksPanel();
