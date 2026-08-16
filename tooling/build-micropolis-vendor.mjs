// Builds the vendored Micropolis engine bundle from a pinned local clone of
// graememcc/micropolisJS. The clone lives in external/micropolisjs (gitignored);
// the built bundle, assets, and license files are committed, so this script
// only runs when the engine is upgraded. Without the clone, the committed
// artifacts are the source of truth and this script exits without work.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { build } from "esbuild";
import { desktopRoot, repositoryRoot, toolingRoot } from "./lib/paths.mjs";
import { micropolisHdPatchPlugin } from "./vendor/micropolis-hd-patch.mjs";

const upstreamRoot = join(repositoryRoot, "external", "micropolisjs");
const outputDir = join(desktopRoot, "app", "vendor", "micropolis");
const outputFile = join(outputDir, "micropolis-engine.js");

// Upstream files that must never enter the engine bundle: the jQuery UI
// layer, upstream strings, and upstream localStorage persistence.
// (mouseBox.js is allowed: it is the GameCanvas hover box, not a window.)
const forbiddenModules = [
  "game.js",
  "infoBar.js",
  "inputStatus.js",
  "monsterTV.js",
  "notification.js",
  "queryTool.js",
  "rci.js",
  "splashCanvas.js",
  "splashScreen.js",
  "storage.js",
  "text.js",
  "tileSetURI.ts",
  "tileSetSnowURI.ts",
];

if (!existsSync(join(upstreamRoot, "src", "simulation.js"))) {
  if (existsSync(outputFile)) {
    console.log("micropolis vendor: no external/micropolisjs clone; committed bundle stays as-is.");
    process.exit(0);
  }
  console.error(
    "micropolis vendor: external/micropolisjs is missing and no committed bundle exists.\n" +
      "Clone it first: git clone https://github.com/graememcc/micropolisJS external/micropolisjs",
  );
  process.exit(1);
}

const upstreamSha = execFileSync("git", ["-C", upstreamRoot, "rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();

const banner = `/*!
 * Micropolis engine bundle for AI System 6.
 * Built from micropolisJS (https://github.com/graememcc/micropolisJS)
 * at commit ${upstreamSha}, engine modules only (no upstream UI).
 * micropolisJS is adapted by Graeme McCutcheon from Micropolis.
 *
 * This code is released under the GNU GPL v3, with some additional terms.
 * See LICENSE, COPYING, and NOTICE.md in this directory.
 *
 * The name/term "MICROPOLIS" is a registered trademark of Micropolis
 * (https://www.micropolis.com) GmbH (Micropolis Corporation, the "licensor")
 * and is licensed here to the authors/publishers of the "Micropolis" city
 * simulation game and its source code (the project or "licensee(s)") as a
 * courtesy of the owner.
 */`;

// Upstream sprite files import SpriteConstants as a named binding, but
// spriteConstants.ts only has individual const exports. Webpack tolerates the
// mismatch; esbuild refuses it. Rewrite to a namespace import at load time so
// the clone stays byte-identical to the pinned upstream commit.
const spriteConstantsImportFix = {
  name: "sprite-constants-import-fix",
  setup(buildContext) {
    buildContext.onLoad({ filter: /[\\/]src[\\/][A-Za-z]+\.js$/ }, async (args) => {
      const source = await readFile(args.path, "utf8");
      if (!source.includes("import { SpriteConstants }")) return null;
      return {
        contents: source.replace(
          "import { SpriteConstants }",
          "import * as SpriteConstants",
        ),
        loader: "js",
      };
    });
  },
};

// Upstream's simulation frame calls the census with a bare `budget`, while the
// tax branch three lines down correctly says `this.budget`. Under a bundler
// there is no such global, so the first census tick throws ReferenceError,
// the simulation loop dies, and the city freezes a few months in — the map
// still draws, so it reads as "the game does nothing" rather than a crash.
const censusBudgetScopeFix = {
  name: "census-budget-scope-fix",
  setup(buildContext) {
    buildContext.onLoad({ filter: /[\\/]src[\\/]simulation\.js$/i }, async (args) => {
      const source = await readFile(args.path, "utf8");
      if (!source.includes("take10Census(budget)")) return null;
      return {
        contents: source
          .replace("take10Census(budget)", "take10Census(this.budget)")
          .replace("take120Census(budget)", "take120Census(this.budget)"),
        loader: "js",
      };
    });
  },
};

mkdirSync(outputDir, { recursive: true });
const result = await build({
  entryPoints: [join(toolingRoot, "vendor", "micropolis-engine-entry.mjs")],
  outfile: outputFile,
  bundle: true,
  format: "iife",
  globalName: "MicropolisEngine",
  minify: false,
  target: ["chrome100", "safari15"],
  legalComments: "inline",
  banner: { js: banner },
  alias: { jquery: join(toolingRoot, "vendor", "jquery-shim.mjs") },
  plugins: [micropolisHdPatchPlugin(readFile), spriteConstantsImportFix, censusBudgetScopeFix],
  metafile: true,
});

const bundledInputs = Object.keys(result.metafile.inputs);
const violations = forbiddenModules.filter((name) =>
  bundledInputs.some((input) => input.endsWith(`/src/${name}`)),
);
if (violations.length > 0) {
  console.error(`micropolis vendor: forbidden upstream UI modules entered the bundle: ${violations.join(", ")}`);
  process.exit(1);
}

for (const [source, target] of [
  ["images/tiles.png", "tiles.png"],
  ["images/tilessnow.png", "tilessnow.png"],
  ["images/sprites.png", "sprites.png"],
  ["LICENSE", "LICENSE"],
  ["COPYING", "COPYING"],
]) {
  copyFileSync(join(upstreamRoot, source), join(outputDir, target));
}

writeFileSync(
  join(outputDir, "NOTICE.md"),
  `# Micropolis engine vendor notice

- Upstream: https://github.com/graememcc/micropolisJS
- Pinned commit: ${upstreamSha}
- Build: \`npm run build:micropolis-vendor\` (esbuild IIFE, unminified, engine modules only)
- Entry: \`tooling/vendor/micropolis-engine-entry.mjs\`
- Excluded upstream modules (UI, strings, storage): game, splashScreen,
  splashCanvas, infoBar, inputStatus, notification, rci, queryTool, text,
  storage, monsterTV, every *Window.js, and the data-URI tile sets.
- License: GNU GPL v3 with additional terms — see LICENSE and COPYING here.
- The name/term "MICROPOLIS" is a registered trademark of Micropolis GmbH,
  licensed to the Micropolis project as a courtesy of the owner.
- AI System 6 shell code (\`app/features/micropolis.js\`) and all UI strings
  are original to AI System 6 and are not derived from upstream text.js.
`,
  "utf8",
);

console.log(
  `micropolis vendor: built ${outputFile.replace(repositoryRoot + "/", "")} from ${upstreamSha.slice(0, 12)} (${bundledInputs.length} modules).`,
);
