#!/usr/bin/env python3
"""song.py: defines "Pen Pal" (Claude-Pop for AI System 6) and writes music/score.json.

Run:  python3 -I music/song.py          (stdlib only; writes score.json next to this file)

The song is written in a compact notation that reads like a lyric sheet:

    line("c1a", "chorus1", "lead", "I'm just your pen pal,", -1.5,
         "I'm=D4=.5 just=G4=.5 your=A4=.5 pen=D5=1 pal,=B4=1.5")

Each token is WORD=PITCHES=BEATS.  "at" is the start beat relative to the section's first beat
(negative = a pickup before the downbeat).  Tokens are consumed left to right, so a start beat is
never typed twice.  "_=1" is a rest of one beat.  A word that spans several notes writes its
syllables with "|":  "nev|er=A4,B4=.5,.5"  (the "|" is removed from the on-screen word and the
syllable strings go out as "syl").  Pitch "x" is unpitched: raw TTS in a spoken line, and one beat
of deliberate SILENCE in a sung line (the final chorus cannot sing the word "pen").  A leading "!"
marks a deliberate non-chord tone on a strong beat ("!Flag=D4=.5"): the validator reports it
instead of failing.

Beats are absolute in score.json (1 beat = 0.5 s at 120 bpm).  MIDI 60 = C4.

Revision 2 (producer and prosody reviews) and revision 3 (the hook doctor: one chorus motif, the
gang, the Jersey post-chorus, the desk as the band): see SONG.md "Revision" and "Hook doctor".
"""
import json
import os
import re

BPM = 120
BEATS_PER_BAR = 4
TITLE = "Pen Pal"
KEY = "G major; the final chorus and outro lift a whole step to A major"

# ----------------------------------------------------------------------------------------------
# pitch helpers
# ----------------------------------------------------------------------------------------------
PC = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


def midi(name):
    """'F#4' -> 66, 'Bb3' -> 58, 'x' -> 0 (unpitched)."""
    if name == "x":
        return 0
    m = re.fullmatch(r"([A-G])([#b]?)(-?\d)", name)
    if not m:
        raise ValueError("bad pitch %r" % name)
    n = PC[m.group(1)] + {"": 0, "#": 1, "b": -1}[m.group(2)] + 12 * (int(m.group(3)) + 1)
    return n


def nm(n):
    return "%s%d" % (NAMES[n % 12], n // 12 - 1)


def T(notes, t):
    """transpose a note list (unpitched 0 stays 0)."""
    return [n + t if n else 0 for n in notes]


# ----------------------------------------------------------------------------------------------
# sections (name, beats, label).  They tile the song; starts are computed.
# ----------------------------------------------------------------------------------------------
SECTION_PLAN = [
    ("boot", 8, "Boot: the chord, the bare voice"),
    ("intro", 16, "Intro: the drop, the chant, the pen-pal chops"),
    ("verse1", 32, "Verse 1: the route"),
    ("pre1", 16, "Pre-chorus 1: the melt"),
    ("chorus1", 32, "Chorus 1"),
    ("post1", 16, "Post-chorus: la la (the riff), Jersey bounce"),
    ("verse2", 32, "Verse 2: MultiFinder and Review Desk"),
    ("pre2", 16, "Pre-chorus 2"),
    ("chorus2", 32, "Chorus 2"),
    ("post2", 8, "Post-chorus 2: la la, into the appearances"),
    ("bridge", 32, "Bridge: twelve appearances, one desk"),
    ("breakdown", 16, "Breakdown: two floppies"),
    ("chorus3", 32, "Final chorus in A: the reboot, the silent pen"),
    ("outro", 16, "Outro: it was always your voice"),
    ("tail", 4, "Tail: the Save dialog"),
]
SECTIONS, START = [], {}
_b = 0
for name, beats, label in SECTION_PLAN:
    SECTIONS.append({"name": name, "startBeat": _b, "beats": beats, "label": label})
    START[name] = _b
    _b += beats
DURATION_BEATS = _b  # 308 beats = 154.0 s


def sec_len(sec):
    return next(x["beats"] for x in SECTIONS if x["name"] == sec)


def sec_of(beat):
    return next(s for s in SECTIONS if s["startBeat"] <= beat < s["startBeat"] + s["beats"])


# ----------------------------------------------------------------------------------------------
# chords: symbol -> voicing (bass note first).  Pitch classes for the validator come from these.
# The 9th is the song's signature: the boot chord, the chorus's first chord, bar 7 and the reboot
# all carry one, and it never resolves.
# ----------------------------------------------------------------------------------------------
VOICING = {
    # G-major world
    "Gmaj9(boot)": [43, 50, 57, 59, 66, 74],   # G2 D3 A3 B3 F#4 D5: our boot chord, stacked wide
    "G": [43, 55, 59, 62], "F": [41, 53, 57, 60], "C": [48, 52, 55, 60],
    "Am7": [45, 55, 60, 64], "Am9": [45, 55, 60, 64, 71], "Bm7": [47, 57, 62, 66], "D": [50, 54, 57, 62],
    "Cmaj9": [48, 52, 55, 59, 62], "Em7": [40, 55, 59, 62], "G/B": [47, 55, 59, 62],
    "D7sus4": [50, 55, 57, 60], "Dsus4": [50, 55, 57, 62], "Em": [40, 55, 59, 64],
    "G(pedal)": [31, 43, 55],
    # A-major world (the reboot)
    "Dmaj9(reboot)": [38, 45, 52, 54, 61, 69],  # D2 A2 E3 F#3 C#4 A4: the boot chord voiced in A
    "E": [40, 56, 59, 64], "F#m7": [42, 57, 61, 64], "A/C#": [49, 57, 61, 64],
    "Dmaj9": [50, 54, 57, 61, 64], "Bm9": [47, 57, 62, 66, 73],
    "E7sus4": [40, 57, 59, 62], "A": [45, 57, 61, 64],
    "Amaj9(boot)": [45, 52, 59, 61, 68, 76],    # A2 E3 B3 C#4 G#4 E5: rings to the end
}

LOOP = [("G", 4), ("F", 2), ("C", 2)]                          # the big-beat loop, G Mixolydian
PRE = [("Am7", 4), ("Bm7", 4), ("C", 4), ("D", 4)]            # rising ii iii IV V
CHORUS_G = [("Cmaj9", 4), ("D", 4), ("Em7", 4), ("G/B", 4), ("Cmaj9", 4), ("D", 4), ("Am9", 4), ("D7sus4", 2), ("D", 2)]
CHORUS_A = [("Dmaj9(reboot)", 4), ("E", 4), ("F#m7", 4), ("A/C#", 4), ("Dmaj9", 4), ("E", 4), ("Bm9", 4), ("E7sus4", 2), ("E", 2)]

CHORD_PLAN = {
    "boot": [("Gmaj9(boot)", 8)],
    "intro": LOOP * 2,
    "verse1": LOOP * 4,
    "pre1": PRE,
    "chorus1": CHORUS_G,
    "post1": LOOP * 2,          # the la-la is the riff, so the post-chorus is the loop
    "verse2": LOOP * 4,
    "pre2": PRE,
    "chorus2": CHORUS_G,
    "post2": LOOP,
    "bridge": [("Em", 4), ("C", 4), ("G", 4), ("D", 4), ("Em", 4), ("Am7", 4), ("C", 4), ("Dsus4", 2), ("D", 2)],
    # bar 4 is the dominant of the NEW key: a truck-driver change.  E7sus4 -> Dmaj9 in A.
    "breakdown": [("G(pedal)", 4), ("C", 4), ("Am7", 4), ("E7sus4", 4)],
    "chorus3": CHORUS_A,
    # bar 3: Dmaj9 then E7sus4, so the long A4 of "voice" is a suspension that resolves under the voice
    "outro": [("A", 4), ("G", 2), ("D", 2), ("Dmaj9", 2), ("E7sus4", 2), ("Amaj9(boot)", 4)],
    "tail": [("Amaj9(boot)", 4)],
}
CHORDS = []
for sec in SECTIONS:
    b = sec["startBeat"]
    for sym, beats in CHORD_PLAN[sec["name"]]:
        CHORDS.append({"startBeat": b, "beats": beats, "symbol": sym, "notes": VOICING[sym]})
        b += beats
    assert b == sec["startBeat"] + sec["beats"], sec["name"]

# ----------------------------------------------------------------------------------------------
# lines
# ----------------------------------------------------------------------------------------------
LINES = []


def line(lid, section, voice, text, at, spec, transpose=0, role=None):
    """Parse one lyric line.  Returns its end beat."""
    beat = START[section] + at
    words = []
    for tok in spec.split():
        if tok.startswith("_="):
            beat += float(tok[2:])
            continue
        nct = tok.startswith("!")
        w, pitches, durs = tok.lstrip("!").split("=")
        pitches, durs = pitches.split(","), [float(d) for d in durs.split(",")]
        assert len(pitches) == len(durs), tok
        sylls = w.split("|")
        assert len(sylls) == len(pitches), "syllables vs notes in %r" % tok
        notes = []
        for p, d in zip(pitches, durs):
            n = midi(p)
            notes.append([n + transpose if n else 0, beat, d])
            beat += d
        word = {"w": w.replace("|", ""), "notes": notes}
        if len(notes) > 1:
            word["syl"] = sylls
        if voice != "spoken" and any(n[0] == 0 for n in notes):
            word["silent"] = True
        if nct:
            word["nct"] = True
        words.append(word)
    assert [w["w"] for w in words] == text.split(), (lid, [w["w"] for w in words], text.split())
    entry = {"id": lid, "section": section, "voice": voice, "text": text, "words": words}
    if role:
        entry["role"] = role
    LINES.append(entry)
    return beat


# THE MOTIF.  The whole chorus is one two-bar cell and one variation of it:
#   M  "I'm just your PEN PAL"       pickup D4 G4 A4, the leap to D5 on PEN (bar 1 beat 1: the strongest beat
#                                    and the highest note of the song in G), the maj7 B4 on PAL, never resolved
#   A  "I'll never HOLD the PEN"     G4 A4 B4 A4 F#4 D4: a hill that bows an octave down; HOLD on the backbeat clap
#   B  "You say where I LAND"        G4 A4 B4 A4 then the SAME leap up to D5 (A's only variation: up instead of down)
#      "or I fade"                   B4 A4 B4, and the word fades into half a beat of nothing
#   C  "Who holds the pen? / YOU DO! YOU DO!"   the gang: C5 A4 then D5 B4 (the answer ends on the PEN PAL notes)
# Chorus = M A B | M A C.  Range D4-D5.  One leap (A4 -> D5), heard three times; everything else is a step.
HOOK = "I'm=D4=.5 just=G4=.5 your=A4=.5 pen=D5=1 pal,=B4=1.5"
ECHO = "(pen=G4=.5 pal)=E4=.5"                                # the gang's answer-back, 12 copies wide
NEVER = "I'll=G4=.5 nev|er=A4,B4=.5,.5 hold=A4=1.5 the=F#4=.5 pen.=D4=1"
CALL = "Who=A4=1 holds=A4=.5 the=G4=.5 pen?=E4=1.5"          # the falling playground taunt, over Am9
ANSWER = "You=C5=1 do!=A4=1 You=D5=1 do!=B4=1"               # the taunt twice, the second a step up: D5 B4 = PEN PAL

# BOOT: the bare voice over the ringing boot chord. "pen" lands on beat 6 = 3.0 s.
line("boot", "boot", "lead", "I'm just your pen pal.", 4.5,
     "I'm=D4=.5 just=G4=.5 your=A4=.5 pen=D5=1 pal.=B4=1")

# INTRO: the chant.  Monotone G3, each line's last word drops to D3 (the end-of-list fall).
# Stressed syllables sit on the beat with a pickup before them: in-SERT, ex-PORT.
CHANT = ("Save=G3=.5 it.=G3=.5 _=1 Clip=G3=.5 it.=G3=.5 _=.5 "
         "In|sert=G3,G3=.5,1 it.=G3=.5 Ex|port=G3,G3=.5,1 it.=D3=.5")
line("i1", "intro", "chant", "Save it. Clip it. Insert it. Export it.", 0, CHANT)
line("i2", "intro", "chant", "Everything I say is temporary.", 8,
     "Ev|ery|thing=G3,G3,G3=.5,.5,.5 I=G3=.5 say=G3=1 is=G3=.5 _=.5 tem|po|ra|ry.=G3,G3,G3,D3=.5,.5,.5,.5")

# VERSE 1: the route, as a to-do list.  Bars 1-4 on G3 (the riff is tacet), bars 5-8 the reciting
# tone climbs to B3 with the line-end fall to G3, and a gang echoes "Keep it."
line("v1a", "verse1", "chant", "Spin the hard disk. Feed the floppy.", 0,
     "Spin=G3=.5 the=G3=.5 hard=G3=.5 disk.=G3=1 _=1.5 Feed=G3=.5 the=G3=.5 flop|py.=G3,D3=.5,1")
line("v1b", "verse1", "chant", "Ask the question. Search it. Read it.", 8,
     "Ask=G3=.5 the=G3=.5 ques|tion.=G3,G3=.5,.5 _=2 Search=G3=.5 it.=G3=.5 _=1 Read=G3=.5 it.=D3=.5")
line("v1c", "verse1", "chant", "Clip the proof. Scrapbook. Keep it.", 16,
     "Clip=B3=.5 the=B3=.5 proof.=B3=1 _=2 Scrap|book.=B3,B3=.5,.5 _=1 Keep=B3=.5 it.=G3=.5")
line("v1c_echo", "verse1", "choir", "(Keep it.)", 23, "(Keep=D4=.5 it.)=D4=.5", role="call")
line("v1d", "verse1", "chant", "Outline it. Draft it. Your words. Not mine.", 24,
     "Out|line=B3,B3=.5,.5 it.=B3=.5 _=.5 Draft=B3=.5 it.=B3=.5 _=1 Your=B3=.5 words.=B3=1 _=.5 Not=B3=.5 mine.=G3=1")

# PRE-CHORUS: the melt.  Line 1 flat chant, line 2 learns to glide, lines 3-4 are the full lead.
# Line 4 hangs on A4 (the 5th of D): a question.  D5 is saved for the chorus.
def prechorus(sec, l1, l2):
    line(sec + "a", sec, "chant", l1[0], 0, l1[1])
    line(sec + "b", sec, "chant", l2[0], 4, l2[1])
    line(sec + "c", sec, "lead", "But the pen and the page", 8,
         "But=E4=.5 the=F#4=.5 pen=G4=1 and=G4=.5 the=A4=.5 page=B4=1")
    line(sec + "d", sec, "lead", "stay in your hand.", 12,
         "stay=F#4=.5 in=G4=.5 your=A4=.5 hand.=A4=.5")      # HAND is a hit at 13.5, then half a beat of air


# The verbs are half a beat and a rest (QA round 2): held for a whole beat the flat G3 vowel swallowed the
# coda and Whisper heard "I can't buy, I can't buy"; short, they are heard as verbs ("I can check, I can flag").
prechorus("pre1",
          ("I can fetch. I can file.", "I=G3=.5 can=G3=.5 fetch.=G3=.5 _=.5 I=G3=.5 can=G3=.5 file.=G3=.5 _=.5"),
          ("I can hum for a while.", "I=G3=.5 can=A3=.5 hum=B3=1 for=B3=.5 a=C4=.5 while.=D4=1"))

# CHORUS.  t = transposition (0 in G, +2 in A).  "harmony" adds the choir a third below on the second
# M + A (bars 5-6).  The lead asks the question in bar 7; the gang (and the lead with it) shouts the
# answer in bar 8, on the beats.
def chorus(sec, t=0, harmony=False, silent_pen=False, gang=False):
    line(sec + "a", sec, "lead", "I'm just your pen pal,", -1.5, HOOK, t)                      # M
    line(sec + "a_echo", sec, "choir", "(pen pal)", 2.5, ECHO, t, role="echo")
    never = NEVER.replace("pen.=D4=1", "pen.=x=1") if silent_pen else NEVER
    line(sec + "b", sec, "lead", "I'll never hold the pen.", 3.5, never, t)                    # A
    line(sec + "c", sec, "lead", "You say where I land,", 8,                                   # B: A's shape, the hook's leap
         "You=G4=.5 say=A4=.5 where=B4=.5 I=A4=.5 land,=D5=2", t)
    line(sec + "d", sec, "lead", "or I fade.", 12, "or=B4=.5 I=A4=.5 fade.=B4=1", t)          # then half a beat of nothing
    line(sec + "e", sec, "lead", "I'm just your pen pal,", 14.5, HOOK, t)                      # M
    line(sec + "e_echo", sec, "choir", "(pen pal)", 18.5, ECHO, t, role="echo")
    line(sec + "f", sec, "lead", "I'll never hold the pen.", 19.5, NEVER, t)                   # A
    line(sec + "g", sec, "lead", "Who holds the pen?", 24, CALL, t)                            # C: the question
    line(sec + "h", sec, "lead", "You do! You do!", 28, ANSWER, t)                             # C: the lead points
    line(sec + "h_gang", sec, "choir", "You do! You do!", 28, ANSWER, t, role="gang")          # ... and the gang shouts it
    if harmony:  # the AI's choir is made only of itself: a third below the lead on the second M + A
        line(sec + "e_h", sec, "choir", "I'm just your pen pal,", 14.5,
             "I'm=B3=.5 just=E4=.5 your=F#4=.5 pen=B4=1 pal,=G4=1.5", t, role="harmony")
        line(sec + "f_h", sec, "choir", "I'll never hold the pen.", 19.5,
             "I'll=E4=.5 nev|er=F#4,G4=.5,.5 hold=F#4=1.5 the=D4=.5 pen.=B3=1", t, role="harmony")


chorus("chorus1")

# POST-CHORUS 1: the choir sings the riff on "la", twice, over the Jersey-club bounce; the second
# time the pen-pal chops join it.  The AI's choir can only repeat what the organ just played.
LALA_G = ("La=G4=.5 la=G4=.5 la,=B4=.5 la=D5=1 la=C5=.5 la=B4=.5 la.=G4=.5",      # = riff bar 1
          "La=A4=.5 la=C5=.5 la,=A4=.5 la=F4=.5 la=G4=.5 la=A4=.5 la.=C5=1")      # = riff bar 2
for i, at in enumerate((0, 8)):
    line("q%d" % (3 + 2 * i), "post1", "choir", "La la la, la la la la.", at, LALA_G[0], role="lala")
    line("q%d" % (4 + 2 * i), "post1", "choir", "La la la, la la la la.", at + 4, LALA_G[1], role="lala")

# VERSE 2: MultiFinder and the Review Desk.  The chant asks, a gang shouts "Flag it.", and the one
# thing worth keeping is sung by the lead.  Questions stay flat: the robot does not know how to ask.
line("v2a", "verse2", "chant", "Chat is an app. Not the whole computer.", 0,
     "Chat=G3=.5 is=G3=.5 an=G3=.5 app.=G3=1.5 _=1 Not=G3=.5 the=G3=.5 whole=G3=.5 com|pu|ter.=G3,G3,D3=.5,.5,1")
line("v2b", "verse2", "chant", "Review Desk. Check for drift.", 7.5,
     "Re|view=G3,G3=.5,1 Desk.=G3=1 _=2 Check=G3=.5 for=G3=.5 drift.=D3=1")
line("v2c", "verse2", "chant", "Too regular?", 15.5, "Too=G3=.5 reg|u|lar?=G3,G3,G3=.5,.5,.5")
line("v2c_flag", "verse2", "choir", "Flag it.", 18, "Flag=D4=.5 it.=D4=.5", role="call")
line("v2d", "verse2", "chant", "Generic?", 19.5, "Ge|ner|ic?=G3,G3,G3=.5,.5,.5")          # NER on the downbeat, after the stumble
line("v2d_flag", "verse2", "choir", "Flag it.", 22, "!Flag=D4=.5 it.=D4=.5", role="call")  # D over C: the gang does not care
line("v2e", "verse2", "chant", "Press release?", 24, "Press=G3=.5 re|lease?=G3,G3=.5,.5")
line("v2e_flag", "verse2", "choir", "Flag it.", 26, "Flag=D4=.5 it.=D4=.5", role="call")
line("v2f", "verse2", "chant", "Rough edge?", 28, "Rough=G3=.5 edge?=G3=.5")
line("v2f_keep", "verse2", "lead", "Keep it.", 30, "Keep=C5=.5 it.=G4=.5")            # the first sung note in 16 bars

# Pre-chorus 2: the machine confesses what it could do, in the glide line, and the low-pass sweep
# closes over "smooth" (the smooth gag moved here from the old chorus).
prechorus("pre2",
          ("I can check. I can flag.", "I=G3=.5 can=G3=.5 check.=G3=.5 _=.5 I=G3=.5 can=G3=.5 flag.=G3=.5 _=.5"),
          ("I could smooth it. I won't.", "I=G3=.5 could=A3=.5 smooth=B3=1 it.=B3=.5 I=C4=.5 won't.=D4=1"))

chorus("chorus2", harmony=True)

# POST-CHORUS 2: la la once more (the chops under it), straight into the appearances.
line("q7", "post2", "choir", "La la la, la la la la.", 0, LALA_G[0], role="lala")
line("q8", "post2", "choir", "La la la, la la la la.", 4, LALA_G[1], role="lala")

# BRIDGE: the twelve appearances counted as a climbing ladder (two per bar, chord tones, each pair rising).
line("b1", "bridge", "chant", "Eighty-eight. Ninety-one.", 0,
     "Eigh|ty-|eight.=E3,E3,E3=.5,.5,1 Nine|ty-|one.=G3,G3,G3=.5,.5,1")
line("b2", "bridge", "chant", "Ninety-five. Ninety-eight.", 4,
     "Nine|ty-|five.=G3,G3,G3=.5,.5,1 Nine|ty-|eight.=C4,C4,C4=.5,.5,1")
line("b3", "bridge", "chant", "Ninety-nine. Oh-two.", 8,
     "Nine|ty-|nine.=B3,B3,B3=.5,.5,1 Oh-|two.=D4,D4=1,1")
line("b4", "bridge", "chant", "Oh-five. Oh-nine.", 12,
     "Oh-|five.=D4,D4=1,1 Oh-|nine.=F#4,F#4=1,1")
line("b5", "bridge", "chant", "Eleven. Fourteen.", 16,
     "E|lev|en.=E4,E4,E4=.5,.5,1 Four|teen.=G4,G4=1,1")
line("b6", "bridge", "chant", "Twenty. Twenty-six.", 20,
     "Twen|ty.=G4,G4=1,1 Twen|ty-|six.=A4,A4,A4=.5,.5,1")
line("b7", "bridge", "lead", "Twelve eras. One desk.", 24,
     "Twelve=G4=1 e|ras.=A4,G4=.5,.5 One=C5=1 desk.=B4=1")
line("b8", "bridge", "lead", "And your windows stay.", 28,
     "And=A4=.5 your=B4=.5 win|dows=C5,B4=.5,.5 stay.=D5=2")

# BREAKDOWN: a 1988 sample speaks, then the lead, close and soft, over felt piano and snaps.
line("k1", "breakdown", "spoken", "Two floppies. It fits.", 0.5,
     "Two=x=.5 flop|pies.=x,x=.5,.5 _=.5 It=x=.5 fits.=x=1")
line("k2", "breakdown", "lead", "Bring your own model,", 4,
     "Bring=E4=.5 your=G4=.5 own=A4=1 mo|del,=G4,E4=1,.5")                        # MOD takes the length
line("k3", "breakdown", "lead", "it still won't hold the pen.", 8,
     "it=E4=.5 still=G4=.5 won't=A4=1 hold=G4=.5 the=E4=.5 pen.=C4=1")

# FINAL CHORUS in A: the reboot.  The voice cannot sing "pen" the first time; the writer types it.
chorus("chorus3", t=2, harmony=True, silent_pen=True, gang=True)

# OUTRO, in A.  The chant and the choir's la-la (the riff in A) stack over bars 1-2; then the last
# line is the hook itself, resolved at last: pickup, the leap to E5, and down the steps to the tonic.
line("o1", "outro", "chant", "Save it. Clip it. Insert it. Export it.", 0, CHANT, transpose=2)
line("o_la1", "outro", "choir", "La la la, la la la la.", 0, LALA_G[0], transpose=2, role="lala")
line("o_la2", "outro", "choir", "La la la, la la la la.", 4, LALA_G[1], transpose=2, role="lala")
line("o2", "outro", "lead", "It was always your voice.", 8,
     "It=E4=.5 was=A4=.5 al|ways=E5,D5=1,.5 your=B4=.5 voice.=A4=3")
line("o3", "outro", "spoken", "This song is temporary.", 14,
     "This=x=.5 song=x=.5 is=x=.5 tem|po|ra|ry.=x,x,x,x=.5,.5,.5,.5")

LINES.sort(key=lambda l: l["words"][0]["notes"][0][1])

# ----------------------------------------------------------------------------------------------
# global windows: silence and cuts.  Every instrument part below is filtered through cut().
# ----------------------------------------------------------------------------------------------
SILENT = [  # [startBeat, beats, why]: TOTAL digital silence.  Pads, piano and choir cut too, not only drums and bass.
    [START["chorus3"] + 6.5, 1.5, "the silent pen: the band drops after 'hold', the voice sings 'the' alone, "
                                   "then one beat of nothing but a keystroke at +7.25; the crash slams back on 'You'"],
]


def cut(events, cuts):
    """Drop events that start inside a cut window and shorten events that run into one.
    Works on [note, beat, dur] lists and on {startBeat, beats, ...} dicts."""
    out = []
    for ev in events:
        is_dict = isinstance(ev, dict)
        b, d = (ev["startBeat"], ev["beats"]) if is_dict else (ev[1], ev[2])
        if any(c[0] <= b < c[0] + c[1] for c in cuts):
            continue
        for c in cuts:
            if b < c[0] < b + d:
                d = c[0] - b
        if is_dict:
            ev = dict(ev, beats=d)
        else:
            ev = list(ev[:1]) + [b, d] + list(ev[3:])
        out.append(ev)
    return out


# ----------------------------------------------------------------------------------------------
# parts: everything the producer needs
# ----------------------------------------------------------------------------------------------
# --- the Floppy Organ riff: a two-bar phrase in G Mixolydian, whistleable as
#     "da da da DAAA da da da / da da da da da da DAAA".  Bar 2 walks up F G A to its long C.
RIFF_LOOP = [(67, 0, .5), (67, .5, .5), (71, 1, .5), (74, 1.5, 1), (72, 2.5, .5), (71, 3, .5), (67, 3.5, .5),
             (69, 4, .5), (72, 4.5, .5), (69, 5, .5), (65, 5.5, .5), (67, 6, .5), (69, 6.5, .5), (72, 7, 1)]
RIFF_TURN = RIFF_LOOP[:-1] + [(74, 7, 1)]      # the turnaround: the last loop of a verse ends on D5, pointing up
RIFF_PLAYS = [  # (startBeat, repeats, transpose, turnaround on the last repeat, note)
    (START["intro"], 2, 0, False, "full loop, 8-bit 11 kHz crush (1988); the pen-pal chops ride on top"),
    (START["verse1"] + 16, 2, 0, True, "bars 1-4 tacet (drives, drums and chant only); the riff returns at 'Clip the proof' and turns around into the melt"),
    (START["post1"] + 8, 1, -12, False, "bars 1-2 tacet (the choir IS the riff); bars 3-4 an octave down under the second la-la and the chops"),
    (START["verse2"], 4, 0, True, "full loop, second organ an octave down; turnaround into pre-chorus 2"),
    (START["post2"], 1, -12, False, "an octave down under the la-la and the chops"),
    (START["outro"], 1, 2, False, "in A Mixolydian, clean, with the last chant and the choir's la-la on top"),
]
riff_events = []
for s, reps, t, turn, _ in RIFF_PLAYS:
    for r in range(reps):
        src = RIFF_TURN if (turn and r == reps - 1) else RIFF_LOOP
        for n, b, d in src:
            riff_events.append([n + t, s + r * 8 + b, d])
RIFF_CUTS = [[START["verse2"] + 19, 1, "the stumble: the whole groove drops for a beat"]] + SILENT
riff_events = cut(riff_events, RIFF_CUTS)
# the flourish: three 16ths an octave and more above the gang's "YOU DO!", into the next section
FLOURISH = [(79, 0, .25), (83, .25, .25), (86, .5, .25)]   # G5 B5 D6
riff_flourish = []
for sec, t in (("chorus1", 0), ("chorus2", 0), ("chorus3", 2)):
    for n, b, d in FLOURISH:
        riff_flourish.append([n + t, START[sec] + 31.25 + b, d])

# --- the pen-pal chops: the boot teaser's "pen" (D5) and "pal" (B4), chopped at the word boundary and
#     repitched, played as an instrument.  One two-bar pattern on the loop; "pen" doubles the riff's long D5.
CHOP_PATTERN = [  # (beat in the 2-bar loop, beats, midi, word)
    (1.5, .5, 74, "pen"), (2.5, .5, 71, "pal"),
    (5.5, .5, 74, "pen"), (6.5, .25, 74, "pen"), (6.75, .25, 74, "pen"), (7, .5, 74, "pen"), (7.5, .5, 71, "pal"),
]
CHOP_PLAYS = [  # (startBeat, loops, transpose, note)
    (START["intro"], 2, 0, "the instrumental hook under the chant, before the first verse"),
    (START["post1"] + 8, 1, 0, "under the second la-la: riff, la-la and chops together"),
    (START["post2"], 1, 0, "under the la-la, into the bridge"),
]
chop_events = []
for s, loops, t, _ in CHOP_PLAYS:
    for r in range(loops):
        for b, d, n, w in CHOP_PATTERN:
            chop_events.append([n + t, s + r * 8 + b, d, w])
chop_events = cut(chop_events, SILENT)

# --- bass: two floppy-drive stepper motors.  Drive A (left) sings the roots, drive B (right) the
#     octave and the fifth.  Their heads move on screen per note.
def bass_root(sym):
    pc = VOICING[sym][0] % 12
    return pc + 36 if pc + 36 <= 47 else pc + 24   # C2..B2


BASS_STYLE = {
    "boot": "none", "intro": "pulse8", "verse1": "pulse8", "pre1": "long", "chorus1": "strut",
    "post1": "pulse8", "verse2": "pulse8", "pre2": "long", "chorus2": "strut", "post2": "pulse8",
    "bridge": "pulse8", "breakdown": "long", "chorus3": "strut", "outro": "pulse8", "tail": "none",
}
BASS_CUTS = [  # [startBeat, beats, why]: both drives stop here
    [START["pre1"] + 14, 2, "stop-time after the HAND hit: air, then the a cappella pickup"],
    [START["pre2"] + 14, 2, "stop-time after the HAND hit"],
    [START["verse2"] + 19, 1, "the stumble"],
    [START["breakdown"], 4, "bar 1 of the breakdown: only the G pedal and the spoken sample"],
    [START["outro"] + 8, 8, "voice and piano, then the boot chord"],
] + SILENT
drive_a, drive_b = [], []
for i, ch in enumerate(CHORDS):
    sec = sec_of(ch["startBeat"])
    style = BASS_STYLE[sec["name"]]
    root = bass_root(ch["symbol"])
    b0, L = ch["startBeat"], ch["beats"]
    if style == "none":
        continue
    if style == "long":
        drive_a.append([root, b0, L])
        drive_b.append([root + 7, b0, L])                      # the fifth, held with it
    elif style == "strut":
        # Feel It Still: one figure per chord, a chromatic approach note into the next root.
        nxt = bass_root(CHORDS[i + 1]["symbol"]) if i + 1 < len(CHORDS) else root
        appr = nxt - 1 if nxt - 1 >= 36 else nxt + 11
        head = (b0 - sec["startBeat"]) in (0, 16)   # bars 1 and 5: rest under PEN so the bell ping speaks
        if L >= 4:
            drive_a += [[root, b0 + .5, .5]] if head else [[root, b0, .75], [root, b0 + .75, .25]]
            drive_a += [[root, b0 + 2.5, .5], [appr, b0 + 3.5, .5]]
            drive_b += [[root + 12, b0 + 1.5, .5], [root + 7, b0 + 3, .5]]
        else:
            drive_a += [[root, b0, .75], [root, b0 + .75, .25], [appr, b0 + 1.5, .5]]
            drive_b += [[root + 12, b0 + 1, .5]]
    else:  # pulse8: the drives alternate, A on the beat, B an octave up on the "and": the octave bass
        b = b0
        while b < b0 + L:
            drive_a.append([root, b, .5])
            drive_b.append([root + 12, b + .5, .5])
            b += 1
drive_a, drive_b = cut(drive_a, BASS_CUTS), cut(drive_b, BASS_CUTS)
bass_events = sorted(drive_a + drive_b, key=lambda e: e[1])

# --- the 808 sub: one long note an octave under drive A, choruses only (plus the bridge's sub drop)
sub_events = []
for ch in CHORDS:
    if sec_of(ch["startBeat"])["name"].startswith("chorus"):
        sub_events.append([bass_root(ch["symbol"]) - 12, ch["startBeat"], ch["beats"]])
sub_events.append([bass_root("Em") - 12, START["bridge"] + 16, 2])
sub_events = cut(sub_events, SILENT)

# --- drums on a 16th grid.  One string per instrument per pattern; "x" hits, "." rests.  A pattern
#     may be 1, 2, 4 or 8 bars long and repeats through its section.  "mutes" cut everything.
def bars(*rows):
    return "".join(rows)


K4 = "x...x...x...x..."
S24 = "....x.......x..."
H8 = "x.x.x.x.x.x.x.x."
H16 = "x" * 16
OPEN_AND = "..x...x...x...x."        # the open hat on every "and": house
CLOSED_HOUSE = "xx.xxx.xxx.xxx.x"    # closed 16ths around the open ones
JERSEY = "x..x..x...x.x..."          # the Jersey-club bounce: tresillo, then the "and" of 3 and 4
JERSEY_B = "x..x..x...x.x.x."        # ... with the bed-squeak triple
E = "." * 16
DRUM_PATTERNS = {
    "none": {},
    "bigbeat": {  # Take California: kicks on 1 and the "a" of 2, snare on 2 and 4, pickup kick on the "and" of 3
        "kick": bars("x......x..x.....", "x......x..x....."),
        "snare": bars(S24, S24),
        "ghostSnare": bars("......x.......x.", "......x.......x."),
        "hat": bars(H16, H16),
        "cowbell": bars(E, "..............x."),
    },
    "verse": {  # the same break with the hats thinned so the chant stays clear
        "kick": bars("x......x..x.....", "x......x..x....."),
        "snare": bars(S24, S24),
        "ghostSnare": bars("......x.......x.", "......x.......x."),
        "hat": bars(H8, H8),
        "cowbell": bars(E, "..............x."),
    },
    "verse2": {  # as verse, plus a clap on every gang "Flag" (verse2 + 18, 22, 26 = bar 5 beat 3, bar 6 beat 3, bar 7 beat 3)
        "kick": bars(*(["x......x..x....."] * 8)),
        "snare": bars(*([S24] * 8)),
        "ghostSnare": bars(*(["......x.......x."] * 8)),
        "hat": bars(*([H8] * 8)),
        "cowbell": bars(E, "..............x.", E, "..............x.", E, "..............x.", E, "..............x."),
        "clap": bars(E, E, E, E, "........x.......", "........x.......", "........x.......", E),
    },
    "prechorus": {  # four on the floor; snare 8ths in bar 3, 16ths in bar 4; a unison hit on HAND (bar 4 "and" of 2), then air
        "kick": bars(K4, K4, K4, "x...x.x........."),
        "snare": bars(S24, S24, H8, "xxxxxx.........."),
        "hat": bars(H8, H8, H8, "x.x.x..........."),
    },
    "prechorus2": {
        "kick": bars(K4, K4, K4, "x...x.x........."),
        "snare": bars(S24, S24, H8, "xxxxxx.........."),
        "hat": bars(H8, H8, H8, "x.x.x..........."),
        "tambourine": bars(H8, H8, H16, "xxxxxx.........."),
    },
    "chorus": {  # house / disco: four on the floor, claps on 2 and 4, the open hat on every "and"
        "kick": bars(K4, K4),
        "snare": bars(S24, S24),
        "clap": bars(S24, S24),
        "hat": bars(CLOSED_HOUSE, CLOSED_HOUSE),
        "openHat": bars(OPEN_AND, OPEN_AND),
    },
    "chorus2": {
        "kick": bars(K4, K4),
        "snare": bars(S24, S24),
        "clap": bars(S24, S24),
        "hat": bars(CLOSED_HOUSE, CLOSED_HOUSE),
        "openHat": bars(OPEN_AND, OPEN_AND),
        "tambourine": bars(H16, H16),
    },
    "jersey": {  # the post-chorus bounce: the Jersey-club kick, claps on 2 and 4, 8th hats, the chops on top
        "kick": bars(JERSEY, JERSEY_B),
        "clap": bars(S24, S24),
        "hat": bars(H8, H8),
        "openHat": bars("..............x.", "..............x."),
    },
    "bridge": {  # the big-beat break without hats: the twelve climbing beeps are the hi-hat
        "kick": bars("x......x..x.....", "x......x..x....."),
        "snare": bars(S24, S24),
        "ghostSnare": bars("......x.......x.", "......x.......x."),
        "cowbell": bars(E, "..............x."),
    },
    "halftime": {  # bridge bars 7-8, building into the breakdown
        "kick": bars("x...............", "x.......x......."),
        "snare": bars("........x.......", "........x...xxxx"),
        "hat": bars(H8, H16),
    },
    "breakdown": {  # Down: finger snaps and a clap, lots of space; bar 1 silent; bar 4 silent (riser and sub only)
        "snap": bars(E, S24, S24, E),
        "clap": bars(E, "............x...", "............x...", E),
    },
    "final": {  # the house chorus, bigger: tambourine 16ths on top
        "kick": bars(K4, K4),
        "snare": bars(S24, S24),
        "clap": bars(S24, S24),
        "hat": bars(CLOSED_HOUSE, CLOSED_HOUSE),
        "openHat": bars(OPEN_AND, OPEN_AND),
        "tambourine": bars(H16, H16),
    },
    "outro": {  # bars 1-2 the loop, bar 3 piano and claps, bar 4 the boot chord alone
        "kick": bars("x......x..x.....", "x......x..x.....", "x...............", E),
        "snare": bars(S24, S24, E, E),
        "hat": bars(H8, H8, E, E),
        "clap": bars(E, E, S24, E),
        "cowbell": bars(E, "..............x.", E, E),
    },
}
DRUM_SECTIONS = {
    "boot": "none", "intro": "bigbeat", "verse1": "verse", "pre1": "prechorus", "chorus1": "chorus",
    "post1": "jersey", "verse2": "verse2", "pre2": "prechorus2", "chorus2": "chorus2", "post2": "jersey",
    "bridge": "bridge", "breakdown": "breakdown", "chorus3": "final", "outro": "outro", "tail": "none",
}
DRUM_OVERRIDES = [{"startBeat": START["bridge"] + 24, "beats": 8, "pattern": "halftime"}]
DRUM_MUTES = [
    [START["pre1"] + 14, 2, "stop-time after the HAND hit: only the reverse cymbal"],
    [START["pre2"] + 14, 2, "stop-time after the HAND hit"],
    [START["verse2"] + 19, 1, "the stumble: the groove drops out; only fills.stumble plays"],
] + SILENT
DRUM_DUCKS = [  # [startBeat, beats]: the whole band drops 6 dB and dithers so the word FADE really fades
    [START["chorus1"] + 13, 1.5], [START["chorus2"] + 13, 1.5], [START["chorus3"] + 13, 1.5],
]
FILLS = [
    {"name": "reverseCymbal", "startBeat": 6, "beats": 2, "what": "reverse cymbal into the drop"},
    {"name": "snareRoll", "startBeat": 7, "beats": 1, "what": "snare roll into the drop"},
    {"name": "riser1", "startBeat": START["pre1"], "beats": 13.5, "what": "white-noise riser under the string pad"},
    {"name": "stopHit1", "startBeat": START["pre1"] + 13.5, "beats": .5,
     "what": "unison band hit on HAND: kick, choked crash, brass [54,57,62] (stabs.brass), drive A on D2 for an 8th; then air"},
    {"name": "reverseCymbal2", "startBeat": START["pre1"] + 14, "beats": 2, "what": "into chorus 1, alone under the pickup"},
    {"name": "crash1", "startBeat": START["chorus1"], "beats": 1, "what": "crash + brass stab"},
    {"name": "postRiser1", "startBeat": START["chorus1"] + 28, "beats": 4, "what": "riser under 'YOU DO! YOU DO!' into the post-chorus drop"},
    {"name": "postDrop1", "startBeat": START["post1"], "beats": 1, "what": "crash: the Jersey bounce and the la-la drop in"},
    {"name": "stumble", "startBeat": START["verse2"] + 19.25, "beats": .75,
     "what": "on 'Too regular?' / 'Flag it.' the groove drops for a beat (drums.mutes, bass.cuts, riff cut at +19) and the "
             "fill lands a 16th late: snare + floor tom 16ths at +19.25, +19.5, +19.75, the first with a flam; the full "
             "groove returns on +20 ('-ner-' of Generic)"},
    {"name": "keepIt", "startBeat": START["verse2"] + 30, "beats": .5, "what": "big clap + rimshot on the sung 'Keep it.'"},
    {"name": "riser2", "startBeat": START["pre2"], "beats": 13.5, "what": "longer riser, tambourine added"},
    {"name": "stopHit2", "startBeat": START["pre2"] + 13.5, "beats": .5, "what": "unison band hit on HAND, then air"},
    {"name": "reverseCymbal3", "startBeat": START["pre2"] + 14, "beats": 2, "what": "into chorus 2"},
    {"name": "crash2", "startBeat": START["chorus2"], "beats": 1, "what": "crash"},
    {"name": "postRiser2", "startBeat": START["chorus2"] + 28, "beats": 4, "what": "riser under 'YOU DO! YOU DO!' into post-chorus 2"},
    {"name": "postDrop2", "startBeat": START["post2"], "beats": 1, "what": "crash: the Jersey bounce under the la-la"},
    {"name": "bridgeRiser", "startBeat": START["post2"] + 4, "beats": 4, "what": "short riser into the bridge downbeat"},
    {"name": "subDrop", "startBeat": START["bridge"] + 16, "beats": 2, "what": "one 808 sub drop on the downbeat of bar 5 (Em, the second half of the ladder)"},
    {"name": "bridgeRoll", "startBeat": START["bridge"] + 28, "beats": 4, "what": "snare roll + filter sweep into the breakdown"},
    {"name": "spinUp", "startBeat": START["breakdown"] + 12, "beats": 4,
     "what": "floppy-drive spin-up riser (sine sweep + comb grit) over the held E2 sub on E7sus4; no drums; the pickup is a cappella"},
    {"name": "reverseCymbal4", "startBeat": START["breakdown"] + 14, "beats": 2, "what": "into the reboot"},
    {"name": "reboot", "startBeat": START["chorus3"], "beats": 1, "what": "white flash: crash + the boot chord in A"},
    {"name": "keystroke", "startBeat": START["chorus3"] + 7.25, "beats": .25, "what": "one dry keyboard click inside the silence: the writer types 'pen'"},
    {"name": "slamBack", "startBeat": START["chorus3"] + 8, "beats": 1, "what": "crash + brass stab: the band returns on 'You say'"},
    {"name": "crash3", "startBeat": START["chorus3"] + 16, "beats": 1, "what": "crash on the second pen pal"},
    {"name": "postRiser3", "startBeat": START["chorus3"] + 28, "beats": 4, "what": "riser under the last 'YOU DO! YOU DO!' into the outro"},
    {"name": "outroDrop", "startBeat": START["outro"], "beats": 1, "what": "crash: chant, riff, la-la and bell together"},
    {"name": "returnKey", "startBeat": START["outro"] + 12, "beats": .25, "what": "the writer presses Return: the Amaj9 boot chord is 'played' by that keystroke"},
    {"name": "saveClick", "startBeat": START["tail"] + 2.5, "beats": .5, "what": "one dry mouse click: Save"},
]

# --- keys, pads, stabs
brass_stabs, sax_stabs, glock_pen = [], [], []
for sec, t in (("chorus1", 0), ("chorus2", 0), ("chorus3", 2)):
    s = START[sec]
    for off, sym in ((0, "Cmaj9"), (7.5, "D"), (16, "Cmaj9"), (23.5, "D"), (28, "D7sus4"), (30, "D")):
        if sec == "chorus3" and off == 7.5:
            off = 8.0          # never inside the silence: it doubles the slam-back crash on "You" instead
        brass_stabs.append({"startBeat": s + off, "beats": .5, "notes": T(VOICING[sym][1:], t), "why": "chorus hit"})
    sax_stabs.append({"startBeat": s + 13.5, "beats": .5, "notes": [67 + t]})            # the alert after "fade"
    if sec == "chorus3":
        sax_stabs.append({"startBeat": s + 31.5, "beats": .5, "notes": [71 + t]})        # one last cheek after the last YOU DO
for pre in ("pre1", "pre2"):   # the HAND hit
    brass_stabs.append({"startBeat": START[pre] + 13.5, "beats": .5, "notes": [54, 57, 62], "why": "HAND hit"})
# the boot chord as a brass hit on every era change (the reboot is the chord itself, listed in rebootChord)
ERA_STAB_BEATS = [START["post1"], START["verse2"], START["pre2"], START["chorus2"] + 16, START["post2"],
                  START["bridge"], START["bridge"] + 24, START["outro"] + 8]
for b in ERA_STAB_BEATS:
    ch = next(c for c in CHORDS if c["startBeat"] <= b < c["startBeat"] + c["beats"])
    brass_stabs.append({"startBeat": b, "beats": .5, "notes": ch["notes"][1:], "why": "era change"})
brass_stabs.sort(key=lambda x: x["startBeat"])
for l in LINES:
    if l["voice"] == "lead" and l["section"].startswith("chorus"):
        for w in l["words"]:
            if w["w"].lower().startswith("pen") and w["notes"][0][0]:
                glock_pen.append([w["notes"][0][0] + 12, w["notes"][0][1], .5])
brass_stabs, sax_stabs, glock_pen = cut(brass_stabs, SILENT), cut(sax_stabs, SILENT), cut(glock_pen, SILENT)
riff_flourish = cut(riff_flourish, SILENT)
# the Writing Bell: every glockenspiel note in the song (the pen pings, the flourishes, "while", the outro loop)
bell_events = [list(e) for e in glock_pen + riff_flourish]
bell_events.append([74, START["pre1"] + 7, 1])                        # the bell rings on "hum for a WHILE"
bell_events.append([74, START["pre2"] + 7, 1])                        # ... and on "I WON'T"
for n, b, d in RIFF_LOOP:                                             # the outro loop, in A, on top of the organ
    bell_events.append([n + 14, START["outro"] + b, d])
bell_events = sorted(cut(bell_events, SILENT), key=lambda e: e[1])

# the bridge comp: organ chord stabs on the big-beat kick rhythm (16th indices 0, 7, 10) through bars 1-6
bridge_comp = []
for ch in CHORDS:
    if START["bridge"] <= ch["startBeat"] < START["bridge"] + 24:
        for off in (0, 1.75, 2.5):
            bridge_comp.append({"startBeat": ch["startBeat"] + off, "beats": .5, "notes": ch["notes"][1:]})

# the bridge beeps: a system beep on every year, pitched to the chant (an octave up), climbing
beeps = []
for l in LINES:
    if l["section"] == "bridge" and l["voice"] == "chant":
        for w in l["words"]:
            beeps.append([w["notes"][0][0] + 12, w["notes"][0][1], .25])

# the typed verbs: a 30 ms blip on every chant word that starts on an integer beat (the list is typed)
blips = sorted({w["notes"][0][1] for l in LINES if l["voice"] == "chant" and l["section"] in ("intro", "verse1", "verse2", "outro")
                for w in l["words"] if abs(w["notes"][0][1] - round(w["notes"][0][1])) < 1e-9})

# --- the desk as the band: every percussive voice is a UI foley sound with a visible cause
KIT = {
    "kick": {"foley": "floppy eject", "cause": "a floppy pops out of its drive icon (the disk slides out one pixel per frame)",
             "synth": "the eject clunk pitched down two octaves with a 55 Hz sine body and a 4 ms click; tighter 808-style body in the choruses"},
    "snare": {"foley": "window close ('whap')", "cause": "a window zooms shut: the zoom outline collapses to its icon",
              "synth": "noise burst + 180 Hz body, crunchy, 120 ms"},
    "ghostSnare": {"foley": "window shade", "cause": "a window rolls up to its title bar, quietly", "synth": "the snare at -18 dB"},
    "clap": {"foley": "mouse click, stacked", "cause": "the pointer clicks (one click per copy, the copies 8 ms apart: twelve pointers in the final chorus)",
             "synth": "three to twelve layered 2 kHz clicks + a short noise tail"},
    "hat": {"foley": "keystroke", "cause": "one typed character of the writer's solid line (closed hat = a letter)",
            "synth": "6 kHz noise, 40 ms; the key-down click 2 ms before it"},
    "openHat": {"foley": "space bar", "cause": "the space bar: the word gap in the typed line", "synth": "the hat with a 120 ms tail"},
    "crash": {"foley": "Trash crumple", "cause": "Empty Trash: the can bulges, the paper crumples",
              "synth": "long noise, 2 s decay; choked (200 ms) on the HAND hits"},
    "cowbell": {"foley": "system beep", "cause": "the menu bar flashes once", "synth": "two square partials 560/845 Hz"},
    "tambourine": {"foley": "scroll-bar rattle", "cause": "the scroll thumb drags down a long document, the arrows tick", "synth": "jangly noise 16ths"},
    "snap": {"foley": "checkbox tick", "cause": "a checkbox fills in", "synth": "finger snap: short 2 kHz click"},
    "floorTom": {"foley": "disk dropped on the desktop", "cause": "an icon lands (fills.stumble only)", "synth": "90 Hz sine drop, 250 ms"},
    "riser": {"foley": "progress bar", "cause": "a progress bar fills from empty to full across the riser window",
              "synth": "white-noise riser with a rising band-pass (the breakdown's is the floppy spin-up sweep)"},
    "stab": {"foley": "the boot chord as brass", "cause": "the appearance changes era: the whole desk re-skins on the hit",
             "synth": "brass section (GM 62) on the chord's upper voicing, 8th-note length"},
    "bell": {"foley": "the Writing Bell", "cause": "the product's own Writing Bell app rings (the bell icon swings)",
             "synth": "glockenspiel (GM 10)"},
    "keystroke": {"foley": "one keystroke", "cause": "the writer types one character: 'pen' in the silence, Return at the end",
                  "synth": "a dry key-down click, 2 ms, nothing else"},
    "click": {"foley": "one mouse click", "cause": "the writer clicks Save", "synth": "one dry click"},
    "chop": {"foley": "ClioTalk's grille", "cause": "the chat window's speaker grille bars jump on each chop: the AI says its own name",
             "synth": "the boot teaser's 'pen' and 'pal', chopped and repitched (PSOLA), 8-bit in 1988 sections"},
    "floppyA": {"foley": "floppy drive A (left)", "cause": "drive A's head steps to the note; the drive light blinks", "synth": "stepper-motor square wave with a 30 ms seek chirp, the root notes"},
    "floppyB": {"foley": "floppy drive B (right)", "cause": "drive B's head steps to the note", "synth": "the same an octave up / on the fifth"},
    "sub": {"foley": "the 808", "cause": "the desktop pattern shakes one pixel", "synth": "sine sub an octave under drive A, choruses only"},
    "beep": {"foley": "appearance beep", "cause": "the Control Panel picks the next appearance", "synth": "square-wave beep, 1/4 beat"},
    "blip": {"foley": "typed verb", "cause": "a chant verb lands in its field", "synth": "30 ms sine ping"},
}

# --- explicit foley lists (beats): the video draws one UI event for each
CRASHES = [START["chorus1"], START["post1"], START["chorus2"], START["chorus2"] + 16, START["post2"],
           START["bridge"], START["chorus3"], START["chorus3"] + 8, START["chorus3"] + 16, START["outro"]]
CHOKED_CRASHES = [START["pre1"] + 13.5, START["pre2"] + 13.5]
RISERS = [[f["startBeat"], f["startBeat"] + f["beats"], f["name"]] for f in FILLS
          if f["name"].lower().endswith(("riser", "riser1", "riser2", "riser3", "spinup", "bridgeroll", "reversecymbal",
                                         "reversecymbal2", "reversecymbal3", "reversecymbal4"))]
KEYSTROKES = [START["chorus3"] + 7.25, START["outro"] + 12]
CLICKS = [START["tail"] + 2.5]
DROPS = {"drop": START["intro"], "chorus1": START["chorus1"], "post1": START["post1"], "chorus2": START["chorus2"],
         "post2": START["post2"], "bridge": START["bridge"], "reboot": START["chorus3"], "slamBack": START["chorus3"] + 8,
         "outro": START["outro"]}

ERAS = [
    {"name": "1988 System 6", "startBeat": 0, "note": "1-bit; boot to pre-chorus 1"},
    {"name": "1991 System 7", "startBeat": START["chorus1"], "note": "colour floods in on the first chorus 'pen'"},
    {"name": "1999 Platinum", "startBeat": START["post1"], "note": "bevel buttons on the Jersey bounce"},
    {"name": "2002 Aqua", "startBeat": START["verse2"], "note": "dithered pinstripes"},
    {"name": "2005 Tiger", "startBeat": START["pre2"], "note": "brushed metal"},
    {"name": "2009 Snow Leopard", "startBeat": START["chorus2"], "note": ""},
    {"name": "2011 Lion", "startBeat": START["chorus2"] + 16, "note": "from the second pen pal"},
    {"name": "2014 Yosemite", "startBeat": START["post2"], "note": ""},
]
YEARS = ["1988 System 6", "1991 System 7", "1995 NeXTSTEP", "1998 Drawing Board", "1999 Platinum", "2002 Aqua",
         "2005 Tiger", "2009 Snow Leopard", "2011 Lion", "2014 Yosemite", "2020 Big Sur", "2026 Liquid Glass"]
for i, y in enumerate(YEARS):
    ERAS.append({"name": y, "startBeat": START["bridge"] + 2 * i, "note": "bridge roll-call, one appearance per half bar; the four-digit year is the caption"})
ERAS += [
    {"name": "1988 System 6 (inverted)", "startBeat": START["bridge"] + 24, "note": "contact sheet, then white on black"},
    {"name": "2026 Liquid Glass", "startBeat": START["chorus3"], "note": "the reboot; dithered translucency"},
    {"name": "1988 System 6", "startBeat": START["outro"] + 8, "note": "One More Tune hands the appearance back"},
]

HITS = {
    "boot": 0, "teaserPen": 6, "drop": START["intro"], "chops": START["intro"] + 1.5, "verse1": START["verse1"],
    "riffReturns": START["verse1"] + 16,
    "melt": START["pre1"] + 4, "stop1": START["pre1"] + 13.5, "air1": START["pre1"] + 14,
    "chorus1": START["chorus1"], "colour": START["chorus1"],
    "fade1": START["chorus1"] + 13, "whoHoldsThePen1": START["chorus1"] + 24, "youDo1": START["chorus1"] + 28,
    "post1": START["post1"], "lala": START["post1"], "lala2": START["post1"] + 8, "verse2": START["verse2"],
    "flagIt1": START["verse2"] + 18, "stumble": START["verse2"] + 19.25, "flagIt2": START["verse2"] + 22,
    "flagIt3": START["verse2"] + 26, "keepIt": START["verse2"] + 30,
    "smooth": START["pre2"] + 5, "stop2": START["pre2"] + 13.5, "air2": START["pre2"] + 14,
    "chorus2": START["chorus2"], "fade2": START["chorus2"] + 13, "whoHoldsThePen2": START["chorus2"] + 24,
    "youDo2": START["chorus2"] + 28, "post2": START["post2"], "lala3": START["post2"], "bridge": START["bridge"],
    "subDrop": START["bridge"] + 16, "contactSheet": START["bridge"] + 24,
    "collapse": START["bridge"] + 28, "breakdown": START["breakdown"], "twoFloppies": START["breakdown"] + .5,
    "pivot": START["breakdown"] + 12, "reboot": START["chorus3"], "keyChange": START["chorus3"],
    "bandOut": START["chorus3"] + 6.5, "silentPen": START["chorus3"] + 7, "keystroke": START["chorus3"] + 7.25,
    "slamBack": START["chorus3"] + 8,
    "fade3": START["chorus3"] + 13, "whoHoldsThePen3": START["chorus3"] + 24, "youDo3": START["chorus3"] + 28,
    "outro": START["outro"], "lala4": START["outro"],
    "exportCD": START["outro"] + 6, "bootChordOut": START["outro"] + 12, "returnKey": START["outro"] + 12,
    "saveDialog": START["outro"] + 14, "saveClick": START["tail"] + 2.5, "end": DURATION_BEATS,
}
for i, y in enumerate(YEARS):
    HITS["era_" + y.split()[0]] = START["bridge"] + 2 * i

PARTS = {
    "voiceRanges": {
        "lead": {"low": "G3", "high": "E5", "midi": [55, 76],
                 "why": "en_US-amy-medium speaks near G3; sung notes stay within ~1.7 octaves above it so PSOLA keeps the words"},
        "chant": {"low": "D3", "high": "A4", "midi": [50, 69],
                  "why": "amy with the pitch tier flattened; D3 is the deadpan end-of-list fall"},
        "choir": {"low": "G3", "high": "E5", "midi": [55, 76],
                  "why": "written pitches; the production stacks amy + jenny + lessac (lessac an octave down is not notated)"},
        "spoken": {"midi": [0, 0], "why": "unpitched raw TTS; the note slots are time only"},
    },
    "machineVoice": {
        "chant": "amy, pitch tier flattened to the written note (G3 = her speaking pitch; B3 in verse 1 bars 5-8), no vibrato; "
                 "durations quantised to the 8th grid; only the vowel nucleus is stretched (duration tier holds onsets/codas at 1.0); "
                 "doubled an octave down by lessac at -9 dB; 1988 sections add an 8-bit 11 kHz crush; the last word of every list "
                 "line steps down (to D3 from G3, to G3 from B3); questions stay flat: the robot does not know how to ask",
        "lead": "amy singing; gentle vibrato (5.5 Hz, +/-20 cents) on notes of 1 beat or longer; 60 ms portamento only where notes are slurred inside a word",
        "choir": "amy + en_GB-jenny_dioco + lessac (an octave down), each offset +/-15 ms and detuned +/-8 cents (roles harmony, lala); "
                 "the final chorus doubles every voice (6 takes)",
        "gang": "roles 'echo', 'gang' and 'call': the choir SHOUTED, 12 copies (one per appearance, each with its own detune and formant tilt), "
                "hard-panned wide, +3 dB over the lead on 'You do!' and '(pen pal)', -3 dB under the chant on '(Keep it.)' and 'Flag it.'; "
                "a clap stack on every 'Flag' and on both 'You's; the crowd's part",
        "spoken": "lessac, raw Piper, no PSOLA; k1 is low-passed to 4 kHz with an 8-bit crush (a sample from a 1988 Mac); o3 is dry and flat, the full-disk-warning voice",
        "chops": "the boot teaser's 'pen' (D5) and 'pal' (B4) cut at the word boundary, repitched by PSOLA, 8-bit crushed in the intro, clean in the post-choruses; "
                 "an instrument, not a line (parts.chops.events: [midi, beat, beats, word])",
        "melt": {
            "pre1a / pre2a": "flat chant on G3, octave double, crush",
            "pre1b / pre2b": "chant with an 80 ms glide between notes (the robot learns portamento); crush lifts; in pre2b a low-pass sweep closes over 'smooth' (8 kHz -> 1.5 kHz across the beat) and 'I won't' is bone dry again",
            "pre1c / pre2c": "lead: vibrato arrives, octave double removed",
            "pre1d / pre2d": "full lead, hanging on A4 HAND (the 5th of D, a question); the band hits with it and stops; half a beat of air",
        },
        "gags": {
            "fade (chorus d lines)": "level fade and pitch glide B4 -> G4 while the bit depth drops over the beat, into half a beat of real silence: the singer's own output is temporary",
            "smooth (pre2b)": "a low-pass sweep closes over 'smooth' (the voice's own consonants are smoothed off); 'I won't.' is full-band and dry",
            "chorus3b 'pen' (silent=true)": "the band drops at +6.5 after 'hold', the lead sings 'the' alone, then the word is not sung: silence from +7, one keystroke at +7.25, the crash and brass slam back on 'You' at +8",
            "v2c 'Too regular?' / 'Flag it.'": "the chant is perfectly regular on purpose, so Review Desk flags the singer; the band answers with the one-beat stumble (fills.stumble)",
            "v2f_keep 'Keep it.'": "+/-10 cent detune and 20 ms unquantised onsets on the lead: the one rough line in the song is the one worth keeping",
            "bridge years": "chant stacked in octaves, panned; a system beep on every year (parts.beeps)",
            "o2 'voice'": "the long A4 (outro +11 .. +14) freezes into a two-cycle grain loop for its last half beat (+13.5 .. +14), then the boot chord takes over",
        },
        "qa": "faster_whisper small.en must transcribe every line word for word, except the 'lala' lines (judge those by pitch contour; "
              "'la la la la la la la' passes) and the stacked '(pen pal)' echoes and 'You do!' gang (word-level check only). Lines to check alone first: "
              "chorus3a/e (E5 'pen'), chorus3h (E5 'You'), v2a ('is an app'), pre2b ('I could smooth it'). If a line fails, lengthen its slowest word or move its echo",
    },
    "silence": SILENT,
    "bootChord": {"symbol": "Gmaj9", "notes": VOICING["Gmaj9(boot)"], "startBeat": 0, "beats": 8,
                  "timbre": "saw pad + FM bell on the lower four notes, sharp attack, low-pass opening slowly over 4 beats, then ringing; "
                            "the top D5 is pad only (no sine 'ding', so it cannot read as a chime); ours, not Apple's"},
    "rebootChord": {"symbol": "Dmaj9", "notes": VOICING["Dmaj9(reboot)"], "startBeat": START["chorus3"], "beats": 4,
                    "timbre": "the boot chord voiced in A, with a crash: the reboot into Liquid Glass"},
    "outroChord": {"symbol": "Amaj9", "notes": VOICING["Amaj9(boot)"], "startBeat": START["outro"] + 12, "beats": 8,
                   "timbre": "the boot chord in A, ringing to the end, 'played' by the writer's Return key (sfx.keystrokes[1]); the 9th never resolves"},
    "riff": {
        "name": "The Floppy Organ",
        "timbre": "percussive combo organ (FluidR3 GM 17) doubled by a numpy 25%-duty pulse; each attack gets a 6 ms downward pitch blip and a very quiet floppy-stepper click (band-passed noise 2-3 kHz, 8 ms); 8-bit 11 kHz sample-and-hold crush in 1988 sections, lifting as the eras advance, fully clean in Liquid Glass",
        "loopBeats": 8,
        "loop": [[n, b, d] for n, b, d in RIFF_LOOP],
        "loopNames": [nm(n) for n, _, _ in RIFF_LOOP],
        "turnaround": [[n, b, d] for n, b, d in RIFF_TURN],
        "plays": [{"startBeat": s, "repeats": r, "transpose": t, "turnaround": turn, "note": note} for s, r, t, turn, note in RIFF_PLAYS],
        "events": riff_events,
        "cuts": RIFF_CUTS,
        "flourish": riff_flourish,
        "flourishNote": "three 16ths (G5 B5 D6; A5 C#6 E6 in A) at chorus +31.25/+31.5/+31.75, above the gang's last 'do!', into the next section; organ, doubled by the Writing Bell",
        "glockDouble": {"sections": ["chorus1", "chorus2", "chorus3"], "transpose": 0, "what": "the Writing Bell doubles the flourish in every chorus and plays the loop on top of the outro (parts.bells)"},
    },
    "chops": {
        "name": "the pen-pal chops",
        "source": "the boot teaser: 'pen' (boot +5.5, D5) and 'pal' (boot +6.5, B4), one TTS take each, chopped at the word boundary",
        "pattern": [[b, d, n, w] for b, d, n, w in CHOP_PATTERN],
        "patternNote": "per 2-bar loop: 'pen' on the riff's long D5 (+1.5), 'pal' on +2.5; bar 2: 'pen' +5.5, a 16th stutter pen-pen at +6.5/+6.75, 'pen' +7, 'pal' +7.5",
        "plays": [{"startBeat": s, "loops": n, "transpose": t, "note": note} for s, n, t, note in CHOP_PLAYS],
        "events": chop_events,
        "eventFormat": "[midi, beat, beats, word]",
        "treatment": "PSOLA-repitched, 8-bit 11 kHz crush in the intro, clean in the post-choruses; hard-gated to the written length; -4 dB under the lead, centre",
    },
    "bass": {
        "name": "Two Floppies",
        "what": "two floppy-drive stepper motors sing the bass: drive A (left) the roots, drive B (right) the octave and the fifth; their heads move on screen per note",
        "timbre": "stepper-motor square wave (pulse 50%, a 30 ms seek chirp on each attack, light drive on the body), A hard left, B hard right; under it in the choruses a sine 808 (parts.sub)",
        "styles": {
            "pulse8": "the octave bass: drive A the root on every beat, drive B the octave on every 'and' (A B A B ...), sidechain pump from the kick",
            "strut": "after Feel It Still, split across the drives: A plays R[0,.75] R[.75,.25] R[2.5,.5] and the chromatic approach [3.5,.5]; B plays the octave [1.5,.5] and the fifth [3,.5]; in bars 1 and 5 drive A starts at +.5 so the bell ping on PEN speaks",
            "long": "sustained: A the root, B the fifth (pre-chorus: under the string pad; breakdown: A alone as a soft sine sub, the E2 held through the spin-up riser)",
        },
        "sections": BASS_STYLE,
        "cuts": BASS_CUTS,
        "events": bass_events,
        "drives": {"A": drive_a, "B": drive_b},
    },
    "sub": {"what": "808 sine sub, one long note an octave under drive A on every chorus chord, plus the bridge sub drop; cut in the silence", "events": sub_events},
    "drums": {
        "grid": 16,
        "gridNote": "16 characters per bar, one per 16th; a pattern of 1/2/4/8 bars repeats through its section",
        "kit": KIT,
        "groove": {
            "intro / verses / bridge": "the big-beat break (Take California): floppy ejects on 1 and the 'a' of 2, window-close on 2 and 4, keystroke 16ths (8ths in the verses), a beep on the 'and' of 4 every second bar",
            "pre-chorus": "four on the floor under the progress-bar riser; the band hits HAND and stops",
            "chorus": "house / disco: four on the floor, clap stack on 2 and 4, the space-bar open hat on every 'and', closed keystrokes between; the 808 under the drives; crash on 1",
            "post-chorus": "Jersey-club bounce: kicks on 1, the 'a' of 1, the 'and' of 2, the 'and' of 3 and 4 (bar 2 adds the bed-squeak 16th), clap stack on 2 and 4, 8th keystrokes; the chops on top",
            "breakdown": "checkbox snaps and one click, space",
            "final chorus": "the house chorus plus the scroll-bar tambourine 16ths; twelve pointers click the claps",
        },
        "patterns": DRUM_PATTERNS,
        "sections": DRUM_SECTIONS,
        "overrides": DRUM_OVERRIDES,
        "mutes": DRUM_MUTES,
        "ducks": DRUM_DUCKS,
        "fills": FILLS,
        "crashes": CRASHES,
        "chokedCrashes": CHOKED_CRASHES,
        "risers": RISERS,
    },
    "keys": {
        "sections": {
            "boot": "the boot chord only",
            "intro": "organ riff only, no pads; dry; the pen-pal chops on top of the riff",
            "verse1": "bars 1-4: no riff (drives, drums, chant and the typed-verb blips only); bars 5-8 the riff returns and turns around on D5",
            "pre1": "string pad (GM 49) sustaining each chord voicing, rising with the riser; the riff drops out; the Writing Bell on 'while'; the whole band hits HAND at +13.5 and stops at +14",
            "chorus1": "bouncy offbeat piano 8ths (GM 1) on the chord voicings (Cmaj9 with the D on top); soft saw pad; brass stabs (GM 62) listed in stabs.brass (including both 'You's); the Writing Bell on every 'pen' (stabs.glockPen); one tenor sax (GM 66) stab after 'fade'; the flourish over the last 'do!'",
            "post1": "bars 1-2: organ tacet, the choir sings the riff over the Jersey bounce and a vinyl-crackle bed (One More Tune's record); bars 3-4: the organ an octave down, the la-la again, the chops: three hooks at once",
            "verse2": "as verse 1 plus a second organ an octave down; the groove drops for the stumble at +19",
            "pre2": "as pre-chorus 1, tambourine added; the low-pass sweep on 'smooth'; the bell on 'won't'",
            "chorus2": "as chorus 1, tambourine 16ths, choir harmony a third below on bars 5-6",
            "post2": "organ riff an octave down, the la-la, the chops, the Jersey bounce; the riser into the bridge",
            "bridge": "organ chord stabs on the big-beat kick rhythm (keys.bridgeComp: 16th indices 0, 7, 10 of each bar, bars 1-6); no hats, the twelve beeps (parts.beeps) are the hi-hat; brass on the downbeat and the contact sheet; sub drop on bar 5; bars 7-8 a filter-swept pad, half-time drums building",
            "breakdown": "bar 1: a G pedal (sine) and the spoken sample only; bars 2-3: felt piano (GM 1, soft) on the voicings, snaps and claps, lots of space; bar 4: E7sus4 held by the pad over an E2 sine sub while the floppy spin-up riser climbs; no drums; the pickup 'I'm just your' (E4 A4 B4) is a cappella",
            "chorus3": "the reboot chord with a crash, then everything in A: piano, pad, brass, bell, 12-copy gang on the echoes and the answer; +6.5 to +8 is the silence window (parts.silence): every part out, one keystroke at +7.25, crash and brass on +8; sax stab after 'fade' and after the last 'do!'",
            "outro": "bars 1-2 riff and loop in A under the chant, the choir's la-la on top, the bell on the loop; bar 3 piano and claps under the lead alone (Dmaj9, then E7sus4 suspending under the held 'voice'); bar 4 the Amaj9 boot chord, played by the Return key, resolves under the voice and rings; the spoken line sits over it",
            "tail": "the boot chord decaying; one mouse click at saveClick; silence for the end card",
        },
        "bridgeComp": bridge_comp,
        "voicings": "take each chord's 'notes' from the chords list: bass note first, then a close voicing around C4",
    },
    "stabs": {"brass": brass_stabs, "sax": sax_stabs, "glockPen": glock_pen},
    "bells": bell_events,
    "beeps": beeps,
    "sfx": {
        "saveClick": START["tail"] + 2.5,
        "keystroke": START["chorus3"] + 7.25,
        "keystrokes": KEYSTROKES,
        "clicks": CLICKS,
        "floppyClunks": [START["breakdown"] + .5, START["breakdown"] + 1],
        "blips": blips,
        "uiBlips": "one 30 ms sine ping on every chant word that starts on an integer beat (verses, intro, outro): sfx.blips",
        "drops": DROPS,
    },
    "eras": ERAS,
    "hits": HITS,
}

SCORE = {
    "title": TITLE,
    "credits": "Words, music, arrangement, voice and picture by Claude. Sung by en_US-amy-medium through Praat PSOLA.",
    "bpm": BPM,
    "key": KEY,
    "beatsPerBar": BEATS_PER_BAR,
    "durationBeats": DURATION_BEATS,
    "sections": SECTIONS,
    "chords": CHORDS,
    "lines": LINES,
    "parts": PARTS,
}

if __name__ == "__main__":
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "score.json")
    with open(out, "w") as f:
        json.dump(SCORE, f, separators=(",", ":"))   # compact: the film is weighed against one floppy
    print("wrote %s: %d beats = %.1f s, %d sections, %d chords, %d lines" % (
        out, DURATION_BEATS, DURATION_BEATS * 60 / BPM, len(SECTIONS), len(CHORDS), len(LINES)))
