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

Measured, not assumed: `tooling/verify-display-corners.mjs` drives twelve
shapes — six phone poses, three watch sizes, iPad upright and sideways, and a
13-inch Mac — in all six appearances, and asks the painted tree which element
still has a radius at a corner it shares with the display. Seventy-two cells,
zero findings.

## What each surface is

| Surface | What it is | Keeps | Drops | Measured by |
| --- | --- | --- | --- | --- |
| Mac (13-inch and up) | The desk: floating windows, a menu bar at the top edge, pointer and keyboard | Everything, including many windows at once | — | Device matrix desk cells; display corners |
| iPad, sideways | The desk with a finger: the same windows, reachable by touch, split view and Stage Manager | Everything; windows are insets and can be arranged | Nothing by policy | Device matrix `ipad-11-landscape`; display corners |
| iPad, upright | The one-page flow (820px is inside the 860px band) | Every application, one at a time, full screen | The desktop launcher's second dimension, the MultiFinder stack | Device matrix `ipad-11-portrait`, `ipad-mini-portrait` |
| iPhone | The desk as a pocket device: one application at a time, the phone flow, the strip under the notch | Every application; the desk's launcher and MultiFinder on demand | Windows side by side | Device matrix phone cells; `tests/e2e/probe-one-more-tune-phone.spec.mjs` |
| Apple Watch | A glance, not a desk | One question, one recording, three answers, the round's score | See *The wrist* below | Display corners (`watch-45mm`, `watch-41mm`, `watch-ultra`) |

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
