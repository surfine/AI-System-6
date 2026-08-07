// English and Chinese must stay one string table with two voices. A key that
// exists in one language but not the other silently falls back to English
// (t() resolves zh -> en -> key), so a Chinese user sees English copy while a
// maintainer sees nothing wrong. The markup contract is equally strict: every
// data-i18n* reference must resolve in both tables.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("translations-parity");
const en = read("app/data/translations-en.js");
const zh = read("app/data/translations-zh.js");
const html = read("index.html");

function keysOf(source) {
  return new Set([...source.matchAll(/^\s{4}([A-Za-z0-9_]+):/gm)].map((match) => match[1]));
}

const enKeys = keysOf(en);
const zhKeys = keysOf(zh);

const missingZh = [...enKeys].filter((key) => !zhKeys.has(key)).sort();
const missingEn = [...zhKeys].filter((key) => !enKeys.has(key)).sort();
test.assert(
  missingZh.length === 0,
  `every English key has Chinese copy (missing: ${missingZh.join(", ")})`
);
test.assert(
  missingEn.length === 0,
  `every Chinese key has English copy (missing: ${missingEn.join(", ")})`
);

for (const attr of ["data-i18n", "data-i18n-aria-label", "data-i18n-placeholder", "data-i18n-title"]) {
  const used = [...html.matchAll(new RegExp(`${attr}="([A-Za-z0-9_]+)"`, "g"))].map((match) => match[1]);
  const missing = [...new Set(used)].filter((key) => !enKeys.has(key) || !zhKeys.has(key)).sort();
  test.assert(
    missing.length === 0,
    `every ${attr} reference resolves in both tables (missing: ${missing.join(", ")})`
  );
}

test.finish();
