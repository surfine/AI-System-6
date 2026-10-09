# Director's vision

The design board for this film is at https://claude.ai/artifact/8wiHpEeGPFbn8hqK6DmwcQ. This file is the
same vision in words, for everyone who builds a shot. BRIEF.md is the contract; this is the taste. Where
the final song (SONG.md, music/score.json) differs from a detail here, the song wins and the device
adapts.

## The song we are shooting

The final song is **"Pen Pal"** (SONG.md). Hook: "I'm just your PEN PAL / I'll never HOLD the PEN";
call-and-response "Who holds the pen? / You do!". Its killer device replaces "the unresolved eighth"
below: in the final chorus the voice cannot sing the word *pen*; one beat of silence, and the writer's
keystroke types it. Wherever this file says "eighth step", read "the silent pen".

## Style: KINETIC PIXEL × SILHOUETTE (the look must be dripping with cool)

Two modes, switched by the song, inside one continuous take:

- **Desk mode (verses, pre-choruses, bridge).** The pixel-perfect era desk, the one-take camera, the
  desk-as-band foley you can see. Dense, witty, detailed.
- **Silhouette mode (every chorus and post-chorus).** A homage to the silhouette ads in One More Tune's
  lineage (Technologic, Jet): on the chorus downbeat the desk floods to ONE flat neon field (chorus 1 hot
  magenta, chorus 2 acid lime, chorus 3 electric cyan; post-choruses flip to the complementary field).
  Everything else becomes pure black silhouette: the windows, the menu bar, and Clio, who DANCES (a
  silhouette with a big readable pose per beat: bounce, point, spin, jump on the hits). The only white
  object on screen is **the writer's pen** (and its long white cord to the pointer), the way the white
  earbuds were the only white thing in those ads. No Apple logo, no iPod: a pen.
- **Kinetic type, oversized.** The hook words slam in as giant 1-bit pixel letters (Chicago at 8-24x,
  hard edges), cropped off the frame edges, stacked, stretched, stepped on the beat: "PEN" "PAL" fill the
  frame; "WHO HOLDS THE PEN?" stacks three lines high; "YOU DO!" punches in on the two hits. Type is
  part of the choreography, never a subtitle.
- **Beat-perfect surface FX.** On kicks: a 1-frame invert or a hard 2-pixel RGB split (dithered, palette
  only). On drops: a pixel-sort smear for 2 frames. On the snare: the zoom outline. Never mushy, never a
  blur: everything is crisp and on the grid.
- **Typography system.** Chicago (ChiKareGo2) for everything big; Geneva 9 (FindersKeepers) for small UI;
  Monaco for counters. Big type is always black-on-neon or white-on-black, never grey.

## Three spines (these override everything below)

A. **One take, through the pixels.** The film never cuts. It opens on a single white pixel in black,
   blinking with the boot chord; the camera pulls back and it is the full stop at the end of the
   writer's last sentence in a 1-bit TeachText window. At the end of each chorus the camera dives into
   one pixel (Clio's eye, the period, a checkbox): nearest-neighbour zoom until that pixel fills a block,
   and inside the block is the whole desk of the next era, which keeps growing until it is the frame.
   The bridge is a Powers-of-Ten tunnel: one dive per beat through the remaining eras. The outro is one
   continuous pull-back from 2026 through every era back to a single dot — the opening full stop, now in
   the writer's vermilion. Every pixel of 1988 contains 2026.
B. **The desk is the band.** Every percussive sound is a UI event you can see happen: kick = a floppy
   ejecting (pitched down), snare = a window closing with its zoom outline, clap = a mouse click,
   hi-hats = keystrokes (and those keystrokes type the writer's solid line), crash = emptying the Trash,
   riser = a progress bar filling, stab = our boot chord as brass hits on era changes, glockenspiel = the
   product's own Writing Bell. The bass is two floppy drives' stepper motors singing pitches (literally
   "two floppies"); their heads move on screen per note. The rest beat before "eight" is the loudest
   moment of the song.
C. **Bring your own model, as a choir.** The choir is three different local synthetic voices singing
   together.

## Six devices that make the film

1. **The unresolved eighth.** If the song climbs a scale and stops on the seventh degree (the leading
   note), the picture stops with it: Clio sings up a staircase of the route's stops and stands on step
   seven; the eighth step is an empty dashed box in the writer's colour. The band holds its breath; the
   writer's pointer clicks the eighth step; the tonic chord lands. The very last chord of the film is
   "played" by the writer pressing Return at the end of the manuscript.
2. **The screen grows with history.** The film opens on a 512x342 1-bit Macintosh screen, centred in
   black. As the eras advance, the screen widens and gains colour depth (1-bit → 4-bit greys → 256
   colours → thousands → millions), always hard pixels. On the final key change the black side bars are
   punched off the frame on the downbeat and the desk fills 16:9 for the first time.
3. **Dither is temporary, solid black is yours.** The writer's words are solid. Every word Clio sings
   appears as 50% dithered ghost type that pixel-dissolves unless the writer's pointer saves, clips or
   inserts it, at which point it turns solid. This is "AI output is temporary until you keep it" as a
   material.
4. **One colour belongs to the writer.** In the 1-bit world the only colour is a vermilion
   (`#FF5A36`-ish, a single palette slot): the writer's I-beam, the empty eighth step, the save button
   under the pointer. Clio never gets it.
5. **Twelve eras in a bar ladder.** The bridge counts the years; on each year the whole desk changes
   appearance while the manuscript window and its words do not move a pixel. Clio wears each era.
6. **The film weighs itself.** The end card measures this film's own source (score, synthesiser, drawing
   code) in bytes at build time and shows it on the Two Floppies meter against a 1,474,560-byte floppy.
   The number is real or it is not shown. Then the CRT collapses to a dot, and the dot lands as the full
   stop of "You may now write."

## Running props

- **Review Desk "Sounds like: YOU nn%"** in the menu bar. It dips to 97% whenever Clio tries to slip a
  sung line into the manuscript; the line bounces back to dither and the meter returns to 100%. It ends at
  100%.
- **Two Floppies** budget, `2,902,645 / 2,949,120 B`, flashes at chorus ends; reused for the end card.
- **One More Tune's white-label record** grows an eleventh track during an instrumental: "Name the ad."
  The answer is this film.

## Tone

Deadpan system copy, warm music, one big laugh per chorus. Every sung word changes something on screen.
Never a slogan the product does not back up (BRIEF §2). The audience should leave humming the hook and
remembering that the AI handed the pen back.
