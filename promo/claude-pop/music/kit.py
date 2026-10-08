"""kit.py: the desk is the band.  Every percussive voice is synthesised in numpy as the UI foley
the video draws (parts.drums.kit): no samples, no GM drums.

Each function returns one hit (mono, or stereo where noted) whose time zero is the score time of
the event; anything that must sound *before* the beat (the keystroke's key-down click) is returned
with a `pre` offset in seconds.
"""
import math

import numpy as np

from dsp import (SR, bp, bitcrush, convolve, eq, hp, lp, n_of, noise, pan, rng, room_ir, sweep_filter,
                 tanh_sat)


def _t(dur):
    return np.arange(n_of(dur)) / SR


def _res(f, tau, dur, phase=0.0):
    t = _t(dur)
    return np.sin(2 * np.pi * f * t + phase) * np.exp(-t / tau)


def _burst(dur, lo, hi, seed, tau=None):
    n = n_of(dur)
    x = bp(noise(n, seed), lo, min(hi, 20000), 2)
    if tau:
        x *= np.exp(-np.arange(n) / (tau * SR))
    return x


# ------------------------------------------------------------------------------------------------
# kick: floppy eject
# ------------------------------------------------------------------------------------------------
def kick(style="eject", vel=1.0, seed=0):
    """Floppy eject: the eject clunk pitched down two octaves, a sine body (55 Hz; 50 Hz and tighter,
    808-like, in the house choruses) and a 4 ms plastic click."""
    if style == "house":
        dur, f0, f1, tp, tau = 0.42, 50.0, 128.0, 0.030, 0.20
    else:
        dur, f0, f1, tp, tau = 0.48, 55.0, 150.0, 0.040, 0.26
    t = _t(dur)
    f = f0 + (f1 - f0) * np.exp(-t / tp) + 260 * np.exp(-t / 0.004)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR)
    env = np.minimum(1, t / 0.0008) * (0.55 * np.exp(-t / tau) + 0.45 * np.exp(-t / (tau * 0.45)))
    body *= env
    clunk = 0.32 * _res(310, 0.022, dur, 0.3) + 0.18 * _res(1080, 0.007, dur, 1.1)    # the eject, pitched down
    click = np.zeros_like(t)
    c = _burst(0.004, 2500, 9000, ("kc", seed)) * np.linspace(1, 0, n_of(0.004))
    click[: len(c)] += 0.55 * c
    click += 0.25 * _res(3300, 0.0016, dur)
    y = tanh_sat(body * 1.0 + clunk, 1.8) + click * (1.2 if style == "house" else 1.0)
    y = eq(y, ("hp", 28), ("peak", 62 if style == "house" else 58, 1.0, 2.0), ("peak", 380, 1.4, -3.0))
    return y * vel / np.max(np.abs(y))


# ------------------------------------------------------------------------------------------------
# snare: window close ("whap"), ghost: window shade
# ------------------------------------------------------------------------------------------------
def snare(vel=1.0, seed=0, ghost=False):
    """Window close: a noise burst through a fast falling band-pass (the zoom outline collapsing),
    a tonal 180 Hz 'whap' with a quick pitch drop, a crack and a short bright tail."""
    dur = 0.32
    t = _t(dur)
    n = len(t)
    whoosh = noise(n, ("sn", seed))
    fc = 1300 + 5200 * np.exp(-t / 0.02)
    whoosh = sweep_filter(whoosh, "bp", fc, 1.1, block=32) * np.minimum(1, t / 0.001) * np.exp(-t / 0.06)
    fw = 180 + 70 * np.exp(-t / 0.012)
    whap = np.sin(2 * np.pi * np.cumsum(fw) / SR) * np.exp(-t / 0.08) + 0.5 * _res(332, 0.045, dur, 0.5)
    crack = np.zeros(n)
    c = bp(noise(n_of(0.003), ("cr", seed)), 1500, 7000, 2) * np.linspace(1, 0, n_of(0.003))
    crack[: len(c)] = c
    tail = bp(noise(n, ("st", seed)), 1100, 8000, 2) * np.exp(-t / 0.12) * 0.4
    y = 1.15 * whoosh + 0.95 * whap + 0.7 * crack + 1.3 * tail
    y = tanh_sat(y * 1.4, 1.5)
    y = eq(y, ("hp", 110), ("peak", 200, 1.2, 2.5), ("peak", 900, 1.0, -2.0), ("peak", 3500, 1.0, 1.5),
           ("lp", 11000))
    y = y / np.max(np.abs(y))
    if ghost:  # window shade: the snare at -18 dB, darker and shorter
        y = lp(y, 3500, 2) * np.exp(-t / 0.06) * 10 ** (-18 / 20)
    return y * vel


def rimshot(vel=1.0):
    t = _t(0.12)
    y = 0.8 * _res(1720, 0.012, 0.12) + 0.6 * _res(510, 0.018, 0.12, 0.7)
    c = hp(noise(n_of(0.002), "rim"), 2500, 2)
    y[: len(c)] += c
    return tanh_sat(y, 1.5) * vel / 1.2


# ------------------------------------------------------------------------------------------------
# clap: mouse clicks, stacked
# ------------------------------------------------------------------------------------------------
def mouse_click(seed=0, bright=1.0):
    """One mouse-button click: a tiny burst exciting the plastic shell's resonances."""
    dur = 0.03
    r = rng("mc", seed)
    y = (0.9 * _res(2100 * r.uniform(.96, 1.04) * bright, 0.006, dur, r.uniform(0, 6))
         + 0.6 * _res(4300 * r.uniform(.96, 1.04) * bright, 0.003, dur, r.uniform(0, 6))
         + 0.45 * _res(1250 * r.uniform(.96, 1.04), 0.004, dur, r.uniform(0, 6)))
    b = noise(n_of(0.0006), ("mcb", seed))
    y[: len(b)] += 0.9 * b
    return y


def clap(copies=3, vel=1.0, seed=0, spread=0.0):
    """The clap stack: `copies` mouse clicks a few ms apart (three pointers; twelve in the final
    chorus) + a short band-passed noise tail + a small room.  Stereo."""
    r = rng("clap", seed, copies)
    dur = 0.45
    n = n_of(dur)
    out = np.zeros((n, 2))
    span = 0.016 if copies <= 3 else 0.026
    offs = [0.0] + sorted(r.uniform(0.004, span, copies - 1).tolist())
    for k, o in enumerate(offs):
        c = mouse_click(seed=(seed, k, copies)) * (1.0 if k == 0 else r.uniform(0.6, 0.95))
        p = 0.0 if spread == 0 else r.uniform(-spread, spread)
        i0 = n_of(o)
        out[i0:i0 + len(c)] += pan(c, p)[: n - i0]
    t = _t(dur)
    tail_start = n_of(offs[-1])
    tl = bp(noise(n, ("ct", seed)), 900, 3600, 2) * np.exp(-t / 0.055)
    tl = np.roll(tl, tail_start)
    tl[:tail_start] = 0
    out += np.stack([tl, np.roll(tl, 37)], axis=1) * (0.55 if copies <= 3 else 0.75)
    wet = convolve(out[:, 0] + out[:, 1], room_ir(0.3, seed=11))[:n] * 0.12
    out = out + wet
    out = eq(out, ("hp", 350), ("peak", 1500, 0.9, 2.0), ("highshelf", 7000, 0.7, 1.5))
    return out * vel / np.max(np.abs(out))


# ------------------------------------------------------------------------------------------------
# hats: keystrokes; open hat: the space bar
# ------------------------------------------------------------------------------------------------
KEY_PRE = 0.002


def keystroke_hat(vel=1.0, seed=0, open_=False):
    """Closed: the key-down click 2 ms before the beat, then bright 6-7 kHz noise for ~40 ms.
    Open (space bar): a bigger, lower thock and a 120 ms tail.  Returned with KEY_PRE of lead-in."""
    r = rng("hat", seed)
    dur = 0.18 if open_ else 0.06
    n = n_of(dur + KEY_PRE)
    y = np.zeros(n)
    kc = 0.5 * _res(3600 * r.uniform(.95, 1.05), 0.0012, 0.006) + 0.3 * _res(5200, 0.0008, 0.006)
    y[: len(kc)] += kc
    i0 = n_of(KEY_PRE)
    t = _t(dur)
    if open_:
        thock = 0.45 * _res(880, 0.010, dur) + 0.3 * _res(1900, 0.006, dur, 0.5)
        hiss = bp(noise(len(t), ("oh", seed)), 4500, 16000, 2) * np.exp(-t / 0.07)
        body = thock + 0.8 * hiss
    else:
        hiss = bp(noise(len(t), ("ch", seed)), 5000, 16000, 2) * np.exp(-t / 0.016)
        tick = 0.35 * _res(6400, 0.002, dur) + 0.2 * _res(3100, 0.0015, dur, 0.4)
        body = hiss + tick
    y[i0:i0 + len(body)] += body
    y = eq(y, ("hp", 400 if open_ else 2200), ("peak", 7000, 1.0, 1.5), ("highshelf", 12000, 0.7, -3.0))
    return y * vel / np.max(np.abs(y))


# ------------------------------------------------------------------------------------------------
# crash: emptying the Trash (granular paper crumple + wash); choked on the HAND hits
# ------------------------------------------------------------------------------------------------
def crash(dur=2.2, vel=1.0, seed=0, choke=None):
    """Trash crumple: a decorrelated stereo noise wash with a 2 s decay plus hundreds of paper
    grains (0.3-3 ms band-passed bursts at a density that thins out as the paper settles)."""
    n = n_of(dur)
    t = np.arange(n) / SR
    r = rng("crash", seed)
    out = np.zeros((n, 2))
    for ch in range(2):
        w = noise(n, ("cw", seed, ch))
        w = eq(w, ("hp", 1600), ("peak", 4800, 0.8, 3.0), ("highshelf", 11000, 0.7, -2.0))
        out[:, ch] += w * np.minimum(1, t / 0.004) * (0.6 * np.exp(-t / 0.55) + 0.4 * np.exp(-t / 0.12))
    # paper grains
    tt = 0.0
    k = 0
    while tt < dur * 0.8:
        rate = 1400 * math.exp(-tt / 0.28) + 25
        tt += r.exponential(1.0 / rate)
        g = r.uniform(0.0003, 0.003)
        L = n_of(g)
        i0 = n_of(tt)
        if i0 + L >= n or L < 4:
            continue
        fc = r.uniform(1200, 7500)
        gr = bp(r.standard_normal(L), fc * 0.7, min(fc * 1.4, 20000), 1) * np.hanning(L)
        a = r.uniform(0.2, 1.0) * math.exp(-tt / 0.5) * 1.6
        p = r.uniform(-0.8, 0.8)
        out[i0:i0 + L] += pan(gr * a, p)
        k += 1
    out = eq(out, ("hp", 500))
    if choke:
        cn = n_of(choke)
        env = np.ones(n)
        env[cn:] = 0
        env[max(0, cn - n_of(0.03)):cn] = np.linspace(1, 0, min(cn, n_of(0.03)))
        out *= env[:, None]
    return out * vel / np.max(np.abs(out))


def reverse_cymbal(dur, seed=0):
    """A reversed Trash crash that swells into the next downbeat (ends exactly at dur)."""
    c = crash(max(2.2, dur + 0.2), seed=seed + 50)
    c = c[: n_of(dur)][::-1]
    t = np.arange(len(c)) / SR
    c *= (t / dur)[:, None] ** 1.5
    return c


# ------------------------------------------------------------------------------------------------
# riser: a progress bar filling
# ------------------------------------------------------------------------------------------------
def riser(dur, root_midi=55, seed=0, steps_per_beat=4, kind="bar"):
    """Progress bar: white noise through a rising band-pass + a stepped square tone climbing in 16th
    steps (the bar's blocks), level rising, reaching full exactly at `dur` (hard stop).  Stereo."""
    n = n_of(dur)
    t = np.arange(n) / SR
    x = t / dur
    nz = noise(n, ("riser", seed))
    fc = 350 * (9500 / 350) ** (x ** 1.4)
    nb = sweep_filter(nz, "bp", fc, 1.4, block=64)
    amp = 10 ** ((-34 + 34 * x ** 1.8) / 20)
    # stepped tone: one semitone per 16th, over the last two octaves up to the octave above root
    beats = dur * 2
    nsteps = max(1, int(round(beats * steps_per_beat)))
    step = np.minimum(nsteps - 1, (x * nsteps).astype(int))
    midi = root_midi + 24 * step / max(1, nsteps - 1)
    f = 440 * 2 ** ((midi - 69) / 12)
    ph = np.cumsum(f) / SR
    sq = np.sign(np.sin(2 * np.pi * ph)) * 0.5 + 0.5 * np.sin(2 * np.pi * 2 * ph)
    sq = lp(sq, 4000, 2)
    blk = (x * nsteps) % 1.0
    tick = np.where(blk < 0.03, 1.0, 0.0)   # each block of the bar lands with a tiny tick
    tone = sq * (0.35 + 0.65 * x) * (1 - 0.3 * tick)
    y_l = nb * 1.0 + tone * 0.22
    y_r = np.roll(nb, 31) * 1.0 + tone * 0.22
    out = np.stack([y_l, y_r], axis=1) * amp[:, None]
    end = n_of(0.004)
    out[-end:] *= np.linspace(1, 0, end)[:, None]
    return out / (np.max(np.abs(out)) + 1e-9)


def spin_up(dur, seed=0):
    """The floppy-drive spin-up: a motor sine sweep with comb-filtered grit (delay = one rotation)."""
    n = n_of(dur)
    t = np.arange(n) / SR
    x = t / dur
    f = 28 * (520 / 28) ** (x ** 1.2)
    ph = np.cumsum(f) / SR
    motor = np.sin(2 * np.pi * ph) + 0.35 * np.sin(2 * np.pi * 2 * ph) + 0.2 * np.sign(np.sin(2 * np.pi * 3 * ph))
    nz = noise(n, ("spin", seed))
    grit = np.zeros(n)
    # comb: add the noise delayed by one rotation (time-varying), done in 16 blocks
    blocks = 16
    for b in range(blocks):
        a, c = b * n // blocks, (b + 1) * n // blocks
        d = max(1, int(SR / f[(a + c) // 2]))
        seg = nz[a:c]
        prev = nz[max(0, a - d):c - d] if a - d >= 0 else np.concatenate([np.zeros(d - a), nz[:c - d]])
        grit[a:c] = seg + 0.9 * prev[: len(seg)]
    grit = bp(grit, 800, 6000, 2)
    amp = 10 ** ((-30 + 30 * x ** 1.5) / 20)
    y = (0.6 * motor + 0.25 * grit) * amp
    y[-n_of(0.004):] *= np.linspace(1, 0, n_of(0.004))
    return np.stack([y, np.roll(y, 23)], axis=1) / np.max(np.abs(y))


# ------------------------------------------------------------------------------------------------
# small foley
# ------------------------------------------------------------------------------------------------
def cowbell(vel=1.0):
    """System beep: two square partials 560/845 Hz through a band-pass, quick decay."""
    t = _t(0.25)
    y = np.sign(np.sin(2 * np.pi * 560 * t)) + 0.8 * np.sign(np.sin(2 * np.pi * 845 * t))
    y = bp(y, 450, 2800, 2) * np.minimum(1, t / 0.001) * (0.7 * np.exp(-t / 0.035) + 0.3 * np.exp(-t / 0.12))
    return y * vel / np.max(np.abs(y))


def tambourine(vel=1.0, seed=0):
    """Scroll-bar rattle: three micro-bursts of metallic jingle over ~12 ms."""
    r = rng("tamb", seed)
    dur = 0.12
    n = n_of(dur)
    y = np.zeros(n)
    for k, o in enumerate((0.0, r.uniform(0.004, 0.007), r.uniform(0.009, 0.013))):
        L = n_of(0.09)
        t = np.arange(L) / SR
        j = (bp(noise(L, ("tj", seed, k)), 5000, 11000, 2) * 0.6 + 0.3 * np.sin(2 * np.pi * 6300 * t) * noise(L, ("tm", seed, k)) * 0.5
             + 0.2 * np.sin(2 * np.pi * 8150 * t)) * np.exp(-t / 0.03) * (1.0 if k == 0 else 0.6)
        i0 = n_of(o)
        y[i0:i0 + L] += j[: n - i0]
    y = eq(y, ("hp", 4000), ("highshelf", 12000, 0.7, -2.0))
    return y * vel / np.max(np.abs(y))


def snap(vel=1.0, seed=0):
    """Checkbox tick / finger snap: a 2 kHz click and a short band-passed burst."""
    t = _t(0.08)
    y = 0.8 * _res(2150, 0.004, 0.08) + bp(noise(len(t), ("snap", seed)), 1400, 3600, 2) * np.exp(-t / 0.012)
    y = y + convolve(y, room_ir(0.2, seed=5))[:, 0] * 0.15
    return y * vel / np.max(np.abs(y))


def floor_tom(vel=1.0):
    """Disk dropped on the desktop: a 90 Hz sine drop and a thud."""
    t = _t(0.3)
    f = 90 + 45 * np.exp(-t / 0.03)
    y = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.15)
    y += lp(noise(len(t), "tom"), 900, 2) * np.exp(-t / 0.02) * 0.4
    return tanh_sat(y, 1.4) * vel / 1.0


def keystroke(big=False, seed=0):
    """The writer's keystroke, alone in the silence: key-down click, bottom-out thock, spring ping.
    The Return key (big=True) is deeper and longer."""
    dur = 0.16 if big else 0.12
    t = _t(dur)
    y = np.zeros(len(t))
    click = 0.7 * _res(4100, 0.0014, 0.01)
    b = hp(noise(n_of(0.001), ("ks", seed)), 3000, 2)
    click[: len(b)] += 0.6 * b
    y[: len(click)] += click
    i0 = n_of(0.006)
    f1 = 190 if big else 280
    thock = 0.8 * _res(f1, 0.016, dur - 0.006) + 0.45 * _res(1150 if not big else 820, 0.008, dur - 0.006, 0.4)
    thock += 0.12 * _res(3800, 0.03, dur - 0.006, 1.0)
    y[i0:i0 + len(thock)] += thock
    return y / np.max(np.abs(y))


def save_click():
    """One dry mouse click: press, then the release 70 ms later."""
    a = mouse_click(seed=99, bright=0.95)
    b = mouse_click(seed=98, bright=1.1) * 0.35
    y = np.zeros(n_of(0.12))
    y[: len(a)] += a
    i0 = n_of(0.07)
    y[i0:i0 + len(b)] += b
    return y / np.max(np.abs(y))


def floppy_clunk(seed=0):
    """A disk going in: a 110 Hz thunk, a 450 Hz shell resonance, a rattle; then the 1988 sampler (8-bit)."""
    t = _t(0.25)
    y = 0.9 * _res(110, 0.05, 0.25) + 0.5 * _res(450, 0.02, 0.25, 0.3)
    rt = bp(noise(len(t), ("clunk", seed)), 600, 4000, 2) * np.exp(-t / 0.015) * 0.6
    y += rt
    y = tanh_sat(y, 2.0)
    return bitcrush(y / np.max(np.abs(y)), 8, 11025)


def vinyl_bed(dur, seed=0):
    """One More Tune's record: crackle (sparse clicks) over a quiet band-passed hiss.  Stereo."""
    n = n_of(dur)
    r = rng("vinyl", seed)
    out = np.zeros((n, 2))
    hiss = bp(noise(n, ("vh", seed)), 1200, 8000, 2) * 0.05
    out += np.stack([hiss, np.roll(hiss, 101)], axis=1)
    tt = 0.0
    while True:
        tt += r.exponential(1 / 18.0)
        if tt >= dur:
            break
        L = n_of(r.uniform(0.0003, 0.0015))
        i0 = n_of(tt)
        if i0 + L >= n:
            break
        c = r.standard_normal(L) * np.hanning(L) * r.uniform(0.1, 0.8)
        out[i0:i0 + L] += pan(c, r.uniform(-.6, .6))
    return eq(out, ("hp", 300))
