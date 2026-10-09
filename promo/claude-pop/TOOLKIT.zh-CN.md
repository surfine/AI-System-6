<!-- canonical-source: promo/claude-pop/TOOLKIT.md -->
<!-- source-sha256: 5583a46b613f970058e75277e243dae2d2f904bbadd8365784cb5c18f8eb78a5 -->
> 英文版为准 / 仅供人类参考

# 视频工具包：章节作者的说明书

画面是一段关于 **AI System 6** 的长镜头录屏，那是一个写作台,会换上十二种 Macintosh 血统的外观,从 1988 年的 System 6(1-bit)一直到 2026 年的 Liquid Glass。一切都在一块 640x360 的画布上逐帧绘制,作为歌曲时间的纯函数,再以 3x 最近邻放大。本文件是编写 `src/ch01.js` … `src/ch12.js` 的参考。请先读 `BRIEF.md`;它是契约。

加载顺序(`index.html`):`data/data.js`(歌曲:永远不要编辑)、`core.js`、`eras.js`、`ui.js`、`clio.js`、`apps.js`、`style.js`(风格工具包,§12)、`stage3d.js`(3D 舞台,§13)、各个章节、`specimen.js`、`main.js`,最后一个 ES 模块负责把 three.js(`node_modules/three`)导入为 `window.THREE`(main 会等它就绪,之后才 `READY`)。还不存在的章节会被跳过。如果 `data/data.js` 缺失,工具包就用默认值运行(DUR 150、BPM 120、空的 LYRICS、按 BPM 推导的节拍),并且 `lyric()` 返回占位文本行。

## 1. 规则

1. **时间的纯函数。** 一帧只依赖 `t`。帧与帧之间不保留状态,在绘制中不用 `Math.random()`、不用 `Date`、不用 `performance.now()`。随机性来自 `hash(n)`、`hash2(x, y)`、`pick(seed, arr)`、`noise1(x)`。(`performance.now()` 只出现在 main.js 的 `renderCheck` 里,那里是给帧计时的,也出现在预览播放器的墙上时钟里;两者都不在绘制路径上。)
2. **硬像素。** 使用整数坐标(辅助函数会替你取整)。用工具包绘制,或者用 `ctx.fillRect` / `ctx.drawImage` 在整数位置绘制(把算出来的坐标和尺寸包进 `R()`)。**绝对不要**用 `ctx.arc`、`ctx.stroke`、`ctx.fillText`、`createLinearGradient`、`createRadialGradient`、`shadowBlur`、`filter`、`imageSmoothingEnabled = true` 或 `globalAlpha < 1`。1-bit 下的灰色、渐变和半透明都是有序抖动(`bayer`、`veil`、`frost`、`vgrad`);**阴影是实心**的,是桌面色调的阶梯(`winShadow`、`shade(k)`),绝不是稀疏抖动——那会在每条边上读出一串点。文字永远用 `text()`。获准的例外都在 core.js 里:`fillText` 只在 `_raster` 内部使用,它把一段字形画到离屏画布上再阈值化成硬像素;`FX.zoom` 和 `FX.tilt` 对已经画好的一帧做最近邻重采样(仍然是硬像素,但非整数倍缩放或旋转会导致像素宽度不均;`FX.zoomAt` 会取整;style.js 的 `diveInto` / `pullBack` 在 8x 以下也用同样方式做非整数倍缩放,所以一次下潜从它的第一帧起就在运动)。工具包里没有任何东西会打开图像平滑:图标按原生尺寸绘制,`eraThumb` 缩小前用一段手写的 4x4 盒平均,之后再做 Bayer 量化。
3. **歌词在屏幕上,逐字准确、可读、同步,**,嵌入场景自己的 UI 里(一个用来输入的字段、一个对话框的消息、一个窗口标题、一个菜单项)。所有时间都从 `data/data.js` 经 `lyric()` / `wordAt()` 取:绝不要手写一个时间。让它避开菜单栏(`y > E.menuH + 4`),在有 Dock 的年代还要避开 Dock(`y < 312`)。它被唱出来时,任何东西都不能遮住它。在繁忙的桌面上给它一块底板:`kara(L, x, y, {plate: true})`。
4. **每一个被唱出的词都要有事情发生,** 大重音要落在拍上(`pulse`、`kick`、`hitPulse`)。
5. **不动声色。** 操作系统用通报磁盘已满时的那副口吻来报告天大的事情。产品宣称只来自 BRIEF §2。不要 Apple 标志,不要 Happy Mac,菜单栏里不要苹果(工具包画的是我们自己的软盘标记)。
6. **预算。** 平均每帧绘制时间低于 6 ms(`renderCheck` 会报告)。任何昂贵且静态的东西都用 `memo()` 缓存;文字、图标、精灵、图案、桌面和 Clio 已经替你缓存好了。

## 2. 注册场景

```js
scene(name, t0, t1, fn, opts)        // fn(t, local, dur): local = t - t0, dur = t1 - t0
```
当场景重叠时,后开始的胜出。`opts`:

| opt | 含义 |
|---|---|
| `era` | `'system6'` … `'liquidglass'`,或者关键帧 `[[t, 'system6'], [t2, 'system7', 'wipe'], …]`(歌曲秒数;配上 `eraLocal: true` 时是从 `t0` 起的秒数),或者 `t => id`。**省略时:场景跟随歌曲自己的进度表**(`data.js` 的 `ERAS`,见 `songEra(t)`),而其中的 "(inverted)"(反相)条目会设置 `FX.invert`(在场景里取消设置即可退出)。 |
| `morph` / `morphStyle` | 一次关键帧变化所用的秒数(0.5;按进度表时 0.35)以及变化方式:`'dissolve'`(HyperCard 式随机)、`'bayer'`、`'wipe'`、`'blinds'`、`'iris'`、`'checker'`。在变形期间 `fn` 每帧会被调用两次,每个年代一次,所以它必须是纯函数。 |
| `desk` | 一个 `DESKTOPS` 名称(`'linen'`、`'system7'` …)或一个 `'#rrggbb'` 颜色;`deskFn` 用来自己画桌面 |
| `raw` | 没有桌面、菜单栏或 Dock(启动画面、全画幅包袱段) |
| `screen` | `true`:整个场景(桌面、菜单栏、Dock、指针)都画在那一刻的历史屏幕里,`screenSize(t)`(§12.6),四周是黑边;绘制期间 `W` x `H` 是屏幕的尺寸。或者一个矩形 `{x, y, w, h}`,或者 `t => rect` |
| `menu` | 该场景的默认 `UI.menu`;`menubar: false` 隐藏它;`dock: false` 隐藏 Dock |

年代 id,按歌曲顺序:`system6` 1988 · `system7` 1991 · `nextstep` 1995(分支)· `drawingboard` 1998(分支)· `platinum` 1999 · `aqua` 2002 · `tiger` 2005 · `snowleopard` 2009 · `lion` 2011 · `yosemite` 2014 · `bigsur` 2020 · `liquidglass` 2026。

在 `fn` 内部你可以每帧设置这些(main 每帧会把它们重置):
- `UI.menu = {app, menus, open, clock, right, prop, propW, appIcon}`:菜单栏。`open` 高亮一个标题:**传它的标签**(`open: 'Writing'`)。**坑:** 数字形式的 `open` 依赖年代,因为从 Aqua 起索引 0 是加粗的 app 名:'Writing' 在 System 6 到 Platinum 是 2,从 Aqua 到 Liquid Glass 是 3。如果你确实需要那个数字,用 `menuIndex('Writing')`;要在标题下面挂出下拉菜单,用 `menuAt('Writing')`(它的 `{x, w}`;在 NeXT 下为 null,那里的菜单是一列)。回调选项 `UI.menu.prop(x, y, w, h)` 在右侧槽位里绘制运行的提示物(`propW` 像素宽;在 NeXT 下,在第三个 Dock 磁贴里面)。`clock: false` / 或一个字符串。`UI.menubar = false` 隐藏菜单栏。
- `UI.dock = {items, hover, bounce: {i, t0}, open: [i…], hide: 0..1}` 或者 `false`。
- `CUR = {x, y, kind, down}`(或者用 `cursor(t, keys)`):写作者的指针,画在所有东西之上,但 FX 除外。
- `FX.*`:见 §9。`overlay(fn)`:在菜单栏和 Dock 之后绘制 `fn`(在所有东西之上)。

每帧的顺序:桌面 → `fn` → Dock → 菜单栏 → 覆盖层 → 指针 → FX。

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

## 3. 时间:节拍、重音、段落、歌词(core.js)

来自 `data.js` 的歌曲全局量:`LYRICS`、`SECTIONS`、`BEATS`、`BARS`、`HITS`、`ERAS`(年代进度表)、`EVENTS`(每个乐器演奏什么,§12.7)、`BPM`、`DUR`、`TITLE`。`T` 是正在绘制的那一帧的时间;辅助函数默认把自己的 `t` 取作它。`SPB` = 每拍秒数。`W` x `H` 是正在绘制的屏幕(640x360,或者在 `screen` 场景里更小的历史屏幕);`FW` x `FH` 永远是整个画幅。

| function | returns |
|---|---|
| `beatAt(t)` / `barAt(t)` | 小数形式的拍 / 小节索引(严格跟随 `BEATS`/`BARS`) |
| `bsearch(sortedArr, t)` | 最后一个 <= t 的元素索引(没有则为 -1) |
| `beatTime(n)` / `barTime(n)` | 第 n(可以是小数)拍 / 小节的秒数 |
| `beatPhase(t, div=1)` / `barPhase(t)` | 在拍(`div` 拍)或小节内的 0..1 |
| `pulse(t, div=1, sharp=5)` | 每拍为 1,随后衰减:`rect(x, y - R(4 * pulse(t)), …)` |
| `kick(t, sharp=9)` | 每个小节强拍为 1,随后衰减 |
| `onBeat(t, n=1)` / `beatsIn(t, t0)` | 整数拍计数器 / 自 t0 以来的拍数 |
| `hit(name, nth=0)` / `hits(name)` | 来自 `HITS` 的某个具名重音的秒数;`'whoHoldsThePen'` 匹配 `whoHoldsThePen1`、`…2`;`hits()` = 全部 |
| `hitPulse(t, name, sharp=8)` | 最近一次该重音处为 1,随后衰减(第一次之前为 0) |
| `since(list, t)` | 距一个有序列表中最近一个时刻的秒数 |
| `sectionAt(t)` / `section(name, nth)` | `{name, label, start, end}` |
| `lyric(idOrText, nth=0)` | 一行 `{id, text, voice, section, start, end, words: [{w, start, end, silent?, syl?}]}`;按 id(`'chorus1b'`)或按其文本的开头取;缺失会抛错(没有歌曲时是占位文本) |
| `wordAt(line, 'pen' \| index, nth)` | 一个词;负索引从末尾数起 |
| `lineAt(t, voice)` / `lastLine(t, voice)` / `nextLine(t, voice)` | 正在被唱的那一行 / 最近开始的一行 / 下一行 |
| `wordNow(t, line)` · `wordProgress(w, t)`(= `wordP`) · `lineProgress(ln, t)` · `wordsSung(ln, t)` · `wordPulse(ln, t)` · `sungText(ln, t)` | 逐词同步 |

声部:`lead`、`chant`、`choir`(角色 `echo`、`lala`、`harmony`、`call`)、`spoken`。带 `silent: true` 的词会显示但不被唱出(由写作者把它打出来):`singing()` 会让 Clio 的嘴在那时闭着。

数学:`clamp`、`lerp`、`prog(t, a, b)`(0..1)、`ease`(smoothstep)、`easeIn`、`easeOut`、`easeInOut`、`backOut`、`elasticOut`、`bounceOut`、`stepped(k, n)`(一顿一顿的周期运动)、`keys(t, [[t, v], …], easeFn)`(数字或数组)、`track(t, [[t, x, y], …])`、`hash`、`hash2`、`pick`、`noise1`、`R`(四舍五入)、`fl`(向下取整)。

## 4. 颜色、抖动、基础图元(core.js)

`P` 是当前年代的调色板(角色):`desk deskText text textDim win face frame hi lite shadow dark title titleText titleOff titleTextOff sel selText listSel listSelText menu menuText menuSel menuSelText field fieldEdge accent accentText track thumb tip rule red yellow green card ink paper`。`C` 有固定颜色(`C.black`、`C.white`、`C.g1`…`C.ge` 灰阶,…)。`E.depth` 是 1、2、4、8 或 24:在 1-bit 年代只画黑与白,其余用抖动。`mix(a, b, k)`、`lighten(c, k)`、`darken(c, k)`、`rgb(c)`、`hex(r, g, b)`、`luma(c)`。

| function | |
|---|---|
| `rect(x, y, w, h, c)` · `frame(x, y, w, h, c, t=1)` · `hline` · `vline` | |
| `line(x0, y0, x1, y1, c, w=1)`(Bresenham)· `dline(…, c, on, off)`(虚线)· `path(pts, c, w)` | |
| `oval(x, y, w, h, c)` · `ovalFrame` · `disc(cx, cy, r, c)` · `ring(cx, cy, r, c, t)` · `ell(cx, cy, rx, ry, c)` | 基于扫描行构建,无抗锯齿 |
| `rrect(x, y, w, h, r, c)` · `rframe(x, y, w, h, r, c, t)` | 带像素圆角的圆角矩形 |
| `poly(pts, c)` · `tri(…)` · `arrowTri(x, y, size, 'up'\|'down'\|'left'\|'right', c)` | `c` 可以是一个图案 |
| `bayer(x, y, w, h, level, c1, c2=null)` | 有序 4x4 抖动,`level` = c1 的占比;`c2` 为 null 时留下像素 |
| `dither(x, y, w, h, c1, c2)` · `veil(x, y, w, h, c, k)` · `frost(x, y, w, h, c, k)` | 50% 棋盘 · 伪透明着色(Bayer)· 霜化着色(不规则) |
| `patfill(x, y, w, h, 'gray'\|'ltgray'\|'dkgray'\|'dots'\|'grid'\|'hstripe'\|'diag'\|'weave'\|…, ink, paper)` | 经典 8x8 图案,或者 8 个字节组成的数组 |
| `vgrad(x, y, w, h, stops, steps=4)` · `hgrad(…)` · `rrectGrad(x, y, w, h, r, stops)` · `ovalGrad` · `rrectVeil(x, y, w, h, r, c, k)` | 阶梯式抖动渐变(stops:颜色,或 `[[pos, colour]…]`) |
| `bayerPat(level, c1, c2)` · `noisePat(level, c1, c2)` · `gradPat(len, stops)` | 上面那些背后的填充样式 |
| `clipRect(x, y, w, h, fn)` | 整数裁剪 |
| `shade(k)`(eras.js) | 当前桌面的一种实心深色调(k 0..1):阴影和阴影线用的颜色 |
| `winShadow(x, y, w, h, r, size, k)`(eras.js) | 由 2 层(size < 4)或 3 层实心 `shade()` 阶梯组成的投影:向右 1px、向下 2px,然后是更浅的环 |
| `ditherField(fn, step)`(eras.js) | 用 `fn(x, y) -> [r, g, b]` 填充整个目标,Bayer 量化到 `step` 个层级(壁纸就是这样画的;在 `memo` 里用) |
| `pinstripe(x, y, w, h, a, b)` · `capsule(x, y, w, h, stops, edge, {shine, steps})` · `nxBevel(x, y, w, h, face, pressed)` · `bevel(x, y, w, h, face, hi, sh, outer)`(eras.js) | Aqua 细条纹 · 一颗凝胶药丸 · NeXT 的凸起斜面 · 一个通用的凸起/凹陷盒子 |
| `metalTexture()` / `metalFill(x, y, w, spans)`(eras.js) | Tiger 的拉丝金属(一块缓存好的 640x360 画布)以及在扫描行形状内部的一次填充 |
| `flatDock(x, y, w, h, r, fill, rim, base)`(eras.js) | Dock 底板:扁平、基本不透明,带 1px 高光 |

扫描行形状(`oval`、`rrect` 及其同类背后的那些行)是内部的:`ovalSpans`、`rrSpans`、`topSpans`、`spanFill`、`spanFrame`、`spanGrad`、`spanPat` 不是给章节用的,`sline`、`clioArms`、`clioLook`(clio.js)以及任何 `_name` 也都不是。请使用上面的形状辅助函数。

## 5. 文字(core.js)

`text(str, x, y, {font, color, scale, align, outline, shadow, bold}) -> width`。**`y` 是大写字母的顶部。** `font` 是 `FONTS` 的一个键,或者一个**年代角色**:`ui`、`title`、`menu`、`button`、`small`、`body`、`doc`、`label`、`mono`、`big`、`lyric`、`appName`。角色在经典年代映射到 Chicago / Geneva / Monaco,在 Platinum 和 Drawing Board 映射到一款类 Charcoal 字体,在 NeXTSTEP 和 Yosemite 是 Helvetica,在 Aqua 到 Lion 是 Lucida,在 Big Sur 和 Liquid Glass 是 SF(Inter),从 Platinum 起手稿用 `serif`。每个字符串都会被阈值化成硬像素并缓存。`scale` 是整数倍像素放大(1-4)。`outline: colour` 给字形描环;`shadow: colour` 或 `[colour, dx, dy]`。

`tw(str, font, scale)` 宽度 · `capH(font, scale)` · `lineH(font, scale)` · `wrap(str, maxW, font, scale) -> rows` · `fitText(str, maxW, font, scale) -> str`(用 '…' 不断截短直到放得下:**绘制任何位于某一列里的字符串之前都要先量尺寸**,因为更晚年代的字体更宽)· `para(str, x, y, w, {font, lh, align, maxRows}) -> height` · `typed(str, t0, t1, t)`(到 t 时一个人已经打出的内容,略微不均匀)· `caretOn(t)` · `defFont(key, css, thr)`(`thr` 是 alpha 阈值:对于 serif 这类带细线的字体取 70-90,这样 T 能保住它的横杠)· `fontKey(font)`(某个角色在当前年代解析成的 `FONTS` 键)· `initFonts()`(字体加载完成后 main 调用一次)。像素字体(Chicago、Geneva、Monaco)没有带变音符号的字母:`text()` 会把 'Naïm' 折成 'Naim'。

`lyricPlate(x, y, w, h, fill)` 绘制 `kara(…, {plate: true})` 放在一行文字背后的、按年代风格做的卡片。

**`kara(line, x, y, opts) -> {w, h, rows, words: [{x, y, w, h, word}]}`**:歌词,逐词同步,使用年代自己的字体和高亮。`mode`:`'select'`(默认:年代的文本选择横扫过已被唱出的词)、`'type'`(字母随着被唱出而出现,带一个光标)、`'color'`(未唱的词是暗的)、`'pop'`(每个词弹跳着进来)、`'plain'`。选项:`font`(`'lyric'`)、`scale`(16px 像素字体用 2,否则 1)、`color`、`dim`、`hi`、`hiText`、`maxW`(换行)、`align`、`lh`、`t`、`caret`、`outline`、`shadow`、`plate`(`true` 或一个颜色:在这行背后放一张按年代风格做的卡片,让它能压在任何桌面上读清)。返回的词矩形让 Clio 或指针可以瞄准某个词。

## 6. 外观(eras.js)

`APPEARANCES` = 那十二种,按歌曲顺序(之所以这么命名,是因为 `data.js` 已经定义了 `ERAS`,那是进度表);`ERA[id]` → `{id, year, name, branch, depth, icons, chrome, menuH, dock, corners, fonts, pal, index}`。`setEra(id)`(由 main 做)、`withEra(id, fn)`(在另一个年代里画点东西,然后恢复)、`E`(当前的)、`eraIndex(id)`、`eraNext(id, d)`。歌曲的进度表:`ERA_SCHEDULE`(`[{id, start, name, note, inverted}]`)、`songEra(t)`、`songEraEntry(t)`、`songEraKeys()`。`eraNow(t)`(main.js)= t 处实际绘制的年代。

`desktop(opts)` 绘制年代的壁纸(已缓存;`deskCanvas(name)` 返回那块画布):System 6 是产品的浅色 25% 点网(`desk: 'system6gray'` 是经典 50% 灰),System 7 蓝灰,NeXTSTEP 深灰,Drawing Board 制图纸,Platinum 的蓝色波浪,Aqua 的蓝色弧线,Tiger 的极光痕,Snow Leopard 的紫色星云,Lion 的星系(或 `desk: 'linen'`),Yosemite 的黄昏山脊,Big Sur 的色带,Liquid Glass 的浅色网格。`LOOK[E.chrome]` 保存每个家族的绘制器(`win`、`button`、`vscroll`、`hscroll`、`grow`、`field`、`check`、`radio`、`progress`、`menubar`、`menuBox`、`menuSel`、`dialog`、`dock`):请调用下面的控件,而不是这些。`lamp(x, y, d, colour, style)` / `lamps(…)` 绘制交通灯;`markGlyph(x, y)` 是我们的软盘标记(apps.js 里的 `markGlyphCanvas()` 会按年代的颜色把它作为一块画布返回);`screenCorners()` 是一台一体式 Mac 屏幕的圆角;`winTitle(x, w, title, ty, left, colour)` 是居中的窗口标题,窗口窄时它会向右滑动并裁剪;`eraIdFromName('1991 System 7')` 给出某个进度表名称对应的 id。

## 7. 控件(ui.js)

| function | returns / notes |
|---|---|
| `win(x, y, w, h, title, o)` | 客户区矩形 `{x, y, w, h, frame, round}`,或**打开过程中为 null**。`o`:`k`(0..1:从 `from` 出发的经典缩放矩形,`from` 是矩形或 `[x, y]`)、`active`(false;在 NeXT 是 `'main'`)、`scroll`(`'v'`、`'h'`、`'vh'`)、`sk`/`sfrac`、`hk`/`hfrac`、`grow`、`header`(`'text'` 或 `[left, centre, right]`:产品的信息条)、`status`(同上,在底部)、`body`(客户区填充)、`close`/`zoom`/`collapse: false`、`closeHot`、`dirty`、`hover`(灯显示 ×−+)、`noShadow`、`toolbar`(统一栏的像素高度)、`pressed`(`'up'`/`'down'` 箭头) |
| `zoomRects(from, to, k)` · `dragOutline(x, y, w, h)` · `trail(t, n, dt, fn)` | 扩张中的轮廓线 · 点线拖拽轮廓 · 被拖拽窗口的残影副本 |
| `vscroll(x, y, h, k, frac)` · `hscroll(x, y, w, k, frac)` · `growBox(x, y)` | |
| `button(x, y, w, h, label, {def, pressed, disabled, font})` | 矩形 + `cx, cy`。默认 = 圆环(经典)、回车符号(NeXT)、脉动的蓝色凝胶(Aqua)、蓝色(更晚)。高度 `btnH()` |
| `check(x, y, label, on, o)` · `radio(…)` · `popup(x, y, w, label, o)` · `slider(x, y, w, k)` · `tabs(x, y, w, labels, sel)` · `groupBox(x, y, w, h, label)` · `sep(x, y, w)` | |
| `textField(x, y, w, h, str, {caret, focus, placeholder, sel: [a, b], font})` | `{…, caretX}`;输入时用 `caret: 'solid'`,想闪烁用 `true` |
| `typedField(x, y, w, h, full, t0, t1, o)` | 一个字段,有人在 t0 到 t1 之间把 `full` 打进去 |
| `progress(x, y, w, h, k, {indeterminate})` | 黑条 → 灰条 → Platinum 斜面 → Aqua 凝胶 / 理发柱 → 细扁条 |
| `listRows(x, y, w, rows, {sel, rowH, font, stripes})` | rows:字符串或 `{text, icon, right, dim}` |
| `panel(x, y, w, h)` · `card(x, y, w, h)` | 年代的凹陷凹槽 / 凸起卡片 |
| `menuLayout(o) -> [{label, x, w}]` · `menuBar(o)` · `menuIndex(label)` · `menuAt(label)` | main 根据 `UI.menu` 绘制菜单栏(NeXT:`nextMenu(o)`,左上角的列,以及右边缘向下的 Dock 列,`NX_TILE` = 40 px 磁贴、`NX_GAP` = 3 px,x = W - 41);`menuAt` 给出可以往下挂菜单的标题 |
| `pullMenu(x, y, items, sel, o)` | items:`'Label'`、`'Label\t⌘K'`、`'-'`、`'~Disabled'`、`'✓Checked'`;返回 `{x, y, w, h, rows, rowH}`。挂在标题下面:`const m = menuAt('Writing'); pullMenu(m.x, E.menuH - 1, …)` |
| `dialog(x, y, w, h, o)` · `alert(cx, cy, {icon, text \| lines, buttons, def, pressed, disabled, w, k, title})` | `alert` 自动定尺寸并返回 `{x, y, w, h, btn: [rects], text: {x, y}, client}`;图标 `'caution'`、`'stop'`、`'note'`(Clio)或任意产品图标名。NeXT 面板永远有标题(默认 'Alert')。让对话框避开桌面图标列(x > 560;NeXT x > 520) |
| `alertIcon(kind, x, y)` | |
| `deskIcon(x, y, name, label, {sel, open})` · `deskIcons([[icon, label], …], {x, y, gap, sel})` · `trashIcon(x, y, full)` | 经典年代中 Finder 的反相标签,之后是蓝色药丸;标签永远不会跑出屏幕。`deskIcons` 默认 x = W - 52(NeXT:W - 100,在 Dock 列的左边) |
| `infoStrip(x, y, w, h, [left, centre, right], 'top' \| 'bottom')` · `stripH()` | 产品的细信息行(`win` 的 `header` / `status` 绘制的东西)及其高度 |
| `icon(name, x, y, {size: 32 \| 16, scale, sel, open, set})`(core.js) | 产品自己针对当前年代的图标(`classic` 是带遮罩的 1-bit SVG,然后是各年代的 PNG) |
| `balloon(x, y, w, h, tx, ty)` · `say(x, y, str, tx, ty, {maxW, font, align})` · `tooltip(x, y, str)` | System 7 的 Balloon Help(以及每个年代里的说话) |
| `dock({items, hover, bounce: {i, t0}, open, hide})` | 从 Aqua 到 Liquid Glass 在底部;NeXT 的磁贴列在右侧 |
| `beachball(step)` | 作为缓存画布的旋转等待光标(12 步) |
| `pointer(x, y, kind, {down, scale})` | 种类 `arrow`、`ibeam`、`hand`、`grab`、`pencil`、`cross`、`watch`(手在扫)、`ball`(旋转等待)、`busy`(年代自己的等待光标) |
| `mousePath(t, keys) -> {x, y, down}` · `cursor(t, keys, kind)` | keys 为 `[[t, x, y, action?], …]`,action 为 `'click'`、`'dbl'`、`'press'`(按住直到下一个 key:一次拖拽)。移动会缓动、略微划弧、过冲后再稳定下来;按下时箭头会被压扁。`cursor` 会写 `CUR` |
| `clockText(t)` | 菜单栏时钟 |

图标名:`startupDisk hardDisk folder document applications trash trashFull fileFloppy assistant`(ClioTalk)`quickDraft writingStudio projectDisk projectDisc cloudModel cloudModelOff localModel questionSheet outline sectionDrafts manuscript reviewDesk searcher reader timeMachine docMap scrapbook systemFolder controlPanel dictionary teachText chatFile writingBell oneMoreTune doom micropolis openttd bonsaiCity lightroom multiFinderApp finderApp soundscape clioStage clioChart clioPaint imagePromptStudio systemStatus importUtility helpFolder systemHelp chooser alias documents writingDemo`。缺哪个就回退到拥有它的最近年代。

## 8. Clio(clio.js)

这个 AI 是 **Clio**,一个对话气泡生物,有两只点状眼睛和一张会唱出歌词的嘴。她按年代穿衣(1-bit 轮廓线、System 7 明暗、NeXT 斜面、铅笔草图、Aqua 凝胶、拉丝金属、Leopard 光泽、Yosemite 扁平、Big Sur 蓝色、Liquid Glass)。她很乐于帮忙,老是去够那支铅笔;而写作者一直拿着那支笔。

`clio(x, y, o) -> {x, y, w, h, hand: [x, y], mouth: [x, y], eyes: [x, y]}`(x, y = 左上角;盒子在 scale 1 时是 `CLIO_W x CLIO_H` = 32x28)。选项:`scale` 1-8、`expr`(`happy`、`sing`、`wink`、`surprised`、`deadpan`、`shrug`、`think`、`sad`)、`mouth`(0..1,`{open, shape: 'A'|'E'|'O'|'M'}` 或 `'sing'` = 从歌词推导)、`voice`(配合 `'sing'`)、`look` `[dx, dy]`、`pose`(`rest`、`wave`、`point`、`shrug`、`reach`、`hold`、`none`)、`point`(`'left'|'right'|'up'|'down'`)、`reach` `[x, y]`(她的近侧手臂朝那里伸展,橡皮管式)、`holding`(`pencil`、`floppy`、`note`、`record`、`page`、`mic`、`heart`、`star`;画在手臂网格上,所以在 scale 8 时铅笔就是铅笔大小)、`bob`(节拍弹跳的像素数)、`flip`、`center`、`blink`(默认开)、`shadow`、`era`(着装覆盖)、`plain`(没有手臂)、`halo`(`true` 或一个颜色:在她轮廓周围一圈 1px 的环,给繁忙 1-bit 桌面上的小 Clio 用;用它时让她伸得短一点)。表情:`sad` 内眉抬起并有一滴泪,`think` 侧目、单眉抬起和一个思考圆点,`deadpan` 和 `shrug` 是实心眼睑(在 1-bit 下都能读出来)。一只伏在窗口上的小 Clio 坐在窗沿上方 6 px,绝不压在任何边框线上。

`singing(t, voice) -> {open, shape}`:在每个词的起点张开,在它的终点闭合,开口音更宽,长音上加颤音,花腔会重新发音,silent 词闭着。默认声部 = lead + chant + spoken;`'choir'`;`'*'`。`clioSay(x, y, str, o)`:Clio 带一个文字气泡。

## 9. 应用(apps.js)

`APP.<name>(x, y, w, h, opts)` 绘制一整个窗口并返回它的客户区矩形外加若干锚点,打开过程中则返回 null。通用 opts:`title`、`k`、`from`、`active`、`win: {…}`(传给 `win()`)。在一个应用内部,`fillClient(c, colour)` 填充客户区矩形(年代会圆角的地方就圆角),`modernEra()` 从 Aqua 起为真,`headFont()` 是手稿标题字体(从 Aqua 起是 serif 加粗,跟产品的 TeachText 一样),`uiHead()` 是年代里属于界面的标题(卡片标题、计量表)用的加粗无衬线体;`finderIcon(x, y, name, label, {sel, open, maxW})` 是窗口纸张上的一个图标。

| app | opts → anchors |
|---|---|
| `teachText` | `lines`(段落,`'# '`/`'## '` 为标题)、`words`、`paras`、`status`('Read-only, edit in Section Drafts')、`typing: {text, t0, t1}`、`hiRow`、`scrollPx`、`font` → `rows: [{text, x, y, w}]`、`lh` |
| `clioTalk` | `msgs: [{who: 'clio'\|'you', text, at, typing: secs}]`、`typing`、`input`、`actions: ['Clip', 'Insert', 'Discard']`、`pressed`、`sendPressed`、`hero`(在任何消息之前显示的大字 "Hi. I'm Clio, the conversation app.";`false` 隐藏它)→ `bubbles`、`actions`、`input`、`send`、`plus` |
| `scrapbook` | `card: {title, body, source}`、`n`、`of`、`kind` → `newScrap` |
| `reviewDesk` | `checks: [{label, state: 'ok'\|'flag'\|'pending', note}]`、`reveal`、`you`(Sounds like: YOU nn%)、`note` → `rows`、`meter` |
| `searcher` | `query`/`typing`、`results: [{title, url, snippet}]`、`reveal`、`sel`、`pressed` → `field`、`search`、`buttons` |
| `questionSheet` | `items`(`'## Head'`、`'- bullet'`)、`typing` → `rows` |
| `outline` | `items: [{text, level, open, done}]`、`sel` → `rows` |
| `sectionDrafts` | `sections`、`sel`、`text`、`typing` → `list`、`editor` |
| `notePad` | `text`、`typing`、`page` |
| `finder` | `title`、`items: [[icon, label]…]`、`sel`、`open`、`used`、`free`、`gap` → `icons` |
| `fileFloppy` | `items`、`ocr`(导入进度)、`current` |
| `projectCD` | `burn`(0..1;省略 = 不确定)、`doc` |
| `floppyMeter` | `count`(0..1)、`bytes`(2,902,645)、`budget`(2,949,120)、`pass` |
| `oneMoreTune` | 唱片测验,按产品绘制它的方式:`track`(0..9)、`done`、`year`(大字在蓝色标签上)、`catalog`('A1')、`song`、`artist`、`sub`(广告,例如 'Envelope')、`label`(年代名,在广告行上带一个蓝点)、`links`(默认 'Hear the whole song' / 'Watch the original';`false` 隐藏)、`skip`(`false` 隐藏 'Not that one')、`skipPressed`、`options`、`answer`、`wrong`、`spin`、`arm`(0 停在唱片旁边 .. 1 播放)、`labelColor`、`nextPressed`。给它大约 300 px 的高度 → `record`、`options`、`next`、`skip`、`links` |
| `controlPanel` | `sel`(年代索引或 id)、`pressed: 'apply'` → `rows`、`apply`(显示所选年代的一张缓存缩略图) |
| `doom` | `walk`、`fire`(0..1)、`imp`(0..1 或 false)、`health`、`ammo` |
| `micropolis` | `built`(0..1)、`tool`、`cursor: [col, row]`、`seed`、`year` |
| `about` | `memory: [{name, kb, icon}]`、`used`(0..1) |
| `writingBell` | `seconds` |

`eraThumb(id)` 返回某个年代的一张缓存好的 160x90 图片(用于转场、Control Panel、缩略图总览包袱段);main 在启动时构建全部十二张。

## 10. 整帧 FX 和缓冲区(core.js)

绘制时在 `FX` 上设置字段;main 按这个顺序把它们作用到已经画好的一帧上(包括指针):`dissolve` · `glitch` · `wobble` · `tilt` / `zoom` / `shake` / `dx` / `dy` · `invert` · `flash` · `crt`。

| field | |
|---|---|
| `FX.shake = px` · `FX.dx`, `FX.dy` | 抖动 / 平移整个画幅(`FX.bg` 填充露出来的地方) |
| `FX.zoom = factor`, `FX.zoomAt = [x, y]` · `FX.tilt = radians` | 最近邻,保持硬像素 |
| `FX.glitch = 0..1` · `FX.wobble = px` | 行撕裂 · 正弦行 |
| `FX.invert = true` 或 0..1(抖动)· `FX.flash = [colour, 0..1]`(抖动) | |
| `FX.crt = 0..1` | 关机时坍缩成一条线和一个点 |
| `FX.dissolve = {from: canvas, k: 0..1, style}` | 从一帧捕获画面出发的像素转场(style 同 `morphStyle`) |
| `FX.pixelSort = {rows, len, seed, dir, keep}` | 在散列过的条带里按亮度排序的连续段:一次 drop 的硬拖痕;`keep` 行([[y0, y1]…],默认 `FX.typeRows`,`bigType` 会填充它)不动 |
| `FX.stepZoom = n`, `FX.stepZoomAt = [x, y]` | 整数倍推近:每个像素都是一个精确的 n x n 方块 |
| `FX.rgbSplit = px` 或 `[dx, dy]` 或 `[dx, dy, [trail, lead]]` | 红蓝通道被拉开,边缘吸附到纯色;给两个颜色时边缘就是那两个颜色(风格工具包的 `splitPal`:霓虹底上的白与黑) |
| `FX.posterize = levels` 或 `['#rrggbb', …]` | 每通道层级数,或某个调色板的最近色 |
| `FX.scan = {k, color \| from, band, interlace, dir, edge}` | 扫描线条带切换到某个颜色(或某帧捕获画面),交错 |

完整顺序:dissolve · glitch · wobble · pixelSort · tilt/zoom/shake/dx/dy · stepZoom · rgbSplit · posterize · invert · flash · scan · crt。风格工具包(§12.5)会按拍替你把它们设好。

`applyFX(t)`(main 调用)应用它们;`crtOff(k)` 是它为 `FX.crt` 用的关机坍缩。`snap(i)` 把目前为止的画面复制进缓冲区 i(0-2 归你;main 用 3-5)。`offscreen(w, h, fn)` 画进一块新画布;`memo(key, w, h, fn)` 缓存一块。`transition(from, k, style)` 合成一帧捕获画面。精灵:`defSprite(name, art, pal)`(ASCII 行,`.` 为透明;默认调色板 `SPAL`:`K W g G d l R O Y E B C P N T b`)、`spr(name | canvas, x, y, {scale, flip, flipY, tint})`、`tinted(canvas, colour)`、`recolor(canvas, {'#000000': c, '#ffffff': null})`。

## 11. 检查你的工作

你可以读的常量:`MANUSCRIPT`(默认手稿段落)、`MENUS`(默认菜单标题)、`DOCK_DEFAULT`(默认 Dock 项目)、`PATS`(8x8 图案)、`SPR`(按名字取的精灵)、`ICON_NAMES`、`BAYER4` / `BAYER8`、`ONEBIT()`(在 1-bit 年代为真)、`SONG_MISSING`、`QS`(页面的查询字符串)。main.js 还暴露 `sceneAt(t)` 和 `eraFor(scene, t)`;`drawScene`、`resetCtx`、`VIEW`、`withScreen`、`screenFor`、`W_` 以及 `*_FONTS` / `BASE_PAL` 这些表是内部的。

图像:`loadImage(src) -> Promise`、`preloadImage(key, src)`(载入 `IMAGES[key]`,在 `READY` 之前被 await;在章节的顶层调用它)、`preloadIcons()`(main)、`iconCanvas(name, size, set)`(处理好的图标画布,带年代回退)。画布元素是 `cv`;通过 `ctx` 绘制。

```bash
node render.mjs check 0 154                # every frame: exceptions, avgMs (keep < 6), maxMs, maxAt
node render.mjs sheet 36 60 1 build/ch03.png   # contact sheet, each tile stamped with time, scene and era: LOOK at it
node render.mjs still 39.5 build/still.png     # one frame at 1920x1080 with the CRT finish
```
在浏览器里预览:运行 `node tools/serve.mjs` 并打开 `http://127.0.0.1:8640/promo/claude-pop/index.html`(浏览器不会从 `file://` 导入 ES 模块,所以 three.js 不行;以文件方式打开时 2D 影片照旧播放,HUD 会显示 3D 舞台已关闭)。按键:空格播放/暂停,方向键 ±1 s,shift ±5 s,`,` `.` 逐帧,`h` HUD,`?t=39.5` 从那里开始,`?era=aqua` 强制某个年代,`?specimen` 进入工具包样片。没有 `build/song.wav` 时会跑一个无声时钟(页面只在预览里挂载歌曲,所以渲染从不请求它)。在章节还缺失时,render.mjs 会为每个不存在的 `src/chNN.js` 打印一条 `Failed to load resource: net::ERR_FILE_NOT_FOUND`:这是预期内的,等章节存在后就会消失。任何其他控制台错误都是真的。样片卷(每个年代、应用、控件、Clio 姿势、FX 和变形)在没有章节时铺满整首歌;章节存在之后它被停在 1100 s,超过视频末尾:`node render.mjs sheet 1100 1136 3 build/kit.png`。**风格样片**(§12.8)永远停在 1000 s:`node render.mjs sheet 1000 1046.5 0.25 build/style-sheet.png`;`?style` 在预览里从 0 播放它。

## 12. 风格工具包(style.js):动态像素 × 剪影

VISION.md 里的那种观感,做成了工具。一次长镜头里有两个模式:**桌面模式**(年代桌面,密集而机灵)用于主歌、预副歌和桥段,以及**剪影模式**用于每个副歌和后副歌:桌面泛成一片平坦的霓虹底色,一切变成纯黑,Clio 起舞,屏幕上唯一白色的东西是写作者那根系着绳的笔,而钩子词句以巨型像素字砸进来。这里的一切都守规则:整像素、不平滑、无 alpha、`t` 的纯函数。

**剪影规则,每一帧:** 一个主角(一个词或一个姿势)、一支白笔,以及不服务于它们的东西一概没有。海报大字之上不要菜单栏;窗口变成板块(`slabWindow`),而不是塞满 9 px 文字的镂花模板。大字的任何字形都不能被之后绘制的东西遮住超过 10%,不能被劈成两种背景(一半在黑条上一半在底色上),也不能在顶部或底部边缘被裁掉:`legibilityAudit(t0, t1)`(§12.4)会检查这一点。

### 12.1 底色与剪影模式

`FIELDS` = `magenta #ff2e88` · `lime #b6ff00` · `cyan #00e5ff`(三块副歌底色)· `vermilion #ff5a36`(写作者的,永远不属于 Clio)· `white`(笔的)· `ink`(黑)。`FIELD_OF` 把歌曲的段落映射到它们(chorus1 品红,post1 青柠,chorus2 青柠,post2 品红,chorus3 青,outro 品红:后副歌翻到互补色)。`fieldAt(t)` 是 t 所在段落的底色(桌面模式为 null),`silOn(t)` 表示我们是否处于剪影模式;`fieldCol(nameOrHex)`。最简单的剪影帧就是 `rect(0, 0, W, H, fieldAt(t))`,上面画黑色的东西。

**`slabWindow(x, y, w, h, o)`**:把一个窗口画成剪影:一块实心黑板,只用底色镂出它的标题栏条纹和关闭/缩放框(`o.cut`、`o.ink`、`o.tb` 标题栏像素数)。让一个窗口从角落探进来,大约是它桌面尺寸的 70%;返回客户区矩形。

**`silhouette(field, fn, o)`** 铺上底色,把 `fn` 画进一块缓冲区,然后把它画的一切都作为黑色落下(用于你没法直接画成黑色的形状,以及泛色的头几帧):

| opt | |
|---|---|
| `mode: 'stencil'` | 亮像素变成墨,暗像素透出底色:窗口把它的边框线、标题条纹和文字保留为霓虹镂空。默认 `'solid'`:`fn` 画过的每个像素都是墨(一个形状)。在副歌里优先用 `slabWindow`:镂花窗口的微小文字在巨型大字旁边只是杂物 |
| `key: 'name'` | 该绘制是**静态**的:结果被缓存,之后的帧只花一次 `drawImage`。给桌面的镂花图总是加 key(未缓存的镂花是一次约 10 ms 的逐像素遍历)。把会动的东西排除在带 key 的调用之外 |
| `thr`, `invert` | 镂花的亮度阈值(.5)/ 反过来 |
| `bg: false` | 不填底色:把剪影落在已有画面上 |
| `ink` | 剪影颜色(黑) |
| `keep: fn` | 之后用真颜色画在上面 |

在 `fn` 内部,`pen()`、`penCord()` 和 `penTrail()` 会自动把自己延后到最上层(它们保持白色),`silKeep(fn)` 延后任何东西,`silCut(fn)` 擦除(`fn(colour)` 用手递给它的颜色绘制)从而让底色透出来。把 `clioDance` 和 `bigType` 画在剪影调用*之后*,而不是内部:Clio 自带底色色的光环和镂空。

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

### 12.2 进入与离开剪影模式

- **`inkFlood(t0, t1, cx, cy, drawB, o)`**:`drawB(t)` 从笔尖 `(cx, cy)` 开始以硬边像素墨泛过整帧:一团带手指的本体、在先头部队之前落地的溅洒、一道白色的湿唇缘和边缘上的黑边。在 t0 之前什么都不画;从 t1 起 `drawB` 被整幅画出,所以把 **t1 放在强拍上**。`o.steps: n` 让它以 n 个硬步骤移动:样片卷是**每步一帧、10 步**泛上来(`t0 = t1 - 10 / FPS`),从笔尖拖出一道白色 `penTrail`,并在副歌的头两帧做反相(`invertFrame(t1, 2)`)。最后调用它,放在 `overlay()` 里,以便连菜单栏和 Dock 一起泛过。`o`:`block`(一个墨点像素的 px 数,4)、`seed`(溅洒的形状)、`edge`([唇缘, 边] 颜色)、`edgeW`、`ease`、`steps`、`drain: true`(走出去的方式:`drawB` 出现在一团被吸回笔尖的墨渍之外;样片卷以 10 步在强拍上排干,排干时做像素排序,落地时推近)。泛色的形状对每个笔尖位置只算一次(约 15 ms)并缓存;用 `warmUp`(§12.8)登记笔尖,让它在启动时就构建好。
- **`scanWipe(t0, t1, drawB, o)`**:`drawB` 以 4 px 扫描线条带替换整帧,交错进行(偶数带先向下扫,然后是奇数带),按 16 分音符步进,最新的带上有一道白色写头。`o`:`band`、`div`(4 = 16 分音符,0 = 连续)、`dir`('up')、`edge`(null:没有写头)。用于后副歌的底色翻转以及离开剪影模式。
- `scanFX(k, {color | from, edge})` 对已经画好的一帧做同样的事(FX.scan),例如一次擦到黑。
- 当一次泛色或擦除进行到中途,它会设置 `FX.wiping`(可读性审计会跳过这些帧:大字是故意被替换掉的)。

### 12.3 演员:clioDance、白笔和它的绳

**`clioDance(x, y, scale, t, o)`**:Clio 作为一个巨大的黑色舞者,画在她的单位网格上,再按整数 `scale` 做像素放大;`(x, y)` 是她双脚之间的着地点。她保留桌面模式下的身份:**带折角尾巴的对话气泡身体**(朝左下,和在桌面上一样;转身时侧对,劈叉时横对)、3-4 单位长的四肢、连指手套的手和靴子。站立时约 32 单位高:**scale 7 是主角(约 220 px,让画幅边缘裁掉她)**,4-5 是伴舞。底色色的一圈 **2 px 光环**(`rim`、`rimW`)让她在横穿黑色大字、板块或黑色画幅时仍然可读(在黑底翻转上她读成霓虹轮廓)。按拍压扁、随后拉伸(`squash`),脚下一条 3 px 地平线(`ground`)。姿势按每拍 8 个定格动画步骤动起来;来自 `DANCE_PHRASES` 的 2 小节乐句(绝不在连续两次用同一个姿势)按小节索引挑选,而音乐会覆盖它们:每次 crash 和 stab 都跳跃,在 "you" 上 `pointCam`,在 "pen" 上 `pointUp`,在 "do" 上劈叉(`cheer`)。

`DANCE_POSES`,每一个形状都不同,脸被涂黑:`bounce`(青蛙蹲)· `clap`(铅笔:挺直,双手在头顶相触)· `pointUp`(Fever:手臂斜指天空,拳头叉腰)· `pointCam`(YOU:身体前倾,一只巨大的连指手伸出画幅外)· `spin`(转身:侧对但保留面部,一只脚收起,手臂成一圈;每半拍转一次)· `jump`(跳跃)· `shimmy`(深倾,双臂成一条线)· `disco`(甩胯,指向下方)· `kick`(高侧踢,双臂成 T 形)· `vogue`(手举过头,双腿交叉)· `robot`(直角方块)· `cheer`(完全劈叉,V 形手臂)。`danceShapeTest()` 返回最接近的一对面部遮黑剪影及其像素差(目前是 clap/spin,.33;任何超过 .25 的都会读成不同的形状)。

`o`:`pose`(强制一个)配合 `p`(保持它的相位 0..1)、`field`、`ink`、`rim`(false 或一个颜色)、`rimW`(2)、`mouth`('sing' | 0..1 | `{open, shape}`)、`voice`、`eyes`、`face: false`(没有镂空)、`flip`、`steps`(8;0 = 平滑)、`squash`(true)、`ground`(true | 颜色 | false)、`shadow`(跳跃下方的一条带)、`lyric: false`(不用由词驱动的姿势)、`seed`。返回 `{x, y, w, h, hands, head, feet, pose}`。`dancePose(t, o)` 告诉你在不绘制的情况下的姿势。

**`pen(x, y, angle, scale, o)`**:写作者的钢笔,笔尖在 `(x, y)`,沿 `angle` 指向(0 = 右,PI/2 = 下),36.5 单位长:**在副歌里是 scale 4(146 px)或 5(182 px)**,桌面上是 3。纯 `#ffffff`,带 1 px 黑描边,没有排线(只有笔尖的缝),按画幅自己的像素绘制:在粗壮舞者和大字旁边那个精确的物体。在剪影模式下每次 kick 它都会**闪**一帧(轮廓外的一次白色泛光)。`o`:`color`、`ink`、`outline`(颜色或 false)、`flash`(默认:剪影模式下开)、`detail: true`(旧的接缝、笔帽环和笔夹线)、`t`。返回 `{tip, back, angle}`。

**`penCord(points, o)`**:从笔的尾端到写作者指针的那根长长的白绳,**3 px 白,带 1 px 黑边**(那条白色的耳机线)。它在锚点之间下垂(`sag`,每 100 px 跨距多少 px,22),随拍摆动(`swing` px,10),并且画成 `w` px 网格上的阶梯(3)。`o.outline`(false 为无)、`o.color`。**`penTrail(points, o)`**:同样的白色阶梯,走直线段:笔尖拖出的笔迹。样片卷的吊具(specimen.js):`penRig`(指针拿着绳,笔笔尖朝下悬挂,随拍摆动)和 `penBar`(笔水平横放在海报顶部,大字在它下面)。

**收尾。** render.mjs 的 ffmpeg 收尾(`vignette=PI/5` 加上 10% 的扫描线网格)会把平坦霓虹底色的四角压暗成李子色和橄榄色(四角约 45% 亮度),并让白笔离开中心处发灰。工具包无法撤销一个在它之后发生的乘法,所以它会问:`finishAt(t)`(`window.FINISH_AT`)在剪影模式下返回 `{vignette: false, scanlines: .05}`,其他情况下返回 `{vignette: true, scanlines: .1}`。**给 render.mjs 所有者的请求:** 逐帧读 `FINISH_AT(t)`,它要求时就关掉暗角(并把网格减半)。在那之前,把笔和主角词留在画幅中间附近。

### 12.4 bigType:巨型像素字

**`bigType(text, o)`**:把 Chicago 按其原生像素尺寸栅格化(大写高 9 px),每个字体像素都是一个精确的 sx x sy 方块,整数 4-24,于是大字在海报尺寸下保持方正清晰。`text`:一个字符串('\n' 堆叠)或一个行数组。

| opt | |
|---|---|
| `x`, `y`, `align` ('center' \| 'left' \| 'right'), `valign` ('middle' \| 'top' \| 'bottom') | 定位(默认居中) |
| `scale` (8) · `fit` (true = W,或 px) · `justify` (true \| px) · `fitH` (true = H,或 px) · `bleed` (px) · `min` / `max` (4 / 24) | `fit` 给每一行能放下宽度的最大 scale;**`justify`** 把每一行横向拉伸到正好那个宽度(先一个整数 x 倍率,再把整个字母加宽一档,最后用整像素间距):那个两端对齐的海报字块;`fitH` 把最大的行逐档降下来直到整叠放得下高度;`bleed` 让它比画幅更宽,这样大字只在**两侧**边缘被裁掉(字叠永远按高度拟合:绝不裁掉大写的顶部或底部;把 `bleed` 控制在不到一个字体像素宽,约 10 px,这样没有边缘字形会掉一笔) |
| `lead` (行间原生 px,2) · `track` · `stretch: [sx, sy]` | 整数 x / y 倍率 |
| `color` (黑) · `xor` (true \| 一块底色) · `invert` + `slab` + `pad` + `slabMode` · `outline` + `outlineW` · `shadow: [colour, dx, dy]` | `xor`:字母在它落到的所有地方把底色和黑对调(绝不要让它在菜单栏上跑:改为把菜单栏藏起来);`invert`:行背后的板块(底色的字在黑上,或白在黑上)。**所有板块都在任何字母之前绘制**,而 `pad`(原生 px,2)被钳制到与相邻行间距的一半,所以板块永远不会吃掉另一行。`slabMode`:`'line'`(每行一块板)、`'block'`(围住整个字块的一块)、`'bleed'`(从 x 0 到 W 的一条全宽板,盖住字块的行:没有多余的底色条) |
| `pass: 'slab' \| 'type'` · **`bigTypes([[text, o], ...])`** | 只画板块 / 只画字母;`bigTypes` 画多个字块,并把它们所有的板块先画完(主旋律里的 PEN 和 PAL) |
| `t` · `words`(一行歌词)· `ghost` | 每个词在它被唱出的起点出现,砸进来;文本的词与歌词行的词按字母匹配('PEN PAL' 从 "I'm just your pen pal," 取时间);`ghost`:未唱的词显示为 50% 抖动的幽灵大字(device 3) |
| `slam`(一个时间)· `stepIn: {t0, div: 4, enter}` | 整个字块以整数过冲 +3 +2 +1 0 落下 / 每 16 分音符一个字母,以 `'slam'`、`'drop'` 或 `'flash'` 进场。给被砸下的字块上下各留约 20 px,让过冲留在画幅内 |

返回 `{x, y, w, h, lines: [{x, y, w, h, sx, sy}], letters: [{ch, x, y, w, h, on}], slabs}`(把笔或 Clio 瞄准某个字母)。它画在画幅上的每一行都列在 `FX.typeRows` 里,drop 的像素排序会放过它们。

**`legibilityAudit(t0, t1, step = 1/FPS, o)`** 在不带 FX 的情况下逐帧绘制,并检查大字里的每个字形:`covered`(它落地之后被改动的像素占比)、`split`(不在其主导颜色里的像素占比)和 `vcrop`(跑出顶部或底部边缘的像素)。当 covered > .1、split > .1(`o.maxCovered`、`o.maxSplit`)或发生任何 vcrop 时判为失败;处于泛色或擦除中途的帧会被跳过(`o.wipes: true` 把它们算进来)。返回 `{frames, glyphs, worst, failures, bad: [{t, scene, ch, at, covered, split, vcrop}]}`。在页面里跑它(例如通过 puppeteer:`page.evaluate('legibilityAudit(1000, 1047)')`);风格样片卷以 0 失败通过。

### 12.5 硬拍 FX

每一个都会为某个重音时间 `at` 之后的那些帧设置 `FX` 字段(§10)(省略 `at`:本帧)。只用调色板里的颜色,按网格走。

| function | |
|---|---|
| `invertFrame(at, frames = 1)` | 整帧反相 |
| `splitPal(px = 2, at, frames = 3, [trail, lead])` | 用画幅自己的调色板做的 2 px 硬分裂:白色边缘拖在暗色形状后面,黑色边缘领在它们前面。剪影模式的分裂:霓虹底上不出现红蓝 |
| `rgbSplit(px = 2, at, frames = 3, dy = 0)` | 红在左、蓝在右;边缘吸附到纯色(桌面模式) |
| `pixelSort(rows = 14, length = 200, at, frames = 2)` | 一次 drop 的拖痕(大字所在的行被跳过) |
| `punch(at, x, y, steps)` | 在 (x, y) 处的一次整数倍推近,再逐级退出来(默认 3x 3x 2x 2x 2x 2x,每帧一级;给一个你仍须读出来的词用 `[2, 2]`) |
| `stepZoom(n, x, y)` · `posterize(levels \| palette)` · `scanFX(k, o)` | 那些原始效果 |
| **`beatFX(t, o)`** | 预设,由 EVENTS 驱动:**kick** -> **副歌的 4 个乐句强拍**上 1 帧反相(`isPhraseHit`:每个段落切成 4 个乐句;`o.kickEvery: 'bar'` 则每个强拍都做);**snare** -> 2 px 分裂 3 帧(剪影模式下用 `splitPal`,桌面模式或带 `o.rgb` 时用 `rgbSplit`);**crash** -> 2 帧像素排序拖痕,**只在 drop 上**(`isDrop`:落在段落起点或 `drop` 重音上的 crash;`o.anyCrash` 则全部),大字行除外。`o`:`kick` / `snare` / `crash: false` 跳过其中一个,`anywhere`(副歌之外也做 kick 反相),`split`(px),`stab: true`(在 `o.punchAt` 处的 stab 上推近),`clap: true`(2 px 抖动)。返回触发了的名字 |

`isDownbeat(t)`、`isPhraseHit(t)`、`isDrop(t)`、`inChorus(t)` 是它用的判断。`finishAt(t)`:§12.3。

### 12.6 一镜到底的摄影机

- **`frameInto(canvas, t, src, o)`**:把一整帧(桌面、场景、Dock、菜单栏、覆盖层、指针)渲染进一块画布:`src` = 已注册场景的名字、一个场景对象,或 `fn(t)`,场景 opts 放在 `o` 里(`era`、`desk`、`raw`、`menu`、`dock`、`screen`)。`screen` 场景会连它的黑边一起画在其历史屏幕内,和 main 画它的方式完全一致(所以从 screen 场景里下潜出来的画面与它之前的那一帧吻合)。这一帧的 FX 被丢弃;UI、CUR、FX、年代、VIEW 和 W x H 之后会被恢复。
- **`diveInto(t0, t1, px, py, drawOuter, drawInner, o)`**:像素下潜。以**恒定的对数速率**向外层画幅的像素 `(px, py)` 做最近邻缩放(scale = exp(k * u):它从第一帧就在动;8x 以下是非整数,以上是整数),那个像素滑向中心。这个像素是一个自身颜色的方形块(写作者的朱红句号);内层画幅从 3 px(`innerAt`)到 48 px(`revealAt`)渐显进它,作为一个从内层画幅中心裁出的方形窗口,用**盒平均加 Bayer 量化**缩小(`levels`,每通道 6 级,1-bit 年代是 2),绝不是最近邻缩小。一个由抖动朱红射线、行进的刻度线和 2 px 脉动标记(内层画幅自己的句号,`mark`)组成的十字准星把视线钉在它上面。当方块达到画幅高度时,内层画幅就在它内部 1:1;**在 t1(把它放在拍上)**两侧打开,伴随 1 帧反相和 3 帧调色板分裂(`hitFX: false` 跳过),内层画幅就是画幅。在 t0 之前它画外层画幅,t1 之后画内层:把它用在横跨整次下潜的 `raw` 场景里。`o`:`pw`(2:一个 2x2 句号)、`ease`(k -> u;`power` 仍然有效)、`anchor: false`、`color`、`outer` / `inner`(frameInto 的 opts)。每帧最多渲染两个画幅。
- **`pullBack(t0, t1, layers, o)`**:结尾的拉回,是倒着的下潜。`layers[0]` 是我们开始所在的那一帧,`layers[i] = {draw, px, py, pw, era}`,`(px, py)` 是第 i 层中承载第 i - 1 层的那个像素(在样片卷里,是写作者的朱红句号,在每个年代都在同一位置,因为窗口不动)。每一层的切换是啪地进入(两侧围绕中心方块合拢,一个 2 帧分裂)并以恒定对数速率拉远:把这些步骤放在整拍上。最后来一个黑底上的单个朱红点(`dot: false` 停在外层;`dotAt`、`dotColor`、`dotWeight`:点这一步占一层步骤的比例,.6)。让这个点保持半秒,不要更久。`ease` 塑造整个运动。
- **屏幕随历史生长。** `screenSize(t)` -> `{x, y, w, h, stage, name, bits, full, punch}`:那一刻居中的屏幕,像素从不缩放:1988 年是一体式 Mac 的 **512x342**,1:1 在黑底上(1-bit);从第一个 System 7 年代(副歌 1)起是 **576x352**('640x400',8-bit);从 Platinum 起是 **608x356**('640x480',16-bit);每次生长按 16 分音符在一拍内完成。在最后的转调上(HITS `keyChange`,否则 `reboot`,否则 chorus3 的起点)黑边在强拍上被**打掉**:2 帧反相加 2x 推近,然后黑边(黑色,内边缘有一条白色边框线)以 **4 个硬步骤**滑走,每 2 帧一步,伴随速度线和一次抖动;之后桌面就永久地占满 16:9 画幅(24-bit)。**`depthChips(x, y, w, h, bits)`** 把某个色深的调色板画成一条色片条(2 片、256 色里的 32 色、带状的色调、完整光谱):调色板每一级都看得见地长大。给一个场景 `screen: true`,main 就把这一切画在屏幕内,并把 `W` x `H` 设为屏幕的尺寸,所以一个按 `W`、`H` 和工具包默认值写的章节会原封不动地在 512x342 里布局。`SCREENS` 和 `screenKeys()` 保存进度表。在 `screen` 场景里,`FX.zoomAt` / `stepZoomAt` 用屏幕坐标(main 会平移它们);`snap()` 仍然复制整个画幅。对于一个全画幅场景,`overlay(() => letterbox(t))` 改为把它裁到屏幕。

### 12.7 桌面就是乐队

每一种打击乐声音都有一个你能看见的原因,而每件乐器都读 `data.js` 的 `EVENTS`,所以一个章节可以把整支乐队都拉进来。core.js 会规范化 EVENTS(每个条目变成 `[t, ...rest]`,排好序;非数组条目被忽略),而当 EVENTS 或某个核心通道缺失时,它从 BEATS 推导出一段替代律动(`EV_FALLBACK` 列出是哪些):每拍 kick,小节的 2 和 4 上 snare 和 clap(副歌),8 分音符上 hat,段落起点上 crash 和 stab,每个副歌前一小节上一条 riser,两条软驱贝斯线。

| core.js | |
|---|---|
| `evList(name)` · `evTimes(name)` | 条目 / 它们的时间 |
| `evLast(name, t)` · `evNext(name, t)` · `evIndex(name, t)` | 在 t 处或之前的最后一个条目、下一个、它的索引 |
| `evSince(name, t)` · `evFrames(name, t)` · `evPulse(name, t, sharp)` | 距上一次重音的秒数 / 整帧数(重音的第一帧上是 0);一个衰减的 1 |
| `evIn(name, t0, t1)` · `evNote(name, t)` · `evSpan(name, t)` | 某个范围内的条目;在 t 处正在响的 `[t, midi, dur]` 音符;覆盖 t 的 `[t0, t1]` 跨段(riser) |

**`bandGrid(x, y, w, h, o)`** 把乐队做成一台鼓机:每件乐器一个打击垫,围在加粗的 3 px 黑框里,左上角有 Chicago 标签(在图案之外):第一行是 **A:** 和 **B:** 软驱(带音符)以及 **KICK**,下面是 **SNARE · CLAP · CRASH · BELL**;每个垫在自己的重音上**砸下**(3 帧过冲)并**反相**。hat 用横贯中间的 4x Chicago 打出 `o.typed`('YOU KEEP THE PEN',每个 hat 一个键,每 2 小节重打一遍),而 riser 是底部一条粗壮的 12 px 条。乐器从 600 px 宽起按 scale 2 运行(以下用 scale 1)。`o.field`:剪影模式(垫子在底色上,**实心黑色乐器带霓虹镂空**;反相的垫是黑底上的底色)。`deskBand(x, y, o)` = 放在 400x210 机架里、scale 1 的 `bandGrid`。样片卷全画幅展示它,然后把它擦成青色。

那些乐器单独看(默认 1-bit;`o.ink` / `o.paper` 可以重新着色:`{ink: field, paper: black}` 就是剪影观感;`o.scale` 做像素放大,`o.t` 覆盖时间)。一件重音乐器的时间参数就是那次重音;省略它则用该通道的上一次重音:

| | 声音 | 你看到什么 |
|---|---|---|
| `floppyDrive(x, y, label, note, t, o)` | 贝斯(`floppyA`、`floppyB`) | 一台掀掉盖子的 3.5" 驱动器(100x84;`o.compact`:100x72,没有标签行):里面的盘、沿着丝杠滑到音高的读头(每个半音一格,`o.lo`..`o.hi` = midi 28-64)、音符响着时嗡嗡作响、指示灯亮着、音符名。`note`:一个通道或一个 midi 数字 -> `{midi, on, headX}` |
| `ejectDisk(x, y, t0, o)` | kick | 一台俯视的驱动器(76x58)把盘吐出来,标签端先出,并在那一拍里把它吞回去;驱动器会下陷一个像素 |
| `windowCloseZoom(x, y, w, h, t0, o)` | snare | 一个 1-bit 窗口,带实心图案的窗体,缩闭进它的图标(一圈粗的 `o.thick` px 描边和两圈细的拖尾,颜色是 `o.lineColor`),然后再放大回来;`o.title`、`o.icon`([x, y] 或 false)、`o.body(client)`、`o.solid: false`、`o.win: {…}`(改用年代自己的 `win()`) |
| `clickBurst(x, y, t0, o)` | clap | 手形指针点击,并**三圈同心方形环**(`o.ringW` 4 px 粗,`o.rings`)从热点迸出;`o.kind`('hand')、`o.scale`、`o.copies`、`o.pointer: false`、`o.color`。在打击垫里:一个实心的手剪影和一次黑色闪光(垫子的反相) |
| `typeLine(text, t0, t1, keystrokes, o)` | hat | 每一次按键(默认是 [t0, t1) 内的 hat 重音)多打出一个字符;最新按下的键反相弹出两帧。带 `o.x`、`o.y` 时它会绘制(`font`、`scale`、`color`、`paper`、`caret`)-> `{str, n, w}` |
| `trashCrumple(x, y, t0, o)` | crash | 清空废纸篓(52x56,它的标签在任何倍率下都画在盒子下方;`o.label: ''` 表示不画):盖子绕铰链翻开,桶身鼓起,三团纸(`o.wad` 颜色)蹦出来 |
| `progressRiser(t0, t1, o)` | riser | 一条按 16 分音符填充、在最后一拍抖动的条(`o.x, y, w, h, label, font, hold`;`o.idle`:两条 riser 之间的空条;默认跨段:覆盖 t 的那条 riser) |
| `bellRing(x, y, t0, midi, o)` | Writing Bell | 产品的铃铛图标摆动(配合 `o.paper`,双色),环状波纹散出(`o.ringColor`),一个音符按音高跃起 |

`noteName(midi)` -> 'E2'。

### 12.8 风格样片卷

`specimen.js` 把它停在 **1000 s**(超过视频末尾),46.5 s,每个镜头都跟着歌曲自己的时间(每个镜头借用一段歌曲时间,所以乐队、舞蹈和节拍 FX 播放的是真实的 EVENTS):
`flood in`(1 s:1988 桌面,笔在四分之一秒内落下,泛色以 10 个硬帧在强拍上完成,带一道白色拖痕)· `chorus`(6 s:PEN / PAL 作为海报,没有菜单栏,在回声上翻成整版板块;I'LL NEVER / HOLD / THE PEN. 两端对齐,一个窗口板块探进来;YOU SAY / WHERE I / LAND,有 scale-8 的主角 Clio,落在写作者点击的地方)· `who holds the pen`(两端对齐,每 16 分音符一个字母,笔水平横过顶部;YOU DO! 底色上的黑字,Clio 在劈叉,第二个 "you" 是一次全画幅黑色频闪)· `post-chorus`(扫描线翻成青柠,每拍一个新姿势)· `dive`(进入 1988 的朱红句号,从里面出来 1991,正落在拍上)· `pull-back`(2026 -> 2014 -> 2002 -> 1988 -> 一个点,每两拍一步,点保持半秒)· `band`(鼓机,擦成青色)· `screen`(512x342 1-bit -> 640x400 256 色 -> 640x480 数千色 -> 打掉黑边成 16:9)· `type`(两端对齐 + 侧向出血,PEN 压在 PAL 上,一个砸下来的 YOU DO!,幽灵词)· `fx` · `dance`(每个姿势;最后两秒脸关掉:形状测试)· `flood out`(底色以 10 步排干进笔尖,做像素排序,落在活的 2002 桌面上)。`window.STYLE_REEL.shots` 列出每个镜头的起点。`node render.mjs sheet 1000 1046.5 0.25 build/style-sheet.png`;在预览里,`?style` 从 0 播放它。用 `legibilityAudit(1000, 1046.5)` 检查它(0 失败),也按 320x180 看一眼(把样表缩到一半):每一帧的主体都应该在四分之一秒里读得出来。

**预热。** `warmUp(fn)` 登记一个建缓存的任务;main 在启动时调用一次 `styleWarm()`,它会跑这些任务并构建每个舞蹈姿势的每个步骤,这样一次泛色或一个姿势的第一帧就不会在预览里卡顿(登记每个 `inkFlood` 笔尖:`warmUp(() => _floodMap(x, y, 4, seed))`,就像样片卷做的那样)。

预算:样片卷平均每帧约 5 ms(低于 6 ms 的规则);一个副歌帧约 5 ms,一次下潜或拉回帧约 7 ms(渲染两个画幅再加上盒平均缩略图),一个泛色帧约 10 ms。`renderCheck` 里偶发的单帧尖峰(50-250 ms)是垃圾回收,不是绘制:那一帧本身重绘在 10 ms 以内。

## 13. 3D 舞台(stage3d.js):three.js,回到硬像素

给副歌、桥段隧道和结尾拉回用的伪 3D。在一台离屏的 640x360 画布上共用一台 `THREE.WebGLRenderer`(关闭抗锯齿、`preserveDrawingBuffer`、像素比 1)绘制一个 three.js 场景;`render3d` 把每个像素读回来,**量化**到当前调色板,再以最近邻画进画幅。结果就是影片自己的材质:精确的颜色原样通过,任何介于两者之间的东西(一次 mip 平均、一条光照带)变成**调色板里最近的两个颜色**的 4x4 Bayer 混合(绝不用第三种颜色:被压暗的品红抖动成品红/黑,绝不洒出白色)。

**规则。** 一个舞台只构建一次(`stage3d(key, build)`,按 key 缓存:新内容就用新 key),而每个变换、颜色和可见性都每帧从 `t` 设定。不要时钟、不要动画循环、不要 `Math.random`:任何顺序下同一帧都相同(已验证)。材质是扁平无光照的(`mat3d`);光是以逐面颜色烘进去的 2-3 条硬**光带**。镂空、淡出、幽灵和雾都是**网屏**式 Bayer 丢弃(着色器里的 `s3dTh`,与 2D 工具包的 `BAYER4` 对齐),绝不是 alpha 混合。`THREE.ColorManagement` 关闭,输出是线性的:一个纹素出来的颜色和 2D 工具包画进去的颜色一模一样。

**加载。** three 只有 ESM(0.186.1,`package.json`)。`index.html` 在一个模块脚本里导入 `node_modules/three/build/three.module.js`;模块在 DOMContentLoaded 之前运行,所以 main.js 等 `DOM_READY`,然后 `init3d()`,然后设置 `READY`。如果 three 没有加载,渲染会以 `READY_ERROR` 停止(render.mjs 和 flashcheck.mjs 会报告它);预览播放 2D 影片,HUD 显示 `3D stage off`。在 `file://` 下 Chromium 只会带着 `--allow-file-access-from-files` 导入模块(render.mjs 会传它;预览请用 `node tools/serve.mjs`)。render.mjs 在 SwiftShader 上跑 WebGL(`--use-angle=swiftshader --enable-unsafe-swiftshader`),并让 2D 画布留在 CPU 上(`--disable-accelerated-2d-canvas --disable-gpu-rasterization`:在 SwiftShader 上启用加速时,工具包里每次 `getImageData` 要贵约 15 倍,每帧 4.7 ms 变成 72 ms)。带这些标志时 2D 帧与之前逐字节相同。

| function | |
|---|---|
| `stage3d(key, build)` | 舞台 `{key, scene, cam, o, pal, extra, bg}`,由 `build(st)` 构建一次;`st.o` 存放你的对象。相机:fov 30,near 4,far 40000 |
| `render3d(st, o)` | 通过 `st.cam` 渲染、读回、量化、绘制。`o.div`(1;2、4、5、8:按这个分数渲染,再按像素放大画回:更粗,每级快约 4 倍)、`o.w` x `o.h`(屏幕,`W` x `H`)、`o.x`、`o.y`、`o.pal`(一串颜色;默认 `st.pal`,否则用舞台自己的颜色)、`o.bayer`(true)、`o.bg`(清屏颜色:`st.bg`、黑;`null` = 透明,只有 3D 像素落下) |
| `project3d(st, [x, y, z], o)` | 一个 3D 点的画幅像素(在相机设定之后):把 2D 的东西(一块歌词底板、笔的绳、一次点击)钉到 3D 世界里 |
| `mat3d(o)` | `map`、`color`(与 map 和顶点色相乘)、`vc`(顶点色)、`fade`(0..1)、`fog`(false)、`side`('double' / 'back')、`solid`(没有网屏)、`auto`(一个网屏材质配一个实心孪生:当网格不透明且比雾更近时,render3d 就画那个孪生) |
| `fade3d(obj, k)` · `matOf(mesh)` | 网屏淡出(0 实心,.5 幽灵,1 消失)· 要着色或淡出的那个材质(不是它的实心孪生) |
| `tex3d(key, w, h, draw, o)` | 把一次 2D 工具包绘制做成 `CanvasTexture`(按 key 缓存;`draw(canvas)` 在上面用 `ctx` 运行)。放大永远是 Nearest。`o.mip`:盒平均的 mip 层级(NearestMipmapNearest),给那些缩到远低于 1:1 的东西用,量化器会把它们变成像下潜缩略图那样的抖动(层级在 1/2、1/4 … 处跳变)。`o.live`:一个签名;只在它变化时重绘并重新上传 |
| `deskTex(key, t, src, o)` | 经由 `frameInto` 取来的一整帧(一个场景名,或带 `o.era` 的 `fn(t)` …),在 `t` 处,只取一次(`o.live`:每帧,约 5 ms 加上上传) |
| `card3d(tex, w, h, o)` | 一张双面卡片,在图像透明的区域镂空(`o.base`:立在它的下边缘上;`o.solid` 用于不透明的绘制) |
| `bandGeo(boxes)` · `band3(c, front, back)` | 很多盒子作为一个顶点色几何体(一次绘制调用):`{w, h, d, pos, ry, cols: [+x, -x, +y, -y, +z, -z]}`,某个颜色为 null 就把那面去掉;`band3` = 侧面压暗 .35,顶底 .2 |
| `voxGeo(mask, w, h, d, ox, oy, lv)` · `voxGlyph(ch, font, d)` | 把一个 1-bit 掩码做成体素柱(只留露出的面,合并连续段),顶点色 = 材质颜色的光照级别 `LV3` = [前面 0, 后面 0, 侧面 .5, 顶底 .75]:底色上是黑板块,侧面半暗和四分之一暗 |
| `voxText(lines, o)` · `voxColor(v, c)` | 用 bigType 放大的同一套 Chicago 位图做成的巨型 3D 大字:每个字母一个网格(一次绘制),`o.size`(每字体 px 多少世界单位,10)、`o.depth`(字体 px,3)、`o.lead`、`o.align`;返回 `{group, letters: [{mesh, ch, li, ci, n, base}], chars, w, h}` |
| `slam3d(L, t, tIn, o)` | 一个字母在 `tIn` 处沿 z 以硬帧步砸进来(`SLAM3`,从 `o.from` = 600 单位处朝相机,过冲一帧);在那之前隐藏,或者 `o.ghost`:50% 网屏幽灵(device 3) |
| `dancer3d(st, key, t, o)` | Clio:`mode: 'voxel'`(把她 1-bit 的单位网格精灵挤出,`o.depth` 4,后面留一圈 1 单位的底色边,让她的光环和面部镂空读得出来;几何体按位图的散列缓存)或 `'card'`(一块广告牌,`o.px` = 每单位 3 px,只在姿势变化时上传);`o.pos` [x, z]、`o.size`(8)、`o.yaw`(默认:面向相机)、任何 `clioDance` 选项 |
| `face3d(obj, cam, yaw)` | 把一个物体转向相机(保持竖直) |
| `cam3d(t, keys, o)` · `aim3d(cam, s)` · `orbit3d(c, r, a, h)` | 相机吊具:keys 为 `[[t, {pos, look, fov, roll} 或 orbit3d(...), ease], ...]`,缺失的字段沿用上一个;两个 orbit 关键帧就绕着中心转。缓动(朝某个关键帧运动的方式):`'hard'`(默认,四次方)、`'snap'`、`'whip'`(所有运动都放在中间的帧里)、`'cut'`、`'lin'`、`'step'`(按 16 分音符保持)或一个函数。推轨 = 改 `r`,环绕 = `a`,升降 = `h`,翻滚 = `roll`。`o.fps`(12-30):定格动画采样 |
| `whip3d(t, keys, o)` | 当相机转得快(每帧 > .035 rad)时画幅拖糊:一次硬 `FX.pixelSort`,大字行保留 |

### 13.1 预设

每一个都在首次使用时构建自己的舞台(`o.key`),从 `t` 设定一切,渲染并合成。之后把 2D 画在上面:歌词(带底板的 `kara`)、笔的绳(`project3d`)、`beatFX`。

- **`corridor3d(t, o)`:窗户走廊。** 各年代的桌面(`o.desk` 在每个年代按 `o.at` 绘制,或 `o.tex(era, i)`)作为 24 单位的板块,交替立在一个 z 向隧道的左右(`o.gap` 900、`o.side` 300、`o.turn` .5),每半个间隔一圈白色矩形环(`o.ring`),远处的面板用 Bayer 雾渐显进来(`o.fog`)。默认从 `o.t0` 飞行:每 `o.step`(.5 s)过一个面板,保持 `o.hold`(.5)并缓慢爬行、±.05 翻滚,然后甩到下一个(带拖糊);或者用你自己的 `o.cam` 关键帧。返回 `{stage, i, cam}`(`i`:视野里的面板)。
- **`silStage3d(t, o)`:剪影舞台。** 底色就是背景(清屏颜色)和地板,由一张 1 px 黑网格(`o.grid` 120)统治,越靠地平线越消散;`o.type` 是黑色体素大字块(`text`、`words` = 一行歌词:每个词在它被唱出的起点砸下;或者 `stepIn {t0, div}`、`at`;`show` [t0, t1]、`size`、`depth`、`pos`(y = 字块底部)、`rot`、`align`、`ghost`),`o.dancers`(带 `pos`、`size`、`mode`、`show` 的 `dancer3d` 条目),`o.pen`(白笔作为一张卡片:`pos` = 它的尾端、`angle`、`scale`、`size`),`o.cam`。调色板:底色、黑、白。
- **`nestedDesks3d(t, t0, t1, o)`:嵌套桌面。** `o.layers` 内层在前(我们开始所在的那一帧,例如 2026):`{era, draw, at, live, win}`;第 i + 1 层的桌面把第 i 层托在一台显示器上,它的屏幕就是它的 `win`(在那个桌面自己的 640x360 里是 16:9,默认 `NEST_WIN` = (360, 176, 192, 108);桌面绕着它画一个窗口,里面是黑)。显示器作为盒子从桌面里凸出来(`o.depth` 36、`o.bezel` 5,年代框色按光带画)。相机以恒定对数速率拉远(`o.ease` 塑造它),在层与层之间向上摆到 `o.swing`(.12 rad),在每个整数层处则正对着,那时那个桌面正好是 1:1(所以在那里切到 2D 桌面是无缝的);每次落地一次 2 帧调色板分裂。`o.dot`:最外层桌面缩到写作者的朱红 2x2 点(`o.dotWeight` .6 个步骤)。返回 `{stage, u, layer}`。

### 13.2 3D 样片卷和预算

specimen.js 把 **3D 样片卷停在 1300 s**(在工具包样片卷之后,后者跑 1100-1245.5):`corridor`(6 s,桥段的 104-110:十二个桌面,各半拍,年份砸在一块底板上)、`silhouette stage`(6 s,副歌 1 的 36-42:PEN PAL、I'LL NEVER HOLD THE PEN.、YOU SAY WHERE I LAND,作为体素板块落在它们各自的词上,一个体素舞者和两个卡片舞者,白笔挂在绳上,beatFX)、`who holds the pen`(4 s,47.75-51.75:每 16 分音符一个字母,落地前是幽灵,然后是 YOU DO!)、`nested desks`(5 s:2026 一路倒回十二个年代直到那个点)。`node render.mjs sheet 1300 1321 .25 build/s3d-sheet.png`;`?s3d` 在预览里从 0 播放它。

**预算:一个 3D 帧平均 < 25 ms**(SwiftShader 是软件;2D 帧仍然守 6 ms 的规则)。在样片卷上、机器的 4 个 CPU 被共享(负载 6-9)时测得:corridor ~13 ms,silhouette stage ~21 ms,who ~14 ms,nested ~16 ms;一个舞台的第一帧会尖起来(着色器编译、纹理构建:一次可能高达 ~2 s;如果一次预览卡顿要紧,就用 `warmUp(() => ...)` 预建)。几乎全都是 SwiftShader 的光栅化(`readPixels` 要等它);量化器约 2 ms。

**坑(实测)。**(1) 一次绘制调用约 .13 ms:把所有不动的东西合并进一个 `bandGeo`,把一个体素字母或舞者画成一个网格(光照级别放在顶点色里,而不是 4 个材质)。(2) 网屏让光栅化成本翻倍(一个可以 discard 的着色器会破坏提前深度剔除):在任何不会有 discard 的地方用 `solid` 或 `auto` 材质。(3) 一端在相机后面的线段根本不会被画:把长线拆成短段(地板网格是每格一段)。(4) 一整屏的带纹理像素层约 5 ms;背景应该是清屏颜色。(5) 只有当舞台在 (0, 0) 处全画幅渲染且 `div` 为 1 时,Bayer 阈值才与画幅对齐。(6) 一个舞台的调色板在它第一次渲染时被采集一次,来自它的纹理和颜色(全都精确通过;用得最多的 2047 个是抖动候选):一个 live 纹理后来的颜色会被抖动,所以给带 live 绘制的舞台一个显式的 `pal`。(7) key 负责构建舞台:后续调用的 `o` 只移动预设每帧设置的东西(相机、砸入、可见性、颜色)。
