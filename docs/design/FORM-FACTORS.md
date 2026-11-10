# Form factors: where this desk lands

<!-- doc-claims: mixed | audited: 2026-09-21 -->

`CLAUDE.md` remains the top-level source of truth, and [DESIGN.md](DESIGN.md) is
the design operating contract. This file is the size contract: what each glass
this product lands on gets, what it keeps, and what it drops. Its point is that
a new screen size becomes a decision rather than a surprise — and that a size
which cannot carry the whole desk is told what it carries instead of being handed
a shrunken copy of everything.

## The one rule that already holds

Corners are owned twice. The era owns the corners **inside** the screen: System 6
is square, Liquid Glass is a soft 16px, and `--surface-radius` is how every sheet
says so. The display owns the corners **at** its edge, because there its own
curve is the corner: a full-bleed surface that rounds that edge itself draws a
second, smaller radius inside the device's.

Apple asks a full-bleed interface to "accommodate the corner radius, sensor
housing, and features like Dynamic Island" (Layout › Phone), and describes the
system's own masking as matching "the curvature of other rounded interface
elements throughout the system and the bezel of the physical device itself"
(App icons). A table of device radii would be stale the day a device ships, so
the desk answers with one token instead — `--edge-radius`, which every surface
that reaches an edge reads — and the shape those corners make together is
`--edge-shape`: the era's radius on the two sides inside the screen, the
display's on the two that meet it.

Measured, not assumed: `tooling/verify-display-corners.mjs` drives thirteen
shapes — six phone poses plus the Duo's laptop pose, three watch sizes, iPad
upright and sideways, and a 13-inch Mac — in the appearances, and asks the
painted tree which element still has a radius at a corner it shares with the
display. Every cell reports zero findings.

## What each surface is

| Surface | What it is | Keeps | Drops | Measured by |
| --- | --- | --- | --- | --- |
| Mac (13-inch and up) | The desk: floating windows, a menu bar at the top edge, pointer and keyboard | Everything, including many windows at once | — | Device matrix desk cells; display corners |
| iPad, sideways | The desk with a finger: the same windows, reachable by touch, split view and Stage Manager | Everything; windows are insets and can be arranged | Nothing by policy | Device matrix `ipad-11-landscape`; display corners |
| iPad, upright | The one-page flow (820px is inside the 860px band) | Every application, one at a time, full screen | The desktop launcher's second dimension, the MultiFinder stack | Device matrix `ipad-11-portrait`, `ipad-mini-portrait` |
| iPhone | The desk as a pocket device: one application at a time, the phone flow, the strip under the notch | Every application; the desk's launcher and MultiFinder on demand | Windows side by side | Device matrix phone cells; `tests/e2e/probe-one-more-tune-phone.spec.mjs`; `npm run verify:ios-standalone` for the home-screen web app |
| iPhone Duo, folded like a laptop | A small desk over a keyboard, the way a portable Mac folds: the upper half is the screen, the lower half is the keyboard; sideways a press on the keys is the trackpad, and upright a palm-rest pad is drawn, with the machine's chassis crossing the crease | The menu bar, one application at a time, the MultiFinder switcher, the running-app list, and every key the desk already answers (⌘S, ⌘Z, arrows, Esc). The whole flat half is a relative pointing surface: it moves a pointer inside the screen and clicks where that pointer is | The Dock, the desktop icons and the writing spine (the screen is 261px); free window dragging by title bar; the system keyboard, until the globe key asks for it | Device matrix `iphone-duo-pocket`; display corners `iphone-duo-inner-laptop`; `tests/features/device-matrix.test.mjs` |
| Apple Watch | A glance, not a desk | One question, one recording, three answers, the round's score | See *The wrist* below | Display corners (`watch-45mm`, `watch-41mm`, `watch-ultra`) |

## The Duo's laptop posture

Safari reports the pose through the Device Posture and Viewport Segments APIs,
both behind feature flags; `window.viewport.segments` gives two rects and the
gap between them is the hinge. The dock lands in the upper segment, the deck in
the lower, and the two do not share a pixel. When the flags are off the Apple
menu offers the same mode by hand.

A finger gets a target even where the drawing cannot afford one. The deck's key
is drawn at about 40px, which is what lets five rows fit a 313px deck; the key
grows its own hit area 2px into the 4px gap, so the measured target is 44.5px
(`iphone-duo-pocket` in the device matrix reads it by asking the page which key
a point belongs to). The Chrome glyph rule already says the same thing for title
bars: the drawn control keeps its size, the region around it grows.

The same posture, folded the other way, is a **book**: two pages side by side.
Nothing is drawn, but the crease is a reserved region, so an app page is pinned
to the primary segment instead of stretching across the join — HIG's own reason
is that a control on the crease is hard to press, and a split view that cannot
divide cleanly collapses to one pane. The book cell in the device matrix stands
the class and the token up by hand (Playwright has no hinge) and measures that
the page ends at the crease.

Fold posture is behind Safari feature flags at launch, so the Apple menu offers
the laptop mode by hand; everything else is measured where it can be.

Three rules are the design:

- **One machine, drawn across the crease.** The chassis is decoration and takes
  no pointer. Only the working surfaces obey safe areas. The B side is the
  lid: its border is that machine's bezel, and the desk sits in the hole.
  The C side is the deck. The inner panel is 1878×2670 px, ratio 445:313;
  sideways that is 890×626 CSS px and upright it is 626×890. Sideways the
  deck is only the keyboard, and a press on it is the trackpad, with the
  legends blanking first. Upright, a separate pad sits on the palm rest.
  The frame is square where it meets the hinge.
- **The keys stay put.** Upright, a status rail, the keys and the palm rest
  stack, and only the keys scroll. Sideways the palm rest is not drawn; a
  press on the keys is the trackpad, and a tap is still a key.
- **The material is the machine, and each appearance has its own.** System 6 is the Macintosh Portable, System 7 the PowerBook 170, NeXTSTEP a PowerBook 5300 in NeXT's own grey (NeXT never shipped a portable), Drawing Board the Wallstreet, Platinum the Lombard, Aqua the Titanium PowerBook, Tiger the last 15-inch aluminum PowerBook, Snow Leopard the 13-inch Unibody, Lion the 2011 Air, Yosemite the 2014 Retina 13, Big Sur the M1 Air, and Liquid Glass the 14-inch MacBook Pro. A published body width is the unit: the PowerBook 170's 18.63 mm key is that fraction of 286 mm, not a shared pitch. The fold fixes the deck's height, so the vertical scale is compressed and the ratio is written down per machine. Each one also carries the parts you recognise: the model name printed under the display (every generation but the 14-inch, which has none on the inside face), its keycap shape and colour, its pointing hardware, its hinge, and the black glass bezel that arrives in 2009. Materials are our own generated grain tile and 1px brushing folded into the sheet as a data URI, never a photograph of the hardware; the colour still comes from tokens, so a dark color mode, more contrast and forced colors restyle every machine.
- **The launcher stays.** The Dock and the Control Strip step aside — no
  portable Mac draws its Dock over the keyboard — but the desktop's icon column
  is how an application is opened, and HIG asks for the same content in every
  pose. The phone flow already folds both rails away while an app owns the
  screen, which is the only case that needs it.

The outside of that machine is the **A side**, and it is only ever seen shut.
A closed Duo reports the fold and has one display to lay out, so the outer face
is drawn full bleed: the era's material and grain, its hinge or front catch, its
sleep light where it had one, and nothing invented — the mark left the lid in
2021, and a wrong silhouette is worse than no mark. It is off by default: a
closed phone is still a phone until the Apple menu asks for the lid, and a tap
gives the phone back. The switch is inserted by the lazy module beside the mode
it belongs to, because the boot budget pays only for what every desk needs.

The pad is a trackpad, not a touch layer: the finger never touches what it
points at. Sideways, a press on the keyboard blanks the legends and moves the
pointer; a tap still types, and the legends return when the finger lifts.
Upright, the pad is the palm rest: a tap clicks at the pointer, two fingers
that stay put is a right-click, and two fingers that move scroll without ever
also clicking. The pointer stays inside the screen segment. A key reached with
Tab and activated with Return, and a finger tap on that same key, are one
action each, and the caret is back in the field before either types.

Known limits, stated rather than hidden: the keys are a US layout with a globe
key to the system keyboard (an IME cannot be rebuilt here); the pad cannot drag
a text selection, so ⇧ with the arrow keys is the way to select; a pinch-zoom
scales the whole page and the deck's geometry is in layout pixels; a hardware
keyboard works, but the deck does not detect it and hide itself.

## Corner ownership, per display

- **iPhone, iPad, Watch**: the one-page flow fills the glass, so the shells meet
  the display's side and bottom edges. Those corners are the display's; the ones
  under the menu bar are the era's. The composer — the shell's last row — keeps
  the era's lower corners only while a safe-area inset holds it off the edge.
- **Mac**: windows float inside a desktop and never touch the glass, so there is
  nothing to hand over; the era owns every corner a window draws. The menu bar
  does meet the top edge, and a square top corner there is the display's own
  curve doing the work.
- **Watch**: the platform reports no safe area, because the entire screen is a
  curve the system owns. Nothing may be placed expecting a margin it will not
  get: every surface that reaches an edge is square there, and the display
  rounds it.

## The wrist

watchOS is not a small phone, and this is the surface where the honest answer is
a shorter product rather than a smaller one. The platform's own words: people
"glance at their Apple Watch … performing concise app interactions that can last
for less than a minute each", and a watch app should "support quick, glanceable,
single-screen interactions that deliver critical information succinctly" and
"minimize the depth of hierarchy in your app's navigation"
(Designing for watchOS).

**One More Tune on a wrist is one question.** The sound is the question, the
wrist is raised for a few seconds, and there is no room for a shelf, a study
route, a catalogue or a poster. What the glance keeps:

- one question at a time, its recording, and three answers rather than four —
  a thumb on a 45mm screen has less room for near-misses than a finger on a
  phone;
- a round of three cards rather than ten, because a ten-question round is a
  phone session;
- the round's own score, and one tap to hear the cue again.

**What the wrist drops, and why.** The card shelf, the study route and the round
setup — they are browsing, and browsing is a phone job. The sources/backstage
face, the credits and the "settle this pairing" workflow — they are research
tools. The film window, the Apple Music store link and the share poster — the
poster is a phone-shaped artifact and a link on a wrist has nowhere to go. Free
text of any kind, and with it the challenge-code entry: a wrist has no keyboard.
The desktop launcher, the MultiFinder and the menu bar — a glance has no menus.

**How it is delivered.** There is no Safari app on the Watch and no address bar
anywhere on it, and a third-party watch app cannot be a web page — but the
system's own message and mail views do open links, in a web view the crown
scrolls. So a shared round is playable on the wrist *through this page*, today,
without a companion: `/go/one-more-tune` in a message, one tap, and the quiz is
the watch app for that minute. (The owner corrected an earlier draft of this
file that claimed the Watch could not open a page at all. It can; it just cannot
type a URL.) What a companion would add is the part a web view cannot give — a
complication, a notification, haptics — and the round API it would use already
exists: `/api/one-more-tune/round` and `/answer` take a challenge id and a
question index and return no answer key.

That makes the glance layout the delivery path rather than a rehearsal for one,
and it is measured as such: arriving from a link at 396x484, in Chromium and
WebKit, the quiz window comes to the front, the question sounds, nothing is
clipped and nothing scrolls. The band in the quiz sheet is what makes that true
— the masthead stands down, the header stops reserving a desktop masthead's
height, the tab row grows from a 28px strip to a thumb, the four answers sit two
by two, and the reveal's stage gives up the height its record box needs.

**What is not claimed.** No watchOS app exists — no complication, no
notification, no haptics, and no way to type a challenge code on a wrist: a web
view has no keyboard, so a round arrives as a link or not at all. The plan above
is the contract for that app, and the web side is held to the part of it that
can be measured today: a shared link opens and plays at watch size, the shapes
render, nothing scrolls sideways, targets there meet the touch minimum, and no
corner at a display edge is drawn twice.

## Open items

- The desk's launcher at watch size: its second row is clipped, so on a wrist
  the launcher is reachable only through what fits. A glance has no launcher,
  which is why this is a plan item rather than a layout fix.
- The menu bar's targets: 20-28px rows on every touch device until this release,
  which is below even WCAG 2.2's 24px floor — and the bar's own controls sat
  directly above a window's close and zoom boxes, so a missed tap could close a
  window. A coarse pointer now raises the theme's own token to
  `max(--system-menu-height, 44px)`, which moves the bar, the windows below it,
  the dialogs and the popovers together; a Mac keeps its 24 and 22, because a
  pointer does not need the room. The quiz's own tab row grew with it: 28px to
  44 upright, 24 to 36 sideways, where height is the scarcest thing the product
  has.
- Haptics: a watch companion would answer a correct answer with a tap on the
  wrist, and the web side has no haptics. When the companion exists, the round
  payload should carry what it needs to decide that.
- The 45mm display's Digital Crown is the platform's navigation for switching
  screens; the web page cannot read it, so the glance's three faces stay on
  screen instead of behind a crown.
- The reveal face on a sideways phone: measured, its record box and its tail
  need about 120-140px more than a 402px-high screen's pane has, so that one
  face scrolls inside itself while the question and the round result do not.
  Nothing is unreachable — the pane scrolls, and the Study menu carries the way
  onward as well — but "one screen" is not yet true there, and it is the last
  face where it is not. The wrist had the same defect and does not any more (see
  the watch band: nothing clipped, no pane scroll at 396x484).
