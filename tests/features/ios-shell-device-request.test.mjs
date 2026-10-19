// The iOS shell's copy of the on-device request contract is built from the Node
// sources and answers byte for byte as they do (MULTIPLATFORM-SHELL-2026-10-17.md
// §4.3, §15). The shell has no Node: it runs tooling/build-device-request-bundle.mjs's
// bundle in JavaScriptCore. Here the same bundle runs in a bare node:vm context
// (no require, no process, no Buffer — what JavaScriptCore offers) and every case
// the ORIGINAL modules answered must come back identical: the task whitelist, the
// guardrails (system integrity, humanizer), the context refusal, the status
// shapes and the error copy. The Swift side (ShellContractTests) runs the same
// cases in JavaScriptCore.

import vm from "node:vm";
import { createRequire } from "node:module";
import { createFeatureTest, read, root } from "../helpers/feature-test-harness.mjs";
import { bundleDeviceRequest, buildCases, collectModules, GLOBAL_NAME } from "../../tooling/build-device-request-bundle.mjs";

const test = createFeatureTest("ios-shell-device-request");
const require = createRequire(import.meta.url);

const first = bundleDeviceRequest();
const second = bundleDeviceRequest();
test.assert(first.source === second.source, "the bundle is deterministic: the same sources give the same bytes");

const ids = [...collectModules().keys()].sort();
test.assert(
  JSON.stringify(ids) === JSON.stringify([
    "apps/desktop/app/shared/model-task-runtime.js",
    "apps/server/server/chat.js",
    "apps/server/server/device-model.js",
    "apps/server/server/humanizer.js",
    "apps/server/server/system-integrity.js",
    "tooling/lib/device-request-entry.cjs",
  ]),
  `the bundle holds exactly the contract's modules (${ids.join(", ")})`,
);
test.assert(
  /stubs\["apps\/desktop\/app\/generated\/ai-prompt-files\.json"\] = \[\];/.test(first.source),
  "the private prompt files are stubbed out, never bundled",
);
for (const input of first.inputs) {
  test.assert(first.source.includes(`// input ${input.id} sha256:${input.sha256}`), `the header records ${input.id}'s hash`);
}

const context = vm.createContext({});
vm.runInContext(first.source, context, { filename: "device-request.js" });
const api = context[GLOBAL_NAME];
test.assert(api && typeof api.prepare === "function", `the bundle installs globalThis.${GLOBAL_NAME} without Node globals`);
test.assert(!("process" in context) && !("require" in context), "the bundle leaks no Node globals into its context");

const cases = await buildCases();
let compared = 0;
for (const item of cases.prepare) {
  const answer = api.prepare(item.raw, item.contentType, item.byteLength);
  test.assert(answer === item.expected, `prepare matches the route: ${item.name}`);
  compared += 1;
}
for (const item of cases.appleStatus) {
  test.assert(api.shapeAppleStatus(item.raw) === item.expected, `Apple status shape: ${item.name}`);
  compared += 1;
}
for (const item of cases.builtInStatus) {
  test.assert(api.shapeBuiltInStatus(item.raw) === item.expected, `built-in status shape: ${item.name}`);
  compared += 1;
}
let combinedOk = 0;
for (const item of cases.combined) if (api.combinedDeviceStatus(item.apple, item.builtIn) === item.expected) combinedOk += 1;
test.assert(combinedOk === cases.combined.length, `combined status matches for ${combinedOk}/${cases.combined.length} pairs`);
let refusalOk = 0;
for (const item of cases.refusal) if (api.refusal(item.plan, item.status) === item.expected) refusalOk += 1;
test.assert(refusalOk === cases.refusal.length && refusalOk > 20, `refusals match for ${refusalOk}/${cases.refusal.length} plan × status pairs`);
for (const item of cases.helperErrors) {
  test.assert(api.mapHelperError(item.code, item.message, item.reason) === item.expected, `helper error copy: ${item.code}${item.reason ? `/${item.reason}` : ""}`);
  compared += 1;
}

// The cases themselves must exercise what matters, or a pass proves little.
const planned = cases.prepare.map((item) => JSON.parse(item.expected));
const three = planned[0];
test.assert(three.ok === true && three.plan.engine === "apple" && three.plan.modelId === "apple-foundation-models", "three-questions plans an Apple-model request");
test.assert(/AI System 6 task contract: chat\.clio-stage\./.test(three.plan.request.instructions)
  && /system integrity guardrail/i.test(three.plan.request.instructions), "the planned instructions carry the task contract and the system-integrity guardrail");
test.assert(planned.some((answer) => answer.ok === false && answer.body.code === "device_task_unavailable"), "a drafting task is refused");
test.assert(planned.some((answer) => answer.ok === false && answer.status === 415), "a wrong content type is refused as the route refuses it");
test.assert(planned.some((answer) => answer.ok === true && answer.plan.general === true && answer.plan.stream === false), "a non-streamed general chat is planned as one completion");
test.assert(cases.refusal.some((item) => JSON.parse(item.expected)?.body?.code === "context-budget-exceeded"), "some pair is refused for its size");
test.assert(cases.refusal.some((item) => JSON.parse(item.expected)?.body?.reason === "notDownloaded"), "some pair is refused because the model is not downloaded");

// The Mac route runs the same functions, so the two cannot drift apart.
const route = read("apps/server/server/routes/device-model.js");
test.assert(/planDeviceChat\(body\)/.test(route) && /deviceChatRefusal\(built, status\)/.test(route), "the Node route plans and refuses with the shared functions");
test.assert(/combinedDeviceStatus\(apple, builtIn\)/.test(route), "the Node status route uses the shared combined shape");
test.assert(!/function mapHelperError/.test(route), "the error copy lives once, in device-model.js");
const device = require(`${root}/apps/server/server/device-model.js`);
test.assert(require(`${root}/apps/server/server/routes/device-model.js`).mapHelperError === device.mapHelperError, "the route still exports the shared mapHelperError");

test.assert(compared > 40, `${compared} single cases compared byte for byte`);
test.finish();
