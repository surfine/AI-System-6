#!/bin/sh
# Build OpenTTD 15.3 for the web (wasm) with Simplified Chinese support.
#
# Inputs (prepare these before you run the script):
#   external/OpenTTD               OpenTTD 15.3 source with our patches applied
#                                  (see patches/ and build.md)
#   external/openttd-assets/unpacked
#     opengfx-8.0/                 free base graphics (GPLv2)
#     opensfx-1.0.3/               free base sounds (optional)
#     fusion-proportional/fusion-pixel-12px-proportional-zh_hans.ttf
#                                  CJK pixel font (OFL-1.1)
# Output:
#   apps/desktop/assets/openttd/   openttd.js / openttd.wasm / openttd.data
#
# Toolchain: cmake, ninja, emscripten (emcc). See build.md for versions.
set -e

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
SRC="$ROOT/external/OpenTTD"
ASSETS="$ROOT/external/openttd-assets/unpacked"
OUT="$ROOT/apps/desktop/assets/openttd"

test -f "$SRC/CMakeLists.txt" || { echo "OpenTTD source not found at $SRC"; exit 1; }
test -f "$SRC/os/emscripten/cmake/FindFreetype.cmake" || { echo "FreeType patch not applied"; exit 1; }
test -f "$ASSETS/fusion-proportional/fusion-pixel-12px-proportional-zh_hans.ttf" || { echo "CJK font not staged"; exit 1; }
command -v emcc >/dev/null || { echo "emcc not on PATH"; exit 1; }

# Step 1: build the host tools (strgen, settingsgen, ...) with the native
# compiler. The wasm build uses these to generate language and setting data.
if [ ! -f "$SRC/build-host/CMakeCache.txt" ]; then
    cmake -S "$SRC" -B "$SRC/build-host" -GNinja -DOPTION_TOOLS_ONLY=ON
fi
cmake --build "$SRC/build-host" --target tools

# Step 2: configure the wasm build.
if [ ! -f "$SRC/build-wasm/CMakeCache.txt" ]; then
    emcmake cmake -S "$SRC" -B "$SRC/build-wasm" -GNinja \
        -DHOST_BINARY_DIR="$SRC/build-host" \
        -DCMAKE_BUILD_TYPE=Release \
        -DOPTION_USE_ASSERTS=OFF
fi

# Step 3: stage the CJK font and the free basesets into the build tree.
# The link step packs the /font and /baseset directories into openttd.data
# with --preload-file, so these files must be in place before the build.
mkdir -p "$SRC/build-wasm/font" "$SRC/build-wasm/baseset"
cp "$ASSETS/fusion-proportional/fusion-pixel-12px-proportional-zh_hans.ttf" "$SRC/build-wasm/font/"
cp "$ASSETS"/opengfx-8.0/*.grf "$ASSETS"/opengfx-8.0/*.obg "$SRC/build-wasm/baseset/"
# Note: OpenSFX / OpenMSX are not staged. The upstream wasm build starts the
# game with null sound and music drivers (see pre.js: -mnull -snull), so
# sound data would only grow openttd.data. Revisit if we enable audio.

# Step 4: build the game. Produces openttd.html/.js/.wasm/.data.
cmake --build "$SRC/build-wasm"

# Step 5: copy the artifacts into the repository.
mkdir -p "$OUT"
cp "$SRC/build-wasm/openttd.js" "$SRC/build-wasm/openttd.wasm" "$SRC/build-wasm/openttd.data" "$OUT/"
ls -la "$OUT"
echo "Done. Do not forget: the shell page $OUT/index.html is a repo file, not a build output."
