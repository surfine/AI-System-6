import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("service-capabilities");
const source = read("app/core/service-capabilities.js");

function createContext() {
  const context = vm.createContext({
    window: {},
  });
  vm.runInContext(source, context);
  return context.window.AISystem6Capabilities;
}

{
  const capabilities = createContext();
  test.assert(capabilities.capabilityAvailable("project.storage"), "browser storage capability is available without a server");
  test.assert(capabilities.capabilityAvailable("artifact.export"), "browser export capability is available without a server");
  test.assert(!capabilities.capabilityAvailable("reader.remote"), "remote reader is unavailable until a provider activates it");
  test.assert(capabilities.getCapability("reader.remote").provider === "none", "an unavailable capability reports provider none");
}

{
  const capabilities = createContext();
  capabilities.registerServiceProvider("reader.remote", {
    id: "same-origin-node",
    request: (input) => input,
  });
  capabilities.setCapability("reader.remote", "same-origin-node");
  const result = capabilities.requestService("reader.remote", { url: "https://example.com" });
  test.assert(result.url === "https://example.com", "requestService delegates to the active provider");
}

{
  const capabilities = createContext();
  let threw = null;
  try {
    capabilities.requestService("reader.remote", {});
  } catch (error) {
    threw = error;
  }
  test.assert(threw?.unavailable === true, "an unavailable remote command fails explicitly");
  test.assert(!!threw?.code, "an unavailable remote command carries a reason code");
}

test.finish();
