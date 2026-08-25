// Era engine: one source of truth for the six release appearances.
// The page theme, every synced icon, and both timeline strips follow it.

import { L } from "./copy.js?v=20260820a";

// `font` is the typeface the era actually wore, and the one this page swaps to
// when you travel there. It is named out loud in the dissolve readout: an era
// you can only see in rounded corners is a decade you have to be told about,
// but a letterform you can read is one you recognize.
//
// `claim` is the job the era has in the argument, and the reason six of them
// exist at all. Six appearances sold as six skins is a customization feature.
// Six appearances that each have to prove something the last one could not is
// a thesis: the objects outlive the interface. The argument scene sets each
// claim in the face of its own decade, and the hero ticks carry it too.
//
// `substitutes` are the faces site.css falls back to, in the same order, when
// the era face is not installed. Chicago and Monaco are hosted in site/fonts,
// so 1988 has none. The others are Apple faces we cannot ship: Charcoal is on
// no current system at all, and Lucida Grande and Helvetica Neue are Mac only.
// The readout says which face you are really looking at - see fontLabel().
export const ERAS = [
  {
    id: "classic", year: 1988, label: "System 6", ext: "svg",
    font: "Chicago", substitutes: [],
    role: L("The grammar", "对象语法"),
    claim: L("Files, windows, disks, and Trash make responsibility visible.", "文件、窗口、磁盘与废纸篓，让每项责任都看得见。"),
  },
  {
    id: "platinum", year: 1999, label: "Platinum", ext: "png",
    font: "Charcoal", alias: ["Charcoal CY"],
    substitutes: ["Platinum Asap", "Geneva", "Tahoma", "Verdana"],
    role: L("More material, same meaning", "材质变多，意义不变"),
    claim: L("Color and depth arrive without changing what a file or a save means.", "颜色与层次来到桌面，却没有改变文件与保存的意义。"),
  },
  {
    id: "aqua", year: 2002, label: "Aqua", ext: "png",
    font: "Lucida Grande", substitutes: ["Lucida Sans Unicode", "Lucida Sans", "DejaVu Sans"],
    role: L("A new surface language", "新的表面语言"),
    claim: L("Aqua changes the controls and light, while the manuscript stays the manuscript.", "Aqua 改变控件与光线，正文仍然是同一份正文。"),
  },
  {
    id: "snow-leopard", year: 2009, label: "Snow Leopard", ext: "png",
    font: "Lucida Grande", substitutes: ["Lucida Sans Unicode", "Lucida Sans", "DejaVu Sans"],
    role: L("The working year", "安静工作的一年"),
    claim: L("A mature source list and toolbar step back so the day's work can come forward.", "成熟的来源列表与工具栏退到后面，让一天的工作走到前面。"),
  },
  {
    id: "yosemite", year: 2014, label: "Yosemite", ext: "png",
    font: "Helvetica Neue", substitutes: ["Helvetica", "Arial", "Liberation Sans"],
    role: L("The object survives flatness", "扁平之后，对象还在"),
    claim: L("Flat design changes the paint, not the promise made by the object.", "扁平设计改变外观，没有改变对象作出的承诺。"),
  },
  {
    id: "liquid-glass", year: 2026, label: "Liquid Glass", ext: "png",
    font: "SF Pro", alias: ["SF Pro Text", "SF Pro Display"],
    substitutes: ["Segoe UI Variable Text", "Segoe UI", "Roboto", "Noto Sans"],
    role: L("The control", "最后的对照"),
    claim: L("The same desk accepts contemporary material without surrendering its rules.", "同一张桌面可以接受当代材质，却不交出自己的规则。"),
  },
];

// Font measurement, not document.fonts.check(): check() reports true for a
// name that only resolves through fallback, so it cannot find a missing face.
// A text run set in an absent family measures exactly like the generic it
// falls back to; a present family almost never does.
const fontProbe = new Map();
const SPECIMEN = "Handgloves 123 mmmiii";

export function hasFont(family) {
  if (fontProbe.has(family)) return fontProbe.get(family);
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) {
    fontProbe.set(family, false);
    return false;
  }
  const present = ["monospace", "serif", "sans-serif"].some((generic) => {
    ctx.font = `48px ${generic}`;
    const base = ctx.measureText(SPECIMEN).width;
    ctx.font = `48px "${family}", ${generic}`;
    return ctx.measureText(SPECIMEN).width !== base;
  });
  fontProbe.set(family, present);
  return present;
}

// The faces this page ships. A metric probe cannot answer for them: an
// era-only face is not fetched until someone travels to that era, so the
// probe runs before the bytes exist and caches a "missing" verdict for the
// session - which is how 1999 announced Geneva while the menu bar was
// already wearing Asap. Ask the font loader instead, which knows.
const HOSTED_FACES = ["Chicago", "Chicago_12", "Monaco", "Platinum Asap"];

// A hosted substitute is named for the era in CSS so it cannot collide with a
// copy the visitor already has installed. The readout wants the plain name.
const SUBSTITUTE_NAMES = { "Platinum Asap": "Asap" };

// "Set in Charcoal" is a claim about the page, not about 1997. Where the era
// face is missing, say what the visitor is reading instead.
export function fontLabel(era) {
  const wearing = [era.font, ...(era.alias || [])];
  if (!era.substitutes.length || wearing.some(hasFont)) return era.font;
  const shown = era.substitutes.find(hasFont);
  return shown ? `${era.font} (as ${SUBSTITUTE_NAMES[shown] || shown})` : era.font;
}

const doc = document;
const listeners = new Set();

// Pull the hosted faces in up front, record each one as present, then tell
// the readouts to redraw: whichever specimen was drawn during the wait is
// naming a fallback the visitor is no longer reading.
if (doc.fonts) {
  Promise.allSettled(HOSTED_FACES.map((family) =>
    doc.fonts.load(`16px "${family}"`).then((faces) => {
      if (faces.length) fontProbe.set(family, true);
    })
  )).then(() => listeners.forEach((fn) => fn(currentEra())));
}

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

// Every themed image on the page declares its icon id in a data attribute; swapping eras
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
