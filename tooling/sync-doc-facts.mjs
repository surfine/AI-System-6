#!/usr/bin/env node
// D3 (2026-10-16): numbers in prose come from the checks that own them.
//
// A document marks a number with <!-- fact:NAME -->value<!-- /fact -->; this
// script replaces every marked value with the current fact. Hand-written
// budget and contract counts went stale within weeks (the runbook still said
// 2,954,624 bytes and 578 slack after three raises; a comment said 334
// contracts when there were 523). tests/features/doc-facts.test.mjs fails
// while any marked value is stale.
//
//   node tooling/sync-doc-facts.mjs          rewrite the marked values
//   node tooling/sync-doc-facts.mjs --check  exit 1 when one is stale

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { floppyBudgetBytes } from "./runtime-manifest.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const docFactFiles = [
  "internal/operations/REPO-RUNBOOK.md",
  "internal/operations/REPO-RUNBOOK.zh-CN.md",
  "docs/DEVELOPMENT.md",
  "docs/DEVELOPMENT.zh-CN.md",
];

// Only facts that change when a decision changes: the budget and the number
// of contracts. The measured payload moves on every build; it stays in the
// gate's output and receipt rather than in prose.
export function currentDocFacts() {
  const contracts = readdirSync(path.join(root, "tests/features")).filter((name) => name.endsWith(".test.mjs")).length;
  return {
    "floppy-budget": floppyBudgetBytes.toLocaleString("en-US"),
    "contract-count": String(contracts),
  };
}

const marker = /<!-- fact:([a-z-]+) -->([\s\S]*?)<!-- \/fact -->/g;

export function syncDocFacts(text, facts = currentDocFacts()) {
  const unknown = [];
  const next = text.replace(marker, (whole, name) => {
    if (!(name in facts)) {
      unknown.push(name);
      return whole;
    }
    return `<!-- fact:${name} -->${facts[name]}<!-- /fact -->`;
  });
  return { next, unknown };
}

export function staleDocFacts() {
  const facts = currentDocFacts();
  const stale = [];
  for (const file of docFactFiles) {
    let text = "";
    try { text = readFileSync(path.join(root, file), "utf8"); } catch { continue; }
    const { next, unknown } = syncDocFacts(text, facts);
    if (unknown.length) stale.push(`${file}: unknown fact ${unknown.join(", ")}`);
    if (next !== text) stale.push(file);
  }
  return stale;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  if (process.argv.includes("--check")) {
    const stale = staleDocFacts();
    if (stale.length) {
      console.error(`FAIL stale doc facts: ${stale.join("; ")} (run node tooling/sync-doc-facts.mjs)`);
      process.exit(1);
    }
    console.log("OK  doc facts are current");
  } else {
    const facts = currentDocFacts();
    for (const file of docFactFiles) {
      const absolute = path.join(root, file);
      let text = "";
      try { text = readFileSync(absolute, "utf8"); } catch { continue; }
      const { next } = syncDocFacts(text, facts);
      if (next !== text) {
        writeFileSync(absolute, next);
        console.log(`synced ${file}`);
      }
    }
  }
}
