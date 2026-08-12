// Small URL utilities shared across server modules.

"use strict";

/**
 * Extract the display "site" for a URL: the hostname with any
 * leading `www.` stripped. Returns "" for invalid input. Mirrors
 * `siteFromUrl` from root server.js.
 *
 * @param {unknown} value
 * @returns {string}
 */
function siteFromUrl(value) {
  try {
    return new URL(/** @type {string} */ (value)).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

module.exports = {
  siteFromUrl,
};
