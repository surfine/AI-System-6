#!/usr/bin/env python3
"""build_song.py: renders "Pen Pal" from music/score.json.

    python3 -I music/build_song.py            # render + measure (Whisper included)
    python3 -I music/build_song.py --no-qa    # render only
    python3 -I music/build_song.py --workers 4

Writes build/song.wav (48 kHz, 24-bit, stereo, -9 LUFS, <= -1 dBTP), build/stems/{lead, chant, choir,
spoken, drums, bass, keys, other}.wav (pre-master, one common gain, summing to the mix) and
build/song-qa.json (the measurements).  Deterministic: Piper runs with zero noise; every random
choice is seeded; slow work (TTS per word, PSOLA per word, FluidSynth per part) is cached in .cache/.
See music/PRODUCTION.md.
"""
import argparse
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import numpy as np            # noqa: E402
import soundfile as sf        # noqa: E402

import qa                     # noqa: E402
from band import Band         # noqa: E402
from dsp import SR, db, lufs, n_of, true_peak   # noqa: E402
from mix import Mixer         # noqa: E402
from vocals import Vocals     # noqa: E402

ROOT = os.path.dirname(HERE)
BUILD = os.path.join(ROOT, "build")
STEMS = ["lead", "chant", "choir", "spoken", "drums", "bass", "keys", "other"]


def log(msg, t0=[time.time()]):
    print("[%6.1fs] %s" % (time.time() - t0[0], msg), flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-qa", action="store_true")
    ap.add_argument("--no-whisper", action="store_true")
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--prune-cache", action="store_true", help="delete cached words/parts this build did not use")
    args = ap.parse_args()

    with open(os.path.join(HERE, "score.json")) as f:
        S = json.load(f)
    DUR, EVENTS = qa.read_data_js(os.path.join(ROOT, "data", "data.js"))
    spb = 60.0 / S["bpm"]
    assert abs(S["durationBeats"] * spb - DUR) < 1e-9, "score.json and data.js disagree on the length"
    N = n_of(DUR)
    log("score: %s, %d bpm, %.1f s, %d lines" % (S["title"], S["bpm"], DUR, len(S["lines"])))

    # ---- voices
    vox = Vocals(S)
    V = vox.render(workers=args.workers)
    log("vocals: %d sung words/copies rendered" % len(vox.placements))

    # ---- band
    band = Band(S)
    D = band.drums()
    log("drums")
    B = band.bass()
    log("bass")
    K = band.keys()
    log("keys")
    O = band.other()
    log("other")

    # ---- mix + master
    M = Mixer(S, band.events["kick"])
    stems = M.process(V, B, D, K, O)
    log("mix")
    ks = [t for t in EVENTS["keystroke"] if M.sil[0] <= t < M.sil[1]]
    keep = [(vox.the_span[0], vox.the_span[1] + 0.02)] + [(t - 0.003, t + 0.14) for t in ks]
    song, gain = M.master(stems, keep, target=-9.0)
    log("master: gain %.2f dB" % gain)
    assert len(song) == N

    os.makedirs(os.path.join(BUILD, "stems"), exist_ok=True)
    sf.write(os.path.join(BUILD, "song.wav"), song.astype(np.float64), SR, subtype="PCM_24")
    # stems: pre-master, every stem at the master's input gain, then one common trim so none clips
    g = 10 ** (gain / 20)
    pk = max(float(np.max(np.abs(stems[k] * g))) for k in STEMS)
    trim = min(1.0, 10 ** (-1.0 / 20) / pk)
    for k in STEMS:
        sf.write(os.path.join(BUILD, "stems", k + ".wav"), (stems[k] * g * trim).astype(np.float64), SR, subtype="PCM_24")
    log("wrote build/song.wav and %d stems (stem gain %.2f dB)" % (len(STEMS), 20 * np.log10(g * trim)))
    if args.prune_cache:
        _prune()

    if args.no_qa:
        return
    # ---- measurements
    rep = {"title": S["title"], "sr": SR, "bits": 24}
    rep["length_s"] = len(song) / SR
    rep["length_error_ms"] = round((len(song) / SR - DUR) * 1000, 3)
    rep["lufs_integrated"] = round(lufs(song), 2)
    rep["true_peak_dbtp"] = round(float(db(true_peak(song, 4))), 2)
    rep["sample_peak_dbfs"] = round(float(db(np.max(np.abs(song)))), 2)
    rep["stem_gain_db"] = round(float(20 * np.log10(g * trim)), 2)
    rep["sections"] = qa.section_table(song, S)
    rep["spectrum_song"] = qa.octave_bands(song)
    rep["spectrum_chorus1"] = qa.octave_bands(song[n_of(36):n_of(52)])
    a, b = M.sil
    the_end = a
    lt = np.max(np.abs(song[n_of(a):n_of(b)]), axis=1)
    nz = np.where(lt > 0)[0]
    rep["silence_window"] = {
        "window_s": [a, b],
        "allowed_spans_s": [[round(x, 4) for x in k] for k in keep],
        "nonzero_spans_s": _spans(nz, n_of(a)),
        "digital_zero_outside_allowed": bool(all(np.all(song[n_of(p0):n_of(p1)] == 0) for p0, p1 in _gaps(keep, a, b))),
    }
    tracks = {"kick": D["kick"], "snare": D["snare"], "claps": D["claps"], "crash": D["crash"], "hats": D["hats"],
              "brass": O["brass"], "bell": O["bell"], "sfx_sil": O["sfx_sil"]}
    rep["timing"] = qa.timing(band, EVENTS, tracks)
    rep["mix"] = M.report
    log("measured levels, spectrum, timing")
    res = [(np.asarray(a_), t_) for a_, t_ in _cached_results(vox)]
    rep["pitch"] = qa.pitch_report(vox, res)
    log("pitch")
    if not args.no_whisper:
        rep["whisper"] = qa.whisper_report(stems["lead"], S)
        log("whisper")
    with open(os.path.join(BUILD, "song-qa.json"), "w") as f:
        json.dump(rep, f, indent=1, default=float)
    _print(rep)


def _prune():
    import synth
    import voice
    n = 0
    for d, used in ((os.path.join(ROOT, ".cache", "sing"), voice.USED), (os.path.join(ROOT, ".cache", "fluid"), synth.USED)):
        for f in os.listdir(d):
            p = os.path.join(d, f)
            if p not in used and not f.startswith("cal_"):
                os.remove(p)
                n += 1
    log("pruned %d stale cache files" % n)


def _gaps(keep, a, b):
    """The parts of [a, b) not covered by the keep spans."""
    out, cur = [], a
    for s0, s1 in sorted(keep):
        if s0 > cur:
            out.append((cur, min(s0, b)))
        cur = max(cur, s1)
    if cur < b:
        out.append((cur, b))
    return out


def _spans(idx, off):
    if len(idx) == 0:
        return []
    out = []
    s = idx[0]
    p = idx[0]
    for i in idx[1:]:
        if i > p + 96:
            out.append([round((off + s) / SR, 4), round((off + p) / SR, 4)])
            s = i
        p = i
    out.append([round((off + s) / SR, 4), round((off + p) / SR, 4)])
    return out


def _cached_results(vox):
    import voice as Vv
    return Vv.sing_pool([p[1] for p in vox.placements])


def _print(rep):
    print("\n=== Pen Pal: measurements ===")
    print("length %.4f s (error %.3f ms) | LUFS %.2f | true peak %.2f dBTP | sample peak %.2f dBFS" % (
        rep["length_s"], rep["length_error_ms"], rep["lufs_integrated"], rep["true_peak_dbtp"], rep["sample_peak_dbfs"]))
    print("sections (RMS dBFS / LUFS):")
    for r in rep["sections"]:
        print("  %-10s %6.1f s  rms %6.1f  lufs %6.1f  peak %5.1f" % (r["section"], r["start"], r["rms_dbfs"], r["lufs"], r["peak_dbfs"]))
    print("spectrum (octave bands rel. total, dB) song:   ", rep["spectrum_song"])
    print("spectrum                         chorus 1:", rep["spectrum_chorus1"])
    print("silence window:", rep["silence_window"])
    print("timing:", json.dumps(rep["timing"]["measured_onsets"]))
    miss = {k: v.get("missing") for k, v in rep["timing"].items() if isinstance(v, dict) and "missing" in v}
    print("events missing vs data.js:", miss)
    print("riser end errors (ms):", rep["timing"]["riser"]["end_errors_ms"])
    print("pitch:", rep["pitch"])
    print("mix calibration:", json.dumps(rep["mix"].get("calibration")))
    print("section energy (band dB):", rep["mix"].get("section_energy_db"))
    print("match EQ:", rep["mix"].get("match_eq"))
    print("stem loudness (LUFS):", rep["mix"].get("levels"))
    print("master:", rep["mix"].get("master"))
    if "whisper" in rep:
        ok = sum(1 for w in rep["whisper"] if w["exact"])
        print("whisper: %d/%d lead lines word-for-word" % (ok, len(rep["whisper"])))
        for w in rep["whisper"]:
            print("  %-9s %6.2f  %-32s | %-32s %s" % (w["id"], w["t"], w["text"], w["heard"][:60], "ok" if w["exact"] else "(%.2f)" % w["match"]))


if __name__ == "__main__":
    main()
