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

// Every replacement below is exact-match: if upstream drifts, the build fails
// loudly instead of silently shipping a half-patched engine.
function exactReplace(fileName, source, from, to) {
  if (!source.includes(from)) {
    throw new Error(`micropolis vendor: ${fileName} drifted; the AI System 6 patch no longer matches upstream.`);
  }
  return source.replace(from, to);
}

// Upstream draws every random number from the global Math at call time, so a
// terrain or a scenario cannot be reproduced. Route the draw through a
// replaceable source: the shell seeds it for the New City preview and for
// the scenario maps, and resets it to Math.random afterwards.
const seedableRandomFix = {
  name: "seedable-random",
  setup(buildContext) {
    buildContext.onLoad({ filter: /[\\/]src[\\/]random\.ts$/ }, async (args) => {
      let source = await readFile(args.path, "utf8");
      source = exactReplace(
        "random.ts",
        source,
        `function getRandom(max: number, mathGlobal: MathGlobal = Math): number {
  return mathGlobal.floor(mathGlobal.random() * (max + 1));
}`,
        `// AI System 6: a replaceable random source, so terrain and scenarios can
// be seeded. null restores Math.random.
const randomSource: MathGlobal = { random: () => Math.random(), floor: (n) => Math.floor(n) };

function setRandomSource(random: (() => number) | null): void {
  randomSource.random = random || (() => Math.random());
}

function getRandom(max: number, mathGlobal: MathGlobal = randomSource): number {
  return mathGlobal.floor(mathGlobal.random() * (max + 1));
}`,
      );
      source = exactReplace(
        "random.ts",
        source,
        `  getRandom16Signed,
};`,
        `  getRandom16Signed,
  setRandomSource,
};`,
      );
      return { contents: source, loader: "ts" };
    });
  },
};

// Sprites emit their sound cues on themselves and the manager relays only
// crashes and heavy traffic, so no listener outside the sprite ever hears a
// honk, a monster, or an explosion. Relay the sound cues too; the shell's
// synthesized audio listens on the sprite manager.
const spriteSoundRelayFix = {
  name: "sprite-sound-relay",
  setup(buildContext) {
    buildContext.onLoad({ filter: /[\\/]src[\\/]spriteManager\.js$/ }, async (args) => {
      const source = await readFile(args.path, "utf8");
      return {
        contents: exactReplace(
          "spriteManager.js",
          source,
          `  if (type == SpriteConstants.SPRITE_HELICOPTER)
    newSprite.addEventListener(Messages.HEAVY_TRAFFIC, MiscUtils.reflectEvent.bind(this, Messages.HEAVY_TRAFFIC));
`,
          `  if (type == SpriteConstants.SPRITE_HELICOPTER)
    newSprite.addEventListener(Messages.HEAVY_TRAFFIC, MiscUtils.reflectEvent.bind(this, Messages.HEAVY_TRAFFIC));

  // AI System 6: relay the sprite sound cues to the manager's listeners.
  var soundCues = [Messages.SOUND_EXPLOSIONHIGH, Messages.SOUND_EXPLOSIONLOW, Messages.SOUND_HONKHONK,
                   Messages.SOUND_MONSTER, Messages.SOUND_HEAVY_TRAFFIC];
  for (var s = 0, sl = soundCues.length; s < sl; s++)
    newSprite.addEventListener(soundCues[s], MiscUtils.reflectEvent.bind(this, soundCues[s]));
`,
        ),
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
  // A worktree may link external/micropolisjs to another checkout; keep the
  // bundle's path comments on the repo-relative path either way.
  preserveSymlinks: true,
  plugins: [
    micropolisHdPatchPlugin(readFile),
    spriteConstantsImportFix,
    censusBudgetScopeFix,
    seedableRandomFix,
    spriteSoundRelayFix,
  ],
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
- HD adaptation (AI System 6): \`tooling/vendor/micropolis-hd-patch.mjs\`
  patches TileSet and GameCanvas at bundle time so integer-multiple HD
  atlases render on a scale-sized backing store; the logical 16px tile and
  all caller-facing coordinates are unchanged. The @2x atlases beside this
  file derive from the upstream 1x art via
  \`npm run build:micropolis-hd\` (deterministic; see that script's header).
- Bug fix (AI System 6): simulation.js phase-9 census called
  \`take10Census(budget)\` with an undeclared identifier, throwing on the
  first 10-census and killing the caller's animation loop; patched to
  \`this.budget\` at bundle time.
- Seedable random (AI System 6): random.ts draws through a replaceable
  source (\`Random.setRandomSource\`) so terrain and scenario maps can be
  reproduced from a seed; null restores Math.random.
- Sound relay (AI System 6): spriteManager.js relays the sprite sound cues
  (explosion, honk, monster, heavy traffic) to the manager's listeners, so
  the shell's synthesized audio can hear them.
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
