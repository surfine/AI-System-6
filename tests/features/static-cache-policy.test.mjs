import { createRequire } from "node:module";
import { createFeatureTest } from "../helpers/feature-test-harness.mjs";

const require = createRequire(import.meta.url);
const test = createFeatureTest("static-cache-policy");
const { cacheHeaders } = require("../../apps/server/server/static.js");

function policy(relative, requestUrl = `http://localhost/${relative}`) {
  const ext = `.${relative.split(".").pop()}`;
  return cacheHeaders(relative, ext, new URL(requestUrl))["Cache-Control"];
}

test.assert(policy("index.html") === "no-cache", "the mutable HTML shell always revalidates");
test.assert(policy("assets/app-icon/manifest.json") === "no-cache", "an unversioned manifest never receives a week-long cache");
test.assert(policy("data/bureaucracy-templates.json") === "no-cache", "unversioned data files revalidate");
test.assert(policy("assets/themes/aqua/icons/finder-32.png") === "no-cache", "a stable mutable asset URL revalidates");
test.assert(
  policy("assets/themes/aqua/icons/finder-32.png", "http://localhost/assets/themes/aqua/icons/finder-32.png?v=20260813.5")
    === "public, max-age=31536000, immutable",
  "a build-versioned asset is immutable"
);
test.assert(
  policy("assets/generated/icon.0123abcd.png") === "public, max-age=31536000, immutable",
  "a content-hashed filename is immutable"
);

test.finish();
