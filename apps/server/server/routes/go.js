// GET /go/:route — short standalone-launch links (1.0.52).
//
// Keep this route table in sync with:
// - apps/desktop/app/core/launch-intent.js  (client ?launch= allowlist)
// - functions/go/[route].js                 (Cloudflare Pages short links)

"use strict";

const LAUNCH_ROUTES = new Map([
  ["endfield-terminal", "open-endfield-terminal"],
  ["bonsai-city", "open-bonsai-city"],
  ["micropolis", "open-micropolis"],
  ["openttd", "open-openttd"],
  ["doom", "open-doom"],
  ["time-machine", "open-time-machine"],
  ["liquid-cover", "open-liquid-cover"],
  ["cmf-studio", "open-cmf-studio"],
  ["one-more-tune", "open-one-more-tune"],
  ["dtk", "open-shared-disk-dtk"],
  ["ipad1", "open-shared-disk-ipad1"],
  ["m5ipad", "open-shared-disk-m5ipad"],
  ["iphone17e", "open-shared-disk-iphone17e"],
  ["bongo", "open-shared-disk-bongo"],
  ["glass", "open-shared-disk-glass"],
  ["ipad97", "open-shared-disk-ipad97"],
  ["airbattery", "open-shared-disk-airbattery"],
  ["pm17", "open-shared-disk-pm17"],
  ["sympathy", "open-shared-disk-sympathy"],
  ["ceramic", "open-shared-disk-ceramic"],
  ["macpro19", "open-shared-disk-macpro19"],
  ["pocket", "open-shared-disk-pocket"],
  ["iphone6sp", "open-shared-disk-iphone6sp"],
  ["sleeve", "open-shared-disk-sleeve"],
  ["pm12", "open-shared-disk-pm12"],
  ["pm11", "open-shared-disk-pm11"],
  ["m5mba", "open-shared-disk-m5mba"],
  ["mbneo", "open-shared-disk-mbneo"],
  ["mini7", "open-shared-disk-mini7"],
  ["mkb", "open-shared-disk-mkb"],
  ["sd", "open-shared-disk-sd"],
  ["ios19", "open-shared-disk-ios19"],
  ["ipada4", "open-shared-disk-ipada4"],
  ["ip16p", "open-shared-disk-ip16p"],
  ["mgscrap", "open-shared-disk-mgscrap"],
  ["t2nic", "open-shared-disk-t2nic"],
  ["airtrans", "open-shared-disk-airtrans"],
  ["ip4sdemo", "open-shared-disk-ip4sdemo"],
  ["airact", "open-shared-disk-airact"],
  ["touch2", "open-shared-disk-touch2"],
  ["noport", "open-shared-disk-noport"],
  ["cdma4", "open-shared-disk-cdma4"],
  ["iphone17", "open-shared-disk-iphone17"],
]);

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
function handleGoRedirect(req, res) {
  const url = new URL(req.url, "http://localhost");
  const match = url.pathname.match(/^\/go\/([a-z0-9-]+)\/?$/i);
  const route = match ? match[1].toLowerCase() : "";
  if (!LAUNCH_ROUTES.has(route)) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }
  const mode = url.searchParams.get("mode") === "fullscreen" ? "&mode=fullscreen" : "";
  res.writeHead(302, { Location: `/?launch=${encodeURIComponent(route)}${mode}` });
  res.end();
}

module.exports = { handleGoRedirect, LAUNCH_ROUTES };
