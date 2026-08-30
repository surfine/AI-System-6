import { expect, test } from "@playwright/test";

import {
  bootApp,
  dismissGuide,
  openWindow,
} from "./helpers.mjs";

test("ClioTalk image selection stays responsive and offline", async ({ page }) => {
  test.setTimeout(90_000);
  let fileRequests = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/cloud/files") fileRequests += 1;
  });

  await bootApp(page);
  await dismissGuide(page);
  await openWindow(page, "assistant");

  const result = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 2400;
    canvas.height = 1600;
    const context = canvas.getContext("2d", { alpha: false });
    const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, "#17365d");
    gradient.addColorStop(0.5, "#e7b14b");
    gradient.addColorStop(1, "#7b2036");
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "rgba(255,255,255,.7)";
    context.font = "700 180px sans-serif";
    context.fillText("VISION", 520, 880);
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((value) => value ? resolve(value) : reject(new Error("fixture encode failed")), "image/png");
    });
    canvas.width = 1;
    canvas.height = 1;

    const files = Array.from({ length: 4 }, (_, index) => new File(
      [blob],
      `vision-${index + 1}.png`,
      { type: "image/png" }
    ));
    const longTasks = [];
    const observer = typeof PerformanceObserver === "function"
      ? new PerformanceObserver((list) => {
          list.getEntries().forEach((entry) => longTasks.push(entry.duration));
        })
      : null;
    try { observer?.observe({ type: "longtask", buffered: false }); } catch {}

    let maxTimerLag = 0;
    let previousTick = performance.now();
    const cadence = setInterval(() => {
      const now = performance.now();
      maxTimerLag = Math.max(maxTimerLag, now - previousTick - 16);
      previousTick = now;
    }, 16);

    const immediateStart = performance.now();
    const added = window.AISystem6ClioImages.addFiles(files);
    const immediateDuration = performance.now() - immediateStart;
    let sawPreparing = false;
    const deadline = performance.now() + 45_000;
    while (performance.now() < deadline) {
      const states = window.AISystem6ClioImages.chips().map((item) => item.state);
      if (states.includes("preparing")) sawPreparing = true;
      if (sawPreparing && states.length === 4 && states.every((state) => state === "pending")) break;
      await new Promise((resolve) => requestAnimationFrame(() => resolve()));
    }
    clearInterval(cadence);
    observer?.disconnect();
    const states = window.AISystem6ClioImages.chips().map((item) => item.state);
    window.AISystem6ClioImages.clear({ persist: false });
    return {
      added,
      immediateDuration,
      maxTimerLag,
      longTasks,
      sawPreparing,
      states,
    };
  });

  expect(result.added).toBe(4);
  expect(result.sawPreparing).toBe(true);
  expect(result.states).toEqual(["pending", "pending", "pending", "pending"]);
  expect(result.immediateDuration).toBeLessThan(50);
  expect(result.maxTimerLag).toBeLessThan(200);
  expect(result.longTasks.filter((duration) => duration > 200)).toEqual([]);
  expect(fileRequests).toBe(0);
});
