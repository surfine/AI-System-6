# AI System 6 Human Interface Guidelines

This is the normative interface and typography specification for AI System 6.
It translates the product boundaries in [Architecture](../ARCHITECTURE.md) and
the visual principles in [DESIGN.md](DESIGN.md) into repeatable decisions for
new applications.

The rules in this document are enforced where practical by
[`tooling/interface-guidelines-contract.mjs`](../../tooling/interface-guidelines-contract.mjs)
and `tests/features/interface-guidelines.test.mjs`. A new `data-window` is not
complete until it declares an object role and shell in that registry.

## Authority and evidence

Use this order when sources disagree:

1. Product semantics and the writing route in [Architecture](../ARCHITECTURE.md).
2. The AI System 6 design contract in `DESIGN.md`.
3. A real System 6 or era-appropriate Classic Mac OS resource or runtime
   observation for historical objects.
4. This HIG and existing shared primitives.
5. Modern platform guidance for legibility, adaptability, accessibility, and
   materials.

Modern Apple HIG is secondary evidence, not the visual authority. Its useful
constraints include minimizing typeface count, preserving hierarchy as text
changes, progressive disclosure, adaptable windows, non-color status cues,
keyboard access, and restrained material use. It does not authorize replacing
System 6 forms with generic AppKit, mobile, or web controls.

When reproducing a classic object, record the system version, resource or
runtime source, native bounds, and state sequence. If native evidence does not
exist, label the result as an AI System 6 interpretation.

## Product posture

AI System 6 is a local-first writing desktop. Its interface makes sources,
drafts, selections, saved files, review receipts, and exports into visible
objects. It does not present AI capabilities as a dashboard inventory.

The first-success route has a fixed priority: begin a Draft Desk document,
write or generate it, save it durably, then download or share it. New controls
must make that route easier, make saved work safer, or make resumption clearer;
otherwise they remain out of the current Beta.

Default design dials remain:

| Dial | Default | Consequence |
| --- | ---: | --- |
| Design variance | 3 / 10 | New apps reuse an existing object role and shell. |
| Motion intensity | 2 / 10 | Motion communicates state or ownership only. |
| Visual density | 7 / 10 | Chrome is compact; reading and writing content gets the air. |

## Object roles

Every window must declare exactly one role before markup or CSS is designed.

| Role | Purpose | Default shell |
| --- | --- | --- |
| Writing route | Question Sheet, Outline, Section Drafts, TeachText, Review Desk, Project CD | Full application window with visible document state |
| Finder | Project Hard Disk, File Floppy, Applications, Trash, object folders | Finder grid or list with object-first verbs |
| Reader | Source reading, extraction, clipping, archived-page reading | Reading pane with source and clipping receipts |
| Desk Accessory | Control Panel, Dictionary, Dictation, Translation Pad, Note Pad, small system tools | Compact utility near the supported work |
| Utility | Searcher, DocMap, System Help, context and conversion tools | Summoned task-specific application window |
| Modal | Confirmation, import/export decision, required setup | One short blocking decision |
| Status | Model, system, notification, or operation receipt | The receipt is the surface; do not add another status bar |
| Creative Lab | Cover Glass, CMF Studio, ClioStage, media experiments | Expressive content inside shared window and control semantics |

The role controls the shell, information density, and responsive behavior. A
Desk Accessory must not grow into a full application page merely because the
viewport is narrow. A utility must remain secondary to the writing route.

## Canonical application shell

New document and utility applications use this order:

```text
title bar: application identity
status bar: leading receipt | document context | trailing commands
optional TDI: vertical rail at wide sizes, compact stack in status context
main pane: the one primary reading, writing, or manipulation surface
optional local actions / Ask bar: owned by the pane with a safe bottom inset
grow box: only when the window is genuinely resizable
```

Use the existing primitives:

- `.window`, `.title-bar`, `.window-pane`;
- `.details-bar.app-status-bar`;
- `.status-bar-leading`, `.status-bar-context`, `.status-bar-trailing`;
- `.tdi-shell`, `.tdi-rail`, `.tdi-stack-host`;
- `.btn`, `.mini-btn`, `.button-row`;
- `.select-wrap` for finite choices.

Do not add a new shell class until the registry explains why none of the roles
above can express the task.

### Title bar

- The title bar identifies the application, not the current document.
- Keep the visible title stable as tabs or sources change.
- Put the full current document name in the title attribute when useful.
- Put the compact document identity in the status context or TDI stack.
- Do not repeat the same document title in both title bar and status bar.
- Zoom, grow, close, and WindowShade retain distinct meanings.

### Three-slot status bar

The shared status bar is a grid with three semantic slots:

| Slot | Owns | Examples |
| --- | --- | --- |
| Leading | Measurable state or live receipt | `16 nodes`, `Saved`, `Reading mode`, word count |
| Context | Current object, source, document stack, or finite workflow state | active document, URL, TDI stack, Draft/Review select |
| Trailing | One command group or one route action | `Commands…`, `View Manuscript`, `Open Flow` |

Rules:

- Status text reports confirmed state, never aspiration.
- A model call, save, import, OCR, search, clip, delete, or export must have a
  visible pending and terminal receipt.
- Commands belong in the trailing slot when they apply to the whole document.
- Local editing controls stay beside the content they affect.
- A specialized status bar needs a role-based rationale in the interface
  registry; it is not the default for a new app.

#### Status layout declarations

Every window contract chooses one layout before app-specific CSS is written:

| Layout | Use |
| --- | --- |
| `three-slot` | Standard application bar with leading, context, and trailing slots |
| `compact` | One- or two-ended receipt bar for a small utility or Desk Accessory |
| `finder` | Finder count, view, location, or selection chrome |
| `multi-row` | A second line is required for provenance or another non-truncatable receipt |
| `multi-receipt` | Several independent live receipts must remain visible together |
| `task-specific` | Pagination or Creative Lab controls whose roles cannot map to the standard bar |
| `navigation` | A navigation strip intentionally carries status and current-object identity |
| `receipt` | The whole status window is itself the receipt |
| `none` | The window has no persistent status chrome |

`three-slot` is the only standard application status model. Every other layout
needs a role-based rationale and an approved reference surface in
`windowInterfaceRegistry`. Compact bars use `.compact-status-bar` plus the
shared leading/trailing semantic classes; they do not copy the three-slot grid.

Responsive priority:

1. Preserve the live operation receipt.
2. Preserve enough document identity to avoid acting on the wrong object.
3. Keep the primary command reachable.
4. Ellipsize context before wrapping the bar.
5. Move secondary commands into `Commands…` before adding a second row.

### TDI document model

Use TDI only when one application owns multiple peer documents. Do not use it
for workflow steps, settings categories, or unrelated tools.

- The title bar remains the application name.
- The active document appears in the status context.
- Wide windows may show the shared vertical rail.
- Constrained windows replace the rail with the compact stack menu.
- Never add a permanent second horizontal tab row.
- One tab shows passive identity without a false disclosure affordance.
- Closing, reordering, dirty state, keyboard focus, and selection must use the
  shared TDI behavior.
- TDI geometry may change across breakpoints; the document model may not.

### Bottom controls and Ask bars

- Bottom controls belong to the owning pane, not the viewport edge.
- Preserve the existing safe-area and resize-affordance clearance.
- Add, search, network, and send controls use one visually centered row.
- Do not let plus, network, send, or resize controls touch the window edge.
- A compact button keeps a compact label. Put scope in status, Commands,
  Balloon Help, or accessible description instead of widening the button.
- On macOS-like wide layouts, do not place the only critical action at the
  bottom; keep an equivalent menu or command path available.

## Typography system

AI System 6 uses semantic type roles, not feature-local font stacks.

| Role | Token | Use |
| --- | --- | --- |
| Chrome | `--ui-font` | menus, controls, labels, status bars |
| Window identity | `--title-font` | application title bars and named system objects |
| Reading | `--text-font` | source prose, explanatory copy, ordinary long-form reading |
| Receipt | `--mono-font` | dates, paths, counts, technical state, compact metadata |
| Editing | `--editor-font` | editable manuscript and draft text |
| Modern preview | `--preview-font` | rendered document previews and approved contemporary content surfaces |
| Editor size | `--mde-font-size` | manuscript/editor glyph size |
| Editor measure | `--editor-measure` | readable manuscript line length |

Rules:

- Feature CSS must consume these roles instead of declaring a new font stack.
- Chrome inherits its size from the shared primitive; a feature must not resize
  the title bar, status bar, or ordinary button to create hierarchy.
- Establish hierarchy inside content with semantic headings, weight, spacing,
  and measure before inventing another type size.
- Avoid light weights on translucent or patterned surfaces.
- Preserve readable line length in Reader, TeachText, previews, and help.
- Truncation is acceptable for secondary document identity when the full value
  is available through title, Balloon Help, or the stack menu. Do not truncate
  live errors or destructive consequences.
- Chinese and English must be tested independently. Do not derive bilingual
  layout math from the first language rendered.
- Liquid Glass may swap the painter through existing theme tokens; it must not
  create a different information hierarchy.

## Spacing and alignment

AI System 6 has two spacing bands rather than one universal grid:

- **Chrome spacing** is compact and mechanical. It uses shared component tokens
  and one-pixel structure so menus, title bars, status rows, controls, and TDI
  align as one desktop system.
- **Content spacing** is calmer. Reading and writing panes may use larger owned
  gutters and paragraph rhythm without enlarging the chrome around them.

Canonical geometry tokens include:

- `--system-control-line`, `--control-radius`, `--system-menu-height`;
- `--details-bar-bg`, `--details-bar-border`,
  `--details-bar-optical-rise`;
- `--writing-window-gutter`, `--mde-page-padding-x`,
  `--mde-page-padding-y`;
- `--tdi-rail-width` and the component-scoped `--tdi-*` family;
- `--z-local-chrome`, `--z-local-overlay`, `--z-local-popover`.

Rules:

- Use the token owned by the component before adding a numeric value.
- Repeated geometry belongs in `apps/desktop/styles/00-foundation.css`.
- Theme values belong in the existing theme block; do not add a selector twin
  when a token can carry the material.
- Use Grid for two-dimensional shell structure, Flexbox for one-dimensional
  action rows, and `gap` for sibling spacing.
- Use optical centering for asymmetric glyphs and material, but preserve the
  same logical grid in Classic and Liquid Glass.
- Do not solve clipping by widening every control. First decide which item
  grows, shrinks, ellipsizes, moves into a menu, or becomes a compact variant.

## Controls and state

Every interactive control resolves state in this priority:

```text
disabled > loading > selected/open > pressed/dragging
         > focus-visible > hover-preview > default
```

The order controls authority, not exclusivity. Selection and keyboard focus
may both remain visible. Hover must never erase selection or imply completion.

Required behavior:

- Stable geometry across default, loading, selected, and open states.
- Keyboard focus at least as legible as pointer hover.
- `aria-label` for icon-only controls and status-aware accessible descriptions
  when the visible label remains compact.
- Loading disables repeat activation but keeps the original label footprint.
- Disabled controls explain why through Balloon Help when the reason is not
  obvious.
- Error state says what failed and the next available action.
- Destructive actions remain visually and semantically distinct.
- Finite choices use the System 6 select harness, with keyboard navigation,
  typeahead, Escape, and selected-state announcement.

## Responsive behavior

Responsiveness preserves task and object identity; it does not turn every
window into the same mobile page.

Each registry entry declares one model:

- `adaptive`: full application/finder geometry progressively compresses;
- `compact-da`: a Desk Accessory remains a centered compact column;
- `immersive`: a Creative Lab may dedicate more area to its artifact while
  preserving shared chrome and escape paths.

The device-orientation matrix is one acceptance contract, not four separate
products. Phone portrait, phone landscape, tablet portrait, and tablet
landscape must each preserve a complete primary-task path, confirmed state,
and an escape or return path. Adapt by container size and input capability;
orientation may change arrangement or offer a non-blocking recommendation,
but may not become an entry gate or state reset.

Rotation must not reload a surface or discard unsaved entry, selection,
operation receipts, or confirmed save state. Release held pointers and keys
before reconciling the new viewport so a touch begun in the previous geometry
cannot remain stuck after rotation. No primary action may be hover-only,
right-click-only, precision-drag-only, or keyboard-only.

Every new app must specify, for each shell region:

| Region | Allowed compact behavior |
| --- | --- |
| Title bar | Keep application name; ellipsize only as a last resort |
| Status leading | Preserve live receipt; abbreviate stable counts if needed |
| Status context | Ellipsize or use the TDI stack menu |
| Status trailing | Collapse secondary actions into `Commands…` |
| TDI rail | Replace with the compact stack; never add a horizontal row |
| Pane split | Collapse to one task with an explicit return path |
| Bottom controls | Wrap as an owned group or move secondary controls into Commands |

Test at a wide desktop and a constrained resizable window, then test all four
touch quadrants: phone portrait, phone landscape, tablet portrait, and tablet
landscape. For text entry, cover the software keyboard both open and closed;
on tablets, also cover pointer and keyboard operation. Run the matrix in
English and Chinese, with representative Classic and Liquid Glass passes. Test
the container width that actually fails, not only the browser viewport.

## Classic and Liquid Glass

Classic and Liquid Glass are two painters over one object grammar.

Shared across themes:

- semantic DOM and source order;
- object names, task sequence, and saved-state meaning;
- control anatomy, keyboard behavior, and responsive decisions;
- title/status/TDI ownership;
- accessibility labels and live receipts.

Theme-owned:

- fill, tint, translucency, rim, border, radius, and shadow tokens;
- theme-specific icon rendering for the same semantic icon id;
- small optical compensation that does not change task geometry.

Liquid Glass is chrome material, not content decoration. Do not put blur or
clear glass behind long-form reading merely to advertise the theme. One object
gets one primary glass surface; nested controls use relative tint or rim rather
than blur-on-blur. Reduced transparency must keep the same hierarchy.

## Accessibility and input

- Every action is keyboard reachable and has a visible focus state.
- Do not rely on color, translucency, sound, or animation alone.
- Keep System 6 visual target sizes, but use spacing and owned invisible hit
  regions where needed without changing the visible glyph.
- Honor `prefers-reduced-motion`; remove travel and scale while preserving
  immediate state feedback.
- Provide captions, subtitles, or transcripts for time-based media as the
  feature requires.
- Live receipts use an appropriate status/live region without repeatedly
  announcing stable chrome.
- Touch alternatives must exist for hover and precision gestures.
- Balloon Help answers “What is this?” or “Why is this unavailable?”; it does
  not repeat the visible label.

## Interface writing

- Use object-specific verbs: `Save draft`, `Clip selection`, `Export PDF`.
- Keep compact button labels compact; move explanations to status, help, or
  the command menu.
- Empty states name the missing object and the next action.
- Errors name the failed operation and a recovery path.
- Do not claim saved, clipped, indexed, searched, checked, or exported until
  the operation confirms it.
- Preserve product names and Chinese naming rules from `CLAUDE.md`.
- Test English and Chinese copy in title bars, status slots, menu rows,
  buttons, empty states, and constrained panes.

## Reference surfaces

Use these as the initial specimen set:

| Surface | Proves |
| --- | --- |
| Finder / Project Hard Disk | Finder object grammar and core-route entry |
| TeachText | writing window, editor measure, TDI, save state |
| Reader | source identity, clipping receipts, TDI, Commands |
| DocMap | summoned utility, pending/error receipts, TDI |
| Control Panel | compact Desk Accessory behavior |
| CMF Studio or ClioStage | Creative Lab exception inside shared chrome |

An exception observed on one specimen is not automatically a new global rule.

## New application checklist

Before implementation:

1. Add the `data-window` name and its contract to
   `windowInterfaceRegistry`.
2. Declare object role, core/summoned/system route, shell, SDI/TDI model,
   status model, and responsive model.
3. Identify the closest reference surface.
4. Name the existing primitives and tokens the app will reuse.
5. State what changes between Classic and Liquid Glass.
6. Define default, focus, selected, disabled, loading, empty, and error states.
7. Define English and Chinese compact behavior before fixing widths.
8. Record native evidence for reproduced classic objects.

Before handoff:

1. Build the app and run the named feature contract.
2. Run the interface-guidelines contract.
3. For CSS work, follow `css-no-pingpong` and capture the exact surface before
   and after in Classic and Liquid Glass.
4. Verify keyboard, pointer, touch alternative, reduced motion, and visible
   operation receipts.
5. Verify one wide and one constrained layout plus phone/tablet ×
   portrait/landscape in both languages; include software-keyboard states when
   the surface accepts text.
6. Confirm no new `!important`, arbitrary `z-index`, layout inline style,
   global scrollbar rule, or theme-only structural fork was introduced.

The goal is not to make every application look identical. The goal is that
every application belongs to the same desktop, communicates state the same
way, and adapts without losing its object identity.
