#!/usr/bin/env python3
"""warp.py: make the picture follow a regenerated song, without redrawing a single chapter.

tools/retime.py --measure-only measures where each lyric line of a new performance lands relative to the
timeline the chapters were drawn to (data/data.js).  When the performance is a free generation (its own
phrasing, a few beats early here, late there) correcting the AUDIO would mangle it, so this tool bends the
PICTURE instead: it writes data/warp.js,

    const WARP = [[songT, pictureT], ...];      // piecewise linear, strictly increasing in both

and src/main.js draws picture time warpT(songT) for every frame.  Anchors are the measured starts of lyric lines
(each line's median word offset); lines with too few matched words or an implausible offset are skipped, and
the local speed of the picture is clamped to [MIN_RATE, MAX_RATE] so motion never visibly lurches.

    python3 -I tools/retime.py NEW_SONG.wav --measure-only     # writes build/retime-report.json
    python3 -I tools/warp.py [build/retime-report.json] [--song-duration S]
    python3 -I tools/warp.py --clear                           # identity: delete data/warp.js
"""
import argparse, json, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'data/warp.js'
MIN_RATE, MAX_RATE = 0.6, 1.6        # picture seconds per song second between anchors
MIN_WORDS, MAX_ABS_OFFSET = 2, 6.0     # anchor quality gates


def lines_from_data():
    js = ("const fs=require('fs');const o={};new Function('o',fs.readFileSync(process.argv[1],'utf8')"
          ".replace(/\\bconst\\b|\\blet\\b/g,'var')+';o.L=LYRICS;o.D=DUR')(o);console.log(JSON.stringify(o))")
    return json.loads(subprocess.run(['node', '-e', js, str(ROOT / 'data/data.js')], capture_output=True, text=True, check=True).stdout)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('report', nargs='?', default=str(ROOT / 'build/retime-report.json'))
    ap.add_argument('--song-duration', type=float, default=None)
    ap.add_argument('--clear', action='store_true')
    ap.add_argument('--beat', type=float, nargs='?', const=0.5, default=None,
                    help='snap every anchor offset to whole beats (default 0.5 s) so the picture keeps its beats on the '
                         "song's: run at 1x between lines with equal offsets, ramp only where the offset changes")
    a = ap.parse_args()
    if a.clear:
        OUT.unlink(missing_ok=True); print('identity: data/warp.js removed'); return
    rep = json.loads(Path(a.report).read_text())
    data = lines_from_data()
    start = {l['id']: l['start'] for l in data['L']}
    song_dur = a.song_duration or rep.get('input_duration_s') or data['D']
    pts = [] if a.beat else [(0.0, 0.0)]
    for ln in rep['lines']:
        if ln.get('matched', 0) < MIN_WORDS or ln['line'] not in start or ln.get('median_offset_ms') is None:
            continue
        off = ln['median_offset_ms'] / 1000
        if abs(off) > MAX_ABS_OFFSET:
            continue
        if a.beat:
            off = round(off / a.beat) * a.beat
        pts.append((start[ln['line']] + off, start[ln['line']]))   # (song time, picture time) of the line's start
    pts.append((song_dur, data['D']))
    pts.sort()
    knots = [pts[0]]
    for s, p in pts[1:]:                 # keep the map increasing and the picture's speed within bounds
        s0, p0 = knots[-1]
        if s - s0 < 0.25:
            continue
        rate = (p - p0) / (s - s0)
        if MIN_RATE <= rate <= MAX_RATE:
            knots.append((s, p))
    if knots[-1][0] < song_dur:
        knots.append((song_dur, knots[-1][1] + (song_dur - knots[-1][0])))
    OUT.write_text('// Written by tools/warp.py from ' + Path(a.report).name + ': song time -> picture time. Do not edit.\n'
                   'const WARP = ' + json.dumps([[round(s, 3), round(p, 3)] for s, p in knots]) + ';\n')
    worst = max(abs(s - p) for s, p in knots)
    print(f'{OUT.relative_to(ROOT)}: {len(knots)} knots, largest shift {worst:.2f} s, song {song_dur:.2f} s -> picture {knots[-1][1]:.2f} s')


if __name__ == '__main__':
    sys.exit(main())
