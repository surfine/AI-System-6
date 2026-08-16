// Six appearances, one argument.
//
// "Six Mac themes" is the cheapest sentence available about this project and
// the most damaging one: it files a thesis under customization features. So
// this list refuses to sell them. Each era gets the job it has in the proof,
// and the line is set in the system face of its own decade, beside the same
// manuscript icon as the product's own art draws it in that year. The type
// and the icon are the evidence; the sentence is only the caption.
//
// The icons here carry no data-icon attribute on purpose. refreshIcons()
// swaps those to the era the page is wearing, which is right everywhere else
// and exactly wrong here: six rows of one era's icon would prove nothing.

import { ERAS, iconSrc, setEra, onEraChange, currentEra, fontLabel } from "./eras.js?v=20260814i";

const doc = document;

// Which monospace each era shipped, as the token names in site.css. Monaco
// held from 1984, Menlo took Terminal in 10.6, SF Mono is current.
const MONO = {
  classic: "monaco",
  platinum: "monaco",
  aqua: "monaco",
  "snow-leopard": "menlo",
  yosemite: "menlo",
  "liquid-glass": "sf",
};

// One object, six decades. TeachText is the manuscript surface, so it is the
// object the whole argument is about: the thing that has to survive the paint.
const OBJECT = "teachText";

export function initArgument(list) {
  if (!list) return;
  list.innerHTML = "";

  const rows = ERAS.map((era) => {
    const row = doc.createElement("li");
    row.className = "claim-row";
    row.dataset.era = era.id;
    row.style.setProperty("--row-face", `var(--face-${era.id})`);
    row.style.setProperty("--row-mono", `var(--face-mono-${MONO[era.id]})`);

    const hit = doc.createElement("button");
    hit.type = "button";
    hit.className = "claim-hit";
    hit.setAttribute("data-balloon", `Puts the whole page in ${era.year}, type and all.`);

    const icon = doc.createElement("img");
    icon.className = "claim-icon";
    icon.src = iconSrc(OBJECT, era);
    icon.width = 32;
    icon.height = 32;
    icon.loading = "lazy";
    icon.decoding = "async";
    icon.alt = `The manuscript icon, as ${era.label} drew it`;

    const year = doc.createElement("span");
    year.className = "claim-year";
    year.textContent = String(era.year);

    const body = doc.createElement("span");
    body.className = "claim-body";
    const name = doc.createElement("span");
    name.className = "claim-era";
    name.textContent = era.label;
    const role = doc.createElement("span");
    role.className = "claim-role";
    role.textContent = era.role;
    const text = doc.createElement("span");
    text.className = "claim-text";
    text.textContent = era.claim;
    body.append(name, role, text);

    // The face name is the receipt for the line above it, and it tells the
    // truth about substitution: nobody has Charcoal any more.
    const face = doc.createElement("span");
    face.className = "claim-face";
    face.textContent = fontLabel(era);

    hit.append(icon, year, body, face);
    hit.addEventListener("click", () => setEra(era.id, true));
    row.appendChild(hit);
    list.appendChild(row);
    return row;
  });

  function syncCurrent() {
    const active = currentEra().id;
    rows.forEach((row) => {
      const is = row.dataset.era === active;
      row.classList.toggle("is-current", is);
      row.querySelector(".claim-hit").setAttribute("aria-current", is ? "true" : "false");
    });
  }
  onEraChange(syncCurrent);
  syncCurrent();
}
