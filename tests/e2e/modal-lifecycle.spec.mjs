// Dialog lifecycle in a real browser: a question replaced by another is
// answered as a cancel (no caller waits forever), Escape answers Cancel, and
// the keyboard goes back to the control that asked.

import { expect, test } from "@playwright/test";
import { bootApp, dismissGuide } from "./helpers.mjs";

test("modal: one answer per question, Escape cancels, and focus comes back", async ({ page }) => {
  await bootApp(page);
  await dismissGuide(page);

  const replaced = await page.evaluate(async () => {
    const invoker = document.createElement("button");
    invoker.id = "modal-invoker";
    invoker.textContent = "Ask";
    document.body.append(invoker);
    invoker.focus();
    const first = showSystemModal("First", "confirm");
    const second = showSystemModal("Second", "confirm");
    const firstAnswer = await first;
    const dialog = document.querySelector("#system-modal");
    const stillOpen = dialog.open;
    document.querySelector("#system-modal-yes").click();
    const secondAnswer = await second;
    return { firstAnswer, secondAnswer, stillOpen };
  });
  expect(replaced.firstAnswer).toBe("cancel");
  expect(replaced.secondAnswer).toBe("yes");
  expect(replaced.stillOpen).toBe(true);

  // Focus is back on the control that asked the question.
  expect(await page.evaluate(() => document.activeElement?.id || "")).toBe("modal-invoker");

  // Escape answers Cancel rather than leaving the dialog up.
  const escaped = await page.evaluate(async () => {
    const pending = showSystemModal("Escape me", "confirm");
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    document.querySelector("#system-modal").dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
    );
    const answer = await pending;
    return { answer, open: document.querySelector("#system-modal").open };
  });
  expect(escaped.answer).toBe("cancel");
  expect(escaped.open).toBe(false);
  expect(await page.evaluate(() => document.activeElement?.id || "")).toBe("modal-invoker");
});
