// showSystemModal's Enter key now reaches the button its "default" class
// actually marks (modal.js), instead of always landing on Cancel by
// accident of native <dialog> focus order — see
// tests/e2e/dialog-default-button.spec.mjs for the real-browser proof of
// that fix, which the VM harness cannot reach (no showModal/native focus in
// its DOM shim).
//
// That fix has a sharp edge: a "confirm" call defaults to Yes/OK unless the
// caller passes defaultAction: "cancel", and danger: true is this
// codebase's own marker that a confirm's Yes button does something
// irreversible (bonsai-city.js, documents-chat.js, chat-messages.js already
// pair the two). Before the Enter fix landed, every "confirm" dialog
// defaulted to Cancel by accident regardless of that marking, which is the
// only reason micropolis.js's deleteMicropolisCity (danger: true, no
// defaultAction) was ever safe to leave unpaired — Enter silently cancelled
// instead of deleting. Once Enter reaches the real default, an unpaired
// danger dialog deletes on a bare Enter. This walks every showSystemModal
// call in the real app source and holds the pairing as a standing contract,
// not just a one-time fix to the two calls found missing it (micropolis.js,
// desktop-runtime.js's resetSystemStorage).

import { parseJsSource, forEachAstChild, read, createFeatureTest } from "../helpers/feature-test-harness.mjs";
import { appModulePaths, lazyRuntimePaths } from "../../tooling/runtime-manifest.mjs";

const test = createFeatureTest("dialog-default-safety");

function objectPropertyValue(objectExpression, key) {
  if (!objectExpression || objectExpression.type !== "ObjectExpression") return undefined;
  const prop = objectExpression.properties.find(
    (p) => p.type === "Property" && (p.key.name === key || p.key.value === key)
  );
  if (!prop) return undefined;
  const value = prop.value;
  if (value.type === "Literal") return value.value;
  return "non-literal";
}

const paths = [...appModulePaths, ...lazyRuntimePaths, "app.js"];
const unpaired = [];
let callsChecked = 0;

for (const path of paths) {
  let source;
  try {
    source = read(path);
  } catch {
    continue;
  }
  if (!source.includes("showSystemModal(")) continue;
  const ast = parseJsSource(source);
  const visit = (node) => {
    if (!node || typeof node.type !== "string") return;
    if (
      node.type === "CallExpression"
      && node.callee.type === "Identifier"
      && node.callee.name === "showSystemModal"
    ) {
      callsChecked += 1;
      const optionsArg = node.arguments[2];
      const danger = objectPropertyValue(optionsArg, "danger");
      const defaultAction = objectPropertyValue(optionsArg, "defaultAction");
      if (danger === true && defaultAction !== "cancel") {
        const line = source.slice(0, node.start).split("\n").length;
        unpaired.push(`${path}:${line}`);
      }
    }
    forEachAstChild(node, visit);
  };
  visit(ast);
}

test.assert(callsChecked > 10, `showSystemModal is actually called across the app source (found ${callsChecked} call sites)`);
test.assert(
  unpaired.length === 0,
  unpaired.length
    ? `every showSystemModal(..., { danger: true }) also pairs defaultAction: "cancel", so Enter cannot fire the irreversible action by accident — unpaired: ${unpaired.join(", ")}`
    : `every danger: true confirm in the real app source pairs defaultAction: "cancel" (${callsChecked} showSystemModal call sites checked)`
);

test.finish();
