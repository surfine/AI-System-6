// Release doctor: every check that has refused a release in the wild, run in
// seconds instead of twenty minutes into the pipeline. 失败在这里 = 几秒钟
// 改完重跑；失败在流水线里 = 半小时起步。
//
//   npm run release:doctor
//
// Checks (grown from the 1.0.59 release's actual refusal log):
//   1. wrangler auth        — Cloudflare token live (--web/--pages refuse here)
//   2. gh auth              — GitHub Release publishing needs it
//   3. CHANGELOG parity     — latest "## Public Beta x.y.z" === package version
//   4. zh twins for new docs— every canonical doc has a .zh-CN.md with fresh
//                             source-hash markers (docs:sync-hashes fixes)
//   5. readme payload sync  — README quotes the measured public-tree bytes
//   6. dirty tree           — the release freezes HEAD; uncommitted work is a
//                             refusal (and swept-in foreign files are worse)
//   (the old check 7, appearance token drift, left with the pixel gates)
import { execSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const problems = [];
const note = (text) => console.log(`  · ${text}`);

function sh(command, args, opts = {}) {
  return spawnSync(command, args, { encoding: "utf8", cwd: root, ...opts });
}

// 1. wrangler auth (only matters when --web/--pages are requested, but a
// dead token is better learned now than argued with later).
const wrangler = sh("npx", ["wrangler", "whoami"]);
const wranglerOut = String(wrangler.stdout || "") + String(wrangler.stderr || "");
if (wrangler.status === 0 && wranglerOut.includes("You are logged in")) {
  note("wrangler: logged in");
} else {
  problems.push("wrangler 未登录或令牌过期 —— --web/--pages 会在预检拒绝。运行 `npx wrangler login` 或设置 CLOUDFLARE_API_TOKEN。");
}

// 2. gh auth.
const gh = sh("gh", ["auth", "status"]);
const ghOut = String(gh.stdout || "") + String(gh.stderr || "");
if (gh.status === 0 && ghOut.includes("Logged in")) {
  note("gh: logged in");
} else {
  problems.push("gh 未登录 —— --github 无法发布 Release。运行 `gh auth login`。");
}

// 3. CHANGELOG latest Public Beta === package version.
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const changelog = readFileSync(join(root, "CHANGELOG.md"), "utf8");
const betas = [...changelog.matchAll(/^## Public Beta (\d+\.\d+\.\d+)/gm)].map((m) => m[1]);
const latestBeta = betas[betas.length - 1];
if (latestBeta === pkg.version) {
  note(`changelog: latest Public Beta ${latestBeta} === package version`);
} else {
  problems.push(`CHANGELOG 最新 Public Beta (${latestBeta || "无"}) ≠ package.json 版本 (${pkg.version})。先写发布说明再 bump 版本。`);
}

// 4. zh twins: every canonical markdown doc under docs/ and
// internal/operations has a .zh-CN.md, and a stale hash marker means the
// English moved without `npm run docs:sync-hashes`. --require-fresh is what
// makes the stale half a failure here: the gate reports it by default so the
// development loop does not pay a resync per English edit, and this doctor is
// one of the two places that wants the old guarantee.
const localeCheck = sh("node", ["tooling/verify-doc-locales.mjs", "--require-fresh"]);
if (localeCheck.status === 0) {
  note("doc locales: all zh twins present with fresh hashes");
} else {
  problems.push("文档双语孪生缺失或哈希过期 —— 运行 `npm run docs:sync-hashes` 后按 verify-doc-locales 的输出补齐。");
}

// 5. readme payload sync.
const readme = readFileSync(join(root, "README.md"), "utf8");
const snapshotBudget = JSON.parse(readFileSync(join(root, "tooling/public-tree-budget.json"), "utf8"));
// The README states the budget, not the measured payload (2026-10-15): the
// number a release must get right is the invariant, and it moves only with the
// manifest. The measured bytes are in site/data/floppy-budget.json.
const budgetBytes = (() => {
  try { return JSON.parse(readFileSync(join(root, "site/data/floppy-budget.json"), "utf8")).budgetBytes; } catch { return 0; }
})();
if (budgetBytes && readme.includes(budgetBytes.toLocaleString("en-US"))) {
  note(`readme states the System Floppy Budget (${budgetBytes.toLocaleString("en-US")} bytes)`);
} else {
  problems.push(`README 没有写明系统软盘预算（${budgetBytes || "?"} 字节）；README 只承诺预算，不引用实测载荷。`);
}

// 6. dirty tree.
const status = sh("git", ["status", "--short"]);
const dirty = String(status.stdout || "").split("\n").filter((line) => line.trim() && !line.includes("creator-blueprint") && !line.startsWith("?? .zcode"));
if (!String(status.stdout || "").trim()) {
  note("git: clean tree");
} else if (dirty.length) {
  problems.push(`工作树不干净（${dirty.length} 个文件）—— 发版冻结 HEAD，未提交的工作会丢失或被拒绝。先提交。`);
}

// The appearance-drift tripwire that stood here (stylesheets newer than the last
// baseline) is gone with the pixel gates it guarded; see RELEASE.md "Removed from
// the release gate".

console.log(`\nrelease-doctor: ${problems.length ? problems.length + " 个问题" : "全部通过"}`);
if (problems.length) {
  problems.forEach((problem) => console.error(`NO  ${problem}`));
  console.error("\n先修复以上问题再发版 —— 每一项在流水线里都会变成十几分钟的等待。");
  process.exit(1);
}
console.log("发布预检通过：可以发版。");
