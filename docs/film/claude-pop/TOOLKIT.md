# The video toolkit: a manual for chapter authors

The picture is one long screen recording of **AI System 6**, a writing desk that wears twelve Macintosh-lineage
appearances, from 1988 System 6 (1-bit) to 2026 Liquid Glass. Everything is drawn on a 640x360 canvas, frame by
frame, as a pure function of song time, and upscaled 3x nearest-neighbour. This file is the reference for writing
`src/ch01.js` ... `src/ch12.js`. Read `BRIEF.md` first; it is the contract.

Load order (`index.html`): `data/data.js` (the song: never edit), `core.js`, `eras.js`, `ui.js`, `clio.js`, `apps.js`,
`style.js` (the style kit, §12), `stage3d.js` (the 3D stage, §13), the chapters, `specimen.js`, `main.js`, and last an ES module that
imports three.js (`node_modules/three`) as `window.THREE` (main waits for it before `READY`). A chapter that does not exist yet is skipped. If `data/data.js` is missing, the
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
   pixel widths; `FX.zoomAt` is rounded; style.js's `diveInto` / `pullBack` zoom fractionally the same way below 8x, so a dive moves from its first frame). Nothing in the kit turns image smoothing on: icons are drawn at their native
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
| `screen` | `true`: the whole scene (desktop, menu bar, dock, pointer) is drawn inside the historic screen of that moment, `screenSize(t)` (§12.6), with black bars round it; `W` x `H` are the screen's size while it draws. Or a rect `{x, y, w, h}`, or `t => rect` |
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

Song globals from `data.js`: `LYRICS`, `SECTIONS`, `BEATS`, `BARS`, `HITS`, `ERAS` (the era schedule), `EVENTS` (what
each instrument plays, §12.7), `BPM`, `DUR`, `TITLE`. `T` is the time of the frame being drawn; helpers default their `t`
to it. `SPB` = seconds per beat. `W` x `H` is the screen being drawn (640x360, or a smaller historic screen inside a
`screen` scene); `FW` x `FH` is always the whole frame.

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
| `FX.pixelSort = {rows, len, seed, dir, keep}` | brightness-sorted runs in hashed bands: the hard smear of a drop; `keep` rows ([[y0, y1]…], default `FX.typeRows`, which `bigType` fills) are left alone |
| `FX.stepZoom = n`, `FX.stepZoomAt = [x, y]` | an integer punch-in: every pixel an exact n x n block |
| `FX.rgbSplit = px` or `[dx, dy]` or `[dx, dy, [trail, lead]]` | red and blue channels pulled apart, the fringes snapped to pure colours; with two colours the fringes are those (the style kit's `splitPal`: white and black on a neon field) |
| `FX.posterize = levels` or `['#rrggbb', …]` | per-channel levels, or nearest colour of a palette |
| `FX.scan = {k, color \| from, band, interlace, dir, edge}` | scanline bands switch to a colour (or a captured frame), interlaced |

The full order: dissolve · glitch · wobble · pixelSort · tilt/zoom/shake/dx/dy · stepZoom · rgbSplit · posterize · invert ·
flash · scan · crt. The style kit (§12.5) sets these on the beat for you.

`applyFX(t)` (main calls it) applies them; `crtOff(k)` is the power-off collapse it uses for `FX.crt`.
`snap(i)` copies the frame so far into buffer i (0-2 are yours; main uses 3-5). `offscreen(w, h, fn)` draws into a new
canvas; `memo(key, w, h, fn)` caches one. `transition(from, k, style)` composites a captured frame. Sprites:
`defSprite(name, art, pal)` (ASCII rows, `.` clear; default palette `SPAL`: `K W g G d l R O Y E B C P N T b`),
`spr(name | canvas, x, y, {scale, flip, flipY, tint})`, `tinted(canvas, colour)`, `recolor(canvas, {'#000000': c, '#ffffff': null})`.

## 11. Checking your work

Constants you may read: `MANUSCRIPT` (the default manuscript paragraphs), `MENUS` (the default menu titles),
`DOCK_DEFAULT` (the default dock items), `PATS` (the 8x8 patterns), `SPR` (sprites by name), `ICON_NAMES`, `BAYER4` /
`BAYER8`, `ONEBIT()` (true in 1-bit eras), `SONG_MISSING`, `QS` (the page's query string). main.js also exposes
`sceneAt(t)` and `eraFor(scene, t)`; `drawScene`, `resetCtx`, `VIEW`, `withScreen`, `screenFor`, `W_` and the `*_FONTS` /
`BASE_PAL` tables are internal.

Images: `loadImage(src) -> Promise`, `preloadImage(key, src)` (into `IMAGES[key]`, awaited before `READY`; call it at
the top level of a chapter), `preloadIcons()` (main), `iconCanvas(name, size, set)` (the processed icon canvas, with the
era fallbacks). The canvas element is `cv`; draw through `ctx`.

```bash
node render.mjs check 0 154                # every frame: exceptions, avgMs (keep < 6), maxMs, maxAt
node render.mjs sheet 36 60 1 build/ch03.png   # contact sheet, each tile stamped with time, scene and era: LOOK at it
node render.mjs still 39.5 build/still.png     # one frame at 1920x1080 with the CRT finish
```
Preview in a browser: run `node tools/serve.mjs` and open `http://127.0.0.1:8640/promo/claude-pop/index.html` (a browser
will not import ES modules, so three.js, from `file://`; opened as a file the 2D film still plays and the HUD says the 3D stage is
off). Keys: space play/pause, arrows ±1 s, shift ±5 s, `,` `.` one frame, `h` HUD,
`?t=39.5` start there, `?era=aqua` force an era, `?specimen` the toolkit reel). Without `build/song.wav` a silent clock
runs (the page attaches the song only in the preview, so a render never requests it). While chapters are missing,
render.mjs prints one `Failed to load resource: net::ERR_FILE_NOT_FOUND` per absent `src/chNN.js`: expected, and gone
once the chapters exist. Any other console error is real. The specimen reel (every era, app, widget, Clio pose, FX and
morph) tiles the song when no chapter exists; once
chapters exist it is parked at 1100 s, past the end of the video: `node render.mjs sheet 1100 1136 3 build/kit.png`. The
**style reel** (§12.8) is always parked at 1000 s: `node render.mjs sheet 1000 1046.5 0.25 build/style-sheet.png`;
`?style` plays it from 0 in the preview.

## 12. Style kit (style.js): KINETIC PIXEL × SILHOUETTE

VISION.md's look, as tools. Two modes inside one take: **desk mode** (the era desk, dense and witty) for verses,
pre-choruses and the bridge, and **silhouette mode** for every chorus and post-chorus: the desk floods to one flat neon
field, everything goes pure black, Clio dances, the only white thing is the writer's pen on its cord, and the hook words
slam in as giant pixel type. Everything here keeps the rules: whole pixels, no smoothing, no alpha, a pure function of `t`.

**The silhouette rule, every frame:** one hero (a word OR a pose), one white pen, and nothing that does not serve them.
No menu bar over poster type; windows become slabs (`slabWindow`), not stencils full of 9 px text. No glyph of big type
may be more than 10% covered by anything drawn after it, split across two backgrounds (half on a black bar, half on the
field), or cropped at the top or bottom edge: `legibilityAudit(t0, t1)` (§12.4) checks it.

### 12.1 Fields and silhouette mode

`FIELDS` = `magenta #ff2e88` · `lime #b6ff00` · `cyan #00e5ff` (the three chorus fields) · `vermilion #ff5a36` (the
writer's, never Clio's) · `white` (the pen's) · `ink` (black). `FIELD_OF` maps the song's sections to them (chorus1
magenta, post1 lime, chorus2 lime, post2 magenta, chorus3 cyan, outro magenta: post-choruses flip to the complement).
`fieldAt(t)` is the field of the section at t (null in desk mode) and `silOn(t)` whether we are in silhouette mode;
`fieldCol(nameOrHex)`. The simplest silhouette frame is `rect(0, 0, W, H, fieldAt(t))` and black things on it.

**`slabWindow(x, y, w, h, o)`**: a window as a silhouette: a solid black slab with only its title-bar stripes and its
close and zoom boxes cut out in the field (`o.cut`, `o.ink`, `o.tb` title-bar px). Let one peek in from a corner at about
70% of its desk size; returns the client rect.

**`silhouette(field, fn, o)`** paints the field, runs `fn` into a buffer and lays everything it drew down as black (for
shapes you cannot draw black directly, and for the flood's first frames):

| opt | |
|---|---|
| `mode: 'stencil'` | light pixels become ink, dark pixels fall through to the field: a window keeps its frame lines, title stripes and text as neon cut-outs. Default `'solid'`: every pixel `fn` drew is ink (a shape). In choruses prefer `slabWindow`: a stencilled window's tiny text is clutter next to giant type |
| `key: 'name'` | the drawing is **static**: the result is cached and later frames cost one `drawImage`. Always key a stencil of the desk (an uncached stencil is a per-pixel pass of ~10 ms). Keep animated things out of a keyed call |
| `thr`, `invert` | the stencil's luma threshold (.5) / the other way round |
| `bg: false` | no field fill: silhouette onto what is already there |
| `ink` | the silhouette colour (black) |
| `keep: fn` | drawn on top afterwards in true colours |

Inside `fn`, `pen()`, `penCord()` and `penTrail()` defer themselves on top automatically (they stay white), `silKeep(fn)`
defers anything, and `silCut(fn)` erases (`fn(colour)` draws with the colour it is handed) so the field shows through.
Draw `clioDance` and `bigType` *after* the silhouette call, not inside it: Clio carries her own field-coloured halo and
cut-outs.

```js
// a chorus frame (see specimen.js chorusFrame for the whole thing)
scene('chorus 1', 36, 52, (t) => {
  const fld = fieldAt(t);                                                    // magenta
  rect(0, 0, W, H, fld);                                                     // one flat field: no menu bar over a poster
  slabWindow(500, 8, 200, 130, { cut: fld });                                // the manuscript, a slab peeking in
  bigType(["I'LL NEVER", 'HOLD', 'THE PEN.'], { words: lyric('chorus1b'), justify: 438, fitH: 336, x: 8, align: 'left' });
  clioDance(560, H - 8, 5, t);                                               // supporting dancer, halo'd, beside the block
  const [px, py] = [466, -16];                                               // the writer's pointer (off the top)...
  penCord([[px + 5, py + 15], [px + 5, py + 27]]); pen(px + 5, py + 175, Math.PI / 2, 4);   // ...holds the white pen
  CUR = { x: px, y: py };
  beatFX(t);                                                                 // phrase inverts, palette split, drop sort
}, { era: 'system7', raw: true });
```

### 12.2 Into and out of silhouette mode

- **`inkFlood(t0, t1, cx, cy, drawB, o)`**: `drawB(t)` floods over the frame from the pen tip `(cx, cy)` as hard-edged pixel
  ink: a body with fingers, splatter that lands ahead of the front, a white wet lip and a black rim on the edge. Nothing is
  drawn before t0; from t1 `drawB` is drawn whole, so put **t1 on the downbeat**. `o.steps: n` moves it in n hard steps:
  the reel floods in **10 one-frame steps** (`t0 = t1 - 10 / FPS`), drags a white `penTrail` from the tip, and inverts
  the first two frames of the chorus (`invertFrame(t1, 2)`). Call it last, in `overlay()` to flood over the menu bar and
  dock as well. `o`: `block` (px of an ink pixel, 4), `seed` (the splash's shape), `edge` ([lip, rim] colours), `edgeW`,
  `ease`, `steps`, `drain: true` (the way out: `drawB` appears outside a blob that sucks back into the pen tip; the reel
  drains in 10 steps onto the downbeat, pixel-sorted while it drains, and punches in on the landing). The flood's shape is
  computed once per tip position (~15 ms) and cached; register the tip with `warmUp` (§12.8) so it is built at boot.
- **`scanWipe(t0, t1, drawB, o)`**: `drawB` replaces the frame in 4 px scanline bands, interlaced (even bands sweep down,
  then the odd ones), stepping on 16ths with a white write-head on the newest bands. `o`: `band`, `div` (4 = 16ths, 0 =
  continuous), `dir` ('up'), `edge` (null: no write-head). The post-chorus field flip and leaving silhouette mode.
- `scanFX(k, {color | from, edge})` does the same to the finished frame (FX.scan), e.g. a wipe to black.
- While a flood or a wipe is mid-way it sets `FX.wiping` (the legibility audit skips those frames: the type is being
  replaced on purpose).

### 12.3 The cast: clioDance, the white pen, its cord

**`clioDance(x, y, scale, t, o)`**: Clio as a big black dancer, drawn on her unit grid and pixel-scaled by the integer
`scale`; `(x, y)` is the ground point between her feet. She keeps her identity from desk mode: the **speech-balloon body
with its kinked tail** (down-left, as on the desk; side-on in the pirouette, sideways in the split), 3-4 unit limbs,
mitten hands and boots. About 32 units tall standing: **scale 7 is the hero (~220 px, let the frame edge crop her)**, 4-5
a supporting dancer. A **2 px halo** in the field colour (`rim`, `rimW`) keeps her readable where she crosses black type,
slabs or a black frame (on a black flip she reads as a neon outline). Squash on the beat and stretch after it (`squash`),
a 3 px ground line under her feet (`ground`). Poses are animated in 8 stop-motion steps per beat; 2-bar phrases from
`DANCE_PHRASES` (never the same pose twice in a row) are picked by the bar index, and the music overrides them: a star
jump on every crash and stab, `pointCam` on "you", `pointUp` on "pen", the split (`cheer`) on "do".

`DANCE_POSES`, each a different shape with the face blacked out: `bounce` (frog crouch) · `clap` (pencil: tall, hands
meeting overhead) · `pointUp` (Fever: diagonal arm to the sky, fist on hip) · `pointCam` (YOU: leaning in, a huge mitten
out of the frame) · `spin` (pirouette: side-on with the face kept, foot tucked, arms in a ring; turns each half beat) ·
`jump` (star jump) · `shimmy` (deep lean, arms in one line) · `disco` (hip throw, pointing down) · `kick` (high side
kick, arms in a T) · `vogue` (hand over the head, legs crossed) · `robot` (right-angle box) · `cheer` (full split, V arms).
`danceShapeTest()` returns the closest pair of face-off silhouettes and their pixel difference (currently clap/spin, .33;
anything above .25 reads as a different shape).

`o`: `pose` (force one) with `p` (hold its phase 0..1), `field`, `ink`, `rim` (false or a colour), `rimW` (2), `mouth`
('sing' | 0..1 | `{open, shape}`), `voice`, `eyes`, `face: false` (no cut-outs), `flip`, `steps` (8; 0 = smooth),
`squash` (true), `ground` (true | colour | false), `shadow` (a bar under a jump), `lyric: false` (no word-driven
poses), `seed`. Returns `{x, y, w, h, hands, head, feet, pose}`. `dancePose(t, o)` tells you the pose without drawing it.

**`pen(x, y, angle, scale, o)`**: the writer's fountain pen, nib tip at `(x, y)`, pointing along `angle` (0 = right,
PI/2 = down), 36.5 units long: **scale 4 (146 px) or 5 (182 px) in choruses**, 3 on a desk. Pure `#ffffff` with a 1 px
black outline and no hatching (only the nib slit), drawn at the frame's own pixel: the precise object against the chunky
dancer and type. On each kick in silhouette mode it **flashes** for one frame (a white bloom outside its outline). `o`:
`color`, `ink`, `outline` (colour or false), `flash` (default: in silhouette mode), `detail: true` (the old seams, cap
band and clip lines), `t`. Returns `{tip, back, angle}`.

**`penCord(points, o)`**: the long white cord from the pen's back end to the writer's pointer, **3 px white with a 1 px
black edge** (the white earbud cord). It hangs between the anchors (`sag`, px per 100 px of span, 22), swings with the
beat (`swing` px, 10) and is drawn as a staircase on a `w`-px grid (3). `o.outline` (false for none), `o.color`.
**`penTrail(points, o)`**: the same white staircase through straight segments: the stroke the pen tip drags.
The reel's rigs (specimen.js): `penRig` (the pointer holds the cord, the pen hangs nib-down and swings on the beat) and
`penBar` (the pen lying level across the top of a poster, the type below it).

**Finish.** render.mjs's ffmpeg finish (`vignette=PI/5` plus a 10% scanline grid) darkens a flat neon field's corners to
plum and olive (about 45% brightness in the corners) and greys the white pen away from the centre. The kit cannot undo a
multiply that happens after it, so it asks: `finishAt(t)` (`window.FINISH_AT`) returns `{vignette: false, scanlines: .05}`
in silhouette mode and `{vignette: true, scanlines: .1}` elsewhere. **Request to the render.mjs owner:** read
`FINISH_AT(t)` per frame and drop the vignette (and halve the grid) when it says so. Until then keep the pen and the hero
word near the middle of the frame.

### 12.4 bigType: giant pixel type

**`bigType(text, o)`**: Chicago rasterised at its native pixel size (caps 9 px), every font pixel an exact sx x sy block,
integers 4-24, so the type stays square and crisp at poster size. `text`: a string ('\n' stacks) or an array of lines.

| opt | |
|---|---|
| `x`, `y`, `align` ('center' \| 'left' \| 'right'), `valign` ('middle' \| 'top' \| 'bottom') | placement (default the centre) |
| `scale` (8) · `fit` (true = W, or px) · `justify` (true \| px) · `fitH` (true = H, or px) · `bleed` (px) · `min` / `max` (4 / 24) | `fit` gives each line the largest scale that fits the width; **`justify`** stretches every line sideways to exactly that width (a whole x factor, then whole letters one step wider, then whole-pixel spacing): the justified poster block; `fitH` steps the biggest lines down until the stack fits the height; `bleed` fits wider than the frame so the type crops off the **side** edges only (the stack is always fitted to the height: never crop the cap tops or bottoms; keep `bleed` under one font pixel's width, ~10 px, so no edge glyph loses a stroke) |
| `lead` (native px between lines, 2) · `track` · `stretch: [sx, sy]` | integer x / y factors |
| `color` (black) · `xor` (true \| a field) · `invert` + `slab` + `pad` + `slabMode` · `outline` + `outlineW` · `shadow: [colour, dx, dy]` | `xor`: the letters swap field and black wherever they fall (never run it across the menu bar: hide the bar instead); `invert`: slabs behind the lines (field letters on black, white on black). **Every slab is drawn before any letter**, and `pad` (native px, 2) is clamped to half the gap to the neighbouring line, so a slab can never eat another line. `slabMode`: `'line'` (a slab per line), `'block'` (one round the block), `'bleed'` (one full-width slab from x 0 to W over the block's rows: no stray field strips) |
| `pass: 'slab' \| 'type'` · **`bigTypes([[text, o], ...])`** | draw only the slabs / only the letters; `bigTypes` draws several blocks with all their slabs first (PEN and PAL on the echo) |
| `t` · `words` (a lyric line) · `ghost` | each word appears on its sung start, slamming in; the text's words are matched to the line's words by their letters ('PEN PAL' takes its times from "I'm just your pen pal,"); `ghost`: unsung words show as 50% dithered ghost type (device 3) |
| `slam` (a time) · `stepIn: {t0, div: 4, enter}` | the whole block lands with an integer overshoot +3 +2 +1 0 / one letter per 16th, entering by `'slam'`, `'drop'` or `'flash'`. Leave ~20 px above and below a slammed block so the overshoot stays in frame |

Returns `{x, y, w, h, lines: [{x, y, w, h, sx, sy}], letters: [{ch, x, y, w, h, on}], slabs}` (aim the pen or Clio at a
letter). Each line it draws on the frame is listed in `FX.typeRows`, which the drop's pixel sort leaves alone.

**`legibilityAudit(t0, t1, step = 1/FPS, o)`** draws each frame without its FX and checks every glyph of big type:
`covered` (share of its pixels changed after it landed), `split` (share not in its dominant colour) and `vcrop` (pixels
off the top or bottom edge). Fails at covered > .1, split > .1 (`o.maxCovered`, `o.maxSplit`) or any vcrop; frames mid
flood or wipe are skipped (`o.wipes: true` includes them). Returns `{frames, glyphs, worst, failures, bad: [{t, scene, ch,
at, covered, split, vcrop}]}`. Run it in the page (e.g. through puppeteer: `page.evaluate('legibilityAudit(1000, 1047)')`);
the style reel passes with 0 failures.

### 12.5 Hard beat FX

Each sets `FX` fields (§10) for the frames after a hit time `at` (omit `at`: this frame). Palette only, on the grid.

| function | |
|---|---|
| `invertFrame(at, frames = 1)` | the whole frame inverted |
| `splitPal(px = 2, at, frames = 3, [trail, lead])` | the hard 2 px split in the frame's own palette: white fringes trail the dark shapes, black ones lead them. The silhouette-mode split: no red and blue on a neon field |
| `rgbSplit(px = 2, at, frames = 3, dy = 0)` | red left, blue right; fringes snap to pure colours (desk mode) |
| `pixelSort(rows = 14, length = 200, at, frames = 2)` | the smear of a drop (rows of big type are skipped) |
| `punch(at, x, y, steps)` | an integer zoom punch-in at (x, y) stepping back out (default 3x 3x 2x 2x 2x 2x, one per frame; `[2, 2]` for a word you must still read) |
| `stepZoom(n, x, y)` · `posterize(levels \| palette)` · `scanFX(k, o)` | the raw effects |
| **`beatFX(t, o)`** | the presets, driven by EVENTS: **kick** -> a 1-frame invert on the **4 phrase downbeats of a chorus** (`isPhraseHit`: each section split into 4 phrases; `o.kickEvery: 'bar'` for every downbeat); **snare** -> a 2 px split for 3 frames (`splitPal` in silhouette mode, `rgbSplit` in desk mode or with `o.rgb`); **crash** -> a pixel-sort smear for 2 frames **on drops only** (`isDrop`: a crash on a section start or a `drop` hit; `o.anyCrash` for all), type rows exempt. `o`: `kick` / `snare` / `crash: false` to skip one, `anywhere` (kick inverts outside choruses too), `split` (px), `stab: true` (a punch-in on stabs at `o.punchAt`), `clap: true` (a 2 px shake). Returns the names that fired |

`isDownbeat(t)`, `isPhraseHit(t)`, `isDrop(t)`, `inChorus(t)` are the tests it uses. `finishAt(t)`: §12.3.

### 12.6 The one-take camera

- **`frameInto(canvas, t, src, o)`**: renders a whole frame (desktop, scene, dock, menu bar, overlays, pointer) into a
  canvas: `src` = a registered scene's name, a scene object, or `fn(t)` with scene opts in `o` (`era`, `desk`, `raw`,
  `menu`, `dock`, `screen`). A `screen` scene is drawn inside its historic screen with its bars, exactly as main draws it
  (so a dive out of a screen scene matches the frame before it). The frame's FX are dropped; UI, CUR, FX, the era, VIEW
  and W x H are restored afterwards.
- **`diveInto(t0, t1, px, py, drawOuter, drawInner, o)`**: the pixel dive. A nearest-neighbour zoom into pixel `(px, py)`
  of the outer frame at a **constant log rate** (scale = exp(k * u): it moves from the first frame; fractional below 8x,
  whole numbers above), the pixel sliding to the centre. The pixel is a square block in its own colour (the writer's
  vermilion full stop); the inner frame fades into it from 3 px (`innerAt`) to 48 px (`revealAt`) as a square window cut
  from the inner frame's centre, shrunk by a **box average and Bayer-quantised** (`levels`, 6 per channel, 2 in a 1-bit
  era), never a nearest-neighbour shrink. A crosshair of dithered vermilion rays with marching ticks and a pulsing 2 px
  marker (the inner frame's own full stop, `mark`) hold the eye on it. As the block reaches the frame's height the inner
  frame is 1:1 inside it; **on t1 (put it on a beat)** the sides open with a 1-frame invert and a 3-frame palette split
  (`hitFX: false` to skip) and the inner frame IS the frame. Before t0 it draws the outer frame, after t1 the inner one:
  use it in a `raw` scene spanning the dive. `o`: `pw` (2: a 2x2 full stop), `ease` (k -> u; `power` still works),
  `anchor: false`, `color`, `outer` / `inner` (frameInto opts). At most two frames are rendered per frame.
- **`pullBack(t0, t1, layers, o)`**: the outro, the dive in reverse. `layers[0]` is the frame we start in, `layers[i] =
  {draw, px, py, pw, era}` where `(px, py)` is the pixel of layer i that holds layer i - 1 (in the reel, the writer's
  vermilion full stop at the same place in every era, since the windows stay put). Each layer step snaps in (the sides
  close round a centre square, a 2-frame split) and zooms out at a constant log rate: give the steps whole beats. Last
  comes a single vermilion dot on black (`dot: false` to stop at the outermost; `dotAt`, `dotColor`, `dotWeight`: the dot
  step's share of a layer step, .6). Hold the dot half a second, no more. `ease` shapes the whole move.
- **The screen grows with history.** `screenSize(t)` -> `{x, y, w, h, stage, name, bits, full, punch}`: the centred screen
  of that moment, pixels never scaled: 1988 the compact Mac's **512x342** at 1:1 in black (1-bit); from the first System 7
  era (chorus 1) **576x352** ('640x400', 8-bit); from Platinum **608x356** ('640x480', 16-bit); each growth steps out on
  16ths over one beat. On the final key change (HITS `keyChange`, else `reboot`, else chorus3's start) the bars are
  **punched off** on the downbeat: 2 frames inverted with a 2x punch-in, then the bars (black, a white bezel line on
  their inner edge) slide off in **4 hard steps**, one every 2 frames, with speed lines and a shake; then the desk is
  the full 16:9 frame (24-bit) for good. **`depthChips(x, y, w, h, bits)`** draws the palette of a colour depth as a chip
  strip (2 chips, 32 of the 256, banded hues, a full spectrum): the palette visibly grows each step. Give a scene
  `screen: true` and main draws all of it inside the screen with `W` x `H` set to the screen's size, so a chapter written
  with `W`, `H` and the kit's defaults lays itself out in 512x342 unchanged. `SCREENS` and `screenKeys()` hold the
  schedule. In a `screen` scene, `FX.zoomAt` / `stepZoomAt` are in screen coordinates (main shifts them); `snap()` still
  copies the whole frame. For a full-frame scene, `overlay(() => letterbox(t))` crops it to the screen instead.

### 12.7 The desk is the band

Every percussive sound has a cause you can see, and every instrument reads `data.js` `EVENTS`, so a chapter can drop the
whole band in. core.js normalises EVENTS (every entry becomes `[t, ...rest]`, sorted; non-array entries are ignored) and,
when EVENTS or one of the core channels is missing, derives a stand-in groove from BEATS (`EV_FALLBACK` lists which):
kick every beat, snare and clap (choruses) on 2 and 4, hats on 8ths, crash and stab on section starts, a riser over the
bar before each chorus, two floppy bass lines.

| core.js | |
|---|---|
| `evList(name)` · `evTimes(name)` | entries / their times |
| `evLast(name, t)` · `evNext(name, t)` · `evIndex(name, t)` | the last entry at or before t, the next, its index |
| `evSince(name, t)` · `evFrames(name, t)` · `evPulse(name, t, sharp)` | seconds / whole frames (0 on the hit's first frame) since the last hit; a decaying 1 |
| `evIn(name, t0, t1)` · `evNote(name, t)` · `evSpan(name, t)` | entries in a range; the `[t, midi, dur]` note sounding at t; the `[t0, t1]` span (riser) covering t |

**`bandGrid(x, y, w, h, o)`** is the band as a drum machine: a pad per instrument in bold 3 px black frames with Chicago
tabs in their top-left corners (outside the art): **A:** and **B:** floppies (with the note) and **KICK** on the top
row, **SNARE · CLAP · CRASH · BELL** below; each pad **slams** (a 3-frame overshoot) and **inverts** on its own hit. The
hats type `o.typed` ('YOU KEEP THE PEN', one key per hat, retyped every 2 bars) in 4x Chicago across the middle, and the
riser is one chunky 12 px bar along the bottom. Instruments run at scale 2 from 600 px wide (scale 1 below). `o.field`:
silhouette mode (pads on the field, **solid black instruments with neon cut-outs**; an inverted pad is field on black).
`deskBand(x, y, o)` = `bandGrid` in a 400x210 rack at scale 1. The reel shows it full-frame, then wipes it to cyan.

The instruments on their own (1-bit by default; `o.ink` / `o.paper` recolour: `{ink: field, paper: black}` is the
silhouette look; `o.scale` pixel-doubles, `o.t` overrides the time). The time argument of a hit instrument is the hit;
omit it and the channel's last hit is used:

| | sound | what you see |
|---|---|---|
| `floppyDrive(x, y, label, note, t, o)` | bass (`floppyA`, `floppyB`) | a 3.5" drive with the cover off (100x84; `o.compact`: 100x72, no label line): the disk in it, the read head sliding along its lead screw to the pitch (a tick per semitone, `o.lo`..`o.hi` = midi 28-64), buzzing while the note sounds, the light on, the note name. `note`: a channel or a midi number -> `{midi, on, headX}` |
| `ejectDisk(x, y, t0, o)` | kick | a drive seen from above (76x58) spits the disk out, label end first, and swallows it over the beat; the drive dips a pixel |
| `windowCloseZoom(x, y, w, h, t0, o)` | snare | a 1-bit window with a solid patterned body zooms shut into its icon (a thick `o.thick` px outline and two thin trailing ones, in `o.lineColor`) and zooms open again; `o.title`, `o.icon` ([x, y] or false), `o.body(client)`, `o.solid: false`, `o.win: {…}` (the era's own `win()` instead) |
| `clickBurst(x, y, t0, o)` | clap | the hand pointer clicks and **three concentric square rings** (`o.ringW` 4 px thick, `o.rings`) burst from the hot spot; `o.kind` ('hand'), `o.scale`, `o.copies`, `o.pointer: false`, `o.color`. In the pad: a solid hand silhouette and a black flash (the pad's invert) |
| `typeLine(text, t0, t1, keystrokes, o)` | hats | each keystroke (default: the hat hits in [t0, t1)) types one more character; the newest key pops inverted for two frames. With `o.x`, `o.y` it draws (`font`, `scale`, `color`, `paper`, `caret`) -> `{str, n, w}` |
| `trashCrumple(x, y, t0, o)` | crash | Empty Trash (52x56, its label drawn below the box at any scale; `o.label: ''` for none): the lid flips open on its hinge, the can bulges, three paper wads (`o.wad` colour) leap out |
| `progressRiser(t0, t1, o)` | riser | a bar filling on 16ths, shaking in its last beat (`o.x, y, w, h, label, font, hold`; `o.idle`: the empty bar between risers; default span: the riser covering t) |
| `bellRing(x, y, t0, midi, o)` | Writing Bell | the product's bell icon swings (with `o.paper`, in two colours), rings ripple out (`o.ringColor`), a note leaps by pitch |

`noteName(midi)` -> 'E2'.

### 12.8 The style reel

`specimen.js` parks it at **1000 s** (past the end of the video), 46.5 s, every shot on the song's own timing (each
borrows a stretch of song time, so the band, the dance and the beat FX play the real EVENTS):
`flood in` (1 s: the 1988 desk, the pen touching down within a quarter second, the flood in 10 hard frames onto the
downbeat with a white trail) · `chorus` (6 s: PEN / PAL as the poster with no menu bar, flipping to full-bleed slabs on the
echo; I'LL NEVER / HOLD / THE PEN. justified with a window slab peeking in; YOU SAY / WHERE I / LAND, with Clio as the
scale-8 hero landing where the writer clicks) · `who holds the pen` (justified, one letter per 16th, the pen level across
the top; YOU DO! black on the field with Clio in the split, the second "you" a full-frame black strobe) · `post-chorus`
(the scanline flip to lime, a new pose every beat) · `dive` (into the vermilion full stop of 1988, out comes 1991 on the
beat) · `pull-back` (2026 -> 2014 -> 2002 -> 1988 -> a dot, a step per two beats, half a second of dot) · `band` (the
drum machine, wiped to cyan) · `screen` (512x342 1-bit -> 640x400 256 colours -> 640x480 thousands -> punched to 16:9) ·
`type` (justify + side bleed, PEN over PAL, a slammed YOU DO!, ghost words) · `fx` · `dance` (every pose; faces off for
the last two seconds: the shape test) · `flood out` (the field drains into the pen tip in 10 steps, pixel-sorted, onto a
live 2002 desk). `window.STYLE_REEL.shots` lists each shot's start. `node render.mjs sheet 1000 1046.5 0.25
build/style-sheet.png`; in the preview, `?style` plays it from 0. Check it with `legibilityAudit(1000, 1046.5)` (0
failures) and look at it at 320x180 too (half-size the sheet): every frame's subject should read in a quarter second.

**Warm-up.** `warmUp(fn)` registers a cache-building job; main calls `styleWarm()` once at boot, which runs them and
builds every dance pose at every step, so the first frame of a flood or a pose does not hitch in the preview (register
each `inkFlood` tip: `warmUp(() => _floodMap(x, y, 4, seed))`, as the reel does).

Budget: the reel averages ~5 ms a frame (under the 6 ms rule); a chorus frame ~5 ms, a dive or pull-back frame ~7 ms (two
frames rendered plus the box-averaged miniature), a flood frame ~10 ms. Occasional single-frame spikes in `renderCheck`
(50-250 ms) are garbage collection, not drawing: the frame itself redraws in under 10 ms.

## 13. The 3D stage (stage3d.js): three.js, brought back to hard pixels

Pseudo-3D for the choruses, the bridge tunnel and the outro pull-back. One shared `THREE.WebGLRenderer` on an offscreen
640x360 canvas (antialias off, `preserveDrawingBuffer`, pixel ratio 1) draws a three.js scene; `render3d` reads every pixel
back, **quantises** it to the active palette and draws it into the frame nearest-neighbour. The result is the film's own
material: exact colours pass untouched, anything in between (a mip average, a light band) becomes a 4x4 Bayer mix of the
**two nearest palette colours** (never a third: a darkened magenta dithers magenta/black, it never sprinkles white).

**Rules.** A stage is built once (`stage3d(key, build)`, cached by key: a new key for new content) and every transform,
colour and visibility is set from `t` each frame. No clocks, no animation loops, no `Math.random`: a frame is the same in
any order (checked). Materials are flat and unlit (`mat3d`); light is 2-3 hard **bands** baked as per-face colours. Cut-outs,
fades, ghosts and fog are **screen-door** Bayer discards (`s3dTh` in the shader, aligned with the 2D kit's `BAYER4`), never
alpha blends. `THREE.ColorManagement` is off and the output is linear: a texel comes out as exactly the colour the 2D kit drew.

**Loading.** three is ESM-only (0.186.1, `package.json`). `index.html` imports `node_modules/three/build/three.module.js` in
a module script; modules run before DOMContentLoaded, so main.js awaits `DOM_READY`, then `init3d()`, then sets `READY`. If
three did not load, a render stops with `READY_ERROR` (render.mjs and flashcheck.mjs report it); the preview plays the 2D
film and the HUD says `3D stage off`. Over `file://` Chromium imports modules only with `--allow-file-access-from-files`
(render.mjs passes it; for the preview use `node tools/serve.mjs`). render.mjs runs WebGL on SwiftShader
(`--use-angle=swiftshader --enable-unsafe-swiftshader`) and keeps the 2D canvases on the CPU
(`--disable-accelerated-2d-canvas --disable-gpu-rasterization`: accelerated on SwiftShader, every `getImageData` in the kit
costs ~15x, 4.7 ms a frame became 72 ms). With these flags the 2D frames are byte-identical to before.

| function | |
|---|---|
| `stage3d(key, build)` | the stage `{key, scene, cam, o, pal, extra, bg}`, built once by `build(st)`; `st.o` holds your objects. Camera: fov 30, near 4, far 40000 |
| `render3d(st, o)` | render through `st.cam`, read back, quantise, draw. `o.div` (1; 2, 4, 5, 8: render at that fraction, drawn back pixel-multiplied: chunkier, ~4x quicker per step), `o.w` x `o.h` (the screen, `W` x `H`), `o.x`, `o.y`, `o.pal` (a colour list; default `st.pal`, else the stage's own colours), `o.bayer` (true), `o.bg` (clear colour: `st.bg`, black; `null` = transparent, only the 3D pixels land) |
| `project3d(st, [x, y, z], o)` | the frame pixel of a 3D point (after the camera is set): pin 2D work (a lyric plate, the pen cord, a click) to the 3D world |
| `mat3d(o)` | `map`, `color` (multiplies map and vertex colours), `vc` (vertex colours), `fade` (0..1), `fog` (false), `side` ('double' / 'back'), `solid` (no screen door), `auto` (a screen-door material with a solid twin: render3d draws the twin whenever the mesh is opaque and nearer than the fog) |
| `fade3d(obj, k)` · `matOf(mesh)` | screen-door fade (0 solid, .5 the ghost, 1 gone) · the material to colour or fade (not its solid twin) |
| `tex3d(key, w, h, draw, o)` | a 2D kit drawing as a `CanvasTexture` (cached by key; `draw(canvas)` runs with `ctx` on it). Magnification always Nearest. `o.mip`: box-averaged mip levels (NearestMipmapNearest) for things that shrink far below 1:1, which the quantiser turns into dither like the dive's miniature (levels pop at 1/2, 1/4 ...). `o.live`: a signature; redrawn and re-uploaded only when it changes |
| `deskTex(key, t, src, o)` | a whole frame through `frameInto` (a scene name or `fn(t)` with `o.era` ...), at `t`, once (`o.live`: every frame, ~5 ms + upload) |
| `card3d(tex, w, h, o)` | a double-sided card, cut out where the drawing is clear (`o.base`: stands on its bottom edge; `o.solid` for opaque drawings) |
| `bandGeo(boxes)` · `band3(c, front, back)` | many boxes as ONE vertex-coloured geometry (one draw call): `{w, h, d, pos, ry, cols: [+x, -x, +y, -y, +z, -z]}`, a null colour leaves a face out; `band3` = sides darkened .35, caps .2 |
| `voxGeo(mask, w, h, d, ox, oy, lv)` · `voxGlyph(ch, font, d)` | a 1-bit mask as voxel columns (exposed faces, merged runs), vertex colours = light levels `LV3` = [front 0, back 0, sides .5, caps .75] of the material colour: black slabs with half- and quarter-dark sides on a field |
| `voxText(lines, o)` · `voxColor(v, c)` | giant 3D type from the same Chicago bitmap bigType scales: one mesh (one draw) per letter, `o.size` (world units per font px, 10), `o.depth` (font px, 3), `o.lead`, `o.align`; returns `{group, letters: [{mesh, ch, li, ci, n, base}], chars, w, h}` |
| `slam3d(L, t, tIn, o)` | a letter slams in along z on `tIn` in hard frame steps (`SLAM3`, from `o.from` = 600 units toward the camera, one frame of overshoot); before it hidden, or `o.ghost`: the 50% screen-door ghost (device 3) |
| `dancer3d(st, key, t, o)` | Clio: `mode: 'voxel'` (her 1-bit unit-grid sprite extruded, `o.depth` 4, a 1-unit field rim behind so her halo and face cut-outs read; geometry cached by the bitmap's hash) or `'card'` (a billboard at `o.px` = 3 px per unit, uploaded only when the pose changes); `o.pos` [x, z], `o.size` (8), `o.yaw` (default: faces the camera), any `clioDance` option |
| `face3d(obj, cam, yaw)` | turn an object to the camera (upright) |
| `cam3d(t, keys, o)` · `aim3d(cam, s)` · `orbit3d(c, r, a, h)` | the camera rig: keys `[[t, {pos, look, fov, roll} or orbit3d(...), ease], ...]`, missing fields carry over; two orbit keys swing round the centre. Eases (the move INTO a key): `'hard'` (default, quartic), `'snap'`, `'whip'` (all the motion in the middle frames), `'cut'`, `'lin'`, `'step'` (holds on 16ths) or fn. Dolly = change `r`, orbit = `a`, crane = `h`, roll = `roll`. `o.fps` (12-30): stop-motion sampling |
| `whip3d(t, keys, o)` | while the camera turns fast (> .035 rad a frame) the frame smears: a hard `FX.pixelSort`, type rows kept |

### 13.1 Presets

Each builds its stage on first use (`o.key`), sets everything from `t`, renders and composites. Draw the 2D on top after it:
lyrics (`kara` with a plate), the pen cord (`project3d`), `beatFX`.

- **`corridor3d(t, o)`: the WINDOW CORRIDOR.** The eras' desks (`o.desk` drawn per era at `o.at`, or `o.tex(era, i)`) as
  24-unit slabs alternating left and right of a z-tunnel (`o.gap` 900, `o.side` 300, `o.turn` .5), white rectangular rings
  every half gap (`o.ring`), far panels dissolving in by Bayer fog (`o.fog`). Default flight from `o.t0`: a panel per `o.step`
  (.5 s), held `o.hold` (.5) with a slow creep and a ±.05 roll, then a whip to the next (smeared); or your own `o.cam` keys.
  Returns `{stage, i, cam}` (`i`: the panel in view).
- **`silStage3d(t, o)`: the SILHOUETTE STAGE.** The field is the backdrop (the clear colour) and the floor, ruled by a black
  1 px grid (`o.grid` 120) that dissolves toward the horizon; `o.type` blocks of black voxel type (`text`, `words` = a lyric
  line: each word slams on its sung start; or `stepIn {t0, div}`, `at`; `show` [t0, t1], `size`, `depth`, `pos` (y = the block's
  bottom), `rot`, `align`, `ghost`), `o.dancers` (`dancer3d` entries with `pos`, `size`, `mode`, `show`), `o.pen` (the white
  pen as a card: `pos` = its back end, `angle`, `scale`, `size`), `o.cam`. Palette: the field, black, white.
- **`nestedDesks3d(t, t0, t1, o)`: NESTED DESKS.** `o.layers` inner first (the frame we start in, e.g. 2026): `{era, draw, at,
  live, win}`; layer i + 1's desk holds layer i on a monitor whose screen is its `win` (16:9 in that desk's 640x360, default
  `NEST_WIN` = (360, 176, 192, 108); the desk draws a window round it and black inside). The monitor stands out of its desk as
  a box (`o.depth` 36, `o.bezel` 5, the era's frame colour in bands). The camera pulls back at a constant log rate (`o.ease`
  shapes it), swinging up to `o.swing` (.12 rad) between layers and square on at each whole layer, where that desk is exactly
  1:1 (so a cut to the 2D desk there is seamless); a 2-frame palette split on each landing. `o.dot`: the outermost desk shrinks
  to the writer's vermilion 2x2 dot (`o.dotWeight` .6 of a step). Returns `{stage, u, layer}`.

### 13.2 The 3D reel and the budget

specimen.js parks the **3D reel at 1300 s** (after the toolkit reel, which runs 1100-1245.5): `corridor` (6 s, the bridge's
104-110: the twelve desks, a half beat each, the year slammed on a plate), `silhouette stage` (6 s, chorus 1's 36-42: PEN PAL,
I'LL NEVER HOLD THE PEN., YOU SAY WHERE I LAND, as voxel slabs on their words, one voxel and two card dancers, the white pen
on its cord, beatFX), `who holds the pen` (4 s, 47.75-51.75: a letter per 16th, ghosted until it lands, then YOU DO!),
`nested desks` (5 s: 2026 back through all twelve to the dot). `node render.mjs sheet 1300 1321 .25 build/s3d-sheet.png`;
`?s3d` plays it from 0 in the preview.

**Budget: average < 25 ms for a 3D frame** (SwiftShader is software; the 2D rule of 6 ms stays for 2D frames). Measured on the
reel with the machine's 4 CPUs shared (load 6-9): corridor ~13 ms, silhouette stage ~21 ms, who ~14 ms, nested ~16 ms; the
first frame of a stage spikes (shader compile, texture builds: up to ~2 s once; prebuild with `warmUp(() => ...)` if a
preview hitch matters). Almost all of it is SwiftShader's raster (`readPixels` waits for it); the quantiser is ~2 ms.

**Gotchas (measured).** (1) A draw call costs ~.13 ms: merge everything that does not move into one `bandGeo` and draw a
voxel letter or dancer as one mesh (light levels in vertex colours, not 4 materials). (2) The screen door doubles the raster
cost (a shader that can discard defeats early depth rejection): use `solid` or `auto` materials wherever nothing can be
discarded. (3) A line with one end behind the camera is not drawn at all: split long lines into short segments (the floor
grid is one segment per cell). (4) A full-screen layer of textured pixels costs ~5 ms; a backdrop should be the clear colour.
(5) The Bayer threshold is aligned to the frame only when the stage renders full-frame at (0, 0) and `div` 1. (6) A stage's
palette is harvested once, on its first render, from its textures and colours (all pass exactly; the 2047 most used are the
dither candidates): a live texture's later colours are dithered, so give stages with live drawings an explicit `pal`.
(7) Keys build stages: the `o` of later calls only moves what the preset sets per frame (cameras, slams, visibility, colours).
