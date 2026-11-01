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
- **Song source, revised:** no Hugging Face token is available, so ACE-Step 1.5 runs locally through acestep.cpp
  (C++/GGML, Q8 GGUF models, MIT) on the CPU, `ACE_THREADS=4` (a local patch: the binary otherwise halves the
  core count). One cover of the whole song takes roughly 15-25 minutes. Prefer `cover-nofsq` (keeps the
  source's structure and timing) at `audio_cover_strength` 0.3-0.5.
- **3D:** three.js (owner's choice) in every chorus, the bridge tunnel and the outro pull-back, quantised back to
  hard pixels. three lives in node_modules and is not counted by `tools/weigh.mjs`; the end card says the byte
  count is this film's own code and credits three.js.
- **Cast:** Clio stays the lead; no Clawd.
- **Delivery:** 4K60 master split into ≤30 MB parts sent to the owner with a join command; a 1080p60 share copy
  under 30 MB; both SRT files; then a pull request, driven to green.

## Song, round 3 (owner: both covers sounded unnatural, choppy, affected)

Covering a guide that contains a synthetic voice copies that voice's timbre and its word-by-word seams. So the
song is now generated from scratch by ACE-Step's LM + DiT (text2music: our lyrics, 120 BPM, G major, 154 s), which
plans its own natural phrasing. Its lines land where it wants them, so the PICTURE follows the song:
`tools/retime.py NEW.wav --measure-only` then `tools/warp.py` writes `data/warp.js` (song time -> picture time, one
anchor per lyric line, speed clamped to 0.8-1.25) and `src/main.js` draws `warpT(t)`. No chapter changes.

### Whole-bar fit before the warp: `tools/barfit.py`

A free generation also picks its own section lengths (seed 23: intro and verse lines packed a bar apart, post-chorus
la-las 4 bars too long), so offsets reach whole bars (-8 s) that the warp cannot bend. `tools/barfit.py` fixes
those in the AUDIO, on the song's own bar lines, then the warp takes the sub-bar rest:

    python3 -I tools/barfit.py build/ace/NEW.wav                # -> build/song.fitted.wav + build/retime-report.json
    python3 -I tools/warp.py                                    # -> data/warp.js for the residual
    python3 -I tools/barfit.py build/ace/NEW.wav --silent-pen   # (or --pen-only) add the silent pen at warped times
    cp build/song.fitted.wav build/song.wav

It measures each lyric line, finds the beat grid and downbeat, and plans whole-bar inserts and deletes between
lines. A demucs vocal stem makes sure no sung word is ever cut or repeated. Inserts open an instrumental bar in a
vocal gap (the accompaniment, i.e. mix minus vocal stem, duplicated on its bar line). Deletes remove la-la or
vocal-free bars cut on beats inside vocal gaps. Everything outside an edit is the input, bit for bit. It then
re-measures and reports per-section offsets before / predicted / after (`build/barfit-report.json`). Edits it
cannot place safely are skipped and listed. The phrasing differences the model adds inside a section are sub-bar
and stay with the warp. `--silent-pen` ducks the mix to silence at HITS.bandOut, adds one synthesised keystroke at
HITS.keystroke and slams back at HITS.slamBack, with picture times mapped to song times through data/warp.js.
Full usage and the algorithm are in the file header.

Tested on `build/ace/free-seed23.wav`. Retime section medians went from -7.6/-7.9/-7.9 s (verse1/pre1/chorus1),
-3.7/-3.9/-3.9 s (verse2/pre2/chorus2) and -0.7/-0.05/-0.05/-0.8 s (bridge/breakdown/chorus3/outro) to
-0.07/-0.10/-0.03, -0.02/-0.09/-0.11 and -0.83/-0.18/-0.20/-0.97 s. Those numbers come from 4 instrumental bars
opened between packed lines, 6 la-la bars deleted and a 1.85 s head pad. Boot/intro sit at -0.49/-0.37 s.
The bridge and outro are sung about a beat and a half early inside their bars: sub-bar, left to the warp. With
warp.py on the result, the sync error per section (median) is within ±0.13 s, except the breakdown at +0.37 s
(3 words). Over all words: median 0.14 s, p90 0.39 s. The silent pen gives digital silence from bandOut to
slamBack apart from the keystroke (peak -9 dBFS). The seed-23 warp is kept as `build/warp.seed23-fitted.js`;
`data/warp.js` was cleared because `build/song.wav` is still the old track.

## Next steps

1. `HF_TOKEN=… python3 -I music/ace_cover.py --seed 42` (text2music from `music/hit_prompt.json`, the SONG2.md song; `--bpm 112` for candidate B; try a few seeds and
   strengths; each run saves audio + LRC + settings under `build/ace/`).
2. `python3 -I tools/retime.py build/ace/<pick>.flac` → measures drift against `data/data.js` and writes
   `build/song.retimed.wav`; copy the chosen, aligned file to `build/song.wav`.
3. Let the owner pick by ear (send short excerpts). Then update the end card's claims if needed: the music is no
   longer "every note is code", so the card must not say "no samples" or count a model as source.
4. `node tools/weigh.mjs`, `node tools/srt.mjs`, `node render.mjs video --scale 6 --out build/claude-pop-4k.mp4`,
   split into ≤30 MB parts, plus a 1080p60 share copy; open the PR.

Preview: `node tools/serve.mjs`, then open http://127.0.0.1:8640/promo/claude-pop/index.html (opening index.html from disk
cannot read the icons or load three.js).

Setup on a fresh machine: `tools/setup.sh`, then `pip install kokoro-onnx pyworld gradio_client` and download the
Kokoro files into `.cache/kokoro/` (see `music/PRODUCTION.md`).

## Final song (owner's pick, 9 Oct)

"Pen Pal", sexy dance-pop take, ACE-Step 1.5 text2music (4B LM + turbo DiT, local CPU via acestep.cpp), seed 59
(`build/ace/pen-pal-sexy-59.wav`). Assembly, all reproducible:

    python3 -I music/assemble_final.py                 # 1.537 s boot-chord pre-roll (downbeats on picture bars) + 2 la-la bars cut
    python3 -I tools/retime.py build/song.assembled.wav --measure-only
    python3 -I tools/warp.py --beat                     # data/warp.js: beat-snapped offsets, 1x between lines
    python3 -I music/assemble_final.py --pen            # the silent pen at the warped times -> build/song.wav
    node tools/weigh.mjs && node tools/srt.mjs          # end-card bytes; subtitles in song time
    node render.mjs video --scale 6 --preset medium --crf 16 --out build/claude-pop-4k.mp4

render.mjs and tools/flashcheck.mjs run in song time and stop at SONG_END (the picture's END taken back
through the warp). Checks on this song: 9,390 frames, 0 errors; flash check pass (general 3/s peak, red 2/s).
