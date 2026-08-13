#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
repository_root="$(cd "$script_dir/../../.." && pwd)"
source_dir="${DOOM_SOURCE_DIR:-$repository_root/external/chocolate-doom}"
output_dir="$repository_root/apps/desktop/assets/doom"
patch_file="$script_dir/patches/emscripten-runtime.patch"
expected_commit="410d96855b5df5410ff591a90efeafa889119224"
temporary_build=""
build_dir="${DOOM_BUILD_DIR:-}"

if [[ ! -d "$source_dir/.git" ]]; then
  echo "Missing Chocolate Doom source at $source_dir" >&2
  echo "Clone tag chocolate-doom-3.1.1 there first." >&2
  exit 1
fi

actual_commit="$(git -C "$source_dir" rev-parse HEAD)"
if [[ "$actual_commit" != "$expected_commit" ]]; then
  echo "Expected Chocolate Doom $expected_commit, found $actual_commit" >&2
  exit 1
fi

for command_name in emcmake cmake ninja git; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: $command_name" >&2
    exit 1
  fi
done

if git -C "$source_dir" apply --reverse --check "$patch_file" >/dev/null 2>&1; then
  : # Patch is already applied in this ignored source checkout.
elif git -C "$source_dir" apply --check "$patch_file" >/dev/null 2>&1; then
  git -C "$source_dir" apply "$patch_file"
else
  echo "Chocolate Doom source has unexpected changes; patch does not apply cleanly." >&2
  exit 1
fi

if [[ -z "$build_dir" ]]; then
  build_dir="$(mktemp -d "${TMPDIR:-/tmp}/ai-system6-doom.XXXXXX")"
  temporary_build="$build_dir"
fi

cleanup() {
  if [[ -n "$temporary_build" && -d "$temporary_build" ]]; then
    rm -rf "$temporary_build"
  fi
}
trap cleanup EXIT

emcmake cmake \
  -S "$source_dir" \
  -B "$build_dir" \
  -G Ninja \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_DISABLE_FIND_PACKAGE_FluidSynth=TRUE \
  -DCMAKE_DISABLE_FIND_PACKAGE_PNG=TRUE \
  -DCMAKE_DISABLE_FIND_PACKAGE_SampleRate=TRUE \
  -DENABLE_SDL2_NET=OFF \
  -DENABLE_SDL2_MIXER=ON

cmake --build "$build_dir" --target chocolate-doom --parallel

install -m 0644 "$build_dir/src/chocolate-doom.js" "$output_dir/chocolate-doom.js"
install -m 0644 "$build_dir/src/chocolate-doom.wasm" "$output_dir/chocolate-doom.wasm"
install -m 0644 "$source_dir/COPYING.md" "$output_dir/ENGINE-COPYING.txt"
install -m 0644 "$patch_file" "$output_dir/chocolate-doom-3.1.1-ai-system6.patch"
git -C "$source_dir" archive \
  --format=tar.gz \
  --prefix=chocolate-doom-3.1.1/ \
  --output="$output_dir/chocolate-doom-3.1.1-source.tar.gz" \
  "$expected_commit"

echo "Built Chocolate Doom browser engine in $output_dir"
