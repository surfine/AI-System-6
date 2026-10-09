# Handoff: where the Claude-Pop film stands

Read this first if you are picking the work up in a new session.

## Done

- **Picture: finished.** `index.html` + `src/` (toolkit, style kit, chapters ch01–ch12) draw all 9,420 frames
  (0–157 s) with no errors; `tools/flashcheck.mjs` passes the WCAG general-flash and red-flash tests over the
  whole film; the 11 chapter seams were audited frame by frame. `render.mjs` renders 1080p (`--scale 3`) or 4K
  (`--scale 6`), holds the end card 3 s past the song, and honours `FINISH_AT` (no vignette in silhouette mode).
- **Subtitles:** `node tools/srt.mjs` writes `build/pen-pal.zh-en.srt` and `build/pen-pal.zh.srt` from the same
  timeline (`data/lyrics-zh.json` holds the Chinese).
- **Song structure:** "Pen Pal" (SONG.md), score in `music/score.json`, timeline in `data/data.js`. **Every lyric
  word time and every EVENTS time in `data/data.js` is what the picture is synced to: do not change them.**

## The open decision, settled by the owner

The first track (Piper + PSOLA voice, foley drums, floppy-stepper bass; `music/build_song.py`) was judged
unpleasant. The owner wants the success of the "Claude Pop - I'm Upping My P(Doom)" video, whose strength is a
real-sounding song. Decisions:

- **Singer:** Kokoro `af_heart` (American female). `music/sing_world.py` sings it with WORLD resynthesis.
- **Song source:** an AI song model, **GPU-accelerated**: ACE-Step 1.5 (MIT) on its Hugging Face Space
  (`ACE-Step/Ace-Step-v1.5`, ZeroGPU A10G) in **cover** mode over our guide mix (`music/build_guide.py` →
  `build/guide.wav`), so structure and tempo survive. Anonymous quota is spent; it needs `HF_TOKEN`.
- **Cast:** Clio stays the lead; no Clawd.
- **Delivery:** 4K60 master split into ≤30 MB parts sent to the owner with a join command; a 1080p60 share copy
  under 30 MB; both SRT files; then a pull request, driven to green.

## Next steps

1. `HF_TOKEN=… python3 -I music/ace_cover.py --src build/guide.wav --strength 0.7 --seed 42` (try a few seeds and
   strengths; each run saves audio + LRC + settings under `build/ace/`).
2. `python3 -I tools/retime.py build/ace/<pick>.flac` → measures drift against `data/data.js` and writes
   `build/song.retimed.wav`; copy the chosen, aligned file to `build/song.wav`.
3. Let the owner pick by ear (send short excerpts). Then update the end card's claims if needed: the music is no
   longer "every note is code", so the card must not say "no samples" or count a model as source.
4. `node tools/weigh.mjs`, `node tools/srt.mjs`, `node render.mjs video --scale 6 --out build/claude-pop-4k.mp4`,
   split into ≤30 MB parts, plus a 1080p60 share copy; open the PR.

Setup on a fresh machine: `tools/setup.sh`, then `pip install kokoro-onnx pyworld gradio_client` and download the
Kokoro files into `.cache/kokoro/` (see `music/PRODUCTION.md`).
