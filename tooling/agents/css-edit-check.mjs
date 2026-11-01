#!/usr/bin/env node
// Claude Code PostToolUse hook: when an Edit/Write lands in apps/desktop/styles/,
// run the static CSS budgets for that one file and hand any failure straight
// back to the model as the tool's feedback. The budgets already exist
// (tooling/verify-css.mjs); what was missing is that nothing ran them unless
// the agent remembered to. A hook runs on every edit, so the rule no longer
// depends on memory. Exit 0 always: a hook failure must not block editing.
import { spawnSync } from "node:child_process";
import { relative, resolve } from "node:path";

let text = "";
for await (const chunk of process.stdin) text += chunk;
let input;
try { input = JSON.parse(text); } catch { process.exit(0); }

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const edited = input?.tool_input?.file_path || input?.tool_input?.path;
if (typeof edited !== "string") process.exit(0);
const rel = relative(root, resolve(root, edited)).replaceAll("\\", "/");
if (!/^apps\/desktop\/styles\/[^/]+\.css$/.test(rel)) process.exit(0);

const result = spawnSync(process.execPath, ["tooling/verify-css.mjs", "--file", rel], {
  cwd: root, encoding: "utf8", timeout: 25000,
});
if (result.status === 0) process.exit(0);

const lines = `${result.stdout}\n${result.stderr}`.split("\n").filter((line) => line.startsWith("NO "));
const reason = [
  `verify:css failed for ${rel} after this edit:`,
  ...lines.slice(0, 8).map((line) => `  ${line.replace(/^NO\s+/, "")}`),
  lines.length > 8 ? `  …and ${lines.length - 8} more` : "",
  "Fix the cause (specificity, token placement, owner file) rather than raising tooling/css-budget.json; run `node tooling/verify-css.mjs --file " + rel + "` to re-check, and `npm run verify:cascade` before committing.",
].filter(Boolean).join("\n");
process.stdout.write(`${JSON.stringify({ decision: "block", reason })}\n`);
process.exit(0);
