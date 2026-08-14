#!/usr/bin/env node

// Rewrite the payload gauges in README.md / README.zh-CN.md from the receipt
// that verify:floppy measured, then refresh the Chinese mirror's source hash.
//
//   npm run verify:floppy      (writes site/data/floppy-budget.json)
//   npm run sync:readme-payload
//
// The number is the gate's, never a human's: every change to the boot bundle
// moves it, and hand-editing three files in two languages is how the README
// ends up quoting a payload that no build ever produced.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const receipt = JSON.parse(readFileSync(path.join(root, "site/data/floppy-budget.json"), "utf8"));
const measured = receipt.bytes.toLocaleString("en-US");
// Any grouped number of this magnitude in the gauges is a previous payload.
const gauge = /\b2,9\d{2},\d{3}\b/g;

const english = path.join(root, "README.md");
const before = readFileSync(english, "utf8");
const after = before.replace(gauge, measured);
if (after !== before) writeFileSync(english, after);

const mirror = path.join(root, "README.zh-CN.md");
const mirrorBefore = readFileSync(mirror, "utf8");
const hash = createHash("sha256").update(readFileSync(english)).digest("hex");
const mirrorAfter = mirrorBefore
  .replace(gauge, measured)
  .replace(/<!-- source-sha256: [0-9a-f]+ -->/, `<!-- source-sha256: ${hash} -->`);
if (mirrorAfter !== mirrorBefore) writeFileSync(mirror, mirrorAfter);

console.log(
  after === before && mirrorAfter === mirrorBefore
    ? `README already quotes the measured payload (${measured} bytes)`
    : `README gauges synced to the measured payload (${measured} bytes)`
);
