// Physical-path helpers for verify:ios-standalone — no phone required.
import { createFeatureTest } from "../helpers/feature-test-harness.mjs";
import {
  detectLanIPv4,
  isLoopbackUrl,
  physicalPathCapabilities,
  probeDevicectlPresent,
  resolvePhysicalUrl,
  rewriteUrlHost,
} from "../../tooling/ios-standalone-physical.mjs";

const test = createFeatureTest("ios-standalone-physical");

test.assert(isLoopbackUrl("http://localhost:4173/"), "localhost is loopback");
test.assert(isLoopbackUrl("http://127.0.0.1:4173/"), "127.0.0.1 is loopback");
test.assert(!isLoopbackUrl("http://192.168.5.28:4173/"), "LAN IP is not loopback");

test.assert(
  rewriteUrlHost("http://localhost:4173/", "192.168.5.28") === "http://192.168.5.28:4173/",
  "rewriteUrlHost keeps port and path",
);

let rejected = false;
try {
  resolvePhysicalUrl("http://localhost:4173/", { lanUrl: false });
} catch {
  rejected = true;
}
test.assert(rejected, "physical path refuses bare localhost without --lan-url");

const rewritten = resolvePhysicalUrl("http://localhost:4173/foo", {
  lanUrl: true,
  lanHost: "10.0.0.2",
});
test.assert(rewritten.rewritten, "--lan-url rewrites localhost");
test.assert(rewritten.url === "http://10.0.0.2:4173/foo", "LAN host replaces loopback");

const caps = physicalPathCapabilities();
test.assert(caps.screenshot && caps.openUrl, "physical path can open URL and screenshot");
test.assert(
  !caps.baguette && !caps.filesystemWebClips && !caps.hidTaps,
  "physical path honestly lacks baguette / WebClip FS / HID",
);

const lan = detectLanIPv4();
test.assert(typeof lan === "string", "detectLanIPv4 returns a string (maybe empty offline)");

test.assert(typeof probeDevicectlPresent() === "boolean", "devicectl probe is boolean");

test.finish();
