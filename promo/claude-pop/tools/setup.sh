#!/usr/bin/env bash
# Installs what the song and the video need: Python audio libraries, FluidSynth with a GM
# soundfont, the Piper voices, and the headless browser driver.
set -euo pipefail
cd "$(dirname "$0")/.."
pip install piper-tts praat-parselmouth numpy scipy soundfile pyloudnorm faster-whisper
command -v fluidsynth >/dev/null || sudo apt-get install -y --no-install-recommends fluidsynth fluid-soundfont-gm
mkdir -p .cache/voices
for v in en/en_US/lessac/medium/en_US-lessac-medium en/en_US/amy/medium/en_US-amy-medium en/en_GB/jenny_dioco/medium/en_GB-jenny_dioco-medium; do
  b=$(basename "$v")
  [ -f ".cache/voices/$b.onnx" ] || curl -sSL -o ".cache/voices/$b.onnx" "https://huggingface.co/rhasspy/piper-voices/resolve/main/$v.onnx"
  [ -f ".cache/voices/$b.onnx.json" ] || curl -sSL -o ".cache/voices/$b.onnx.json" "https://huggingface.co/rhasspy/piper-voices/resolve/main/$v.onnx.json"
done
npm install
