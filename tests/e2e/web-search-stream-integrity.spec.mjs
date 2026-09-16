// A Searcher run whose answer stream stops early.
//
// The reader used to hand back whatever text had arrived, with an empty
// citation list, as an ordinary result. The screen then showed a partial
// answer as a finished online answer, and an empty source list read as "this
// answer has no sources" rather than "the sources never came". The transport
// is stubbed here so the exact wire shape is the test's; the reader, the
// Searcher surface and the status bar are the app's own.

import { expect, test } from "@playwright/test";
import { bootApp, createProject, dismissGuide, openWindow } from "./helpers.mjs";

// The app registers a service worker for its offline shell, and a request the
// worker answers never reaches a test's route. This spec is about the answer
// stream, so the shell is left out of it.
test.use({ serviceWorkers: "block" });

const sse = (payload) => `data: ${JSON.stringify(payload)}\n\n`;

/**
 * Searcher's DeepSeek provider is chosen in the Control Panel, whose own
 * window is not on screen here; this is the same value that chooser sets.
 */
async function chooseOnlineAnswerProvider(page) {
  await page.evaluate(() => {
    searchProviderInput.value = "deepseek";
    searchProviderInput.dispatchEvent(new Event("change"));
    searchProviderInput.dispatchEvent(new Event("input"));
  });
}

async function search(page, query, body) {
  await page.route("**/api/search/answer", (route) => route.fulfill({
    status: 200,
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
    body,
  }));
  await page.fill("#find-path-query", query);
  await page.press("#find-path-query", "Enter");
}

test("a search stream that ends early is never shown as a finished answer", async ({ page }) => {
  await bootApp(page);
  await dismissGuide(page);
  await createProject(page, "Search Integrity Project");
  await openWindow(page, "findPath");
  await chooseOnlineAnswerProvider(page);

  await search(page, "weather in Taipei", sse({ choices: [{ delta: { content: "The first half of an answer" } }] }));

  // The text that arrived stays readable, labelled as unfinished.
  await expect(page.locator("#find-path-summary")).toContainText("The first half of an answer");
  await expect(page.locator("#find-path-summary")).toContainText("Answer stopped early");
  await expect(page.locator("#find-path-summary")).toContainText("sources were received");

  // Nothing claims the search completed.
  await expect(page.locator("#find-path-results")).toContainText("could not finish");
  await expect(page.locator("#find-path-results")).not.toContainText("Online Answer");
  await expect(page.locator("#status")).toContainText("could not finish");
  expect(await page.evaluate(() => String(typeof findPathWebAnswer === "undefined" ? "" : findPathWebAnswer || ""))).toBe("");
});

test("a completed search stream still shows its answer and sources", async ({ page }) => {
  await bootApp(page);
  await dismissGuide(page);
  await createProject(page, "Search Complete Project");
  await openWindow(page, "findPath");
  await chooseOnlineAnswerProvider(page);

  await search(page, "weather in Taipei", [
    sse({ ai_system6_status: "searching" }),
    sse({ choices: [{ delta: { content: "Taipei is cloudy today." } }] }),
    sse({
      ai_system6_result: {
        answer: "Taipei is cloudy today.",
        citations: [{ url: "https://example.com/weather", title: "Weather" }],
        results: [],
        searchCalls: [],
      },
    }),
    sse({ type: "done" }),
  ].join(""));

  await expect(page.locator("#find-path-summary")).toContainText("Taipei is cloudy today.");
  await expect(page.locator("#find-path-summary")).toContainText("Online Answer");
  await expect(page.locator("#find-path-results")).toContainText("Weather");
  expect(await page.evaluate(() => findPathWebAnswer?.answer || "")).toBe("Taipei is cloudy today.");
});
