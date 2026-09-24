// After hours: four shelves behind one segmented control. Without JavaScript
// the four panels simply stack, each under its own heading, so nothing is
// hidden from a reader who never runs this file.

const doc = document;

export function initMore(section) {
  if (!section) return;
  const bar = section.querySelector(".more-switch");
  const tabs = bar ? [...bar.querySelectorAll("[data-panel]")] : [];
  const panels = tabs.map((tab) => doc.getElementById(tab.dataset.panel)).filter(Boolean);
  if (!bar || panels.length !== tabs.length) return;

  function show(id, focus) {
    tabs.forEach((tab, i) => {
      const on = tab.dataset.panel === id;
      tab.setAttribute("aria-selected", String(on));
      tab.tabIndex = on ? 0 : -1;
      tab.id = tab.id || `more-tab-${tab.dataset.panel}`;
      panels[i].setAttribute("aria-labelledby", tab.id);
      panels[i].hidden = !on;
      if (on && focus) tab.focus();
    });
  }

  tabs.forEach((tab, i) => {
    tab.addEventListener("click", () => show(tab.dataset.panel, false));
    tab.addEventListener("keydown", (e) => {
      const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (!step) return;
      e.preventDefault();
      show(tabs[(i + step + tabs.length) % tabs.length].dataset.panel, true);
    });
  });

  // A link to #music or #accessories (the View menu has them) opens that shelf.
  const fromHash = () => {
    const id = location.hash.slice(1);
    if (tabs.some((tab) => tab.dataset.panel === id)) show(id, false);
  };
  addEventListener("hashchange", fromHash);

  bar.hidden = false;
  section.classList.add("more-ready");
  show(tabs[0].dataset.panel, false);
  fromHash();
}
