# AI System 6 Design Contract

`CLAUDE.md` remains the top-level source of truth. This file is the design
operating contract for UI, CSS, visual review, and agent-generated interface
work. Read it before changing windows, controls, themes, layout, icons, motion,
or user-facing visual copy.

This contract adapts the useful parts of `external/taste-skill` and
`external/impeccable` to this product. Do not copy their default landing-page
or brand-site aesthetics into AI System 6.

## Product Register

AI System 6 is product UI, not a marketing site. Design serves a writer who is
reading sources, sorting evidence, drafting, saving, reviewing, and exporting.
Familiarity is a feature. Surprise is allowed only when it clarifies object
identity or feedback.

The Macintosh System 6 desktop metaphor is a constraint, not decoration:

- Visible objects beat abstract AI controls.
- One writing route beats a visible inventory of tools.
- AI output is temporary until the user saves, clips, inserts, or exports it.
- TeachText is the manuscript surface. ClioTalk is conversation.
- Reader clips source material. Scrapbook holds curated user selections.
- File Floppy is temporary context. Project Hard Disk is durable project state.

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

## Two Themes, One Object Grammar

Classic and Liquid Glass are two material skins over the same desktop language.
They share object names, DOM structure, task flow, copy, state model, keyboard
behavior, and feature contracts.

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

New theme work should be token-first:

1. Add the default token in `styles/00-foundation.css`.
2. Override the value inside the existing `body.use-liquid-glass {}` block in
   `styles/70-liquid-glass.css`.
3. Consume the token from the base selector.
4. Avoid adding a new `body.use-liquid-glass .selector` twin.

If a Liquid Glass twin is structurally necessary, add a short comment explaining
why a token cannot carry the difference.

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
- existing system icon ids through `app/core/system-icons.js`

Do not add a new component shape because it looks modern. Add one only when an
existing object role cannot express the task.

## Layout And Geometry

Window and panel geometry is tokenized. New repeated values belong in
`styles/00-foundation.css`, not in scattered selectors.

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

Layering uses the named `--z-*` vocabulary from `styles/00-foundation.css`.
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

Liquid Glass theme:

- Glass is a material for the same objects, not a license for generic
  glassmorphism.
- Use existing glass tokens for surface, rim, highlight, tint, shadow, and
  radius.
- Keep translucency readable. Text contrast still has to work.
- Prefer token swaps over selector duplication.
- Provide reduced-transparency or solid-fill behavior where the surface would
  become illegible.

Both themes:

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
5. What changes between Classic and Liquid Glass?
6. What states exist: default, hover, focus, active, selected, disabled,
   loading, empty, error?
7. What verification covers both themes and at least one narrow viewport?

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
node external/impeccable/skill/scripts/detect.mjs --json index.html app styles
```

Treat third-party and generated findings as signals, not automatic blockers.
Local product rules win when they are more specific.

`npm run verify:design` is the local blocker. Its counts live in
`scripts/design-budget.json` and may only increase with explicit justification.

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
