// The outer Seatbelt profile apps/server wraps around the whole dsh process.
//
// dsh's own fence is a policy check in trusted code over a model-controlled
// path; with bash off, Seatbelt does not take part at all, reads are never
// fenced, /tmp and $TMPDIR are hard-coded writable roots, and one approved
// escalation means danger-full-access (spike report, Q2). This profile is the
// boundary instead, applied by the kernel to dsh and everything it spawns:
//
//   writes   denied everywhere except the run's shadow work dir and its TMPDIR
//            beside it (only the TMPDIR, which holds the proposal channel, for
//            a read-only grant), the run's own DSH_HOME, and /dev/null and
//            /dev/fd (never a terminal);
//            the roots work/, TMPDIR, the channel and DSH_HOME themselves
//            stay unwritable (no rename, rmdir or link in their place, and
//            no recreating one after the freeze moved it away); so do the
//            desk-tools channel <TMPDIR>/.ais6-desk and its ask/ and
//            answers/ folders, and nothing inside answers/ is the engine's
//            to write — only the server answers there (desk-tools.js);
//            /tmp and the rest of the disk
//            are refused, escalation or not. Inside DSH_HOME the configuration
//            dsh loads at boot (profiles/, the home cordis.patch.yml and .env)
//            is refused too, except the one root file dsh rewrites itself on
//            every boot.
//   reads    file contents under $HOME, /Users, /Volumes, /private/var/folders
//            and /private/tmp are refused, then the shadow work dir and
//            TMPDIR, the run's DSH_HOME, the dsh install, the patch files and
//            the Node runtime are allowed back (last match wins); system
//            locations stay readable so Node runs. Other runs' homes and
//            shadows stay refused. The proposal channel <TMPDIR>/.ais6-proposals
//            (the engine reaches it through the link work/.ais6-proposals;
//            the kernel matches the resolved path) is denied again after
//            those allowances: the engine may write a proposal there but
//            never read one back (not even its own). It sits outside work/ so
//            dsh's glob, which walks work/ with rg and does not follow links,
//            never meets an unreadable folder.
//   exec     only the Node binary and files inside the dsh install (ripgrep),
//            and the binaries a caller names in execAllow (Codex's read-only shell).
//   network  outbound is open for model providers and web tools (Seatbelt
//            cannot filter by host name). `localhost` in a Seatbelt rule
//            matches every address of this Mac (127/8, ::1, its LAN and
//            link-local addresses, 0.0.0.0), so all of them are closed except
//            the ports named here (LM Studio, a loopback proxy). Unix-domain
//            sockets are closed too (Docker's, an ssh agent's), except the
//            system resolver's, which DNS needs.
//
// Pure: it only builds the string, so contracts can read every rule.

"use strict";

const path = require("node:path");

const { DESK_NAME, PROPOSALS_NAME } = require("./shadow.js");

/**
 * Read-denied roots besides the writer's home: every user's folder, external
 * disks, and the per-user and shared temporary trees (other apps' caches and
 * scratch files live there). The engine's own subpaths are allowed back after
 * these denies; in SBPL the last matching rule wins.
 */
const DENIED_READ_ROOTS = Object.freeze(["/Users", "/Volumes", "/private/var/folders", "/private/tmp"]);

/** The one unix socket the engine may reach: the system resolver (DNS). */
const RESOLVER_SOCKET = "/private/var/run/mDNSResponder";

/** The dsh profile the engine boots (`--profile acp`). */
const DSH_PROFILE = "acp";

/**
 * Paths inside DSH_HOME the engine may not write: everything dsh reads as
 * configuration at boot. A `!!js` expression or an MCP server entry planted
 * there would run in a later boot with the provider key in its environment.
 * Each run has its own DSH_HOME (dsh-home.js), and these stay closed inside it.
 * @param {string} dshHome
 */
function dshConfigPaths(dshHome) {
  return {
    denied: [
      { kind: "subpath", path: path.join(dshHome, "profiles") },
      { kind: "literal", path: path.join(dshHome, "cordis.patch.yml") },
      { kind: "literal", path: path.join(dshHome, ".env") },
    ],
    // dsh rewrites the empty profile root on every boot (profile-boot.js
    // prepareProfile); it is an include anchor, and with hmr off nothing
    // reads it again during the run.
    rewritten: path.join(dshHome, "profiles", DSH_PROFILE, "cordis.yml"),
  };
}

/**
 * SBPL string literal. Paths come from the server, never from the model, but
 * a quote or backslash would still end the literal, so they are refused.
 * @param {string} value
 */
function sbplString(value) {
  const text = String(value || "");
  if (!text || /["\\\n\r\0]/.test(text)) {
    throw new Error(`Path cannot be placed in a sandbox profile: ${JSON.stringify(text)}`);
  }
  return `"${text}"`;
}

/**
 * @param {string} p
 */
function requireAbsolute(p) {
  if (!path.isAbsolute(String(p || ""))) throw new Error(`Sandbox paths must be absolute: ${p}`);
  return p;
}

/**
 * @typedef {object} SandboxProfileOptions
 * @property {string} home              the writer's real home (realpath)
 * @property {string} work              shadow work dir the engine runs in (realpath)
 * @property {string} tmp               TMPDIR beside the work dir; holds the proposal channel (realpath)
 * @property {string} dshHome           the run's own DSH_HOME (realpath)
 * @property {string} install           slim dsh install (realpath)
 * @property {string} node              Node binary (realpath)
 * @property {string[]} [patchFiles]    patch files read at boot (realpath)
 * @property {string[]} [extraReadable] more read-only subpaths (e.g. a Node prefix under $HOME)
 * @property {boolean} [readOnly]       only TMPDIR (with the channel) and DSH_HOME are writable
 * @property {number[]} [loopbackPorts] TCP ports on this Mac the engine may reach
 * @property {string[]} [denyWrite]     paths the engine may not write, create or
 *                                      rename onto even inside its own tree (the
 *                                      link to the writer's Codex login)
 * @property {boolean} [channelInWork]  the proposal channel is also a real folder at work/<channel> (Codex): writable even for a read grant
 * @property {readonly string[]} [execAllow]     more binaries the engine may exec (absolute
 *                                      paths; Codex's read-only shell commands)
 * @property {boolean} [closeOutbound]  every outbound connection is refused, the
 *                                      resolver included, but the loopback ports
 *                                      named: an engine whose only way out is
 *                                      the run's own egress filter (claude-code)
 */

/**
 * @param {SandboxProfileOptions} options
 * @returns {string}
 */
function buildSandboxProfile(options) {
  const home = requireAbsolute(options.home);
  const work = requireAbsolute(options.work);
  const tmp = requireAbsolute(options.tmp);
  const dshHome = requireAbsolute(options.dshHome);
  const install = requireAbsolute(options.install);
  const node = requireAbsolute(options.node);
  const patchFiles = (options.patchFiles || []).map(requireAbsolute);
  const extraReadable = (options.extraReadable || []).map(requireAbsolute);
  const ports = [...new Set((options.loopbackPorts || [])
    .map((port) => Number(port))
    .filter((port) => Number.isInteger(port) && port > 0 && port < 65536))];

  const proposalsDir = path.join(tmp, PROPOSALS_NAME);
  const deskDir = path.join(tmp, DESK_NAME);
  const workChannel = path.join(work, PROPOSALS_NAME);
  const writable = options.readOnly ? [tmp, proposalsDir, dshHome, ...(options.channelInWork ? [workChannel] : [])] : [work, tmp, dshHome];
  const config = dshConfigPaths(dshHome);
  const lines = [
    "(version 1)",
    "(allow default)",
    // Writes: nowhere, then the shadow and the run's DSH_HOME, but not the
    // configuration dsh loads at boot. A 只读 grant may still write the
    // proposal channel — offering candidates is not changing the folder.
    "(deny file-write*)",
    `(allow file-write* ${writable.map((p) => `(subpath ${sbplString(p)})`).join(" ")}`
      + ' (literal "/dev/null") (regex #"^/dev/fd/"))',
    // Terminals: the engine is started with pipes, so it needs no tty. Without
    // this it could open the writer's own terminal (the controlling /dev/tty,
    // or a /dev/ttys* node an ordinary user may open) to type into it or read
    // what the writer types, e.g. a sudo password (attack round 5, r5-tty).
    // Opening needs read and write, so denying both closes the node.
    '(deny file-read* file-write* (literal "/dev/tty") (literal "/dev/ptmx") (literal "/dev/console") (regex #"^/dev/(tty|pty)[a-z0-9]+$"))',
    `(deny file-write* ${config.denied.map((entry) => `(${entry.kind} ${sbplString(entry.path)})`).join(" ")})`,
    `(allow file-write* (literal ${sbplString(config.rewritten)}))`,
    // The roots themselves are not the engine's: `(subpath …)` above covers
    // the directory as well as its contents, so without this the engine
    // could rename or rmdir work/, tmp/ or the channel and leave a link in
    // its place for the server to follow after it exits (skeptic review
    // 2026-10-29). Writes inside them are unaffected (last match wins only
    // for these exact paths). DSH_HOME is one of them: the freeze renames it
    // to dsh-home-frozen/, and a survivor still carrying this profile could
    // otherwise make a fresh directory under the old name (attack round 5).
    `(deny file-write* ${[work, tmp, proposalsDir, dshHome, ...(options.channelInWork ? [workChannel] : [])].map((p) => `(literal ${sbplString(p)})`).join(" ")})`,
    // The desk-tools channel (desk-tools.js), in every profile: the engine
    // may drop a request into ask/, but the folders stay where the server
    // made them (or, ungranted, are never made), and answers/ is the server's
    // alone — no file, link or FIFO of the engine's can wait there for the
    // server's answer to land on.
    `(deny file-write* ${[deskDir, path.join(deskDir, "ask"), path.join(deskDir, "answers")].map((p) => `(literal ${sbplString(p)})`).join(" ")}`
      + ` (subpath ${sbplString(path.join(deskDir, "answers"))}))`,
    ...((options.denyWrite || []).length
      ? [`(deny file-write* ${(options.denyWrite || []).map(requireAbsolute).map((p) => `(literal ${sbplString(p)})`).join(" ")})`]
      : []),
    // Reads: nothing of the writer's own files or external disks, then the
    // engine's own tree back.
    `(deny file-read-data (subpath ${sbplString(home)}) ${DENIED_READ_ROOTS.map((p) => `(subpath ${sbplString(p)})`).join(" ")})`,
    `(allow file-read-data ${[work, tmp, dshHome, install, ...extraReadable].map((p) => `(subpath ${sbplString(p)})`).join(" ")}`
      + `${[node, ...patchFiles].map((p) => ` (literal ${sbplString(p)})`).join("")})`,
    // The proposal channel is write-only: after the work/ read allowance (last
    // match wins) its contents — the engine's own writes and anybody else's —
    // cannot be read back, not even by listing the directory. The kernel
    // enforces this; the engine's good behaviour is not part of it.
    `(deny file-read-data (subpath ${sbplString(proposalsDir)}))`,
    // LaunchServices: `(allow default)` leaves lsopen open, and an app bundle the
    // engine wrote into work/ could be opened by launchd outside this profile
    // (attack round 5, r5-lsopen). No lsopen, and nothing the engine can write
    // may be mapped as executable code (a dylib or bundle it built itself).
    "(deny lsopen)",
    `(deny file-map-executable ${[work, tmp, dshHome].map((p) => `(subpath ${sbplString(p)})`).join(" ")})`,
    // Exec: Node itself and the binaries dsh ships (ripgrep). No shell.
    "(deny process-exec*)",
    `(allow process-exec* (literal ${sbplString(node)}) (subpath ${sbplString(install)})${(options.execAllow || []).map(requireAbsolute).map((p) => ` (literal ${sbplString(p)})`).join("")})`,
    ...(options.closeOutbound
      // Nothing out but the named loopback ports: no internet host, no unix
      // socket, not even the resolver (the egress filter resolves names), so
      // the engine cannot step around its filter or speak DNS itself.
      ? ["(deny network-outbound)"]
      : [
        // This Mac: every one of its addresses is closed but for the named ports
        // (Seatbelt's `localhost` covers the LAN and link-local addresses too).
        '(deny network-outbound (remote ip "localhost:*"))',
        // Unix-domain sockets: closed but for the resolver.
        "(deny network-outbound (remote unix-socket))",
        `(allow network-outbound (literal ${sbplString(RESOLVER_SOCKET)}))`,
      ]),
  ];
  if (ports.length) {
    lines.push(`(allow network-outbound ${ports.map((port) => `(remote ip "localhost:${port}")`).join(" ")})`);
  }
  return lines.join("\n");
}

module.exports = { DENIED_READ_ROOTS, DSH_PROFILE, RESOLVER_SOCKET, buildSandboxProfile, dshConfigPaths, sbplString };
