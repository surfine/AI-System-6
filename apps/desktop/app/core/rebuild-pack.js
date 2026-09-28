// Rebuild pack — the one shape a rebuild of the writing route travels in.
//
// 「还原写作对象」 used to ask the desk's own model to invent study notes
// from someone else's article and write them straight into a new project.
// What the product needs now is the opposite case: the writer already wrote
// and published the piece, and the project around it has to be rebuilt —
// manuscript, its sections, the question sheet's new round, dossiers with
// sources, the fact ledger, the lineage — without the text being rewritten
// and without private material leaking in.
//
// Whoever does the judging (the desk's model, a guest agent over MCP, an
// offline tool) hands over the same JSON pack. This module is the one place
// that decides whether a pack may land and what landing means. It is pure:
// no DOM, no stores, no clock or randomness it was not given, so the feature
// test and tooling/rebuild-disk.mjs load it in a bare VM and the page loads
// it lazily with the guest tools.

(() => {
  const PACK_VERSION = 1;
  // Owner decision 2026-09-26: a pack has as many sections as its article
  // (one per `##` heading, neighbours may be merged) and at least two, since
  // a single section is no outline. Exactly six is the demo disks' showcase
  // shape; their tooling asks for it with { sectionRule: { exact: 6 } }.
  const SECTION_COUNT = 6;
  const MIN_SECTIONS = 2;
  // Owner decision D1 (2026-09-26): five base labels, two may be joined with
  // 「＋」. 「实物」 is a measurement and folds into 「实测」.
  const CONFIDENCE_LABELS = Object.freeze(["官方", "公开", "实测", "作者数据", "推测"]);
  const CONFIDENCE_ALIASES = Object.freeze({ 实物: "实测", 作者自读: "作者数据", 作者记录: "作者数据", 判断: "推测" });
  // Owner decision D6: dossiers may carry source.originKind. Missing means
  // unknown, which is allowed for old records; private-chat never lands.
  const ORIGIN_KINDS = Object.freeze(["official", "public", "measured", "author-draft", "author-data", "private-chat"]);
  const URL_ORIGINS = new Set(["official", "public", "measured"]);
  const CHANGE_KINDS = Object.freeze(["correction", "author-instruction", "author-quote", "removal"]);
  // Categories of detail that never belong in a shipped project, found by
  // shape rather than by a list of the very words they would leak.
  const CATEGORY_PATTERNS = Object.freeze([
    { category: "phone-number", pattern: /(?<![\d.])1[3-9]\d{9}(?![\d.])/ },
    { category: "qq-number", pattern: /QQ\s*[:：号]?\s*\d{5,11}/i },
    { category: "shop-stall", pattern: /(?<!文)档口|维修部[，,]?\s*\d{2,}/ },
    { category: "private-ai-conversation", pattern: /https?:\/\/(?:chatgpt\.com|chat\.openai\.com)\/(?:c|backend-api)\/|https?:\/\/claude\.ai\/chat\// },
  ]);

  // ---------------------------------------------------------------------
  // Hashes, copied from the desk so a pack-written record is indistinguishable
  // from one the desk wrote itself.
  // ---------------------------------------------------------------------

  // document-revisions.js revisionContentHash
  function revisionContentHash(body = "") {
    let hash = 0x811c9dc5;
    const value = String(body || "");
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16);
  }

  // prompt-file-runtime.js hashPromptBody, which documents-chat.js contentHash wraps
  function fileContentHash(body = "") {
    let hash = 2166136261;
    for (const char of String(body)) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
  }

  // ---------------------------------------------------------------------
  // Small helpers
  // ---------------------------------------------------------------------

  const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
  const text = (value) => String(value ?? "");
  const trimmed = (value) => text(value).trim();
  const asArray = (value) => (Array.isArray(value) ? value : []);
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const pad2 = (number) => String(number).padStart(2, "0");

  function issue(list, code, path, message) {
    list.push({ code, path, message });
  }

  function normalizeConfidence(label) {
    const raw = trimmed(label).replace(/\+/g, "＋");
    if (!raw) return "";
    const parts = raw.split("＋").map((part) => CONFIDENCE_ALIASES[part.trim()] || part.trim());
    return parts.join("＋");
  }

  function confidenceIsValid(label) {
    const parts = normalizeConfidence(label).split("＋");
    return parts.length >= 1 && parts.length <= 2 && parts.every((part) => CONFIDENCE_LABELS.includes(part));
  }

  function stripDossierNumber(title) {
    return trimmed(title).replace(/^档案\s*\d+\s*｜/, "");
  }

  function dossierNumberInTitle(title) {
    const match = trimmed(title).match(/^档案\s*(\d+)\s*｜/);
    return match ? Number(match[1]) : 0;
  }

  // ---------------------------------------------------------------------
  // Manuscript and the section invariant
  // ---------------------------------------------------------------------

  function splitTitle(markdown) {
    const source = text(markdown).replace(/\r\n?/g, "\n");
    const match = source.match(/^# (.+)\n+/);
    if (!match) return { title: "", body: source.trim() };
    return { title: match[1].trim(), body: source.slice(match[0].length).trim() };
  }

  // Split the manuscript body into the pack's sections. A section names the
  // `##` headings it covers, or — for a manuscript with no headings, as the
  // author's own columns often are — the words its first paragraph starts
  // with. Every part of the body belongs to exactly one section, in order.
  function splitSections(markdown, sections) {
    const { body } = splitTitle(markdown);
    const list = asArray(sections);
    const errors = [];
    const usesCovers = list.some((section) => asArray(section.covers).length);
    if (usesCovers) {
      const blocks = body.split(/\n(?=## )/);
      const intro = /^## /.test(blocks[0] || "") ? "" : (blocks.shift() || "").trim();
      const byHeading = blocks.map((block) => {
        const heading = block.match(/^## (.+?)(?:\s*\{#[0-9a-f]{6}\})?\s*$/m);
        return { heading: heading ? heading[1].trim() : "", raw: block.trim() };
      });
      let cursor = 0;
      const parts = list.map((section, index) => {
        const covers = asArray(section.covers).map(trimmed);
        const chunks = [];
        covers.forEach((heading) => {
          const block = byHeading[cursor];
          if (!block || block.heading !== heading) {
            errors.push({ index, message: `covers 「${heading}」 does not match the next heading 「${block ? block.heading : "(end)"}」` });
            return;
          }
          chunks.push(block.raw);
          cursor += 1;
        });
        if (index === 0 && intro) chunks.unshift(intro);
        return { title: trimmed(section.title), sourceMarkdown: chunks.join("\n\n") };
      });
      if (cursor !== byHeading.length) errors.push({ index: list.length - 1, message: `${byHeading.length - cursor} heading(s) are not covered by any section` });
      return { parts, errors };
    }
    const paragraphs = body.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean);
    const starts = list.map((section, index) => {
      const quote = trimmed(section.startQuote);
      if (index === 0 && !quote) return 0;
      const found = paragraphs.findIndex((paragraph) => quote && paragraph.startsWith(quote));
      if (found < 0) errors.push({ index, message: `startQuote 「${quote.slice(0, 24)}」 does not begin any paragraph` });
      return found;
    });
    if (starts.length && starts[0] > 0) errors.push({ index: 0, message: "the first section must start at the first paragraph" });
    for (let index = 1; index < starts.length; index += 1) {
      if (starts[index] >= 0 && starts[index - 1] >= 0 && starts[index] <= starts[index - 1]) {
        errors.push({ index, message: "sections must start in manuscript order" });
      }
    }
    const parts = list.map((section, index) => {
      const from = starts[index] < 0 ? paragraphs.length : starts[index];
      const next = starts.slice(index + 1).find((start) => start >= 0);
      const to = next === undefined ? paragraphs.length : next;
      return { title: trimmed(section.title), sourceMarkdown: paragraphs.slice(from, to).join("\n\n") };
    });
    return { parts, errors };
  }

  function draftBodyFrom(sourceMarkdown) {
    return text(sourceMarkdown).split("\n").filter((line) => !/^## /.test(line)).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  // ---------------------------------------------------------------------
  // own mode: the manuscript is the author's text. Every difference between
  // the base and the new manuscript has to be declared.
  // ---------------------------------------------------------------------

  function undeclaredDifferences(baseText, manuscript) {
    const baseBody = splitTitle(baseText).body;
    const next = splitTitle(manuscript.markdown).body;
    let working = baseBody;
    const problems = [];
    asArray(manuscript.changes).forEach((change, index) => {
      const before = text(change.before);
      const after = text(change.after);
      if (change.kind === "author-quote") {
        if (!after || !next.includes(after)) problems.push({ index, message: "author-quote text does not appear in the manuscript" });
        return;
      }
      if (!before) {
        problems.push({ index, message: `${change.kind} needs the base text it changes` });
        return;
      }
      const occurrences = working.split(before).length - 1;
      if (occurrences !== 1) {
        problems.push({ index, message: `before text occurs ${occurrences} times in the base; it must occur exactly once` });
        return;
      }
      working = working.replace(before, after);
    });
    const addendum = isObject(manuscript.addendum) && trimmed(manuscript.addendum.markdown)
      ? `## ${trimmed(manuscript.addendum.heading)}\n\n${trimmed(manuscript.addendum.markdown)}`
      : "";
    // Author quotes are insertions: take them out of the new text before
    // comparing, so an insertion does not read as drift.
    let comparable = next;
    asArray(manuscript.changes).filter((change) => change.kind === "author-quote").forEach((change) => {
      comparable = comparable.replace(text(change.after), "");
    });
    const squash = (value) => value.replace(/\s+/g, "");
    const expected = squash(addendum ? `${working.trim()}\n\n${addendum}` : working.trim());
    comparable = squash(comparable);
    if (expected !== comparable) {
      let at = 0;
      while (at < expected.length && expected[at] === comparable[at]) at += 1;
      problems.push({ index: -1, message: `undeclared difference near 「${comparable.slice(Math.max(0, at - 12), at + 18)}」 (base had 「${expected.slice(Math.max(0, at - 12), at + 18)}」)` });
    }
    return problems;
  }

  // ---------------------------------------------------------------------
  // Privacy
  // ---------------------------------------------------------------------

  // Walk every string of a record. Terms come from the caller (the demo-disk
  // list lives under internal/, never in this file); categories are shapes.
  // Reports carry the field path and the category, never the matched text.
  function scanForPrivateDetail(value, { terms = [], skipPaths = [] } = {}) {
    const hits = [];
    const termList = asArray(terms).map((term) => ({ category: trimmed(term.category) || "private-term", value: trimmed(term.value) }))
      .filter((term) => term.value.length >= 2);
    const walk = (node, path) => {
      if (skipPaths.some((skip) => path === skip || path.startsWith(`${skip}.`) || path.startsWith(`${skip}[`))) return;
      if (typeof node === "string") {
        CATEGORY_PATTERNS.forEach(({ category, pattern }) => {
          if (pattern.test(node)) hits.push({ path, category });
        });
        termList.forEach((term) => {
          if (node.includes(term.value)) hits.push({ path, category: term.category });
        });
        return;
      }
      if (Array.isArray(node)) node.forEach((item, index) => walk(item, `${path}[${index}]`));
      else if (isObject(node)) Object.keys(node).forEach((key) => walk(node[key], path ? `${path}.${key}` : key));
    };
    walk(value, "");
    return hits;
  }

  // ---------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------

  // snapshot: { project, scraps, references, files, baseManuscript,
  // sourceRevision } of the target as it stands.
  function validateRebuildPack(pack, snapshot = {}, options = {}) {
    const errors = [];
    const warnings = [];
    if (!isObject(pack)) {
      issue(errors, "E0", "", "pack must be an object");
      return { ok: false, errors, warnings };
    }
    if (pack.packVersion !== PACK_VERSION) issue(errors, "E0", "packVersion", `packVersion must be ${PACK_VERSION}`);
    const mode = pack.mode || "own";
    if (!["own", "study"].includes(mode)) issue(errors, "E0", "mode", "mode must be own or study");
    const target = isObject(pack.target) ? pack.target : {};
    if (!["round", "new-project"].includes(target.kind)) issue(errors, "E8", "target.kind", "target.kind must be round or new-project");
    const project = isObject(snapshot.project) ? snapshot.project : null;
    if (target.kind === "round") {
      if (!project || text(project.id) !== text(target.projectId)) issue(errors, "E8", "target.projectId", "a round must name the project it rebuilds");
      if (snapshot.sourceRevision && target.sourceRevision && snapshot.sourceRevision !== target.sourceRevision) {
        issue(errors, "E7", "target.sourceRevision", "the project changed after this pack was prepared; open the rebuild context again");
      }
    } else if (target.kind === "new-project" && !trimmed(target.name)) {
      issue(errors, "E8", "target.name", "a new-project target needs a name");
    }
    // Someone else's article never becomes a round of the writer's own project.
    if (mode === "study" && target.kind === "round") issue(errors, "E8", "target.kind", "study mode needs a new-project target");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text(pack.roundDate))) issue(errors, "E0", "roundDate", "roundDate must be YYYY-MM-DD");

    const manuscript = isObject(pack.manuscript) ? pack.manuscript : {};
    const markdown = text(manuscript.markdown);
    const { title } = splitTitle(markdown);
    if (!title) issue(errors, "E0", "manuscript.markdown", "the manuscript must start with a # title line");
    if (trimmed(manuscript.title) && title && trimmed(manuscript.title) !== title) issue(errors, "E0", "manuscript.title", "manuscript.title must equal the # title line");

    // E1 + E2: sections that split the manuscript. At least MIN_SECTIONS, or
    // exactly the count a caller's rule names (the demo disks ask for six).
    const sections = asArray(pack.sections);
    const rule = isObject(options.sectionRule) ? options.sectionRule : {};
    if (Number.isInteger(rule.exact)) {
      if (sections.length !== rule.exact) issue(errors, "E1", "sections", `sections must be exactly ${rule.exact} (got ${sections.length})`);
    } else {
      const floor = Number.isInteger(rule.min) ? rule.min : MIN_SECTIONS;
      if (sections.length < floor) issue(errors, "E1", "sections", `sections must be at least ${floor} (got ${sections.length})`);
    }
    const titles = sections.map((section) => trimmed(section.title));
    if (titles.some((value) => !value)) issue(errors, "E1", "sections", "every section needs a title");
    if (new Set(titles).size !== titles.length) issue(errors, "E1", "sections", "section titles must be distinct");
    if (markdown && sections.length) {
      const split = splitSections(markdown, sections);
      split.errors.forEach((entry) => issue(errors, "E2", `sections[${entry.index}]`, entry.message));
      split.parts.forEach((part, index) => {
        if (!trimmed(part.sourceMarkdown)) issue(errors, "E2", `sections[${index}]`, "this section is empty");
      });
    }

    // E3: own mode never rewrites the author.
    const changes = asArray(manuscript.changes);
    changes.forEach((change, index) => {
      if (!CHANGE_KINDS.includes(change.kind)) issue(errors, "E3", `manuscript.changes[${index}].kind`, `kind must be one of ${CHANGE_KINDS.join(", ")}`);
      if (change.kind === "correction" && !trimmed(change.factKey)) issue(errors, "E3", `manuscript.changes[${index}].factKey`, "a correction must point to a fact-ledger row");
      if (change.kind === "removal" && !trimmed(change.reason)) issue(errors, "E3", `manuscript.changes[${index}].reason`, "a removal needs a reason");
    });
    if (mode === "own") {
      const baseText = text(manuscript.base?.text || snapshot.baseManuscript);
      if (!baseText.trim()) {
        issue(errors, "E3", "manuscript.base", "own mode needs the author's base text (base.text, or the project's current manuscript)");
      } else {
        undeclaredDifferences(baseText, manuscript).forEach((problem) => {
          issue(errors, "E3", problem.index >= 0 ? `manuscript.changes[${problem.index}]` : "manuscript.markdown", problem.message);
        });
      }
    }
    if (isObject(manuscript.addendum) && !/\d/.test(text(manuscript.addendum.heading))) {
      issue(warnings, "W3", "manuscript.addendum.heading", "the addendum heading should carry a date");
    }

    // E4: the fact ledger.
    const ledger = asArray(pack.factLedger);
    const ledgerKeys = new Set();
    const dossierKeys = new Set(asArray(pack.dossiers).map((dossier) => trimmed(dossier.key)).filter(Boolean));
    ledger.forEach((row, index) => {
      if (!trimmed(row.claim)) issue(errors, "E4", `factLedger[${index}].claim`, "the claim is empty");
      if (!trimmed(row.source)) issue(errors, "E4", `factLedger[${index}].source`, "every row needs a source");
      if (!confidenceIsValid(row.confidence)) issue(errors, "E4", `factLedger[${index}].confidence`, `confidence must be one of ${CONFIDENCE_LABELS.join(" / ")} (two may be joined with ＋)`);
      const label = normalizeConfidence(row.confidence);
      const grounded = /^https:\/\//.test(text(row.url)) || (row.dossierKey && dossierKeys.has(trimmed(row.dossierKey)))
        || /作者数据|推测|实测/.test(label);
      if (!grounded) issue(errors, "E4", `factLedger[${index}]`, "a row needs a URL, a dossier, or the label 实测 / 作者数据 / 推测");
      if (/推测/.test(label)) issue(warnings, "W4", `factLedger[${index}]`, "this row is a guess");
      if (row.key) ledgerKeys.add(trimmed(row.key));
    });
    changes.forEach((change, index) => {
      if (change.kind === "correction" && change.factKey && !ledgerKeys.has(trimmed(change.factKey))) {
        issue(errors, "E3", `manuscript.changes[${index}].factKey`, `no fact-ledger row has key ${change.factKey}`);
      }
    });

    // E5: dossiers and their origins.
    asArray(pack.dossiers).forEach((dossier, index) => {
      const path = `dossiers[${index}]`;
      if (!trimmed(dossier.key)) issue(errors, "E5", `${path}.key`, "a dossier needs a key");
      if (!trimmed(dossier.title)) issue(errors, "E5", `${path}.title`, "a dossier needs a title");
      const origin = trimmed(dossier.originKind);
      if (!ORIGIN_KINDS.includes(origin)) issue(errors, "E5", `${path}.originKind`, `originKind must be one of ${ORIGIN_KINDS.join(", ")}`);
      if (origin === "private-chat") issue(errors, "E6", `${path}.originKind`, "private chats are background only; they never become dossiers");
      if (URL_ORIGINS.has(origin)) {
        if (!/^https:\/\//.test(text(dossier.url))) issue(errors, "E5", `${path}.url`, `${origin} dossiers need an https URL`);
        if (!trimmed(dossier.date)) issue(errors, "E5", `${path}.date`, `${origin} dossiers need a date`);
      }
      if (!trimmed(dossier.quote)) issue(warnings, "W5", `${path}.quote`, "this dossier has no quoted line");
    });

    // Kept dossiers and references may not be private chats either.
    const retireScraps = new Set(asArray(pack.retire?.scrapIds).map(text));
    const retireReferences = new Set(asArray(pack.retire?.referenceIds).map(text));
    const classify = new Map(asArray(pack.classify).map((entry) => [text(entry.scrapId), trimmed(entry.originKind)]));
    asArray(snapshot.scraps).forEach((scrap, index) => {
      if (retireScraps.has(text(scrap.id))) return;
      const origin = classify.get(text(scrap.id)) || trimmed(scrap.source?.originKind);
      if (origin === "private-chat") issue(errors, "E6", `snapshot.scraps[${index}]`, "a kept dossier is marked private-chat; retire it");
    });
    asArray(snapshot.references).forEach((reference, index) => {
      if (retireReferences.has(text(reference.id))) return;
      if (trimmed(reference.originKind) === "private-chat") issue(errors, "E6", `snapshot.references[${index}]`, "a kept reference is marked private-chat; retire it");
    });
    const knownScrapIds = new Set(asArray(snapshot.scraps).map((scrap) => text(scrap.id)));
    const knownReferenceIds = new Set(asArray(snapshot.references).map((reference) => text(reference.id)));
    retireScraps.forEach((id) => { if (!knownScrapIds.has(id)) issue(errors, "E5", "retire.scrapIds", `no dossier ${id} in the project`); });
    retireReferences.forEach((id) => { if (!knownReferenceIds.has(id)) issue(errors, "E5", "retire.referenceIds", `no reference ${id} in the project`); });

    sections.forEach((section, index) => {
      asArray(section.dossierKeys).forEach((key) => {
        const value = trimmed(key);
        if (!dossierKeys.has(value) && !(knownScrapIds.has(value) && !retireScraps.has(value))) {
          issue(errors, "E5", `sections[${index}].dossierKeys`, `unknown dossier key ${value}`);
        }
      });
    });

    // E6: privacy over every string the pack would put on the disk.
    scanForPrivateDetail(pack, { terms: options.privacyTerms, skipPaths: ["manuscript.base", "retire", "classify"] }).forEach((hit) => {
      issue(errors, "E6", hit.path, `private detail (${hit.category})`);
    });

    asArray(pack.extraFiles).forEach((file, index) => {
      if (!trimmed(file.name) || !trimmed(file.markdown)) issue(errors, "E0", `extraFiles[${index}]`, "an extra file needs a name and markdown");
      if (asArray(snapshot.files).some((entry) => text(entry.name) === trimmed(file.name))) {
        issue(warnings, "W6", `extraFiles[${index}].name`, "an existing file of this name will be replaced");
      }
    });

    return { ok: errors.length === 0, errors, warnings };
  }

  // ---------------------------------------------------------------------
  // Generated documents
  // ---------------------------------------------------------------------

  function outlineMarkdown(pack) {
    const preface = isObject(pack.outlinePreface) ? pack.outlinePreface : {};
    const head = [
      trimmed(preface.thesis) ? `论：${trimmed(preface.thesis)}` : "",
      trimmed(preface.method) ? `做法：${trimmed(preface.method)}` : "",
      trimmed(preface.avoid) ? `不写：${trimmed(preface.avoid)}` : "",
    ].filter(Boolean);
    const body = asArray(pack.sections).map((section) => [
      `## ${trimmed(section.title)}`,
      "",
      `HKRR intent: ${trimmed(section.hkrrIntent) || "K"}`,
      `说明：${trimmed(section.note)}`,
    ].join("\n"));
    // No trailing newline: the desk stores the outline without one, so a
    // round applied offline and one adopted on the desk read the same.
    return [...head, ...body].join("\n\n");
  }

  // The text that was there is kept as a revision, unless the latest
  // revision already holds it. The desk and the offline tool share this rule.
  function restoreBeforeNeeded(latestRevision, previousManuscript) {
    const previous = text(previousManuscript);
    return Boolean(previous.trim()) && (!latestRevision || text(latestRevision.contentHash) !== revisionContentHash(previous));
  }

  function questionSheetWithRound(existing, pack, name) {
    let sheet = text(existing).trim();
    if (!sheet) sheet = `# 问题单 · ${name}\n\n## 主题\n\n${trimmed(pack.questionSheetRound?.theme) || trimmed(pack.roundTitle)}`;
    sheet = /^# 问题单 · /m.test(sheet) ? sheet.replace(/^# 问题单 · .*$/m, `# 问题单 · ${name}`) : `# 问题单 · ${name}\n\n${sheet}`;
    const round = isObject(pack.questionSheetRound) ? pack.questionSheetRound : {};
    const bullets = asArray(round.bullets).map((line) => `- ${trimmed(line)}`).join("\n");
    const block = `## 这一轮（${pack.roundDate}）· ${trimmed(pack.roundTitle)}\n\n${bullets}\n`;
    const stance = asArray(round.stance).map((line) => `- ${trimmed(line)}`).join("\n");
    const anchor = sheet.indexOf("## 观点成型");
    if (anchor < 0) {
      return `${sheet}\n\n${block}${stance ? `\n## 观点成型（编辑前思考）\n\n${stance}\n` : ""}`;
    }
    const before = sheet.slice(0, anchor).trimEnd();
    const after = stance ? `## 观点成型（编辑前思考）\n\n${stance}\n` : `${sheet.slice(anchor).trim()}\n`;
    return `${before}\n\n${block}\n${after}`;
  }

  const cell = (value) => text(value).replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ").trim();

  function reviewRecordMarkdown(pack, name) {
    const record = isObject(pack.reviewRecord) ? pack.reviewRecord : {};
    const ledger = asArray(pack.factLedger).map((row) => `| ${cell(row.claim)} | ${cell(row.source)} | ${cell(normalizeConfidence(row.confidence))} |`);
    const changes = asArray(pack.manuscript?.changes).map((change) => {
      if (change.kind === "correction") return `- 更正：「${cell(change.before)}」改为「${cell(change.after)}」。`;
      if (change.kind === "author-instruction") return `- 作者指示：「${cell(change.before)}」改为「${cell(change.after)}」。`;
      if (change.kind === "author-quote") return `- 并入作者原话：${cell(change.note || "见正文")}。`;
      return `- 删去：${cell(change.note || change.reason)}。`;
    });
    if (isObject(pack.manuscript?.addendum) && trimmed(pack.manuscript.addendum.markdown)) {
      changes.push(`- 文末新增「${trimmed(pack.manuscript.addendum.heading)}」。`);
    }
    const parts = [
      `审校台核查记录 · ${name}`,
      trimmed(record.selfCheck) ? `## 交付前自查\n\n${trimmed(record.selfCheck)}` : "",
      `## 事实核查台账\n\n| 说法 | 来源 | 可信度 |\n| --- | --- | --- |\n${ledger.join("\n")}`,
      changes.length ? `## 这一轮对原文的改动\n\n${changes.join("\n")}` : "",
      trimmed(record.extra),
      asArray(record.openThreads).length ? `## 仍未收的线\n\n${asArray(record.openThreads).map((line) => `- ${trimmed(line)}`).join("\n")}` : "",
    ].filter(Boolean);
    return `${parts.join("\n\n")}\n`;
  }

  function lineageMarkdown(pack, name) {
    const lineage = isObject(pack.lineage) ? pack.lineage : {};
    const parts = [`# 素材谱系与时间线（${name}）`];
    const timeline = asArray(lineage.timeline);
    if (timeline.length) {
      parts.push(`## 一、时间线\n\n| 时间 | 事件 | 出处 |\n| --- | --- | --- |\n${timeline.map((row) => `| ${cell(row.when)} | ${cell(row.event)} | ${cell(row.source)} |`).join("\n")}`);
    }
    if (trimmed(lineage.viewpoints)) parts.push(`## 二、观点谱系\n\n${trimmed(lineage.viewpoints)}`);
    const removed = asArray(lineage.removed);
    if (removed.length) parts.push(`## 三、这一轮删掉的\n\n${removed.map((row) => `- ${cell(row.what || row.category)}${row.count ? `（${row.count}）` : ""}：${cell(row.reason)}`).join("\n")}`);
    const discussions = asArray(lineage.discussions);
    if (discussions.length) {
      parts.push(`## 四、讨论谱系\n\n| 日期 | 谁 | 说了什么 | 落到哪里 |\n| --- | --- | --- | --- |\n${discussions.map((row) => `| ${cell(row.when)} | ${cell(row.who)} | ${cell(row.said)} | ${cell(row.landed)} |`).join("\n")}`);
    }
    return `${parts.join("\n\n")}\n`;
  }

  function dossierBody(number, dossier) {
    const titleLine = `档案 ${pad2(number)}｜${trimmed(dossier.title)}`;
    const source = [trimmed(dossier.sourceTitle) || trimmed(dossier.title), trimmed(dossier.site), trimmed(dossier.date)].filter(Boolean).join("，");
    return [
      "来源与日期",
      `${titleLine}（${source}）`,
      `类别：${trimmed(dossier.category) || "—"}`,
      "",
      "原文重点句（附定位）",
      trimmed(dossier.quote) || "—",
      "",
      "判断",
      trimmed(dossier.judgement) || "—",
      "",
      "配图要点",
      trimmed(dossier.picture) || "无。",
      "",
      "值得跟进的参考链接",
      trimmed(dossier.url) || trimmed(dossier.followUp) || "无。",
    ].join("\n");
  }

  // Keep a dossier's title and the 「档案 NN｜」 lines of its body in step.
  function renumberDossier(scrap, number) {
    const short = stripDossierNumber(scrap.title);
    const title = `档案 ${pad2(number)}｜${short}`;
    const body = text(scrap.body).replace(/档案\s*\d+\s*｜/g, (match, offset, whole) => (whole.slice(offset + match.length).startsWith(short) ? `档案 ${pad2(number)}｜` : match));
    const next = { ...scrap, title, body };
    if (isObject(next.source) && /^档案\s*\d+\s*｜/.test(text(next.source.title))) next.source = { ...next.source, title };
    return next;
  }

  // ---------------------------------------------------------------------
  // Apply to a project backup (the disk JSON). Pure: ids and time come in.
  // ---------------------------------------------------------------------

  function applyRebuildPackToBackup(backupInput, pack, context = {}) {
    const backup = clone(backupInput);
    const project = backup.project;
    if (!isObject(project)) throw new Error("backup has no project");
    const now = context.now || new Date().toISOString();
    const uuid = typeof context.uuid === "function" ? context.uuid : null;
    if (!uuid) throw new Error("context.uuid is required");
    const agent = trimmed(context.agentName) || "agent";
    const origin = trimmed(context.origin) || "guest";
    // study: someone else's article. It is kept as a reading file, never as
    // the writer's manuscript, and the drafts hold notes, not its sentences.
    const study = pack.mode === "study";
    const articleTitle = splitTitle(pack.manuscript.markdown).title;
    const name = study ? (trimmed(pack.target?.name) || articleTitle) : articleTitle;
    const previousName = text(project.name);
    const manuscriptMarkdown = `${text(pack.manuscript.markdown).trim()}\n`;
    const files = asArray(backup.files);
    const folders = asArray(backup.folders);
    const trash = [];
    const retiredLog = [];

    let manuscriptFile = study ? null : (files.find((file) => file.label === "final")
      || files.find((file) => text(file.name) === previousName)
      || files.find((file) => text(file.id) === text(project.documentTabs?.[0]?.state?.activeTextFileId)));
    const documentsFolder = folders.find((folder) => folder.name === "Documents") || {};
    if (!manuscriptFile && !study) {
      // A new disk starts without a manuscript file; the writer's text is it.
      if (pack.target?.kind !== "new-project") throw new Error("backup has no manuscript file");
      manuscriptFile = { id: uuid(), projectId: project.id, type: "text", label: "final", name, folderId: documentsFolder.id || null, body: "", hash: "", createdAt: now, updatedAt: now };
      files.push(manuscriptFile);
    }
    const documentsFolderId = manuscriptFile?.folderId || documentsFolder.id || null;
    const previousManuscript = text(manuscriptFile?.body);

    project.name = name;
    if (manuscriptFile) {
      manuscriptFile.name = name;
      manuscriptFile.body = manuscriptMarkdown;
      manuscriptFile.hash = fileContentHash(manuscriptMarkdown);
      manuscriptFile.updatedAt = now;
    }
    if (manuscriptFile) asArray(project.documentTabs).forEach((tab, index) => {
      if (tab.role === "manuscript" || tab.backing?.type === "manuscript" || index === 0) {
        tab.title = name;
        if (isObject(tab.state)) {
          tab.state.name = name;
          tab.state.body = manuscriptMarkdown;
        }
      }
    });

    project.questionSheet = questionSheetWithRound(project.questionSheet, pack, name);
    project.outline = outlineMarkdown(pack);
    project.outlineSections = asArray(pack.sections).map((section) => trimmed(section.title));

    // Dossiers: retire, classify, add, renumber.
    const retireScraps = new Set(asArray(pack.retire?.scrapIds).map(text));
    const kept = [];
    asArray(backup.scraps).forEach((scrap) => {
      if (retireScraps.has(text(scrap.id))) {
        trash.push({ projectId: project.id, title: `${scrap.title}.scrap`, body: scrap.body, originalPath: `${name} / Scrapbook`, originalType: "scrap", originalData: scrap });
        retiredLog.push({ type: "scrap", id: scrap.id });
        return;
      }
      kept.push(scrap);
    });
    const classify = new Map(asArray(pack.classify).map((entry) => [text(entry.scrapId), trimmed(entry.originKind)]));
    kept.forEach((scrap) => {
      const originKind = classify.get(text(scrap.id));
      if (originKind) scrap.source = { ...(isObject(scrap.source) ? scrap.source : {}), originKind };
    });
    const template = kept[0] || {};
    const keyToId = new Map();
    const added = asArray(pack.dossiers).map((dossier) => {
      const id = uuid();
      keyToId.set(trimmed(dossier.key), id);
      const blank = Object.fromEntries(Object.keys(template).map((key) => [key, Array.isArray(template[key]) ? [] : typeof template[key] === "string" ? "" : null]));
      return {
        ...blank,
        id,
        projectId: project.id,
        title: trimmed(dossier.title),
        body: "",
        tags: asArray(dossier.tags).map(trimmed).filter(Boolean),
        selectedText: trimmed(dossier.quote),
        sourceTitle: trimmed(dossier.sourceTitle) || trimmed(dossier.title),
        source: {
          type: "reader-note",
          readerKind: "dossier",
          originKind: trimmed(dossier.originKind),
          title: trimmed(dossier.sourceTitle) || trimmed(dossier.title),
          site: trimmed(dossier.site),
          author: trimmed(dossier.author),
          date: trimmed(dossier.date),
          url: trimmed(dossier.url),
          capturedAt: now,
        },
        images: [],
        capturedAt: now,
        createdAt: now,
        updatedAt: now,
        _pack: dossier,
      };
    });
    const allScraps = [...kept, ...added].map((scrap, index) => {
      const number = index + 1;
      if (scrap._pack) {
        const { _pack: dossier, ...rest } = scrap;
        return { ...rest, title: `档案 ${pad2(number)}｜${trimmed(dossier.title)}`, body: dossierBody(number, dossier) };
      }
      return renumberDossier(scrap, number);
    });
    backup.scraps = allScraps;

    const retireReferences = new Set(asArray(pack.retire?.referenceIds).map(text));
    backup.references = asArray(backup.references).filter((reference) => {
      if (!retireReferences.has(text(reference.id))) return true;
      trash.push({ projectId: project.id, title: text(reference.name), body: text(reference.body), originalPath: `${name} / References`, originalType: "projectReference", originalData: reference });
      retiredLog.push({ type: "reference", id: reference.id });
      return false;
    });

    // Drafts: one per section. In own mode the body is the section's own
    // text; in study mode it is the note on what the section does.
    const split = splitSections(pack.manuscript.markdown, pack.sections);
    if (split.errors.length) throw new Error(`sections do not split the manuscript: ${split.errors[0].message}`);
    const drafts = asArray(project.drafts);
    project.drafts = split.parts.map((part, index) => {
      const section = pack.sections[index];
      const existing = drafts[index] || {};
      const usedClips = asArray(section.dossierKeys).map((key) => keyToId.get(trimmed(key)) || trimmed(key)).filter((id) => allScraps.some((scrap) => scrap.id === id));
      const body = study ? trimmed(section.note) : draftBodyFrom(part.sourceMarkdown);
      return {
        ...existing,
        id: existing.id || uuid(),
        title: part.title,
        sectionTitle: part.title,
        sourceType: existing.sourceType || "outline-section",
        sourceOutlineSection: part.title,
        sourceOutlineIndex: index,
        sourceMarkdown: `## ${part.title}\n\n${body}\n`,
        body,
        usedClips,
        hkrrIntent: trimmed(section.hkrrIntent) || "K",
        hkrrNote: trimmed(section.note),
        createdAt: existing.createdAt || now,
        updatedAt: now,
        insertedAt: study ? null : now,
        insertedFileId: study ? null : manuscriptFile.id,
        insertedFileName: study ? "" : name,
      };
    });

    const upsertFile = (fileName, body, extra = {}) => {
      let file = files.find((entry) => text(entry.name) === fileName);
      if (!file) {
        file = { id: uuid(), projectId: project.id, type: "text", name: fileName, folderId: documentsFolderId, body: "", hash: "", createdAt: now, updatedAt: now };
        files.push(file);
      }
      Object.assign(file, extra, { body, hash: fileContentHash(body), updatedAt: now });
      return file;
    };
    const reviewKind = files.find((entry) => entry.name === "审校台核查记录")?.artifactKind || "review-findings";
    const reviewFile = upsertFile("审校台核查记录", reviewRecordMarkdown(pack, name), { artifactKind: reviewKind });
    upsertFile("素材谱系与时间线.md", lineageMarkdown(pack, name), { durable: true });
    asArray(pack.extraFiles).forEach((extra) => upsertFile(trimmed(extra.name), `${trimmed(extra.markdown)}\n`));
    const readingFile = study ? upsertFile(`原文 · ${articleTitle}`, manuscriptMarkdown, { label: "note" }) : null;
    const mainFile = manuscriptFile || readingFile;

    if (manuscriptFile) asArray(backup.projectCdItems).forEach((item) => {
      if (item.sourceKind === "manuscript" || text(item.sourceDocumentId) === text(manuscriptFile.id) || text(item.title) === `${previousName}.md`) {
        item.title = `${name}.md`;
        item.body = manuscriptMarkdown;
        item.sourceDocumentId = manuscriptFile.id;
        item.claimCheckId = reviewFile.id;
        item.updatedAt = now;
        item.burnedAt = now;
      }
    });

    // The receipt: one rebuild, one record. The desk already holds the guest's
    // receipt when it adopts a pack, so it asks for none here (skipReceipt)
    // and writes revisions through its own createDocumentRevision (skipRevisions).
    const receiptId = context.skipReceipt ? text(context.receiptId) : uuid();
    let runFolder = folders.find((folder) => folder.name === "Run Records");
    if (!runFolder && !context.skipReceipt) {
      let parent = folders.find((folder) => folder.name === "ClioTalk" && !folder.parentId);
      if (!parent) {
        parent = { id: uuid(), projectId: project.id, name: "ClioTalk", parentId: null, createdAt: now, updatedAt: now };
        folders.push(parent);
      }
      runFolder = { id: uuid(), projectId: project.id, name: "Run Records", parentId: parent.id, createdAt: now, updatedAt: now };
      folders.push(runFolder);
    }
    backup.folders = folders;
    const addedIds = allScraps.filter((scrap) => [...keyToId.values()].includes(scrap.id)).map((scrap) => scrap.id);
    const outputIds = [mainFile.id, reviewFile.id, ...addedIds];
    const adopted = context.accepted !== false;
    const record = {
      schemaVersion: 2,
      runId: uuid(),
      projectId: project.id,
      sourceAppId: `guest:${agent}`,
      intent: "rebuild",
      operation: "rebuild",
      startedAt: now,
      finishedAt: now,
      sourceScope: { sourceIds: [], citationIds: [] },
      inputObjectIds: [mainFile.id],
      affectedObjectIds: [mainFile.id, ...project.drafts.map((draft) => draft.id)],
      provider: trimmed(context.provider) || "guest",
      model: trimmed(context.model) || agent,
      attempts: [],
      allowedTools: [],
      toolInvocations: [{ name: trimmed(context.toolName) || "submit_rebuild_pack", effect: "awaiting-commit", ok: true }],
      proposal: `还原一轮（${pack.roundDate}）· ${trimmed(pack.roundTitle)}：${study ? "原文" : "正文"}「${articleTitle}」，${project.drafts.length} 节，新增档案 ${added.length} 条，撤下 ${retiredLog.length} 项。`,
      checkpointState: "none",
      userAction: adopted ? "accept" : "",
      finalBodyHash: revisionContentHash(manuscriptMarkdown),
      outputObjectIds: outputIds,
      destination: "projectDisk",
      status: "completed",
      publicErrorReason: "",
      replayContract: null,
    };
    const receiptBody = [
      `Run Receipt · ${record.sourceAppId} · completed`,
      `- App / intent: ${record.sourceAppId} / rebuild`,
      `- Provider / model: ${record.provider} / ${record.model}`,
      `- Proposal: ${record.proposal}`,
      `- Adopted: ${adopted ? "yes" : "no"}`,
      `- Outputs: ${outputIds.join(", ")}`,
      "- Destination: projectDisk",
      trimmed(pack.reviewNote) ? `\n${trimmed(pack.reviewNote)}` : "",
    ].filter(Boolean).join("\n");
    if (!context.skipReceipt) files.push({
      id: receiptId,
      projectId: project.id,
      folderId: runFolder.id,
      type: "text",
      artifactKind: "clio-run-record",
      name: `Run ${now.replace("T", " ").replace(/(\.\d{3})?Z$/, "")} · guest:${agent} · rebuild`,
      body: receiptBody,
      hash: fileContentHash(receiptBody),
      runReceipt: record,
      rebuildPack: clone(pack),
      createdAt: now,
      updatedAt: now,
    });
    backup.files = files;

    // Revisions: keep the text that was there, then the round, credited to
    // whoever wrote it (owner decision D9: a guest round is origin "guest").
    const revisions = asArray(backup.documentRevisions);
    if (!context.skipRevisions && manuscriptFile) {
    const ofManuscript = revisions.filter((revision) => text(revision.documentId) === text(manuscriptFile.id));
    const latest = ofManuscript[ofManuscript.length - 1];
    let parent = latest ? latest.id : "";
    if (restoreBeforeNeeded(latest, previousManuscript)) {
      const before = { id: uuid(), projectId: project.id, documentId: manuscriptFile.id, parentRevisionId: parent, phase: "final", body: previousManuscript, contentHash: revisionContentHash(previousManuscript), origin: "system", operation: "restore-before", runRecordId: receiptId, createdAt: now };
      revisions.push(before);
      parent = before.id;
    }
    revisions.push({ id: uuid(), projectId: project.id, documentId: manuscriptFile.id, parentRevisionId: parent, phase: "final", body: manuscriptMarkdown, contentHash: revisionContentHash(manuscriptMarkdown), origin, operation: "rebuild-round", runRecordId: receiptId, createdAt: now });
    }
    backup.documentRevisions = revisions;

    backup.trash = [...asArray(backup.trash), ...trash];
    project.updatedAt = now;
    if ("exportedAt" in backup) backup.exportedAt = now;
    if ("projectRevision" in backup) backup.projectRevision = now;
    return {
      backup,
      summary: { name, previousName, receiptId, manuscriptFileId: manuscriptFile ? manuscriptFile.id : "", readingFileId: readingFile ? readingFile.id : "", previousManuscript, manuscript: manuscriptFile ? manuscriptMarkdown : "", addedDossiers: added.length, retired: retiredLog, trashItems: trash.length, trash, outputObjectIds: outputIds },
    };
  }

  // ---------------------------------------------------------------------
  // Demo-disk structure (the shared-disk-sources gate).
  // ---------------------------------------------------------------------

  function checkDemoDiskStructure(backup) {
    const problems = [];
    const project = backup?.project || {};
    if (asArray(project.outlineSections).length !== SECTION_COUNT) problems.push({ code: "sections", message: `outlineSections has ${asArray(project.outlineSections).length}` });
    if (asArray(project.drafts).length !== SECTION_COUNT) problems.push({ code: "drafts", message: `drafts has ${asArray(project.drafts).length}` });
    if (asArray(backup?.trash).length) problems.push({ code: "trash", message: `the trash holds ${backup.trash.length} item(s); a shipped disk carries an empty trash` });
    // A backup exported from a working desk carries its open windows; a
    // shipped disk would then open on them instead of on its article.
    if (backup && "workingSession" in backup) problems.push({ code: "working-session", message: "the disk carries a working session; a shipped disk opens on its article" });
    asArray(backup?.scraps).forEach((scrap, index) => {
      if (trimmed(scrap.source?.originKind) === "private-chat") problems.push({ code: "private-chat", message: `scraps[${index}] is a private chat` });
      const number = dossierNumberInTitle(scrap.title);
      if (!number) return;
      const short = stripDossierNumber(scrap.title);
      const body = text(scrap.body);
      const stale = [...body.matchAll(/档案\s*(\d+)\s*｜/g)]
        .filter((match) => body.slice(match.index + match[0].length).startsWith(short) && Number(match[1]) !== number);
      if (stale.length) problems.push({ code: "dossier-number", message: `scraps[${index}] body still says 档案 ${stale[0][1]}` });
    });
    // Records have to be the records the desk writes: a file named like a
    // receipt carries one, receipts sit where ensureRunReceiptsFolder puts
    // them and speak the code's vocabulary, and revision hashes are the desk's.
    const folders = asArray(backup?.folders);
    const runFolder = folders.find((folder) => folder.name === "Run Records");
    const clioTalk = folders.find((folder) => folder.name === "ClioTalk" && !folder.parentId);
    if (runFolder && clioTalk && runFolder.parentId !== clioTalk.id) problems.push({ code: "run-folder", message: "Run Records is not inside ClioTalk" });
    asArray(backup?.files).forEach((file, index) => {
      if (/^Run \d{4}-\d{2}-\d{2} /.test(text(file.name)) && !isObject(file.runReceipt)) problems.push({ code: "pseudo-receipt", message: `files[${index}] is named like a receipt but carries none` });
      const record = file.runReceipt;
      if (!isObject(record)) return;
      if (!["", "none", "accept", "edit", "reject"].includes(text(record.userAction))) problems.push({ code: "receipt-vocabulary", message: `files[${index}] userAction ${record.userAction}` });
      if (text(record.sourceAppId).startsWith("guest:") && (/^submit_/.test(text(record.intent)) || record.provider === "cloud")) problems.push({ code: "receipt-vocabulary", message: `files[${index}] guest receipt uses ${record.intent} / ${record.provider}` });
    });
    asArray(backup?.documentRevisions).forEach((revision, index) => {
      if (text(revision.contentHash) !== revisionContentHash(revision.body)) problems.push({ code: "revision-hash", message: `documentRevisions[${index}] hash is not the desk's` });
    });
    return problems;
  }

  function dossiersWithoutUrl(backup) {
    return asArray(backup?.scraps).filter((scrap) => !/https?:\/\//.test(`${text(scrap.source?.url)} ${text(scrap.body)}`)).length;
  }

  window.AISystem6RebuildPack = Object.freeze({
    PACK_VERSION,
    SECTION_COUNT,
    MIN_SECTIONS,
    CONFIDENCE_LABELS,
    ORIGIN_KINDS,
    revisionContentHash,
    fileContentHash,
    normalizeConfidence,
    splitSections,
    validateRebuildPack,
    applyRebuildPackToBackup,
    scanForPrivateDetail,
    checkDemoDiskStructure,
    dossiersWithoutUrl,
    renumberDossier,
    outlineMarkdown,
    restoreBeforeNeeded,
    reviewRecordMarkdown,
    lineageMarkdown,
  });
})();
