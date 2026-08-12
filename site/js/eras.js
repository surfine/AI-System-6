// Era engine: one source of truth for the six release appearances.
// The page theme, every synced icon, and both timeline strips follow it.

export const ERAS = [
  { id: "classic", year: 1988, label: "System 6", ext: "svg" },
  { id: "platinum", year: 1999, label: "Platinum", ext: "png" },
  { id: "aqua", year: 2002, label: "Aqua", ext: "png" },
  { id: "snow-leopard", year: 2009, label: "Snow Leopard", ext: "png" },
  { id: "yosemite", year: 2014, label: "Yosemite", ext: "png" },
  { id: "liquid-glass", year: 2026, label: "Liquid Glass", ext: "png" },
];

const doc = document;
const listeners = new Set();

export function currentEra() {
  const id = doc.documentElement.getAttribute("data-theme") || "classic";
  return ERAS.find((e) => e.id === id) || ERAS[0];
}

export function iconSrc(name, era) {
  const e = era || currentEra();
  return `img/themes/${e.id}/${name}.${e.ext}`;
}

export function setEra(id, store) {
  const era = ERAS.find((e) => e.id === id) || ERAS[0];
  if (era.id === "classic") {
    doc.documentElement.removeAttribute("data-theme");
  } else {
    doc.documentElement.setAttribute("data-theme", era.id);
  }
  if (store) {
    try { localStorage.setItem("s6-site-theme", era.id); } catch (e) {}
  }
  refreshIcons();
  listeners.forEach((fn) => fn(era));
}

export function onEraChange(fn) {
  listeners.add(fn);
}

// Every themed image on the page declares data-icon="name"; swapping eras
// swaps the source. Icons added later are picked up by the next swap.
export function refreshIcons(root) {
  const era = currentEra();
  (root || doc).querySelectorAll("img[data-icon]").forEach((img) => {
    const want = iconSrc(img.getAttribute("data-icon"), era);
    if (img.getAttribute("src") !== want) img.setAttribute("src", want);
  });
}

export function iconImg(name, size, alt) {
  const img = doc.createElement("img");
  img.className = "obj-icon";
  img.setAttribute("data-icon", name);
  img.width = size;
  img.height = size;
  img.alt = alt || "";
  img.decoding = "async";
  img.src = iconSrc(name);
  return img;
}

// Warm the other eras once the page is idle so the first timeline drag does
// not pop icon by icon. One era at a time, current era's neighbors first.
export function prefetchEras() {
  const names = [...new Set(
    [...doc.querySelectorAll("img[data-icon]")].map((i) => i.getAttribute("data-icon"))
  )];
  const cur = ERAS.indexOf(currentEra());
  const order = [...ERAS.keys()]
    .filter((i) => i !== cur)
    .sort((a, b) => Math.abs(a - cur) - Math.abs(b - cur));
  let step = 0;
  const next = () => {
    if (step >= order.length) return;
    const era = ERAS[order[step++]];
    let left = names.length;
    names.forEach((n) => {
      const img = new Image();
      img.onload = img.onerror = () => { if (--left === 0) schedule(next); };
      img.src = iconSrc(n, era);
    });
  };
  const schedule = (fn) => (window.requestIdleCallback || ((f) => setTimeout(f, 800)))(fn);
  schedule(next);
}
