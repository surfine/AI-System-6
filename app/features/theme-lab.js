(function initThemeLabFeature() {
  "use strict";

  const coreIcons = Object.freeze([
    ["finderApp", "Finder / System"], ["folder", "Folder"],
    ["hardDisk", "Hard Disk"], ["trash", "Trash"],
    ["document", "Generic Document"], ["daHandler", "Generic Application"],
    ["fileFloppy", "Floppy Disk"], ["projectDisk", "Project Disk"],
    ["searcher", "Searcher"], ["teachText", "TeachText"],
    ["scrapbook", "Scrapbook"], ["assistant", "ClioTalk"],
  ]);
  const coreIds = new Set(coreIcons.map(([id]) => id));
  const platinumCoreIcons = Object.freeze([
    ["finderApp", "Finder / System"], ["folder", "Folder"],
    ["hardDisk", "Hard Disk"], ["trash", "Trash"],
    ["document", "Generic Document"], ["daHandler", "Generic Application"],
    ["fileFloppy", "Floppy Disk"], ["projectDisc", "CD"],
    ["controlPanel", "Control Panel"], ["systemFile", "System"],
    ["scrapbook", "Scrapbook"], ["clipboard", "Clipboard"],
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

  function ensureStructure(lab) {
    let section = lab.querySelector("[data-classic-icon-lab]");
    if (section) return section;
    lab.querySelector(".theme-lab-icon-set")?.insertAdjacentHTML("afterend", `
      <section class="theme-lab-group theme-lab-classic-icon-lab" data-classic-icon-lab hidden aria-labelledby="theme-lab-classic-icon-lab-title">
        <h3 id="theme-lab-classic-icon-lab-title">Classic Core Icon Lab</h3>
        <p class="theme-lab-classic-icon-intro">Twelve core Finder objects, checked at their authored 32 px and 16 px sizes. Selected icons use the same artwork and separate mask as the desktop.</p>
        <div class="theme-lab-classic-icon-key" aria-hidden="true"><span>12 objects</span><span>Finder states · 32 / 16</span><span>Choose any object for 1× / 2× / 4× / 8× inspection</span></div>
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
        <p class="theme-lab-classic-icon-intro">Twelve reviewed Mac OS 9 Finder objects. The 32 px and 16 px PNGs are independently composed from a fixed historical reference board.</p>
        <div class="theme-lab-classic-icon-key" aria-hidden="true"><span>12 accepted objects</span><span>Normal / Selected · 32 / 16</span><span>Nearest neighbor · 100% / 200% / 400%</span></div>
        <div class="theme-lab-classic-icon-grid" data-platinum-icon-lab-grid></div>
        <div class="theme-lab-classic-icon-inspector" data-platinum-icon-lab-inspector aria-live="polite"></div>
        <div class="theme-lab-classic-contexts" data-platinum-icon-lab-contexts aria-label="Platinum Finder context checks"></div>
      </section>`);
    section = lab.querySelector("[data-platinum-icon-lab]");
    return section;
  }

  function ensureAquaStructure(lab) {
    let section = lab.querySelector("[data-aqua-icon-lab]");
    if (section) return section;
    ensurePlatinumStructure(lab).insertAdjacentHTML("afterend", `
      <section class="theme-lab-group theme-lab-classic-icon-lab theme-lab-aqua-icon-lab" data-aqua-icon-lab hidden aria-labelledby="theme-lab-aqua-icon-lab-title">
        <h3 id="theme-lab-aqua-icon-lab-title">Aqua Core Icon Lab</h3>
        <p class="theme-lab-classic-icon-intro">Twelve reviewed Mac OS X 10.2 Jaguar objects. Every 128 px master, 32 px Finder image, and 16 px hint is independently composed; application art and toolbar art remain separate families.</p>
        <div class="theme-lab-classic-icon-key" aria-hidden="true"><span>12 accepted objects</span><span>Native 128 / 32 / 16</span><span>One light source · object-owned materials and shadows</span></div>
        <div class="theme-lab-classic-icon-grid" data-aqua-icon-lab-grid></div>
        <div class="theme-lab-classic-icon-inspector" data-aqua-icon-lab-inspector aria-live="polite"></div>
        <div class="theme-lab-classic-contexts" data-aqua-icon-lab-contexts aria-label="Jaguar Finder, Dock, desktop, and toolbar context checks"></div>
      </section>`);
    section = lab.querySelector("[data-aqua-icon-lab]");
    return section;
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
      <section class="theme-lab-classic-context is-desktop"><h4>Desktop</h4><div>${finderItem("projectDisk", labels.projectDisk)}${finderItem("trash", labels.trash, { selected: true })}</div></section>
      <section class="theme-lab-classic-context is-icon-view"><h4>Finder icon view</h4><div>${finderItem("folder", labels.folder)}${finderItem("teachText", labels.teachText, { selected: true })}${finderItem("scrapbook", labels.scrapbook)}${finderItem("assistant", labels.assistant)}</div></section>
      <section class="theme-lab-classic-context is-list-view"><h4>Finder list view · true 16 px</h4><div>${finderItem("document", labels.document, { sourceSize: 16, className: "is-list-row" })}${finderItem("searcher", labels.searcher, { selected: true, sourceSize: 16, className: "is-list-row" })}${finderItem("fileFloppy", labels.fileFloppy, { sourceSize: 16, className: "is-list-row" })}</div></section>`;
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
      <section class="theme-lab-classic-context is-light-desktop"><h4>Light desktop</h4><div>${finderItem("hardDisk", labels.hardDisk)}${finderItem("trash", labels.trash, { selected: true })}${finderItem("folder", labels.folder)}</div></section>
      <section class="theme-lab-classic-context is-medium-gray"><h4>Medium gray desktop</h4><div>${finderItem("finderApp", labels.finderApp)}${finderItem("projectDisc", labels.projectDisc, { selected: true })}${finderItem("scrapbook", labels.scrapbook)}</div></section>
      <section class="theme-lab-classic-context is-list-view"><h4>Finder list · true 16 px</h4><div>${finderItem("document", labels.document, { sourceSize: 16, className: "is-list-row" })}${finderItem("controlPanel", labels.controlPanel, { selected: true, sourceSize: 16, className: "is-list-row" })}${finderItem("clipboard", labels.clipboard, { sourceSize: 16, className: "is-list-row" })}</div></section>`;
  }

  function aquaFigure(id, sourceSize, displaySize = sourceSize, caption = `${sourceSize} px`) {
    return `<figure><img src="assets/themes/aqua/icons/${id}-${sourceSize}.png" width="${displaySize}" height="${displaySize}" alt="" data-native-size="${sourceSize}" /><figcaption>${caption}</figcaption></figure>`;
  }

  function aquaFinderItem(id, label, { sourceSize = 128, displaySize = sourceSize, selected = false, className = "" } = {}) {
    return `<button type="button" class="finder-item classic-icon-lab-finder-item${selected ? " is-selected" : ""}${className ? ` ${className}` : ""}" tabindex="-1"><img src="assets/themes/aqua/icons/${id}-${sourceSize}.png" width="${displaySize}" height="${displaySize}" alt="" data-native-size="${sourceSize}" /><span>${label}</span></button>`;
  }

  function populateAquaLab(lab) {
    const grid = lab.querySelector("[data-aqua-icon-lab-grid]");
    const inspector = lab.querySelector("[data-aqua-icon-lab-inspector]");
    const contexts = lab.querySelector("[data-aqua-icon-lab-contexts]");
    if (!grid || !inspector || !contexts || grid.childElementCount) return;
    grid.innerHTML = aquaCoreIcons.map(([id, label], index) => `
      <article class="theme-lab-classic-icon-card${index === 0 ? " is-inspected" : ""}" data-aqua-icon-id="${id}">
        <button class="theme-lab-classic-inspect" type="button" data-aqua-icon-inspect="${id}" aria-pressed="${index === 0}"><strong>${label}</strong><code>${id}</code></button>
        <div class="theme-lab-classic-icon-zooms">
          ${aquaFigure(id, 128)}${aquaFigure(id, 32)}${aquaFigure(id, 16)}
        </div>
      </article>`).join("");
    const showInspector = (id, label) => {
      inspector.innerHTML = `<h4>${label}<code>${id}</code></h4><div class="theme-lab-classic-icon-zooms">${aquaFigure(id, 128, 128, "128 native")}${aquaFigure(id, 32, 96, "32 · 3× inspection")}${aquaFigure(id, 16, 64, "16 · 4× inspection")}</div>`;
      for (const card of grid.querySelectorAll("[data-aqua-icon-id]")) {
        const selected = card.dataset.aquaIconId === id;
        card.classList.toggle("is-inspected", selected);
        card.querySelector("[data-aqua-icon-inspect]")?.setAttribute("aria-pressed", String(selected));
      }
    };
    grid.addEventListener("click", (event) => {
      const button = event.target.closest("[data-aqua-icon-inspect]");
      const entry = button && aquaCoreIcons.find(([id]) => id === button.dataset.aquaIconInspect);
      if (entry) showInspector(...entry);
    });
    showInspector(...aquaCoreIcons[0]);
    const labels = Object.fromEntries(aquaCoreIcons);
    contexts.innerHTML = `
      <section class="theme-lab-classic-context"><h4>Finder icon view · 128 px source</h4><div>${aquaFinderItem("folder", labels.folder, { displaySize: 64 })}${aquaFinderItem("hardDisk", labels.hardDisk, { displaySize: 64 })}${aquaFinderItem("teachText", labels.teachText, { displaySize: 64, selected: true })}</div></section>
      <section class="theme-lab-classic-context is-list-view"><h4>Finder list view · true 16 px</h4><div>${aquaFinderItem("document", labels.document, { sourceSize: 16, className: "is-list-row" })}${aquaFinderItem("searcher", labels.searcher, { sourceSize: 16, selected: true, className: "is-list-row" })}${aquaFinderItem("projectDisk", labels.projectDisk, { sourceSize: 16, className: "is-list-row" })}</div></section>
      <section class="theme-lab-classic-context"><h4>Dock-like large view · 128 px source</h4><div>${aquaFinderItem("finderApp", labels.finderApp, { displaySize: 72 })}${aquaFinderItem("searcher", labels.searcher, { displaySize: 72 })}${aquaFinderItem("assistant", labels.assistant, { displaySize: 72 })}</div></section>
      <section class="theme-lab-classic-context is-desktop"><h4>Desktop · native 32 px</h4><div>${aquaFinderItem("hardDisk", labels.hardDisk, { sourceSize: 32 })}${aquaFinderItem("projectDisk", labels.projectDisk, { sourceSize: 32, selected: true })}${aquaFinderItem("trash", labels.trash, { sourceSize: 32 })}</div></section>
      <section class="theme-lab-classic-context"><h4>Finder toolbar · separate 28 px family</h4><div><button class="theme-lab-toolbar-icon-button" type="button" tabindex="-1"><img src="assets/themes/aqua/toolbar-computer.svg" width="28" height="28" alt="" /><small>Computer</small></button><button class="theme-lab-toolbar-icon-button" type="button" tabindex="-1"><img src="assets/themes/aqua/toolbar-home.svg" width="28" height="28" alt="" /><small>Home</small></button><button class="theme-lab-toolbar-icon-button" type="button" tabindex="-1"><img src="assets/themes/aqua/toolbar-favorites.svg" width="28" height="28" alt="" /><small>Favorites</small></button><button class="theme-lab-toolbar-icon-button" type="button" tabindex="-1"><img src="assets/themes/aqua/toolbar-applications.svg" width="28" height="28" alt="" /><small>Applications</small></button></div></section>`;
  }

  function sync(theme) {
    const lab = document.querySelector('[data-window="themeLab"]');
    if (!lab || !theme) return;
    const section = ensureStructure(lab);
    const platinumSection = ensurePlatinumStructure(lab);
    const aquaSection = ensureAquaStructure(lab);
    [["[data-theme-lab-appearance]", theme.label], ["[data-theme-lab-font]", theme.systemFont], ["[data-theme-lab-font-size]", theme.systemFontSize]].forEach(([selector, value]) => {
      const target = lab.querySelector(selector);
      if (target) target.textContent = String(value);
    });
    if (section) {
      section.hidden = theme.id !== "classic";
      if (!section.hidden) populateClassicLab(lab);
    }
    if (platinumSection) {
      platinumSection.hidden = theme.id !== "platinum";
      if (!platinumSection.hidden) populatePlatinumLab(lab);
    }
    if (aquaSection) {
      aquaSection.hidden = theme.id !== "aqua";
      if (!aquaSection.hidden) populateAquaLab(lab);
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
          : theme.id === "aqua" && aquaCoreIds.has(id) ? `assets/themes/aqua/icons/${id}-16.png`
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
