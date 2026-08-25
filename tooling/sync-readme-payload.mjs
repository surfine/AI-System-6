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
const capacity = receipt.twoFloppyBytes.toLocaleString("en-US");

// Anchor each rewrite to its OWN gauge row. A magnitude-matching regex was
// used here once and it swallowed the capacity row too, so both rows quoted
// the payload and the README claimed two 1.44 MB floppies were whatever the
// bundle happened to weigh. That shipped to GitHub for eight days. The two
// rows carry different numbers and must be addressed separately.
const rows = [
  { label: "boot-critical payload", value: measured },
  { label: "two 1.44 MB floppies", value: capacity },
  { label: "启动关键载荷", value: measured },
  { label: "两张 1.44 MB 软盘", value: capacity },
];

function syncGauges(text) {
  return rows.reduce(
    (acc, row) => acc.replace(
      new RegExp(`(^${row.label}\\s+[▓░]+\\s+)[\\d,]+`, "m"),
      `$1${row.value}`
    ),
    text
  );
}

const english = path.join(root, "README.md");
const before = readFileSync(english, "utf8");
const after = syncGauges(before);
if (after !== before) writeFileSync(english, after);

const mirror = path.join(root, "README.zh-CN.md");
const mirrorBefore = readFileSync(mirror, "utf8");
const hash = createHash("sha256").update(readFileSync(english)).digest("hex");
const mirrorAfter = syncGauges(mirrorBefore)
  .replace(/<!-- source-sha256: [0-9a-f]+ -->/, `<!-- source-sha256: ${hash} -->`);
if (mirrorAfter !== mirrorBefore) writeFileSync(mirror, mirrorAfter);

console.log(
  after === before && mirrorAfter === mirrorBefore
    ? `README already quotes the measured payload (${measured} bytes)`
    : `README gauges synced to the measured payload (${measured} bytes)`
);
