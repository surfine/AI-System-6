// The Translation Pad pilot, driven in the preview it exists for.
//
// The preview mounts the shipped component file against the shipped markup,
// which it lifts out of the real index.html, and supplies only a host: the
// translation answers on demand. That is the whole point of the pilot — one
// component file, two places it runs — so this drives the preview in a real
// browser and holds the behaviours the component owns: an answer fills the pad,
// a superseded answer does not overwrite a newer one, an answer for text the
// writer cleared does not refill it, and a dispose/mount cycle gives the
// bindings back.

import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`OK  translation-pad-preview: ${message}`);
}

function reservePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address ? address.port : 0;
      probe.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

const port = await reservePort();
const preview = spawn(process.execPath, ["tooling/preview-translation-pad.mjs", "--port", String(port)], {
  cwd: root,
  stdio: ["ignore", "pipe", "pipe"],
});
const output = { value: "" };
preview.stdout.on("data", (chunk) => { output.value += chunk.toString(); });
preview.stderr.on("data", (chunk) => { output.value += chunk.toString(); });

const browser = await chromium.launch();
const context = await browser.newContext({ baseURL: `http://127.0.0.1:${port}`, viewport: { width: 1100, height: 900 } });
const page = await context.newPage();

try {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.AISystem6TranslationPad && window.previewPad, undefined, { timeout: 20000 });

  const mounted = await page.evaluate(() => ({
    source: !!window.AISystem6TranslationPad.host().element("source"),
    resourceCount: window.AISystem6TranslationPad.resourceCount(),
    status: document.querySelector("#translation-pad-status")?.textContent || "",
  }));
  assert(mounted.source, "the preview mounts the shipped component against the shipped markup");
  assert(mounted.resourceCount > 0, "and the pad binds its controls");

  const translated = await page.evaluate(async () => {
    const pad = window.AISystem6TranslationPad;
    window.previewPad.setDelay(120);
    document.querySelector("#translation-pad-source").value = "A sentence that needs translating.";
    await pad.translate();
    return { result: document.querySelector("#translation-pad-result").value, status: document.querySelector("#translation-pad-status").textContent };
  });
  assert(translated.result.startsWith("[zh] "), `the answer fills the pad (${translated.result})`);
  assert(/Ready|Translated/.test(translated.status), "and the pad reports it is done");

  const superseded = await page.evaluate(async () => {
    const pad = window.AISystem6TranslationPad;
    window.previewPad.setDelay(400);
    document.querySelector("#translation-pad-source").value = "First passage.";
    const first = pad.translate();
    const second = pad.translate();
    await Promise.all([first, second]);
    return document.querySelector("#translation-pad-result").value;
  });
  assert(
    superseded.includes("First passage."),
    "the last answer is the one on the pad after two runs overlap"
  );

  const cleared = await page.evaluate(async () => {
    const pad = window.AISystem6TranslationPad;
    window.previewPad.setDelay(400);
    document.querySelector("#translation-pad-source").value = "Text the writer clears.";
    const pending = pad.translate();
    document.querySelector("#translation-pad-clear").dispatchEvent(new Event("click", { bubbles: true }));
    await pending;
    return document.querySelector("#translation-pad-result").value;
  });
  assert(cleared === "", "an answer for text the writer cleared does not refill the pad");

  const remounted = await page.evaluate(() => {
    const pad = window.AISystem6TranslationPad;
    const bound = pad.resourceCount();
    pad.dispose();
    const released = pad.resourceCount();
    pad.mount();
    return { bound, released, rebound: pad.resourceCount() };
  });
  assert(
    remounted.released === 0 && remounted.rebound === remounted.bound,
    "a dispose gives the bindings back and the next mount binds them again"
  );

  // The output half of the component is the desk's, so the preview supplies its
  // own: pressing Send reports instead of writing to a project or a file.
  const sent = await page.evaluate(async () => {
    window.previewPad.setDelay(50);
    document.querySelector("#translation-pad-source").value = "Send this one.";
    await window.AISystem6TranslationPad.translate();
    window.AISystem6TranslationPad.send();
    return window.previewPad.log();
  });
  assert(
    /send-to-teachtext \(preview: nothing is sent\)/.test(sent),
    "the output half is the preview's, so nothing is written to a project or a file"
  );
} finally {
  await context.close();
  await browser.close();
  preview.kill("SIGTERM");
  await new Promise((resolve) => {
    preview.once("exit", resolve);
    setTimeout(resolve, 4000);
  });
  if (preview.exitCode === null) {
    console.error("the preview did not stop on SIGTERM");
    process.exitCode = 1;
  }
}

if (process.exitCode) {
  console.error(output.value);
  process.exit(process.exitCode);
}
console.log("\ntranslation-pad-preview integration test passed.");
