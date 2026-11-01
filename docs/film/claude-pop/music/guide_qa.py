"""guide_qa.py: measurements of the ACE-Step guide (we cannot listen, so we measure).

    python3 -I music/guide_qa.py            # measure the existing build/guide*.wav

  * length against DUR; integrated loudness (pyloudnorm), true peak (4x oversampled), sample peak,
    per-section loudness
  * Whisper (faster_whisper small.en, beam 5, temperature 0, no conditioning, no VAD) on every
    data.js line, its window +-0.15 s, on build/guide_vocals.wav and on build/guide.wav; word error
    rate after normalising numbers ("88" = "eighty eight", "oh" = "zero"), "pen-pal" = "pen pal" and the
    one homophone set the ear cannot split (to / too / two)
  * pitch: every sung note of every phrase (the isolated sing_world render, so the stacked choir does
    not confuse the tracker), WORLD Harvest over the steady middle of the note's vowel (30-80 %),
    median cents against the written note (+ the voice's intended detune)
  * drum onsets on the isolated GM drum tracks against data.js EVENTS
  * the silence window: the band's level inside parts.silence
"""
import json
import os
import re
import sys

import numpy as np
import soundfile as sf
from scipy.signal import resample_poly

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.dont_write_bytecode = True

import qa                     # noqa: E402
import sing_world as SW       # noqa: E402
from dsp import SR, db, lufs, n_of, true_peak   # noqa: E402

ROOT = os.path.dirname(HERE)
BUILD = os.path.join(ROOT, "build")

ONES = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen " \
       "seventeen eighteen nineteen".split()
TENS = "_ _ twenty thirty forty fifty sixty seventy eighty ninety".split()
HOMOPHONES = {"to": "two", "too": "two"}


def _n2w(n):
    if n < 20:
        return ONES[n]
    t, o = divmod(n, 10)
    return TENS[t] + ("" if o == 0 else " " + ONES[o])


def norm(t):
    t = t.lower().replace("-", " ").replace("’", "'")

    def num(g):
        if len(g) <= 2 and not g.startswith("0"):
            return _n2w(int(g))
        if len(g) == 4 and not g.startswith("0"):
            hi, lo = g[:2], g[2:]
            return _n2w(int(hi)) + " " + (("zero " + ONES[int(lo[1])]) if lo.startswith("0") and lo != "00" else _n2w(int(lo)))
        return " ".join(ONES[int(c)] for c in g)
    t = re.sub(r"(\d+)", lambda m: num(m.group(1)), t)
    t = re.sub(r"[^a-z' ]", " ", t).replace("penpal", "pen pal")
    return [HOMOPHONES.get("zero" if x in ("oh", "o") else x, "zero" if x in ("oh", "o") else x) for x in t.split()]


def wer(ref, hyp):
    r, h = norm(ref), norm(hyp)
    d = np.zeros((len(r) + 1, len(h) + 1), int)
    d[:, 0] = range(len(r) + 1)
    d[0, :] = range(len(h) + 1)
    for i in range(1, len(r) + 1):
        for j in range(1, len(h) + 1):
            d[i, j] = min(d[i - 1, j] + 1, d[i, j - 1] + 1, d[i - 1, j - 1] + (r[i - 1] != h[j - 1]))
    return d[-1, -1] / max(1, len(r))


def read_lyrics(path):
    s = open(path).read()
    i = s.index("const LYRICS = ") + len("const LYRICS = ")
    j = s.index("\n];", i) + 2
    return json.loads(re.sub(r",\s*\]", "]", s[i:j]))


_M = {}


def whisper_model():
    if "m" not in _M:
        from faster_whisper import WhisperModel
        _M["m"] = WhisperModel("small.en", device="cpu", compute_type="int8", cpu_threads=4)
    return _M["m"]


def transcribe(x):
    x = np.asarray(x, dtype=np.float64)
    if x.ndim > 1:
        x = x.mean(axis=1)
    a = np.ascontiguousarray(resample_poly(x, 1, 3)).astype(np.float32)
    segs, _ = whisper_model().transcribe(a, language="en", beam_size=5, temperature=0.0,
                                         condition_on_previous_text=False, vad_filter=False, max_new_tokens=48)
    return " ".join(s.text.strip() for s in segs)


def whisper_lines(lyrics, sources, margin=0.15, log=print):
    out = []
    for L in lyrics:
        a, b = max(0.0, L["start"] - margin), L["end"] + margin
        text = " ".join(w["w"] for w in L["words"] if not w.get("silent"))
        r = {"id": L["id"], "voice": L["voice"], "role": L.get("role"), "t": L["start"], "text": text}
        for name, x in sources.items():
            h = transcribe(x[n_of(a):n_of(b)])
            r[name + "_heard"] = h
            r[name] = round(wer(text, h), 3)
        out.append(r)
    return out


def _stats(rows, key):
    v = np.array([r[key] for r in rows])
    return {"n": int(len(v)), "mean": round(float(v.mean()), 3), "median": round(float(np.median(v)), 3),
            "exact": int((v == 0).sum()), "over_0.34": int((v > 0.34).sum())}


def pitch_report(S):
    """Every sung note, measured on its isolated phrase render."""
    import pyworld as pw
    res = {}
    worst = []
    for spec in SW.arrangement(S):
        if spec["style"] == "spoken":
            continue
        y, t0, meta = SW.sing_phrase(spec)
        x = resample_poly(y, 1, 3).astype(np.float64)
        f0, _ = pw.harvest(x, 16000, f0_floor=70.0, f0_ceil=1100.0, frame_period=5.0)
        key = spec["style"] if spec["track"] != "choir" else "choir:" + spec.get("role", "")
        for a, b, notes in meta["nuclei"]:
            for m, t, d in notes:
                s0, s1 = max(a, t), min(b, t + d)
                if s1 - s0 < 0.08:
                    continue
                w0, w1 = s0 + 0.3 * (s1 - s0), s0 + 0.8 * (s1 - s0)
                seg = f0[int((w0 - t0) / 0.005):int((w1 - t0) / 0.005)]
                seg = seg[seg > 0]
                if len(seg) < 3:
                    continue
                c = 1200 * np.log2(np.median(seg) / (440.0 * 2 ** ((m - 69) / 12.0))) - spec.get("detune", 0.0)
                res.setdefault(key, []).append(c)
                worst.append((abs(c), key, spec["voice"], round(t, 3), m, round(float(c), 1)))
    out = {}
    allv = []
    for k, v in sorted(res.items()):
        v = np.array(v)
        if not k.startswith("chant"):
            allv += list(v)
        out[k] = {"notes": int(len(v)), "median_abs_cents": round(float(np.median(np.abs(v))), 1),
                  "p95_abs_cents": round(float(np.percentile(np.abs(v), 95)), 1),
                  "within_25_cents_pct": round(float(np.mean(np.abs(v) < 25)) * 100, 1)}
    allv = np.array(allv)
    out["sung (lead + choir + chops)"] = {"notes": int(len(allv)), "median_abs_cents": round(float(np.median(np.abs(allv))), 1),
                                         "p95_abs_cents": round(float(np.percentile(np.abs(allv), 95)), 1),
                                         "within_25_cents_pct": round(float(np.mean(np.abs(allv) < 25)) * 100, 1)}
    worst.sort(reverse=True)
    out["worst"] = [w[1:] for w in worst if not w[1].startswith("chant")][:8]
    return out


def loudness(y, S):
    spb = 60.0 / S["bpm"]
    secs = []
    for s in S["sections"]:
        a, b = n_of(s["startBeat"] * spb), n_of((s["startBeat"] + s["beats"]) * spb)
        try:
            Ls = lufs(y[a:b])
        except Exception:
            Ls = -70.0
        secs.append([s["name"], round(s["startBeat"] * spb, 2), round(Ls, 1)])
    return {"lufs": round(lufs(y), 2), "true_peak_dbtp": round(float(db(true_peak(y))), 2),
            "sample_peak_dbfs": round(float(db(np.max(np.abs(y)))), 2), "sections": secs}


def onsets(EVENTS):
    out = {}
    for name, stem, hpz in (("kick", "dr_kick", 60), ("snare", "dr_snare", 1500), ("clap", "dr_clap", 1500), ("crash", "dr_cymbals", 2500)):
        p = os.path.join(BUILD, "guide_stems", stem + ".wav")
        if not os.path.exists(p):
            continue
        x, _ = sf.read(p, dtype="float64", always_2d=True)
        o = qa.onset_offsets(x, EVENTS.get(name, []), hp_hz=hpz)
        if name == "snare":
            o = o[np.abs(o) < 30]
        out[name] = {"events": len(EVENTS.get(name, [])), "measured": int(len(o)),
                     "max_abs_ms": round(float(np.max(np.abs(o))), 2) if len(o) else None,
                     "median_ms": round(float(np.median(o)), 2) if len(o) else None}
    return out


def run(S, EVENTS, DUR, whisper=True, mix_info=None, log=print):
    y, sr = sf.read(os.path.join(BUILD, "guide.wav"), dtype="float64", always_2d=True)
    v, _ = sf.read(os.path.join(BUILD, "guide_vocals.wav"), dtype="float64", always_2d=True)
    ins, _ = sf.read(os.path.join(BUILD, "guide_instrumental.wav"), dtype="float64", always_2d=True)
    assert sr == SR
    rep = {"length_s": len(y) / SR, "DUR": DUR, "length_error_samples": int(len(y) - n_of(DUR))}
    rep["loudness"] = loudness(y, S)
    log("loudness %.2f LUFS, true peak %.2f dBTP, length %.4f s (DUR %.1f)" %
        (rep["loudness"]["lufs"], rep["loudness"]["true_peak_dbtp"], rep["length_s"], DUR))
    if mix_info:
        rep["mix"] = mix_info
    spb = 60.0 / S["bpm"]
    a, b = S["parts"]["silence"][0][:2]
    ia, ib = n_of(a * spb + 0.01), n_of((a + b) * spb - 0.01)
    rep["silence_window"] = {"window_s": [a * spb, (a + b) * spb],
                             "instrumental_peak_dbfs": round(float(db(np.max(np.abs(ins[ia:ib])) + 1e-12)), 1),
                             "note": "the band is gone; only the keystroke (and the sung 'the' with its reverb) remain"}
    rep["drum_onsets_ms"] = onsets(EVENTS)
    rep["pitch"] = pitch_report(S)
    p = rep["pitch"]
    log("pitch: lead median %.1f cents (p95 %.1f), sung overall %.1f (%.0f %% within 25 cents)" %
        (p["lead"]["median_abs_cents"], p["lead"]["p95_abs_cents"], p["sung (lead + choir + chops)"]["median_abs_cents"],
         p["sung (lead + choir + chops)"]["within_25_cents_pct"]))
    if whisper:
        lyr = read_lyrics(os.path.join(ROOT, "data", "data.js"))
        rows = whisper_lines(lyr, {"vocals": v, "mix": y}, log=log)
        rep["whisper_lines"] = rows
        groups = {"all lines": rows,
                  "all but la-la": [r for r in rows if r["role"] != "lala"],
                  "primary (lead, chant, spoken, calls)": [r for r in rows if r["voice"] in ("lead", "chant", "spoken") or r["role"] == "call"]}
        rep["whisper"] = {g: {"vocals": _stats(rr, "vocals"), "mix": _stats(rr, "mix")} for g, rr in groups.items()}
        rep["whisper"]["worst_mix"] = [[r["id"], r["text"], r["mix"], r["mix_heard"], r["vocals"], r["vocals_heard"]]
                                       for r in sorted(rows, key=lambda r: -r["mix"])[:10]]
        for g, s in rep["whisper"].items():
            if g != "worst_mix":
                log("whisper %-38s vocals mean %.3f   mix mean %.3f  (n %d)" % (g, s["vocals"]["mean"], s["mix"]["mean"], s["mix"]["n"]))
        for w in rep["whisper"]["worst_mix"]:
            log("   worst: %-14s %.2f %-36r heard %r" % (w[0], w[2], w[1], w[3]))
    with open(os.path.join(BUILD, "guide-qa.json"), "w") as f:
        json.dump(rep, f, indent=1, ensure_ascii=False)
    log("wrote build/guide-qa.json")
    return rep


if __name__ == "__main__":
    with open(os.path.join(HERE, "score.json")) as f:
        S_ = json.load(f)
    DUR_, EV_ = qa.read_data_js(os.path.join(ROOT, "data", "data.js"))
    mi = None
    if os.path.exists(os.path.join(BUILD, "guide-mix.json")):
        mi = json.load(open(os.path.join(BUILD, "guide-mix.json")))
    run(S_, EV_, DUR_, whisper="--no-whisper" not in sys.argv, mix_info=mi)
