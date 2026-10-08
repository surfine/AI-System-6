"""dsp.py: the signal-processing toolbox for "Pen Pal" (numpy + scipy only, deterministic).

Everything runs at SR = 48 kHz on float64 arrays.  Mono = shape (n,), stereo = shape (n, 2).
Slow per-sample work (envelope followers) runs at a decimated control rate and is interpolated
back, so a full-length 154 s bus compresses in well under a second.
"""
import math

import numpy as np
from scipy import signal
from scipy.ndimage import maximum_filter1d, minimum_filter1d, uniform_filter1d

SR = 48000


# ------------------------------------------------------------------------------------------------
# units, random, shapes
# ------------------------------------------------------------------------------------------------
def db(x):
    return 20.0 * np.log10(np.maximum(np.abs(x), 1e-12))


def undb(d):
    return 10.0 ** (np.asarray(d, dtype=float) / 20.0)


def mtof(m):
    return 440.0 * 2.0 ** ((np.asarray(m, dtype=float) - 69.0) / 12.0)


def rng(*seed):
    """A deterministic generator from any tuple of ints/strings."""
    h = 1469598103934665603
    for s in seed:
        for ch in str(s).encode():
            h = ((h ^ ch) * 1099511628211) & 0xFFFFFFFFFFFFFFFF
    return np.random.default_rng(h)


def n_of(sec):
    return int(round(sec * SR))


def t_axis(n, sr=SR):
    return np.arange(n) / sr


def stereo(x):
    x = np.asarray(x, dtype=float)
    return x if x.ndim == 2 else np.stack([x, x], axis=1)


def mono(x):
    x = np.asarray(x, dtype=float)
    return x if x.ndim == 1 else x.mean(axis=1)


def pan(x, p):
    """Constant-power pan of a mono signal; p in [-1, 1]."""
    a = (p + 1.0) * math.pi / 4.0
    x = mono(x)
    return np.stack([x * math.cos(a), x * math.sin(a)], axis=1) * math.sqrt(2.0)


def width(x, w):
    """Mid/side width: w = 0 mono, 1 unchanged, > 1 wider."""
    x = stereo(x)
    m = (x[:, 0] + x[:, 1]) * 0.5
    s = (x[:, 0] - x[:, 1]) * 0.5 * w
    return np.stack([m + s, m - s], axis=1)


def fade(x, fin=0.0, fout=0.0):
    """Raised-cosine fades (seconds) in place-safe copy."""
    x = np.array(x, dtype=float, copy=True)
    n = len(x)
    a = min(n, n_of(fin))
    b = min(n, n_of(fout))
    if a > 0:
        r = 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, a))
        x[:a] *= r if x.ndim == 1 else r[:, None]
    if b > 0:
        r = 0.5 + 0.5 * np.cos(np.linspace(0, np.pi, b))
        x[n - b:] *= r if x.ndim == 1 else r[:, None]
    return x


def exp_env(n, tau, sr=SR):
    return np.exp(-np.arange(n) / (tau * sr))


def adsr(n, a, d, s, r, sr=SR, hold=None):
    """Linear-attack, exponential decay/release envelope over n samples; release starts at hold (s)."""
    t = np.arange(n) / sr
    hold = n / sr if hold is None else hold
    env = np.where(t < a, t / max(a, 1e-6), s + (1 - s) * np.exp(-(t - a) / max(d, 1e-6)))
    rel = t > hold
    if rel.any():
        lvl = env[min(n - 1, int(hold * sr))]
        env[rel] = lvl * np.exp(-(t[rel] - hold) / max(r, 1e-6))
    return env


def add_at(buf, x, t, gain=1.0):
    """Mix x into buf starting at time t (seconds, may be negative). Works mono->mono, mono->stereo, stereo->stereo."""
    if x is None or len(x) == 0:
        return buf
    i0 = int(round(t * SR))
    if buf.ndim == 2 and x.ndim == 1:
        x = np.stack([x, x], axis=1)
    a, b = max(0, i0), min(len(buf), i0 + len(x))
    if b <= a:
        return buf
    buf[a:b] += gain * x[a - i0:b - i0]
    return buf


# ------------------------------------------------------------------------------------------------
# filters
# ------------------------------------------------------------------------------------------------
def _sos(b, a):
    return signal.tf2sos(b, a)


def biquad(kind, f0, q=0.707, gain_db=0.0, sr=SR):
    """RBJ cookbook biquad as an SOS row."""
    f0 = min(max(f0, 5.0), sr * 0.49)
    A = 10 ** (gain_db / 40.0)
    w = 2 * math.pi * f0 / sr
    cw, sw = math.cos(w), math.sin(w)
    al = sw / (2 * q)
    if kind == "lp":
        b = [(1 - cw) / 2, 1 - cw, (1 - cw) / 2]; a = [1 + al, -2 * cw, 1 - al]
    elif kind == "hp":
        b = [(1 + cw) / 2, -(1 + cw), (1 + cw) / 2]; a = [1 + al, -2 * cw, 1 - al]
    elif kind == "bp":
        b = [al, 0, -al]; a = [1 + al, -2 * cw, 1 - al]
    elif kind == "notch":
        b = [1, -2 * cw, 1]; a = [1 + al, -2 * cw, 1 - al]
    elif kind == "peak":
        b = [1 + al * A, -2 * cw, 1 - al * A]; a = [1 + al / A, -2 * cw, 1 - al / A]
    elif kind == "lowshelf":
        sq = 2 * math.sqrt(A) * al
        b = [A * ((A + 1) - (A - 1) * cw + sq), 2 * A * ((A - 1) - (A + 1) * cw), A * ((A + 1) - (A - 1) * cw - sq)]
        a = [(A + 1) + (A - 1) * cw + sq, -2 * ((A - 1) + (A + 1) * cw), (A + 1) + (A - 1) * cw - sq]
    elif kind == "highshelf":
        sq = 2 * math.sqrt(A) * al
        b = [A * ((A + 1) + (A - 1) * cw + sq), -2 * A * ((A - 1) + (A + 1) * cw), A * ((A + 1) + (A - 1) * cw - sq)]
        a = [(A + 1) - (A - 1) * cw + sq, 2 * ((A - 1) - (A + 1) * cw), (A + 1) - (A - 1) * cw - sq]
    else:
        raise ValueError(kind)
    b = np.array(b) / a[0]
    a = np.array(a) / a[0]
    return np.concatenate([b, a])[None, :]


def _sos_run(sos, x):
    """sosfilt along time; channels filtered as contiguous 1-D arrays (10x faster than axis=0)."""
    x = np.asarray(x, dtype=float)
    sos = np.ascontiguousarray(sos, dtype=float)

    def run1(v):
        return signal.sosfilt(sos, v)
    if x.ndim == 1:
        return run1(x)
    out = np.empty_like(x)
    for c in range(x.shape[1]):
        out[:, c] = run1(np.ascontiguousarray(x[:, c]))
    return out


def sosf(x, sos):
    """Apply SOS along time for mono or stereo."""
    return _sos_run(sos, x)


def eq(x, *bands, sr=SR):
    """eq(x, ('hp', 80), ('peak', 300, 1.0, -3), ('highshelf', 10000, .7, 2), ...)"""
    sos = []
    for b in bands:
        kind, f = b[0], b[1]
        q = b[2] if len(b) > 2 else 0.707
        g = b[3] if len(b) > 3 else 0.0
        sos.append(biquad(kind, f, q, g, sr))
    return sosf(x, np.concatenate(sos, axis=0)) if sos else x


def butter(x, kind, f, order=4, sr=SR):
    if kind in ("bandpass", "bandstop"):
        f = [min(max(v, 5), sr * 0.49) for v in f]
    else:
        f = min(max(f, 5), sr * 0.49)
    sos = signal.butter(order, f, btype=kind, fs=sr, output="sos")
    return _sos_run(sos, x)


def lp(x, f, order=2, sr=SR):
    return butter(x, "lowpass", f, order, sr)


def hp(x, f, order=2, sr=SR):
    return butter(x, "highpass", f, order, sr)


def bp(x, lo, hi, order=2, sr=SR):
    return butter(x, "bandpass", [lo, hi], order, sr)


def onepole(x, tau, sr=SR):
    """One-pole lowpass smoothing with time constant tau (s)."""
    a = math.exp(-1.0 / (tau * sr))
    x = np.asarray(x, dtype=float)
    if x.ndim == 1:
        return signal.lfilter([1 - a], [1, -a], x)
    return np.stack([signal.lfilter([1 - a], [1, -a], np.ascontiguousarray(x[:, c])) for c in range(x.shape[1])], axis=1)


def sweep_filter(x, kind, f_curve, q=0.707, block=64, sr=SR):
    """Time-varying biquad: f_curve gives the cutoff per sample (same length as x). Blockwise with state carry."""
    x = np.asarray(x, dtype=float)
    y = np.zeros_like(x)
    zi = None
    for i in range(0, len(x), block):
        f = float(f_curve[min(len(f_curve) - 1, i + block // 2)])
        sos = biquad(kind, f, q, 0.0, sr)
        seg = x[i:i + block]
        if zi is None:
            zi = np.zeros((1, 2) + seg.shape[1:])
        out, zi = signal.sosfilt(sos, seg, axis=0, zi=zi)
        y[i:i + block] = out
    return y


# ------------------------------------------------------------------------------------------------
# oscillators
# ------------------------------------------------------------------------------------------------
def phase_of(freq, sr=SR, ph0=0.0):
    """Cumulative phase (cycles) for a per-sample frequency array."""
    return ph0 + np.cumsum(np.asarray(freq, dtype=float)) / sr


def polyblep(t, dt):
    """PolyBLEP residual for phase t in [0,1) with increment dt (arrays)."""
    out = np.zeros_like(t)
    m1 = t < dt
    x = t[m1] / dt[m1]
    out[m1] = x + x - x * x - 1.0
    m2 = t > 1.0 - dt
    x = (t[m2] - 1.0) / dt[m2]
    out[m2] = x * x + x + x + 1.0
    return out


def saw(freq, sr=SR, ph0=0.0):
    freq = np.asarray(freq, dtype=float)
    ph = phase_of(freq, sr, ph0) % 1.0
    dt = np.abs(freq) / sr
    return (2.0 * ph - 1.0) - polyblep(ph, np.maximum(dt, 1e-9))


def pulse(freq, duty=0.5, sr=SR, ph0=0.0):
    freq = np.asarray(freq, dtype=float)
    ph = phase_of(freq, sr, ph0) % 1.0
    dt = np.maximum(np.abs(freq) / sr, 1e-9)
    y = np.where(ph < duty, 1.0, -1.0)
    y = y + polyblep(ph, dt) - polyblep((ph - duty) % 1.0, dt)
    return y - (2 * duty - 1)


def sine(freq, sr=SR, ph0=0.0):
    return np.sin(2 * np.pi * phase_of(freq, sr, ph0))


def tri(freq, sr=SR, ph0=0.0):
    ph = phase_of(freq, sr, ph0) % 1.0
    return 4.0 * np.abs(ph - 0.5) - 1.0


def noise(n, seed=0):
    return rng("noise", seed).standard_normal(n)


# ------------------------------------------------------------------------------------------------
# non-linear
# ------------------------------------------------------------------------------------------------
def tanh_sat(x, drive=1.0):
    return np.tanh(x * drive) / math.tanh(drive) if drive > 0 else x


def soft_clip(x, ceiling=1.0, knee=0.7):
    """Transparent below knee*ceiling, smooth (cubic) into the ceiling above."""
    x = np.asarray(x, dtype=float)
    k = knee * ceiling
    ax = np.abs(x)
    over = ax > k
    y = x.copy()
    r = ceiling - k
    z = np.minimum((ax[over] - k) / (2 * r), 1.0)
    y[over] = np.sign(x[over]) * (k + r * (2 * z - z * z))
    return y


def bitcrush(x, bits=8, rate=11025, sr=SR, mix=1.0, dither=False, seed=0):
    """Sample-and-hold to `rate` and quantise to `bits`. Works mono/stereo."""
    x = np.asarray(x, dtype=float)
    step = max(1, int(round(sr / rate)))
    idx = (np.arange(len(x)) // step) * step
    held = x[idx]
    q = 2.0 ** (bits - 1)
    if dither:
        held = held + (rng("dith", seed).random(held.shape) - rng("dith2", seed).random(held.shape)) / q
    y = np.round(held * q) / q
    return x * (1 - mix) + y * mix


def bitcrush_curve(x, bits_curve, sr=SR):
    """Quantise with a per-sample bit depth (float bits allowed)."""
    q = 2.0 ** (np.asarray(bits_curve) - 1)
    if x.ndim == 2:
        q = q[:, None]
    return np.round(x * q) / q


# ------------------------------------------------------------------------------------------------
# dynamics
# ------------------------------------------------------------------------------------------------
CTRL = 16  # control-rate decimation for envelope followers (3 kHz at 48 kHz)


def _follow(level, att, rel, ctrl_sr):
    """Attack/release one-pole follower on a control-rate level array (python loop at ~3 kHz)."""
    a_a = math.exp(-1.0 / max(att * ctrl_sr, 1e-6))
    a_r = math.exp(-1.0 / max(rel * ctrl_sr, 1e-6))
    out = np.empty_like(level)
    e = 0.0
    lv = level.tolist()
    for i, v in enumerate(lv):
        if v > e:
            e = a_a * e + (1 - a_a) * v
        else:
            e = a_r * e + (1 - a_r) * v
        out[i] = e
    return out


def _ctrl_level(x, mode="peak"):
    m = np.abs(mono(x)) if x.ndim == 1 else np.max(np.abs(x), axis=1)
    n = len(m)
    pad = (-n) % CTRL
    if pad:
        m = np.concatenate([m, np.zeros(pad)])
    blocks = m.reshape(-1, CTRL)
    if mode == "rms":
        return np.sqrt(np.mean(blocks ** 2, axis=1))
    return blocks.max(axis=1)


def _to_audio_rate(g, n):
    xs = (np.arange(len(g)) + 0.5) * CTRL
    return np.interp(np.arange(n), xs, g)


def compressor(x, thr=-18.0, ratio=4.0, attack=0.005, release=0.08, knee=6.0, makeup=0.0,
               sidechain=None, mode="peak", return_gain=False):
    """Feed-forward compressor. thr/knee/makeup in dB, times in s.  sidechain: optional key signal."""
    key = x if sidechain is None else sidechain
    lvl = _ctrl_level(key, mode)
    env = _follow(lvl, attack, release, SR / CTRL)
    L = db(env)
    over = L - thr
    gr = np.where(over <= -knee / 2, 0.0,
                  np.where(over >= knee / 2, over * (1 - 1 / ratio),
                           (1 - 1 / ratio) * (over + knee / 2) ** 2 / (2 * knee)))
    g = undb(-gr + makeup)
    g = _to_audio_rate(g, len(x))
    y = x * (g if x.ndim == 1 else g[:, None])
    return (y, g) if return_gain else y


def deesser(x, f=6000.0, thr=-30.0, ratio=4.0, max_cut=10.0):
    """Split-band de-esser: compress only the band above f when it is loud."""
    hi = hp(x, f, 4)
    lo = x - hi
    lvl = _ctrl_level(hi, "rms")
    env = _follow(lvl, 0.001, 0.05, SR / CTRL)
    over = np.maximum(db(env) - thr, 0.0)
    gr = np.minimum(over * (1 - 1 / ratio), max_cut)
    g = _to_audio_rate(undb(-gr), len(x))
    return lo + hi * (g if x.ndim == 1 else g[:, None])


def gate(x, thr=-50.0, attack=0.001, release=0.05, floor=-80.0):
    lvl = _ctrl_level(x, "peak")
    env = _follow(lvl, attack, release, SR / CTRL)
    g = np.where(db(env) > thr, 1.0, undb(floor))
    g = onepole(g, 0.003, SR / CTRL)
    g = _to_audio_rate(g, len(x))
    return x * (g if x.ndim == 1 else g[:, None])


_PHASES = {}


def _phase_filters(k=4, taps=32):
    """Windowed-sinc fractional-delay FIRs for phases 1/k .. (k-1)/k (Kaiser, beta 8)."""
    if (k, taps) not in _PHASES:
        D = taps // 2
        m = np.arange(taps)
        w = np.kaiser(taps, 8.0)
        hs = []
        for p in range(1, k):
            h = np.sinc(m - D + p / k) * w
            hs.append(h / h.sum())
        _PHASES[(k, taps)] = (hs, D)
    return _PHASES[(k, taps)]


def interp_phases(x, k=4, taps=32):
    """Band-limited values at fractional positions i + p/k (p = 1..k-1), aligned to sample i.
    Returns a list of k-1 arrays shaped like x."""
    hs, D = _phase_filters(k, taps)
    x = np.asarray(x, dtype=float)
    out = []
    for h in hs:
        if x.ndim == 1:
            y = signal.lfilter(h, [1.0], np.concatenate([x, np.zeros(D + 1)]))[D:D + len(x)]
        else:
            y = np.stack([signal.lfilter(h, [1.0], np.concatenate([np.ascontiguousarray(x[:, c]), np.zeros(D + 1)]))[D:D + len(x)]
                          for c in range(x.shape[1])], axis=1)
        out.append(y)
    return out


def tp_env(x, k=4):
    """Per-sample true-peak envelope: max |value| over [i, i+1) on a k-times oversampled grid,
    max over channels."""
    a = np.abs(x)
    for y in interp_phases(x, k):
        a = np.maximum(a, np.abs(y))
    return a if a.ndim == 1 else a.max(axis=1)


def oversample(x, k=4):
    ph = interp_phases(x, k)
    if x.ndim == 1:
        out = np.empty(len(x) * k)
        out[0::k] = x
        for p, y in enumerate(ph, 1):
            out[p::k] = y
        return out
    out = np.empty((len(x) * k, x.shape[1]))
    out[0::k] = x
    for p, y in enumerate(ph, 1):
        out[p::k] = y
    return out


def true_peak(x, k=4):
    return float(np.max(tp_env(x, k)))


def limiter(x, ceiling_db=-1.0, lookahead=0.005, release=0.06, k=4):
    """Lookahead brick-wall limiter on true (4x oversampled) peaks; never overshoots the ceiling
    at the oversampled rate. Returns (y, gain)."""
    c = undb(ceiling_db)
    n = len(x)
    pk = tp_env(x, k)
    pk = np.maximum(pk, np.concatenate([[0.0], pk[:-1]]))
    req = np.minimum(1.0, c / np.maximum(pk, 1e-12))
    L = max(1, int(lookahead * SR))
    g = minimum_filter1d(req, size=2 * L + 1, mode="nearest")
    g = uniform_filter1d(g, size=L, mode="nearest")
    # release: let the gain recover no faster than the release time (one-pole on the upward side only)
    a_r = math.exp(-1.0 / (release * SR / CTRL))
    gc = g[: (len(g) // CTRL) * CTRL].reshape(-1, CTRL).min(axis=1) if len(g) >= CTRL else g
    out = np.empty_like(gc)
    e = 1.0
    for i, v in enumerate(gc.tolist()):
        e = v if v < e else a_r * e + (1 - a_r) * v
        out[i] = e
    gs = np.minimum(g, _to_audio_rate(out, n))
    y = x * (gs if x.ndim == 1 else gs[:, None])
    # safety: final true-peak check, scale any residual overshoot block-wise
    tp = true_peak(y, k)
    if tp > c:
        y *= c / tp
    return y, gs


# ------------------------------------------------------------------------------------------------
# space: reverb (synthesised impulse responses, FFT convolution) and delay
# ------------------------------------------------------------------------------------------------
def plate_ir(seconds=2.2, predelay=0.02, bright=1.0, seed=1, sr=SR, decay_low=None, decay_high=None):
    """A stereo plate-like IR: dense decorrelated noise with frequency-dependent decay (8 bands),
    a smooth onset (no discrete echoes, like a plate) and a gentle high-frequency roll-off."""
    n = int(seconds * sr)
    t = np.arange(n) / sr
    edges = [20, 200, 500, 1000, 2000, 4000, 7000, 11000, 20000]
    t60_mid = seconds * 0.55
    dl = decay_low if decay_low is not None else t60_mid * 1.15
    dh = decay_high if decay_high is not None else t60_mid * 0.45 * bright
    ir = np.zeros((n, 2))
    for ch in range(2):
        nz = rng("plate", seed, ch).standard_normal(n)
        for i in range(len(edges) - 1):
            lo, hi = edges[i], edges[i + 1]
            band = bp(nz, lo, min(hi, sr * 0.45), 2, sr)
            frac = i / (len(edges) - 2)
            t60 = dl * (1 - frac) + dh * frac
            band *= 10 ** (-3 * t / t60)
            ir[:, ch] += band
    onset = 1 - np.exp(-t / 0.012)
    ir *= onset[:, None]
    pd = int(predelay * sr)
    ir = np.concatenate([np.zeros((pd, 2)), ir])
    ir /= np.sqrt(np.sum(ir ** 2) / 2)
    return ir


def room_ir(seconds=0.35, seed=2, sr=SR):
    """A short bright room for claps and snaps: early reflections + a fast tail."""
    n = int(seconds * sr)
    t = np.arange(n) / sr
    ir = np.zeros((n, 2))
    r = rng("room", seed)
    for ch in range(2):
        nz = r.standard_normal(n) * np.exp(-t / (seconds / 6.9))
        ir[:, ch] = hp(lp(nz, 9000), 250)
        for k in range(10):
            d = int(r.uniform(0.002, 0.03) * sr)
            ir[d, ch] += r.uniform(0.2, 0.5) * (1 if r.random() > 0.5 else -1)
    ir /= np.sqrt(np.sum(ir ** 2) / 2)
    return ir


def convolve(x, ir):
    """Mono or stereo x through a stereo IR -> stereo."""
    x = np.asarray(x, dtype=float)
    if x.ndim == 1:
        return np.stack([signal.oaconvolve(x, ir[:, c])[: len(x)] for c in range(2)], axis=1)
    return np.stack([signal.oaconvolve(x[:, c], ir[:, c])[: len(x)] for c in range(2)], axis=1)


def pingpong(x, delay_s, feedback=0.35, repeats=8, lp_hz=5000.0, hp_hz=300.0):
    """Ping-pong delay built from shifted, progressively filtered copies (exact, no per-sample loop)."""
    xm = mono(x)
    n = len(xm)
    d = int(round(delay_s * SR))
    out = np.zeros((n, 2))
    cur = hp(xm, hp_hz, 2)
    g = 1.0
    for r in range(1, repeats + 1):
        cur = lp(cur, lp_hz, 1)
        g *= feedback if r > 1 else 1.0
        sh = r * d
        if sh >= n:
            break
        ch = (r - 1) % 2
        out[sh:, ch] += g * cur[: n - sh]
    return out


# ------------------------------------------------------------------------------------------------
# resampling / pitch helpers
# ------------------------------------------------------------------------------------------------
def resample(x, sr_in, sr_out):
    if sr_in == sr_out:
        return np.asarray(x, dtype=float)
    g = math.gcd(int(sr_in), int(sr_out))
    return signal.resample_poly(x, int(sr_out) // g, int(sr_in) // g, axis=0)


def exciter(x, f=3500.0, drive=3.0, amount=0.15, out_hp=7000.0):
    """Harmonic exciter: saturate the upper band and add back only the new highs (air above the
    22 kHz-sampled TTS band)."""
    band = hp(x, f, 2)
    sat = np.tanh(band * drive)
    return x + amount * hp(sat, out_hp, 4)


def lufs(x):
    import pyloudnorm as pyln
    meter = pyln.Meter(SR)
    return float(meter.integrated_loudness(stereo(x)))


def short_term_lufs(x, win=3.0, hop=1.0):
    import pyloudnorm as pyln
    meter = pyln.Meter(SR)
    out = []
    n = len(x)
    W, H = int(win * SR), int(hop * SR)
    for i in range(0, max(1, n - W), H):
        seg = stereo(x[i:i + W])
        try:
            out.append((i / SR, float(meter.integrated_loudness(seg))))
        except Exception:
            out.append((i / SR, -70.0))
    return out
