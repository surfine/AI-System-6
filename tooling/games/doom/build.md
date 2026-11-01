# Chocolate Doom WebAssembly playable slice

This is the reproducible phase-two build for the AI System 6 DOOM port. It
compiles the official Chocolate Doom 3.1.1 source into a single-threaded
WebAssembly engine, keeps it inside a same-origin iframe, and starts the game
only after the user selects a local IWAD and presses Play. With no IWAD
selected, `needs-data` is the expected ready state.

## Pinned inputs

| Input | Version or setting |
| --- | --- |
| Chocolate Doom | 3.1.1, commit `410d96855b5df5410ff591a90efeafa889119224` |
| Emscripten | 3.1.57 |
| SDL | Emscripten SDL2 port (`USE_SDL=2`) |
| Audio | Emscripten SDL2_mixer port (`USE_SDL_MIXER=2`, `SDL2_MIXER_FORMATS=[]`) |
| CMake / Ninja used for the checked build | 4.4.2 / 1.13.2 |

`SDL2_MIXER_FORMATS=[]` retains SDL2_mixer's core WAV path without linking its
optional OGG, MP3, MOD, or Timidity MIDI codecs. Chocolate Doom's built-in OPL
emulator supplies music through its default Sound Blaster music device. The
build deliberately disables FluidSynth, so it needs no SoundFont.

**The Emscripten pin stays at 3.1.57 on purpose.** An emsdk 6.0.6 build of
this target boots the shell, but the Play click hangs the browser main thread
forever inside `I_InitMusic` (OPL music init; the log stops after
`I_Init: Setting up machine state.`). `-nomusic` clears the hang and `-nosfx`
alone does not, so the SDL2_mixer device open is fine and the fault is the OPL
music path on the newer SDL2 port. Music is a product requirement, so do not
bump this pin until a build passes the full check below: import a local
Freedoom IWAD, press Play, and start a level from the game menu — a boot-only
check does not reach this hang.

## Reproduce the engine payload

Clone the exact upstream source into the ignored `external/` tree:

```sh
git clone --branch chocolate-doom-3.1.1 --depth 1 \
  https://github.com/chocolate-doom/chocolate-doom.git \
  external/chocolate-doom
git -C external/chocolate-doom rev-parse HEAD
```

The second command must print
`410d96855b5df5410ff591a90efeafa889119224`. Activate emsdk 3.1.57 so
`emcmake`, `emcc`, CMake, and Ninja are on `PATH`, then run:

```sh
tooling/games/doom/build-doom.sh
```

The script verifies the commit before building. It applies
`patches/emscripten-runtime.patch` when needed, accepts an already-applied copy
of that exact patch, and stops if the checkout contains unexpected changes. It
builds only the `chocolate-doom` target and overwrites these distributable
engine materials in `apps/desktop/assets/doom/`:

- `chocolate-doom.js` and `chocolate-doom.wasm`;
- `ENGINE-COPYING.txt`;
- `chocolate-doom-3.1.1-source.tar.gz`, the unmodified pinned source; and
- `chocolate-doom-3.1.1-ai-system6.patch`, the exact AI System 6 native patch.

The browser adapters are maintained directly as readable source beside those
outputs; the build script does not generate or minify them. Check the rebuilt
payload and release inventory with:

```sh
cmp tooling/games/doom/patches/emscripten-runtime.patch \
  apps/desktop/assets/doom/chocolate-doom-3.1.1-ai-system6.patch
node --check apps/desktop/assets/doom/chocolate-doom.js
npm run check:release-assets
npm run verify:docs
```

## Browser entry, loop, and native ABI

The Emscripten output is linked with `INVOKE_RUN=0`; the iframe also sets
`noInitialRun`. Loading or restoring the desktop can initialize the runtime and
IDBFS, but it cannot enter `main`. The iframe's Play click is the only path to
`Module.callMain`, after a selected IWAD has been validated.

Chocolate Doom's native loop is infinite. For the browser target only, the
patch replaces that loop with
`emscripten_set_main_loop(D_RunFrame, 0, 1)`. This yields control back to the
browser after `callMain` installs the frame callback. Native builds keep the
original loop.

The Doom target alone exports four custom adapter functions in addition to its
normal `_main` entry point:

| C function | Emscripten export | Purpose |
| --- | --- | --- |
| `AI_DoomWebInput` | `_AI_DoomWebInput` | Converts one normalized input frame into native Doom events |
| `AI_DoomWebReleaseAll` | `_AI_DoomWebReleaseAll` | Releases every held input and clears edge-triggered actions |
| `AI_DoomWebPause` | `_AI_DoomWebPause` | Releases input and pauses an installed browser main loop |
| `AI_DoomWebResume` | `_AI_DoomWebResume` | Resumes an already-installed browser main loop |

The normalized input record is `move`, `strafe`, `turn`, `fire`, `use`, `run`,
`map`, `menu`, and `weaponDelta`. The bridge posts Chocolate Doom events; the
shell does not fabricate DOM keyboard events. Blur, visibility loss,
`pointercancel`, resize, rotation, hide, and Quit release input before changing
lifecycle or geometry.

`move`, `strafe`, `turn`, `fire`, `use`, and `run` are held values;
`map`, `menu`, and `weaponDelta` are one-frame pulses and every nonzero frame is
consumed once. While Chocolate Doom's native menu is active, movement and turn
become D-pad navigation, Fire becomes forward/confirm, and Use becomes
back/abort. Fire and Use remain rising-edge actions in that menu so holding a
button cannot repeat a choice.

## Local data and persistence boundary

AI System 6 ships no WAD: not DOOM, DOOM II, TNT, Plutonia, Freedoom, or any
other game data. The user supplies a file through an explicit local file-picker
gesture. `wad-picker.js` validates the `IWAD` or `PWAD` header, lump directory
and ranges, enforces the 128 MiB product limit, computes SHA-256 in the browser,
and writes only a sanitized local copy. The playable path requires a selected
IWAD; PWAD activation and load ordering remain deferred.

The iframe owns `/doom/iwads`, `/doom/saves`, and `/doom/config` in IDBFS. WAD
catalog mutations and filesystem syncs are serialized; an import or removal is
not reported as durable until its sync completes. WAD bytes, catalog records,
configuration, and saves are not uploaded and do not enter AI System 6 project
storage, project backups, model context, or analytics.

## Audio boundary

SDL2_mixer is enabled for sound effects and its core WAV support. Music uses
Chocolate Doom's existing OPL emulation, selected by the upstream default
`snd_musicdevice=SNDDEVICE_SB`. There is no FluidSynth code path in the checked
build, no SoundFont asset, and no audio codec download. The explicit Play
gesture is also the Web Audio unlock boundary. Hide/background suspends audio
and pauses the game; foreground may resume an already-started game but never
auto-starts one.

## Source, license, and release boundary

Chocolate Doom's license text, the unmodified pinned source archive, and the
complete native patch ship beside the engine. The following readable browser
files are GPL engine-side adapters under their `GPL-2.0-only` notices:

- `shell.js`;
- `wad-picker.js`;
- `touch-controls.js`; and
- `touch-controls.css`.

The shell, local picker, touch controls, Emscripten runtime, filesystem, and
native input bridge remain inside the iframe. The AI System 6 desktop host uses
only the versioned `postMessage` protocol. This boundary documents the shipped
source and runtime architecture; it is not a legal conclusion about
derivative-work status.

The web and native package globs include the whole `assets/doom/` directory,
and the release-asset gate names every required runtime, adapter, license, and
corresponding-source file individually.

## Explicit exclusions

- no bundled or downloaded WAD, including no bundled Freedoom test fixture;
- no FluidSynth, SoundFont, optional SDL2_mixer codec library, or codec fetch;
- no pthreads, Wasm workers, shared memory, or SharedArrayBuffer requirement;
- no SDL2_net, multiplayer, telemetry, cloud save, or WAD upload; and
- no automatic `main` call during boot, reload, or session restore.
