#!/usr/bin/env node

/**
 * A minimal preview for one component: the Translation Pad.
 *
 *   node tooling/preview-translation-pad.mjs [--port 4188]
 *
 * It exists to answer a question the desk cannot answer quickly: does the pad
 * behave while it is being edited? Opening the real desk, connecting a model and
 * making a project to find out is the slow loop this avoids.
 *
 * Three rules keep it honest, and they are why it is small:
 *
 *   - The component is the shipped one. The page loads
 *     `app/features/translation-pad.js` and mounts it through the same
 *     `AISystem6TranslationPad` API the desk uses; the only thing it supplies is
 *     a host. No second implementation exists to drift.
 *   - The markup is the shipped one. The page fetches the real `index.html` and
 *     takes the `data-window="translationPad"` section out of it, so the ids,
 *     the classes and the stylesheets are the desk's. Nothing is copied here.
 *   - The translation is controlled. It answers on a delay the preview sets, and
 *     can be made to fail, so cancel, late answers and cleanup are reachable
 *     without a model, a key or a network call.
 *
 * Nothing here writes to a project, a file or the desk's storage.
 */

import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { desktopRoot } from "./lib/paths.mjs";

const args = process.argv.slice(2);
const portIndex = args.indexOf("--port");
if (args.length && portIndex === -1) {
  console.error("Usage: node tooling/preview-translation-pad.mjs [--port 4188]");
  process.exit(2);
}
const port = Number(portIndex >= 0 ? args[portIndex + 1] : process.env.PREVIEW_PORT || 4188);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

const previewPage = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Translation Pad preview</title>
  <link rel="stylesheet" href="/styles.bundle.css" />
  <style>
    /* Only the page frame is the preview's: the pad's own window, pane and
       controls are the desk's markup and the desk's stylesheets. */
    body { margin: 0; padding: 18px; background: var(--desk, #a7a7c4); font: 13px var(--text-font, sans-serif); }
    .preview-note { max-width: 720px; margin: 0 0 12px; color: #22262e; }
    .preview-note code { font-size: 12px; }
    #preview-host { position: relative; }
    #preview-log { max-width: 720px; margin: 14px 0 0; padding: 8px 10px; border: 1px solid #6b7280; background: #f7f7f9; font: 11px ui-monospace, monospace; white-space: pre-wrap; }
  </style>
</head>
<body>
  <p class="preview-note">
    Translation Pad preview — the shipped component, the shipped markup, and a
    translation that answers on demand. Type, press Translate, and use
    <code>window.previewPad</code> to make the next answer slow, fail or never come.
  </p>
  <div id="preview-host"></div>
  <pre id="preview-log" aria-live="polite"></pre>
  <script src="/app/core/instance-resources.js"><\/script>
  <script>
    (function () {
      "use strict";
      const log = document.getElementById("preview-log");
      const write = (line) => { log.textContent = line + "\\n" + log.textContent; };
      const dictionary = {
        ready: "Ready", to_english: "To English", to_chinese: "To Chinese",
        translation_pad: "Translation Pad", translation_pad_empty: "Type or paste something to translate.",
        translation_already_interface_language: "That text is already in the interface language.",
        translating_selection: "Translating…", translation_pad_translated: "Translated.",
        translation_pad_result_superseded: "A newer translation replaced this one.",
        translation_pad_replaced: "Replaced in the source.", translation_pad_inserted: "Inserted after the source.",
        translation_pad_sent_teachtext: "Sent to TeachText.",
        translation_failed: (detail) => "Translation failed. " + (detail || ""),
        source_text: "Source", translation_label: "Translation",
        clear: "Clear", translate: "Translate", send: "Send",
      };
      const state = { delayMs: 250, fail: false, never: false, calls: 0 };
      window.previewPad = {
        state,
        /** The next answer arrives after this long. */
        setDelay: (ms) => { state.delayMs = Number(ms) || 0; },
        /** The next answer fails instead of arriving. */
        failNext: () => { state.fail = true; },
        /** The next answer never arrives, so a cancel can be exercised. */
        neverAnswer: () => { state.never = true; },
        calls: () => state.calls,
        log: () => log.textContent,
      };
      window.currentLanguage = "en";

      (async () => {
        const shell = await (await fetch("/index.html")).text();
        const parsed = new DOMParser().parseFromString(shell, "text/html");
        const section = parsed.querySelector('[data-window="translationPad"]');
        if (!section) throw new Error("index.html has no translationPad window");
        section.classList.remove("is-hidden");
        document.getElementById("preview-host").append(section);
        // The desk's own translate step, bound by hand: the pad asks the host.
        await new Promise((resolve) => {
          const core = document.createElement("script");
          core.src = "/app/features/translation-pad.js";
          core.onload = resolve;
          document.head.append(core);
        });
        const pad = window.AISystem6TranslationPad;
        pad.useHost({
          root: () => document.getElementById("preview-host"),
          element: (name) => document.getElementById("preview-host").querySelector({
            source: "#translation-pad-source", result: "#translation-pad-result",
            status: "#translation-pad-status", target: "#translation-pad-target",
            clear: "#translation-pad-clear", translate: "#translation-pad-translate",
            send: "#translation-pad-send",
          }[name] || "#none"),
          currentLanguage: () => window.currentLanguage,
          t: (key, ...rest) => {
            const value = dictionary[key] ?? key;
            return typeof value === "function" ? value(...rest) : value;
          },
          setStatus: (message) => write("status: " + message),
          openWindow: () => true,
          beginLongTask: () => true,
          endLongTask: () => {},
          isAbortError: (error) => error && error.name === "AbortError",
          friendlyErrorDetail: (error) => (error && error.message) || "",
          getTranslationTargetForUi: (text) => (/[\\u4e00-\\u9fff]/.test(text) ? "en" : "zh"),
          translateText: (text, language, options) => new Promise((resolve, reject) => {
            state.calls += 1;
            const call = state.calls;
            write("translate #" + call + " → " + language);
            if (state.never) { state.never = false; return; }
            setTimeout(() => {
              if (state.fail) { state.fail = false; reject(new Error("the model said no")); return; }
              const answer = "[" + language + "] " + text;
              options?.onProgress?.("[" + language + "] …");
              resolve(answer);
            }, state.delayMs);
          }),
          currentTranslationModel: () => "preview",
          formatTranslationMeta: (language, at, label, model) => label + " · " + model + " · " + at,
          getSelectionContext: () => ({ text: "" }),
          selectionLabel: () => "preview",
          // The output half: a preview has no project, so the pad's write and
          // send paths report instead of writing anywhere.
          writeToSource: () => { write("write-to-source (preview: nothing is written)"); return false; },
          sendToTeachText: () => { write("send-to-teachtext (preview: nothing is sent)"); },
        });
        pad.mount();
        write("pad mounted — source=" + (pad.host().element("source") ? "present" : "missing"));
      })().catch((error) => write("preview failed: " + error.message));
    })();
  <\/script>
</body>
</html>
`;

const server = createServer((request, response) => {
  const url = new URL(request.url || "/", "http://preview.local");
  if (url.pathname === "/") {
    response.writeHead(200, { "Content-Type": MIME[".html"], "Cache-Control": "no-store" });
    response.end(previewPage);
    return;
  }
  const relative = normalize(decodeURIComponent(url.pathname)).replace(/^\/+/, "");
  const target = join(desktopRoot, relative);
  if (!target.startsWith(desktopRoot) || !existsSync(target) || !statSync(target).isFile()) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("not found");
    return;
  }
  response.writeHead(200, {
    "Content-Type": MIME[extname(target).toLowerCase()] || "application/octet-stream",
    "Cache-Control": "no-store",
  });
  createReadStream(target).pipe(response);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`[preview] Translation Pad on http://127.0.0.1:${port}/ (Ctrl-C stops it)`);
  console.log(`[preview] serving ${desktopRoot} read-only; nothing is written`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  });
}
