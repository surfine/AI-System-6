#!/usr/bin/env python3
"""validate_score.py: checks music/score.json (BRIEF §5) before anything is rendered from it.

Run:  python3 -I music/validate_score.py [path/to/score.json]

Hard errors (exit 1):
  - sections and chords must tile the song exactly (no gaps, no overlaps, ending at durationBeats)
  - total length must be 130-160 s
  - within one voice, notes must never overlap; inside a word, notes must be contiguous
  - inside a line, words must be in time order
  - the line text must equal the words' "w" in order (what is on screen is what is sung)
  - a word with several notes must carry "syl" with one string per note, and the syllables
    must spell the word; the heuristic syllable count must agree with the note count
  - every sung note must sit within its voice's documented range (parts.voiceRanges)
  - no sung note shorter than half a beat (the TTS/PSOLA floor)
  - a sung note starting on a strong beat (beats 1 and 3) must be a chord tone, unless it is in
    the chant voice (monotone by design) or the word is flagged "nct": true (deliberate)
  - MIDI 0 appears only in spoken lines or in words flagged "silent": true
Warnings (printed, exit 0):
  - non-chord tones on strong beats in the chant voice (reported, never fatal)
  - sung notes with no chord under them
"""
import json
import os
import re
import sys

STRONG = (0, 2)      # beat offsets inside a 4/4 bar that count as strong
MIN_NOTE = 0.5


def syllables(word):
    """Rough English syllable count: vowel groups, minus a silent trailing 'e', at least 1."""
    w = re.sub(r"[^a-z]", "", word.lower())
    if not w:
        return 1
    groups = re.findall(r"[aeiouy]+", w)
    n = len(groups)
    syllabic_le = w.endswith("le") and len(w) > 2 and w[-3] not in "aeiouy"   # table, little; not file, whole
    if w.endswith("e") and not syllabic_le and not w.endswith(("ee", "ye")) and n > 1:
        n -= 1
    if w.endswith("ed") and n > 1 and not w.endswith(("ted", "ded")):
        n -= 1
    return max(1, n)


# words whose count the heuristic gets wrong (and how the song actually sings them)
SYL_OVERRIDE = {"everything": 3, "temporary": 4, "floppy": 2, "floppies": 2, "question": 2, "eighty-eight": 3,
                "ninety-one": 3, "ninety-five": 3, "ninety-eight": 3, "ninety-nine": 3, "oh-two": 2,
                "oh-five": 2, "oh-nine": 2, "eleven": 3, "fourteen": 2, "twenty": 2, "twenty-six": 3,
                "eras": 2, "windows": 2, "i'm": 1, "you're": 1, "i'll": 1, "don't": 1, "won't": 1,
                "computer": 3, "regular": 3, "generic": 3, "release": 2, "outline": 2, "insert": 2,
                "export": 2, "scrapbook": 2, "review": 2, "model": 2, "always": 2, "erase": 2,
                "roughness": 2, "never": 2, "(pen": 1, "pal)": 1, "la": 1, "la,": 1, "la.": 1}


def main(path):
    with open(path) as f:
        S = json.load(f)
    errors, warnings = [], []
    err = errors.append
    warn = warnings.append
    bpm, bpb, dur = S["bpm"], S["beatsPerBar"], S["durationBeats"]
    seconds = dur * 60 / bpm

    # ---- length
    if not 130 <= seconds <= 160:
        err("total length %.1f s is outside 130-160 s" % seconds)

    # ---- sections tile
    secs = sorted(S["sections"], key=lambda s: s["startBeat"])
    if not secs or secs[0]["startBeat"] != 0:
        err("sections do not start at beat 0")
    for a, b in zip(secs, secs[1:]):
        if a["startBeat"] + a["beats"] != b["startBeat"]:
            err("sections %s and %s do not tile (%s+%s != %s)" % (a["name"], b["name"], a["startBeat"], a["beats"], b["startBeat"]))
    if secs and secs[-1]["startBeat"] + secs[-1]["beats"] != dur:
        err("last section ends at %s, durationBeats is %s" % (secs[-1]["startBeat"] + secs[-1]["beats"], dur))
    names = [s["name"] for s in secs]
    if len(set(names)) != len(names):
        err("duplicate section names")
    for s in secs:
        if s["startBeat"] % bpb:
            warn("section %s starts off the bar (beat %s)" % (s["name"], s["startBeat"]))

    # ---- chords tile
    chords = sorted(S["chords"], key=lambda c: c["startBeat"])
    if chords and chords[0]["startBeat"] != 0:
        err("chords do not start at beat 0")
    for a, b in zip(chords, chords[1:]):
        if a["startBeat"] + a["beats"] != b["startBeat"]:
            err("chords %s@%s and %s@%s do not tile" % (a["symbol"], a["startBeat"], b["symbol"], b["startBeat"]))
    if chords and chords[-1]["startBeat"] + chords[-1]["beats"] != dur:
        err("chords end at %s, not %s" % (chords[-1]["startBeat"] + chords[-1]["beats"], dur))

    def chord_at(beat):
        for c in chords:
            if c["startBeat"] <= beat < c["startBeat"] + c["beats"]:
                return c
        return None

    # ---- voice ranges
    ranges = S.get("parts", {}).get("voiceRanges", {})
    if not ranges:
        err("parts.voiceRanges missing: document the melody range per voice")

    # ---- lines
    by_voice = {}
    ids = set()
    nct_report = []
    for L in S["lines"]:
        lid = L.get("id", "?")
        if lid in ids:
            err("duplicate line id %s" % lid)
        ids.add(lid)
        if L["section"] not in names:
            err("line %s: unknown section %s" % (lid, L["section"]))
        voice = L["voice"]
        if voice not in ("lead", "chant", "choir", "spoken"):
            err("line %s: bad voice %s" % (lid, voice))
        words = L["words"]
        if [w["w"] for w in words] != L["text"].split():
            err("line %s: text %r does not match its words %r" % (lid, L["text"], [w["w"] for w in words]))
        prev_end = None
        for w in words:
            notes = w["notes"]
            if not notes:
                err("line %s: word %r has no notes" % (lid, w["w"]))
                continue
            # contiguity inside the word
            for n1, n2 in zip(notes, notes[1:]):
                if abs(n1[1] + n1[2] - n2[1]) > 1e-9:
                    err("line %s: word %r notes are not contiguous (%s)" % (lid, w["w"], notes))
            # order between words
            if prev_end is not None and notes[0][1] < prev_end - 1e-9:
                err("line %s: word %r starts (%s) before the previous word ends (%s)" % (lid, w["w"], notes[0][1], prev_end))
            prev_end = notes[-1][1] + notes[-1][2]
            # syllables
            if len(notes) > 1:
                syl = w.get("syl")
                if not syl or len(syl) != len(notes):
                    err("line %s: word %r spans %d notes but syl=%r" % (lid, w["w"], len(notes), syl))
                elif "".join(syl) != w["w"]:
                    err("line %s: syllables %r do not spell %r" % (lid, syl, w["w"]))
            elif "syl" in w and len(w["syl"]) != 1:
                err("line %s: word %r has one note but %d syllables" % (lid, w["w"], len(w["syl"])))
            expect = SYL_OVERRIDE.get(w["w"].lower().strip(".,?!"), SYL_OVERRIDE.get(w["w"].lower(), syllables(w["w"])))
            if expect != len(notes):
                err("line %s: word %r has %d notes but reads as %d syllable(s)" % (lid, w["w"], len(notes), expect))
            for n in notes:
                m, b, d = n
                if m == 0:
                    if voice != "spoken" and not w.get("silent"):
                        err("line %s: unpitched note in sung word %r without silent=true" % (lid, w["w"]))
                    continue
                if voice == "spoken":
                    err("line %s: spoken word %r carries a pitch %s" % (lid, w["w"], m))
                if d < MIN_NOTE - 1e-9:
                    err("line %s: note %s in %r is %.2f beats, shorter than %.1f" % (lid, m, w["w"], d, MIN_NOTE))
                r = ranges.get(voice, {}).get("midi")
                if r and not r[0] <= m <= r[1]:
                    err("line %s: %r note %d is outside the %s range %s-%s" % (lid, w["w"], m, voice, r[0], r[1]))
                c = chord_at(b)
                if c is None:
                    warn("line %s: %r at beat %s has no chord under it" % (lid, w["w"], b))
                elif (b % bpb) in STRONG and abs(b - round(b)) < 1e-9:
                    pcs = {x % 12 for x in c["notes"]}
                    if m % 12 not in pcs:
                        msg = "line %s: %-8s %-12r beat %-6s %s(%s) over %s" % (lid, voice, w["w"], b, m, _nm(m), c["symbol"])
                        if voice == "chant":
                            nct_report.append("(chant, by design) " + msg)
                        elif w.get("nct"):
                            nct_report.append("(deliberate) " + msg)
                        else:
                            err("non-chord tone on a strong beat: " + msg)
                by_voice.setdefault(voice, []).append((b, b + d, lid, w["w"]))
            if voice == "spoken":
                for n in notes:
                    by_voice.setdefault(voice, []).append((n[1], n[1] + n[2], lid, w["w"]))

    # ---- overlaps within a voice
    for voice, ns in by_voice.items():
        ns.sort()
        for a, b in zip(ns, ns[1:]):
            if b[0] < a[1] - 1e-9:
                err("voice %s: %s %r (%s-%s) overlaps %s %r (%s-%s)" % (voice, a[2], a[3], a[0], a[1], b[2], b[3], b[0], b[1]))

    # ---- parts sanity
    P = S.get("parts", {})
    for key in ("riff", "bass", "drums", "hits", "bootChord"):
        if key not in P:
            err("parts.%s missing" % key)
    for name, beat in P.get("hits", {}).items():
        if not 0 <= beat <= dur:
            err("hit %s at beat %s is outside the song" % (name, beat))
    for ev in P.get("riff", {}).get("events", []) + P.get("bass", {}).get("events", []):
        if not 0 <= ev[1] < dur:
            err("riff/bass event %s outside the song" % ev)
    for pname, pat in P.get("drums", {}).get("patterns", {}).items():
        lens = {len(v) for v in pat.values()}
        if len(lens) > 1 or any(l % 16 for l in lens):
            err("drum pattern %s rows have inconsistent lengths %s" % (pname, lens))
    for sec, pname in P.get("drums", {}).get("sections", {}).items():
        if pname not in P["drums"]["patterns"]:
            err("drum section %s uses unknown pattern %s" % (sec, pname))
        if sec not in names:
            err("drum section %s is not a section" % sec)
    missing = [s for s in names if s not in P.get("drums", {}).get("sections", {})]
    if missing:
        err("sections without a drum pattern: %s" % missing)

    # ---- report
    print("%s: %d beats, %.1f s at %d bpm, %d sections, %d chords, %d lines" % (
        S["title"], dur, seconds, bpm, len(secs), len(chords), len(S["lines"])))
    for v, ns in sorted(by_voice.items()):
        pitched = [n for n in ns if v != "spoken"]
        if pitched:
            notes_ = [x for L in S["lines"] if L["voice"] == v for w in L["words"] for x in w["notes"] if x[0]]
            print("  %-6s %4d notes, range %s-%s" % (v, len(notes_), _nm(min(n[0] for n in notes_)), _nm(max(n[0] for n in notes_))))
    if nct_report:
        print("non-chord tones on strong beats (not errors):")
        for m in nct_report:
            print("  " + m)
    for w in warnings:
        print("warning: " + w)
    for e in errors:
        print("ERROR: " + e)
    print("%d error(s), %d warning(s)" % (len(errors), len(warnings)))
    return 1 if errors else 0


NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


def _nm(n):
    return "%s%d" % (NAMES[n % 12], n // 12 - 1)


if __name__ == "__main__":
    p = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "score.json")
    sys.exit(main(p))
