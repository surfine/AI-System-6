"""voice.py: the singer.  Piper neural TTS per word, sung by Praat PSOLA.

Per word:
  1. Piper says the word (phonemes, zero noise so it is deterministic), cached in .cache/tts/.
  2. trim; optional formant shift (resample, then PSOLA restores pitch and time).
  3. analyse: Praat pitch for voicing, a 150-4000 Hz intensity contour; find one vowel CORE per
     syllable (the loudest voiced stretch; syllables split at the intensity dips between nuclei,
     i.e. by voiced segments, not evenly).
  4. warp: the onset consonants are placed BEFORE the note so the vowel lands on the beat; the
     consonants between syllables sit just before the next note; each core keeps its first and
     last 25 ms (the formant transitions that carry the consonants) at natural speed and only the
     steady middle is stretched (Praat DurationTier).
  5. pitch: a contour designed in output time (glide-in from the previous note, a scoop on long
     notes, portamento inside slurred words, vibrato that arrives late on held notes, slow drift,
     a small fall on phrase ends), mapped back to source time and written as a PitchTier.
  6. overlap-add resynthesis, resample 22.05 -> 48 kHz; the result and its start time are cached
     in .cache/sing/ keyed by every input, so a rebuild is deterministic and fast.
"""
import hashlib
import io
import json
import math
import os
import wave

import numpy as np

from dsp import SR, resample, rng

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CACHE = os.path.join(ROOT, ".cache")
VOICE_DIR = os.path.join(CACHE, "voices")
VOICES = {"amy": "en_US-amy-medium", "jenny": "en_GB-jenny_dioco-medium", "lessac": "en_US-lessac-medium"}
ENGINE_VERSION = "sing-v19"

# phoneme overrides: sung vowels want stress; "the" is a schwa; la-la is "lah"
PHON_OVERRIDE = {
    "the": "ðiː", "a": "ɐ", "la": "lˈɑː", "insert": "ɪnsˈɜːt", "export": "ɛkspˈɔːɹt",
    "you": "jˈuː", "i'm": "ˈaɪm", "i'll": "ˈaɪl", "i": "ˈaɪ", "your": "jˈʊɹ", "do": "dˈuː",
    "or": "ˈɔːɹ", "and": "ˈænd", "in": "ˈɪn", "it": "ˈɪt", "is": "ˈɪz", "an": "ˈæn", "for": "fˈɔːɹ",
    "was": "wˈʌz", "but": "bˈʌt", "can": "kˈæn", "could": "kˈʊd", "own": "ˈoʊn",
    "eras": "ˈɛɹəz", "one": "wˈʌn", "twelve": "twˈɛlv",
}
FUNCTION_WORDS = {"i'm", "i'll", "i", "the", "a", "your", "and", "or", "in", "it", "is", "an", "for", "was",
                  "but", "can", "could", "just", "where", "who"}

_piper = {}


def _voice(name):
    if name not in _piper:
        from piper import PiperVoice
        _piper[name] = PiperVoice.load(os.path.join(VOICE_DIR, VOICES[name] + ".onnx"))
    return _piper[name]


def clean(word):
    return word.strip("()!,.?;:\"").replace("’", "'")


_PH = None
_PH_PATH = os.path.join(CACHE, "phonemes.json")


def _ph_cache():
    global _PH
    if _PH is None:
        try:
            with open(_PH_PATH) as f:
                _PH = json.load(f)
        except (OSError, ValueError):
            _PH = {}
    return _PH


def save_phoneme_cache():
    os.makedirs(CACHE, exist_ok=True)
    with open(_PH_PATH, "w") as f:
        json.dump(_ph_cache(), f, ensure_ascii=False, indent=0, sort_keys=True)


def phonemes_for(name, text):
    """IPA for a (cleaned) word, with sung-stress overrides (memoised in .cache/phonemes.json)."""
    key = text.lower()
    if key in PHON_OVERRIDE:
        return PHON_OVERRIDE[key]
    c = _ph_cache()
    ck = name + "|" + key
    if ck in c:
        return c[ck]
    c[ck] = _phonemize(name, text)
    return c[ck]


def _phonemize(name, text):
    V = _voice(name)
    ph = "".join("".join(s) for s in V.phonemize(text.replace("-", " ")))
    ph = ph.replace(" ", "")
    if "ˈ" not in ph and "ˌ" not in ph:
        for i, ch in enumerate(ph):
            if ch in "aeiouæɑɐɒɔəɛɜɪʊʌɚ":
                ph = ph[:i] + "ˈ" + ph[i:]
                break
    return ph


PLOSIVES = ("p", "t", "k", "b", "d", "ɡ", "g", "tʃ", "dʒ")


def _strip_stress(ph):
    return ph.replace("ˈ", "").replace("ˌ", "")


def needs_carrier(ph):
    """Word-initial plosives come out breathy from Piper after silence (a 'p' heard as 'h');
    said after a carrier 'the' they get a real closure and burst."""
    return _strip_stress(ph).startswith(PLOSIVES)


def _cut_carrier(a, sr):
    """Remove the carrier: find the closure (energy floor) after the carrier's vowel and start the
    word 8 ms before the burst."""
    w = int(0.005 * sr)
    e = 10 * np.log10(np.convolve(a * a, np.ones(w) / w, mode="same") + 1e-12)
    pk = int(np.argmax(e[: int(0.16 * sr)]))                 # the carrier vowel
    lo = pk + int(0.02 * sr)
    hi = min(len(a) - 1, pk + int(0.22 * sr))
    k = lo + int(np.argmin(e[lo:hi]))                       # the closure
    floor = e[k]
    j = k
    while j < len(a) - 1 and e[j] < floor + 12:
        j += 1                                              # the burst
    return a[max(k, j - int(0.008 * sr)):]


def tts(name, text, length_scale=1.0):
    """Piper audio (float32, 22.05 kHz) for one word; cached."""
    ph = phonemes_for(name, text)
    car = needs_carrier(ph)
    key = hashlib.sha1(json.dumps([VOICES[name], ph, round(length_scale, 3), "z1", car]).encode()).hexdigest()[:20]
    path = os.path.join(CACHE, "tts", key + ".npy")
    if os.path.exists(path):
        return np.load(path), 22050
    from piper import SynthesisConfig
    V = _voice(name)
    cfg = SynthesisConfig(length_scale=length_scale, noise_scale=0.0, noise_w_scale=0.0)
    ids = V.phonemes_to_ids(list(("ðə" if car else "") + ph))
    a = V.phoneme_ids_to_audio(ids, cfg)
    if isinstance(a, tuple):
        a = a[0]
    a = np.asarray(a, dtype=np.float32)
    if car:
        cut = _cut_carrier(a.astype(float), V.config.sample_rate).astype(np.float32)
        # sanity: the word itself must survive the cut; otherwise say it without the carrier
        plain = V.phoneme_ids_to_audio(V.phonemes_to_ids(list(ph)), cfg)
        plain = np.asarray(plain[0] if isinstance(plain, tuple) else plain, dtype=np.float32)
        a = cut if len(cut) >= 0.6 * len(trim(plain.astype(float), V.config.sample_rate)) else plain
    os.makedirs(os.path.dirname(path), exist_ok=True)
    np.save(path, a)
    return a, V.config.sample_rate


def tts_sentence(name, text, length_scale=1.0):
    """Raw Piper for a spoken sentence (no PSOLA); cached."""
    key = hashlib.sha1(json.dumps([VOICES[name], text, round(length_scale, 3), "s0"]).encode()).hexdigest()[:20]
    path = os.path.join(CACHE, "tts", key + ".npy")
    if os.path.exists(path):
        return np.load(path), 22050
    from piper import SynthesisConfig
    V = _voice(name)
    cfg = SynthesisConfig(length_scale=length_scale, noise_scale=0.0, noise_w_scale=0.0)
    a = np.concatenate([c.audio_float_array for c in V.synthesize(text, syn_config=cfg)]).astype(np.float32)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    np.save(path, a)
    return a, V.config.sample_rate


def trim(x, sr, th_db=-42.0, pad=0.004):
    a = np.abs(x)
    if a.max() <= 0:
        return x
    w = max(1, int(0.004 * sr))
    env = np.convolve(a, np.ones(w) / w, mode="same")
    idx = np.where(env > a.max() * 10 ** (th_db / 20))[0]
    if len(idx) == 0:
        return x
    p = int(pad * sr)
    return x[max(0, idx[0] - p): min(len(x), idx[-1] + p)]


# ------------------------------------------------------------------------------------------------
# analysis
# ------------------------------------------------------------------------------------------------
HOP = 0.005


def analyse(x, sr):
    """Frames every 5 ms: voiced flag and band intensity (dB)."""
    import parselmouth
    from scipy import signal as sg
    xx = np.asarray(x, dtype=float)
    if len(xx) < int(0.06 * sr):
        xx = np.concatenate([xx, np.zeros(int(0.06 * sr) - len(xx))])
    snd = parselmouth.Sound(xx, sr)
    pitch = snd.to_pitch_ac(time_step=HOP, pitch_floor=70.0, pitch_ceiling=700.0, voicing_threshold=0.4)
    f0 = pitch.selected_array["frequency"]
    pt = pitch.xs()
    n = max(1, int(len(x) / sr / HOP))
    times = (np.arange(n) + 0.5) * HOP
    voiced = np.interp(times, pt, (f0 > 0).astype(float), left=0, right=0) > 0.5 if len(pt) else np.zeros(n, bool)
    sos = sg.butter(2, [150, 4000], btype="bandpass", fs=sr, output="sos")
    b = sg.sosfilt(sos, x)
    w = int(0.025 * sr)
    e = np.convolve(b ** 2, np.ones(w) / w, mode="same")
    idx = np.minimum((times * sr).astype(int), len(x) - 1)
    inten = 10 * np.log10(e[idx] + 1e-12)
    inten = np.convolve(inten, np.ones(3) / 3, mode="same")
    return times, voiced, inten


def find_cores(times, voiced, inten, nsyl):
    """One vowel core per syllable: [(t0, t1), ...] in seconds (sorted)."""
    n = len(times)
    top = inten.max()
    S = np.where(voiced, inten, -200.0)
    if not voiced.any():
        S = inten.copy()
    peaks = []
    for i in range(n):
        lo, hi = max(0, i - 3), min(n, i + 4)
        if S[i] > top - 30 and S[i] >= S[lo:hi].max() and S[i] > -150:
            peaks.append(i)
    peaks.sort(key=lambda i: -S[i])
    chosen = []
    mind = int(0.045 / HOP)
    for p in peaks:
        ok = True
        for c in chosen:
            if abs(p - c) < mind:
                ok = False
                break
            a, b = sorted((p, c))
            dip = S[a:b + 1].min()
            if min(S[p], S[c]) - dip < 1.5:
                ok = False
                break
        if ok:
            chosen.append(p)
        if len(chosen) == nsyl:
            break
    chosen.sort()
    if len(chosen) < nsyl:
        # fallback: the voiced span split evenly
        vi = np.where(S > -150)[0]
        a0, a1 = (vi[0], vi[-1]) if len(vi) else (0, n - 1)
        edges = np.linspace(a0, a1 + 1, nsyl + 1)
        return [(edges[k] * HOP, edges[k + 1] * HOP) for k in range(nsyl)]
    # boundaries between chosen peaks at the minimum
    bounds = [0]
    for a, b in zip(chosen[:-1], chosen[1:]):
        bounds.append(a + int(np.argmin(S[a:b + 1])))
    bounds.append(n - 1)
    cores = []
    for k, p in enumerate(chosen):
        thr = S[p] - 7.0
        lo_lim, hi_lim = bounds[k], bounds[k + 1]
        a = p
        while a - 1 >= lo_lim and S[a - 1] >= thr:
            a -= 1
        b = p
        while b + 1 <= hi_lim and S[b + 1] >= thr:
            b += 1
        cores.append([a * HOP, (b + 1) * HOP])
    # cores must not overlap
    for k in range(1, len(cores)):
        if cores[k][0] < cores[k - 1][1]:
            m = 0.5 * (cores[k][0] + cores[k - 1][1])
            cores[k - 1][1] = m
            cores[k][0] = m
    return [tuple(c) for c in cores]


# ------------------------------------------------------------------------------------------------
# the sung word
# ------------------------------------------------------------------------------------------------
DEFAULT_STYLE = dict(
    voice="amy", length_scale=None, formant=1.0, detune=0.0, transpose=0,
    vib_depth=22.0, vib_rate=5.4, vib_min=0.45, vib_delay=0.30, vib_ramp=0.25,
    scoop=-40.0, scoop_min=0.45, scoop_time=0.11, glide=0.06, glide_in=0.07, drift=5.0,
    fall=-35.0, flat=False, max_pre=0.16, kc=None, dur_comp=1.0, onset_on_beat=False,
    shout=0.0, edge=0.03, seed=0, coda_hold=0.4, cons_boost=4.0, vowel_fade=0.035, hold_mode="point",
)
ONSET_BUDGET = {"p": .035, "t": .035, "k": .04, "b": .03, "d": .03, "ɡ": .035, "g": .035, "f": .07, "θ": .06,
                "s": .085, "ʃ": .08, "h": .045, "v": .04, "ð": .03, "z": .06, "ʒ": .06, "m": .05, "n": .045,
                "ŋ": .045, "l": .05, "ɹ": .05, "w": .05, "j": .04, "ʧ": .07, "ʤ": .07}
VOWELS = "aeiouæɑɐɒɔəɛɜɪʊʌɚᵻ"


def onset_budget(ph):
    """Seconds a singer gives the onset consonants of a word (from its IPA)."""
    tot = 0.0
    for ch in ph:
        if ch in VOWELS:
            break
        tot += ONSET_BUDGET.get(ch, 0.0)
    return tot


def sonorant_coda(ph):
    """A nasal or /l/ closes the word (also before a final d/t/z/s: 'land', 'hold', 'holds'):
    singers sustain it, so it gets a share of the note."""
    tail = _strip_stress(ph).rstrip("ːˑ")
    core = tail.rstrip("dtzs")
    if len(tail) - len(core) > 2:
        return False
    return len(core) > 0 and core[-1] in "nmŋl" and any(c in VOWELS for c in core)


def obstruent_coda(ph):
    t = _strip_stress(ph).rstrip("ːˑ")
    return len(t) > 0 and t[-1] in "ptkbdgɡfvszʃʒθðʤʧ"


def obstruent_onset(ph):
    t = _strip_stress(ph)
    return len(t) > 0 and t[0] in "ptkbdgɡfvszʃʒθðʤʧh"


DIPHTHONGS = ("aɪ", "eɪ", "oʊ", "aʊ", "ɔɪ", "əʊ")


def syllable_vowels(ph):
    """Vowel clusters of a word's IPA, with what follows each (for the hold point)."""
    p = _strip_stress(ph)
    out = []
    i = 0
    while i < len(p):
        if p[i] in VOWELS:
            j = i
            while j < len(p) and (p[j] in VOWELS or p[j] in "ːˑ"):
                j += 1
            out.append((p[i:j], p[j:j + 1]))
            i = j
        else:
            i += 1
    return out


HOLD = {"diph": 0.3, "nasal": 0.8, "rhotic": 0.5, "default": 0.4}


def hold_positions(ph, nsyl):
    """Where in each vowel core a singer sustains: early in a diphthong (hold the first vowel, glide
    late), early for a vowel before a nasal (before it nasalises), mid otherwise."""
    vs = syllable_vowels(ph)
    if len(vs) != nsyl:
        return [0.4] * nsyl
    pos = []
    for v, nxt in vs:
        if v.startswith(DIPHTHONGS):
            pos.append(HOLD["diph"])
        elif nxt in ("n", "m", "ŋ") and v.startswith("ɛ"):
            pos.append(HOLD["nasal"])
        elif v.startswith(("ɚ", "ɜ")):
            pos.append(HOLD["rhotic"])
        else:
            pos.append(HOLD["default"])
    return pos


def _warp_from(segments):
    """segments: [(src_a, src_b, tgt_a, tgt_b)] contiguous -> breakpoint arrays."""
    src = [segments[0][0]] + [s[1] for s in segments]
    tgt = [segments[0][2]] + [s[3] for s in segments]
    return np.array(src), np.array(tgt)


def plan_word(x, sr, notes, nsyl, ctx, st):
    """Decide the time warp. notes: [(midi, start_s, dur_s)]; ctx: {next_start, next_pre, prev_end}."""
    times, voiced, inten = analyse(x, sr)
    L = len(x) / sr
    cores = find_cores(times, voiced, inten, nsyl)
    nn = len(notes)
    if len(cores) != nn:  # one core per note
        if len(cores) > nn:
            cores = cores[: nn - 1] + [(cores[nn - 1][0], cores[-1][1])]
        else:
            a0, a1 = cores[0][0], cores[-1][1]
            e = np.linspace(a0, a1, nn + 1)
            cores = [(e[k], e[k + 1]) for k in range(nn)]
    ls = st["length_scale"] or 1.0
    kc = st["kc"] if st["kc"] is not None else 1.0 / ls      # consonants back to natural speed
    starts = [n[1] for n in notes]
    ends = [n[1] + n[2] for n in notes]
    if st["dur_comp"] != 1.0:
        ends[-1] = starts[-1] + (ends[-1] - starts[-1]) * st["dur_comp"]
    pre_src = cores[0][0]
    post_src = L - cores[-1][1]
    ob = ctx.get("onset_budget")
    cap = st["max_pre"] if ob is None else min(st["max_pre"], max(0.03, ob * 1.15))
    if ob is not None and ob == 0.0:
        cap = 0.012
    P = min(pre_src * kc, cap)
    Q = min(post_src * kc, 0.16)
    if ctx.get("sonorant_coda") and st["coda_hold"] > 0:
        cluster = ctx.get("coda_cluster", False)        # 'land', 'hold': the n / l shares less of the note
        Q = max(Q, st["coda_hold"] * (0.6 if cluster else 1.0) * (ends[-1] - starts[-1]))
    segs = []
    # where does the first vowel go?
    v0 = starts[0] if not st["onset_on_beat"] else starts[0] + P
    t = v0 - P
    if pre_src > 1e-4:
        segs.append((0.0, pre_src, t, v0))
    # the cores and the consonants between them
    for i, (ca, cb) in enumerate(cores):
        core_start = v0 if i == 0 else starts[i]
        if i < nn - 1:
            gap_src = cores[i + 1][0] - cb
            B = gap_src * kc
            room = (starts[i + 1] - core_start)
            B = min(B, 0.45 * room)
            core_end = starts[i + 1] - B
        else:
            nxt = ctx.get("next_start")
            legato = nxt is not None and nxt - ends[-1] < 0.2
            hold = 0.85 if ctx.get("sonorant_coda") and st["coda_hold"] > 0 else 0.35
            if legato and ctx.get("next_pre", 0.05) < 0.005:
                core_end = ends[-1] - 0.15 * Q          # vowel to vowel: keep voicing through the join
            elif legato and ctx.get("coda_clear"):
                core_end = ends[-1] - ctx.get("next_pre", 0.05) - Q    # 'page / stay': no smear
            elif legato:
                core_end = ends[-1] - 0.5 * ctx.get("next_pre", 0.05) - hold * Q
            else:
                core_end = ends[-1] - hold * Q
            core_end = max(core_end, core_start + 0.5 * (ends[-1] - core_start))
            B = None
        cl = cb - ca
        T = core_end - core_start
        e1 = min(st["edge"], 0.25 * cl)
        e2 = min(st["edge"], 0.25 * cl)
        mid_src = cl - e1 - e2
        mid_tgt = T - e1 - e2
        hp_ = ctx.get("hold_pos")
        if st["hold_mode"] == "point" and hp_ is not None and cl > 0.03:
            # sustain one short window of the vowel (its most characteristic moment); the rest of the
            # core, with all its transitions, runs at natural speed around it
            hw = min(0.03, 0.4 * cl)
            h0 = min(max(ca + hp_[i] * cl - hw / 2, ca + 0.01), cb - hw - 0.005)
            h1 = h0 + hw
            kn = 1.0 / ls
            n1, n2 = (h0 - ca) * kn, (cb - h1) * kn
            if n1 + n2 > 0.8 * T:
                f = 0.8 * T / max(n1 + n2, 1e-6)
                n1, n2 = n1 * f, n2 * f
            segs.append((ca, h0, core_start, core_start + n1))
            segs.append((h0, h1, core_start + n1, core_end - n2))
            segs.append((h1, cb, core_end - n2, core_end))
        elif mid_src > 0.004 and mid_tgt > 0.004:
            segs.append((ca, ca + e1, core_start, core_start + e1))
            segs.append((ca + e1, cb - e2, core_start + e1, core_end - e2))
            segs.append((cb - e2, cb, core_end - e2, core_end))
        else:
            segs.append((ca, cb, core_start, core_end))
        if i < nn - 1 and cores[i + 1][0] - cb > 1e-4:
            segs.append((cb, cores[i + 1][0], core_end, starts[i + 1]))
        elif i < nn - 1:
            # no gap in source: stretch the join into the core boundary
            pass
    if post_src > 1e-4:
        cb = cores[-1][1]
        # a held sonorant coda ('n', 'l') stretches; the stop or fricative after it keeps its own time
        vi = np.where(voiced & (times > cb))[0]
        son_end = min(L, float(times[vi[-1]]) + HOP / 2) if len(vi) else cb
        tail_src = L - son_end
        if ctx.get("sonorant_coda") and st["coda_hold"] > 0 and son_end - cb > 0.015 and tail_src > 0.012:
            tail = min(tail_src * kc, 0.12)
            t0_ = segs[-1][3]
            segs.append((cb, son_end, t0_, t0_ + max(Q - tail, 0.02)))
            segs.append((son_end, L, segs[-1][3], segs[-1][3] + tail))
        else:
            segs.append((cb, L, segs[-1][3], segs[-1][3] + Q))
    # make contiguous (cores touching with no gap)
    fixed = [segs[0]]
    for s in segs[1:]:
        p = fixed[-1]
        s = (p[1], s[1], p[3], s[3]) if abs(s[0] - p[1]) > 1e-9 or abs(s[2] - p[3]) > 1e-9 else s
        if s[1] - s[0] > 1e-5 and s[3] - s[2] > 1e-5:
            fixed.append(s)
    return fixed, cores


def pitch_curve(tg, notes, st, ctx):
    """Target-time pitch (midi, float) at times tg."""
    nn = len(notes)
    m = np.array([n[0] for n in notes], dtype=float) + st["transpose"]
    starts = np.array([n[1] for n in notes])
    ends = np.array([n[1] + n[2] for n in notes])
    idx = np.clip(np.searchsorted(starts, tg, side="right") - 1, 0, nn - 1)
    p = m[idx].copy()
    if not st["flat"] and st["glide"] > 0:
        for i in range(1, nn):  # portamento inside the word, centred just before the new note
            g = st["glide"]
            a, b = starts[i] - 0.6 * g, starts[i] + 0.4 * g
            w = (tg >= a) & (tg < b)
            s = (tg[w] - a) / (b - a)
            s = s * s * (3 - 2 * s)
            p[w] = m[i - 1] + (m[i] - m[i - 1]) * s
    elif st["flat"] and st["glide"] > 0:     # the melt: the robot learns portamento
        for i in range(1, nn):
            g = st["glide"]
            a, b = starts[i] - 0.5 * g, starts[i] + 0.5 * g
            w = (tg >= a) & (tg < b)
            s = (tg[w] - a) / (b - a)
            p[w] = m[i - 1] + (m[i] - m[i - 1]) * s
    prev = ctx.get("prev_midi")
    gi = st["glide_in"]
    if prev is not None and gi > 0 and not st["flat"] and ctx.get("prev_gap", 9) < 0.35:
        a, b = starts[0] - 0.5 * gi, starts[0] + 0.5 * gi
        pre = tg < a
        p[pre] = prev + st["transpose"]
        w = (tg >= a) & (tg < b)
        s = (tg[w] - a) / (b - a)
        s = s * s * (3 - 2 * s)
        p[w] = prev + st["transpose"] + (m[0] - prev - st["transpose"]) * s
    elif prev is not None and gi > 0 and st["flat"] and st["glide"] > 0 and ctx.get("prev_gap", 9) < 0.35:
        a, b = starts[0] - 0.5 * st["glide"], starts[0] + 0.5 * st["glide"]
        pre = tg < a
        p[pre] = prev + st["transpose"]
        w = (tg >= a) & (tg < b)
        s = (tg[w] - a) / (b - a)
        p[w] = prev + st["transpose"] + (m[0] - prev - st["transpose"]) * s
    cents = np.zeros_like(tg)
    r = rng("pitch", st["seed"], *[round(v, 3) for v in starts])
    for i in range(nn):
        d = ends[i] - starts[i]
        loc = tg - starts[i]
        on = (loc >= -0.05) & (tg < ends[i] + 0.05)
        if st["scoop"] and d >= st["scoop_min"] and not st["flat"]:
            sc = (loc >= 0) & (loc < st["scoop_time"])
            s = loc[sc] / st["scoop_time"]
            cents[sc] += st["scoop"] * (1 - s) ** 2
        if st["shout"]:
            sc = (loc >= -0.03) & (loc < 0.06)
            s = np.clip((loc[sc] + 0.03) / 0.09, 0, 1)
            cents[sc] += st["shout"] * (1 - s) ** 1.5
        if st["vib_depth"] and d >= st["vib_min"] and not st["flat"]:
            delay = min(st["vib_delay"], 0.45 * d)
            ramp = st["vib_ramp"]
            vm = on & (loc > delay)
            amp = np.clip((loc[vm] - delay) / ramp, 0, 1)
            rate = st["vib_rate"] * (1 + 0.04 * math.sin(r.uniform(0, 6.28)))
            ph = r.uniform(0, 2 * math.pi)
            cents[vm] += st["vib_depth"] * amp * np.sin(2 * math.pi * rate * (loc[vm] - delay) + ph)
        if st["fall"] and i == nn - 1 and ctx.get("phrase_end"):
            fm = tg > ends[i] - 0.07
            s = np.clip((tg[fm] - (ends[i] - 0.07)) / 0.12, 0, 1)
            cents[fm] += st["fall"] * s * s
    if st["drift"] and not st["flat"]:
        ph1, ph2 = r.uniform(0, 6.28, 2)
        cents += st["drift"] * (0.6 * np.sin(2 * math.pi * 0.7 * tg + ph1) + 0.4 * np.sin(2 * math.pi * 1.9 * tg + ph2))
    cents += st["detune"]
    return p + cents / 100.0


def _key(*parts):
    return hashlib.sha1(json.dumps(parts, sort_keys=True, default=str).encode()).hexdigest()[:24]


def sing(job):
    """Render one sung word.  job = {text, notes, nsyl, ctx, style, pitch_override?}.
    Returns (audio float32 @ 48 kHz, t0 seconds)."""
    st = dict(DEFAULT_STYLE)
    st.update(job.get("style", {}))
    key = _key(ENGINE_VERSION, job["text"], job["notes"], job["nsyl"], job.get("ctx", {}), st, job.get("pitch_override"))
    path = os.path.join(CACHE, "sing", key + ".npz")
    if os.path.exists(path):
        z = np.load(path)
        return z["a"], float(z["t0"])
    a, t0 = _sing(job, st)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    np.savez(path, a=a.astype(np.float32), t0=t0)
    return a.astype(np.float32), t0


def _sing(job, st):
    import parselmouth
    from parselmouth.praat import call
    text = clean(job["text"])
    notes = [tuple(n) for n in job["notes"]]
    ctx = job.get("ctx", {})
    total = notes[-1][1] + notes[-1][2] - notes[0][1]
    ls = st["length_scale"] or choose_ls(notes)
    st["length_scale"] = ls
    x, sr = tts(st["voice"], text, ls)
    x = trim(np.asarray(x, dtype=float), sr)
    x = x / (np.max(np.abs(x)) + 1e-9) * 0.8
    if st["formant"] != 1.0:
        # formants scale by k: stretch the waveform by 1/k at the same rate; PSOLA restores pitch and time
        k = st["formant"]
        num = int(round(1000 / k))
        from scipy import signal as sg
        x = sg.resample_poly(x, num, 1000)
    ph = job.get("ph") or phonemes_for(st["voice"], text)
    ctx = dict(ctx)
    ctx.setdefault("onset_budget", onset_budget(ph))
    ctx.setdefault("sonorant_coda", sonorant_coda(ph))
    ctx.setdefault("coda_cluster", bool(sonorant_coda(ph) and obstruent_coda(ph)))
    ctx.setdefault("hold_pos", hold_positions(ph, job["nsyl"]))
    ctx.setdefault("coda_clear", bool(obstruent_coda(ph) and ctx.get("next_obstruent")))
    segs, cores = plan_word(x, sr, notes, job["nsyl"], ctx, st)
    src_bp, tgt_bp = _warp_from(segs)
    L = len(x) / sr
    snd = parselmouth.Sound(x, sr)
    man = call(snd, "To Manipulation", 0.01, 70, 700)
    dt = call("Create DurationTier", "d", 0, L)
    for sa, sb, ta, tb in segs:
        k = (tb - ta) / max(sb - sa, 1e-6)
        eps = min(0.0004, (sb - sa) / 4)
        call(dt, "Add point", sa + eps, k)
        call(dt, "Add point", sb - eps, k)
    call([dt, man], "Replace duration tier")
    t_start, t_end = tgt_bp[0], tgt_bp[-1]
    tg = np.arange(t_start, t_end, 0.0025)
    if job.get("pitch_override") is not None:
        po = np.array(job["pitch_override"], dtype=float)      # [[t, midi], ...] absolute
        pm = np.interp(tg, po[:, 0], po[:, 1])
        pm += st["detune"] / 100.0 + st["transpose"]
    else:
        pm = pitch_curve(tg, notes, st, ctx)
    ts = np.interp(tg, tgt_bp, src_bp)
    pt = call("Create PitchTier", "p", 0, L)
    last = -1.0
    for a_t, m in zip(ts, pm):
        if a_t > last + 1e-5 and 0 <= a_t <= L:
            call(pt, "Add point", float(a_t), float(440.0 * 2 ** ((m - 69) / 12)))
            last = a_t
    call([pt, man], "Replace pitch tier")
    # Praat's overlap-add places unvoiced pseudo-periods at random: seed it from the job so that a
    # fresh render is bit-identical to a cached one
    from parselmouth.praat import run as praat_run
    seed = int(hashlib.sha1(json.dumps([job["text"], job["notes"], st.get("seed", 0)]).encode()).hexdigest()[:7], 16)
    praat_run("random_initializeWithSeedUnsafelyButPredictably (%d)" % seed)
    out = call(man, "Get resynthesis (overlap-add)")
    y = np.asarray(out.values[0], dtype=float)
    y = resample(y, sr, SR)
    n = len(y)
    # consonant emphasis: the onset (and the consonants between syllables, and a non-sonorant coda)
    # come up a few dB against the sustained vowels -- the singer's diction
    if st["cons_boost"]:
        g = np.zeros(n)
        tt = t_start + np.arange(n) / SR
        core_spans = [(np.interp(a, src_bp, tgt_bp), np.interp(b, src_bp, tgt_bp)) for a, b in cores]
        is_cons = np.ones(n, dtype=bool)
        for a, b in core_spans:
            is_cons &= ~((tt >= a) & (tt < b))
        boost = st["cons_boost"] + (2.0 if text.lower() == "the" else 0.0)
        if _strip_stress(ph)[:1] in ("v", "z", "ʒ", "w", "l"):
            boost += 3.0          # weak voiced onsets ('voice' was heard as 'boy', 'land' as 'am')
        g[is_cons] = boost
        if ctx.get("sonorant_coda"):
            g[tt >= core_spans[-1][1]] = 0.0
        w = max(1, int(0.008 * SR))
        g = np.convolve(g, np.ones(w) / w, mode="same")
        y = y * 10 ** (g / 20)
    # gate/fades
    vowel_initial = _strip_stress(ph)[:1] in VOWELS
    if vowel_initial and st["vowel_fade"] > 0 and not ctx.get("prev_obstruent"):
        # a soft (non-glottal) vowel onset: a glottal stop after silence or after the previous word
        # is heard as a 'b'; ramp from -16 dB to full over the first `vowel_fade` s of the vowel
        c0 = float(np.interp(cores[0][0], src_bp, tgt_bp))
        tt = t_start + np.arange(n) / SR
        r = np.clip((tt - (c0 - 0.01)) / (st["vowel_fade"] + 0.01), 0, 1)
        y = y * (0.16 + 0.84 * (0.5 - 0.5 * np.cos(np.pi * r)))
    fi = min(n, int(0.004 * SR))
    fo = min(n, int(0.012 * SR))
    if fi:
        y[:fi] *= np.linspace(0, 1, fi)
    if fo:
        y[n - fo:] *= np.linspace(1, 0, fo)
    return y, float(t_start)


def choose_ls(notes):
    """Long notes: ask Piper to speak slower so the vowel has more of itself to sustain."""
    longest = max(n[2] for n in notes)
    return 1.0 if longest < 0.4 else (1.35 if longest < 0.7 else (1.8 if longest < 1.1 else 2.3))


def prepare(jobs):
    """Main process: fix every job's length scale and phonemes and warm the TTS cache, so the
    PSOLA workers never need to load Piper."""
    for j in jobs:
        st = j.setdefault("style", {})
        if st.get("length_scale") is None:
            st["length_scale"] = choose_ls(j["notes"])
        v = st.get("voice", "amy")
        j["ph"] = phonemes_for(v, clean(j["text"]))
        tts(v, clean(j["text"]), st["length_scale"])
    save_phoneme_cache()


USED = set()     # cache files this build used (for --prune-cache)


def sing_pool(jobs, workers=4):
    """Render many words; cached results return immediately, the rest in a process pool."""
    todo = []
    out = [None] * len(jobs)
    for j in jobs:
        js = j.setdefault("style", {})
        if js.get("length_scale") is None:
            js["length_scale"] = choose_ls(j["notes"])
    for i, j in enumerate(jobs):
        st = dict(DEFAULT_STYLE)
        st.update(j.get("style", {}))
        key = _key(ENGINE_VERSION, j["text"], j["notes"], j["nsyl"], j.get("ctx", {}), st, j.get("pitch_override"))
        path = os.path.join(CACHE, "sing", key + ".npz")
        USED.add(path)
        if os.path.exists(path):
            z = np.load(path)
            out[i] = (z["a"], float(z["t0"]))
        else:
            todo.append(i)
    if todo:
        prepare([jobs[i] for i in todo])
        import multiprocessing as mp
        ctx = mp.get_context("fork")
        with ctx.Pool(workers) as pool:
            res = pool.map(sing, [jobs[i] for i in todo], chunksize=4)
        for i, r in zip(todo, res):
            out[i] = r
    return out


def pre_length(text, voice="amy", length_scale=1.0):
    """Source onset length (s) before the first vowel core: used to give the previous word room."""
    x, sr = tts(voice, clean(text), length_scale)
    x = trim(np.asarray(x, dtype=float), sr)
    times, voiced, inten = analyse(x, sr)
    cores = find_cores(times, voiced, inten, 1)
    return min(cores[0][0] / length_scale, 0.16)
