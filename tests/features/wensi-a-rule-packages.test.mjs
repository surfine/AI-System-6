// 文思泉涌 lane A · the rule-package interface.
//
// A package is a named set of checks; a check is a pure function over one
// article's ctx; a finding names its check, its severity (D4) and, where it
// can, where to look. The interface ships with its living sample —
// builtin-generic, three checks every git-static site needs — and with the
// parsing seam the site scripts plug into in P2: five parser ids registered,
// one minimal parser (check_provenance) proving it. The module is pure, Node-
// requireable and DOM-free, the same file the server will require in P2.

import { createRequire } from "node:module";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const require = createRequire(import.meta.url);
const test = createFeatureTest("wensi-a-rule-packages");
const rulePackages = require("../../apps/desktop/app/shared/rule-packages.js");
const runtime = require("../../apps/desktop/app/shared/blog-rag-runtime.js");

// --- The module is pure and shaped like its sibling runtime ----------------

test.assert(
  read("app/shared/rule-packages.js").includes("(function exposeRulePackages(root, factory)"),
  "the module installs the same UMD way blog-rag-runtime.js does, so Node requires it and the desk loads it by path",
);
test.assert(
  !/document\.|window\.|localStorage/.test(read("app/shared/rule-packages.js").replace(/globalThis[^)]*\)\.window/g, "")),
  "the module touches no DOM and no storage",
);
test.assert(
  !Object.keys(runtime).includes("runPackage") && typeof rulePackages.runPackage === "function",
  "the rule packages live beside, not inside, the retrieval runtime",
);

// --- The manifest validation ----------------------------------------------

test.assert(rulePackages.validatePackage(rulePackages.builtinGeneric) === true, "builtin-generic passes its own manifest validation");
for (const broken of [
  null,
  { id: "x", label: "包", version: "1", checks: [] },
  { id: "X-upper", label: "包", version: "1", checks: rulePackages.builtinGeneric.checks },
  { id: "x", label: "包", version: "1", checks: [{ id: "c", label: "查", defaultSeverity: "fatal", run() {} }] },
  { id: "x", label: "包", version: "1", checks: [{ id: "c", label: "查", defaultSeverity: "error" }] },
]) {
  test.assert(rulePackages.validatePackage(broken) === false, `a broken manifest fails (${JSON.stringify(broken)?.slice(0, 40)})`);
}

// --- builtin-generic over one daily post -----------------------------------

const SITE_FIELDS = [
  { key: "title", type: "string", required: true, maxLength: 60 },
  { key: "date", type: "date", required: true },
  { key: "slug", type: "slug", required: true },
  { key: "description", type: "string", maxLength: 60 },
];

function ctx({ frontMatter, existing = [], filename = "posts/2026-11-08-hello.md" }) {
  return {
    site: { id: "aaronlau", label: "aaronlau.me" },
    contentType: { id: "daily", fields: SITE_FIELDS },
    article: { filename, frontMatter, existing },
    taxonomy: { tags: { canon: [] } },
    siteRoot: "/site",
  };
}

const findings = (context) => rulePackages.runPackage(rulePackages.builtinGeneric, context);
const messages = (context) => findings(context).map((finding) => `${finding.checkId}/${finding.severity}: ${finding.message}`);

const clean = findings(ctx({
  frontMatter: { title: "一篇日更", date: "2026-11-08", slug: "hello", description: "一句话说明。" },
  existing: [{ filename: "posts/2026-11-01-early.md", frontMatter: { slug: "early" } }],
}));
test.assert(clean.length === 0, "a complete, well-shaped article raises nothing");

const missing = messages(ctx({ frontMatter: { title: "  ", date: "2026-11-08", slug: "hello" } }));
test.assert(
  missing.some((m) => m.startsWith("required-fields/error") && m.includes("title")),
  "a blank required field is an error naming the field",
);
test.assert(
  messages(ctx({ frontMatter: { title: "t", slug: "hello" } })).some((m) => m.startsWith("required-fields/error") && m.includes("date")),
  "a missing required field is an error too",
);

const badSlug = messages(ctx({ frontMatter: { title: "t", date: "2026-11-08", slug: "Hello World" } }));
test.assert(
  badSlug.some((m) => m.startsWith("slug-format-dedupe/error")),
  "a slug that is not URL-shaped is an error",
);

const clash = messages(ctx({
  frontMatter: { title: "t", date: "2026-11-08", slug: "hello" },
  existing: [{ filename: "posts/2026-11-01-early.md", frontMatter: { slug: "hello" } }],
}));
test.assert(
  clash.some((m) => m.startsWith("slug-format-dedupe/error") && m.includes("已被")),
  "a slug another article already uses is a URL conflict",
);
const sameFile = findings(ctx({
  filename: "posts/2026-11-08-hello.md",
  frontMatter: { title: "t", date: "2026-11-08", slug: "hello" },
  existing: [{ filename: "posts/2026-11-08-hello.md", frontMatter: { slug: "hello" } }],
}));
test.assert(sameFile.length === 0, "the article's own file does not count as a clash");

const longDescription = messages(ctx({
  frontMatter: { title: "t", date: "2026-11-08", slug: "hello", description: "长".repeat(61) },
}));
test.assert(
  longDescription.some((m) => m.startsWith("description-length/warn")),
  "an over-long description is only a warning (D4)",
);
test.assert(
  findings(ctx({ frontMatter: { title: "t", date: "2026-11-08", slug: "hello", description: "长".repeat(60) } })).length === 0,
  "a description at the limit passes",
);

// --- A broken check warns instead of taking the list down ------------------

const fragile = rulePackages.runPackage(
  { id: "fragile", label: "脆", version: "1", checks: [
    { id: "throws", label: "会炸", defaultSeverity: "error", run() { throw new Error("boom"); } },
    { id: "mute", label: "不说话", defaultSeverity: "error", run() { return [{ message: "" }, null]; } },
    { id: "fine", label: "正常", defaultSeverity: "info", run: () => [{ message: "一条建议" }] },
  ] },
  ctx({ frontMatter: {} }),
);
test.assert(
  fragile.some((finding) => finding.checkId === "throws" && finding.severity === "warn" && finding.message.includes("boom")),
  "a throwing check becomes a warn naming the error, not a crash",
);
test.assert(
  fragile.some((finding) => finding.checkId === "fine" && finding.severity === "info"),
  "a healthy check still runs beside a broken one",
);
test.assert(!fragile.some((finding) => finding.checkId === "mute"), "an empty finding is not one");

// --- The parsing seam ------------------------------------------------------

test.assert(
  JSON.stringify([...rulePackages.PARSER_IDS]) === JSON.stringify(["check_v3", "check_2020_2024", "check_provenance", "check_notes", "humanizer_scan"]),
  "the five site-script parser ids are registered",
);

const provenance = rulePackages.parseScriptOutput("check_provenance", {
  filename: "check_provenance.out",
  stdout: [
    "posts/2026-10-01.md | 原话对上了 | 「今天的苹果会。」",
    "  notes/2026-10-02.md  |  缺出处  | ",
    "这".repeat(50),
  ].join("\n"),
  exitCode: 0,
});
test.assert(provenance.length === 3, "every output line becomes a finding");
test.assert(
  provenance[0].severity === "info" && provenance[0].excerpt === "「今天的苹果会。」" && provenance[0].checkId === "check_provenance",
  "a well-formed provenance line is an info carrying its quote",
);
test.assert(
  provenance[1].severity === "info" && provenance[1].excerpt === undefined,
  "a line without a quote still parses, with no excerpt",
);
test.assert(
  provenance[2].severity === "warn" && provenance[2].excerpt.length === 40,
  "a line that ignores the shape is a warn, its excerpt bounded at 40",
);

const quietFailure = rulePackages.parseScriptOutput("check_provenance", { stdout: "", exitCode: 2 });
test.assert(
  quietFailure.length === 1 && quietFailure[0].severity === "warn" && quietFailure[0].message.includes("2"),
  "a non-zero exit with no output is a warn, not silence",
);
test.assert(
  rulePackages.parseScriptOutput("check_provenance", { stdout: "a | b | c | d" })[0].excerpt === "c | d",
  "pipes inside the quote column stay in the quote",
);

// P2 landed the remaining four parsers; every registered id now answers an
// array (see wensi-c2-preview-check for each script's real output shape).
test.assert(
  rulePackages.PARSER_IDS.every((id) => Array.isArray(rulePackages.parseScriptOutput(id, { stdout: "", exitCode: 0 }))),
  "every registered parser answers an array, even for empty output",
);
test.assert(
  (() => { try { rulePackages.parseScriptOutput("made-up", { stdout: "" }); return false; } catch { return true; } })(),
  "an unknown parser id is a TypeError, not an empty pass",
);

test.finish();
