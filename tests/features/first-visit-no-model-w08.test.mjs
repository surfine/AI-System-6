// Unified spec (2026-10-10) W08 contract: a brand-new visitor with no model
// connected is a first-class desk state. The scripted first-visit welcome
// leads before any model gate (its copy needs no model), the no-model copy
// exists but does not lead, and the desk's basic tools — reading surfaces and
// clipping — stay registered and callable. Real registries, not source
// strings: the command registry, the action-handler map and the admitted
// window records come from the booted app's own lookups.
import { createAppBootVm } from "../helpers/app-boot-vm.mjs";
import { createFeatureTest, read, windowRegistryRecords } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("first-visit-no-model-w08");

const boot = createAppBootVm();
const ctx = boot.context;

// Sanity: the harness loaded the real app, not a husk.
const handlers = ctx.getApplicationActionHandlers();
test.assert(Object.keys(handlers).length > 150,
  `the real action registry booted (${Object.keys(handlers).length} handlers)`);

// The fresh desk IS the visitor state: no cloud model active.
test.assert(!ctx.cloudConfig?.active,
  "the boot state is a desk with no cloud model active");

// The first visit leads with About's three doors, none of which needs a model:
// picking a Mac and keeping a line are local, and the film is a frame. The
// only door that asks a model ("let Clio ask me three questions") is grey with
// its reason when none is connected, and the first face never mentions one.
const about = read("app/features/about-desk.js");
test.assertMatches(about, /function modelCanAsk\(\) \{[\s\S]*?return \{ ok: false, reason: "about_door_ask_no_model" \};/,
  "the one model-backed follow-up reports why it cannot run instead of failing");
for (const locale of ["zh", "en"]) {
  const localized = read(`app/data/translations-${locale}.js`);
  for (const key of ["about_first_tagline", "about_door_mac_body", "about_door_line_body", "about_door_film_body"]) {
    const line = localized.split("\n").find((row) => row.includes(`${key}: "`)) || "";
    const copy = (line.match(/: "(.*)"/) || [])[1] || "";
    test.assert(copy.length > 8 && !/connect|连接|model|模型/i.test(copy),
      `the ${locale} first-visit copy ${key} needs no model (${copy.slice(0, 40)}…)`);
  }
}

// Basic tools are registered where dispatch actually looks: the command
// registry and the application handler map. Clipping and reading must not
// sit behind a model connection.
const commandRegistry = ctx.getApplicationCommandRegistry();
test.assert(typeof commandRegistry?.get === "function",
  "the command registry exposes real lookups");
for (const actionId of ["open-teachtext", "reader-clip-translate"]) {
  const entry = commandRegistry.get(actionId);
  test.assert(!!entry && typeof entry.handler === "function",
    `the basic tool ${actionId} is registered and callable without a model`);
}
for (const actionId of ["scrapbook-clip-picture", "clip-teachtext-selection", "clip-last-reply"]) {
  const entry = handlers[actionId];
  test.assert(typeof entry === "function",
    `the basic tool ${actionId} is registered and callable without a model`);
}

// The reading surface is an admitted window: a visitor's desk knows TeachText
// as a real application target.
const admitted = windowRegistryRecords();
test.assert(!!admitted.teachText || Object.values(admitted).some((record) => JSON.stringify(record).includes("teachText")),
  "TeachText is an admitted window on the visitor's desk");

test.finish();
