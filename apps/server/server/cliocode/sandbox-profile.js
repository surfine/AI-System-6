// The Seatbelt profile apps/server wraps around a ClioCode run.
//
// Same shape as agent/sandbox-profile.js (a pure SBPL string the kernel
// applies to dsh and everything it spawns), tuned for a code folder edited in
// place rather than a prose shadow (docs/CLIOCODE-DESIGN.md, "The Seatbelt
// profile for a code folder"):
//
//   writes   denied everywhere except the project folder and the run's temp
//            dir (TMPDIR and the package-manager caches), plus /dev/null and
//            /dev/fd — never a terminal;
//   reads    open: a code folder reads system libraries, the toolchain,
//            ~/.gitconfig, ~/.npmrc, Node under nvm or volta. The writer's
//            secret stores are refused (SECRET_READ_DENYLIST: ~/.ssh, the
//            Keychains, credential files), by their own path and, through
//            resolveSecretPaths, by where a link there points;
//   exec     the OS tool roots and the developer's real toolchain, resolved at
//            profile-build time (resolveToolchain): node, npm, npx, git and the
//            shells found on the PATH the child gets, each by its found path,
//            its realpath and the install it belongs to. Nothing under the
//            project folder or the temp dir may exec, whatever a root covers;
//   mapping  only the OS libraries and that same toolchain may be mapped as
//            executable code; never anything under the project or the temp;
//   lsopen   closed: an app bundle written into the folder must not be opened
//            by launchd outside this profile;
//   network  all outbound is closed — public hosts, every address of this Mac,
//            unix-domain sockets, the DNS resolver — except one loopback port:
//            the egress filter (cliocode/egress.js), which resolves names
//            itself and admits only allowlisted hosts on 443.
//
// buildCodeSandboxProfile is pure, so contracts can read every rule;
// resolveToolchain and resolveSecretPaths read the disk and are kept apart.
// Running a command outside the sandbox is not a widening of this profile: it
// is a separate unwrapped child the writer approves each time (M9.5).

"use strict";

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const { sbplString } = require("../agent/sandbox-profile.js");

/** Reads refused although reads are otherwise open: the writer's secrets, relative to home. */
const SECRET_READ_DENYLIST = Object.freeze([
  ".ssh",
  ".gnupg",
  "Library/Keychains",
  "Library/Application Support/com.apple.TCC",
  ".config/gh/hosts.yml",
  ".config/glab-cli",
  ".config/git/credentials",
  ".git-credentials",
  ".aws/credentials",
  ".docker/config.json",
  ".kube/config",
  ".netrc",
]);

/** OS-owned exec roots (SIP-protected; /usr/bin/env runs every `#!` script). */
const SYSTEM_EXEC_ROOTS = Object.freeze(["/usr/bin", "/bin", "/usr/sbin", "/sbin"]);

/** OS-owned library roots that may be mapped as code (the dyld shared cache lives in the cryptexes). */
const SYSTEM_MAP_ROOTS = Object.freeze([
  "/usr/lib",
  "/usr/libexec",
  "/System/Library",
  "/System/iOSSupport",
  "/System/Cryptexes",
  "/System/Volumes/Preboot/Cryptexes",
  "/Library/Apple",
  "/private/var/db/dyld",
]);

/** Developer dirs /usr/bin/git and friends hand over to when xcode-select says nothing. */
const DEFAULT_DEVELOPER_DIRS = Object.freeze([
  "/Library/Developer/CommandLineTools",
  "/Applications/Xcode.app/Contents/Developer",
]);

/** The commands whose real install the profile lets exec. */
const TOOLCHAIN_COMMANDS = Object.freeze(["node", "npm", "npx", "git", "sh", "bash", "zsh"]);

/**
 * Version managers whose PATH entry is a dispatcher, not the tool: the shim
 * picks the real binary at run time, so its realpath does not name it. When a
 * resolved command was found under one of these homes, its install trees are
 * allowed too. (nvm and fnm put the real Node directory on PATH — fnm through
 * a linked multishell dir — so realpath alone covers them.)
 */
const SHIM_MANAGERS = Object.freeze([
  { name: "volta", homeEnv: "VOLTA_HOME", home: ".volta", roots: ["bin", "tools/image"] },
  { name: "asdf", homeEnv: "ASDF_DATA_DIR", home: ".asdf", roots: ["shims", "bin", "lib", "libexec", "installs"] },
  { name: "mise", homeEnv: "MISE_DATA_DIR", home: ".local/share/mise", roots: ["shims", "installs"] },
]);

/** Homebrew prefixes; one counts when a resolved command lives under it and it has a Cellar. */
const HOMEBREW_PREFIXES = Object.freeze(["/opt/homebrew", "/usr/local"]);

/** @param {string} p */
function requireAbsolute(p) {
  if (!path.isAbsolute(String(p || ""))) throw new Error(`Sandbox paths must be absolute: ${p}`);
  return p;
}

/** @param {string} child @param {string} parent */
function isInside(child, parent) {
  const rel = path.relative(parent, child);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
}

/** @param {string} p */
function realpathOrNull(p) {
  try {
    return fs.realpathSync(p);
  } catch {
    return null;
  }
}

/** @param {string} p */
function isDirectory(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/** @param {string} p */
function isExecutableFile(p) {
  try {
    if (!fs.statSync(p).isFile()) return false;
    fs.accessSync(p, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * `command -v <name>` over `dirs`, done in JS: the first hit execvp gets on
 * that PATH, without running a shell and its rc files.
 * @param {string} name
 * @param {string[]} dirs
 */
function findOnPath(name, dirs) {
  for (const dir of dirs) {
    const candidate = path.join(dir, name);
    if (isExecutableFile(candidate)) return candidate;
  }
  return null;
}

/**
 * The npm package a file belongs to (…/node_modules/<pkg> or
 * …/node_modules/@scope/<pkg>), e.g. npm-cli.js → the npm package.
 * @param {string} file
 */
function packageRoot(file) {
  const parts = file.split(path.sep);
  const at = parts.lastIndexOf("node_modules");
  if (at < 0) return null;
  const end = parts[at + 1]?.startsWith("@") ? at + 3 : at + 2;
  return end < parts.length ? parts.slice(0, end).join(path.sep) : null;
}

/**
 * The install a resolved binary belongs to: its npm package, or — for
 * <prefix>/bin/<tool> — the prefix's bin/ and libexec/ (git's helpers live in
 * libexec/git-core), and for Node its global packages (<prefix>/lib/node_modules:
 * npm, npx, corepack, global CLIs). / and /usr are SYSTEM_EXEC_ROOTS already.
 * @param {string} real
 */
function installRoots(real) {
  const pkg = packageRoot(real);
  if (pkg) return [pkg];
  const dir = path.dirname(real);
  if (path.basename(dir) !== "bin") return [];
  const prefix = path.dirname(dir);
  if (prefix === "/" || prefix === "/usr") return [];
  const roots = [path.join(prefix, "bin"), path.join(prefix, "libexec")];
  if (path.basename(real) === "node") roots.push(path.join(prefix, "lib", "node_modules"));
  return roots;
}

/**
 * The Homebrew prefix a command came from: bin/ (links), Cellar/ (the kegs
 * the links resolve into) and lib/node_modules (Homebrew npm's globals).
 * @param {string[]} paths  the command's found path and realpath
 * @param {NodeJS.ProcessEnv} env
 */
function homebrewRoots(paths, env) {
  const prefixes = new Set([env.HOMEBREW_PREFIX, ...HOMEBREW_PREFIXES].filter((p) => p && path.isAbsolute(p)));
  for (const prefix of prefixes) {
    if (!paths.some((p) => isInside(p, prefix)) || !isDirectory(path.join(prefix, "Cellar"))) continue;
    return ["bin", "sbin", "Cellar", "lib/node_modules"].map((rel) => path.join(prefix, rel));
  }
  return [];
}

/**
 * The install trees of a shim manager the command was found through.
 * @param {string[]} paths  the command's found path and realpath
 * @param {string} home
 * @param {NodeJS.ProcessEnv} env
 */
function shimManagerRoots(paths, home, env) {
  const roots = [];
  for (const manager of SHIM_MANAGERS) {
    const configured = env[manager.homeEnv] || (home ? path.join(home, manager.home) : "");
    if (!configured || !path.isAbsolute(configured)) continue;
    const managerHome = realpathOrNull(configured) || configured;
    if (!paths.some((p) => isInside(p, configured) || isInside(p, managerHome))) continue;
    for (const rel of manager.roots) roots.push(path.join(managerHome, rel));
  }
  return roots;
}

/**
 * The developer dir /usr/bin/git, cc, make … hand over to (DEVELOPER_DIR,
 * xcode-select -p), plus the defaults.
 * @param {NodeJS.ProcessEnv} env
 */
function developerDirs(env) {
  const dirs = [];
  let selected = String(env.DEVELOPER_DIR || "").trim();
  if (!selected && process.platform === "darwin") {
    const probe = spawnSync("/usr/bin/xcode-select", ["-p"], { encoding: "utf8" });
    selected = probe.status === 0 ? String(probe.stdout || "").trim() : "";
  }
  if (selected && path.isAbsolute(selected)) dirs.push(realpathOrNull(selected) || selected);
  return [...dirs, ...DEFAULT_DEVELOPER_DIRS];
}

/**
 * @typedef {object} Toolchain
 * @property {string} path        the PATH to give the sandboxed child — the one every lookup used
 * @property {string[]} literals  exec literals: each command's found path and its realpath
 * @property {string[]} roots     exec subpaths: the OS roots, the developer dir, each command's install
 * @property {Record<string, {found: string, real: string}>} commands  what was resolved, for a report
 */

/**
 * Resolve the developer's real toolchain at profile-build time, so the exec
 * allowlist names what will actually run rather than a fixed list of bin/
 * folders. Per command (node, npm, npx, git, sh, bash, zsh, the running Node,
 * $SHELL):
 *   1. find it on the PATH the child will get (the running Node's directory
 *      first, so `node` inside the sandbox is this Node; relative entries are
 *      dropped);
 *   2. allow its found path and its realpath (Seatbelt matches the resolved
 *      file: /opt/homebrew/bin/npm is a link to …/node_modules/npm/bin/npm-cli.js);
 *   3. allow the install it belongs to (installRoots), the Homebrew prefix it
 *      came from, and a volta/asdf/mise shim manager's install trees.
 * The OS roots and the selected developer dir are always allowed. Missing
 * commands and folders are skipped.
 * @param {object} options
 * @param {string} options.node     the running Node binary (process.execPath)
 * @param {string} [options.path]   the PATH to search (normally process.env.PATH)
 * @param {string} [options.home]   the writer's home (default shim-manager homes)
 * @param {string} [options.shell]  the login shell ($SHELL)
 * @param {NodeJS.ProcessEnv} [options.env]  HOMEBREW_PREFIX, VOLTA_HOME, ASDF_DATA_DIR, MISE_DATA_DIR, DEVELOPER_DIR
 * @returns {Toolchain}
 */
function resolveToolchain(options) {
  const node = requireAbsolute(options.node);
  const env = options.env || {};
  const home = options.home || "";
  const dirs = [...new Set([path.dirname(node), ...String(options.path || "").split(path.delimiter)])]
    .filter((dir) => path.isAbsolute(dir));

  const entries = TOOLCHAIN_COMMANDS.map((name) => [name, findOnPath(name, dirs)]);
  entries.push(["node (running)", node]);
  if (options.shell && path.isAbsolute(options.shell)) entries.push(["$SHELL", options.shell]);

  const literals = new Set();
  const roots = new Set([...SYSTEM_EXEC_ROOTS, ...developerDirs(env)]);
  /** @type {Toolchain["commands"]} */
  const commands = {};
  for (const [name, found] of entries) {
    const real = found && realpathOrNull(found);
    if (!real) continue;
    commands[name] = { found, real };
    literals.add(found);
    literals.add(real);
    for (const root of [...installRoots(real), ...homebrewRoots([found, real], env), ...shimManagerRoots([found, real], home, env)]) {
      roots.add(root);
    }
  }
  return {
    path: dirs.join(path.delimiter),
    literals: [...literals],
    roots: [...roots].filter((root) => isDirectory(root)),
    commands,
  };
}

/**
 * The secret stores to refuse reading, as the kernel will see them: each
 * SECRET_READ_DENYLIST entry under `home`, its realpath when it is (or sits
 * under) a link, and the realpath of every link directly inside a denied
 * directory (a dotfile manager links ~/.ssh/config into its own tree, and
 * Seatbelt matches the resolved file).
 * @param {string} home the writer's home (realpath)
 * @returns {string[]}
 */
function resolveSecretPaths(home) {
  requireAbsolute(home);
  const out = new Set();
  for (const rel of SECRET_READ_DENYLIST) {
    const lexical = path.join(home, rel);
    out.add(lexical);
    const real = realpathOrNull(lexical);
    if (real) out.add(real);
    if (!real || !isDirectory(real)) continue;
    let names = [];
    try { names = fs.readdirSync(real); } catch {}
    for (const name of names) {
      const child = path.join(real, name);
      try {
        if (!fs.lstatSync(child).isSymbolicLink()) continue;
      } catch {
        continue;
      }
      const target = realpathOrNull(child);
      if (target) out.add(target);
    }
  }
  return [...out];
}

/**
 * @typedef {object} CodeSandboxOptions
 * @property {string} project           the code folder, writable in place (realpath)
 * @property {string} tmp               the run's temp dir beside it; TMPDIR + caches (realpath)
 * @property {string} home              the writer's home (realpath), for the secret denylist
 * @property {string} node              the Node binary (realpath)
 * @property {string[]} [secretPaths]   reads to refuse (resolveSecretPaths); default the denylist under home
 * @property {string[]} [execLiterals]  exec literals (resolveToolchain().literals)
 * @property {string[]} [execRoots]     exec subpaths (resolveToolchain().roots); SYSTEM_EXEC_ROOTS always
 * @property {string[]} [extraExec]     more exec roots (the dsh install)
 * @property {number[]} [loopbackPorts] TCP ports on this Mac the run may reach (the egress filter's)
 */

/**
 * Build the Seatbelt profile for a ClioCode run over `project`.
 * @param {CodeSandboxOptions} options
 * @returns {string}
 */
function buildCodeSandboxProfile(options) {
  const project = requireAbsolute(options.project);
  const tmp = requireAbsolute(options.tmp);
  const home = requireAbsolute(options.home);
  const node = requireAbsolute(options.node);
  const secretPaths = [...new Set((options.secretPaths || SECRET_READ_DENYLIST.map((rel) => path.join(home, rel))).map(requireAbsolute))];
  const execLiterals = [...new Set([node, ...(options.execLiterals || []).map(requireAbsolute)])];
  const execRoots = [...new Set([
    ...SYSTEM_EXEC_ROOTS,
    ...(options.execRoots || []).map(requireAbsolute),
    ...(options.extraExec || []).map(requireAbsolute),
  ])];
  const ports = [...new Set((options.loopbackPorts || [])
    .map((port) => Number(port))
    .filter((port) => Number.isInteger(port) && port > 0 && port < 65536))];

  const writable = [project, tmp].map((p) => `(subpath ${sbplString(p)})`).join(" ");
  const toolchain = `${execLiterals.map((p) => ` (literal ${sbplString(p)})`).join("")}${execRoots.map((p) => ` (subpath ${sbplString(p)})`).join("")}`;
  const lines = [
    "(version 1)",
    "(allow default)",
    // Writes: nowhere, then the project folder and the run's temp.
    "(deny file-write*)",
    `(allow file-write* ${writable} (literal "/dev/null") (regex #"^/dev/fd/"))`,
    // Terminals: the engine runs on pipes; it may not open the writer's
    // terminal to type into it or read what the writer types.
    '(deny file-read* file-write* (literal "/dev/tty") (literal "/dev/ptmx") (literal "/dev/console") (regex #"^/dev/(tty|pty)[a-z0-9]+$"))',
    // Reads are open for a code folder, except the writer's secret stores.
    `(deny file-read* ${secretPaths.map((p) => `(subpath ${sbplString(p)})`).join(" ")})`,
    // LaunchServices: closed.
    "(deny lsopen)",
    // Executable mapping: the OS libraries and the toolchain only, and never
    // anything the run can write (last match wins): a dylib or bundle it
    // built does not load.
    "(deny file-map-executable)",
    `(allow file-map-executable${SYSTEM_MAP_ROOTS.map((p) => ` (subpath ${sbplString(p)})`).join("")}${toolchain})`,
    `(deny file-map-executable ${writable})`,
    // Exec: the OS roots and the resolved toolchain, so an approved sandboxed
    // command (npm test, node build.js, git status) runs; then nothing the
    // run can write, whatever a toolchain root covers.
    "(deny process-exec*)",
    `(allow process-exec*${toolchain})`,
    `(deny process-exec* ${writable})`,
    // Network: every outbound connection is closed, the resolver's socket
    // included (the filter resolves names host-side; an open resolver would
    // be a DNS-query channel out).
    "(deny network-outbound)",
  ];
  if (ports.length) {
    // The egress filter's loopback port (Seatbelt's `localhost` is every
    // address of this Mac; only this port of it opens).
    lines.push(`(allow network-outbound ${ports.map((port) => `(remote ip "localhost:${port}")`).join(" ")})`);
  }
  return lines.join("\n");
}

module.exports = {
  DEFAULT_DEVELOPER_DIRS,
  HOMEBREW_PREFIXES,
  SECRET_READ_DENYLIST,
  SHIM_MANAGERS,
  SYSTEM_EXEC_ROOTS,
  SYSTEM_MAP_ROOTS,
  TOOLCHAIN_COMMANDS,
  buildCodeSandboxProfile,
  findOnPath,
  resolveSecretPaths,
  resolveToolchain,
};
