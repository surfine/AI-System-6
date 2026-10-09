#!/usr/bin/env python3
"""retime_selftest.py: prove tools/retime.py recovers a known distortion.

    python3 -I tools/retime_selftest.py                    # +180 ms and a 1.5 % slow-down (about 4 min)
    python3 -I tools/retime_selftest.py --piecewise        # three sections at 0.98x / 1.02x / 0.99x, +120 ms
    python3 -I tools/retime_selftest.py --shift-ms 250 --stretch 1.03

It distorts build/song.wav with ffmpeg (atempo, adelay), runs retime.py on the result, and then checks the
corrected file against the ORIGINAL build/song.wav (ground truth, not Whisper): the lag between the two,
in 8 s windows, from cross-correlating 1 ms envelopes of the high-passed audio.  Pass = every window
within --tol-ms (default 30).  Files go to build/retime-selftest/.
"""
import argparse
import json
import os
import subprocess
import sys

import numpy as np
import soundfile as sf
from scipy import signal
from scipy.ndimage import gaussian_filter1d

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def envelope(path):
    y, sr = sf.read(path, dtype="float32")
    y = y.mean(axis=1) if y.ndim > 1 else y
    sos = signal.butter(4, 400, "high", fs=sr, output="sos")
    e = signal.resample_poly(np.abs(signal.sosfilt(sos, y)), 1, sr // 1000)
    return gaussian_filter1d(e, 2.0)


def lags(ref_path, out_path, win=8000, hop=8000, search=300):
    ref, out = envelope(ref_path), envelope(out_path)
    res = []
    for s in range(2000, min(len(ref), len(out)) - win - 1000, hop):
        a = ref[s:s + win]
        lo = max(s - search, 0)
        b = out[lo:s + win + search]
        a, b = a - a.mean(), b - b.mean()
        c = signal.correlate(b, a, mode="valid", method="fft")
        k = int(np.argmax(c))
        d = float(k + lo - s)
        if 0 < k < len(c) - 1:
            den = c[k - 1] - 2 * c[k] + c[k + 1]
            if den < 0:
                d += 0.5 * (c[k - 1] - c[k + 1]) / den
        res.append((s / 1000.0, d))
    return res


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default=os.path.join(ROOT, "build", "song.wav"))
    ap.add_argument("--shift-ms", type=float, default=180.0)
    ap.add_argument("--stretch", type=float, default=1.015, help="duration factor of the distorted file")
    ap.add_argument("--piecewise", action="store_true")
    ap.add_argument("--tol-ms", type=float, default=30.0)
    args = ap.parse_args()
    d = os.path.join(ROOT, "build", "retime-selftest")
    os.makedirs(d, exist_ok=True)
    bad = os.path.join(d, "distorted.wav")
    out = os.path.join(d, "retimed.wav")
    rep = os.path.join(d, "report.json")
    if args.piecewise:
        fc = ("[0:a]atrim=0:52,asetpts=N/SR/TB,atempo=0.980392[a];[0:a]atrim=52:104,asetpts=N/SR/TB,atempo=1.020408[b];"
              "[0:a]atrim=104:154,asetpts=N/SR/TB,atempo=0.990099[c];[a][b][c]concat=n=3:v=0:a=1,adelay=%d:all=1[o]"
              % round(args.shift_ms if args.shift_ms != 180.0 else 120))
        cmd = ["ffmpeg", "-v", "error", "-y", "-i", args.src, "-filter_complex", fc, "-map", "[o]", "-c:a", "pcm_s24le", bad]
    else:
        af = "atempo=%.9f,adelay=%d:all=1" % (1.0 / args.stretch, round(args.shift_ms))
        cmd = ["ffmpeg", "-v", "error", "-y", "-i", args.src, "-af", af, "-c:a", "pcm_s24le", bad]
    subprocess.run(cmd, check=True)
    subprocess.run([sys.executable, "-I", os.path.join(ROOT, "tools", "retime.py"), bad, "--out", out, "--report", rep], check=True)
    r = lags(args.src, out)
    worst = max(abs(x[1]) for x in r)
    for t, lag in r:
        print("  %6.1f s  lag %+6.2f ms" % (t, lag))
    print("ground truth vs original: worst |lag| %.2f ms, mean |lag| %.2f ms over %d windows (tolerance %.0f ms)"
          % (worst, np.mean([abs(x[1]) for x in r]), len(r), args.tol_ms))
    rj = json.load(open(rep))
    print("tool said:", rj["correction"]["model"], "| scale", rj["beats"]["beat_map"]["scale"], "| offset", rj["beats"]["beat_map"]["offset_ms"], "ms")
    ok = worst <= args.tol_ms
    print("PASS" if ok else "FAIL")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
