# The video toolkit: a manual for chapter authors

The picture is one long screen recording of **AI System 6**, a writing desk that wears twelve Macintosh-lineage
appearances, from 1988 System 6 (1-bit) to 2026 Liquid Glass. Everything is drawn on a 640x360 canvas, frame by
frame, as a pure function of song time, and upscaled 3x nearest-neighbour. This file is the reference for writing
`src/ch01.js` ... `src/ch12.js`. Read `BRIEF.md` first; it is the contract.

Load order (`index.html`): `data/data.js` (the song: never edit), `core.js`, `eras.js`, `ui.js`, `clio.js`, `apps.js`,
the chapters, `specimen.js`, `main.js`. A chapter that does not exist yet is skipped. If `data/data.js` is missing, the
kit runs on defaults (DUR 150, BPM 120, empty LYRICS, beats from BPM) and `lyric()` returns placeholder lines.

## 1. The rules

1. **Pure function of time.** A frame depends only on `t`. No state kept between frames, no `Math.random()`, no
   `Date`, no `performance.now()` in drawing. Randomness comes from `hash(n)`, `hash2(x, y)`, `pick(seed, arr)`, `noise1(x)`.
   (`performance.now()` appears in main.js only in `renderCheck`, which times frames, and in the preview player's wall
   clock; neither is in the drawing path.)
2. **Hard pixels.** Integer coordinates (the helpers round for you). Draw with the kit or with `ctx.fillRect` /
   `ctx.drawImage` at integers (wrap computed coordinates and sizes in `R()`). **Never** `ctx.arc`, `ctx.stroke`,
   `ctx.fillText`, `createLinearGradient`, `createRadialGradient`, `shadowBlur`, `filter`, `imageSmoothingEnabled = true`
   or `globalAlpha < 1`. Greys in 1-bit, gradients and translucency are ordered dither (`bayer`, `veil`, `frost`,
   `vgrad`); **shadows are solid** steps of the desk's tone (`winShadow`, `shade(k)`), never a sparse dither, which reads
   as dots along every edge. Text is always `text()`. Sanctioned exceptions, all in core.js: `fillText` is used only
   inside `_raster`, which draws a glyph run offscreen and thresholds it to hard pixels; `FX.zoom` and `FX.tilt`
   resample the finished frame nearest-neighbour (still hard pixels, but a fractional zoom or a rotation gives uneven
   pixel widths; `FX.zoomAt` is rounded). Nothing in the kit turns image smoothing on: icons are drawn at their native
   size and `eraThumb` shrinks with a hand-written 4x4 box average before it Bayer-quantises.
3. **The lyric is on screen, verbatim, readable, in sync,** inside the scene's own UI (a field it is typed into, a
   dialog's message, a window title, a menu item). Take every time from `data/data.js` through `lyric()` / `wordAt()`:
   never type a time by hand. Keep it clear of the menu bar (`y > E.menuH + 4`) and, in dock eras, of the dock
   (`y < 312`). Nothing may cover it while it is sung. On a busy desktop give it a plate: `kara(L, x, y, {plate: true})`.
4. **Something happens on every sung word,** and big hits land on beats (`pulse`, `kick`, `hitPulse`).
5. **Deadpan.** The operating system reports enormous things in the voice it uses for a full disk. Product claims
   only from BRIEF §2. No Apple logo, no Happy Mac, no apple in the menu bar (the kit draws our floppy mark).
6. **Budget.** Average draw under 6 ms per frame (`renderCheck` reports it). Cache anything expensive and static with
   `memo()`; text, icons, sprites, patterns, desktops and Clio are cached for you.

## 2. Registering scenes

```js
scene(name, t0, t1, fn, opts)        // fn(t, local, dur): local = t - t0, dur = t1 - t0
```
Where scenes overlap, the one that starts later wins. `opts`:

| opt | meaning |
|---|---|
| `era` | `'system6'` … `'liquidglass'`, or keyframes `[[t, 'system6'], [t2, 'system7', 'wipe'], …]` (song seconds; with `eraLocal: true`, seconds from `t0`), or `t => id`. **Omitted: the scene follows the song's own schedule** (`data.js` `ERAS`, see `songEra(t)`), and its "(inverted)" entries set `FX.invert` (unset it in the scene to opt out). |
| `morph` / `morphStyle` | seconds a keyframe change takes (0.5; 0.35 on the schedule) and how: `'dissolve'` (HyperCard random), `'bayer'`, `'wipe'`, `'blinds'`, `'iris'`, `'checker'`. During a morph `fn` is called twice per frame, once per era, so it must be pure. |
| `desk` | a `DESKTOPS` name (`'linen'`, `'system7'`, …) or a `'#rrggbb'` colour; `deskFn` paints your own |
| `raw` | no desktop, menu bar or dock (boot screens, full-frame gags) |
| `menu` | default `UI.menu` for the scene; `menubar: false` hides it; `dock: false` hides the dock |

Era ids, in song order: `system6` 1988 · `system7` 1991 · `nextstep` 1995 (branch) · `drawingboard` 1998 (branch) ·
`platinum` 1999 · `aqua` 2002 · `tiger` 2005 · `snowleopard` 2009 · `lion` 2011 · `yosemite` 2014 · `bigsur` 2020 ·
`liquidglass` 2026.

Inside `fn` you may set, every frame (main resets them):
- `UI.menu = {app, menus, open, clock, right, prop, propW, appIcon}`: the menu bar. `open` highlights a title: **pass
  its label** (`open: 'Writing'`). **Gotcha:** a numeric `open` is era-dependent, because from Aqua on index 0 is the
  bold app name: 'Writing' is 2 in System 6 to Platinum and 3 from Aqua to Liquid Glass. If you need the number, use
  `menuIndex('Writing')`; to hang a pull-down under the title use `menuAt('Writing')` (its `{x, w}`; null in NeXT,
  whose menus are a column). The `UI.menu.prop(x, y, w, h)` callback option draws the running prop in the right-hand
  slot (`propW` px wide; in NeXT, inside the third dock tile). `clock: false` / a string. `UI.menubar = false` hides the bar.
- `UI.dock = {items, hover, bounce: {i, t0}, open: [i…], hide: 0..1}` or `false`.
- `CUR = {x, y, kind, down}` (or use `cursor(t, keys)`): the writer's pointer, drawn above everything but the FX.
- `FX.*`: see §9. `overlay(fn)`: draw `fn` after the menu bar and dock (above everything).

Order per frame: desktop → `fn` → dock → menu bar → overlays → pointer → FX.

```js
// a complete scene
const L = lyric('chorus1b');                                    // "I'll never hold the pen."
scene('never hold', L.start - .5, L.end + .3, (t, l) => {
  UI.menu = { app: 'TeachText', open: t > wordAt(L, 'hold').start ? 3 : undefined };
  const doc = APP.teachText(20, 40, 330, 220, { title: 'Manuscript', k: prog(l, 0, .3), from: [600, 60] });
  if (!doc) return;                                              // still zooming open
  kara(L, doc.x + 12, doc.y + doc.h - 34, { mode: 'type', maxW: doc.w - 24 });
  const pen = wordAt(L, 'pen');
  clio(380, 150, { scale: 4, mouth: 'sing', pose: 'reach', reach: [doc.x + 200, doc.y + 120], holding: 'pencil', expr: t > pen.start ? 'surprised' : 'sing' });
  if (t > pen.start) FX.shake = 4 * Math.exp(-9 * (t - pen.start));
  cursor(t, [[L.start, 500, 300], [pen.start, doc.x + 200, doc.y + 120, 'click']]);
});
```

## 3. Time: beats, hits, sections, lyrics (core.js)

Song globals from `data.js`: `LYRICS`, `SECTIONS`, `BEATS`, `BARS`, `HITS`, `ERAS` (the era schedule), `BPM`, `DUR`,
`TITLE`. `T` is the time of the frame being drawn; helpers default their `t` to it. `SPB` = seconds per beat.

| function | returns |
|---|---|
| `beatAt(t)` / `barAt(t)` | fractional beat / bar index (follows `BEATS`/`BARS` exactly) |
| `bsearch(sortedArr, t)` | index of the last element <= t (-1 if none) |
| `beatTime(n)` / `barTime(n)` | seconds of (fractional) beat / bar n |
| `beatPhase(t, div=1)` / `barPhase(t)` | 0..1 within the beat (or `div` beats) / bar |
| `pulse(t, div=1, sharp=5)` | 1 on every beat, decaying: `rect(x, y - R(4 * pulse(t)), …)` |
| `kick(t, sharp=9)` | 1 on every bar downbeat, decaying |
| `onBeat(t, n=1)` / `beatsIn(t, t0)` | integer beat counter / beats since t0 |
| `hit(name, nth=0)` / `hits(name)` | seconds of a named accent from `HITS`; `'whoHoldsThePen'` matches `whoHoldsThePen1`, `…2`; `hits()` = all |
| `hitPulse(t, name, sharp=8)` | 1 at the last such hit, decaying (0 before the first) |
| `since(list, t)` | seconds since the last time in a sorted list |
| `sectionAt(t)` / `section(name, nth)` | `{name, label, start, end}` |
| `lyric(idOrText, nth=0)` | a line `{id, text, voice, section, start, end, words: [{w, start, end, silent?, syl?}]}`; by id (`'chorus1b'`) or by the start of its text; throws if missing (placeholders while there is no song) |
| `wordAt(line, 'pen' \| index, nth)` | a word; negative index counts from the end |
| `lineAt(t, voice)` / `lastLine(t, voice)` / `nextLine(t, voice)` | the line being sung / last started / next |
| `wordNow(t, line)` · `wordProgress(w, t)` (= `wordP`) · `lineProgress(ln, t)` · `wordsSung(ln, t)` · `wordPulse(ln, t)` · `sungText(ln, t)` | per-word sync |

Voices: `lead`, `chant`, `choir` (roles `echo`, `lala`, `harmony`, `call`), `spoken`. A word with `silent: true` is
shown but not sung (the writer types it): `singing()` keeps Clio's mouth shut on it.

Maths: `clamp`, `lerp`, `prog(t, a, b)` (0..1), `ease` (smoothstep), `easeIn`, `easeOut`, `easeInOut`, `backOut`,
`elasticOut`, `bounceOut`, `stepped(k, n)` (choppy period motion), `keys(t, [[t, v], …], easeFn)` (numbers or arrays),
`track(t, [[t, x, y], …])`, `hash`, `hash2`, `pick`, `noise1`, `R` (round), `fl` (floor).

## 4. Colour, dither, primitives (core.js)

`P` is the current era's palette (roles): `desk deskText text textDim win face frame hi lite shadow dark title
titleText titleOff titleTextOff sel selText listSel listSelText menu menuText menuSel menuSelText field fieldEdge
accent accentText track thumb tip rule red yellow green card ink paper`. `C` has fixed colours (`C.black`, `C.white`,
`C.g1`…`C.ge` greys, …). `E.depth` is 1, 2, 4, 8 or 24: in 1-bit eras draw only black and white and dither the rest.
`mix(a, b, k)`, `lighten(c, k)`, `darken(c, k)`, `rgb(c)`, `hex(r, g, b)`, `luma(c)`.

| function | |
|---|---|
| `rect(x, y, w, h, c)` · `frame(x, y, w, h, c, t=1)` · `hline` · `vline` | |
| `line(x0, y0, x1, y1, c, w=1)` (Bresenham) · `dline(…, c, on, off)` (dotted) · `path(pts, c, w)` | |
| `oval(x, y, w, h, c)` · `ovalFrame` · `disc(cx, cy, r, c)` · `ring(cx, cy, r, c, t)` · `ell(cx, cy, rx, ry, c)` | span-built, no AA |
| `rrect(x, y, w, h, r, c)` · `rframe(x, y, w, h, r, c, t)` | rounded rects with pixel corners |
| `poly(pts, c)` · `tri(…)` · `arrowTri(x, y, size, 'up'\|'down'\|'left'\|'right', c)` | `c` may be a pattern |
| `bayer(x, y, w, h, level, c1, c2=null)` | ordered 4x4 dither, `level` = share of c1; `c2` null leaves pixels |
| `dither(x, y, w, h, c1, c2)` · `veil(x, y, w, h, c, k)` · `frost(x, y, w, h, c, k)` | 50% checker · pseudo-transparent tint (Bayer) · frosted tint (irregular) |
| `patfill(x, y, w, h, 'gray'\|'ltgray'\|'dkgray'\|'dots'\|'grid'\|'hstripe'\|'diag'\|'weave'\|…, ink, paper)` | classic 8x8 patterns, or an array of 8 bytes |
| `vgrad(x, y, w, h, stops, steps=4)` · `hgrad(…)` · `rrectGrad(x, y, w, h, r, stops)` · `ovalGrad` · `rrectVeil(x, y, w, h, r, c, k)` | stepped dithered gradients (stops: colours, or `[[pos, colour]…]`) |
| `bayerPat(level, c1, c2)` · `noisePat(level, c1, c2)` · `gradPat(len, stops)` | the fill styles behind the above |
| `clipRect(x, y, w, h, fn)` | integer clip |
| `shade(k)` (eras.js) | a solid darker tint of the current desk (k 0..1): the colour for shadows and shadow lines |
| `winShadow(x, y, w, h, r, size, k)` (eras.js) | a drop shadow in 2 (size < 4) or 3 solid steps of `shade()`: 1px right, 2px below, then lighter rings |
| `ditherField(fn, step)` (eras.js) | fills the whole target with `fn(x, y) -> [r, g, b]`, Bayer-quantised to `step` levels (how the wallpapers are painted; use inside `memo`) |
| `pinstripe(x, y, w, h, a, b)` · `capsule(x, y, w, h, stops, edge, {shine, steps})` · `nxBevel(x, y, w, h, face, pressed)` · `bevel(x, y, w, h, face, hi, sh, outer)` (eras.js) | Aqua pinstripes · a gel pill · NeXT's raised bevel · a generic raised/sunken box |
| `metalTexture()` / `metalFill(x, y, w, spans)` (eras.js) | Tiger's brushed metal (a cached 640x360 canvas) and a fill of it inside a span shape |
| `flatDock(x, y, w, h, r, fill, rim, base)` (eras.js) | the dock plate: flat and mostly opaque with a 1px highlight |

Span shapes (the rows behind `oval`, `rrect` and friends) are internal: `ovalSpans`, `rrSpans`, `topSpans`, `spanFill`,
`spanFrame`, `spanGrad`, `spanPat` are not for chapters, and neither are `sline`, `clioArms`, `clioLook` (clio.js) or any
`_name`. Use the shape helpers above.

## 5. Text (core.js)

`text(str, x, y, {font, color, scale, align, outline, shadow, bold}) -> width`. **`y` is the top of the capitals.**
`font` is a key of `FONTS` or an **era role**: `ui`, `title`, `menu`, `button`, `small`, `body`, `doc`, `label`,
`mono`, `big`, `lyric`, `appName`. Roles map to Chicago / Geneva / Monaco in the classic eras, a Charcoal-like face in
Platinum and Drawing Board, Helvetica in NeXTSTEP and Yosemite, Lucida in Aqua to Lion, SF (Inter) in Big Sur and
Liquid Glass, and `serif` for manuscripts from Platinum on. Every string is thresholded to hard pixels and cached.
`scale` is an integer pixel-doubling (1-4). `outline: colour` rings the glyphs; `shadow: colour` or `[colour, dx, dy]`.

`tw(str, font, scale)` width · `capH(font, scale)` · `lineH(font, scale)` · `wrap(str, maxW, font, scale) -> rows` ·
`fitText(str, maxW, font, scale) -> str` (shortened with '…' until it fits: **measure before you draw** any string that
sits in a column, since the later eras' faces are wider) · `para(str, x, y, w, {font, lh, align, maxRows}) -> height` ·
`typed(str, t0, t1, t)` (what a person has typed by t, a little uneven) · `caretOn(t)` · `defFont(key, css, thr)` (`thr`
is the alpha threshold: 70-90 for faces with hairlines such as serifs, so a T keeps its crossbar) · `fontKey(font)` (the
`FONTS` key a role resolves to in the current era) · `initFonts()` (main calls it once the faces have loaded). The pixel
faces (Chicago, Geneva, Monaco) have no accented letters: `text()` folds 'Naïm' to 'Naim' for them.

`lyricPlate(x, y, w, h, fill)` draws the era-styled card that `kara(…, {plate: true})` puts behind a line.

**`kara(line, x, y, opts) -> {w, h, rows, words: [{x, y, w, h, word}]}`**: the lyric, synced word by word, in the
era's own type and highlight. `mode`: `'select'` (default: the era's text selection sweeps across sung words),
`'type'` (letters appear as sung, with a caret), `'color'` (unsung words dim), `'pop'` (each word bounces in),
`'plain'`. Options: `font` (`'lyric'`), `scale` (2 for the 16px pixel faces, else 1), `color`, `dim`, `hi`, `hiText`,
`maxW` (wrap), `align`, `lh`, `t`, `caret`, `outline`, `shadow`, `plate` (`true` or a colour: an era-styled card behind
the line so it reads on any desktop). The returned word rects let Clio or the pointer aim at a word.

## 6. Appearances (eras.js)

`APPEARANCES` = the twelve, in song order (named so because `data.js` already defines `ERAS`, the schedule);
`ERA[id]` → `{id, year, name, branch, depth, icons, chrome, menuH, dock, corners, fonts, pal, index}`.
`setEra(id)` (main does it), `withEra(id, fn)` (draw something in another era, then restore), `E` (current),
`eraIndex(id)`, `eraNext(id, d)`. The song's schedule: `ERA_SCHEDULE` (`[{id, start, name, note, inverted}]`),
`songEra(t)`, `songEraEntry(t)`, `songEraKeys()`. `eraNow(t)` (main.js) = the era actually drawn at t.

`desktop(opts)` paints the era's wallpaper (cached; `deskCanvas(name)` returns the canvas): System 6 the product's
light 25% dot screen (`desk: 'system6gray'` for the classic 50% grey), System 7 blue-grey, NeXTSTEP dark grey,
Drawing Board drafting paper, Platinum's blue waves, Aqua's blue swoosh, Tiger's aurora streak, Snow Leopard's purple
nebula, Lion's galaxy (or `desk: 'linen'`), Yosemite's dusk ridge, Big Sur's bands, Liquid Glass's pale grid.
`LOOK[E.chrome]` holds each family's painters (`win`, `button`, `vscroll`, `hscroll`, `grow`, `field`, `check`,
`radio`, `progress`, `menubar`, `menuBox`, `menuSel`, `dialog`, `dock`): call the widgets below rather than these.
`lamp(x, y, d, colour, style)` / `lamps(…)` draw traffic lights; `markGlyph(x, y)` our floppy mark (`markGlyphCanvas()`
in apps.js returns it as a canvas in the era's colours); `screenCorners()` the rounded corners of a compact Mac screen;
`winTitle(x, w, title, ty, left, colour)` a centred window title that slides right and clips when the window is narrow;
`eraIdFromName('1991 System 7')` the id for a schedule name.

## 7. Widgets (ui.js)

| function | returns / notes |
|---|---|
| `win(x, y, w, h, title, o)` | client rect `{x, y, w, h, frame, round}`, or **null while opening**. `o`: `k` (0..1: classic zoom rects from `from`, a rect or `[x, y]`), `active` (false; `'main'` in NeXT), `scroll` (`'v'`, `'h'`, `'vh'`), `sk`/`sfrac`, `hk`/`hfrac`, `grow`, `header` (`'text'` or `[left, centre, right]`: the product's info strip), `status` (same, at the bottom), `body` (client fill), `close`/`zoom`/`collapse: false`, `closeHot`, `dirty`, `hover` (lights show ×−+), `noShadow`, `toolbar` (px of unified bar), `pressed` (`'up'`/`'down'` arrow) |
| `zoomRects(from, to, k)` · `dragOutline(x, y, w, h)` · `trail(t, n, dt, fn)` | the expanding outline · dotted drag outline · stale copies of a dragged window |
| `vscroll(x, y, h, k, frac)` · `hscroll(x, y, w, k, frac)` · `growBox(x, y)` | |
| `button(x, y, w, h, label, {def, pressed, disabled, font})` | rect + `cx, cy`. Default = the ring (classic), return glyph (NeXT), pulsing blue gel (Aqua), blue (later). Height `btnH()` |
| `check(x, y, label, on, o)` · `radio(…)` · `popup(x, y, w, label, o)` · `slider(x, y, w, k)` · `tabs(x, y, w, labels, sel)` · `groupBox(x, y, w, h, label)` · `sep(x, y, w)` | |
| `textField(x, y, w, h, str, {caret, focus, placeholder, sel: [a, b], font})` | `{…, caretX}`; `caret: 'solid'` while typing, `true` to blink |
| `typedField(x, y, w, h, full, t0, t1, o)` | a field someone types `full` into between t0 and t1 |
| `progress(x, y, w, h, k, {indeterminate})` | black bar → grey bar → Platinum bevel → Aqua gel / barber pole → thin flat bar |
| `listRows(x, y, w, rows, {sel, rowH, font, stripes})` | rows: strings or `{text, icon, right, dim}` |
| `panel(x, y, w, h)` · `card(x, y, w, h)` | inset well / raised card of the era |
| `menuLayout(o) -> [{label, x, w}]` · `menuBar(o)` · `menuIndex(label)` · `menuAt(label)` | main draws the bar from `UI.menu` (NeXT: `nextMenu(o)`, the column top-left, and the dock column of `NX_TILE` = 40 px tiles with `NX_GAP` = 3 px down the right edge, x = W - 41); `menuAt` gives the title to hang a menu under |
| `pullMenu(x, y, items, sel, o)` | items: `'Label'`, `'Label\t⌘K'`, `'-'`, `'~Disabled'`, `'✓Checked'`; returns `{x, y, w, h, rows, rowH}`. Under a title: `const m = menuAt('Writing'); pullMenu(m.x, E.menuH - 1, …)` |
| `dialog(x, y, w, h, o)` · `alert(cx, cy, {icon, text \| lines, buttons, def, pressed, disabled, w, k, title})` | `alert` auto-sizes and returns `{x, y, w, h, btn: [rects], text: {x, y}, client}`; icons `'caution'`, `'stop'`, `'note'` (Clio) or any product icon name. NeXT panels always have a title (default 'Alert'). Keep dialogs clear of the desktop icon column (x > 560; NeXT x > 520) |
| `alertIcon(kind, x, y)` | |
| `deskIcon(x, y, name, label, {sel, open})` · `deskIcons([[icon, label], …], {x, y, gap, sel})` · `trashIcon(x, y, full)` | the Finder's inverted label in classic eras, blue pill later; a label never runs off the screen. `deskIcons` defaults to x = W - 52 (NeXT: W - 100, left of the dock column) |
| `infoStrip(x, y, w, h, [left, centre, right], 'top' \| 'bottom')` · `stripH()` | the product's thin info line (what `win`'s `header` / `status` draw) and its height |
| `icon(name, x, y, {size: 32 \| 16, scale, sel, open, set})` (core.js) | the product's own icons for the current era (`classic` 1-bit SVG with masks, then each era's PNGs) |
| `balloon(x, y, w, h, tx, ty)` · `say(x, y, str, tx, ty, {maxW, font, align})` · `tooltip(x, y, str)` | System 7 Balloon Help (and speech in every era) |
| `dock({items, hover, bounce: {i, t0}, open, hide})` | Aqua to Liquid Glass at the bottom; NeXT's tile column on the right |
| `beachball(step)` | the spinning wait cursor as a cached canvas (12 steps) |
| `pointer(x, y, kind, {down, scale})` | kinds `arrow`, `ibeam`, `hand`, `grab`, `pencil`, `cross`, `watch` (hand sweeps), `ball` (spinning wait), `busy` (the era's own wait cursor) |
| `mousePath(t, keys) -> {x, y, down}` · `cursor(t, keys, kind)` | keys `[[t, x, y, action?], …]`, action `'click'`, `'dbl'`, `'press'` (held until the next key: a drag). Moves ease, bow a little and overshoot before settling; a press squashes the arrow. `cursor` writes `CUR` |
| `clockText(t)` | the menu-bar clock |

Icon names: `startupDisk hardDisk folder document applications trash trashFull fileFloppy assistant` (ClioTalk)
`quickDraft writingStudio projectDisk projectDisc cloudModel cloudModelOff localModel questionSheet outline
sectionDrafts manuscript reviewDesk searcher reader timeMachine docMap scrapbook systemFolder controlPanel dictionary
teachText chatFile writingBell oneMoreTune doom micropolis openttd bonsaiCity lightroom multiFinderApp finderApp
soundscape clioStage clioChart clioPaint imagePromptStudio systemStatus importUtility helpFolder systemHelp chooser
alias documents writingDemo`. Missing ones fall back to the nearest era that has them.

## 8. Clio (clio.js)

The AI is **Clio**, a speech-balloon creature with two dot eyes and a mouth that sings the lyric. She dresses in the
era (1-bit outline, System 7 shading, NeXT bevel, pencil sketch, Aqua gel, brushed metal, Leopard gloss, Yosemite
flat, Big Sur blue, Liquid Glass). She is helpful and keeps reaching for the pencil; the writer keeps the pen.

`clio(x, y, o) -> {x, y, w, h, hand: [x, y], mouth: [x, y], eyes: [x, y]}` (x, y = top-left; box is
`CLIO_W x CLIO_H` = 32x28 at scale 1). Options: `scale` 1-8, `expr` (`happy`, `sing`, `wink`, `surprised`,
`deadpan`, `shrug`, `think`, `sad`), `mouth` (0..1, `{open, shape: 'A'|'E'|'O'|'M'}` or `'sing'` = from the
lyric), `voice` (with `'sing'`), `look` `[dx, dy]`, `pose` (`rest`, `wave`, `point`, `shrug`, `reach`, `hold`,
`none`), `point` (`'left'|'right'|'up'|'down'`), `reach` `[x, y]` (her near arm stretches there, rubber-hose),
`holding` (`pencil`, `floppy`, `note`, `record`, `page`, `mic`, `heart`, `star`; drawn on the arm grid, so at scale 8
the pencil is pencil-sized), `bob` (px of beat bounce), `flip`, `center`, `blink` (default on), `shadow`, `era` (dress
override), `plain` (no arms), `halo` (`true` or a colour: a 1px ring round her silhouette, for a small Clio on a busy
1-bit desk; keep her reach short when you use it). Expressions: `sad` has raised inner brows and a tear, `think` a side
glance, one raised brow and a thought dot, `deadpan` and `shrug` solid lids (all read in 1-bit). A small Clio perched
on a window sits 6 px above its rim, never across a frame line.

`singing(t, voice) -> {open, shape}`: opens on each word's start, closes at its end, wider on open vowels, vibrato on
held notes, re-articulates melismas, shut on silent words. Default voice = lead + chant + spoken; `'choir'`; `'*'`.
`clioSay(x, y, str, o)`: Clio with a balloon of text.

## 9. Apps (apps.js)

`APP.<name>(x, y, w, h, opts)` draws a whole window and returns its client rect plus anchors, or null while opening.
Common opts: `title`, `k`, `from`, `active`, `win: {…}` (passed to `win()`). Inside an app, `fillClient(c, colour)` fills
the client rect (rounded where the era rounds it), `modernEra()` is true from Aqua on, `headFont()` is the manuscript
heading face (serif bold from Aqua on, as the product's TeachText) and `uiHead()` the era's bold sans for headings that
belong to the interface (card titles, meters); `finderIcon(x, y, name, label, {sel, open, maxW})` is an icon on a
window's paper.

| app | opts → anchors |
|---|---|
| `teachText` | `lines` (paragraphs, `'# '`/`'## '` headings), `words`, `paras`, `status` ('Read-only, edit in Section Drafts'), `typing: {text, t0, t1}`, `hiRow`, `scrollPx`, `font` → `rows: [{text, x, y, w}]`, `lh` |
| `clioTalk` | `msgs: [{who: 'clio'\|'you', text, at, typing: secs}]`, `typing`, `input`, `actions: ['Clip', 'Insert', 'Discard']`, `pressed`, `sendPressed`, `hero` (the big "Hi. I'm Clio, the conversation app." shown before any message; `false` hides it) → `bubbles`, `actions`, `input`, `send`, `plus` |
| `scrapbook` | `card: {title, body, source}`, `n`, `of`, `kind` → `newScrap` |
| `reviewDesk` | `checks: [{label, state: 'ok'\|'flag'\|'pending', note}]`, `reveal`, `you` (Sounds like: YOU nn%), `note` → `rows`, `meter` |
| `searcher` | `query`/`typing`, `results: [{title, url, snippet}]`, `reveal`, `sel`, `pressed` → `field`, `search`, `buttons` |
| `questionSheet` | `items` (`'## Head'`, `'- bullet'`), `typing` → `rows` |
| `outline` | `items: [{text, level, open, done}]`, `sel` → `rows` |
| `sectionDrafts` | `sections`, `sel`, `text`, `typing` → `list`, `editor` |
| `notePad` | `text`, `typing`, `page` |
| `finder` | `title`, `items: [[icon, label]…]`, `sel`, `open`, `used`, `free`, `gap` → `icons` |
| `fileFloppy` | `items`, `ocr` (import progress), `current` |
| `projectCD` | `burn` (0..1; omitted = indeterminate), `doc` |
| `floppyMeter` | `count` (0..1), `bytes` (2,902,645), `budget` (2,949,120), `pass` |
| `oneMoreTune` | the record quiz, as the product draws it: `track` (0..9), `done`, `year` (big on the blue label), `catalog` ('A1'), `song`, `artist`, `sub` (the ad, e.g. 'Envelope'), `label` (era name, on the ad line with a blue dot), `links` (default 'Hear the whole song' / 'Watch the original'; `false` hides), `skip` (`false` hides 'Not that one'), `skipPressed`, `options`, `answer`, `wrong`, `spin`, `arm` (0 resting beside the record .. 1 playing), `labelColor`, `nextPressed`. Give it about 300 px of height → `record`, `options`, `next`, `skip`, `links` |
| `controlPanel` | `sel` (era index or id), `pressed: 'apply'` → `rows`, `apply` (shows a cached thumbnail of the chosen era) |
| `doom` | `walk`, `fire` (0..1), `imp` (0..1 or false), `health`, `ammo` |
| `micropolis` | `built` (0..1), `tool`, `cursor: [col, row]`, `seed`, `year` |
| `about` | `memory: [{name, kb, icon}]`, `used` (0..1) |
| `writingBell` | `seconds` |

`eraThumb(id)` returns a cached 160x90 picture of an era (for transitions, Control Panel, contact-sheet gags); main
builds all twelve at boot.

## 10. Whole-frame FX and buffers (core.js)

Set fields on `FX` while drawing; main applies them to the finished frame, pointer included, in this order:
`dissolve` · `glitch` · `wobble` · `tilt` / `zoom` / `shake` / `dx` / `dy` · `invert` · `flash` · `crt`.

| field | |
|---|---|
| `FX.shake = px` · `FX.dx`, `FX.dy` | jolt / slide the whole frame (`FX.bg` fills what is uncovered) |
| `FX.zoom = factor`, `FX.zoomAt = [x, y]` · `FX.tilt = radians` | nearest-neighbour, stays hard |
| `FX.glitch = 0..1` · `FX.wobble = px` | row tearing · sine rows |
| `FX.invert = true` or 0..1 (dithered) · `FX.flash = [colour, 0..1]` (dithered) | |
| `FX.crt = 0..1` | the power-off collapse to a line and a dot |
| `FX.dissolve = {from: canvas, k: 0..1, style}` | pixel transition from a captured frame (styles as `morphStyle`) |

`applyFX(t)` (main calls it) applies them; `crtOff(k)` is the power-off collapse it uses for `FX.crt`.
`snap(i)` copies the frame so far into buffer i (0-2 are yours; main uses 3-5). `offscreen(w, h, fn)` draws into a new
canvas; `memo(key, w, h, fn)` caches one. `transition(from, k, style)` composites a captured frame. Sprites:
`defSprite(name, art, pal)` (ASCII rows, `.` clear; default palette `SPAL`: `K W g G d l R O Y E B C P N T b`),
`spr(name | canvas, x, y, {scale, flip, flipY, tint})`, `tinted(canvas, colour)`, `recolor(canvas, {'#000000': c, '#ffffff': null})`.

## 11. Checking your work

Constants you may read: `MANUSCRIPT` (the default manuscript paragraphs), `MENUS` (the default menu titles),
`DOCK_DEFAULT` (the default dock items), `PATS` (the 8x8 patterns), `SPR` (sprites by name), `ICON_NAMES`, `BAYER4` /
`BAYER8`, `ONEBIT()` (true in 1-bit eras), `SONG_MISSING`, `QS` (the page's query string). main.js also exposes
`sceneAt(t)` and `eraFor(scene, t)`; `drawScene`, `resetCtx`, `W_` and the `*_FONTS` / `BASE_PAL` tables are internal.

Images: `loadImage(src) -> Promise`, `preloadImage(key, src)` (into `IMAGES[key]`, awaited before `READY`; call it at
the top level of a chapter), `preloadIcons()` (main), `iconCanvas(name, size, set)` (the processed icon canvas, with the
era fallbacks). The canvas element is `cv`; draw through `ctx`.

```bash
node render.mjs check 0 154                # every frame: exceptions, avgMs (keep < 6), maxMs, maxAt
node render.mjs sheet 36 60 1 build/ch03.png   # contact sheet, each tile stamped with time, scene and era: LOOK at it
node render.mjs still 39.5 build/still.png     # one frame at 1920x1080 with the CRT finish
```
Preview in a browser: open `index.html` (space play/pause, arrows ±1 s, shift ±5 s, `,` `.` one frame, `h` HUD,
`?t=39.5` start there, `?era=aqua` force an era, `?specimen` the toolkit reel). Without `build/song.wav` a silent clock
runs (the page attaches the song only in the preview, so a render never requests it). While chapters are missing,
render.mjs prints one `Failed to load resource: net::ERR_FILE_NOT_FOUND` per absent `src/chNN.js`: expected, and gone
once the chapters exist. Any other console error is real. The specimen reel (every era, app, widget, Clio pose, FX and
morph) tiles the song when no chapter exists; once
chapters exist it is parked at 1000 s, past the end of the video: `node render.mjs sheet 1000 1036 3 build/kit.png`.
