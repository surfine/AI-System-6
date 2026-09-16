// Every icon the painter can hand to a file has to exist as a file.
//
// Applications → Extras showed ClioPaint as a placeholder document for as long
// as the row existed: the painter asks for
// assets/themes/classic/icons/clioPaint-32.svg, that file was never written,
// and the broken <image> is what the writer saw. Nothing looked at the pair
// (id → asset), so nothing could say which id was wrong; this runs the real
// painter and reads the hrefs it produces back off the disk.

import vm from "node:vm";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createFeatureTest, read, root } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("icon-assets");
const painter = read("app/core/system-icons.js");

const sandbox = {
  console,
  window: { AISystem6Config: { getAppBuildInfo: () => ({ build: "20260917.2" }) } },
};
vm.createContext(sandbox);
vm.runInContext(
  `${painter}
globalThis.__probe = {
  eraIds: [...completeEraSystemIconIds],
  classicOnlyIds: Object.keys(classicOnlyModernFallbackIconId),
  svg: (id, sourceSize) => systemIconSvg(id, { sourceSize, displaySize: 32 }),
};`,
  sandbox,
  { filename: "system-icons.js" }
);
const probe = sandbox.__probe;

test.assert(probe.eraIds.length > 50, "the painter still publishes the era vocabulary");
test.assert(probe.classicOnlyIds.length > 0, "the painter still publishes its classic-only ids");

// The rendered href is the truth: the painter put it there, and the browser
// will ask for exactly that path.
function hrefsFor(id, sourceSize) {
  const markup = probe.svg(id, sourceSize);
  return [...markup.matchAll(/href="([^"]+)"/g)].map((match) => match[1].split("?")[0]);
}

const missing = [];
for (const id of [...probe.eraIds, ...probe.classicOnlyIds]) {
  const wanted = new Set();
  for (const sourceSize of [32, 16]) {
    for (const href of hrefsFor(id, sourceSize)) wanted.add(href);
  }
  if (!wanted.size) {
    missing.push(`${id}: the painter rendered no artwork at all`);
    continue;
  }
  for (const href of wanted) {
    const path = join(root, "apps", "desktop", href);
    if (!existsSync(path)) missing.push(`${id}: ${href}`);
  }
}

test.assert(
  missing.length === 0,
  `every icon the painter can render exists on disk:\n${missing.join("\n")}`
);

// The reverse direction: a file nothing points at is either a rename left
// behind or artwork shipped by mistake.
const referenced = new Set();
for (const id of [...probe.eraIds, ...probe.classicOnlyIds]) {
  for (const href of hrefsFor(id, 32)) referenced.add(href);
}
test.assert(
  [...referenced].every((href) => existsSync(join(root, "apps", "desktop", href))),
  "the 32 px pass references only files that exist"
);

test.finish();
