// 文思泉涌 P5 · 预言账本.
//
// A prediction is a block list inside the front-matter, and the desk's general
// parser cannot round-trip it — which is why it is opaque and the adapter
// refuses to overwrite it. The ledger therefore reads the block itself, and a
// verdict changes one `status:` line: everything else in the manuscript is
// copied through byte for byte, in the spelling the file already uses.

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createRequire } from "node:module";

import { createFeatureTest } from "../helpers/feature-test-harness.mjs";

const require = createRequire(import.meta.url);
const test = createFeatureTest("wensi-d-predictions");

const predictions = require("../../apps/server/server/lib/blog-sites/predictions.js");
const frontMatter = require("../../apps/server/server/lib/blog-sites/front-matter.js");

const root = mkdtempSync(join(tmpdir(), "wensi-pred-"));
const postsDir = join(root, "posts");
const longformDir = join(root, "longform");
mkdirSync(postsDir, { recursive: true });
mkdirSync(longformDir, { recursive: true });

const twoPredictions = `---
title: M1 还能更新到哪一年
date: 2026-09-21
slug: m1-support
description: 一句话。
tags: [Mac, 预言账本]
predictions:
  - made: 2026-09-20
    claim: macOS 28 是最后一个支持 M1 芯片 Mac 的版本
    status: 待定
  - made: 2026-04-04
    claim: macOS 27 会成为最后一个兼容 M1 系列芯片的版本
    status: 落空
---

正文第一段。

正文第二段。
`;

const englishOne = `---
title: A watch prediction
date: 2025-01-02
slug: watch
predictions:
  - id: 250102-1
    made: 2025-01-01
    claim: The next watch will keep the same band system
    status: pending
    confidence: 0.7
---

Body.
`;

const malformed = `---
title: 少了 claim 的一条
date: 2024-05-05
predictions:
  - made: 2024-05-04
    status: 待定
---

Body.
`;

writeFileSync(join(postsDir, "2026-09-21-m1-support.md"), twoPredictions);
writeFileSync(join(postsDir, "2025-01-02-watch.md"), englishOne);
writeFileSync(join(postsDir, "2024-05-05-malformed.md"), malformed);
writeFileSync(join(postsDir, "2024-01-01-no-predictions.md"), "---\ntitle: 没有预言\ndate: 2024-01-01\n---\n\n正文。\n");

const site = {
  schema: 1,
  id: "probe",
  label: "probe",
  channel: { root },
  contentTypes: {
    daily: { label: "日更", storage: { kind: "file-per", dir: postsDir }, fields: [] },
    longform: { label: "长文", storage: { kind: "file-per", dir: longformDir }, fields: [] },
  },
};

// The reason this module exists, pinned as a fact: the shared parser flattens
// the block list, so the value is opaque and the adapter protects it.
const parsed = frontMatter.parseFrontMatter(twoPredictions);
test.assert(parsed.opaqueKeys.includes("predictions"), "the shared front-matter parser marks predictions opaque");

// ---- the ledger ----

const view = predictions.ledger(site);
test.assert(view.summary.total === 3 && view.summary.pending === 2 && view.summary.miss === 1 && view.summary.hit === 0,
  "the ledger counts every prediction it can read");
const chinese = view.entries.find((entry) => entry.file === "2026-09-21-m1-support.md");
test.assert(chinese && chinese.title === "M1 还能更新到哪一年" && chinese.claim.startsWith("macOS 28"), "an entry carries its post's title and the claim");
test.assert(view.entries[0].status === "pending", "the undecided ones come first");
test.assert(view.entries[0].made <= view.entries[1].made || view.entries[0].file === view.entries[1].file,
  "among the undecided, the oldest made date first");
const english = view.entries.find((entry) => entry.file === "2025-01-02-watch.md");
test.assert(english.id === "250102-1" && english.status === "pending" && english.confidence === "0.7", "an explicit id and confidence survive");
test.assert(view.errors.some((entry) => entry.reason === "claim_missing"), "an item without a claim is reported, not silently dropped");
test.assert(!view.entries.some((entry) => entry.file === "2024-01-01-no-predictions.md"), "a post with no predictions is not in the ledger");

// ---- the verdict: one line, nothing else ----

const settled = predictions.settle(site, { file: "2026-09-21-m1-support.md", index: 0, status: "hit" });
test.assert(settled.ok === true && settled.from === "待定" && settled.to === "应验", "a Chinese status is written back in Chinese");
const after = readFileSync(join(postsDir, "2026-09-21-m1-support.md"), "utf8");
const changedLines = after.split("\n").filter((line, index) => line !== twoPredictions.split("\n")[index]);
test.assert(changedLines.length === 1 && changedLines[0].trim() === "status: 应验", "exactly one line changed, and it is the status");
test.assert(after.includes("status: 落空"), "the other prediction's verdict did not move");
test.assert(after.includes("正文第一段。") && after.includes("predictions:"), "the manuscript and the block survived the write");

const second = predictions.settle(site, { file: "2026-09-21-m1-support.md", index: 1, status: "pending" });
test.assert(second.to === "待定" && readFileSync(join(postsDir, "2026-09-21-m1-support.md"), "utf8").includes("status: 待定"),
  "a verdict can be revised");
predictions.settle(site, { file: "2025-01-02-watch.md", id: "250102-1", status: "miss" });
test.assert(readFileSync(join(postsDir, "2025-01-02-watch.md"), "utf8").includes("status: miss"),
  "an English file keeps English spelling");
test.assert(readFileSync(join(postsDir, "2025-01-02-watch.md"), "utf8").includes("confidence: 0.7"),
  "the rest of the item is untouched");

const refreshed = predictions.ledger(site);
test.assert(refreshed.summary.hit === 1 && refreshed.summary.miss === 1 && refreshed.summary.pending === 1,
  "the ledger reads the verdicts back");

// ---- refusals ----

let code = "";
try { predictions.settle(site, { file: "2026-09-21-m1-support.md", index: 0, status: "maybe" }); } catch (error) { code = error.code; }
test.assert(code === "bad_status", "an unknown verdict is refused");
try { predictions.settle(site, { file: "../posts/2025-01-02-watch.md", index: 0, status: "hit" }); } catch (error) { code = error.code; }
test.assert(code === "bad_file", "a path is refused — the directory comes from the description");
try { predictions.settle(site, { file: "nope.md", index: 0, status: "hit" }); } catch (error) { code = error.code; }
test.assert(code === "article_missing", "an unknown article is a named refusal");
try { predictions.settle(site, { file: "2024-01-01-no-predictions.md", index: 0, status: "hit" }); } catch (error) { code = error.code; }
test.assert(code === "predictions_missing", "a post without predictions says so");
try { predictions.settle(site, { file: "2026-09-21-m1-support.md", id: "999999", status: "hit" }); } catch (error) { code = error.code; }
test.assert(code === "prediction_missing", "an unknown id is a named refusal");

// A status written with quotes keeps its quoting.
writeFileSync(join(longformDir, "2026-01-01-quoted.md"), `---
title: Quoted
date: 2026-01-01
predictions:
  - made: 2026-01-01
    claim: A claim
    status: "pending"
---

Body.
`);
predictions.settle(site, { file: "2026-01-01-quoted.md", index: 0, status: "hit" });
test.assert(readFileSync(join(longformDir, "2026-01-01-quoted.md"), "utf8").includes('status: "hit"'),
  "a quoted status stays quoted");

rmSync(root, { recursive: true, force: true });
test.finish();
