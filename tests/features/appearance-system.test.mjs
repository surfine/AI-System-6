import vm from "node:vm";
import { createFeatureTest, exists, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("appearance-system");
const registrySource = read("app/core/theme-registry.js");
const index = read("index.html");
const app = read("app.js");
const actions = read("app/core/actions.js");
const menus = read("app/data/menus.js");
const persistence = read("app/core/persistence-status.js");
const manifest = read("scripts/style-manifest.mjs");
const verification = read("scripts/verify-css.mjs");
const appearanceCss = read("styles/65-appearance-themes.css");
const labCss = read("styles/66-theme-lab.css");
const packageJson = read("package.json");

const THEME_IDS = ["classic", "platinum", "liquid-glass"];
const SYSTEM_FONTS = ["Chicago", "Charcoal", "SF Pro"];

function fakeElement() {
  const classes = new Set();
  return {
    dataset: {},
    classList: {
      contains: (name) => classes.has(name),
      toggle(name, force) {
        if (force) classes.add(name);
        else classes.delete(name);
        return classes.has(name);
      },
    },
  };
}

function loadRegistry(initialEntries = []) {
  const values = new Map(initialEntries);
  const localStorage = {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
  const documentElement = fakeElement();
  const body = fakeElement();
  const events = [];
  const document = {
    documentElement,
    body,
    dispatchEvent: (event) => events.push(event),
  };
  class CustomEvent {
    constructor(type, options = {}) {
      this.type = type;
      this.detail = options.detail;
    }
  }
  const window = { localStorage, document };
  vm.runInNewContext(registrySource, { window, CustomEvent });
  return { api: window.AISystem6Theme, body, documentElement, events, values };
}

const fresh = loadRegistry();
test.assert(fresh.api.themes.map(({ id }) => id).join(",") === THEME_IDS.join(","), "the registry exposes only release-ready appearances");
test.assert(Object.isFrozen(fresh.api.themes) && fresh.api.themes.every(Object.isFrozen), "theme metadata is immutable");
test.assert(fresh.api.themes.map(({ systemFont }) => systemFont).join(",") === SYSTEM_FONTS.join(","), "each era records its researched default system font");
test.assert(fresh.api.themes.map(({ systemFontSize }) => systemFontSize).join(",") === "12,12,13", "each appearance records its nominal system UI size");
test.assert(fresh.api.getTheme("platinum").fontStrategy === "theme", "Platinum owns Charcoal instead of inheriting the modern-font preference");
test.assert(fresh.api.getCurrentTheme() === "classic", "fresh installs default to System 6");
test.assert(fresh.values.get("ai-system-6-theme") === "classic", "the canonical theme key is initialized immediately");
test.assert(fresh.documentElement.dataset.theme === "classic" && fresh.body.dataset.theme === "classic", "the registry projects data-theme onto html and body");
test.assert(fresh.documentElement.dataset.themeFamily === "classic", "the registry projects a family for shared recipes");

fresh.api.applyTheme("platinum");
test.assert(fresh.api.getCurrentTheme() === "platinum" && fresh.values.get("ai-system-6-theme") === "platinum", "applyTheme changes and persists the canonical theme");
test.assert(fresh.documentElement.dataset.theme === "platinum" && fresh.body.dataset.theme === "platinum", "applyTheme updates both pre-paint and body selectors");
test.assert(fresh.events.at(-1)?.type === "ai-system6-themechange" && fresh.events.at(-1)?.detail.themeId === "platinum", "theme changes emit one namespaced event");
test.assert(!fresh.body.classList.contains("use-liquid-glass"), "historical themes do not impersonate Liquid Glass");

fresh.api.applyTheme("liquid-glass", { announce: false });
test.assert(fresh.body.classList.contains("use-liquid-glass"), "Liquid Glass keeps its compatibility projection while selectors migrate to tokens");
test.assert(!fresh.documentElement.classList.contains("use-liquid-glass"), "the compatibility class is body-scoped");
test.assert(fresh.api.hasCapability("continuous-glass"), "behavioral differences come from registry capability metadata");

fresh.api.applyTheme("not-a-theme", { announce: false });
test.assert(fresh.api.getCurrentTheme() === "classic", "unknown themes fail safely to System 6");

const migratedOn = loadRegistry([["ai-system-6-liquid-glass", "true"]]);
test.assert(migratedOn.api.getCurrentTheme() === "liquid-glass", "the old enabled Boolean migrates to Liquid Glass");
test.assert(!migratedOn.values.has("ai-system-6-liquid-glass") && migratedOn.values.get("ai-system-6-theme") === "liquid-glass", "migration removes the legacy key after writing the new enum");
const migratedOff = loadRegistry([["ai-system-6-liquid-glass", "false"]]);
test.assert(migratedOff.api.getCurrentTheme() === "classic", "the old disabled Boolean migrates to System 6");
const canonicalWins = loadRegistry([["ai-system-6-theme", "platinum"], ["ai-system-6-liquid-glass", "true"]]);
test.assert(canonicalWins.api.getCurrentTheme() === "platinum", "a valid canonical setting wins over stale legacy state");

test.assert(index.indexOf('src="app/core/theme-registry.js"') < index.indexOf('rel="stylesheet"'), "the saved era is resolved before the stylesheet loads");
test.assertIncludes(index, 'src="app/core/theme-body-init.js"', "body receives the pre-resolved theme through a CSP-safe external script before desktop markup");
test.assertIncludes(read("app/core/theme-body-init.js"), "window.AISystem6Theme?.syncBody()", "the body initializer delegates to the registry instead of owning theme state");
test.assertIncludes(index, 'id="appearance-theme"', "Control Panel exposes one Appearance selector");
for (const id of THEME_IDS) {
  test.assertIncludes(index, `option value="${id}"`, `Control Panel exposes ${id}`);
  test.assertIncludes(menus, `themeId: "${id}"`, `Special menu exposes ${id} from registry-compatible ids`);
}
test.assertIncludes(menus, 'submenu("appearance", appearanceItems)', "Special owns a single Appearance submenu");
test.assertIncludes(actions, '"open-theme-lab": () => openWindow("themeLab")', "Theme Lab has an explicit development entry");
test.assertIncludes(index, 'data-window="themeLab"', "Theme Lab is a real managed window");
test.assertIncludes(index, "theme-lab-focus-demo", "Theme Lab includes an explicit focus state");
test.assertIncludes(index, "theme-lab-mini-window is-inactive", "Theme Lab includes inactive window chrome");
test.assertIncludes(index, "theme-lab-sheet", "Theme Lab includes sheet and layered-surface specimens");

test.assertIncludes(app, "function applyTheme(themeId", "the application has one theme application boundary");
test.assertIncludes(app, "window.AISystem6Theme?.applyTheme", "the application delegates state to the registry");
test.assertNotIncludes(app, "function toggleLiquidGlassAppearance", "the old binary runtime switch is removed");
test.assertIncludes(persistence, "theme: getCurrentTheme()", "desk settings persist the enum");
test.assertIncludes(persistence, "typeof settings.liquidGlass === \"boolean\"", "desk-state restore retains one release-safe Boolean migration");

for (const path of ["styles/65-appearance-themes.css", "styles/66-theme-lab.css"]) {
  test.assertIncludes(manifest, `"${path}"`, `${path} participates in the production bundle`);
}
for (const id of THEME_IDS.slice(1, -1)) {
  test.assertIncludes(appearanceCss, `data-theme="${id}"`, `${id} has an owned parameter table`);
}
test.assertNotMatches(appearanceCss, /\.(?:assistant|docmap|reader|quick-draft|teachtext|scrapbook)-/, "era CSS does not fork application layouts");
test.assertNotIncludes(labCss, "data-theme=", "Theme Lab has one shared component stylesheet, not six implementations");
test.assertIncludes(verification, "appearanceThemeSelectorLimit", "CSS verification ratchets per-era structural recipes");
test.assertIncludes(packageJson, '"verify:theme-lab"', "the release-ready appearance comparison has a named verification command");
test.assertIncludes(packageJson, '"snapshot:theme-lab"', "the release-ready baselines have an explicit update command");

for (const id of THEME_IDS) {
  test.assert(exists(`tests/visual/theme-lab/${id}.png`), `${id} has a committed Theme Lab baseline`);
}

test.finish();
