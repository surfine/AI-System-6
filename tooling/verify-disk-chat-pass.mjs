#!/usr/bin/env node
// Every demonstration disk has to say what the chat export did to it.
//
// The owner's instruction was that every article and every disk written before
// the chat export arrived had to be topped up with it — and, just as firmly,
// that "checked, nothing new" is a result worth writing down. The pass itself
// lives in each disk's own material-lineage file, so this only asks the one
// question a reviewer needs answered: is there a dated record in all of them?
//
// It deliberately checks for the marker rather than for prose: what each record
// says is for a person to read, and the four batches in git history are the
// record of how it was written.
//
// Usage: node tooling/verify-disk-chat-pass.mjs

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SHARED_DISKS } from "./lib/project-disk-integrity.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const MARKERS = [
  /聊天记录（2026-09-23/,
  /聊天记录与讨论（2026-09-23/,
  /聊天记录核对（2026-09-23/,
];

const missing = [];
for (const disk of SHARED_DISKS) {
  const backup = JSON.parse(readFileSync(join(root, disk.source), "utf8"));
  const text = backup.files.map((file) => String(file.body || "")).join("\n");
  if (!MARKERS.some((marker) => marker.test(text))) missing.push(disk.route);
}

const total = SHARED_DISKS.length;
if (missing.length) {
  console.error(`NO  ${missing.length} of ${total} disks carry no dated chat-pass record: ${missing.join(", ")}`);
  console.error("    Add a 聊天记录 / 聊天记录核对 section to the disk's 素材谱系与时间线.md (see DEBT-AUDIT §17).");
  process.exit(1);
}
console.log(`OK  all ${total} demonstration disks carry a dated chat-pass record`);
