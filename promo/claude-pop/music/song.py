#!/usr/bin/env python3
"""song.py: defines "Pen Pal" (Claude-Pop for AI System 6) and writes music/score.json.

Run:  python3 -I music/song.py          (stdlib only; writes score.json next to this file)

The song is written in a compact notation that reads like a lyric sheet:

    line("c1a", "chorus1", "lead", "I'm just your pen pal,", -1.5,
         "I'm=D4=.5 just=E4=.5 your=G4=.5 pen=B4=1 pal,=A4=1.5")

Each token is WORD=PITCHES=BEATS.  "at" is the start beat relative to the section's first beat
(negative = a pickup before the downbeat).  Tokens are consumed left to right, so a start beat is
never typed twice.  "_=1" is a rest of one beat.  A word that spans several notes writes its
syllables with "|":  "nev|er=A4,B4=1,.5"  (the "|" is removed from the on-screen word and the
syllable strings go out as "syl").  Pitch "x" is unpitched: raw TTS in a spoken line, and one beat
of deliberate SILENCE in a sung line (the final chorus cannot sing the word "pen").

Beats are absolute in score.json (1 beat = 0.5 s at 120 bpm).  MIDI 60 = C4.
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
    ("intro", 16, "Intro: the drop and the chant"),
    ("verse1", 32, "Verse 1: the route"),
    ("pre1", 16, "Pre-chorus 1: the melt"),
    ("chorus1", 32, "Chorus 1"),
    ("post1", 16, "Post-chorus: who holds the pen / la la"),
    ("verse2", 32, "Verse 2: MultiFinder and Review Desk"),
    ("pre2", 16, "Pre-chorus 2"),
    ("chorus2", 32, "Chorus 2"),
    ("post2", 8, "Who holds the pen?"),
    ("bridge", 32, "Bridge: twelve eras, one desk"),
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

# ----------------------------------------------------------------------------------------------
# chords: symbol -> voicing (bass note first).  Pitch classes for the validator come from these.
# ----------------------------------------------------------------------------------------------
VOICING = {
    # G-major world
    "Gmaj9(boot)": [43, 50, 57, 59, 66, 74],   # G2 D3 A3 B3 F#4 D5: our boot chord, stacked wide
    "G": [43, 55, 59, 62], "F": [41, 53, 57, 60], "C": [48, 52, 55, 60],
    "Am7": [45, 55, 60, 64], "Bm7": [47, 57, 62, 66], "D": [50, 54, 57, 62],
    "Cmaj7": [48, 52, 55, 59], "Em7": [40, 55, 59, 62], "G/B": [47, 55, 59, 62],
    "D7sus4": [50, 55, 57, 60], "Dsus4": [50, 55, 57, 62], "Em": [40, 55, 59, 64],
    "G(pedal)": [31, 43, 55],
    # A-major world (the reboot)
    "Dmaj9(reboot)": [38, 45, 52, 54, 61, 69],  # D2 A2 E3 F#3 C#4 A4: the boot chord voiced in A
    "E": [40, 56, 59, 64], "F#m7": [42, 57, 61, 64], "A/C#": [49, 57, 61, 64],
    "Dmaj7": [50, 54, 57, 61], "E7sus4": [40, 57, 59, 62], "A": [45, 57, 61, 64],
    "Amaj9(boot)": [45, 52, 59, 61, 68, 76],    # A2 E3 B3 C#4 G#4 E5: rings to the end
}

LOOP = [("G", 4), ("F", 2), ("C", 2)]                          # the big-beat loop, G Mixolydian
PRE = [("Am7", 4), ("Bm7", 4), ("C", 4), ("D", 4)]            # rising ii iii IV V
CHORUS_G = [("Cmaj7", 4), ("D", 4), ("Em7", 4), ("G/B", 4), ("Cmaj7", 4), ("D", 4), ("Am7", 4), ("D7sus4", 2), ("D", 2)]
CHORUS_A = [("Dmaj9(reboot)", 4), ("E", 4), ("F#m7", 4), ("A/C#", 4), ("Dmaj7", 4), ("E", 4), ("Bm7", 4), ("E7sus4", 2), ("E", 2)]

CHORD_PLAN = {
    "boot": [("Gmaj9(boot)", 8)],
    "intro": LOOP * 2,
    "verse1": LOOP * 4,
    "pre1": PRE,
    "chorus1": CHORUS_G,
    "post1": [("G", 4), ("C", 4)] + LOOP,
    "verse2": LOOP * 4,
    "pre2": PRE,
    "chorus2": CHORUS_G,
    "post2": [("G", 4), ("C", 4)],
    "bridge": [("Em", 4), ("C", 4), ("G", 4), ("D", 4), ("Em", 4), ("Am7", 4), ("C", 4), ("Dsus4", 2), ("D", 2)],
    "breakdown": [("G(pedal)", 4), ("C", 4), ("Am7", 4), ("D", 4)],   # the D is the pivot: V in G, IV in A
    "chorus3": CHORUS_A,
    "outro": [("A", 4), ("G", 2), ("D", 2), ("Dmaj7", 2), ("E", 2), ("Amaj9(boot)", 4)],
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
        w, pitches, durs = tok.split("=")
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
        words.append(word)
    assert [w["w"] for w in words] == text.split(), (lid, [w["w"] for w in words], text.split())
    entry = {"id": lid, "section": section, "voice": voice, "text": text, "words": words}
    if role:
        entry["role"] = role
    LINES.append(entry)
    return beat


# BOOT: the bare voice over the ringing boot chord. "pen" lands on beat 6 = 3.0 s.
line("boot", "boot", "lead", "I'm just your pen pal.", 4.5,
     "I'm=D4=.5 just=E4=.5 your=G4=.5 pen=B4=1 pal.=A4=1")

# INTRO: the chant.  Monotone G3, each line's last word drops to D3 (the end-of-list fall).
CHANT = "Save=G3=.5 it.=G3=.5 _=1 Clip=G3=.5 it.=G3=.5 _=1 In|sert=G3,G3=.5,.5 it.=G3=.5 _=.5 Ex|port=G3,G3=.5,.5 it.=D3=.5"
line("i1", "intro", "chant", "Save it. Clip it. Insert it. Export it.", 0, CHANT)
line("i2", "intro", "chant", "Everything I say is temporary.", 8,
     "Ev|ery|thing=G3,G3,G3=.5,.5,.5 I=G3=.5 say=G3=1 is=G3=.5 _=.5 tem|po|ra|ry.=G3,G3,G3,D3=.5,.5,.5,.5")

# VERSE 1: the route, as a to-do list.  Verbs on quarter-note positions, "it" on the next eighth.
line("v1a", "verse1", "chant", "Spin the hard disk. Feed the floppy.", 0,
     "Spin=G3=.5 the=G3=.5 hard=G3=.5 disk.=G3=1 _=1.5 Feed=G3=.5 the=G3=.5 flop|py.=G3,D3=.5,1")
line("v1b", "verse1", "chant", "Ask the question. Search it. Read it.", 8,
     "Ask=G3=.5 the=G3=.5 ques|tion.=G3,G3=.5,.5 _=2 Search=G3=.5 it.=G3=.5 _=1 Read=G3=.5 it.=D3=.5")
line("v1c", "verse1", "chant", "Clip the proof. Scrapbook. Keep it.", 16,
     "Clip=G3=.5 the=G3=.5 proof.=G3=1 _=2 Scrap|book.=G3,G3=.5,.5 _=1 Keep=G3=.5 it.=D3=.5")
line("v1d", "verse1", "chant", "Outline it. Draft it. Your words. Not mine.", 24,
     "Out|line=G3,G3=.5,.5 it.=G3=.5 _=.5 Draft=G3=.5 it.=G3=.5 _=1 Your=G3=.5 words.=G3=1 _=.5 Not=G3=.5 mine.=D3=1")

# PRE-CHORUS: the melt.  Line 1 flat chant, line 2 learns to glide, lines 3-4 are the full lead.
def prechorus(sec, l1, l2):
    line(sec + "a", sec, "chant", l1[0], 0, l1[1])
    line(sec + "b", sec, "chant", l2[0], 4, l2[1])
    line(sec + "c", sec, "lead", "But the pen and the page", 8,
         "But=E4=.5 the=F#4=.5 pen=G4=1 and=G4=.5 the=A4=.5 page=B4=1")
    line(sec + "d", sec, "lead", "stay in your hand.", 12,
         "stay=A4=.5 in=B4=.5 your=C5=.5 hand.=D5=1")


prechorus("pre1",
          ("I can fetch. I can file.", "I=G3=.5 can=G3=.5 fetch.=G3=1 I=G3=.5 can=G3=.5 file.=G3=1"),
          ("I can hum for a while.", "I=G3=.5 can=A3=.5 hum=B3=1 for=B3=.5 a=C4=.5 while.=D4=1"))

# CHORUS.  t = transposition (0 in G, +2 in A).  "harmony" adds the choir a third below on bars 5-8.
def chorus(sec, t=0, harmony=False, silent_pen=False, gang=False):
    hook = "I'm=D4=.5 just=E4=.5 your=G4=.5 pen=B4=1 pal,=A4=1.5"
    line(sec + "a", sec, "lead", "I'm just your pen pal,", -1.5, hook, t)
    line(sec + "a_echo", sec, "choir", "(pen pal)", 2.5, "(pen=G4=.5 pal)=E4=.5", t, role="echo")
    pen = "pen.=x=1" if silent_pen else "pen.=D4=1"
    line(sec + "b", sec, "lead", "I'll never hold the pen.", 3.5,
         "I'll=G4=.5 nev|er=A4,B4=1,.5 hold=A4=1 the=F#4=.5 " + pen, t)
    line(sec + "c", sec, "lead", "You say where the words land,", 8,
         "You=G4=.5 say=B4=1 where=A4=.5 the=G4=.5 words=B4=.5 land,=D5=1", t)
    line(sec + "d", sec, "lead", "or they fade.", 12, "or=B4=.5 they=A4=.5 fade.=B4=1.5", t)
    line(sec + "e", sec, "lead", "I'm just your pen pal,", 14.5, hook, t)
    line(sec + "e_echo", sec, "choir", "(pen pal)", 18.5, "(pen=G4=.5 pal)=E4=.5", t, role="echo")
    line(sec + "f", sec, "lead", "I sing it, you say it.", 19.5,
         "I=F#4=.5 sing=A4=1 it,=B4=.5 you=A4=.5 say=F#4=1 it.=D4=1", t)
    line(sec + "g", sec, "lead", "Your roughness is you,", 24,
         "Your=G4=.5 rough|ness=B4,A4=1,.5 is=G4=.5 you,=C5=1.5", t)
    line(sec + "h", sec, "lead", "don't let me erase it.", 28,
         "don't=C5=.5 let=B4=.5 me=A4=.5 e|rase=G4,A4=.5,1 it.=G4=1", t)
    if harmony:  # the AI's choir is made only of itself: a third below the lead
        line(sec + "f_h", sec, "choir", "I sing it, you say it.", 19.5,
             "I=D4=.5 sing=F#4=1 it,=G4=.5 you=F#4=.5 say=D4=1 it.=B3=1", t, role="harmony")
        line(sec + "g_h", sec, "choir", "Your roughness is you,", 24,
             "Your=E4=.5 rough|ness=G4,F#4=1,.5 is=E4=.5 you,=A4=1.5", t, role="harmony")
        line(sec + "h_h", sec, "choir", "don't let me erase it.", 28,
             "don't=A4=.5 let=G4=.5 me=F#4=.5 e|rase=E4,F#4=.5,1 it.=E4=1", t, role="harmony")


chorus("chorus1")

# POST-CHORUS 1: the playground call and response, then the choir sings the riff on "la".
CALL = "Who=G4=1 holds=G4=.5 the=F4=.5 pen?=D4=1.5"            # falls; the F natural sticks its tongue out
ANSWER = "You=C5=.5 do!=G4=1.5 You=C5=.5 do!=A4=1.5"           # rises; the kid wins
line("q1", "post1", "choir", "Who holds the pen?", 0, CALL, role="call")
line("q2", "post1", "lead", "You do! You do!", 4, ANSWER)
line("q3", "post1", "choir", "La la la, la la la la.", 8,
     "La=G4=.5 la=G4=.5 la,=B4=.5 la=D5=1 la=C5=.5 la=B4=.5 la.=G4=.5", role="lala")   # = riff bar 1
line("q4", "post1", "choir", "La la la, la la la la.", 12,
     "La=A4=.5 la=C5=.5 la,=A4=.5 la=F4=.5 la=E4=.5 la=G4=.5 la.=C5=1", role="lala")   # = riff bar 2

# VERSE 2: MultiFinder and the Review Desk.
line("v2a", "verse2", "chant", "Chat is an app. Not the whole computer.", 0,
     "Chat=G3=.5 is=G3=.5 an=G3=.5 app.=G3=1 _=1.5 Not=G3=.5 the=G3=.5 whole=G3=.5 com|pu|ter.=G3,G3,D3=.5,.5,1")
line("v2b", "verse2", "chant", "Review Desk. Check for drift.", 8,
     "Re|view=G3,G3=.5,.5 Desk.=G3=1 _=2 Check=G3=.5 for=G3=.5 drift.=D3=1")
line("v2c", "verse2", "chant", "Too regular? Flag it. Generic? Flag it.", 16,
     "Too=G3=.5 reg|u|lar?=G3,G3,G3=.5,.5,.5 Flag=G3=.5 it.=G3=.5 _=1 Ge|ner|ic?=G3,G3,G3=.5,.5,.5 _=.5 Flag=G3=.5 it.=D3=.5")
line("v2d", "verse2", "chant", "Press release? Flag it. Rough edge? Keep it.", 24,
     "Press=G3=.5 re|lease?=G3,G3=.5,.5 _=.5 Flag=G3=.5 it.=G3=.5 _=1 Rough=G3=.5 edge?=G3=.5 _=1 Keep=G3=.5 it.=D3=.5")

prechorus("pre2",
          ("I can check. I can flag.", "I=G3=.5 can=G3=.5 check.=G3=1 I=G3=.5 can=G3=.5 flag.=G3=1"),
          ("I can point at the drift.", "I=G3=.5 can=A3=.5 point=B3=1 at=B3=.5 the=C4=.5 drift.=D4=1"))

chorus("chorus2", harmony=True)

# POST-CHORUS 2: the question again, two bars, straight into the eras.
line("q5", "post2", "choir", "Who holds the pen?", 0, CALL, role="call")
line("q6", "post2", "lead", "You do! You do!", 4, ANSWER)

# BRIDGE: the twelve eras counted as a climbing ladder (two per bar, chord tones, each pair rising).
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
     "Bring=E4=.5 your=G4=.5 own=A4=1 mo|del,=G4,E4=.5,1")
line("k3", "breakdown", "lead", "it still won't hold the pen.", 8,
     "it=E4=.5 still=G4=.5 won't=A4=1 hold=G4=.5 the=E4=.5 pen.=C4=1")

# FINAL CHORUS in A: the reboot.  The voice cannot sing "pen" the first time; the writer types it.
chorus("chorus3", t=2, harmony=True, silent_pen=True, gang=True)

# OUTRO, in A.
line("o1", "outro", "chant", "Save it. Clip it. Insert it. Export it.", 0, CHANT, transpose=2)
line("o2", "outro", "lead", "It was always your voice.", 8,
     "It=F#4=.5 was=A4=.5 al|ways=C#5,B4=1,.5 your=G#4=.5 voice.=A4=3")
line("o3", "outro", "spoken", "This song is temporary.", 14,
     "This=x=.5 song=x=.5 is=x=.5 tem|po|ra|ry.=x,x,x,x=.5,.5,.5,.5")

LINES.sort(key=lambda l: l["words"][0]["notes"][0][1])

# ----------------------------------------------------------------------------------------------
# parts: everything the producer needs
# ----------------------------------------------------------------------------------------------
def events_in(sec):
    s = START[sec]
    return s, s + next(x["beats"] for x in SECTIONS if x["name"] == sec)


# --- the Floppy Organ riff: a two-bar phrase in G Mixolydian, whistleable as
#     "da da da DAAA da da da / da da da da da da DAAA"
RIFF_LOOP = [(67, 0, .5), (67, .5, .5), (71, 1, .5), (74, 1.5, 1), (72, 2.5, .5), (71, 3, .5), (67, 3.5, .5),
             (69, 4, .5), (72, 4.5, .5), (69, 5, .5), (65, 5.5, .5), (64, 6, .5), (67, 6.5, .5), (72, 7, 1)]
RIFF_PLAYS = [  # (startBeat, repeats, transpose, note)
    (START["intro"], 2, 0, "full loop, 8-bit 11 kHz crush (1988)"),
    (START["verse1"], 4, 0, "full loop"),
    (START["post1"], 1, 0, "under the call and response; the choir then sings it on la (organ tacet)"),
    (START["verse2"], 4, 0, "full loop, second organ an octave down"),
    (START["post2"], 1, 0, "full loop"),
    (START["outro"], 1, 2, "in A Mixolydian, clean, with the last chant"),
]
riff_events = []
for s, reps, t, _ in RIFF_PLAYS:
    for r in range(reps):
        for n, b, d in RIFF_LOOP:
            riff_events.append([n + t, s + r * 8 + b, d])
RIFF_HEAD = [(67, 0, .5), (71, .5, .5), (74, 1, .5)]   # the 3-note head, a pickup fill into chorus bars 5 and 1
riff_head_fills = []
for sec, t in (("chorus1", 0), ("chorus2", 0), ("chorus3", 2)):
    for off in (14.5, 30.5):
        for n, b, d in RIFF_HEAD:
            riff_head_fills.append([n + t, START[sec] + off + b, d])

# --- bass
def bass_root(sym):
    pc = VOICING[sym][0] % 12
    return pc + 36 if pc + 36 <= 47 else pc + 24   # C2..B2


BASS_STYLE = {
    "boot": "none", "intro": "pulse8", "verse1": "pulse8", "pre1": "long", "chorus1": "octaveBounce",
    "post1": "pulse8", "verse2": "pulse8", "pre2": "long", "chorus2": "octaveBounce", "post2": "pulse8",
    "bridge": "pulse8", "breakdown": "long", "chorus3": "octaveBounce", "outro": "pulse8", "tail": "none",
}
BASS_CUTS = [  # [startBeat, beats, why]: the bass stops here
    [START["pre1"] + 13.5, 2.5, "stop-time on HAND"],
    [START["pre2"] + 13.5, 2.5, "stop-time on HAND"],
    [START["breakdown"], 4, "bar 1 of the breakdown: only the G pedal and the spoken sample"],
    [START["breakdown"] + 12, 4, "the D pivot bar: riser only, the pickup is a cappella"],
    [START["chorus3"] + 7, 1, "the silent pen"],
    [START["outro"] + 8, 8, "voice and piano, then the boot chord"],
]
bass_events = []
for ch in CHORDS:
    sec = next(s for s in SECTIONS if s["startBeat"] <= ch["startBeat"] < s["startBeat"] + s["beats"])
    style = BASS_STYLE[sec["name"]]
    root = bass_root(ch["symbol"])
    if style == "none":
        continue
    if style == "long":
        bass_events.append([root, ch["startBeat"], ch["beats"]])
    else:
        b = ch["startBeat"]
        i = 0
        while b < ch["startBeat"] + ch["beats"]:
            n = root + (12 if (style == "octaveBounce" and i % 2) else 0)
            bass_events.append([n, b, .5])
            b += .5
            i += 1
# apply cuts
def cut(events, cuts):
    out = []
    for n, b, d in events:
        if any(c0 <= b < c0 + cd for c0, cd, _ in cuts):
            continue
        for c0, cd, _ in cuts:
            if b < c0 < b + d:
                d = c0 - b
        out.append([n, b, d])
    return out


bass_events = cut(bass_events, BASS_CUTS)

# --- drums on a 16th grid.  One string per instrument per pattern; "x" hits, "." rests.  A pattern
#     may be 1, 2 or 4 bars long and repeats through its section.  "mutes" cut everything.
def bars(*rows):
    return "".join(rows)


K4 = "x...x...x...x..."
S24 = "....x.......x..."
H8 = "x.x.x.x.x.x.x.x."
H16 = "x" * 16
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
    "prechorus": {  # four on the floor; snare 8ths in bar 3, 16ths in bar 4, everything stops on HAND
        "kick": bars(K4, K4, K4, "x...x..........."),
        "snare": bars(S24, S24, H8, "xxxxxx.........."),
        "hat": bars(H8, H8, H8, "x.x.x..........."),
    },
    "prechorus2": {
        "kick": bars(K4, K4, K4, "x...x..........."),
        "snare": bars(S24, S24, H8, "xxxxxx.........."),
        "hat": bars(H8, H8, H8, "x.x.x..........."),
        "tambourine": bars(H8, H8, H16, "xxxxxx.........."),
    },
    "chorus": {
        "kick": bars(K4, K4),
        "snare": bars(S24, S24),
        "clap": bars(S24, S24),
        "hat": bars(H8, H8),
        "openHat": bars("..............x.", "..............x."),
    },
    "chorus2": {
        "kick": bars(K4, K4),
        "snare": bars(S24, S24),
        "clap": bars(S24, S24),
        "hat": bars(H8, H8),
        "openHat": bars("..............x.", "..............x."),
        "tambourine": bars(H16, H16),
    },
    "post": {  # Ting Tings: cowbell and claps on every beat; bars 3-4 dry kick and claps under the la-la
        "kick": bars(K4, K4, K4, K4),
        "clap": bars(K4, K4, K4, K4),
        "cowbell": bars(K4, K4, E, E),
        "hat": bars(H8, H8, E, E),
    },
    "post2": {
        "kick": bars(K4, K4),
        "clap": bars(K4, K4),
        "cowbell": bars(K4, K4),
        "hat": bars(H8, H8),
    },
    "halftime": {  # bridge bars 7-8, building into the breakdown
        "kick": bars("x...............", "x.......x......."),
        "snare": bars("........x.......", "........x...xxxx"),
        "hat": bars(H8, H16),
    },
    "breakdown": {  # Down: finger snaps and a clap, lots of space; bar 1 silent
        "snap": bars(E, S24, S24, S24),
        "clap": bars(E, "............x...", "............x...", "............x..."),
    },
    "final": {
        "kick": bars(K4, K4),
        "snare": bars(S24, S24),
        "clap": bars(K4, K4),
        "hat": bars(H16, H16),
        "tambourine": bars(H16, H16),
        "openHat": bars("..............x.", "..............x."),
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
    "post1": "post", "verse2": "verse", "pre2": "prechorus2", "chorus2": "chorus2", "post2": "post2",
    "bridge": "bigbeat", "breakdown": "breakdown", "chorus3": "final", "outro": "outro", "tail": "none",
}
DRUM_OVERRIDES = [{"startBeat": START["bridge"] + 24, "beats": 8, "pattern": "halftime"}]
DRUM_MUTES = [
    [START["pre1"] + 13.5, 2.5, "stop-time on HAND: only a reverse cymbal"],
    [START["pre2"] + 13.5, 2.5, "stop-time on HAND"],
    [START["chorus3"] + 7, 1, "the silent pen: one keystroke, nothing else"],
]
DRUM_DUCKS = [  # [startBeat, beats]: the whole band drops 6 dB and dithers so the word FADE really fades
    [START["chorus1"] + 13, 1.5], [START["chorus2"] + 13, 1.5], [START["chorus3"] + 13, 1.5],
]
FILLS = [
    {"name": "reverseCymbal", "startBeat": 6, "beats": 2, "what": "reverse cymbal into the drop"},
    {"name": "snareRoll", "startBeat": 7, "beats": 1, "what": "snare roll into the drop"},
    {"name": "riser1", "startBeat": START["pre1"], "beats": 13.5, "what": "white-noise riser under the string pad"},
    {"name": "reverseCymbal2", "startBeat": START["pre1"] + 14, "beats": 2, "what": "into chorus 1"},
    {"name": "crash1", "startBeat": START["chorus1"], "beats": 1, "what": "crash + brass stab"},
    {"name": "stumble", "startBeat": START["verse2"] + 19.25, "beats": 1,
     "what": "on 'Too regular? Flag it.' the fill lands a 16th late: the band loosening up after the flag"},
    {"name": "keepIt", "startBeat": START["verse2"] + 30, "beats": .5, "what": "big clap + rimshot on 'Keep it.'"},
    {"name": "riser2", "startBeat": START["pre2"], "beats": 13.5, "what": "longer riser, tambourine added"},
    {"name": "reverseCymbal3", "startBeat": START["pre2"] + 14, "beats": 2, "what": "into chorus 2"},
    {"name": "crash2", "startBeat": START["chorus2"], "beats": 1, "what": "crash"},
    {"name": "bridgeRoll", "startBeat": START["bridge"] + 28, "beats": 4, "what": "snare roll + filter sweep into the breakdown"},
    {"name": "spinUp", "startBeat": START["breakdown"] + 12, "beats": 4, "what": "floppy-drive spin-up riser (sine sweep + comb grit) on the D pivot"},
    {"name": "reboot", "startBeat": START["chorus3"], "beats": 1, "what": "white flash: crash + the boot chord in A"},
    {"name": "keystroke", "startBeat": START["chorus3"] + 7, "beats": 1, "what": "one dry keyboard click: the writer types 'pen'"},
    {"name": "slamBack", "startBeat": START["chorus3"] + 8, "beats": 1, "what": "crash: the band returns on 'You say'"},
    {"name": "crash3", "startBeat": START["chorus3"] + 16, "beats": 1, "what": "crash on the second pen pal"},
    {"name": "saveClick", "startBeat": START["tail"] + 2.5, "beats": .5, "what": "one dry mouse click: Save"},
]

# --- keys, pads, stabs
brass_stabs, sax_stabs, glock_pen = [], [], []
for sec, t in (("chorus1", 0), ("chorus2", 0), ("chorus3", 2)):
    s = START[sec]
    for off, sym in ((0, "Cmaj7"), (7.5, "D"), (16, "Cmaj7"), (23.5, "D")):
        brass_stabs.append({"startBeat": s + off, "beats": .5, "notes": T(VOICING[sym][1:], t)})
    sax_stabs.append({"startBeat": s + 31.5, "beats": .5, "notes": [67 + t]})            # after "erase it"
    if sec == "chorus3":
        sax_stabs.append({"startBeat": s + 13, "beats": 1, "notes": [71 + t]})           # on FADE
for l in LINES:
    if l["voice"] == "lead" and l["section"].startswith("chorus"):
        for w in l["words"]:
            if w["w"].lower().startswith("pen") and w["notes"][0][0]:
                glock_pen.append([w["notes"][0][0] + 12, w["notes"][0][1], .5])

# the bridge beeps: a system beep on every year, pitched to the chant (an octave up), climbing
beeps = []
for l in LINES:
    if l["section"] == "bridge" and l["voice"] == "chant":
        for w in l["words"]:
            beeps.append([w["notes"][0][0] + 12, w["notes"][0][1], .25])

ERAS = [
    {"name": "1988 System 6", "startBeat": 0, "note": "1-bit; boot to pre-chorus 1"},
    {"name": "1991 System 7", "startBeat": START["chorus1"], "note": "colour floods in on the first chorus 'pen'"},
    {"name": "1999 Platinum", "startBeat": START["post1"], "note": "bevel buttons on the cowbell"},
    {"name": "2002 Aqua", "startBeat": START["verse2"], "note": "dithered pinstripes"},
    {"name": "2005 Tiger", "startBeat": START["pre2"], "note": "brushed metal"},
    {"name": "2009 Snow Leopard", "startBeat": START["chorus2"], "note": ""},
    {"name": "2011 Lion", "startBeat": START["chorus2"] + 16, "note": "from the second pen pal"},
    {"name": "2014 Yosemite", "startBeat": START["post2"], "note": ""},
]
YEARS = ["1988 System 6", "1991 System 7", "1995 NeXTSTEP", "1998 Drawing Board", "1999 Platinum", "2002 Aqua",
         "2005 Tiger", "2009 Snow Leopard", "2011 Lion", "2014 Yosemite", "2020 Big Sur", "2026 Liquid Glass"]
for i, y in enumerate(YEARS):
    ERAS.append({"name": y, "startBeat": START["bridge"] + 2 * i, "note": "bridge roll-call, one per half bar"})
ERAS += [
    {"name": "1988 System 6 (inverted)", "startBeat": START["bridge"] + 24, "note": "contact sheet, then white on black"},
    {"name": "2026 Liquid Glass", "startBeat": START["chorus3"], "note": "the reboot; dithered translucency"},
    {"name": "1988 System 6", "startBeat": START["outro"] + 8, "note": "One More Tune hands the appearance back"},
]

HITS = {
    "boot": 0, "teaserPen": 6, "drop": START["intro"], "verse1": START["verse1"],
    "melt": START["pre1"] + 4, "stop1": START["pre1"] + 13.5, "chorus1": START["chorus1"], "colour": START["chorus1"],
    "fade1": START["chorus1"] + 13, "erase1": START["chorus1"] + 30, "post1": START["post1"],
    "whoHoldsThePen1": START["post1"], "lala": START["post1"] + 8, "verse2": START["verse2"],
    "stumble": START["verse2"] + 19.25, "keepIt": START["verse2"] + 30, "stop2": START["pre2"] + 13.5,
    "chorus2": START["chorus2"], "fade2": START["chorus2"] + 13, "erase2": START["chorus2"] + 30,
    "whoHoldsThePen2": START["post2"], "bridge": START["bridge"], "contactSheet": START["bridge"] + 24,
    "collapse": START["bridge"] + 28, "breakdown": START["breakdown"], "twoFloppies": START["breakdown"] + .5,
    "pivot": START["breakdown"] + 12, "reboot": START["chorus3"], "keyChange": START["chorus3"],
    "silentPen": START["chorus3"] + 7, "keystroke": START["chorus3"] + 7, "slamBack": START["chorus3"] + 8,
    "fade3": START["chorus3"] + 13, "erase3": START["chorus3"] + 30, "outro": START["outro"],
    "exportCD": START["outro"] + 6, "bootChordOut": START["outro"] + 12, "saveDialog": START["outro"] + 14,
    "saveClick": START["tail"] + 2.5, "end": DURATION_BEATS,
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
        "chant": "amy, pitch tier flattened to the written note (G3 = her speaking pitch), no vibrato; durations quantised to the 8th grid; only the vowel nucleus is stretched (duration tier holds onsets/codas at 1.0); doubled an octave down by lessac at -9 dB; 1988 sections add an 8-bit 11 kHz crush; the last word of every list line steps down to D3",
        "lead": "amy singing; gentle vibrato (5.5 Hz, +/-20 cents) on notes of 1 beat or longer; 60 ms portamento only where notes are slurred inside a word",
        "choir": "amy + en_GB-jenny_dioco + lessac (an octave down), each offset +/-15 ms and detuned +/-8 cents; the final chorus doubles every voice (6 takes) and adds a 12-copy gang on the echoes, one copy per appearance",
        "spoken": "lessac, raw Piper, no PSOLA; k1 is low-passed to 4 kHz with an 8-bit crush (a sample from a 1988 Mac); o3 is dry and flat, the full-disk-warning voice",
        "melt": {
            "pre1a / pre2a": "flat chant on G3, octave double, crush",
            "pre1b / pre2b": "chant with an 80 ms glide between notes (the robot learns portamento); crush lifts",
            "pre1c / pre2c": "lead: vibrato arrives, octave double removed",
            "pre1d / pre2d": "full lead, ending on D5 HAND; everything else stops",
        },
        "gags": {
            "fade (chorus d lines)": "level fade and pitch glide B4 -> G4 while the bit depth drops over the 1.5 beats: the word is literally temporary",
            "erase (chorus h lines)": "a reverse-reverb swell before 'erase'; the 'it' is bone dry",
            "chorus3b 'pen' (silent=true)": "the lead does not sing the word; one beat of silence and a single keystroke; the band slams back on 'You say'",
            "v2c 'Too regular? Flag it.'": "the chant is perfectly regular on purpose, so Review Desk flags the singer; the band answers with the one-beat stumble (fills.stumble)",
            "chorus3g 'Your roughness is you'": "+/-10 cent detune and 20 ms unquantised onsets on the lead: the machine tries roughness for one line",
            "bridge years": "chant stacked in octaves, panned; a system beep on every year (parts.beeps)",
            "o2 'voice'": "the long A4 freezes into a two-cycle grain loop for its last half beat, then the boot chord takes over",
        },
        "qa": "faster_whisper small.en must transcribe every line word for word; if a line fails, lengthen its slowest word or move its echo",
    },
    "bootChord": {"symbol": "Gmaj9", "notes": VOICING["Gmaj9(boot)"], "startBeat": 0, "beats": 8,
                  "timbre": "saw pad + FM bell, sharp attack, low-pass opening slowly over 4 beats, then ringing; ours, not Apple's"},
    "rebootChord": {"symbol": "Dmaj9", "notes": VOICING["Dmaj9(reboot)"], "startBeat": START["chorus3"], "beats": 4,
                    "timbre": "the boot chord voiced in A, with a crash: the reboot into Liquid Glass"},
    "outroChord": {"symbol": "Amaj9", "notes": VOICING["Amaj9(boot)"], "startBeat": START["outro"] + 12, "beats": 8,
                   "timbre": "the boot chord in A, ringing to the end; the 9th never resolves"},
    "riff": {
        "name": "The Floppy Organ",
        "timbre": "percussive combo organ (FluidR3 GM 17) doubled by a numpy 25%-duty pulse; each attack gets a 6 ms downward pitch blip and a very quiet floppy-stepper click (band-passed noise 2-3 kHz, 8 ms); 8-bit 11 kHz sample-and-hold crush in 1988 sections, lifting as the eras advance, fully clean in Liquid Glass",
        "loopBeats": 8,
        "loop": [[n, b, d] for n, b, d in RIFF_LOOP],
        "loopNames": [nm(n) for n, _, _ in RIFF_LOOP],
        "plays": [{"startBeat": s, "repeats": r, "transpose": t, "note": note} for s, r, t, note in RIFF_PLAYS],
        "events": riff_events,
        "headFills": riff_head_fills,
        "headFillsNote": "the 3-note head (G B D) as a pickup fill into chorus bars 5 and into the next section; glockenspiel (GM 10) doubles it an octave up in the final chorus",
        "glockDouble": {"sections": ["chorus3"], "transpose": 12, "what": "glockenspiel doubles the head fills and plays the loop on top of the outro"},
    },
    "bass": {
        "styles": {
            "pulse8": "big-beat bass: two detuned saws, root 8ths, sidechain pump from the kick",
            "octaveBounce": "round finger bass (GM 34) alternating root / octave on 8ths, after Feel It Still",
            "long": "sustained roots (pre-chorus: under the string pad; breakdown: a soft sine sub)",
        },
        "sections": BASS_STYLE,
        "cuts": BASS_CUTS,
        "events": bass_events,
    },
    "drums": {
        "grid": 16,
        "gridNote": "16 characters per bar, one per 16th; a pattern of 1/2/4 bars repeats through its section",
        "kit": {
            "kick": "55 Hz sine + click (big-beat) / tighter 808 in the choruses",
            "snare": "noise + 180 Hz body, crunchy", "ghostSnare": "the same at -18 dB",
            "clap": "layered noise bursts, three copies 8 ms apart", "hat": "closed, 6 kHz noise, 40 ms",
            "openHat": "120 ms", "cowbell": "two square partials 560/845 Hz", "tambourine": "jangly noise 16ths",
            "snap": "finger snap: short 2 kHz click", "crash": "long noise, 2 s decay",
        },
        "patterns": DRUM_PATTERNS,
        "sections": DRUM_SECTIONS,
        "overrides": DRUM_OVERRIDES,
        "mutes": DRUM_MUTES,
        "ducks": DRUM_DUCKS,
        "fills": FILLS,
    },
    "keys": {
        "sections": {
            "boot": "the boot chord only",
            "intro": "organ riff only, no pads; dry",
            "verse1": "organ riff; a filtered UI blip (sine ping, 30 ms) on every chant verb (use the chant word starts)",
            "pre1": "string pad (GM 49) sustaining each chord voicing, rising with the riser; the riff drops out",
            "chorus1": "bouncy offbeat piano 8ths (GM 1) on the chord voicings; soft saw pad; brass stabs (GM 62) listed in stabs.brass; glockenspiel ping on every 'pen' (stabs.glockPen); one tenor sax (GM 66) stab after 'erase it'",
            "post1": "organ riff bars 1-2; bars 3-4 the choir sings the riff over a vinyl-crackle bed (One More Tune's record)",
            "verse2": "as verse 1 plus a second organ an octave down",
            "pre2": "as pre-chorus 1, tambourine added",
            "chorus2": "as chorus 1, bass doubled, tambourine 16ths, choir harmony a third below on bars 5-8",
            "post2": "organ riff, cowbell and claps on every beat",
            "bridge": "the loop follows the bridge chords; a system beep per year (parts.beeps) climbing like an arpeggio; bars 7-8 a filter-swept pad, half-time drums building",
            "breakdown": "bar 1: a G pedal (sine) and the spoken sample only; bars 2-4: felt piano (GM 1, soft) on the voicings, snaps and claps, lots of space; bar 4 the floppy spin-up riser on D, the pickup a cappella",
            "chorus3": "the reboot chord with a crash, then everything in A: piano, pad, brass, glock doubling the riff head, 12-copy gang on the echoes; bar 2 beat 4 is one beat of silence (the keystroke); sax stab on FADE and after 'erase it'",
            "outro": "bars 1-2 riff and loop in A under the chant; bar 3 piano and claps under the lead alone; bar 4 the Amaj9 boot chord rings and the spoken line sits over it",
            "tail": "the boot chord decaying; one mouse click at saveClick; silence for the end card",
        },
        "voicings": "take each chord's 'notes' from the chords list: bass note first, then a close voicing around C4",
    },
    "stabs": {"brass": brass_stabs, "sax": sax_stabs, "glockPen": glock_pen},
    "beeps": beeps,
    "counterChant": {
        "what": "optional: 'Save it. Clip it. Insert it. Export it.' chanted on A3 at -12 dB under final-chorus bars 3-4 and 7-8; not a captioned line",
        "notes": [[57, START["chorus3"] + 8 + k * 2, .5] for k in range(4)] + [[57, START["chorus3"] + 24 + k * 2, .5] for k in range(4)],
    },
    "sfx": {
        "saveClick": START["tail"] + 2.5,
        "keystroke": START["chorus3"] + 7,
        "floppyClunks": [START["breakdown"] + .5, START["breakdown"] + 1],
        "uiBlips": "one 30 ms sine ping on every chant word that starts on an integer beat (verses, intro)",
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
        json.dump(SCORE, f, indent=1)
    print("wrote %s: %d beats = %.1f s, %d sections, %d chords, %d lines" % (
        out, DURATION_BEATS, DURATION_BEATS * 60 / BPM, len(SECTIONS), len(CHORDS), len(LINES)))
