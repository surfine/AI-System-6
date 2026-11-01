// Put the writer's Anthropic API key into this Mac's Keychain, typed at the
// terminal prompt so it never enters shell history, the page, or a file.
// The account name is the id the server derives for the Anthropic endpoint
// (credential-vault.js createCredentialId), so /api/cloud/chat finds it with
// no id from the browser. `--remove` deletes the entry.

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createCredentialId } = require("../apps/server/server/credential-vault.js");
const { ANTHROPIC_BASE_URL } = require("../apps/server/server/anthropic-messages.js");

if (process.platform !== "darwin") {
  console.error("Keychain is macOS only. Elsewhere, start the server with ANTHROPIC_API_KEY set.");
  process.exit(1);
}

const service = "AI System 6 Cloud Credential";
const account = createCredentialId("anthropic", ANTHROPIC_BASE_URL);
const remove = process.argv.includes("--remove");

const args = remove
  ? ["delete-generic-password", "-s", service, "-a", account]
  : ["add-generic-password", "-U", "-s", service, "-a", account, "-l", "AI System 6 · Anthropic API", "-w"];
if (!remove) console.log("Paste your Anthropic API key at the prompt (it is not echoed).");
const result = spawnSync("/usr/bin/security", args, { stdio: "inherit" });
if (result.status !== 0) process.exit(result.status ?? 1);
console.log(remove
  ? "Removed the Anthropic key from Keychain."
  : "Saved. Press Check Status in Control Panel (a running server picks up a replaced key within 15 minutes, or at once after a restart).");
