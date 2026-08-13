(function initThemeLabFeature() {
  "use strict";

  const coreIcons = Object.freeze([
    ["finderApp", "Finder / System"], ["multiFinderApp", "MultiFinder"],
    ["folder", "Folder"],
    ["hardDisk", "Hard Disk"], ["trash", "Trash"],
    ["document", "Generic Document"],
    ["fileFloppy", "Floppy Disk"], ["projectDisk", "Project Disk"],
    ["projectDisc", "Project CD"],
    ["searcher", "Searcher"], ["teachText", "TeachText"],
    ["scrapbook", "Scrapbook"], ["assistant", "ClioTalk"],
    ["controlPanel", "Control / Settings"], ["reviewDesk", "Review Desk"],
    ["docMap", "DocMap"],
  ]);
  const coreIds = new Set(coreIcons.map(([id]) => id));
  const platinumCoreIcons = coreIcons;
  const platinumCoreIds = new Set(platinumCoreIcons.map(([id]) => id));
  const aquaCoreIcons = coreIcons;
  const aquaCoreIds = new Set(aquaCoreIcons.map(([id]) => id));
  const snowCoreIcons = coreIcons;
  const snowCoreIds = new Set(snowCoreIcons.map(([id]) => id));

  function ensureStructure(lab) {
    let section = lab.querySelector("[data-classic-icon-lab]");
    if (section) return section;
    lab.querySelector(".theme-lab-icon-set")?.insertAdjacentHTML("afterend", `
      <section class="theme-lab-group theme-lab-classic-icon-lab" data-classic-icon-lab hidden aria-labelledby="theme-lab-classic-icon-lab-title">
        <h3 id="theme-lab-classic-icon-lab-title">Classic Priority Lineage Lab</h3>
        <p class="theme-lab-classic-icon-intro">Sixteen priority objects shown from the smooth Retina SVG family. Finder is reference-validated against a separate exact one-bit evidence layer. MultiFinder is a historically reviewed class-C current-era Finder identity plus multiplicity, not a native replica.</p>
        <div class="theme-lab-classic-icon-key" aria-hidden="true"><span>16 priority objects</span><span>Runtime 32 / 16 · separate masks</span><span>Finder reference-validated · MultiFinder class C</span></div>
        <div class="theme-lab-classic-icon-grid" data-classic-icon-lab-grid></div>
        <div class="theme-lab-classic-icon-inspector" data-classic-icon-lab-inspector aria-live="polite"></div>
        <div class="theme-lab-classic-contexts" data-classic-icon-lab-contexts aria-label="Classic Finder context checks"></div>
      </section>`);
    section = lab.querySelector("[data-classic-icon-lab]");
    return section;
  }

  function ensurePlatinumStructure(lab) {
    let section = lab.querySelector("[data-platinum-icon-lab]");
    if (section) return section;
    ensureStructure(lab).insertAdjacentHTML("afterend", `
      <section class="theme-lab-group theme-lab-classic-icon-lab theme-lab-platinum-icon-lab" data-platinum-icon-lab hidden aria-labelledby="theme-lab-platinum-icon-lab-title">
        <h3 id="theme-lab-platinum-icon-lab-title">Platinum Priority Lineage Lab</h3>
        <p class="theme-lab-classic-icon-intro">Sixteen priority Mac OS 9 objects from the official accepted ImageGen family plus the approved Finder-lineage overlay. Finder is reference-validated; MultiFinder is a historically reviewed class-C construction. Their 42/32/16 files are direct optical runtime assets; other objects retain their recorded size provenance.</p>
        <div class="theme-lab-classic-icon-key" aria-hidden="true"><span>16 priority objects</span><span>Finder lineage · optical 42 / 32 / 16</span><span>Finder reference-validated · MultiFinder class C</span></div>
        <div class="theme-lab-classic-icon-grid" data-platinum-icon-lab-grid></div>
        <div class="theme-lab-classic-icon-inspector" data-platinum-icon-lab-inspector aria-live="polite"></div>
        <div class="theme-lab-classic-contexts" data-platinum-icon-lab-contexts aria-label="Platinum Finder context checks"></div>
      </section>`);
    section = lab.querySelector("[data-platinum-icon-lab]");
    return section;
  }

  // Aqua and Snow Leopard both review raster PNG cores, so they share one lab
  // shell. Everything era-specific stays as data in rasterLabs below.
  function ensureRasterStructure(lab, config) {
    let section = lab.querySelector(`[data-raster-icon-lab="${config.theme}"]`);
    if (section) return section;
    config.after(lab).insertAdjacentHTML("afterend", `
      <section class="theme-lab-group theme-lab-classic-icon-lab ${config.className}" data-raster-icon-lab="${config.theme}" hidden aria-labelledby="theme-lab-${config.theme}-icon-lab-title">
        <h3 id="theme-lab-${config.theme}-icon-lab-title">${config.title}</h3>
        <p class="theme-lab-classic-icon-intro">${config.intro}</p>
        <div class="theme-lab-classic-icon-key" aria-hidden="true">${config.keys.map((key) => `<span>${key}</span>`).join("")}</div>
        <div class="theme-lab-classic-icon-grid" data-raster-icon-lab-grid></div>
        <div class="theme-lab-classic-icon-inspector" data-raster-icon-lab-inspector aria-live="polite"></div>
        <div class="theme-lab-classic-contexts" data-raster-icon-lab-contexts aria-label="${config.contextLabel}"></div>
      </section>`);
    return lab.querySelector(`[data-raster-icon-lab="${config.theme}"]`);
  }

  function finderItem(id, label, { selected = false, sourceSize = 32, className = "" } = {}) {
    return `<button type="button" class="finder-item classic-icon-lab-finder-item${selected ? " is-selected" : ""}${className ? ` ${className}` : ""}" tabindex="-1">${renderSystemIcon(id, {
      size: sourceSize === 16 ? "classic-lab-16" : "classic-lab-32",
      sourceSize,
    })}<span>${label}</span></button>`;
  }

  function populateClassicLab(lab) {
    const grid = lab.querySelector("[data-classic-icon-lab-grid]");
    const inspector = lab.querySelector("[data-classic-icon-lab-inspector]");
    const contexts = lab.querySelector("[data-classic-icon-lab-contexts]");
    if (!grid || !inspector || !contexts || grid.childElementCount) return;
    grid.innerHTML = coreIcons.map(([id, label], index) => `
      <article class="theme-lab-classic-icon-card${index === 0 ? " is-inspected" : ""}" data-classic-icon-id="${id}">
        <button class="theme-lab-classic-inspect" type="button" data-classic-icon-inspect="${id}" aria-pressed="${index === 0}"><strong>${label}</strong><code>${id}</code></button>
        <div class="theme-lab-classic-icon-states">
          ${finderItem(id, "32 Normal")}${finderItem(id, "32 Selected", { selected: true })}
          ${finderItem(id, "16 Normal", { sourceSize: 16 })}${finderItem(id, "16 Selected", { selected: true, sourceSize: 16 })}
        </div>
      </article>`).join("");
    const showInspector = (id, label) => {
      const zooms = [32, 64, 128, 256].map((size, index) => `<figure><img src="assets/themes/classic/icons/${id}-32.svg" width="${size}" height="${size}" alt="" /><figcaption>${2 ** index}×</figcaption></figure>`).join("");
      inspector.innerHTML = `<h4>${label}<code>${id}</code></h4><div class="theme-lab-classic-icon-zooms">${zooms}</div>`;
      for (const card of grid.querySelectorAll("[data-classic-icon-id]")) {
        const selected = card.dataset.classicIconId === id;
        card.classList.toggle("is-inspected", selected);
        card.querySelector("[data-classic-icon-inspect]")?.setAttribute("aria-pressed", String(selected));
      }
    };
    grid.addEventListener("click", (event) => {
      const button = event.target.closest("[data-classic-icon-inspect]");
      const entry = button && coreIcons.find(([id]) => id === button.dataset.classicIconInspect);
      if (entry) showInspector(...entry);
    });
    showInspector(...coreIcons[0]);
    const labels = Object.fromEntries(coreIcons);
    contexts.innerHTML = `
      ${ctxBox("Desktop", `${finderItem("projectDisk", labels.projectDisk)}${finderItem("trash", labels.trash, { selected: true })}`, " is-desktop")}
      ${ctxBox("Finder icon view", `${finderItem("folder", labels.folder)}${finderItem("teachText", labels.teachText, { selected: true })}${finderItem("scrapbook", labels.scrapbook)}${finderItem("assistant", labels.assistant)}`, " is-icon-view")}
      ${ctxBox("Finder list view · true 16 px", `${finderItem("document", labels.document, { sourceSize: 16, className: "is-list-row" })}${finderItem("searcher", labels.searcher, { selected: true, sourceSize: 16, className: "is-list-row" })}${finderItem("fileFloppy", labels.fileFloppy, { sourceSize: 16, className: "is-list-row" })}`, " is-list-view")}`;
  }

  function populatePlatinumLab(lab) {
    const grid = lab.querySelector("[data-platinum-icon-lab-grid]");
    const inspector = lab.querySelector("[data-platinum-icon-lab-inspector]");
    const contexts = lab.querySelector("[data-platinum-icon-lab-contexts]");
    if (!grid || !inspector || !contexts || grid.childElementCount) return;
    grid.innerHTML = platinumCoreIcons.map(([id, label], index) => `
      <article class="theme-lab-classic-icon-card${index === 0 ? " is-inspected" : ""}" data-platinum-icon-id="${id}">
        <button class="theme-lab-classic-inspect" type="button" data-platinum-icon-inspect="${id}" aria-pressed="${index === 0}"><strong>${label}</strong><code>${id}</code></button>
        <div class="theme-lab-classic-icon-states">
          ${finderItem(id, "32 Normal")}${finderItem(id, "32 Selected", { selected: true })}
          ${finderItem(id, "16 Normal", { sourceSize: 16 })}${finderItem(id, "16 Selected", { selected: true, sourceSize: 16 })}
        </div>
      </article>`).join("");
    const showInspector = (id, label) => {
      const zooms = [32, 64, 128].map((size, index) => `<figure><img src="assets/themes/platinum/icons/${id}-32.png" width="${size}" height="${size}" alt="" /><figcaption>${[100, 200, 400][index]}%</figcaption></figure>`).join("");
      inspector.innerHTML = `<h4>${label}<code>${id}</code></h4><div class="theme-lab-classic-icon-zooms">${zooms}</div>`;
      for (const card of grid.querySelectorAll("[data-platinum-icon-id]")) {
        const selected = card.dataset.platinumIconId === id;
        card.classList.toggle("is-inspected", selected);
        card.querySelector("[data-platinum-icon-inspect]")?.setAttribute("aria-pressed", String(selected));
      }
    };
    grid.addEventListener("click", (event) => {
      const button = event.target.closest("[data-platinum-icon-inspect]");
      const entry = button && platinumCoreIcons.find(([id]) => id === button.dataset.platinumIconInspect);
      if (entry) showInspector(...entry);
    });
    showInspector(...platinumCoreIcons[0]);
    const labels = Object.fromEntries(platinumCoreIcons);
    contexts.innerHTML = `
      ${ctxBox("Light desktop", `${finderItem("hardDisk", labels.hardDisk)}${finderItem("trash", labels.trash, { selected: true })}${finderItem("folder", labels.folder)}`, " is-light-desktop")}
      ${ctxBox("Medium gray desktop", `${finderItem("finderApp", labels.finderApp)}${finderItem("projectDisc", labels.projectDisc, { selected: true })}${finderItem("scrapbook", labels.scrapbook)}`, " is-medium-gray")}
      ${ctxBox("Finder list · 16 px derivative", `${finderItem("document", labels.document, { sourceSize: 16, className: "is-list-row" })}${finderItem("controlPanel", labels.controlPanel, { selected: true, sourceSize: 16, className: "is-list-row" })}${finderItem("fileFloppy", labels.fileFloppy, { sourceSize: 16, className: "is-list-row" })}`, " is-list-view")}`;
  }

  // `variant` carries the Liquid Glass appearance suffix; the older eras have
  // one file per size and pass an empty string.
  function labFigure(dir, id, source, display = source, caption = `${source} px`, variant = "") {
    return `<figure><img src="assets/themes/${dir}/icons/${id}-${source}${variant}.png" width="${display}" height="${display}" alt="" data-native-size="${source}" /><figcaption>${caption}</figcaption></figure>`;
  }

  const ctxBox = (title, body, cls = "") => `<section class="theme-lab-classic-context${cls}"><h4>${title}</h4><div>${body}</div></section>`;
  const toolbarNote = (era) => `<section class="theme-lab-classic-context"><h4>Toolbar family</h4><p class="theme-lab-classic-icon-intro">${era} states toolbar and sidebar art as a separate small family. It is not drawn yet, and Finder artwork is never scaled down to stand in for it.</p></section>`;

  function labFinderItem(dir, id, label, { sourceSize = 128, displaySize = sourceSize, selected = false, className = "", variant = "" } = {}) {
    return `<button type="button" class="finder-item classic-icon-lab-finder-item${selected ? " is-selected" : ""}${className ? ` ${className}` : ""}" tabindex="-1"><img src="assets/themes/${dir}/icons/${id}-${sourceSize}${variant}.png" width="${displaySize}" height="${displaySize}" alt="" data-native-size="${sourceSize}" /><span>${label}</span></button>`;
  }

  function populateRasterLab(lab, config) {
    const section = lab.querySelector(`[data-raster-icon-lab="${config.theme}"]`);
    const grid = section?.querySelector("[data-raster-icon-lab-grid]");
    const inspector = section?.querySelector("[data-raster-icon-lab-inspector]");
    const contexts = section?.querySelector("[data-raster-icon-lab-contexts]");
    if (!grid || !inspector || !contexts || grid.childElementCount) return;
    const figure = (id, source, display, caption) => labFigure(config.dir, id, source, display, caption, config.variant || "");
    grid.innerHTML = config.icons.map(([id, label], index) => `
      <article class="theme-lab-classic-icon-card${index === 0 ? " is-inspected" : ""}" data-raster-icon-id="${id}">
        <button class="theme-lab-classic-inspect" type="button" data-raster-icon-inspect="${id}" aria-pressed="${index === 0}"><strong>${label}</strong><code>${id}</code></button>
        <div class="theme-lab-classic-icon-zooms">${config.grid.map((size) => figure(id, size)).join("")}</div>
      </article>`).join("");
    const showInspector = (id, label) => {
      const isApprovedFinderLineage = id === "finderApp" || id === "multiFinderApp";
      const captionFor = (caption) => isApprovedFinderLineage
        ? caption.replace("derivative", "optical runtime")
        : caption;
      inspector.innerHTML = `<h4>${label}<code>${id}</code></h4><div class="theme-lab-classic-icon-zooms">${config.inspect.map(([size, display, caption]) => figure(id, size, display, captionFor(caption))).join("")}</div>`;
      for (const card of grid.querySelectorAll("[data-raster-icon-id]")) {
        const selected = card.dataset.rasterIconId === id;
        card.classList.toggle("is-inspected", selected);
        card.querySelector("[data-raster-icon-inspect]")?.setAttribute("aria-pressed", String(selected));
      }
    };
    // The listener is attached once for the life of the section, because the
    // grid is emptied and refilled whenever the appearance changes.
    if (grid.dataset.wired !== "true") {
      grid.dataset.wired = "true";
      grid.addEventListener("click", (event) => {
        const button = event.target.closest("[data-raster-icon-inspect]");
        const entry = button && config.icons.find(([id]) => id === button.dataset.rasterIconInspect);
        if (entry) showInspector(...entry);
      });
    }
    showInspector(...config.icons[0]);
    contexts.innerHTML = config.contexts(
      (id, label, options = {}) => labFinderItem(config.dir, id, label, { variant: config.variant || "", ...options }),
      Object.fromEntries(config.icons),
    );
  }

  const rasterLabs = Object.freeze([
    {
      theme: "aqua",
      dir: "aqua",
      className: "theme-lab-aqua-icon-lab",
      title: "Aqua Core Icon Lab",
      intro: "Sixteen priority Mac OS X 10.2 Jaguar objects from the official accepted-generated family plus the approved Finder-lineage overlay. Runtime dispatches 16 px art to compact/menu/list contexts, 32 px art to ordinary contexts, and 128 px art to desktop/large contexts; the rebuilt sprite is compatibility evidence, not the active renderer. Finder is reference-validated and MultiFinder is class C; their compact files are direct optical runtime assets, while other objects retain derivative tiers.",
      keys: ["16 priority objects", "Runtime · contextual 16 / 32 / 128", "Finder reference-validated · MultiFinder class C"],
      contextLabel: "Jaguar Finder, Dock, desktop, and toolbar context checks",
      icons: aquaCoreIcons,
      grid: [128, 32, 16],
      inspect: [[128, 128, "128 desktop source"], [32, 96, "32 ordinary source · 3×"], [16, 64, "16 compact source · 4×"]],
      after: (lab) => ensurePlatinumStructure(lab),
      contexts: (item, labels) => `
      ${ctxBox("Finder icon view · 128 px source", `${item("folder", labels.folder, { displaySize: 64 })}${item("hardDisk", labels.hardDisk, { displaySize: 64 })}${item("teachText", labels.teachText, { displaySize: 64, selected: true })}`, "")}
      ${ctxBox("Finder list review · 16 px artifact", `${item("document", labels.document, { sourceSize: 16, className: "is-list-row" })}${item("searcher", labels.searcher, { sourceSize: 16, selected: true, className: "is-list-row" })}${item("projectDisk", labels.projectDisk, { sourceSize: 16, className: "is-list-row" })}`, " is-list-view")}
      ${ctxBox("Dock-like large view · 128 px source", `${item("finderApp", labels.finderApp, { displaySize: 72 })}${item("searcher", labels.searcher, { displaySize: 72 })}${item("assistant", labels.assistant, { displaySize: 72 })}`, "")}
      ${ctxBox("Desktop review · 32 px artifact", `${item("hardDisk", labels.hardDisk, { sourceSize: 32 })}${item("projectDisk", labels.projectDisk, { sourceSize: 32, selected: true })}${item("trash", labels.trash, { sourceSize: 32 })}`, " is-desktop")}
      ${ctxBox("Finder toolbar · separate 28 px family", `${["computer:Computer", "home:Home", "favorites:Favorites", "applications:Applications"].map((pair) => pair.split(":")).map(([id, name]) => `<button class="theme-lab-toolbar-icon-button" type="button" tabindex="-1"><img src="assets/themes/aqua/toolbar-${id}.svg" width="28" height="28" alt="" /><small>${name}</small></button>`).join("")}`, "")}`,
    },
    {
      theme: "snow-leopard",
      dir: "snow-leopard",
      className: "theme-lab-snow-icon-lab",
      title: "Snow Leopard Core Icon Lab",
      intro: "Sixteen priority Mac OS X 10.6.8 objects from the official accepted-generated family plus the approved Finder-lineage overlay. Runtime dispatches 16 px art to compact/menu/list contexts, 32 px art to ordinary contexts, and 128 px art to desktop/large contexts; the rebuilt sprite is compatibility evidence, not the active renderer. Finder is reference-validated and MultiFinder is class C; their 512/128/32/16 files are direct optical assets, while other objects retain same-master derivatives.",
      keys: ["16 priority objects", "Runtime · contextual 16 / 32 / 128", "Finder reference-validated · MultiFinder class C"],
      contextLabel: "Snow Leopard Finder, desktop, Dock, and source list context checks",
      icons: snowCoreIcons,
      grid: [128, 32, 16],
      inspect: [[512, 256, "512 review tier · 50%"], [128, 128, "128 desktop source"], [32, 96, "32 ordinary source · 3×"], [16, 64, "16 compact source · 4×"]],
      after: (lab) => ensureRasterStructure(lab, rasterLabs[0]),
      contexts: (item, labels) => `
      ${ctxBox("Finder icon view · 128 px source", `${item("folder", labels.folder, { displaySize: 64 })}${item("hardDisk", labels.hardDisk, { displaySize: 64 })}${item("teachText", labels.teachText, { displaySize: 64, selected: true })}${item("reviewDesk", labels.reviewDesk, { displaySize: 64 })}`, "")}
      ${ctxBox("Finder list review · 16 px artifact", `${item("document", labels.document, { sourceSize: 16, className: "is-list-row" })}${item("searcher", labels.searcher, { sourceSize: 16, selected: true, className: "is-list-row" })}${item("docMap", labels.docMap, { sourceSize: 16, className: "is-list-row" })}`, " is-list-view")}
      ${ctxBox("Dock-like large view · 128 px source", `${item("finderApp", labels.finderApp, { displaySize: 72 })}${item("assistant", labels.assistant, { displaySize: 72 })}${item("controlPanel", labels.controlPanel, { displaySize: 72 })}${item("scrapbook", labels.scrapbook, { displaySize: 72 })}`, "")}
      ${ctxBox("Desktop review · 32 px artifact", `${item("hardDisk", labels.hardDisk, { sourceSize: 32 })}${item("projectDisk", labels.projectDisk, { sourceSize: 32, selected: true })}${item("trash", labels.trash, { sourceSize: 32 })}`, " is-desktop")}
      ${ctxBox("Source-list review · 16 px artifact", `${item("projectDisk", labels.projectDisk, { sourceSize: 16, className: "is-list-row" })}${item("folder", labels.folder, { sourceSize: 16, className: "is-list-row" })}${item("scrapbook", labels.scrapbook, { sourceSize: 16, className: "is-list-row" })}${item("trash", labels.trash, { sourceSize: 16, className: "is-list-row" })}`, " is-list-view")}
      ${toolbarNote("Snow Leopard")}`,
    },
    {
      theme: "yosemite",
      dir: "yosemite",
      className: "theme-lab-yosemite-icon-lab",
      title: "Yosemite Core Icon Lab",
      intro: "Sixteen priority OS X 10.10 objects from the broad generated family plus reviewed lineage overlays. Runtime dispatches 16 px art to compact/menu/list contexts, 32 px art to ordinary contexts, and 128 px art to desktop/large contexts. Finder is reference-validated; MultiFinder is class C, and their 128/64/32/16 files are direct optical assets. Review Desk, Searcher, and ClioTalk use historically reviewed era-specific replacements with optical compact art, without native-replica claims.",
      keys: ["16 priority objects", "Runtime · contextual 16 / 32 / 128", "Finder A · MultiFinder C · ClioTalk B"],
      contextLabel: "Yosemite Finder, desktop, Dock, and sidebar context checks",
      icons: snowCoreIcons,
      grid: [128, 32, 16],
      inspect: [[128, 128, "128 desktop source"], [64, 128, "64 explicit review tier · 2×"], [32, 96, "32 ordinary source · 3×"], [16, 64, "16 compact source · 4×"]],
      after: (lab) => ensureRasterStructure(lab, rasterLabs[1]),
      contexts: (item, labels) => `
      ${ctxBox("Finder icon view · 128 px source", `${item("folder", labels.folder, { displaySize: 64 })}${item("document", labels.document, { displaySize: 64 })}${item("teachText", labels.teachText, { displaySize: 64, selected: true })}${item("docMap", labels.docMap, { displaySize: 64 })}`, "")}
      ${ctxBox("Finder list review · 16 px artifact", `${item("document", labels.document, { sourceSize: 16, className: "is-list-row" })}${item("searcher", labels.searcher, { sourceSize: 16, selected: true, className: "is-list-row" })}${item("reviewDesk", labels.reviewDesk, { sourceSize: 16, className: "is-list-row" })}`, " is-list-view")}
      ${ctxBox("Dock-like large view · 128 px source", `${item("finderApp", labels.finderApp, { displaySize: 72 })}${item("assistant", labels.assistant, { displaySize: 72 })}${item("controlPanel", labels.controlPanel, { displaySize: 72 })}${item("scrapbook", labels.scrapbook, { displaySize: 72 })}`, "")}
      ${ctxBox("Desktop review · 64 px artifact", `${item("hardDisk", labels.hardDisk, { sourceSize: 64 })}${item("projectDisk", labels.projectDisk, { sourceSize: 64, selected: true })}${item("trash", labels.trash, { sourceSize: 64 })}`, " is-desktop")}
      ${ctxBox("Sidebar review · 16 px artifact", `${item("projectDisk", labels.projectDisk, { sourceSize: 16, className: "is-list-row" })}${item("folder", labels.folder, { sourceSize: 16, className: "is-list-row" })}${item("scrapbook", labels.scrapbook, { sourceSize: 16, className: "is-list-row" })}${item("trash", labels.trash, { sourceSize: 16, className: "is-list-row" })}`, " is-list-view")}
      ${toolbarNote("Yosemite")}`,
    },
    {
      theme: "liquid-glass",
      dir: "liquid-glass",
      className: "theme-lab-glass-icon-lab",
      title: "Liquid Glass Core Icon Lab",
      intro: "Sixteen priority Tahoe 26 objects from the broad ImageGen family plus reviewed lineage overlays. Default runtime art dispatches context-owned 16, 32, or 128 px files; 64 px and Dark/Clear are explicit review or appearance tiers. Finder is reference-validated with base/panel/ink source layers; MultiFinder is class C. Finder, Review Desk, and ClioTalk own direct optical constructions and independently audited semantic layers, while the other 52 icons remain baked and derivative.",
      keys: ["16 priority objects", "Finder / Review Desk / ClioTalk · layered", "Finder A · MultiFinder C · ClioTalk B"],
      contextLabel: "Liquid Glass appearance, wallpaper, Dock, and Finder context checks",
      icons: snowCoreIcons,
      variant: "-default",
      grid: [128, 32, 16],
      inspect: [[128, 128, "128 desktop · Default"], [64, 128, "64 explicit review tier · 2×"], [32, 96, "32 ordinary · Default · 3×"], [16, 64, "16 compact · Default · 4×"]],
      after: (lab) => ensureRasterStructure(lab, rasterLabs[2]),
      contexts: (item, labels) => `
      ${ctxBox("Default appearance", `${["finderApp", "assistant", "searcher", "scrapbook", "trash"].map((id) => item(id, labels[id], { displaySize: 64 })).join("")}`, " theme-lab-glass-appearance is-default")}
      ${ctxBox("Dark appearance · dark desktop", `${["finderApp", "assistant", "searcher", "scrapbook", "trash"].map((id) => item(id, labels[id], { displaySize: 64, variant: "-dark" })).join("")}`, " theme-lab-glass-appearance is-dark")}
      ${ctxBox("Clear appearance · photographic desktop", `${["finderApp", "assistant", "searcher", "scrapbook", "trash"].map((id) => item(id, labels[id], { displaySize: 64, variant: "-clear" })).join("")}`, " theme-lab-glass-appearance is-clear")}
      ${ctxBox("High-frequency background · Default", `${["folder", "document", "projectDisk", "controlPanel", "docMap"].map((id) => item(id, labels[id], { displaySize: 64 })).join("")}`, " theme-lab-glass-appearance is-busy")}
      ${ctxBox("Dock-like large view · 128 px source", `${item("finderApp", labels.finderApp, { displaySize: 72 })}${item("multiFinderApp", labels.multiFinderApp, { displaySize: 72 })}${item("teachText", labels.teachText, { displaySize: 72 })}${item("reviewDesk", labels.reviewDesk, { displaySize: 72 })}`, "")}
      ${ctxBox("Finder list view · 16 px derivative review", `${item("document", labels.document, { sourceSize: 16, className: "is-list-row" })}${item("folder", labels.folder, { sourceSize: 16, selected: true, className: "is-list-row" })}${item("trash", labels.trash, { sourceSize: 16, className: "is-list-row" })}`, " is-list-view")}
      ${toolbarNote("Tahoe 26")}`,
    },
  ]);


  // Only the appearance on screen keeps its laboratory in the document. Six
  // populated labs is several thousand nodes inside one window, and every one
  // of them is walked by the window observers on each theme change.
  function releaseLab(section) {
    if (!section) return;
    for (const selector of ["[data-raster-icon-lab-grid]", "[data-raster-icon-lab-inspector]", "[data-raster-icon-lab-contexts]",
      "[data-classic-icon-lab-grid]", "[data-classic-icon-lab-inspector]", "[data-classic-icon-lab-contexts]",
      "[data-platinum-icon-lab-grid]", "[data-platinum-icon-lab-inspector]", "[data-platinum-icon-lab-contexts]"]) {
      const target = section.querySelector(selector);
      if (target && target.childElementCount) target.replaceChildren();
    }
  }

  function sync(theme) {
    const lab = document.querySelector('[data-window="themeLab"]');
    if (!lab || !theme) return;
    const section = ensureStructure(lab);
    const platinumSection = ensurePlatinumStructure(lab);
    const rasterSections = rasterLabs.map((config) => [config, ensureRasterStructure(lab, config)]);
    [["[data-theme-lab-appearance]", theme.label], ["[data-theme-lab-font]", theme.systemFont], ["[data-theme-lab-font-size]", theme.systemFontSize]].forEach(([selector, value]) => {
      const target = lab.querySelector(selector);
      if (target) target.textContent = String(value);
    });
    if (section) {
      section.hidden = theme.id !== "classic";
      if (section.hidden) releaseLab(section); else populateClassicLab(lab);
    }
    if (platinumSection) {
      platinumSection.hidden = theme.id !== "platinum";
      if (platinumSection.hidden) releaseLab(platinumSection); else populatePlatinumLab(lab);
    }
    for (const [config, rasterSection] of rasterSections) {
      if (!rasterSection) continue;
      rasterSection.hidden = theme.id !== config.theme;
      if (rasterSection.hidden) releaseLab(rasterSection); else populateRasterLab(lab, config);
    }
    for (const tile of lab.querySelectorAll(".theme-lab-icon-tile")) {
      const previous = tile.querySelector(".theme-lab-icon-hint");
      const id = tile.querySelector(".sys-icon[data-system-icon]")?.dataset.systemIcon;
      if (!id || (theme.id === "classic" && !coreIds.has(id))) {
        previous?.remove();
        continue;
      }
      const stem = (theme.id === "platinum" || theme.id === "yosemite") && id === "startupDisk" ? "startup-disk"
        : (theme.id === "platinum" || theme.id === "yosemite") && id === "finderApp" ? "finder-app"
          : theme.id === "platinum" && id === "fileFloppy" ? "floppy" : id;
      const hint = previous || document.createElement("img");
      hint.className = "theme-lab-icon-hint";
      hint.width = 16;
      hint.height = 16;
      hint.alt = "";
      hint.src = theme.id === "classic" ? `assets/themes/classic/icons/${stem}-16.svg`
        : theme.id === "platinum" && platinumCoreIds.has(id) ? `assets/themes/platinum/icons/${id}-16.png`
          : ["aqua", "snow-leopard", "yosemite"].includes(theme.id) ? `assets/themes/${theme.id}/icons/${id}-16.png`
            : theme.id === "liquid-glass" ? `assets/themes/liquid-glass/icons/${id}-16-default.png`
              : `assets/themes/${theme.id}/${stem}-16.svg`;
      hint.dataset.nativeSize = "16";
      if (!previous) tile.append(hint);
    }
  }

  function attach() {
    sync(window.AISystem6Theme?.getTheme?.());
  }

  window.AISystem6ThemeLabLoaded = true;
  window.AISystem6ThemeLab = Object.freeze({ attach, sync });
})();
