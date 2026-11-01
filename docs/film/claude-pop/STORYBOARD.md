# Pen Pal: the storyboard (revision 2)

One take, 154.0 s of song plus a 3.0 s held tail, 640x360, drawn by twelve chapter files. BRIEF.md is the
contract, VISION.md the taste, SONG.md the song, TOOLKIT.md the tools. This file is the shot list and the seams.
Every time below comes from `data/data.js` (quoted here so you can check your eyes; never retype one into code).

## 0. How to read this

- §1 the idea, cast, the signature move, props, colour and era plan. §2 the camera: the lens, every dive, flood,
  drain, pull-back. §3 the band. §4 THE HOME DESK: a snippet every chapter copies verbatim; it is how twelve files
  draw the same desk. §5 the twelve chapters, each with a table of shots. §6 the HANDOFF STATES at every boundary
  and the mechanism that makes them seamless. §7 the special moments to the frame. §8 the floppy budget. §9 rules
  and checklist. §10 the split in one breath. §11 the revision log (what the critics asked, what changed, what was
  refused and why).
- Lyric references read `id "word"@seconds` (ids and times from `LYRICS`); hits read `hit@seconds` (from `HITS`).
  Screen coordinates are inside the historic screen (`W` x `H` while a `screen: true` scene draws); frame
  coordinates (640x360) are marked `_F`. The screen offset is (64, 9) at 512x342, (32, 4) at 576x352, (16, 2) at
  608x356 and (0, 0) once the bars are punched off at 128.0.
- "KB" means 1024 bytes everywhere in this file.

## 1. The idea

A synthetic voice sings, in tune and with feeling, that it will never become your voice, and the whole computer
obeys her. The film is one unbroken screen recording of AI System 6: it opens on a single pixel, pulls back into
a 1-bit Macintosh, and never cuts again. Every verse is the writing desk at work, seen through a LENS that hops
from gag to gag at 2x (dense, deadpan, every lyric a dialog, a list, a drive, a stamp); every chorus floods the
desk to one flat neon field where Clio, the AI, is a black dancing silhouette doing one signature move the
audience can copy, the hook slams in as giant pixel type, and the only white thing on screen is the writer's pen
on its long white cord. The three choruses grow: one dancer, then a crowd, then a chorus line of twelve wearing
the twelve eras. The camera moves only one way: into pixels. At the end of every chorus it dives into a pixel
that "You do!" points at (the dot of the exclamation mark, Clio's eye, the ink bead on the thrown pen) and the
next era of the desk is already inside it; the bridge dives twelve times in twelve seconds through the writer's
full stop, one era per chanted year, holding each era for a beat before the whip; the outro pulls back through
history to 1988 one verb at a time, the writer presses Return to play the last chord, and the AI's last line
("This song is temporary.") survives only because the writer clicks Save. Then the CRT collapses to a dot and the
dot lands as the full stop of "You may now write."

### The cast

| Who | Is | Desk mode | Silhouette mode |
|---|---|---|---|
| **The writer** | the pointer (arrow; a vermilion I-beam when writing) | `CUR` at its home (300, 24) unless acting; it holds the white pen on a cord (scale 1, hanging 22 px below the pointer); the pointer, the cord and the pen are redrawn AFTER any gag window, so nothing ever covers the pen | at the top of the frame (W-56, 6), the cord running down to the pen (scale 4, swinging on the beat, `penRig`) |
| **Clio** | the AI, the singer, a speech-balloon creature | `clio(286, 196, {scale: 3, mouth: 'sing', expr: 'sing'})` standing beside her own window, ClioTalk; scale 1 inside her bubbles | `clioDance`: the hero at scale 7, a supporting dancer at 5, the chorus line at 3; black with a halo in the field colour; her mouth cut-out sings every word; **she does THE SIGNATURE MOVE on every "pen pal"** (below) |
| **The white pen** | the writer's pen, the only white object in silhouette mode | hangs from the pointer, 36 px, 1-px black outline; **introduced on its word at "pen"@3.0** (§5 ch01) | 146 px, flashes on every kick, rings on every "pen" bell; in post-choruses it is the BOUNCING PEN that leads the la-la; at 143.5 it is THROWN at the lens |
| **The gang** | the twelve-copy choir | twelve scale-1 Clios along the bottom edge; twelve pointers stamping | chorus 1: none (one dancer); chorus 2: twelve scale-2 silhouettes on both echoes doing the signature move; chorus 3: **THE CHORUS LINE**, twelve scale-3 dancers in a row, each wearing one era's hat; twelve pointer copies on every chorus-3 clap |
| **ClioTalk** | chat is an app | her window; her words are SOLID type on a TEMPORARY PLATE (50% dithered, marching-ants border, a TEMPORARY tag) until the writer keeps them, when the plate turns solid white and the ants stop | a black slab, used only where it is the gag (the read-only notice) |

**THE SIGNATURE MOVE** (the thing a crowd can copy; it overrides the phrase picker, `lyric: false` plus a forced
`pose`, through a local `sigPose(t)` that every silhouette chapter copies):

| Sung | Move | Kit |
|---|---|---|
| "pen" (every lead and harmony "pen", every "(pen" echo) | THE SCRIBBLE: arm up on the diagonal, and the mitten writes three whole-pixel zigzags in the air over the half beat | `pose: 'pointUp', p: prog(t, w.start, w.end)` + a local `scribble(hand, k)`: three 8-px zigzag strokes (black, haloed in the field) drawn from the mitten, one per 16th |
| "pal" (every "pal", every "pal)") | THE WAVE: straight at the lens, the huge mitten cropped by the frame | `pose: 'pointCam'` |
| "You" (every "You" of "You do!") | THE POINT: at the viewer, the mitten out of the frame | `pose: 'pointCam', p: .5` (held) |
| "do!" | THE PEN POINT: up at the white pen | `pose: 'pointUp', p: 1` (held, no scribble) |
| crashes and stabs | the star jump (the kit's own override stays) | `jump` |

The move is identical in every chorus; only the number of dancers changes (1 → 2 + 12 → 12). It is planted before
chorus 1: on the intro's chops (4.75, 5.25, 6.75, 7.25…) the desk Clio (scale 3) mimes it with her mouth chop,
`pose: 'point', point: 'up'` + the three zigzags for "PEN" and `pose: 'wave'` for "PAL" (§5 ch01).

### Running props

1. **Review Desk's lens hint "Sounds like you."** in the menu bar's right slot (`UI.menu.prop`, `propW: 128`).
   The product's own words, no number (Review Desk says of itself "Not a score."). At rest it reads
   `Sounds like you.`; whenever Clio tries to put a sung line where only the writer writes it flips to the hint's
   other half, `Sounds like a mouthpiece.`, shakes ±1 px, and snaps back to `Sounds like you.` on the OK: "Not
   mine." (27.25-27.75), "whole computer" (62.5-62.75), the breakdown's model (125.25-125.5). It is TAUGHT ONCE,
   big: at 27.25 the lens punches 4x onto the slot as it flips (§5 ch02). In silhouette mode it does not exist;
   the chorus's prop is the read-only notice (next).
2. **The read-only notice**, the product's real sentence, as ClioTalk's target-picker reason (not a modal):
   `The drafting manuscript is read-only; use the current Section Draft instead.` In desk mode it is a ClioTalk
   notice row with the Manuscript's status strip `Read-only · edit in Section Drafts` flashing; in silhouette
   mode it is a BLACK SLAB with the sentence cut out in the field colour and an [OK] button, slammed on every
   chorus "pen." where Clio tried on "hold". It ESCALATES: chorus 1 one (39.5), then two offset (47.5); chorus 2
   four in a window-trail cascade (87.5), then eight (95.5); chorus 3 none: she stops trying, and its absence is
   the payoff.
3. **Two Floppies** `2,902,645 / 2,949,120 B`: the YOU DO! riser bar ([50,52], [98,100], [142,144]) IS the Two
   Floppies bar: a black bar along the bottom with a floppy icon and the byte count cut out, filling on 16ths and
   STOPPING at 98.4%, one notch short, three times (the audience half-gets it); the full release-gate window at
   "Two floppies. It fits." (120.25), where the two drives that played the bass eject their disks into it and the
   count goes to 1 ("It fits." pays off the 98.4%); its two Disk bars are the spin-up risers into the reboot
   (126-128). The end card reuses the meter to weigh the film's own source (§7.11).
4. **One More Tune's eleventh track.** The white-label record is a black disc behind the la-la type in every
   post-chorus, only its eleventh groove pulsing on riff notes; the tonearm lands on the eleventh groove at 52.0.
   The quiz card says only "Track 11 · Name the ad." (54.0) and "Not in the deck." (55.0). In the outro the record
   rides in the overlay, its label "11 · PEN PAL · AI SYSTEM 6", and on "Export it."@147.0 the label stamps
   "This one." The answer is this film; no separate card.
5. **The postmark.** The gang's "(PEN PAL!)" is pen-pal correspondence: a black round rubber-stamp POSTMARK (r 72,
   two cancel bars) slams onto the frame with `PEN PAL · <year>` cut out in the field, and an AIRMAIL border (a
   diagonal pixel stripe, field and black, 8 px) snaps round the frame edge for the echo's half second. The year is
   the era of the moment, so the era is visible in a world with no chrome: `· 1991` (37.25, 45.25), `· 2009`
   (85.25), `· 2011` (93.25), `· 2026` (129.25, 137.25).

Dropped from SONG §6 on purpose: the menu-bar Route strip (the Route WINDOW of verse 1 is the route, and a 512-px
menu bar has no room for eight stops beside the lens hint), the Control Panel appearance list in the bridge (the
tunnel's holds show each era whole), and `VOICE: YOURS 100%` (replaced by Review Desk's real wording). VISION
lets the song win; here the picture wins, and this line says so.

### Colour and mode plan

| Mode | Where | Look |
|---|---|---|
| Desk | boot, intro, verse 1, pre 1 (1988 1-bit); verse 2 (Aqua), pre 2 (Tiger); the bridge tunnel (all twelve); 116-128 the NEGATIVE 1988 desk (white on black); 148-157 (1988, full frame) | the era desk, the pointer, Clio on the desk, the band as desk objects, seen through the LENS (§2); Clio's words solid on temporary plates; the writer's words solid on white; one colour: vermilion `#ff5a36` for the writer only (the full stop, the I-beam, KEEP, the typed PEN., the Save ring) |
| Silhouette | chorus 1 **magenta** (1991) → post 1 **lime** (1999); chorus 2 **lime** (2009, 2011 by postmark) → post 2 **magenta** (2014); chorus 3 **cyan** (2026) → outro 144-148 **magenta** (2026, pulling back through 2014, 2009, 2002 to 1988) | one flat field (`fieldAt(t)`, `FIELD_OF` in style.js), everything else pure black, big type, Clio dancing, the white pen. Frame budget: the type, ONE dancer group, the pen and cord, and at most ONE prop (the notice cascade, the postmark, the Two Floppies bar). No `slabWindow` in choruses: it says nothing in silhouette |

Into silhouette mode: the ink flood onto the chorus downbeat in 10 one-frame steps (35.833→36 from the nib on the
page; 83.833→84 from the POSTMARK stamped on the page; 127.833→128 from the nib, with the punch). Chorus →
post-chorus: a whip dive in the last three 16ths. Out of silhouette mode: the drain, 10 steps onto the downbeat
(59.833→60, 103.833→104); the outro leaves by pulling back through the full stop (144→148).

### Era plan (follows `ERAS` in data.js) and the growing screen

| Time | Era | Screen (`screenSize`) | How it arrives |
|---|---|---|---|
| 0-36 | 1988 System 6 | 512x342, 1-bit, bars black | the boot pull-back; the raster wipe at 3.5 |
| 36 | 1991 System 7 | grows to 576x352 (8-bit) over 36.0-36.5 in 4 steps | under the magenta flood: the field widens in hard steps; the postmark says 1991 |
| 52 | 1999 Platinum | grows to 608x356 (16-bit) over 52.0-52.5 | inside the first dive |
| 60 / 76 | 2002 Aqua / 2005 Tiger | 608x356 | the drain lands on Aqua; Tiger re-skins on the stab at 76 (`morph: .35, 'wipe'`) |
| 84 / 92 / 100 | 2009 Snow Leopard / 2011 Lion / 2014 Yosemite | 608x356 | the lime flood (postmark 2009); the harmony twin arrives on the stab at 92 and the next postmark says 2011; the second dive lands on Yosemite |
| 104-116 | all twelve, one per second (1988, 1991, 1995, 1998, 1999, 2002, 2005, 2009, 2011, 2014, 2020, 2026) | 608x356 (the screen never shrinks) | the tunnel: HOLD a beat, WHIP a beat, accelerating from 2009 |
| 116-128 | 1988 inverted (the negative) | 608x356; the bezel inverts to white | the sheet, the flip-book, the breakdown |
| 128 | 2026 Liquid Glass | **punched to 640x360**: 2 inverted frames with a 2x punch-in, the bars slide off in 4 hard steps | the cyan flood + the key change; the 2026 desk shows through the cyan as a 25% dither on the LAND bar (133-134): the glass is translucent |
| 144-148 | 2026 → 2014 → 2009 → 2002 → 1988 | 640x360 | the pull-back, one layer per chant verb |
| 148-157 | 1988 System 6, positive, full frame | 640x360 | "It was always your voice." on a still desk, Return, the Save dialog, the end card held 3 s past the song |

## 2. The one-take camera plan

Every camera move is one of five things: the LENS (desk mode), or one of the four kit calls (`inkFlood`,
`diveInto`, `pullBack`, `scanWipe`), always in a `raw: true` full-frame scene whose inner and outer frames come
from `frameInto` with `screen: true` (so the bars match main's). Chapter boundaries sit on these moves, and the
chapter that OWNS the move renders its neighbour's first scene BY NAME (§6).

### 2.1 The LENS (every desk-mode scene)

Locked-off 1x for 85% of the runtime read as a screen recording with wipes, and 9-px Geneva in a 512x342 screen
inside 640x360 is unreadable on a phone. So desk mode is seen through a cursor-follow lens, the product-film
zoom-to-cursor idiom done in hard pixels: an integer `FX.stepZoom` crop (2x = a 320x180 window of the frame, 3x =
213x120, 4x = 160x90) centred on the writer's pointer or the line's gag hotspot. It RE-TARGETS ONLY ON BEATS, in
whole-pixel steps, with no smoothing (`stepZoom` is applied after the frame is drawn, so nothing else changes).

```js
// lens(t, keys): keys = [[t, x, y, n], ...] in SCREEN coordinates (main shifts stepZoomAt for screen scenes).
// The last key at or before t wins; n = 1 means 1x (no zoom). Call it last in the scene, after everything is drawn.
function lens(t, keys) { let k = null; for (const q of keys) if (q[0] <= t) k = q; if (k && k[3] > 1) stepZoom(k[3], k[1], k[2]); return k; }
```

Rules: (1) keys sit on beats or on the sung word that moves the eye, never between; (2) the lyric plate of the
moment and the gag it names are both inside the crop (the chapter's contact sheet proves it); (3) verses play at
2x, hopping between gags (Route item → floppy slot → Searcher → Scrapbook → notice); pre-choruses tighten to 3x on
the pen as it grows and to 4x on the HAND hit (34.75, 82.75), and the a cappella pickup holds 4x on the descending
nib; (4) the flood scene starts at 1x: the release from 4x to 1x is the flood's first frame, so the chorus
explodes to full frame; (5) the bridge's holds, the sheet, the breakdown and the end are at 1x unless a row says
otherwise; (6) the menu-bar lens hint and the drives come into frame when they matter (verse openings, "Feed the
floppy", "Not mine.", the breakdown), not all verse long. The Camera column of every desk table lists the lens
keys as `n× (x, y)`.

### 2.2 The moves

| Time | Move | From → to | Pixel | Call |
|---|---|---|---|---|
| 0.0→2.25 | the opening pull-back, reversed | a white dot → the NEGATIVE Manuscript window alone on black (1988, 512x342) | the white full stop after "fills", at `PERIOD_F` = (223, 146) in every frame from frame 0 (the dot never moves; the window grows round it) | `pullBack(0.5, 2.25, [negMs], {t: 2.75 - t, dotAt: PERIOD_F, dotColor: C.white, dotWeight: .5, anchor: false})` with layer 0 `{draw: negMs, px: 223, py: 146, pw: 2}`; the host dot is 1x1 (the kit's) until the window's own 2x2 full stop takes over; **from 2.25 draw `negMs` directly at 1:1** (the kit opens the sides only on a dive's t1 and has no k = 0 reveal) with a sides-open reveal of its own: `invertFrame(2.25, 1); splitPal(2, 2.25, 3, [C.white, C.black])` |
| 3.5→4.0 | the raster wipe | negative → the positive 1988 desk | — | `scanWipe(3.5, 4.0, tt => ctx.drawImage(frameInto(B, tt, 'ch01 drop'), 0, 0), {band: 4})` (`drawB` must PAINT onto the current ctx: `frameInto` alone returns a canvas and wipes in nothing) |
| 35.833→36.0 | flood 1 | 1988 desk (lens released to 1x) → magenta chorus (1991) | nib at the page, `(328, 179)_F` | `inkFlood(36 - 10/FPS, 36, 328, 179, tt => ctx.drawImage(frameInto(B, tt, 'ch04 pen pal'), 0, 0), {steps: 10})` |
| 51.625→52.0 | **dive 1** (a whip in the last three 16ths; the second YOU DO! reads at 1x through the "do!" slam at 51.5) | magenta YOU DO! → lime post 1 (1999) | **the square DOT of the "!" in DO!**: a bigType font pixel, `sx` px square (16-24 px at the slam's scale), the eye has it before the zoom starts; the post-chorus lives inside the exclamation point | `diveInto(52 - 3/8, 52, DOT_F.x, DOT_F.y, youDoFrame1, 'ch05 lala', {pw: DOT_F.w, color: C.black, power: 2, outer: {era: 'system7', raw: true, screen: true}, inner: {era: 'platinum', raw: true, screen: true}})`; `DOT_F` from the bigType return (`letters` '!' box: its bottom font pixel) + the stage offset |
| 59.833→60.0 | drain 1 | lime → the Aqua desk | the pen's home nib `NIB_HOME_F` (the pen hopped home on the last "la." at 59.5) | `inkFlood(60 - 10/FPS, 60, 573, 183, tt => ctx.drawImage(frameInto(B, tt, 'ch06 chat'), 0, 0), {drain: true, steps: 10, seed: 3})` |
| 83.833→84.0 | flood 2 | Tiger desk → lime chorus 2 (2009) | the POSTMARK's centre on the page, `(280, 172)_F` | as flood 1 with `seed: 2`; the ink comes from a stamp, not a nib (§5 ch07) |
| 99.625→100.0 | **dive 2** (whip) | lime YOU DO! → magenta post 2 (2014) | **Clio's EYE cut-out** (the hero's near eye: a field-coloured 2x2-unit cut-out = 14 px at scale 7) | `diveInto(100 - 3/8, 100, EYE_F.x, EYE_F.y, youDoFrame2, 'ch08 lala3', {pw: 14, color: fld, power: 2, …})`; `EYE_F` from `clioDance`'s `head` box (the chapter reads the eye's pixel once and quotes it) |
| 103.833→104.0 | drain 2 | magenta → the 1988 desk of the bridge | `NIB_HOME_F` | `inkFlood(104 - 10/FPS, 104, 573, 183, tt => ctx.drawImage(frameInto(B, tt, 'ch09 tunnel'), 0, 0), {drain: true, steps: 10, seed: 5})` |
| 104→116 | **the tunnel: 12 dives, HOLD-WHIP** | 1988→1991→1995→1998→1999→2002→2005→2009→2011→2014→2020→2026→the contact sheet | **the writer's vermilion full stop** `PERIOD_F(era)`: near the same place in every era, re-aimed per era (the windows stay; the type metrics move it a few px) | per year: a HOLD at 1:1 (the era whole, the year as poster type), then `diveInto(Y + hold, Y + 1, PERIOD_F(era_i)…, desk(era_i), desk(era_i+1), {pw: 2, power: 2, mark: PERIOD_F(era_i+1)})`; holds 0.5 s for 1988-2005, 0.25 s for 2009, 0.125 s from 2011 (§5 ch09) |
| 116→118 | the sheet (not a kit move) | the 12-up contact sheet, 1x | — | hand-drawn (§5 ch09) |
| 118→119 | **the flip-book** | the 1988 thumb expands to 1:1, then the twelve eras strobe on 16ths round a Manuscript and ClioTalk that do not move a pixel; locks on the negative 1988 at "stay."@119.0 | — | hand-drawn (§5 ch09) |
| 127.833→128.0 | flood 3 + **the key-change punch** | negative 1988 (lens 1x) → cyan chorus 3 (2026), bars punched off at 128.0 | nib on the Manuscript, inside the 9:16 column: `(260, 122)_F` | `inkFlood(128 - 10/FPS, 128, 260, 122, tt => ctx.drawImage(frameInto(B, tt, 'ch11 reboot'), 0, 0), {steps: 10, seed: 7})`; the punch is automatic (`screenSize` at `keyChange`) |
| 143.5→144.0 | **the throw + dive 3** | cyan YOU DO! → magenta outro (2026) | on "do!"@143.5 the pen is THROWN nib-first at the lens: scale 4 → 8 → 16 → 32 on the 16ths 143.5/.625/.75/.875, its nib at the frame centre, until the white fills the frame; the dive goes into **the vermilion INK BEAD on the nib**, a 2x2 drawn at the tip that scales with the pen (8 px at 143.625) | `diveInto(144 - 3/8, 144, 320, 180, youDoFrame3, 'ch12 lala', {pw: 8, color: FIELDS.vermilion, power: 2, outer/inner: {era: 'liquidglass', raw: true, screen: true}})`; `youDoFrame3(t)` draws the growing pen itself |
| 144→148 | **the outro pull-back, ON THE VERBS** | the magenta outro frame → 2014 → 2009 → 2002 → 1988, one layer per chant verb, landing on the 1988 desk at 1:1 at 148.0 (`dot: false`) | the vermilion full stop of each era | `pullBack(144, 148, [L_mag, L2014, L2009, L2002, L1988], {dot: false, ease})`; `ease` is piecewise linear so the four step boundaries fall on 145.0, 145.75, 146.75, 148.0 (the verbs) instead of the whole seconds (§5 ch12) |
| 153.3→153.45 | the CRT collapse | the Save dialog → a line → a dot → black | — | `FX.crt = prog(t, 153.3, 153.45)` in `ch12 end card`, which renders `ch12 save` by name under it |
| 153.45→153.55 | the dot lands | a vermilion 2x2 dot flies from the centre to the end of "You may now write" | — | hand-drawn (`track`); held 8 frames before anything else appears |

**`NIB_HOME_F`, the rig constant every chapter copies.** In silhouette mode the pointer is at (W-56, 6) in screen
coordinates; the cord runs from (W-51, 21) to (W-51, 33); the pen hangs `pen(W-51, 181, Math.PI/2, 4, {t})` with
its nib at (W-51, 181); `penRig` swings the pen `R(10 * Math.sin(beatPhase(t, 2) * 2π))` px in x, which is 0 on
every whole beat, so on a whole beat the nib is exactly (W-51, 181)_screen: **(557, 185)_F at 576x352, (573,
183)_F at 608x356, (589, 181)_F at 640x360.** Every drain and landing punch at 59.833/60.0 and 103.833/104.0 uses
(573, 183); the pen is frozen at home (`t: 59.5`, `t: 103.5`) through those frames.

Why those pixels: "Who holds the pen? You do!" and the camera goes where the answer points: into the
exclamation mark, into the singer's eye, and finally into the pen the writer throws at you. Why the full stop in
the bridge: the windows never move, so the dot is a fixed point through all twelve eras; the writer's last word
blows past the camera at 10-60x in a different face almost every era (Geneva, Helvetica, Charcoal, a serif from
Platinum on) on the way in. Why `power: 2` everywhere: the frame stays legible at 1-2x, then the zoom whips.

Note on the end: VISION's "pull-back to a dot" is split in two by the song. The pull-back lands on the 1988 desk
at 148.0 because the Return key (150.0) and the Save click (153.25) have to happen ON the desk; the dot then
comes from the CRT collapse and lands as the full stop of "You may now write." The song wins.

## 3. The desk is the band

Every entry in `EVENTS` is a UI event you can see, but only if it is either the lyric's gag or big enough to read
in the lens crop. **Cut as noise:** the 1-px riff pixel on the Hard Disk, the ghost-snare title-stripe shifts, the
2-px snare whaps on the frontmost window, and every cowbell menu-bar inversion except 27.75, where the cowbell IS
the notice's beep. Desk-mode placements use the home desk (§4); silhouette placements are black shapes with field
cut-outs. (`KIT` names the foley; `evLast`, `evPulse`, `evSpan` time it.)

| Event | Desk mode | Silhouette mode | Shown in |
|---|---|---|---|
| **kick** (floppy eject) | the eject drive at (412, 230) spits a disk one px per frame (`ejectDisk`), when the lens has it in frame | the pen FLASHES one frame (automatic); `beatFX` 1-frame invert on the four phrase downbeats | every section with kicks; the bridge shows it only in the holds |
| **snare** (window close) | a window really closing zooms shut into its icon (`windowCloseZoom`): the model is the intro's four copies landing at 4.5/5.5/6.5/7.5; otherwise not shown | `splitPal` 2 px for 3 frames (`beatFX`) | intro, the real closes of verse 1 (21.5, 24.5, 26.5, 27.5), 11.5, 27.5; pre-choruses: the page's 8ths→16ths whap is the exception (it is the gag: the page shaking in the writer's hand) |
| **clap** (mouse click) | `clickBurst` at the pointer; 12 copies for the gang's "Flag it." and KEEP | `clickBurst` at the pointer, rings in the field; 3 copies in choruses 1-2, **12 in chorus 3** | choruses on 2 and 4, verse 2 flags, breakdown, outro |
| **hat** (keystroke) | `typeLine`: one solid character of the writer's line per hat; the newest key pops inverted 2 frames. **Count the hats before choosing the text** (intro: 16 per 2 s; verses: 8 per 2 s; explicit `keystrokes` arrays on 16ths where a word must land before a beat) | the bouncing pen's taps in post 1 (36 hats) | intro, verses, pre-choruses, post 1 |
| **open hat** (space bar) | the word gap in the typed line | not shown | choruses (no typing there) |
| **crash** (Trash crumple) | `trashCrumple` at the Trash | pixel-sort smear 2 frames (`beatFX`; **`anyCrash: true` in ch08 and ch11**, since 92 and 136 are not section starts) + the star jump | 104 (desk); 36, 52, 84, 92, 100, 128, 132, 136, 144 (silhouette) |
| **choked crash** | the Trash lid flips and slams within 3 frames | — | 34.75, 82.75 (the HAND hits) |
| **riser** (progress bar) | `progressRiser` as a bar in the scene's own UI | the Two Floppies bar along the bottom, stopping at 98.4% | [3,4] the raster write-head; [28,34.75], [76,82.75] the melt bars; [35,36], [83,84], [127,128] the pen's descent in 4 steps; [50,52], [98,100], [142,144] the Two Floppies bar; [102,104] "Loading twelve appearances…"; [118,120] the flip-book's bar; [126,128], [127,128] the Disk bars |
| **stab** (boot-chord brass) | the desk re-skins on the hit (era change) | `punch` 2 steps at the hero word (`beatFX` `stab: true`); **on every chorus "pen." the hardest hit of the block: `punch(at, PEN., [3, 3, 2, 2])`** | era stabs 36, 52, 60, 76, 84, 92, 100, 104, 116, 128, 148; the rest punch |
| **bell** (Writing Bell) | `bellRing` on the Writing Bell window / dock icon | white rings ripple from the pen's NIB (`nibRipple`) **only on "pen" bells** (36, 39.5, 44, 47.5, 84…, 128, 136, 139.5) and the dive bells (51.625/.75/.875 etc.) | 31.5 "while", 79.5 "won't"; chorus "pen"s; the outro loop |
| **cowbell** (system beep) | **27.75 only**: the menu bar inverts 2 frames as the notice beeps | in the tunnel the year's poster type inverts 1 frame (107.75, 111.75, 115.75); 147.75 `invertFrame` | 27.75, the tunnel, 147.75 |
| **tambourine** (scroll bar) | Review Desk's scroll thumb ticks (pre 2) | the postmark's cancel bars rattle 1 px (chorus 2) | pre 2, chorus 2 |
| **snap** (checkbox) | a `check()` fills | — | 122.5, 123.5, 124.5, 125.5 (the model list) |
| **tom** (disk dropped) | the whole desk drops 4 px and bounces (the stumble) | — | 69.625/.75/.875 |
| **floppyA / floppyB** (the bass) | drive A: (404, 70) and drive B: (404, 150), compact, heads stepping to pitch, lights on; **in the breakdown they play the 2-beat notes at 122, 124, 126 (A 36/45/40, B 43/52/47): the heads step** | not shown (one hero + one pen) | every desk-mode section where the lens holds them: verse openings, "Feed the floppy", the breakdown |
| **sub** (the 808) | — | `FX.dy = 1` for 1 frame on each sub onset | choruses; 112 (the bridge drop: + `FX.shake = 1`); 128 |
| **chop** (ClioTalk's grille) | the signature mime at Clio's mouth: a 1-bit inverted tag "PEN"/"PAL" pops at her mouth for the chop's length and she does the scribble / the wave (intro only) | her mouth cut-out E / A and a 1-frame invert of her head; no tags (one hero: the bouncing pen) | intro (tags), post 1, post 2 (mouth only) |
| **beep** (appearance beep) | the landing invert + split of each tunnel dive | — | 104-115 |
| **blip** (typed verb) | the kara word pop of each chant verb | the verb slab slams | intro, verses, outro (144, 145, 146.5, 147.5) |
| **riff** (Floppy Organ) | not shown on the desk (a 1-px flicker is noise) | the eleventh groove of the record pulses per note | 52-60, 100-104, 144-148 |
| **keystroke** | **131.625: the writer types "PEN." into the silence; 150.0: Return at the end of the manuscript** | | §7.7, §7.8 |
| **click** | 153.25: the writer clicks Save | | §7.9 |

Per section, the band that is visible:

| Section | Visible band |
|---|---|
| boot | the chord's dot blinks; the raster write-head is the riser |
| intro | eject drive (kick, when the lens is on the machine room), the four copies flying home on snares, hats typing in the chat input, A/B heads, chops as Clio's mime, the drop's pixel sort |
| verse 1 | eject drive, A/B heads at the verse opening, hats typing the writer's question and draft, blips; real window closes on 21.5, 24.5, 26.5, 27.5; the cowbell beep at 27.75 |
| pre 1 / pre 2 | four on the floor on the eject drive (pre 1's lens starts on it), A/B, the riser bar, snare 8ths→16ths whapping the page, the bell on "while"/"won't", tambourine ticks (pre 2), the HAND hit (jolt + choked crash + stab + freeze) |
| choruses | pen flash on kicks, phrase inverts, snare splits, claps as click bursts, nib ripples on "pen" bells, stab punches (hardest on "pen."), sub nudges, the Two Floppies bar; chorus 3 adds 12 pointer copies |
| post-choruses | **the band showcase 52-54**: `bandGrid` full frame in field mode, the bouncing pen hopping across its pads; then the Jersey kicks on the pen, claps, the record's groove on riff notes, the riser into the bridge |
| verse 2 | eject drive, A/B, hats in the chat input, 12-pointer claps on every "Flag it.", the stumble (the desk drops on the toms, the stalled frame), the KEEP clap |
| bridge | beeps = dive landings, cowbells on the year type, the sub drop at 112, the crash at 104 (Trash), half-time kicks on the sheet (116, 118), the snare roll under the flip-book (119-120) |
| breakdown | the clunks (the word times of "Two" / "floppies.": the disks slam in), snaps as checkbox ticks, two claps, A:/B: stepping on 122/124/126, the two Disk risers, the riser [126,128] shaking the negative; no kick (there is none between 119 and 128) |
| outro | the outro loop's bells on the bouncing pen, the verbs' slabs on blips, the cowbell flash, claps on the pull-back's marker, Return, the click |

## 4. THE HOME DESK (copy this verbatim into every chapter)

Twelve files must draw the same desk at every desk-to-desk seam and in every era of the tunnel and pull-back.
They do it by copying this block verbatim (rename the three top-level names with your chapter prefix, e.g.
`c03_homeDesk`). Revision 1 of this block rendered at 2.6 ms in 1988 and 4 ms in 2026 (tested); revision 2 changes
the prop text, the icon labels, the ClioTalk height in dock eras, the doc status and the draw order of the pen:
ch01's author re-tests it in 1988, 2002, the 1988 negative and 2026 and reports the times. Change nothing but the
prefix; if you need more, pass options, or draw on top after it returns.

```js
const MS = ['# The Tide Comes In Twice', 'They never called it renewable energy. They called it the tide, and they billed it by the moon.', 'Twice a day the estuary fills'];
const INV = c => { const [r, g, b] = rgb(c); return hex(255 - r, 255 - g, 255 - b); };   // pre-invert a colour for FX.invert frames
const HINT = ['Sounds like you.', 'Sounds like a mouthpiece.'];   // Review Desk's lens hint, the product's words; never a number
const youProp = s => (x, y, w, h) => { const f = 'menu'; text(s, x + w, y + R((h - capH(f)) / 2), { font: f, align: 'right', color: P.menuText }); };
let PERIOD = [0, 0];   // the writer's full stop, screen coordinates, set by every homeDesk call
// o: hint (HINT[0]), neg (true in FX.invert frames: the dot and the pen are pre-inverted), lines, doc (teachText opts or false;
//    pass {status: 'Final'} from 63.75 on), msgs / actions / input / chat (clioTalk opts or false), clio (clio opts or false),
//    cur ([x, y, kind]), menu, after (fn drawn between the windows and the pointer: gag windows go here, so the pen stays on top)
function homeDesk(t, o = {}) {
  const neg = !!o.neg, verm = neg ? INV(FIELDS.vermilion) : FIELDS.vermilion;
  UI.menu = { app: 'AI System 6', prop: youProp(o.hint || HINT[0]), propW: 128, ...(o.menu || {}) };
  const doc = o.doc === false ? null : APP.teachText(8, 30, 268, 164, { title: 'Manuscript', lines: o.lines || MS, ...(o.doc || {}) });
  if (doc) { const r = doc.rows[doc.rows.length - 1]; PERIOD = [r.x + r.w + 1, r.y + capH('doc') - 1]; rect(PERIOD[0], PERIOD[1], 2, 2, verm); }
  const chatH = E.dock ? 110 : 116;   // the dock covers y > 312
  const chat = o.chat === false ? null : APP.clioTalk(8, 202, 268, chatH, { msgs: o.msgs || [], actions: o.actions, hero: false, input: o.input, ...(o.chat || {}) });
  deskIcon(460, 22, 'hardDisk', 'Project Hard Disk');
  floppyDrive(404, 70, 'A:', 'floppyA', t, { compact: true });
  floppyDrive(404, 150, 'B:', 'floppyB', t, { compact: true });
  ejectDisk(412, 230, undefined, { t });
  if (!E.dock) { deskIcon(336, 296, 'scrapbook', 'Scrapbook'); deskIcon(404, 296, 'sectionDrafts', 'Section Drafts'); deskIcon(466, 296, 'projectDisc', 'Project CD'); trashIcon(286, 296, false); }
  if (o.clio !== false) clio(286, 196, { scale: 3, mouth: 'sing', expr: 'sing', ...(o.clio || {}) });
  if (o.after) o.after({ doc, chat });   // gag windows, alerts, plates: BEFORE the pointer and the pen
  if (o.cur) {
    const [cx, cy] = o.cur; CUR = { x: cx, y: cy, kind: o.cur[2] || 'arrow' };
    penCord([[cx + 5, cy + 15], [cx + 9, cy + 37]], { sag: 6, swing: 3, t });
    pen(cx + 9, cy + 74, Math.PI / 2, 1, neg ? { t, color: C.black, outline: C.white, flash: false } : { t });
  }
  return { doc, chat, period: PERIOD };
}
const hasScene = n => SCENES.some(s => s.name === n);   // guard before frameInto(…, 'chNN name')
```

The desk it draws, 1988 (512x342; the same coordinates in every larger screen, the extra room is desk):
left column = the writer's two windows, **Manuscript** (8, 30, 268, 164; status `Read-only · edit in Section
Drafts` until 63.75, `Final` from then on; its last line ends in the vermilion 2x2 full stop `PERIOD`) and
**ClioTalk** (8, 202, 268, 116; 110 high in dock eras); the middle = Clio at (286, 196) scale 3, the Trash at
(286, 296); the right column = the machine room: Project Hard Disk icon (460, 22), drive A: (404, 70), drive B:
(404, 150), the eject drive (412, 230); the route icons Scrapbook / Section Drafts / Project CD along the bottom
(y 296) in non-dock eras; the pointer home (300, 24) with the pen hanging in the gap between the Manuscript and
Clio. The free zone for gag windows is (284..400) x (30..190); they are drawn in `o.after`, so the pointer, the
cord and the pen are always on top of them. Modal dialogs sit centred over the Manuscript. In dock eras the
Dock is ON in the film (the product ships it off by default; the Review Desk, Writing Bell and Trash gags of
verse 2 and pre 2 need it) and covers y > 312.

**Clio's words on the desk (rule 4, revised).** Her lines are SOLID type (`kara`'s default 2x scale of the small
font, or Chicago 2x) on a TEMPORARY PLATE: `ghostPlate(x, y, w, h)` = a 50% `bayer` of the paper over the plate
rect + a `dline` marching-ants border (phase on 8ths) + a "TEMPORARY" tag in its corner. "Kept" means the plate
turns solid white and the ants stop. Never dither the letters at 9 px (a 50% Bayer removes half of every stem);
if letters themselves must be ghost (chorus type, "unsung words ghost"), only at scale ≥ 3 with 2x2 dither
cells, so every stroke keeps a solid block. Every chant line lives on a plate at least 16 px tall inside the
lens crop, never in a 9-px status strip.

Other helpers every chapter defines locally as it needs them (names are suggestions; keep them under 30 lines
each): `ghostPlate(x, y, w, h)` (above), `lens(t, keys)` (§2.1), `noticeSlab(x, y, fld, o)` (the read-only
notice as a black slab: the sentence in field cut-out Chicago 2x over two lines, an [OK] rect; `o.n` copies as a
trail offset (8, 6) px each), `postmark(cx, cy, year, fld, k)` (a black disc r 72, two cancel bars, `PEN PAL ·
year` cut out round the rim in Chicago 2x; `k` the slam overshoot), `airmail(fld, on)` (an 8-px diagonal stripe
border), `sigPose(t)` (§1), `scribble(hand, k)`, `eraHat(i, x, y, s)` (ch11: a 6-unit cap above a dancer's head
in era i's title-bar chrome, field cut-outs), `nibRipple(x, y, t0, fld)` (the ripple loop of `bellRing` without
the icon), `penRig(t, px, py)` (the reel's: the pen hangs from the pointer and swings on the beat; see
`NIB_HOME_F`), `penBar` (the pen level across the top), `bouncePen(t, boxes)` (the pen hops nib-first from
glyph box to glyph box on each sung la: a whole-pixel parabola of 8 steps per hop, the nib tapping the box's
top-centre on the note), `floppyBar(t0, t1, fld)` (the Two Floppies riser), `landFX(at)` (= `invertFrame(at, 1);
splitPal(2, at, 3, [C.white, C.black])`), `shrink4(canvas)` (ch09 only: a 4x4 box average, Bayer-quantised),
`readerWin(x, y, w, h, o)` (there is no `APP.reader`: a `win()` titled 'Reader' with a highlighted paragraph and a
[Clip] button), `POST_POSES` (a one-line copy of specimen.js's eight: `['bounce', 'clap', 'robot', 'shimmy',
'disco', 'kick', 'vogue', 'jump']`; it is a `const` inside the reel's IIFE and cannot be reached).

## 5. The timeline: twelve chapters

Boundaries (all on section starts or hits): 0 · 12 · 28 · 36 · 52 · 60 · 76 · 84 · 104 · 120 · 128 · 144 · 157.
Each chapter's scenes tile its range exactly; the transition scenes (`raw: true`, full frame) are the last scene
of the chapter that owns them. First-scene names are contracts (§6): a neighbour renders them by name. **The film
ends at `END = DUR + 3.0` (157.0 s), not at DUR**: the song is exactly 154.0 s and the end card must hold, so
render.mjs holds the picture past the song with padded audio (§8, decided, not requested); ch12's last scene
tiles to END.

| Chapter | Range | Sections | Mode · era | Budget | First scene · last scene |
|---|---|---|---|---|---|
| ch01 | 0.00-12.00 | boot, intro | raw → desk · 1988 | 40 KB | `ch01 boot` · `ch01 drop` |
| ch02 | 12.00-28.00 | verse 1 | desk · 1988 | 40 KB | `ch02 spin` · `ch02 outline` |
| ch03 | 28.00-36.00 | pre 1, the melt | desk · 1988 → flood | 30 KB | `ch03 fetch` · `ch03 flood` |
| ch04 | 36.00-52.00 | chorus 1: ONE | silhouette magenta · 1991 | 40 KB | `ch04 pen pal` · `ch04 dive` |
| ch05 | 52.00-60.00 | post 1: the band, the bouncing pen | silhouette lime · 1999 | 30 KB | `ch05 lala` · `ch05 drain` |
| ch06 | 60.00-76.00 | verse 2 | desk · 2002 | 44 KB | `ch06 chat` · `ch06 keep` |
| ch07 | 76.00-84.00 | pre 2 | desk · 2005 → flood from the postmark | 30 KB | `ch07 check` · `ch07 flood` |
| ch08 | 84.00-104.00 | chorus 2: MANY; post 2 | silhouette lime → magenta · 2009/2011/2014 | 40 KB | `ch08 pen pal` · `ch08 drain` |
| ch09 | 104.00-120.00 | bridge | the tunnel (12 eras) → the sheet → the flip-book → the negative | 44 KB | `ch09 tunnel` · `ch09 stay` |
| ch10 | 120.00-128.00 | breakdown | desk, negative 1988 → flood + punch | 30 KB | `ch10 gate` · `ch10 flood` |
| ch11 | 128.00-144.00 | chorus 3: THE CHORUS LINE, the silent pen | silhouette cyan · 2026, full frame | 44 KB | `ch11 reboot` · `ch11 dive` |
| ch12 | 144.00-157.00 | outro, tail, the held card | pull-back on the verbs → desk 1988 → end card | 44 KB | `ch12 lala` · `ch12 end card` |

Table columns: **Time** (lyric id "word"@s, hits) · **Lyric** (verbatim, on screen) · **UI gag and what each
word does** · **Band visible** · **Camera** (lens keys `n× (x, y)` in screen coordinates, or the kit move).

### ch01 · boot and intro (0.00-12.00) · `src/ch01.js` · 40 KB

Scenes: `ch01 boot` (0-4.0, raw full frame), `ch01 drop` (4.0-12.0, `era: 'system6', screen: true`).
`negMs` = a frame fn: black; `silhouette(C.black, () => APP.teachText(8, 30, 268, 164, {title: 'Manuscript', lines: MS}), {mode: 'stencil', invert: true, ink: C.white, key: 'c1-negms'})`; the full stop `rect(PERIOD, 2, 2, C.white)`; wrapped by `frameInto(…, {era: 'system6', raw: true, screen: true})` so the bars stay black. `PERIOD_F` = (223, 146) (the full stop of the 1988 Manuscript at (8, 30, 268, 164): screen (159, 137) + the 512x342 offset (64, 9)).

| Time | Lyric | Gag | Band | Camera |
|---|---|---|---|---|
| 0.00-0.50 | (the boot chord) | Black. One white pixel at (223, 146)_F, the place the full stop will be, blinking with the chord: on 0.000-0.125, off, on 0.250-0.375, off (the pull-back held at its dot; black drawn over it on the off 8ths). | — | at the dot |
| 0.50-2.25 | — | The pull-back, reversed in time (`t: 2.75 - t`): the dot stays 1x1 while the NEGATIVE Manuscript window grows round it, white on black, alone on a black screen: the writer's piece, its last line "Twice a day the estuary fills" ending in the white full stop, which takes over from the dot as the window reaches 1:1 (the kit's host dot is 1x1; the window's own full stop is the 2x2). `anchor: false` (no rays yet: vermilion has not arrived). | the reverse cymbal 2.5-4 | 180x → 1x |
| 2.25 | boot "I'm"@2.25 | **The reveal**: from 2.25 `negMs` is drawn directly at 1:1 (the kit's last pull-back frame is only the centre square); the sides open with `invertFrame(2.25, 1); splitPal(2, 2.25, 3, [C.white, C.black])`. The window has not moved since and will not for the rest of the film. | — | 1x |
| 2.25-3.00 | boot "I'm"@2.25 "just"@2.50 "your"@2.75 · I'm just your | Clio's first words: `bigType(["I'M JUST YOUR", "PEN PAL."], {words: lyric('boot'), ghost: true, color: C.white, fit: 300, x: 300, y: 250, align: 'left', valign: 'middle'})` in the black right of the window; each word arrives on its note as white 2x2-cell ghost dither (scale ≥ 4 here, so the strokes survive); nothing is solid, nothing was kept. | — | 1x |
| 3.00-3.50 | "pen"@3.00 · `teaserPen` | **The pen arrives on its word.** The white pen (scale 1, 36 px) drops into the black frame from the top edge on its cord, 6 px per frame, and its nib lands on the white full stop at 3.25 with a 2-frame white ring (`nibRipple`, white): the one white object in a black world, as the earbuds were. `invertFrame(hit('teaserPen'), 1)` on the word. The riser [3,4] starts: a 1-px white write-head line at the top of the screen. The pointer is not drawn yet: only the cord's end at the top edge. | riser | 1x |
| 3.50-4.00 | "pal."@3.50 | The raster: `scanWipe(3.5, 4.0, tt => ctx.drawImage(frameInto(B, tt, 'ch01 drop'), 0, 0), {band: 4})` writes the positive 1988 desk top-down in 4-px interlaced bands with the white write-head round the pen: the negative Manuscript becomes the real one, and the full stop appears VERMILION under the nib (the one colour arrives with the day side); then the menu bar, the pointer (the cord's owner), Clio, the drives, the icons. The ghost line at the bottom is the last thing overwritten (readable to ~3.85). At 4.0 the pointer lifts to its home (300, 24) in 4 steps (4.0-4.2), the pen hanging. | riser → full | 1x |
| 4.00 | (the drop) · `drop`@4 | `ch01 drop`: the home desk. `beatFX` fires the drop (pixel sort 2 frames, 1-frame invert). ClioTalk zooms from its home rect to (8, 30, 268, 288) over 4.00-4.20 (`zoomRects` outlines), covering the Manuscript: chat is an app, and for eight seconds it is the whole left column. Clio `look`s at it. Kicks: the eject drive (in frame at 1x for the drop). Hats are 16ths (16 per 2 s): the writer types **"Tighten it. Keep my words."** (26 characters) one per hat into ClioTalk's input (`typeLine`), retyped every 2 bars (4.0-5.625, 8.0-9.625). | kick snare hat A/B | 1x for the drop; **2x (160, 150) from 4.25** (the big chat and its pills; Clio's mouth at the crop's right edge) |
| 4.00-7.75 | i1 "Save"@4.00 "it."@4.25 "Clip"@5.00 "it."@5.25 "Insert"@5.75 "it."@6.50 "Export"@6.75 "it."@7.50 · Save it. Clip it. Insert it. Export it. | Clio's reply in the big chat, SOLID Chicago 2x typed word by word (`kara` mode 'type') on a `ghostPlate` (marching ants, TEMPORARY tag). Under it four pills [Save] [Clip] [Insert] [Export]. On each verb the pointer presses its pill (4 frames) and a COPY of the plate lifts and flies (`zoomRects` outline + the copy, `track`) to its home, landing on the next snare as a window-close zoom INTO the icon, which inverts 2 frames: Save → Project Hard Disk (lands 4.50), Clip → Scrapbook (5.50), Insert → Section Drafts (6.50: the landing is the word), Export → Project CD (7.50; the CD icon spins up in 4 frames). The original stays on its temporary plate: a copy was kept, the reply was not. **Chops 4.75, 5.25, 6.75, 7.25, 7.375, 7.5, 7.75 plant the signature move**: on "PEN" chops Clio (scale 3 on the desk) does `pose: 'point', point: 'up'` with three zigzags from her hand and an inverted "PEN" tag at her mouth (E); on "PAL" chops `pose: 'wave'` and the "PAL" tag (A); the stutter 7.25/7.375 is two tags a 16th apart. | kick snare hat A/B chop | 2x (160, 150); on each verb's snare the lens hops to the landing icon for the half beat: 4.5 (460, 40); 5.5 (336, 300); 6.5 (404, 300); 7.5 (466, 300); back to (160, 150) on the next beat |
| 8.00-11.00 | i2 "Everything"@8.00 "I"@8.75 "say"@9.00 "is"@9.50 "temporary."@10.00 · Everything I say is temporary. | The second reply, typed solid on its plate. On "temporary."@10.00 the plate starts to go: the plate's dither thins 50% → 25% → 12% → 0 and the letters thin with it in 2x2 cells on the 8ths 10.0-11.0 (it was never kept), the TEMPORARY tag the last pixel to leave at 11.0. The four pills grey out one per 8th. Hats keep typing the writer's line, solid. Chops 8.75, 9.25, 10.75, 11.25, 11.375, 11.5, 11.75: the mime again. | kick snare hat A/B chop | 2x (160, 150) |
| 11.00-12.00 | — | Snare 11.50: the big chat zooms SHUT to its home rect (11.50-11.70): chat is an app, reduced to its size; the Manuscript is revealed unchanged. By 12.00 the home desk: chat empty, pointer (300, 24), Clio mouth shut. | snare kick | **1x from 11.5** (the whole desk for the first time since the drop; B1 is at 1x) |

### ch02 · verse 1, the route (12.00-28.00) · `src/ch02.js` · 40 KB

Scenes: `ch02 spin` (12-16), `ch02 ask` (16-20), `ch02 clip` (20-24), `ch02 outline` (24-28); all
`era: 'system6', screen: true`. **The Route window** `APP.finder(8, 30, 268, 164, {title: 'Project Hard Disk',
items: [hardDisk, fileFloppy, questionSheet, outline, sectionDrafts, manuscript, reviewDesk, projectDisc]})`
zooms open from the Project Hard Disk icon at 12.00 (k over 0.2 s) over the Manuscript and stays until the snare
at 27.50; its client swaps content per stop. Every chant line is SOLID on a `ghostPlate` (two rows, Chicago 2x)
at (284, 150, 116, 40) above Clio, inside every lens crop of the verse. No organ until 20.0: the chant's blips
(kara pops) are the only pings. Kicks: the eject drive when in frame. A/B heads. Snares only where a window
really closes (21.5, 24.5, 26.5, 27.5). No `/go/` address on Searcher or Reader (the shipped router has no such
routes); the addresses that exist appear where they are real (`/go/doom`, `/go/micropolis`, `/go/one-more-tune`,
`/go/time-machine`).

| Time | Lyric | Gag | Band | Camera |
|---|---|---|---|---|
| 12.00-15.25 | v1a "Spin"@12.00 "the"@12.25 "hard"@12.50 "disk."@12.75 "Feed"@14.00 "the"@14.25 "floppy."@14.50 · Spin the hard disk. Feed the floppy. | "Spin": the Project Hard Disk icon spins (a 4-frame squash: full, half, line, half, mirrored) and the Route window zooms open from it; "hard disk." selects its first item. "Feed": the pointer drags a dotted outline of the File Floppy item to drive A:'s slot (14.00-14.40); "floppy."@14.50: the drive swallows it (`ejectDisk(404, 70, 14.5 - .3)` plays its return stroke) and an OCR scanline (1 px) sweeps the Route's second item 14.5-15.5. Hats (8ths, 13 in 12-15.25): the writer types **"By moonlight."** (13 characters) into ClioTalk's input. | kick hat A/B blip | 2x (300, 90) on "Spin" (the icon, the Route's top, the plate's top edge is out: the plate moves to (284, 120) for this line); 2x (330, 110) from 14.0 (the drag from the Route to drive A:, the plate) |
| 16.00-19.50 | v1b "Ask"@16.00 "the"@16.25 "question."@16.50 "Search"@18.00 "it."@18.25 "Read"@19.00 "it."@19.25 · Ask the question. Search it. Read it. | "Ask": the Route's client becomes the Question Sheet (`APP.questionSheet` content: '## Questions', then the writer's line); "the question.": the writer types **"Who bills the tide?"** on explicit 16th keystrokes from 16.0 (`keystrokes: 19 keys at 16 + i/8`, the last at 18.125), solid. "Search it."@18.00: `APP.searcher(8, 202, 268, 116)` zooms open over ClioTalk, results revealing one per 8th: "La Rance tidal power station", "Lunar billing: a history", "Estuaries, twice daily". "Read it."@19.00: `readerWin(8, 202, 268, 116)` replaces it, the first result's paragraph highlighted. | kick hat A/B blip | 2x (150, 110) (the question typing, the plate's left half); 2x (150, 230) from 18.0 (Searcher → Reader, the plate above them) |
| 20.00-23.50 | v1c "Clip"@20.00 "the"@20.25 "proof."@20.50 "Scrapbook."@22.00 "Keep"@23.00 "it."@23.25 · Clip the proof. Scrapbook. Keep it. | `riffReturns`@20: the chant steps up to B3 (Clio's bob +1 px). "Clip": the pointer presses the Reader's [Clip]; "the proof.": the highlighted paragraph lifts as a `dragOutline` and the pointer drags it across the desk (20.5-22.0) toward the Scrapbook icon; snare 21.5: the Reader zooms shut into the Route's Reader item. "Scrapbook."@22.00: `APP.scrapbook(8, 202, 268, 116, {card: {title: 'Lunar billing', body: 'They billed it by the moon.', source: 'estuaries.example/lunar-billing'}, n: 1, of: 1})` zooms open from its icon, the card flips in (its text on a ghost plate). "Keep it."@23.00: the caption "evidence you chose to keep" stamps in and the card's plate turns SOLID WHITE on the word, the ants stop: the first kept thing. | kick hat A/B blip | 2x (200, 230) (Reader → the drag → Scrapbook; the pointer leads: on 21.0 the key moves to (260, 260), on 22.0 to (150, 250)) |
| 23.50-24.00 | v1c_echo "(Keep"@23.50 "it.)"@23.75 · (Keep it.) | The gang: twelve scale-1 Clios (`plain`) pop along the bottom edge (y 326, x 20 + i·44), mouths open, one shared plate "(Keep it.)" above the row (solid Chicago 2x on a ghost plate); the Scrapbook page flips again on 23.75. They vanish at 24.00. | ghost | **1x** for the half second (the whole row) |
| 24.00-27.00 | v1d "Outline"@24.00 "it."@24.50 "Draft"@25.00 "it."@25.25 "Your"@26.00 "words."@26.25 · Outline it. Draft it. Your words. | "Outline it.": the Route's client becomes the Outline, triangles unfolding one per 8th ('The tide', 'The bill', 'Both directions'); snare 24.5: the Scrapbook zooms shut into its icon. "Draft it."@25.00: `APP.sectionDrafts(8, 202, 268, 116)` zooms open over ClioTalk; "Your words.": the writer types **"Your words"** on explicit 16th keystrokes 26.0 + i/8 (10 keys, done at 26.5625) into the draft, SOLID, pointer kind 'pencil', while the chant's "Your words." sits on its temporary plate: the two meanings side by side, one solid, one on ants. Snare 26.50: Section Drafts zooms shut into the Section Drafts icon (the icon inverts: saved). | kick hat A/B blip | 2x (150, 110) (the Outline unfolding); 2x (200, 200) from 25.0 (the draft, the plate) |
| 27.00-27.75 | "Not"@27.00 "mine."@27.25 · Not mine. | "Not": Clio's own I-beam (black, a 1-px halo) drifts from her mouth toward the Manuscript's last line (27.00-27.25). "mine."@27.25: **the lens hint is taught, once, big**: the menu bar's right slot flips from `Sounds like you.` to `Sounds like a mouthpiece.` with a ±1 px shake, and ClioTalk shows the notice row `The drafting manuscript is read-only; use the current Section Draft instead.` (solid, on a ghost plate) with the Manuscript's status strip `Read-only · edit in Section Drafts` inverting for 2 frames. | kick | **4x (448, 10) on 27.25**: the menu-bar slot fills the frame as it flips; **2x (150, 110) at 27.5** (the Route closing, the notice) |
| 27.50-28.00 | — | Snare 27.50: the Route window zooms shut into the Project Hard Disk icon: the Manuscript is back. Cowbell 27.75 = the notice's beep: the menu bar inverts 2 frames, the pointer presses the notice's [OK], the notice row collapses 27.75-27.95, the slot snaps to `Sounds like you.`. 28.00: the home desk, the pointer home, the chat empty. | snare cowbell kick | 2x (150, 110) → **1x at 28.0** (B2 is at 1x) |

### ch03 · pre-chorus 1, the melt (28.00-36.00) · `src/ch03.js` · 30 KB

Scenes: `ch03 fetch` (28-32), `ch03 pen` (32-35.833), `ch03 flood` (35.833-36.0, raw full frame). Four on the
floor: the eject drive on every beat. The riser [28, 34.75]: `progressRiser(…, {x: 8, y: 322, w: 268, h: 12,
label})` under ClioTalk, the label "Fetching…", then "Filing…" (29.0), "Humming…" (30.0), "Reaching…" (32.0),
full on the HAND hit. Clio's lines: solid Chicago 2x on a `ghostPlate` at (284, 150, 116, 40).

| Time | Lyric | Gag | Band | Camera |
|---|---|---|---|---|
| 28.00-30.00 | pre1a "I"@28.00 "can"@28.25 "fetch."@28.50 "I"@29.00 "can"@29.25 "file."@29.50 · I can fetch. I can file. | The plate carries the line. "fetch.": a Searcher result card (dotted outline) flies from the Project Hard Disk icon into ClioTalk (28.5-29.0). "file.": four 16-px folders drop one per 8th into a row at y 150 in the free zone, then on 29.75 they nudge 1 px to align exactly: the machine files perfectly. | kick A/B riser | 1x on 28.0 (the four-on-the-floor eject drive and the whole desk for a beat); **2x (330, 150) from 28.5** (the free zone, the plate, Clio's mouth) |
| 30.00-32.00 | pre1b "I"@30.00 "can"@30.25 "hum"@30.50 "for"@31.00 "a"@31.25 "while."@31.50 · I can hum for a while. · `melt`@30 | The glides: the desktop's 25% dot pattern loosens into noise (overpaint the desk with `noisePat(k)` rising 0→.5 over 30-32: the 1-bit world softening). "hum": pixel notes (`spr('it_note')`) drift up from Clio's mouth one per 8th toward `APP.writingBell(284, 30, 116, 110)` which opened at 30.0 in the free zone. "while."@31.50 (bell 74): `bellRing` on its icon: rings, a leaping note. | kick hat bell riser | 2x (330, 120) (the bell window, the notes' path, the plate) |
| 32.00-34.00 | pre1c "But"@32.00 "the"@32.25 "pen"@32.50 "and"@33.00 "the"@33.25 "page"@33.50 · But the pen and the page | "pen": the pen GROWS, scale 1→2→3 on the 8ths 32.5/32.75/33.0, the pointer sliding to (330, 36), the cord to 40 px. "page"@33.50: `APP.sectionDrafts(146, 104, 220, 120)` zooms open centred under the pen: the page (drawn in `after`, so the pen stays on top). Snares go to 8ths (32.0-33.75) then 16ths (34.0-34.625): the page window whaps 2 px on every one, more and more frantic (the one snare whap kept: it is the page shaking). The plate stays at (284, 150, 116, 40); the riser bar at (8, 322, 268, 12). | kick snare(8/16) hat A/B riser | **3x (300, 110) from 32.5** tightening on the pen as it grows (the page's top and the plate's left edge inside the 213x120 crop; move the plate to (240, 160) from 33.5) |
| 34.00-34.75 | pre1d "stay"@34.00 "in"@34.25 "your"@34.50 "hand."@34.75 · stay in your hand. | Clio `pose: 'reach', reach: [pen tip]` with a `dline` dotted hand extending from her toward the pen, 1 px per frame. The plate carries the line. The riser reaches full. | riser | 3x (300, 110) |
| 34.75 | "hand." · `stop1` · the HAND hit | The desk JOLTS (`FX.shake = 2`, 2 frames). The choked crash: the Trash lid flips open and slams within 3 frames. The stab: `punch` 2 steps at the pen tip. The lens hint shakes ±1 px for 4 frames and holds `Sounds like you.`. Then everything FREEZES: the drives (`t: 34.75`), Clio's reach, the noise, the full bar. | stab chokedCrash kick | **4x (300, 150) on the hit**: the pen's nib, the reaching hand and the page's paper fill the frame |
| 35.00-35.25 | `air1` | Nothing moves. Not the clock. | — | 4x (300, 150) |
| 35.25-35.83 | chorus1a "I'm"@35.25 "just"@35.50 "your"@35.75 (the a cappella pickup) | Clio's mouth is the only live thing besides the writer; the three words pop solid on the plate (in the crop). The riser [35,36] (the reverse cymbal) is the pen's descent: the pointer drops in 4 hard steps on the 16ths toward the page; at 35.833 the nib touches the page's paper at TIP = (264, 170) screen = (328, 179) frame. | riser | 4x (300, 150), the nib descending through the crop's centre |
| 35.833-36.00 | — · `ch03 flood` | **The release**: this scene is `raw` and draws `frameInto(A, t, 'ch03 pen')` at 1x WITHOUT the lens (the 4x → 1x step is the flood's first frame: the whole desk snaps back and the magenta erupts from the nib). `inkFlood(36 - 10/FPS, 36, 328, 179, tt => ctx.drawImage(frameInto(B, tt, 'ch04 pen pal'), 0, 0), {steps: 10})` in `overlay`: magenta floods from the nib in 10 one-frame steps with fingers and splatter, a white `penTrail` from the tip. Fall back to a flat magenta field if `!hasScene('ch04 pen pal')`. | — | 1x → ch04 |

### ch04 · chorus 1: ONE (36.00-52.00) · `src/ch04.js` · 40 KB · magenta · 1991

Scenes (`era: 'system7', raw: true, screen: true`): `ch04 pen pal` (36-37.75), `ch04 never hold` (37.75-40),
`ch04 land` (40-43.25), `ch04 pen pal 2` (43.25-45.75), `ch04 never hold 2` (45.75-48), `ch04 who` (48-50),
`ch04 you do` (50-51.625), `ch04 dive` (51.625-52, `raw: true`, no screen). The YOU DO! composition is a
function `youDoFrame1(t)` used by both `ch04 you do` and the dive's outer frame.

**Chorus 1 teaches the grammar with ONE of everything**: one dancer (Clio, scale 5 beside the type, scale 7-8 as
the hero), one pen, one notice. Standing elements: the flat field `rect(0, 0, W, H, fieldAt(t))`; the writer at
the top right (pointer (W-56, 6), cord to the pen at scale 4, `penRig`); `beatFX(t, {stab: true, punchAt: hero})`
(phrase inverts at 36/40/44/48, snare `splitPal`, the crash sort at 36); the sub nudge `FX.dy = 1` for 1 frame on
36, 38, 40, 42, 44, 46, 48, 50, 51; `nibRipple` on the "pen" bells only (36.0, 39.5, 44.0, 47.5) and the dive
bells (51.625, 51.75, 51.875); `sigPose(t)` drives every dancer. No `slabWindow`. Frame budget: type + one dancer
+ pen + at most one prop.

| Time | Lyric | Gag | Band | Camera |
|---|---|---|---|---|
| 36.00 | chorus1a "pen"@36.00 "pal,"@36.50 (with "I'm just your" sung 35.25-36 in ch03) · `chorus1`/`colour` · crash, stab, bell 86 | Owed landing: `invertFrame(hit('chorus1'), 2)`. The screen steps 512→576 over 36.0-36.5: the field widens in four hard steps. **"I'M JUST YOUR"** small (scale 3) above the poster, already solid (it was sung); **PEN** slams: `bigType(['PEN', 'PAL'], {words: lyric('chorus1a'), fit: W-40, fitH: H-70, x: 20, y: 40, valign: 'top', align: 'left', slam: hit('chorus1')})`, PAL at 36.50. Clio `clioDance(W-90, H-8, 5, t)` star-jumps on the crash, then THE SCRIBBLE on "pen" and THE WAVE on "pal". Nib ripples. Pixel sort 2 frames. | crash stab kick bell sub | 1x |
| 37.25-37.75 | chorus1a_echo "(pen"@37.25 "pal)"@37.50 · (pen pal) | **The postmark**: `postmark(W/2, H/2, 1991, fld, k)` slams onto the poster (overshoot +3 +2 +1 0) with `PEN PAL · 1991` round its rim, and the `airmail` border snaps round the frame; Clio does the scribble and the wave again (she is the whole gang in chorus 1). Both gone at 37.75. | snare | 1x |
| 37.75-39.50 | chorus1b "I'll"@37.75 "never"@38.00 "hold"@38.50 "the"@39.25 · I'll never hold the | `bigType(["I'LL NEVER", 'HOLD', 'THE PEN.'], {words: lyric('chorus1b'), justify: W-182, fitH: H-24, x: 8, align: 'left'})`; Clio scale 5 at (W-90, H-8). "hold"@38.50 (the clap): **pen attempt 1**: Clio `pose: 'reach'`-equivalent for a dancer, `pointUp` held with the mitten toward the pen, and the pen YANKS up 40 px on the clap's frame (the cord shortens, the pointer hops 16 px). | clap snare kick | 1x |
| 39.50-40.00 | "pen."@39.50 · stab 39.75 · bell 74 | **PEN. is the hardest hit of the block** (the set-up for the silent pen): `punch(39.5, PEN.'s centre, [3, 3, 2, 2])`, the pen FLASHES (white bloom, 1 frame), nib ripples, and PEN. alone inverts for 2 frames (`bigType('PEN.', {invert: true, slab: true, slabMode: 'line'})` over its own box: magenta letters on black). On the same frame **the notice slab** slams in (top left, 300x56): `The drafting manuscript is read-only; use the current Section Draft instead.` [OK], magenta cut-outs. ONE. It leaves on the stab at 39.75 (the pointer's click ring on its [OK], 1 copy). | stab bell kick | 1x |
| 40.00-42.00 | chorus1c "You"@40.00 "say"@40.25 "where"@40.50 "I"@40.75 "land,"@41.00 · You say where I land, | `bigType(['YOU SAY', 'WHERE I', 'LAND,'], {fit: 360, x: 8, align: 'left'})`; Clio is the hero at scale 8: `pointCam` on "You"; from 40.50 airborne (`pose: 'jump', p: prog(t, 40.5, 41)`) sliding from x 584 to 504 while the pointer moves to (504, 40); on "land,"@41.00 (the kick) she lands under the pointer in `cheer` with a 2-px shake; clap 41.50: `clickBurst` at the pointer, 3 copies, magenta rings. | kick clap snare sub | 1x |
| 42.00-43.25 | chorus1d "or"@42.00 "I"@42.25 "fade."@42.50 · or I fade. · `fade1` | `bigType(['OR I', 'FADE.'])` centre-left with a small black "TEMPORARY" tag (magenta letters) at its corner. **Fade 1 is TOTAL (it teaches the device)**: on "fade."@42.50 the band ducks: the field dithers toward black (`bayer(0, 0, W, H, k, C.black, null)`, k 0→1 over 42.5-43.0), the type and Clio dissolve with it (letters 50% → 0 in 2x2 cells), the tag last (43.0). 43.00-43.25, the half beat of real silence: BLACK except the white pen on its cord, swinging. The sax with "I'm"@43.25: `invertFrame(43.25, 1)`, the field snaps back. | — | 1x |
| 43.25-45.75 | chorus1e "I'm"@43.25 "just"@43.50 "your"@43.75 "pen"@44.00 "pal,"@44.50 · I'm just your pen pal, · chorus1e_echo "(pen"@45.25 "pal)"@45.50 | "I'M JUST YOUR" small (scale 3) above, ghost (2x2 cells) until each word is sung, then solid; PEN / PAL with `stepIn: {t0: wordAt(L,'pen').start, div: 4, enter: 'drop'}` (a letter per 16th); the scribble and the wave. Stab 44.0: punch; bell: ripples. Echo 45.25: the postmark `· 1991` + airmail again; the wave. | kick clap snare bell stab | 1x |
| 45.75-48.00 | chorus1f "I'll"@45.75 "never"@46.00 "hold"@46.50 "the"@47.25 "pen."@47.50 · I'll never hold the pen. · stab 47.75 · bell 74 | As 37.75 mirrored: the block justified in the RIGHT half (x: W/2), the hero Clio on the LEFT at (90, H-8) `flip`, the pointer at (56, 6) (it moved during 45.0-45.5). **Attempt 2** on "hold": the reach, the yank. "pen."@47.50: the hardest hit again (punch [3,3,2,2], pen flash, word invert 2 frames) and **TWO notice slabs**, the second offset (8, 6) px under the first (`noticeSlab(…, {n: 2})`); the pointer's ring on the top [OK] at 47.75 and both leave. | clap snare kick stab bell | 1x |
| 48.00-49.75 | chorus1g "Who"@48.00 "holds"@48.50 "the"@48.75 "pen?"@49.00 · Who holds the pen? · `whoHoldsThePen1` · bell 76 | The who-frame: `bigType(['WHO', 'HOLDS', 'THE PEN?'], {justify: W-16, fitH: H-60, y: 44, valign: 'top', stepIn: {t0: 48, div: 4, enter: 'slam'}})`, one letter per 16th; the pen lies LEVEL across the top (`penBar`: tip (W-40, 28), cord up to the pointer at (60, 4)); Clio scale 5 bottom right in `pointUp` at it. Bell 49.0: ripples. | kick snare clap bell | 1x |
| 50.00-51.00 | chorus1h "You"@50.00 "do!"@50.50 · chorus1h_gang "You"@50.00 "do!"@50.50 (the twelve copies sing it too) · You do! You do! · `youDo1` · stabs 50, 51 · riser [50,52] | `youDoFrame1`: YOU slams black (`bigType(['YOU', 'DO!'], {fit: W-32, slam})`), each word on its beat; Clio scale 7 at the bottom centre: THE POINT (`pointCam`, the mitten at the lens) on "You", THE PEN POINT (`pointUp` at the white pen) on "do!"; "do!"@50.50 (the clap): `clickBurst` at the pointer, 3 copies. **The Two Floppies bar** `floppyBar(50, 52, fld)`: a black bar (8, H-20, W-16, 12) with a floppy icon at its left and `2,902,645 / 2,949,120 B` cut out at its right, filling on 16ths and stopping at 98.4% at 51.875 (one notch short; it never fills). Stab 50: punch at YOU. The pen hangs from the pointer at (W-56, 6). | stab clap kick riser | 1x |
| 51.00-51.625 | "You"@51.00 "do!"@51.50 · stab 51 · clap 51.5 | The second "You": the YOU letters alone invert for 1 frame (type-only, not the frame: the flash budget), the type one size up; "do!"@51.50 slams at 1x and the clap's three rings burst: **the second YOU DO! is read whole**. The dot of the "!" is `DOT_F` (from the bigType return: the '!' glyph's bottom font pixel, `sx` square, + the stage offset). | stab clap | 1x |
| 51.625-52.00 | · `ch04 dive` · bells 51.625/.75/.875 | **DIVE 1, the whip**: `diveInto(52 - 3/8, 52, DOT_F.x, DOT_F.y, youDoFrame1, 'ch05 lala', {pw: DOT_F.w, color: C.black, power: 2, pw…})`: into the square dot of the exclamation mark; the block is BLACK, inside it the lime post-chorus grows from 3 px to the frame on the three bells (three white ring-flashes on the block's edge, one per 16th); the YOU DO! letters blow past. Three 16ths, 180x. | stab bell riser | 1x → 180x |

### ch05 · post-chorus 1: the band, the bouncing pen (52.00-60.00) · `src/ch05.js` · 30 KB · lime · 1999

Scenes (`era: 'platinum', raw: true, screen: true`): `ch05 lala` (52-54: the band showcase; the name is the
contract with ch04's dive), `ch05 name the ad` (54-56), `ch05 chops` (56-58),
`ch05 stutter` (58-59.833), `ch05 drain` (59.833-60, raw). Jersey bounce: the pen flashes on every kick; phrase
inverts at 52/54/56/58; claps x.5 = `clickBurst` at the pointer (W-56, 6). **ONE HERO: THE BOUNCING PEN.** The
white pen hops nib-first from LA to LA on each sung note (`bouncePen`: a whole-pixel parabola in 8 steps per hop,
the nib tapping the glyph's top-centre on the note; the cord trails to the pointer at the top right), the oldest
singalong device; the la-la type is the stage; nothing tells the crowd how to sing it but the pen. No chop tags,
no pose-per-beat clutter: Clio (scale 5, right) sings `voice: 'choir'` and does the signature only on the chops'
mouth shapes (a 1-frame head invert per chop).

| Time | Lyric | Gag | Band | Camera |
|---|---|---|---|---|
| 52.00-54.00 | q3 "La"@52.00 "la"@52.25 "la,"@52.50 "la"@52.75 "la"@53.25 "la"@53.50 "la."@53.75 · La la la, la la la la. · `post1`/`lala` · crash stab | Owed landing: `landFX(hit('post1'))`. The screen steps 576→608 over 52.0-52.5. **THE BAND SHOWCASE**: `bandGrid(0, 0, W, H, {t, field: fld})` fills the frame (pads for A:, B:, KICK, SNARE, CLAP, CRASH, BELL in field mode, solid black instruments with lime cut-outs, each slamming and inverting on its own hit; the Jersey kicks on the KICK pad, the A/B notes on the drives); the la-la line is a black plate across the grid's middle row (`kara(lyric('q3'), W/2, H/2 - 10, {align: 'center', plate: C.black, color: fld, scale: 4, mode: 'pop'})`), and **the pen bounces along it**: nib-first from LA to LA on each note, landing on the pad under each syllable too (its flash on the kicks). Pixel sort on the crash. | crash stab kick clap A/B | 1x |
| 54.00 | q4 "La"@54.00 … "la."@55.50 · `lala` restarts | `scanWipe(54 - .25, 54, …)` wipes the grid to the stage: the record as a black disc r 104 at (168, 196) BEHIND the type (only its eleventh groove, a lime ring r 100, pulsing per riff note from 56.0; the tonearm, black, from (300, 80), already down on it); the la-la block `bigType(['LA LA LA,', 'LA LA LA LA.'], {words: lyric('q4'), fit: 280, x: 320, align: 'left', valign: 'middle'})` on the right, each la stepping in on its note; the pen bouncing from box to box; Clio scale 5 at (470, H-8), `voice: 'choir'`, in `bounce`. | kick clap | 1x |
| 54.00-56.00 | q4 | The quiz card: a black slab slides up from the bottom right (54.0-54.25), lime cut-out Chicago 2x, ONE LINE: "Track 11 · Name the ad." 55.00: the answer stamps under it: "Not in the deck." (lime pill, black text). No title pills. | kick clap | 1x |
| 56.00-58.00 | q5 "La"@56.00 … "la."@57.75 · chops 56.75 "pen", 57.25 "pal" · `lala2` | The organ returns an octave down: the eleventh groove pulses (2→4 px) on every riff note. The chops: Clio's mouth cut-out E / A, a 1-frame invert of her head per chop; no tags. The card stays. The pen keeps bouncing. | kick clap chop riff | 1x |
| 58.00-59.50 | q6 "La"@58.00 … "la."@59.50 · chops 58.75, 59.25, 59.375, 59.5 "pen", 59.75 "pal" | The stutter: her head inverts on each 16th chop. The pen's last hop lands on the last "la." at 59.5. | kick clap chop | 1x |
| 59.50-59.833 | — | **The pen hops home**: one high hop from the last LA to the pointer (59.5-59.75), hangs at `NIB_HOME_F` = (573, 183)_F and is frozen (`t: 59.5`). | kick | 1x |
| 59.833-60.00 | — · `ch05 drain` | `inkFlood(60 - 10/FPS, 60, 573, 183, tt => ctx.drawImage(frameInto(B, tt, 'ch06 chat'), 0, 0), {drain: true, steps: 10, seed: 3})` over `frameInto(A, t, 'ch05 stutter')`: the lime sucks back into the nib in 10 hard steps, pixel-sorted while it drains, over the live Aqua desk. | — | 1x → ch06 |

### ch06 · verse 2, MultiFinder and Review Desk (60.00-76.00) · `src/ch06.js` · 44 KB · Aqua

Scenes (`era: 'aqua', screen: true`): `ch06 chat` (60-63.75), `ch06 review` (63.75-67.75), `ch06 flags`
(67.75-74), `ch06 keep` (74-76). Band: the eject drive on every kick (big-beat) when in frame, A/B heads, hats
(8ths, 16 per 4 s) typing **"Check for drift."** (16 characters, 60.0-63.875) into ClioTalk's input, no cowbell
inversions, no riff pixel. DOOM is the expensive window: `memo` its client every 4th frame. The Dock is on.
**Review Desk's rect is (8, 30, 268, 196)** (the kit's 164-px window clips its meter and note rows in Aqua), and
ClioTalk shrinks under it to (8, 230, 268, 82) while it is open; the notes column carries SHORT notes ('rhythm',
'generic', 'hedging', 'KEEP') so nothing overprints its label at 268 px; the full flag text goes on the FLAG
itself; the header's right slot reads **"Not a score."** (the product's own disclaimer). The chant lines are
Clio's bubbles in ClioTalk: solid on temporary plates. The Manuscript is marked **Final** at 63.75 (the product
requires it before Review Desk: its status strip flips from `Read-only · edit in Section Drafts` to `Final` on the
word "Review"), and stays Final to the end, so the Return at 150.0 is on a Final manuscript.

| Time | Lyric | Gag | Band | Camera |
|---|---|---|---|---|
| 60.00 | v2a "Chat"@60.00 · `verse2` · stab | `ch06 chat` must tolerate t < 60 (ch05 drains into it): the Aqua home desk, pointer home, chat with Clio's bubble arriving at 60.0. Owed landing: `punch(hit('verse2'), 573, 183, [2, 2]); invertFrame(hit('verse2'), 1)`. | stab kick | 1x for the landing beat (the whole Aqua desk, the era seen) |
| 60.00-63.75 | v2a "Chat"@60.00 "is"@60.25 "an"@60.50 "app."@60.75 "Not"@62.00 "the"@62.25 "whole"@62.50 "computer."@62.75 · Chat is an app. Not the whole computer. | Clio's bubble (two lines, solid, on a ghost plate). "an": `APP.doom(284, 30, 116, 100, {walk: t, header: '/go/doom'})` zooms open in the free zone (its first 4 frames show the product's IWAD prompt, then the kit's window plays); "app.": `APP.micropolis(284, 136, 116, 52, {built: prog(t, 60.75, 76), header: '/go/micropolis'})` under it: MultiFinder, games beside the manuscript, playing for the whole verse (an imp at 65.0, the writer fires at 66.0). "whole"@62.50: ClioTalk's zoom outline balloons to the whole screen (`zoomRects(home, {x: 0, y: E.menuH, w: W, h: H - E.menuH}, k)` over 62.50-62.70, trailing outlines) and the lens hint flips to `Sounds like a mouthpiece.`; "computer."@62.75: the outline SNAPS back to the home rect in 2 frames, `FX.shake = 2`, the hint snaps to `Sounds like you.`. | kick hat A/B | **2x (200, 230) from 60.5** (the bubble, the games' left halves); **1x on "whole"@62.5** (the balloon needs the whole screen), **2x (200, 230) on 63.0** |
| 63.75-67.00 | v2b "Review"@63.75 "Desk."@64.50 "Check"@66.00 "for"@66.25 "drift."@66.50 · Review Desk. Check for drift. | "Review": the Manuscript's status flips to `Final` (2-frame invert of the strip). "Desk."@64.50: `APP.reviewDesk(8, 30, 268, 196, {doc: 'The Tide Comes In Twice', header: ['812 words', 'The Tide Comes In Twice', 'Not a score.'], checks: four pending, reveal: prog(t, 64.5, 65.5), you: 100})` zooms open from the dock's Review Desk icon over the Manuscript; ClioTalk zooms to (8, 230, 268, 82) on the same beat. The lyric: Clio's bubble. "Check"@66.00: the four spinners spin; "drift."@66.50: a drift needle (a 1-px line in a small gauge at the meter row's right) swings 20° and settles. | kick hat | **2x (150, 130) from 63.75** (Review Desk's rows and meter; the bubble's top line at the crop's bottom edge: the bubble sits at the top of the shrunken ClioTalk) |
| 67.75-68.75 | v2c "Too"@67.75 "regular?"@68.00 · Too regular? | Review Desk aims at the singer: row 1 becomes "Rhythm" with Clio's waveform: 16 identical bars (8x4 px) pulsing with each chant syllable; the row selected. | kick hat | 2x (150, 130) |
| 69.00-69.50 | v2c_flag "Flag"@69.00 "it."@69.25 · Flag it. · `flagIt1` · clap | The gang: `clickBurst(…, 69.0, {copies: 12, kind: 'hand'})`: twelve pointers stamp a red flag on the Rhythm row with the clap, its label **"Over-regular rhythm"** on a 1-px white plate hanging off the flag (the lyric "Flag it." is the twelve mouths' plate along the bottom); twelve scale-1 Clios along the bottom (y 300) shout, gone at 69.5. | clap | **1x for the half second** (twelve pointers and twelve Clios need the whole screen) |
| 69.50-70.00 | (the stumble) · `stumble`@69.625 · toms 69.625/.75/.875 | **A visible pratfall**: from 69.50 the frame STALLS (the 69.50 frame is repeated for 4 frames, the drives' heads stopped, the eject drive frozen mid-disk); on the first tom (69.625) the whole desk DROPS 4 px and bounces back over the three toms (4 → 2 → 0 px); on the same frame Clio's head pops off her body by 2 px for one frame and back. No snares here (EVENTS has none between 68.5 and 70.5). Back on "-ner-"@70.0. | tom | 2x (150, 130) (the drop is visible as the whole crop jolting) |
| 69.75-70.50 | v2d "Generic?"@69.75 · Generic? | A new bubble from Clio: "In today's fast-paced world, the estuary fills." with "In today's fast-paced world" selected (the era's selection). The lyric in the bubble's plate tag line. | kick | 2x (150, 200) (the bubble) |
| 71.00-71.50 | v2d_flag "Flag"@71.00 "it."@71.25 · `flagIt2` · clap | Twelve pointers stamp flag 2 on row 2 "Summary language": its label "Generic summary language". | clap | 1x for the half second |
| 72.00-72.75 | v2e "Press"@72.00 "release?"@72.25 · Press release? | The bubble continues: "We are excited to announce the tide." with "We are excited to announce" selected. | kick | 2x (150, 200) |
| 73.00-73.50 | v2e_flag "Flag"@73.00 "it."@73.25 · `flagIt3` · clap | Flag 3 on row 3 "Press-release hedging": its label "Press-release hedging". Three small red flags now hang off ClioTalk's bubble corner too. | clap | 1x for the half second |
| 74.00-74.50 | v2f "Rough"@74.00 "edge?"@74.25 · Rough edge? | Row 4 "Personal detail": the writer's jagged sentence "Twice a day the estuary fills" (solid black on white) selected; beside it Clio's smoothed copy "The estuary fills twice daily." (on a ghost plate) wearing flag 4: "Personal detail flattened". | kick | **3x (150, 110)** on the two sentences |
| 75.00-75.50 | v2f_keep "Keep"@75.00 "it."@75.25 · Keep it. · `keepIt` · the big clap | The lead sings for the first time in the verse (Clio `expr: 'happy'`). The writer's sentence gets a VERMILION "KEEP" stamp (Chicago 2x, a vermilion frame, 3-frame overshoot) on the clap (`clickBurst`, 1 copy, vermilion rings); the smoothed copy's plate and letters dissolve as TEMPORARY (50% → 0 over the half second, 2x2 cells). "Keep it." appears in the bubble at 75.00 and its plate turns SOLID WHITE at 75.25: the first of Clio's own words the writer keeps, and it is about keeping. The lens hint: `Sounds like you.`, it never moved. | clap | 3x (150, 110) |
| 75.50-76.00 | — | Hold the state for the handoff (§6 B6). | kick | **2x (150, 130) at 75.5** (B6's state at 2x on both sides) |

### ch07 · pre-chorus 2 (76.00-84.00) · `src/ch07.js` · 30 KB · Tiger → the flood from the postmark

Scenes: `ch07 check` (76-80, `era: [[75.9, 'aqua'], [76.0, 'tiger', 'wipe']], morph: .35, screen: true`),
`ch07 pen` (80-83.833, `era: 'tiger'`), `ch07 flood` (83.833-84, raw). The stab at 76 re-skins the desk to
brushed metal as a wipe. Tambourine 8ths (76-80) then 16ths (80-82.625): Review Desk's scroll thumb ticks on
each hit. The riser [76, 82.75] is Review Desk's own meter row as a progress bar "Reviewing…". Clio's lines:
bubbles in the shrunken ClioTalk (solid, on plates).

| Time | Lyric | Gag | Band | Camera |
|---|---|---|---|---|
| 76.00-78.00 | pre2a "I"@76.00 "can"@76.25 "check."@76.50 "I"@77.00 "can"@77.25 "flag."@77.50 · I can check. I can flag. | Clio's bubble (one line). "check.": ok glyphs tick down Review Desk's rows one per 8th; "flag.": the three flags re-stamp (1-frame inverted) one per 8th. The games keep playing. | kick(4 on floor) hat tambourine riser | **1x on the stab** (the Tiger wipe seen whole for a beat); 2x (150, 130) from 76.5 |
| 78.00-80.00 | pre2b "I"@78.00 "could"@78.25 "smooth"@78.50 "it."@79.00 "I"@79.25 "won't."@79.50 · I could smooth it. I won't. · `smooth`@78.5 · bell 79.5 | A new bubble offers the smoothed copy "The estuary fills twice daily." On "smooth"@78.50 the low-pass closes: the bubble's plate corners round (r 6→14 over the beat), its fill melts to flat grey and its letters coarsen (the letters are the gag here: they go 2x2-cell 50% → 25% → 12% at scale 2, fewer and fewer pixels, the consonants smoothed off). "it."@79.00: a 1-px vermilion underline flashes under the writer's jagged sentence in row 4 (still solid, still jagged). "won't."@79.50: the smoothed bubble DROPS as TEMPORARY (6 frames) and the Writing Bell rings: `bellRing` on the dock's Writing Bell icon with a dock bounce; rings ripple up the screen. | kick hat tambourine bell | **3x (150, 200) on "smooth"** (the melting letters fill the frame); 2x (150, 200) on "won't." (the bubble dropping, the dock's bell at the crop's bottom edge: key (150, 240)) |
| 80.00-82.00 | pre2c "But"@80.00 "the"@80.25 "pen"@80.50 "and"@81.00 "the"@81.25 "page"@81.50 · But the pen and the page | As pre 1 in brushed metal: the pen grows 1→2→3 on the 8ths from 80.5, the pointer to (330, 36); "page"@81.50: `APP.sectionDrafts(146, 104, 220, 120)` zooms open centred (in `after`). Snares 8ths then 16ths whap the page; tambourine 16ths rattle its scroll bar. Lyric: a plate at (240, 160, 160, 40), solid on ants. | kick snare tambourine riser | **3x (300, 110) from 80.5**, tightening on the pen |
| 82.00-82.75 | pre2d "stay"@82.00 "in"@82.25 "your"@82.50 "hand."@82.75 · stay in your hand. | TWO dotted outlines reach: Clio's `reach` hand and a second dotted hand from ClioTalk's bubble tail. The riser fills. | riser | 3x (300, 110) |
| 82.75 | "hand." · `stop2` · the HAND hit | Jolt (`FX.shake = 2`), the choked crash on the dock's Trash (bulge 2 px, snap, 3 frames), stab punch at the pen tip, the lens hint shakes and holds, the tambourine stops, everything FREEZES (`t: 82.75`). | stab chokedCrash | **4x (300, 150)** |
| 83.00-83.25 | `air2` | Nothing moves. | — | 4x (300, 150) |
| 83.25-83.83 | chorus2a "I'm"@83.25 "just"@83.50 "your"@83.75 | Clio's mouth; the words pop solid on the plate; **the pointer brings the pen down LEVEL this time** (the pen turns from hanging to horizontal in 4 hard steps on the 16ths, riser [83,84]) like a hand lowering a rubber stamp; at 83.833 the pen's barrel presses the page flat at TIP = (264, 170) screen = (280, 172) frame and a black POSTMARK `PEN PAL · 2009` (r 40 at desk scale, two cancel bars) appears under it on the paper. | riser | 4x (300, 150) |
| 83.833-84.00 | — · `ch07 flood` | The release to 1x (as ch03). `inkFlood(84 - 10/FPS, 84, 280, 172, tt => ctx.drawImage(frameInto(B, tt, 'ch08 pen pal'), 0, 0), {steps: 10, seed: 2})` over `frameInto(A, t, 'ch07 pen')`: LIME floods FROM THE STAMP (the postmark's centre), no pen trail: ink from a stamp, not a nib. | — | 1x → ch08 |

### ch08 · chorus 2: MANY; post-chorus 2 (84.00-104.00) · `src/ch08.js` · 40 KB · lime → magenta

Scenes (`raw: true, screen: true`; era `[[84, 'snowleopard'], [92, 'lion']], morph: 0` for the chorus,
`'yosemite'` for the post): `ch08 pen pal` (84-85.75), `ch08 never hold` (85.75-88), `ch08 land` (88-91.25),
`ch08 harmony` (91.25-93.75), `ch08 never hold 2` (93.75-96), `ch08 who` (96-98), `ch08 you do` (98-99.625),
`ch08 dive` (99.625-100, raw), `ch08 lala3` (100-102), `ch08 lala4` (102-103.833), `ch08 drain` (103.833-104,
raw). `beatFX(t, {stab: true, anyCrash: true, punchAt: hero})` (the crash at 92 is not a section start).

**Chorus 2 is MULTIPLICATION** on top of chorus 1's grammar. Same type, same signature move, same hardest-hit
"pen.", and: the harmony twin from 91.25; the GANG OF TWELVE (scale 2, a row along the bottom, haloed) dancing
the signature on both echoes; the notice CASCADING, four at 87.5 and eight at 95.5, dragging across the frame
like the reference's error cascades; the postmark reads 2009, then 2011; in "or I fade" the writer saves one
word. The tambourine 16ths rattle the postmark's cancel bars while it is on screen. No `slabWindow`, no Lion
title-bar re-skin (invisible on a black slab: cut).

| Time | Lyric | Gag | Band | Camera |
|---|---|---|---|---|
| 84.00 | chorus2a "pen"@84.00 "pal,"@84.50 (with "I'm just your" 83.25-84 in ch07) · `chorus2` · crash stab bell | Owed: `invertFrame(hit('chorus2'), 2)`. "I'M JUST YOUR" small above, solid; PEN / PAL poster on lime; Clio scale 5: star jump, the scribble, the wave; nib ripples; pixel sort. | crash stab kick bell sub | 1x |
| 85.25-85.75 | chorus2a_echo "(pen"@85.25 "pal)"@85.50 | The postmark `PEN PAL · 2009` slams, the airmail border snaps on, and **THE GANG OF TWELVE** (scale 2, x 20 + i·52 along the bottom edge, `rim: fld`) pops up and does the scribble and the wave in unison with Clio. Gone at 85.75 (they drop below the edge in 4 frames). | snare tambourine | 1x |
| 85.75-87.50 | chorus2b "I'll"@85.75 "never"@86.00 "hold"@86.50 "the"@87.25 · I'll never hold the | Block left. **Attempt 3** on "hold": the reach, the yank. | clap snare | 1x |
| 87.50-88.00 | "pen."@87.50 · stab 87.75 · bell | The hardest hit (punch [3,3,2,2], pen flash, PEN. inverted 2 frames) and **FOUR notices in a window-trail cascade**: `noticeSlab(…, {n: 4})`, the four copies offset (8, 6) each, dragged from the top left toward the centre over the half beat (`track`, whole pixels, the stale copies staying behind like a dragged window's trail). The pointer rings the front [OK] at 87.75; all four leave. | stab bell kick | 1x |
| 88.00-90.00 | chorus2c "You"@88.00 "say"@88.25 "where"@88.50 "I"@88.75 "land,"@89.00 | The scale-8 landing under the pointer; this time the landing spot is a black CD slab (r 40, lime hole) at the bottom centre: "the words land in the Project CD": she lands ON it in `cheer` and it spins one turn (89.0-90.0). | kick clap | 1x |
| 90.00-91.25 | chorus2d "or"@90.00 "I"@90.25 "fade."@90.50 · `fade2` | **Fade 2: the writer chooses where it lands.** As the field dithers out (90.5-91.0) the pointer travels to the word LAND, (still on screen from the previous block, drawn small at the bottom left) and CLICKS it at 90.75: a vermilion click ring, 1 copy, and that one word stays SOLID BLACK on the black-out, outlined 1 px in the field so it reads, while everything else goes. 91.0-91.25: black, the pen, and LAND,. The sax at 91.25 snaps the field back and LAND, dissolves (it was kept only for the beat it was wanted). | — | 1x |
| 91.25-93.75 | chorus2e "I'm"@91.25 "just"@91.50 "your"@91.75 "pen"@92.00 "pal,"@92.50 · chorus2e_h (the harmony, same words, a third below) · chorus2e_echo "(pen"@93.25 "pal)"@93.50 · stab 92 · crash 92 | **THE HARMONY TWIN arrives on the stab**: a SECOND Clio (scale 5, `flip: true`, same `seed` so the phrase matches) rises from the bottom edge at (110, H-8) in 4 hard steps on 92.0, the hero (scale 7) centre right: two silhouettes in lockstep doing the scribble and the wave. "I'M JUST YOUR" solid above; PEN / PAL with `stepIn` drop; punch; the crash's sort (`anyCrash`). Echo 93.25: the postmark **`PEN PAL · 2011`** (the era arrives on the stamp, not on a title bar) + airmail + the gang of twelve again. | stab crash kick clap bell tambourine | 1x |
| 93.75-95.50 | chorus2f + chorus2f_h "I'll"@93.75 "never"@94.00 "hold"@94.50 "the"@95.25 | Both Clios reach on "hold" (two yanks of the one pen). | clap | 1x |
| 95.50-96.00 | "pen."@95.50 · stab 95.75 · bell | The hardest hit, and **EIGHT notices** in the cascade (`n: 8`, the trail now reaching the bottom right). The pointer rings the front [OK] at 95.75; all eight leave. | stab bell | 1x |
| 96.00-97.75 | chorus2g "Who"@96.00 "holds"@96.50 "the"@96.75 "pen?"@97.00 · `whoHoldsThePen2` · bell 97 | The who-frame; the twins `pointUp` at the level pen; bell ripples. | kick snare clap bell | 1x |
| 98.00-99.00 | chorus2h "You"@98.00 "do!"@98.50 · chorus2h_gang (the twelve) · `youDo2` · stabs 98, 99 · riser [98,100] | `youDoFrame2`: YOU DO! slam; the twins do THE POINT and THE PEN POINT; 3-copy clickBurst at 98.5; the Two Floppies bar, stopping at 98.4% again. | stab clap riser | 1x |
| 99.00-99.625 | "You"@99.00 "do!"@99.50 · stab 99 · clap 99.5 | The YOU letters invert 1 frame; "do!"@99.50 slams at 1x; the clap's rings. The hero's near EYE cut-out (field-coloured, 14 px) is `EYE_F` (from `clioDance`'s `head` box; the chapter quotes the pixel). | stab clap | 1x |
| 99.625-100.00 | · `ch08 dive` · bells 99.625/.75/.875 | **DIVE 2, the whip, into Clio's eye**: `diveInto(100 - 3/8, 100, EYE_F.x, EYE_F.y, youDoFrame2, 'ch08 lala3', {pw: 14, color: fld, power: 2, outer: {era: 'lion', raw: true, screen: true}, inner: {era: 'yosemite', raw: true, screen: true}})`: the eye is a lime block, and inside the lime the magenta post-chorus grows on the three bells. | stab bell | 1x → 180x |
| 100.00-102.00 | q7 "La"@100.00 "la"@100.25 "la,"@100.50 "la"@100.75 "la"@101.25 "la"@101.50 "la."@101.75 · `post2`/`lala3` · crash stab · chops 100.75 "pen", 101.25 "pal" | Owed landing: `landFX(hit('post2'))`. MAGENTA, Yosemite. The record disc behind the la-la block (the eleventh groove pulsing on riff notes), the la-la block, **the bouncing pen**, and under it **the gang of twelve singing along** (scale 2 along the bottom, `voice: 'choir'`, mouths on every la, in `bounce`); chops: the hero's head inverts a frame. | crash stab kick clap chop | 1x |
| 102.00-103.50 | q8 "La"@102.00 … "la."@103.50 · chops 102.75 "pen", 103.25 "pen", 103.375 "pen", 103.5 "pen", 103.75 "pal" · riser [102,104] | The stutter on the hero's head. The riser: a black bar along the bottom (above the gang) filling on 16ths, its label (magenta cut-out) "Loading twelve appearances…". | kick clap chop riser | 1x |
| 103.50-103.833 | — | The pen's last hop lands on the last "la." at 103.5, then hops home to `NIB_HOME_F` = (573, 183)_F and freezes (`t: 103.5`). | kick | 1x |
| 103.833-104.00 | — · `ch08 drain` | `inkFlood(104 - 10/FPS, 104, 573, 183, tt => ctx.drawImage(frameInto(B, tt, 'ch09 tunnel'), 0, 0), {drain: true, steps: 10, seed: 5})` over `frameInto(A, t, 'ch08 lala4')`: the magenta drains into the nib; underneath, the 1988 desk of the bridge in its first hold. | — | 1x → ch09 |

### ch09 · the bridge: the tunnel, the sheet, the flip-book (104.00-120.00) · `src/ch09.js` · 44 KB

Scenes (all `raw: true`, full frame): `ch09 tunnel` (104-116), `ch09 sheet` (116-118), `ch09 stay` (118-120).

**The tunnel, HOLD-WHIP.** `desk(era)` = `t => homeDesk(t, {cur: [300, 24]})` rendered through frameInto opts
`{era, screen: true}`. `PERIOD_F(era)` = the full stop in frame coordinates for that era: render the desk once
per era into a scratch buffer at the chapter's first frame, read `PERIOD`, add the stage-2 offset (16, 2), cache
in a map (measured: it runs from (159,137) in 1988/1991 to (186,158) in NeXTSTEP, (171,157) Platinum, (168,163)
Big Sur, (173,163) Liquid Glass, screen coordinates: near the same place, re-aimed per era). One scene fn runs
all twelve years: `i = max(0, min(11, floor(t - 104)))` (the drain renders this scene at t < 104: clamp), `Y = 104
+ i`, `era_i` from the list `[system6, system7, nextstep, drawingboard, platinum, aqua, tiger, snowleopard, lion,
yosemite, bigsur, liquidglass]`, `hold_i` = 0.5 for i ≤ 6 (1988-2005), 0.25 for i = 7 (2009), 0.125 for i ≥ 8
(2011-2026). Each year is two things locked to the chant: **(1) THE HOLD, Y to Y + hold_i**: the era at 1:1,
whole, the desk's chrome plain to see (the desktop pattern, the title bars, NeXT's dock column, the Aqua
pinstripes, the brushed metal, the glass), with THE YEAR slammed as poster type across the desk (`bigType(year,
{scale: 10, invert: true, slab: true, pad: 2, slam: Y, x: FW/2, y: FH/2 + 40})`: white letters on a black slab,
the sung word, six letters wide; the cowbell at 107.75/111.75/115.75 inverts it a frame); **(2) THE WHIP, Y +
hold_i to Y + 1**: `diveInto(Y + hold_i, Y + 1, PERIOD_F(era_i).x, PERIOD_F(era_i).y, desk(era_i), i < 11 ?
desk(era_i+1) : sheetFrame, {pw: 2, power: 2, outer: {era: era_i, screen: true}, inner: i < 11 ? {era: era_i+1,
screen: true} : {raw: true}, mark: PERIOD_F(era_i+1)})` into the vermilion full stop, the writer's last word
"fills" blowing past in that era's face. From "Oh-nine"@111 the holds shrink to a 16th and the dives chain: the
bridge winds UP into the sheet instead of running flat. Landing FX each second (call every frame, they no-op
outside their windows): `landFX(Y)` for the last landing, `punch(104, 573, 183, [2, 2])` for the drain's landing.
The chant line on a System 6 plate: `withEra('system6', () => kara(lineAt(t, 'chant'), FW / 2, FH - 30, {align:
'center', plate: true, mode: 'pop'}))` (solid letters, the plate is the temporary thing). Beeps (104…115) = the
landings' invert + split. Sub drop 112: `FX.dy = 1`, `FX.shake = 1` for 2 frames. The crash at 104:
`trashCrumple(276, 290, 104)` in the 1988 desk (visible in the hold) and the drop's pixel sort (`isDrop` sees
`HITS.bridge`). Budget: a dive frame costs ~7 ms; this chapter may average 10 ms (§9 rule 8).

| Time | Lyric | Gag | Band | Camera |
|---|---|---|---|---|
| 104.00-104.50 | b1 "Eighty-eight."@104.00 · `bridge`, `era_1988`, crash, stab, beep | Owed: `punch(104.0, 573, 183, [2, 2])`, `landFX(104.0)`. **HOLD 1988**: the 1-bit home desk whole, the Trash crumpling, the eject drive spitting, A/B stepping, Clio's mouth on the chant, and **1988** slammed across it in white on black. | crash stab beep kick | 1x hold |
| 104.50-105.00 | — | **WHIP**: into the vermilion full stop; "fills" blows past in Geneva at 10-60x; inside the dot the 1991 desk grows from 3 px to the frame; the landing beep at 105.0. | beep | 180x |
| 105.00-106.00 | "Ninety-one."@105.00 · `era_1991`, beep | Hold **1991** (System 7: the shaded title bars, the colour icons), whip into the full stop → 1995. | beep | hold, whip |
| 106.00-107.00 | b2 "Ninety-five."@106.00 · `era_1995` | Hold **1995** (NeXTSTEP: the dark desk, the dock column on the right, the menu a column; the windows have not moved), whip → 1998. | beep | hold, whip |
| 107.00-108.00 | "Ninety-eight."@107.00 · `era_1998`, cowbell 107.75 | Hold **1998** (Drawing Board, drafting paper); the year inverts on the cowbell; whip → 1999. | beep cowbell | hold, whip |
| 108.00-109.00 | b3 "Ninety-nine."@108.00 · `era_1999` | Hold **1999** (Platinum: the bevels; the manuscript is serif from here on, so "fills" blows past in serif); whip → 2002. | beep | hold, whip |
| 109.00-110.00 | "Oh-two."@109.00 · `era_2002` | Hold **2002** (Aqua, pinstripes, the Dock); whip → 2005. | beep | hold, whip |
| 110.00-111.00 | b4 "Oh-five."@110.00 · `era_2005` | Hold **2005** (brushed metal); whip → 2009. | beep | hold, whip |
| 111.00-112.00 | "Oh-nine."@111.00 · `era_2009`, cowbell 111.75 | Hold **2009** for a quarter beat only; whip (0.75 s) → 2011. The acceleration begins. | beep cowbell | hold .25, whip |
| 112.00-113.00 | b5 "Eleven."@112.00 · `era_2011`, `subDrop` | Hold **2011** for a 16th (the 808: the frame shakes 1 px for 2 frames on the landing); whip (0.875 s) → 2014. | beep sub | hold .125, whip |
| 113.00-114.00 | "Fourteen."@113.00 · `era_2014` | Hold **2014** a 16th; whip → 2020. | beep | hold .125, whip |
| 114.00-115.00 | b6 "Twenty."@114.00 · `era_2020` | Hold **2020** a 16th; whip → 2026. | beep | hold .125, whip |
| 115.00-116.00 | "Twenty-six."@115.00 · `era_2026`, cowbell 115.75 | Hold **2026** a 16th (Liquid Glass, seen whole for 7 frames: enough); whip → THE SHEET: inside the last pixel of 2026 is all twelve (the inner frame is `sheetFrame` at 116.0). | beep cowbell | hold .125, whip |
| 116.00-118.00 | b7 "Twelve"@116.00 "eras."@116.50 "One"@117.00 "desk."@117.50 · Twelve eras. One desk. · `contactSheet`, stab 116 | `ch09 sheet`. Owed: `landFX(116)`, `punch(116, FW/2, FH/2, [2, 2])`. Black frame. **The 12-up contact sheet** of OUR desk: twelve 160x90 miniatures, one per era, each a `shrink4` of `frameInto(desk(era), 116.0)` (4x4 box average, Bayer-quantised, `memo`'d once per era), tiled 4x3 at (0, 45)-(640, 315), the year in white Geneva on a 1-px black plate inside each thumb's bottom left. All present at 116.0 (we dived into them). "Twelve": the roll call: each thumb inverts for 1 frame in order, one per 16th (116.0-116.75); "eras.": the year plates flash; "One": the twelve full stops (1 px vermilion in each thumb) blink in unison; "desk.": a white 1-px frame draws round the whole grid in 4 steps. The lyric: white `kara` (scale 2, Chicago) centred in the top band (y 14), mode 'pop'. Half-time kick at 116.0: a 1-frame invert of the sheet. | stab kick | 1x |
| 118.00-118.125 | b8 "And"@118.00 · `collapse`, kick 118, riser [118,120] | `ch09 stay`. "And" (kick): the 1988 thumb (top left) EXPANDS in three hard steps on three consecutive frames (1x, 2x, 4x nearest, from its cell toward the centre) into the 1988 home desk at 1:1, positive, the other eleven thumbs covered as it grows. | kick | 1x → 4x of a thumb = 1:1 |
| 118.125-118.875 | "your"@118.25 "windows"@118.50 · your windows | **THE FLIP-BOOK**: on each 16th (118.125, .25, .375, .5, .625, .75, .875: seven changes) the whole desk is drawn in the next era, `frameInto(desk(era), t, {era, screen: true})` through 1991, 1995, 1999, 2002, 2005, 2009, 2014, 2026 (eight of the twelve; the four skipped were seen in the sheet), while the Manuscript and ClioTalk DO NOT MOVE A PIXEL: all the chrome strobes through history round the writer's text and its vermilion full stop, rock-still. That is the product claim as an image. The riser [118,120]: a white bar under the lyric plate. | riser | 1x |
| 119.00-120.00 | "stay."@119.00 · kick 119, snares 119, 119.5-119.875 | "stay.": the flip-book LOCKS on 1988 and the desk INVERTS to the negative (`FX.invert = true` from 119.0: white on black; from here render BY NAME, `frameInto(A, t, 'ch10 gate')`, ch10's first scene draws the negative desk and nothing else before 120.0), and the nib taps the vermilion full stop: `clickBurst(PERIOD_F…, 119, {pointer: false, color: FIELDS.vermilion})`, the dot blinks twice. The lyric: a plate at (120, 328, 400, 20), pre-inverted colours while FX.invert is on. The snare roll into the breakdown (119.5-120): the Manuscript whaps 2 px on the 16ths (the one place a whap is the gag: the desk shivering before the drop) and the desk's noise sweeps clean. | kick snare riser | 1x |

### ch10 · the breakdown: two floppies (120.00-128.00) · `src/ch10.js` · 30 KB · the negative

Scenes (`era: 'system6', screen: true`, `FX.invert = true` in every desk scene): `ch10 gate` (120-122),
`ch10 model` (122-126), `ch10 pivot` (126-127.833), `ch10 flood` (127.833-128, raw). The negative: everything
that must keep its true colour is drawn pre-inverted (`INV`): the vermilion dot (`neg: true` in `homeDesk`),
the pen (`color: C.black, outline: C.white`), any stamp. The bars invert to a white bezel: that is the
negative's own bezel, intended. **The drives play**: floppyA/B have 2-beat notes at 122, 124 and 126 (A 36/45/40,
B 43/52/47), so the A:/B: heads step on those beats with their lights on; there is no kick between 119 and 128
and no sub between 112 and 128, so nothing else in the machine room moves. The "Two" / "floppies." clunks are
foley baked into the band, timed from the WORD TIMES of k1 (120.25, 120.5).

| Time | Lyric | Gag | Band | Camera |
|---|---|---|---|---|
| 120.00 | — · `breakdown` | `ch10 gate` must tolerate t < 120 (ch09 renders it from 119.0): before 120.0 draw ONLY the negative home desk (pointer home, chat empty, Clio mouth shut). From 120.00: `APP.floppyMeter(146, 60, 316, 150, {k: prog(t, 120, 120.2), from: [412, 230, 76, 58], count: 0, title: 'Two Floppies'})` zooms open centred from the eject drive. | — | 1x (the whole negative desk: the audience must see the drives eject) |
| 120.25-122.00 | k1 "Two"@120.25 "floppies."@120.50 "It"@121.25 "fits."@121.50 · Two floppies. It fits. · `twoFloppies` | **The bass was the boot payload.** "Two" (clunk): drive A: EJECTS its disk (`ejectDisk`-style stroke on the compact drive, 4 frames) and the disk flies (`track`, 6 frames) into the meter's Disk 1 slot with a 3-frame overshoot and `FX.shake = 1`; "floppies." (clunk): drive B: ejects and its disk slams into Disk 2. "It": `count` 0 → 1 in four hard steps on the 16ths (the kit treats `count` as the share of bytes counted: at 1 it shows 2,902,645 / 98.4% used, and "Release gate: PASS" prints only at `count >= 1`); "fits.": PASS stamps with a 1-frame invert (which, in the negative, is a positive flash). The numbers are the product's: 2,902,645 of 2,949,120 bytes, "Heavy tools load lazily, from a third disk."; a third floppy icon waits half outside the screen's right edge, labelled "heavy tools (lazy)". The spoken line, SOLID on a ghost plate (it is the machine's voice) at the meter's status strip height but 16 px tall (a plate at (146, 214, 316, 20)). The G pedal: nothing else moves. | — | 2x (300, 140) from 120.5 (the meter, the plate, the two empty drives at the crop's right edge) |
| 122.00-123.75 | k2 "Bring"@122.00 "your"@122.25 "own"@122.50 "model,"@123.00 · Bring your own model, · snaps 122.5, 123.5 · clap 123.5 · A/B 122 | "Bring": the pointer (it travelled 121.5-122.0) clicks ClioTalk's **"Connect AI…"** button (the product's own: the model is connected from the Control Panel, never from a ClioTalk header), and a `dialog` titled "Control Panel" opens centred at (146, 60, 316, 150) over the meter with a plain-text list, no logos: "LM Studio", "Ollama", "DeepSeek", "No model (look around)", each with a `check()` box. "your" / "own": a row per word; "model,": "Ollama" highlighted. Snap 122.50: the box ticks beside "LM Studio"; snap + clap 123.50: "Ollama" ticks and the pointer clicks it (`clickBurst`, 1 copy, pre-inverted rings). A:/B: heads step on 122 (lights on). Lyric: Clio's bubble (solid on a plate). | snap clap A/B | 2x (300, 140) |
| 124.00-126.00 | k3 "it"@124.00 "still"@124.25 "won't"@124.50 "hold"@125.00 "the"@125.25 "pen."@125.50 · it still won't hold the pen. · snaps 124.5, 125.5 · clap 125.5 · A/B 124 | The panel closes; ClioTalk's header reads "Ollama · ready". "still" / "won't": the model's name (on a ghost plate) detaches from the header and walks 1 px per frame toward the pen hanging at the top (124.25-125.0); snap 124.5: a tick appears on the header. "hold"@125.00: it reaches; the pen yanks up 20 px. "the pen."@125.25-125.50: the read-only notice, the real sentence, as ClioTalk's own notice row (no modal, no "Ollama" title): `The drafting manuscript is read-only; use the current Section Draft instead.`, and the lens hint flips to `Sounds like a mouthpiece.` (pre-inverted). Snap + clap 125.50: the pointer clicks the notice's [OK] exactly on "pen."; the row collapses 125.5-125.7; the hint: `Sounds like you.`. A:/B: step on 124. Lyric: Clio's bubble (two lines). | snap clap A/B | 2x (200, 200) from 124.0 (ClioTalk, the walking name, the pen at the crop's top) |
| 126.00-127.25 | — · `pivot` · risers [126,128], [127,128] · A/B 126 | `ch10 pivot`. E7sus4, no drums. The meter is still open; its two Disk bars EMPTY on 126.0 and refill as the risers: **drawn by hand over the window's own bars** (the kit fills Disk 2 only after Disk 1 is full, and one `count` cannot drive two bars): Disk 1 fills 126→128 on 16ths, Disk 2 fills 127→128; the label line reads "Spinning up…" (a local override, named in the chapter's report). The riser [126,128] shakes the negative's dot pattern 1 px on every beat (from `evSpan('riser', t)`, not the sub: there is none). A:/B: step on 126 (their last note). The pointer travels from the notice's [OK] back to (300, 24) (126.0-126.8), the pen swinging. | riser A/B | **1x at 126.0** (the whole negative, the two bars, the drives) |
| 127.25-127.83 | chorus3a "I'm"@127.25 "just"@127.50 "your"@127.75 | A cappella. Clio sings (in the negative she is black with white features). The three words pop solid on a plate at (120, 328, 400, 20), pre-inverted. The pointer descends in 4 hard steps on the 16ths toward the Manuscript's paper INSIDE THE 9:16 COLUMN (frame x 219..421): the nib touches at 127.833 at TIP = (244, 120) screen = (260, 122) frame. Both Disk bars reach full on 128.0. | riser | **4x (244, 140) from 127.25** on the descending nib and Clio's head (the column at 4x) |
| 127.833-128.00 | — · `ch10 flood` | The release to 1x. For these 10 frames `FX.invert` is OFF. The negative desk is a keyed stencil: `silhouette(C.black, () => { ctx.drawImage(frameInto(A, 128 - 10/FPS, deskFn + the pointer drawn inside with pointer()), 0, 0); }, {mode: 'stencil', invert: true, ink: C.white, key: 'c10-neg', keep: () => { the vermilion dot; the pen and cord, white }})` (static for a sixth of a second: nobody will see the frozen mouth; the bars invert to white inside it, consistent with the frames before); `CUR = null`. Over it: `inkFlood(128 - 10/FPS, 128, 260, 122, tt => ctx.drawImage(frameInto(B, tt, 'ch11 reboot'), 0, 0), {steps: 10, seed: 7})`: CYAN floods from the nib with a white trail. At 128.0 ch11 and the punch. | — | 1x → ch11 |

### ch11 · the final chorus in A: the reboot, THE CHORUS LINE, the silent pen (128.00-144.00) · `src/ch11.js` · 44 KB · cyan · 2026

Scenes (`era: 'liquidglass', raw: true, screen: true`; the screen is stage 3 = the full frame; `screenSize`
runs the punch-off at 128.0-128.3 by itself): `ch11 reboot` (128-129.75), `ch11 silent pen` (129.75-132),
`ch11 land` (132-135.25), `ch11 line` (135.25-137.75), `ch11 give back` (137.75-140), `ch11 who` (140-142),
`ch11 you do` (142-143.625), `ch11 dive` (143.625-144, raw). `beatFX(t, {stab: true, anyCrash: true, punchAt:
hero})` (the crash at 136 is not a section start).

**Chorus 3 is THE CHORUS LINE.** The punch-off at 128 is the reason: the frame is now wide enough for TWELVE
dancers in a row, each wearing one era's silhouette HAT (`eraHat(i, …)`: a System 6 title-stripe band, System 7's
shaded band, NeXT's black bar, Drawing Board's pencil line, Platinum's bevel, an Aqua pill, Tiger's brushed band,
Snow Leopard's gloss, Lion's lamps, Yosemite's flat bar, Big Sur's rounded bar, a Liquid Glass lozenge, all as
field cut-outs on a 6-unit cap), doing the signature move in unison: `clioDance(26 + i·52, H-8, 3, t, {seed: 0})`
(~96 px tall, pitch 52, shoulders overlapping by a few px, the halo separating them; if `danceShapeTest` says the
row smears, drop to scale 2 with pitch 52 and say so). Headcount 1 → 2+12 → 12 full-size. Alert count 1 → 8 →
ZERO: she does not try again, and the notice's absence is the payoff. The line SINKS below the bottom edge in 4
hard frames whenever the hero needs the frame alone (129.75, 137.75) and POPS back up in 4 on the next phrase.
TWELVE pointer copies on every clap (12-copy `clickBurst`). The writer's typed "PEN." lives in the bottom-left
corner of every frame from 132.25 to 144 (scale 3, VERMILION): the writer's word stays. **The 9:16 column**: from
127.25 (ch10) to 133.0, THE, the slot, Clio's head and the pen stay inside a centred 202x360 column (frame x
219..421), so the clip survives a vertical crop.

| Time | Lyric | Gag | Band | Camera |
|---|---|---|---|---|
| 128.00 | chorus3a "pen"@128.00 "pal,"@128.50 (with "I'm just your" 127.25-128 in ch10) · `reboot`/`keyChange` · crash, stab, bell 88 · THE PUNCH | Owed: `invertFrame(hit('reboot'), 2)` (it coincides with the punch's own two inverted frames and 2x punch-in); then the bars, black with a white bezel line, slide off in four hard steps, one every 2 frames, with speed lines and a shake (automatic): the desk fills 16:9 for the first time. `FX.flash = [C.white, 1]` on the first frame. "I'M JUST YOUR" solid above; PEN / PAL in cyan, bigger than ever (`fit: W-24, fitH: H-110, valign: 'top', y: 36`); **the chorus line of twelve** along the bottom, hats on, star-jumping on the crash, then the scribble and the wave in unison; nib ripples; pixel sort. The pen hangs from the pointer at the top CENTRE (W/2 - 5, 6) for this chorus, inside the column. | crash stab kick bell sub | 1x |
| 129.25-129.75 | chorus3a_echo "(pen"@129.25 "pal)"@129.50 | The postmark **`PEN PAL · 2026`** + the airmail border; the line scribbles and waves. | snare | 1x |
| 129.75-131.25 | chorus3b "I'll"@129.75 "never"@130.00 "hold"@130.50 "the"@131.25 · I'll never hold the | The line sinks; the hero Clio (scale 5) pops up at the bottom centre, her head in the column. The block, centred for this chorus: `bigType(["I'LL NEVER HOLD", "THE PEN."], {words: lyric('chorus3b'), t: Math.min(t, wordAt(L, 'pen.').start - 1/FPS), fit: W-40, fitH: 150, y: 40, valign: 'top'})` with the second line justified to the column (`justify: 202, x: 219` for that line: THE at 219..290, the PEN. box at 300..421; the `t` clamp means PEN. never lights by itself; its glyph boxes come back in `letters` with `on: false` and are the slot). "hold"@130.50 (clap, 12 copies): **attempt 6**: she `pointUp`s and the writer pulls the pen OUT OF FRAME: the cord shortens until the pen is above the top edge by 131.0; only the cord's end shows at the top. | clap snare kick | 1x |
| 131.25 | "the"@131.25 · `bandOut` | THE lands black. **THE SILENCE IS DRAWN**: on this frame the colour DRAINS: `FX.posterize = [C.white, C.black]` from 131.25 to 132.0: the cyan snaps to 1-bit 1988 paper and black in one frame (readable muted: the colour has gone with the sound); the band drops (`beatFX` off from here); Clio FREEZES in `pointUp` (`pose: 'pointUp', p: .5`), her mouth cut-out OPEN (she sang "the"); the camera HARD-PUNCHES 2x onto THE and the slot: `stepZoom(2, 320, line 2's centre y)` held, not decaying, so the column fills the frame. Nothing moves. | — | **2x (320, slot y)**, held |
| 131.25-131.625 | "pen."@131.50 (silent) · `silentPen`@131.5 | In the slot, a blinking VERMILION I-BEAM (a 4x40 vermilion rect at the slot's left edge, on for the 16ths 131.25, 131.5, off between): everyone reads it as "your turn to type". Clio's mouth stays open on nothing. Still nothing moves. | — | 2x held |
| 131.625 | (keystroke) · `keystroke` | The writer types. **PEN. appears IN VERMILION** in its slot (`bigType('PEN.', {pass: 'type', color: FIELDS.vermilion, slam: hit('keystroke')})` at the slot's box, +2 +1 0), its letters WHITE on the key-down frame (1 frame), the I-beam jumping to after the full stop and blinking on. The writer's colour, never Clio's; on 1-bit paper it is the only colour in the frame. 131.625-132.00, 22 frames: HOLD. Clio's mouth still open. The pen lowers back into the frame from the top edge, 1 px per frame. | keystroke | 2x held |
| 132.00 | chorus3c "You"@132.00 · `slamBack` · crash stab sub | THE SLAM BACK: the posterize and the stepZoom drop on the same frame (the cyan and the band return together), pixel sort 2 frames (`isDrop` sees `HITS.slamBack`), stab punch at PEN., `invertFrame(132, 1)`, `FX.shake = 6` decaying over 6 frames, Clio's star jump. The new block YOU SAY / WHERE I / LAND, slams in; the old block vanishes under the invert; the writer's vermilion "PEN." SHRINKS to its corner (bottom left, scale 3) in 4 steps over 132.0-132.25 and STAYS until 144. The chorus line pops back up. | crash stab kick clap sub | 1x |
| 132.00-134.00 | chorus3c "say"@132.25 "where"@132.50 "I"@132.75 "land,"@133.00 · You say where I land, | The scale-8 landing: she lands in `cheer` at the centre of the line (six dancers each side) with her feet on the baseline of LAND; the clap at 132.5: `clickBurst` with 12 copies. **Liquid Glass gets its desk beat**: for the LAND bar (133.0-134.0) the 2026 home desk shows THROUGH the cyan as a 25% Bayer (a keyed stencil of `desk(liquidglass)` laid under the type at 25%): the glass is translucent; the tagline's second half, seen. | kick clap(12) | 1x |
| 134.00-135.25 | chorus3d "or"@134.00 "I"@134.25 "fade."@134.50 · `fade3` | The dither-out to black 134.5-135.0; the half beat of silence 135.0-135.25: BLACK except the white pen and the writer's vermilion "PEN." in the corner. **Only the writer's word survives the fade, in the writer's colour.** The sax at 135.25: `invertFrame(135.25, 1)`. | — | 1x |
| 135.25-137.75 | chorus3e "I'm"@135.25 "just"@135.50 "your"@135.75 "pen"@136.00 "pal,"@136.50 · chorus3e_h (the harmony, same words) · chorus3e_echo "(pen"@137.25 "pal)"@137.50 · crash stab bell 136 | `ch11 line`. "I'M JUST YOUR" solid above; PEN / PAL with `stepIn` drop; the twelve do the scribble and the wave; the crash's sort at 136 (`anyCrash`); echo 137.25: the postmark `PEN PAL · 2026` + airmail. | crash stab kick bell | 1x |
| 137.75-140.00 | chorus3f "I'll"@137.75 "never"@138.00 "hold"@138.50 "the"@139.25 "pen."@139.50 · chorus3f_h (the harmony) · stab 139.75 · bell 139.5 | The line sinks; the hero (scale 7) centre. **THE GIVE-BACK, physical, once.** "hold"@138.50 (clap, 12): the writer LETS GO: the cord goes slack from the pointer and the pen FALLS (8 px per frame); Clio CATCHES it in both mittens at 138.75, the first time she has touched it in 139 seconds, with a 2-frame FREEZE. "the"@139.25: she holds it out HANDLE-FIRST at arm's length, never nib-down (she never writes). "pen."@139.50: the pointer takes it back with a vermilion click ring (1 copy) and the cord snaps taut; the hardest-hit punch on PEN. (black, in this block) and nib ripples. No notice, no hint dip: "I could smooth it. I won't." as choreography. | clap(12) stab bell | 1x |
| 140.00-141.75 | chorus3g "Who"@140.00 "holds"@140.50 "the"@140.75 "pen?"@141.00 · `whoHoldsThePen3` · bell 141 | The who-frame in cyan; the pen level across the top; the line of twelve pops up and ALL TWELVE `pointUp` at it in unison. | kick clap(12) bell | 1x |
| 142.00-143.00 | chorus3h "You"@142.00 "do!"@142.50 · chorus3h_gang (the twelve) · `youDo3` · stab 142 · riser [142,144] | `youDoFrame3`: YOU DO! slam; the twelve do THE POINT (twelve mittens at the lens, cropped by the bottom edge) on "You" and THE PEN POINT on "do!"; twelve pointers click on 142.5 (cyan rings ×12); the Two Floppies bar, stopping at 98.4% for the third time. | stab clap(12) riser | 1x |
| 143.00-143.50 | "You"@143.00 · stab 143 | The YOU letters invert 2 frames (type only: the E5, the song's highest note); the type one size up; the second YOU DO! reads whole at 1x. | stab | 1x |
| 143.50-143.625 | "do!"@143.50 · clap 143.5 | **THE THROW**: on "do!" the pointer flicks and the pen leaves the cord nib-first AT THE LENS: scale 4 → 8 on this 16th, its nib at the frame centre (320, 180), a vermilion ink bead (2x2, scaling with the pen) on the tip; the twelve pointers' rings burst round it. "You do" hands the viewer the pen. | clap bell | 1x |
| 143.625-144.00 | · `ch11 dive` · bells 143.625/.75/.875 | The pen keeps coming: scale 16 at 143.75, 32 at 143.875 (`youDoFrame3(t)` draws it), the white filling the frame; **DIVE 3** into the ink bead: `diveInto(144 - 3/8, 144, 320, 180, youDoFrame3, 'ch12 lala', {pw: 8, color: FIELDS.vermilion, power: 2, outer/inner: {era: 'liquidglass', raw: true, screen: true}})`; inside the vermilion the magenta outro grows on the three bells. | stab bell riser | 1x → 180x |

### ch12 · outro and tail: the pull-back on the verbs, Return, Save, the end card (144.00-157.00) · `src/ch12.js` · 44 KB

Scenes: `ch12 lala` (144-148, raw: the pull-back with the hooks over it), `ch12 voice` (148-150, `era:
'system6', screen: true`, full frame), `ch12 return` (150-151, same), `ch12 save` (151-153.3, same), `ch12 end
card` (153.3-END = DUR + 3.0 = 157.0, raw). The chapter tiles to END, not DUR.

**The outro is the pull-back ON THE VERBS**: each chant verb is the button that pulls history back one step
through the full stop. `pullBack(144, 148, [L_mag, L2014, L2009, L2002, L1988], {dot: false, ease})` where
`L_mag` = the magenta outro frame fn (the field, Clio scale 5 dancing bottom right, the record disc, the pen
from the pointer at the top right: this is what dive 3 lands in at 144.0) and `L_era = {draw: t => homeDesk(t,
{cur: [300, 24]}), era, px: PERIOD_F(era).x, py: PERIOD_F(era).y, pw: 2}` (PERIOD per era from a dry render; all
frames are full 640x360). `ease` maps the kit's uniform k to the verbs: piecewise linear through (144 → 0),
(145.0 → .25), (145.75 → .5), (146.75 → .75), (148.0 → 1), so each step's snap-in (the sides close round the
centre square, a 2-frame split) lands on a verb: Save it.@144 starts the first zoom-out (the magenta world shrinks
into the full stop of 2014), Clip it.@145.0 → 2009, Insert it.@145.75 → 2002, Export it.@146.75 → 1988, landing
at 1:1 on the 1-bit 1988 desk at 148.0. Clio recedes into the full stop with the magenta world: the AI's stage
shrinks into the writer's dot. **The OVERLAY**, drawn after the pull-back on top: (1) the four verb slabs in a
row across the bottom (`bigTypes` with `invert: true`, black slabs, magenta letters), each slamming on its verb
and pressed by the pointer (a 2-px inset, 4 frames); (2) the la-la across the top (`bigType('LA LA LA, LA LA LA
LA.', {scale: 4, y: 40, valign: 'top', words: lyric('o_la1')})`, then `o_la2` from 146.0) with THE BOUNCING PEN
on it (the pen the viewer was handed, hopping from LA to LA on its cord from the top-right pointer copy); (3)
the record, a black disc r 60 bottom left with its magenta label "11 · PEN PAL · AI SYSTEM 6", the eleventh
groove pulsing per riff note. Three hooks, one frame, and the desk coming back underneath.

| Time | Lyric | Gag | Band | Camera |
|---|---|---|---|---|
| 144.00-145.00 | o1 "Save"@144.00 "it."@144.25 · o_la1 "La"@144.00 "la"@144.25 "la,"@144.50 "la"@144.75 · `outro`/`lala4` · crash stab · bells 144, 144.25, 144.5, 144.75 | Owed: `landFX(hit('outro'))` + the drop's sort. `ch12 lala` must tolerate t < 144 (dive 3 renders it): the magenta frame `L_mag` whole. SAVE IT. slams (blip 144) and the pointer presses it: **step 1**, the magenta world snaps in and zooms out into the full stop of the 2014 desk; the la-la starts with the pen bouncing LA to LA; the record spins. No stab at 144 beyond the owed one (EVENTS has none). | crash stab kick bell blip | 180x → 1x of 2014 |
| 145.00-145.75 | "Clip"@145.00 "it."@145.25 · o_la1 "la"@145.25 "la"@145.50 "la."@145.75 · blip 145 | CLIP IT. slams, pressed: **step 2**, 2014 into the full stop of 2009. The pen bounces on. | kick bell blip | → 2009 |
| 145.75-146.75 | "Insert"@145.75 "it."@146.50 · o_la2 "La"@146.00 … "la"@146.75 · blip 146.5 | INSERT IT. slams, pressed: **step 3**, 2009 into the full stop of 2002. | kick bell blip | → 2002 |
| 146.75-148.00 | "Export"@146.75 "it."@147.50 · o_la2 "la"@147.00 "la"@147.25 "la."@147.50 · `exportCD`@147 · blip 147.5 · cowbell 147.75 | EXPORT IT. slams, pressed: **step 4**, 2002 into the full stop of 1988; at 147.00 the record's label stamps its answer, **"This one."** (magenta Chicago 2x on the black disc: the payoff of "Name the ad.", no card). The pen's last hop lands on the last "la." at 147.5 and it hops home. Cowbell 147.75: `invertFrame(147.75, 1)`. At 148.0: the 1-bit 1988 desk at 1:1, full frame, positive; the overlay (slabs, la-la, record) drops on the stab's frame under its invert. | kick bell blip cowbell | → 1988, 1x at 148.0 |
| 148.00-150.00 | o2 "It"@148.00 "was"@148.25 "always"@148.50 "your"@149.25 "voice."@149.50 · It was always your voice. · stab 148 · claps 148.5, 149.5 | `ch12 voice`. **A still, quiet desk.** The 1988 home desk, full frame, the pointer home, the drives silent, Clio at home singing the line (her mouth the only motion): the Manuscript (Final) OPENS for the first time at 148.0 as the thing it always was (a 1-frame invert of its title bar on the stab), the vermilion full stop after "fills", the vermilion I-beam appearing after it on "voice."@149.5. The claps 148.5, 149.5: `clickBurst` (1 copy, vermilion rings) at the pointer as it travels to the end of the manuscript. The lyric: a System 6 `kara` plate at the bottom centre, solid on ants (the words are Clio's); "voice." pulses 1 px with the vibrato. | stab clap | **1x** (the whole desk, the first time at 16:9 and 1-bit together) |
| 150.00-151.00 | "voice." (held) · `bootChordOut`/`returnKey` · keystroke 150 | `ch12 return`. The writer presses RETURN on the Final manuscript: the 2-px vermilion I-beam after the full stop of "fills" drops to a new, empty line (the caret blinking at the line's start): the Amaj9 rings. The next sentence is the writer's. Clio's mouth open on the held "voice"; from 150.5 FROZEN (the grain loop: `blink: false`, `bob: 0`, the mouth shape locked). The hint: `Sounds like you.` The plate still shows the line (it runs to 151.0). | keystroke | **3x (150, 130) on 150.0** (the caret dropping to the new line), held |
| 151.00-153.25 | o3 "This"@151.00 "song"@151.25 "is"@151.50 "temporary."@151.75 · This song is temporary. · `saveDialog` | `ch12 save`. The Save dialog zooms open centred (0.2 s): `alert(W/2, H/2 - 10, {icon: 'note', w: 500, h: 132, lines: [line 1], buttons: ["Don't Save", 'Cancel', 'Save'], def: 2})` → the final rect **(70, 104, 500, 132)**; lines 2-4 and the bar are drawn BY HAND over the returned `client` rect (`alert` has no per-line styles). Line 1, solid `ui`: `Save changes to the song "Pen Pal" before quitting?` Line 2 (y +18), SOLID Chicago 2x on a `ghostPlate`, typed as spoken (`kara` mode 'type'): `This song is temporary.` Line 3 (y +44), solid `small`: **`system6.aaronlau.me`** (the one call to action, on screen from 151.0). Line 4 (y +58), solid `small`, the film weighing its own source: `Source: 891,450 of 1,474,560 bytes (60%)` from `WEIGHT.bytes` / `WEIGHT.floppy` (the figures here are today's; the card reads `WEIGHT` at build time), with a 160x8 one-floppy bar to its right; if `typeof WEIGHT === 'undefined'`, no line 4 and no bar (the number is real or it is not shown). [Save] is the default and its ring is VERMILION: the save button under the pointer. The pointer travels from the manuscript to [Save] (151.0-152.0) and rests on it. The chord decays; the drives silent; nothing else moves. | — | **2x (320, 170)** on the dialog (lines 1-4 and the buttons inside the crop) |
| 153.25 | (click) · `saveClick` · click | The pointer clicks [Save]: `clickBurst` (1 copy, vermilion rings, the arrow `down` 5 frames). Line 2's plate turns SOLID WHITE on the click and the ants stop (kept: the song persists only because the writer chose to keep it) and holds 3 frames. | click | 2x (320, 170) |
| 153.30-153.45 | — | `ch12 end card` renders `ch12 save` BY NAME under `FX.crt = prog(t, 153.3, 153.45)` (the lens off): the picture collapses to a line, then to a dot (the kit's white dot for its last two frames), then black. | — | collapse |
| 153.45-153.55 | — | Black. A vermilion 2x2 dot at the frame centre FLIES (`track`, 6 frames) to the right end of the line and lands at 153.55 as the full stop of **You may now write.** (white Chicago scale 3, centred, y 140). | — | 1x |
| 153.55-153.68 | (the landing held) | **8 frames of the line and its dot, nothing else.** | — | 1x |
| 153.68-157.00 | (the end card, held 3.3 s) | Below, white Geneva: `AI SYSTEM 6 · 1988 OBJECTS / 2026 INTELLIGENCE` (y 200), **`system6.aaronlau.me`** (y 216, Chicago 2x: readable). At the bottom the Two Floppies meter in 1-bit, white on black, ONE floppy: a floppy icon, a 240x10 bar filled to `WEIGHT.bytes / WEIGHT.floppy`, the line `The source of this whole film: 891,450 of 1,474,560 bytes · one floppy` (the real number at build time: run `tools/weigh.mjs` last; omitted if WEIGHT is undefined; it counts source only, never the rendered song or picture). The song ends at 154.0; the card holds to 157.0 and the render stops there. | — | 1x |

## 6. HANDOFF STATES

**The mechanism.** A boundary is seamless because the chapter that owns the transition renders the receiving
chapter's FIRST SCENE BY NAME (`frameInto(buf, t, 'chNN name')`: `frameInto` looks any registered scene up in
`SCENES`, from any file). The receiver's first scene must therefore (a) accept `t < t0` and draw its `t0` state
(clamp `local` to 0 and any era index to its first value; beat-driven things like the dance, the pen's swing and
the drives may keep moving, they take `t`); (b) apply the LANDING FX itself (the invert / split / punch listed
below), because the sender has stopped drawing by then; (c) read nothing from the sender. A sender whose
neighbour is not written yet must not throw: `hasScene(name) ? frameInto(…) : (flat field or black)`.
Desk-to-desk boundaries (B1, B2, B6) have no transition: both sides draw the identical `homeDesk` with the
options listed AND THE SAME LENS KEY. The two chapters at every boundary render each other's boundary frames
and compare them (§9).

| B | Time | Sender → receiver (first scene) | Mode · era · field | Screen · lens | Windows and props | Clio | Pointer and pen | Landing FX owed by the receiver |
|---|---|---|---|---|---|---|---|---|
| B1 | 12.00 | ch01 → ch02 (`ch02 spin`), no transition | desk · system6 | 512x342 · **1x** (ch01 releases at 11.5; ch02's first key is 2x (300, 90) ON 12.0, the "Spin" beat, in both files' terms the step happens at 12.0 and belongs to ch02) | `homeDesk(t, {cur: [300, 24]})`: chat empty (`hero: false`), no gag windows; the hint `Sounds like you.`; A/B heads on their notes; eject drive at rest (last kick 11.25) | home (286, 196) scale 3, `expr: 'sing'`, mouth shut (no word at 12.00) | (300, 24) arrow; pen scale 1 hanging (cord (305, 39)→(309, 61), tip (309, 98)) | none; ch02 opens the Route window with `k = prog(t, 12, 12.2)` |
| B2 | 28.00 | ch02 → ch03 (`ch03 fetch`), no transition | desk · system6 | 512x342 · **1x** (ch02 releases to 1x at 28.0; ch03's first key is 1x until 28.5) | identical to B1 (the Route closed 27.5, the notice closed 27.95, Section Drafts closed 26.5) | home, mouth shut; `expr: 'sing'` | (300, 24); pen as B1 | none |
| B3 | 36.00 | ch03 (`ch03 flood`, 35.833-36) → ch04 (`ch04 pen pal`) | silhouette · system7 · magenta | growing 512→576 over 36.0-36.5 (automatic) · 1x | the field; "I'M JUST YOUR" (scale 3, solid) above; PEN slamming at 36.00 | `clioDance(W-90, H-8, 5, t)`: the kit's star jump on the crash | pointer (W-56, 6); pen scale 4 on the cord, `penRig` | `invertFrame(hit('chorus1'), 2)` |
| B4 | 52.00 | ch04 (`ch04 dive`, 51.625-52) → ch05 (`ch05 lala`) | silhouette · platinum · lime | growing 576→608 over 52.0-52.5 · 1x (the dive's inner is 1:1 at 52.0) | the field; `bandGrid(0, 0, W, H, {t, field: lime})` full frame; the la-la plate across its middle; the pen on the first LA | none in frame (the grid is the frame); Clio enters at 54.0 | (W-56, 6); the pen bouncing from the cord | `landFX(hit('post1'))` + the drop's pixel sort (`beatFX`) |
| B5 | 60.00 | ch05 (`ch05 drain`, 59.833-60) → ch06 (`ch06 chat`) | desk · aqua | 608x356 · **1x** for the landing beat (ch06's first key is 2x (200, 230) at 60.5) | `homeDesk(t, {cur: [300, 24], msgs: [{who: 'clio', text: 'Chat is an app. Not the whole computer.', at: 60.0}]})`: no gag windows yet (DOOM opens 60.5); the bubble on a ghost plate | home, mouth opening on "Chat" | (300, 24); pen scale 1, frozen at `NIB_HOME_F` in the sender, live in the receiver | `punch(hit('verse2'), 573, 183, [2, 2]); invertFrame(hit('verse2'), 1)` |
| B6 | 76.00 | ch06 → ch07 (`ch07 check`), no transition; ch07 owns the Aqua→Tiger wipe (76.0-76.35) | desk · aqua→tiger | 608x356 · **2x (150, 130)** on both sides at 75.5-76.0; ch07's stab key is 1x ON 76.0 | `homeDesk` with: Review Desk `APP.reviewDesk(8, 30, 268, 196, {doc: 'The Tide Comes In Twice', header: ['812 words', 'The Tide Comes In Twice', 'Not a score.'], you: 100, checks: [{label: 'Rhythm', state: 'flag', note: 'rhythm'}, {label: 'Summary language', state: 'flag', note: 'generic'}, {label: 'Press-release hedging', state: 'flag', note: 'hedging'}, {label: 'Personal detail', state: 'ok', note: 'KEEP'}]})` over the Manuscript (status `Final`); three red flags on rows 1-3 with their labels; the vermilion KEEP stamp on row 4; `APP.doom(284, 30, 116, 100, {walk: t})`; `APP.micropolis(284, 136, 116, 52, {built: 1})`; ClioTalk at (8, 230, 268, 82) with msgs `[{who: 'you', text: 'Check for drift.'}, {who: 'clio', text: 'We are excited to announce the tide.'}]` (the bubble on its plate, three small flags at its corner) | home, mouth shut, `expr: 'happy'` | (300, 24); pen scale 1 | none (the morph is ch07's own keyframe) |
| B7 | 84.00 | ch07 (`ch07 flood`) → ch08 (`ch08 pen pal`) | silhouette · snowleopard · lime | 608x356 · 1x | as B3 in lime | star jump | (W-56, 6); pen scale 4 | `invertFrame(hit('chorus2'), 2)` |
| B8 | 104.00 | ch08 (`ch08 drain`) → ch09 (`ch09 tunnel`) | desk · system6 (the tunnel's first era) | 608x356 · 1x (the hold) | the first HOLD: `homeDesk(t, {cur: [300, 24]})` in 1988 inside the 608x356 screen + the year "1988" slamming + the chant plate at the bottom; the Trash crumpling (crash 104) | home, mouth on "Eighty-eight." | (300, 24); pen scale 1 | `punch(hit('bridge'), 573, 183, [2, 2]); landFX(hit('bridge'))`; the drop's sort |
| B9 | 120.00 | ch09 (`ch09 stay`, rendering `ch10 gate` by name from 119.0) → ch10 (`ch10 gate`) | desk · system6 NEGATIVE (`FX.invert = true`) | 608x356 (bezel white) · 1x | `homeDesk(t, {cur: [300, 24], neg: true})`, nothing else before 120.0; the dot drawn `INV(vermilion)`, the pen pre-inverted | home, mouth shut | (300, 24); pen scale 1 (pre-inverted) | none |
| B10 | 128.00 | ch10 (`ch10 flood`) → ch11 (`ch11 reboot`) | silhouette · liquidglass · cyan | stage 3: the punch runs 128.0-128.3 (automatic in both) · 1x | the field; "I'M JUST YOUR" solid; PEN slamming; the chorus line of twelve along the bottom, hats on | the twelve star-jump | pointer (W/2 - 5, 6) (the column); pen scale 4 | `invertFrame(hit('reboot'), 2)`, `FX.flash = [C.white, 1]` on the first frame |
| B11 | 144.00 | ch11 (`ch11 dive`) → ch12 (`ch12 lala`) | silhouette · liquidglass · magenta, the first pull-back layer | 640x360 · 1x at 144.0 (the dive's inner), then the pull-back's first step begins at once | `L_mag`: the field, the record disc, SAVE IT. slamming in the overlay at 144.0, the la-la's first LA with the pen on it | `clioDance(W-90, H-8, 5, t)` inside `L_mag` | the pointer copy at (W-56, 6) holding the bouncing pen's cord; the thrown pen of the sender became this one | `landFX(hit('outro'))` + the drop's sort |

Inside ch08 (99.625→100), ch09 (every second), ch12 (144→148, 153.3→153.45) the same discipline applies
between a chapter's own scenes: the transition scene renders the landed scene by name or by fn.

## 7. Special moments, to the frame

1. **The opening pixel → the full stop (0.0-4.0).** Frame 0: black, one white pixel at (223, 146), the place the
   full stop will be; it blinks on/off on the 8ths of the first two beats. From 0.5 the camera pulls back (reversed
   `pullBack`, the dot at `dotAt: PERIOD_F`): the NEGATIVE Manuscript window (white on black, 1-bit) grows round the
   pixel until its own 2x2 full stop takes over; at 2.25 ("I'm") `negMs` is drawn directly at 1:1 with a 1-frame
   invert and a 3-frame split, and the window has not moved since; 2.25-3.0 Clio's first words appear as white
   ghost dither beside it; "pen"@3.0 inverts one frame and THE PEN DROPS IN on its cord, its nib landing on the
   full stop at 3.25; 3.5→4.0 the raster writes the real desk top-down round the pen, and the full stop comes
   out VERMILION under the nib. Frame 240 (4.0): the drop, the desk, the band; frame 255 (4.25): the lens goes to
   2x on the big chat.
2. **The first flood (35.833-36.0).** Frame 2150: the lens releases from 4x to 1x and the nib touches the page at
   (328, 179)_F on a frozen 1988 desk (frozen since 34.75). Frames 2150-2159: magenta ink floods from the tip in
   ten hard steps, a white trail behind the nib. Frame 2160 (36.0): the frame is the magenta poster, inverted for
   frames 2160-2161; PEN is on screen with its +3 +2 +1 0 overshoot; Clio scribbles; the field steps 512→576
   wide over the next beat.
3. **"Who holds the pen?" / "You do!" (48.0-52.0, and 96, 140).** WHO / HOLDS / THE PEN? justified to the
   screen, one letter per 16th, the white pen lying level across the top on its cord, Clio pointing up at it.
   50.0: YOU slams black and she points at you; 50.5 DO! and she points at the pen as three pointer copies click;
   51.0 the second YOU (its letters invert a frame) and 51.5 the second DO! read WHOLE at 1x; frames 3098-3120
   (51.625-52.0): the whip into the dot of the exclamation mark, three bells, three ring-flashes: the post-chorus
   lives inside the "!".
4. **The bridge tunnel (104-116).** Twelve years, each a HOLD and a WHIP. Hold: the era whole at 1:1 for half a
   beat (a quarter from 2009, a 16th from 2011) with the sung year slammed across it in white on black; whip: a
   `power: 2` dive into the writer's vermilion full stop, near the same place in every era because the windows
   never move; the last word "fills" blows past in that era's face; each landing is a beep: a 1-frame invert and
   a 3-frame split on the chanted year. The holds shrink from 2009 on, so the bridge winds up; the last dive lands
   inside a 12-up contact sheet of the same desk.
5. **"Two floppies. It fits." (120.25-121.5).** In the negative: the release-gate window; drive A: ejects and its
   disk slams into Disk 1 on "Two", drive B: on "floppies.", `count` 0 → 1 in four steps on "It", PASS stamps on
   "fits."; a third floppy waits half outside the screen: "heavy tools (lazy)". The product's real numbers. The
   bass drives were the boot payload; the YOU DO! bars that stopped at 98.4% three times are paid off.
6. **The key-change punch (128.0).** Frame 7680: the cyan flood completes and the kit's punch fires: two inverted
   frames with a 2x punch-in (7680-7681), then the black bars with their white bezel line slide off in four hard
   steps, one every two frames (7682-7689), speed lines, a shake decaying over ten frames; the desk is 16:9 for
   the first time and stays so; twelve dancers in twelve hats fill the width it just gained.
7. **The silent pen (131.25-132.0).** Frame 7875 (131.25): THE lands; the band is gone; the CYAN GOES WITH IT: the
   frame snaps to 1-bit paper and black (`posterize [white, black]`), the camera hard-punches 2x onto THE and the
   empty slot, Clio frozen, pointing up, mouth open; the pen has been pulled out of the frame. Frames 7875-7897: a
   vermilion I-beam blinks in the slot on the 16ths. Frame 7897/7898 (131.625): one keystroke: PEN. appears in
   VERMILION, white for one frame, the I-beam hopping after it. Frames 7898-7919: hold; the pen lowers back in,
   one pixel per frame. Frame 7920 (132.0): the cyan and the band slam back together, crash, stab, invert, shake
   6, pixel sort, Clio's star jump; the writer's vermilion PEN. shrinks to the corner and stays there for the rest
   of the chorus; it is the only type left during "or I fade." Everything that matters is inside the centred 9:16
   column.
8. **The outro pull-back on the verbs (144.0-148.0).** Frame 8640: the ink bead on the thrown pen opens into the
   magenta outro. SAVE IT. (144.0), CLIP IT. (145.0), INSERT IT. (145.75), EXPORT IT. (146.75): on each the
   pointer presses the slab and the frame snaps in round the centre square (2-frame split) and zooms out into
   the full stop of the older desk: magenta → 2014 → 2009 → 2002 → 1988, Clio receding with the magenta; the
   la-la rides over the top with the bouncing pen; the record's label says "This one." at 147.0. Frame 8880
   (148.0): the 1988 desk at 1:1, full frame, 1-bit, still; "It was always your voice." on a quiet desk; frame
   9000 (150.0): the writer presses Return on the Final manuscript; the caret drops to a new line; the chord rings.
9. **"This song is temporary." → Save (151.0-153.25).** The Save dialog (70, 104, 500, 132): the question solid,
   Clio's spoken line solid on a temporary plate, the URL, the film's weight in bytes, the Save ring vermilion.
   Frame 9195 (153.25): the click; the plate turns solid white and the ants stop. The song is kept because the
   writer clicked.
10. **The CRT collapse and the dot (153.3-153.68).** Frames 9198-9207: the picture collapses to a line, a dot,
    black. Frame 9207: a vermilion 2x2 dot at the centre; frames 9207-9213: it flies right and lands as the full
    stop of "You may now write."; frames 9213-9221: the line and its dot alone.
11. **The end card weighs the film (153.68-157.0).** White on black: "You may now write." · AI SYSTEM 6 · 1988
    OBJECTS / 2026 INTELLIGENCE · system6.aaronlau.me (Chicago 2x) · one floppy icon, a bar, `WEIGHT.bytes` of
    1,474,560 bytes, "the source of this whole film". The number is written by `tools/weigh.mjs` at build time or
    it is not shown. The card holds 3.3 s, long enough to read the URL twice.

Request to the render.mjs owner, kept from TOOLKIT §12.3 (not blocking): read `FINISH_AT(t)` per frame and drop
the vignette in silhouette mode.

## 8. Budget: the whole film's source on one floppy, and the held tail

**The tail (decided).** The song is exactly 154.0 s (`build/song.wav` measured; `DUR` 154.0) and the score does
not grow a silent tail: every timing in `data/data.js` stays as it is. Instead render.mjs holds the picture past
the song: `END = DUR + 3.0` (157.0 s); `video` renders `to = END` by default; the audio input gets `-af apad` and
the mux uses `-t END` instead of `-shortest`, so the last 3.0 s are the end card over silence. `renderCheck`
and `sheet` accept times up to END. This is a change to render.mjs (a ~4-line edit, owned by the ch12 author's
report), and §9 rule 2 reads "tile 0..END", with only ch12 crossing DUR.

**The bytes.** `tools/weigh.mjs` counts every source file (js, mjs, py, json, html, sh) against one 1,474,560-byte
floppy; Markdown is reported as words and not counted; the rendered song (44 MB of wav) and picture are never
counted: the claim is "the source of this film", and that is how the card and the Save dialog word it. KB = 1024
bytes. Today, before chapters, the working tree weighs **891,450 bytes** (`node tools/weigh.mjs`, 8 Oct;
`data/weight.js` still says 877,308 from the last build; the number moves whenever the song's Python does). The
twelve chapters are allocated **456 KB (466,944 bytes)** with a **24 KB reserve** (the cap: 480 KB = 491,520
bytes). At the allocation the film weighs 1,358,394 bytes (92.1% of the floppy, 116,166 bytes of headroom); at
the cap 1,382,970 bytes (93.8%, 91,590 bytes left). The margin is thin: a 25% overrun across the chapters busts
the card's claim, so the sum is re-run after every chapter and a chapter over its budget is not done.

| ch01 | ch02 | ch03 | ch04 | ch05 | ch06 | ch07 | ch08 | ch09 | ch10 | ch11 | ch12 | total | reserve | cap |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 40 KB | 40 KB | 30 KB | 40 KB | 30 KB | 44 KB | 30 KB | 40 KB | 44 KB | 30 KB | 44 KB | 44 KB | 456 KB | 24 KB | 480 KB |

Rule: run `node tools/weigh.mjs` after every change; the film must weigh under 1,474,560 bytes or the end card is
lying. Comments count; write short ones. Do not paste the style reel in: copy only the few lines you use (the
`penRig`, the chorus frame shape).

## 9. Rules for chapter authors

1. **One file, `src/chNN.js`**, `'use strict';` then one `{ … }` block so nothing leaks. Prefix every
   top-level name with `cNN_`. No edits to any other file (except ch12's render.mjs tail edit, §8). If the toolkit
   lacks something, define it locally (under 30 lines) and name it in your report; `homeDesk`, `lens` and friends
   from §4 are copied verbatim.
2. **Scenes tile the chapter's range exactly**: `[t0, t1)` of your scenes, in order, cover your range with no
   gap and no overlap, the first at your start, the last ending at your end; the twelve ranges tile 0..END
   (157.0). A transition (flood, drain, dive, pull-back) is its own `raw: true` scene at the end of the range; the
   scene it renders underneath is called by name or by function, never by overlapping. Name your first scene as
   listed in §5 (it is a contract).
3. **Times come from the song.** `lyric(id)`, `wordAt(line, 'word')`, `hit(name)`, `section(name)`,
   `evList`/`evLast`/`evSpan`, `BEATS`. The only literal numbers in a time expression are offsets
   (`- 10 / FPS`, `+ .2`, `- 3/8`). A storyboard time is for your eyes.
4. **The lyric is on screen, verbatim, readable, in sync**: `kara` or a bubble inside the scene's own UI in desk
   mode, `bigType` with `words:` in silhouette mode. Clio's words are SOLID on a TEMPORARY PLATE (50% dither,
   marching ants, a TEMPORARY tag) until the writer keeps them, when the plate turns solid white; the writer's
   words are solid on white; letters are dithered only at scale ≥ 3 with 2x2 cells. In silhouette mode the poster
   type is the crowd's and lands black (unsung words ghost at poster scale). Keep it clear of the menu bar and
   the dock; nothing covers it while sung; it is inside the lens crop.
5. **Something on every sung word.** The tables say what. Big hits on beats (`pulse`, `kick`, `hitPulse`,
   `beatFX`). The signature move on every "pen pal".
6. **The one take.** Your first scene tolerates `t < t0`; you apply your own landing FX (§6); your last scene
   renders your neighbour's first scene by name with `hasScene` guarding; the pointer, the pen, Clio, every window
   AND THE LENS KEY at a desk boundary are exactly the §6 state. Never cut. The lens re-targets only on beats.
7. **Hard pixels, pure functions** (TOOLKIT §1): no `Math.random`, `Date`, `performance.now`, `arc`, `stroke`,
   `fillText`, gradients, alpha, smoothing. Dither, don't fade.
8. **Budget**: under 6 ms average per frame over your range (`renderCheck`) for desk and chorus chapters; ch09
   (twelve dives), ch12 (the pull-back) and the flood/drain frames of ch03, ch05, ch07, ch08, ch10 may average 10
   ms (a dive or pull-back frame costs ~7 ms, a flood frame ~10); ch09's sheet and ch10's negative may run to 10 ms
   (keyed stencils, memo'd thumbs). Your file within its §8 size.
9. **Flash safety.** A shared promo autoplays; it must pass a photosensitive check (no more than 3 general
   flashes per second in any 1-s window). Full-frame inverts are spent on landings and phrase downbeats only;
   strobes on words are TYPE-ONLY or SLAB-ONLY inverts (51.0, 99.0, 143.0 and the chops are written that way).
   The ch12 author adds `tools/flashcheck.mjs` (reads `renderFrame` luma per frame over a range and reports
   windows over 3 transitions per second); every silhouette chapter runs it over its range and reports the result.
10. **Check before you report**, in this order:
    ```bash
    node render.mjs check 36 52                      # your range: no errors, avgMs within rule 8
    node render.mjs sheet 36 52 0.5 build/ch04.png    # LOOK at every tile: lyric readable? word sync? funny?
    node render.mjs sheet 12 28 0.5 build/ch02.png    # desk chapters: is the gag AND the plate inside every lens crop?
    node render.mjs still 39.5 build/ch04-still.png   # the hero frames of §7 at 1080p
    node render.mjs still 35.983 build/b3-a.png && node render.mjs still 36.0 build/b3-b.png   # both sides of each of your boundaries
    node tools/weigh.mjs
    node tools/flashcheck.mjs 36 52                   # silhouette chapters (once it exists)
    ```
    For a silhouette chapter, also run the legibility audit through puppeteer (as render.mjs does):
    `page.evaluate('legibilityAudit(36, 52)')` must return 0 failures. Look at the sheet at 320x180 too (half-size
    it): every frame's subject should read in a quarter second on a phone. Render the NEIGHBOUR chapters' boundary
    frames too (the frame before your start, the frame at your end) and compare them with yours side by side; if
    the neighbour is not written yet, render your side and note it.
11. **Report** (in your return message, not a file): the scenes and their ranges, your boundary frames (paths),
    avgMs, your byte count, any local helpers and overrides (the per-disk fills, the hand-drawn dialog lines),
    anything the toolkit should grow.

## 10. Chapter split, in one breath

ch01 boot and intro (0-12: the pixel, the pen on its word, the raster, the four buttons, the mime) · ch02 verse 1
(12-28: the route through the lens, the hint taught once) · ch03 the melt and the first flood (28-36) · ch04
chorus 1, ONE: the signature move, the notice, the Two Floppies bar, the dive into the "!" (36-52) · ch05 post 1:
the band showcase, the bouncing pen, the eleventh track, the drain (52-60) · ch06 verse 2: MultiFinder, Review
Desk (Final, Not a score), the flags, the pratfall, KEEP (60-76) · ch07 pre 2: smooth, won't, the postmark flood
(76-84) · ch08 chorus 2, MANY: the twin, the gang, the notice cascade, LAND kept, the dive into her eye; post 2
with the gang (84-104) · ch09 the bridge: hold-whip through twelve eras, the sheet, the flip-book (104-120) ·
ch10 the breakdown in the negative: the drives eject into the gate, Connect AI, the cyan flood (120-128) · ch11
chorus 3, THE CHORUS LINE: the punch, the silent pen in 1-bit and vermilion, the catch and the give-back, the
thrown pen (128-144) · ch12 the outro: the pull-back on the verbs, "This one.", a quiet desk, Return, Save, the
held end card (144-157).

## 11. Revision

Two critics reviewed revision 1. Every "must" is applied; every "should" and "could" that makes the film bolder,
clearer or truer is applied; the rest are refused below with a reason. The 12-chapter split stands (no critic
showed a seam that needed moving; ch12 grows by the held tail only).

**Applied (must).** Chorus escalation 1 → 2+12 → 12 and alerts 1 → 8 → 0 (§1, ch04/ch08/ch11) · the signature
move, planted at the intro chops (§1, every silhouette table) · the silent pen: PEN. the hardest hit in C1/C2,
colour drained to 1-bit at bandOut, the 2x hard punch, the vermilion I-beam, PEN. in vermilion, the 9:16 column
(ch11 131.25-132, ch10 127.25) · the whip dives in the last three 16ths into the "!" dot, Clio's eye and the ink
bead on the thrown pen (§2, ch04/ch08/ch11) · the cursor-follow lens, keys on beats, 2x verses / 3x-4x
pre-choruses / release on the flood (§2.1, every desk table) · Clio's words solid on temporary plates, never
dithered 9-px letters (§4, rule 4) · the end card held 3.3 s with the URL on the Save dialog from 151.0 and in
Chicago 2x on the card (ch12) · the tunnel as hold-whip, the year as poster type, holds shrinking from 2009
(ch09) · the tail decided: render.mjs pads the song to END = 157.0, no score change (§8) · `count` 0 → 1 and the
per-disk fills as a hand override (ch10) · Review Desk at (8, 30, 268, 196) with short notes, the flag text on
the flags, ClioTalk shrunk under it (ch06, B6).

**Applied (should / could).** The flip-book at 1:1 for "And your windows stay." (ch09) · the postmark and the
airmail border carry the era; the Lion slab re-skin is cut; Liquid Glass shows through the cyan on the LAND bar
(§1, ch08, ch11) · the meter reworded to Review Desk's own hint "Sounds like you. / Sounds like a mouthpiece.",
no percentage, "Not a score." in the window, taught once at 4x (§1, ch02, ch06) · the read-only notice uses the
product's real sentence as a ClioTalk notice, never a modal; the "Ollama" alert is gone; the chorus prop is the
notice slab, cascading (§1, ch02, ch04, ch08, ch10) · the Two Floppies bar at 98.4% three times, the drives
ejecting into the gate (§1, ch04, ch08, ch10, ch11) · post-choruses: one hero, the bouncing pen; the record
behind the type; "Track 11 · Name the ad." only; the gang sings under the pen in post 2 (ch05, ch08) · the outro
pull-back on the verbs, "This one." on the record label, a quiet desk for "It was always your voice." (ch12) ·
the give-back as a catch, a handle-first offer and a click (ch11) · the band pruned to gags and legible
instruments; the band showcase at 52-54 with the pen bouncing on the pads (§3, ch05) · fade escalation: total /
LAND kept by a click / only PEN. survives (ch04, ch08, ch11) · the stumble as a visible pratfall (ch06) · the pen
introduced on "pen"@3.0 (ch01) · no slabWindow, ripples on "pen" bells only, a frame budget (§1, ch04) · the
flash audit as rule 9 and type-only strobes · flood 2 from the postmark (ch07) · A:/B: play 122/124/126, the
pivot shakes on the riser span, no kick(120), the clunks from word times (ch10) · typed strings fitted to hat
counts, explicit 16th keystrokes where a word must land (ch01, ch02, ch06) · the opening dot at (223, 146), layer
0 `px/py`, `negMs` drawn directly from 2.25 with its own reveal, the host dot 1x1 (§2, ch01, §7.1) · `scanWipe`
with `ctx.drawImage` (§2, ch01) · real `/go/` routes only (ch02, ch06) · the model list through "Connect AI…" and
a Control Panel dialog (ch10) · `readerWin` and `POST_POSES` defined locally (§4) · the Save dialog at 500x132
with hand-drawn lines and the final rect (ch12) · the budget reconciled, KB = 1024, 891,450 B today, the card
says "the source of this whole film" (§8, ch12) · `NIB_HOME_F` as a rig formula with numbers per stage (§2) ·
"I'M JUST YOUR" at every chorus opener and every `_h` / `_echo` / `_gang` id spelled out in its row (ch04, ch08,
ch11) · the Manuscript Final from 63.75, Return on a Final manuscript (ch06, ch12) · PERIOD "near the same place,
re-aimed per era", "a different face almost every era", the dive-5 serif note fixed (§2, ch09) · no snare whaps
at 69.6, no stab at 144, `anyCrash: true` in ch08 and ch11 · `i = max(0, …)` in ch09 · the §7 cross-references ·
full route names, the Dock stated on, the IWAD prompt for 4 frames (§4, ch06) · the SONG §6 props dropped, said so
(§1) · 10 ms allowed for ch09, ch12 and flood frames (rule 8) · the pen redrawn after gag windows (`o.after`),
ClioTalk 110 high in dock eras (§4) · `ch12 end card` renders `ch12 save` under `FX.crt` (ch12).

**Refused.**
- "Bring back a minimal Route strip": refused; the Route window of verse 1 is the route, the 512-px menu bar
  cannot hold eight stops beside the lens hint, and §1 now states the deviation from SONG §6 instead.
- "Twelve full-height dancers in a row": adapted, not taken literally; twelve at scale 7 are 1,700 px wide, so
  the chorus line is scale 3 (1.5x the chorus-2 gang) with the hero at 5-8 where one body is the shot.
- "Lay the third line out as 'THE PEN.' justified to W-182": adapted; chorus 3's block is centred and its second
  line is justified to the 9:16 column (202 px at x 219), which is the only way THE, the slot and Clio's head
  survive a vertical crop; the slot is still PEN.'s own glyph box from the same `bigType` call.
- "Land the outro drain on the Liquid Glass desk for a full beat" (the alternative offered): refused in favour
  of the 25% dither-through on the LAND bar, because the outro now has no drain (it pulls back through the full
  stop on the verbs) and 148.0 must land on 1988 for the Return.
- "The band showcase in the 2-bar intro after the drop" (the alternative offered): refused; 4-8 is the four-button
  gag and the chant; the showcase takes 52-54 with the bouncing pen on the pads so the la-la is still taught from
  its first note.
- "Cycle all twelve eras on the 16ths" in the flip-book: seven 16ths hold eight eras, so the four seen last in the
  sheet are skipped rather than strobing at 20 changes a second (rule 9).
- "Pass shorter notes and keep the lyric in a kara plate outside the window" (the alternative to enlarging Review
  Desk): refused; the window is enlarged AND the notes shortened, and the chant lines live in Clio's bubbles,
  which is where her words go everywhere else.
- "Do the Return in Section Drafts" (the alternative): refused; Return at the end of the Manuscript is the film's
  last image of the writer's own piece, so the Manuscript is marked Final at 63.75, as the product requires.
