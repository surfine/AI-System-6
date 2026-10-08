# uBlock Origin Lite in Time Machine

Time Machine blocks ads and trackers with uBlock Origin Lite (uBOL), by
Raymond Hill and contributors, licensed under GPL-3.0 (`LICENSE` here is the
copy shipped inside the extension). Nothing of it is modified.

- Source: https://github.com/uBlockOrigin/uBOL-home, release pinned in
  `PIN.json` with the SHA-256 of each asset. `npm run browse:fetch-filters`
  downloads and verifies them into `.cache/ubol/<version>/` (ignored by git).
- The Mac app bundles the Safari build unchanged (`Contents/Resources/ubol-safari`)
  and loads it as a web extension for its native Time Machine pages.
- The web engine uses the Chromium build's rulesets as data:
  `npm run browse:build-filters` compiles the network rules and the
  site-specific hiding rules of ublock-filters, easylist, easyprivacy, pgl,
  ublock-badware, urlhaus-full and chn-0 into `apps/browse/filters/`
  (ignored by git). Those files are derived from GPL-3.0 lists and are served
  only to Time Machine's browse origin.
- The matcher (`apps/browse/filter-match.js`) and the compiler
  (`tooling/browse/build-filters.mjs`) are this project's own code.
