# Classic / Platinum Fidelity Contract

This is the written companion to
[`tooling/classic-platinum-fidelity-contract.json`](../../tooling/classic-platinum-fidelity-contract.json).
It records the visual and interaction contract for the Classic (System 6) and
Platinum (Mac OS 9) appearances. It is a *modern product* contract, not a
historical museum spec.

## Authority order

When evidence conflicts, resolve in this order:

1. Current product function, user task, touch/mobile usability, accessibility.
2. `CLAUDE.md`, `docs/design/DESIGN.md`, `docs/design/HIG.md`.
3. The repo's existing theme architecture, shared DOM, state model, and
   responsive contract.
4. Real System 6.0.8 / Mac OS 9 screenshots, native resources, and runtime
   behavior.
5. Apple Mac OS 8 HIG, pinned reference code, and measurement records.
6. `(mac)OStalgia` and the two Figma community files.
7. Subjective taste.

Historical dimensions are calibration evidence, never a hard acceptance value on
every device.

## Enforced contract vs. reference targets

`npm run verify:design` reads the machine contract, validates its current
principles and state ordering, and proves that each token listed under
`enforcement.requiredLiveRoleTokens` has a real declaration and consumer.
Numerical fine/coarse ranges, wildcard token-name patterns, and proposed spacing
tokens remain reference material. They do not require a declaration with no
consumer and never override newer product decisions in `CLAUDE.md`. Promote a
reference token into the enforced list only when a real shared component uses it.

## Product is not a museum

- Do not reduce a component's current tested interaction geometry merely to
  match historical size, and do not enlarge visible System 6 art solely to hit
  an old planning number.
- Do not turn mobile into a scaled-down desktop screenshot.
- Do not restore obsolete input limits (precise drag, hover-only, right-click).
- Do not compress reading, editing, Markdown preview, charts, or media into
  1988/1999 screen density.
- Do not sacrifice Chinese readability, keyboard focus, touch feedback, rotation
  stability, or safe areas for "historical accuracy".

## Icon assets are frozen

- Keep Classic smooth monochrome SVG and the accepted Platinum icon family.
- No new, redrawn, replaced, or batch-reviewed icons; no pixel mode; no ImageGen.
- Allowed icon edits are CSS-only: size, alignment, padding, crop, and container/
  mask behavior for hover/selected/inactive/disabled states.
- Icon problems are recorded as visual debt unless they are pure CSS layout or
  state errors.

## Adaptive sizing: three layers

Use three semantic layers instead of one fixed pixel set:

| Layer | Purpose |
| --- | --- |
| `historical reference` | calibrate proportions, line weight, and component relationships |
| `fine pointer geometry` | compact visible sizes for mouse/trackpad |
| `coarse pointer geometry` | comfortable visible sizes and hit ranges for touch |

Never adapt the whole UI with `transform: scale()`. Use theme and input-method
tokens so the menu bar, title bar, controls, icon slots, status bar, and spacing
get explicit values per input environment.

Reference ranges (historical planning targets, not automated limits):

| Item | historical | fine pointer | coarse pointer |
| --- | ---: | ---: | ---: |
| Menu bar | ~20px | 22–24px | 32–38px |
| Classic title bar | ~17px | 20–24px | 30–36px |
| Platinum title bar | ~19px | 21–25px | 30–36px |
| Button visible height | ~20px | 24–30px | 36–44px |
| Field visible height | ~20–22px | 28–32px | 40–46px |
| Scrollbar visible width | ~15–16px | 16–18px | 20–26px |
| Min touch hit | n/a | ≥ current | 44×44px |

Preserve currently working touch behavior and follow `CLAUDE.md` when its
current mobile decisions differ from this historical planning table.

## Visual size / hit size / layout slot

Title-bar button artwork, clickable range, and layout slot may use different
scales. The following names describe the conceptual roles; introduce a concrete
token only when more than one real consumer needs the role:

- `--*-visual-size` — how large the artwork appears.
- `--*-hit-size` — how easy the control is to click.
- `--*-layout-slot` — how chrome distributes space.
- `--*-optical-offset-x` / `--*-optical-offset-y` — optical corrections.

A large slot must not pointlessly push a title off-center. Coarse-pointer hit
geometry follows the owning component's tested responsive contract while the
visible artwork remains clear and stable. No hidden oversized hit layer may
cover adjacent controls.
`focus-visible` is drawn on the real control bounds.

## Window / content spacing tokens

`.window-pane` must not hardcode one padding for every app. These are candidate
semantic roles, not mandatory declarations; reuse an existing live role first
and add one of these only with a real consumer:

```css
--window-pane-padding
--window-pane-gap
--window-toolbar-padding
--window-status-padding
--content-reading-padding-x
--content-reading-padding-y
--touch-safe-inset
```

System tools and Finder stay compact; Desk Accessories are more compact but keep
touch space; Reader/TeachText/Markdown preview use reading gutters; creative labs
follow their canvas; mobile compresses per container width and safe area.

## Classic shell language

Classic stays smooth monochrome SVG on high-DPI screens, never a low-res bitmap
or pixel mode:

- Black, white, and neutral gray stay the primaries.
- Title-bar striping, window border, button outline, scroll track, and selection
  inversion keep System 6 structure.
- Gray is allowed for antialiasing, disabled state, shadow hierarchy, and modern
  content areas, but never soft gradients, glass, overlays, or modern cards.
- Desktop pattern is uniform, low-interference, and stable at DPR 1/2/3.
- No blur, backdrop-filter, soft shadow, glow outline, hover lift, or decorative
  animation.
- Titles, menus, and buttons avoid browser-synthesized bold; use an explicit
  weight and `font-synthesis: none`.
- Latin chrome keeps Chicago/Geneva roles. Chinese gets baseline, line-height,
  weight, and vertical padding corrections without inflating all chrome.
- Smooth SVG must not be non-uniformly scaled, cropped, or blurred at 16, 32, or
  desktop sizes.

The goal is System 6's black/white structure and restraint, not literal 1-bit
rendering.

## Platinum material and bevel

One grayscale set and three bevel recipes, reused across all chrome. Apps must
not invent their own `#aaa/#888/#555` stacks.

| Role | Value |
| --- | --- |
| highlight | `#ffffff` |
| face | `#dddddd` |
| raised mid | `#cccccc` |
| shadow | `#999999` |
| dark shadow | `#777777` |
| ink | `#000000` |
| accent | `#333399` |
| selection muted | `#ccccff` |

Bevel recipes, all with 0 blur radius:

- **raised** — top/left light, bottom/right dark.
- **sunken** — top/left dark, bottom/right light.
- **pressed / selected** — inverted bevel plus a 1px inner optical shift; never
  changes outer size, triggers reflow, or makes the touch target jump.

Soft `inset 1px 1px 1px` / `1px 2px 4px rgba(...)` shadows on buttons, menus,
title bars, scrollbars, Control Strip, or system panels become 0-blur hard
bevels. Exceptions: modern content canvas, evidence-backed floating desktop
objects, accessibility focus, and non-chrome creative content.

### Accent decoupling

Do not scatter the purple-blue selection color across controls:

- `accent` — menu/list selection and keyboard focus.
- `selection-muted` — inactive-window or weak selection.
- `scrollbar-thumb` — Appearance-controlled, not permanently the selection color.
- `desktop-pattern` — the azul tile; it never drives control color.
- `focus-ring` — independent token, may relate to the selection color.

Azul tile can stay as a Mac OS 9 desktop scheme. The default scrollbar thumb
stays light blue-purple (`#9999ff`) as the intentional Mac OS 9 default: a
dedicated token decoupled from selection, and deliberately not a user-facing
Appearance setting (no added settings burden).

## State model

Priority order:

```text
disabled → loading → selected/open → pressed/dragging →
focus-visible → hover-preview → default
```

- Hover never changes a push button's geometry, lifts it, or enters pressed.
- Pressed is entered only via pointerdown / Space / Enter or equivalent.
- Menu tracking, list rows, Finder objects, and draggable objects may hover-preview.
- Hover never overrides selected; selected and focus may both be visible.
- `focus-visible` is independent of hover.
- Disabled keeps full geometry and is expressed via contrast/pattern/recipe.
- Touch pressed feedback appears on touchstart and releases on touchend/cancel.
- Rotation, window switch, and pointercancel never leave a stuck pressed state.
- All key states are pinned in Theme Lab, not dependent on live mouse position.

## Title bars, menus, and window chrome

### Classic

- Active windows keep black/white striping and a solid title cutout.
- Inactive windows drop the active stripe and unavailable buttons but keep a
  clear title and border.
- Close and zoom keep distinct meanings and artwork.
- Title text, buttons, striping, and baselines stay clear at DPR 1/2/3.
- Mobile may raise title-bar height and button/hit sizes without changing meaning.
- Narrow windows keep the app name and a close path before secondary controls.
- Double-click/precise drag is never the only mobile path.

### Platinum

- Fine striping, gray layers, and compact bevel.
- Title text is centered with an opaque background cutting the stripe.
- Close, zoom, and WindowShade keep their existing correct artwork and states.
- Inactive title bars keep gray structure at reduced contrast.
- Menu panels are gray raised surfaces with a 1px black border and hard shadow.
- Shortcut columns are right-aligned; submenu arrows, checkmarks, and separators
  have fixed slots.
- Separators are sunken channels, not web `<hr>`.
- Standard dialog default buttons keep a clear outer ring, not a modern blue
  primary button.
- Mobile may enlarge menu row height and horizontal padding while keeping
  Platinum material; offscreen menus scroll or reposition within safe areas.

## Real apps vs. chrome

Keep modern web traces out of system chrome; keep modern readability in content:

- Shell, windows, menus, controls, lists, and status feedback follow Classic /
  Platinum.
- Long-form reading, editing, Markdown preview, charts, media, and complex
  creative canvases keep modern readability.
- Content connects to chrome via border, scrollbar, status bar, and clear
  hierarchy — not card-in-card, rounded hover tiles, floating white cards, or
  marketing sections.

## Mobile and touch are formal acceptance

Required viewports: 390×844 DPR3 coarse, 844×390 DPR3 coarse, 820×1180 DPR2
coarse, 1180×820 DPR2 coarse, iOS standalone/home-screen safe area, soft keyboard
open/close, and rotation preserving state.

Every high-frequency window must: open, close/return, scroll, input, run its
primary action, show success/failure/progress, avoid precise drag, avoid
obstruction by menu bar/title bar/Control Strip/safe area, keep its identity
when fullscreen or single-column, not jump when switching Classic/Platinum, and
not overflow in English or Chinese.

Allowed mobile adaptations: near-fullscreen windows, multi-column to single-task,
secondary commands into `Commands…`, TDI rail to compact stack, taller title
bar/controls, bottom actions wrapping or pinning to the pane safe inset.

Forbidden mobile regressions: collapsing apps into an untitled web page, removing
status-bar operation results, icons without labels, close/save/send/back behind
hover, reload/state-loss on rotation, and global `zoom`/`scale()` desktop scaling.

## Theme Lab is the acceptance bench

Extend the existing Theme Lab (do not create a second component library) with a
pinned state matrix driven by `data-*` attributes, stable under capture without
dependence on live mouse position. Include active/inactive, fine/coarse, button
states, checkbox/radio, field/select, menu/submenu/shortcut/checked, tabs,
Finder icon states, list-row states, scrollbar parts, modal, Balloon Help,
Control Strip, Chinese/English short/long labels, 320–390px containers, keyboard
focus, and touch pressed. No icon review board.

## Open / disputed items

Record unresolved decisions here rather than in the JSON. (None at authoring time;
add as they arise.)
