import vm from "node:vm";
import { read } from "../helpers/feature-test-harness.mjs";

const context = vm.createContext({ window: {} });
vm.runInContext(read("app/core/launch-intent.js"), context);

const parse = context.window.AISystem6LaunchIntent.parse;
const assert = (condition, message) => {
  if (!condition) {
    console.error(`NO  launch-intent: ${message}`);
    process.exit(1);
  }
  console.log(`OK  launch-intent: ${message}`);
};

assert(parse("?open=micropolis").open?.command === "open-micropolis", "open=micropolis resolves to the registered command");
assert(parse("?open=teachtext").open?.command === "open-teachtext", "open=teachtext resolves to the registered command");
assert(parse("?open=reader&appearance=liquid-glass").appearance === "liquid-glass", "appearance=liquid-glass is a valid release appearance");
assert(parse("?tour=writing").tour === "writing", "tour=writing is recognized");
assert(parse("?open=unknown-app").open === null, "unknown open targets are ignored");
assert(parse("?appearance=not-a-theme").appearance === "", "unknown appearances are ignored");
assert(parse("?tour=secrets").tour === "", "unknown tours are ignored");
assert(parse("?open=micropolis&apiKey=should-not-appear").open?.command === "open-micropolis", "extra query parameters do not expand the contract");

console.log("\nlaunch-intent feature test passed.");
