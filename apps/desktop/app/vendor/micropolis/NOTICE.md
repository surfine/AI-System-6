# Micropolis engine vendor notice

- Upstream: https://github.com/graememcc/micropolisJS
- Pinned commit: f13a1624d111d235e804bd80f48ba7c9f66a8e0f
- Build: `npm run build:micropolis-vendor` (esbuild IIFE, unminified, engine modules only)
- Entry: `tooling/vendor/micropolis-engine-entry.mjs`
- Excluded upstream modules (UI, strings, storage): game, splashScreen,
  splashCanvas, infoBar, inputStatus, notification, rci, queryTool, text,
  storage, monsterTV, every *Window.js, and the data-URI tile sets.
- HD adaptation (AI System 6): `tooling/vendor/micropolis-hd-patch.mjs`
  patches TileSet and GameCanvas at bundle time so integer-multiple HD
  atlases render on a scale-sized backing store; the logical 16px tile and
  all caller-facing coordinates are unchanged. The @2x atlases beside this
  file derive from the upstream 1x art via
  `npm run build:micropolis-hd` (deterministic; see that script's header).
- Bug fix (AI System 6): simulation.js phase-9 census called
  `take10Census(budget)` with an undeclared identifier, throwing on the
  first 10-census and killing the caller's animation loop; patched to
  `this.budget` at bundle time.
- License: GNU GPL v3 with additional terms — see LICENSE and COPYING here.
- The name/term "MICROPOLIS" is a registered trademark of Micropolis GmbH,
  licensed to the Micropolis project as a courtesy of the owner.
- AI System 6 shell code (`app/features/micropolis.js`) and all UI strings
  are original to AI System 6 and are not derived from upstream text.js.
