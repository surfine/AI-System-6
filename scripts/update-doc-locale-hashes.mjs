#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  collectCanonicalMarkdown,
  localizedPath,
  sha256,
} from "./lib/doc-locales.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const updates = [];
const failures = [];

for (const sourcePath of collectCanonicalMarkdown(root)) {
  const zhPath = localizedPath(sourcePath);
  const zhAbsolute = join(root, zhPath);
  if (!existsSync(zhAbsolute)) {
    failures.push(`${zhPath} missing for ${sourcePath}`);
    continue;
  }

  const source = readFileSync(join(root, sourcePath), "utf8");
  const localized = readFileSync(zhAbsolute, "utf8");
  const sourceMarker = `<!-- canonical-source: ${sourcePath} -->`;
  const hashMarker = `<!-- source-sha256: ${sha256(source)} -->`;

  if (!/^<!-- canonical-source: .* -->$/m.test(localized)) {
    failures.push(`${zhPath} has no canonical-source marker`);
    continue;
  }
  if (!/^<!-- source-sha256: .* -->$/m.test(localized)) {
    failures.push(`${zhPath} has no source-sha256 marker`);
    continue;
  }

  const next = localized
    .replace(/^<!-- canonical-source: .* -->$/m, sourceMarker)
    .replace(/^<!-- source-sha256: .* -->$/m, hashMarker);
  if (next !== localized) updates.push({ path: zhAbsolute, relative: zhPath, text: next });
}

if (failures.length) {
  failures.forEach((failure) => console.error(`NO  ${failure}`));
  console.error(`\nNo files changed; ${failures.length} locale issue(s) must be fixed first.`);
  process.exit(1);
}

updates.forEach(({ path, text }) => writeFileSync(path, text));
updates.forEach(({ relative }) => console.log(`OK  ${relative}`));
console.log(`\nUpdated ${updates.length} locale header(s).`);
