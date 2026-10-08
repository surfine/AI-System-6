# Pen Pal: production notes

How `build/song.wav` is made from `music/score.json`, what every sound is, and how to rebuild it.
Everything is code: Piper TTS + Praat PSOLA for the voices, numpy/scipy synthesis for the desk kit and
the floppy drives, FluidSynth (FluidR3 GM) for the piano, organ, brass, strings and sax. No samples.

## Rebuild

```bash
python3 -I music/song.py && python3 -I music/validate_score.py && python3 -I music/export_timing.py   # the score (never hand-edit score.json)
python3 -I music/build_song.py              # render + measure (about 10 min; 2 min of it is Whisper)
python3 -I music/build_song.py --no-qa      # render only
```

Outputs: `build/song.wav` (48 kHz, 24-bit, stereo), `build/stems/{lead,chant,choir,spoken,drums,bass,keys,other}.wav`
and `build/song-qa.json` (every measurement below).

**Deterministic.** Piper runs with `noise_scale = noise_w_scale = 0` (its random sampler cannot be seeded, so
it is switched off); every other random choice (humanising, grains, noise, gang spread) comes from a seeded
generator (`dsp.rng`, an FNV hash of a name, never Python's salted `hash()`); FluidSynth renders offline.
**Cached** in `.cache/` (git-ignored): `tts/` raw Piper per word, `sing/` the finished PSOLA word keyed by
every input (text, notes, context, style, `voice.ENGINE_VERSION`), `fluid/` each GM part keyed by its notes,
`phonemes.json`. Delete `.cache/sing` (or bump `ENGINE_VERSION`) after changing the singing engine; the
first full render of the 1,303 sung words takes about 80 s on 4 cores, a cached one about 20 s.

## Files

| file | what |
|---|---|
| `build_song.py` | entry point: score -> voices -> band -> mix -> master -> files -> measurements |
| `voice.py` | the singer: Piper per word, analysis, time warp, pitch contour, PSOLA, cache, process pool |
| `vocals.py` | the vocal arrangement: lead + doubles, chant + octave double, choir stacks, the 12-copy gang, spoken lines, the pen-pal chops, the gags, breaths |
| `kit.py` | the desk kit (every drum is a UI foley sound, synthesised) |
| `synth.py` | MIDI writer + cached FluidSynth renderer (latency-compensated), floppy drives, 808, organ pulse, saw pads, boot chord, Writing Bell (FM), beeps |
| `band.py` | the band arrangement from `parts` (drum rows come from `export_timing.drum_hits`, the same expansion that writes `EVENTS`) |
| `mix.py` | channel strips, sends, sidechain, section-energy solver, FADE duck, silence window, tonal match, master |
| `dsp.py` | filters, oscillators, dynamics, true-peak oversampling, limiter, synthetic plate/room IRs, delay, LUFS |
| `qa.py` | measurements (levels, spectrum, timing, pitch, Whisper) |

## 1. The voice engine (`voice.py`)

Per sung word:

1. **Piper** says the word from IPA (`phonemes_for`, with sung overrides: "the" is sung *thee*, la is *lah*,
   in-SERT / ex-PORT stress, a primary stress forced onto every sung word). Long notes ask Piper to speak
   slower (`length_scale` 1.0 / 1.35 / 1.8 / 2.3 for notes < 0.4 / 0.7 / 1.1 / longer s) so the vowel has
   more of itself to sustain. Words starting with a plosive are said after a carrier "the" and cut at the
   closure: from silence Piper's /p/ is breathy (heard as "h": *pen* came out *hand*), after a vowel it
   gets a real closure and burst.
2. **Trim**, peak-normalise; optional **formant shift** (resample by 1/k, PSOLA then restores pitch and time).
3. **Analyse** (5 ms frames): Praat autocorrelation pitch for voicing, a 150-4000 Hz intensity contour.
   One **vowel core per syllable**: the loudest voiced peaks separated by a >= 1.5 dB dip, each grown to
   -7 dB; multi-note words (`syl`) are split at those dips, i.e. by voiced segments, not evenly.
4. **Time warp** (Praat DurationTier, piecewise constant): onset consonants are placed *before* the note
   (capped by a per-phoneme budget: p 35 ms, s 85 ms, ...) so the vowel lands on the beat; consonants
   between syllables sit just before the next note; the vowel is sustained around one 30 ms **hold
   window** (early in a diphthong so it glides late like a singer, late in /ɛ/ before a nasal, mid
   otherwise) while the rest of the core, with its formant transitions, runs at natural speed; a final
   n / m / l (also before d, t, z: *land*, *hold*) takes 40 % of the note; an obstruent coda before an
   obstruent onset finishes before the next word starts (no "page-stay" smear).
5. **Pitch** (PitchTier, designed in output time then mapped back through the warp): glide-in from the
   previous note (70 ms smoothstep), portamento inside slurred words (60 ms), a 40-cent scoop on notes
   >= 0.45 s, vibrato 5.4 Hz +/-24 cents arriving after 0.3 s with a 0.25 s ramp, two-sine drift +/-5 cents,
   a 35-cent fall on phrase ends.
6. **Overlap-add resynthesis**, 22.05 -> 48 kHz (`resample_poly`), consonant emphasis (+4 dB on the onset,
   inter-syllable and obstruent-coda consonants, +6 dB on "the"), soft (non-glottal) vowel onsets in legato
   (a glottal stop after a vowel is heard as a *b*), 4 / 12 ms edge fades. Words overlap-add on the timeline,
   so the crossfades between words are the words' own consonant overlaps.

Measured: 219 lead and la-la notes, median pitch error 1.9 cents, 95th percentile 4.7 cents, 100 % within 25 cents.

### Roles (`vocals.py`)

| track | made of | treatment |
|---|---|---|
| lead | amy, LEAD style above; breaths (band-passed noise with two soft resonances, -41 dB, before every lead phrase; the robot chant never breathes) | chain below; plate + 1/8-dotted delay sends, automated |
| lead doubles (choruses) | two more amy takes, length scale x1.12 / x0.92, +8 / -7 cents, +8 / -6 ms, vibrato 12 cents, panned -/+0.55 | low-passed 8.5 kHz, 6:1, 8.5 dB under the lead |
| chant | amy flattened to the written note (G3 her speaking pitch), no vibrato/scoop/drift, consonants at natural speed, all the stretch in the vowel, formant x0.96; 8-bit 11 kHz crush (60 % wet) in the 1988 sections; pre-chorus line 2 learns an 80 ms linear portamento | dry, 6:1, presence +2.5 dB at 2.8 kHz |
| chant double | lessac an octave down, formant x0.88, -9 dB (calibrated 7.7 dB under the chant); the bridge years add jenny at pitch, panned +/-0.45 | darker |
| choir (harmony, la-la) | amy (-0.5 pan, +7 cents, +10 ms) + jenny (+0.5, -8 cents, -9 ms) + lessac an octave down (formant x0.86); the final chorus and the outro double every voice (6 takes) | 3:1, width 1.25, plate -9 dB |
| gang (echo, gang, call) | 12 copies = 3 voices x 4 Piper speeds (0.95/1.08/1.2/0.88), each with its own detune (+/-15 cents), formant (0.84-1.08), timing (+/-18 ms), high-shelf tilt (+/-3 dB) and pan (spread -0.95..0.95); shouted: a 130-cent scoop into each word, durations x0.8, no vibrato | saturation, 6:1, +3 dB presence, width 1.35; "(pen pal)" and "You do!" set 3 LU over the lead; "(Keep it.)" / "Flag it." 7 dB lower |
| spoken | lessac raw Piper per sentence, speed fitted to the slot, first vowel on its word | k1: 4 kHz low-pass + 8-bit 11 kHz (a 1988 sample); o3 dry |
| chops | the boot take's own Piper "pen" / "pal" (length scale 1.35), repitched by PSOLA to D5 / B4, starting exactly on the event, hard-gated to the written length (8 ms release) | 8-bit in the intro, clean in the post-choruses; -4 dB under the lead |

Gags: **FADE** (chorus "fade.") holds the word for a third of the beat, then the pitch glides B4 -> G4 while the
bit depth falls 16 -> 4 and the level sinks 12 dB, the band ducks 6 dB and dithers (7-bit TPDF) for 1.5 beats,
then half a beat of nothing. **smooth** (pre-chorus 2): a low-pass sweeps 8 kHz -> 1.5 kHz across the word.
**Keep it.**: +/-10 cents, onsets 20 / 8 ms late. **The silent pen**: see the silence window below. **voice.**:
the word is sung to 150.75 s, then its last two periods loop to 151.0 s, then the *s*.

## 2. The desk kit (`kit.py`)

| voice | foley | synthesis |
|---|---|---|
| kick | floppy eject | sine body sweeping 150 -> 55 Hz (big-beat) or 128 -> 50 Hz with a shorter tail (house choruses/post-choruses), a 260 Hz/4 ms attack chirp, the eject clunk pitched down (310 Hz + 1.08 kHz damped resonances), a 4 ms plastic click (2.5-9 kHz burst + 3.3 kHz ring), tanh drive |
| snare | window close | noise through a band-pass falling 6.5 -> 1.3 kHz in 20 ms (the zoom outline collapsing), a 180 Hz "whap" with a 12 ms pitch drop + 332 Hz partial, a 3 ms crack, a 120 ms band-passed tail, saturation (spectral centroid 1.2 kHz) |
| ghost snare | window shade | the snare -18 dB, darker, shorter |
| clap | mouse clicks, stacked | each click = a 0.6 ms burst exciting 2.1 / 4.3 / 1.25 kHz shell resonances; 3 copies 4-16 ms apart (12 copies spread 26 ms and panned in the final chorus, on "Flag it." and on every gang "You"), a band-passed tail, a 0.3 s room |
| hat | keystroke | key-down click (3.6 + 5.2 kHz rings) 2 ms before the beat, then 5-16 kHz noise (16 ms) and a 6.4 kHz tick; accents by 16th position, +/-1.5 dB and +/-1.2 ms humanising |
| open hat | space bar | a bigger 880 Hz / 1.9 kHz thock and a 70 ms tail |
| crash | Trash crumple | decorrelated stereo noise wash (1.6 kHz HP, 4.8 kHz bump, 0.55 s + 0.12 s decays) + hundreds of paper grains (0.3-3 ms band-passed bursts, density 1400/s thinning as the paper settles); choked to 200 ms on the HAND hits |
| reverse cymbal | the Trash backwards | a crash reversed with a power fade-in, ending exactly on its downbeat |
| riser | progress bar | white noise through a band-pass rising 350 Hz -> 9.5 kHz, plus a square tone climbing one semitone per 16th (the bar's blocks, a tick on each), level rising 34 dB, hard stop on the end beat |
| spin-up | floppy-drive motor | a sine sweep 28 -> 520 Hz with harmonics + comb-filtered grit (delay = one rotation) |
| cowbell | system beep | two square partials 560 / 845 Hz, band-passed |
| tambourine | scroll-bar rattle | three metallic micro-bursts in 12 ms |
| snap | checkbox tick | 2.15 kHz click + band-passed burst + a small room |
| floor tom | disk dropped | 135 -> 90 Hz sine drop + thud |
| keystroke | the writer's key | key-down click, a 280 Hz / 1.15 kHz bottom-out thock, a faint spring ping (the Return key: 190 / 820 Hz, longer) |
| click | Save | press + release 70 ms later |
| floppy clunk | disk going in | 110 Hz thunk + 450 Hz shell + rattle, 8-bit |
| vinyl | One More Tune's record | sparse crackle over band-passed hiss (post-chorus 1, bars 1-2) |

## 3. Bass (`synth.floppy_voice`, `synth.sub808`)

Each drive is a **stepper motor**: an impulse train at the note frequency (fractional placement) convolved with
a 12 ms mechanical step response (180 Hz thud + 820 Hz plastic + 2.3 / 4.6 kHz metal rings), a 50 % pulse for
pitch, a 10-step **seek chirp** 28 ms before each note, and the head's direction flip every 80 steps (a level
dip). Drive A (roots) is panned -0.9, drive B (octave / fifth) +0.9, both high-passed (130 / 160 Hz) so the
low end stays mono. Under them a **clean sine sub** at drive A's fundamental (drive B's at -10 dB). The
**808** (choruses + the bridge drop): a sine with a 120 % pitch kick decaying in 18 ms, tanh drive 1.6,
ducked 12 dB for 90 ms by every kick. The breakdown's drives are rendered soft (mostly sub). Everything
below 140 Hz is summed to mono on the bass bus.

## 4. Keys and the rest (`band.py`)

- **Floppy Organ** (the riff, flourishes, verse 2's octave-down organ): GM 17 percussive organ + a numpy 25 %
  pulse with a 6 ms downward pitch blip and an 8 ms 2-3 kHz stepper click per attack. Crushed by era along the
  `eras` timeline: 8-bit 11 kHz in 1988 -> 10-bit 22 kHz (1999) -> 12-bit 32 kHz (2002) -> clean from 2011.
  The bridge comp: GM 16 drawbar stabs on the kick rhythm.
- **Piano** GM 1 offbeat 8ths in the choruses (voicings lifted an octave, so Cmaj9 has D5 on top under PEN),
  GM 0 felt piano (2.6 kHz low-pass) in the breakdown, GM 1 under the outro's last line.
- **Strings** GM 48 under the pre-choruses, CC11 swelling across 13.5 beats, stopping on HAND.
- **Pads**: 5-voice detuned supersaw (choruses, 2.6 kHz), the bridge's swept pad (300 Hz -> 7 kHz over 8
  beats), the E7sus4 pad under the spin-up that stops dead into the reboot.
- **Boot chord** (and the reboot Dmaj9 and the Amaj9 end chord): a 7-voice saw pad whose low-pass opens
  400 Hz -> 9 kHz over 4 beats, an FM bell on the lower four notes, a sine under the root; the top note is pad
  only, never a "ding".
- **Brass stabs**: GM 61 brass section + a 3-voice saw layer with a 60 ms filter blip (deduplicated).
- **Sax**: GM 66 tenor. **Writing Bell**: two-operator FM (ratio 3.5, index 3.2 decaying in 180 ms) + a 2.76x
  partial and a tick. **Beeps**: square waves, 1/4 beat. **Blips**: 30 ms 1568 Hz pings on the typed verbs.
- FluidSynth: `-R 0 -C 0 -r 48000 -O float`, each part rendered once and cached; its per-program attack latency
  is measured from a calibration note and removed, so GM notes start within 3 ms of their beat.

## 5. Mix (`mix.py`)

Channel strips (each track normalised to -18 dB active RMS first):

- **Lead**: HP 95 Hz (24 dB/oct) -> split-band de-esser (6.5 kHz, 5:1, max 9 dB) -> EQ (+1 dB 170 Hz,
  -3.5 dB 320 Hz mud, -1 dB 1 kHz, +3.5 dB 3.6 kHz presence, +2.5 dB shelf 9.5 kHz) -> compressor 4:1 (4 ms /
  80 ms) -> leveller 2:1 (20 ms / 250 ms) -> exciter (saturated 3.5 kHz+ band, new harmonics above 7.5 kHz: air
  the 22 kHz TTS does not have) -> gentle tanh.
- **Sends**: a synthetic **plate** (2.4 s, 28 ms pre-delay, frequency-dependent decay, decorrelated L/R),
  **ducked 4:1 under the dry lead**; a **1/8-dotted ping-pong delay** (375 ms, feedback 0.33, each repeat
  darker), **ducked 6:1 under the dry lead** so echoes bloom only in the gaps, with +8 dB **throws** on every
  phrase end. Automation by section: bare and wet in the boot (-8 dB plate), dry chant sections, -15 dB plate in
  the choruses, wetter breakdown and outro.
- **Sidechain**: a kick-triggered pump (2 ms pre-ramp, 6 ms hold, squared 170 ms release) at depths per section:
  bass 6 dB in the choruses / 5 post / 3 elsewhere, pads 9, piano 3.5, strings 4, organ 2-3, choir 2-2.5,
  chops 3; the 808 its own 12 dB / 90 ms duck.
- **Drums bus**: kick / snare / hats / claps / crash / perc mixed at fixed relative gains, 2.5:1 glue
  compressor, 22 % parallel saturation; snare and claps to the plate (dark, -16 dB in the choruses) and a
  0.5 s room.
- **Calibration**: every bus is set to a loudness target (pyloudnorm) over the windows where it matters
  (lead -17 LUFS over the choruses, chant -18.3 over the verses, choir -18.5 over the post-choruses, gang 3 LU
  over the lead on the "You do!" bars, drums -16 and bass -19 over the choruses, organ -19.5 over the intro and
  verse 2, ...); the measured values and gains are in `song-qa.json` -> `mix.calibration`.
- **Section energy**: the band (drums, bass, keys, other) is gained per section so that the *whole mix*
  measures its target loudness relative to chorus 1 (intro -2, verses -3.2, pre-choruses -2 with a 3 dB
  build inside, post-choruses -0.7, bridge -2, final chorus +0.6, outro -1.5 LU), the voices untouched. The
  solved gains are in `song-qa.json` -> `mix.section_energy_db`.
- **FADE**: drums/bass/keys/other drop 6 dB and are 60 % re-quantised to 7 bits with TPDF dither for 1.5 beats.
- **The silence window** (`parts.silence`, 131.25-132.0 s): every stem is faded over 4 ms into exact zeros at
  131.25 s; the lead's "the" (rendered on its own track, its own chain, no sends) and the writer's keystroke
  (131.625 s) are added back; after mastering the window is re-masked so that outside those two sounds it is
  bit-exact digital silence (measured).

## 6. Master

Sum of the eight stems -> HP 25 Hz -> **tonal match** (octave-band balance of the mix measured against a modern
pop curve, 31.5 Hz..16 kHz = -13.5 / -6 / -6.5 / -8.5 / -10.5 / -12.5 / -14 / -15.5 / -17.5 / -24.5 dB re total;
60 % of the difference as peaking bands, clamped +/-3 dB, then a 40 % second pass) -> small tone EQ -> RMS bus
compressor 1.5:1 (30 / 200 ms) -> 2x-oversampled soft clip (transparent below -2.1 dBFS) -> lookahead
(4 ms) **true-peak limiter** at -1.2 dBTP (4x interpolated peak detection, min-filter + moving-average gain
that cannot overshoot) -> input gain iterated (secant) to **-9.0 LUFS integrated** -> silence window re-masked
-> the end chord fades to exact zero over the last 0.35 s -> 24-bit PCM.

**Stems** are the pre-master buses at the master's input gain with one common trim so none clips; summed and
passed through the master chain they give the song.

## 7. Measurements (latest build, `build/song-qa.json`)

MEASUREMENTS_PLACEHOLDER

## 8. Known limits

- Whisper is a strict judge of PSOLA-sung speech at D5-E5: lines it does not transcribe word for word are listed
  in the table above. The gags are meant to damage words (FADE, the frozen "voice"), and the shouted gang and
  la-la are judged by contour, not text (SONG.md section 5).
- Piper voices are sampled at 22.05 kHz; the air above 11 kHz on the voices is synthesised by the exciter.
- Piper's own random sampler is off (zero noise) for determinism; the variety between doubled and stacked takes
  comes from different voices, Piper speeds, formant shifts, detunes and timing.
