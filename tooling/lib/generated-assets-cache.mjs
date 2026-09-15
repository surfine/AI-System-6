import { createHash, randomUUID } from "node:crypto";
import { lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const SCHEMA = "ai-system-6/generated-assets/v1";

// Include file contents and directory membership, never just mtimes. Symlink
// targets participate too; an unreadable input or a cycle disables reuse.
export function digestAssetPaths(root, paths) {
  const hash = createHash("sha256");
  function visit(absolute, label, ancestors = new Set()) {
    const entry = lstatSync(absolute);
    hash.update(JSON.stringify(label)).update("\0");
    if (entry.isSymbolicLink()) {
      hash.update(`link:${readlinkSync(absolute)}\0`);
      const resolved = realpathSync(absolute);
      if (ancestors.has(resolved)) throw new Error(`Cyclic cache input: ${label}`);
      visit(resolved, `${label}/target`, ancestors);
    } else if (entry.isDirectory()) {
      const resolved = realpathSync(absolute);
      if (ancestors.has(resolved)) throw new Error(`Cyclic cache input: ${label}`);
      const next = new Set([...ancestors, resolved]);
      hash.update("directory\0");
      for (const name of readdirSync(absolute).sort()) {
        visit(path.join(absolute, name), `${label}/${name}`, next);
      }
    } else if (entry.isFile()) {
      hash.update("file\0").update(createHash("sha256").update(readFileSync(absolute)).digest("hex")).update("\0");
    } else {
      throw new Error(`Unsupported cache input: ${label}`);
    }
  }
  for (const relative of [...new Set(paths)].sort()) visit(path.resolve(root, relative), relative);
  return hash.digest("hex");
}

function fingerprint(root, spec, environment) {
  return createHash("sha256").update(JSON.stringify({
    schema: SCHEMA,
    node: process.versions,
    executable: process.execPath,
    platform: process.platform,
    arch: process.arch,
    // Hash values only; credentials and other environment data are never
    // stored in the receipt or printed. Conservative misses are inexpensive.
    environment: Object.entries(environment).sort(([a], [b]) => a.localeCompare(b)),
    extra: spec.extra || [],
    outputs: spec.outputs,
    inputs: digestAssetPaths(root, spec.inputs),
  })).digest("hex");
}

/** Execute a generator or reuse its byte-identical inputs AND intact outputs. */
export function runCachedGenerator(root, spec, run, { environment = process.env, force = false } = {}) {
  if (!/^[a-z0-9-]+$/.test(spec.name)) throw new Error("Invalid generator cache name");
  if (!spec.outputs?.length) throw new Error("A cached generator needs declared outputs");
  const receiptPath = path.join(root, "dist/build-cache/generated-assets", `${spec.name}.json`);
  let before;
  try {
    before = fingerprint(root, spec, environment);
    if (!force) {
      const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
      if (receipt.schema === SCHEMA && receipt.inputs === before
        && receipt.outputs === digestAssetPaths(root, spec.outputs)) {
        return { cached: true, status: 0 };
      }
    }
  } catch {
    // Missing/corrupt receipts, inputs or outputs are cache misses, never
    // permission to skip a generator's own validation.
  }
  rmSync(receiptPath, { force: true });
  const status = run();
  if (status !== 0) return { cached: false, status: status || 1 };
  if (!before) return { cached: false, status: 0 };
  let after;
  let outputs;
  try {
    after = fingerprint(root, spec, environment);
    outputs = digestAssetPaths(root, spec.outputs);
  } catch {
    return { cached: false, status: 0 };
  }
  // An edit during generation must not bless outputs from a mixture of inputs.
  if (before !== after) return { cached: false, status: 0 };
  mkdirSync(path.dirname(receiptPath), { recursive: true });
  const temporary = `${receiptPath}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, `${JSON.stringify({ schema: SCHEMA, inputs: after, outputs })}\n`);
    renameSync(temporary, receiptPath);
  } finally {
    rmSync(temporary, { force: true });
  }
  return { cached: false, status: 0 };
}
