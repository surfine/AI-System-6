# Micropolis engine vendor notice

- Upstream: https://github.com/graememcc/micropolisJS
- Pinned commit: f13a1624d111d235e804bd80f48ba7c9f66a8e0f
- Build: `npm run build:micropolis-vendor` (esbuild IIFE, unminified, engine modules only)
- Entry: `tooling/vendor/micropolis-engine-entry.mjs`
- Excluded upstream modules (UI, strings, storage): game, splashScreen,
  splashCanvas, infoBar, inputStatus, notification, rci, queryTool, text,
  storage, monsterTV, every *Window.js, and the data-URI tile sets.
- License: GNU GPL v3 with additional terms — see LICENSE and COPYING here.
- The name/term "MICROPOLIS" is a registered trademark of Micropolis GmbH,
  licensed to the Micropolis project as a courtesy of the owner.
- AI System 6 shell code (`app/features/micropolis.js`) and all UI strings
  are original to AI System 6 and are not derived from upstream text.js.
