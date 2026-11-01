import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { desktopRoot, toolingRoot } from "./lib/paths.mjs";

const outputDir = path.join(desktopRoot, "app", "vendor");

await mkdir(outputDir, { recursive: true });
await build({
  entryPoints: [path.join(toolingRoot, "vendor", "bonsai-renderer-entry.mjs")],
  outfile: path.join(outputDir, "bonsai-renderer.js"),
  bundle: true,
  format: "esm",
  minify: true,
  target: ["chrome100", "safari15"],
  legalComments: "eof",
});
