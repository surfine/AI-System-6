import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join } from "node:path";

const appRoot = join(process.cwd(), "apps", "desktop", "app");
const allowed = new Set([
  "app/core/local-lmstudio-client.js",
  "app/core/public-access.js",
  "app/core/service-providers.js",
]);

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    else if (entry.isFile() && extname(entry.name) === ".js") files.push(full);
  }
  return files;
}

const files = await walk(appRoot);
const violations = [];

for (const file of files) {
  const relative = file.slice(appRoot.length + 1);
  if (allowed.has(relative)) continue;
  const source = await readFile(file, "utf8");
  if (/fetch\s*\(\s*["']\/api\//.test(source)) {
    violations.push(relative);
  }
}

if (violations.length) {
  console.error("Direct same-origin /api fetch outside the service boundary:");
  violations.forEach((file) => console.error(`- ${file}`));
  process.exit(1);
}

console.log("Service boundary clean: business code does not fetch /api directly.");
