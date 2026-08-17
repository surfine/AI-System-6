import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, webkit } from "@playwright/test";
import {
  dismissGuide,
  createProject,
  openWindow,
  runAction,
  dumpIndexedDb,
} from "./helpers.mjs";

const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const desktopRoot = process.env.AISYSTEM6_STATIC_ROOT
  ? path.resolve(process.env.AISYSTEM6_STATIC_ROOT)
  : path.join(repoRoot, "apps", "desktop");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".map": "application/json; charset=utf-8",
};

function contentTypeFor(filePath) {
  return MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

function startStaticServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || "/", "http://static.local");
    if (url.pathname.startsWith("/api/")) {
      res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
      res.end('{"error":"not found"}');
      return;
    }
    const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
    const target = path.normalize(path.join(desktopRoot, pathname));
    if (!target.startsWith(desktopRoot)) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    fs.promises.readFile(target)
      .then((data) => {
        res.writeHead(200, { "Content-Type": contentTypeFor(target) });
        res.end(data);
      })
      .catch(() => {
        res.writeHead(404);
        res.end("not found");
      });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, baseURL: `http://127.0.0.1:${port}` });
    });
  });
}

function routeCapabilities(context, mode) {
  return context.route("**/api/capabilities", async (route) => {
    if (mode === "500") {
      await route.fulfill({ status: 500, contentType: "application/json", body: "{}" });
    } else if (mode === "timeout") {
      await new Promise((resolve) => setTimeout(resolve, 2500));
      await route.abort();
    } else if (mode === "html") {
      await route.fulfill({ status: 200, contentType: "text/html", body: "<html><body>nope</body></html>" });
    } else if (mode === "empty") {
      await route.fulfill({ status: 200, contentType: "application/json", body: "" });
    } else if (mode === "invalid-json") {
      await route.fulfill({ status: 200, contentType: "application/json", body: "{not-json" });
    }
    // 404 falls through to the static server.
  });
}

async function bootStaticPage(browser, baseURL, mode) {
  const context = await browser.newContext({ baseURL });
  await routeCapabilities(context, mode);
  const page = await context.newPage();
  const pageErrors = [];
  const apiCapabilityRequests = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("request", (request) => {
    if (request.url().includes("/api/capabilities")) apiCapabilityRequests.push(request.url());
  });
  await page.goto(`${baseURL}/`);
  await page.waitForFunction(() => document.body.dataset.appReady === "ready", undefined, { timeout: 45_000 });
  return { context, page, pageErrors, apiCapabilityRequests };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function verifyBootState(page, pageErrors, apiCapabilityRequests) {
  await page.waitForFunction(
    () => document.documentElement.dataset.deploymentProfile !== "local",
    undefined,
    { timeout: 5_000 }
  ).catch(() => {});
  await page.waitForTimeout(500);
  const state = await page.evaluate(() => ({
    profile: document.documentElement.dataset.deploymentProfile,
    remoteReader: window.AISystem6Capabilities?.getCapability?.("reader.remote"),
    ready: document.body.dataset.appReady,
  }));
  assert(state.ready === "ready", "desktop did not reach ready");
  assert(state.profile !== "local", "static deployment was misclassified as local");
  assert(state.remoteReader?.available !== true, "remote reader must not be available in static mode");
  assert(apiCapabilityRequests.length <= 1, `capabilities probe looped: ${apiCapabilityRequests.length}`);
  assert(pageErrors.length === 0, `uncaught page errors: ${pageErrors.join(" | ")}`);
  return state;
}

async function verifyFullStaticFlow(browser, baseURL) {
  const { context, page, pageErrors, apiCapabilityRequests } = await bootStaticPage(browser, baseURL, "404");
  await dismissGuide(page);
  await createProject(page, "Static Smoke Project");
  await runAction(page, "new-text-document");
  await openWindow(page, "teachText");
  await page.waitForSelector("#teachtext-body", { timeout: 15_000 });
  await page.fill("#teachtext-body", "# Static smoke source\n\nPersisted content.");
  await page.evaluate(async () => {
    if (typeof saveTextDocument === "function") {
      await saveTextDocument({ promptForFolder: false, revealInDocuments: false });
    }
  });
  await page.waitForFunction(() => {
    return chatFiles.some((file) => file.projectId === activeProjectId && /Persisted content\./.test(file.body || ""));
  }, undefined, { timeout: 15_000 });

  apiCapabilityRequests.length = 0;
  pageErrors.length = 0;
  await page.reload();
  await page.waitForFunction(() => document.body.dataset.appReady === "ready", undefined, { timeout: 45_000 });
  const db = await dumpIndexedDb(page);
  assert(
    (db.chatFiles || []).some((file) => /Persisted content\./.test(file.body || "")),
    "persisted document did not survive reload"
  );

  await runAction(page, "open-project-info");
  await openWindow(page, "projectInfo");
  const backupPromise = page.waitForEvent("download", { timeout: 20_000 });
  await page.click("#export-project-disk");
  const download = await backupPromise;
  const backupPath = await download.path();
  assert(!!backupPath && fs.existsSync(backupPath), "project backup did not download");

  await runAction(page, "open-reader");
  await openWindow(page, "reader");
  await page.fill("#reader-url-input", "https://example.com/");
  await runAction(page, "reader-open-source");
  await page.waitForFunction(() => {
    const content = document.querySelector("#reader-workspace")?.textContent || "";
    return /当前环境无法使用|unavailable|service/i.test(content);
  }, undefined, { timeout: 15_000 });

  await verifyBootState(page, pageErrors, apiCapabilityRequests);
  await context.close();
}

async function main() {
  const { server, baseURL } = await startStaticServer();
  try {
    for (const [name, browserType] of [["chromium", chromium], ["webkit", webkit]]) {
      const browser = await browserType.launch();
      await verifyFullStaticFlow(browser, baseURL);

      for (const mode of ["500", "timeout", "html", "empty", "invalid-json"]) {
        const { context, page, pageErrors, apiCapabilityRequests } = await bootStaticPage(browser, baseURL, mode);
        await verifyBootState(page, pageErrors, apiCapabilityRequests);
        await context.close();
      }
      await browser.close();
      console.log(`${name} static smoke passed`);
    }
  } finally {
    server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
