// The demonstration project disks have to be findable by the two people who
// need them: a reader who just met one of the disks, and a person walking the
// Writing route who wants to see what a finished disk looks like. Findable
// means a File-menu command, a window that lists them, the same list inside the
// Import Utility, and a help page that answers "what is this?".
//
// The rule that survives every refactor here is the boot budget: the window and
// the list are lazy, so nothing about them may appear in the modules that are
// measured against the floppy. A static window skeleton in index.html, or the
// panel named in appModulePaths, would quietly spend bytes the budget already
// committed elsewhere.
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";
import { createAppBootVm } from "../helpers/app-boot-vm.mjs";

const test = createFeatureTest("demo-disks-panel");

const menus = read("app/data/menus.js");
const actions = read("app/core/actions.js");
const panel = read("app/content/shared-disks-panel.js");
const generated = read("app/content/shared-project-disks.js");
const help = read("app/data/writing-flow-help.js");
const translationsZh = read("app/data/translations-zh.js");
const translationsEn = read("app/data/translations-en.js");
const importWindow = read("app/features/export-import.js");
const manifest = read("tooling/runtime-manifest.mjs");
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
  read("app/core/window-manager.js"),
  '"open-demo-disks": true',
  "the File row reports its availability instead of staying black by omission",
);

// 2. The command is lazy: one line in the eager registry, the work in the disk
//    module that the launch links already load.
test.assertIncludes(
  actions,
  'registerLazyCommand?.("open-demo-disks",{ensure:ensureSharedProjectDisksModule})',
  "the disks command loads the shared-disk module instead of shipping itself",
);

// 3. The panel registers a real application with the window manager, so the
//    window is openable, restorable and closeable like every other window.
test.assertIncludes(panel, 'id: APP_ID', "the panel registers an application id");
test.assertIncludes(panel, 'windowName: WINDOW_NAME', "the panel names its own window");
test.assertIncludes(panel, '"open-demo-disks": { handler: open }', "the application owns the open command");

// 4. The list is data, not a hand-kept roster: it reads the mounted disk module
//    and never names a disk itself.
test.assertIncludes(panel, "window.AISystem6SharedProjectDisks", "the list reads the published disks");
test.assert(
  !/["'](?:dtk|ipad1)["']/.test(panel),
  "the panel names no disk: a third disk needs one build-table entry, not an edit here",
);
test.assertMatches(
  panel,
  /rightTime - leftTime[\s\S]{0,120}left\.index - right\.index/,
  "newest first, and registration order when two disks share an export time",
);

// 5. The three states the person actually meets: loading, list, and a failure
//    they can retry without leaving the window.
test.assertIncludes(panel, '"demo_disks_loading"', "the window says it is reading before the list arrives");
test.assertIncludes(panel, '"demo_disks_failed"', "the window says so when the list cannot be read");
test.assertIncludes(panel, '"demo_disks_retry"', "the failure state offers a retry");
test.assertIncludes(panel, '"demo_disk_open_existing"', "an already-mounted disk offers its own copy");

// 6. Same module, two doors: the Import Utility shows the rows without the
//    window's introduction, and the window is built at runtime.
test.assertIncludes(panel, "inlineSectionSelector", "the panel also renders into the Import Utility");
// The row is .import-row's own shape: icon | flexible label | trailing control.
// .backup-preview-row re-cuts those columns for a preview with no button, so a
// fourth child would drop into a 22px second row and squeeze the button.
test.assertIncludes(panel, 'row.className = "import-row"', "the row reuses the Import Utility's row grid");
test.assert(
  panel.includes("row.append(icon, label)") && panel.includes("row.append(open)"),
  "the row is icon, label and one control, which is what the three columns hold",
);
test.assertIncludes(
  importWindow,
  "ensureSharedProjectDisksModule?.();",
  "opening the backup panel loads the disk list",
);
test.assert(
  !read("index.html").includes('data-window="projectDisks"'),
  "the window frame is created at runtime, not paid for in index.html",
);
test.assert(
  !manifest.includes('"app/content/shared-disks-panel.js"'),
  "the panel source stays out of the boot bundle and rides the generated disk module",
);
test.assertIncludes(generated, "window.AISystem6DemoDisksPanel", "the generator appends the panel to the disk module");

// 7. The help page answers what the disks are, and the Read Me points at them.
test.assertIncludes(help, "# 演示用项目硬盘", "帮助文档有中文说明");
test.assertIncludes(help, "system6.aaronlau.me/go/<route>", "帮助文档给出可转发的地址形式");
test.assertIncludes(help, "/go/dtk", "中文说明列出未来通车之后");
test.assertIncludes(help, "/go/ipad1", "中文说明列出初代 iPad");
test.assertIncludes(read("app/features/translation.js"), 'shared: "shared_readme"', "说明文档标题走既有的说明文件命名");

// 8. The public README names the disks and tells a developer what adding a
//    third one costs.
test.assertIncludes(readme, "https://system6.aaronlau.me/go/ipad1", "README 列出两块盘");
test.assertIncludes(readmeZh, "https://system6.aaronlau.me/go/dtk", "中文 README 列出两块盘");
test.assertIncludes(readme, "tooling/build-shared-project-disks.mjs", "README 告诉开发者登记处");
test.assertIncludes(readmeZh, "tests/features/launch-intent.test.mjs", "中文 README 指出守着源盘与发布副本的契约");

// 9. Then boot the desk. The rows above are the shape; this is the wiring. The
//    failure this catches is the one the id nearly caused: registerLazyCommand()
//    throws on a duplicate id, and the throw happens at the top of the eager
//    bundle, so a colliding command takes the rest of the boot down with it
//    rather than greying one menu row.
const vmw = createAppBootVm();
const lazyCommand = vmw.run('AISystem6Runtime.getLazyCommand("open-demo-disks")');
test.assert(
  !!lazyCommand && typeof lazyCommand.ensure === "function",
  "the boot registers the demonstration list as a lazy command, and does not throw doing it",
);
test.assert(
  vmw.run('AISystem6Runtime.getCommand("open-demo-disks") === null'),
  "the handler itself arrives with the panel module, not with the boot bundle",
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
  "and the demonstration list does not open in its place",
);

// 10. Then run the panel itself in the same desk, with the published disks
//     stubbed: this is the acceptance list a person walks by hand — the rows,
//     the mounted switch, the failure state and its retry — executed instead.
const paneText = () => vmw.run(
  'document.querySelector(\'.window[data-window="projectDisks"] .window-pane\').textContent',
);
const windowRows = () => vmw.run(
  'document.querySelectorAll(\'.window[data-window="projectDisks"] .import-row\').length',
);
vmw.run("window.AISystem6SharedProjectDisksLoaded = true");
vmw.run(`window.AISystem6SharedProjectDisks = {
  dtk: { exportedAt: "2026-09-21T12:00:00.000Z", project: { name: "未来通车之后", questionSheet: "## 主题\\n\\n- 2020 年 DTK 的遗迹报告" }, files: [], scraps: [] },
  ipad1: { exportedAt: "2026-09-21T12:00:00.000Z", project: { name: "初代 iPad", questionSheet: "## 主题\\n\\n- 256MB 的由来" }, files: [], scraps: [] }
};`);
vmw.run(read("app/content/shared-disks-panel.js"));
vmw.run("window.AISystem6DemoDisksPanel.open()");
test.assert(
  await vmw.waitFor(() => windowRows() === 2),
  "the window lists both published disks once the module is in",
);
test.assert(
  paneText().includes("未来通车之后") && paneText().includes("2020 年 DTK 的遗迹报告"),
  "a row carries the project's own name and the subject line from its question sheet",
);
test.assert(
  vmw.run('document.querySelectorAll(".backup-preview-section .import-row").length') === 2
    && !vmw.run('document.querySelector(".backup-preview-section").textContent.includes("演示盘")'),
  "the Import Utility gets the same two rows without the window's introduction",
);
vmw.run('projects.push({ id: "already-here", name: "未来通车之后" }); localStorage.setItem("aiSystem6SharedDisk:dtk", "already-here");');
vmw.run("window.AISystem6DemoDisksPanel.renderWindow()");
test.assert(
  await vmw.waitFor(() => paneText().includes("Open existing")),
  "a disk already on this computer offers its own copy instead of a second one",
);
vmw.run("delete window.AISystem6SharedProjectDisks; window.AISystem6DemoDisksPanel.renderWindow();");
test.assert(
  await vmw.waitFor(() => paneText().includes("cannot be read right now")),
  "a list that cannot be read says so in the window",
);
vmw.run(`window.AISystem6SharedProjectDisks = { dtk: { exportedAt: "2026-09-21T12:00:00.000Z", project: { name: "未来通车之后", questionSheet: "## 主题\\n\\n- 2020 年 DTK 的遗迹报告" }, files: [], scraps: [] } };`);
// The VM's element has no click(), so the row's own listener is what runs.
vmw.run(`(() => {
  const buttons = document.querySelectorAll('.window[data-window="projectDisks"] .btn');
  buttons[buttons.length - 1].dispatchEvent(new Event("click"));
})()`);
test.assert(
  await vmw.waitFor(() => windowRows() === 1),
  "Try again reads the disks a second time and recovers the list",
);

test.finish();
