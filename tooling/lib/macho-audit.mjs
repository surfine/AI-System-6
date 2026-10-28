// Walk a tree, find every Mach-O by its magic number (not its extension), and
// report the architectures, the minimum macOS each was built for, and every
// library it loads. The June 2026 Intel build shipped an arm64 canvas.node
// inside an x86_64 server, and nothing looked at native modules then; this is
// the look.
import { spawnSync } from "node:child_process";
import { closeSync, openSync, readSync, readdirSync, existsSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

import { compareVersions } from "./mac-legacy-profile.mjs";

const THIN_MAGICS = new Set([0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe]);
const FAT_MAGICS = new Set([0xcafebabe, 0xbebafeca, 0xcafebabf, 0xbfbafeca]);

export function isMachO(path) {
  let fd;
  try {
    fd = openSync(path, "r");
    const header = Buffer.alloc(8);
    if (readSync(fd, header, 0, 8, 0) < 8) return false;
    const magic = header.readUInt32BE(0);
    if (THIN_MAGICS.has(magic)) return true;
    // A Java class file shares 0xcafebabe; its next word is a class-file
    // version in the forties or more, never a small slice count.
    if (FAT_MAGICS.has(magic)) {
      const count = magic === 0xcafebabe || magic === 0xcafebabf ? header.readUInt32BE(4) : header.readUInt32LE(4);
      return count > 0 && count < 16;
    }
    return false;
  } catch {
    return false;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function* walkFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) yield* walkFiles(full);
    else if (entry.isFile()) yield full;
  }
}

function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return result.status === 0 ? result.stdout : null;
}

export function machOArchs(path) {
  const out = run("/usr/bin/lipo", ["-archs", path]);
  return out ? out.trim().split(/\s+/).filter(Boolean) : [];
}

/** Load commands of one slice: minimum OS, dependencies (with weak flag), rpaths, own install name. */
export function machOLoadInfo(path, arch) {
  const out = run("/usr/bin/otool", ["-arch", arch, "-l", path]) || "";
  const info = { minos: "", dependencies: [], rpaths: [], installName: "" };
  let command = "";
  for (const raw of out.split("\n")) {
    const line = raw.trim();
    const cmd = line.match(/^cmd (LC_\w+)/);
    if (cmd) {
      command = cmd[1];
      continue;
    }
    if (command === "LC_BUILD_VERSION") {
      const minos = line.match(/^minos (\S+)/);
      if (minos && !info.minos) info.minos = minos[1];
    } else if (command === "LC_VERSION_MIN_MACOSX") {
      const version = line.match(/^version (\S+)/);
      if (version && !info.minos) info.minos = version[1];
    } else if (/^LC_(LOAD|LOAD_WEAK|REEXPORT|LAZY_LOAD|LOAD_UPWARD)_DYLIB$/.test(command)) {
      const name = line.match(/^name (.+) \(offset \d+\)$/);
      if (name) info.dependencies.push({ name: name[1], weak: command === "LC_LOAD_WEAK_DYLIB" });
    } else if (command === "LC_RPATH") {
      const rpath = line.match(/^path (.+) \(offset \d+\)$/);
      if (rpath) info.rpaths.push(rpath[1]);
    } else if (command === "LC_ID_DYLIB") {
      const name = line.match(/^name (.+) \(offset \d+\)$/);
      if (name) info.installName = name[1];
    }
  }
  return info;
}

const isSystemPath = (path) => path.startsWith("/usr/lib/") || path.startsWith("/System/");

/**
 * Audit every Mach-O under `root`.
 *
 * `executableDirFor(file)` answers what @executable_path means for a file:
 * a native module's executable is the node beside the server payload, the
 * shell's is Contents/MacOS. Every non-system dependency must resolve to a
 * file inside `root`, which is then audited like any other Mach-O, so a
 * dylib beside canvas.node is held to the same architecture and minos.
 */
export function auditMachOTree(root, { arch, maxMinos, executableDirFor }) {
  const rows = [];
  const failures = [];
  const files = [...walkFiles(root)].filter(isMachO).sort();
  for (const file of files) {
    const rel = relative(root, file);
    const archs = machOArchs(file);
    const row = { path: rel, archs, minos: "", dependencies: [], problems: [] };
    rows.push(row);
    if (!archs.includes(arch)) {
      row.problems.push(`no ${arch} slice (has ${archs.join(", ") || "none"})`);
      failures.push(`${rel}: no ${arch} slice (has ${archs.join(", ") || "none"})`);
      continue;
    }
    const info = machOLoadInfo(file, arch);
    row.minos = info.minos || "?";
    if (!info.minos) {
      row.problems.push("no minimum macOS version in its load commands");
    } else if (compareVersions(info.minos, maxMinos) > 0) {
      row.problems.push(`minos ${info.minos} > ${maxMinos}`);
    }
    const loaderDir = dirname(file);
    const executableDir = executableDirFor(file);
    const expand = (path) =>
      path.replace(/^@loader_path/, loaderDir).replace(/^@executable_path/, executableDir);
    const rpaths = info.rpaths.map(expand);
    for (const dependency of info.dependencies) {
      if (dependency.name === info.installName) continue;
      if (isSystemPath(dependency.name)) {
        row.dependencies.push(`${dependency.name}${dependency.weak ? " (weak)" : ""}`);
        continue;
      }
      let candidates = [];
      if (dependency.name.startsWith("@rpath/")) {
        const tail = dependency.name.slice("@rpath/".length);
        candidates = rpaths.map((rpath) => join(rpath, tail));
      } else {
        candidates = [expand(dependency.name)];
      }
      // An rpath can name the OS's own Swift directory (/usr/lib/swift).
      const systemCandidate = candidates.find(isSystemPath);
      const bundled = candidates
        .map((candidate) => resolve(candidate))
        .find((candidate) => candidate.startsWith(resolve(root) + "/") && existsSync(candidate));
      if (bundled) {
        row.dependencies.push(`${dependency.name} -> ${relative(root, bundled)}`);
      } else if (systemCandidate) {
        row.dependencies.push(`${dependency.name} -> ${systemCandidate}${dependency.weak ? " (weak)" : ""}`);
      } else if (dependency.weak) {
        row.dependencies.push(`${dependency.name} (weak, absent)`);
      } else {
        row.problems.push(`loads ${dependency.name}, which is neither a system library nor inside the bundle`);
      }
    }
    for (const problem of row.problems) failures.push(`${rel}: ${problem}`);
  }
  return { rows, failures };
}
