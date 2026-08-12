# AI System 6 Design Contract

`CLAUDE.md` remains the top-level source of truth. This file is the design
operating contract for UI, CSS, visual review, and agent-generated interface
work. Read it before changing windows, controls, themes, layout, icons, motion,
or user-facing visual copy.

This contract adapts the useful parts of `external/taste-skill` and
`external/impeccable` to this product. Do not copy their default landing-page
or brand-site aesthetics into AI System 6.

For the normative application shell, typography roles, status-bar slots, TDI
adaptation, responsive priorities, and new-app checklist, follow
[HIG.md](HIG.md). Its machine-readable window registry is enforced alongside
the feature contracts; it does not create a second component library.

## Product Register

AI System 6 is product UI, not a marketing site. Design serves a writer who is
reading sources, sorting evidence, drafting, saving, reviewing, and exporting.
Familiarity is a feature. Surprise is allowed only when it clarifies object
identity or feedback.

Before adding a visible capability, answer three completion questions: does it
make the first finished work easier, make existing work safer, or make the next
session easier to resume? A change that answers no to all three is feature
inventory, not product completion, and stays out of the current Beta.

The Macintosh System 6 desktop metaphor is a constraint, not decoration:

- Visible objects beat abstract AI controls.
- One writing route beats a visible inventory of tools.
- AI output is temporary until the user saves, clips, inserts, or exports it.
- TeachText is the manuscript surface. ClioTalk is conversation.
- Reader clips source material. Scrapbook holds curated user selections.
- File Floppy is temporary context. Project Hard Disk is durable project state.

## Historical Vocabulary: System 6 Baseline, Classic Mac OS Library

System 6 is the product's visual and object-grammar baseline, not a historical
cutoff date. The full Classic Mac OS lineage is an available vocabulary library.
MultiFinder, Balloon Help, WindowShade, Apple Guide, and other later Classic Mac
OS ideas may be introduced, digested, and adapted when they improve the product.
Chronology is evidence to record, not a reason to reject a useful idea.

Adopting a historical element requires all of the following:

- Inspect the native resource or era-appropriate runtime behavior first. Record
  which system version supplied the evidence; do not present a later feature as
  native System 6 behavior.
- Preserve its original role and state transitions. Similar-looking controls
  are not interchangeable merely because they occupy the same chrome.
- Adapt the idea for web, pointer, keyboard, touch, narrow screens, and
  accessibility instead of reproducing an obsolete input limitation.
- Keep the default experience quiet. Later-system features should appear on
  demand or at the moment they become relevant, not as a feature inventory.
- Keep one semantic DOM and state model across all six appearances. Each era
  changes material and optical geometry, not the object's meaning.

Control meanings are load-bearing:

- The title-bar Zoom box chooses a window's standard size and position.
- The bottom-right grow box manually changes a resizable window's dimensions.
- WindowShade, a later Classic Mac OS behavior, collapses a window to its title
  bar and remains a separate double-click action; Zoom must never fall back to it.
- Full application and document windows may expose Zoom and grow. Fixed system
  windows and Desk Accessories generally omit them unless native evidence or a
  deliberate product contract says otherwise.

Progressive discovery divides responsibility instead of building one tutorial:

- OOBE stays a single, dismissible system welcome window. It points to the Apple
  and Special menus, keeps AI setup optional, and never becomes a setup wizard.
- MultiFinder is discovered through the startup environment: briefly explain
  Finder versus MultiFinder where that choice is made, then teach the real
  menu-bar switcher only after MultiFinder is enabled.
- [Balloon Help](https://en.wikipedia.org/wiki/Balloon_help) is a state-aware
  help mode, discoverable by default on hover-capable devices so new users meet
  it, and user-toggleable with the choice persisted. It answers “What is this?”
  and “Why is this unavailable?” in one or two actionable sentences. It must not
  become an automatic OOBE tour or replace task-oriented System Help.
- Balloon Help targets unfamiliar icons, system objects, and disabled-state
  reasons. It does not repeat visible button labels. Pointer hover or keyboard
  focus can reveal it; touch uses an explicit help mode followed by a tap.

In short: **System 6 is the grammar; Classic Mac OS is the vocabulary library.**

## Design Dials

Default design settings for this product:

| Dial | Value | Meaning |
| --- | --- | --- |
| Design variance | 3 / 10 | Predictable System 6 object grammar. No arbitrary expressive layouts. |
| Motion intensity | 2 / 10 | State feedback only. No decorative choreography. |
| Visual density | 7 / 10 | Dense, scannable tool surfaces. Air is reserved for writing and reading. |

Exceptions must be named in the feature contract. `Cover Glass` (file name
`liquid-cover.js`), `CMF Studio`, `ClioStage`, and media creation tools may
carry more visual range, but they still reuse the same window, control, state,
and theme contracts.

## Six Appearances, One Object Grammar

System 6, Platinum, Aqua, Snow Leopard, Yosemite, and Liquid Glass are material
skins over the same desktop language. They share object names, DOM structure,
task flow, copy, state model, keyboard behavior, and feature contracts.

The maintenance lineage has three deliberate branches:

- Classic → Platinum
- Aqua → Snow Leopard
- Liquid Glass → Yosemite

`recipeBase` names the comparison and authoring baseline; it does not activate a
second theme class. Each child owns a reviewable delta, so Aqua candy does not
leak into Snow Leopard and Liquid Glass refraction does not leak into Yosemite.
`family` is only for genuinely shared internal primitives.

Theme changes may alter:

- Material: bitmap paper, solid chrome, translucent glass, blur, rim light.
- Border and shadow tokens.
- Radius tokens.
- Icon rendering inside the same semantic icon id.
- Small optical spacing where the material requires it.

Theme changes must not alter without a documented reason:

- The user's task sequence.
- Which controls exist.
- Object names or verbs.
- Saved state semantics.
- Window ownership boundaries.
- Reading, writing, clipping, saving, or export rules.

Appearance work should be token-first:

1. Add the default token in `apps/desktop/styles/00-foundation.css`.
2. Put historical parameter-table deltas in `apps/desktop/styles/65-appearance-themes.css`,
   or Liquid Glass values in `apps/desktop/styles/70-liquid-glass.css`.
3. Compare child work against its registry `recipeBase` and override only the
   semantic values or small structural recipes that truly differ.
4. Consume the token from the shared base selector.
5. Avoid application-specific theme selectors and new Liquid Glass twins.

If a Liquid Glass twin is structurally necessary, add a short comment explaining
why a token cannot carry the difference.

### Appearance evidence ledger

Historical themes require a reviewable source chain. Reference code establishes
geometry and state coverage; it does not donate selectors, DOM, or redistributable
artwork.

| Theme target | Primary implementation evidence | Secondary evidence | Final calibration |
| --- | --- | --- | --- |
| Platinum — Mac OS 9 | MIT-licensed [`classic-stylesheets` Mac OS 9 recipes at `9ebd2d8`](https://github.com/nielssp/classic-stylesheets/tree/9ebd2d84664095345097a71e1a137f985d03d4f2/themes/macos9): window, button, input, tab, list, menu, and 16px scrollbar geometry plus state SVGs | Apple's [Mac OS 8 HIG](https://dev.os9.ca/techpubs/mac/pdf/HIGOS8Guidelines.pdf) supplies the 19px title bar, 20×58px standard button, 22px edit field, dialog spacing, and control semantics; [Classicy](https://github.com/robbiebyrd/classicy/tree/ca8c0ae294b5a289aa5a69cc223c152b55672d35) and [platinum.css](https://github.com/mat-sz/platinum.css/tree/d3f345731f886c7dc767be5877f10db14f11ead4) only cross-check missing geometry | Real Mac OS 9 Finder, Appearance, Open dialog, menu, SimpleText, and alert captures from the [GUIdebook Mac OS 9 gallery](https://guidebookgallery.org/screenshots/macos90) |
| Aqua — Mac OS X 10.2 Jaguar | [Quaqua 9.1 nested package](https://www.randelshofer.ch/quaqua/files/quaqua-9.1.nested.zip): `Quaqua15JaguarLookAndFeel.java`, its `jaguar/` resources, common push/default/field/choice/popup/scrollbar assets, and the [Jaguar wrap-tab contract](https://www.randelshofer.ch/quaqua/guide/jtabbedpane.html) | Apple's archived [Aqua HIG](https://developer.apple.com/library/archive/documentation/UserExperience/Conceptual/OSXHIGuidelines/) supplies control roles and interaction semantics, not Jaguar pixel values | Real 10.2 Finder, System Preferences, open/save panels, Mail, and dialogs in the [512 Pixels Jaguar library](https://512pixels.net/projects/aqua-screenshot-library/mac-os-x-10-2-jaguar/) |
| Snow Leopard — Mac OS X 10.6 | Quaqua 9.1: `Quaqua16SnowLeopardLookAndFeel.java`, Snow resources, active/inactive title bars and toolbars, source-list states, and size variants; the [Quaqua changelog](https://www.randelshofer.ch/quaqua/changes.html) records the Snow LAF arriving in 6.0 | Chromium's period [`platform-mac-snowleopard` Inspector CSS](https://chromium.googlesource.com/chromium/reference_builds/chrome_linux/+/f108f78bd628aceeb5d44dcaaac401a2a2e97a9d/resources/inspector/inspector.css) supplies Web-toolbar, search-field, status-bar, and compact custom-scrollbar evidence | Real 10.6 Finder, System Preferences, open/save panels, Mail, and dialogs in the [512 Pixels Snow Leopard library](https://512pixels.net/projects/aqua-screenshot-library/mac-os-x-10-6-snow-leopard/) |
| Yosemite — OS X 10.10 | [Yosemite-gtk-theme `03b6f721`](https://github.com/vinceliuice/Yosemite-gtk-theme/tree/03b6f721): checkbox/radio/titlebutton asset geometry and `gtk-light.css` control values, plus period pure-CSS window studies for the shell hierarchy | Apple's archived [OS X HIG](https://developer.apple.com/library/archive/documentation/UserExperience/Conceptual/OSXHIGuidelines/) supplies control roles; [512 Pixels OS X 10.10 library](https://512pixels.net/projects/aqua-screenshot-library/mac-os-x-10-10-yosemite/) (Retina 2x) calibrates Finder, System Preferences, and Apple-menu translucency | Real 10.10 Finder, System Preferences, open/save panels, menus, toolbar, sidebar, controls, and scrollbar, pinned in the maintainer fidelity baseline |

Resolve conflicts in that order of authority: a native screenshot from the target
OS wins; Quaqua supplies missing geometry, repeatable states, and regular/small/mini
relationships; period Web CSS only governs comparable Web-owned surfaces. Thus
Chromium's 11px gray Inspector scrollbar is a compact Web variant, while the Snow
Leopard system scrollbar remains the 15px blue Aqua control shown by Quaqua and
native open panels. External selectors, component DOM, and Apple-owned artwork
must not enter the repository.

Yosemite is the Liquid-Glass-family descendant for maintenance lineage only:
it owns an independent 10.10 painter under `body[data-theme="yosemite"]` and
must never be implemented as "Liquid Glass minus glass overrides" (see
`docs/THEME-FAMILY-CONTRACT.md`).

Platinum typography has an explicit licensing boundary: Charcoal and Charcoal
CY remain local system-font names; the OFL-licensed [Asap variable face at
`2de32f2`](https://github.com/Omnibus-Type/Asap/tree/2de32f20d7a0d48d4084adcf4bd6ac8115cf2f1a)
is the measured cross-platform fallback, followed by installed Geneva. Do not
redistribute an extracted Apple font or an unlicensed lookalike merely to make
a snapshot report the canonical face. Theme Lab reports “Charcoal” as the
historical target, not as a claim that the Apple binary has been bundled.

## Object Vocabulary

Agents must choose one of these object roles before inventing UI:

| Role | Use For | Default Shape |
| --- | --- | --- |
| Writing route window | Question Sheet, Outline, Section Drafts, TeachText, Review Desk, Project CD | Full application window with `.window`, `.title-bar`, `.window-pane` |
| Finder surface | Project Hard Disk, Applications, Trash, folders | Icon grid or list, object-first verbs |
| Reader surface | Source reading, extraction, clipping | Reading pane plus clipping controls |
| Sidecar Desk Accessory | Dictation Pad, Translation Pad, small helpers | Compact or sidecar DA near the supported work |
| Utility window | Searcher, DocMap, ClioStage, System Help | Task-specific window using shared chrome |
| Modal | Destructive confirmation, import/export operation, required setup | Short, blocking decision only |
| Status surface | Model state, save state, OCR/search/import progress | Visible feedback tied to a real operation |
| Creative lab | Cover Glass, CMF Studio, media tools, separate experiments | May be more expressive, still bounded by controls and states |

Prefer existing primitives before adding classes:

- `.window`, `.title-bar`, `.window-pane`
- `.btn`, `.mini-btn`, `.button-row`
- the custom System 6 select harness for finite dropdowns
- Finder items and list rows for objects
- shared empty, loading, error, selected, hover, focus, active, and disabled states
- existing system icon ids through `apps/desktop/app/core/system-icons.js`

Do not add a new component shape because it looks modern. Add one only when an
existing object role cannot express the task.

## Layout And Geometry

Window and panel geometry is tokenized. New repeated values belong in
`apps/desktop/styles/00-foundation.css`, not in scattered selectors.

Use:

- Fixed rem or px scales for product UI controls.
- CSS Grid for two-dimensional panes.
- Flexbox for one-dimensional rows and button groups.
- `gap` for sibling spacing.
- Component-scoped tokens for repeated geometry.

Avoid:

- Landing-page hero structures.
- Feature-card rows.
- Nested cards.
- Arbitrary `z-index` values.
- New layout `!important`.
- New JS inline styles for layout decisions.
- Layout animation on `top`, `left`, `width`, `height`, `padding`, or `margin`.

Dense tool surfaces should use panes, rows, dividers, and object lists. Cards
are reserved for repeated items, modals, and genuinely framed tools.

Layering uses the named `--z-*` vocabulary from `apps/desktop/styles/00-foundation.css`.
Global layers are ordered as windows, pinned windows, system modals, boot/shutdown,
demo overlays, then system menus. Window-internal controls, scrollbars, select
menus, and command popovers must use local `--z-local-*` tokens inside their
window stacking context; do not fix an internal overlap by jumping to a global
menu or demo layer.

## Material Rules

Classic theme:

- Black, white, shade, and desktop gray carry the interface.
- Sharp corners are the default.
- Borders and insets should feel like System 6 controls.
- Bitmap/System-style icon language wins over decorative illustration.

Platinum derives from Classic:

- Keep Classic density and object grammar.
- Add neutral gray depth, compact bevels, striped active title bars, and
  Mac OS 8/9 controls without turning them into Windows 95 chrome.

Aqua is the second recipe root:

- Use early Jaguar-era pinstripes, plastic depth, blue focus, candy default
  controls, and solid windows.

Snow Leopard derives from Aqua:

- Preserve the Aqua control skeleton while reducing candy gloss.
- Prefer unified silver chrome, tighter density, mature sidebars, and quieter
  shadows.

Yosemite derives from Liquid Glass:

- Retain the modern window structure while flattening it into thin, cold,
  compact 10.10-era planes and restrained vibrancy.
- Do not inherit Liquid Glass refraction, large radii, or card-like depth.

Liquid Glass theme:

- Glass is a material for the same objects, not a license for generic
  glassmorphism.
- Use existing glass tokens for surface, rim, highlight, tint, shadow, and
  radius.
- Keep translucency readable. Text contrast still has to work.
- Prefer token swaps over selector duplication.
- Provide reduced-transparency or solid-fill behavior where the surface would
  become illegible.
- For hover previews, relative surfaces, control continuity, motion families,
  and control-specific acceptance criteria, follow
  [LIQUID-GLASS-CONTROLS.md](LIQUID-GLASS-CONTROLS.md).

All appearances:

- One icon family per object id.
- One state vocabulary for controls.
- Text must fit in English and Chinese.
- No visual state may imply save, memory, network, indexing, check, or export
  unless that operation actually happened.

## Interaction And Motion

Product motion is feedback:

- Hover, focus, active, selected, disabled, loading, empty, and error states are
  required for interactive components.
- Most transitions should be 150 to 250 ms.
- Animate transform and opacity by default.
- Honor `prefers-reduced-motion`.
- No page-load choreography for ordinary product windows.
- No perpetual motion unless it communicates live state.

Use the project's native patterns before adding animation libraries.

For the shared state contract, behavior kernel, appearance ownership, and native
boundary, follow [Architecture](../ARCHITECTURE.md). Phased migrations remain
maintainer plans rather than a second public design authority.

## Copy Rules

UI copy should be direct and object-specific:

- Verb plus object for actions: "Save draft", "Delete project", "Export PNG".
- Links must make sense out of context.
- Error messages should state what failed and the next possible action.
- Empty states should tell the user how to create or add the missing object.
- Avoid generic AI-product language such as "elevate", "seamless",
  "next-generation", "unleash", "game-changer", or vague "AI-powered" claims.

Chinese UI must preserve the naming rules in `CLAUDE.md`. `Scrapbook` and
`TeachText` stay untranslated.

## Agent Preflight

Before changing a UI surface, answer these in the work notes or PR:

1. Which product object role is this?
2. Is it on the core writing route or a summoned utility?
3. Which existing primitives does it reuse?
4. Which tokens define its geometry, material, and state?
5. What changes from this appearance's registry `recipeBase`?
6. What states exist: default, hover, focus, active, selected, disabled,
   loading, empty, error?
7. What verification covers the six-era Theme Lab and at least one narrow
   Classic/Liquid viewport?

If an answer is "new pattern", justify it before editing CSS.

## Forbidden Defaults

These patterns are rejected unless the feature contract explicitly needs them:

- Centered marketing hero.
- Three equal feature cards.
- Thick side accent stripe on cards or rows.
- Gradient text.
- Decorative glass cards.
- Generic dashboard card grid.
- Nested cards.
- Native finite dropdowns instead of the System 6 select harness.
- New `!important`.
- New arbitrary `z-index`.
- New layout inline styles from JS.
- Sketchy decorative SVG scenes.
- Fake precision numbers.
- Placeholder names, fake logos, or lorem ipsum.
- Motion added because it looks impressive rather than because state changed.

## Review Gates

For visual work:

```sh
npm run build:app
npm run verify:css
npm run verify:design
npm run verify:theme-lab
npm run smoke:release
```

For theme-sensitive CSS work, also run:

```sh
npm run audit:liquid-twins
npm run visual:eval
```

Use the output from `npm run visual:eval` with the browser snapshot workflow in
`CLAUDE.md`, then run `npm run visual:diff -- <snapshot-file>`.

Optional design anti-pattern scan:

```sh
node external/impeccable/skill/tooling/detect.mjs --json apps/desktop/index.html apps/desktop/app apps/desktop/styles
```

Treat third-party and generated findings as signals, not automatic blockers.
Local product rules win when they are more specific.

`npm run verify:design` is the local blocker. Its counts live in
`tooling/design-budget.json` and may only increase with explicit justification.

## Migration Priorities

1. Migrate easy Liquid Glass twins to token swaps when touching nearby
   selectors.
2. Grow a small System 6 component kit from existing primitives.
3. Add visual snapshot coverage for any new recurring window/control pattern.
4. Reduce inline JS layout decisions by moving stable geometry into tokens or
   classes.
5. Add project-specific detector rules for the forbidden defaults above.

The goal is not more decoration. The goal is that every agent reaches for the
same object grammar before it reaches for taste.
