// 文思泉涌 P2 · preview rendering and the check runner.
//
// Two promises are on the line here. A preview is only worth showing if it
// renders what the site will render, so the renderer's distinctive rules
// (headings start at h3, CJK lines join without a space, an image without alt
// refuses to render, top-level blocks take the site's pN anchors) are pinned
// against the site's own behaviour. And a check run must never look cleaner
// than it is: a package that could not run says so, and a script's findings
// keep the severity its parser assigned.

import { createRequire } from "node:module";

import { createFeatureTest } from "../helpers/feature-test-harness.mjs";

const require = createRequire(import.meta.url);
const test = createFeatureTest("wensi-c2-preview-check");

const md = require("../../apps/server/server/lib/blog-sites/markdown.js");
const checks = require("../../apps/server/server/lib/blog-sites/checks.js");
const rulePackages = require("../../apps/desktop/app/shared/rule-packages.js");

// ---- The renderer keeps the site's rules, not a generic library's ----

test.assert(
  md.markdown("## 小节\n\n正文。") === "<h4>小节</h4>\n<p>正文。</p>",
  "a body ## heading lands at h4 because the page's h1 sits at h2's level under h3 start",
);
test.assert(
  md.markdown("第一行\n第二行") === "<p>第一行第二行</p>",
  "two CJK lines join with no space, as the site's own line joiner does",
);
test.assert(
  md.markdown("one line\ntwo line") === "<p>one line two line</p>",
  "two Latin lines join with a space",
);
let altError = "";
try { md.markdown("![](/a.png)"); } catch (error) { altError = String(error.message || error); }
test.assert(altError.includes("alt"), "an image with no alt text refuses to render");
test.assert(
  md.markdown("```js\nconst a = 1 < 2;\n```") === '<pre><code class="lang-js">const a = 1 &lt; 2;</code></pre>',
  "a fenced block keeps its language class and escapes its body",
);
test.assert(
  md.markdown("<small>注释</small>") === '<p class="note"><small>注释</small></p>',
  "a small-only line becomes the site's note paragraph",
);
test.assert(
  md.markdown("| 甲 | 乙 |\n| --- | --- |\n| 一 | 二 |")
    === '<div class="table-wrap"><table><thead><tr><th>甲</th><th>乙</th></tr></thead><tbody><tr><td>一</td><td>二</td></tr></tbody></table></div>',
  "a table keeps the site's table-wrap",
);

// Anchor numbering is the block's own index, and an existing id is left alone.
const anchored = md.anchorBlocks("<p>甲</p>\n<p>乙</p>\n<h3 id=\"doc-h-1\">丙</h3>");
test.assert(
  anchored === '<p id="p0">甲</p>\n<p id="p1">乙</p>\n<h3 id="doc-h-1">丙</h3>',
  "top-level blocks take pN by index; a heading that already has an id keeps it",
);
test.assert(
  md.strip("<p>甲</p><p>乙</p>") === "甲\n乙",
  "strip breaks paragraphs into their own lines",
);

// ---- The check runner ----

const site = {
  schema: 1,
  id: "probe",
  label: "probe",
  contentTypes: {
    daily: {
      label: "日更",
      fields: [
        { key: "title", type: "string", required: true },
        { key: "date", type: "date", required: true, format: "YYYY-MM-DD" },
        { key: "slug", type: "slug", required: true },
        { key: "description", type: "string", required: true, maxLength: 80 },
      ],
      url: { single: "/{year}/{month}/{day}/", dedupe: "existing-and-redirects" },
    },
  },
  rulePackages: ["builtin-generic"],
};

const draft = {
  filename: "2026-11-08-probe.md",
  frontMatter: { title: "探针", date: "2026-11-08", slug: "probe", description: "一句话。" },
  body: "正文。",
};

const clean = await checks.runChecks({ site, typeId: "daily", article: draft });
test.assert(clean.ok === true && clean.summary.error === 0, "a complete draft passes the built-in package with no errors");
test.assert(clean.packages.length === 1 && clean.packages[0].status === "ran", "the built-in package reports that it ran");

const missing = await checks.runChecks({
  site,
  typeId: "daily",
  article: { ...draft, frontMatter: { title: "探针", date: "2026-11-08", slug: "probe" } },
});
test.assert(
  missing.findings.some((f) => f.severity === "error" && /description/.test(f.message)),
  "a missing required field is an error (D4: it blocks publishing)",
);

const badDate = await checks.runChecks({
  site,
  typeId: "daily",
  article: { ...draft, frontMatter: { ...draft.frontMatter, date: "2026/11/08" } },
});
test.assert(
  badDate.findings.some((f) => f.severity === "error" && /date/.test(f.message)),
  "a date off the site's format is an error, not a silent pass",
);

// A script package whose tools directory is missing must say so, never look clean.
const scriptSite = {
  ...site,
  tools: { dir: "/nonexistent/wensi-tools" },
  rulePackages: ["builtin-generic", { id: "probe-checks", label: "探针脚本", scripts: [{ id: "check_v3", parserId: "check_v3", runtime: "python3", argv: ["check_v3.py", "{file}"] }] }],
};
const noTools = await checks.runChecks({ site: scriptSite, typeId: "daily", article: draft });
test.assert(
  noTools.packages.some((p) => p.id === "probe-checks" && p.status === "tools_unavailable"),
  "a script package without its tools directory reports tools_unavailable",
);

// The article file a script reads carries front matter and body, as the site writes them.
const file = checks.renderArticleFile(draft);
test.assert(
  file.startsWith("---\ntitle: 探针\ndate: 2026-11-08\n") && file.includes("\n---\n\n正文。"),
  "the script input is front matter, a fence, a blank line, then the body",
);
// Array fields keep the site's quoted flow-list syntax: check_provenance reads
// each entry as file:line and check_v3 reads quotes verbatim.
const arrayed = checks.renderArticleFile({ frontMatter: { tags: ["社会观察", "AI"], source: ["2026H2.txt:1417"] }, body: "正文。" });
test.assert(
  arrayed.includes('tags: ["社会观察", "AI"]') && arrayed.includes('source: ["2026H2.txt:1417"]'),
  "array fields render as quoted flow lists, as the site writes them",
);

// A script may be scoped to the content types it judges; a type outside that
// list is not run, so the notes checker never judges a daily post.
const scopedSite = {
  ...site,
  tools: { dir: process.cwd() },
  rulePackages: ["builtin-generic", {
    id: "probe-scoped", label: "探针脚本",
    scripts: [{ id: "check_notes", parserId: "check_notes", runtime: "node", argv: ["-e", "process.stdout.write('ERR probe\\n     - notes only\\n')"], types: ["notes"] }],
  }],
};
const notesTypeSite = { ...scopedSite, contentTypes: { ...scopedSite.contentTypes, notes: { label: "笔记", fields: [] } } };
const dailyRun = await checks.runChecks({ site: notesTypeSite, typeId: "daily", article: draft });
const notesRun = await checks.runChecks({ site: notesTypeSite, typeId: "notes", article: draft });
test.assert(
  !dailyRun.findings.some((f) => f.checkId === "check_notes"),
  "a script scoped to another content type does not judge this one",
);
test.assert(
  notesRun.findings.some((f) => f.checkId === "check_notes" && f.severity === "error"),
  "a script scoped to this content type runs and keeps its severity",
);

// Every parser id a description may name now parses its script's real shape.
for (const id of rulePackages.PARSER_IDS) {
  const parsed = rulePackages.parseScriptOutput(id, { stdout: "", exitCode: 0 });
  test.assert(Array.isArray(parsed), `parser ${id} answers an array for empty output`);
}
test.assert(
  rulePackages.parseScriptOutput("check_v3", { stdout: "ERR x.md\n     - 缺 description\ntotal errors 1\n", exitCode: 1 })
    .some((f) => f.severity === "error" && /description/.test(f.message)),
  "check_v3's ERR block becomes an error finding",
);
test.assert(
  rulePackages.parseScriptOutput("check_provenance", { stdout: "flagged 0 of 3 quotes; 3 keys found in telegram\n" }).length === 0,
  "check_provenance's run footer is not mistaken for a malformed row",
);
test.assert(
  rulePackages.parseScriptOutput("humanizer_scan", { stdout: "### x.md\n  warn  AI_PHRASE  值得注意的是\n1 files, 1 diagnostics\n" })
    .some((f) => f.severity === "warn"),
  "humanizer_scan's style rows warn (D4: AI style only hints)",
);

test.finish();
