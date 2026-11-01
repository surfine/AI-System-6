#!/usr/bin/env node
// One More Take — check the deck's facts against the local Mactracker extract.
//
// The extract is a backstage index (Aaron, 2026-10-31: the facts are public and
// may be used directly; every shipped take is still checked against a
// first-hand source). It never enters the repository: this script reads it
// from outside and only reports, unless --write is passed.
//
// For each look whose `source` names one model exactly, it compares the
// launch month with that model's, and the colour value, codename, tagline and
// price with the model's own. Dates are reported, never written: a look's
// start and end belong to the whole group of models that share its
// appearance, which one model cannot settle.
//
// Usage:
//   node tooling/check-one-more-take-facts.mjs [--extract <CoreCollection_full.json>]
//   ONE_MORE_TAKE_EXTRACT=<file> node tooling/check-one-more-take-facts.mjs --write
//
// Exit 1 when a date disagrees, so a maintainer sees it before shipping.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const deckPath = join(root, "apps/desktop/data/one-more-take-deck.json");
const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const write = args.includes("--write");
const extractPath = flag("--extract") || process.env.ONE_MORE_TAKE_EXTRACT || join(homedir(), "Documents/mactracker-extract/CoreCollection_full.json");

if (!existsSync(extractPath)) {
  console.log(`SKIP  no extract at ${extractPath}; pass --extract <file> or set ONE_MORE_TAKE_EXTRACT.`);
  process.exit(0);
}

const extract = JSON.parse(readFileSync(extractPath, "utf8"));
const skip = new Set(["MactrackerData", "DatabaseEdition", "DatabaseVersion", "DatabaseCheck", "AUX"]);
const models = new Map();
for (const [section, rows] of Object.entries(extract)) {
  if (skip.has(section) || !Array.isArray(rows)) continue;
  for (const row of rows) if (row && typeof row === "object" && row.ModelName) models.set(row.ModelName, row);
}
const colours = new Map(Object.values(extract.MactrackerData?.ColorDetails || {}).filter((c) => !c.Description).map((c) => [c.Name, String(c.Value).toUpperCase()]));
const present = (value) => value !== undefined && value !== null && value !== "" && value !== "--" && value !== "None";
const month = (sortDate) => (present(sortDate) ? `${String(sortDate).slice(0, 4)}-${String(sortDate).slice(4, 6)}` : null);
const firstPrice = (value) => (present(value) ? String(value).match(/\$[\d,]+/)?.[0] || null : null);

const deck = JSON.parse(readFileSync(deckPath, "utf8"));
let dateConflicts = 0, updates = 0, checked = 0;
for (const [id, look] of Object.entries(deck.looks)) {
  const model = models.get(look.source);
  if (!model) { console.log(`--   ${id}: source "${look.source}" is not one model; check by hand`); continue; }
  checked += 1;
  const start = month(model.SortDate);
  if (start !== look.start) { dateConflicts += 1; console.log(`NO   ${id}: starts ${look.start}, the model's record says ${start}`); }
  const proposed = {
    codename: present(model.Codename) ? model.Codename : null,
    tagline: present(model.Tagline) ? model.Tagline : null,
    price: firstPrice(model.PurchasePriceUSD),
  };
  for (const [field, value] of Object.entries(proposed)) {
    if (value === null || look[field] === value) continue;
    console.log(`DIFF ${id}.${field}: deck "${look[field] ?? ""}" · record "${value}"`);
    if (write) { look[field] = value; updates += 1; }
  }
  const hex = look.color?.name ? colours.get(look.color.name) : null;
  if (hex && look.color.hex && look.color.hex.toUpperCase() !== hex) console.log(`DIFF ${id}.color: deck #${look.color.hex} · record #${hex}`);
}
if (write && updates) writeFileSync(deckPath, `${JSON.stringify(deck, null, 2)}\n`);
console.log(`${dateConflicts ? "NO " : "OK "} ${checked} looks checked against one model each; ${dateConflicts} date conflict(s)${write ? `, ${updates} field(s) written` : ""}.`);
process.exit(dateConflicts ? 1 : 0);
