// Era engine: one source of truth for the six release appearances.
// The page theme, every synced icon, and both timeline strips follow it.

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
    role: "The claim",
    claim: "An AI fits inside files, windows, and a Trash can.",
  },
  {
    id: "platinum", year: 1999, label: "Platinum", ext: "png",
    font: "Charcoal", alias: ["Charcoal CY"], substitutes: ["Geneva", "Tahoma", "Verdana"],
    role: "It was never a filter",
    claim: "Color, bevels, a new system font. The same objects survive the repaint.",
  },
  {
    id: "aqua", year: 2002, label: "Aqua", ext: "png",
    font: "Lucida Grande", substitutes: ["Lucida Sans Unicode", "Lucida Sans", "DejaVu Sans"],
    role: "The counterfactual",
    claim: "If 2002 had an LLM, ClioTalk would have been a Cocoa app.",
  },
  {
    id: "snow-leopard", year: 2009, label: "Snow Leopard", ext: "png",
    font: "Lucida Grande", substitutes: ["Lucida Sans Unicode", "Lucida Sans", "DejaVu Sans"],
    role: "The working year",
    claim: "Nothing to show off. A source list, a toolbar, and a day of real work.",
  },
  {
    id: "yosemite", year: 2014, label: "Yosemite", ext: "png",
    font: "Helvetica Neue", substitutes: ["Helvetica", "Arial", "Liberation Sans"],
    role: "Not an antique",
    claim: "Flat did not end the object. It only changed the paint.",
  },
  {
    id: "liquid-glass", year: 2026, label: "Liquid Glass", ext: "png",
    font: "SF Pro", alias: ["SF Pro Text", "SF Pro Display"],
    substitutes: ["Segoe UI Variable Text", "Segoe UI", "Roboto", "Noto Sans"],
    role: "The control",
    claim: "Same desk, today's design language. So the desk was never the costume.",
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

// "Set in Charcoal" is a claim about the page, not about 1997. Where the era
// face is missing, say what the visitor is reading instead.
export function fontLabel(era) {
  const wearing = [era.font, ...(era.alias || [])];
  if (!era.substitutes.length || wearing.some(hasFont)) return era.font;
  const shown = era.substitutes.find(hasFont);
  return shown ? `${era.font} (as ${shown})` : era.font;
}

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
