#!/usr/bin/env python3
"""retime.py: line a regenerated song up with the video's timeline, by fixing the AUDIO.

The finished video is synced to data/data.js (LYRICS word times, EVENTS, BEATS, SECTIONS).  When a new
rendition of the song arrives (an ACE-Step cover as mp3/flac/wav, possibly a little longer or shorter,
possibly with its own idea of tempo) this tool

  1. MEASURES how far it drifts from data/data.js:
       * faster_whisper (small.en, word timestamps, beam 5, initial_prompt from the lyrics, run in
         overlapping 30 s windows) transcribes the song;
       * the recognised words are aligned in order to the LYRICS words by dynamic programming, tolerant
         of misrecognitions, with a time prior that tightens in three passes;
       * per-line, per-section and global offsets (median start-time difference), a linear time map
         (tempo drift), a piecewise map (knots at section boundaries) and the length difference;
       * a spectral-flux onset detector compared with BEATS (a beat-grid correlation search, plus the
         position of the strongest onsets on the eighth-note grid).
  2. CORRECTS the audio, not the video: a constant offset becomes a slice/pad, a uniform tempo scale one
     rubberband (else atempo) pass, section-wise drift a piecewise time warp (each source stretch is
     mapped onto its data.js span, 20 ms linear crossfades at the joins).  The model is chosen by how
     much each one reduces the robust residual; --model forces one.
  3. VERIFIES by measuring the corrected file again, and reports the residual word error.

Outputs: build/song.retimed.wav (48 kHz, stereo, 24 bit, exactly DUR long), build/retime-report.json and
a summary on stdout.  data/data.js is only ever read.

    python3 -I tools/retime.py NEW_SONG.mp3
    python3 -I tools/retime.py build/song.wav --measure-only
    python3 -I tools/retime.py cover.flac --vocals cover-vocals.wav     # measure on a vocal stem, fix the mix

Convention.  f(t) is the time in the INPUT at which the content that belongs at video time t sits, so
the corrected file is  out(t) = in(f(t)).  offset(t) = f(t) - t: positive means the input is late.
"""
import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from difflib import SequenceMatcher

import numpy as np
import soundfile as sf
from scipy import signal
from scipy.ndimage import gaussian_filter1d

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SR = 48000
WHISPER_SR = 16000
CACHE_VERSION = 3
XFADE = 0.020            # crossfade at piecewise joins, seconds
CONTEXT = 0.30           # source context handed to the time stretcher on each side, seconds
OUTLIER = 0.5            # a matched word further than this from the local trend is an outlier, seconds
# Measured once on build/song.wav (the render the video was cut to, so its true drift is zero):
#   * Whisper stamps a sung word about 70 ms before the score's note start (the consonant leads the
#     beat), median over 239 words.  Subtracted from every recognised word time so that a good file
#     reads ~0.  A real singer leads too, so the same constant is the fair baseline; --bias-ms 0 to see raw.
#   * the spectral-flux onset of a drum hit peaks 6.8 ms before its grid time.
LYRIC_BIAS = -0.070
BEAT_BIAS = -0.0068


def log(*a):
    print(*a, file=sys.stderr, flush=True)


# --------------------------------------------------------------------------------------------- data.js

def _json_after(txt, name, opener):
    m = re.search(r"const %s = " % name, txt)
    if not m:
        raise SystemExit("data.js has no %s" % name)
    obj, _ = json.JSONDecoder().raw_decode(txt[m.end():])
    return obj


def read_data_js(path):
    txt = open(path, encoding="utf-8").read()
    d = {"dur": float(re.search(r"const DUR = ([0-9.]+);", txt).group(1)),
         "bpm": float(re.search(r"const BPM = ([0-9.]+);", txt).group(1)),
         "sections": _json_after(txt, "SECTIONS", "["),
         "beats": _json_after(txt, "BEATS", "[")}
    m = re.search(r"const LYRICS = \[\n(.*?)\n\];", txt, re.S)
    d["lyrics"] = json.loads("[" + re.sub(r",\s*$", "", m.group(1).strip()) + "]")
    return d


def norm_word(w):
    w = w.lower().replace("’", "'")
    return re.sub(r"[^a-z0-9]", "", w)


def ref_words(lyrics, include_choir=False):
    """The words the song is measured on: the lead, chant and spoken lines.  Choir echoes, calls, la-las
    and gangs are skipped (a re-sung version may drop or move them) unless include_choir."""
    out = []
    for line in lyrics:
        if line.get("role") and not include_choir:
            continue
        for w in line["words"]:
            tok = norm_word(w["w"])
            if tok:
                out.append({"tok": tok, "start": float(w["start"]), "end": float(w["end"]),
                            "line": line["id"], "section": line["section"], "text": w["w"]})
    return out


# --------------------------------------------------------------------------------------------- audio io

def have_filter(name):
    try:
        r = subprocess.run(["ffmpeg", "-hide_banner", "-filters"], capture_output=True, text=True)
        return re.search(r"\b%s\b" % name, r.stdout) is not None
    except FileNotFoundError:
        return False


def load_audio(path):
    """Any format ffmpeg reads -> float32 (N, 2) at 48 kHz."""
    cmd = ["ffmpeg", "-v", "error", "-nostdin", "-i", path, "-f", "f32le", "-ac", "2", "-ar", str(SR), "-"]
    r = subprocess.run(cmd, capture_output=True)
    if r.returncode != 0 or not r.stdout:
        raise SystemExit("ffmpeg could not read %s: %s" % (path, r.stderr.decode(errors="replace")[-400:]))
    return np.frombuffer(r.stdout, dtype=np.float32).reshape(-1, 2).copy()


def mono(y):
    return y.mean(axis=1)


def resample_to(x, sr_to):
    """48 kHz mono -> 16000 / 24000 (exact integer ratios)."""
    return signal.resample_poly(x, 1, SR // sr_to).astype(np.float32)


# --------------------------------------------------------------------------------------------- whisper

def transcribe(x16, ref_lines, cache_dir, label, model_name="small.en", use_cache=True, win=36.0, hop=30.0):
    """Word-timestamped transcription of mono 16 kHz audio, in overlapping windows (each window gets
    a prompt made of the lyric lines that lie near it on the data.js timeline).  Returns a list of
    {w, tok, start, end, p} sorted by time."""
    key = hashlib.md5(x16.tobytes()).hexdigest() + "-%s-%d" % (model_name, CACHE_VERSION)
    cpath = os.path.join(cache_dir, "whisper-%s.json" % key)
    if use_cache and os.path.exists(cpath):
        log("[%s] transcript from cache %s" % (label, os.path.basename(cpath)))
        return json.load(open(cpath))
    from faster_whisper import WhisperModel
    t0 = time.time()
    model = WhisperModel(model_name, device="cpu", compute_type="int8", cpu_threads=os.cpu_count() or 4)
    dur = len(x16) / WHISPER_SR
    words = []
    starts = np.arange(0.0, max(dur - 3.0, 1.0), hop)
    for ci, w0 in enumerate(starts):
        w1 = min(w0 + win, dur)
        near = [l["text"] for l in ref_lines if w0 - 8 <= l["start"] <= w1 + 8 and not l.get("role")]
        seen, uniq = set(), []
        for t in near:
            if t not in seen:
                seen.add(t)
                uniq.append(t)
        prompt = "Pen Pal. Lyrics: " + " ".join(uniq)
        prompt = prompt[:700]
        chunk = x16[int(w0 * WHISPER_SR):int(w1 * WHISPER_SR)]
        if len(chunk) < WHISPER_SR:
            continue
        segs, _ = model.transcribe(
            chunk, language="en", beam_size=5, word_timestamps=True, initial_prompt=prompt,
            condition_on_previous_text=False, vad_filter=False, no_speech_threshold=None,
            compression_ratio_threshold=None, log_prob_threshold=None, temperature=0.0)
        keep0 = w0 if ci > 0 else -1.0
        keep1 = w0 + hop if w1 < dur - 1e-3 and w0 + hop < dur - 3.0 else 1e9
        for s in segs:
            for wd in (s.words or []):
                a, b = w0 + wd.start, w0 + wd.end
                mid = 0.5 * (a + b)
                if keep0 <= mid < keep1:
                    tok = norm_word(wd.word)
                    if tok:
                        words.append({"w": wd.word.strip(), "tok": tok, "start": round(a, 3),
                                      "end": round(b, 3), "p": round(float(wd.probability), 3)})
        log("[%s] whisper window %d/%d done (%.0fs elapsed)" % (label, ci + 1, len(starts), time.time() - t0))
    words.sort(key=lambda w: w["start"])
    os.makedirs(cache_dir, exist_ok=True)
    json.dump(words, open(cpath, "w"))
    return words


# --------------------------------------------------------------------------------------------- alignment

_sim_cache = {}


def sim(a, b):
    if a == b:
        return 1.0
    k = (a, b)
    v = _sim_cache.get(k)
    if v is None:
        if min(len(a), len(b)) <= 2:
            v = 0.0
        else:
            v = SequenceMatcher(None, a, b).ratio()
            # whisper often splits or joins words ("scrap book"): a containment is a decent match
            if v < 0.75 and len(a) >= 5 and len(b) >= 4 and (a.startswith(b) or b.startswith(a)):
                v = max(v, 0.7)
        _sim_cache[k] = v
    return v


def dp_align(ref, rec, pred, tol, wt, gap=0.45):
    """Semi-global alignment (free leading/trailing gaps) of ref tokens to recognised tokens.
    pred[i] is the expected recognised time of ref word i; a pair further than tol from it pays a
    penalty growing to 3*wt.  Returns [(i, j, sim)]."""
    n, m = len(ref), len(rec)
    rt = np.array([r["start"] for r in ref])
    ct = np.array([r["start"] for r in rec])
    rtok = [r["tok"] for r in ref]
    ctok = [r["tok"] for r in rec]
    lenf = np.array([min(1.0, 0.55 + 0.15 * len(t)) for t in rtok])
    S = np.empty((n, m))
    for i in range(n):
        dt = np.abs(ct - pred[i])
        pen = wt * np.minimum(3.0, np.maximum(0.0, dt - tol) / tol)
        row = np.array([sim(rtok[i], c) for c in ctok])
        base = np.where(row >= 0.6, 3.0 * row - 1.2, -1.0) * lenf[i]
        S[i] = base - pen
    H = np.zeros((n + 1, m + 1))
    P = np.zeros((n + 1, m + 1), dtype=np.int8)   # 1 diag, 2 up (skip ref), 3 left (skip rec), 0 stop
    for i in range(1, n + 1):
        Si = S[i - 1]
        Hp, Hc, Pc = H[i - 1], H[i], P[i]
        for j in range(1, m + 1):
            d = Hp[j - 1] + Si[j - 1]
            u = Hp[j] - gap
            l = Hc[j - 1] - gap
            if d >= u and d >= l:
                Hc[j] = d
                Pc[j] = 1
            elif u >= l:
                Hc[j] = u
                Pc[j] = 2
            else:
                Hc[j] = l
                Pc[j] = 3
    # free end gaps: best cell on the last row or column
    bi, bj = n, int(np.argmax(H[n]))
    best = H[n, bj]
    ci = int(np.argmax(H[:, m]))
    if H[ci, m] > best:
        bi, bj = ci, m
    out = []
    i, j = bi, bj
    while i > 0 and j > 0:
        p = P[i, j]
        if p == 1:
            s = sim(rtok[i - 1], ctok[j - 1])
            if s >= 0.6:
                out.append((i - 1, j - 1, s))
            i -= 1
            j -= 1
        elif p == 2:
            i -= 1
        else:
            j -= 1
    out.reverse()
    return out


def theil_sen(x, y):
    """Robust line y = a x + b (median of pairwise slopes, subsampled)."""
    x, y = np.asarray(x), np.asarray(y)
    if len(x) > 400:
        idx = np.linspace(0, len(x) - 1, 400).astype(int)
        x, y = x[idx], y[idx]
    ii, jj = np.triu_indices(len(x), 1)
    dx = x[jj] - x[ii]
    ok = np.abs(dx) > 1.0
    if ok.sum() < 3:
        return 1.0, float(np.median(y - x))
    a = float(np.median((y[jj][ok] - y[ii][ok]) / dx[ok]))
    a = float(np.clip(a, 0.7, 1.4))
    return a, float(np.median(y - a * x))


def huber_line(x, y, a0, b0, delta=0.08, iters=30):
    a, b = a0, b0
    for _ in range(iters):
        r = y - (a * x + b)
        w = np.where(np.abs(r) <= delta, 1.0, delta / np.maximum(np.abs(r), 1e-9))
        A = np.stack([x, np.ones_like(x)], 1) * w[:, None] ** 0.5
        sol, *_ = np.linalg.lstsq(A, y * w ** 0.5, rcond=None)
        if abs(sol[0] - a) < 1e-9 and abs(sol[1] - b) < 1e-9:
            a, b = sol
            break
        a, b = sol
    return float(a), float(b)


def local_median_offset(xs, rs, x, half=12.0, min_n=3):
    """Median of residual rs among points within +-half seconds of each x (nan-free: widens)."""
    out = np.zeros(len(x))
    for k, xv in enumerate(x):
        h = half
        while True:
            sel = np.abs(xs - xv) <= h
            if sel.sum() >= min_n or h > 200:
                break
            h *= 1.6
        out[k] = np.median(rs[sel]) if sel.any() else 0.0
    return out


def measure(ref, rec, dur_ref):
    """Align and return matches with robust stats.  Three passes of increasing time strictness."""
    rt = np.array([r["start"] for r in ref])
    t0 = time.time()
    pred = rt.copy()
    pairs = dp_align(ref, rec, pred, tol=12.0, wt=0.3)
    ct = np.array([r["start"] for r in rec])

    def anchors(pairs, strict=True):
        ii = np.array([p[0] for p in pairs])
        jj = np.array([p[1] for p in pairs])
        ss = np.array([p[2] for p in pairs])
        if len(ii) == 0:
            return ii, jj, ss
        good = ss >= 0.99
        if strict:
            good &= np.array([len(ref[i]["tok"]) >= 3 for i in ii])
        return ii[good], jj[good], ss[good]

    ii, jj, _ = anchors(pairs)
    if len(ii) < 8:
        ii, jj, _ = anchors(pairs, strict=False)
    if len(ii) < 6:
        return {"ok": False, "n_ref": len(ref), "n_rec": len(rec), "pairs": []}
    a, b = theil_sen(rt[ii], ct[jj])
    a, b = huber_line(rt[ii], ct[jj], a, b)
    pred = a * rt + b
    pairs = dp_align(ref, rec, pred, tol=0.8, wt=1.0)
    ii, jj, _ = anchors(pairs)
    if len(ii) >= 6:
        res = ct[jj] - pred[ii]
        keep = np.abs(res - np.median(res)) < 1.5
        pred = pred + local_median_offset(rt[ii][keep], res[keep], rt, half=12.0)
        pairs = dp_align(ref, rec, pred, tol=0.4, wt=1.0)
    log("alignment: %d ref words, %d recognised words, %d paired (%.1fs)" % (len(ref), len(rec), len(pairs), time.time() - t0))
    out = []
    for i, j, s in pairs:
        out.append({"i": i, "j": j, "sim": s, "t_ref": float(rt[i]), "t_rec": float(ct[j]),
                    "dt": float(ct[j] - rt[i]), "pred": float(pred[i])})
    # outliers: far from the local trend of the pairs themselves
    if out:
        xs = np.array([o["t_ref"] for o in out])
        dts = np.array([o["dt"] for o in out])
        trend = local_median_offset(xs, dts, xs, half=10.0, min_n=5)
        for o, tr in zip(out, trend):
            o["outlier"] = bool(abs(o["dt"] - tr) > OUTLIER)
    return {"ok": True, "n_ref": len(ref), "n_rec": len(rec), "pairs": out}


# --------------------------------------------------------------------------------------------- time models

def trimmed_rms(r, cap=0.2):
    r = np.asarray(r)
    return float(np.sqrt(np.mean(np.minimum(r * r, cap * cap)))) if len(r) else float("nan")


class TimeMap:
    """f: video time -> input time, piecewise linear through (ref_knots, src_knots), constant offset
    beyond the ends.  Monotone by construction check."""

    def __init__(self, kind, ref_knots, src_knots, extra=None):
        self.kind = kind
        self.k = np.asarray(ref_knots, float)
        self.s = np.asarray(src_knots, float)
        self.extra = extra or {}

    def f(self, t):
        t = np.asarray(t, float)
        out = np.interp(t, self.k, self.s)
        lo, hi = t < self.k[0], t > self.k[-1]
        out = np.where(lo, self.s[0] + (t - self.k[0]), out)
        out = np.where(hi, self.s[-1] + (t - self.k[-1]), out)
        return out

    def offset(self, t):
        return self.f(t) - np.asarray(t, float)

    def inverse(self, s):
        s = np.asarray(s, float)
        out = np.interp(s, self.s, self.k)
        lo, hi = s < self.s[0], s > self.s[-1]
        out = np.where(lo, self.k[0] + (s - self.s[0]), out)
        out = np.where(hi, self.k[-1] + (s - self.s[-1]), out)
        return out

    def tempos(self):
        dk, ds = np.diff(self.k), np.diff(self.s)
        return ds / np.maximum(dk, 1e-9)


def fit_const(x, y, dur):
    b = float(np.median(y - x))
    return TimeMap("const", [0.0, dur], [b, dur + b], {"offset": b})


def fit_linear(x, y, dur):
    a0, b0 = theil_sen(x, y)
    a, b = huber_line(x, y, a0, b0)
    return TimeMap("linear", [0.0, dur], [b, a * dur + b], {"scale": a, "offset": b})


def fit_piecewise(x, y, dur, boundaries, min_words=5, lam=0.3):
    """Continuous piecewise-linear offset(t) with knots at section boundaries, fitted to the matched
    words by Huber-weighted least squares.  Boundaries whose neighbouring spans hold fewer than
    min_words words are dropped (merged into the neighbour)."""
    kn = sorted(set([0.0] + [b for b in boundaries if 0 < b < dur] + [dur]))
    while len(kn) > 2:
        cnt = [int(((x >= kn[i]) & (x < kn[i + 1])).sum()) for i in range(len(kn) - 1)]
        w = int(np.argmin(cnt))
        if cnt[w] >= min_words:
            break
        # remove the interior knot shared with the smaller neighbour
        if w == 0:
            drop = 1
        elif w == len(cnt) - 1:
            drop = len(kn) - 2
        else:
            drop = w if cnt[w - 1] <= cnt[w + 1] else w + 1
        kn.pop(drop)
    kn = np.array(kn)
    K = len(kn)
    d = y - x
    w = np.ones(len(x))
    off = np.full(K, np.median(d))
    # hat basis
    B = np.zeros((len(x), K))
    for i, xv in enumerate(x):
        j = int(np.clip(np.searchsorted(kn, xv, side="right") - 1, 0, K - 2))
        u = (xv - kn[j]) / (kn[j + 1] - kn[j])
        B[i, j] = 1 - u
        B[i, j + 1] = u
    D = np.zeros((K - 1, K))
    for i in range(K - 1):
        D[i, i], D[i, i + 1] = -1.0, 1.0
    for _ in range(30):
        r = d - B @ off
        w = np.where(np.abs(r) <= 0.08, 1.0, 0.08 / np.maximum(np.abs(r), 1e-9))
        A = B.T @ (B * w[:, None]) + lam * D.T @ D + 1e-6 * np.eye(K)
        rhs = B.T @ (w * d)
        new = np.linalg.solve(A, rhs)
        if np.max(np.abs(new - off)) < 1e-7:
            off = new
            break
        off = new
    src = kn + off
    # keep it monotone with a sane tempo
    for i in range(1, K):
        minstep = 0.5 * (kn[i] - kn[i - 1])
        if src[i] - src[i - 1] < minstep:
            src[i] = src[i - 1] + minstep
    return TimeMap("piecewise", kn, src, {"knots": len(kn)})


def model_stats(tm, x, y):
    r = y - tm.f(x)
    ar = np.abs(r)
    return {"robust_rms_ms": round(1000 * trimmed_rms(r), 1),
            "median_abs_ms": round(1000 * float(np.median(ar)), 1),
            "p90_abs_ms": round(1000 * float(np.percentile(ar, 90)), 1),
            "max_abs_ms": round(1000 * float(ar.max()), 1)}


def choose_model(models, x, y, force):
    stats = {k: model_stats(m, x, y) for k, m in models.items()}
    if force and force != "auto":
        return force, stats
    cost = {k: v["robust_rms_ms"] for k, v in stats.items()}
    best = "const"
    lin = models["linear"]
    scale_dev = abs(lin.extra["scale"] - 1.0)
    if cost["linear"] < cost[best] - 10.0 and scale_dev > 2e-4:
        best = "linear"
    if "piecewise" in models and cost["piecewise"] < cost[best] - 15.0 and cost["piecewise"] < 0.75 * cost[best]:
        best = "piecewise"
    return best, stats


# --------------------------------------------------------------------------------------------- onsets/beats

def onset_envelope(x24):
    """Spectral flux of the log-magnitude STFT (n_fft 512, hop 64 at 24 kHz = 2.7 ms), normalised."""
    nfft, hop = 512, 64
    f, t, Z = signal.stft(x24, 24000, nperseg=nfft, noverlap=nfft - hop, boundary=None, padded=False)
    mag = np.log1p(40.0 * np.abs(Z[2:, :]))        # drop DC bins
    flux = np.maximum(0.0, np.diff(mag, axis=1)).sum(axis=0)
    flux = np.concatenate([[0.0], flux])
    times = t - 0.0                                 # stft time = frame centre
    # a flux frame responds when the onset enters the window: centre-aligned correction ~ +nfft/4
    times = times - (nfft / 4) / 24000.0
    base = signal.medfilt(flux[::8], 51)            # slow baseline, 8x decimated
    base = np.interp(np.arange(len(flux)), np.arange(0, len(flux), 8)[:len(base)], base)
    env = np.maximum(0.0, flux - base)
    env = env / (np.std(env) + 1e-9)
    env = gaussian_filter1d(env, 2.0)               # ~5 ms
    return times, env, 24000.0 / hop


def beat_analysis(times, env, fs, data, tm_lyric, fix_scale=False):
    """Compare the input's onsets with BEATS.  Returns the best linear map (beat time -> input time),
    its contrast, per-section offsets and where the strongest onsets fall on the eighth-note grid."""
    beats = np.array(data["beats"], float)
    dur = data["dur"]
    t0 = times[0]

    def score_grid(bts, a_grid, b_grid):
        S = np.zeros((len(a_grid), len(b_grid)))
        idx = np.arange(len(env))
        for ia, a in enumerate(a_grid):
            src = (a * bts[None, :] + b_grid[:, None]).ravel()
            v = np.interp(src, times, env, left=0.0, right=0.0).reshape(len(b_grid), len(bts))
            S[ia] = v.mean(axis=1)
        return S

    if tm_lyric is not None and tm_lyric.kind in ("const", "linear"):
        a0 = float((tm_lyric.s[-1] - tm_lyric.s[0]) / (tm_lyric.k[-1] - tm_lyric.k[0]))
        b0 = float(tm_lyric.s[0])
        a_grid = np.array([a0]) if fix_scale else a0 + np.arange(-0.004, 0.00401, 0.0002)
        b_grid = b0 + np.arange(-0.25, 0.2501, 0.004)
        centred = "lyrics"
    elif tm_lyric is not None:
        a0 = 1.0
        a_grid = 1.0 + np.arange(-0.03, 0.0301, 0.0005)
        b_grid = np.arange(-0.25, 0.2501, 0.004) + float(np.median(tm_lyric.offset(beats)))
        centred = "lyrics (median)"
    else:
        a_grid = 1.0 + np.arange(-0.03, 0.0301, 0.0005)
        b_grid = np.arange(-0.25, 0.2501, 0.004)
        centred = "identity"
    S = score_grid(beats, a_grid, b_grid)
    ia, ib = np.unravel_index(np.argmax(S), S.shape)
    # parabolic refinement of b
    bb = b_grid[ib]
    if 0 < ib < len(b_grid) - 1:
        y0, y1, y2 = S[ia, ib - 1], S[ia, ib], S[ia, ib + 1]
        den = y0 - 2 * y1 + y2
        if den < 0:
            bb = b_grid[ib] + 0.5 * (y0 - y2) / den * (b_grid[1] - b_grid[0])
    a_best = float(a_grid[ia])
    contrast = float(S[ia, ib] / (np.median(S) + 1e-9))
    # fine search around the coarse optimum (scale 0.00002 steps, offset 1 ms steps)
    af = np.array([a_best]) if fix_scale else a_best + np.arange(-0.0002, 0.000201, 0.00002)
    bf = bb + np.arange(-0.006, 0.00601, 0.001)
    S2 = score_grid(beats, af, bf)
    ja, jb = np.unravel_index(np.argmax(S2), S2.shape)
    a_best, bb = float(af[ja]), float(bf[jb])
    res = {"search_centred_on": centred, "scale": a_best, "offset_s": float(bb), "contrast": round(contrast, 2),
           "mean_onset_strength_at_beats": round(float(S[ia, ib]), 3)}
    # per-section: offset of the beats inside the section against the global scale
    secs = []
    for s in data["sections"]:
        bts = beats[(beats >= s["start"]) & (beats < s["end"])]
        if len(bts) < 3:
            continue
        bgrid = bb + np.arange(-0.15, 0.1501, 0.004)
        sc = np.array([np.interp(a_best * bts + b, times, env, left=0, right=0).mean() for b in bgrid])
        k = int(np.argmax(sc))
        c = float(sc[k] / (np.median(sc) + 1e-9))
        secs.append({"section": s["name"], "start": s["start"], "end": s["end"],
                     "beat_offset_ms": round(1000 * float(a_best * np.mean(bts) + bgrid[k] - np.mean(bts)), 1),
                     "contrast": round(c, 2)})
    res["sections"] = secs
    # strongest onsets: where do they fall on the eighth-note grid after the lyric (or beat) map?
    pk, _ = signal.find_peaks(env, height=2.0, distance=int(0.06 * fs))
    top = pk[np.argsort(env[pk])[::-1][:max(50, int(0.12 * len(beats) * 2))]]
    on_src = times[top]
    res["n_onsets_detected"] = int(len(pk))
    return res, on_src, (a_best, float(bb))


def onset_grid_report(on_src, tm, data, bias=0.0):
    """Signed distance (ms) of the strongest onsets, mapped back to video time, to the eighth-note grid."""
    grid = 60.0 / data["bpm"] / 2.0
    on_ref = tm.inverse(on_src - bias)
    on_ref = on_ref[(on_ref > 0) & (on_ref < data["dur"])]
    d = ((on_ref + grid / 2) % grid) - grid / 2
    if len(d) == 0:
        return {}
    return {"n": int(len(d)), "median_signed_ms": round(1000 * float(np.median(d)), 1),
            "within_30ms_pct": round(100 * float(np.mean(np.abs(d) <= 0.03)), 1),
            "within_60ms_pct": round(100 * float(np.mean(np.abs(d) <= 0.06)), 1)}


def refine_piecewise_beats(tm_pw, times, env, data, search=0.15, min_contrast=3.0):
    """Fine-tune a lyric-based piecewise map on the drums: in every section, shift the map by the delta
    (within +-search) that puts the section's beats on the input's strongest onsets.  Sections whose beat
    evidence is weak keep the lyric value.  Deltas are joined linearly through the section centres."""
    beats = np.array(data["beats"], float)
    centres, deltas, n_ok = [], [], 0
    for s in data["sections"]:
        bts = beats[(beats >= s["start"]) & (beats < s["end"])]
        if len(bts) < 6:
            continue
        grid = np.arange(-search, search + 1e-9, 0.004)
        base = tm_pw.f(bts)
        sc = np.array([np.interp(base + d, times, env, left=0, right=0).mean() for d in grid])
        k = int(np.argmax(sc))
        c = float(sc[k] / (np.median(sc) + 1e-9))
        d = grid[k]
        if 0 < k < len(grid) - 1:
            y0, y1, y2 = sc[k - 1], sc[k], sc[k + 1]
            den = y0 - 2 * y1 + y2
            if den < 0:
                d += 0.5 * (y0 - y2) / den * 0.004
        centres.append(0.5 * (s["start"] + s["end"]))
        if c >= min_contrast:
            deltas.append(d - BEAT_BIAS)
            n_ok += 1
        else:
            deltas.append(0.0)
    if not centres:
        return tm_pw, 0
    centres, deltas = np.array(centres), np.array(deltas)
    knots = np.unique(np.concatenate([tm_pw.k, centres, [0.0, data["dur"]]]))
    off = tm_pw.offset(knots) + np.interp(knots, centres, deltas)
    src = knots + off
    for i in range(1, len(src)):
        src[i] = max(src[i], src[i - 1] + 0.5 * (knots[i] - knots[i - 1]))
    return TimeMap("piecewise", knots, src), n_ok


def tempo_estimate(times, env, fs):
    """Dominant tempo from the autocorrelation of the onset envelope (75 to 190 BPM)."""
    e = env - env.mean()
    n = len(e)
    ac = np.fft.irfft(np.abs(np.fft.rfft(e, 2 * n)) ** 2)[:n]
    lo, hi = int(fs * 60 / 190), int(fs * 60 / 75)
    seg = ac[lo:hi]
    k = int(np.argmax(seg)) + lo
    # refine
    if 0 < k - lo < len(seg) - 1:
        y0, y1, y2 = ac[k - 1], ac[k], ac[k + 1]
        den = y0 - 2 * y1 + y2
        k = k + (0.5 * (y0 - y2) / den if den < 0 else 0.0)
    return float(60.0 * fs / k)


# --------------------------------------------------------------------------------------------- warping

def run_ffmpeg_filter(seg, afilter):
    cmd = ["ffmpeg", "-v", "error", "-nostdin", "-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", "-",
           "-af", afilter, "-f", "f32le", "-ac", "2", "-ar", str(SR), "-"]
    r = subprocess.run(cmd, input=np.ascontiguousarray(seg, dtype=np.float32).tobytes(), capture_output=True)
    if r.returncode != 0:
        raise RuntimeError("ffmpeg %s failed: %s" % (afilter, r.stderr.decode(errors="replace")[-300:]))
    return np.frombuffer(r.stdout, dtype=np.float32).reshape(-1, 2).copy()


def atempo_chain(r):
    parts = []
    while r > 2.0:
        parts.append(2.0)
        r /= 2.0
    while r < 0.5:
        parts.append(0.5)
        r /= 0.5
    parts.append(r)
    return ",".join("atempo=%.8f" % p for p in parts)


_RB_OK = None


def stretch(seg, r, engine):
    """Change the duration of seg by 1/r (tempo r: r>1 plays faster/shorter), pitch preserved."""
    global _RB_OK
    if engine == "rubberband":
        flt = ("rubberband=tempo=%.9f:transients=crisp:detector=compound:phase=laminar:window=standard"
               ":smoothing=off:formant=preserved:pitchq=quality:channels=together" % r)
        try:
            return run_ffmpeg_filter(seg, flt), "rubberband"
        except RuntimeError as e:
            log("rubberband failed (%s); falling back to atempo" % e)
    return run_ffmpeg_filter(seg, atempo_chain(r)), "atempo"


def varispeed_ref(g, r, n_out):
    """Reference timing: play g at speed r by interpolation (exact time mapping, shifted pitch)."""
    t = np.arange(n_out) * r
    return np.interp(t, np.arange(len(g)), g, left=0.0, right=0.0)


def measure_delay(stretched_mono, ref_mono):
    """Lag (samples, + = stretched is late) of the stretcher's output against the exact-timing
    varispeed reference, from 1 kHz low-passed envelopes."""
    sos = signal.butter(4, 1500, "low", fs=SR, output="sos")
    def env(x):
        e = np.abs(signal.sosfilt(sos, x))
        e = signal.resample_poly(e, 1, 48)          # 1 kHz
        return gaussian_filter1d(e, 3.0)
    n = min(len(stretched_mono), len(ref_mono))
    a, b = env(stretched_mono[:n]), env(ref_mono[:n])
    a, b = a - a.mean(), b - b.mean()
    L = len(a)
    c = signal.correlate(a, b, mode="full", method="fft")
    lags = np.arange(-L + 1, L)
    sel = np.abs(lags) <= 80
    c, lags = c[sel], lags[sel]
    k = int(np.argmax(c))
    d = float(lags[k])
    if 0 < k < len(c) - 1:
        y0, y1, y2 = c[k - 1], c[k], c[k + 1]
        den = y0 - 2 * y1 + y2
        if den < 0:
            d += 0.5 * (y0 - y2) / den
    return d * 48.0   # samples at 48 kHz


def slice_zero(y, i0, i1):
    """y[i0:i1] with zeros outside the array."""
    n = i1 - i0
    out = np.zeros((n, y.shape[1]), np.float32)
    a, b = max(i0, 0), min(i1, len(y))
    if b > a:
        out[a - i0:b - i0] = y[a:b]
    return out


def warp(y, tm, dur, engine, notes):
    """out(t) = y(tm.f(t)) for t in [0, dur], by segments between the map's knots."""
    n_out = int(round(dur * SR))
    out = np.zeros((n_out, 2), np.float32)
    ks, ss = tm.k, tm.s
    xf = XFADE / 2.0
    for si in range(len(ks) - 1):
        k0, k1, s0, s1 = ks[si], ks[si + 1], ss[si], ss[si + 1]
        r = (s1 - s0) / (k1 - k0)
        first, last = si == 0, si == len(ks) - 2
        w0 = k0 if first else k0 - xf             # ref-time window this segment renders
        w1 = k1 if last else k1 + xf
        i0, i1 = int(round(w0 * SR)), int(round(w1 * SR))
        i0c, i1c = max(i0, 0), min(i1, n_out)
        if i1c <= i0c:
            continue
        L = i1c - i0c
        # source span for this window, through the segment's own (constant) tempo
        src_a = s0 + (i0c / SR - k0) * r
        if abs(r - 1.0) < 1e-5:
            piece = slice_zero(y, int(round(src_a * SR)), int(round(src_a * SR)) + L)
            used = "slice"
        else:
            ctx = CONTEXT
            a_idx = int(round((src_a - ctx) * SR))
            b_idx = int(round((src_a + L / SR * r + ctx) * SR))
            clip = slice_zero(y, a_idx, b_idx)
            st, used = stretch(clip, r, engine)
            # where does src_a sit in the stretched clip?
            off = (src_a * SR - a_idx) / r
            # exact-timing reference for the delay check
            g = mono(clip)
            rv = varispeed_ref(g, r, len(st))
            lag = measure_delay(mono(st), rv)
            start = off + lag
            notes.append({"segment": si, "tempo": round(r, 6), "engine": used, "stretcher_delay_ms": round(lag / SR * 1000, 2)})
            i_start = int(round(start))
            piece = slice_zero(st, i_start, i_start + L)
        wgt = np.ones(L, np.float32)
        ramp = min(int(round(XFADE * SR)), L)
        if not first:
            wgt[:ramp] *= np.linspace(0.0, 1.0, ramp, endpoint=False, dtype=np.float32)
        if not last:
            wgt[L - ramp:] *= np.linspace(1.0, 0.0, ramp, endpoint=False, dtype=np.float32)
        out[i0c:i1c] += piece * wgt[:, None]
    return out


# --------------------------------------------------------------------------------------------- reporting

def debias(words, bias):
    return [dict(w, start=round(w["start"] - bias, 4), end=round(w["end"] - bias, 4)) for w in words]


def median(a):
    return float(np.median(a)) if len(a) else None


def ms(v):
    return None if v is None else round(1000.0 * v, 1)


def per_group(pairs, ref, key, order):
    groups = {}
    for p in pairs:
        if p.get("outlier"):
            continue
        groups.setdefault(ref[p["i"]][key], []).append(p)
    rows = []
    for name in order:
        g = groups.get(name, [])
        if not g:
            rows.append({key: name, "matched": 0})
            continue
        dts = np.array([p["dt"] for p in g])
        row = {key: name, "matched": len(g), "median_offset_ms": ms(median(dts)),
               "spread_ms": ms(float(np.percentile(dts, 75) - np.percentile(dts, 25)))}
        if len(g) >= 6:
            xs = np.array([p["t_ref"] for p in g])
            if xs.max() - xs.min() > 1.5:
                a, _ = theil_sen(xs, np.array([p["t_rec"] for p in g]))
                row["tempo_ratio"] = round(a, 4)
        rows.append(row)
    return rows


def summarise_residuals(pairs, tm):
    ok = [p for p in pairs if not p.get("outlier")]
    if not ok:
        return {}
    x = np.array([p["t_ref"] for p in ok])
    y = np.array([p["t_rec"] for p in ok])
    r = y - tm.f(x)
    ar = np.abs(r)
    return {"n": len(ok), "median_abs_ms": ms(float(np.median(ar))), "p90_abs_ms": ms(float(np.percentile(ar, 90))),
            "p95_abs_ms": ms(float(np.percentile(ar, 95))), "max_abs_ms": ms(float(ar.max())),
            "median_signed_ms": ms(float(np.median(r))), "rms_ms": ms(float(np.sqrt(np.mean(r * r))))}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("input", nargs="?", default=os.path.join(ROOT, "build", "song.wav"))
    ap.add_argument("--data", default=os.path.join(ROOT, "data", "data.js"))
    ap.add_argument("--out", default=os.path.join(ROOT, "build", "song.retimed.wav"))
    ap.add_argument("--report", default=os.path.join(ROOT, "build", "retime-report.json"))
    ap.add_argument("--vocals", help="measure the words on this vocal-only file instead of the input")
    ap.add_argument("--model", default="auto", choices=["auto", "none", "const", "linear", "piecewise"],
                    help="force the correction model (auto picks the simplest that fits)")
    ap.add_argument("--sync", default="auto", choices=["auto", "lyrics", "beats"],
                    help="what to trust: lyric words (default; beats if too few words are recognised) or the beat grid")
    ap.add_argument("--measure-only", action="store_true", help="report only; write no audio")
    ap.add_argument("--no-verify", action="store_true", help="skip re-measuring the corrected file")
    ap.add_argument("--include-choir", action="store_true", help="also align echoes, la-las and gangs")
    ap.add_argument("--min-correction-ms", type=float, default=15.0,
                    help="below this largest offset the file is only trimmed/padded to length (default 15)")
    ap.add_argument("--bias-ms", type=float, default=1000 * LYRIC_BIAS,
                    help="how early Whisper stamps a sung word against its note start (default %.0f, measured on "
                         "build/song.wav); 0 shows raw numbers" % (1000 * LYRIC_BIAS))
    ap.add_argument("--whisper-model", default="small.en")
    ap.add_argument("--cache-dir", default=os.path.join(ROOT, "build", "retime-cache"))
    ap.add_argument("--no-cache", action="store_true")
    args = ap.parse_args()

    data = read_data_js(args.data)
    dur = data["dur"]
    ref = ref_words(data["lyrics"], args.include_choir)
    section_order = [s["name"] for s in data["sections"]]
    line_order = [l["id"] for l in data["lyrics"] if not l.get("role") or args.include_choir]
    engine = "rubberband" if have_filter("rubberband") else "atempo"

    log("loading %s" % args.input)
    y = load_audio(args.input)
    in_dur = len(y) / SR
    yv = load_audio(args.vocals) if args.vocals else y
    report = {"input": os.path.abspath(args.input), "data_js": os.path.abspath(args.data),
              "video_duration_s": dur, "input_duration_s": round(in_dur, 3),
              "length_difference_s": round(in_dur - dur, 3), "stretch_engine": engine,
              "convention": "offset = input time minus video time; positive = the input is late"}

    # ---- measure
    bias = args.bias_ms / 1000.0
    x16 = resample_to(mono(yv), WHISPER_SR)
    words = transcribe(x16, data["lyrics"], args.cache_dir, "input", args.whisper_model, not args.no_cache)
    m = measure(ref, debias(words, bias), dur)
    pairs = m["pairs"]
    ok_pairs = [p for p in pairs if not p.get("outlier")]
    report["lyric_bias_ms"] = args.bias_ms
    report["transcription"] = {"words_recognised": len(words), "words_in_score": len(ref),
                               "matched": len(pairs), "outliers": len(pairs) - len(ok_pairs),
                               "matched_fraction": round(len(pairs) / max(len(ref), 1), 3)}
    models, chosen, stats = {}, "none", {}
    if m["ok"] and len(ok_pairs) >= 8:
        x = np.array([p["t_ref"] for p in ok_pairs])
        yv_ = np.array([p["t_rec"] for p in ok_pairs])
        models["const"] = fit_const(x, yv_, dur)
        models["linear"] = fit_linear(x, yv_, dur)
        bounds = [s["start"] for s in data["sections"]]
        models["piecewise"] = fit_piecewise(x, yv_, dur, bounds)
        chosen, stats = choose_model(models, x, yv_, args.model if args.model != "none" else "auto")
        lin = models["linear"].extra
        report["global"] = {
            "median_offset_ms": ms(median([p["dt"] for p in ok_pairs])),
            "linear_fit": {"scale": round(lin["scale"], 6), "offset_ms": ms(lin["offset"]),
                           "tempo_ratio_input_over_video": round(lin["scale"], 6),
                           "measured_bpm": round(data["bpm"] / lin["scale"], 3),
                           "drift_at_end_ms": ms(lin["scale"] * dur + lin["offset"] - dur)},
            "piecewise_knots": [{"video_s": round(float(k), 3), "offset_ms": ms(float(s - k))}
                                for k, s in zip(models["piecewise"].k, models["piecewise"].s)],
            "models": stats, "chosen_by_auto": chosen}
        report["sections"] = per_group(pairs, ref, "section", section_order)
        report["lines"] = per_group(pairs, ref, "line", line_order)
        report["words"] = [{"w": ref[p["i"]]["text"], "line": ref[p["i"]]["line"], "t_video": round(p["t_ref"], 3),
                            "offset_ms": ms(p["dt"]), "outlier": p["outlier"]} for p in pairs]
    else:
        report["global"] = {"note": "too few recognised lyric words to measure (%d paired)" % len(ok_pairs)}

    # ---- onsets and beats
    tm_lyric = models.get(chosen) if models else None
    x24 = resample_to(mono(y), 24000)
    times, env, fs = onset_envelope(x24)
    beat_res, on_src, (ba, bb) = beat_analysis(times, env, fs, data, tm_lyric, fix_scale=(chosen == "const"))
    beat_res["tempo_estimate_bpm"] = round(tempo_estimate(times, env, fs), 2)
    bb_true = bb - BEAT_BIAS
    beat_res["beat_map"] = {"scale": round(ba, 6), "offset_ms": ms(bb_true), "raw_offset_ms": ms(bb),
                            "note": "offset corrected for the detector's own bias (%.1f ms)" % (1000 * BEAT_BIAS)}
    beat_tm = TimeMap("linear", [0.0, dur], [bb_true, ba * dur + bb_true], {"scale": ba, "offset": bb_true})
    report["beats"] = beat_res
    ident = TimeMap("none", [0.0, dur], [0.0, dur])
    if tm_lyric is not None:
        beat_res["beat_map_minus_lyric_map_ms"] = {
            "at_0": ms(float(beat_tm.offset(0.0) - tm_lyric.offset(0.0))),
            "at_mid": ms(float(beat_tm.offset(dur / 2) - tm_lyric.offset(dur / 2))),
            "at_end": ms(float(beat_tm.offset(dur) - tm_lyric.offset(dur)))}
    beat_good = beat_res["contrast"] >= 3.0

    # ---- decide the correction
    use = args.sync
    note = []
    if args.model == "none":
        tm, kind = ident, "none"
    elif tm_lyric is None or use == "beats":
        if not beat_good:
            note.append("too few lyric words and a weak beat grid: nothing to correct from")
            tm, kind = ident, "none"
        else:
            tm, kind, use = beat_tm, "linear (beat grid)", "beats"
    else:
        tm, kind, use = tm_lyric, chosen + " (lyrics)", "lyrics"
        if args.sync != "lyrics" and beat_good:
            if chosen in ("const", "linear"):
                gap = max(abs(float(beat_tm.offset(t) - tm_lyric.offset(t))) for t in (0.0, dur / 2, dur))
                if gap <= 0.10:
                    tm, kind, use = beat_tm, chosen + " (lyrics, fine-tuned on the beat grid)", "lyrics+beats"
                else:
                    note.append("beat grid disagrees with the lyric map by %.0f ms: kept the lyric map" % (1000 * gap))
            else:
                tm2, nref = refine_piecewise_beats(tm_lyric, times, env, data)
                tm, kind, use = tm2, "piecewise (lyrics, %d sections fine-tuned on the beat grid)" % nref, "lyrics+beats"
    swing = float(np.max(np.abs(tm.offset(np.linspace(0, dur, 400))))) * 1000
    if tm.kind != "none" and swing < args.min_correction_ms:
        note.append("largest correction %.1f ms is under --min-correction-ms: only the length is fixed" % swing)
        tm, kind = ident, "none (within measurement noise)"
    tp = tm.tempos()
    if np.any(tp < 0.8) or np.any(tp > 1.25):
        note.append("a segment would be stretched by more than 25%: check the input")
    if tm_lyric is not None:
        after = TimeMap(tm.kind, tm.k, tm.s)
        report["onsets_on_8th_grid"] = {"uncorrected": onset_grid_report(on_src, ident, data, BEAT_BIAS),
                                        "after_correction": onset_grid_report(on_src, after, data, BEAT_BIAS)}
    report["correction"] = {"sync_source": use, "model": kind,
                            "tempo_per_segment": [round(float(v), 6) for v in tp],
                            "knots_video_s": [round(float(v), 3) for v in tm.k],
                            "knots_input_s": [round(float(v), 3) for v in tm.s], "notes": note}
    if tm.kind == "none" and abs(report["length_difference_s"]) > 0.05:
        note.append("length differs; the output is trimmed/padded to the video duration")
    if ok_pairs:
        report["predicted_residual_after_correction"] = summarise_residuals(pairs, tm)

    # ---- apply
    if not args.measure_only:
        notes = []
        out = warp(y, tm, dur, engine, notes)
        pk = float(np.max(np.abs(out))) if len(out) else 0.0
        if pk > 0.999:
            out = out * (0.999 / pk)
            notes.append({"peak_scaled_by": round(0.999 / pk, 4)})
        os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
        sf.write(args.out, out, SR, subtype="PCM_24")
        report["output"] = os.path.abspath(args.out)
        report["correction"]["warp_notes"] = notes
        # ---- verify: measure the corrected file again, on the same terms
        if not args.no_verify and m["ok"]:
            vsrc = out if not args.vocals else warp(yv, tm, dur, engine, [])
            w2 = transcribe(resample_to(mono(vsrc), WHISPER_SR), data["lyrics"], args.cache_dir, "retimed",
                            args.whisper_model, not args.no_cache)
            m2 = measure(ref, debias(w2, bias), dur)
            ok2 = [p for p in m2["pairs"] if not p.get("outlier")]
            if ok2:
                res = summarise_residuals(m2["pairs"], ident)
                res["matched"] = len(m2["pairs"])
                res["outliers"] = len(m2["pairs"]) - len(ok2)
                res["note"] = ("word error = recognised start minus score start after bias correction; Whisper's "
                               "word stamps on singing are noisy to about +-100 ms, so the max is mostly noise "
                               "and the median and the beat-grid numbers are the ones to trust")
                lin2 = fit_linear(np.array([p["t_ref"] for p in ok2]), np.array([p["t_rec"] for p in ok2]), dur).extra
                res["remaining_linear_fit"] = {"scale": round(lin2["scale"], 6), "offset_ms": ms(lin2["offset"])}
                res["median_offset_ms"] = res["median_signed_ms"]
                report["verification"] = res
                report["sections_after"] = per_group(m2["pairs"], ref, "section", section_order)
            onx = onset_envelope(resample_to(mono(out), 24000))
            _, on2, (a2, b2) = beat_analysis(onx[0], onx[1], onx[2], data, None)
            report["beats_after"] = {"beat_map": {"scale": round(a2, 6), "offset_ms": ms(b2 - BEAT_BIAS)},
                                     "onsets_on_8th_grid": onset_grid_report(on2, ident, data, BEAT_BIAS)}
    os.makedirs(os.path.dirname(os.path.abspath(args.report)), exist_ok=True)
    json.dump(report, open(args.report, "w"), indent=2)
    print_summary(report)


def print_summary(r):
    P = print
    P("retime: %s" % os.path.basename(r["input"]))
    P("  length %.3f s vs video %.3f s (%+.3f s)" % (r["input_duration_s"], r["video_duration_s"], r["length_difference_s"]))
    t = r["transcription"]
    P("  words: %d recognised, %d/%d lyric words paired (%.0f%%), %d outliers"
      % (t["words_recognised"], t["matched"], t["words_in_score"], 100 * t["matched_fraction"], t["outliers"]))
    g = r.get("global", {})
    if "linear_fit" in g:
        lf = g["linear_fit"]
        P("  global offset (median) %+.0f ms; linear map: scale %.5f (%.2f BPM equivalent), offset %+.0f ms, drift at end %+.0f ms"
          % (g["median_offset_ms"], lf["scale"], lf["measured_bpm"], lf["offset_ms"], lf["drift_at_end_ms"]))
        P("  model residuals (robust rms ms): " + ", ".join("%s %.0f" % (k, v["robust_rms_ms"]) for k, v in g["models"].items()))
        P("  per section (median offset ms, n):")
        row = []
        for s in r["sections"]:
            row.append("%s %s (%d)" % (s["section"], "n/a" if s["matched"] == 0 else "%+.0f" % s["median_offset_ms"], s["matched"]))
        P("    " + "; ".join(row))
    else:
        P("  " + g.get("note", ""))
    b = r["beats"]
    P("  beats: tempo estimate %.1f BPM; beat-grid map scale %.5f, offset %+.0f ms (contrast %.1f)"
      % (b["tempo_estimate_bpm"], b["beat_map"]["scale"], b["beat_map"]["offset_ms"], b["contrast"]))
    if "onsets_on_8th_grid" in r:
        u, a = r["onsets_on_8th_grid"]["uncorrected"], r["onsets_on_8th_grid"]["after_correction"]
        P("  strongest onsets on the 8th-note grid: as received %s%% within 30 ms; after the correction %s%%"
          % (u.get("within_30ms_pct"), a.get("within_30ms_pct")))
    c = r["correction"]
    P("  correction: %s [sync %s]" % (c["model"], c["sync_source"]))
    for n in c["notes"]:
        P("    note: " + n)
    if c["knots_video_s"] and len(c["knots_video_s"]) <= 4:
        P("    tempo per segment: %s" % c["tempo_per_segment"])
    if "predicted_residual_after_correction" in r:
        p = r["predicted_residual_after_correction"]
        P("  predicted word error after correction: median %.0f ms, p90 %.0f ms, max %.0f ms" % (p["median_abs_ms"], p["p90_abs_ms"], p["max_abs_ms"]))
    if "verification" in r:
        v = r["verification"]
        P("  VERIFIED on %s: word error median %.0f ms, p90 %.0f ms, p95 %.0f ms, max %.0f ms (n=%d, signed median %+.0f ms)"
          % (os.path.basename(r["output"]), v["median_abs_ms"], v["p90_abs_ms"], v["p95_abs_ms"], v["max_abs_ms"], v["n"], v["median_signed_ms"]))
    if "beats_after" in r:
        ba = r["beats_after"]
        P("  VERIFIED beat grid after correction: offset %+.0f ms, scale %.5f, %s%% of strong onsets within 30 ms of the 8th grid"
          % (ba["beat_map"]["offset_ms"], ba["beat_map"]["scale"], ba["onsets_on_8th_grid"].get("within_30ms_pct")))
    if "output" in r:
        P("  wrote %s" % r["output"])


if __name__ == "__main__":
    main()
