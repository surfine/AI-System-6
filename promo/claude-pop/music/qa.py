"""qa.py: measure the render (we cannot listen, so we measure).

  * length against DUR in data/data.js
  * integrated LUFS, true peak (4x oversampled), sample peak
  * per-section RMS and loudness, octave-band spectrum balance (song and first chorus)
  * the silence window: digital zero outside the dry "the" and the keystroke
  * event timing: every EVENTS entry in data.js is rendered at its time; onsets measured on the
    isolated instrument tracks
  * pitch: every sung lead and la-la word measured with Praat against its notes
  * Whisper (faster_whisper small.en) over the lead stem, chorus lines
"""
import difflib
import json
import os
import re

import numpy as np
from scipy import signal

from dsp import SR, db, hp, lp, lufs, n_of, stereo, true_peak

BANDS = [31.5, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]


def read_data_js(path):
    txt = open(path).read()
    dur = float(re.search(r"const DUR = ([0-9.]+);", txt).group(1))
    ev = {}
    m = re.search(r"const EVENTS = \{\n(.*?)\n\};", txt, re.S)
    for line in m.group(1).split("\n"):
        k, v = line.strip().rstrip(",").split(":", 1)
        ev[k.strip()] = json.loads(v)
    return dur, ev


def octave_bands(x):
    m = stereo(x).mean(axis=1)
    f, P = signal.welch(m, SR, nperseg=8192)
    out = {}
    for c in BANDS:
        lo, hi = c / 2 ** 0.5, c * 2 ** 0.5
        sel = (f >= lo) & (f < hi)
        out[str(c)] = float(10 * np.log10(np.sum(P[sel]) + 1e-20))
    tot = 10 * np.log10(sum(10 ** (v / 10) for v in out.values()))
    return {k: round(v - tot, 1) for k, v in out.items()}


def section_table(song, score):
    spb = 60.0 / score["bpm"]
    rows = []
    for s in sorted(score["sections"], key=lambda s: s["startBeat"]):
        a, b = s["startBeat"] * spb, (s["startBeat"] + s["beats"]) * spb
        seg = song[n_of(a):n_of(b)]
        rms = float(db(np.sqrt(np.mean(seg ** 2))))
        try:
            L = float(lufs(seg))
        except Exception:
            L = float("nan")
        rows.append({"section": s["name"], "start": a, "rms_dbfs": round(rms, 1), "lufs": round(L, 1),
                     "peak_dbfs": round(float(db(np.max(np.abs(seg)))), 1)})
    return rows


def onset_offsets(track, times, pre=0.008, post=0.015, frac=0.3, hp_hz=2500):
    """Measured onset minus scheduled time (ms) for each event on an isolated track: the first sample
    whose high-passed level rises 30 % of the way from the preceding background to the attack peak
    (the high-pass ignores the previous hit's low tail)."""
    m = np.max(np.abs(hp(stereo(track), hp_hz, 2)), axis=1)
    offs = []
    for t in times:
        a, b = max(0, n_of(t - pre)), min(len(m), n_of(t + post))
        bg = m[max(0, n_of(t - 0.025)):a]
        bgv = float(bg.max()) if len(bg) else 0.0
        seg = m[a:b]
        if len(seg) == 0 or seg.max() <= bgv:
            continue
        thr = bgv + frac * (seg.max() - bgv)
        k = int(np.argmax(seg > thr))
        offs.append((a + k) / SR - t)
    return np.array(offs) * 1000


def timing(band, data_events, tracks):
    """Compare what was rendered with data.js EVENTS, and measure onsets on isolated tracks."""
    res = {}
    for name in ("kick", "snare", "clap", "crash", "stab", "keystroke", "click", "cowbell", "tambourine", "snap", "tom",
                 "beep", "ghost"):
        want = data_events.get(name, [])
        want = [w if not isinstance(w, list) else w[0] for w in want]
        got = band.events.get(name, [])
        if name == "clap":
            got = got  # pattern claps + keepIt (the gang-'You' claps are logged separately as clapYou)
        mism = 0
        if want:
            g = np.array(sorted(got))
            for w in want:
                if len(g) == 0 or np.min(np.abs(g - w)) > 0.0005:
                    mism += 1
        res[name] = {"in_data_js": len(want), "rendered": len(got), "missing": mism}
    hats = data_events.get("hat", [])
    res["hat"] = {"in_data_js": len(hats), "rendered": len(band.events.get("hat", [])),
                  "missing": sum(1 for w in hats if not np.any(np.abs(np.array(band.events.get("hat", [])) - w) < 5e-4))}
    for name in ("floppyA", "floppyB", "bell", "riff", "sub"):
        want = [w[0] for w in data_events.get(name, [])]
        got = np.array(sorted(band.events.get(name, [])))
        res[name] = {"in_data_js": len(want), "rendered": len(got),
                     "missing": sum(1 for w in want if len(got) == 0 or np.min(np.abs(got - w)) > 5e-4)}
    rz = band.events.get("riser", [])
    res["riser"] = {"in_data_js": len(data_events.get("riser", [])), "rendered": len(rz),
                    "end_errors_ms": [round((b - w[1]) * 1000, 2) for (a, b), w in zip(sorted(rz), sorted(data_events.get("riser", [])))]}
    # measured onsets on isolated tracks
    meas = {}
    for name, tr in (("kick", "kick"), ("snare", "snare"), ("clap", "claps"), ("crash", "crash")):
        o = onset_offsets(tracks[tr], data_events.get(name, []))
        if name == "snare":   # skip the 16th build/fill hits that ring into each other
            o = o[np.abs(o) < 30]
        meas[name] = {"n": int(len(o)), "max_abs_ms": round(float(np.max(np.abs(o))), 2) if len(o) else None,
                      "mean_ms": round(float(np.mean(o)), 2) if len(o) else None}
    o = onset_offsets(tracks["hats"], data_events.get("hat", []), pre=0.006, post=0.012)
    meas["hat (key-down click is 2 ms early by design)"] = {"n": int(len(o)), "max_abs_ms": round(float(np.max(np.abs(o))), 2),
                                                            "mean_ms": round(float(np.mean(o)), 2)}
    o = onset_offsets(tracks["brass"], data_events.get("stab", []), pre=0.008, post=0.03, frac=0.1, hp_hz=500)
    meas["stab (FluidSynth, latency-compensated)"] = {"n": int(len(o)), "max_abs_ms": round(float(np.max(np.abs(o))), 2),
                                                       "mean_ms": round(float(np.mean(o)), 2)}
    o = onset_offsets(tracks["bell"], [w[0] for w in data_events.get("bell", [])], pre=0.006, post=0.015, hp_hz=800)
    meas["bell"] = {"n": int(len(o)), "max_abs_ms": round(float(np.max(np.abs(o))), 2), "mean_ms": round(float(np.mean(o)), 2)}
    o = onset_offsets(tracks["sfx_sil"], data_events.get("keystroke", [])[:1], pre=0.006, post=0.015)
    meas["keystroke (silence)"] = {"n": int(len(o)), "offset_ms": [round(float(v), 2) for v in o]}
    res["measured_onsets"] = meas
    return res


def pitch_report(vocals, results):
    """Median error (cents) of every lead and la-la word over its notes' steady middles."""
    import parselmouth
    errs = []
    worst = []
    for (track, job, g, p, fx), (a, t0) in zip(vocals.placements, results):
        role_ok = track == "lead" or (track == "choir" and job["text"].lower().startswith("la") and
                                      job["style"].get("voice") == "amy" and job["style"].get("seed") == 11)
        if not role_ok or job.get("pitch_override") is not None:
            continue
        a = np.asarray(a, dtype=float)
        snd = parselmouth.Sound(a, SR)
        pt = snd.to_pitch_ac(time_step=0.005, pitch_floor=90, pitch_ceiling=900)
        f = pt.selected_array["frequency"]
        tt = pt.xs() + t0
        for m, s, d in job["notes"]:
            m = m + job["style"].get("transpose", 0)
            lo, hi = s + 0.25 * d, s + 0.75 * d
            sel = (tt >= lo) & (tt <= hi) & (f > 0)
            if sel.sum() < 2:
                continue
            c = 1200 * np.log2(f[sel] / (440 * 2 ** ((m - 69) / 12)))
            c = c - job["style"].get("detune", 0.0)
            e = float(np.median(c))
            errs.append(e)
            worst.append((abs(e), job["text"], round(s, 3), round(e, 1)))
    errs = np.array(errs)
    worst.sort(reverse=True)
    return {"notes": int(len(errs)), "median_abs_cents": round(float(np.median(np.abs(errs))), 1),
            "p95_abs_cents": round(float(np.percentile(np.abs(errs), 95)), 1),
            "within_25_cents": round(float(np.mean(np.abs(errs) < 25)) * 100, 1),
            "worst": [w[1:] for w in worst[:5]]}


def _norm(s):
    s = s.lower().replace("-", " ").replace("penpal", "pen pal").replace("pen-pal", "pen pal")
    s = re.sub(r"\bthee\b", "the", s)   # "the" is sung "thee"
    s = re.sub(r"[^a-z' ]", " ", s)
    return [w for w in s.split() if w]


def whisper_report(lead_stem, score, ids=None):
    from faster_whisper import WhisperModel
    model = WhisperModel("small.en", device="cpu", compute_type="int8")
    spb = 60.0 / score["bpm"]
    x = stereo(lead_stem).mean(axis=1)
    x16 = signal.resample_poly(x, 1, 3).astype(np.float32)
    x16 = x16 / (np.max(np.abs(x16)) + 1e-9) * 0.7
    out = []
    lines = [L for L in score["lines"] if L["voice"] == "lead" and (ids is None or L["id"] in ids)]
    starts = sorted(L["words"][0]["notes"][0][1] * spb for L in score["lines"] if L["voice"] == "lead")
    for L in lines:
        a = L["words"][0]["notes"][0][1] * spb - 0.25
        b = (L["words"][-1]["notes"][-1][1] + L["words"][-1]["notes"][-1][2]) * spb + 0.3
        nxt = [s0 for s0 in starts if s0 > a + 0.3]
        if nxt:                       # stop before the next lead line's first word
            b = min(b, nxt[0] - 0.03)
        seg = x16[int(a * 16000):int(b * 16000)]
        segs, _ = model.transcribe(seg, language="en", beam_size=5, temperature=0.0,
                                   condition_on_previous_text=False, initial_prompt=None)
        heard = " ".join(s.text.strip() for s in segs)
        want = [w for w in _norm(L["text"])]
        # the silent pen: the word "pen" is typed, not sung
        if any(w.get("silent") for w in L["words"]):
            want = _norm(" ".join(w["w"] for w in L["words"] if not w.get("silent")))
        got = _norm(heard)
        sm = difflib.SequenceMatcher(a=want, b=got)
        acc = sm.ratio()
        out.append({"id": L["id"], "t": round(a + 0.25, 2), "text": L["text"], "heard": heard, "match": round(acc, 2),
                    "exact": want == got})
    return out


def lufs_hist(song):
    from dsp import short_term_lufs
    return short_term_lufs(song, 3.0, 1.0)
