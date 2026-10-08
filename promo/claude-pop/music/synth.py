"""synth.py: pitched instruments for "Pen Pal".

  * a stdlib Standard MIDI File writer and a cached FluidSynth renderer (FluidR3 GM) for the
    piano, the Floppy Organ's organ layer, brass, strings and the tenor sax;
  * numpy instruments: the two floppy drives (stepper motors), the clean sub and the 808, the
    25 % pulse that doubles the organ, the saw pad and the boot chord, the Writing Bell (FM).
"""
import hashlib
import json
import math
import os
import struct
import subprocess

import numpy as np
import soundfile as sf

from dsp import (SR, adsr, bp, eq, exp_env, hp, lp, mtof, n_of, noise, phase_of, pulse, rng, saw,
                 sine, sweep_filter, tanh_sat)

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CACHE = os.path.join(ROOT, ".cache", "fluid")
SF2 = "/usr/share/sounds/sf2/FluidR3_GM.sf2"
PPQ = 960
USED = set()     # cache files this build used (for --prune-cache)
BPM = 120


# ------------------------------------------------------------------------------------------------
# MIDI (stdlib) + FluidSynth
# ------------------------------------------------------------------------------------------------
def _vlq(n):
    out = [n & 0x7F]
    n >>= 7
    while n:
        out.append(0x80 | (n & 0x7F))
        n >>= 7
    return bytes(reversed(out))


def write_midi(path, notes, program=0, channel=0, cc=None, bpm=BPM):
    """notes: [(midi, start_beat, beats, velocity)]; cc: [(beat, controller, value)].  Format 0."""
    ev = []
    for m, b, d, v in notes:
        t0 = int(round(b * PPQ))
        t1 = max(t0 + 1, int(round((b + d) * PPQ)))
        ev.append((t0, 1, bytes([0x90 | channel, int(m), int(max(1, min(127, v)))])))
        ev.append((t1, 0, bytes([0x80 | channel, int(m), 0])))
    for b, c, v in (cc or []):
        ev.append((int(round(b * PPQ)), -1, bytes([0xB0 | channel, int(c), int(v)])))
    ev.sort(key=lambda e: (e[0], e[1]))
    tempo = int(round(60_000_000 / bpm))
    data = b"\x00\xFF\x51\x03" + tempo.to_bytes(3, "big")
    data += b"\x00" + bytes([0xC0 | channel, program])
    data += b"\x00" + bytes([0xB0 | channel, 7, 110]) + b"\x00" + bytes([0xB0 | channel, 10, 64])
    data += b"\x00" + bytes([0xB0 | channel, 91, 0]) + b"\x00" + bytes([0xB0 | channel, 93, 0])
    last = 0
    for t, _, msg in ev:
        data += _vlq(t - last) + msg
        last = t
    data += _vlq(PPQ) + b"\xFF\x2F\x00"
    with open(path, "wb") as f:
        f.write(b"MThd" + struct.pack(">IHHH", 6, 0, 1, PPQ))
        f.write(b"MTrk" + struct.pack(">I", len(data)) + data)


def _render(notes, program, wav, cc=None, gain=0.6):
    mid = wav[:-4] + ".mid"
    write_midi(mid, notes, program, cc=cc)
    subprocess.run(["fluidsynth", "-ni", "-q", "-R", "0", "-C", "0", "-g", str(gain), "-r", str(SR),
                    "-o", "synth.polyphony=256", "-T", "wav", "-O", "float", "-F", wav, SF2, mid],
                   check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    os.remove(mid)


def latency(program, note=60):
    """FluidSynth onset latency (s) for a GM program: a calibration note rendered once and cached,
    measured at 10 % of its peak.  Parts are shifted earlier by this so every note sits on its beat."""
    os.makedirs(CACHE, exist_ok=True)
    wav = os.path.join(CACHE, "cal_%d_%d.wav" % (program, note))
    if not os.path.exists(wav):
        _render([(note, 1.0, 1.0, 100)], program, wav)
    y, _ = sf.read(wav, dtype="float64", always_2d=True)
    m = np.abs(y).max(axis=1)
    i0 = int(0.5 * SR)
    seg = m[i0 - 200: i0 + 6000]
    k = int(np.argmax(seg > 0.1 * seg.max()))
    return max(0.0, (k - 200) / SR)


def fluid(notes, program, total_s, cc=None, gain=0.6, tag="", align=True):
    """Render a GM part to a stereo float array (total_s long), cached by content, latency-compensated."""
    key = hashlib.sha1(json.dumps([notes, program, cc, gain, total_s, "f3"]).encode()).hexdigest()[:20]
    os.makedirs(CACHE, exist_ok=True)
    wav = os.path.join(CACHE, "%s_%s.wav" % (tag or "gm", key))
    USED.add(wav)
    if not os.path.exists(wav):
        _render(notes, program, wav, cc, gain)
    y, sr = sf.read(wav, dtype="float64", always_2d=True)
    assert sr == SR
    if align and notes:
        sh = int(round(max(0.0, latency(program) - 0.0008) * SR))
        y = y[sh:]
    n = n_of(total_s)
    out = np.zeros((n, 2))
    k = min(n, len(y))
    out[:k] = y[:k]
    return out


# ------------------------------------------------------------------------------------------------
# the Two Floppies: stepper-motor bass voices
# ------------------------------------------------------------------------------------------------
def _click_ir(seed, bright=1.0):
    """The mechanical response of one head step: a few damped resonances (plastic + metal) and a thud."""
    n = n_of(0.012)
    t = np.arange(n) / SR
    r = rng("stepir", seed)
    ir = np.zeros(n)
    for f, tau, a in ((180, .004, .9), (820 * r.uniform(.95, 1.05), .0025, .7), (2300 * bright, .0012, .55),
                      (4600 * bright, .0007, .35)):
        ir += a * np.sin(2 * np.pi * f * t + r.uniform(0, 1)) * np.exp(-t / tau)
    ir[:4] += np.array([.6, -.4, .25, -.1])
    return ir / np.max(np.abs(ir))


def floppy_voice(events, total_s, seed=0, soft=False):
    """events [(midi, start_s, dur_s)] -> (stepper mono, sub mono).  The stepper is a click train at
    the note frequency (a buzzy square), a little 50 % pulse for pitch, a seek chirp on each attack
    and the drive's direction flips (the head reverses every 80 steps, a tiny tick and level dip)."""
    n = n_of(total_s)
    imp = np.zeros(n + 2)
    tone = np.zeros(n)
    sub = np.zeros(n)
    r = rng("floppy", seed)
    for m, s, d in events:
        f = float(mtof(m))
        i0, i1 = n_of(s), min(n, n_of(s + d))
        if i1 <= i0:
            continue
        L = i1 - i0
        # click train with fractional placement (linear split between two samples)
        period = SR / f
        k = np.arange(int(L / period) + 1)
        pos = i0 + k * period
        pos = pos[pos < i1 - 1]
        steps = np.arange(len(pos))
        amp = 1.0 - 0.18 * ((steps // 80) % 2)                       # direction flips
        rel = (pos - i0) / SR
        env = np.minimum(1, rel / 0.002) * np.where(rel > d - 0.012, np.maximum(0, (d - rel) / 0.012), 1)
        a = amp * env * (1 + 0.06 * r.standard_normal(len(pos)))
        ip = pos.astype(int)
        fr = pos - ip
        np.add.at(imp, ip, a * (1 - fr))
        np.add.at(imp, ip + 1, a * fr)
        # seek chirp: 10 fast steps sweeping into the note (the head finding its track)
        for j in range(10):
            ts = i0 - n_of(0.028) + n_of(0.0028 * j)
            if 0 <= ts < n:
                imp[ts] += 0.45 * (0.6 + 0.04 * j)
        # the pitch layer: a softened 50 % pulse
        tt = np.arange(L) / SR
        e = np.minimum(1, tt / 0.003) * np.minimum(1, np.maximum(0, (d - tt) / 0.015))
        ph = r.uniform(0, 1)
        tone[i0:i1] += pulse(np.full(L, f), 0.5, ph0=ph) * e
        # the clean sub: a sine at the note's fundamental (the low end the clicks don't have)
        se = np.minimum(1, tt / 0.006) * np.minimum(1, np.maximum(0, (d - tt) / 0.03))
        sub[i0:i1] += np.sin(2 * np.pi * f * tt + 0.0) * se
    clicks = np.convolve(imp[:n], _click_ir(seed, 1.0 if not soft else .6))[:n]
    tone = lp(tone, 1400 if not soft else 500, 2)
    step = 0.55 * clicks + 0.35 * tone
    step = tanh_sat(step * 1.4, 1.2)
    step = eq(step, ("hp", 60), ("peak", 900, 1.2, 2.5), ("lp", 7000 if not soft else 1800))
    return step, sub


def sub808(events, total_s, drive=1.6):
    """808: sine with a fast pitch drop into the note, long body, gentle saturation."""
    n = n_of(total_s)
    out = np.zeros(n)
    for m, s, d in events:
        f = float(mtof(m))
        i0 = n_of(s)
        L = min(n - i0, n_of(d + 0.05))
        if L <= 0:
            continue
        t = np.arange(L) / SR
        fr = f * (1 + 1.2 * np.exp(-t / 0.018))
        body = np.sin(2 * np.pi * np.cumsum(fr) / SR)
        env = np.minimum(1, t / 0.002) * np.where(t > d, np.exp(-(t - d) / 0.02), 1.0) * (0.75 + 0.25 * np.exp(-t / 0.4))
        out[i0:i0 + L] += body * env
    return tanh_sat(out, drive) * 0.9


# ------------------------------------------------------------------------------------------------
# organ pulse, pads, bells, beeps
# ------------------------------------------------------------------------------------------------
def pulse_organ(events, total_s, duty=0.25, seed=3):
    """The numpy half of the Floppy Organ: a 25 % pulse with a 6 ms downward pitch blip on each attack
    and an 8 ms stepper click (band-passed noise 2-3 kHz)."""
    n = n_of(total_s)
    out = np.zeros(n)
    for k, (m, s, d) in enumerate(events):
        f = float(mtof(m))
        i0 = n_of(s)
        L = min(n - i0, n_of(d * 0.92 + 0.03))
        if L <= 0:
            continue
        t = np.arange(L) / SR
        fr = f * (1 + 0.06 * np.exp(-t / 0.006))
        y = pulse(fr, duty, ph0=0.0)
        env = np.minimum(1, t / 0.002) * (0.65 + 0.35 * np.exp(-t / 0.09)) * np.minimum(1, np.maximum(0, (L / SR - t) / 0.02))
        out[i0:i0 + L] += y * env * 0.5
        c = bp(noise(n_of(0.008), ("oc", k)), 2000, 3000, 2) * np.linspace(1, 0, n_of(0.008))
        out[i0:i0 + len(c)] += 0.6 * c[: max(0, min(len(c), n - i0))]
    return lp(out, 6000, 2)


def saw_pad(chords, total_s, cutoff=2400, detune=0.12, voices=5, attack=0.08, release=0.35, seed=4, sweep=None):
    """chords: [(notes, start_s, dur_s, gain)] -> stereo supersaw pad (odd voices left, even right)."""
    n = n_of(total_s)
    out = np.zeros((n, 2))
    r = rng("pad", seed)
    for notes, s, d, g in chords:
        i0 = n_of(s)
        L = min(n - i0, n_of(d + release * 2))
        if L <= 0:
            continue
        t = np.arange(L) / SR
        env = np.minimum(1, t / attack) * np.where(t > d, np.exp(-(t - d) / release), 1.0)
        for m in notes:
            f = float(mtof(m))
            for v in range(voices):
                det = (v - (voices - 1) / 2) / max(1, (voices - 1) / 2) * detune
                y = saw(np.full(L, f * 2 ** (det / 12)), ph0=r.uniform(0, 1))
                ch = v % 2
                out[i0:i0 + L, ch] += y * env * g / (len(notes) * voices) ** 0.5 * 0.5
    if sweep is not None:
        out = sweep_filter(out, "lp", sweep, 0.9)
    else:
        out = lp(out, cutoff, 2)
    return hp(out, 120, 2)


def fm_bell(m, dur=1.6, index=3.2, ratio=3.5, bright=1.0, seed=0):
    """The Writing Bell: a two-operator FM glockenspiel (inharmonic 3.5 ratio) plus a pure partial."""
    f = float(mtof(m))
    L = n_of(dur)
    t = np.arange(L) / SR
    I = index * bright * np.exp(-t / 0.18)
    mod = np.sin(2 * np.pi * f * ratio * t) * I
    car = np.sin(2 * np.pi * f * t + mod)
    p2 = 0.25 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t / 0.12)        # glock "clang" partial
    env = np.minimum(1, t / 0.0015) * np.exp(-t / (dur * 0.38))
    y = (car + p2) * env
    tick = hp(noise(n_of(0.004), ("belltick", seed)), 5000, 2) * np.linspace(1, 0, n_of(0.004)) * 0.3
    y[: len(tick)] += tick
    return y


def boot_chord(notes, dur, open_beats=4.0, bell_notes=4, seed=7, top_pad_only=True):
    """Our boot chord (stereo): a wide saw pad whose low-pass opens over `open_beats` and an FM bell
    on the lower `bell_notes` notes with a sharp attack.  The top note is pad only (never a 'ding')."""
    n = n_of(dur + 2.5)
    t = np.arange(n) / SR
    open_s = open_beats * 60 / BPM
    sweep = 400 * (9000 / 400) ** np.clip(t / open_s, 0, 1)
    pad = saw_pad([(notes, 0.0, dur, 1.0)], dur + 2.5, detune=0.10, voices=7, attack=0.004, release=0.9,
                  seed=seed, sweep=sweep)
    pad *= 1.6
    bell = np.zeros(n)
    for k, m in enumerate(sorted(notes)[:bell_notes]):
        b = fm_bell(m + 12, dur=min(dur + 1.5, 4.0), index=2.2, ratio=1.0 + 2.5 * (k % 2 == 0) + 0.5, seed=k)
        bell[: len(b)] += b[: n] * 0.22
    sub = np.zeros(n)
    f0 = float(mtof(min(notes)))
    sub += np.sin(2 * np.pi * f0 * t) * np.minimum(1, t / 0.01) * np.where(t > dur, np.exp(-(t - dur) / 0.6), 1) * 0.35
    out = pad + np.stack([bell * 0.9 + sub, bell + sub], axis=1)
    return out


def beep(m, dur):
    """System beep: a square wave with a hard on/off (a little rounded)."""
    L = n_of(dur)
    t = np.arange(L) / SR
    y = pulse(np.full(L, float(mtof(m))), 0.5)
    env = np.minimum(1, t / 0.002) * np.minimum(1, (dur - t) / 0.006)
    return lp(y * env, 7000, 2)


def blip(f=1568.0, dur=0.03):
    L = n_of(dur)
    t = np.arange(L) / SR
    return np.sin(2 * np.pi * f * t) * np.minimum(1, t / 0.001) * np.exp(-t / 0.009)
