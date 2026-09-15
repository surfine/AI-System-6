#!/usr/bin/env node

/**
 * Run a command against the bytes the release of HEAD will build.
 *
 * Two commands need this and cannot get it from a plain `npm run`: the
 * appearance baseline capture and the token-delta capture. Both photograph or
 * measure the built app, and a release builds the app with
 * `AI_SYSTEM6_SOURCE_COMMIT` set — which is compiled into two tracked generated
 * files that every gate treats as an input. A baseline captured without the
 * stamp describes bytes no release ever runs, which is exactly the mismatch
 * `verify:gate --release-stamp` exists to prevent on the other side.
 *
 *   node tooling/with-release-stamp.mjs npm run snapshot:appearance
 *
 * The tree is stamped, the command runs, and the stamp comes back out — so the
 * command cannot leave a stamped `build-info` behind for someone to commit by
 * accident. A dirty tree is refused: a stamp names a commit, and a tree with
 * uncommitted work does not hold that commit's bytes.
 */

import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { STAMPED_PATHS, applyReleaseStamp, describeStampRefusal } from "./lib/release-stamp.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const command = process.argv.slice(2).filter((argument) => argument !== "--");

if (!command.length) {
  console.error("Usage: node tooling/with-release-stamp.mjs <command> [args…]");
  console.error("       node tooling/with-release-stamp.mjs npm run snapshot:appearance");
  process.exit(1);
}

let stamped = applyReleaseStamp(repositoryRoot);
if (!stamped.ok) {
  console.error(`NO  the release stamp was refused: ${describeStampRefusal(stamped.reason)}`);
  process.exit(1);
}
console.log(
  `[with-release-stamp] built as the release of ${stamped.sourceCommit.slice(0, 12)} will build it.`,
);

// Whatever happens next, the stamp comes back out — an exit, a signal, or the
// command's own end. A tree left stamped is a dirty tree, and the release
// preflight refuses to release from one.
//
// The check is about the two stamped files, not about the whole tree: the
// capture this exists for rewrites 37 tracked PNG files on purpose, and their
// presence is the result, not a stamp left behind.
function stampedFilesAreBack() {
  const status = spawnSync("git", ["status", "--porcelain=v1", "--", ...STAMPED_PATHS], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  return status.status === 0 && status.stdout.trim() === "";
}

function restore() {
  if (!stamped) return;
  const restored = stamped.restore();
  stamped = null;
  if (restored.ok) console.log("[with-release-stamp] the working tree is back to the committed bundle.");
  else if (stampedFilesAreBack()) {
    console.log(
      "[with-release-stamp] the two generated files are back to the committed bundle;"
      + " the rest of the tree holds this command's own output.",
    );
  }
  else {
    console.error(`[with-release-stamp] the release stamp could NOT be removed (${restored.reason}).`);
    console.error("[with-release-stamp] run `npm run build:app` before committing; the tree is dirty until you do.");
  }
}
process.on("exit", restore);
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => {
    restore();
    process.exit(130);
  });
}

const [executable, ...args] = command;
const child = spawn(executable, args, { cwd: repositoryRoot, stdio: "inherit" });
child.on("error", (error) => {
  console.error(`[with-release-stamp] could not start ${executable}: ${error.message}`);
  process.exit(1);
});
child.on("close", (code) => {
  restore();
  // The command's verdict is the point; a stamp that could not be removed is
  // reported above and leaves a dirty tree, which the release preflight refuses
  // anyway, so it does not also have to invent a second exit code.
  process.exit(code === null ? 1 : code);
});
