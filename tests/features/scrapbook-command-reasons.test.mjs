// A second application on the unified availability contract: the Scrapbook
// answers "can this run, and what is it waiting for" through the same runtime
// call the menus use, and a dispatch carries the same reason.

import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";
import { createAppBootVm } from "../helpers/app-boot-vm.mjs";

const test = createFeatureTest("scrapbook-command-reasons");

const vmw = createAppBootVm();
const run = (code) => vmw.run(code);

test.assert(
  run('typeof window.AISystem6Runtime.commandAvailability === "function"') === true,
  "the runtime answers availability for every registered command"
);

const awayFromWindow = await run(`
  (() => {
    document.querySelectorAll(".window").forEach((win) => win.classList.remove("is-active"));
    return window.AISystem6Runtime.commandAvailability("scrapbook-insert");
  })()
`);
test.assert(
  awayFromWindow.available === false && awayFromWindow.reason === "scrapbook_needs_window",
  "a Scrapbook command whose window is not in front says which window it needs"
);

const inWindow = await run(`
  (() => {
    const win = document.querySelector('[data-window="scrapbook"]');
    if (!win) return { skipped: "no scrapbook window in this harness" };
    win.classList.remove("is-hidden", "is-collapsed");
    document.querySelectorAll(".window").forEach((other) => other.classList.remove("is-active"));
    win.classList.add("is-active");
    return {
      reading: window.AISystem6Runtime.commandAvailability("scrapbook-keep-reading"),
      selection: window.AISystem6Runtime.commandAvailability("focus-scrapbook-question"),
      open: window.AISystem6Runtime.commandAvailability("open-scrapbook"),
    };
  })()
`);
test.assert(
  inWindow.open?.available === true,
  "opening the Scrapbook is always available"
);
test.assert(
  inWindow.reading?.available === false && inWindow.reading.reason === "scrapbook_no_reading",
  "a command that needs a reading says so while there is none"
);
test.assert(
  inWindow.selection?.available === false && inWindow.selection.reason === "scrapbook_no_selection",
  "a command that needs a selection says so while nothing is selected"
);

const dispatched = await run(`
  window.AISystem6Runtime.dispatchCommand("focus-scrapbook-question")
`);
test.assert(
  dispatched.status === "unavailable" && dispatched.reason === "scrapbook_no_selection",
  "dispatching it carries the same reason instead of an empty refusal"
);

// The reasons are user-facing: both language tables have them.
const english = read("app/data/translations-en.js");
const chinese = read("app/data/translations-zh.js");
const reasons = [
  "scrapbook_needs_window",
  "scrapbook_no_reading",
  "scrapbook_no_selection",
  "scrapbook_no_page",
  "scrapbook_nothing_selected",
];
reasons.forEach((key) => {
  test.assert(
    english.includes(`${key}:`) && chinese.includes(`${key}:`),
    `the reason ${key} is translated in both languages`
  );
});

test.finish();
