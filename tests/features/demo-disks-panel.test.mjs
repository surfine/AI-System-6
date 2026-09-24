// The demonstration project disks have to be findable by the two people who
// need them: a reader who just met one of the disks, and a person walking the
// Writing route who wants to see what a finished disk looks like. Findable
// means the Startup Disk and the File menu both open a folder that lists them,
// the Import Utility shows the same rows, and a help page answers "what is
// this?".
//
// The form is the Finder's own. A disk is an object in a folder -- count, view
// controls, selection, Get Info, double click -- because the earlier shape (a
// small window with a private list and a private button) made this the one
// collection in the product that did not behave like a folder.
//
// Two rules survive every refactor here. First, the boot budget: the folder is
// markup, its rows are lazy, and neither the rows nor the backups may appear in
// the modules measured against the floppy. Second, opening a folder is not the
// same act as opening a disk: the list must not fetch thirty-five manuscripts
// to draw thirty-five names.
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";
import { createAppBootVm } from "../helpers/app-boot-vm.mjs";

const test = createFeatureTest("demo-disks-panel");

const menus = read("app/data/menus.js");
const actions = read("app/core/actions.js");
const panel = read("app/content/shared-disks-panel.js");
const index = read("app/content/shared-project-disks-index.js");
const backups = read("app/content/shared-project-disks.js");
const help = read("app/data/writing-flow-help.js");
const translationsZh = read("app/data/translations-zh.js");
const translationsEn = read("app/data/translations-en.js");
const importWindow = read("app/features/export-import.js");
const manifest = read("tooling/runtime-manifest.mjs");
const app = read("app.js");
const html = read("index.html");
const registry = read("app/core/window-registry.js");
const readme = read("README.md");
const readmeZh = read("README.zh-CN.md");

// 1. The File menu entry sits with the project commands, and it is a window
//    command, so the 1992 ellipsis rule applies: the real … character. Its id
//    is its own: "open-project-disks" already opens the mounted Project Hard
//    Disk, and a second registration under that id throws at boot.
test.assertMatches(
  menus,
  /menuItem\("open-demo-disks", "open_demo_disks"\),\s*\n\s*menuItem\("open-project-overview", "project_overview"\)/,
  "Finder's File menu opens the demonstration disks beside the project commands",
);
test.assertIncludes(translationsZh, 'open_demo_disks: "打开演示用项目硬盘…"', "中文菜单项带真的省略号");
test.assertIncludes(translationsEn, 'open_demo_disks: "Open Demonstration Project Disks…"', "the English menu item carries the real ellipsis");
test.assertIncludes(
  actions,
  'registerCommand?.("open-project-disks"',
  'the mounted Project Hard Disk keeps "open-project-disks", so the desk icon and Finder row are unchanged',
);
test.assertIncludes(
  read("app/core/app-admissions.js"),
  'command: "open-demo-disks"',
  "the File row is admitted, so the availability pass answers for it",
);
test.assertIncludes(read("app/core/window-manager.js"), "AISystem6Admissions?.commands", "the availability pass reads the admission table");

// 2. The command is lazy, and it loads the LIST rather than the backups: the
//    folder has to be listable without fetching every manuscript in the set.
test.assertIncludes(actions, "registerOpeners", "the boot hands the openers to the shared admission table");
test.assertIncludes(read("app/core/app-admissions.js"), "load: ensureSharedProjectDisksIndexModule", "the disks command loads the index module, not the backups");
test.assertIncludes(read("app/core/config.js"), '"app/content/shared-project-disks-index.js"', "the index has its own lazy loader");
test.assertIncludes(read("app/core/config.js"), '["styles.project-disks.css"]', "the folder's own size ships with the list that needs it");

// 3. The folder is a Finder page in index.html, not a window a module builds.
//    This is the assertion that inverts the old one: the page is ordinary
//    markup precisely so the Finder's own chrome, placement, selection and Get
//    Info apply to it.
test.assertMatches(
  html,
  /<section class="window finder-window project-disks-window is-hidden" data-window="projectDisks"[\s\S]{0,1400}?class="window-pane finder-grid window-frame-scroller"/,
  "the folder is a Finder window with a grid pane, not a bespoke window",
);
test.assertIncludes(html, 'data-view-window="projectDisks"', "the folder carries the shared view controls");
test.assertIncludes(html, '<span data-i18n="demo_disks_title">', "the title rides the translation table like every other window");
test.assert(
  !panel.includes('document.createElement("section")') && !panel.includes('setAttribute("data-window"'),
  "the module builds no window frame of its own",
);
test.assert(
  !manifest.includes('"app/content/shared-disks-panel.js"'),
  "the panel source stays out of the boot bundle and rides the generated list module",
);
test.assertIncludes(index, "window.AISystem6DemoDisksPanel", "the generator appends the panel to the list module");

// 4. The list is data, not a hand-kept roster: the rows come from the generated
//    index, each row IS one disk, and its action is the same command a
//    /go/<route> link runs. Nothing here names a disk, so a thirty-fifth disk
//    costs one registration and no edit in this window.
//
//    The mapper lives in the module that also carries the index (it was in
//    app.js until the boot budget needed the bytes back: the folder's page asks
//    for rows through a guarded call, and the module that has the data maps
//    them). What matters is unchanged: no disk is named, and each row's action
//    is the route's own command.
test.assertIncludes(app, "window.AISystem6DemonstrationDiskItems?.()", "the folder's page asks the disk module for its rows");
test.assertIncludes(panel, "window.AISystem6SharedProjectDisksIndex", "and that module reads the published index");
test.assertMatches(panel, /action: `open-shared-disk-\$\{route\}`/, "a row opens the disk through the route's own command");
{
  const mapper = panel.slice(panel.indexOf("function finderItems()"), panel.indexOf("window.AISystem6DemonstrationDiskItems"));
  test.assert(
    !/["'](?:dtk|ipad1|m5mba)["']/.test(mapper),
    "the folder names no disk: a new disk needs one registration, not an edit here",
  );
  test.assert(
    !/sizeLabel/.test(mapper),
    "a disk reports the shared built-in size rather than a byte figure nobody measured",
  );
}
test.assertIncludes(index, '"name":', "the index carries the project's own name");
test.assertIncludes(index, '"subject":', "the index carries the writer's own subject line");
// That the subject IS the writer's own line, rather than something the build
// invented, needs both the source disk and the index, so it is asserted where
// both exist: tests/features/shared-disk-sources.test.mjs.
test.assert(
  index.length * 50 < backups.length,
  `opening the folder fetches the list, not the manuscripts (${index.length} vs ${backups.length} bytes)`,
);
test.assert(
  !index.includes("documentTabs") && !index.includes("questionSheet"),
  "the list module carries no manuscript and no question sheet, only what a row shows",
);
test.assertIncludes(actions, "open-shared-disk-${route}", "one row per route, so a new disk is a registration and not a second mechanism");
for (const route of ["dtk", "ipad1"]) {
  test.assertIncludes(index, `"${route}":`, `${route} is in the generated list`);
}

// 5. Opening a row and opening the folder are different acts, and the module
//    only owns what the Finder cannot: the command, and the Import Utility's
//    copy of the rows. Both doors dispatch the same id.
test.assertIncludes(panel, 'registerCommand?.("open-demo-disks"', "the module answers the File and Startup Disk rows");
test.assertIncludes(panel, 'openWindow(WINDOW_NAME)', "and its answer is opening the Finder folder");
test.assertIncludes(panel, "inlineSectionSelector", "the module also renders into the Import Utility");
// The row is .import-row's own shape: icon | flexible label | trailing control.
// .backup-preview-row re-cuts those columns for a preview with no button, so a
// fourth child would drop into a 22px second row and squeeze the button.
test.assertIncludes(panel, 'row.className = "import-row"', "the row reuses the Import Utility's row grid");
test.assert(
  panel.includes("row.append(icon, label)") && panel.includes('row.append(button('),
  "the row is icon, label and one control, which is what the three columns hold",
);
test.assertIncludes(
  importWindow,
  "ensureSharedProjectDisksIndexModule?.();",
  "opening the backup panel loads the disk list rather than the backups",
);
test.assertIncludes(panel, '"demo_disk_open_existing"', "an already-mounted disk offers its own copy");

// 6. The help page answers what the disks are, and the Read Me points at them.
test.assertIncludes(help, "# 演示用项目硬盘", "帮助文档有中文说明");
test.assertIncludes(help, "system6.aaronlau.me/go/<route>", "帮助文档给出可转发的地址形式");
test.assertIncludes(help, "启动磁盘上的一个文件夹", "中文说明指出它们在启动磁盘上");
test.assertIncludes(help, "/go/dtk", "中文说明列出未来通车之后");
test.assertIncludes(read("app/features/translation.js"), 'shared: "shared_readme"', "说明文档标题走既有的说明文件命名");

// 7. The public README names the disks and tells a developer what adding a
//    third one costs.
test.assertIncludes(readme, "https://system6.aaronlau.me/go/ipad1", "README 列出两块盘");
test.assertIncludes(readmeZh, "https://system6.aaronlau.me/go/dtk", "中文 README 列出两块盘");
test.assertIncludes(readme, "tooling/build-shared-project-disks.mjs", "README 告诉开发者登记处");
test.assertIncludes(readmeZh, "tests/features/launch-intent.test.mjs", "中文 README 指出守着源盘与发布副本的契约");

// 8. Both registries have to agree: window-registry.test.mjs fails on a record
//    without an interface contract, and the appearance/HIG/screenshot
//    instruments read the interface registry, so this row is one decision
//    recorded twice. A Finder folder is a Finder surface there too.
test.assertIncludes(registry, "projectDisks: {", "窗口在运行时注册表里有记录");
test.assertIncludes(registry, "ensureSharedProjectDisksIndexModule()", "注册表的懒加载指向清单模块");
test.assertIncludes(registry, 'onOpen: () => renderStaticFinderWindow("projectDisks")', "开窗时用 Finder 自己的画笔");
test.assertIncludes(read("app.js"), '["shared_readme", "open-demo-disks-readme", "projectDisk"]', "说明文件夹列出这一篇");
test.assertIncludes(actions, '"open-demo-disks-readme":"shared"', "说明文件夹的行打开同一篇文档");

// 9. Then boot the desk. The rows above are the shape; this is the wiring. The
//    failure this catches is the one the id nearly caused: registerLazyCommand()
//    throws on a duplicate id, and the throw happens at the top of the eager
//    bundle, so a colliding command takes the rest of the boot down with it
//    rather than greying one menu row.
const vmw = createAppBootVm();
const lazyCommand = vmw.run('AISystem6Runtime.getLazyCommand("open-demo-disks")');
test.assert(
  !!lazyCommand && typeof lazyCommand.ensure === "function",
  "the boot registers the demonstration folder as a lazy command, and does not throw doing it",
);
test.assert(
  vmw.run('AISystem6Runtime.getCommand("open-demo-disks") === null'),
  "the handler itself arrives with the list module, not with the boot bundle",
);
test.assert(
  vmw.run('getActionAvailability()["open-demo-disks"] === true'),
  "the File row answers for its own availability instead of staying black by omission",
);
test.assert(
  vmw.run('menuSetForApp("finder").some((menu) => menu.items.some((item) => item.action === "open-demo-disks"))'),
  "the Finder's own menu set carries the row, read from the shipped menu module",
);

// The command it deliberately did not take over: the desk icon, the Finder row
// and the writing route's first stop all dispatch "open-project-disks", and
// that one still opens the mounted Project Hard Disk.
await vmw.context.handleAction("open-project-disks");
const projectsWindow = vmw.windowElement("projects");
test.assert(
  await vmw.waitFor(() => projectsWindow.classList.contains("is-active")),
  'the mounted Project Hard Disk still opens from "open-project-disks"',
);
test.assert(
  !vmw.run('!!document.querySelector(\'.window[data-window="projectDisks"]:not(.is-hidden)\')'),
  "and the demonstration folder does not open in its place",
);

// 10. Then open the folder the way a person does, through its own command. This
//     is the acceptance list run instead of walked: the rows, the count, the
//     two views, the location, and the same rows inside the Import Utility.
await vmw.context.handleAction("open-demo-disks");
const itemCount = () => vmw.run('document.querySelectorAll(\'.window[data-window="projectDisks"] .finder-item\').length');
const windowElement = vmw.windowElement("projectDisks");
test.assert(
  await vmw.waitFor(() => itemCount() === 35 && !windowElement.classList.contains("is-hidden")),
  `the folder lists every published disk once it is open (${itemCount()})`,
);
test.assert(
  vmw.run('document.querySelector(\'.window[data-window="projectDisks"] .details-bar > span:first-child\').textContent') === "35 items",
  "the count reports what the folder holds, the way every Finder page does",
);
test.assert(
  vmw.run('document.querySelector(\'.window[data-window="projectDisks"] .details-bar > span:last-child\').textContent') === "Startup Disk",
  "the folder says where it lives",
);
test.assert(
  vmw.run('document.querySelector(\'.window[data-window="projectDisks"] .finder-item\').dataset.staticFinderAction') === "open-shared-disk-dtk",
  "a row is the disk, and opening it runs that disk's own command",
);
test.assert(
  vmw.run('document.querySelector(\'.window[data-window="projectDisks"] .finder-item .sys-icon\') !== null'),
  "a row carries the Project Hard Disk art, not a generic document",
);
test.assert(
  vmw.run('typeof AISystem6Runtime.getCommand("open-demo-disks") === "object"'),
  "the real handler arrived with the module, which is what keeps the lazy row honest",
);
// Every row is openable, not just the two the marketing names: the route list in
// actions.js and the generated index are two lists of one fact, and a disk that
// was published without its command would be a row that clicks and does nothing.
const unopenableRows = JSON.parse(vmw.run(`
  JSON.stringify(Object.keys(window.AISystem6SharedProjectDisksIndex)
    .filter((route) => !AISystem6Runtime.getCommand(\`open-shared-disk-\${route}\`)))
`));
test.assert(
  unopenableRows.length === 0,
  unopenableRows.length
    ? `published disks with no command: ${unopenableRows.join(", ")}`
    : "every published disk's row dispatches a command that exists",
);

// The folder is a Finder page in the Finder's own lists: it repaints on a view
// change and on a language switch through the same code path as Help Folder.
vmw.run('toggleViewMode("projectDisks", "list")');
test.assert(
  await vmw.waitFor(() => vmw.run('document.querySelectorAll(\'.window[data-window="projectDisks"] .finder-list-row\').length') === 35),
  "list view is the same 35 disks in the shared list rows",
);
vmw.run('toggleViewMode("projectDisks", "icon")');
vmw.run('currentLanguage = "en"');
vmw.context.applyLanguage();
test.assert(
  await vmw.waitFor(() => vmw.run('document.querySelector(\'.window[data-window="projectDisks"] .details-bar > span:first-child\').textContent') === "35 items"),
  "a language switch redraws the folder's count and title with the rest of the desk",
);
test.assert(
  vmw.run('document.querySelector(\'.window[data-window="projectDisks"] h2\').textContent === "Demonstration Project Disks"'),
  "the folder's title follows the language, which is why the markup declares it",
);

// The Import Utility's copy is the same list, painted with the rows the module
// owns: a person already choosing a backup file should see that ready-made
// disks exist, and the button says which kind of visit this is.
const inlineRows = () => vmw.run('document.querySelectorAll(".backup-preview-section .import-row").length');
test.assert(
  await vmw.waitFor(() => inlineRows() === 35),
  "the Import Utility gets the same 35 rows",
);
test.assert(
  vmw.run('document.querySelector(".backup-preview-section").textContent.includes("Each demonstration disk")'),
  "and one line saying what they are, without the folder's chrome",
);
vmw.run('projects.push({ id: "already-here", name: "未来通车之后" }); localStorage.setItem("aiSystem6SharedDisk:dtk", "already-here");');
vmw.run("window.renderDemoDisksPanel()");
test.assert(
  await vmw.waitFor(() => vmw.run('document.querySelector(".backup-preview-section").textContent.includes("Open existing")')),
  "a disk already on this computer offers its own copy instead of a second one",
);
test.assert(
  vmw.run('AISystem6Admissions.repaintHooks().includes("renderDemoDisksPanel")'),
  "the promise lives on the admission row, beside the rest of what the window needs",
);
test.assert(
  typeof vmw.context.renderDemoDisksPanel === "function",
  "and the painter that row names is the one the module installs",
);

test.finish();
// A real boot leaves unrelated background work in flight (the window manager's
// own scheduling among it), and test.finish() does not exit on success — the
// same line window-registry.test.mjs carries for the same reason.
process.exit(0);
