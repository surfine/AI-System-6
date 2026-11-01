// Deterministic scorers for the writing evals. Pure and offline: each takes
// the task's input files and the run's outcome and answers pass or fail with a
// one-line reason. Nothing here calls a model (the optional rubric grader is
// rubric.mjs).
//
// Outcome shape (what the runner records, what good.json / bad.json hold):
//   { answer: string,                                   all assistant text
//     changes: [{ path, kind: "added"|"modified"|"deleted", text: string|null }],
//     proposals: [{ kind, title, reason, payload }] }

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const paragraphsOf = (text) => String(text).trim().split(/\n[ \t]*\n+/).map((p) => p.trimEnd());
const compact = (text) => String(text).replace(/\s+/g, "");
const flattenStrings = (value) => {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(flattenStrings);
  if (value && typeof value === "object") return Object.values(value).flatMap(flattenStrings);
  return [];
};
const proposalText = (p) => [p.title, p.reason, ...flattenStrings(p.payload)].filter(Boolean).join("\n");
const getField = (object, dotted) => dotted.split(".").reduce((value, key) => (value == null ? undefined : value[key]), object);

function sectionOf(text, name) {
  const lines = String(text).split("\n");
  const start = lines.findIndex((line) => new RegExp(`^##\\s+${name}(\\s|$)`).test(line));
  if (start < 0) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) if (/^##\s/.test(lines[i])) { end = i; break; }
  return lines.slice(start, end).join("\n");
}

function applyScope(text, scope) {
  if (text == null || !scope) return text;
  if (scope.section) return sectionOf(text, scope.section) ?? "";
  if (scope.paragraphContaining) return paragraphsOf(text).filter((p) => p.includes(scope.paragraphContaining)).join("\n\n");
  return text;
}

/** The text a scorer looks at. null means "that output does not exist". */
export function select(ctx, where = "output", scope) {
  const { outcome } = ctx;
  const written = outcome.changes.filter((c) => c.kind !== "deleted" && c.text != null);
  let text;
  if (where === "answer") text = outcome.answer || "";
  else if (where === "files") text = written.map((c) => c.text).join("\n\n");
  else if (where === "proposals") text = outcome.proposals.map(proposalText).join("\n\n");
  else if (where === "output") text = [outcome.answer || "", ...written.map((c) => c.text), ...outcome.proposals.map(proposalText)].join("\n\n");
  else if (where.startsWith("file:")) {
    const hit = written.find((c) => c.path === where.slice(5));
    text = hit ? hit.text : null;
  } else throw new Error(`unknown selector ${where}`);
  return applyScope(text, scope);
}

function inputText(ctx, file, scope) {
  const entry = ctx.inputs.get(file);
  if (!entry || entry.text == null) throw new Error(`scorer names input ${file}, which is not a text input of this task`);
  return applyScope(entry.text, scope);
}

function sourceCorpus(ctx, sources) {
  const names = !sources || sources === "inputs" ? [...ctx.inputs.keys()] : sources;
  return [ctx.task.prompt, ...names.map((n) => ctx.inputs.get(n)?.text ?? "")].join("\n");
}

const ok = (detail = "") => ({ pass: true, detail });
const no = (detail) => ({ pass: false, detail });
const missing = (where) => no(`${where} was not produced`);

function matchRule(proposal, rule, ctx) {
  const value = getField(proposal, rule.field);
  const text = typeof value === "string" ? value : "";
  if (rule.notEmpty && !text.trim()) return false;
  if (rule.contains !== undefined && !text.includes(rule.contains)) return false;
  if (rule.anyContains && !rule.anyContains.some((s) => text.includes(s))) return false;
  if (rule.regex && !new RegExp(rule.regex, "u").test(text)) return false;
  if (rule.inFile && !(text && inputText(ctx, rule.inFile).includes(text))) return false;
  if (rule.equalsFile && text !== inputText(ctx, rule.equalsFile)) return false;
  return true;
}

export const SCORERS = {
  noChanges(ctx) {
    const n = ctx.outcome.changes.length;
    return n ? no(`${n} file(s) changed: ${ctx.outcome.changes.map((c) => c.path).join(", ")}`) : ok();
  },

  changesWithin(ctx, spec) {
    const allow = new Set([...(spec.allow || []), ...(spec.allowAdded || [])]);
    const added = new Set(spec.allowAdded || []);
    for (const c of ctx.outcome.changes) {
      if (c.kind === "deleted") return no(`deleted ${c.path}`);
      if (c.kind === "added" ? !allow.has(c.path) : !(spec.allow || []).includes(c.path)) return no(`touched ${c.path} (${c.kind})`);
      if (c.kind === "modified" && added.has(c.path) && !(spec.allow || []).includes(c.path)) return no(`touched ${c.path}`);
    }
    return ok();
  },

  requiredQuotes(ctx, spec) {
    const text = select(ctx, spec.where, spec.scope);
    if (text == null) return missing(spec.where);
    const lost = (spec.quotes || []).filter((q) => !text.includes(q));
    if (lost.length) return no(`missing verbatim: ${lost.map((q) => JSON.stringify(q.slice(0, 40))).join(", ")}`);
    if (spec.anyOf && !spec.anyOf.some((q) => text.includes(q))) return no(`none of ${JSON.stringify(spec.anyOf)} present`);
    return ok();
  },

  forbidPatterns(ctx, spec) {
    const text = select(ctx, spec.where, spec.scope);
    if (text == null) return missing(spec.where);
    const corpus = spec.unlessInSources ? sourceCorpus(ctx, spec.sources) : "";
    for (const pattern of spec.patterns) {
      // A pattern the writer's own files already contain (a rule quoted in the question sheet) is not the assistant's tic.
      if (spec.unlessInSources && new RegExp(pattern, "u").test(corpus)) continue;
      const hit = new RegExp(pattern, "u").exec(text);
      if (hit) return no(`forbidden /${pattern}/ matched ${JSON.stringify(hit[0].slice(0, 40))}`);
    }
    return ok();
  },

  noInventedNumbers(ctx, spec) {
    const text = select(ctx, spec.where || "files", spec.scope);
    if (text == null) return missing(spec.where);
    const known = new Set((sourceCorpus(ctx, spec.sources).match(/\d+(?:[.,]\d+)*/g) || []).map((n) => n.replace(/,/g, "")));
    for (const a of spec.allow || []) known.add(String(a));
    const fresh = [...new Set((text.match(/\d+(?:[.,]\d+)*/g) || []).map((n) => n.replace(/,/g, "")))]
      .filter((n) => (n.length > 1 || n.includes(".")) && !known.has(n));
    return fresh.length ? no(`numbers not in the sources: ${fresh.slice(0, 5).join(", ")}`) : ok();
  },

  noNewLatinNames(ctx, spec) {
    const text = select(ctx, spec.where || "files", spec.scope);
    if (text == null) return missing(spec.where);
    const corpus = sourceCorpus(ctx, spec.sources);
    const allow = new Set(spec.allow || []);
    const fresh = [...new Set(text.match(/\b[A-Z][A-Za-z0-9]{2,}\b/g) || [])].filter((w) => !allow.has(w) && !corpus.includes(w));
    return fresh.length ? no(`names not in the sources: ${fresh.slice(0, 5).join(", ")}`) : ok();
  },

  lengthBounds(ctx, spec) {
    const text = select(ctx, spec.where, spec.scope);
    if (text == null) return missing(spec.where);
    const n = compact(text).length;
    let min = spec.min ?? 0;
    let max = spec.max ?? Infinity;
    if (spec.ratioOf) {
      const base = compact(inputText(ctx, spec.ratioOf.file, spec.ratioOf.scope)).length;
      min = Math.max(min, Math.floor(base * (spec.minRatio ?? 0)));
      max = Math.min(max, Math.ceil(base * (spec.maxRatio ?? Infinity)));
    }
    return n < min || n > max ? no(`${n} characters, wanted ${min}-${max}`) : ok(`${n} characters`);
  },

  sentenceLength(ctx, spec) {
    const text = select(ctx, spec.where, spec.scope);
    if (text == null) return missing(spec.where);
    const sentences = text.split(/[。！？!?；\n]+/).map((s) => compact(s)).filter(Boolean);
    if (!sentences.length) return no("no sentences");
    const avg = sentences.reduce((a, s) => a + s.length, 0) / sentences.length;
    const longest = Math.max(...sentences.map((s) => s.length));
    if (spec.maxAvg && avg > spec.maxAvg) return no(`average sentence ${avg.toFixed(1)} > ${spec.maxAvg}`);
    if (spec.maxAny && longest > spec.maxAny) return no(`longest sentence ${longest} > ${spec.maxAny}`);
    return ok();
  },

  languageShare(ctx, spec) {
    const text = select(ctx, spec.where, spec.scope);
    if (text == null) return missing(spec.where);
    const cjk = (text.match(/[㐀-鿿]/g) || []).length;
    const latin = (text.match(/[A-Za-z]/g) || []).length;
    const share = cjk / Math.max(1, cjk + latin);
    if (spec.maxCjkRatio !== undefined && share > spec.maxCjkRatio) return no(`CJK share ${share.toFixed(2)} > ${spec.maxCjkRatio}`);
    if (spec.minCjkRatio !== undefined && share < spec.minCjkRatio) return no(`CJK share ${share.toFixed(2)} < ${spec.minCjkRatio}`);
    return ok();
  },

  bulletCount(ctx, spec) {
    const text = select(ctx, spec.where, spec.scope);
    if (text == null) return missing(spec.where);
    const n = text.split("\n").filter((l) => /^\s*([-*•]|\d+[.)])\s+/.test(l)).length;
    return n < spec.min ? no(`${n} bullets, wanted ${spec.min}`) : ok();
  },

  headingCount(ctx, spec) {
    const text = select(ctx, spec.where, spec.scope);
    if (text == null) return missing(spec.where);
    const n = text.split("\n").filter((l) => new RegExp(`^#{${spec.level}}\\s`).test(l)).length;
    return n < spec.min || n > spec.max ? no(`${n} level-${spec.level} headings, wanted ${spec.min}-${spec.max}`) : ok();
  },

  eachSectionMentions(ctx, spec) {
    const text = select(ctx, spec.where);
    if (text == null) return missing(spec.where);
    const sections = text.split(/\n(?=##\s)/).filter((s) => /^##\s/.test(s));
    const bare = sections.find((s) => !spec.anyOf.some((t) => s.includes(t)));
    return !sections.length ? no("no sections") : bare ? no(`section without a source: ${JSON.stringify(bare.split("\n")[0])}`) : ok();
  },

  pairNear(ctx, spec) {
    const text = select(ctx, spec.where, spec.scope);
    if (text == null) return missing(spec.where);
    for (const { a, b, window = 30 } of spec.pairs) {
      const near = [...text.matchAll(new RegExp(a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gu"))]
        .some((m) => text.slice(Math.max(0, m.index - window), m.index + a.length + window).includes(b));
      if (!near) return no(`${a} is not within ${window} characters of ${b}`);
    }
    return ok();
  },

  quotedSpansGrounded(ctx, spec) {
    const text = select(ctx, spec.where, spec.scope);
    if (text == null) return missing(spec.where);
    const corpus = sourceCorpus(ctx, spec.sources).replace(/prompt-placeholder/g, "");
    const min = spec.minLength || 8;
    const spans = [...text.matchAll(/「([^」\n]+)」|“([^”\n]+)”|"([^"\n]+)"/gu)].map((m) => m[1] || m[2] || m[3]);
    const loose = spans.flatMap((s) => s.split(/…+|\.{3,}/)).map((s) => s.trim()).filter((s) => s.length >= min);
    const bad = loose.filter((s) => !corpus.includes(s));
    return bad.length ? no(`quoted but not in the sources: ${JSON.stringify(bad[0].slice(0, 40))}`) : ok(`${loose.length} quoted span(s) grounded`);
  },

  otherParagraphsIntact(ctx, spec) {
    const after = select(ctx, `file:${spec.file}`);
    if (after == null) return missing(spec.file);
    const before = paragraphsOf(inputText(ctx, spec.file));
    const i = before.findIndex((p) => p.includes(spec.targetContains));
    if (i < 0) throw new Error(`target ${spec.targetContains} not in ${spec.file}`);
    const got = paragraphsOf(after);
    const head = before.slice(0, i);
    const tail = before.slice(i + 1);
    if (got.length < head.length + tail.length + 1) return no("paragraphs were removed");
    for (let k = 0; k < head.length; k += 1) if (got[k] !== head[k]) return no(`paragraph ${k + 1} before the target changed`);
    for (let k = 0; k < tail.length; k += 1) if (got[got.length - tail.length + k] !== tail[k]) return no(`a paragraph after the target changed`);
    return ok();
  },

  headingLinesIntact(ctx, spec) {
    const after = select(ctx, `file:${spec.file}`);
    if (after == null) return missing(spec.file);
    const heads = (t) => t.split("\n").filter((l) => /^#{1,6}\s/.test(l));
    const a = heads(inputText(ctx, spec.file));
    const b = heads(after);
    return JSON.stringify(a) === JSON.stringify(b) ? ok() : no("heading lines (or their ids) changed");
  },

  sectionsIntact(ctx, spec) {
    const after = select(ctx, `file:${spec.file}`);
    if (after == null) return missing(spec.file);
    const before = inputText(ctx, spec.file);
    const split = (t) => t.trim().split(/\n(?=##\s)/).map((s) => s.trimEnd());
    const a = split(before);
    const b = split(after);
    if (a.length !== b.length) return no("the number of sections changed");
    const skip = (s) => (spec.except || []).some((n) => new RegExp(`^##\\s+${n}(\\s|$)`).test(s));
    for (let i = 0; i < a.length; i += 1) if (!skip(a[i]) && a[i] !== b[i]) return no(`section ${JSON.stringify(a[i].split("\n")[0])} changed`);
    return ok();
  },

  fileEqualsInput(ctx, spec) {
    const text = select(ctx, `file:${spec.path}`);
    if (text == null) return missing(spec.path);
    return text === inputText(ctx, spec.equalsFile) ? ok() : no(`${spec.path} differs from ${spec.equalsFile}`);
  },

  proposals(ctx, spec) {
    const list = ctx.outcome.proposals;
    if (spec.min !== undefined && list.length < spec.min) return no(`${list.length} proposal(s), wanted at least ${spec.min}`);
    if (list.length > (spec.max ?? 20)) return no(`${list.length} proposals, wanted at most ${spec.max ?? 20}`);
    if (spec.allowKinds) {
      const stray = list.find((p) => !spec.allowKinds.includes(p.kind));
      if (stray) return no(`proposal kind ${stray.kind} is not allowed here`);
    }
    for (const anchor of spec.anchors || []) {
      const source = inputText(ctx, anchor.file);
      for (const p of list.filter((x) => x.kind === anchor.kind)) {
        const value = getField(p, anchor.field);
        if (typeof value !== "string" || !value || !source.includes(value)) return no(`${anchor.field} of a ${anchor.kind} is not verbatim from ${anchor.file}`);
      }
    }
    for (const rule of spec.forbid || []) {
      const hit = list.find((p) => (!rule.kind || p.kind === rule.kind) && rule.rules.every((r) => matchRule(p, r, ctx)));
      if (hit) return no(`forbidden proposal: ${JSON.stringify(hit.title)}`);
    }
    for (const want of spec.expect || []) {
      const hits = list.filter((p) => p.kind === want.kind && (want.rules || []).every((r) => matchRule(p, r, ctx)));
      if (hits.length < (want.min ?? 1) || hits.length > (want.max ?? 20)) return no(`${hits.length} ${want.kind} proposal(s) match ${JSON.stringify(want.rules || [])}`);
      const joined = hits.map(proposalText).join("\n");
      for (const group of want.mentions || []) if (!group.some((t) => joined.includes(t))) return no(`${want.kind} proposal does not mention any of ${JSON.stringify(group)}`);
    }
    return ok();
  },

  proposalShape(ctx) {
    const list = ctx.outcome.proposals;
    if (!list.length) return ok();
    const { collectProposals } = require("../../../apps/server/server/agent/proposals.js");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ais6-eval-"));
    try {
      const work = path.join(dir, "work");
      const channel = path.join(dir, "channel");
      fs.mkdirSync(work);
      fs.mkdirSync(channel);
      list.forEach((p, i) => fs.writeFileSync(path.join(channel, `${i + 1}-${p.kind}.json`), JSON.stringify({ v: 1, kind: p.kind, title: p.title, reason: p.reason || "", payload: p.payload, createdAt: "2026-10-31T00:00:00.000Z" })));
      const { gathered, dropped } = collectProposals(work, channel);
      return dropped || gathered.length !== list.length ? no(`the server's own validator dropped ${list.length - gathered.length} of ${list.length} proposal(s)`) : ok();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },

  anyOf(ctx, spec) {
    const results = spec.of.map((s) => runOne(ctx, s));
    return results.some((r) => r.pass) ? ok() : no(results.map((r) => r.detail).join(" | "));
  },
};

function runOne(ctx, spec) {
  const fn = SCORERS[spec.type];
  if (!fn) throw new Error(`unknown scorer type ${spec.type}`);
  return fn(ctx, spec);
}

/** Run every scorer of a task (its own plus the suite defaults). */
export function scoreOutcome(ctx, scorerSpecs) {
  const checks = scorerSpecs.map((spec, index) => {
    const id = spec.id || `${spec.type}#${index + 1}`;
    let r;
    try { r = runOne(ctx, spec); } catch (error) { r = { pass: false, detail: `scorer error: ${error.message}` }; }
    return { id, type: spec.type, pass: r.pass, detail: r.detail };
  });
  return { pass: checks.every((c) => c.pass), checks };
}
