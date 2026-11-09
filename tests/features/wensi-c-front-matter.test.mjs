// 文思泉涌 lane C · hand-written front-matter. The parser only understands
// the shapes the two built-in sites actually write — key: value scalars
// (quoted or bare dates), flow lists, multi-line lists — and everything else
// (aaronlau's `predictions: [{claim: …}]` flow mappings) rides along opaque.
// The hard contract is the byte-exact round trip: a parse → merge with the
// same values → serialize reproduces the file exactly, so a property edit
// changes only the lines the writer touched (git diff is the evidence).

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { createRequire } from "node:module";

import { createFeatureTest } from "../helpers/feature-test-harness.mjs";

const require = createRequire(import.meta.url);
const test = createFeatureTest("wensi-c-front-matter");
const { parseFrontMatter, mergeFrontMatter, serializeFrontMatter } = require("../../apps/server/server/lib/blog-sites/front-matter.js");

const fixtureRoot = join(import.meta.dirname, "..", "fixtures", "wensi-quanyong");
const fixtureFiles = ["aaronlau-daily", "aaronlau-notes", "aaronlau-longform", "appscope-posts"]
  .flatMap((dir) => readdirSync(join(fixtureRoot, dir)).map((name) => join(fixtureRoot, dir, name)));

// ---- Round trip over every real fixture: byte-exact. ----

for (const file of fixtureFiles) {
  const text = readFileSync(file, "utf8");
  const parsed = parseFrontMatter(text);
  const lines = mergeFrontMatter(parsed, parsed.fields);
  const out = serializeFrontMatter(lines, parsed.body);
  test.assert(out === text, `round trip is byte-exact: ${file.split("/").pop()}`);
}

// ---- Values the two sites actually write. ----

const daily = parseFrontMatter(readFileSync(join(fixtureRoot, "aaronlau-daily", "2026-09-26-aigc-with-curation.md"), "utf8"));
test.assert(daily.fields.title === "差点被我屏蔽的 AIGC 网站" && daily.fields.date === "2026-09-26",
  "bare strings (titles, dates) come back as strings");
test.assert(JSON.stringify(daily.fields.tags) === JSON.stringify(["社会观察", "AI"]),
  "a flow list comes back as a string array");

const opaque = parseFrontMatter(readFileSync(join(fixtureRoot, "aaronlau-daily", "2018-03-24-hillside-shuttle.md"), "utf8"));
test.assert(opaque.opaqueKeys?.length === 1 && opaque.opaqueKeys[0] === "predictions",
  "a flow-mapping value (predictions) is parsed opaque");
test.assert(String(opaque.fields.predictions).includes('claim: "丰田 e-Palette 会在 2020 年东京奥运上路"'),
  "the opaque value surfaces as its raw text");

const appscope = parseFrontMatter(readFileSync(join(fixtureRoot, "appscope-posts", "13.md"), "utf8"));
test.assert(appscope.fields.cid === 13 && appscope.fields.slug === "13",
  "numbers come back as numbers and quoted strings stay strings");
test.assert(appscope.fields.date === "2012-02-26T02:42:00+08:00",
  "an ISO datetime with an offset is kept verbatim");

const noFrontMatter = parseFrontMatter("just a body, no block\n");
test.assert(noFrontMatter.body === "just a body, no block\n" && Object.keys(noFrontMatter.fields).length === 0,
  "a document without front-matter comes back whole as the body");

// ---- Multi-line lists (the third supported shape). ----

const multi = parseFrontMatter("---\ntags:\n  - 甲\n  - 乙\n---\n正文\n");
test.assert(JSON.stringify(multi.fields.tags) === JSON.stringify(["甲", "乙"]),
  "a multi-line list parses like a flow list");
test.assert(serializeFrontMatter(mergeFrontMatter(multi, multi.fields), multi.body) === "---\ntags:\n  - 甲\n  - 乙\n---\n正文\n",
  "a multi-line list survives the round trip in its original shape");

// ---- Edits: only the touched lines move. ----

const editedText = readFileSync(join(fixtureRoot, "aaronlau-daily", "2026-09-26-aigc-with-curation.md"), "utf8");
const edited = parseFrontMatter(editedText);
const changedLines = mergeFrontMatter(edited, { ...edited.fields, title: "新的标题" });
const changedOut = serializeFrontMatter(changedLines, edited.body);
const changedDiff = editedText.split("\n").filter((line, index) => line !== changedOut.split("\n")[index]);
test.assert(changedDiff.length === 1 && changedDiff[0].startsWith("title:"),
  "editing the title moves exactly the title line");
test.assert(changedOut.includes("title: 新的标题"), "the edited title is written");

const dropped = mergeFrontMatter(edited, { title: edited.fields.title });
test.assert(!serializeFrontMatter(dropped, edited.body).includes("slug:"),
  "a key the client omits is dropped (the desk sends the whole object)");

const added = mergeFrontMatter(edited, { ...edited.fields, held: true });
const addedOut = serializeFrontMatter(added, edited.body);
test.assert(addedOut.includes("held: true"), "a new key is appended canonically");

const warned = [];
const protectedMerge = mergeFrontMatter(edited, { ...edited.fields, voice: "client 改的" }, { protectedKeys: ["voice"], warnings: warned });
test.assert(!serializeFrontMatter(protectedMerge, edited.body).includes("client 改的") && warned.length === 1,
  "a readonly field is restored from the server copy, with a warning");

const opaqueMerge = mergeFrontMatter(opaque, { ...opaque.fields, predictions: "被面板改掉的话" }, { warnings: (warned.length = 0, warned) });
test.assert(serializeFrontMatter(opaqueMerge, opaque.body) === readFileSync(join(fixtureRoot, "aaronlau-daily", "2018-03-24-hillside-shuttle.md"), "utf8"),
  "an opaque value's client-side edit is discarded and the original bytes kept");

// ---- Canonical emission quotes what must be quoted. ----

const emitted = serializeFrontMatter(mergeFrontMatter(parseFrontMatter("---\n---\n"), {
  title: "带冒号：的标题",
  slug: "13",
  empty: "",
  list: ["plain 项", "needs: quotes"],
  count: 42,
  flag: false,
}), "正文");
test.assert(emitted.includes('slug: "13"') && emitted.includes('empty: ""'),
  "a numeric-looking string and an empty string are quoted on emit");
test.assert(emitted.includes("title: 带冒号：的标题"), "a fullwidth colon does not force quotes");
test.assert(emitted.includes("list: [plain 项, \"needs: quotes\"]"),
  "flow list items are quoted only when they need it");
test.assert(emitted.includes("count: 42") && emitted.includes("flag: false"),
  "numbers and booleans are emitted bare");

test.finish();
