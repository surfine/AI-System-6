// English UI surfaces must not leak Chinese, and Chinese UI surfaces must not
// silently stay English. The parity test proves both tables have the same key
// set; this test pins the actual surface language for the controls that leaked
// on the live host, and locks the Cover Glass display name.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("locale-surface");
const en = read("app/data/translations-en.js");
const zh = read("app/data/translations-zh.js");
const html = read("index.html");

const cjk = /[\u3400-\u9fff]/;

function translationValue(source, key) {
  const match = source.match(new RegExp(`^\\s{4}${key}:\\s*"([^"]*)"`, "m"));
  return match ? match[1] : null;
}

for (const key of [
  "endfield_placeholder",
  "endfield_ask_archive",
  "docmap_fit_view",
  "docmap_focus_root",
]) {
  const english = translationValue(en, key);
  const chinese = translationValue(zh, key);
  test.assert(english !== null, `${key} exists in English`);
  test.assert(!cjk.test(english || ""), `${key} stays English (no CJK): ${english}`);
  test.assert(chinese !== null, `${key} exists in Chinese`);
  test.assert(cjk.test(chinese || ""), `${key} is Chinese: ${chinese}`);
}

test.assert(
  translationValue(en, "liquid_cover_label") === "Cover Glass",
  "Cover Glass is the English visible name"
);
test.assert(
  translationValue(en, "liquid_cover_title") === "Cover Glass",
  "Cover Glass is the English window title"
);
test.assert(
  translationValue(zh, "liquid_cover_label") === "玻璃封面",
  "Cover Glass has a Chinese visible name"
);
test.assert(
  translationValue(zh, "liquid_cover_title") === "玻璃封面",
  "Cover Glass has a Chinese window title"
);
test.assert(
  !html.includes("Liquid Cover"),
  "index.html has no visible Liquid Cover copy"
);

test.finish();
