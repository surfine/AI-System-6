// The Writing Flow palette is one shared object in all twelve appearances, and
// under NeXTSTEP it is a 3.3 floating panel hung 15px under the main menu, the
// way Draw.app's Tools palette hangs (Window Order tier 6). This contract pins
// the user-visible consequences of the port: the panel really becomes a
// floating panel only in NeXTSTEP, it is present for the writing family and
// away for every other menu owner, the way back is Tools ▸ Writing Flow...
// (never the Apple-menu row), and the two verbs stay two -- shade keeps the
// title bar, close puts the panel away.
//
// The failures a writer would meet: a panel that floats in Classic, a panel
// that vanishes under a title-bar double-click (shade read as close), a
// NeXTSTEP palette with no way back, and a second close button invented beside
// the shared one.
//
// The boot VM boots the eager module set; the NeXTSTEP shell and menus are lazy
// modules, and two browser primitives they reach for are not in the shim's DOM.
// Declared here, next to the contract that boots them.

import { createAppBootVm } from "../helpers/app-boot-vm.mjs";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("nextstep-writing-flow-panel");
const vmw = createAppBootVm();

vmw.run(`
  if (typeof document.createComment !== "function") {
    document.createComment = (text) => Object.assign(document.createElement("#comment"), { textContent: text });
  }
  if (typeof queueMicrotask !== "function") queueMicrotask = (fn) => Promise.resolve().then(fn);
`);

const innerWidth = vmw.run("innerWidth");
const layoutUsable = innerWidth > 860;

const panel = () => vmw.run('document.querySelector(".writing-spine-panel")');
const panelState = () => vmw.run('document.querySelector(".writing-spine-panel")?.dataset.nextstepPanel ?? null');
const panelHas = (cls) => vmw.run(`document.querySelector(".writing-spine-panel").classList.contains(${JSON.stringify(cls)})`);
const closeBoxHidden = () => vmw.run('document.querySelector(".writing-spine-panel .spine-close-box").hidden');

// 1. The two-state rule and the shared close box: NeXTSTEP does not invent a
//    close control of its own, and the shared palette's close box is what puts
//    the panel away.
test.assert(
  vmw.run('document.querySelectorAll(".writing-spine-panel .nextstep-panel-close").length === 0'),
  "NeXTSTEP draws no close button of its own onto the shared palette",
);
test.assert(
  vmw.run('document.querySelector(".writing-spine-panel .spine-close-box") !== null'),
  "the shared close box in the title row is the only close control",
);

// 2. Source-level: the ported stylesheet is one era and one geometry. The
//    phone-line media query and the second close button were prototype-only.
const shellCss = read("styles/nextstep-shell.css");
const materialCss = read("styles/69-nextstep-appearance.css");
for (const [name, source] of [["nextstep-shell.css", shellCss], ["69-nextstep-appearance.css", materialCss]]) {
  test.assert(!source.includes("@media (pointer: fine) and (min-width: 640px)"),
    `${name} carries no fine-pointer 640px shell inset: the 800x600 path is out of scope`);
  test.assert(!source.includes(".nextstep-panel-close"),
    `${name} names no invented .nextstep-panel-close; the shared close box is used`);
}
test.assert(!read("app/core/nextstep-shell.js").includes("MutationObserver"),
  "nextstep-shell.js uses no MutationObserver: placement rides the real sync paths");

// 3. Under NeXTSTEP the panel gets the floating attribute; every other
//    appearance leaves the shared palette exactly as it was.
await vmw.context.AISystem6Theme.applyTheme("nextstep", { persist: false });
await vmw.waitFor(() => vmw.run("!!window.AISystem6NextstepShellLoaded && !!window.AISystem6NextstepMenus && !!window.AISystem6NextstepWritingFlow"));
vmw.run("menuOwnerAppId = 'writingStudio'; activeAppId = 'writingStudio';");
vmw.run("window.AISystem6NextstepWritingFlow.sync()");

test.assert(
  vmw.run('document.querySelector(".writing-spine-panel").hasAttribute("data-nextstep-panel")'),
  "the Writing Flow becomes a floating panel under NeXTSTEP",
);
if (layoutUsable) {
  test.assert(
    vmw.run('document.querySelector(".writing-spine-panel").style.getPropertyValue("--nextstep-flow-y") !== ""'),
    "the floating panel is placed with the shared --nextstep-flow-x/-y geometry",
  );
} else {
  console.log("SKIP nextstep-writing-flow-panel: innerWidth <= 860, layout-dependent geometry not asserted");
}
test.assert(closeBoxHidden() === false, "the floating panel shows its shared close box");

// 4. The writing family keeps it up; any other owner puts it away. This is
//    NeXT's Info-panel exception, read through the menus module's one FAMILY.
test.assert(panelState() === "open", "with the menu owner in the writing family the panel is open");
vmw.run("menuOwnerAppId = 'clioTalk'; activeAppId = 'clioTalk';");
vmw.run("window.AISystem6NextstepWritingFlow.sync()");
test.assert(panelState() === "open", "ClioTalk, another writing tool, keeps the panel up too");
vmw.run("menuOwnerAppId = 'finder'; activeAppId = 'finder';");
vmw.run("window.AISystem6NextstepWritingFlow.sync()");
test.assert(panelState() === "away", "with Finder at the main menu the panel is away, not floating over it");
// Away must really hide it. The floating rule sets visibility:visible at
// (0,4,1); an away rule of lower specificity left a ghost panel painted over
// Finder but unclickable. The away rule must carry the same :not(.is-closed).
test.assertMatches(
  read("styles/nextstep-shell.css"),
  /\.writing-spine-panel\[data-nextstep-panel="away"\]:not\(\.is-closed\)\s*\{[^}]*visibility:\s*hidden/,
  "the away rule outranks the floating rule's visibility:visible, so an away panel is not a ghost",
);

// 5. The way back is Tools ▸ Writing Flow... -- present for the writing family,
//    absent for every other owner. Inspected through the rendered root palette.
const rootMenuLabels = async () => {
  await vmw.context.AISystem6NextstepMenus.sync();
  await vmw.waitFor(() => vmw.run('document.querySelectorAll(".nextstep-menu-palette").length > 0'));
  return vmw.run(`(() => {
    const roots = [...document.querySelectorAll(".nextstep-menu-palette")]
      .filter((node) => !node.hidden && !node.dataset.detached);
    const root = roots[0];
    if (!root) return [];
    return [...root.querySelectorAll(":scope > [role=\\"menu\\"] > [role=\\"menuitem\\"]")].map((button) => button.textContent);
  })()`);
};
vmw.run("menuOwnerAppId = 'writingStudio'; activeAppId = 'writingStudio';");
const writingLabels = await rootMenuLabels();
test.assert(
  writingLabels.includes(vmw.run('t("nextstep_tools")')),
  "Writing Studio's main menu carries a Tools submenu for the Writing Flow",
);
vmw.run("menuOwnerAppId = 'finder'; activeAppId = 'finder';");
const finderLabels = await rootMenuLabels();
test.assert(
  !finderLabels.includes(vmw.run('t("nextstep_tools")')),
  "Finder's main menu carries no Tools row, because Finder is not a writing tool",
);
test.assert(
  !vmw.run('[...document.querySelectorAll(".nextstep-menu-palette [role=\\"menuitem\\"]")].some((button) => button.textContent === t("nextstep_writing_flow_command") && !button.closest(".nextstep-menu-palette")?.contains(button))'),
  "the Writing Flow command is a submenu row, reached through Tools, not a flat row",
);

// 6. The Workspace submenu never repeats the Apple-menu's Show Writing Flow:
//    NeXTSTEP's own way back is Tools.
vmw.run("menuOwnerAppId = 'writingStudio'; activeAppId = 'writingStudio';");
await vmw.context.AISystem6NextstepMenus.sync();
vmw.run(`(() => {
  const root = [...document.querySelectorAll(".nextstep-menu-palette")].find((node) => !node.dataset.detached);
  const workspace = [...(root?.querySelectorAll(":scope > [role=\\"menu\\"] > [role=\\"menuitem\\"]") || [])]
    .find((button) => button.getAttribute("aria-haspopup") === "menu" && button.textContent === t("nextstep_workspace"));
  workspace?.dispatchEvent(new Event("click"));
})()`);
test.assert(
  vmw.run(`(() => {
    const rows = [...document.querySelectorAll(".nextstep-menu-palette [role=\\"menuitem\\"]")];
    return rows.some((button) => button.textContent === t("nextstep_workspace")) && !rows.some((button) => button.textContent === t("show_writing_flow"));
  })()`),
  "the Workspace submenu drops the Apple-menu's show-writing-flow row",
);

// 7. Tools ▸ Writing Flow... reopens a closed panel (is-closed removed) and
//    does not shade it: close and shade stay two verbs.
vmw.run("window.AISystem6NextstepWritingFlow.sync()");
vmw.run('document.querySelector(".writing-spine-panel").classList.add("is-closed")');
test.assert(
  vmw.run('AISystem6Runtime.hasCommand("nextstep-writing-flow")'),
  "the Writing Flow command really registers with the runtime",
);
vmw.run('AISystem6Runtime.getCommand("nextstep-writing-flow").handler()');
test.assert(!panelHas("is-closed"), "the Writing Flow command brings a closed panel back");
test.assert(!panelHas("is-shaded"), "reopening is not shading: the two verbs stay two");

// 8. Shading keeps the title bar on the desk: it never becomes closed.
vmw.run('document.querySelector(".writing-spine-panel").classList.add("is-shaded")');
test.assert(panelHas("is-shaded") && !panelHas("is-closed"), "a shaded panel keeps its title bar and is not closed");
vmw.run('document.querySelector(".writing-spine-panel").classList.remove("is-shaded")');

// 9. Leaving NeXTSTEP takes the floating presentation away with it: the shared
//    palette loses the attribute and its close box is hidden again.
await vmw.context.AISystem6Theme.applyTheme("classic", { announce: false, persist: false });
vmw.run("window.AISystem6NextstepWritingFlow.sync()");
test.assert(
  vmw.run('!document.querySelector(".writing-spine-panel").hasAttribute("data-nextstep-panel")'),
  "Classic leaves the Writing Flow as the shared palette, not a floating panel",
);
test.assert(closeBoxHidden() === true, "and the shared close box is hidden again");
test.assert(
  vmw.run('document.querySelector(".writing-spine-panel").style.getPropertyValue("--nextstep-flow-y") === ""'),
  "the floating panel's geometry is removed with the attribute",
);

test.finish();
