// The Cloudflare Pages `_headers` file, as data.
//
// It lives here rather than inline in the builder so that
// tests/features/static-cache-policy.test.mjs can assert the policy without
// running a build, and so the cache rule has exactly one source. The matching
// rule for the VPS host is cacheHeaders() in apps/server/server/static.js and
// the $ais6_expires map in platform/web/ai-system6-nginx.conf.

const IMMUTABLE = "public, max-age=31536000, immutable";
// A day, not a week. Aaron chose the shorter window on 2026-08-21: the CSS
// bundle stamps the asset URLs it writes, but anything fetched bare — the
// bureaucracy templates, the pdf.js and PaddleOCR copies — cannot heal until
// this expires, and a day of repeat requests is a cost the VPS can carry.
const ONE_DAY = "public, max-age=86400";

/**
 * Prefixes whose every URL carries ?v=<build>. That stamp is what makes an
 * immutable entry safe: it belongs to exactly one build, so a bad release is
 * never requested again once the next one ships. The loader stamps its own
 * requests (app/core/config.js lazyScriptUrl) and stampIndexHtml stamps the
 * head references.
 *
 * A _headers rule cannot read a query string, so the stamping side is the
 * load-bearing half of this contract.
 */
export const immutablePrefixes = Object.freeze([
  "/app.bundle.js",
  "/styles.bundle.css",
  "/styles.*.css",
  "/app/core/*",
  "/app/features/*",
  "/app/data/*",
  "/app/content/*",
  "/app/generated/*",
]);

/**
 * Prefixes served by stable, unversioned URLs. Stylesheets name icons and
 * theme art by path, and data/bureaucracy-templates.json is fetched bare, so
 * none of these can be immutable — a day matches what the VPS virtual host
 * serves and lets a changed file heal itself.
 *
 * `/app/vendor/*` belongs here by omission from the list above: the pdf.js and
 * PaddleOCR copies are fetched unstamped (export-import.js
 * loadBrowserVendorScriptOnce and a bare import()), so an immutable entry
 * there would pin a vendor file for a year.
 */
export const revalidatedPrefixes = Object.freeze([
  "/assets/*",
  "/data/*",
]);

const securityHeaders = Object.freeze([
  "X-Content-Type-Options: nosniff",
  "Referrer-Policy: no-referrer",
  "X-Frame-Options: DENY",
  "Cross-Origin-Resource-Policy: same-origin",
  "Permissions-Policy: camera=(), geolocation=(), microphone=(self), payment=(), usb=()",
  "Content-Security-Policy: default-src 'self'; script-src 'self' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; frame-src 'self' https://challenges.cloudflare.com; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
]);

/** The full `_headers` file contents. */
export function pagesHeadersFile() {
  return [
    ...immutablePrefixes.flatMap((prefix) => [prefix, `  Cache-Control: ${IMMUTABLE}`, ""]),
    ...revalidatedPrefixes.flatMap((prefix) => [prefix, `  Cache-Control: ${ONE_DAY}`, ""]),
    "/*",
    ...securityHeaders.map((header) => `  ${header}`),
  ].join("\n");
}
