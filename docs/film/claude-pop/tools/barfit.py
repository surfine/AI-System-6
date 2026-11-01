#!/usr/bin/env python3
"""barfit.py: fit a freely generated song to the picture's section plan with whole-bar edits.

A free ACE-Step generation (same lyrics, 120 BPM, G major, ~154 s) sings the right lines in the right order, but the
model picks its own section lengths (an intro 4 bars short, a post-chorus 2 bars long) and sometimes packs a verse's
lines a bar apart instead of two.  Offsets of whole bars are far beyond what tools/warp.py may bend the picture by
(rate 0.8-1.25), so this tool removes them from the AUDIO, on the song's own bar lines, without ever cutting or
repeating a sung word; tools/warp.py then bends the picture for the sub-bar residual.

    python3 -I tools/barfit.py build/ace/NEW.wav                 # fit -> build/song.fitted.wav, re-measured
    python3 -I tools/warp.py                                     # picture follows the residual -> data/warp.js
    python3 -I tools/barfit.py build/ace/NEW.wav --silent-pen    # same fit + the silent pen at the warped times
    cp build/song.fitted.wav build/song.wav

(--pen-only re-applies the silent pen to the kept clean fit without refitting.)

How it works
  1. MEASURE  tools/retime.py --measure-only on the input (its per-section offsets go in the before/after table),
              plus a line-level alignment of the same Whisper transcript (retime's cache, retime's DP aligner) with
              a wide, local time prior, so ramps such as a compressed intro are followed instead of dropped.
              Offsets follow retime's convention: song time minus picture time, negative = the song is early.
  2. GRID     the song's own beat grid (period and phase fitted to a spectral-flux onset envelope) and its downbeat:
              which of the 4 beats shows the most harmonic change between the bar before and the bar after
              (chroma) plus low-band kick onsets (this picks the known downbeat of build/song.wav; ACE-Step singers
              often start a line a beat before the bar, so line starts are only reported).  A head shift P (silence
              padded, or a silent pre-roll trimmed; under one bar) is chosen on the song's beat lattice, so its drums
              land on BEATS, to minimise the lines' residual after whole-bar edits.
  3. PLAN     every lyric line with >= --min-words recognised words is an anchor; it needs
              C = round(-(offset + P) / bar) whole bars inserted (C > 0) or deleted (C < 0) before it (an offset near a
              half bar keeps the previous C; single-line blips are median-filtered out).  Where C changes between two
              anchors, the edit goes in the stretch from the previous line's last word to this line's first (by
              default between any two lines; --sections-only: only before a section's first line, the strict
              "section boundary" reading).  The demucs (htdemucs) vocal stem V decides where, without ever cutting
              or repeating a sung word:
                insert N  1. vocal-free bars just before the next line: duplicated (looped if fewer than N);
                          2. otherwise the accompaniment A = mix - V of the bar holding the widest vocal gap in the
                             stretch is duplicated on its bar line while V gets the same length of silence inside
                             the gap: an instrumental bar opens between the two lines.  Since A + V = mix, all audio
                             outside the edit is the input, bit for bit, shifted by whole bars;
                          3. before the first line, with no gap at all: N bars of silence at the head;
                          4. a lyric-free span (la-la, ad-lib) of one bar, cut on beats inside vocal gaps, duplicated.
                delete N  N whole bars, both cuts on a beat line (a downbeat preferred) inside a vocal gap, holding
                          no lyric word (vocal-free preferred, else only la-la / fillers; Whisper heard no lyric word
                          and no lead word was paired there), nearest the next line.
              When N bars cannot be placed, N-1 or N+1 is tried if it still lands within 0.75 bar; an edit that
              cannot be placed safely is skipped and reported, never forced.
  4. RENDER   source pieces joined 5 ms before the beat (attacks stay whole) with 20 ms crossfades (--xfade-ms, 15-30):
              equal power at a splice; equal gain where both sides are nearly the same signal (a mix/accompaniment
              switch inside a vocal gap, or two bars correlating above 0.5), which equal power would bump +3 dB.
              Samples that would exceed full scale (an accompaniment-only bar can) are pulled down locally (2 ms
              attack, 40 ms release); nothing else is scaled.  The length is made exactly DUR: a 1.5 s fade-out if
              trimmed, silence if padded.  Output: build/song.fitted.wav, 48 kHz stereo 24 bit.
  5. VERIFY   retime.py --measure-only on the fitted file -> build/retime-report.json (what tools/warp.py reads);
              build/barfit-report.json holds the grid, anchors, plan, edits, joins and per-section offsets
              (retime's section medians before, the plan's prediction, and retime's medians measured after).

Silent pen (--silent-pen, optional): the picture's silent-pen moment (HITS.bandOut, .keystroke, .slamBack in
data/data.js) is mapped back to song time through data/warp.js when it exists (inverse of song -> picture; --no-warp
for identity).  The whole mix ducks to silence over 20 ms from bandOut, holds, a synthetic key-down click (band-passed
noise burst + a tiny 3 kHz ping, ~40 ms, --key-db peak) sits at keystroke, and the mix returns at slamBack with a
10 ms fade-in.  The clean fit is kept as build/song.fitted.clean.wav (re-measuring uses it) and a 4 s excerpt with an
RMS check goes to build/silent-pen-excerpt.wav.  The warp should come from the fitted song, so run the fit, then
tools/warp.py, then add the pen (the fit is deterministic and every analysis is cached, so a rerun is quick).

Options: --plan-only (no audio), --sections-only, --no-phase (P = 0), --min-words N (2), --vocal-db D (a 10 ms frame
is "sung" within D dB of the stem's loud level, default 30), --min-gap S (shortest usable vocal gap, 0.06),
--no-remeasure, --out/--report/--retime-report paths.  Analyses are cached: Whisper in build/retime-cache, the
vocal stem in build/barfit-cache (demucs takes ~5-15 min on CPU the first time).
data/data.js and src/ are only read.
"""
import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import time

import numpy as np
import soundfile as sf
from scipy import signal

TOOLS = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(TOOLS)
sys.path.insert(0, TOOLS)
import retime  # noqa: E402  (audio io, onset envelope, Whisper cache, DP aligner, data.js reader)

SR = retime.SR
BUILD = os.path.join(ROOT, "build")
CACHE = os.path.join(BUILD, "barfit-cache")
PRE_ATTACK = 0.005        # bar cuts sit this far before the bar line, so a downbeat's attack is never split
EDGE = 0.06               # a bar line is "clean" when no sung frame lies within this distance of it
FRAME = 0.010             # vocal-activity frame, s
FILLERS = {"la", "lala", "lalala", "lalalala", "oh", "ooh", "ah", "aah", "yeah", "hey", "mm", "mmm", "na", "nana",
           "ha", "uh", "woah", "whoa", "ooo", "oooh", "da", "do"}


def log(*a):
    print(*a, file=sys.stderr, flush=True)


# --------------------------------------------------------------------------------------------- data.js

def read_const(path, name):
    txt = open(path, encoding="utf-8").read()
    m = re.search(r"const %s = " % name, txt)
    if not m:
        return None
    obj, _ = json.JSONDecoder().raw_decode(txt[m.end():])
    return obj


def read_warp(path):
    """data/warp.js -> (songT array, pictureT array) or None."""
    if not path or not os.path.exists(path):
        return None
    pts = read_const(path, "WARP")
    if not pts:
        return None
    a = np.array(pts, float)
    return a[:, 0], a[:, 1]


# --------------------------------------------------------------------------------------------- measuring

def measure(path, report_path):
    """Run retime.py --measure-only and return its report."""
    cmd = [sys.executable, "-I", os.path.join(TOOLS, "retime.py"), path, "--measure-only", "--report", report_path]
    log("measuring %s with retime.py ..." % os.path.relpath(path, ROOT))
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit("retime.py failed on %s:\n%s" % (path, (r.stderr or r.stdout)[-1500:]))
    return json.load(open(report_path))


def section_medians(rep):
    return {s["section"]: (s.get("median_offset_ms"), s.get("matched", 0)) for s in rep.get("sections", [])}


def align_lines(data, words):
    """Lead-lyric words aligned to the (debiased) transcript with a local time prior that is allowed to ramp.
    Returns (pairs, rec): pairs = [{i, j, t_pic, t_song, end_song, dt, outlier}]."""
    ref = retime.ref_words(data["lyrics"])
    rec = retime.debias(words, retime.LYRIC_BIAS)
    if len(rec) < 8:
        return [], rec, ref
    rt = np.array([r["start"] for r in ref])
    ct = np.array([r["start"] for r in rec])

    def exact(pairs, strict=True):
        keep = [(i, j) for i, j, s in pairs if s >= 0.99 and (len(ref[i]["tok"]) >= 3 or not strict)]
        if len(keep) < 8 and strict:
            return exact(pairs, False)
        return np.array([k[0] for k in keep], int), np.array([k[1] for k in keep], int)

    pairs = retime.dp_align(ref, rec, rt.copy(), tol=12.0, wt=0.3)
    pred = rt.copy()
    for tol, half in ((1.5, 8.0), (0.8, 5.0), (0.5, 3.0)):
        ii, jj = exact(pairs)
        if len(ii) < 6:
            break
        res = ct[jj] - rt[ii]
        trend = retime.local_median_offset(rt[ii], res, rt[ii], half=half * 1.5, min_n=3)
        keep = np.abs(res - trend) < 1.5
        pred = rt + retime.local_median_offset(rt[ii][keep], res[keep], rt, half=half, min_n=3)
        pairs = retime.dp_align(ref, rec, pred, tol=tol, wt=1.0)
    out = [{"i": i, "j": j, "t_pic": float(rt[i]), "t_song": float(ct[j]), "end_song": float(rec[j]["end"]),
            "dt": float(ct[j] - rt[i])} for i, j, s in pairs]
    if out:
        xs = np.array([o["t_pic"] for o in out])
        dts = np.array([o["dt"] for o in out])
        trend = retime.local_median_offset(xs, dts, xs, half=3.0, min_n=4)
        for o, tr in zip(out, trend):
            o["outlier"] = bool(abs(o["dt"] - tr) > 0.6)
    return out, rec, ref


def line_anchors(data, pairs, ref, min_words):
    lines = {l["id"]: l for l in data["lyrics"]}
    by = {}
    for p in pairs:
        if not p["outlier"]:
            by.setdefault(ref[p["i"]]["line"], []).append(p)
    out = []
    for l in data["lyrics"]:
        g = by.get(l["id"], [])
        if l.get("role") or len(g) < min_words:
            continue
        o = float(np.median([p["dt"] for p in g]))
        first, last = l["words"][0]["start"], l["words"][-1]["end"]
        out.append({"line": l["id"], "section": l["section"], "pic_start": float(l["start"]), "pic_end": float(l["end"]),
                    "offset": o, "matched": len(g), "text": l["text"],
                    "song_start": min(min(p["t_song"] for p in g), first + o),
                    "first_word_start": min(p["t_song"] for p in g), "last_word_start": max(p["t_song"] for p in g)})
    out.sort(key=lambda a: a["pic_start"])
    assert all(lines[a["line"]] for a in out)
    return out


# --------------------------------------------------------------------------------------------- beat grid

def fit_grid(y, bpm):
    """Steady beat grid of the song: (period_s, phase_s, contrast) maximising the onset envelope at the beats."""
    x24 = retime.resample_to(retime.mono(y), 24000)
    times, env, _ = retime.onset_envelope(x24)
    dur = len(y) / SR
    T0 = 60.0 / bpm

    def score(T, phs):
        phs = np.atleast_1d(np.asarray(phs, float))
        k = np.arange(0, int((dur - T) / T))
        bt = phs[:, None] + k[None, :] * T + retime.BEAT_BIAS
        return np.interp(bt, times, env, left=0.0, right=0.0).mean(axis=1)

    best = (-1.0, T0, 0.0)
    for T in np.linspace(T0 * 0.99, T0 * 1.01, 81):
        phs = np.arange(0.0, T, 0.004)
        s = score(T, phs)
        i = int(np.argmax(s))
        if s[i] > best[0]:
            best = (float(s[i]), float(T), float(phs[i]))
    _, T, ph = best
    for dT, dph in ((T0 * 2e-4, 0.0005), (T0 * 4e-5, 0.0001)):     # local refinement of both
        cands = []
        for Tc in T + np.arange(-12, 13) * dT:
            phs = ph + np.arange(-12, 13) * dph
            s = score(Tc, phs)
            i = int(np.argmax(s))
            cands.append((float(s[i]), float(Tc), float(phs[i])))
        _, T, ph = max(cands)
    on = float(score(T, ph)[0])
    off = float(np.mean(score(T, [ph + T / 4, ph + 3 * T / 4])))      # sixteenth-note positions
    return float(T), float(ph % T), round(on / max(off, 1e-9), 2)


def audio_downbeat(y, T, ph):
    """Which beat (0-3 after ph) starts the bar, from the audio: harmonic change across the beat (chroma of the bar
    after vs the bar before) + 0.5 x low-band (30-160 Hz) onset strength, as z-scores over the 4 candidate phases.
    (On build/song.wav, whose downbeat is known, this picks it; ACE-Step songs often start lines a beat early.)"""
    import librosa
    x22 = signal.resample_poly(retime.mono(y), 147, 320).astype(np.float32)          # 48000 -> 22050
    hop = 512
    chroma = librosa.feature.chroma_cqt(y=x22, sr=22050, hop_length=hop)
    ct = np.arange(chroma.shape[1]) * hop / 22050.0
    f, t, Z = signal.stft(x22, 22050, nperseg=2048, noverlap=2048 - 256, boundary=None, padded=False)
    lo = np.log1p(30 * np.abs(Z[(f >= 30) & (f <= 160)]).sum(axis=0))
    lof = np.concatenate([[0.0], np.maximum(0.0, np.diff(lo))])
    lt = t - 512 / 22050.0
    beats = np.arange(ph + 4 * T, len(y) / SR - 4 * T, T)
    nov, kick = np.zeros(len(beats)), np.zeros(len(beats))
    for i, b in enumerate(beats):
        a, c = (ct >= b - 4 * T) & (ct < b), (ct >= b) & (ct < b + 4 * T)
        va, vc = chroma[:, a].mean(axis=1), chroma[:, c].mean(axis=1)
        nov[i] = 1.0 - float(np.dot(va, vc) / (np.linalg.norm(va) * np.linalg.norm(vc) + 1e-9))
        w = (lt >= b - 0.03) & (lt <= b + 0.04)
        kick[i] = lof[w].max() if w.any() else 0.0
    idx = np.round((beats - ph) / T).astype(int) % 4
    sn = np.array([nov[idx == p].mean() for p in range(4)])
    sk = np.array([kick[idx == p].mean() for p in range(4)])
    z = lambda v: (v - v.mean()) / (v.std() + 1e-9)  # noqa: E731
    comb = z(sn) + 0.5 * z(sk)
    return int(np.argmax(comb)), {"bar_harmonic_change": [round(float(v), 4) for v in sn],
                                  "kick": [round(float(v), 3) for v in sk], "combined": [round(float(v), 3) for v in comb]}


def line_start_beats(data, pairs, ref, T, ph):
    """How many lyric lines start on each beat (0-3 after ph) of the song: reported, not used."""
    first = {l["id"]: l["words"][0]["start"] for l in data["lyrics"]}
    k = [int(round((p["t_song"] - ph) / T)) % 4 for p in pairs
         if not p["outlier"] and abs(ref[p["i"]]["start"] - first[ref[p["i"]]["line"]]) < 1e-6]
    return np.bincount(np.array(k, int), minlength=4).tolist() if k else [0, 0, 0, 0]


# --------------------------------------------------------------------------------------------- vocals

def vocal_stem(y):
    """Demucs (htdemucs) vocal stem of y, (N, 2) float32 at 48 kHz; cached by audio hash."""
    key = hashlib.md5(y[::7].tobytes()).hexdigest()[:16]
    cpath = os.path.join(CACHE, "vocals-%s.npy" % key)
    if os.path.exists(cpath):
        log("vocal stem from cache %s" % os.path.basename(cpath))
        v = np.load(cpath).astype(np.float32)
    else:
        os.environ.setdefault("HF_HUB_OFFLINE", "1")
        import torch
        from demucs.apply import apply_model
        from demucs.pretrained import get_model
        torch.set_num_threads(os.cpu_count() or 4)
        t0 = time.time()
        model = get_model("htdemucs")
        model.eval()
        x = signal.resample_poly(y, 147, 160, axis=0).astype(np.float32) if model.samplerate == 44100 else y
        wav = torch.from_numpy(np.ascontiguousarray(x.T))
        ref = wav.mean(0)
        mu, sd = ref.mean(), ref.std() + 1e-8
        with torch.no_grad():
            src = apply_model(model, ((wav - mu) / sd)[None], device="cpu", split=True, overlap=0.25, progress=False)[0]
        v = (src[model.sources.index("vocals")] * sd).numpy().T          # vocals carry no DC share
        if model.samplerate == 44100:
            v = signal.resample_poly(v, 160, 147, axis=0)
        v = v.astype(np.float32)
        os.makedirs(CACHE, exist_ok=True)
        np.save(cpath, v.astype(np.float16))
        log("demucs vocal stem: %.0f s" % (time.time() - t0))
    if len(v) < len(y):
        v = np.pad(v, ((0, len(y) - len(v)), (0, 0)))
    return v[:len(y)]


class Vocals:
    """Sung / not sung per 10 ms frame of the vocal stem."""

    def __init__(self, v, rel_db):
        hop = int(FRAME * SR)
        x = retime.mono(v)
        n = len(x) // hop
        rms = np.sqrt(np.mean(x[:n * hop].reshape(n, hop) ** 2, axis=1) + 1e-12)
        self.db = 20 * np.log10(rms + 1e-9)
        self.loud = float(np.percentile(self.db, 95))
        self.thr = max(self.loud - rel_db, -65.0)
        self.active = self.db > self.thr

    def _idx(self, t0, t1):
        return max(0, int(np.floor(t0 / FRAME))), min(len(self.active), int(np.ceil(t1 / FRAME)))

    def frac(self, t0, t1):
        i0, i1 = self._idx(t0, t1)
        return float(self.active[i0:i1].mean()) if i1 > i0 else 0.0

    def free(self, t0, t1):
        """No sung frame in [t0 - EDGE, t1 + EDGE] (two stray frames tolerated)."""
        i0, i1 = self._idx(t0 - EDGE, t1 + EDGE)
        return int(self.active[i0:i1].sum()) <= 2

    def clean_at(self, t):
        i0, i1 = self._idx(t - EDGE, t + EDGE)
        return not self.active[i0:i1].any()

    def gaps(self, t0, t1, min_len):
        """Unsung runs inside [t0, t1] at least min_len long: [(a, b)]."""
        i0, i1 = self._idx(t0, t1)
        q = ~self.active[i0:i1]
        out, k = [], 0
        while k < len(q):
            if q[k]:
                j = k
                while j < len(q) and q[j]:
                    j += 1
                a, b = (i0 + k) * FRAME, (i0 + j) * FRAME
                if b - a >= min_len:
                    out.append((a, b))
                k = j
            else:
                k += 1
        return out


# --------------------------------------------------------------------------------------------- planning

class Grid:
    def __init__(self, phi, bar, n_src_s):
        self.phi, self.bar = phi, bar
        self.n = int((n_src_s - phi) / bar)

    def line(self, k):
        return self.phi + k * self.bar

    def bars_in(self, t0, t1, slack=0.0):
        k0 = int(np.ceil((t0 - slack - self.phi) / self.bar))
        k1 = int(np.floor((t1 + slack - self.phi) / self.bar))
        return [k for k in range(max(k0, 0), min(k1, self.n + 1)) if k < self.n]


def bars_needed(anchors, head, bar, band=0.35):
    """C per anchor.  An offset within +-(0.5 - band) bar of a half bar keeps the previous C when that is one of
    the two candidates (no flip-flop on a half-bar phrasing), then a 3-point median removes single-line blips
    (at the ends, a blip is judged against its one neighbour)."""
    raw, prev = [], 0
    for a in anchors:
        x = -(a["offset"] + head) / bar
        c = int(round(x))
        if abs(x - c) > band and prev in (int(np.floor(x)), int(np.ceil(x))):
            c = prev
        raw.append(c)
        prev = c
    c = list(raw)
    n = len(raw)
    for i in range(n):
        lo, hi = raw[i - 1] if i > 0 else raw[min(1, n - 1)], raw[i + 1] if i < n - 1 else raw[max(n - 2, 0)]
        c[i] = int(np.median([lo, raw[i], hi]))
    return raw, c


def choose_head(anchors, T, ph, bar, preroll, contrast, no_phase):
    """Head shift P (pad > 0, trim < 0): on the song's beat lattice (so its drums land on BEATS) when the grid is
    clear, within [-preroll, bar), minimising the anchors' residual after whole-bar edits (word-weighted, capped)."""
    if no_phase:
        return 0.0, {}
    o = np.array([a["offset"] for a in anchors])
    w = np.array([a["matched"] for a in anchors], float)

    def cost(P):
        r = (o + P + bar / 2) % bar - bar / 2
        return float(np.sum(w * np.minimum(np.abs(r), 0.75)) / w.sum())
    if contrast >= 2.0:
        cands = [P for P in (-ph + m * T for m in range(-1, 5)) if -preroll - 1e-9 <= P < bar - 1e-9]
    else:
        cands = [P for P in np.arange(-preroll, bar, 0.01)]
    cands = cands or [0.0]
    costs = {round(P, 4): round(cost(P), 4) for P in cands}
    best = min(cands, key=lambda P: (round(cost(P), 3), abs(P)))
    return float(best), costs


def lyric_free(t0, t1, rec, pairs):
    """No lyric word (anything but la/oh/ooh...) heard in [t0, t1), and no paired lead word."""
    for w in rec:
        if t0 <= 0.5 * (w["start"] + w["end"]) < t1 and w["tok"] not in FILLERS:
            return False
    return not any(t0 <= p["t_song"] < t1 for p in pairs)


def plan(anchors, cs, head, sections_only, grid, voc, rec, pairs, min_gap):
    """Edits between consecutive anchors where C changes.  If the exact number of bars cannot be placed safely,
    one bar more or fewer is tried (whichever leaves the smaller residual first)."""
    edits, notes = [], []
    c_prev, prev = 0, None
    seen_sections, failing = set(), False
    for a, c in zip(anchors, cs):
        boundary = a["section"] not in seen_sections
        seen_sections.add(a["section"])
        if sections_only and not boundary:
            a["bars"] = c_prev
            continue
        if c != c_prev:
            # between the previous line's last word onset and this line's first; the vocal stem finds the gap
            # (Whisper's word END times run late, so they are not used)
            r0 = 0.0 if prev is None else prev["last_word_start"] + 0.12
            r1 = a["first_word_start"] - 0.06
            x = -(a["offset"] + head) / grid.bar            # ideal cumulative bars, fractional
            opts = sorted({c, c - 1, c + 1} - {c_prev}, key=lambda k: (abs(k - x), k != c))
            e = None
            for ct in opts:
                if abs(ct - c) == 1 and abs(ct - x) > 0.75:      # a bar more or fewer only if it still fits
                    continue
                e = place(ct - c_prev, r0, r1, prev is None, grid, voc, rec, pairs, min_gap)
                if e is not None:
                    break
            if e is None:
                if not failing:
                    notes.append("before %s (%s): no safe place for %+d bar(s) in song %.2f-%.2f s: skipped"
                                 % (a["line"], a["section"], c - c_prev, r0, r1))
                failing = True
                c = c_prev
            else:
                failing = False
                e.update({"before_line": a["line"], "section": a["section"], "wanted": c - c_prev,
                          "region_song_s": [round(r0, 3), round(r1, 3)]})
                c = c_prev + e["bars_signed"]
                edits.append(e)
        a["bars"] = c
        c_prev, prev = c, a
    return edits, notes


def beat_cuts(t0, t1, grid, T, ph):
    """Beat lines (cut positions, PRE_ATTACK before the beat) inside [t0, t1], latest first, with 'is downbeat'."""
    k0, k1 = int(np.ceil((t0 + PRE_ATTACK - ph) / T)), int(np.floor((t1 + PRE_ATTACK - ph) / T))
    out = []
    for k in range(k1, k0 - 1, -1):
        t = ph + k * T
        down = abs(((t - grid.phi + T / 2) % grid.bar) - T / 2) < 1e-3
        out.append((t - PRE_ATTACK, down))
    return out


def span_search(n, r0, r1, grid, voc, rec, pairs):
    """A span of n whole bars, both ends on a beat line inside a vocal gap, holding no lyric word, within
    [r0 - EDGE, r1 + EDGE].  Best: vocal-free, cut on a downbeat, nearest r1.  Returns (a, b, tier) or None."""
    L = n * grid.bar
    best = None
    for p, down in beat_cuts(r0 - EDGE, r1 + EDGE - L, grid, grid.bar / 4, grid.phi % (grid.bar / 4)):
        q = p + L
        if not (voc.clean_at(p) and voc.clean_at(q) and lyric_free(p, q, rec, pairs)):
            continue
        free = voc.free(p, q)
        key = (free, down, p)
        if best is None or key > best[0]:
            best = (key, p, q, ("vocal-free" if free else "lyric-free (la-la)") + (", on the downbeat" if down else ", cut on a beat"))
    return None if best is None else best[1:]


def place(d, r0, r1, at_head, grid, voc, rec, pairs, min_gap):
    bar = grid.bar
    if d > 0:
        # 1. vocal-free bars right before the next line: duplicate them (looped if fewer than d)
        free = [k for k in grid.bars_in(r0, r1, slack=EDGE) if voc.free(grid.line(k), grid.line(k + 1))]
        if free:
            end = free[-1]
            run = [end]
            while run[0] - 1 in free and len(run) < d:
                run.insert(0, run[0] - 1)
            seq = [run[(i - d) % len(run)] for i in range(d)]
            spans = [(grid.line(k) - PRE_ATTACK, grid.line(k + 1) - PRE_ATTACK) for k in seq]
            return {"kind": "dup", "bars_signed": d, "spans": spans, "at": grid.line(end + 1) - PRE_ATTACK,
                    "tier": "vocal-free bars %s duplicated" % seq}
        # 2. the widest vocal gap: accompaniment bar duplicated, vocal opened by the same length
        gaps = voc.gaps(max(r0, 0.0), r1, min_gap) if r1 > r0 else []
        gaps = [g for g in gaps if g[0] > grid.line(0)]
        if gaps:
            def has_line(g):
                return any(g[0] + EDGE <= grid.line(k) <= g[1] - EDGE for k in range(grid.n + 1))
            ga, gb = max(gaps, key=lambda g: (has_line(g), g[1] - g[0]))
            lines = [grid.line(k) for k in range(grid.n + 1) if ga + EDGE <= grid.line(k) <= gb - EDGE]
            v = lines[-1] if lines else 0.5 * (ga + gb)
            return {"kind": "acc_insert", "bars_signed": d, "v": round(v, 4), "gap_s": [round(ga, 3), round(gb, 3)],
                    "tier": "instrumental bar(s): accompaniment duplicated on its bar line, vocal gap opened"}
        # 3. at the head with no room at all: silence
        if at_head:
            return {"kind": "head_pad", "bars_signed": d, "tier": "silence before the first line"}
        # 4. a lyric-free bar (la-la) cut on beats inside vocal gaps: duplicate it
        sp = span_search(1, r0, r1, grid, voc, rec, pairs)
        if sp:
            a, b, tier = sp
            return {"kind": "dup", "bars_signed": d, "spans": [(a, b)] * d, "at": b, "tier": tier + ", duplicated"}
        return None
    sp = span_search(-d, r0, r1, grid, voc, rec, pairs)
    if sp:
        a, b, tier = sp
        return {"kind": "delete", "bars_signed": d, "cut": [a, b], "tier": tier}
    return None


# --------------------------------------------------------------------------------------------- rendering

def segments(edits, grid, n_src_s, head):
    """Edits -> ordered source segments [(layer, a, b)], layer in mix/acc/sil (seconds)."""
    bar, d = grid.bar, PRE_ATTACK
    L = lambda k: grid.line(k) - d  # noqa: E731   cut position of bar line k
    ops = []                         # (src position, segments to splice in, src position to resume from)
    pad = 0
    for e in edits:
        if e["kind"] == "head_pad":
            pad += e["bars_signed"]
        elif e["kind"] == "dup":
            ops.append((e["at"], [("mix", a, b) for a, b in e["spans"]], e["at"]))
        elif e["kind"] == "delete":
            ops.append((e["cut"][0], [], e["cut"][1]))
        elif e["kind"] == "acc_insert":
            v = e["v"]
            K = (v - grid.phi) / bar
            if abs(K - round(K)) * bar < 0.002:          # the gap holds bar line K: insert whole copies of bar K-1
                k = min(max(int(round(K)) - 1, 0), grid.n - 1)
                v = L(k + 1)
                ins = [("acc", L(k), L(k + 1))] * e["bars_signed"]
            else:                                        # rotate bar k (holding v) so it starts and ends at v
                k = min(max(int(np.floor(K)), 0), grid.n - 1)
                S, E = L(k), L(k + 1)
                if E - v < 0.03:
                    v, ins = E, [("acc", S, E)] * e["bars_signed"]
                elif v - S < 0.03:
                    v, ins = S, [("acc", S, E)] * e["bars_signed"]
                else:
                    ins = [("acc", v, E)] + [("acc", S, E)] * (e["bars_signed"] - 1) + [("acc", S, v)]
            ops.append((v, ins, v))
    ops.sort(key=lambda o: o[0])
    segs = []
    if head > 0 or pad:
        segs.append(("sil", 0.0, pad * bar + max(head, 0.0)))
    cur = -head if head < 0 else 0.0
    for pos, ins, resume in ops:
        if pos < cur - 1e-6:
            raise SystemExit("edits overlap at %.3f s" % pos)
        segs.append(("mix", cur, pos))
        segs += ins
        cur = resume
    segs.append(("mix", cur, n_src_s))
    return [s for s in segs if s[2] - s[1] > 1e-6]


def render(layers, segs, xfade, dur):
    """Concatenate segments; at each discontinuity an equal-power crossfade (a linear one where the source position
    is continuous and only the layer changes); exactly dur long."""
    h = int(round(xfade * SR / 2))
    n0 = len(layers["mix"])
    padded = {k: np.pad(v, ((h, h), (0, 0))) for k, v in layers.items()}
    padded["sil"] = np.zeros((n0 + 2 * h + int(60 * SR), 2), np.float32)
    idx = [(lay, int(round(a * SR)), int(round(b * SR))) for lay, a, b in segs]
    parts, joins, pos = [], [], 0
    for i, (lay, a, b) in enumerate(idx):
        parts.append(np.zeros((b - a, 2), np.float32) if lay == "sil" else layers[lay][a:b])
        if i > 0:
            pl, pa, pb = idx[i - 1]
            if not (pl == lay and pb == a) and not (pl == "sil" and lay == "sil"):
                joins.append((pos, pl, pb, lay, a, pb == a and "sil" not in (pl, lay)))
        pos += b - a
    z = np.concatenate(parts).astype(np.float32)
    t = (np.arange(2 * h) + 0.5) / (2 * h)
    ep = (np.cos(0.5 * np.pi * t)[:, None], np.sin(0.5 * np.pi * t)[:, None])
    lin = ((1 - t)[:, None], t[:, None])
    laws = []
    for J, pl, pb, lay, a, same_pos in joins:
        if J - h < 0 or J + h > len(z):
            laws.append("none")
            continue
        left = padded[pl][pb:pb + 2 * h] if pl != "sil" else np.zeros((2 * h, 2), np.float32)   # padded = source + h
        right = padded[lay][a:a + 2 * h] if lay != "sil" else np.zeros((2 * h, 2), np.float32)
        # equal power for a splice; equal gain where the two sides are nearly the same signal (a layer switch in a
        # vocal gap, or two strongly correlated bars), which equal power would bump by up to +3 dB
        den = np.sqrt(np.sum(left * left) * np.sum(right * right))
        corr = float(np.sum(left * right) / den) if den > 0 else 0.0
        law = "linear" if same_pos or corr > 0.5 else "equal-power"
        gl, gr = lin if law == "linear" else ep
        z[J - h:J + h] = left * gl + right * gr
        laws.append(law if same_pos else "%s (r %.2f)" % (law, corr))
    notes = []
    n = int(round(dur * SR))
    if len(z) > n:
        tail = z[n:]
        if np.sqrt(np.mean(tail ** 2)) > 1e-4:
            fl = min(int(1.5 * SR), n)
            z[n - fl:n] *= np.cos(0.5 * np.pi * np.linspace(0, 1, fl))[:, None]
            notes.append("trimmed %.2f s of tail with a 1.5 s fade-out" % ((len(z) - n) / SR))
        else:
            notes.append("trimmed %.2f s of silent tail" % ((len(z) - n) / SR))
        z = z[:n]
    elif len(z) < n:
        k = int(0.01 * SR)
        z[-k:] *= np.linspace(1, 0, k)[:, None]
        notes.append("padded %.2f s of silence at the tail" % ((n - len(z)) / SR))
        z = np.concatenate([z, np.zeros((n - len(z), 2), np.float32)])
    return z, [(round(j[0] / SR, 3), law) for j, law in zip(joins, laws)], notes


def limit_overs(z, ceiling=0.99999):
    """Pull down only what would clip (an accompaniment-only bar can exceed the mix's peak): a gain envelope with a
    2 ms attack and 40 ms release around each over.  Everything else is untouched.  Returns (z, n_overs, peak)."""
    pk = np.abs(z).max(axis=1)
    peak = float(pk.max()) if len(pk) else 0.0
    over = pk > ceiling
    if not over.any():
        return z, 0, peak
    need = np.where(over, ceiling / np.maximum(pk, 1e-9), 1.0)
    att, rel = int(0.002 * SR), int(0.040 * SR)
    g = np.ones(len(z))
    for i in np.nonzero(over)[0]:
        a, b = max(0, i - att), min(len(z), i + rel)
        ramp = np.concatenate([np.linspace(1.0, need[i], i - a, endpoint=False), np.linspace(need[i], 1.0, b - i)])
        g[a:b] = np.minimum(g[a:b], ramp)
    return (z * g[:, None]).astype(np.float32), int(over.sum()), peak


# --------------------------------------------------------------------------------------------- silent pen

def keystroke(sr=SR, seed=7):
    """~40 ms dry key-down click: band-passed noise burst (fast decay) + low thock + a tiny 3 kHz ping; peak 1."""
    rng = np.random.default_rng(seed)
    n = int(0.040 * sr)
    t = np.arange(n) / sr
    b, a = signal.butter(2, [1800, 9000], btype="band", fs=sr)
    burst = signal.lfilter(b, a, rng.standard_normal(n)) * np.exp(-t / 0.004)
    b2, a2 = signal.butter(2, 900, btype="low", fs=sr)
    thock = signal.lfilter(b2, a2, rng.standard_normal(n)) * np.exp(-t / 0.007)
    ping = np.sin(2 * np.pi * 3000 * t) * np.exp(-t / 0.009)
    x = burst / np.abs(burst).max() + 0.5 * thock / np.abs(thock).max() + 0.35 * ping
    att, rel = int(0.0008 * sr), int(0.006 * sr)
    x[:att] *= np.linspace(0, 1, att)
    x[-rel:] *= np.linspace(1, 0, rel)
    x /= np.abs(x).max()
    return np.stack([x, x * 0.96], axis=1).astype(np.float32)


def silent_pen(z, t_out, t_key, t_back, level_db):
    """Duck z to silence over 20 ms from t_out, hold, keystroke at t_key, back at t_back with a 10 ms fade-in."""
    z = z.copy()
    i0, i1 = int(round(t_out * SR)), int(round((t_out + 0.020) * SR))
    j1 = int(round(t_back * SR))
    j0 = j1 - int(round(0.010 * SR))
    g = np.ones(len(z), np.float32)
    g[i0:i1] = np.cos(0.5 * np.pi * np.linspace(0, 1, i1 - i0))
    g[i1:j0] = 0.0
    g[j0:j1] = np.sin(0.5 * np.pi * np.linspace(0, 1, j1 - j0))
    z *= g[:, None]
    k = keystroke() * (10 ** (level_db / 20))
    a = int(round(t_key * SR))
    b = min(len(z), a + len(k))
    z[a:b] += k[:b - a]
    return z


def pen_times(data_js, warp_path):
    hits = read_const(data_js, "HITS")
    pic = {k: float(hits[k]) for k in ("bandOut", "keystroke", "slamBack")}
    w = read_warp(warp_path)
    if w is None:
        return pic, dict(pic), "identity (no data/warp.js)"
    s, p = w
    return pic, {k: float(np.interp(v, p, s)) for k, v in pic.items()}, "inverse of " + os.path.relpath(warp_path, ROOT)


def rms_db(x):
    x = np.asarray(x, np.float64)
    return round(float(20 * np.log10(np.sqrt(np.mean(x * x)) + 1e-12)), 1) if x.size else None


def pen_check(z, song, out_path):
    """4 s excerpt around the pen, and its RMS profile."""
    t0 = max(0.0, song["bandOut"] - 2.0)
    sf.write(out_path, z[int(t0 * SR):int(min(len(z) / SR, t0 + 4.0) * SR)], SR, subtype="PCM_24")
    seg = lambda u, v: z[int(round(u * SR)):int(round(v * SR))]  # noqa: E731
    k0, k1 = song["keystroke"], song["keystroke"] + 0.045
    hold = np.concatenate([seg(song["bandOut"] + 0.020, k0), seg(k1, song["slamBack"] - 0.010)])
    duck = seg(song["bandOut"] - 0.005, song["bandOut"] + 0.025)
    return {"excerpt": os.path.relpath(out_path, ROOT), "excerpt_start_s": round(t0, 3),
            "rms_db_before_500ms": rms_db(seg(song["bandOut"] - 0.5, song["bandOut"])),
            "rms_db_hold_excluding_click": rms_db(hold), "peak_hold_excluding_click": float(np.abs(hold).max()),
            "rms_db_click_45ms": rms_db(seg(k0, k1)), "peak_click": round(float(np.abs(seg(k0, k1)).max()), 3),
            "rms_db_after_500ms": rms_db(seg(song["slamBack"], song["slamBack"] + 0.5)),
            "max_sample_step_in_duck": round(float(np.abs(np.diff(duck, axis=0)).max()), 4),
            "max_sample_step_500ms_before": round(float(np.abs(np.diff(seg(song["bandOut"] - 0.5, song["bandOut"]), axis=0)).max()), 4)}


# --------------------------------------------------------------------------------------------- main

def write24(path, z):
    z, n_over, pk = limit_overs(z)
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    sf.write(path, z, SR, subtype="PCM_24")
    return {"peak_before_limiting": round(pk, 4), "samples_over_full_scale_limited": n_over}


def apply_pen(z, args, report):
    pic, song, how = pen_times(args.data, None if args.no_warp else args.warp)
    z2 = silent_pen(z, song["bandOut"], song["keystroke"], song["slamBack"], args.key_db)
    report["silent_pen"] = {"picture_s": pic, "song_s": {k: round(v, 3) for k, v in song.items()}, "map": how,
                            "check": pen_check(z2, song, os.path.join(BUILD, "silent-pen-excerpt.wav"))}
    return z2


def print_pen(r):
    sp, c = r["silent_pen"], r["silent_pen"]["check"]
    print("  silent pen (%s): song bandOut %.3f, keystroke %.3f, slamBack %.3f s"
          % (sp["map"], sp["song_s"]["bandOut"], sp["song_s"]["keystroke"], sp["song_s"]["slamBack"]))
    print("    RMS dBFS: before %s | hold without the click %s (peak %.1e) | click %s (peak %s) | after %s"
          % (c["rms_db_before_500ms"], c["rms_db_hold_excluding_click"], c["peak_hold_excluding_click"],
             c["rms_db_click_45ms"], c["peak_click"], c["rms_db_after_500ms"]))
    print("    largest sample step in the 20 ms duck %s (music before it: %s); excerpt %s"
          % (c["max_sample_step_in_duck"], c["max_sample_step_500ms_before"], c["excerpt"]))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("input", nargs="?", help="generated song (wav/flac/mp3)")
    ap.add_argument("--out", default=os.path.join(BUILD, "song.fitted.wav"))
    ap.add_argument("--report", default=os.path.join(BUILD, "barfit-report.json"))
    ap.add_argument("--retime-report", default=os.path.join(BUILD, "retime-report.json"),
                    help="where the re-measurement of the fitted song goes (tools/warp.py reads it)")
    ap.add_argument("--data", default=os.path.join(ROOT, "data", "data.js"))
    ap.add_argument("--warp", default=os.path.join(ROOT, "data", "warp.js"))
    ap.add_argument("--no-warp", action="store_true")
    ap.add_argument("--silent-pen", action="store_true", help="add the silent-pen drop and keystroke")
    ap.add_argument("--pen-only", action="store_true", help="only re-apply the silent pen to the kept clean fit")
    ap.add_argument("--key-db", type=float, default=-9.0, help="keystroke peak, dBFS (default -9)")
    ap.add_argument("--plan-only", action="store_true")
    ap.add_argument("--sections-only", action="store_true", help="edits only before a section's first line")
    ap.add_argument("--no-phase", action="store_true")
    ap.add_argument("--no-remeasure", action="store_true")
    ap.add_argument("--min-words", type=int, default=2)
    ap.add_argument("--vocal-db", type=float, default=30.0)
    ap.add_argument("--min-gap", type=float, default=0.06)
    ap.add_argument("--xfade-ms", type=float, default=20.0)
    args = ap.parse_args()
    clean_path = os.path.splitext(args.out)[0] + ".clean.wav"

    if args.pen_only:
        if not os.path.exists(clean_path):
            raise SystemExit("--pen-only needs %s (run barfit with --silent-pen first)" % clean_path)
        report = json.load(open(args.report)) if os.path.exists(args.report) else {}
        z = apply_pen(retime.load_audio(clean_path), args, report)
        write24(args.out, z)
        json.dump(report, open(args.report, "w"), indent=2)
        print("barfit --pen-only -> %s" % os.path.relpath(args.out, ROOT))
        print_pen(report)
        return
    if not args.input:
        ap.error("input song required")
    xfade = min(0.030, max(0.015, args.xfade_ms / 1000.0))
    data = retime.read_data_js(args.data)
    dur = data["dur"]
    os.makedirs(CACHE, exist_ok=True)

    # ---- 1. measure
    stem = os.path.splitext(os.path.basename(args.input))[0]
    before = measure(args.input, os.path.join(CACHE, "%s.before.json" % stem))
    y = retime.load_audio(args.input)
    n_src_s = len(y) / SR
    words = retime.transcribe(retime.resample_to(retime.mono(y), retime.WHISPER_SR), data["lyrics"],
                              os.path.join(BUILD, "retime-cache"), "input")
    pairs, rec, ref = align_lines(data, words)
    anchors = line_anchors(data, pairs, ref, args.min_words)
    if not anchors:
        raise SystemExit("no lyric line recognised: nothing to fit to")

    # ---- 2. grid
    T, ph, contrast = fit_grid(y, data["bpm"])
    bar = 4 * T
    db_beat, a_scores = audio_downbeat(y, T, ph)
    phi = (ph + db_beat * T) % bar
    grid = Grid(phi, bar, n_src_s)
    nf = len(y) // 480
    lvl = 20 * np.log10(np.sqrt(np.mean(y[:nf * 480].reshape(nf, 480, 2) ** 2, axis=(1, 2))) + 1e-9)   # 10 ms
    loud = np.nonzero(lvl > np.percentile(lvl, 50) - 40)[0]
    preroll = 0.01 * int(loud[0]) if len(loud) else 0.0          # leading near-silence, s (may be trimmed)
    head, head_costs = choose_head(anchors, T, ph, bar, preroll, contrast, args.no_phase)
    gridrep = {"beat_period_s": round(T, 5), "bpm": round(60 / T, 3), "beat_phase_s": round(ph, 4),
               "contrast": contrast, "first_bar_line_s": round(phi, 4), "bar_s": round(bar, 4),
               "downbeat": dict(a_scores, beat=db_beat),
               "line_starts_per_beat": line_start_beats(data, pairs, ref, T, ph),
               "silent_preroll_s": round(preroll, 3), "head_shift_s": round(head, 4),
               "head_shift_costs": head_costs}

    # ---- 3. vocals + plan
    v = vocal_stem(y)
    voc = Vocals(v, args.vocal_db)
    raw, cs = bars_needed(anchors, head, bar)
    edits, notes = plan(anchors, cs, head, args.sections_only, grid, voc, rec, pairs, args.min_gap)
    bm = section_medians(before)
    sec_rows = []
    for s in data["sections"]:
        o, n = bm.get(s["name"], (None, 0))
        al = [a for a in anchors if a["section"] == s["name"]]
        sec_rows.append({"section": s["name"], "picture_start": s["start"], "before_ms": None if not n else o,
                         "matched_before": n, "first_line_offset_ms": round(1000 * al[0]["offset"]) if al else None,
                         "bars": al[0]["bars"] if al else None,
                         "predicted_ms": round(1000 * float(np.median([x["offset"] + head + x["bars"] * bar for x in al]))) if al else None})
    report = {"input": os.path.abspath(args.input), "input_duration_s": round(n_src_s, 3), "picture_duration_s": dur,
              "convention": "offset = song time minus picture time; positive = the song is late", "grid": gridrep,
              "vocal_level_db": {"loud_p95": round(voc.loud, 1), "sung_above": round(voc.thr, 1)},
              "anchors": [{"line": a["line"], "section": a["section"], "pic_start": a["pic_start"],
                           "song_start": round(a["song_start"], 3), "offset_ms": round(1000 * a["offset"]),
                           "matched": a["matched"], "bars_raw": r, "bars": a["bars"],
                           "predicted_after_ms": round(1000 * (a["offset"] + head + a["bars"] * bar))}
                          for a, r in zip(anchors, raw)],
              "edits": edits, "notes": notes, "sections": sec_rows,
              "bars": [{"bar": k, "start_s": round(grid.line(k), 3), "sung_frac": round(voc.frac(grid.line(k), grid.line(k + 1)), 3),
                        "vocal_free": voc.free(grid.line(k), grid.line(k + 1))} for k in range(grid.n)]}

    print("barfit: %s (%.2f s)" % (os.path.basename(args.input), n_src_s))
    print("  grid %.3f BPM (contrast %.1f), first bar line %.3f s (downbeat = beat %d after %.3f; lines start per beat %s)"
          % (60 / T, contrast, phi, db_beat, ph, gridrep["line_starts_per_beat"]))
    print("  head shift %+.3f s; %d line anchors; vocal-free bars %d of %d"
          % (head, len(anchors), sum(b["vocal_free"] for b in report["bars"]), grid.n))
    for e in edits:
        n = abs(e["bars_signed"])
        if e["kind"] == "head_pad":
            what = "INSERT %d bar(s) of silence at the head" % n
        elif e["kind"] == "dup":
            what = "INSERT %d bar(s) at song %.3f s [%s]" % (n, e["at"], e["tier"])
        elif e["kind"] == "acc_insert":
            what = "INSERT %d instrumental bar(s), vocal gap %.2f-%.2f s opened at %.3f s" % (n, e["gap_s"][0], e["gap_s"][1], e["v"])
        else:
            what = "DELETE %d bar(s), song %.3f-%.3f s [%s]" % (n, e["cut"][0], e["cut"][1], e["tier"])
        print("  edit before %-9s (%s): %s" % (e["before_line"], e["section"], what))
    for n in notes:
        print("  note: " + n)

    if not args.plan_only:
        # ---- 4. render
        segs = segments(edits, grid, n_src_s, head)
        z, joins, rnotes = render({"mix": y, "acc": (y - v).astype(np.float32)}, segs, xfade, dur)
        target = clean_path if args.silent_pen else args.out
        z, n_over, pk = limit_overs(z)
        write24(target, z)
        report["render"] = {"segments": [[l, round(a, 4), round(b, 4)] for l, a, b in segs], "joins_output_s": joins,
                            "xfade_ms": round(1000 * xfade, 1), "notes": rnotes, "peak_before_limiting": round(pk, 4),
                            "samples_limited": n_over,
                            "output_duration_s": round(len(z) / SR, 3)}
        # ---- 5. verify
        if not args.no_remeasure:
            am = section_medians(measure(target, args.retime_report))
            for r in sec_rows:
                o, n = am.get(r["section"], (None, 0))
                r["after_ms"], r["matched_after"] = (o if n else None), n
            report["retime_report_after"] = os.path.abspath(args.retime_report)
        if args.silent_pen:
            write24(args.out, apply_pen(z, args, report))
        report["output"] = os.path.abspath(args.out)

    json.dump(report, open(args.report, "w"), indent=2)
    f = lambda x: "   n/a" if x is None else "%+6.0f" % x  # noqa: E731
    print("  per section, ms (song minus picture): retime median before | first line before | bars | predicted | retime median after")
    for r in sec_rows:
        if r["before_ms"] is None and r.get("after_ms") is None and r["first_line_offset_ms"] is None:
            continue
        print("    %-10s %s | %s | %4s | %s | %s"
              % (r["section"], f(r["before_ms"]), f(r["first_line_offset_ms"]),
                 "" if r["bars"] is None else "%+d" % r["bars"], f(r["predicted_ms"]), f(r.get("after_ms"))))
    if not args.plan_only:
        for n in report["render"]["notes"]:
            print("  " + n)
        print("  wrote %s (%.3f s, %d joins)" % (os.path.relpath(args.out, ROOT), report["render"]["output_duration_s"],
                                                 len(report["render"]["joins_output_s"])))
        if args.silent_pen:
            print_pen(report)
        if not args.no_remeasure:
            print("  re-measured -> %s; for the sub-bar residual run:  python3 -I tools/warp.py %s"
                  % (os.path.relpath(args.retime_report, ROOT), os.path.relpath(args.retime_report, ROOT)))
    print("  report: %s" % os.path.relpath(args.report, ROOT))


if __name__ == "__main__":
    main()
