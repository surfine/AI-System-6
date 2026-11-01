/**
 * The one visible freshness line on the public front page.
 *
 * A visitor reads the README before the changelog. Without this line the only
 * date on the page is inside a collapsed release note, so the page can look
 * abandoned even when the build is hours old. The line is generated from the
 * same two identity sources as every other derived surface; it is never edited
 * by hand.
 */

export const REPO_SLUG = "surfine/AI-System-6";
export const STATUS_START = "<!-- status:start -->";
export const STATUS_END = "<!-- status:end -->";

/** `20261101.1` -> `2026-11-01`; an absent or malformed stamp yields "". */
export function buildDate(build) {
  const match = /^(\d{4})(\d{2})(\d{2})\.\d+$/.exec(String(build || ""));
  return match ? `${match[1]}-${match[2]}-${match[3]}` : "";
}

/**
 * The release tag. A version that already carries a prerelease suffix is its
 * own tag (`v2.0.0-beta.1`); a stable version gets the same unprefixed tag.
 */
export function releaseTag(version) {
  return `v${version}`;
}

export function statusLine({ version, build, chinese = false }) {
  const date = buildDate(build);
  const label = chinese ? "测试版" : "Beta";
  const buildLabel = chinese ? "构建" : "build";
  const notes = chinese ? "发布说明" : "release notes";
  const tag = releaseTag(version);
  // The markers must be their own lines. A line that starts with an HTML
  // comment is an HTML block to GitHub's Markdown parser, so Markdown after the
  // comment on the same line renders as literal asterisks and brackets.
  return [
    STATUS_START,
    `**${label} ${version}** · ${buildLabel} ${build} · ${date} · `
      + `[${notes}](https://github.com/${REPO_SLUG}/releases/tag/${tag})`,
    STATUS_END,
  ].join("\n");
}

/** Replace the marked line, or return null when the document has no markers. */
export function replaceStatusLine(text, line) {
  const start = text.indexOf(STATUS_START);
  const end = text.indexOf(STATUS_END);
  if (start === -1 || end === -1 || end < start) return null;
  return text.slice(0, start) + line + text.slice(end + STATUS_END.length);
}

/** The marked line, or null when the document has no markers. */
export function findStatusLine(text) {
  const start = text.indexOf(STATUS_START);
  const end = text.indexOf(STATUS_END);
  if (start === -1 || end === -1 || end < start) return null;
  return text.slice(start, end + STATUS_END.length);
}
