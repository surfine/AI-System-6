// dsh keeps every session under DSH_HOME/sessions/<projectKey(cwd)>/ as a
// zstd JSONL that holds the writer's text, plus a projection cache keyed by
// session id. Discarding a run must remove both, or the writer's material
// outlives the shadow it came from (spike report, "不阻塞" notes).

"use strict";

const fs = require("node:fs");
const path = require("node:path");

/**
 * dsh-session-persistence-jsonl's projectKey (0.2.1-rc.3), reproduced so the
 * server can name the directory without loading dsh: separators become one
 * `-`, unsafe code units become `~XXXX`, and the key is wrapped in `--`.
 * @param {string} cwd
 */
function projectKey(cwd) {
  if (!cwd) throw new Error("cannot encode an empty project path");
  let readable = "";
  let separatorRun = false;
  for (let i = 0; i < cwd.length; i += 1) {
    const code = cwd.charCodeAt(i);
    const ch = String.fromCharCode(code);
    if (ch === "/" || ch === "\\" || ch === ":") {
      if (!separatorRun) readable += "-";
      separatorRun = true;
    } else if (ch !== "~" && /^[A-Za-z0-9._-]$/.test(ch)) {
      readable += ch;
      separatorRun = false;
    } else {
      readable += `~${code.toString(16).toUpperCase().padStart(4, "0")}`;
      separatorRun = false;
    }
  }
  return `--${(readable.replace(/^-+/, "") || "root").slice(0, 251)}--`;
}

/**
 * @param {string} dshHome
 * @param {string} cwd       the realpath the session was opened with
 * @param {string[]} sessionIds
 * @returns {string[]} what was removed
 */
function removeSessionsFor(dshHome, cwd, sessionIds = []) {
  const removed = [];
  const dir = path.join(dshHome, "sessions", projectKey(cwd));
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
    removed.push(dir);
  }
  const cache = path.join(dshHome, "storages", "session_projcache", "sessions");
  for (const id of sessionIds) {
    if (!/^[A-Za-z0-9-]{8,80}$/.test(String(id || ""))) continue;
    for (const name of fs.existsSync(cache) ? fs.readdirSync(cache) : []) {
      if (name === id || name.startsWith(`${id}.`)) {
        fs.rmSync(path.join(cache, name), { recursive: true, force: true });
        removed.push(path.join(cache, name));
      }
    }
  }
  return removed;
}

module.exports = { projectKey, removeSessionsFor };
