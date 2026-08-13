import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Physical repository boundaries.
 *
 * Browser paths such as `app/core/config.js` intentionally stay relative to
 * the desktop product. Build and verification code should resolve those
 * logical paths through `desktopRoot` instead of pretending the repository
 * root is a web root.
 */
export const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const desktopRoot = join(repositoryRoot, "apps", "desktop");
export const serverRoot = join(repositoryRoot, "apps", "server");
export const platformRoot = join(repositoryRoot, "platform");
export const toolingRoot = join(repositoryRoot, "tooling");

export function fromDesktop(...parts) {
  return join(desktopRoot, ...parts);
}

export function fromRepository(...parts) {
  return join(repositoryRoot, ...parts);
}

const desktopEntryFiles = new Set([
  "index.html",
  "endfield-terminal.html",
  "app.js",
  "app.bundle.js",
  "styles.css",
  "styles.bundle.css",
  "styles.theme-lab.css",
  "styles.micropolis.css",
  "styles.openttd.css",
]);

/** Resolve a browser-logical source path to its physical repository file. */
export function resolveProjectPath(relativePath) {
  if (
    desktopEntryFiles.has(relativePath)
    || /^(?:app|assets|data|styles)(?:\/|$)/.test(relativePath)
  ) {
    return join(desktopRoot, relativePath);
  }
  return join(repositoryRoot, relativePath);
}
