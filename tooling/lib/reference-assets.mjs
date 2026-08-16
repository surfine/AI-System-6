// Preflight for the `system.css-reference` submodule, shared by every visual gate.
//
// Why this exists: the Classic-era fonts (Chicago, ChiKareGo2, Monaco) and the
// five control SVGs (checkmark, three radio parts, select button) live in a git
// submodule. A fresh worktree that never ran `git submodule update --init`
// leaves that directory empty, the browser silently falls back to a system
// font, and *every text metric in the app changes*. The visual gates then
// report a plausible-looking pixel regression — the observed case was
// "classic: dimensions 1080x2336 -> 1080x2351" — and send the reader hunting
// through innocent application code. The `-` prefix in `git submodule status`
// was the whole answer.
//
// So: fail loudly *before* a gate starts a server or a browser, and treat any
// `system.css-reference/` request failure during a capture as a hard error
// rather than a swallowed console line.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { repositoryRoot } from "./paths.mjs";

export const REFERENCE_SUBMODULE = "system.css-reference";

/** Classic-era webfonts declared in apps/desktop/styles/00-foundation.css. */
export const REQUIRED_REFERENCE_FONTS = Object.freeze([
  "fonts/ChicagoFLF.woff2",
  "fonts/ChicagoFLF.woff",
  "fonts/ChiKareGo2.woff2",
  "fonts/ChiKareGo2.woff",
  "fonts/monaco.woff2",
  "fonts/monaco.woff",
]);

/**
 * Control art referenced from 00-foundation.css, 60-responsive.css and
 * 70-liquid-glass.css. Missing files do not change text metrics, but they do
 * render checkboxes, radios and dropdown buttons wrong, so a baseline captured
 * without them is equally untrustworthy.
 */
export const REQUIRED_REFERENCE_ICONS = Object.freeze([
  "icon/checkmark.svg",
  "icon/radio-border.svg",
  "icon/radio-border-focused.svg",
  "icon/radio-dot.svg",
  "icon/select-button.svg",
]);

const FIX_COMMAND = "git submodule update --init --recursive";

/**
 * Report which required reference assets are absent.
 * @returns {{ok: boolean, missingFonts: string[], missingIcons: string[]}}
 */
export function inspectReferenceAssets(root = repositoryRoot) {
  const absent = (relative) => !existsSync(join(root, REFERENCE_SUBMODULE, relative));
  const missingFonts = REQUIRED_REFERENCE_FONTS.filter(absent);
  const missingIcons = REQUIRED_REFERENCE_ICONS.filter(absent);
  return { ok: !missingFonts.length && !missingIcons.length, missingFonts, missingIcons };
}

/** Human-readable explanation for a failed inspection, or "" when everything is present. */
export function describeMissingReferenceAssets(report, gateName) {
  if (report.ok) return "";
  const lines = [`NO  ${gateName}: the ${REFERENCE_SUBMODULE} submodule is not checked out.`];
  if (report.missingFonts.length) {
    lines.push(
      "",
      `    Missing fonts (${report.missingFonts.length}/${REQUIRED_REFERENCE_FONTS.length}):`,
      ...report.missingFonts.map((name) => `      ${REFERENCE_SUBMODULE}/${name}`),
      "",
      "    Without Chicago the browser substitutes a fallback face, every text",
      "    metric in the app changes, and the capture differs from its baseline",
      "    by a handful of pixels in height. THAT DIFF IS NOT A REAL REGRESSION —",
      "    no visual result from this run can be trusted, and no baseline PNG",
      "    should be updated from it.",
    );
  }
  if (report.missingIcons.length) {
    lines.push(
      "",
      `    Missing control art (${report.missingIcons.length}/${REQUIRED_REFERENCE_ICONS.length}):`,
      ...report.missingIcons.map((name) => `      ${REFERENCE_SUBMODULE}/${name}`),
      "",
      "    Checkboxes, radio buttons and dropdown buttons render without their",
      "    System 6 art while these are absent.",
    );
  }
  lines.push(
    "",
    "    Fix it, then re-run this gate:",
    `      ${FIX_COMMAND}`,
    "",
    `    Confirm with 'git submodule status' — a '-' prefix on ${REFERENCE_SUBMODULE}`,
    "    means it is still uninitialized.",
  );
  return lines.join("\n");
}

/**
 * Hard precondition for any gate whose result depends on rendered pixels or
 * computed layout. Exits the process instead of producing a misleading diff.
 */
export function assertReferenceAssets(gateName, root = repositoryRoot) {
  const report = inspectReferenceAssets(root);
  if (report.ok) return report;
  console.error(describeMissingReferenceAssets(report, gateName));
  process.exit(1);
}

/** True when a URL or console line points at the reference submodule. */
export function isReferenceAssetPath(text) {
  return typeof text === "string" && text.includes(`${REFERENCE_SUBMODULE}/`);
}

/**
 * Attach hard-failing listeners for reference-asset load failures on a
 * Playwright page. Returns a getter for the collected problems so the caller
 * can fail the capture instead of silently baking a fallback font into a PNG.
 */
export function watchReferenceAssetLoads(page) {
  const problems = [];
  const note = (line) => {
    if (!problems.includes(line)) problems.push(line);
  };
  page.on("requestfailed", (request) => {
    const url = request.url();
    if (isReferenceAssetPath(url)) note(`request failed: ${url} (${request.failure()?.errorText || "unknown error"})`);
  });
  page.on("response", (response) => {
    const url = response.url();
    if (isReferenceAssetPath(url) && response.status() >= 400) note(`HTTP ${response.status()}: ${url}`);
  });
  return () => problems.slice();
}

/** Error text for reference-asset failures observed while a capture ran. */
export function describeReferenceAssetLoadFailures(problems, label) {
  return [
    `${label}: ${problems.length} ${REFERENCE_SUBMODULE} asset(s) failed to load.`,
    ...problems.map((line) => `  ${line}`),
    "",
    `The capture used fallback fonts or missing control art, so its pixels are`,
    `meaningless. Run '${FIX_COMMAND}' and capture again.`,
  ].join("\n");
}
