import { build } from "esbuild";
import { mkdir, readFile } from "node:fs/promises";
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

const usdTextureChannelCacheFix = {
  name: "usd-texture-channel-cache-fix",
  setup(buildContext) {
    buildContext.onLoad({ filter: /[\\/]USDComposer\.js$/ }, async (args) => {
      if (path.resolve(args.path) !== path.resolve(usdComposerPath)) return null;
      const source = await readFile(args.path, "utf8");
      if (!source.includes(textureCacheNeedle)) {
        throw new Error("Three.js USD texture cache implementation changed; review the UV-channel patch.");
      }
      return {
        contents: source.replace(textureCacheNeedle, textureCacheReplacement),
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
