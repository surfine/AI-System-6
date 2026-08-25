import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("theme-lab-authoring");
const source = read("app/features/theme-lab.js");
const iconSource = read("app/core/system-icons.js");
const windowManager = read("app/core/window-manager.js");
const windowRegistrySource = read("app/core/window-registry.js");

const iconWindow = {};
vm.runInNewContext(iconSource, { window: iconWindow });
test.assert(Object.isFrozen(iconWindow.AISystem6SystemIcons) && Object.isFrozen(iconWindow.AISystem6SystemIcons.ids), "the system icon painter exposes a read-only id list");
test.assert(iconWindow.AISystem6SystemIcons.ids.includes("trashFull") && iconWindow.AISystem6SystemIcons.ids.includes("controlStrip"), "the shared icon id list includes late canonical painters");

const document = {
  baseURI: "http://127.0.0.1:4173/",
  styleSheets: [],
  querySelector: () => null,
};
// Theme Lab now builds its own window at module eval, the way the games do:
// its 35,291 bytes of specimen markup left index.html so no boot downloads a
// window most sessions never open. In production config.js loads
// app/core/application-shell.js ahead of the Lab, so the kernel under test only
// evaluates with the shell present. Record the call instead of stubbing it
// blind, so this harness also proves the Lab asks for the right window.
let builtWindow = null;
const window = {
  AISystem6ApplicationShell: {
    createWindow: (options) => { builtWindow = options; return { applicationPane: {} }; },
  },
};
let restoredTheme = null;
const context = {
  URL,
  document,
  navigator: {},
  window,
  applyTheme: (id, options) => { restoredTheme = { id, options }; },
};
vm.runInNewContext(source, context);

test.assert(builtWindow?.windowName === "themeLab", "Theme Lab builds its own window instead of riding in index.html");
test.assert(builtWindow?.labelledBy === "theme-lab-title", "the built window keeps the heading id its aria-labelledby and contracts refer to");
test.assert(String(builtWindow?.paneHtml || "").length > 20000, "the specimen markup travels with the module, not the boot payload");
test.assert(/theme-lab-tab-tokens/.test(String(builtWindow?.paneHtml || "")), "the token tab specimen survived the move");

const internals = window.AISystem6ThemeLabInternals;
test.assert(internals && Object.isFrozen(internals), "Theme Lab exposes a frozen pure authoring kernel");

function style(declarations) {
  const entries = Object.entries(declarations);
  return {
    length: entries.length,
    item: (index) => entries[index]?.[0] || "",
    getPropertyValue: (name) => declarations[name] || "",
  };
}

function rule(selectorText, declarations) {
  return { selectorText, style: style(declarations) };
}

const sheets = [{
  href: "http://127.0.0.1:4173/styles.bundle.css",
  cssRules: [
    rule(":root", {
      "--surface": "white",
      "--shared-only": "classic",
    }),
    rule('html[data-theme="aqua"], body[data-theme="aqua"]', {
      "--surface": "blue",
      "--aqua-only": "aqua",
    }),
    rule('html[data-theme="snow-leopard"], body[data-theme="snow-leopard"]', {
      "--surface": "silver",
    }),
    rule("body.use-liquid-glass", {
      "--disabled-fg": "global-gray",
      "--empty-note-margin": "10px auto",
    }),
    rule("body.use-liquid-glass .menu-popover button", {
      "--disabled-fg": "menu-gray",
    }),
    rule("body.use-liquid-glass .reader-content > .empty-folder-note", {
      "--empty-note-margin": "32px auto 0",
    }),
    rule("body.use-liquid-glass .review-desk-empty-note", {
      "--empty-note-margin": "22px auto",
    }),
    {
      conditionText: "(max-width: 600px)",
      cssRules: [rule("body.use-liquid-glass", { "--surface": "mobile-glass" })],
    },
  ],
}];

const index = internals.buildTokenIndexFromStyleSheets(sheets);
test.assert(index.eras.get("liquid-glass").get("--disabled-fg").value === "global-gray", "a contextual menu token cannot overwrite the editable era root");
test.assert(index.contextual.filter((entry) => entry.name === "--empty-note-margin").length === 2, "same-name contextual recipes remain separate entries");
test.assert(index.conditional.length === 1 && index.conditional[0].conditions[0] === "(max-width: 600px)", "conditional root refinements retain their condition and stay outside the editable root map");
test.assert(index.contextual.every((entry) => entry.selector && entry.file && entry.contextual), "contextual entries retain selector, file, and scope provenance");

const aqua = { id: "aqua" };
const snow = { id: "snow-leopard" };
const snowRows = internals.tokenRowsForIndex(snow, index, [aqua, snow]);
const surface = snowRows.find((row) => row.key === "global:--surface");
const aquaOnly = snowRows.find((row) => row.key === "global:--aqua-only");
test.assert(surface?.baseValue === "blue" && surface.eraValue === "silver" && surface.overridden, "recipeBase is the comparison baseline for a child-era delta");
test.assert(aquaOnly?.eraValue === "aqua" && !aquaOnly.overridden, "a child era reports parent recipe tokens as inherited");

const liquidRows = internals.tokenRowsForIndex({ id: "liquid-glass" }, index, [{ id: "liquid-glass" }]);
const globalDisabled = liquidRows.find((row) => row.key === "global:--disabled-fg");
const menuDisabled = liquidRows.find((row) => row.name === "--disabled-fg" && row.contextual);
test.assert(globalDisabled?.editable === true && globalDisabled.eraValue === "global-gray", "an exact era root remains editable");
test.assert(menuDisabled?.editable === false && menuDisabled.eraValue === "menu-gray", "a contextual token is present but read-only");

test.assert(!source.includes("const ERA_ART") && !source.includes("const ERA_TOKEN_HOME") && !source.includes("const ICON_SET"), "Theme Lab has no private appearance or icon registries");
test.assert(!source.includes("data-theme-lab-new-build") && source.includes("data-theme-lab-app-contract"), "the broken new-appearance form is replaced by the shared app contract specimen");
test.assertIncludes(source, "theme-lab-token-computed", "editable global rows expose the live computed value beside their declaration");

window.AISystem6Theme = {
  DEFAULT_THEME_ID: "classic",
  getCommittedTheme: () => "classic",
  getCurrentTheme: () => "aqua",
};
window.AISystem6ThemeLab.cleanup();
test.assert(restoredTheme?.id === "classic", "Theme Lab cleanup restores the committed Appearance");
test.assert(restoredTheme?.options?.commit === false && restoredTheme?.options?.persist === false && restoredTheme?.options?.saveDesk === false, "cleanup restoration is a non-persisting preview transition");
test.assertIncludes(windowManager, 'if (name === "themeLab") window.AISystem6ThemeLab?.cleanup?.()', "programmatic Theme Lab close restores the committed Appearance before hiding");
test.assertIncludes(windowRegistrySource, 'attach: () => window.AISystem6ThemeLab?.restore?.()', "working-session restore enters through the Theme Lab restore boundary");

test.finish();
