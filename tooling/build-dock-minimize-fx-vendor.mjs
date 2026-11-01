import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { desktopRoot, toolingRoot } from "./lib/paths.mjs";

const outputDir = path.join(desktopRoot, "app", "vendor");

await mkdir(outputDir, { recursive: true });
await build({
  entryPoints: [path.join(toolingRoot, "vendor", "dock-minimize-fx-entry.mjs")],
  outfile: path.join(outputDir, "dock-minimize-fx.js"),
  bundle: true,
  format: "esm",
  minify: true,
  target: ["chrome100", "safari15"],
  legalComments: "eof",
});
console.log("built apps/desktop/app/vendor/dock-minimize-fx.js");
