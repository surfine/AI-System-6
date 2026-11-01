import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { desktopRoot, toolingRoot } from "./lib/paths.mjs";

// The writing editor: CodeMirror 6 plus the app's live preview, Markdown
// commands and textarea bridge (tooling/vendor/writing-editor/). One classic
// IIFE script that installs window.AISystem6WritingEditor, loaded lazily by
// app/core/markdown-editor.js the first time a writing surface is attached.
// It stays out of the boot bundle: the floppy budget belongs to the desk, and
// until this file arrives the surfaces still work as plain textareas.
const outputDir = path.join(desktopRoot, "app", "vendor");

await mkdir(outputDir, { recursive: true });
await build({
  entryPoints: [path.join(toolingRoot, "vendor", "writing-editor", "entry.mjs")],
  outfile: path.join(outputDir, "writing-editor.js"),
  bundle: true,
  format: "iife",
  minify: true,
  target: ["chrome100", "safari15"],
  legalComments: "eof",
  banner: {
    js: "/* AI System 6 writing editor. Bundles CodeMirror 6 and Lezer (MIT, Copyright (C) 2018-2021"
      + " Marijn Haverbeke and others) from tooling/vendor/writing-editor/entry.mjs;"
      + " see node_modules/@codemirror/view/LICENSE. */",
  },
});
