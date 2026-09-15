/**
 * Ambient contract for persistence-scan-shadow.js.
 *
 * Both files are classic scripts on the same page, so a top-level `const` in
 * one is a binding in the global lexical scope the other can read; that is
 * exactly why the shadow asks for these two with `typeof` instead of assuming
 * them. TypeScript only needs the names typed - at runtime the guard still
 * decides whether they are there, and a build without persistence-status.js
 * keeps reporting "(n/a)".
 */
declare const dirtyDeskRecords: Map<string, Set<string>>;
declare const deletedDeskRecords: Map<string, Set<string>>;

/** The development instrument's own dump, read by tests/e2e/scan-shadow.spec.mjs. */
interface Window {
  __scanShadowDebug?: Array<{
    key: string;
    missedPuts: string[];
    said: string[];
    all: boolean;
    dirty: string[] | string;
    deleted: string[] | string;
  }>;
}
