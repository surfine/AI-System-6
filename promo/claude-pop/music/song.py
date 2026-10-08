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

Revision 2 (after the producer and prosody reviews): see SONG.md "Revision".
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
    "post1": [("G", 4), ("C", 4)] + LOOP,
    "verse2": LOOP * 4,
    "pre2": PRE,
    "chorus2": CHORUS_G,
    "post2": [("G", 4), ("C", 4)],
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


# The hook.  Pickup D4 G4 A4, then the leap to D5 on PEN (the 9th over Cmaj9, the song's top note in
# G) and the maj7 B4 on PAL: the hook starts at the top and never resolves.
HOOK = "I'm=D4=.5 just=G4=.5 your=A4=.5 pen=D5=1 pal,=B4=1.5"

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


prechorus("pre1",
          ("I can fetch. I can file.", "I=G3=.5 can=G3=.5 fetch.=G3=1 I=G3=.5 can=G3=.5 file.=G3=1"),
          ("I can hum for a while.", "I=G3=.5 can=A3=.5 hum=B3=1 for=B3=.5 a=C4=.5 while.=D4=1"))

# CHORUS.  t = transposition (0 in G, +2 in A).  "harmony" adds the choir a third below on bars 5-8.
def chorus(sec, t=0, harmony=False, silent_pen=False, gang=False):
    line(sec + "a", sec, "lead", "I'm just your pen pal,", -1.5, HOOK, t)
    line(sec + "a_echo", sec, "choir", "(pen pal)", 2.5, "(pen=G4=.5 pal)=E4=.5", t, role="echo")
    pen = "pen.=x=1" if silent_pen else "pen.=D4=1"
    line(sec + "b", sec, "lead", "I'll never hold the pen.", 3.5,                 # HOLD on the backbeat clap
         "I'll=G4=.5 nev|er=A4,B4=.5,.5 hold=A4=1.5 the=F#4=.5 " + pen, t)
    line(sec + "c", sec, "lead", "You say where the words land,", 8,
         "You=G4=.5 say=B4=1 where=A4=.5 the=G4=.5 words=B4=.5 land,=D5=1", t)
    line(sec + "d", sec, "lead", "or they fade.", 12, "or=B4=.5 they=A4=.5 fade.=B4=1", t)   # then half a beat of nothing
    line(sec + "e", sec, "lead", "I'm just your pen pal,", 14.5, HOOK, t)
    line(sec + "e_echo", sec, "choir", "(pen pal)", 18.5, "(pen=G4=.5 pal)=E4=.5", t, role="echo")
    line(sec + "f", sec, "lead", "I sing it, you say it.", 19.5,
         "I=F#4=.5 sing=A4=1 it,=B4=.5 you=A4=.5 say=F#4=1 it.=D4=.5", t)
    line(sec + "g", sec, "lead", "Your roughness is you,", 23.5,                  # ROUGH on the downbeat
         "Your=G4=.5 rough|ness=B4,A4=1,.5 is=G4=.5 you,=C5=2", t)
    line(sec + "h", sec, "lead", "don't let me smooth it.", 28,                  # SMOOTH, not erase: README's word
         "don't=C5=1 let=B4=.5 me=G4=.5 smooth=A4=1 it.=F#4=.5", t)              # F#4 resolves up to "Who" = G4
    if harmony:  # the AI's choir is made only of itself: a third below the lead
        line(sec + "f_h", sec, "choir", "I sing it, you say it.", 19.5,
             "I=D4=.5 sing=F#4=1 it,=G4=.5 you=F#4=.5 say=D4=1 it.=B3=.5", t, role="harmony")
        line(sec + "g_h", sec, "choir", "Your roughness is you,", 23.5,
             "Your=E4=.5 rough|ness=G4,F#4=1,.5 is=E4=.5 you,=A4=2", t, role="harmony")
        line(sec + "h_h", sec, "choir", "don't let me smooth it.", 28,
             "don't=A4=1 let=G4=.5 me=E4=.5 smooth=F#4=1 it.=D4=.5", t, role="harmony")


chorus("chorus1")

# POST-CHORUS 1: the playground call and response, then the choir sings the riff on "la".
CALL = "Who=G4=1 holds=G4=.5 the=F4=.5 pen?=D4=1.5"            # falls; the F natural sticks its tongue out
ANSWER = "You=C5=1 do!=A4=1 You=E5=1 do!=C5=1"                 # the falling-third taunt, twice, the second a third up
line("q1", "post1", "choir", "Who holds the pen?", 0, CALL, role="call")
line("q2", "post1", "lead", "You do! You do!", 4, ANSWER)
LALA_G = ("La=G4=.5 la=G4=.5 la,=B4=.5 la=D5=1 la=C5=.5 la=B4=.5 la.=G4=.5",      # = riff bar 1
          "La=A4=.5 la=C5=.5 la,=A4=.5 la=F4=.5 la=E4=.5 la=G4=.5 la.=C5=1")      # = riff bar 2
line("q3", "post1", "choir", "La la la, la la la la.", 8, LALA_G[0], role="lala")
line("q4", "post1", "choir", "La la la, la la la la.", 12, LALA_G[1], role="lala")

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

prechorus("pre2",
          ("I can check. I can flag.", "I=G3=.5 can=G3=.5 check.=G3=1 I=G3=.5 can=G3=.5 flag.=G3=1"),
          ("I can point at the drift.", "I=G3=.5 can=A3=.5 point=B3=1 at=B3=.5 the=C4=.5 drift.=D4=1"))

chorus("chorus2", harmony=True)

# POST-CHORUS 2: the question again, two bars, straight into the appearances.
line("q5", "post2", "choir", "Who holds the pen?", 0, CALL, role="call")
line("q6", "post2", "lead", "You do! You do!", 4, ANSWER)

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
            ev = [ev[0], b, d]
        out.append(ev)
    return out


# ----------------------------------------------------------------------------------------------
# parts: everything the producer needs
# ----------------------------------------------------------------------------------------------
# --- the Floppy Organ riff: a two-bar phrase in G Mixolydian, whistleable as
#     "da da da DAAA da da da / da da da da da da DAAA"
RIFF_LOOP = [(67, 0, .5), (67, .5, .5), (71, 1, .5), (74, 1.5, 1), (72, 2.5, .5), (71, 3, .5), (67, 3.5, .5),
             (69, 4, .5), (72, 4.5, .5), (69, 5, .5), (65, 5.5, .5), (64, 6, .5), (67, 6.5, .5), (72, 7, 1)]
RIFF_TURN = RIFF_LOOP[:-1] + [(74, 7, 1)]      # the turnaround: the last loop of a verse ends on D5, pointing up
RIFF_PLAYS = [  # (startBeat, repeats, transpose, turnaround on the last repeat, note)
    (START["intro"], 2, 0, False, "full loop, 8-bit 11 kHz crush (1988)"),
    (START["verse1"] + 16, 2, 0, True, "bars 1-4 tacet (bass, drums and chant only); the riff returns at 'Clip the proof' and turns around into the melt"),
    (START["post1"], 1, -12, False, "an octave down under the call and answer so the voices sit on top; the choir then sings it on la (organ tacet)"),
    (START["verse2"], 4, 0, True, "full loop, second organ an octave down; turnaround into pre-chorus 2"),
    (START["post2"], 1, -12, False, "an octave down under the question and the answer"),
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
# the flourish: three 16ths an octave and more above the lead, after "smooth it", into the next section
FLOURISH = [(79, 0, .25), (83, .25, .25), (86, .5, .25)]   # G5 B5 D6
riff_flourish = []
for sec, t in (("chorus1", 0), ("chorus2", 0), ("chorus3", 2)):
    for n, b, d in FLOURISH:
        riff_flourish.append([n + t, START[sec] + 31.25 + b, d])

# --- bass
def bass_root(sym):
    pc = VOICING[sym][0] % 12
    return pc + 36 if pc + 36 <= 47 else pc + 24   # C2..B2


BASS_STYLE = {
    "boot": "none", "intro": "pulse8", "verse1": "pulse8", "pre1": "long", "chorus1": "strut",
    "post1": "pulse8", "verse2": "pulse8", "pre2": "long", "chorus2": "strut", "post2": "pulse8",
    "bridge": "pulse8", "breakdown": "long", "chorus3": "strut", "outro": "pulse8", "tail": "none",
}
BASS_CUTS = [  # [startBeat, beats, why]: the bass stops here
    [START["pre1"] + 14, 2, "stop-time after the HAND hit: air, then the a cappella pickup"],
    [START["pre2"] + 14, 2, "stop-time after the HAND hit"],
    [START["verse2"] + 19, 1, "the stumble"],
    [START["breakdown"], 4, "bar 1 of the breakdown: only the G pedal and the spoken sample"],
    [START["outro"] + 8, 8, "voice and piano, then the boot chord"],
] + SILENT
bass_events = []
for i, ch in enumerate(CHORDS):
    sec = next(s for s in SECTIONS if s["startBeat"] <= ch["startBeat"] < s["startBeat"] + s["beats"])
    style = BASS_STYLE[sec["name"]]
    root = bass_root(ch["symbol"])
    b0, L = ch["startBeat"], ch["beats"]
    if style == "none":
        continue
    if style == "long":
        bass_events.append([root, b0, L])
    elif style == "strut":
        # Feel It Still: one figure per chord, a chromatic approach note into the next root.
        nxt = bass_root(CHORDS[i + 1]["symbol"]) if i + 1 < len(CHORDS) else root
        appr = nxt - 1 if nxt - 1 >= 36 else nxt + 11
        head = (b0 - sec["startBeat"]) in (0, 16)   # bars 1 and 5: rest under PEN so the glock ping speaks
        if L >= 4:
            fig = ([[root, .5, .5]] if head else [[root, 0, .75], [root, .75, .25]]) + \
                  [[root + 12, 1.5, .5], [root, 2.5, .5], [root + 7, 3, .5], [appr, 3.5, .5]]
        else:
            fig = [[root, 0, .75], [root, .75, .25], [root + 12, 1, .5], [appr, 1.5, .5]]
        bass_events += [[n, b0 + b, d] for n, b, d in fig]
    else:
        b = b0
        while b < b0 + L:
            bass_events.append([root, b, .5])
            b += .5
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
    "verse2": {  # as verse, plus a clap on every gang "Flag" (verse2 + 18, 22, 26 = bar 5 beat 3, bar 6 beat 3, bar 7 beat 3)
        "kick": bars("x......x..x.....", "x......x..x.....", "x......x..x.....", "x......x..x.....",
                     "x......x..x.....", "x......x..x.....", "x......x..x.....", "x......x..x....."),
        "snare": bars(S24, S24, S24, S24, S24, S24, S24, S24),
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
    "chorus": {  # 16th hats: the chorus is denser than the bar before it
        "kick": bars(K4, K4),
        "snare": bars(S24, S24),
        "clap": bars(S24, S24),
        "hat": bars(H16, H16),
        "openHat": bars("..............x.", "..............x."),
    },
    "chorus2": {
        "kick": bars(K4, K4),
        "snare": bars(S24, S24),
        "clap": bars(S24, S24),
        "hat": bars(H16, H16),
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
    "post1": "post", "verse2": "verse2", "pre2": "prechorus2", "chorus2": "chorus2", "post2": "post2",
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
     "what": "unison band hit on HAND: kick, choked crash, brass [54,57,62] (stabs.brass), bass D2 for an 8th; then air"},
    {"name": "reverseCymbal2", "startBeat": START["pre1"] + 14, "beats": 2, "what": "into chorus 1, alone under the pickup"},
    {"name": "crash1", "startBeat": START["chorus1"], "beats": 1, "what": "crash + brass stab"},
    {"name": "stumble", "startBeat": START["verse2"] + 19.25, "beats": .75,
     "what": "on 'Too regular?' / 'Flag it.' the groove drops for a beat (drums.mutes, bass.cuts, riff cut at +19) and the "
             "fill lands a 16th late: snare + floor tom 16ths at +19.25, +19.5, +19.75, the first with a flam; the full "
             "groove returns on +20 ('-ner-' of Generic)"},
    {"name": "keepIt", "startBeat": START["verse2"] + 30, "beats": .5, "what": "big clap + rimshot on the sung 'Keep it.'"},
    {"name": "riser2", "startBeat": START["pre2"], "beats": 13.5, "what": "longer riser, tambourine added"},
    {"name": "stopHit2", "startBeat": START["pre2"] + 13.5, "beats": .5, "what": "unison band hit on HAND, then air"},
    {"name": "reverseCymbal3", "startBeat": START["pre2"] + 14, "beats": 2, "what": "into chorus 2"},
    {"name": "crash2", "startBeat": START["chorus2"], "beats": 1, "what": "crash"},
    {"name": "subDrop", "startBeat": START["bridge"] + 16, "beats": 2, "what": "one 808 sub drop on the downbeat of bar 5 (Em, the second half of the ladder)"},
    {"name": "bridgeRoll", "startBeat": START["bridge"] + 28, "beats": 4, "what": "snare roll + filter sweep into the breakdown"},
    {"name": "spinUp", "startBeat": START["breakdown"] + 12, "beats": 4,
     "what": "floppy-drive spin-up riser (sine sweep + comb grit) over the held E2 sub on E7sus4; no drums; the pickup is a cappella"},
    {"name": "reverseCymbal4", "startBeat": START["breakdown"] + 14, "beats": 2, "what": "into the reboot"},
    {"name": "reboot", "startBeat": START["chorus3"], "beats": 1, "what": "white flash: crash + the boot chord in A"},
    {"name": "keystroke", "startBeat": START["chorus3"] + 7.25, "beats": .25, "what": "one dry keyboard click inside the silence: the writer types 'pen'"},
    {"name": "slamBack", "startBeat": START["chorus3"] + 8, "beats": 1, "what": "crash + brass stab: the band returns on 'You say'"},
    {"name": "crash3", "startBeat": START["chorus3"] + 16, "beats": 1, "what": "crash on the second pen pal"},
    {"name": "saveClick", "startBeat": START["tail"] + 2.5, "beats": .5, "what": "one dry mouse click: Save"},
]

# --- keys, pads, stabs
brass_stabs, sax_stabs, glock_pen = [], [], []
for sec, t in (("chorus1", 0), ("chorus2", 0), ("chorus3", 2)):
    s = START[sec]
    for off, sym in ((0, "Cmaj9"), (7.5, "D"), (16, "Cmaj9"), (23.5, "D")):
        if sec == "chorus3" and off == 7.5:
            off = 8.0          # never inside the silence: it doubles the slam-back crash on "You" instead
        brass_stabs.append({"startBeat": s + off, "beats": .5, "notes": T(VOICING[sym][1:], t)})
    sax_stabs.append({"startBeat": s + 31.5, "beats": .5, "notes": [67 + t]})            # after "smooth it"
    if sec == "chorus3":
        sax_stabs.append({"startBeat": s + 13, "beats": 1, "notes": [71 + t]})           # on FADE
for pre in ("pre1", "pre2"):   # the HAND hit
    brass_stabs.append({"startBeat": START[pre] + 13.5, "beats": .5, "notes": [54, 57, 62]})
brass_stabs.sort(key=lambda x: x["startBeat"])
for l in LINES:
    if l["voice"] == "lead" and l["section"].startswith("chorus"):
        for w in l["words"]:
            if w["w"].lower().startswith("pen") and w["notes"][0][0]:
                glock_pen.append([w["notes"][0][0] + 12, w["notes"][0][1], .5])
brass_stabs, sax_stabs, glock_pen = cut(brass_stabs, SILENT), cut(sax_stabs, SILENT), cut(glock_pen, SILENT)
riff_flourish = cut(riff_flourish, SILENT)

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
    ERAS.append({"name": y, "startBeat": START["bridge"] + 2 * i, "note": "bridge roll-call, one appearance per half bar; the four-digit year is the caption"})
ERAS += [
    {"name": "1988 System 6 (inverted)", "startBeat": START["bridge"] + 24, "note": "contact sheet, then white on black"},
    {"name": "2026 Liquid Glass", "startBeat": START["chorus3"], "note": "the reboot; dithered translucency"},
    {"name": "1988 System 6", "startBeat": START["outro"] + 8, "note": "One More Tune hands the appearance back"},
]

HITS = {
    "boot": 0, "teaserPen": 6, "drop": START["intro"], "verse1": START["verse1"], "riffReturns": START["verse1"] + 16,
    "melt": START["pre1"] + 4, "stop1": START["pre1"] + 13.5, "air1": START["pre1"] + 14,
    "chorus1": START["chorus1"], "colour": START["chorus1"],
    "fade1": START["chorus1"] + 13, "smooth1": START["chorus1"] + 30, "post1": START["post1"],
    "whoHoldsThePen1": START["post1"], "youDo1": START["post1"] + 4, "lala": START["post1"] + 8, "verse2": START["verse2"],
    "flagIt1": START["verse2"] + 18, "stumble": START["verse2"] + 19.25, "flagIt2": START["verse2"] + 22,
    "flagIt3": START["verse2"] + 26, "keepIt": START["verse2"] + 30,
    "stop2": START["pre2"] + 13.5, "air2": START["pre2"] + 14,
    "chorus2": START["chorus2"], "fade2": START["chorus2"] + 13, "smooth2": START["chorus2"] + 30,
    "whoHoldsThePen2": START["post2"], "youDo2": START["post2"] + 4, "bridge": START["bridge"],
    "subDrop": START["bridge"] + 16, "contactSheet": START["bridge"] + 24,
    "collapse": START["bridge"] + 28, "breakdown": START["breakdown"], "twoFloppies": START["breakdown"] + .5,
    "pivot": START["breakdown"] + 12, "reboot": START["chorus3"], "keyChange": START["chorus3"],
    "bandOut": START["chorus3"] + 6.5, "silentPen": START["chorus3"] + 7, "keystroke": START["chorus3"] + 7.25,
    "slamBack": START["chorus3"] + 8,
    "fade3": START["chorus3"] + 13, "smooth3": START["chorus3"] + 30, "outro": START["outro"],
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
        "chant": "amy, pitch tier flattened to the written note (G3 = her speaking pitch; B3 in verse 1 bars 5-8), no vibrato; "
                 "durations quantised to the 8th grid; only the vowel nucleus is stretched (duration tier holds onsets/codas at 1.0); "
                 "doubled an octave down by lessac at -9 dB; 1988 sections add an 8-bit 11 kHz crush; the last word of every list "
                 "line steps down (to D3 from G3, to G3 from B3); questions stay flat: the robot does not know how to ask",
        "lead": "amy singing; gentle vibrato (5.5 Hz, +/-20 cents) on notes of 1 beat or longer; 60 ms portamento only where notes are slurred inside a word",
        "choir": "amy + en_GB-jenny_dioco + lessac (an octave down), each offset +/-15 ms and detuned +/-8 cents; the final chorus doubles every voice (6 takes) and adds a 12-copy gang on the echoes, one copy per appearance",
        "gang": "role 'call' lines in the verses ('(Keep it.)', 'Flag it.'): the choir shouted, 12 copies, hard-panned, -3 dB under the chant, a clap on every 'Flag'",
        "spoken": "lessac, raw Piper, no PSOLA; k1 is low-passed to 4 kHz with an 8-bit crush (a sample from a 1988 Mac); o3 is dry and flat, the full-disk-warning voice",
        "melt": {
            "pre1a / pre2a": "flat chant on G3, octave double, crush",
            "pre1b / pre2b": "chant with an 80 ms glide between notes (the robot learns portamento); crush lifts",
            "pre1c / pre2c": "lead: vibrato arrives, octave double removed",
            "pre1d / pre2d": "full lead, hanging on A4 HAND (the 5th of D, a question); the band hits with it and stops; half a beat of air",
        },
        "gags": {
            "fade (chorus d lines)": "level fade and pitch glide B4 -> G4 while the bit depth drops over the beat, into half a beat of real silence: the word is literally temporary",
            "smooth (chorus h lines)": "a low-pass sweep closes over 'smooth' (the voice's own consonants are smoothed off, 8 kHz -> 1.5 kHz over the beat); the 'it' is bone dry and full-band again",
            "chorus3b 'pen' (silent=true)": "the band drops at +6.5 after 'hold', the lead sings 'the' alone, then the word is not sung: silence from +7, one keystroke at +7.25, the crash and brass slam back on 'You' at +8",
            "v2c 'Too regular?' / 'Flag it.'": "the chant is perfectly regular on purpose, so Review Desk flags the singer; the band answers with the one-beat stumble (fills.stumble)",
            "chorus3g 'Your roughness is you'": "+/-10 cent detune and 20 ms unquantised onsets on the lead: the machine tries roughness for one line",
            "bridge years": "chant stacked in octaves, panned; a system beep on every year (parts.beeps)",
            "o2 'voice'": "the long A4 (outro +11 .. +14) freezes into a two-cycle grain loop for its last half beat (+13.5 .. +14), then the boot chord takes over",
        },
        "qa": "faster_whisper small.en must transcribe every line word for word, except the 'lala' lines (judge those by pitch contour; "
              "'la la la la la la la' passes) and the stacked '(pen pal)' echoes (word-level check only). Lines to check alone first: "
              "chorus3h (E5 'don't'), chorus3a/e (E5 'pen'), v2a ('is an app'). If a line fails, lengthen its slowest word or move its echo",
    },
    "silence": SILENT,
    "bootChord": {"symbol": "Gmaj9", "notes": VOICING["Gmaj9(boot)"], "startBeat": 0, "beats": 8,
                  "timbre": "saw pad + FM bell on the lower four notes, sharp attack, low-pass opening slowly over 4 beats, then ringing; "
                            "the top D5 is pad only (no sine 'ding', so it cannot read as a chime); ours, not Apple's"},
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
        "turnaround": [[n, b, d] for n, b, d in RIFF_TURN],
        "plays": [{"startBeat": s, "repeats": r, "transpose": t, "turnaround": turn, "note": note} for s, r, t, turn, note in RIFF_PLAYS],
        "events": riff_events,
        "cuts": RIFF_CUTS,
        "flourish": riff_flourish,
        "flourishNote": "three 16ths (G5 B5 D6; A5 C#6 E6 in A) at chorus +31.25/+31.5/+31.75, an octave and more above the lead, after 'smooth it' and into the next section; organ, doubled by glockenspiel (GM 10)",
        "glockDouble": {"sections": ["chorus1", "chorus2", "chorus3"], "transpose": 0, "what": "glockenspiel doubles the flourish in every chorus and plays the loop on top of the outro"},
    },
    "bass": {
        "styles": {
            "pulse8": "big-beat bass: two detuned saws, root 8ths, sidechain pump from the kick",
            "strut": "round finger bass (GM 34), after Feel It Still: per 4-beat chord R[0,.75] R[.75,.25] 8va[1.5,.5] R[2.5,.5] 5th[3,.5] chromatic approach to the next root[3.5,.5]; in bars 1 and 5 the figure starts at +.5 so the glock ping on PEN speaks",
            "long": "sustained roots (pre-chorus: under the string pad; breakdown: a soft sine sub, the E2 held through the spin-up riser)",
        },
        "sections": BASS_STYLE,
        "cuts": BASS_CUTS,
        "events": bass_events,
    },
    "drums": {
        "grid": 16,
        "gridNote": "16 characters per bar, one per 16th; a pattern of 1/2/4/8 bars repeats through its section",
        "kit": {
            "kick": "55 Hz sine + click (big-beat) / tighter 808 in the choruses",
            "snare": "noise + 180 Hz body, crunchy", "ghostSnare": "the same at -18 dB",
            "clap": "layered noise bursts, three copies 8 ms apart", "hat": "closed, 6 kHz noise, 40 ms",
            "openHat": "120 ms", "cowbell": "two square partials 560/845 Hz", "tambourine": "jangly noise 16ths",
            "snap": "finger snap: short 2 kHz click", "crash": "long noise, 2 s decay", "floorTom": "90 Hz sine drop, 250 ms (fills.stumble only)",
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
            "verse1": "bars 1-4: no riff (bass, drums, chant and the UI blips only); bars 5-8 the riff returns and turns around on D5; a filtered UI blip (sine ping, 30 ms) on every chant verb (use the chant word starts)",
            "pre1": "string pad (GM 49) sustaining each chord voicing, rising with the riser; the riff drops out; the whole band hits HAND at +13.5 and stops at +14",
            "chorus1": "bouncy offbeat piano 8ths (GM 1) on the chord voicings (Cmaj9 with the D on top); soft saw pad; brass stabs (GM 62) listed in stabs.brass; glockenspiel ping on every 'pen' (stabs.glockPen); one tenor sax (GM 66) stab after 'smooth it'; the flourish into the post-chorus",
            "post1": "organ riff an octave down in bars 1-2; bars 3-4 the choir sings the riff over a vinyl-crackle bed (One More Tune's record)",
            "verse2": "as verse 1 plus a second organ an octave down; the groove drops for the stumble at +19",
            "pre2": "as pre-chorus 1, tambourine added",
            "chorus2": "as chorus 1, bass doubled, tambourine 16ths, choir harmony a third below on bars 5-8",
            "post2": "organ riff an octave down, cowbell and claps on every beat",
            "bridge": "organ chord stabs on the big-beat kick rhythm (keys.bridgeComp: 16th indices 0, 7, 10 of each bar, bars 1-6); no hats, the twelve beeps (parts.beeps) are the hi-hat; sub drop on bar 5; bars 7-8 a filter-swept pad, half-time drums building",
            "breakdown": "bar 1: a G pedal (sine) and the spoken sample only; bars 2-3: felt piano (GM 1, soft) on the voicings, snaps and claps, lots of space; bar 4: E7sus4 held by the pad over an E2 sine sub while the floppy spin-up riser climbs; no drums; the pickup 'I'm just your' (E4 A4 B4) is a cappella",
            "chorus3": "the reboot chord with a crash, then everything in A: piano, pad, brass, glock, 12-copy gang on the echoes; +6.5 to +8 is the silence window (parts.silence): every part out, one keystroke at +7.25, crash and brass on +8; sax stab on FADE and after 'smooth it'",
            "outro": "bars 1-2 riff and loop in A under the chant, the choir's la-la on top, the glock on the loop; bar 3 piano and claps under the lead alone (Dmaj9, then E7sus4 suspending under the held 'voice'); bar 4 the Amaj9 boot chord resolves under the voice and rings, the spoken line sits over it",
            "tail": "the boot chord decaying; one mouse click at saveClick; silence for the end card",
        },
        "bridgeComp": bridge_comp,
        "voicings": "take each chord's 'notes' from the chords list: bass note first, then a close voicing around C4",
    },
    "stabs": {"brass": brass_stabs, "sax": sax_stabs, "glockPen": glock_pen},
    "beeps": beeps,
    "sfx": {
        "saveClick": START["tail"] + 2.5,
        "keystroke": START["chorus3"] + 7.25,
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
