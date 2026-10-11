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
const chat = read("app/core/chat-messages.js");

const boot = createAppBootVm();
const ctx = boot.context;

// Sanity: the harness loaded the real app, not a husk.
const handlers = ctx.getApplicationActionHandlers();
test.assert(Object.keys(handlers).length > 150,
  `the real action registry booted (${Object.keys(handlers).length} handlers)`);

// The fresh desk IS the visitor state: no cloud model active.
test.assert(!ctx.cloudConfig?.active,
  "the boot state is a desk with no cloud model active");

// The welcome-key order: the scripted first-visit greeting leads the chain,
// so a true first visit never leads with "connect a model" even though no
// model is connected. The ternary order in the source IS the product rule.
const welcomeOrder = chat.slice(chat.indexOf('const welcomeKey = introducing'));
test.assert(welcomeOrder.indexOf('"clio_first_welcome_message"')
  < welcomeOrder.indexOf('"clio_model_required_message"'),
  "the first-visit welcome precedes the model-required gate in the key order");
test.assert(welcomeOrder.startsWith('const welcomeKey = introducing'),
  "the welcome key starts from the first-visit introduction state");

// The visitor copy exists in both locales and never promises a model.
for (const locale of ["zh", "en"]) {
  const key = `clio_first_welcome_message`;
  const localized = read(`app/data/translations-${locale}.js`);
  const line = localized.split("\n").find((row) => row.includes(`${key}: "`)) || "";
  const copy = (line.match(/: "(.*)"/) || [])[1] || "";
  test.assert(copy.length > 20 && !/connect|连接/.test(copy),
    `the ${locale} first-visit welcome needs no model (${copy.slice(0, 40)}…)`);
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
