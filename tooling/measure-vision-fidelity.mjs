#!/usr/bin/env node
// Does the 960px preview cost the model anything a reader would miss?
//
// The Picture Album states the product's policy in its own hint string:
// "Small previews stay in the project album; originals are kept for Project CD
// export." That policy was written when an original had one consumer, a person
// reading the exported disc. There is a second consumer now, and it has to read
// fine print. Whether the policy still holds is a measurement, not an opinion --
// so this runs it instead of arguing about it.
//
// It reads one image twice through the same OCR prompt the product uses:
//   1. downscaled to 960px on the long edge, the way
//      compressImageAttachmentDataUrl does before anything reaches the model
//   2. untouched, with detail: "original"
// and prints both transcripts side by side with their token usage.
//
//   DEEPSEEK_API_KEY=... node tooling/measure-vision-fidelity.mjs <image>
//
// Read-only. Writes no file, touches no gate, and is meant to be deleted once
// the question is settled.

import { readFileSync } from "node:fs";
import { basename, extname } from "node:path";
import process from "node:process";

const MODEL = "deepseek-v4-flash-vision-exp";
const BASE_URL = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";
const PREVIEW_MAX_EDGE = 960; // apps/desktop/app/core/image-attachments.js

// The product's own OCR prompt, copied from apps/server/server/vision.js so the
// two readings differ ONLY in the pixels. A different prompt would measure the
// prompt.
const SYSTEM = "You transcribe visible text from images for AI System 6. Preserve source text, reading order, line breaks, numbers, dates, and punctuation exactly.";
const USER = "OCR task. Transcribe all visible text in the image. Output plain text only.";

const MIME = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".gif": "image/gif", ".webp": "image/webp" };

function fail(message) {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

const [imagePath] = process.argv.slice(2);
if (!imagePath) fail("Usage: DEEPSEEK_API_KEY=... node tooling/measure-vision-fidelity.mjs <image>");

const apiKey = process.env.DEEPSEEK_API_KEY;
if (!apiKey) fail("DEEPSEEK_API_KEY is not set. This tool cannot run without your key, and it must not ask for one.");

const ext = extname(imagePath).toLowerCase();
const mimeType = MIME[ext];
if (!mimeType) fail(`${ext || "that file"} is not one of the four formats the provider accepts: jpeg, png, gif, webp.`);

const original = readFileSync(imagePath);
const originalDataUrl = `data:${mimeType};base64,${original.toString("base64")}`;

// The preview is produced by a canvas in the browser. Node has no canvas here,
// so this shells out to sips, which every Mac has. If it is unavailable the tool
// says so rather than silently measuring the original twice -- two identical
// readings would look like "the preview loses nothing", which is the wrong
// answer arrived at by accident.
async function buildPreviewDataUrl() {
  const { execFileSync } = await import("node:child_process");
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "vision-fidelity-"));
  const out = join(dir, `preview.jpg`);
  try {
    execFileSync("sips", ["-Z", String(PREVIEW_MAX_EDGE), "-s", "format", "jpeg", imagePath, "--out", out], { stdio: "pipe" });
  } catch {
    fail("sips could not produce the 960px preview, so there is nothing to compare against. Install it or run this on a Mac.");
  }
  const bytes = readFileSync(out);
  return { dataUrl: `data:image/jpeg;base64,${bytes.toString("base64")}`, bytes: bytes.length };
}

async function read(dataUrl, detail) {
  const response = await fetch(`${BASE_URL}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      max_tokens: 1600,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: [{ type: "text", text: USER }, { type: "image_url", image_url: { url: dataUrl, detail } }] },
      ],
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) fail(`The provider refused the ${detail} request: ${data?.error?.message || response.statusText}`);
  return { text: String(data?.choices?.[0]?.message?.content || "").trim(), usage: data?.usage || {} };
}

const preview = await buildPreviewDataUrl();
console.log(`\n  ${basename(imagePath)}`);
console.log(`  original ${original.length.toLocaleString()} bytes  ->  960px preview ${preview.bytes.toLocaleString()} bytes\n`);

const [low, high] = [await read(preview.dataUrl, "auto"), await read(originalDataUrl, "original")];

const show = (label, r) => {
  console.log(`  ${label}`);
  console.log(`  prompt ${r.usage.prompt_tokens ?? "?"} tokens, completion ${r.usage.completion_tokens ?? "?"}`);
  console.log(r.text.split("\n").map((line) => `      ${line}`).join("\n") || "      (nothing)");
  console.log("");
};

show("960px preview, detail: auto  — what the product sends today", low);
show("original, detail: original   — what the provider now allows", high);

const words = (t) => new Set(t.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []);
const a = words(low.text);
const b = words(high.text);
const onlyInOriginal = [...b].filter((w) => !a.has(w));
console.log(`  characters: ${low.text.length} vs ${high.text.length}`);
console.log(`  the original read ${onlyInOriginal.length} token(s) the preview did not:`);
console.log(`      ${onlyInOriginal.slice(0, 40).join(" ") || "(none — the preview lost nothing on this image)"}\n`);
console.log("  One image is one data point. Run it on the worst case you actually care about\n  -- a whiteboard, a receipt, a screenshot of small type.\n");
