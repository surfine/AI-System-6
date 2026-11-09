// 文思泉涌 (lane B, P1) — behavior contracts.
//
// The studio's whole P1 behavior runs here against a stub DOM: the demo
// fallback, the three panes, the inspector generated from the site
// description (readonly output, tag chips, URL preview), the search filter,
// and the 2-second auto-save debounce. The demo server is simulated by a
// fetch that refuses, which is exactly the "route not deployed yet" path the
// product takes.

import vm from "node:vm";

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("wensi-b-behavior");
const source = read("app/features/wensi-quanyong.js");

// ---- A DOM stub just wide enough for the studio ---------------------------
// dataset and data-* attributes interconvert (a Proxy on dataset), closest()
// walks real parent links, and listeners are recorded so the contracts can
// drive them. innerHTML stays a string property: rows are asserted as text,
// never parsed.

const kebab = (key) => key.replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`);
const camel = (key) => key.replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.className = "";
    this.id = "";
    this.textContent = "";
    this.innerHTML = "";
    this.value = "";
    this.type = "";
    this.placeholder = "";
    this.title = "";
    this.hidden = false;
    this.spellcheck = false;
    this.rows = 0;
    this.maxLength = -1;
    this.attributes = new Map();
    this.listeners = new Map();
    const element = this;
    this.dataset = new Proxy({}, {
      set(target, prop, value) {
        target[prop] = String(value);
        element.attributes.set(`data-${kebab(String(prop))}`, String(value));
        return true;
      },
      deleteProperty(target, prop) {
        delete target[prop];
        element.attributes.delete(`data-${kebab(String(prop))}`);
        return true;
      },
    });
  }

  append(...nodes) {
    for (const node of nodes) {
      node.parentNode = this;
      this.children.push(node);
    }
  }

  replaceChildren(...nodes) {
    this.children.forEach((child) => { child.parentNode = null; });
    this.children = [...nodes];
    for (const node of nodes) node.parentNode = this;
  }

  setAttribute(name, value) {
    this.attributes.set(String(name), String(value));
    if (String(name).startsWith("data-")) this.dataset[camel(String(name).slice(5))] = String(value);
  }

  getAttribute(name) {
    return this.attributes.has(String(name)) ? this.attributes.get(String(name)) : null;
  }

  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(handler);
  }

  fire(type, event = {}) {
    for (const handler of this.listeners.get(type) || []) handler({ target: this, ...event });
  }

  get classList() {
    const element = this;
    return {
      add(...names) {
        const set = new Set(element.className.split(/\s+/).filter(Boolean));
        names.forEach((name) => set.add(name));
        element.className = [...set].join(" ");
      },
      remove(...names) {
        const set = new Set(element.className.split(/\s+/).filter(Boolean));
        names.forEach((name) => set.delete(name));
        element.className = [...set].join(" ");
      },
      toggle(name, force) {
        const set = new Set(element.className.split(/\s+/).filter(Boolean));
        const on = force === undefined ? !set.has(name) : Boolean(force);
        if (on) set.add(name); else set.delete(name);
        element.className = [...set].join(" ");
        return on;
      },
      contains(name) {
        return element.className.split(/\s+/).includes(name);
      },
    };
  }

  matchesPart(part) {
    const tag = /^([a-z][a-z0-9-]*)/i.exec(part)?.[1]?.toUpperCase() || "";
    if (tag && this.tagName !== tag) return false;
    for (const className of part.matchAll(/\.([a-zA-Z0-9_-]+)/g)) {
      if (!this.classList.contains(className[1])) return false;
    }
    for (const attr of part.matchAll(/\[([a-zA-Z0-9_-]+)(?:="([^"]*)")?\]/g)) {
      const value = this.getAttribute(attr[1]);
      if (value === null || value === undefined) return false;
      if (attr[2] !== undefined && value !== attr[2]) return false;
    }
    return true;
  }

  matches(selector) {
    const parts = selector.trim().split(/\s+/);
    if (!this.matchesPart(parts.at(-1))) return false;
    let ancestor = this.parentNode;
    for (let index = parts.length - 2; index >= 0; index -= 1) {
      while (ancestor && !ancestor.matchesPart?.(parts[index])) ancestor = ancestor.parentNode;
      if (!ancestor) return false;
      ancestor = ancestor.parentNode;
    }
    return true;
  }

  descendants() {
    const all = [];
    const walk = (node) => {
      for (const child of node.children) {
        all.push(child);
        walk(child);
      }
    };
    walk(this);
    return all;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const out = [];
    const seen = new Set();
    for (const part of String(selector).split(",")) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      for (const node of this.descendants()) {
        if (!seen.has(node) && node.matches(trimmed)) {
          seen.add(node);
          out.push(node);
        }
      }
    }
    return out;
  }

  closest(selector) {
    let node = this;
    while (node) {
      if (node.matches?.(selector)) return node;
      node = node.parentNode;
    }
    return null;
  }
}

function buildShell() {
  const win = new FakeElement("section");
  win.className = "window wensi-quanyong-window is-hidden";
  win.setAttribute("data-window", "wensiQuanyong");
  win.setAttribute("aria-labelledby", "wensi-quanyong-title");
  const titleBar = new FakeElement("div");
  titleBar.className = "title-bar";
  const heading = new FakeElement("h2");
  heading.id = "wensi-quanyong-title";
  heading.textContent = "文思泉涌";
  titleBar.append(heading);
  const statusBar = new FakeElement("div");
  statusBar.className = "details-bar compact-status-bar wensi-quanyong-status-bar";
  const siteNode = new FakeElement("span");
  siteNode.className = "status-bar-leading";
  siteNode.setAttribute("data-wensi-site", "");
  const contextNode = new FakeElement("span");
  contextNode.className = "status-bar-context";
  contextNode.setAttribute("data-wensi-context", "");
  const saveNode = new FakeElement("span");
  saveNode.className = "status-bar-trailing";
  saveNode.setAttribute("data-wensi-save-state", "");
  statusBar.append(siteNode, contextNode, saveNode);
  const pane = new FakeElement("div");
  pane.className = "window-pane wensi-quanyong-pane";
  win.append(titleBar, statusBar, pane);
  return { win, titleBar, statusBar, siteNode, contextNode, saveNode, pane };
}

const shell = buildShell();
const document = {
  documentElement: { lang: "zh" },
  createElement: (tagName) => new FakeElement(tagName),
  querySelector: (selector) => (shell.win.matches(selector) ? shell.win : shell.win.querySelector(selector)),
};

const context = vm.createContext({
  window: {},
  document,
  console,
  // The studio's own demo client never touches the network; this refusal is
  // for the /sites probe — the "lane C not deployed" path.
  fetch: () => Promise.reject(new Error("unreachable")),
  setTimeout,
  clearTimeout,
});
vm.runInContext(source, context, { timeout: 2000 });
const api = context.window.AISystem6WensiQuanyong;

function fire(selector, type, event) {
  const node = shell.win.querySelector(selector);
  if (!node) throw new Error(`stub DOM has no ${selector}`);
  node.fire(type, event);
  return node;
}

// Delegated listeners live on a container; run them with the real target.
function fireDelegated(containerSelector, type, target, event = {}) {
  const container = shell.win.querySelector(containerSelector);
  if (!container) throw new Error(`stub DOM has no ${containerSelector}`);
  for (const handler of container.listeners.get(type) || []) handler({ target, ...event });
  return container;
}

function inspectorChildren() {
  return shell.win.querySelectorAll(".wensi-fields .wensi-field");
}

function fieldControlOf(key) {
  return shell.win.querySelector(`[data-wensi-field="${key}"]`);
}

// ---- Pure helpers ---------------------------------------------------------

test.assert(JSON.stringify(api.resolveSites(null)) === JSON.stringify({ sites: [api.demoSite()], demoMode: true }), "an unreachable server resolves to the demo site");
test.assert(api.resolveSites({ sites: [{ id: "a", contentTypes: { t: {} } }] }).demoMode === false, "a valid site list goes remote");
test.assert(api.resolveSites({ sites: [{ id: "", contentTypes: {} }] }).demoMode === true, "a description without types falls back to demo");

const fixtureRows = [
  { path: "/a.md", title: "静态站速记", date: "2026-11-01", slug: "a", tags: ["静态站"], category: "notice", status: "draft", gitDirty: false },
  { path: "/b.md", title: "本机优先一周", date: "2026-11-02", slug: "b", tags: ["本机优先"], status: "published", gitDirty: true, body: "正文里提到便签。" },
  { path: "/c.md", title: "未公开旧文", date: "2026-11-03", slug: "c", tags: [], status: "unpublished", gitDirty: false },
];
test.assert(api.filterArticles(fixtureRows, "", "draft").length === 2, "the draft filter holds drafts and unpublished posts");
test.assert(api.filterArticles(fixtureRows, "", "published").length === 1, "the published filter is exact");
test.assert(api.filterArticles(fixtureRows, "", "dirty").map((row) => row.path).join() === "/b.md", "the dirty filter follows gitDirty");
test.assert(api.filterArticles(fixtureRows, "便签", "all").length === 1, "search reaches the body text");
test.assert(api.filterArticles(fixtureRows, "本机优先", "all").length === 1, "search reaches the tags");
test.assert(api.filterArticles(fixtureRows, "速记", "draft").length === 1, "search and status compose");
test.assert(api.filterArticles(fixtureRows, "", "all", "notice").map((row) => row.path).join() === "/a.md", "a category narrows the library");
test.assert(api.filterArticles(fixtureRows, "", "all", "").length === 3, "an empty category keeps the whole library");

const demoType = api.demoSite().contentTypes.daily;
test.assert(JSON.stringify(api.requiredMissing(demoType.fields, {})) === JSON.stringify(["title", "date", "slug"]), "required-missing lists the empty required keys");
test.assert(api.requiredMissing(demoType.fields, { title: "x", date: "2026-11-08", slug: "x" }).length === 0, "filled required keys pass");
test.assert(JSON.stringify(api.requiredMissing(demoType.fields, { title: "x", date: "2026/11/08", slug: "x" })) === JSON.stringify(["date"]), "a date off the site's format counts as missing");

const site = api.demoSite();
test.assert(api.articleUrlPreview(site, "daily", { date: "2026-11-08", slug: "x" }, [], "") === "/2026/11/08/", "one post that day collapses to the slug-less address");
test.assert(api.articleUrlPreview(site, "daily", { date: "2026-11-08", slug: "x" }, [{ path: "/other.md", date: "2026-11-08" }], "") === "/2026/11/08/x/", "two posts that day append the slug");
test.assert(api.articleUrlPreview(site, "notes", { slug: "m" }, [], "") === "/notes/m/", "the notes rule carries its own shape");
test.assert(api.articleUrlPreview({ contentTypes: { daily: {} } }, "daily", {}, [], "") === "", "a type without a URL rule previews nothing");
test.assert(api.newArticleFilename(site, "daily", { date: "2026-03-04", slug: "hello" }) === "2026-03-04-hello.md", "file-per naming follows the storage rule");
test.assert(api.newArticleFilename(site, "daily", { date: "2026-03-04", slug: "" }) === "2026-03-04-untitled.md", "an empty slug still names a file");

// A drop bigger than one request is split into requests the route accepts.
{
  const tiny = (name) => ({ name, data: "x".repeat(10) });
  const twelve = Array.from({ length: 12 }, (_, index) => tiny(`p${index}.jpg`));
  test.assert(api.batchPhotoPayload([]).length === 0, "an empty drop makes no request");
  test.assert(api.batchPhotoPayload(twelve).length === 1 && api.batchPhotoPayload(twelve)[0].length === 12,
    "twelve photographs fit one request");
  const thirteen = api.batchPhotoPayload([...twelve, tiny("p13.jpg")]);
  test.assert(thirteen.length === 2 && thirteen[1].length === 1, "the thirteenth starts a second request");
  const heavy = { name: "a.jpg", data: "x".repeat(40 * 1024 * 1024) };
  const split = api.batchPhotoPayload([heavy, tiny("b.jpg")]);
  test.assert(split.length === 2 && split[0].length === 1, "a request never pushes its base64 past the body limit");
  test.assert(api.batchPhotoPayload([tiny("a"), heavy]).length === 2, "the oversized one travels alone");
  test.assert(api.batchPhotoPayload([{ name: "m.jpg", data: "x".repeat(30 * 1024 * 1024) }, tiny("n.jpg")]).length === 1,
    "under the ceiling, a big photo and a small one still share a request");
}

// The debounce: one save per pause, whatever the typing rhythm.
{
  let saves = 0;
  const pending = [];
  const scheduler = api.createSaveScheduler({
    delay: 2000,
    save: () => { saves += 1; },
    schedule: (fn, ms) => { pending.push([fn, ms]); return pending.length; },
    cancel: (id) => { pending[id - 1] = null; },
  });
  scheduler.touch();
  scheduler.touch();
  test.assert(saves === 0 && pending.filter(Boolean).length === 1, "a second touch inside the pause cancels the first timer");
  const [fn, ms] = pending.find(Boolean);
  test.assert(ms === 2000, "the pause is two seconds");
  fn();
  test.assert(saves === 1, "the pause fires exactly one save");
  scheduler.flush();
  test.assert(saves === 2, "a flush saves immediately");
}

// ---- The window: demo fallback, three panes -------------------------------

api.attach();
const win = shell.win;
test.assert(!!win.querySelector(".wensi-shell"), "attach fills the stub shell with the three-pane studio");
const shellNode = win.querySelector(".wensi-shell");
test.assert(shellNode.children.length === 3, "the studio is library, writing surface, inspector");
test.assert(win.querySelector(".wensi-editor-host [data-wensi-body]")?.id === "wensi-body", "the body textarea carries the Format-surface id");
test.assert(win.querySelector("[data-wensi-focus]").hidden === true, "without a focus-mode interface the button hides (lane A lands it)");

await api.open();
test.assert(api.state().demoMode === true, "a refusing server boots the studio into demo mode");
test.assert(api.state().siteId === "demo", "the demo site is selected");
test.assert(shell.siteNode.textContent.includes("演示"), "the status bar says 演示 explicitly");
test.assert(win.querySelector(".wensi-site-select").children[0].textContent === "Demo", "the site select lists the demo site");

const listHtml = win.querySelector("[data-wensi-list]").innerHTML;
test.assert(listHtml.includes("日更") && listHtml.includes("笔记"), "the library groups by the description's content types");
test.assert(listHtml.includes("把博客搬回本机的第一周") && listHtml.includes("定时发布为什么这么难") && listHtml.includes("写给未来自己的三行备忘"), "the three demo articles list");
test.assert(listHtml.includes("草稿") && listHtml.includes("已发布"), "rows carry their derived status");
test.assert(listHtml.includes("wensi-dirty"), "the dirty article shows its unsaved-push mark");

// ---- Open, inspector, readonly, tags, URL preview -------------------------

await api.openArticle("daily", "/demo/posts/2026-11-05-back-to-local-first-week.md");
test.assert(win.querySelector(".wensi-editor-host [data-wensi-body]").value.startsWith("把博客搬回本机的第一周，最大的感受"), "opening an article puts its body in the writing surface");
test.assert(shell.titleBar.children[0].textContent === "把博客搬回本机的第一周", "the window title follows the open article");
test.assert(api.state().draft.status === "published" && Array.isArray(api.state().draft.opaqueKeys) && api.state().draft.opaqueKeys.includes("voice"), "the article payload's status and opaque keys ride the draft (lane C's shape)");
test.assert(inspectorChildren().length === api.demoSite().contentTypes.daily.fields.length, "the inspector generates one row per described field");
test.assert(fieldControlOf("voice").tagName === "OUTPUT", "a readonly field renders as read-only output, not an input");
test.assert(fieldControlOf("date").type === "text" && fieldControlOf("date").placeholder === "YYYY-MM-DD", "a date field stays a text input with the site's format as its hint — native date chrome belongs to no era");
test.assert(fieldControlOf("title").maxLength === 60, "maxLength reaches the control");
const urlPreview = win.querySelector("[data-wensi-url-preview]");
test.assert(urlPreview.textContent === "/2026/11/05/", "the URL preview follows the description's rule");

let tagsWrap = shell.win.querySelector(".wensi-tags");
let chips = tagsWrap.querySelectorAll("[data-wensi-tag]");
test.assert(chips.length === 4, "the tag selector lists the site taxonomy");
test.assert(chips.filter((chip) => chip.getAttribute("aria-pressed") === "true").length === 2, "the article's own tags are pressed");
fireDelegated(".wensi-fields", "click", chips.find((chip) => chip.getAttribute("data-wensi-tag") === "写作"));
test.assert(!api.state().draft.frontMatter.tags.includes("写作"), "clicking a pressed chip removes the tag");
tagsWrap = shell.win.querySelector(".wensi-tags");
fireDelegated(".wensi-fields", "click", tagsWrap.querySelectorAll("[data-wensi-tag]").find((chip) => chip.getAttribute("data-wensi-tag") === "写作"));
test.assert(api.state().draft.frontMatter.tags.includes("写作"), "clicking again restores it");
tagsWrap = shell.win.querySelector(".wensi-tags");

const tagAdd = tagsWrap.querySelector("[data-wensi-tag-add]");
tagAdd.value = "全新标签";
fireDelegated(".wensi-fields", "keydown", tagAdd, { key: "Enter", preventDefault() {} });
test.assert(api.state().draft.frontMatter.tags.includes("全新标签"), "Enter adds a typed tag");
tagsWrap = shell.win.querySelector(".wensi-tags");
test.assert(tagsWrap.querySelectorAll(".wensi-tag.is-new").some((chip) => chip.getAttribute("data-wensi-tag") === "全新标签"), "a tag outside the taxonomy wears the new-tag highlight");
fireDelegated(".wensi-fields", "keydown", tagAdd, { key: "Enter", preventDefault() {} });
test.assert(api.state().draft.frontMatter.tags.filter((tag) => tag === "全新标签").length === 1, "adding the same tag twice keeps one");

// ---- Auto-save: dirty, pause, saved ---------------------------------------

const titleControl = fieldControlOf("title");
titleControl.value = "改过的标题";
fireDelegated(".wensi-fields", "input", titleControl);
test.assert(api.state().dirty === true && api.state().saveState === "dirty", "typing marks the draft dirty");
test.assert(win.querySelector("[data-wensi-save-note]").textContent.includes("未保存") || shell.saveNode.textContent.includes("未保存"), "the save note says unsaved changes");
await api.flushSave();
test.assert(api.state().saveState === "saved" && api.state().dirty === false, "the pause saves and settles");
test.assert(api.state().savedAt !== "", "the save note carries the time");
test.assert(win.querySelector("[data-wensi-list]").innerHTML.includes("改过的标题"), "the library row follows the saved title");

const saved = api.createDemoStore();
const contested = saved.saveArticle({ type: "daily", path: "/demo/posts/2026-11-05-back-to-local-first-week.md", frontMatter: { ...saved.site.contentTypes.daily.fields.reduce((matter, field) => ({ ...matter, [field.key]: field.type === "readonly" ? "被篡改的声音" : "" }), {}), title: "x", date: "2026-11-05", slug: "back-to-local-first-week", tags: [], voice: "被篡改的声音" }, body: "x" });
test.assert(saved.loadArticle({ type: "daily", path: "/demo/posts/2026-11-05-back-to-local-first-week.md" }).frontMatter.voice !== "被篡改的声音", "readonly fields survive a save that tries to change them");
test.assert(Array.isArray(contested.warnings) && contested.warnings.length > 0, "the save reports the keys the server kept for itself");

// ---- Search and status filters --------------------------------------------

const searchNode = win.querySelector("[data-wensi-search]");
searchNode.value = "备忘";
searchNode.fire("input");
test.assert(win.querySelector("[data-wensi-list]").innerHTML.includes("三行备忘"), "search narrows the library");
test.assert(!win.querySelector("[data-wensi-list]").innerHTML.includes("定时发布"), "the filtered-out group leaves the list");
searchNode.value = "重建";
searchNode.fire("input");
test.assert(win.querySelector("[data-wensi-list]").innerHTML.includes("定时发布"), "search reaches the demo bodies");
searchNode.value = "";
searchNode.fire("input");

const draftFilter = win.querySelectorAll("[data-wensi-filter]").find((button) => button.getAttribute("data-wensi-filter") === "draft");
fireDelegated(".wensi-filters", "click", draftFilter);
test.assert(draftFilter.getAttribute("aria-pressed") === "true", "the pressed filter marks itself");
test.assert(win.querySelector("[data-wensi-list]").innerHTML.includes("定时发布") && !win.querySelector("[data-wensi-list]").innerHTML.includes("把博客搬回本机的第一周"), "the draft filter holds only the held post");
fireDelegated(".wensi-filters", "click", win.querySelectorAll("[data-wensi-filter]").find((button) => button.getAttribute("data-wensi-filter") === "all"));

// ---- Required-missing hint on a new draft ---------------------------------

await api.newDraft();
const requiredHint = win.querySelector("[data-wensi-required]");
test.assert(requiredHint.hidden === false, "a fresh draft shows the required hint");
test.assert(requiredHint.textContent.includes("title") && requiredHint.textContent.includes("slug"), "the hint names the missing required keys");
const missingControls = ["title", "slug"].map(fieldControlOf);
test.assert(missingControls.every((control) => control.classList.contains("is-required-missing")), "missing required controls wear the red line");
test.assert(!fieldControlOf("date").classList.contains("is-required-missing"), "a pre-filled required field is not marked");
const draftTitle = fieldControlOf("title");
draftTitle.value = "借来的新稿";
fireDelegated(".wensi-fields", "input", draftTitle);
test.assert(!requiredHint.textContent.includes("title") || requiredHint.hidden, "filling a field clears it from the hint");
await api.flushSave();
test.assert(api.state().draft.path === `/demo/posts/${new Date().toISOString().slice(0, 10)}-untitled.md` || api.state().draft.path.startsWith("/demo/posts/"), "the first save files the new draft under its storage rule");
test.assert(win.querySelector("[data-wensi-list]").innerHTML.includes("借来的新稿"), "the saved new draft joins the library");

// ---- The publish door ------------------------------------------------------

const handedOver = await api.openDraftFromText({ title: "写作流程交来的稿子", body: "这是正文，由 publish 意图带进来。" });
test.assert(handedOver === true, "openDraftFromText opens the studio with the text");
test.assert(api.state().draft.isNew === true, "the handover is a new draft");
test.assert(win.querySelector(".wensi-editor-host [data-wensi-body]").value.includes("publish 意图带进来"), "the handed-over body sits in the writing surface");
test.assert(fieldControlOf("title").value === "写作流程交来的稿子", "the handed-over title fills its field");
await api.flushSave();
test.assert(api.state().saveState === "saved", "the handover saves like any draft");

test.finish();
