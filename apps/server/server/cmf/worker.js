"use strict";

const { parentPort, workerData } = require("node:worker_threads");

const {
  exportRecipeUsdz,
  renderRecipePreview,
  renderRecipeViews,
} = require("./service.js");

function waitForTestDelay(delayMs) {
  if (!delayMs) return;
  const buffer = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(buffer, 0, 0, delayMs);
}

async function run() {
  const { operation, recipe, viewName, testControls } = workerData;
  if (testControls?.enabled) {
    waitForTestDelay(testControls.delayMs);
    if (testControls.crash) process.exit(19);
    if (testControls.throwError) throw new Error("Synthetic CMF worker failure");
    if (testControls.synthetic) {
      if (operation === "export") {
        return {
          filename: "test.usdz",
          contentType: "model/vnd.usdz+zip",
          buffer: Buffer.from("synthetic-usdz"),
          recipe,
          stats: { splitCount: 0, sharedColorCount: 0 },
        };
      }
      if (operation === "views") return { recipe, views: [] };
      return {
        recipe,
        view: { name: viewName || "02-back", filename: "test.png", dataUrl: "data:image/png;base64,dGVzdA==" },
      };
    }
  }
  if (operation === "export") return await exportRecipeUsdz(recipe);
  if (operation === "views") return await renderRecipeViews(recipe);
  if (operation === "preview") return await renderRecipePreview(recipe, viewName);
  throw new Error(`Unsupported CMF worker operation: ${operation}`);
}

run().then(
  (result) => parentPort.postMessage({ ok: true, result }),
  (error) => parentPort.postMessage({
    ok: false,
    error: {
      message: String(error?.message || "CMF worker failed"),
      code: String(error?.code || "cmf_worker_failed"),
      statusCode: Number(error?.statusCode) || 500,
    },
  })
);
