(function initThemeLabFeature() {
  "use strict";

  const coreIcons = Object.freeze([
    ["finderApp", "Finder / System"], ["folder", "Folder"],
    ["hardDisk", "Hard Disk"], ["trash", "Trash"],
    ["document", "Generic Document"], ["daHandler", "Generic Application"],
    ["fileFloppy", "Floppy Disk"], ["projectDisk", "Project Disk"],
    ["searcher", "Searcher"], ["teachText", "TeachText"],
    ["scrapbook", "Scrapbook"], ["assistant", "ClioTalk"],
    ["controlPanel", "Control Panel"], ["reviewDesk", "Review Desk"],
    ["docMap", "DocMap"],
  ]);
  const coreIds = new Set(coreIcons.map(([id]) => id));
  const platinumCoreIcons = Object.freeze([
    ["finderApp", "Finder / System"], ["folder", "Folder"],
    ["hardDisk", "Hard Disk"], ["trash", "Trash"],
    ["document", "Generic Document"], ["daHandler", "Generic Application"],
    ["fileFloppy", "Floppy Disk"], ["projectDisc", "CD"],
    ["controlPanel", "Control Panel"], ["systemFile", "System"],
    ["scrapbook", "Scrapbook"], ["clipboard", "Clipboard"],
    ["assistant", "ClioTalk"],
    ["searcher", "Searcher"], ["teachText", "TeachText"],
    ["reviewDesk", "Review Desk"], ["docMap", "DocMap"],
    ["projectDisk", "Project Hard Disk"],
  ]);
  const platinumCoreIds = new Set(platinumCoreIcons.map(([id]) => id));
  const aquaCoreIcons = Object.freeze([
    ["finderApp", "Finder / System"], ["folder", "Folder"],
    ["hardDisk", "Hard Disk"], ["trash", "Trash"],
    ["document", "Generic Document"], ["daHandler", "Generic Application"],
    ["controlPanel", "System Preferences"], ["searcher", "Searcher"],
    ["teachText", "TeachText"], ["assistant", "ClioTalk"],
    ["scrapbook", "Scrapbook"], ["projectDisk", "Project Hard Disk"],
  ]);
  const aquaCoreIds = new Set(aquaCoreIcons.map(([id]) => id));
  const snowCoreIcons = Object.freeze([
    ["finderApp", "Finder / System"], ["folder", "Folder"],
    ["hardDisk", "Hard Disk"], ["trash", "Trash"],
    ["document", "Generic Document"], ["daHandler", "Generic Application"],
    ["controlPanel", "System Preferences"], ["searcher", "Searcher"],
    ["teachText", "TeachText"], ["assistant", "ClioTalk"],
    ["scrapbook", "Scrapbook"], ["reviewDesk", "Review Desk"],
    ["docMap", "DocMap"], ["projectDisk", "Project Hard Disk"],
  ]);
  const snowCoreIds = new Set(snowCoreIcons.map(([id]) => id));

  function ensureStructure(lab) {
    let section = lab.querySelector("[data-classic-icon-lab]");
    if (section) return section;
    lab.querySelector(".theme-lab-icon-set")?.insertAdjacentHTML("afterend", `
      <section class="theme-lab-group theme-lab-classic-icon-lab" data-classic-icon-lab hidden aria-labelledby="theme-lab-classic-icon-lab-title">
        <h3 id="theme-lab-classic-icon-lab-title">Classic System 6 Vector Lab</h3>
        <p class="theme-lab-classic-icon-intro">Fifteen representative Finder objects, reconstructed as smooth SVG from System 6 evidence and checked at independently hinted 32 px and 16 px sizes. Selected icons use the same artwork and separate mask as the desktop.</p>
        <div class="theme-lab-classic-icon-key" aria-hidden="true"><span>15 representative objects</span><span>Finder states · 32 / 16</span><span>Choose any object for smooth 1× / 2× / 4× / 8× inspection</span></div>
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
        <h3 id="theme-lab-platinum-icon-lab-title">Platinum Core Icon Lab</h3>
        <p class="theme-lab-classic-icon-intro">Eighteen reviewed Mac OS 9 Finder objects. The 32 px and 16 px PNGs are independently composed from a fixed historical reference board.</p>
        <div class="theme-lab-classic-icon-key" aria-hidden="true"><span>18 accepted objects</span><span>Normal / Selected · 32 / 16</span><span>Nearest neighbor · 100% / 200% / 400%</span></div>
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
      ${ctxBox("Finder list · true 16 px", `${finderItem("document", labels.document, { sourceSize: 16, className: "is-list-row" })}${finderItem("controlPanel", labels.controlPanel, { selected: true, sourceSize: 16, className: "is-list-row" })}${finderItem("clipboard", labels.clipboard, { sourceSize: 16, className: "is-list-row" })}`, " is-list-view")}`;
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
      inspector.innerHTML = `<h4>${label}<code>${id}</code></h4><div class="theme-lab-classic-icon-zooms">${config.inspect.map(([size, display, caption]) => figure(id, size, display, caption)).join("")}</div>`;
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
      intro: "Twelve reviewed Mac OS X 10.2 Jaguar objects. Runtime surfaces downscale the 128 px tier; this lab also preserves the separately processed 32 px and 16 px review artifacts. Application and toolbar art remain separate families.",
      keys: ["12 accepted objects", "Runtime 128 · review artifacts 32 / 16", "One light source · object-owned materials and shadows"],
      contextLabel: "Jaguar Finder, Dock, desktop, and toolbar context checks",
      icons: aquaCoreIcons,
      grid: [128, 32, 16],
      inspect: [[128, 128, "128 native"], [32, 96, "32 · 3× inspection"], [16, 64, "16 · 4× inspection"]],
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
      intro: "Fourteen reviewed Mac OS X 10.6.8 objects. Runtime surfaces downscale the 128 px tier. The 512 px texture source and separately processed 32 px and 16 px files remain review artifacts in this lab.",
      keys: ["14 accepted objects", "Runtime 128 · review artifacts 512 / 32 / 16", "One overhead light · object-owned material and shadow"],
      contextLabel: "Snow Leopard Finder, desktop, Dock, and source list context checks",
      icons: snowCoreIcons,
      grid: [128, 32, 16],
      inspect: [[512, 256, "512 master · 50%"], [128, 128, "128 native"], [32, 96, "32 · 3× inspection"], [16, 64, "16 · 4× inspection"]],
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
      intro: "Fourteen reviewed OS X 10.10 objects. Runtime surfaces downscale the 128 px tier; 64 px, 32 px, and 16 px remain separately processed review artifacts. The same objects are redrawn in flatter 2014 language.",
      keys: ["14 accepted objects", "Runtime 128 · review artifacts 64 / 32 / 16", "Free-form silhouettes · one metaphor per object across eras"],
      contextLabel: "Yosemite Finder, desktop, Dock, and sidebar context checks",
      icons: snowCoreIcons,
      grid: [128, 32, 16],
      inspect: [[128, 128, "128 native"], [64, 128, "64 · 2× inspection"], [32, 96, "32 · 3× inspection"], [16, 64, "16 · 4× inspection"]],
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
      intro: "Fourteen reviewed Tahoe 26 objects. Each one is a layer list plus a symbol; the renderer applies the material stack, so Default, Dark, and Clear are rendered from the same layers instead of filtered from one image.",
      keys: ["14 accepted objects", "Native 128 / 64 / 32 / 16", "Default / Dark / Clear · background is part of the material"],
      contextLabel: "Liquid Glass appearance, wallpaper, Dock, and Finder context checks",
      icons: snowCoreIcons,
      variant: "-default",
      grid: [128, 32, 16],
      inspect: [[128, 128, "128 native"], [64, 128, "64 · 2× inspection"], [32, 96, "32 · 3× inspection"], [16, 64, "16 · 4× inspection"]],
      after: (lab) => ensureRasterStructure(lab, rasterLabs[2]),
      contexts: (item, labels) => `
      ${ctxBox("Default appearance", `${["finderApp", "assistant", "searcher", "scrapbook", "trash"].map((id) => item(id, labels[id], { displaySize: 64 })).join("")}`, " theme-lab-glass-appearance is-default")}
      ${ctxBox("Dark appearance · dark desktop", `${["finderApp", "assistant", "searcher", "scrapbook", "trash"].map((id) => item(id, labels[id], { displaySize: 64, variant: "-dark" })).join("")}`, " theme-lab-glass-appearance is-dark")}
      ${ctxBox("Clear appearance · photographic desktop", `${["finderApp", "assistant", "searcher", "scrapbook", "trash"].map((id) => item(id, labels[id], { displaySize: 64, variant: "-clear" })).join("")}`, " theme-lab-glass-appearance is-clear")}
      ${ctxBox("High-frequency background · Default", `${["folder", "document", "projectDisk", "controlPanel", "docMap"].map((id) => item(id, labels[id], { displaySize: 64 })).join("")}`, " theme-lab-glass-appearance is-busy")}
      ${ctxBox("Dock-like large view · 128 px source", `${item("finderApp", labels.finderApp, { displaySize: 72 })}${item("teachText", labels.teachText, { displaySize: 72 })}${item("reviewDesk", labels.reviewDesk, { displaySize: 72 })}${item("daHandler", labels.daHandler, { displaySize: 72 })}`, "")}
      ${ctxBox("Finder list view · true 16 px", `${item("document", labels.document, { sourceSize: 16, className: "is-list-row" })}${item("folder", labels.folder, { sourceSize: 16, selected: true, className: "is-list-row" })}${item("trash", labels.trash, { sourceSize: 16, className: "is-list-row" })}`, " is-list-view")}
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
