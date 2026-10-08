# Pen Pal: production notes

How `build/song.wav` is made from `music/score.json`, what every sound is, and how to rebuild it.
Everything is code: Piper TTS + Praat PSOLA for the voices, numpy/scipy synthesis for the desk kit and
the floppy drives, FluidSynth (FluidR3 GM) for the piano, organ, brass, strings and sax. No samples.

## Rebuild

```bash
python3 -I music/song.py && python3 -I music/validate_score.py && python3 -I music/export_timing.py   # the score (never hand-edit score.json)
python3 -I music/build_song.py              # render + measure (about 10 min; 2 min of it is Whisper)
python3 -I music/build_song.py --no-qa      # render only
python3 -I music/build_song.py --prune-cache   # also delete cached words/parts this build no longer uses
```

Outputs: `build/song.wav` (48 kHz, 24-bit, stereo), `build/stems/{lead,chant,choir,spoken,drums,bass,keys,other}.wav`
and `build/song-qa.json` (every measurement below).

**Deterministic.** Piper runs with `noise_scale = noise_w_scale = 0` (its random sampler cannot be seeded, so
it is switched off); every other random choice (humanising, grains, noise, gang spread) comes from a seeded
generator (`dsp.rng`, an FNV hash of a name, never Python's salted `hash()`); Praat's overlap-add (which
places unvoiced pseudo-periods at random) is seeded per word; FluidSynth renders offline. Two consecutive
builds produce bit-identical `song.wav` and stems (checked by md5).
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
7. **Diction** (`sing-v21`, after QA round 1 found *pen* heard as "hand" / "N", *page* as "H", *check* as
   "share"):
   - **Raw onsets.** An unvoiced onset (the burst and aspiration of p / t / k / ch, an f, s, sh, th or h) is
     not taken from PSOLA, whose random unvoiced pseudo-periods smear a burst into breath; it is spliced from
     the Piper source at natural speed, placed so that the voicing starts exactly where the warp put it (the
     consonant sits before the note, like a singer's). A stop keeps its first 30 ms (the burst) and at most
     70 ms in all (the middle of a long aspiration is dropped); a fricative keeps its last 120 ms. Stops and
     *h* get +5 dB more on that span (`burst_boost`).
   - **Closures.** A stop is heard only after a silence: when the next word starts with p / t / k / b / d / g /
     ch / j, the word before it fades out (30 ms release) so it is silent 105 ms (voiceless) or 70 ms (voiced)
     before the next note, i.e. 35 ms before the burst ("the | pen", "can | check", "You | do"); never before
     45 % of its own last note.
   - Function words sit 1.5 dB under content words (was 2.5), and "your", "who", "where", "I" are no longer
     treated as function words: they carry the argument.

Measured with Praat on every rendered word: lead median 2.1 cents, la-la 1.4, chops 0.6; every note within 25 cents.

### Roles (`vocals.py`)

| track | made of | treatment |
|---|---|---|
| lead | amy, LEAD style above; breaths (band-passed noise with two soft resonances, -41 dB, before every lead phrase; the robot chant never breathes) | chain below; plate + 1/8-dotted delay sends, automated |
| lead doubles (choruses) | two more amy takes, length scale x1.12 / x0.92, +8 / -7 cents, +8 / -6 ms, vibrato 12 cents, panned -/+0.55 | low-passed 8.5 kHz, 6:1, 8.5 dB under the lead |
| chant | amy flattened to the written note (G3 her speaking pitch), no vibrato/scoop/drift, consonants at natural speed, all the stretch in the vowel, formant x0.96; 8-bit 11 kHz crush (60 % wet) in the 1988 sections; pre-chorus line 2 learns an 80 ms linear portamento | dry, 6:1, presence +2.5 dB at 2.8 kHz |
| chant double | lessac an octave down, formant x0.88, -9 dB (calibrated 7.7 dB under the chant); the bridge years add jenny at pitch, panned +/-0.45 | darker |
| choir (harmony, la-la) | amy (-0.5 pan, +7 cents, +10 ms) + jenny (+0.5, -8 cents, -9 ms) + lessac an octave down (formant x0.86); the final chorus and the outro double every voice (6 takes) | 3:1, width 1.25, plate -9 dB |
| gang (echo, gang) | 12 copies = 3 voices x 4 Piper speeds (0.95/1.08/1.2/0.88), each with its own detune (+/-15 cents), formant (0.84-1.08), timing (+/-8 ms, so a *d* stays one *d*), high-shelf tilt (+/-3 dB) and pan (spread -0.95..0.95); shouted: a 60-cent scoop into each word, durations x0.9, no vibrato | light saturation, 6:1, +1.5 dB presence, no air shelf, width 1.35; "(pen pal)" and "You do!" set 3 LU over the lead |
| gang (call: "(Keep it.)", "Flag it.") | 6 copies, detune +/-6 cents, full length, 2 dB under the chorus gang per copy | as above |
| spoken | lessac raw Piper per sentence, speed fitted to the slot, first vowel on its word | k1: 4 kHz low-pass + 8-bit 11 kHz (a 1988 sample); o3 dry |
| chops | the boot take's own Piper "pen" / "pal" (length scale 1.35), repitched by PSOLA to D5 / B4, starting exactly on the event, hard-gated to the written length (8 ms release) | 8-bit in the intro, clean in the post-choruses; -4 dB under the lead |

Gags: **FADE** (chorus "fade.") holds the word for 30 % of the beat, then the pitch glides B4 -> G4; only the tail
dissolves: from 55 % of the beat the bit depth falls 16 -> 5 and the level sinks 12 dB ("or I fay-" is heard
first), the band ducks 6 dB and dithers (7-bit TPDF) for 1.5 beats, then half a beat of nothing. **smooth** (pre-chorus 2): a low-pass sweeps 8 kHz -> 1.5 kHz across the word.
**Keep it.**: +/-10 cents, onsets 20 / 8 ms late. **The silent pen**: see the silence window below. **voice.**:
the word is sung to 150.75 s, then two periods of the vowel (taken 12 ms before the *s* is detected: the first
moment the 4 kHz+ band comes within 12 dB of the whole) loop to 151.0 s, then the *s*. (A duplicated, older
`_freeze` that looped from the note end and dropped the *s* was shadowing this one; it is gone.)

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
  -3.5 dB 320 Hz mud, -1 dB 1 kHz, +2.5 dB 3.6 kHz presence, +2.5 dB shelf 9.5 kHz) -> compressor 4:1 (4 ms /
  80 ms) -> leveller 2:1 (20 ms / 250 ms) -> exciter (saturated 3.5 kHz+ band, new harmonics above 7.5 kHz: air
  the 22 kHz TTS does not have) -> gentle tanh. In the choruses only, -3 dB at 420 Hz (Q 1) on the lead and the
  choir: their D4-D5 fundamentals were the mix's 400 Hz lump.
- **Chant**: as before, plus a split-band de-esser at 4.5 kHz whose threshold is the 97th percentile of the
  chant's own 4.5 kHz+ level (so only the hottest consonants move), at most 3 dB.
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
  (lead -14 LUFS over the choruses, lead doubles -22.5, chant -16.8 over the verses, choir -18.5 over the
  post-choruses, gang 3 LU over the lead on the "You do!" bars, drums -16 and bass -19 over the choruses, organ
  -19.5 over the intro and verse 2, felt piano -23, ...); the measured values and gains are in `song-qa.json`
  -> `mix.calibration`. The lead and chant went up 3 / 1.5 dB after QA round 1: with the bed where it was,
  Whisper lost the hook in the full mix (see section 7).
- **The vocal pocket** (`dsp.pocket`, a dynamic EQ): drums (3 dB), keys and other (4.5 dB) lose up to that much
  in 300 Hz-5 kHz while the dry lead, chant or spoken voice is within 6 dB of its loud level, fading out over
  the 18 dB below it (4 ms attack, 120 ms release): the band makes room for each word and takes it back in the
  gaps.
- **Low end**: the 808 sits 7 dB lower than in round 1 (it played C1 / D1 at 33-37 Hz, under most speakers); the
  kick is high-passed at 35 Hz (24 dB/oct); the bass bus has +2.5 dB at 220 Hz (Q 0.8) and so do the keys
  (body under the voices, the 160-300 Hz hole), -1.5 dB at 63 Hz (Q 1.2) in the choruses and -3 dB in the
  post-choruses.
- **Post-choruses**: drums and bass -1.5 dB before the energy solve (the solver lifts the band back, so the
  bounce gets brighter, not quieter), keystroke hats +4 dB, a +3.5 dB shelf at 5 kHz on the choir, chops and
  organ and +3 dB at 6 kHz on the claps.
- **Breakdown**: bars 1-3 the bass bus is low-passed at 110 Hz (24 dB/oct) and 9 dB down (the G pedal and the
  soft drives were the loudest thing in the section); bar 4 (the E2 sub) -4 dB; the spin-up riser -4 dB; snaps
  and claps -2 dB in bars 2-3; felt piano 2 dB lower.
- **Other automation**: the pre-chorus riser -3 dB over the last two beats before the HAND stop; the bridge
  organ comp and beeps -2.5 dB under "Oh-five. Oh-nine." and the organ under the last two bridge lines; the
  "other" bus (stabs, riser, bell flourish) -4 dB under every "You do! You do!"; the whole band -4 dB for the
  beat of the sung "Keep it." (75.0 s), whose clap and rimshot are also played softer (0.45 / 0.35); the
  reboot chord pumps with the pad in chorus 3 (it was the unpumped layer that made chorus 3's pump shallow).
- **Section energy**: the band (drums, bass, keys, other) is gained per section so that the *whole mix*
  measures its target loudness relative to chorus 1 as it measures before solving (intro -2, verses -3.2,
  pre-choruses -2 with a 3 dB build inside, choruses 1 and 2 +1, post-choruses -0.7, bridge -2, breakdown -3,
  final chorus +1.6, outro -1.5 LU; gains clamped to -9..+3 dB), the voices untouched. The solved gains are in
  `song-qa.json` -> `mix.section_energy_db`.
- **FADE**: drums/bass/keys/other drop 6 dB and are 60 % re-quantised to 7 bits with TPDF dither for 1.5 beats.
- **The silence window** (`parts.silence`, 131.25-132.0 s): every stem is faded over 8 ms into exact zeros at
  131.25 s; the lead's "the" (rendered on its own track, its own chain, no sends) and the writer's keystroke
  (131.625 s, 5 dB softer than in round 1, so it sits under the "the": a dry click) are added back; after mastering the window is re-masked so that outside those two sounds it is
  bit-exact digital silence (measured).

## 6. Master

Sum of the eight stems -> HP 30 Hz (24 dB/oct) -> **tonal match** (octave-band balance of the mix measured against
a modern pop curve, 31.5 Hz..16 kHz = -13.5 / -6 / -6.5 / -8.5 / -10.5 / -12.5 / -14 / -15.5 / -17.5 / -24.5 dB re
total; 60 % of the difference as peaking bands, clamped +/-3 dB, then a 40 % second pass; the 500 Hz-2 kHz bands
are never cut by more than 0.75 dB in all, because that is where the words are) -> small tone EQ -> RMS bus
compressor 1.5:1 (30 / 200 ms) -> 2x-oversampled soft clip (transparent below -2.1 dBFS) -> lookahead
(4 ms) **true-peak limiter** at -1.2 dBTP (4x interpolated peak detection, min-filter + moving-average gain
that cannot overshoot) -> input gain iterated (secant) to **-14.0 LUFS integrated** (SONG.md's reference; the
round-1 master was -9.0, which only bought 5 dB of limiting and a 2.3 LU loudness range that platforms normalise
away; at -14 the limiter only touches the house-kick transients) -> silence window re-masked
-> the end chord fades to exact zero over the last 0.35 s -> 24-bit PCM.

**Stems** are the pre-master buses at the master's input gain with one common trim so none clips; summed and
passed through the master chain they give the song.

## 7. Measurements (latest build, `build/song-qa.json`)

| measure | value |
|---|---|
| length | 154.0000 s (DUR 154.0; error 0.000 ms) |
| loudness | -9.01 LUFS integrated |
| peaks | -1.20 dBTP true peak (4x), -1.20 dBFS sample peak |
| limiter | max 2.8 dB, mean 0.67 dB in chorus 1 (the soft clip and the 1.5:1 glue do the rest) |
| silence window | [131.25, 132.0] s: non-zero only [[131.25, 131.5739], [131.622, 131.765]] (the dry "the" and the keystroke); digital zero elsewhere: True |
| events vs data.js | every EVENTS entry rendered at its time (0 missing); the 12 risers end on their beat (0.0 ms) |
| measured onsets (max abs) | kick 0.08 ms, snare 2.52, clap 0.12, crash 2.21, hats 3.06, brass stabs 2.67, bell 3.29, keystroke 0.0 |
| pitch (Praat, steady middle of each note) | lead 163 notes, median 2.1 cents (p95 5.1); la-la 56 notes, median 1.4 (p95 3.7), the riff note for note; chops 28, median 0.6; every note within 25 cents |
| Whisper (small.en, lead stem) | 27 / 35 lead lines word for word; chorus lines 20 / 24 |

Whisper method: each run of consecutive lead lines (a pre-chorus and its chorus, the breakdown pair, ...) is
transcribed from the lead stem as one passage (16 kHz float32 array, beam 5, temperature 0), and the transcript is
aligned word by word to the lyric to score each line; the silent "pen" is not expected.

Sections (after mastering):

| section | start s | LUFS | RMS dBFS |
|---|---|---|---|
| boot | 0.0 | -10.2 | -12.8 |
| intro | 4.0 | -9.2 | -11.3 |
| verse1 | 12.0 | -10.1 | -12.1 |
| pre1 | 28.0 | -9.2 | -11.4 |
| chorus1 | 36.0 | -8.5 | -10.0 |
| post1 | 52.0 | -8.8 | -9.8 |
| verse2 | 60.0 | -9.9 | -12.3 |
| pre2 | 76.0 | -9.1 | -11.4 |
| chorus2 | 84.0 | -8.4 | -10.2 |
| post2 | 100.0 | -8.7 | -9.8 |
| bridge | 104.0 | -9.1 | -11.1 |
| breakdown | 120.0 | -9.3 | -10.9 |
| chorus3 | 128.0 | -8.2 | -10.0 |
| outro | 144.0 | -9.0 | -11.5 |
| tail | 152.0 | -12.0 | -14.6 |

Octave-band balance (dB re total):

| band Hz | 31.5 | 63 | 125 | 250 | 500 | 1000 | 2000 | 4000 | 8000 | 16000 |
|---|---|---|---|---|---|---|---|---|---|---|
| song | -13.5 | -4.6 | -7.3 | -8.5 | -9.3 | -11.6 | -14.1 | -15.0 | -17.5 | -26.0 |
| chorus 1 | -9.1 | -4.1 | -8.9 | -10.5 | -8.9 | -12.5 | -13.7 | -15.5 | -19.2 | -27.9 |
| target | -13.5 | -6.0 | -6.5 | -8.5 | -10.5 | -12.5 | -14.0 | -15.5 | -17.5 | -24.5 |

Stereo: L/R correlation 0.85 overall, 0.99 below 120 Hz (the low end is mono), side 10.8 dB under mid.

Whisper lines not word for word (passage transcription; heard <- wanted):

- `v2f_keep` "get it" <- "Keep it."
- `chorus2c` "you say" <- "You say where I land,"
- `chorus2d` "" <- "or I fade."
- `b7` "eras one desk" <- "Twelve eras. One desk."
- `b8` "and you're windows c" <- "And your windows stay."
- `chorus3c` "you say where i am" <- "You say where I land,"
- `chorus3d` "or i fail" <- "or I fade."
- `o2` "it was always your boiiiiiiiiiiiiiiiiiii..." <- "It was always your voice."

## 8. Known limits

- Whisper is a strict judge of PSOLA-sung speech at D5-E5: lines it does not transcribe word for word are listed
  in the table above. The gags are meant to damage words (FADE, the frozen "voice"), and the shouted gang and
  la-la are judged by contour, not text (SONG.md section 5).
- Piper voices are sampled at 22.05 kHz; the air above 11 kHz on the voices is synthesised by the exciter.
- Piper's own random sampler is off (zero noise) for determinism; the variety between doubled and stacked takes
  comes from different voices, Piper speeds, formant shifts, detunes and timing.
