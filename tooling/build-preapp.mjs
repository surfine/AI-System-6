import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runCachedGenerator } from "./lib/generated-assets-cache.mjs";
import { repositoryRoot } from "./lib/paths.mjs";

// Preserve prebuild:app order without starting seven nested npm processes.
// Only generators with fully enumerated read/write sets opt in to caching.
// The whole tooling tree covers their local helper imports conservatively;
// package/lock and actual dependency bytes also participate, not just versions.
export function preappGenerators(root, { publicOnly = false } = {}) {
  const common = ["tooling", "package.json", "package-lock.json"];
  const bonsai = "apps/desktop/assets/bonsai";
  const generated = "apps/desktop/app/generated";
  const previews = existsSync(resolve(root, "internal/evidence"));
  const all = [
    {
      name: "stream-markdown-vendor",
      script: "tooling/build-stream-markdown-vendor.mjs",
      inputs: [...common, "node_modules/stream-markdown-parser/package.json", "node_modules/stream-markdown-parser/dist/index.cjs"],
      outputs: ["apps/desktop/app/vendor/stream-markdown-parser.global.js"],
    },
    // The three vendor builders below used to run on every prebuild, which
    // meant esbuild re-bundling Three.js (and an embed copy) for every ordinary
    // build. Their inputs are now declared like the steps above: the local
    // tooling tree carries the patch/recipe bytes, the package and lock carry
    // the dependency identity, and the dependency directory carries the actual
    // dependency bytes — so a version bump that changes nothing on disk is
    // still a miss, and an unreadable input is a miss rather than a hit.
    {
      name: "cmf-renderer-vendor",
      script: "tooling/build-cmf-renderer-vendor.mjs",
      inputs: [...common, "node_modules/three"],
      outputs: ["apps/desktop/app/vendor/cmf-renderer.js"],
    },
    {
      name: "embed-vendor",
      script: "tooling/build-embed-vendor.mjs",
      inputs: [
        ...common,
        "node_modules/@huggingface/transformers/package.json",
        "node_modules/@huggingface/transformers/dist/transformers.min.js",
      ],
      outputs: ["apps/desktop/app/vendor/embed/transformers.min.js"],
    },
    {
      name: "ai-prompt-files",
      script: "tooling/build-ai-prompt-files.mjs",
      inputs: [...common, "apps/desktop/app/content/ai-prompts"],
      outputs: [`${generated}/ai-prompt-files.js`, `${generated}/ai-prompt-files.json`],
    },
    {
      name: "bonsai-textures",
      script: "tooling/build-bonsai-texture-atlas.mjs",
      inputs: [...common, `${bonsai}/atlas-source.json`, `${bonsai}/source-art`, "node_modules/canvas"],
      outputs: [`${bonsai}/textures.png`, `${bonsai}/texture-masks.png`, `${bonsai}/textures.json`, `${generated}/bonsai-textures.js`],
    },
    {
      name: "bonsai-atlas",
      script: "tooling/build-bonsai-atlas.mjs",
      inputs: [...common, `${bonsai}/atlas-source.json`, `${bonsai}/textures.json`, `${bonsai}/textures.png`, `${bonsai}/texture-masks.png`, "apps/desktop/app/features/bonsai-renderer-voxel.js"],
      extra: [previews],
      outputs: [
        ...["north", "east", "south", "west"].map((direction) => `${bonsai}/atlas-${direction}.png`),
        `${bonsai}/atlas.png`, `${bonsai}/atlas-metadata.json`, `${bonsai}/provenance.json`, `${generated}/bonsai-atlas.js`,
        ...(previews ? ["internal/evidence/bonsai-facility-preview.png", "internal/evidence/bonsai-city-preview.png"] : []),
      ],
    },
    {
      name: "bonsai-renderer-vendor",
      script: "tooling/build-bonsai-renderer-vendor.mjs",
      inputs: [...common, "node_modules/three", "tooling/vendor/bonsai-renderer-entry.mjs"],
      outputs: ["apps/desktop/app/vendor/bonsai-renderer.js"],
    },
    {
      // The study window's scheduler. A dependency with its own lockfile entry,
      // declared the same way as the renderers above so a version bump that
      // changes nothing on disk is still a cache miss.
      name: "fsrs-vendor",
      script: "tooling/build-fsrs-vendor.mjs",
      inputs: [...common, "node_modules/ts-fsrs", "tooling/vendor/fsrs-entry.mjs"],
      outputs: ["apps/desktop/app/vendor/fsrs.js"],
    },
  ];
  return publicOnly ? all.filter((generator) => PUBLIC_PREAPP_GENERATOR_NAMES.includes(generator.name)) : all;
}

/**
 * The steps the public snapshot runs from its own `prebuild:app`.
 *
 * `ai-prompt-files` is absent on purpose: it rebuilds from private prompt
 * sources, and the public entry has never run it. Every other step builds a
 * vendor bundle or an atlas whose inputs and outputs both ship, so a contributor
 * with nothing but the snapshot gets the same artifacts the maintainer does —
 * and, because the cache below is shared, a second build writes nothing.
 */
export const PUBLIC_PREAPP_GENERATOR_NAMES = Object.freeze([
  "stream-markdown-vendor",
  "cmf-renderer-vendor",
  "embed-vendor",
  "bonsai-textures",
  "bonsai-atlas",
  "bonsai-renderer-vendor",
  "fsrs-vendor",
]);

export function buildPreapp({ root = repositoryRoot, force = false, publicOnly = false } = {}) {
  const started = performance.now();
  for (const generator of preappGenerators(root, { publicOnly })) {
    const stepStarted = performance.now();
    const run = () => {
      const result = spawnSync(process.execPath, [generator.script], { cwd: root, stdio: "inherit" });
      if (result.error) console.error(result.error.message);
      return result.status ?? 1;
    };
    const result = generator.inputs
      ? runCachedGenerator(root, generator, run, { force })
      : { status: run(), cached: false };
    console.log(`[prebuild] ${generator.name}: ${result.cached ? "cached" : "ran"} (${Math.round(performance.now() - stepStarted)}ms)`);
    if (result.status !== 0) return result.status;
  }
  console.log(`[prebuild] complete (${Math.round(performance.now() - started)}ms)`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--force" && arg !== "--public")) {
    console.error("Usage: node tooling/build-preapp.mjs [--force] [--public]");
    process.exitCode = 2;
  } else {
    process.exitCode = buildPreapp({
      force: args.includes("--force"),
      publicOnly: args.includes("--public"),
    });
  }
}
