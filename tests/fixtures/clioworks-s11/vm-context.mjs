// Shared by manifest.mjs and the S11 workbook contract: a bare vm context in which the
// vendored classic scripts load the way the browser loads them, through the script-tag
// emulation of document.head.appendChild. Ledger and Lectern both own the global `L`,
// so each codec gets its own context.
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const desktop = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "apps", "desktop");
export const readApp = (path) => readFileSync(join(desktop, path), "utf8");

export function makeContext() {
  const context = {
    console, crypto, TextEncoder, TextDecoder, DecompressionStream, CompressionStream,
    setTimeout, clearTimeout, queueMicrotask, structuredClone, URL, URLSearchParams, Blob,
    ArrayBuffer, Uint8Array, DataView, Promise, Map, Set, WeakMap, JSON, Math, Date, Intl,
    RegExp, Error, Object, Array, String, Number, Boolean, Symbol, Proxy, Reflect,
    navigator: { platform: "MacIntel", userAgent: "clioworks-s11-fixture" },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    location: { href: "http://localhost/" },
    addEventListener() {}, removeEventListener() {},
  };
  context.globalThis = context;
  context.window = context;
  context.Node = function Node() {};
  const stub = (tag) => ({ tagName: tag, style: {}, setAttribute() {}, appendChild() {}, addEventListener() {}, children: [], dataset: {} });
  context.document = {
    createElement: stub,
    createElementNS: (ns, tag) => ({ ...stub(tag), namespaceURI: ns }),
    createTextNode: (text) => ({ text }),
    addEventListener() {},
    body: { appendChild() {}, removeChild() {} },
    documentElement: { style: { setProperty() {} } },
    head: {
      appendChild(el) {
        queueMicrotask(() => {
          try {
            vm.runInContext(readApp(el.src), context, { filename: el.src });
            el.onload();
          } catch (error) {
            el.onerror(new Error(String(error && error.message || error)));
          }
        });
      },
    },
  };
  vm.createContext(context);
  return context;
}

export function loadScripts(context, paths) {
  for (const path of paths) vm.runInContext(readApp(path), context, { filename: path });
}
