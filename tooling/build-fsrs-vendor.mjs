import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { desktopRoot, toolingRoot } from "./lib/paths.mjs";

// One lazy ESM file, loaded by the window that needs it and by nothing else.
// It is deliberately outside the boot bundle: the desk's floppy budget belongs
// to the desktop, and a scheduling library is only needed once a study card is
// turned over. The banner keeps the licence with the bytes, because the bytes
// are what ship.
const outputDir = path.join(desktopRoot, "app", "vendor");

await mkdir(outputDir, { recursive: true });
await build({
  entryPoints: [path.join(toolingRoot, "vendor", "fsrs-entry.mjs")],
  outfile: path.join(outputDir, "fsrs.js"),
  bundle: true,
  format: "esm",
  minify: true,
  target: ["chrome100", "safari15"],
  legalComments: "eof",
  banner: {
    js: "/* ts-fsrs (MIT, Copyright (c) 2026 Open Spaced Repetition) — bundled"
      + " from tooling/vendor/fsrs-entry.mjs; see node_modules/ts-fsrs/LICENSE. */",
  },
});
