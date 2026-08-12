# Liquid Glass Control Experience

This document extends [DESIGN.md](DESIGN.md) for controls rendered in the
Liquid Glass theme. `CLAUDE.md`, `DESIGN.md`, the System 6 object grammar, and
feature contracts remain authoritative. This is not permission to redesign
Classic, change task flow, or import a generic component library.

The guidance adapts ideas from
[Fluid Functionalism](https://www.fluidfunctionalism.com/) (reviewed
2026-07-28) to AI System 6. The useful lesson is not its visual style. It is
that modern controls feel responsive because material, hover, motion, and state
all explain what the interface is about to do.

## Target Feel

Liquid Glass controls should feel:

- quiet at rest;
- easier to find as the pointer or keyboard focus approaches;
- physically continuous when state changes;
- unmistakable when selected, busy, disabled, or in error;
- modern without weakening the System 6 object metaphor.

Modernity comes from precise feedback and continuity, not more blur, larger
radii, floating cards, or decorative animation.

## Adapted Principles

### Motion communicates

Every transition must identify a state change, spatial relationship, or
ownership boundary. A selection indicator may travel between adjacent options;
a popover may appear to lift from its trigger; a switch thumb may reverse from
its current position. If removing the motion loses no information, omit it.

### Hover is a preview

Hover should confirm the control the user is about to reach before activation.
Use a restrained change in tint, rim, weight, or local fill. The preview must
never resemble a completed save, selection, network, or destructive action.

Proximity response is optional and only appropriate inside a compact,
clearly-related group such as tabs, a menu, or a segmented control. It must not
make unrelated controls react across a window, and keyboard focus must receive
an equally clear state.

### State changes remain continuous

Interruptible interactions should reverse cleanly from their current visual
state. Do not queue a long exit behind an unfinished entrance. Exits should be
slightly faster than entrances so dismissed UI does not feel sticky.

Use the project's native CSS and JS patterns. Do not add an animation library
just to reproduce spring physics. If a motion family recurs, give it named
tokens rather than scattering duration and easing literals.

### Elevation is relative to the substrate

A popover must read as above the surface that opened it, including inside a
dialog or another raised panel. Treat elevation as a local relationship, not a
fixed global color or an arbitrary `z-index`.

Use the existing material tokens and window-local `--z-local-*` vocabulary.
When recurring surface levels are needed, model named roles such as substrate,
raised control, popover, and modal; do not copy an eight-level ladder or add
global layers without a product need.

### Discoverability stays quiet, not hidden

Overflow should be discoverable before the user scrolls. A scrollbar may rest
narrow and low-contrast, then become clearer on hover or active scroll. Edge
fades may indicate remaining content when they do not obscure text or controls.
Keep styling opt-in and surface-scoped; never restore a global scrollbar rule.
Touch-primary devices should retain native scroll physics.

## Control Grammar

Every interactive control must define default, hover, keyboard focus, active,
selected or checked (when applicable), disabled, and loading or error states
when the operation can produce them.

| Control | Liquid Glass behavior | Avoid |
| --- | --- | --- |
| Primary button | Clear solid or high-contrast glass fill; concise label; pressed state compresses or deepens locally; loading preserves width and disables repeat activation. | Glow, gradient fill, large scale jumps, or implying success while still loading. |
| Secondary / tertiary button | Quieter substrate-relative fill or rim; hover increases local contrast without competing with the primary action. | Making every action a pill or giving all buttons equal visual weight. |
| Icon button | Stable hit target, recognizable system icon id, tooltip where meaning is not obvious, visible focus ring. | Unlabeled novelty icons or changing icon families between states. |
| Select / dropdown | Keep the System 6 select harness; the trigger shows its current value; the menu lifts one local surface above its substrate; hover previews one option and selected state remains distinct. | Native finite dropdowns, glass-within-glass blur stacks, or using hover as selection. |
| Tabs / segmented control | One continuous indicator travels between related options; labels do not reflow; focus and selection are distinct; content changes after selection is committed. | Independent floating pills, layout shifts, or motion between unrelated views. |
| Switch | Use only for an immediate binary setting; track and thumb both express state; reversal begins from the current position. | Using a switch for a deferred action or relying on color alone. |
| Checkbox / radio | Preserve the familiar control shape; increase rim/fill contrast on approach; checked state is discrete and stable. | Morphing into an unfamiliar symbol or animating the label layout. |
| Slider | Show value and unit when precision matters; thumb follows direct manipulation; discrete settings snap visibly and remain keyboard-operable. | Decorative tracks, hidden values, or delayed movement after pointer input. |
| List or menu row | A faint local hover preview may merge visually with adjacent selected geometry when that explains grouping; row actions remain subordinate until needed. | Whole-window proximity effects or ambiguous hover/selected similarity. |
| Dialog / popover | Opens from a named owner, uses the correct local/global layer, settles precisely, and exits faster than it enters. | Excessive bounce, nested blur, detached floating cards, or unclear dismissal. |
| Scrollbar | Always leaves a subtle affordance on clipped surfaces, gains contrast/width on hover, and stays inside its owning pane. | Global scrollbar selectors or a thumb visually stranded in content. |
| Progress / thinking state | Motion must correspond to a real live operation; pair it with specific status text when waiting is meaningful. | Perpetual decorative activity or claiming work progressed without evidence. |

## Material And Surface Rules

1. One object gets one primary glass surface. Prefer a tint/rim change for
   nested controls instead of stacking blur on blur.
2. Text and icons sit on a stable readable layer. Background imagery or desktop
   content must not lower legibility as a window moves.
3. Active, selected, and focused are different states:
   - **active** means pointer/keyboard press is currently held;
   - **selected** means the value or destination is committed;
   - **focused** means keyboard input will act here.
4. Shape follows object role. Radius tokens may soften Liquid Glass, but a
   button, field, menu row, tab, and window must not collapse into the same pill.
5. Shadows and highlights explain separation. Do not use them as ambient
   decoration.
6. Reduced-transparency behavior must keep the same hierarchy with a solid or
   more opaque fill.

## Motion Families

Use three semantic families when a feature needs recurring motion:

| Family | Typical use | Character |
| --- | --- | --- |
| Fast feedback | Hover, focus rim, checkbox/radio mark, tooltip, scrollbar emphasis | Immediate and quiet; no visible overshoot. |
| Control transition | Tabs indicator, switch thumb, dropdown, accordion, merged selection | Continuous and precise; interruptible where input can reverse. |
| Surface transition | Dialog, drawer, large question step | Calm entrance; minimal overshoot only when it reinforces material; faster exit. |

Keep ordinary product motion within the limits in `DESIGN.md`. Animate
`transform` and `opacity` by default, never layout geometry. Under
`prefers-reduced-motion`, remove travel and scale; retain only the smallest
opacity or state change needed for comprehension.

## Acceptance Checklist

Before implementing or approving a Liquid Glass control:

1. Name the existing System 6 object role and owning surface.
2. Identify the base rule, responsive rule, Liquid token/twin, inline layout,
   and local/global layer involved.
3. State what hover previews and what click or keyboard activation commits.
4. Verify focus is at least as legible as hover.
5. Verify active, selected, disabled, loading, and error cannot be confused.
6. Confirm entrance can be interrupted or reversed where the input can reverse.
7. Confirm exit is not slower than entrance.
8. Confirm the control still reads correctly with reduced motion and reduced
   transparency.
9. Capture the exact surface before editing, then capture it after editing in
   both Classic and Liquid Glass.
10. Run the CSS, visual, design, and relevant feature gates required by
    `DESIGN.md` and the `css-no-pingpong` workflow.

## Rejected Interpretations

Do not interpret “make Liquid Glass controls more modern” as permission to:

- replace System 6 controls with a generic web or mobile design system;
- turn all controls into rounded pills;
- add glass cards around content that already has an owning pane;
- add cursor-following motion across unrelated controls;
- use translucency where a solid readable surface is required;
- use animation to hide latency or imply completion;
- change Classic behavior, DOM, copy, or keyboard semantics;
- add new Liquid-specific selector twins when tokens can carry the material;
- tune CSS without before/after evidence in both themes.

The desired result is a familiar object that responds with more precision, not
a different product wearing glass.
