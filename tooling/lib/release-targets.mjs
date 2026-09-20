// Which targets a release invocation actually publishes.
//
// The VPS host and the Pages site are one release, not two: they serve the same
// browser bundle, so shipping one without the other leaves whichever host a
// reader reached showing the older product. Asking for `--web` therefore
// carries `--pages` with it. `--web-only` is the explicit exception (a host that
// is down, a quota that is spent, a Pages project mid-migration) and it prints
// what it is leaving behind instead of doing it quietly.
//
// It lives here, as a pure function over argv, so a test can run the pairing
// instead of reading the source that contains it.

export const TARGET_FLAGS = Object.freeze(["--mac", "--github", "--web", "--pages"]);

const TARGETS = new Set(TARGET_FLAGS);
export const WEB_ONLY_FLAG = "--web-only";

/**
 * The target flags a release should run with, plus the argv the caller should
 * pass on — so a command that only named `--web` still prepares Pages.
 *
 * @param {string[]} argv arguments after `npm run release --`
 * @returns {{ targets: string[], argv: string[], paired: boolean }}
 */
export function resolveReleaseTargets(argv = []) {
  const args = [...argv].map((argument) => String(argument));
  const targets = args.filter((argument) => TARGETS.has(argument));
  const paired = targets.includes("--web")
    && !targets.includes("--pages")
    && !args.includes(WEB_ONLY_FLAG);
  if (paired) {
    targets.push("--pages");
    args.push("--pages");
  }
  return { targets, argv: args, paired };
}
