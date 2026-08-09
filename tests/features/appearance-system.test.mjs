import vm from "node:vm";
import { createFeatureTest, exists, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("appearance-system");
const registrySource = read("app/core/theme-registry.js");
const index = read("index.html");
const app = read("app.js");
const actions = read("app/core/actions.js");
const menus = read("app/data/menus.js");
const windowManager = read("app/core/window-manager.js");
const persistence = read("app/core/persistence-status.js");
const manifest = read("scripts/style-manifest.mjs");
const verification = read("scripts/verify-css.mjs");
const labSnapshot = read("scripts/theme-lab-snapshot.mjs");
const labFidelity = read("scripts/theme-lab-fidelity.mjs");
const platinumFidelity = read("tests/visual/theme-lab-fidelity/platinum.json");
const aquaFidelity = read("tests/visual/theme-lab-fidelity/aqua.json");
const foundationCss = read("styles/00-foundation.css");
const appearanceCss = read("styles/65-appearance-themes.css");
const aquaAppearanceCss = read("styles/67-aqua-appearance.css");
const labCss = read("styles/66-theme-lab.css");
const liquidCss = read("styles/70-liquid-glass.css");
const packageJson = read("package.json");

const THEME_IDS = ["classic", "platinum", "aqua", "snow-leopard", "yosemite", "liquid-glass"];
const RELEASE_READY_THEME_IDS = [...THEME_IDS];
// Every era is a supported release appearance: the selector and the Special
// menu expose all six, and no research switch gates any of them.
const SELECTABLE_THEME_IDS = [...THEME_IDS];
const RESEARCH_THEME_IDS = [];
const SYSTEM_FONTS = ["Chicago", "Charcoal", "Lucida Grande", "Lucida Grande", "Helvetica Neue", "SF Pro"];
// Three recipe families: Classic -> Platinum, Aqua -> Snow Leopard, and
// Liquid Glass -> Yosemite. Aqua and Liquid Glass are their own roots;
// Liquid Glass was only the engineering donor for the Aqua branch.
const THEME_FAMILIES = ["classic", "classic", "aqua", "aqua", "liquid-glass", "liquid-glass"];
const RECIPE_BASES = [null, "classic", null, "aqua", "liquid-glass", null];

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
test.assert(fresh.api.themes.map(({ id }) => id).join(",") === THEME_IDS.join(","), "the registry owns the six eras in canonical timeline order");
test.assert(Object.isFrozen(fresh.api.themes) && fresh.api.themes.every(Object.isFrozen), "theme metadata is immutable");
test.assert(fresh.api.themes.map(({ systemFont }) => systemFont).join(",") === SYSTEM_FONTS.join(","), "each era records its researched default system font");
test.assert(fresh.api.themes.map(({ systemFontSize }) => systemFontSize).join(",") === "12,12,13,13,13,13", "each era records its nominal system UI size");
test.assert(fresh.api.themes.map(({ family }) => family).join(",") === THEME_FAMILIES.join(","), "the registry owns the three requested recipe families");
test.assert(fresh.api.themes.map(({ recipeBase }) => recipeBase).join(",") === RECIPE_BASES.join(","), "the registry owns the requested parent recipe for each era");
test.assert(fresh.api.getRecipeChain("platinum").map(({ id }) => id).join(",") === "classic,platinum", "Platinum derives from Classic");
test.assert(fresh.api.getRecipeChain("snow-leopard").map(({ id }) => id).join(",") === "aqua,snow-leopard", "Snow Leopard derives from Aqua, not from Liquid Glass");
test.assert(fresh.api.getRecipeChain("yosemite").map(({ id }) => id).join(",") === "liquid-glass,yosemite", "Yosemite derives from Liquid Glass");
test.assert(fresh.api.getRecipeChain("aqua").map(({ id }) => id).join(",") === "aqua", "Aqua is its own recipe root; Liquid Glass was only the engineering donor");
test.assert(fresh.api.getTheme("platinum").fontStrategy === "theme", "Platinum owns Charcoal instead of inheriting the modern-font preference");
test.assert(fresh.api.getCurrentTheme() === "classic", "fresh installs default to System 6");
test.assert(fresh.values.get("ai-system-6-theme") === "classic", "the canonical theme key is initialized immediately");
test.assert(fresh.documentElement.dataset.theme === "classic" && fresh.body.dataset.theme === "classic", "the registry projects data-theme onto html and body");
test.assert(fresh.documentElement.dataset.themeFamily === "classic", "the registry projects a family for shared recipes");

fresh.api.applyTheme("platinum");
test.assert(fresh.api.getCurrentTheme() === "platinum" && fresh.values.get("ai-system-6-theme") === "platinum", "applyTheme changes and persists the canonical theme");
test.assert(fresh.documentElement.dataset.theme === "platinum" && fresh.body.dataset.theme === "platinum", "applyTheme updates both pre-paint and body selectors");
test.assert(fresh.documentElement.dataset.themeFamily === "classic" && fresh.documentElement.dataset.themeBase === "classic", "a derived recipe projects its family and parent");
test.assert(fresh.events.at(-1)?.type === "ai-system6-themechange" && fresh.events.at(-1)?.detail.themeId === "platinum", "theme changes emit one namespaced event");

// Every era is a release appearance: Aqua, Snow Leopard, and Yosemite apply
// and persist through the normal release path like Classic, Platinum, and
// Liquid Glass. No research switch gates any theme.
fresh.api.applyTheme("aqua", { announce: false });
test.assert(fresh.api.getCurrentTheme() === "aqua" && fresh.values.get("ai-system-6-theme") === "aqua", "Aqua applies and persists through the release path");
test.assert(fresh.api.normalizeReleaseThemeId("aqua") === "aqua", "aqua stays itself through the release normalizer");
test.assert(fresh.api.normalizeReleaseThemeId("snow-leopard") === "snow-leopard", "snow-leopard stays itself through the release normalizer");
test.assert(fresh.api.normalizeReleaseThemeId("yosemite") === "yosemite", "yosemite stays itself through the release normalizer");

fresh.api.applyTheme("snow-leopard", { announce: false });
test.assert(fresh.api.getCurrentTheme() === "snow-leopard" && fresh.values.get("ai-system-6-theme") === "snow-leopard", "Snow Leopard applies and persists through the release path");
fresh.api.applyTheme("yosemite", { announce: false });
test.assert(fresh.api.getCurrentTheme() === "yosemite" && fresh.values.get("ai-system-6-theme") === "yosemite", "Yosemite applies and persists through the release path");
test.assert(fresh.body.classList.contains("use-liquid-glass"), "Yosemite shares the Liquid Glass family base");
test.assert(fresh.body.dataset.themeFamily === "liquid-glass", "Yosemite projects the Liquid Glass lineage");
fresh.api.applyTheme("classic", { announce: false });

fresh.api.previewExperimentalTheme("aqua");
test.assert(fresh.api.getCurrentTheme() === "aqua" && fresh.values.get("ai-system-6-theme") === "classic", "experimental preview applies without persisting");
test.assert(fresh.documentElement.dataset.theme === "aqua" && fresh.body.dataset.theme === "aqua", "experimental preview projects the research theme for this session");
test.assert(fresh.events.at(-1)?.detail.themeId === "aqua", "experimental preview emits the same namespaced event");
test.assert(!fresh.body.classList.contains("use-liquid-glass"), "Aqua owns its rules directly and never wears the Liquid Glass skin class");

fresh.api.previewExperimentalTheme("snow-leopard");
test.assert(fresh.documentElement.dataset.themeFamily === "aqua" && fresh.documentElement.dataset.themeBase === "aqua", "Snow Leopard projects the Aqua lineage for shared recipes and diagnostics");

fresh.api.previewExperimentalTheme("yosemite");
test.assert(fresh.api.getCurrentTheme() === "yosemite" && fresh.values.get("ai-system-6-theme") === "classic", "experimental preview stays session-only even for a release theme");

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
const canonicalWins = loadRegistry([["ai-system-6-theme", "yosemite"], ["ai-system-6-liquid-glass", "true"]]);
test.assert(canonicalWins.api.getCurrentTheme() === "yosemite", "a saved Yosemite id wins over stale legacy Liquid Glass state");
for (const [saved, expected] of [["aqua", "aqua"], ["snow-leopard", "snow-leopard"], ["yosemite", "yosemite"]]) {
  const migrated = loadRegistry([["ai-system-6-theme", saved]]);
  test.assert(migrated.api.getCurrentTheme() === expected, `saved ${saved} safely migrates to ${expected}`);
  test.assert(migrated.values.get("ai-system-6-theme") === expected, `the ${saved} migration is persisted as ${expected}`);
}
test.assert(
  fresh.api.getReleaseReadyThemes().map(({ id }) => id).join(",") === "classic,platinum,aqua,snow-leopard,yosemite,liquid-glass",
  "getReleaseReadyThemes returns all six release-supported appearances",
);

test.assert(index.indexOf('src="app/core/theme-registry.js"') < index.indexOf('rel="stylesheet"'), "the saved era is resolved before the stylesheet loads");
test.assertIncludes(index, 'src="app/core/theme-body-init.js"', "body receives the pre-resolved theme through a CSP-safe external script before desktop markup");
test.assertIncludes(read("app/core/theme-body-init.js"), "window.AISystem6Theme?.syncBody()", "the body initializer delegates to the registry instead of owning theme state");
test.assertIncludes(index, 'id="appearance-theme"', "Control Panel exposes one Appearance selector");
test.assertNotIncludes(index, 'id="research-appearances"', "Control Panel no longer exposes a research-appearances switch");
for (const id of SELECTABLE_THEME_IDS) {
  test.assertIncludes(index, `option value="${id}"`, `Control Panel exposes ${id}`);
  test.assertIncludes(menus, `themeId: "${id}"`, `Special menu exposes ${id} from registry-compatible ids`);
}
test.assertIncludes(menus, 'submenu("appearance", appearanceItems)', "Special owns a single Appearance submenu");
test.assertIncludes(menus, "open-theme-lab", "the Special menu carries the Theme Lab entry");
test.assertIncludes(windowManager, '"open-theme-lab": true', "Theme Lab is available without a research switch");
test.assertIncludes(actions, '"open-theme-lab": () => openWindow("themeLab")', "Theme Lab has an explicit development entry");
test.assertIncludes(index, 'data-window="themeLab"', "Theme Lab is a real managed window");
test.assertIncludes(index, "theme-lab-icon-set", "Theme Lab hosts the icon set overview");
test.assertNotIncludes(index, 'theme-lab-icon-set theme-lab-platinum-fixture', "the icon set overview is available to every theme, not Platinum only");
test.assertIncludes(index, 'data-system-icon="writingBell"', "the icon set overview covers the last painter in the family");
test.assertIncludes(index, 'data-system-icon="trashFull"', "the icon set overview includes the full-trash state");
test.assertIncludes(index, "theme-lab-focus-demo", "Theme Lab includes an explicit focus state");
test.assertIncludes(index, "theme-lab-focus-control", "Theme Lab exposes button focus without relying on screenshot-time keyboard state");
test.assertIncludes(index, "theme-lab-size-row", "Theme Lab compares regular, small, and mini control variants on the shared DOM");
test.assertIncludes(index, "data-theme-lab-font", "Theme Lab names the active era's system font as visible evidence");
test.assertIncludes(index, "theme_lab_unchecked", "Theme Lab compares checked and unchecked choice states");
test.assertIncludes(index, "theme_lab_disabled_popup", "Theme Lab compares enabled and disabled pop-up states");
test.assertIncludes(index, "role=\"menuitem\" disabled", "Theme Lab includes a disabled menu command in the same menu specimen");
test.assertIncludes(index, "theme-lab-mini-window is-inactive", "Theme Lab includes inactive window chrome");
test.assertIncludes(index, "theme-lab-sheet", "Theme Lab includes sheet and layered-surface specimens");
test.assertIncludes(index, "theme-lab-toolbar-status", "Theme Lab can map the shared toolbar slot to an era-accurate Finder information bar");
test.assertIncludes(index, "theme-lab-list-scrollbar", "Theme Lab tests a scrollbar as part of a complete list control");
test.assertIncludes(index, "theme-lab-alert-icon", "Theme Lab includes the icon-bearing standard alert structure");
test.assertIncludes(index, "theme-lab-balloon-label", "Theme Lab can name Balloon Help instead of pretending every era has a popover");
test.assertIncludes(index, "theme-lab-help-tag-label", "Theme Lab can name the Aqua-era Help Tag instead of pretending Jaguar had a modern popover");
test.assertIncludes(index, "menu-bar-current-app", "Aqua can expose the OS X current-application menu between Apple and File");
test.assertIncludes(index, "theme-lab-aqua-browser", "Theme Lab has a real three-column browser structure for Jaguar Open and Save evidence");
test.assertIncludes(index, "theme-lab-browser-horizontal-scrollbar", "the Aqua column browser includes its period horizontal scroll lane");
test.assertIncludes(index, "theme-lab-toolbar-icon-strip", "Theme Lab can replace the text Back pill with a Finder icon toolbar");
test.assertIncludes(index, "theme-lab-view-icon", "Theme Lab supports era-specific Finder view-control geometry");
test.assertIncludes(index, "theme-lab-era-choice-state", "Theme Lab exposes historical pressed and disabled-on choice states without duplicating the fixture");
test.assertIncludes(index, "theme-lab-scrollbar-thumb is-active", "Theme Lab keeps a stable pressed scrollbar-thumb sample for painter regression");
test.assertIncludes(index, "theme-lab-scrollbar-button is-decrement is-active", "Theme Lab keeps a stable pressed arrow-button sample for painter regression");
test.assertIncludes(index, "theme-lab-list-frame is-focused", "Theme Lab includes a stable focused-list sample instead of relying on screenshot focus order");

test.assertIncludes(app, "function applyTheme(themeId", "the application has one theme application boundary");
test.assertIncludes(app, "window.AISystem6Theme?.applyTheme", "the application delegates state to the registry");
test.assertIncludes(app, "syncThemeLabEvidence(theme)", "Theme Lab font evidence comes from the canonical registry metadata");
test.assertNotIncludes(app, "function toggleLiquidGlassAppearance", "the old binary runtime switch is removed");
test.assertIncludes(persistence, "theme: getCurrentTheme()", "desk settings persist the enum");
test.assertIncludes(persistence, "typeof settings.liquidGlass === \"boolean\"", "desk-state restore retains one release-safe Boolean migration");

test.assertIncludes(manifest, '"styles/65-appearance-themes.css"', "the era parameter tables participate in the production bundle");
test.assertIncludes(manifest, '"styles/67-aqua-appearance.css"', "the isolated Aqua partial participates in the production bundle");
test.assertIncludes(manifest, '"styles/66-theme-lab.css"', "Theme Lab is a system surface, so its stylesheet ships in the production bundle");
test.assertIncludes(labSnapshot, "66-theme-lab.css", "Theme Lab snapshots inject the dev-only stylesheet");
test.assertIncludes(labFidelity, "66-theme-lab.css", "canonical comparison injects the dev-only stylesheet");
test.assertIncludes(labSnapshot, "experimental: true", "Theme Lab snapshots preview research appearances without persisting");
test.assertIncludes(labFidelity, "experimental: true", "canonical comparison previews research appearances without persisting");
for (const id of THEME_IDS.slice(1, -1)) {
  const source = (id === "aqua" || id === "snow-leopard") ? aquaAppearanceCss : appearanceCss;
  test.assertIncludes(source, `data-theme="${id}"`, `${id} has an owned parameter table`);
}
test.assertNotMatches(appearanceCss, /\.(?:assistant|docmap|reader|quick-draft|teachtext|scrapbook)-/, "era CSS does not fork application layouts");
test.assertNotIncludes(labCss, "data-theme=", "Theme Lab has one shared component stylesheet, not six implementations");
test.assertIncludes(verification, "appearanceThemeSelectorLimit", "CSS verification ratchets per-era structural recipes");
test.assertIncludes(packageJson, '"verify:theme-lab"', "the six-era visual comparison has a named verification command");

// Research themes keep a controlled development preview path. ?debugTheme=
// previews a research appearance only on a development surface, never on a
// public deployment, and never persists.
test.assertIncludes(app, "bootDebugMatch", "research previews enter through ?debugTheme=");
test.assertIncludes(app, "developmentPreviewAllowed", "research previews require a development surface");
test.assertIncludes(app, "function isDevelopmentSurface", "development surfaces are decided by one explicit helper");
test.assertNotIncludes(app, "deploymentProfile !== \"public\"", "unknown deployment state is never treated as development");
test.assertIncludes(app, "window.AISystem6Capabilities?.development === true", "remote staging needs an explicit development capability");
test.assertIncludes(app, "localhost", "loopback hosts are development surfaces");
test.assertIncludes(app, "previewExperimentalTheme(bootDebugTheme.id)", "the research preview stays experimental and non-persisting");
test.assertIncludes(app, "normalizeReleaseThemeId(bootDebugTheme.id)", "the Appearance selector still reflects the release theme during preview");
test.assertNotMatches(app, /\[?&\]theme=\(\[a-z0-9-\]+\).*releaseReady === false/, "plain ?theme= no longer unlocks research appearances");
test.assertIncludes(packageJson, '"snapshot:theme-lab"', "the six-era baselines have an explicit update command");
test.assertIncludes(packageJson, '"compare:theme-lab:canonical"', "historical fidelity has a separate canonical-reference command");
test.assertIncludes(labSnapshot, "overflow: visible !important", "Theme Lab snapshots cover the complete scrollable atlas instead of only its first viewport");
test.assertIncludes(labFidelity, 'writeCanvas(join(outputDir, "overlay-50.png")', "canonical comparison always emits the 50% overlay artifact");
test.assertIncludes(labFidelity, 'writeCanvas(join(outputDir, "pixel-diff.png")', "canonical comparison always emits the pixel-difference artifact");
test.assertIncludes(labFidelity, "sha256File(path)", "canonical source files are verified before pixels are consumed");
test.assertIncludes(labFidelity, "chromium.executablePath()", "canonical capture records the bundled Chromium rather than silently using system Chrome");
test.assertIncludes(platinumFidelity, '"id": "platinum-macos90-v1"', "Platinum has a versioned canonical-reference manifest");
test.assertIncludes(platinumFidelity, '"locale": "en-US"', "Platinum canonical content fixes the source language");
test.assertIncludes(platinumFidelity, '"browserRevision": "1234"', "Platinum canonical capture pins the Playwright Chromium revision");
test.assertIncludes(platinumFidelity, "abd73b69018e25bc2fa91317a99e037f34cb386a8ef8b24544e2ed958dffd188", "the real Mac OS 9 Appearance source is pinned by SHA-256");
test.assertNotIncludes(platinumFidelity, "/private/tmp/", "canonical metadata does not encode one developer's local source path");
test.assertIncludes(aquaFidelity, '"id": "aqua-macosx102-v1"', "Aqua has a versioned Jaguar canonical-reference manifest");
test.assertIncludes(aquaFidelity, '"locale": "en-US"', "Aqua canonical content fixes the source language");
test.assertIncludes(aquaFidelity, '"historicalFontTarget": "Lucida Grande 13 pt"', "Aqua canonical capture records the researched Jaguar system font");
test.assertIncludes(aquaFidelity, "7fb5f36c42f3e6af655ab3e22cf29598517ad7903550c5142fadffb5b57cdfb5", "the real Jaguar Finder source is pinned by SHA-256");
test.assertIncludes(aquaFidelity, "04a90a0213b0cc964295e303f42f13d2c7987193820d96097357f0e67f3caf9c", "the real Jaguar Open-dialog source is pinned by SHA-256");
test.assertNotIncludes(aquaFidelity, "/private/tmp/", "Aqua canonical metadata does not encode one developer's local source path");
test.assert(exists("assets/vendor/classic-stylesheets/LICENSE.txt"), "adapted classic-stylesheets assets retain their MIT notice");
test.assert(exists("assets/vendor/classic-stylesheets/macos9/tab-selected.svg"), "Platinum's selected tab keeps inspectable reference geometry");
test.assert(exists("assets/vendor/classic-stylesheets/macos9/dropdown-disabled.svg"), "Platinum's disabled pop-up arrow keeps an inspectable reference-state asset");
test.assertIncludes(appearanceCss, "--pane-bg: #dddddd", "Platinum separates the active window body from its #ccc frame");
test.assertIncludes(appearanceCss, "--system-titlebar-inactive-title-color: #777777", "Platinum preserves the reference inactive title color");
test.assertIncludes(appearanceCss, "--theme-lab-group-position: relative", "Platinum group boxes use the classic fieldset and legend relationship");
test.assertIncludes(appearanceCss, "--theme-lab-checkbox-active-bg: #777777", "Platinum records the pressed checkbox material from classic-stylesheets");
test.assertIncludes(appearanceCss, "--theme-lab-radio-active-bg: linear-gradient(to bottom right, #444444, #bbbbbb)", "Platinum records the pressed radio material from classic-stylesheets");
test.assertIncludes(appearanceCss, "--theme-lab-scrollbar-thumb-active-bg: #6666cc", "Platinum records the pressed scrollbar thumb color ladder");
test.assertIncludes(appearanceCss, "box-shadow: none;\n}\n\nbody[data-theme=\"platinum\"] :is(input", "Platinum disabled buttons drop their raised bevel before the field recipe begins");
test.assertIncludes(labCss, ".theme-lab-choice-matrix input[type=\"checkbox\"]:checked::after", "Theme Lab renders the checkbox mark as the reference CSS geometry rather than reusing a menu glyph");
test.assertIncludes(labCss, ".theme-lab-scrollbar-thumb:is(:active, .is-active)", "Theme Lab consumes the reference scrollbar pressed state");
test.assertIncludes(appearanceCss, "--theme-lab-toolbar-button-display: none", "Platinum replaces the later Finder toolbar action with its information bar");
test.assertIncludes(appearanceCss, "--theme-lab-list-scrollbar-display: grid", "Platinum exposes the complete framed list and 16px scrollbar recipe");
test.assertIncludes(appearanceCss, "--theme-lab-finder-system-svg-opacity: 0", "Platinum does not leak System 6 monochrome icons into its Finder evidence surface");
test.assertIncludes(appearanceCss, "--theme-lab-finder-rows-display: none", "Platinum's Finder specimen shows one historical view mode at a time");
test.assert(exists("assets/themes/platinum/folder-32.svg") && exists("assets/themes/platinum/alert-32.svg"), "Platinum's project-owned pixel painters remain inspectable assets");
test.assert(exists("assets/fonts/platinum/Asap-Variable.woff2") && exists("assets/fonts/platinum/OFL.txt"), "Platinum's cross-platform font fallback retains its OFL alongside the binary");
test.assertIncludes(appearanceCss, 'font-family: "Platinum Asap"', "Platinum registers the licensed fallback as a distinct face instead of impersonating Charcoal");
test.assertIncludes(appearanceCss, 'font-variation-settings: "wdth" 113', "Platinum preserves the measured Charcoal-compatible fallback width");
test.assertIncludes(aquaAppearanceCss, "Jaguar evidence boundary", "Aqua records a distinct 10.2 evidence boundary");
test.assertIncludes(aquaAppearanceCss, "Apple's June 2002 Aqua HIG owns control geometry", "Aqua gives the period HIG priority for native geometry");
test.assertIncludes(aquaAppearanceCss, "Jaguar JButtons fall back to Panther", "Aqua records Quaqua's documented Jaguar button limitation instead of treating its common painter as ground truth");
test.assertIncludes(aquaAppearanceCss, "--system-button-min-height: 20px", "Aqua preserves the Jaguar standard push-button height");
test.assertIncludes(aquaAppearanceCss, "--system-button-small-height: 17px", "Aqua preserves the Jaguar small push-button height");
test.assertIncludes(aquaAppearanceCss, "--select-control-min-height: 20px", "Aqua preserves the Jaguar pop-up height");
test.assertIncludes(aquaAppearanceCss, "--system-control-min-height: 22px", "Aqua preserves the Jaguar text-field height");
test.assertIncludes(aquaAppearanceCss, "--titlebar-title-weight: 400", "Aqua keeps document-window titles in regular Lucida Grande");
test.assertIncludes(aquaAppearanceCss, "--btn-hover-bg: var(--btn-bg)", "Aqua does not invent a hover-only button painter");
test.assertIncludes(aquaAppearanceCss, "#f1f1f1 0 1px, #ffffff 1px 2px, #f1f1f1 2px 3px, #eaeaea 3px 4px", "Aqua preserves the sampled Jaguar four-row pinstripe as a shared surface token");
test.assertIncludes(aquaAppearanceCss, "--menu-current-app-display: flex", "Aqua restores the current-application menu relationship instead of starting at File");
test.assertIncludes(aquaAppearanceCss, "--theme-lab-aqua-browser-display: grid", "Aqua selects the dedicated NSBrowser specimen rather than recoloring a sidebar");
test.assertIncludes(aquaAppearanceCss, "--theme-lab-sheet-owner-display: flex", "Aqua's sheet exposes a real owning title bar instead of a generated chrome strip");
test.assertIncludes(index, 'class="theme-lab-sheet-owner-titlebar"', "Theme Lab keeps the Aqua sheet visibly attached to owner-window DOM");
test.assertIncludes(index, 'class="theme-lab-finder-window-titlebar"', "Theme Lab keeps Jaguar Finder titlebar, toolbar, status strip, and content in one window fixture");
test.assertIncludes(aquaAppearanceCss, "--theme-lab-finder-startup-disk-image: url(\"./assets/themes/aqua/startup-disk.svg\")", "Aqua Finder consumes its project-authored color icon recipe");
test.assert(exists("assets/themes/aqua/README.md") && exists("assets/themes/aqua/startup-disk.svg") && exists("assets/themes/aqua/folder.svg"), "Aqua's project-authored painters document the Quaqua artwork boundary");
test.assert(!exists("assets/vendor/quaqua"), "Apple-owned Quaqua artwork remains evidence-only and is not redistributed");
test.assertIncludes(aquaAppearanceCss, "Quaqua16SnowLeopardLookAndFeel.java", "Snow Leopard is pinned to Quaqua's dedicated 10.6 implementation");
test.assertIncludes(aquaAppearanceCss, "platform-mac-snowleopard rules", "Snow Leopard records the period Chromium Web evidence boundary");
test.assertIncludes(aquaAppearanceCss, "--toolbar-bg-inactive: linear-gradient(#e4e4e4, #d8d8d8)", "Snow Leopard preserves the Chromium 10.6 inactive toolbar gradient as a semantic token");
test.assertIncludes(aquaAppearanceCss, "--sidebar-bg: #dde4eb", "Snow Leopard exposes the measured active source-list surface");
test.assertIncludes(aquaAppearanceCss, "--sidebar-selection-bg-inactive:", "Snow Leopard exposes focused, unfocused, and inactive source-list selection states");
test.assertIncludes(aquaAppearanceCss, "--scrollbar-width: 15px", "the system specimen uses the native 10.6 Aqua scrollbar width");
test.assertIncludes(aquaAppearanceCss, "--scrollbar-compact-width: 11px", "Chromium's custom compact scrollbar survives as a separate Web variant token");
test.assertIncludes(aquaAppearanceCss, 'body[data-theme="aqua"] .system-select-button::after', "Aqua keeps its native up/down pop-up indicator in its own recipe partial");
test.assertIncludes(appearanceCss, "vinceliuice/Yosemite-gtk-theme 03b6f721", "Yosemite records the exact GTK evidence revision");
test.assertIncludes(appearanceCss, "--selection-bg: #0e6bff", "Yosemite preserves the evidence-led selection blue");
test.assertIncludes(aquaAppearanceCss, 'body[data-theme="snow-leopard"] .theme-lab-toolbar', "Snow Leopard's mature toolbar geometry stays a snow-leopard recipe driven by era tokens over the Aqua base");
test.assertIncludes(foundationCss, "--surface-backdrop-filter: none", "surface vibrancy has a safe Classic default");
test.assertIncludes(liquidCss, "--surface-backdrop-filter: var(--menu-panel-backdrop-filter)", "the new surface token keeps its Liquid Glass twin");
test.assertIncludes(labCss, "backdrop-filter: var(--sidebar-backdrop-filter", "Theme Lab diagnoses sidebar vibrancy through its own semantic token");
test.assertIncludes(labCss, "backdrop-filter: var(--titlebar-toolbar-backdrop-filter", "Theme Lab diagnoses titlebar/toolbar vibrancy through its own semantic token");
test.assertIncludes(foundationCss, "--sidebar-backdrop-filter: var(--surface-backdrop-filter)", "surface vibrancy is split per surface in the token foundation");
test.assertIncludes(appearanceCss, ".theme-lab-generic-browser.is-inactive .theme-lab-sidebar", "Yosemite's inactive sidebar returns to an opaque surface");
test.assertIncludes(appearanceCss, "backdrop-filter: none", "the inactive sidebar drops its blur");

for (const id of THEME_IDS) {
  test.assert(exists(`tests/visual/theme-lab/${id}.png`), `${id} has a committed Theme Lab baseline`);
}

test.finish();
