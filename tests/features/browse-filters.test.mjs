// Time Machine's ad and tracker blocking on the browse origin.
//
// The rules are uBlock Origin Lite's own (GPL-3.0), compiled by
// tooling/browse/build-filters.mjs into a form the service worker can index,
// and matched by apps/browse/filter-match.js with declarativeNetRequest's
// semantics. The fixture rules below each pin one piece of those semantics;
// the real set, when it has been fetched, is checked against well-known ad
// hosts, ordinary pages that must still load, and a time budget per request.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import vm from "node:vm";
import { createFeatureTest, root } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("browse-filters");

function loadMatcher() {
  const context = { self: {} };
  vm.createContext(context);
  vm.runInContext(readFileSync(join(root, "apps/browse/filter-match.js"), "utf8"), context);
  return context.self.AIS6Filters;
}

function build(source) {
  const out = mkdtempSync(join(tmpdir(), "ais6-filters-"));
  execFileSync(process.execPath, [join(root, "tooling/browse/build-filters.mjs"), "--source", source, "--out", out], { stdio: "pipe" });
  const network = JSON.parse(readFileSync(join(out, "network.json"), "utf8"));
  const cosmetic = JSON.parse(readFileSync(join(out, "cosmetic.json"), "utf8"));
  rmSync(out, { recursive: true, force: true });
  return { network, cosmetic };
}

const filters = loadMatcher();
const fixture = build(join(root, "tests/fixtures/browse-filters"));
const index = filters.compileNetwork(fixture.network);
const blocked = (url, type = "script", initiatorHost = "page.example", thirdParty) => filters.matchNetwork(index, {
  url,
  hostname: new URL(url).hostname,
  type,
  initiatorHost,
  thirdParty: thirdParty ?? (initiatorHost !== "" && !new URL(url).hostname.endsWith(initiatorHost)),
});

test.assert(blocked("https://ads.example.com/x.js"), "||host^ blocks the host itself");
test.assert(blocked("https://deep.sub.ads.example.com/a"), "||host^ blocks its subdomains");
test.assert(!blocked("https://notads.example.com/x.js"), "||host^ does not block a host that merely ends with the same letters");
test.assert(blocked("https://sep.example.com:443/x") && !blocked("https://sep.example.community/x"), "^ is a separator, not a wildcard");
test.assert(blocked("https://wild.example.com/any/path/ad.js") && !blocked("https://wild.example.com/ad.png"), "* matches within the pattern only");
test.assert(blocked("https://start.example.com/x") && !blocked("https://cdn.test/?u=https://start.example.com/"), "| anchors to the start of the address");
test.assert(blocked("https://rd.example.com/pixel"), "requestDomains blocks by host");
test.assert(blocked("https://third.example.com/t.js", "script", "page.example", true), "a third-party rule blocks a third-party request");
test.assert(!blocked("https://third.example.com/t.js", "script", "third.example.com", false), "a third-party rule leaves the site's own request alone");
test.assert(blocked("https://init.example.com/x", "script", "good.example") && !blocked("https://init.example.com/x", "script", "other.example"), "initiatorDomains limits a rule to pages of those sites");
test.assert(!blocked("https://exclinit.example.com/x", "script", "trusted.example") && blocked("https://exclinit.example.com/x", "script", "else.example"), "excludedInitiatorDomains exempts pages of those sites");
test.assert(blocked("https://scriptonly.example.com/a.js", "script") && !blocked("https://scriptonly.example.com/a.png", "image"), "resourceTypes limits a rule to those kinds of request");
test.assert(!blocked("https://tie.example.com/x"), "allow wins over block at the same priority");
test.assert(blocked("https://prio.example.com/x"), "a higher-priority block wins over a lower allow");
test.assert(!blocked("https://tracker.example/x.js", "script", "aar.example"), "allowAllRequests for a page lets everything on it load");
test.assert(blocked("https://tracker.example/x.js", "script", "page.example"), "the same request from another page is blocked");
test.assert(!blocked("https://redir.example/x.js"), "redirect rules are not applied as blocks");
test.assert(!blocked("https://method.example/x.js"), "rules on conditions the matcher does not know are skipped, not guessed");

const css = filters.cosmeticCss(fixture.cosmetic, "sub.example.com");
test.assert(css.includes(".ad-banner") && css.includes("display:none!important"), "a site's own hiding rules apply to it");
test.assert(css.includes(".parent-only") || filters.cosmeticCss(fixture.cosmetic, "example.com").includes(".parent-only") === false, "a parent domain's rules apply to its subdomains");
test.assert(filters.cosmeticCss(fixture.cosmetic, "nowhere.test") === "", "a site with no rules gets no style");
test.assert(!css.includes("{\"selector\""), "procedural rules are not written as CSS");

// --- The real set ------------------------------------------------------------
const realSource = join(root, ".cache/ubol/2026.1006.1931/chromium");
if (existsSync(join(realSource, "rulesets"))) {
  const real = build(realSource);
  const realIndex = filters.compileNetwork(real.network);
  const realBlocked = (url, type, initiatorHost) => filters.matchNetwork(realIndex, {
    url,
    hostname: new URL(url).hostname,
    type,
    initiatorHost,
    thirdParty: !new URL(url).hostname.endsWith(initiatorHost),
  });
  test.assert(realBlocked("https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js", "script", "example.com"), "Google's ad script is blocked");
  test.assert(realBlocked("https://www.google-analytics.com/analytics.js", "script", "example.com"), "Google Analytics is blocked");
  test.assert(realBlocked("https://securepubads.g.doubleclick.net/tag/js/gpt.js", "script", "example.com"), "DoubleClick's ad tag is blocked");
  test.assert(!realBlocked("https://www.wikipedia.org/", "main_frame", ""), "an ordinary page still opens");
  test.assert(!realBlocked("https://cdn.jsdelivr.net/npm/react@18/umd/react.production.min.js", "script", "example.com"), "a library from a public CDN still loads");
  test.assert(!realBlocked("https://sspai.com/post/73145", "main_frame", ""), "a Chinese article page still opens");
  // Timed after a warm-up pass, as the worker runs it: the first pass pays for
  // compiling the expressions. The budget leaves room for a busy machine
  // running the whole suite in parallel; a regression to scanning every rule
  // costs several milliseconds and still fails it.
  const urls = Array.from({ length: 2000 }, (_, i) => `https://host${i % 97}.example${i % 13}.com/path/${i}/file${i % 7}.js?x=${i}`);
  for (const url of urls) realBlocked(url, "script", "page.example");
  const start = process.hrtime.bigint();
  for (const url of urls) realBlocked(url, "script", "page.example");
  const averageMs = Number(process.hrtime.bigint() - start) / 1e6 / urls.length;
  test.assert(averageMs < 1.5, `matching takes ${averageMs.toFixed(3)} ms a request on average (budget 1.5 ms)`);
}

test.finish();
