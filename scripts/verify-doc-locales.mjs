import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  collectCanonicalMarkdown,
  localizedPath,
  sha256,
} from "./lib/doc-locales.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const failures = [];
function ok(message) {
  console.log(`OK  ${message}`);
}

function fail(message) {
  failures.push(message);
  console.error(`NO  ${message}`);
}

collectCanonicalMarkdown(root).forEach((sourcePath) => {
  const zhPath = localizedPath(sourcePath);
  const source = readFileSync(join(root, sourcePath), "utf8");
  const expectedHash = sha256(source);
  const expectedSourceMarker = `<!-- canonical-source: ${sourcePath} -->`;
  const expectedHashMarker = `<!-- source-sha256: ${expectedHash} -->`;

  if (!existsSync(join(root, zhPath))) {
    fail(`${zhPath} missing for ${sourcePath}`);
    return;
  }

  const localized = readFileSync(join(root, zhPath), "utf8");

  if (localized.includes(expectedSourceMarker)) ok(`${zhPath} source marker`);
  else fail(`${zhPath} source marker should be ${expectedSourceMarker}`);

  if (localized.includes(expectedHashMarker)) ok(`${zhPath} source hash`);
  else fail(`${zhPath} source hash is stale; refresh from ${sourcePath}`);

  if (localized.includes("英文版为准") && localized.includes("仅供人类参考")) {
    ok(`${zhPath} reference-only notice`);
  } else {
    fail(`${zhPath} must say 英文版为准 and 仅供人类参考`);
  }
});

// Release identity + docs consistency:
//   - package.json version must equal the latest Public Beta version in
//     CHANGELOG.md (a version bump without release notes fails the gate);
//   - every `npm run <name>` command documented in README.md must exist in
//     the package scripts (README must not promise a command that is absent).
try {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const changelog = readFileSync(join(root, "CHANGELOG.md"), "utf8");
  const latestBeta = [...changelog.matchAll(/^## Public Beta (\d+\.\d+\.\d+)/gm)]
    .map((match) => match[1])
    .pop();
  if (latestBeta && latestBeta === pkg.version) {
    ok(`CHANGELOG latest Public Beta ${latestBeta} === package version`);
  } else {
    fail(
      `CHANGELOG latest Public Beta ${latestBeta || "(none)"} !== package version ${pkg.version}; add release notes before bumping the version`
    );
  }

  const readme = readFileSync(join(root, "README.md"), "utf8");
  const documentedCommands = [...readme.matchAll(/npm run ([A-Za-z0-9:_-]+)/g)]
    .map((match) => match[1]);
  const missing = [...new Set(documentedCommands)].filter(
    (name) => typeof pkg.scripts?.[name] !== "string"
  );
  if (missing.length === 0) {
    ok(`README documents only existing npm scripts (${new Set(documentedCommands).size} commands)`);
  } else {
    fail(`README documents scripts that do not exist: ${missing.join(", ")}`);
  }
} catch (error) {
  fail(`release identity/docs consistency could not be checked: ${error.message}`);
}

if (failures.length) {
  console.error(`\nDoc locale verification failed: ${failures.length} issue(s).`);
  process.exit(1);
}

console.log("\nDoc locale verification passed.");
