"""Assemble the final song from the chosen ACE-Step take ("Pen Pal", sexy dance-pop, seed 59).

The take is sung freely: it opens on its first word, runs ~3 s of extra la-la before the bridge, and its bar lines
fall 0.463 s into the file. The picture was drawn to data/data.js. Two whole-bar audio edits bring the two
timelines onto the same bar grid, and tools/warp.py takes the sub-bar rest:

  1. PRE-ROLL: PRE seconds of the film's own boot chord (the first seconds of the first, code-made track) go in
     front, so the take's first downbeat lands on a picture bar line (PRE + 0.463 = 2.0 s) and the opening pixel
     gets its moment.
  2. CUT: two bars of la-la (CUT_FROM..CUT_TO in the take, both bar lines, both in breaths) come out of the
     second post-chorus, where the take runs long.

Output build/song.assembled.wav (48 kHz stereo 24-bit). Then:
    python3 -I tools/retime.py build/song.assembled.wav --measure-only && python3 -I tools/warp.py --beat
    python3 -I music/assemble_final.py --pen      # adds the silent pen at the warped times -> build/song.wav

    python3 -I music/assemble_final.py [--take build/ace/pen-pal-sexy-59.wav] [--boot build/boot-chord.wav] [--pen]
"""
import argparse, os, sys
import numpy as np, soundfile as sf

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
SR = 48000
PRE = 1.537                      # pre-roll: take downbeat 0.463 s + PRE = picture bar line at 2.0 s
CUT_FROM, CUT_TO = 106.463, 110.463   # take seconds: bar lines in the second post-chorus's la-la
XF = 0.020


def load(path):
    y, sr = sf.read(path, always_2d=True)
    if sr != SR:
        from scipy.signal import resample_poly
        y = resample_poly(y, SR, sr, axis=0)
    return y[:, :2].astype(np.float32)


def xfade_join(a, b, n):
    """Equal-power crossfade of n samples between the end of a and the start of b."""
    t = np.linspace(0, np.pi / 2, n, dtype=np.float32)[:, None]
    return np.concatenate([a[:-n], a[-n:] * np.cos(t) + b[:n] * np.sin(t), b[n:]])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--take', default=os.path.join(ROOT, 'build/ace/pen-pal-sexy-59.wav'))
    ap.add_argument('--boot', default=os.path.join(ROOT, 'build/boot-chord.wav'))
    ap.add_argument('--pen', action='store_true', help='add the silent pen (needs data/warp.js) and write build/song.wav')
    a = ap.parse_args()
    out = os.path.join(ROOT, 'build/song.assembled.wav')
    if a.pen:
        import barfit
        z = load(out)
        pic, song, how = barfit.pen_times(os.path.join(ROOT, 'data/data.js'), os.path.join(ROOT, 'data/warp.js'))
        z = barfit.silent_pen(z, song['bandOut'], song['keystroke'], song['slamBack'], -9.0)
        sf.write(os.path.join(ROOT, 'build/song.wav'), np.clip(z, -0.99999, 0.99999), SR, subtype='PCM_24')
        print('silent pen at song', {k: round(v, 3) for k, v in song.items()}, '(' + how + ') -> build/song.wav')
        return
    take = load(a.take)
    n = int(XF * SR)
    i0, i1 = int(round(CUT_FROM * SR)), int(round(CUT_TO * SR))
    body = xfade_join(take[:i0 + n], take[i1:], n)
    boot = load(a.boot)[:int(round(PRE * SR))]
    fade = np.linspace(1, 0, len(boot), dtype=np.float32)[:, None] ** 0.5
    pre = boot * fade * 0.8
    z = np.concatenate([pre, body])
    sf.write(out, np.clip(z, -0.99999, 0.99999), SR, subtype='PCM_24')
    print(f'{os.path.relpath(out, ROOT)}: {len(z) / SR:.3f} s (pre-roll {PRE} s, cut {CUT_TO - CUT_FROM:.0f} s of la-la)')


if __name__ == '__main__':
    main()
