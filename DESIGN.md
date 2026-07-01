# AI System 6 Design Notes

AI System 6 is product UI, not a landing page. It should feel like a quiet
writing desk: readable, deliberate, and a little old-fashioned in the useful
ways.

The Macintosh System 6 reference is a constraint, not decoration. Prefer named
objects over abstract AI controls. Prefer visible state over hidden automation.
Do not imply that something was saved, clipped, searched, indexed, checked, or
exported unless the app actually did it.

## Principles

- Keep the first writing route clear: Project Hard Disk, File Floppy, Question
  Sheet, Outline, Section Drafts, Manuscript, Review Desk, Project CD.
- Use existing windows, buttons, lists, panes, modals, and Finder objects before
  inventing a new component.
- Dense tool surfaces are fine. Marketing layouts are not.
- Classic and Liquid Glass are skins over the same object grammar. They should
  not change the user's task sequence.
- UI copy should name the object and action plainly: save draft, export PNG,
  delete project, clip source.

## Themes

Classic uses sharp System 6-style chrome, bitmap assets, and plain contrast.
Liquid Glass uses translucency and blur, but only where text stays readable.

Theme work should be token-first:

1. Add the default value in `styles/00-foundation.css`.
2. Override Liquid Glass values in `styles/70-liquid-glass.css`.
3. Reuse the same DOM and behavior.

Avoid adding theme-specific selector copies unless a token cannot express the
difference.

## Layout

Use CSS Grid for panes, Flexbox for rows, and `gap` for spacing. Repeated
geometry belongs in tokens. Avoid arbitrary `z-index`, new layout
`!important`, nested cards, and JS layout styles.

Cards are for repeated items, modals, or tools that genuinely need a frame. A
page section should not become a stack of decorative cards.

## Interaction

Interactive controls need visible default, hover, focus, active, selected,
disabled, loading, empty, and error states. Motion should explain state, not
decorate the page. Keep transitions short and honor `prefers-reduced-motion`.

## Before changing UI

Ask:

1. Which product object is this?
2. Is it part of the main writing route or a summoned utility?
3. Which existing primitive can carry it?
4. What changes between Classic and Liquid Glass?
5. What test or screenshot proves the change still works?

Run at least:

```sh
npm run build:app
npm run verify:css
npm run verify:features
```
