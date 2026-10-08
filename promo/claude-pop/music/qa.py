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
    """Median error (cents) over each note's steady middle, measured with Praat on the rendered words:
    every lead word, the la-la (amy's take, checked against the riff it must equal), the chops."""
    import parselmouth
    groups = {"lead": [], "lala": [], "chops": []}
    worst = []
    for (track, job, g, p, fx), (a, t0) in zip(vocals.placements, results):
        st = job["style"]
        if track == "lead" and job.get("pitch_override") is None:
            grp = "lead"
        elif track == "choir" and job["text"].lower().startswith("la") and st.get("voice") == "amy" and st.get("seed") == 11:
            grp = "lala"
        elif track == "chops":
            grp = "chops"
        else:
            continue
        a = np.asarray(a, dtype=float)
        if grp == "chops" and "gate" in fx:          # measure the chop as it is heard (gated)
            tt_ = t0 + np.arange(len(a)) / SR
            a = a * ((tt_ >= fx["gate"][0]) & (tt_ < fx["gate"][1]))
        snd = parselmouth.Sound(np.concatenate([a, np.zeros(2400)]), SR)
        pt = snd.to_pitch_ac(time_step=0.005, pitch_floor=90, pitch_ceiling=1000)
        f = pt.selected_array["frequency"]
        tt = pt.xs() + t0
        for m, s_, d in job["notes"]:
            m = m + st.get("transpose", 0)
            lo, hi = (s_ + 0.25 * d, s_ + 0.75 * d) if grp != "chops" else (s_ + 0.02, s_ + d - 0.01)
            sel = (tt >= lo) & (tt <= hi) & (f > 0)
            if sel.sum() < 2:
                continue
            c = 1200 * np.log2(f[sel] / (440 * 2 ** ((m - 69) / 12))) - st.get("detune", 0.0)
            e = float(np.median(c))
            groups[grp].append(e)
            worst.append((abs(e), grp, job["text"], round(s_, 3), round(e, 1)))
    out = {}
    for k, v in groups.items():
        v = np.array(v)
        if len(v):
            out[k] = {"notes": int(len(v)), "median_abs_cents": round(float(np.median(np.abs(v))), 1),
                      "p95_abs_cents": round(float(np.percentile(np.abs(v), 95)), 1),
                      "within_25_cents_pct": round(float(np.mean(np.abs(v) < 25)) * 100, 1)}
    worst.sort(reverse=True)
    out["worst"] = [w[1:] for w in worst[:5]]
    return out


def _norm(s):
    s = s.lower().replace("-", " ").replace("penpal", "pen pal").replace("pen-pal", "pen pal")
    s = re.sub(r"\bthee\b", "the", s)   # "the" is sung "thee"
    s = re.sub(r"[^a-z' ]", " ", s)
    return [w for w in s.split() if w]


def whisper_report(lead_stem, score, ids=None):
    """Whisper over the lead stem.  Consecutive lead lines are transcribed together as one passage
    (a chorus, a pre-chorus...) with word timestamps, as a listener hears them; each line is then
    checked word for word against the words Whisper placed inside that line's time span."""
    from faster_whisper import WhisperModel
    model = WhisperModel("small.en", device="cpu", compute_type="int8")
    spb = 60.0 / score["bpm"]
    x = stereo(lead_stem).mean(axis=1)
    x16 = signal.resample_poly(x, 1, 3).astype(np.float32)
    lines = sorted([L for L in score["lines"] if L["voice"] == "lead"], key=lambda L: L["words"][0]["notes"][0][1])

    def span(L):
        a = L["words"][0]["notes"][0][1] * spb
        w = L["words"][-1]["notes"][-1]
        return a, (w[1] + w[2]) * spb

    blocks, cur = [], []
    for L in lines:
        if cur and span(L)[0] - span(cur[-1])[1] > 2.0:
            blocks.append(cur)
            cur = []
        cur.append(L)
    blocks.append(cur)
    out = []
    for blk in blocks:
        a = span(blk[0])[0] - 0.4
        b = span(blk[-1])[1] + 0.5
        seg = x16[int(a * 16000):int(b * 16000)]
        seg = seg / (np.max(np.abs(seg)) + 1e-9) * 0.7
        segs, _ = model.transcribe(seg, language="en", beam_size=5, temperature=0.0, word_timestamps=True,
                                   condition_on_previous_text=True, vad_filter=False)
        got = _norm(" ".join(s_.text for s_ in segs))
        # align the passage's transcript to its lyric, word by word, and give each line its words
        want, owner = [], []
        for i, L in enumerate(blk):
            for w in L["words"]:
                if w.get("silent"):
                    continue
                for t in _norm(w["w"]):
                    want.append(t)
                    owner.append(i)
        heard = {i: [] for i in range(len(blk))}
        ok = {i: True for i in range(len(blk))}
        sm = difflib.SequenceMatcher(a=want, b=got, autojunk=False)
        for tag, i1, i2, j1, j2 in sm.get_opcodes():
            if tag == "equal":
                for k in range(i2 - i1):
                    heard[owner[i1 + k]].append(got[j1 + k])
            elif tag in ("replace", "delete"):
                for k in range(i1, i2):
                    ok[owner[k]] = False
                own = owner[i1] if i1 < len(owner) else owner[-1]
                heard[own].extend(got[j1:j2])
            else:   # insert: extra words land on the line before (or the first line)
                own = owner[i1 - 1] if i1 > 0 else owner[0]
                ok[own] = False
                heard[own].extend(got[j1:j2])
        for i, L in enumerate(blk):
            if ids is not None and L["id"] not in ids:
                continue
            w_ = [t for t, o in zip(want, owner) if o == i]
            r = difflib.SequenceMatcher(a=w_, b=heard[i]).ratio() if w_ else 1.0
            out.append({"id": L["id"], "t": round(span(L)[0], 2), "text": L["text"], "heard": " ".join(heard[i]),
                        "match": round(r, 2), "exact": bool(ok[i] and heard[i] == w_)})
    return out


def lufs_hist(song):
    from dsp import short_term_lufs
    return short_term_lufs(song, 3.0, 1.0)
