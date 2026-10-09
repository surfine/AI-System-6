"""sing_world.py: the Kokoro singer (af_heart) for the guide that ACE-Step 1.5 covers.

The old singer (voice.py / vocals.py: Piper words resynthesised one at a time by Praat PSOLA) was judged
unpleasant.  This one says each phrase with Kokoro and sings it with WORLD:

  1. **Phrase -> Kokoro.**  Each score word is phonemised on its own (espeak-ng through kokoro_onnx's
     tokenizer, with a few sung overrides: "la" is lah, unstressed "can" is k@n, the verbs in-SERT /
     ex-PORT, "a" is a schwa), the words are joined into one token string and Kokoro (voice af_heart)
     **speaks the whole phrase** as connected speech, at its natural speed.
  2. **Alignment.**  Kokoro v1.0 is a StyleTTS2 model: it predicts one duration per phoneme token
     (one unit = 600 samples at 24 kHz = 25 ms) and renders exactly that alignment.  A graph derived
     once from kokoro-v1.0.onnx (`.cache/kokoro/kokoro-ana.onnx`: the same model with the duration
     tensor as a second output) returns the audio *and* where every phoneme is, so no recogniser has to
     guess (the prototype used faster-whisper word timestamps; that is now only the judge).
     (Asking Kokoro itself for long vowels was tried and rejected: its prosody predictor invents dips in
     a stretched vowel, so "pen pal" came out "pen-in-and pal"; mean Whisper error 0.3 against 0.04.)
  3. **Layout.**  Target durations (5 ms frames) that put every vowel nucleus on its note: the onset
     consonants sit *before* the beat at their natural length (a singer's consonant), the vowel is held to
     the next syllable's consonants, the coda and the next word's onset sit at the end of the note, words
     inside a phrase run on (**legato**), a held note closes on its nasal / l for a moment ("pe-n", not
     "pe-in").  Multi-note words are split at their vowel nuclei, one nucleus per note; the score's `syl`
     count equals the nucleus count for every word in the song (a word with fewer nuclei than notes would
     sing a melisma on its last vowel).  Rests split phrases.
  4. **WORLD resynthesis.**  Harvest F0, CheapTrick envelope, D4C aperiodicity on the spoken phrase; a
     per-phoneme time map (consonants at natural speed or squeezed, vowels stretched in the middle with
     their first and last 30 ms untouched, so the formant transitions that make the consonants audible
     are kept); the F0 replaced by the melody: a step at each syllable's onset, smoothed (portamento), a
     small scoop into long notes, **late vibrato** (arrives after ~0.22 s, 5.2-5.6 Hz with a slow rate
     wobble, a matching +/-0.3 dB tremolo), a slow two-sine drift, a little jitter, a small fall at phrase
     ends.  Voicing comes from the phonemes (vowel cores always voiced, voiceless obstruents always
     unvoiced, the rest by Harvest).  The envelope is kept, so the formants stay where af_heart put them;
     only a **gentle formant lift** follows the pitch (8 % of the shift, in log frequency).
  5. Styles: `lead` (sung), `chant` (speech-singing: the written note plus 40 % of af_heart's own
     intonation, no vibrato, vowels held at most ~2.4x their spoken length so the rhythm stays spoken),
     `choir` / `gang` (sung, less vibrato; `arrangement()` stacks af_heart + af_bella + af_sky with
     detune, timing offsets and pan), `spoken` (her own pitch, words placed on their slots), `chop` (a
     short sung word).  Breaths before lead phrases after a rest: WORLD noise through the first vowel's
     envelope, 27 dB under it.

Cached in `.cache/sing_world/` (`take/`: Kokoro audio + durations + Harvest per phrase text and voice;
`phrase/`: the finished phrase per full input, including ENGINE).  Deterministic (onnxruntime on CPU,
WORLD; every random choice comes from a seeded generator).
"""
import hashlib
import json
import math
import os
import re
import sys

import numpy as np
import pyworld as pw
from scipy.ndimage import gaussian_filter1d
from scipy.signal import resample_poly

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
KDIR = os.path.join(ROOT, ".cache", "kokoro")
CACHE = os.path.join(ROOT, ".cache", "sing_world")
ENGINE = "sw-world-7"

KSR = 24000           # Kokoro sample rate
HOP = 600             # samples per Kokoro duration unit
FP = 5.0              # WORLD frame period (ms)
FPU = 5               # WORLD frames per Kokoro unit
FS = FP / 1000.0      # seconds per frame
SR = 48000            # output rate
STYLE_ROW = 64        # one style row per voice for the whole song (the timbre does not drift with phrase length)

# layout knobs, in 5 ms frames
LAY = dict(pad0=20, pad1=24, space=(5, 10), stop_max=20, cons_max=30, stress=(5, 15), first_onset_max=45,
           coda_son=0.18, coda_son_max=30, edge=6, min_vowel=0.4, lead=15)

VOWELS = set("aeiouɑɐɒæəɚɛɜɝɪʊʌɔᵻɨʉøœɤɯy")
STRESS = set("ˈˌ")
LONG = set("ːˑ")
PUNCT = set(",.!?;:")
STOPS = set("pbtdkgʔ")
VOICELESS = set("ptkfsʃθhxç")

# sung pronunciations (IPA as espeak writes it)
PRON = {
    "la": "lˈɑː",
    "can": "kən",
    "insert": "ɪnsˈɜːt",
    "export": "ɛkspˈɔːɹt",
    "a": "ə",
    "your": "jˈɔːɹ",
    "floppies": "flˈɑːpiz",
}

SUNG = ("lead", "choir", "gang", "chop")
SUNG_PRON = {}       # sung-only pronunciations
SUNG_SUBST = []      # sung-only phoneme substitutions
STYLES = {
    #          vibrato cents / onset s, portamento s, drift cents, speech intonation kept, vowel cap (x spoken), fall cents, scoop cents
    "lead":   dict(vib=24.0, vib_on=0.22, port=0.035, drift=4.0, inton=0.0, cap=None, fall=35.0, scoop=25.0, jit=3.0, cons=3.0),
    "choir":  dict(vib=16.0, vib_on=0.26, port=0.035, drift=5.0, inton=0.0, cap=None, fall=20.0, scoop=15.0, jit=3.0, cons=3.0),
    "gang":   dict(vib=0.0, vib_on=0.3, port=0.03, drift=4.0, inton=0.0, cap=None, fall=40.0, scoop=35.0, jit=4.0, cons=4.0),
    "chant":  dict(vib=0.0, vib_on=0.3, port=0.03, drift=3.0, inton=0.22, cap=2.4, fall=0.0, scoop=0.0, jit=2.0, cons=3.0),
    "chop":   dict(vib=0.0, vib_on=0.3, port=0.02, drift=0.0, inton=0.0, cap=None, fall=0.0, scoop=0.0, jit=0.0, cons=3.0),
    "spoken": dict(),
}


# ------------------------------------------------------------------------------------------------
# Kokoro
# ------------------------------------------------------------------------------------------------
_K = {}


def ensure_graph():
    """kokoro-v1.0.onnx with the per-token durations as a second output (derived once; needs `onnx`)."""
    src = os.path.join(KDIR, "kokoro-v1.0.onnx")
    ana = os.path.join(KDIR, "kokoro-ana.onnx")
    if os.path.exists(ana):
        return ana
    import onnx
    from onnx import TensorProto, helper
    m = onnx.load(src)
    names = {n.name for n in m.graph.node}
    assert "/encoder/CumSum" in names, "kokoro graph changed: the duration tensor was not found"
    m.graph.output.extend([helper.make_tensor_value_info("/encoder/Gather_output_0", TensorProto.INT64, None)])
    onnx.save(m, ana + ".tmp")
    os.replace(ana + ".tmp", ana)
    return ana


def kokoro():
    if "sess" not in _K:
        import onnxruntime as ort
        from kokoro_onnx.tokenizer import Tokenizer
        so = ort.SessionOptions()
        so.intra_op_num_threads = int(os.environ.get("SW_THREADS", "4"))
        so.inter_op_num_threads = 1
        so.log_severity_level = 3
        _K["sess"] = ort.InferenceSession(ensure_graph(), so, providers=["CPUExecutionProvider"])
        _K["voices"] = np.load(os.path.join(KDIR, "voices-v1.0.bin"))
        _K["tok"] = Tokenizer()
        _K["ph"] = {}
    return _K


def word_parts(text):
    """'(pen' -> ('pen', ''), 'pal.' -> ('pal', '.'), 'do!' -> ('do', '!')"""
    t = text.replace("(", "").replace(")", "").strip()
    m = re.match(r"^(.*?)([,.!?;:]*)$", t)
    core, p = m.group(1), m.group(2)
    return core, (p[-1] if p else "")


def phonemes(core):
    K = kokoro()
    key = core.lower()
    if key in PRON:
        return PRON[key]
    if key not in K["ph"]:
        K["ph"][key] = K["tok"].phonemize(core, "en-us").strip()
    return K["ph"][key]


def _hash(obj):
    return hashlib.sha1(json.dumps(obj, sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:24]


def speak(chars, voice, speed=1.0):
    """Kokoro says the token string -> (audio 24 kHz, durations in frames incl. both pads, Harvest F0)."""
    os.makedirs(os.path.join(CACHE, "take"), exist_ok=True)
    key = _hash(["speak1", voice, STYLE_ROW, "".join(chars), round(speed, 4)])
    path = os.path.join(CACHE, "take", key + ".npz")
    if os.path.exists(path):
        z = np.load(path)
        return z["a"].astype(np.float64), z["d"].astype(np.int64), z["f0"].astype(np.float64)
    K = kokoro()
    vocab = K["tok"].vocab
    ids = [vocab[c] for c in chars]
    style = K["voices"][voice][STYLE_ROW].astype(np.float32)
    a, d = K["sess"].run(None, {"tokens": np.array([[0, *ids, 0]], dtype=np.int64), "style": style,
                                "speed": np.array([speed], dtype=np.float32)})
    a = np.asarray(a, dtype=np.float64).ravel()
    d = np.asarray(d, dtype=np.int64).ravel() * FPU
    assert len(a) == d.sum() // FPU * HOP
    f0, _ = pw.harvest(a, KSR, f0_floor=65.0, f0_ceil=900.0, frame_period=FP)
    np.savez(path, a=a.astype(np.float32), d=d, f0=f0.astype(np.float32))
    return a, d, f0


# ------------------------------------------------------------------------------------------------
# tokens and layout
# ------------------------------------------------------------------------------------------------
def _cls(c):
    if c in VOWELS:
        return "V"
    if c in STRESS:
        return "S"
    if c in LONG:
        return "L"
    if c in PUNCT:
        return "P"
    if c == " ":
        return " "
    return "C"


def build_tokens(words, sung=False):
    """words: [{'w', 'notes'}] -> chars (' ' between words), per-char info, {word: [nucleus ids]}.

    info[k]: word, cls (V vowel, L length mark, S stress, C consonant, P punctuation, ' '), nuc (nucleus id
    for the stress mark before a vowel, the vowels and length marks of one syllable), flex (the vowel that
    is held), anchor (the char that starts on the note: the stress mark, else the vowel), role (onset/coda
    for consonants)."""
    vocab = kokoro()["tok"].vocab
    chars, info = [], []
    for wi, w in enumerate(words):
        core, punct = word_parts(w["w"])
        if wi:
            chars.append(" ")
            info.append(dict(word=wi, cls=" "))
        ph = phonemes(core)
        if sung:
            ph = SUNG_PRON.get(core.lower(), ph)
            for a_, b_ in SUNG_SUBST:
                ph = ph.replace(a_, b_)
        if sung and not any(c in STRESS for c in ph):
            # every sung word carries a stress (an unstressed "you" on a high C came out "yee")
            k = next((i for i, c in enumerate(ph) if c in VOWELS), None)
            if k is not None:
                ph = ph[:k] + "ˈ" + ph[k:]
        for c in ph:
            if c in vocab and c != " ":
                chars.append(c)
                info.append(dict(word=wi, cls=_cls(c)))
        if punct:
            chars.append(punct)
            info.append(dict(word=wi, cls="P"))
    n = len(chars)
    nuc = -1
    word_nuclei = {}
    i = 0
    while i < n:
        if info[i]["cls"] == "V":
            nuc += 1
            j = i
            while j < n and info[j]["cls"] in ("V", "L") and info[j]["word"] == info[i]["word"]:
                info[j]["nuc"] = nuc
                j += 1
            info[i]["flex"] = True
            a = i
            if i > 0 and info[i - 1]["cls"] == "S" and info[i - 1]["word"] == info[i]["word"]:
                info[i - 1]["nuc"] = nuc
                a = i - 1
            info[a]["anchor"] = True
            word_nuclei.setdefault(info[i]["word"], []).append(nuc)
            i = j
        else:
            i += 1
    for wi in range(len(words)):
        idx = [k for k in range(n) if info[k]["word"] == wi and info[k]["cls"] in ("C", "S") and info[k].get("nuc") is None]
        for k in idx:
            before = any(info[m].get("nuc") is not None and info[m]["word"] == wi for m in range(k))
            after = any(info[m].get("nuc") is not None and info[m]["word"] == wi for m in range(k + 1, n))
            info[k]["role"] = "coda" if (before and not after) else "onset"
        # a cluster of 3+ consonants between two nuclei gives its first consonant to the first syllable
        runs, cur = [], []
        for k in idx:
            if cur and k != cur[-1] + 1:
                runs.append(cur)
                cur = []
            cur.append(k)
        if cur:
            runs.append(cur)
        for run in runs:
            cons = [r for r in run if info[r]["cls"] == "C"]
            mid = any(info[m].get("nuc") is not None and info[m]["word"] == wi for m in range(run[0])) and \
                info[run[-1]]["role"] == "onset"
            if len(cons) >= 3 and mid:
                info[cons[0]]["role"] = "coda"
    return chars, info, word_nuclei


def layout(words, nat, style, end_clamp=None):
    """Target duration (frames) of every token so that each nucleus starts on its note.

    words: notes in seconds (relative to the phrase).  nat: natural durations in frames (incl. pads).
    Returns dict(dur (incl. pads), origin (s: time of frame 0), spans (per char, frames from origin),
    nuc_notes)."""
    chars, info, word_nuclei = build_tokens(words, sung=style in SUNG)
    n = len(chars)
    st = STYLES[style]
    natc = nat[1:-1].astype(float)
    nuc_notes = {}
    for wi, w in enumerate(words):
        nucs = word_nuclei.get(wi, [])
        notes = w["notes"]
        for k, nu in enumerate(nucs):
            nuc_notes[nu] = [notes[k]] if k < len(notes) else []
        if nucs and len(notes) > len(nucs):         # melisma on the last nucleus
            nuc_notes[nucs[-1]] = notes[len(nucs) - 1:]
    fr = lambda t: int(round(t / FS))
    anchors = [(k, fr(nuc_notes[info[k]["nuc"]][0][1])) for k in range(n)
               if info[k].get("anchor") and nuc_notes.get(info[k]["nuc"])]
    last = words[-1]["notes"][-1]
    t_end = last[1] + last[2]
    if end_clamp is not None:
        t_end = min(t_end, end_clamp)
    f_end = fr(t_end)
    dur = np.zeros(n)

    def want_of(k, total):
        c = info[k]["cls"]
        if c == "S":
            return float(np.clip(natc[k], *LAY["stress"]))
        if c == "P":
            return 0.0
        if c == " ":
            return float(np.clip(natc[k], *LAY["space"]))
        if c == "L":
            return float(min(natc[k], 5))
        if c == "V":     # a diphthong's glide or a second vowel: short, at the end of the note
            return float(np.clip(natc[k] * 1.2, 8, 25))
        top = LAY["stop_max"] if chars[k] in STOPS else LAY["cons_max"]
        w = float(np.clip(natc[k], 5, top))
        if info[k].get("role") == "coda" and chars[k] in "nmŋl" and total >= 50:
            w = float(np.clip(LAY["coda_son"] * total, w, LAY["coda_son_max"]))   # pe-n, not pe-in
        return w

    def fill(lo, hi, total, final=False):
        ks = list(range(lo, hi))
        flex = [k for k in ks if info[k].get("flex")]
        fixed = [k for k in ks if not info[k].get("flex")]
        want = {k: want_of(k, total) for k in fixed}
        if not flex:
            s = sum(want.values())
            for k in fixed:
                dur[k] = want[k] * (total / s if s > 0 else 0)
            return
        nu = info[flex[0]]["nuc"]
        tails = [k for k in fixed if info[k].get("nuc") == nu and info[k]["cls"] in ("V", "L")]
        cons = [k for k in fixed if k not in tails]
        min_v = max(5.0, LAY["min_vowel"] * total) if total >= 15 else max(2.0, 0.5 * total)
        room = total - min_v
        s_c, s_t = sum(want[k] for k in cons), sum(want[k] for k in tails)
        if s_c + s_t > room:
            # squeeze the glides first, then the consonants (each keeps at least 3 frames)
            for k in tails:
                want[k] = max(3.0, want[k] * 0.5)
            s_t = sum(want[k] for k in tails)
            room_c = max(3.0 * len(cons), room - s_t)
            if s_c > room_c:
                sc = room_c / s_c
                for k in cons:
                    if want[k] > 0:
                        want[k] = max(3.0 if info[k]["cls"] == "C" else 0.0, want[k] * sc)
        for k in fixed:
            dur[k] = want[k]
        v = total - sum(want[k] for k in fixed)
        if st.get("cap") and v > 0:
            capv = max(st["cap"] * (natc[flex[0]] + sum(natc[k] for k in tails)), 30.0) - sum(want[k] for k in tails)
            if v > capv:
                # speech-singing: the rest of the note is a pause after the word (on the word gap)
                extra = v - capv
                gaps = [k for k in ks if info[k]["cls"] == " "]
                if gaps:
                    dur[gaps[0]] += extra
                    v = capv
                elif final:
                    v = capv
        dur[flex[0]] = max(2.0, v)

    first_k, first_f = anchors[0]
    pre = list(range(first_k))
    s = sum(want_of(k, 0) for k in pre)
    sc = min(1.0, LAY["first_onset_max"] / s) if s > 0 else 0
    for k in pre:
        dur[k] = want_of(k, 0) * sc
    for (k0, f0_), (k1, f1_) in zip(anchors, anchors[1:]):
        fill(k0, k1, float(f1_ - f0_))
    kL, fL = anchors[-1]
    fill(kL, n, float(max(10, f_end - fL)), final=True)
    # integers, anchors exact: each region's rounding error goes to its held vowel
    di = np.round(dur).astype(np.int64)
    flex_of = {}
    for (k0, _), k1 in zip(anchors, [k for k, _ in anchors[1:]] + [n]):
        fl = [k for k in range(k0, k1) if info[k].get("flex")]
        flex_of[k0] = fl[0] if fl else k0
    for (k0, f0_), (k1, f1_) in zip(anchors, anchors[1:]):
        di[flex_of[k0]] += (f1_ - f0_) - int(di[k0:k1].sum())
        if di[flex_of[k0]] < 2:
            short = 2 - di[flex_of[k0]]
            di[flex_of[k0]] = 2
            for k in range(k1 - 1, k0, -1):
                take = min(short, max(0, int(di[k]) - 3))
                di[k] -= take
                short -= take
                if not short:
                    break
    if not st.get("cap"):
        di[flex_of[kL]] += max(10, f_end - fL) - int(di[kL:].sum())
    di = np.maximum(di, 0)
    di[flex_of[kL]] = max(2, di[flex_of[kL]])
    pad0 = LAY["pad0"]
    origin_f = first_f - pad0 - int(di[:first_k].sum())
    full = np.concatenate([[pad0], di, [LAY["pad1"]]]).astype(np.int64)
    spans, f = [], pad0
    for k in range(n):
        spans.append((f, f + int(di[k])))
        f += int(di[k])
    return dict(chars=chars, info=info, dur=full, origin=origin_f * FS, spans=spans, nuc_notes=nuc_notes)


def layout_spoken(words, nat):
    """Speech on its slots: each word starts at its first note, at natural speed unless its slot is too
    short; the rest of the slot is a pause on the word gap."""
    chars, info, _ = build_tokens(words)
    n = len(chars)
    natc = nat[1:-1].astype(float)
    di = np.zeros(n)
    fr = lambda t: int(round(t / FS))
    starts = [fr(w["notes"][0][1]) for w in words]
    ends = starts[1:] + [fr(words[-1]["notes"][-1][1] + words[-1]["notes"][-1][2])]
    for wi in range(len(words)):
        ks = [k for k in range(n) if info[k]["word"] == wi and info[k]["cls"] != " "]
        want = np.array([0.0 if info[k]["cls"] == "P" else natc[k] for k in ks])
        slot = ends[wi] - starts[wi]
        sc = min(1.05, (slot - 5) / want.sum()) if want.sum() > 0 else 1.0
        for j, k in enumerate(ks):
            di[k] = want[j] * sc
        gap = [k for k in range(n) if info[k]["word"] == wi + 1 and info[k]["cls"] == " "]
        if gap:
            di[gap[0]] = max(0.0, slot - sum(di[k] for k in ks))
    di = np.round(di).astype(np.int64)
    pad0 = LAY["pad0"]
    full = np.concatenate([[pad0], di, [LAY["pad1"]]]).astype(np.int64)
    spans, f = [], pad0
    for k in range(n):
        spans.append((f, f + int(di[k])))
        f += int(di[k])
    return dict(chars=chars, info=info, dur=full, origin=(starts[0] - pad0) * FS, spans=spans, nuc_notes={})


def align(nat, f0):
    """Where the phonemes really are.  Kokoro's audio runs ahead of its own duration tensor: about three
    units (15 frames) at the start of a phrase, as kokoro's own timestamp code assumes.  Measured on
    this song (voicing against vowel / voiceless-consonant labels, fricative onsets), the lead is 50-110
    ms and varies; a constant LAY['lead'] = 15 frames sang best (mean Whisper error 0.065 on 44 test
    phrases, against 0.088 at 19 frames and 0.28 with no shift; a segmental Viterbi re-alignment on
    energy / voicing / high-frequency features scored 0.18 and was dropped)."""
    prior = np.asarray(nat, dtype=np.int64).copy()
    sh = min(LAY["lead"], int(prior[0]) - 2)
    prior[0] -= sh
    prior[-1] += len(f0) - int(prior.sum())
    return prior


def time_map(nat, new, info):
    """For every output frame, the (fractional) natural frame it reads.  Vowels that are stretched keep
    their first and last `edge` frames at natural speed (the consonant transitions) and stretch the
    middle; everything else is mapped linearly."""
    cn = np.concatenate([[0], np.cumsum(nat)])
    cw = np.concatenate([[0], np.cumsum(new)])
    src = np.zeros(int(cw[-1]))
    for k in range(len(nat)):
        a0, a1, b0, b1 = cn[k], cn[k + 1], cw[k], cw[k + 1]
        ol, nl = b1 - b0, a1 - a0
        if ol <= 0:
            continue
        o = np.arange(ol, dtype=float)
        is_v = 0 < k <= len(info) and info[k - 1]["cls"] == "V"
        if k == 0:                     # leading silence: natural speed up to the first phoneme
            s = np.maximum(a0, a1 - (ol - o))
        elif k == len(nat) - 1:        # trailing silence: natural speed after the last phoneme
            s = np.minimum(a1 - 1, a0 + o)
        elif is_v and ol > nl and nl >= 6:
            e = min(LAY["edge"], nl // 3)
            mid_n = nl - 2 * e
            mid_o = ol - 2 * e
            s = np.where(o < e, a0 + o,
                         np.where(o >= ol - e, a1 - (ol - o),
                                  a0 + e + (o - e) * (max(mid_n - 1, 0) / max(mid_o - 1, 1))))
        else:
            s = a0 + (o + 0.5) * (nl / ol) - 0.5
        src[b0:b1] = s
    return np.clip(src, 0, cn[-1] - 1)


# ------------------------------------------------------------------------------------------------
# the melody
# ------------------------------------------------------------------------------------------------
def _rng(*seed):
    h = 1469598103934665603
    for s in seed:
        for ch in str(s).encode():
            h = ((h ^ ch) * 1099511628211) & 0xFFFFFFFFFFFFFFFF
    return np.random.default_rng(h)


def melody(L, nfr, style, seed, detune, src_f0):
    """Target F0 (Hz) per frame, tremolo (linear gain), the voicing the phonemes impose, the base pitch."""
    st = STYLES[style]
    info, spans, n = L["info"], L["spans"], len(L["info"])
    rr = _rng(seed, "melody")
    events = []
    for nu, notes in sorted(L["nuc_notes"].items()):
        if not notes:
            continue
        ks = [k for k in range(n) if info[k].get("nuc") == nu]
        k0 = ks[0]
        j = k0 - 1
        while j >= 0 and info[j]["cls"] in ("C", "S") and info[j].get("role") == "onset" and info[j]["word"] == info[k0]["word"]:
            j -= 1
        f_change = spans[j + 1][0]
        if j + 1 == k0:                        # vowel-initial: glide a little after the note starts
            f_change += 4
        events.append((f_change, notes[0][0]))
        for m, t, d in notes[1:]:              # melisma: change inside the vowel, a touch late
            events.append((int(round((t - L["origin"]) / FS)) + 3, m))
    events.sort()
    midi = np.full(nfr, float(events[0][1]))
    for f, m in events:
        midi[max(0, f):] = m
    base = gaussian_filter1d(midi, st["port"] / FS / 2.5, mode="nearest")
    orn = np.zeros(nfr)
    vib = np.zeros(nfr)
    for nu, notes in sorted(L["nuc_notes"].items()):
        if not notes:
            continue
        ks = [k for k in range(n) if info[k].get("nuc") == nu and info[k]["cls"] in ("V", "L")]
        f0_, f1_ = spans[ks[0]][0], spans[ks[-1]][1]
        vlen = (f1_ - f0_) * FS
        if st.get("scoop") and vlen >= 0.3:
            k = np.arange(nfr) - f0_
            m = (k >= 0) & (k < 24)
            orn[m] -= st["scoop"] / 100.0 * np.exp(-k[m] / 8.0)
        if st.get("vib") and vlen >= 0.34:
            k = np.arange(f0_, min(f1_, nfr))
            tt = (k - f0_) * FS
            on = min(st["vib_on"], 0.4 * vlen)
            env = np.clip((tt - on) / 0.22, 0, 1) ** 1.5 * np.clip((vlen - tt) / 0.06, 0, 1)
            rate = rr.uniform(5.2, 5.6) + 0.25 * np.sin(2 * np.pi * 0.7 * tt + rr.uniform(0, 6.28))
            ph = 2 * np.pi * np.cumsum(rate) * FS + rr.uniform(0, 6.28)
            depth = st["vib"] * (1.0 + 0.15 * np.sin(2 * np.pi * 0.9 * tt))
            vib[k] = env * depth * np.sin(ph) / 100.0
    if st.get("fall") and L["nuc_notes"]:
        last = max(L["nuc_notes"])
        ks = [k for k in range(n) if info[k].get("nuc") == last and info[k]["cls"] in ("V", "L")]
        if ks:
            f1_ = spans[ks[-1]][1]
            w = 14
            k = np.arange(max(0, f1_ - w), min(nfr, f1_ + 4))
            orn[k] -= st["fall"] / 100.0 * np.clip((k - (f1_ - w)) / w, 0, 1) ** 2
    tt = np.arange(nfr) * FS
    dr = rr.uniform(0, 6.28, 2)
    drift = st.get("drift", 0) / 100.0 * (0.6 * np.sin(2 * np.pi * 0.37 * tt + dr[0]) + 0.4 * np.sin(2 * np.pi * 0.83 * tt + dr[1]))
    jit = gaussian_filter1d(rr.standard_normal(nfr), 2.0)
    jit = st.get("jit", 0) / 100.0 * jit / (np.std(jit) + 1e-9)
    inton = np.zeros(nfr)
    if st.get("inton"):
        v = src_f0 > 0
        if v.sum() > 10:
            sm = 12 * np.log2(np.maximum(src_f0, 1) / 440.0) + 69
            idx = np.arange(nfr)
            filled = gaussian_filter1d(np.interp(idx, idx[v], sm[v]), 6.0)
            inton = st["inton"] * np.clip(filled - np.median(sm[v]), -2.5, 2.5)
    target = base + orn + vib + drift + jit + inton + detune / 100.0
    trem = 10 ** (0.3 * (vib / max(st.get("vib", 1) / 100.0, 1e-6)) / 20.0) if st.get("vib") else np.ones(nfr)
    force_v = np.zeros(nfr, bool)
    force_u = np.zeros(nfr, bool)
    for k in range(n):
        a, b = spans[k]
        if info[k]["cls"] in ("V", "L"):
            force_v[max(0, a + 2):max(0, b - 2)] = True
        elif info[k]["cls"] == "C" and L["chars"][k] in VOICELESS:
            force_u[max(0, a + 2):max(0, b - 2)] = True
    return 440.0 * 2 ** ((target - 69) / 12.0), trem, force_v, force_u, base


def _key(spec, rel):
    st = spec["style"]
    return _hash([ENGINE, spec["voice"], st, rel, spec.get("seed", ""), round(spec.get("detune", 0.0), 3),
                  spec.get("end_clamp_rel"), spec.get("speed", 1.0), spec.get("breath", 0.0),
                  STYLES.get(st), LAY, PRON, SUNG_PRON, SUNG_SUBST])


def sing_phrase(spec):
    """spec: {voice, style, words (notes [midi, t s, dur s]), seed, detune, end_clamp, speed, breath}
    -> (y mono float64 48 kHz, t0 = time of y[0] in seconds, meta {nuclei: [[t0, t1, notes]]})"""
    style = spec["style"]
    words = spec["words"]
    t_ref = words[0]["notes"][0][1]
    rel = [{"w": w["w"], "notes": [[m, round(t - t_ref, 4), d] for m, t, d in w["notes"]]} for w in words]
    if spec.get("end_clamp") is not None:
        spec = dict(spec, end_clamp_rel=round(spec["end_clamp"] - t_ref, 4))
    key = _key(spec, rel)
    os.makedirs(os.path.join(CACHE, "phrase"), exist_ok=True)
    path = os.path.join(CACHE, "phrase", key + ".npz")
    if os.path.exists(path):
        z = np.load(path)
        meta = json.loads(str(z["meta"]))
        return z["y"].astype(np.float64), float(z["t0"]) + t_ref, _abs_meta(meta, t_ref)
    chars, info, _ = build_tokens(rel, sung=style in SUNG)
    a, nat, f0n = speak(chars, spec["voice"], spec.get("speed", 1.0))
    if style == "spoken":
        L = layout_spoken(rel, nat)
    else:
        L = layout(rel, nat, style, spec.get("end_clamp_rel"))
    nf_nat = len(f0n)
    nat = align(nat, f0n)
    src = time_map(nat, L["dur"], info)
    nfr = len(src)
    tax = np.arange(nf_nat) * FS
    fa = f0n.copy()
    # WORLD analysis of the spoken phrase (vowel gaps in Harvest filled, so D4C sees them as voiced)
    vnat = np.zeros(nf_nat, bool)
    cn = np.concatenate([[0], np.cumsum(nat)])
    for k in range(len(info)):
        if info[k]["cls"] in ("V", "L"):
            vnat[cn[k + 1] + 1:cn[k + 2] - 1] = True
        elif info[k]["cls"] == "C" and chars[k] in VOICELESS and style != "spoken":
            fa[cn[k + 1] + 2:cn[k + 2] - 2] = 0.0
    v = fa > 0
    if v.sum() >= 2:
        idx = np.arange(nf_nat)
        fa = np.where(vnat & ~v, np.interp(idx, idx[v], fa[v]), fa)
    sp = pw.cheaptrick(a, fa, tax, KSR)
    ap = pw.d4c(a, fa, tax, KSR)
    i0 = np.floor(src).astype(int)
    w1 = src - i0
    i1 = np.minimum(i0 + 1, nf_nat - 1)
    lsp = np.log(sp + 1e-16)
    osp = np.exp(lsp[i0] * (1 - w1)[:, None] + lsp[i1] * w1[:, None])
    oap = ap[i0] * (1 - w1)[:, None] + ap[i1] * w1[:, None]
    fsrc = np.where((fa[i0] > 0) & (fa[i1] > 0), fa[i0] * (1 - w1) + fa[i1] * w1, np.where(w1 < 0.5, fa[i0], fa[i1]))
    meta = {"nuclei": []}
    if style == "spoken":
        out_f0 = fsrc
        gain = np.ones(nfr)
    else:
        tgt, gain, force_v, force_u, base = melody(L, nfr, style, spec.get("seed", ""), spec.get("detune", 0.0), fsrc)
        voiced = (fsrc > 0) | force_v
        voiced &= ~force_u
        out_f0 = np.where(voiced, tgt, 0.0)
        # gentle formant lift with the pitch: 8 % of the shift (log frequency)
        ok = fsrc > 0
        if ok.sum() > 2:
            idx = np.arange(nfr)
            src_m = gaussian_filter1d(np.interp(idx, idx[ok], 12 * np.log2(fsrc[ok] / 440.0) + 69), 16.0)
            alpha = 2 ** (0.08 * np.clip(base - src_m, -12, 24) / 12.0)
            fb = osp.shape[1]
            bins = np.arange(fb, dtype=float)
            for i in np.nonzero(voiced & (np.abs(alpha - 1) > 0.004))[0]:
                osp[i] = np.exp(np.interp(bins / alpha[i], bins, np.log(osp[i] + 1e-16)))
        for nu, notes in sorted(L["nuc_notes"].items()):
            ks = [k for k in range(len(info)) if info[k].get("nuc") == nu and info[k]["cls"] in ("V", "L")]
            if notes and ks:
                meta["nuclei"].append([L["origin"] + L["spans"][ks[0]][0] * FS, L["origin"] + L["spans"][ks[-1]][1] * FS,
                                       [list(x) for x in notes]])
    # diction: onset consonants (and codas, a little less) a few dB up against the vowels
    if STYLES.get(style, {}).get("cons"):
        cg = np.zeros(nfr)
        for k in range(len(info)):
            if info[k]["cls"] == "C":
                a_, b_ = L["spans"][k]
                cg[max(0, a_ - 1):b_ + 1] = STYLES[style]["cons"] * (1.0 if info[k].get("role") == "onset" else 0.7)
        cg = gaussian_filter1d(cg, 1.0)
        gain = gain * 10 ** (cg / 20.0)
    osp *= (gain ** 2)[:, None]
    y24 = np.asarray(pw.synthesize(np.ascontiguousarray(out_f0), np.ascontiguousarray(osp), np.ascontiguousarray(oap), KSR, FP))
    # silence outside the phrase (the pads), soft edges
    on = int((L["spans"][0][0]) * FS * KSR) - int(0.01 * KSR)
    off = int(L["spans"][-1][1] * FS * KSR) + int(0.04 * KSR)
    env = np.zeros(len(y24))
    on, off = max(0, on), min(len(y24), off)
    env[on:off] = 1.0
    r = int(0.006 * KSR)
    env[on:on + r] *= np.linspace(0, 1, min(r, off - on))
    r2 = int(0.03 * KSR)
    env[max(on, off - r2):off] *= np.linspace(1, 0, off - max(on, off - r2))
    y24 *= env
    # level: the vowels at -20 dBFS RMS
    core = []
    for k in range(len(info)):
        if info[k]["cls"] in ("V", "L"):
            a0, a1 = int(L["spans"][k][0] * FS * KSR), int(L["spans"][k][1] * FS * KSR)
            core.append(y24[a0:a1])
    core = np.concatenate(core) if core else y24
    y24 *= 0.1 / math.sqrt(float(np.mean(core ** 2)) + 1e-12)
    y = resample_poly(y24, 2, 1)
    t0 = L["origin"]
    if spec.get("breath"):
        br = breath(y24, L, spec["breath"], spec.get("seed", ""))
        if br is not None:
            yb, tb = br
            pre = int(round((t0 - tb) * SR))
            if pre > 0:
                y = np.concatenate([np.zeros(pre), y])
                t0 = tb
            k0 = int(round((tb - t0) * SR))
            y[k0:k0 + len(yb)] += yb[:max(0, len(y) - k0)]
    np.savez(path, y=y.astype(np.float32), t0=np.float64(t0), meta=json.dumps(meta))
    return y, t0 + t_ref, _abs_meta(meta, t_ref)


def _abs_meta(meta, t_ref):
    return {"nuclei": [[a + t_ref, b + t_ref, [[m, t + t_ref, d] for m, t, d in nn]] for a, b, nn in meta["nuclei"]]}


def breath(y24, L, length, seed):
    """A soft inhale before the phrase: WORLD noise through the first vowel's envelope, airier."""
    ks = [k for k in range(len(L["info"])) if L["info"][k]["cls"] == "V"]
    if not ks:
        return None
    a0, a1 = int(L["spans"][ks[0]][0] * FS * KSR), int(L["spans"][ks[0]][1] * FS * KSR)
    seg = y24[a0:max(a1, a0 + 1200)]
    if len(seg) < 600:
        return None
    nf = len(seg) // int(FS * KSR) + 1
    env_sp = np.mean(pw.cheaptrick(seg, np.zeros(nf), np.arange(nf) * FS, KSR), axis=0)
    nfr = int(length / FS)
    fr = np.linspace(0, KSR / 2, len(env_sp))
    tilt = np.clip(fr / 2500.0, 0.15, 1.6) ** 1.2
    nb = pw.synthesize(np.zeros(nfr), np.tile(env_sp * tilt, (nfr, 1)), np.ones((nfr, len(env_sp))), KSR, FP)
    tt = np.linspace(0, 1, len(nb))
    nb *= np.where(tt < 0.7, np.sin(np.pi / 2 * tt / 0.7) ** 2, np.cos(np.pi / 2 * (tt - 0.7) / 0.3) ** 2)
    rms_v = math.sqrt(float(np.mean(seg ** 2)) + 1e-12)
    nb *= rms_v * 10 ** (-27 / 20) / (math.sqrt(float(np.mean(nb ** 2))) + 1e-12)
    tb = L["origin"] + L["spans"][0][0] * FS - 0.03 - length       # ends 30 ms before the first onset
    return resample_poly(nb, 2, 1), tb


# ------------------------------------------------------------------------------------------------
# the score's vocal arrangement
# ------------------------------------------------------------------------------------------------
ROLE_DB = {"harmony": -7.0, "echo": -2.0, "gang": -1.0, "call": -2.0, "lala": -3.0}   # per choir voice (three stack)
CHOIR = [  # voice, detune cents, delay s, pan, gain dB, Kokoro speed (a different take of the consonants)
    ("af_heart", 0.0, 0.000, 0.0, 0.0, 1.0),
    ("af_bella", 7.0, 0.012, -0.55, -1.0, 1.06),
    ("af_sky", -6.0, -0.009, 0.55, -1.5, 0.95),
]


def _sec_words(L, spb):
    return [{"w": w["w"], "notes": [[n[0], n[1] * spb, n[2] * spb] for n in w["notes"]]}
            for w in L["words"] if not w.get("silent")]


def _end(w):
    return w["notes"][-1][1] + w["notes"][-1][2]


def phrases(track_lines, spb):
    """Lines -> phrases: split at rests (> 50 ms), joined across lines that run on without a rest unless
    the earlier line ends a sentence; a phrase that runs straight into the next stops 0.1 s early."""
    groups = []
    for L in track_lines:
        cur = []
        for w in _sec_words(L, spb):
            if cur and w["notes"][0][1] - _end(cur[-1]) > 0.05:
                groups.append({"words": cur, "lines": [L["id"]]})
                cur = []
            cur.append(w)
        if not cur:
            continue
        if groups and groups[-1]["lines"][-1] != L["id"]:
            prev = groups[-1]
            if abs(cur[0]["notes"][0][1] - _end(prev["words"][-1])) < 0.05 and word_parts(prev["words"][-1]["w"])[1] not in ".!?":
                prev["words"] += cur
                prev["lines"].append(L["id"])
                continue
        groups.append({"words": cur, "lines": [L["id"]]})
    for i, g in enumerate(groups):
        if i + 1 < len(groups):
            h = groups[i + 1]
            if h["words"][0]["notes"][0][1] - _end(g["words"][-1]) < 0.05:
                g["end_clamp"] = h["words"][0]["notes"][0][1] - 0.1
        g["rest"] = g["words"][0]["notes"][0][1] - (_end(groups[i - 1]["words"][-1]) if i else 0.0)
    return groups


def arrangement(score):
    """Every phrase the guide sings: [{track, voice, style, words, lines, gain_db, pan, delay, detune, seed, ...}]"""
    spb = 60.0 / score["bpm"]
    lines = sorted(score["lines"], key=lambda L: L["words"][0]["notes"][0][1])
    out = []
    for g in phrases([L for L in lines if L["voice"] == "lead"], spb):
        out.append(dict(track="lead", voice="af_heart", style="lead", words=g["words"], lines=g["lines"],
                        seed="lead:" + g["lines"][0], end_clamp=g.get("end_clamp"),
                        breath=round(min(0.3, 0.45 * g["rest"]), 3) if g["rest"] >= 0.45 else 0.0))
    for g in phrases([L for L in lines if L["voice"] == "chant"], spb):
        out.append(dict(track="chant", voice="af_heart", style="chant", words=g["words"], lines=g["lines"],
                        seed="chant:" + g["lines"][0], end_clamp=g.get("end_clamp")))
    for L in lines:
        if L["voice"] == "spoken":
            out.append(dict(track="spoken", voice="af_heart", style="spoken", words=_sec_words(L, spb), lines=[L["id"]],
                            seed="spoken:" + L["id"]))
    by_role = {}
    for L in lines:
        if L["voice"] == "choir":
            by_role.setdefault(L.get("role", "harmony"), []).append(L)
    for role, ls in sorted(by_role.items()):
        style = "gang" if role in ("gang", "call") else "choir"
        for g in phrases(ls, spb):
            for v, det, dl, pn, gd, spd in CHOIR:
                out.append(dict(track="choir", voice=v, style=style, words=g["words"], lines=g["lines"], role=role,
                                gain_db=gd + ROLE_DB.get(role, -3.0), pan=pn, delay=dl, detune=det, speed=spd,
                                seed="%s:%s:%s" % (role, g["lines"][0], v), end_clamp=g.get("end_clamp")))
    for m, b, d, w in score["parts"]["chops"]["events"]:
        out.append(dict(track="chops", voice="af_heart", style="chop", words=[{"w": w, "notes": [[m, b * spb, d * spb]]}],
                        lines=[], seed="chop", pan=-0.25 if w == "pen" else 0.25))
    return out


def _work(spec):
    try:
        y, t0, meta = sing_phrase(spec)
        return y.astype(np.float32), t0, meta
    except Exception as ex:
        raise RuntimeError("phrase %s (%s) failed: %r" % (spec.get("lines"), spec.get("voice"), ex))


def _init_worker():
    os.environ["SW_THREADS"] = "1"


def render(score, total_s, workers=4, progress=True):
    """Every vocal track as a 48 kHz stereo float64 array total_s long, + per-phrase metadata."""
    specs = arrangement(score)
    ensure_graph()
    results = [None] * len(specs)

    def note(k):
        if progress and (k % 25 == 0 or k == len(specs) - 1):
            print("  sing_world: %d / %d phrases" % (k + 1, len(specs)), file=sys.stderr, flush=True)
    if workers > 1:
        import multiprocessing as mp
        with mp.get_context("fork").Pool(workers, initializer=_init_worker) as pool:
            for k, res in enumerate(pool.imap(_work, specs, chunksize=1)):
                results[k] = res
                note(k)
    else:
        for k, s in enumerate(specs):
            results[k] = _work(s)
            note(k)
    n = int(round(total_s * SR))
    tracks, metas = {}, []
    for spec, (y, t0, meta) in zip(specs, results):
        tr = tracks.setdefault(spec["track"], np.zeros((n, 2)))
        g = 10 ** (spec.get("gain_db", 0.0) / 20.0)
        a = (spec.get("pan", 0.0) + 1.0) * math.pi / 4.0
        gl, gr = math.cos(a) * math.sqrt(2) * g, math.sin(a) * math.sqrt(2) * g
        i0 = int(round((t0 + spec.get("delay", 0.0)) * SR))
        y = y.astype(np.float64)
        if i0 < 0:
            y, i0 = y[-i0:], 0
        k = min(len(y), n - i0)
        if k > 0:
            tr[i0:i0 + k, 0] += y[:k] * gl
            tr[i0:i0 + k, 1] += y[:k] * gr
        metas.append(dict(track=spec["track"], voice=spec["voice"], style=spec["style"], lines=spec["lines"],
                          role=spec.get("role"), t0=t0, delay=spec.get("delay", 0.0), detune=spec.get("detune", 0.0),
                          nuclei=meta["nuclei"]))
    return tracks, metas
