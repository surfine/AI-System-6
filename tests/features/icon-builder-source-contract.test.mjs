// Icon builders must read their checked-in source ledgers from the theme-local
// `icons/src/` boundary. This is a static contract on purpose: it catches a
// broken build chain without regenerating or overwriting reviewed artwork.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("icon-builder-source-contract");

const BUILDERS = [
  {
    path: "tooling/build-platinum-core-icons.mjs",
    ledger: "assets/themes/platinum/icons/src/platinum-core-icons.json",
    sourceJoin: 'join(assetDir, "src/platinum-core-icons.json")',
    missingError: "Missing Platinum core-icon source ledger",
  },
  {
    path: "tooling/build-aqua-core-icons.mjs",
    ledger: "assets/themes/aqua/icons/src/aqua-core-icons.json",
    sourceJoin: 'join(assetDir, "src/aqua-core-icons.json")',
    missingError: "Missing Aqua core-icon source ledger",
  },
  {
    path: "tooling/build-snow-leopard-core-icons.mjs",
    ledger: "assets/themes/snow-leopard/icons/src/snow-leopard-core-icons.json",
    sourceJoin: 'join(assetDir, "src/snow-leopard-core-icons.json")',
    missingError: "Missing Snow Leopard core-icon source ledger",
  },
  {
    path: "tooling/build-yosemite-core-icons.mjs",
    ledger: "assets/themes/yosemite/icons/src/yosemite-core-icons.json",
    sourceJoin: 'join(assetDir, "src/yosemite-core-icons.json")',
    missingError: "Missing Yosemite core-icon source ledger",
  },
  {
    path: "tooling/build-liquid-glass-core-icons.mjs",
    ledger: "assets/themes/liquid-glass/icons/src/liquid-glass-core-icons.json",
    sourceJoin: 'join(assetDir, "src/liquid-glass-core-icons.json")',
    missingError: "Missing Liquid Glass core-icon source ledger",
  },
  {
    path: "tooling/build-liquid-glass-imagegen-icons.mjs",
    ledger: "assets/themes/liquid-glass/icons/src/liquid-glass-imagegen-prompts.json",
    sourceJoin: 'join(assetDir, "src/liquid-glass-imagegen-prompts.json")',
    missingError: "Missing Image Gen prompt ledger",
  },
];

for (const builder of BUILDERS) {
  const source = read(builder.path);
  test.assertFile(builder.ledger, `${builder.ledger} is a tracked builder source`);
  test.assertIncludes(source, builder.sourceJoin, `${builder.path} reads its theme-local source ledger`);
  test.assertNotIncludes(source, 'join(assetDir, "apps/server/', `${builder.path} does not cross into a nonexistent server path`);
  test.assertIncludes(source, builder.missingError, `${builder.path} fails with an actionable missing-source error`);
}

const continuity = JSON.parse(read("assets/themes/icon-system-continuity.json"));
test.assert(Number(continuity.schemaVersion) >= 2, "continuity schema v2 separates identity from rendering");
test.assertNotIncludes(
  continuity.metaphorKeyRule || "",
  "keep that one physical metaphor",
  "continuity no longer locks every era to one physical metaphor",
);

for (const [id, anchor] of Object.entries(continuity.semanticAnchors || {})) {
  test.assert(Boolean(anchor.semanticIdentity), `${id} declares a semantic identity`);
  test.assert(
    Array.isArray(anchor.identityAnchors) && anchor.identityAnchors.length >= 1 && anchor.identityAnchors.length <= 2,
    `${id} keeps one or two recognition anchors instead of a complete frozen composition`,
  );
}

test.finish();
