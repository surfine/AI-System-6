// One More Tune — the bank check the design asks for before shipping.
//
// "提交前运行数据校验，验证所有启用题目拥有真实录音 ID、非空入出点、出点晚于入点、准确来源
// 及人工/可信听音审查记录", plus "题库中没有重复 ID" and "同一题四个选项唯一".
//
// Run it directly: node tooling/verify-one-more-tune-bank.mjs
// Exit status is 1 when anything it can prove is broken.

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const deck = require("../apps/server/server/one-more-tune.js");

const result = deck.validateBank();
const lines = [
  `deck version        ${result.deckVersion}`,
  `cards checked       ${result.checked}`,
  `enabled for play    ${result.enabled.length}${result.enabled.length ? ` (${result.enabled.join(", ")})` : ""}`,
  `problems            ${result.problems.length}`,
];
for (const problem of result.problems) lines.push(`  - ${problem}`);
if (!result.enabled.length) {
  lines.push("");
  lines.push("Nothing is enabled: no card has a reviewed asset, rights record and auditioned cue,");
  lines.push("so no question may be asked as a blind listening one. That is this bank's true state.");
}
process.stdout.write(`${lines.join("\n")}\n`);
process.exit(result.problems.length ? 1 : 0);
