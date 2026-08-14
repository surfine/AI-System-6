# OpenTTD wasm build (Chinese, touch-ready)

This directory holds the pipeline that turns OpenTTD 15.3 into the game
payload in `apps/desktop/assets/openttd/`. The upstream wasm build ships
English only, because it does not compile FreeType and cannot draw CJK text.
Our build adds FreeType, the Simplified Chinese language file, and a CJK
pixel font. The touch layer is not in the engine: the shell page
`apps/desktop/assets/openttd/index.html` owns it.

## Inputs

| What | Where | Version | License |
| --- | --- | --- | --- |
| OpenTTD source | `external/OpenTTD` (git-ignored) | 15.3 (`openttd-15.3-source.tar.xz` from cdn.openttd.org) | GPLv2 |
| Base graphics | `external/openttd-assets/unpacked/opengfx-8.0` | OpenGFX 8.0 | GPLv2 |
| CJK pixel font | `external/openttd-assets/unpacked/fusion-proportional` | Fusion Pixel 12px zh_hans, v2026.08.11 | OFL-1.1 |
| Toolchain | `~/emsdk` | emsdk 6.0.6 (upstream CI pins 3.1.57; 6.0.6 is verified in-browser) | — |
| Host tools | cmake ≥ 3.16, ninja | Homebrew | — |

Sound and music stay off: upstream starts the wasm build with the null sound
and music drivers (`pre.js` passes `-mnull -snull`), so OpenSFX/OpenMSX data
would only grow the download.

## Patches (apply to `external/OpenTTD` before you configure)

1. `patches/FindFreetype.cmake` → copy to `os/emscripten/cmake/`.
   Maps `find_package(Freetype)` to the emscripten FreeType port
   (`-sUSE_FREETYPE=1`). This is the whole FreeType change: the top-level
   CMakeLists already calls `find_package(Freetype)` on non-Apple Unix
   targets, which includes emscripten.
2. `patches/emscripten-zh.patch` → CMakeLists.txt, os/emscripten/pre.js,
   src/network/network.cpp, src/core/random_func.cpp, and
   src/fontcache/freetypefontcache.cpp:
   - preload `lang/simplified_chinese.lng` and the `/font` directory;
   - quote every path flag in the WASM link block (a source path with a
     space, like this repository's, breaks the raw flags);
   - seed a default `openttd.cfg` on first run from
     `Module.openttdDefaultConfig`, and rewrite the `resolution` line on
     every boot (the SDL port does not follow canvas size changes);
   - export `em_openttd_set_resolution(w, h)` so the shell page can resize
     the live game surface on phone rotation and window resizing;
   - use the bare `HEAPU8` view, not `Module.HEAPU8`, in the random-seed
     `EM_ASM` block. Emscripten stopped attaching the heap views to `Module`
     after 3.1.x, so on newer toolchains the upstream code throws
     `TypeError: ... (reading 'subarray')` on the first world generation
     (the title screen still boots — the seed request is the first caller);
   - map U+00A0 and U+2003 to the regular space glyph in the FreeType cache.
     Fusion Pixel omits these invisible spacing outlines, but OpenTTD otherwise
     treats them as missing-language-glyph errors and blocks first launch with
     a warning.
3. emsdk has no LibLZMA port (checked through 6.0.6). Copy
   `os/emscripten/ports/liblzma.py` to
   `~/emsdk/upstream/emscripten/tools/ports/contrib/liblzma.py`
   (the same step upstream's Dockerfile does). Savegames need LZMA.
   Repeat this copy after each emsdk install or upgrade: a new release
   replaces the `upstream/` tree and removes the copied port.

## Build

```sh
source ~/emsdk/emsdk_env.sh
tooling/games/openttd/build-openttd.sh
```

The script builds the native host tools first (`strgen` and friends), then
configures the wasm build, stages the font and OpenGFX into the build tree
(the `--preload-file` link step packs them into `openttd.data`), builds, and
copies `openttd.js` / `openttd.wasm` / `openttd.data` into
`apps/desktop/assets/openttd/`. Those three artifacts are committed to git;
the public GitHub snapshot excludes them (see
`tooling/public-snapshot-manifest.mjs`).

## First-run configuration (written by the shell page)

`[misc]`: `language = simplified_chinese.lng`, `gui_scale = 200` on phones
(100 on desktop), the four `*_font` keys point at
`/font/fusion-pixel-12px-proportional-zh_hans.ttf`, `global_aa = false`
(crisp 1-bit glyphs), `resolution` = the iframe size.
`[gui]`: `osk_activation = single` (tap a text field, get the in-game
keyboard), `hover_delay_ms = 0` (tooltips move to the right button, which the
touch layer maps to a long press).

The config seeds once. After that the player owns the in-game settings.
