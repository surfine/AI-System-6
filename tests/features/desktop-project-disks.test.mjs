import vm from "node:vm";
import { createFeatureTest, read, windowApp } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("desktop-project-disks");
const projectDisk = read("app/features/project-disk.js");
const dragDrop = read("app/core/drag-drop.js");
const runtime = read("app/core/desktop-runtime.js");
const icons = read("styles/40-icons.css");
const en = read("app/data/translations-en.js");
const zh = read("app/data/translations-zh.js");

// --- The desktop is the portfolio --------------------------------------------
//
// One project could mount at a time and the rest lived in a menu-bar popover: a
// list of names reachable only by opening a menu, which is not how a Macintosh
// says "you have these". Every project is a disk, and disks live on the desk.
test.assertIncludes(projectDisk, "function renderProjectDiskDesktopIcons", "the desktop draws a disk per project");
test.assertIncludes(projectDisk, "renderProjectDiskDesktopIcons();", "and redraws them wherever the project labels are refreshed");

// The mounted disk keeps its static markup because it is also the drop target
// for filing into the current project; only the ejected ones are drawn.
test.assertIncludes(projectDisk, 'currentProjectLabelEl?.closest(".desktop-icon")', "the mounted disk is the existing icon, not a redrawn one");
test.assertIncludes(
  projectDisk,
  'currentProjectLabelEl.textContent = project ? name : t("current_project_desktop");',
  "the mounted disk names its project, because a row of identical labels names nothing",
);

// --- Dimmed is the native thing, not a modern approximation of it -------------
//
// System 6 greyed a 1-bit icon by dropping every other pixel. A lowered opacity
// would be a different effect that merely reads similarly.
test.assertIncludes(icons, ".desktop-icon.is-ejected-disk .sys-icon", "an ejected disk is dimmed on the desk");
test.assertIncludes(icons, "repeating-conic-gradient(#000 0% 25%, transparent 0% 50%)", "dimming is a real 50% checker");
test.assertIncludes(icons, "mask-size: 2px 2px;", "at the icon's own pixel pitch");
test.assertNotMatches(
  icons.slice(icons.indexOf(".desktop-icon.is-ejected-disk")),
  /^\s*opacity:/m,
  "the disk is dithered, not faded",
);

// --- Putting a disk away -----------------------------------------------------
//
// Dragging a disk to the Trash has always meant eject, never erase. Erasing
// already has its own door, so the Trash is free to mean what it means.
test.assertIncludes(dragDrop, "archiveProjectDiskById(data.id);", "dragging a disk to the Trash puts it away");
test.assertNotIncludes(dragDrop, "moveSelectedProjectToTrash();", "it no longer files the project itself as rubbish");
test.assertIncludes(dragDrop, 't("cannot_archive_mounted_project")', "the disk you are working in is refused, with the reason");
test.assertIncludes(runtime, "function archiveProjectDiskById", "one archive path, addressable by id");
test.assertIncludes(runtime, "archiveProjectDiskById(getSelectedProject()?.id);", "so the menu command and the drag cannot drift apart");

for (const key of ["ejected_project_disk", "cannot_archive_mounted_project"]) {
  test.assertIncludes(en, `${key}:`, `English names ${key}`);
  test.assertIncludes(zh, `${key}:`, `Chinese names ${key}`);
}

test.assert(windowApp("projects") === "finder", "the Project Hard Disk window stays a Finder window");

// --- What the drawing actually does ------------------------------------------

function fakeNode(tag = "span") {
  const node = {
    tagName: tag.toUpperCase(),
    dataset: {},
    children: [],
    attributes: {},
    className: "",
    textContent: "",
    draggable: false,
    removed: false,
    setAttribute(name, value) { this.attributes[name] = value; },
    append(...items) { this.children.push(...items); },
    get firstChild() { return this.children[0]; },
    get lastChild() { return this.children[this.children.length - 1]; },
  };
  return node;
}

function makeColumn(mountedIcon) {
  const order = [mountedIcon];
  const column = {
    order,
    querySelectorAll: () => order.filter((node) => node.dataset?.ejectedProjectId),
  };
  const wire = (node) => {
    node.after = (next) => {
      const at = order.indexOf(node);
      const existing = order.indexOf(next);
      if (existing !== -1) order.splice(existing, 1);
      order.splice(order.indexOf(node) + 1, 0, next);
      wire(next);
    };
    node.remove = () => { node.removed = true; order.splice(order.indexOf(node), 1); };
  };
  wire(mountedIcon);
  return column;
}

const mountedIcon = fakeNode("button");
const column = makeColumn(mountedIcon);
const label = fakeNode();
label.closest = (selector) => (selector === ".icon-column" ? column : mountedIcon);

const source = projectDisk.slice(
  projectDisk.indexOf("function renderProjectDiskDesktopIcons"),
  projectDisk.indexOf("function setProjectDiskActionVisible"),
);

const context = vm.createContext({
  console,
  currentProjectLabelEl: label,
  isProjectMounted: true,
  activeProjectId: "p1",
  projects: [
    { id: "p1", name: "Warfarin" },
    { id: "p2", name: "Kettle" },
    { id: "p3", name: "Put away", archived: true },
  ],
  projectDisplayName: (project) => project.name,
  t: (key, value) => `${key}:${value}`,
  document: { createElement: (tag) => fakeNode(tag) },
  Object,
});
vm.runInContext(source, context);

context.renderProjectDiskDesktopIcons();
let drawn = column.order.filter((node) => node.dataset.ejectedProjectId);
test.assert(drawn.length === 1 && drawn[0].dataset.ejectedProjectId === "p2", "every project that is not mounted gets a disk");
test.assert(!column.order.some((node) => node.dataset.ejectedProjectId === "p1"), "the mounted project is not drawn twice");
test.assert(!column.order.some((node) => node.dataset.ejectedProjectId === "p3"), "an archived disk is put away, not dimmed on the desk");
test.assert(drawn[0].className.includes("is-ejected-disk"), "the drawn disk carries the ejected state");
test.assert(drawn[0].lastChild.textContent === "Kettle", "and its own project's name");
test.assert(drawn[0].dataset.dragType === "project", "so it can be dragged to the Trash like any disk");
test.assert(column.order.indexOf(drawn[0]) === column.order.indexOf(mountedIcon) + 1, "ejected disks sit beside the mounted one");

// Redrawing reuses the icon that is already there: a desktop that rebuilt every
// icon on every label refresh would drop a drag halfway through.
const first = drawn[0];
context.renderProjectDiskDesktopIcons();
drawn = column.order.filter((node) => node.dataset.ejectedProjectId);
test.assert(drawn.length === 1 && drawn[0] === first, "a redraw reuses the disk already on the desk");

// Mounting the other project swaps which disk is dimmed, with nothing stale left.
context.activeProjectId = "p2";
context.renderProjectDiskDesktopIcons();
drawn = column.order.filter((node) => node.dataset.ejectedProjectId);
test.assert(drawn.length === 1 && drawn[0].dataset.ejectedProjectId === "p1", "switching disks swaps which one is dimmed");
test.assert(first.removed === true, "and the disk that mounted is taken off the ejected row");

// --- Looking inside a disk you have not mounted ------------------------------
//
// Read-only on purpose, and read-only in one place: the window carries the
// state, so no control has to remember it.
const peek = read("app/features/project-peek.js");
// Windows whose markup moved into their own lazy module: the boot payload no
// longer carries a window this module already loads on demand. These
// assertions are about what the window CONTAINS, not which file stores it,
// so they read both surfaces and stay true wherever it is built.
const html = `${read("index.html")}\n${read("app/features/project-peek.js")}`;
const registry = read("app/core/window-registry.js");

test.assertIncludes(html, 'data-window="projectPeek"', "the peek has a window");
// Read-only is said, not decorated. System 6 has no read-only window chrome to
// copy, and an invented one would be a claim with nothing behind it — so the
// details bar says the words, the text area is genuinely readonly, and the only
// button is the way out.
test.assertIncludes(html, 'data-i18n="read_only">Read only</span>', "the window says it is read only");
test.assertNotIncludes(html, "project-peek-window is-read-only", "and does not carry a class that styles nothing");
test.assertIncludes(html, 'id="project-peek-body" class="project-peek-body" rows="8" readonly', "its text can be read and not written");
test.assert(windowApp("projectPeek") === "accessories", "it floats over the work instead of replacing it");
test.assertIncludes(registry, "ensureProjectPeekModule()", "and loads on demand, like the rest of the summoned surfaces");

// The two doors it deliberately does not open.
test.assertNotMatches(peek, /openWindow\("teachText"\)|teachTextBodyInput/, "another project's document never reaches the manuscript surface");
test.assertNotMatches(peek, /\.body\s*=|saveDeskState\(\)/, "nothing here writes");
test.assertIncludes(peek, "if (project.id === activeProjectId && isProjectMounted)", "peeking at the mounted disk is just opening it");
test.assertIncludes(peek, "await switchProject(project.id);", "mounting is the one way out of read-only");
test.assertIncludes(peek, 'closeWindow("projectPeek");', "and it closes the peek behind you");

// The desktop icon is what opens it, and it does not mount by accident.
test.assertIncludes(projectDisk, "icon.dataset.action = `peek-project-disk:${project.id}`;", "an ejected disk opens into the peek");
test.assertIncludes(read("app/core/actions.js"), 'String(action).startsWith("peek-project-disk:")', "the id travels with the action, as it does for the Applications folders");

for (const key of ["project_peek", "project_peek_count", "project_peek_mount"]) {
  test.assertIncludes(en, `${key}:`, `English names ${key}`);
  test.assertIncludes(zh, `${key}:`, `Chinese names ${key}`);
}

// --- A lazy window's buttons were dead, and said nothing ---------------------
//
// Found while proving the Mount button: the dispatch registry folds in the
// runtime's commands **once** and caches. A lazily loaded module registers its
// commands when it loads, which is always after the first dispatch has built
// that cache — so every command a lazy window owns was missing from it,
// handleAction found nothing, and returned in silence. A button carrying a
// data-action did nothing at all and reported nothing.
//
// This was not only this window: Hold That Thought's own mode row and Delete
// were dead through the same hole, in a build that had already shipped.
const actions = read("app/core/actions.js");
test.assertIncludes(actions, "let applicationCommandRegistryRuntimeCount = -1;", "the registry remembers how many runtime commands it folded in");
test.assertIncludes(
  actions,
  "if (applicationCommandRegistryCache && applicationCommandRegistryRuntimeCount === runtimeCommandCount) {",
  "and rebuilds itself when a lazily loaded module has registered more",
);

test.finish();
