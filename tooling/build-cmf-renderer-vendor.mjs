import { build } from "esbuild";
import { mkdir, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { desktopRoot, repositoryRoot, toolingRoot } from "./lib/paths.mjs";

const root = repositoryRoot;
const outputDir = path.join(desktopRoot, "app", "vendor");
const usdComposerPath = path.join(
  root,
  "node_modules",
  "three",
  "examples",
  "jsm",
  "loaders",
  "usd",
  "USDComposer.js",
);
const textureCacheNeedle = "let cacheKey = filePath;";
const textureCacheReplacement = "let cacheKey = filePath + ':uv' + uvChannel;";
// Apple's Pro Max uses Maya-style pivot suffixes on translate ops. USD allows
// any suffix; r184 recognizes only ':pivot', so those prims rotated around the
// origin and the aperture blades protruded through the camera rim.
//
// The suffix list is a census, not a guess. Logged from the composer itself on
// 2026-09-12, counting every opName it was asked to compose:
//
//   iphone-17-pro.usdz      xformOp:translate:pivot x122
//   iphone-17-pro-max.usdz  xformOp:translate:pivot x180
//                           xformOp:translate:rotatePivot x2
//                           xformOp:translate:scalePivot x2
//
// So ':rotatePivot' is required, and the Pro is untouched by any form of this
// patch -- it carries no named pivot at all. Any story that blames this patch
// for how the Pro renders is measuring something else.
//
// ':scalePivot' is deliberately absent: applying it folds the Pro Max
// enclosure into a chrome ribbon, verified by A/B with the camera framed. A
// scale pivot has to bracket the scale op and cancel against its own inverse,
// and these assets carry no '!invert!' entries at all -- composing one as a
// standalone translation therefore never cancels. Leaving it unhandled is what
// r184 did before any of this.
//
// Reaching for "every named translate op is a pivot" costs the Pro Max for
// nothing, since the only suffix it adds beyond this list is the one that
// breaks it.
const namedPivotNeedle = "opName === 'xformOp:translate:pivot'";
const namedPivotReplacement =
  "( opName === 'xformOp:translate:pivot' || opName === 'xformOp:translate:rotatePivot' )";
const namedPivotValueNeedle = "const t = data[ 'xformOp:translate:pivot' ];";
const resolvedUsdComposerPath = await realpath(usdComposerPath);

const usdTextureChannelCacheFix = {
  name: "usd-texture-channel-cache-fix",
  setup(buildContext) {
    buildContext.onLoad({ filter: /[\\/]USDComposer\.js$/ }, async (args) => {
      if (await realpath(args.path) !== resolvedUsdComposerPath) return null;
      const source = await readFile(args.path, "utf8");
      if (!source.includes(textureCacheNeedle)) {
        throw new Error("Three.js USD texture cache implementation changed; review the UV-channel patch.");
      }
      if (!source.includes(namedPivotNeedle) || !source.includes(namedPivotValueNeedle)) {
        throw new Error("Three.js USD transform implementation changed; review named-pivot support.");
      }
      return {
        contents: source
          .replace(textureCacheNeedle, textureCacheReplacement)
          .replace(namedPivotNeedle, namedPivotReplacement)
          .replace(namedPivotValueNeedle, "const t = data[ opName ];"),
        loader: "js",
      };
    });
  },
};

await mkdir(outputDir, { recursive: true });
await build({
  entryPoints: [path.join(toolingRoot, "vendor", "cmf-renderer-entry.mjs")],
  outfile: path.join(outputDir, "cmf-renderer.js"),
  bundle: true,
  format: "esm",
  minify: true,
  target: ["chrome100", "safari15"],
  legalComments: "eof",
  plugins: [usdTextureChannelCacheFix],
});
