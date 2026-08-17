(function initThemeLabFeature() {
  "use strict";

  // Internal Appearance workbench. Three jobs, in this order:
  //   1. show one specimen set in whichever era is on screen,
  //   2. say what that era overrides and what it inherits,
  //   3. hand back the exact edit — pasteable CSS, or the checklist a new era
  //      needs — without writing a file or persisting an experiment.
  //
  // Everything era-specific is data in this file. There is one object lab, one
  // context list, and one token table; an era supplies art tiers, appearance
  // variants, and the stylesheet that owns its delta. When two eras look
  // different here it is because their tokens differ, never because the lab
  // drew them a different board.

  // The sixteen priority objects, in the order the icon lineage audit reviews
  // them. tooling/build-icon-lineage-audit.mjs holds the same list for the
  // offline boards; keep the two in step.
  const OBJECTS = Object.freeze([
    ["finderApp", "Finder / System"], ["multiFinderApp", "MultiFinder"],
    ["folder", "Folder"], ["hardDisk", "Hard Disk"],
    ["trash", "Trash"], ["document", "Generic Document"],
    ["fileFloppy", "Floppy Disk"], ["projectDisk", "Project Disk"],
    ["projectDisc", "Project CD"], ["searcher", "Searcher"],
    ["teachText", "TeachText"], ["scrapbook", "Scrapbook"],
    ["assistant", "ClioTalk"], ["controlPanel", "Control / Settings"],
    ["reviewDesk", "Review Desk"], ["docMap", "DocMap"],
  ]);
  const OBJECT_IDS = new Set(OBJECTS.map(([id]) => id));
  const OBJECT_LABELS = Object.fromEntries(OBJECTS);

  // Provenance from ICON-LINEAGE-AUDIT.md → "Provenance classes". A is a
  // native prototype reconstruction, B a period analog adaptation, C an
  // original period-plausible design. Three objects change class along the
  // lineage; an object entry may therefore be a per-era map with a fallback.
  const PROVENANCE = Object.freeze({
    finderApp: "A", multiFinderApp: "C", folder: "A", hardDisk: "A",
    trash: "A", document: "A", fileFloppy: "B", projectDisk: "B",
    projectDisc: "B", searcher: "B", teachText: "B",
    scrapbook: Object.freeze({ classic: "A", fallback: "B" }),
    assistant: Object.freeze({ classic: "C", fallback: "B" }),
    controlPanel: "A",
    reviewDesk: Object.freeze({ platinum: "C", fallback: "B" }),
    docMap: "C",
  });

  // Per era: the authored art tiers, and which of them the runtime dispatches
  // for ordinary, compact, and large contexts. `zoom` is the inspector ladder —
  // [source tier, displayed px] — so a tier is never resampled to stand in for
  // a neighbour it does not have.
  const ERA_ART = Object.freeze({
    classic: Object.freeze({
      dir: "classic", ext: "svg", tiers: [32, 16],
      ordinary: 32, compact: 16, large: 32,
      zoom: [[32, 32], [32, 64], [32, 128], [32, 256]],
      appearances: ["default"],
    }),
    platinum: Object.freeze({
      dir: "platinum", ext: "png", tiers: [42, 32, 16],
      ordinary: 32, compact: 16, large: 42,
      zoom: [[42, 168], [32, 96], [16, 64]],
      appearances: ["default"],
    }),
    aqua: Object.freeze({
      dir: "aqua", ext: "png", tiers: [128, 32, 16],
      ordinary: 32, compact: 16, large: 128,
      zoom: [[128, 128], [32, 96], [16, 64]],
      appearances: ["default"],
    }),
    "snow-leopard": Object.freeze({
      dir: "snow-leopard", ext: "png", tiers: [512, 128, 32, 16],
      ordinary: 32, compact: 16, large: 128,
      zoom: [[512, 256], [128, 128], [32, 96], [16, 64]],
      appearances: ["default"],
    }),
    yosemite: Object.freeze({
      dir: "yosemite", ext: "png", tiers: [128, 64, 32, 16],
      ordinary: 32, compact: 16, large: 128,
      zoom: [[128, 128], [64, 128], [32, 96], [16, 64]],
      appearances: ["default"],
    }),
    "liquid-glass": Object.freeze({
      dir: "liquid-glass", ext: "png", tiers: [128, 64, 32, 16],
      ordinary: 32, compact: 16, large: 128,
      zoom: [[128, 128], [64, 128], [32, 96], [16, 64]],
      // The only era whose files carry an appearance suffix. Everyone else
      // declares one appearance, so the inspector keeps the same shape.
      variant: "-default",
      appearances: ["default", "dark", "clear"],
    }),
  });

  // Which stylesheet owns an era's token delta, and the selector its block
  // carries. Repo facts, not something the CSSOM can report once the bundle is
  // concatenated; DESIGN.md → "Appearance work should be token-first" is the
  // authority. The copy-out block names both so the paste target is unambiguous.
  const ERA_TOKEN_HOME = Object.freeze({
    classic: Object.freeze({ file: "apps/desktop/styles/00-foundation.css", selector: ":root" }),
    platinum: Object.freeze({
      file: "apps/desktop/styles/65-appearance-themes.css",
      selector: 'html[data-theme="platinum"],\nbody[data-theme="platinum"]',
    }),
    aqua: Object.freeze({
      file: "apps/desktop/styles/67-aqua-appearance.css",
      selector: 'html[data-theme="aqua"],\nbody[data-theme="aqua"]',
    }),
    "snow-leopard": Object.freeze({
      file: "apps/desktop/styles/67-aqua-appearance.css",
      selector: 'html[data-theme="snow-leopard"],\nbody[data-theme="snow-leopard"]',
    }),
    yosemite: Object.freeze({
      file: "apps/desktop/styles/65-appearance-themes.css",
      selector: 'html[data-theme="yosemite"],\nbody[data-theme="yosemite"]',
    }),
    "liquid-glass": Object.freeze({
      file: "apps/desktop/styles/70-liquid-glass.css",
      selector: "body.use-liquid-glass",
    }),
  });

  // Every semantic icon the appearance system paints, in painter order. The
  // overview is Theme Lab's alone, so its 54 tiles are built here rather than
  // written into index.html, where they would cost the boot bundle ~9 KB for a
  // window that loads on demand. Tile labels are the id read as words; only
  // fileFloppy carries a product name that the id does not spell.
  const ICON_SET = Object.freeze([
    "startupDisk", "hardDisk", "folder", "document", "applications",
    "trash", "trashFull", "finderApp", "fileFloppy", "assistant",
    "quickDraft", "writingStudio", "projectDisk", "projectDisc",
    "cloudModel", "cloudModelOff", "questionSheet", "outline",
    "sectionDrafts", "manuscript", "reviewDesk", "searcher", "reader",
    "timeMachine", "docMap", "clioStage", "clioChart", "liquidCover",
    "cmfStudio", "soundscape", "scrapbook", "systemFolder", "helpFolder",
    "importUtility", "controlPanel", "chooser", "systemHelp", "dictionary",
    "teachText", "writingDemo", "chatFile", "chatImport", "systemStatus",
    "contextPanel", "rebuildArticle", "bureaucracyMeme", "endfieldTerminal",
    "documents", "alias", "systemFile", "multiFinderApp", "daHandler",
    "writingBell", "control",
  ]);

  const PANELS = Object.freeze(["chrome", "objects", "surfaces", "tokens"]);
  const TOKEN_ROW_LIMIT = 240;
  // A group needs this many tokens to earn its own entry in the chooser;
  // everything below it collects under "Other" so the list stays readable.
  const TOKEN_GROUP_FLOOR = 6;

  let activePanel = "chrome";
  let inspectedObjectId = OBJECTS[0][0];
  // Tokens the user is trying out this session, name -> value. They live on
  // body's inline style and never reach storage or a stylesheet.
  const draftTokens = new Map();
  let tokenIndex = null;
  let lastRenderedThemeId = null;
  // Until the user picks a scope, the Lab picks the one that has rows: an era
  // with a delta opens on its delta, and System 6 — which is the baseline and
  // overrides nothing — opens on the whole table instead of on an empty box.
  let tokenScopeChosen = false;

  const lab = () => document.querySelector('[data-window="themeLab"]');
  const currentTheme = () => window.AISystem6Theme?.getTheme?.();

  function provenanceOf(id, themeId) {
    const entry = PROVENANCE[id];
    if (!entry) return "C";
    if (typeof entry === "string") return entry;
    return entry[themeId] || entry.fallback;
  }

  function artOf(themeId) {
    return ERA_ART[themeId] || ERA_ART.classic;
  }

  // One source-file path for one authored tier. `art.variant` is the appearance
  // suffix; only Liquid Glass has one.
  function assetPath(art, id, tier, appearance) {
    const suffix = art.variant ? `-${appearance || "default"}` : "";
    return `assets/themes/${art.dir}/icons/${id}-${tier}${suffix}.${art.ext}`;
  }

  // The state grid paints through the real runtime painter, so what the lab
  // shows is what the desktop ships. Only the inspector reaches for a file.
  // The display size arrives as a class from a fixed set, so no cell needs an
  // inline style and the stylesheet keeps every measurement.
  function runtimeIcon(id, tier, displaySize) {
    return renderSystemIcon(id, {
      size: "object-lab",
      className: `theme-lab-object-px-${displaySize}`,
      sourceSize: tier <= 16 ? 16 : 32,
      platinumSourceSize: tier <= 16 ? 16 : tier >= 42 ? 42 : 32,
      modernSourceSize: tier <= 16 ? 16 : tier <= 32 ? 32 : tier <= 64 ? 64 : 128,
      displaySize,
    });
  }

  function objectItem(id, label, { tier = 32, display = tier, selected = false, className = "" } = {}) {
    const classes = ["finder-item", "theme-lab-object-item"];
    if (selected) classes.push("is-selected");
    if (className) classes.push(className);
    return `<button type="button" class="${classes.join(" ")}" tabindex="-1">${runtimeIcon(id, tier, display)}<span>${escapeHtml(label)}</span></button>`;
  }

  const contextBox = (title, body, cls = "") =>
    `<section class="theme-lab-object-context${cls}"><h4>${escapeHtml(title)}</h4><div>${body}</div></section>`;

  // --------------------------------------------------------------- timeline --

  // The six appearances are a chronology, so the switch is an axis rather than
  // six equal buttons: ticks sit at their true distance in years, which is what
  // makes dragging read as travel instead of as picking from a list. The same
  // geometry the public page uses (site/js/dissolve.js), on the same years.
  //
  // This rail is the lab's own chrome, not a specimen. It makes no historical
  // claim, which is why it may use a native range: that keeps the keyboard and
  // screen-reader behaviour real instead of reinvented.
  const eraStops = () => {
    const themes = window.AISystem6Theme?.themes || [];
    const years = themes.map((entry) => entry.year);
    const first = Math.min(...years);
    const last = Math.max(...years);
    const span = last - first || 1;
    return themes.map((entry) => ({ theme: entry, t: (entry.year - first) / span }));
  };

  function nearestStop(position) {
    const stops = eraStops();
    return stops.reduce((closest, stop) =>
      Math.abs(stop.t - position) < Math.abs(closest.t - position) ? stop : closest, stops[0]);
  }

  function renderEraTimeline(theme) {
    const host = lab()?.querySelector("[data-theme-lab-era-switch]");
    if (!host) return;
    const stops = eraStops();
    const active = stops.find((stop) => stop.theme.id === theme.id) || stops[0];
    if (host.dataset.built !== "true") {
      host.dataset.built = "true";
      host.innerHTML = `
        <input class="theme-lab-era-range" type="range" min="0" max="1000" step="1"
          data-theme-lab-era-range aria-label="${escapeHtml(t("theme_lab_timeline"))}" />
        <div class="theme-lab-era-ticks">${stops.map((stop) => `
          <button class="theme-lab-era-tick" type="button" data-theme-lab-era="${escapeHtml(stop.theme.id)}"
            style="--theme-lab-era-t: ${stop.t}"><i aria-hidden="true"></i><span>${stop.theme.year}</span></button>`).join("")}</div>`;
    }
    const range = host.querySelector("[data-theme-lab-era-range]");
    if (range && document.activeElement !== range) range.value = String(Math.round(active.t * 1000));
    if (range) {
      range.style.setProperty("--theme-lab-era-t", String(active.t));
      range.setAttribute("aria-valuetext", t("theme_lab_timeline_value", active.theme.year, t(active.theme.labelKey)));
    }
    for (const tick of host.querySelectorAll("[data-theme-lab-era]")) {
      const current = tick.dataset.themeLabEra === theme.id;
      tick.classList.toggle("is-active", current);
      tick.setAttribute("aria-current", String(current));
    }
  }

  // The readout is composed here rather than inside a translation string, so
  // the tables stay plain text and every value is escaped on the way in.
  function renderLineage(theme) {
    const target = lab()?.querySelector("[data-theme-lab-lineage]");
    if (!target) return;
    const chain = window.AISystem6Theme?.getRecipeChain?.(theme.id) || [theme];
    const path = chain.map((entry) => t(entry.labelKey)).join(" → ");
    const art = artOf(theme.id);
    target.innerHTML = [
      `<b>${escapeHtml(String(theme.year))}</b>`,
      `<em>${escapeHtml(t(theme.labelKey))}</em>`,
      `<span>${escapeHtml(t("theme_lab_set_in", theme.systemFont, theme.systemFontSize))}</span>`,
      `<span>${escapeHtml(t("theme_lab_lineage", path, art.tiers.join(" / "), art.appearances.length))}</span>`,
    ].join("");
  }

  // Dragging sweeps the live desktop through forty years, so the appearance is
  // applied the moment the nearest tick changes — but without persisting or
  // saving the desk on every frame. The release settles onto the exact era and
  // commits it once, through the same boundary the menu uses.
  function travelTo(themeId, { commit }) {
    if (!commit && window.AISystem6Theme?.getCurrentTheme?.() === themeId) return;
    applyTheme(themeId, commit ? {} : { persist: false, saveDesk: false, syncUi: false });
  }

  // ------------------------------------------------------------------ tabs --

  function showPanel(name) {
    const win = lab();
    if (!win || !PANELS.includes(name)) return;
    activePanel = name;
    for (const tab of win.querySelectorAll("[data-theme-lab-tab]")) {
      const active = tab.dataset.themeLabTab === name;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", String(active));
    }
    for (const panel of win.querySelectorAll("[data-theme-lab-panel]")) {
      panel.hidden = panel.dataset.themeLabPanel !== name;
    }
    render(currentTheme());
  }

  // ------------------------------------------------------------ object lab --

  function renderObjectLab(theme) {
    const section = lab()?.querySelector("[data-theme-lab-object-lab]");
    if (!section) return;
    const art = artOf(theme.id);
    const themeId = theme.id;

    const intro = section.querySelector("[data-theme-lab-object-intro]");
    if (intro) intro.textContent = t("theme_lab_object_intro", t(theme.labelKey), art.ordinary, art.compact, art.large);

    // Provenance differs by era and must not be flattened into a shared
    // sentence: each era states what its family is, which files are direct
    // optical assets, and what is still undrawn. Same slot, era-owned words.
    const evidence = section.querySelector("[data-theme-lab-object-evidence]");
    if (evidence) evidence.textContent = t(`theme_lab_evidence_${themeId.replace(/-/g, "_")}`);

    const counts = { A: 0, B: 0, C: 0 };
    for (const [id] of OBJECTS) counts[provenanceOf(id, themeId)] += 1;
    const key = section.querySelector("[data-theme-lab-object-key]");
    if (key) {
      key.innerHTML = [
        t("theme_lab_object_count", OBJECTS.length),
        t("theme_lab_object_tiers", art.tiers.join(" / ")),
        t("theme_lab_object_provenance", counts.A, counts.B, counts.C),
      ].map((line) => `<span>${escapeHtml(line)}</span>`).join("");
    }

    const grid = section.querySelector("[data-theme-lab-object-grid]");
    if (grid) {
      grid.innerHTML = OBJECTS.map(([id, label]) => {
        const cls = provenanceOf(id, themeId);
        const inspected = id === inspectedObjectId;
        return `<article class="theme-lab-object-card${inspected ? " is-inspected" : ""}" data-theme-lab-object="${escapeHtml(id)}">
          <button class="theme-lab-object-inspect" type="button" data-theme-lab-inspect="${escapeHtml(id)}" aria-pressed="${inspected}"><strong>${escapeHtml(label)}</strong><code>${escapeHtml(id)}</code></button>
          <span class="theme-lab-object-class is-class-${cls.toLowerCase()}" title="${escapeHtml(t(`theme_lab_provenance_${cls.toLowerCase()}`))}">${escapeHtml(t("theme_lab_provenance_short", cls))}</span>
          <div class="theme-lab-object-states">
            ${objectItem(id, t("theme_lab_state_normal", art.ordinary), { tier: art.ordinary })}
            ${objectItem(id, t("theme_lab_state_selected", art.ordinary), { tier: art.ordinary, selected: true })}
            ${objectItem(id, t("theme_lab_state_normal", art.compact), { tier: art.compact })}
            ${objectItem(id, t("theme_lab_state_selected", art.compact), { tier: art.compact, selected: true })}
          </div>
        </article>`;
      }).join("");
    }

    renderInspector(theme);
    renderObjectContexts(theme);
  }

  function renderInspector(theme) {
    const inspector = lab()?.querySelector("[data-theme-lab-object-inspector]");
    if (!inspector) return;
    const art = artOf(theme.id);
    const id = OBJECT_IDS.has(inspectedObjectId) ? inspectedObjectId : OBJECTS[0][0];
    const cls = provenanceOf(id, theme.id);
    const rows = art.appearances.map((appearance) => {
      const figures = art.zoom.map(([tier, display]) => `<figure>
        <img src="${escapeHtml(assetPath(art, id, tier, appearance))}" width="${display}" height="${display}" alt="" data-native-size="${tier}" />
        <figcaption>${escapeHtml(t("theme_lab_zoom_caption", tier, Math.round((display / tier) * 100)))}</figcaption>
      </figure>`).join("");
      const name = art.appearances.length > 1
        ? `<h5>${escapeHtml(t(`theme_lab_appearance_${appearance}`))}</h5>`
        : "";
      return `<div class="theme-lab-object-appearance is-${escapeHtml(appearance)}">${name}<div class="theme-lab-object-zooms">${figures}</div></div>`;
    }).join("");
    inspector.innerHTML = `<h4>${escapeHtml(OBJECT_LABELS[id])}<code>${escapeHtml(id)}</code><small>${escapeHtml(t(`theme_lab_provenance_${cls.toLowerCase()}`))}</small></h4><div class="theme-lab-object-appearances">${rows}</div>`;
  }

  // Five checks, the same five in every era. An era answers them with its own
  // tiers and its own surfaces, so no era is asked to prove a context it never
  // had and none is quietly skipped either.
  function renderObjectContexts(theme) {
    const host = lab()?.querySelector("[data-theme-lab-object-contexts]");
    if (!host) return;
    const art = artOf(theme.id);
    const large = Math.min(art.large, 72);
    host.innerHTML = [
      contextBox(t("theme_lab_context_desktop", art.ordinary),
        `${objectItem("hardDisk", OBJECT_LABELS.hardDisk, { tier: art.ordinary })}${objectItem("projectDisk", OBJECT_LABELS.projectDisk, { tier: art.ordinary, selected: true })}${objectItem("trash", OBJECT_LABELS.trash, { tier: art.ordinary })}`,
        " is-desktop"),
      contextBox(t("theme_lab_context_icon_view", art.ordinary),
        `${objectItem("folder", OBJECT_LABELS.folder, { tier: art.ordinary })}${objectItem("teachText", OBJECT_LABELS.teachText, { tier: art.ordinary, selected: true })}${objectItem("scrapbook", OBJECT_LABELS.scrapbook, { tier: art.ordinary })}${objectItem("assistant", OBJECT_LABELS.assistant, { tier: art.ordinary })}`),
      contextBox(t("theme_lab_context_list_view", art.compact),
        `${objectItem("document", OBJECT_LABELS.document, { tier: art.compact, className: "is-list-row" })}${objectItem("searcher", OBJECT_LABELS.searcher, { tier: art.compact, selected: true, className: "is-list-row" })}${objectItem("docMap", OBJECT_LABELS.docMap, { tier: art.compact, className: "is-list-row" })}${objectItem("fileFloppy", OBJECT_LABELS.fileFloppy, { tier: art.compact, className: "is-list-row" })}`,
        " is-list-view"),
      contextBox(t("theme_lab_context_large", art.large),
        `${objectItem("finderApp", OBJECT_LABELS.finderApp, { tier: art.large, display: large })}${objectItem("multiFinderApp", OBJECT_LABELS.multiFinderApp, { tier: art.large, display: large })}${objectItem("reviewDesk", OBJECT_LABELS.reviewDesk, { tier: art.large, display: large })}${objectItem("controlPanel", OBJECT_LABELS.controlPanel, { tier: art.large, display: large })}`),
      // The surfaces an era actually has, asked of the same four objects:
      // its desktop, its paper, its chrome. No era is asked to prove a
      // background it never shipped, and none is quietly skipped.
      contextBox(t("theme_lab_context_surfaces"),
        ["is-on-desktop", "is-on-paper", "is-on-chrome"].map((surface) =>
          `<div class="theme-lab-object-surface ${surface}">${["folder", "document", "projectDisc", "controlPanel"]
            .map((id) => objectItem(id, OBJECT_LABELS[id], { tier: art.ordinary })).join("")}</div>`).join(""),
        " is-surface-check"),
    ].join("");
  }

  // ------------------------------------------------------------- icon set --

  // Historical eras attach their own authored 16 px file in the tile corner, so
  // the overview shows the runtime painter and its compact source together.
  function compactHintSource(themeId, id) {
    const stem = (themeId === "platinum" || themeId === "yosemite") && id === "startupDisk" ? "startup-disk"
      : (themeId === "platinum" || themeId === "yosemite") && id === "finderApp" ? "finder-app"
        : themeId === "platinum" && id === "fileFloppy" ? "floppy" : id;
    if (themeId === "classic") return `assets/themes/classic/icons/${stem}-16.svg`;
    if (themeId === "platinum") {
      return OBJECT_IDS.has(id) ? `assets/themes/platinum/icons/${id}-16.png` : `assets/themes/platinum/${stem}-16.svg`;
    }
    if (themeId === "liquid-glass") return `assets/themes/liquid-glass/icons/${id}-16-default.png`;
    return `assets/themes/${themeId}/icons/${id}-16.png`;
  }

  // The workbench markup is Theme Lab's alone and the window is lazy, so it is
  // built here rather than parked in index.html at boot. Everything the
  // fidelity manifests crop stays in index.html; nothing below is a specimen.
  function buildTokenPanel(win) {
    const panel = win.querySelector('[data-theme-lab-panel="tokens"]');
    if (!panel || panel.querySelector("[data-theme-lab-token-table]")) return;
    const field = (labelKey, control) =>
      `<label><span>${escapeHtml(t(labelKey))}</span>${control}</label>`;
    const text = (hook, placeholderKey) =>
      `<input type="text" data-theme-lab-${hook} placeholder="${escapeHtml(t(placeholderKey))}" aria-label="${escapeHtml(t(`theme_lab_${hook.replace(/-/g, "_")}`))}" />`;
    panel.insertAdjacentHTML("beforeend", `
      <section class="theme-lab-group theme-lab-token-desk" aria-labelledby="theme-lab-token-desk-title">
        <h3 id="theme-lab-token-desk-title">${escapeHtml(t("theme_lab_tokens"))}</h3>
        <p class="theme-lab-token-summary" data-theme-lab-token-summary aria-live="polite"></p>
        <div class="theme-lab-token-filters">
          ${field("theme_lab_token_group", `<span class="select-wrap"><select data-theme-lab-token-group aria-label="${escapeHtml(t("theme_lab_token_group"))}"></select></span>`)}
          ${field("theme_lab_token_scope", `<span class="select-wrap"><select data-theme-lab-token-scope aria-label="${escapeHtml(t("theme_lab_token_scope"))}">
            <option value="overridden">${escapeHtml(t("theme_lab_token_scope_overridden"))}</option>
            <option value="inherited">${escapeHtml(t("theme_lab_token_scope_inherited"))}</option>
            <option value="all">${escapeHtml(t("theme_lab_token_scope_all"))}</option>
          </select></span>`)}
          ${field("theme_lab_token_search", `<input class="theme-lab-token-search" type="search" data-theme-lab-token-search aria-label="${escapeHtml(t("theme_lab_token_search"))}" />`)}
        </div>
        <div class="theme-lab-token-table" data-theme-lab-token-table></div>
        <div class="theme-lab-desk-actions">
          <span class="theme-lab-desk-status" data-theme-lab-token-status aria-live="polite"></span>
          <button class="btn" type="button" data-theme-lab-token-revert>${escapeHtml(t("theme_lab_token_revert"))}</button>
          <button class="btn default" type="button" data-theme-lab-token-copy>${escapeHtml(t("theme_lab_token_copy"))}</button>
        </div>
        <pre class="theme-lab-desk-output" data-theme-lab-token-output hidden></pre>
      </section>
      <section class="theme-lab-group theme-lab-new-appearance" aria-labelledby="theme-lab-new-appearance-title">
        <h3 id="theme-lab-new-appearance-title">${escapeHtml(t("theme_lab_new_appearance"))}</h3>
        <p class="theme-lab-new-intro">${escapeHtml(t("theme_lab_new_intro"))}</p>
        <div class="theme-lab-new-form">
          ${field("theme_lab_new_id", text("new-id", "theme_lab_new_id_placeholder"))}
          ${field("theme_lab_new_label", text("new-label", "theme_lab_new_label_placeholder"))}
          ${field("theme_lab_new_base", `<span class="select-wrap"><select data-theme-lab-new-base aria-label="${escapeHtml(t("theme_lab_new_base"))}"></select></span>`)}
          ${field("theme_lab_new_font", text("new-font", "theme_lab_new_font_placeholder"))}
          ${field("theme_lab_new_font_size", `<input type="number" min="9" max="24" step="1" value="13" data-theme-lab-new-font-size aria-label="${escapeHtml(t("theme_lab_new_font_size"))}" />`)}
        </div>
        <div class="theme-lab-desk-actions">
          <span class="theme-lab-desk-status" data-theme-lab-new-status aria-live="polite"></span>
          <button class="btn" type="button" data-theme-lab-new-copy>${escapeHtml(t("theme_lab_new_copy"))}</button>
          <button class="btn default" type="button" data-theme-lab-new-build>${escapeHtml(t("theme_lab_new_build"))}</button>
        </div>
        <pre class="theme-lab-desk-output" data-theme-lab-new-output hidden></pre>
      </section>`);
  }

  function buildIconSet(win) {
    const grid = win.querySelector("[data-theme-lab-icon-grid]");
    if (!grid || grid.childElementCount) return;
    grid.innerHTML = ICON_SET.map((id) => {
      const label = id === "fileFloppy" ? "floppy" : id.replace(/([A-Z])/g, " $1");
      return `<button class="theme-lab-icon-tile"><span class="sys-icon" data-system-icon="${escapeHtml(id)}" aria-hidden="true"></span><b>${escapeHtml(label)}</b></button>`;
    }).join("");
    hydrateSystemIcons(grid);
  }

  function renderIconSet(theme) {
    for (const tile of lab()?.querySelectorAll(".theme-lab-icon-tile") || []) {
      const previous = tile.querySelector(".theme-lab-icon-hint");
      const id = tile.querySelector(".sys-icon[data-system-icon]")?.dataset.systemIcon;
      if (!id || (theme.id === "classic" && !OBJECT_IDS.has(id))) {
        previous?.remove();
        continue;
      }
      const hint = previous || document.createElement("img");
      hint.className = "theme-lab-icon-hint";
      hint.width = 16;
      hint.height = 16;
      hint.alt = "";
      hint.src = compactHintSource(theme.id, id);
      hint.dataset.nativeSize = "16";
      if (!previous) tile.append(hint);
    }
  }

  // ------------------------------------------------------- token workbench --

  // The delta is read from the live CSSOM rather than a copied list, so the
  // table cannot drift from the stylesheets. Only unconditional declarations
  // count as an era's base value; anything inside @media/@container/@supports
  // is a conditional refinement and is reported separately instead of being
  // presented as the value to edit.
  function eraForSelector(selectorText) {
    const selector = String(selectorText || "");
    if (/(^|,)\s*:root\s*$/.test(selector) || selector === ":root") return "__base";
    if (/body\[data-theme\](?!=)/.test(selector)) return "__base";
    if (/\.use-liquid-glass/.test(selector)) return "liquid-glass";
    const match = selector.match(/\[data-theme="([a-z-]+)"\]/);
    return match ? match[1] : null;
  }

  function readCustomProperties(style) {
    const found = [];
    for (let index = 0; index < style.length; index += 1) {
      const name = style.item(index);
      if (name.startsWith("--")) found.push([name, style.getPropertyValue(name).trim()]);
    }
    return found;
  }

  function buildTokenIndex() {
    const base = new Map();
    const eras = new Map();
    const conditional = new Map();
    const bucket = (map, key) => {
      if (!map.has(key)) map.set(key, new Map());
      return map.get(key);
    };

    const walk = (rules, inCondition) => {
      for (const rule of rules) {
        // A style rule can own declarations *and* nested rules, so read its
        // own custom properties before recursing rather than instead of it.
        const isStyleRule = Boolean(rule.selectorText && rule.style);
        if (isStyleRule) {
          const era = eraForSelector(rule.selectorText);
          const declarations = era ? readCustomProperties(rule.style) : [];
          if (declarations.length) {
            if (inCondition) {
              const target = bucket(conditional, era);
              for (const [name] of declarations) target.set(name, true);
            } else {
              const target = era === "__base" ? base : bucket(eras, era);
              for (const [name, value] of declarations) target.set(name, value);
            }
          }
        }
        if (rule.cssRules) walk(rule.cssRules, inCondition || !isStyleRule);
      }
    };

    for (const sheet of Array.from(document.styleSheets)) {
      let rules = null;
      try {
        rules = sheet.cssRules;
      } catch (error) {
        // A cross-origin stylesheet cannot be read; the app serves its own.
        continue;
      }
      if (rules) walk(rules, false);
    }
    return { base, eras, conditional };
  }

  function tokenGroupName(name) {
    const parts = name.replace(/^--/, "").split("-");
    if (parts[0] === "theme" && parts[1] === "lab") return "theme-lab";
    return parts[0] || "other";
  }

  function tokenRowsFor(themeId) {
    if (!tokenIndex) tokenIndex = buildTokenIndex();
    const { base, eras } = tokenIndex;
    const overrides = themeId === "classic" ? new Map() : (eras.get(themeId) || new Map());
    const names = new Set([...base.keys(), ...overrides.keys()]);
    return [...names].sort().map((name) => ({
      name,
      group: tokenGroupName(name),
      baseValue: base.get(name) || "",
      eraValue: overrides.has(name) ? overrides.get(name) : base.get(name) || "",
      overridden: overrides.has(name),
    }));
  }

  function groupChoices(rows) {
    const counts = new Map();
    for (const row of rows) counts.set(row.group, (counts.get(row.group) || 0) + 1);
    const named = [...counts.entries()].filter(([, count]) => count >= TOKEN_GROUP_FLOOR);
    named.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const smallCount = [...counts.entries()].filter(([, count]) => count < TOKEN_GROUP_FLOOR)
      .reduce((total, [, count]) => total + count, 0);
    return { named, smallCount };
  }

  function filterValues(win) {
    return {
      group: win.querySelector("[data-theme-lab-token-group]")?.value || "all",
      scope: win.querySelector("[data-theme-lab-token-scope]")?.value || "overridden",
      search: (win.querySelector("[data-theme-lab-token-search]")?.value || "").trim().toLowerCase(),
    };
  }

  function looksLikeColor(value) {
    return /^(#[0-9a-f]{3,8}|rgb|hsl|color\()/i.test(value.trim());
  }

  function renderTokenDesk(theme) {
    const win = lab();
    const table = win?.querySelector("[data-theme-lab-token-table]");
    if (!table) return;
    const rows = tokenRowsFor(theme.id);
    const overriddenCount = rows.filter((row) => row.overridden).length;
    const home = ERA_TOKEN_HOME[theme.id] || ERA_TOKEN_HOME.classic;
    const conditionalCount = tokenIndex?.conditional.get(theme.id === "classic" ? "__base" : theme.id)?.size || 0;

    const summary = win.querySelector("[data-theme-lab-token-summary]");
    if (summary) {
      summary.textContent = theme.id === "classic"
        ? t("theme_lab_token_summary_base", rows.length, home.file, conditionalCount)
        : t("theme_lab_token_summary_era", t(theme.labelKey), overriddenCount, rows.length, home.file, conditionalCount);
    }

    const { named, smallCount } = groupChoices(rows);
    const chooser = win.querySelector("[data-theme-lab-token-group]");
    if (chooser) {
      const wanted = chooser.value;
      chooser.innerHTML = [`<option value="all">${escapeHtml(t("theme_lab_token_group_all", rows.length))}</option>`]
        .concat(named.map(([name, count]) => `<option value="${escapeHtml(name)}">${escapeHtml(`${name} · ${count}`)}</option>`))
        .concat(smallCount ? [`<option value="__other">${escapeHtml(t("theme_lab_token_group_other", smallCount))}</option>`] : [])
        .join("");
      const options = new Set([...chooser.options].map((option) => option.value));
      chooser.value = options.has(wanted) ? wanted : "all";
      if (typeof refreshSystemSelectControls === "function") refreshSystemSelectControls();
    }

    const scopeSelect = win.querySelector("[data-theme-lab-token-scope]");
    if (scopeSelect && !tokenScopeChosen) {
      const wanted = overriddenCount ? "overridden" : "all";
      if (scopeSelect.value !== wanted) {
        scopeSelect.value = wanted;
        if (typeof refreshSystemSelectControls === "function") refreshSystemSelectControls();
      }
    }

    const { group, scope, search } = filterValues(win);
    const namedGroups = new Set(named.map(([name]) => name));
    const visible = rows.filter((row) => {
      if (scope === "overridden" && !row.overridden) return false;
      if (scope === "inherited" && row.overridden) return false;
      if (group === "__other" && namedGroups.has(row.group)) return false;
      if (group !== "all" && group !== "__other" && row.group !== group) return false;
      if (search && !row.name.includes(search) && !row.eraValue.toLowerCase().includes(search)) return false;
      return true;
    });

    const shown = visible.slice(0, TOKEN_ROW_LIMIT);
    table.innerHTML = shown.map((row) => {
      const draft = draftTokens.get(row.name);
      const value = draft === undefined ? row.eraValue : draft;
      const flagKey = row.overridden ? "theme_lab_token_overridden" : "theme_lab_token_inherited";
      const flagClass = row.overridden ? "is-overridden" : "is-inherited";
      const baseNote = row.overridden && row.baseValue
        ? `<span class="theme-lab-token-base" title="${escapeHtml(t("theme_lab_token_base_value"))}">${escapeHtml(row.baseValue)}</span>`
        : `<span class="theme-lab-token-base"></span>`;
      return `<div class="theme-lab-token-row${draft === undefined ? "" : " is-dirty"}" data-theme-lab-token-row="${escapeHtml(row.name)}">
        <code>${escapeHtml(row.name)}</code>
        <span class="theme-lab-token-flag ${flagClass}">${escapeHtml(t(flagKey))}</span>
        ${baseNote}
        <span class="theme-lab-token-editor">${looksLikeColor(value) ? '<i class="theme-lab-token-swatch" aria-hidden="true"></i>' : ""}<input type="text" spellcheck="false" value="${escapeHtml(value)}" data-theme-lab-token-input="${escapeHtml(row.name)}" aria-label="${escapeHtml(row.name)}" /></span>
      </div>`;
    }).join("") || `<p class="theme-lab-token-empty">${escapeHtml(t("theme_lab_token_empty"))}</p>`;

    for (const swatch of table.querySelectorAll(".theme-lab-token-swatch")) {
      const input = swatch.parentElement?.querySelector("input");
      if (input) swatch.style.setProperty("--theme-lab-swatch", input.value);
    }

    const count = win.querySelector("[data-theme-lab-token-status]");
    if (count && !count.dataset.holdMessage) {
      count.textContent = visible.length > shown.length
        ? t("theme_lab_token_truncated", shown.length, visible.length, draftTokens.size)
        : t("theme_lab_token_shown", shown.length, draftTokens.size);
    }
  }

  // Each era declares its tokens on both html and body, so an experiment has to
  // land on both: an inline property on body would lose to body[data-theme] for
  // anything that resolves from html, and one on html alone would lose to the
  // body rule for everything inside it. Inline beats a stylesheet on each.
  const draftHosts = () => [document.documentElement, document.body].filter(Boolean);

  function applyDraftToken(name, value) {
    const trimmed = value.trim();
    if (!trimmed) {
      draftTokens.delete(name);
      for (const host of draftHosts()) host.style.removeProperty(name);
      return;
    }
    draftTokens.set(name, trimmed);
    for (const host of draftHosts()) host.style.setProperty(name, trimmed);
  }

  function revertDraftTokens() {
    for (const name of draftTokens.keys()) {
      for (const host of draftHosts()) host.style.removeProperty(name);
    }
    draftTokens.clear();
  }

  function tokenDeltaCss(theme) {
    const home = ERA_TOKEN_HOME[theme.id] || ERA_TOKEN_HOME.classic;
    const names = [...draftTokens.keys()].sort();
    const body = names.map((name) => `  ${name}: ${draftTokens.get(name)};`).join("\n");
    return [
      `/* Theme Lab · ${t(theme.labelKey)} · ${names.length} token${names.length === 1 ? "" : "s"}`,
      `   Paste inside ${home.selector.replace(/\n/g, " ")} { … }`,
      `   in ${home.file} */`,
      body,
    ].join("\n");
  }

  // ---------------------------------------------------------- new appearance --

  function newAppearanceFields(win) {
    const value = (selector) => (win.querySelector(selector)?.value || "").trim();
    const id = value("[data-theme-lab-new-id]").toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/^-+|-+$/g, "");
    return {
      id,
      label: value("[data-theme-lab-new-label]"),
      base: value("[data-theme-lab-new-base]"),
      font: value("[data-theme-lab-new-font]"),
      fontSize: Number(value("[data-theme-lab-new-font-size]")) || 13,
      key: `theme_${id.replace(/-/g, "_")}`,
    };
  }

  // The checklist is the real cost of a new era: a registry entry, two
  // translation tables, an action, a menu row, a token delta in the file its
  // base already uses, an icon family at the base's tiers, and the contracts
  // that will refuse to ship without it.
  function newAppearanceChecklist(fields) {
    const baseTheme = window.AISystem6Theme?.getTheme?.(fields.base);
    const home = ERA_TOKEN_HOME[fields.base] || ERA_TOKEN_HOME.classic;
    const art = artOf(fields.base);
    const inherited = (tokenIndex?.eras.get(fields.base)?.size) || tokenIndex?.base.size || 0;
    const iconFiles = art.tiers.map((tier) => `${OBJECTS[0][0]}-${tier}${art.variant || ""}.${art.ext}`).join(", ");
    return [
      `# ${fields.label} (${fields.id}) — new appearance on the ${t(baseTheme.labelKey)} recipe`,
      "",
      "1. apps/desktop/app/core/theme-registry.js — add to `registry`:",
      "     Object.freeze({",
      `       id: "${fields.id}",`,
      `       label: "${fields.label}",`,
      `       labelKey: "${fields.key}",`,
      `       family: "${baseTheme.family}",`,
      `       recipeBase: "${fields.base}",`,
      "       releaseReady: false,",
      `       systemFont: "${fields.font}",`,
      `       systemFontSize: ${fields.fontSize},`,
      `       fontStrategy: "${baseTheme.fontStrategy}",`,
      `       overlay: "${baseTheme.overlay}",`,
      `       capabilities: Object.freeze([${baseTheme.capabilities.map((item) => `"${item}"`).join(", ")}]),`,
      "     }),",
      "",
      "2. apps/desktop/app/data/translations-en.js and translations-zh.js — add:",
      `     ${fields.key}: "${fields.label}",`,
      "",
      "3. apps/desktop/app/core/actions.js — add:",
      `     "set-theme-${fields.id}": () => applyTheme("${fields.id}"),`,
      "",
      "4. apps/desktop/app/data/menus.js — add to the Appearance group:",
      `     menuItem("set-theme-${fields.id}", "${fields.key}", "", { themeId: "${fields.id}" }),`,
      "",
      `5. ${home.file} — add the token delta beside the ${fields.base} block:`,
      `     html[data-theme="${fields.id}"],`,
      `     body[data-theme="${fields.id}"] {`,
      `       /* ${inherited} tokens arrive from the ${fields.base} recipe. Override only what differs. */`,
      "     }",
      "",
      `6. apps/desktop/assets/themes/${fields.id}/icons/ — ${OBJECTS.length} priority objects at ${art.tiers.join(" / ")} px:`,
      `     ${iconFiles}, …`,
      "",
      "7. Contracts, in the same change:",
      "     tests/features/appearance-system.test.mjs — THEME_IDS, SYSTEM_FONTS, THEME_FAMILIES, RECIPE_BASES",
      `     npm run snapshot:theme-lab — writes tests/visual/theme-lab/${fields.id}.png`,
      `     tests/visual/theme-lab-fidelity/${fields.id}.json — only once a canonical reference exists`,
    ].join("\n");
  }

  // ------------------------------------------------------------------ output --

  // Copy is best-effort: the block is always printed so the text is available
  // even when the clipboard is not, and the status line says which happened.
  function publishOutput(win, outputSelector, statusSelector, text) {
    const output = win.querySelector(outputSelector);
    const status = win.querySelector(statusSelector);
    if (output) {
      output.textContent = text;
      output.hidden = false;
    }
    if (!status) return;
    status.dataset.holdMessage = "true";
    const write = navigator.clipboard?.writeText?.(text);
    if (!write || typeof write.then !== "function") {
      status.textContent = t("theme_lab_copy_failed");
      return;
    }
    write.then(
      () => { status.textContent = t("theme_lab_copied"); },
      () => { status.textContent = t("theme_lab_copy_failed"); },
    );
  }

  // ------------------------------------------------------------------ wiring --

  function wire(win) {
    if (win.dataset.themeLabWired === "true") return;
    win.dataset.themeLabWired = "true";

    win.addEventListener("click", (event) => {
      const era = event.target.closest("[data-theme-lab-era]");
      if (era) {
        travelTo(era.dataset.themeLabEra, { commit: true });
        return;
      }
      const tab = event.target.closest("[data-theme-lab-tab]");
      if (tab) {
        showPanel(tab.dataset.themeLabTab);
        return;
      }
      const inspect = event.target.closest("[data-theme-lab-inspect]");
      if (inspect) {
        inspectedObjectId = inspect.dataset.themeLabInspect;
        renderObjectLab(currentTheme());
        return;
      }
      if (event.target.closest("[data-theme-lab-token-revert]")) {
        revertDraftTokens();
        const status = win.querySelector("[data-theme-lab-token-status]");
        if (status) delete status.dataset.holdMessage;
        const output = win.querySelector("[data-theme-lab-token-output]");
        if (output) output.hidden = true;
        renderTokenDesk(currentTheme());
        return;
      }
      if (event.target.closest("[data-theme-lab-token-copy]")) {
        if (!draftTokens.size) {
          const status = win.querySelector("[data-theme-lab-token-status]");
          if (status) {
            status.dataset.holdMessage = "true";
            status.textContent = t("theme_lab_token_nothing");
          }
          return;
        }
        publishOutput(win, "[data-theme-lab-token-output]", "[data-theme-lab-token-status]", tokenDeltaCss(currentTheme()));
        return;
      }
      if (event.target.closest("[data-theme-lab-new-build]") || event.target.closest("[data-theme-lab-new-copy]")) {
        const fields = newAppearanceFields(win);
        const status = win.querySelector("[data-theme-lab-new-status]");
        if (!fields.id || !fields.label || !fields.font) {
          if (status) status.textContent = t("theme_lab_new_incomplete");
          return;
        }
        if (window.AISystem6Theme?.themes?.some((entry) => entry.id === fields.id)) {
          if (status) status.textContent = t("theme_lab_new_exists", fields.id);
          return;
        }
        const text = newAppearanceChecklist(fields);
        const output = win.querySelector("[data-theme-lab-new-output]");
        if (event.target.closest("[data-theme-lab-new-copy]")) {
          publishOutput(win, "[data-theme-lab-new-output]", "[data-theme-lab-new-status]", text);
          return;
        }
        if (output) {
          output.textContent = text;
          output.hidden = false;
        }
        if (status) status.textContent = t("theme_lab_new_ready", fields.id);
      }
    });

    win.addEventListener("input", (event) => {
      const range = event.target.closest("[data-theme-lab-era-range]");
      if (range) {
        travelTo(nearestStop(Number(range.value) / 1000).theme.id, { commit: false });
        return;
      }
      const tokenInput = event.target.closest("[data-theme-lab-token-input]");
      if (tokenInput) {
        applyDraftToken(tokenInput.dataset.themeLabTokenInput, tokenInput.value);
        const row = tokenInput.closest("[data-theme-lab-token-row]");
        row?.classList.toggle("is-dirty", draftTokens.has(tokenInput.dataset.themeLabTokenInput));
        row?.querySelector(".theme-lab-token-swatch")?.style.setProperty("--theme-lab-swatch", tokenInput.value);
        const status = win.querySelector("[data-theme-lab-token-status]");
        if (status) {
          delete status.dataset.holdMessage;
          status.textContent = t("theme_lab_token_shown", win.querySelectorAll("[data-theme-lab-token-row]").length, draftTokens.size);
        }
        return;
      }
      if (event.target.closest("[data-theme-lab-token-search]")) renderTokenDesk(currentTheme());
    });

    // Release settles the knob onto the exact tick and commits that era once.
    win.addEventListener("change", (event) => {
      const range = event.target.closest("[data-theme-lab-era-range]");
      if (range) {
        const stop = nearestStop(Number(range.value) / 1000);
        range.value = String(Math.round(stop.t * 1000));
        travelTo(stop.theme.id, { commit: true });
        return;
      }
      if (event.target.closest("[data-theme-lab-token-scope]")) tokenScopeChosen = true;
      if (event.target.closest("[data-theme-lab-token-group]") || event.target.closest("[data-theme-lab-token-scope]")) {
        renderTokenDesk(currentTheme());
      }
    });
  }

  function fillRecipeBaseChoices(win) {
    const select = win.querySelector("[data-theme-lab-new-base]");
    if (!select || select.options.length) return;
    select.innerHTML = (window.AISystem6Theme?.themes || [])
      .map((entry) => `<option value="${escapeHtml(entry.id)}">${escapeHtml(t(entry.labelKey))}</option>`).join("");
  }

  // ------------------------------------------------------------------- sync --

  function render(theme) {
    const win = lab();
    if (!win || !theme) return;
    wire(win);
    buildTokenPanel(win);
    renderEraTimeline(theme);
    renderLineage(theme);
    fillRecipeBaseChoices(win);
    if (typeof initSystemSelectControls === "function") initSystemSelectControls();

    for (const [selector, value] of [
      ["[data-theme-lab-appearance]", theme.label],
      ["[data-theme-lab-font]", theme.systemFont],
      ["[data-theme-lab-font-size]", theme.systemFontSize],
    ]) {
      const target = win.querySelector(selector);
      if (target) target.textContent = String(value);
    }

    // Only the panel on screen keeps its content in the document. The object
    // lab alone is several hundred nodes, and every window observer walks them
    // on each appearance change. The capture hook opens every panel at once for
    // the snapshot and fidelity harnesses, which do want the whole atlas.
    const captureAll = win.dataset.themeLabCapture === "all";
    if (captureAll || activePanel === "objects") renderObjectLab(theme);
    else win.querySelector("[data-theme-lab-object-grid]")?.replaceChildren();
    if (captureAll || activePanel === "tokens") renderTokenDesk(theme);
    else win.querySelector("[data-theme-lab-token-table]")?.replaceChildren();
    buildIconSet(win);
    renderIconSet(theme);
  }

  // A draft belongs to one era's stylesheet block, so it does not survive an
  // era change: carrying it over would offer a Platinum value for pasting into
  // the Aqua file. Dropping it also puts the desktop back on shipped values.
  function sync(theme) {
    const next = theme || currentTheme();
    if (next && next.id !== lastRenderedThemeId) {
      lastRenderedThemeId = next.id;
      if (draftTokens.size) revertDraftTokens();
    }
    render(next);
  }

  function attach() {
    const win = lab();
    if (win?.dataset.themeLabCapture === "all") {
      for (const panel of win.querySelectorAll("[data-theme-lab-panel]")) panel.hidden = false;
    }
    render(currentTheme());
  }

  // The workbench markup is built from translated strings, so a language switch
  // rebuilds it rather than leaving the previous language's labels in place.
  function refreshLanguage() {
    tokenIndex = null;
    const win = lab();
    win?.querySelector('[data-theme-lab-panel="tokens"]')?.replaceChildren();
    render(currentTheme());
  }

  window.AISystem6ThemeLabLoaded = true;
  window.AISystem6ThemeLab = Object.freeze({ attach, sync, refreshLanguage, showPanel });
  window.AISystem6Runtime?.registerApplication({
    id: "themeLab",
    windowName: "themeLab",
    mount: attach,
    restore: attach,
    commands: {
      "open-theme-lab": {
        handler: () => openWindow("themeLab"),
        isAvailable: () => true,
      },
    },
  });
})();
