// ClioWorks R1: the real-file corpus gate. For every docx/xlsx/pptx in
// tests/fixtures/real-corpus/manifest.json it runs three checks through the desk's own
// vendored codecs and adapters (the same vm-context loading path the S11 contracts use):
//   1. open        the adapter opens the file without throwing
//   2. untouched   an unedited save is byte-identical to the original (sha256)
//   3. edited      one minimal edit, saved, is still a valid package: a zip whose XML parts are
//                  well-formed and whose content types and relationships still resolve
//                  (no NEW problem compared with the original file)
//   4. untouched_parts_identical  after that edit, every package part the edit has no business
//                  changing is byte-identical (uncompressed) to the original part; changed_parts lists
//                  what differs (+name added, -name removed). Allowed to change: the edited story part
//                  (word/document.xml, one worksheet plus xl/sharedStrings.xml, one slide) and
//                  docProps/core.xml / docProps/app.xml (modified stamp, statistics).
// Extra, informational: reencode_identical (--reencode, and in --write-baseline) = edit then revert,
// saved through the encode path (the plain untouched save returns the original bytes, so it proves little);
// lo_open = LibreOffice (soffice, when on PATH and --lo is given) converts the edited file.
// "Microsoft 365 opens it without repair" stays a manual half (see the README next to the corpus).
//
//   node tooling/clioworks-r1-corpus.mjs                    compare with baseline.json (default)
//   node tooling/clioworks-r1-corpus.mjs --write-baseline   write baseline.json (adds LO when available)
//   --export-edited <dir> writes each edited file there (for the manual Microsoft 365 check)
//   flags: --lo (run LibreOffice in compare mode too), --no-lo, --only D01,X02
// Exit code is non-zero only for a REGRESSION: a check that was true in the baseline and is false now.
process.env.TZ = "UTC"; // the codec reads local clock fields (zip stamps)

import vm from "node:vm";
import AdmZip from "adm-zip";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, posix } from "node:path";
import { fileURLToPath } from "node:url";
import { makeContext, loadScripts } from "../tests/fixtures/clioworks-s11/vm-context.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export const CORPUS = join(here, "..", "tests", "fixtures", "real-corpus");
export const BASELINE = join(CORPUS, "baseline.json");
const NOW = Date.UTC(2026, 9, 16, 8, 0, 0);
const CHECKS = ["open", "untouched_identical", "edited_valid", "untouched_parts_identical"];

export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
export const readManifest = () => JSON.parse(readFileSync(join(CORPUS, "manifest.json"), "utf8"));

// ---------------------------------------------------------------- package validity
/** A strict-enough XML well-formedness scan: one root, matched tags, quoted attributes. */
function xmlProblem(text) {
  let s = text.replace(/^﻿/, "");
  s = s.replace(/<!--[\s\S]*?-->/g, "").replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "").replace(/<\?[\s\S]*?\?>/g, "");
  s = s.replace(/<!DOCTYPE[^>[]*(\[[\s\S]*?\])?\s*>/gi, "");
  const stack = [];
  let roots = 0;
  let pos = 0;
  const tag = /<(\/?)([A-Za-z_][^\s/>=]*)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"<]*"|'[^'<]*'))*)\s*(\/?)>/y;
  while (pos < s.length) {
    const lt = s.indexOf("<", pos);
    const chunk = s.slice(pos, lt < 0 ? s.length : lt);
    if (/[&](?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/.test(chunk)) return "bad entity reference";
    if (!stack.length && chunk.trim()) return "text outside the root element";
    if (lt < 0) break;
    tag.lastIndex = lt;
    const m = tag.exec(s);
    if (!m) return `malformed tag near offset ${lt}`;
    pos = tag.lastIndex;
    if (m[1]) {
      if (stack.pop() !== m[2]) return `mismatched </${m[2]}>`;
    } else {
      if (!stack.length && ++roots > 1) return "more than one root element";
      if (!m[4]) stack.push(m[2]);
    }
  }
  if (stack.length) return `unclosed <${stack[stack.length - 1]}>`;
  if (!roots) return "no root element";
  return "";
}

function packageProblems(bytes) {
  const problems = [];
  let zip;
  try { zip = new AdmZip(Buffer.from(bytes)); } catch (e) { return [`not a zip: ${e.message}`]; }
  const entries = zip.getEntries().filter((e) => !e.isDirectory);
  const names = new Set(entries.map((e) => e.entryName));
  const text = new Map();
  for (const e of entries) {
    let data;
    try { data = e.getData(); } catch (err) { problems.push(`unreadable entry ${e.entryName}: ${err.message}`); continue; }
    if (/\.(xml|rels)$/i.test(e.entryName) || e.entryName === "[Content_Types].xml") {
      const t = data.toString("utf8");
      text.set(e.entryName, t);
      const bad = xmlProblem(t);
      if (bad) problems.push(`xml ${e.entryName}: ${bad}`);
    }
  }
  const ct = text.get("[Content_Types].xml");
  if (ct === undefined) problems.push("missing [Content_Types].xml");
  else {
    const defaults = new Set([...ct.matchAll(/<Default\b[^>]*\bExtension="([^"]*)"/g)].map((m) => m[1].toLowerCase()));
    const overrides = new Set([...ct.matchAll(/<Override\b[^>]*\bPartName="([^"]*)"/g)].map((m) => m[1].replace(/^\//, "")));
    for (const o of overrides) if (!names.has(o)) problems.push(`content type override for missing part ${o}`);
    for (const n of names) {
      if (n === "[Content_Types].xml" || overrides.has(n)) continue;
      const ext = (n.split(".").pop() || "").toLowerCase();
      if (!defaults.has(ext)) problems.push(`no content type for ${n}`);
    }
  }
  for (const [name, t] of text) {
    if (!name.endsWith(".rels")) continue;
    const sourceDir = posix.dirname(posix.dirname(name)); // _rels/x.rels -> dir of the owning part
    for (const m of t.matchAll(/<Relationship\b([^>]*)>/g)) {
      const attrs = m[1];
      if (/\bTargetMode="External"/.test(attrs)) continue;
      const target = (/\bTarget="([^"]*)"/.exec(attrs) || [])[1];
      if (target === undefined) { problems.push(`relationship without Target in ${name}`); continue; }
      const clean = target.split("#")[0];
      if (!clean) continue;
      const resolved = clean.startsWith("/") ? clean.slice(1) : posix.normalize(posix.join(sourceDir === "." ? "" : sourceDir, clean));
      if (!names.has(resolved)) problems.push(`dangling relationship ${name} -> ${resolved}`);
    }
  }
  return problems;
}

/** Parts whose uncompressed bytes differ between two packages: changed names, +added, -removed. */
export function changedParts(beforeBytes, afterBytes) {
  const load = (bytes) => new Map(new AdmZip(Buffer.from(bytes)).getEntries().filter((e) => !e.isDirectory).map((e) => [e.entryName, e.getData()]));
  const a = load(beforeBytes);
  const b = load(afterBytes);
  const out = [];
  for (const [name, data] of b) {
    if (!a.has(name)) out.push(`+${name}`);
    else if (!a.get(name).equals(data)) out.push(name);
  }
  for (const name of a.keys()) if (!b.has(name)) out.push(`-${name}`);
  return out.sort();
}

const PROPS = new Set(["docProps/core.xml", "docProps/app.xml"]);
/** The parts a one-run text edit may legitimately rewrite (see check 4 above). */
function editMayChange(ext, changed) {
  let story = 0;
  for (const name of changed) {
    if (PROPS.has(name)) continue;
    if (ext === "docx" && name === "word/document.xml") continue;
    if (ext === "xlsx" && name === "xl/sharedStrings.xml") continue;
    if ((ext === "xlsx" && /^xl\/worksheets\/[^/]+\.xml$/.test(name)) || (ext === "pptx" && /^ppt\/slides\/[^/]+\.xml$/.test(name))) { story += 1; continue; }
    return false;
  }
  return story <= 1;
}

// ------------------------------------------------------------------ adapter sessions
function session(adapterFile, globalName) {
  const ctx = makeContext();
  class FixedDate extends Date {
    constructor(...args) { if (args.length) super(...args); else super(NOW); }
    static now() { return NOW; }
  }
  ctx.Date = FixedDate;
  let n = 0;
  ctx.crypto = new Proxy(ctx.crypto, {
    get(target, key) {
      if (key === "randomUUID") return () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
      const value = target[key];
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  loadScripts(ctx, [`app/vendor/clioworks-v3/${adapterFile}`]);
  return (bytes, meta) => {
    ctx.__bytes = bytes;
    ctx.__meta = meta;
    return vm.runInContext(`${globalName}.open(globalThis.__bytes, globalThis.__meta)`, ctx);
  };
}

const flip = (text) => { const first = [...text][0]; return (first === "◆" ? "◇" : "◆") + text.slice(first.length); };
const colName = (c) => { let s = ""; for (let n = c; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
const ok = (r) => !r || (r.status !== "blocked" && !r.blocked);
const refusal = (what, r) => new Error(`desk refused the edit (${what}): ${JSON.stringify(r).slice(0, 160)}`);

/** Per app: open, then find the minimal edit. Returns { adapter, apply(), revert() }. */
const APPS = {
  docx: {
    open: () => session("quire-adapter.js", "ClioWorksQuireAdapter"),
    plan(a) {
      for (const p of a.paragraphs()) {
        const i = p.runs.findIndex((r) => r.kind === "text" && r.text);
        if (i >= 0) {
          const before = p.runs[i].text;
          return {
            apply: () => { const r = a.setRunText(p.id, i, flip(before)); if (!ok(r)) throw refusal("first text run", r); },
            revert: () => { const r = a.setRunText(p.id, i, before); if (!ok(r)) throw refusal("revert", r); },
          };
        }
      }
      throw new Error("no editable text run in the body (tables are read-only in ClioWrite)");
    },
  },
  xlsx: {
    open: () => session("ledger-adapter.js", "ClioWorksLedgerAdapter"),
    plan(a) {
      for (const sheet of a.sheets()) {
        for (const { row, col, cell } of a.listCells(sheet.id)) {
          if (typeof cell.v === "string" && cell.v && !cell.f) {
            const addr = colName(col) + row;
            const before = cell.v;
            return {
              apply: () => a.setCell(sheet.id, addr, { value: flip(before) }),
              revert: () => a.setCell(sheet.id, addr, { value: before }),
            };
          }
        }
      }
      throw new Error("no non-formula text cell found");
    },
  },
  pptx: {
    open: () => session("lectern-adapter.js", "ClioWorksLecternAdapter"),
    plan(a) {
      for (const slide of a.slides()) {
        for (const shape of a.shapes(slide.id)) {
          if (!shape.editable) continue;
          for (const para of shape.paragraphs) {
            for (const run of para.runs) {
              if (run.text && !run.field) {
                const before = run.text;
                return {
                  apply: () => { const r = a.setRunText(slide.id, run.id, flip(before)); if (!ok(r)) throw refusal("first text box", r); },
                  revert: () => { const r = a.setRunText(slide.id, run.id, before); if (!ok(r)) throw refusal("revert", r); },
                };
              }
            }
          }
        }
      }
      throw new Error("no editable text run found in any text box");
    },
  },
};

function libreOfficeOpens(bytes, id, ext) {
  const dir = mkdtempSync(join(tmpdir(), `r1-lo-${id}-`));
  try {
    const input = join(dir, `${id}.${ext}`);
    writeFileSync(input, bytes);
    const r = spawnSync("soffice", [`-env:UserInstallation=file://${join(dir, "profile")}`, "--headless", "--convert-to", "pdf", "--outdir", join(dir, "out"), input], { timeout: 120000, encoding: "utf8" });
    const pdf = join(dir, "out", `${id}.pdf`);
    return r.status === 0 && existsSync(pdf) && readFileSync(pdf).length > 200;
  } catch { return false; } finally { rmSync(dir, { recursive: true, force: true }); }
}

export const sofficeAvailable = () => spawnSync("soffice", ["--version"], { encoding: "utf8", timeout: 30000 }).status === 0;

async function checkFile(entry, { lo, reencode, exportDir }) {
  const ext = entry.file.split(".").pop();
  const result = { id: entry.id, open: false, untouched_identical: false, edited_valid: false, untouched_parts_identical: false };
  const started = Date.now();
  const fail = (stage, e) => { result.error = result.error ? `${result.error}; ${stage}: ${e.message || e}` : `${stage}: ${e.message || e}`; };
  const app = APPS[ext];
  const bytes = new Uint8Array(readFileSync(join(CORPUS, ext, entry.file)));
  let adapter;
  try {
    adapter = await app.open()(bytes, { name: entry.file });
    result.open = true;
  } catch (e) { fail("open", e); }
  if (adapter) {
    try {
      const saved = await adapter.save();
      result.untouched_identical = sha256(new Uint8Array(saved.bytes)) === sha256(bytes);
      if (!result.untouched_identical) fail("untouched", new Error(`save differs (${saved.mode})`));
    } catch (e) { fail("untouched", e); }
    try {
      const edit = app.plan(adapter);
      edit.apply();
      const saved = await adapter.save();
      const edited = new Uint8Array(saved.bytes);
      const before = new Set(packageProblems(bytes));
      const fresh = packageProblems(edited).filter((p) => !before.has(p));
      result.edited_valid = fresh.length === 0;
      if (before.size) result.orig_issues = before.size;
      if (fresh.length) fail("edited", new Error(fresh.slice(0, 3).join(" | ")));
      try {
        result.changed_parts = changedParts(bytes, edited);
        result.untouched_parts_identical = editMayChange(ext, result.changed_parts);
      } catch (e) { fail("parts", e); }
      if (exportDir) { mkdirSync(exportDir, { recursive: true }); writeFileSync(join(exportDir, `${entry.id}-edited.${ext}`), edited); }
      if (lo) result.lo_open = libreOfficeOpens(edited, entry.id, ext);
      if (reencode) try {
        edit.revert();
        const back = await adapter.save();
        result.reencode_identical = sha256(new Uint8Array(back.bytes)) === sha256(bytes);
      } catch (e) { result.reencode_identical = false; }
    } catch (e) { fail("edited", e); }
  }
  if (lo && result.lo_open === undefined) result.lo_open = "not_run"; // no edited file to convert
  if (!lo) result.lo_open = "not_run";
  result.ms = Date.now() - started;
  return result;
}

/** Run the corpus. Returns the rows (manifest order). One bad file never stops the run. */
export async function runCorpus({ lo = false, reencode = false, exportDir = null, only = null, concurrency = 4 } = {}) {
  const manifest = readManifest().filter((e) => !only || only.includes(e.id));
  const rows = new Array(manifest.length);
  let next = 0;
  const worker = async () => {
    while (next < manifest.length) {
      const i = next++;
      const entry = manifest[i];
      if (entry.file.endsWith(".pdf")) { rows[i] = { id: entry.id, pending: "N1" }; continue; }
      try { rows[i] = await checkFile(entry, { lo, reencode, exportDir }); } catch (e) { rows[i] = { id: entry.id, open: false, untouched_identical: false, edited_valid: false, untouched_parts_identical: false, error: `harness: ${e.message}` }; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, manifest.length) }, worker));
  return rows;
}

/** A regression is a check that was true in the baseline and is not true now. */
export function regressions(rows, baseline) {
  const out = [];
  const old = new Map((baseline.files || []).map((r) => [r.id, r]));
  for (const row of rows) {
    const was = old.get(row.id);
    if (!was || row.pending) continue;
    for (const check of CHECKS) if (was[check] === true && row[check] !== true) out.push(`${row.id}: ${check} was true in the baseline and is now ${row[check]}${row.error ? ` (${row.error})` : ""}`);
    if (was.lo_open === true && row.lo_open === false) out.push(`${row.id}: lo_open was true in the baseline and is now false`);
  }
  return out;
}

export function summary(rows) {
  const manifest = new Map(readManifest().map((e) => [e.id, e]));
  const totals = {};
  for (const row of rows) {
    const ext = manifest.get(row.id).file.split(".").pop();
    const t = (totals[ext] ||= { files: 0, open: 0, untouched_identical: 0, edited_valid: 0, untouched_parts_identical: 0 });
    t.files += 1;
    for (const c of CHECKS) if (row[c] === true) t[c] += 1;
  }
  return totals;
}

async function main() {
  const args = process.argv.slice(2);
  const write = args.includes("--write-baseline");
  const only = (args.find((a) => a.startsWith("--only=")) || "").slice(7).split(",").filter(Boolean);
  const onlyIdx = args.indexOf("--only");
  const ids = onlyIdx >= 0 ? args[onlyIdx + 1].split(",") : only.length ? only : null;
  const wantLo = (write || args.includes("--lo")) && !args.includes("--no-lo");
  const lo = wantLo && sofficeAvailable();
  if (wantLo && !lo) console.error("soffice not on PATH: lo_open recorded as not_run");
  const rows = await runCorpus({ lo, reencode: write || args.includes("--reencode"), exportDir: args.includes("--export-edited") ? args[args.indexOf("--export-edited") + 1] : null, only: ids });
  for (const r of rows) {
    console.log(r.pending ? `${r.id}  pending ${r.pending}` : `${r.id}  open=${r.open} untouched=${r.untouched_identical} edited=${r.edited_valid} parts=${r.untouched_parts_identical}${r.changed_parts ? `[${r.changed_parts.length}]` : ""} lo=${r.lo_open} ${r.ms}ms${r.error ? "  " + r.error.slice(0, 200) : ""}`);
  }
  console.log(JSON.stringify(summary(rows.filter((r) => !r.pending))));
  if (write) {
    if (ids) throw new Error("--write-baseline needs the whole corpus (no --only)");
    mkdirSync(CORPUS, { recursive: true });
    writeFileSync(BASELINE, JSON.stringify({ note: "R1 corpus baseline; regenerate with node tooling/clioworks-r1-corpus.mjs --write-baseline", files: rows.map(({ ms, ...r }) => r) }, null, 1) + "\n");
    console.log(`baseline written: ${BASELINE}`);
    return;
  }
  if (!existsSync(BASELINE)) { console.error("no baseline.json: run with --write-baseline"); process.exitCode = 1; return; }
  const bad = regressions(rows, JSON.parse(readFileSync(BASELINE, "utf8")));
  if (bad.length) { console.error(`REGRESSION\n${bad.join("\n")}`); process.exitCode = 1; } else console.log("no regression against baseline.json");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch((e) => { console.error(e); process.exit(1); });
