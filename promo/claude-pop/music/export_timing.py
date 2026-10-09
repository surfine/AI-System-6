#!/usr/bin/env python3
"""export_timing.py: reads music/score.json and writes data/data.js for the video.

Run:  python3 -I music/export_timing.py

data.js defines plain globals (no modules):
  LYRICS   [{text, id, section, voice, role?, start, end, words: [{w, start, end, syl?, silent?}]}]  seconds
  SECTIONS [{name, label, start, end}]
  BEATS    [seconds of every beat]        BARS [seconds of every bar start]
  HITS     {name: seconds}                ERAS [{name, start, note}]
  EVENTS   per-instrument events, in seconds, derived from parts (the desk is the band: the video
           draws one UI event for each):
             kick [t]            floppy eject           snare [t]      window close (zoom outline)
             clap [t]            mouse click, stacked   hat [t]        keystroke (closed + open hats; open = space bar)
             crash [t]           Trash crumple          riser [[t0,t1]] progress bar filling
             stab [t]            boot chord as brass    bell [[t,midi]] the Writing Bell
             floppyA [[t,midi,dur]] drive A (roots)     floppyB [[t,midi,dur]] drive B (octave / fifth)
             keystroke [t]       the writer's single keystrokes ('pen' in the silence, Return at the end)
             chop [[t,dur]]      the pen-pal vocal chops
           extras: openHat, ghost, cowbell (system beep), tambourine (scroll bar), snap (checkbox), tom,
             chokedCrash, click (Save), sub [[t,midi,dur]] (808), beep [[t,midi]] (the bridge years),
             blip [t] (typed verbs), drop {name: t}, riff [[t,midi,dur]] (the Floppy Organ), chopWord [[t,dur,word]]
  KIT      {voice: {foley, cause, synth}}   BPM, DUR (seconds), TITLE
Never hand-edit timings in the video: regenerate this file.
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
SCORE = os.path.join(HERE, "score.json")
OUT = os.path.join(os.path.dirname(HERE), "data", "data.js")


def drum_hits(S):
    """Expand the 16th-grid drum patterns (with overrides and mutes) into {row: [beat, ...]}."""
    D = S["parts"]["drums"]
    bpb = S["beatsPerBar"]
    grid = D.get("grid", 16)
    step = bpb / grid
    out = {}
    secs = sorted(S["sections"], key=lambda s: s["startBeat"])
    overrides = D.get("overrides", [])
    mutes = D.get("mutes", [])

    def pattern_at(sec, beat):
        for o in overrides:
            if o["startBeat"] <= beat < o["startBeat"] + o["beats"]:
                return D["patterns"][o["pattern"]], o["startBeat"]
        return D["patterns"][D["sections"][sec["name"]]], sec["startBeat"]

    for sec in secs:
        b = sec["startBeat"]
        end = b + sec["beats"]
        while b < end - 1e-9:
            pat, origin = pattern_at(sec, b)
            for row, cells in pat.items():
                idx = int(round((b - origin) / step)) % len(cells)
                if cells[idx] == "x" and not any(m[0] <= b < m[0] + m[1] for m in mutes):
                    out.setdefault(row, []).append(b)
            b += step
    return out


def main():
    with open(SCORE) as f:
        S = json.load(f)
    bpm = S["bpm"]
    spb = 60.0 / bpm

    def sec(beat):
        return round(beat * spb, 3)

    lyrics = []
    for L in S["lines"]:
        words = []
        for w in L["words"]:
            n0, n1 = w["notes"][0], w["notes"][-1]
            entry = {"w": w["w"], "start": sec(n0[1]), "end": sec(n1[1] + n1[2])}
            if "syl" in w:
                entry["syl"] = w["syl"]
            if w.get("silent"):
                entry["silent"] = True
            words.append(entry)
        item = {"text": L["text"], "id": L["id"], "section": L["section"], "voice": L["voice"],
                "start": words[0]["start"], "end": words[-1]["end"], "words": words}
        if "role" in L:
            item["role"] = L["role"]
        lyrics.append(item)
    lyrics.sort(key=lambda l: l["start"])

    sections = [{"name": s["name"], "label": s.get("label", s["name"]), "start": sec(s["startBeat"]),
                 "end": sec(s["startBeat"] + s["beats"])} for s in sorted(S["sections"], key=lambda s: s["startBeat"])]
    dur_beats = S["durationBeats"]
    beats = [sec(b) for b in range(dur_beats + 1)]
    bars = [sec(b) for b in range(0, dur_beats + 1, S["beatsPerBar"])]
    hits = {k: sec(v) for k, v in sorted(S["parts"]["hits"].items(), key=lambda kv: kv[1])}
    eras = [{"name": e["name"], "start": sec(e["startBeat"]), "note": e.get("note", "")} for e in S["parts"].get("eras", [])]
    dur = sec(dur_beats)

    # ---- EVENTS: the desk as the band
    P = S["parts"]
    D = P["drums"]
    rows = drum_hits(S)
    times = lambda beats_: sorted(sec(b) for b in beats_)
    notes3 = lambda evs: sorted([[sec(e[1]), e[0], round(e[2] * spb, 3)] for e in evs], key=lambda x: x[0])
    stab_beats = sorted({st["startBeat"] for st in P["stabs"]["brass"]})
    events = {
        "kick": times(rows.get("kick", [])),
        "snare": times(rows.get("snare", [])),
        "clap": times(rows.get("clap", []) + [f["startBeat"] for f in D["fills"] if f["name"] == "keepIt"]),
        "hat": times(rows.get("hat", []) + rows.get("openHat", [])),
        "crash": times(D.get("crashes", [])),
        "riser": sorted([[sec(r[0]), sec(r[1])] for r in D.get("risers", [])]),
        "stab": times(stab_beats),
        "bell": sorted([[sec(e[1]), e[0]] for e in P.get("bells", [])]),
        "floppyA": notes3(P["bass"]["drives"]["A"]),
        "floppyB": notes3(P["bass"]["drives"]["B"]),
        "keystroke": times(P["sfx"].get("keystrokes", [P["sfx"]["keystroke"]])),
        "chop": sorted([[sec(e[1]), round(e[2] * spb, 3)] for e in P["chops"]["events"]]),
        # extras
        "openHat": times(rows.get("openHat", [])),
        "ghost": times(rows.get("ghostSnare", [])),
        "cowbell": times(rows.get("cowbell", [])),
        "tambourine": times(rows.get("tambourine", [])),
        "snap": times(rows.get("snap", [])),
        "tom": times([f["startBeat"] + k for f in D["fills"] if f["name"] == "stumble" for k in (0, .25, .5)]),
        "chokedCrash": times(D.get("chokedCrashes", [])),
        "click": times(P["sfx"].get("clicks", [P["sfx"]["saveClick"]])),
        "sub": notes3(P.get("sub", {}).get("events", [])),
        "beep": sorted([[sec(e[1]), e[0]] for e in P.get("beeps", [])]),
        "blip": times(P["sfx"].get("blips", [])),
        "drop": {k: sec(v) for k, v in sorted(P["sfx"].get("drops", {}).items(), key=lambda kv: kv[1])},
        "riff": notes3(P["riff"]["events"]),
        "chopWord": sorted([[sec(e[1]), round(e[2] * spb, 3), e[3]] for e in P["chops"]["events"]]),
    }
    kit = {k: {"foley": v["foley"], "cause": v["cause"], "synth": v.get("synth", "")} for k, v in D.get("kit", {}).items()}

    def js(name, value):
        return "const %s = %s;\n" % (name, json.dumps(value, ensure_ascii=False, separators=(",", ":")))

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f:
        f.write("// Generated by music/export_timing.py from music/score.json. Do not edit: regenerate.\n")
        f.write("// %s: %d bpm, %.1f s. Times in seconds.\n" % (S["title"], bpm, dur))
        f.write(js("TITLE", S["title"]))
        f.write(js("BPM", bpm))
        f.write(js("DUR", dur))
        f.write(js("SECTIONS", sections))
        f.write(js("HITS", hits))
        f.write(js("ERAS", eras))
        f.write(js("BEATS", beats))
        f.write(js("BARS", bars))
        f.write(js("KIT", kit))
        f.write("// EVENTS: every percussive voice is a UI event with a visible cause (see KIT). Seconds.\n")
        f.write("const EVENTS = {\n")
        for k, v in events.items():
            f.write("  %s: %s,\n" % (k, json.dumps(v, ensure_ascii=False, separators=(",", ":"))))
        f.write("};\n")
        f.write("const LYRICS = [\n")
        for l in lyrics:
            f.write("  %s,\n" % json.dumps(l, ensure_ascii=False, separators=(",", ":")))
        f.write("];\n")
    counts = ", ".join("%s %d" % (k, len(v)) for k, v in events.items() if k in
                       ("kick", "snare", "clap", "hat", "crash", "riser", "stab", "bell", "floppyA", "floppyB", "keystroke", "chop"))
    print("wrote %s: %d lines, %d sections, %d hits, DUR %.1f s" % (OUT, len(lyrics), len(sections), len(hits), dur))
    print("  EVENTS: " + counts)


if __name__ == "__main__":
    main()
