# Site Editorial Register

<!-- doc-claims: mixed | audited: 2026-11-02 -->

This contract governs AI System 6's reading surfaces: the official site, the
blog, and public documentation. It does not govern product UI, which follows
[DESIGN.md](DESIGN.md), or internal design and operations notes. README and
CHANGELOG keep only basic typographic hygiene.

The register describes the target. Existing pages move toward it when they are
touched; this contract is not a licence to restyle the whole site in one sweep.

## Register

The site is a reading surface, not a desktop metaphor and not a generic SaaS
landing page. A reader should be able to finish an article, understand a
release, or follow a document without learning a second interface.

- One argument per page. The title states it; the first paragraph supports it.
- Reading beats chrome. No System 6 window frames around body copy.
- Product screenshots are framed captures, labelled as captures. A mockup is
  labelled `Mockup`; a generated image is labelled `Illustration`.
- Flat surfaces, one accent and generous whitespace. No gradient hero, no
  three equal feature cards, no dashboard card grid, no nested cards, no
  decorative glass.
- Light and dark are both first-class. No page depends on a colored ground to
  be legible.

## Typography

| Role | Size | Weight | Line height |
| --- | --- | --- | --- |
| Page title | 32–40px | 500 | 1.2 |
| Section title | 22–26px | 500 | 1.3 |
| Subsection | 18–20px | 500 | 1.4 |
| Body | 16–18px | 400 | 1.7–1.8 |
| Secondary | 14–15px | 400 | 1.6 |
| Caption / metadata | 12–13px | 400 | 1.5 |

Body copy uses an owned editorial serif; navigation, buttons, labels, code and
tables use the sans stack. Use a text serif with a real italic and a calm
rhythm, not a display face. If the project does not own a text serif, use the
system serif stack rather than fetching a font. The product keeps its System 6
fonts; the site is a different reading surface, not a reskin of the app.

- Sentence case. No ALL CAPS, no Title Case, no mid-sentence bold.
- A system sans for interface and an owned serif for body; a system mono for
  code and identifiers. No network font that the page cannot survive without.
- Chinese and Latin text both need a readable fallback; check line breaks at
  360px and at the article's maximum width.
- Measure: 60–72 characters per line for body copy. Long-form pages use a
  single column, not a two-column magazine grid.
- Links are visibly links without relying on color alone: underline, weight or
  an icon with an accessible name.

## Period cues

Body copy stays modern and readable. Historical fidelity lives in the
peripheral editorial furniture:

- Headings, kickers and folios may use a period-appropriate face and spacing;
  the body remains one modern text serif.
- Rules, captions, figure labels and small ornaments may use the era's line
  work, including 1-bit rules.
- The accent stays within the paper/ink/oxide family; a period page may shift
  its temperature, not replace the palette.
- Illustrations and diagrams may borrow the era's line language, but remain
  labelled illustrations, not fake screenshots.
- Code, tables, controls and body text stay modern and accessible.

A page about 1984 does not become a 1984 application window. The era is a
reading cue, not a costume.

## Layout

- Article column: 680–760px maximum, fluid below. The page may be wider than the
  text; the text is not stretched to fill it.
- Article header: kicker, title, dek, date, author or reading time. Not a hero
  with a full-bleed gradient.
- Long pieces get a table of contents that reflects the actual heading order.
- Figures sit in the reading column or in a wider plate with a caption and
  source. Do not float a figure into a second sidebar.
- Code blocks scroll horizontally; the page never scrolls sideways.
- Tables become stacked rows at phone width, not a clipped grid.
- Footnotes and references are visible at the end; a superscript is not the
  only path to the source.
- Pagination or previous/next links use article titles, not "Previous" alone.

## Color and material

The site palette is paper white, ink black and one oxidized red-brown accent —
a low-chroma brick/oxide, not a bright red. Use it for links, the current
section and one emphasis; never fill a large surface with it. Keep the accent in
one token; do not scatter a second red through components. The product keeps its
own System 6 blue and material tokens.

- One neutral ramp plus one accent. Semantic colors appear only when they mark a
  real state: error, warning, success, or a data category.
- Body text at 4.5:1 or better; large text and meaningful graphics at 3:1.
- No gradient text, decorative glass cards, drop shadows, noise or glow.
- A functional focus ring is an outline, not a shadow.
- Code, tables and callouts use a hairline border and a quiet surface change,
  not a second palette.

## Components

- **Article header**: kicker, title, dek, metadata.
- **Table of contents**: actual headings; current section marked in text, not
  color alone.
- **Callout**: one of note, warning or result; one short paragraph.
- **Figure**: image or SVG, caption, source; no explanatory paragraph inside the
  image.
- **Code block**: language label, copy action with an accessible name, no
  horizontal page overflow.
- **Table**: header row, tabular numerals, caption for units and source.
- **Reference list**: numbered or linked; the source is reachable without
  JavaScript.
- **Previous/next**: article titles and direction.

## Charts, diagrams and illustrations

- Follow the `visual-creation` skill for diagrams, charts, neutral mockups and
  art.
- Public docs use static SVG or a rendered PNG; interactive HTML only where the
  host actually renders it. GitHub Markdown does not execute HTML.
- State source, date range, sample size and units. Do not invent a trend or a
  product state.
- A product screenshot must be a real capture from the named build. A redraw or
  generated image is labelled and never presented as observed UI.
- A chart in a release note follows the chart module's data rules; a decorative
  sparkline is not evidence.

## Motion

- Motion may reveal a change the reader caused, or a short transition into a
  section. 150–200ms with ease-out is enough; only state changes.
- No page-load choreography, parallax, autoplay carousel or ambient loop in a
  reading page.
- Respect `prefers-reduced-motion: reduce`; remove nonessential transitions.

## Accessibility

- One `h1`; headings descend in order; landmarks and a skip link where the page
  has navigation.
- Every image has a text alternative; a decorative image gets an empty alt and
  no caption that pretends it is evidence.
- Keyboard order matches reading order; focus is visible.
- No meaning is carried by color alone.
- `lang` is set on the page and on inline language changes.
- A code block or table has a caption or accessible name when its purpose is
  not obvious.

## Content

- Direct, object-specific writing. No "elevate", "seamless", "next-generation",
  "unleash", "game-changer" or vague "AI-powered" claims.
- Sentence case; Chinese uses 「」 and full-width punctuation; English uses
  straight quotes.
- Every factual claim has a source or an observed artifact. A release note names
  the version and the user-facing change.
- Both languages ship for a changed canonical page. An unreviewed machine
  translation is a draft, not a published page.
- Dates, versions and product names match the repository's naming rules.

## Forbidden defaults

- Centered marketing hero with a gradient background.
- Three equal feature cards.
- Dashboard card grid on a reading page.
- Nested cards.
- Decorative glass or blur behind text.
- Gradient text.
- Autoplaying carousel or typewriter effect.
- A product mockup presented as a screenshot.
- A chart without source, units or sample size.

## Verification

- `npm run site:check` for the site build and public-surface rules.
- `npm run verify:docs` for canonical documents and their Chinese mirrors.
- Render the changed page at 360px, 768px and 1280px, in light and dark. Check
  horizontal overflow, measure, contrast, focus and link targets.
- Run the visual-creation checker on any self-contained HTML visual:
  `node ~/.agents/skills/visual-creation/scripts/check-artifact.mjs <file>`.
- Report what was checked and what remains unverified.

<!-- claim-check: npm run site:check | npm run verify:docs | docs/design/DESIGN.md | .claude/skills/visual-creation/SKILL.md -->
