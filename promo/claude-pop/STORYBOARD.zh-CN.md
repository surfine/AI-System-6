<!-- canonical-source: promo/claude-pop/STORYBOARD.md -->
<!-- source-sha256: 336180964d8c871a53f1cf3b5717b6b6495d6cd2b6eb688292544fa259082c43 -->
> 英文版为准 / 仅供人类参考

# 笔友:分镜表(修订 2)

一个长镜头,154.0 s 的歌曲加上 3.0 s 保持的尾巴,640x360,由十二个章节文件绘制。BRIEF.md 是契约,VISION.md 是品味,SONG.md 是歌曲,TOOLKIT.md 是工具。本文件是镜头清单和接缝。下面每一个时间都来自 `data/data.js`(这里引出来是为了让你能自己核对;永远不要把某个时间重新敲进代码)。

## 0. 怎么读这份文件

- §1 立意、角色阵容、招牌动作、道具、颜色与年代计划。§2 摄影机:镜头、每一次下潜、泛色、排干、拉回。§3 乐队。§4 主场桌面:每个章节逐字照抄的一段片段;十二个文件就是这样画出同一张桌面的。§5 十二个章节,每个都带一张镜头表。§6 每个边界上的交接状态,以及让它们无缝的机制。§7 逐个记录到帧的特殊时刻。§8 软盘预算。§9 规则与检查清单。§10 一句话说清拆分。§11 修订日志(评论者要求了什么、改了什么、拒绝了什么以及为什么)。
- 歌词引用读作 `id "word"@seconds`(id 和时间来自 `LYRICS`);重音读作 `hit@seconds`(来自 `HITS`)。屏幕坐标位于历史屏幕内部(当 `screen: true` 的场景绘制时,屏幕是 `W` x `H`);画幅坐标(640x360)标为 `_F`。屏幕偏移在 512x342 时是 (64, 9),在 576x352 时是 (32, 4),在 608x356 时是 (16, 2),在 128.0 黑边被打掉之后是 (0, 0)。
- 本文件中 "KB" 一律指 1024 字节。

## 1. 立意

一个合成的声音在调上、带着感情地唱:她永远不会成为你的声音,而整台计算机都听她的。影片是一段关于 AI System 6 的、不间断的录屏:它从一个像素开始,拉远成一台 1-bit 的 Macintosh,此后永不切换。每一段主歌都是运转中的写作台,通过一个 LENS(镜头)观看,它以 2x 在包袱之间跳跃(密集、不动声色,每一句歌词都是一个对话框、一张列表、一块硬盘、一个印章);每一段副歌都把桌面泛成一片扁平的霓虹底色,在那里 AI Clio 是一个黑色的跳舞剪影,做一个观众能跟着模仿的招牌动作,钩子以巨型像素大字砸进来,而屏幕上唯一的白色东西是写作者那根系在长白绳上的笔。三段副歌逐级长大:一个舞者,然后一群人,然后是一排十二人、分别穿着十二个年代。摄影机只朝一个方向移动:进入像素。在每段副歌的结尾,它都会潜进一个 "You do!" 指向的像素(感叹号的点、Clio 的眼睛、被抛出的笔上那滴墨),而桌面的下一个年代早已在那个像素里面;桥段在十二秒里通过写作者的句号下潜十二次,吟唱的每一年对应一个年代,在甩镜头之前把每个年代保持一拍;结尾随着一个又一个动词穿过历史拉回 1988,写作者按下 Return 弹出最后一个和弦,而 AI 的最后一句话("This song is temporary.")只因为写作者点了 Save 才留存下来。然后 CRT 坍缩成一个点,那个点落下成为 "You may now write." 的句号。

### 角色阵容

| 谁 | 是什么 | 桌面模式 | 剪影模式 |
|---|---|---|---|
| **写作者** | 指针(箭头;书写时是朱红色的 I 形光标) | `CUR` 在它的家 (300, 24),除非正在动作;它拿着那根系绳的白笔(scale 1,垂在指针下方 22 px);指针、绳和笔在任何包袱窗口之后重绘,所以从来没有东西遮住笔 | 在画幅顶部 (W-56, 6),绳向下垂到笔(scale 4,随拍摆动,`penRig`) |
| **Clio** | 那个 AI、歌手、一个对话气泡生物 | `clio(286, 196, {scale: 3, mouth: 'sing', expr: 'sing'})`,站在她自己的窗口 ClioTalk 旁边;在她的气泡里是 scale 1 | `clioDance`:主角 scale 7,伴舞 5,排成一行时 3;黑色,光环是底色色;她嘴部的镂空唱出每一个字;**每一句 "pen pal" 她都做招牌动作**(见下) |
| **那支白笔** | 写作者的笔,剪影模式下唯一白色的物体 | 挂在指针下方,36 px,1 px 黑描边;**在它的词 "pen"@3.0 上登场**(§5 ch01) | 146 px,每次 kick 都闪光,每个 "pen" 铃音都荡出环;在后副歌里它是指挥 la-la 的弹跳笔;143.5 时它被朝镜头抛出 |
| **那一帮** | 十二个复制的合唱队 | 十二个 scale 1 的 Clio 沿底边走;十二个指针盖印 | 副歌 1:没有(只有一个舞者);副歌 2:十二个 scale 2 的剪影,在两个回声上都做招牌动作;副歌 3:**那一排合唱队**,十二个 scale 3 的舞者排成一行,每个戴一个年代的帽子;副歌 3 每次 clap 都有十二个指针复制 |
| **ClioTalk** | 聊天本身是一个应用 | 她的窗口;她的话是在一块**临时底板**上的**实心**字(50% 抖动、蚂蚁线边框、一个 TEMPORARY 标签),直到写作者把它们留下,那时底板变成纯白、蚂蚁线停止 | 一块黑板,只在它本身就是包袱的地方用(只读提示那处) |

**招牌动作**(大众可以模仿的东西;它覆盖短语选择器,`lyric: false` 外加一个强制的 `pose`,通过每个剪影章节都照抄的一个本地 `sigPose(t)`):

| 被唱的词 | 动作 | 工具包 |
|---|---|---|
| "pen"(每一个主唱和和声的 "pen",每一个 "(pen" 回声) | 涂抹:手臂沿对角线举起,连指手在半拍内在空中写出三条整像素的之字形 | `pose: 'pointUp', p: prog(t, w.start, w.end)` + 一个本地 `scribble(hand, k)`:从连指手画出三条 8 px 的之字笔画(黑色,底色色光环),每 16 分音符一条 |
| "pal"(每个 "pal",每个 "pal)") | 挥手:直对镜头,巨大的连指手被画幅裁掉 | `pose: 'pointCam'` |
| "You"("You do!" 的每个 "You") | 指点:指着观众,连指手出了画幅 | `pose: 'pointCam', p: .5`(保持) |
| "do!" | 指笔:向上指那支白笔 | `pose: 'pointUp', p: 1`(保持,不涂抹) |
| crash 和 stab | 星星跳(工具包自己的覆盖保持不变) | `jump` |

这个动作在每段副歌里完全相同;只有舞者数量变化(1 → 2 + 12 → 12)。它在副歌 1 之前就被种下:在引子的 cut 上(4.75、5.25、6.75、7.25…)桌面上的 Clio(scale 3)用她的嘴的 chop 模仿它,配 `pose: 'point', point: 'up'` 加三条之字形对应 "PEN",以及 `pose: 'wave'` 对应 "PAL"(§5 ch01)。

### 反复出现的道具

1. **Review Desk 的镜头提示 "Sounds like you."** 在菜单栏的右侧槽位(`UI.menu.prop`,`propW: 128`)。那是产品自己的话,没有数字(Review Desk 说自己 "Not a score.")。静止时它读作 `Sounds like you.`;每当 Clio 试图把一行唱出来的话放到只属于写作者去写的地方,它就翻到提示的另一半 `Sounds like a mouthpiece.`,抖动 ±1 px,并在 [OK] 上弹回 `Sounds like you.`:"Not mine."(27.25-27.75)、"whole computer"(62.5-62.75)、breakdown 里的模型行(125.25-125.5)。它被**教一次**,而且教得很**大**:27.25 时镜头在槽位翻转的同时 4x 推近到它上面(§5 ch02)。在剪影模式下它不存在;副歌的道具是只读提示(下一个)。
2. **只读提示**,产品里真实的那句话,作为 ClioTalk 的目标选择器理由(不是一个模态框):`The drafting manuscript is read-only; use the current Section Draft instead.` 在桌面模式下它是 ClioTalk 的一行提示,配着 Manuscript 的状态条 `Read-only · edit in Section Drafts` 闪烁;在剪影模式下它是一块**黑板**,那句话用底色色镂出,外加一个 [OK] 按钮,在每个唱到 "pen." 的副歌上砸进来,那里 Clio 试图在 "hold" 上用上它。它会**升级**:副歌 1 一块(39.5),然后两块错位(47.5);副歌 2 四块以窗口拖影方式级联(87.5),然后八块(95.5);副歌 3 没有:她不再试了,而它的缺席就是回报。
3. **两张软盘** `2,902,645 / 2,949,120 B`:YOU DO! 的 riser 条([50,52]、[98,100]、[142,144])**就是**那张两张软盘的条:沿底部一条黑条,一个软盘图标和抠出来的字节数,按 16 分音符填充并在 98.4% 处**停住**,差一格不满,三次(观众半懂);完整释放闸门窗口在 "Two floppies. It fits."(120.25),那里播放贝斯的两台驱动器把盘弹进它,计数走到 1("It fits." 兑现了那个 98.4%);它的两条 Disk 条就是进入重启的转速上升条(126-128)。片尾卡复用这个计量表来称影片自己的源代码(§7.11)。
4. **One More Tune 的第十一轨。** 那张白标唱片是每个后副歌里 la-la 大字背后的一张黑色圆盘,只有它的第十一道纹在 riff 音符上脉动;唱臂在 52.0 落在第十一道纹上。测验卡只写着 "Track 11 · Name the ad."(54.0)和 "Not in the deck."(55.0)。在结尾里唱片骑进覆盖层,它的标签是 "11 · PEN PAL · AI SYSTEM 6",而在 "Export it."@147.0 时标签盖下 "This one." 答案就是这部影片;没有单独的卡片。
5. **邮戳。** 那一帮的 "(PEN PAL!)" 是笔友通信:一个黑色圆形橡皮戳**邮戳**(r 72,两条注销杠)砸到画幅上,上面用底色色抠出 `PEN PAL · <year>`,并且沿画幅边缘为回声的那半秒扣上一圈航空邮件边框(一条斜向像素条纹,底色色与黑,8 px)。年份就是那一刻的年代,于是在一个没有界面装饰的世界里年代也看得见:`· 1991`(37.25, 45.25)、`· 2009`(85.25)、`· 2011`(93.25)、`· 2026`(129.25, 137.25)。

从 SONG §6 故意砍掉的:菜单栏里的 Route 条(主歌 1 的 Route **窗口**就是那条路线,而一条 512 px 的菜单栏在镜头提示旁边放不下八个站点)、桥段里的 Control Panel 外观列表(隧道的保持让每个年代整体呈现),以及 `VOICE: YOURS 100%`(被 Review Desk 的真实措辞取代)。VISION 让歌赢;这里画面赢,这一行就是在说明这一点。

### 颜色与模式计划

| 模式 | 哪里 | 观感 |
|---|---|---|
| 桌面 | 启动、引子、主歌 1、pre 1(1988 1-bit);主歌 2(Aqua)、pre 2(Tiger);桥段隧道(全部十二个);116-128 反相的 1988 桌面(黑底白字);148-157(1988,全画幅) | 那个年代的桌面、指针、桌面上的 Clio、作为桌面物体的乐队,都通过 LENS 观看(§2);Clio 的话是实心字,在临时底板上;写作者的话是白底实心字;只用一种颜色:朱红 `#ff5a36`,只给写作者用(句号、I 形光标、KEEP、打出的 PEN.、Save 圆环) |
| 剪影 | 副歌 1 **品红**(1991)→ post 1 **青柠**(1999);副歌 2 **青柠**(2009,2011 由邮戳表明)→ post 2 **品红**(2014);副歌 3 **青**(2026)→ 结尾 144-148 **品红**(2026,一路拉回经过 2014、2009、2002 到 1988) | 一片平坦底色(`fieldAt(t)`,style.js 里的 `FIELD_OF`),其他一切都是纯黑,大字,Clio 跳舞,那支白笔。画幅预算:大字、**一个**舞者组、笔与绳,以及至多**一个**道具(提示级联、邮戳、两张软盘条)。副歌里没有 `slabWindow`:它在剪影里什么也说明不了 |

进入剪影模式:墨水泛上副歌强拍,分 10 个单帧步骤(35.833→36 从纸上的笔尖;83.833→84 从盖在纸上的邮戳;127.833→128 从笔尖,带那记 punch)。副歌 → 后副歌:最后三个 16 分音符里一次甩镜头下潜。离开剪影模式:排干,10 步落在强拍上(59.833→60、103.833→104);结尾则通过句号拉回离开(144→148)。

### 年代计划(跟随 data.js 里的 `ERAS`)和不断长大的屏幕

| 时间 | 年代 | 屏幕(`screenSize`) | 怎么来的 |
|---|---|---|---|
| 0-36 | 1988 System 6 | 512x342,1-bit,黑边 | 启动拉回;3.5 时的光栅擦除 |
| 36 | 1991 System 7 | 在 36.0-36.5 内分 4 步长到 576x352(8-bit) | 在品红泛色之下:底色以硬步骤变宽;邮戳写着 1991 |
| 52 | 1999 Platinum | 在 52.0-52.5 内长到 608x356(16-bit) | 在第一次下潜里面 |
| 60 / 76 | 2002 Aqua / 2005 Tiger | 608x356 | 排干落在 Aqua 上;Tiger 在 76 的 stab 上换皮(`morph: .35, 'wipe'`) |
| 84 / 92 / 100 | 2009 Snow Leopard / 2011 Lion / 2014 Yosemite | 608x356 | 青柠泛色(邮戳是 2009);和声孪生体在 92 的 stab 上到来,下一个邮戳写着 2011;第二次下潜落在 Yosemite |
| 104-116 | 全部十二个,每秒一个(1988、1991、1995、1998、1999、2002、2005、2009、2011、2014、2020、2026) | 608x356(屏幕永不缩小) | 隧道:保持一拍,甩一拍,从 2009 起加速 |
| 116-128 | 1988 反相(负片) | 608x356;边框反相成白色 | 缩略图总览、翻页书、breakdown |
| 128 | 2026 Liquid Glass | **打掉黑边成 640x360**:2 帧反相配一次 2x 推近,黑边以 4 个硬步骤滑走 | 青色泛色加转调;2026 桌面在 LAND 条(133-134)上以 25% 抖动透过青色显现:玻璃是半透明的 |
| 144-148 | 2026 → 2014 → 2009 → 2002 → 1988 | 640x360 | 拉回,每个吟唱动词一层 |
| 148-157 | 1988 System 6,正片,全画幅 | 640x360 | 静止桌面上 "It was always your voice.",Return,Save 对话框,片尾卡在歌曲之后保持 3 s |

## 2. 一镜到底的摄影机计划

每一次摄影机运动都是五件事之一:LENS(桌面模式),或者四个工具包调用之一(`inkFlood`、`diveInto`、`pullBack`、`scanWipe`),永远在一个 `raw: true` 的全画幅场景里,它的内层和外层画幅来自带 `screen: true` 的 `frameInto`(这样黑边与 main 的一致)。章节边界就落在这些运动上,而**拥有**该运动的章节按**名字**渲染邻居的第一个场景(§6)。

### 2.1 LENS(每一个桌面模式场景)

在 85% 的时长里锁定不动的 1x 读起来像一段带擦除的录屏,而在 640x360 里的 512x342 屏幕上放 9 px 的 Geneva,在手机上根本读不出来。所以桌面模式通过一个跟随光标的镜头观看,这是产品片里 zoom-to-cursor 的惯用手法,用硬像素来做:一次整数 `FX.stepZoom` 裁剪(2x = 画幅上一个 320x180 的窗口,3x = 213x120,4x = 160x90),以写作者的指针或那一句的包袱热点为中心。它**只在拍上重新定位**,以整像素为步长,没有平滑(`stepZoom` 在画幅画完之后应用,所以其他东西都不变)。

```js
// lens(t, keys): keys = [[t, x, y, n], ...] in SCREEN coordinates (main shifts stepZoomAt for screen scenes).
// The last key at or before t wins; n = 1 means 1x (no zoom). Call it last in the scene, after everything is drawn.
function lens(t, keys) { let k = null; for (const q of keys) if (q[0] <= t) k = q; if (k && k[3] > 1) stepZoom(k[3], k[1], k[2]); return k; }
```

规则:(1) 关键帧落在拍上,或落在推动视线的那个被唱出的词上,绝不在中间;(2) 那一刻的歌词底板以及它所点名的包袱都在裁剪之内(章节的缩略图总览能证明这一点);(3) 主歌以 2x 播放,在包袱之间跳(Route 项 → 软驱槽 → Searcher → Scrapbook → 提示);预副歌收紧到 3x 对准正在长大的笔,并对准 HAND 重音(34.75, 82.75)用 4x,而无伴奏的起句把 4x 保持在下降的笔尖上;(4) 泛色场景从 1x 开始:从 4x 释放到 1x 就是泛色的第一帧,于是副歌炸开成整幅画幅;(5) 桥段的保持、缩略图总览、breakdown 和结尾都是 1x,除非某一行另有说明;(6) 菜单栏的镜头提示和那些驱动器在该登场时进入画幅(主歌开头、"Feed the floppy"、"Not mine."、breakdown),而不是整段主歌都占着。每张桌面表的 Camera 列按 `n× (x, y)` 列出镜头关键帧。

### 2.2 那些运动

| 时间 | 运动 | 从 → 到 | 像素 | 调用 |
|---|---|---|---|---|
| 0.0→2.25 | 开场拉回,时间反着走 | 一个白点 → 黑底上单独的**反相** Manuscript 窗口(1988,512x342) | "fills" 之后的那个白色句号,在从第 0 帧起每一帧的 `PERIOD_F` = (223, 146) 处(点永不移动;窗口绕着它长大) | `pullBack(0.5, 2.25, [negMs], {t: 2.75 - t, dotAt: PERIOD_F, dotColor: C.white, dotWeight: .5, anchor: false})`,第 0 层 `{draw: negMs, px: 223, py: 146, pw: 2}`;在窗口自己的 2x2 句号接手之前,宿主点是 1x1(工具包的);**从 2.25 起直接在 1:1 画 `negMs`**(工具包只在下潜的 t1 打开两侧,没有 k = 0 的揭示),它有自己的两侧展开揭示:`invertFrame(2.25, 1); splitPal(2, 2.25, 3, [C.white, C.black])` |
| 3.5→4.0 | 光栅擦除 | 负片 → 正片的 1988 桌面 | — | `scanWipe(3.5, 4.0, tt => ctx.drawImage(frameInto(B, tt, 'ch01 drop'), 0, 0), {band: 4})`(`drawB` **必须画在**当前 ctx 上:只用 `frameInto` 只会返回一块画布,什么也擦不进来) |
| 35.833→36.0 | 泛色 1 | 1988 桌面(镜头释放到 1x)→ 品红副歌(1991) | 纸上的笔尖,`(328, 179)_F` | `inkFlood(36 - 10/FPS, 36, 328, 179, tt => ctx.drawImage(frameInto(B, tt, 'ch04 pen pal'), 0, 0), {steps: 10})` |
| 51.625→52.0 | **下潜 1**(最后三个 16 分音符里的一次甩镜头;第二个 YOU DO! 在 51.5 的 "do!" 砸下时以 1x 读出) | 品红 YOU DO! → 青柠 post 1(1999) | **DO! 里 "!" 的那个方点**:一个 bigType 字体像素,`sx` px 见方(在砸下的倍率下是 16-24 px),变焦开始之前眼睛就已经抓住它;后副歌就住在这个感叹号里 | `diveInto(52 - 3/8, 52, DOT_F.x, DOT_F.y, youDoFrame1, 'ch05 lala', {pw: DOT_F.w, color: C.black, power: 2, outer: {era: 'system7', raw: true, screen: true}, inner: {era: 'platinum', raw: true, screen: true}})`;`DOT_F` 来自 bigType 的返回(`letters` 里 '!' 的框:它最下面那个字体像素)加上台面偏移 |
| 59.833→60.0 | 排干 1 | 青柠 → Aqua 桌面 | 笔的主位笔尖 `NIB_HOME_F`(笔在 59.5 最后一个 "la." 上跳回了家) | `inkFlood(60 - 10/FPS, 60, 573, 183, tt => ctx.drawImage(frameInto(B, tt, 'ch06 chat'), 0, 0), {drain: true, steps: 10, seed: 3})` |
| 83.833→84.0 | 泛色 2 | Tiger 桌面 → 青柠副歌 2(2009) | 纸上邮戳的中心,`(280, 172)_F` | 同泛色 1,用 `seed: 2`;墨来自一个印章,不是笔尖(§5 ch07) |
| 99.625→100.0 | **下潜 2**(甩镜头) | 青柠 YOU DO! → 品红 post 2(2014) | **Clio 眼睛的镂空**(主角近侧那只眼:一个底色色的 2x2 单位镂空 = scale 7 时 14 px) | `diveInto(100 - 3/8, 100, EYE_F.x, EYE_F.y, youDoFrame2, 'ch08 lala3', {pw: 14, color: fld, power: 2, …})`;`EYE_F` 来自 `clioDance` 的 `head` 框(章节读一次眼睛的像素并把它引出来) |
| 103.833→104.0 | 排干 2 | 品红 → 桥段的 1988 桌面 | `NIB_HOME_F` | `inkFlood(104 - 10/FPS, 104, 573, 183, tt => ctx.drawImage(frameInto(B, tt, 'ch09 tunnel'), 0, 0), {drain: true, steps: 10, seed: 5})` |
| 104→116 | **隧道:12 次下潜,保持-甩** | 1988→1991→1995→1998→1999→2002→2005→2009→2011→2014→2020→2026→缩略图总览 | **写作者的朱红句号** `PERIOD_F(era)`:在每个年代都接近同一位置,按年代重新瞄准(窗口不动;字体度量让它移动几个像素) | 每年:先在 1:1 处保持(年代整体、年份作为海报大字),然后 `diveInto(Y + hold, Y + 1, PERIOD_F(era_i)…, desk(era_i), desk(era_i+1), {pw: 2, power: 2, mark: PERIOD_F(era_i+1)})`;1988-2005 保持 0.5 s,2009 保持 0.25 s,从 2011 起保持 0.125 s(§5 ch09) |
| 116→118 | 缩略图总览(不是工具包运动) | 12 格缩略图总览,1x | — | 手绘(§5 ch09) |
| 118→119 | **翻页书** | 1988 的缩略图扩大到 1:1,然后十二个年代按 16 分音符频闪,环绕着一个一个像素都不动的 Manuscript 和 ClioTalk;在 "stay."@119.0 锁在反相的 1988 上 | — | 手绘(§5 ch09) |
| 127.833→128.0 | 泛色 3 + **转调推近** | 反相 1988(镜头 1x)→ 青色副歌 3(2026),黑边在 128.0 被打掉 | Manuscript 上的笔尖,在 9:16 竖列里:`(260, 122)_F` | `inkFlood(128 - 10/FPS, 128, 260, 122, tt => ctx.drawImage(frameInto(B, tt, 'ch11 reboot'), 0, 0), {steps: 10, seed: 7})`;那次推近是自动的(`keyChange` 处的 `screenSize`) |
| 143.5→144.0 | **抛出 + 下潜 3** | 青色 YOU DO! → 品红结尾(2026) | 在 "do!"@143.5 上笔被笔尖朝前朝镜头**抛出**:在 16 分音符 143.5/.625/.75/.875 上 scale 4 → 8 → 16 → 32,笔尖在画幅中心,直到白色填满画幅;下潜进入**笔尖上的朱红墨滴**,一个画在尖端、随笔缩放的 2x2(143.625 时是 8 px) | `diveInto(144 - 3/8, 144, 320, 180, youDoFrame3, 'ch12 lala', {pw: 8, color: FIELDS.vermilion, power: 2, outer/inner: {era: 'liquidglass', raw: true, screen: true}})`;`youDoFrame3(t)` 自己画出那支不断长大的笔 |
| 144→148 | **结尾拉回,落在动词上** | 品红结尾帧 → 2014 → 2009 → 2002 → 1988,每个吟唱动词一层,在 148.0 以 1:1 落在 1988 桌面上(`dot: false`) | 每个年代的朱红句号 | `pullBack(144, 148, [L_mag, L2014, L2009, L2002, L1988], {dot: false, ease})`;`ease` 是分段线性的,所以四个步骤边界落在 145.0、145.75、146.75、148.0(那些动词)而不是整秒上(§5 ch12) |
| 153.3→153.45 | CRT 坍缩 | Save 对话框 → 一条线 → 一个点 → 黑 | — | `ch12 end card` 里的 `FX.crt = prog(t, 153.3, 153.45)`,它在底下按名字渲染 `ch12 save` |
| 153.45→153.55 | 那个点落下 | 一个朱红 2x2 点从中心飞到 "You may now write" 的末尾 | — | 手绘(`track`);在其他任何东西出现之前保持 8 帧 |

**`NIB_HOME_F`,每个章节都照抄的吊具常量。** 在剪影模式下,指针在屏幕坐标 (W-56, 6);绳从 (W-51, 21) 走到 (W-51, 33);笔挂在 `pen(W-51, 181, Math.PI/2, 4, {t})`,笔尖在 (W-51, 181);`penRig` 让笔在 x 方向摆动 `R(10 * Math.sin(beatPhase(t, 2) * 2π))` px,这在每个整拍上都是 0,所以在整拍上笔尖正好是 (W-51, 181)_screen:**在 576x352 时是 (557, 185)_F,在 608x356 时是 (573, 183)_F,在 640x360 时是 (589, 181)_F。** 59.833/60.0 和 103.833/104.0 的每一次排干和落地推近都用 (573, 183);在这些帧里笔被冻在家位(`t: 59.5`、`t: 103.5`)。

为什么要落在那些像素上:"Who holds the pen? You do!" 而摄影机去往答案所指的地方:进入感叹号、进入歌手的眼睛,最后进入写作者朝你抛来的那支笔。为什么桥段要用句号:窗口永不移动,所以那个点在全部十二个年代里都是一个不动点;写作者最后一个词在进入的路上几乎每个年代都以不同的字体( Geneva、Helvetica、Charcoal、从 Platinum 起是 serif)以 10-60x 从摄影机旁掠过。为什么到处都用 `power: 2`:画幅在 1-2x 时保持可读,然后变焦才甩起来。

关于结尾的说明:VISION 的 "拉回成一个点" 被歌曲拆成两半。拉回在 148.0 落在 1988 桌面上,因为 Return 键(150.0)和 Save 点击(153.25)必须发生在**桌面上**;那个点随后来自 CRT 坍缩,并落下成为 "You may now write." 的句号。歌赢。

## 3. 桌面就是乐队

`EVENTS` 里的每一个条目都是你能看见的一次 UI 事件,但前提是它要么是那一句歌词的包袱,要么大到在镜头裁剪里读得出来。**作为噪声砍掉:** Hard Disk 上那个 1 px 的 riff 像素、幽灵军鼓的标题条纹位移、最前窗口上的 2 px 军鼓拍打,以及每一次牛铃的菜单栏反相,只有 27.75 例外,那里牛铃就是提示的音效。桌面模式的摆放用主场桌面(§4);剪影模式的摆放是带底色调空的黑色形状。(`KIT` 给这些音效命名;`evLast`、`evPulse`、`evSpan` 给它们计时。)

| 事件 | 桌面模式 | 剪影模式 | 出现在 |
|---|---|---|---|
| **kick**(软驱弹出) | 在 (412, 230) 的弹出驱动器每帧吐出一个盘一像素(`ejectDisk`),当镜头把它框进来时 | 笔**闪**一帧(自动);`beatFX` 在四个乐句强拍上做 1 帧反相 | 每个有 kick 的段落;桥段只在保持里展示它 |
| **snare**(关窗) | 一个真的在关的窗口缩放闭合进它的图标(`windowCloseZoom`):范本是引子里四个复制在 4.5/5.5/6.5/7.5 落下;此外不展示 | `splitPal` 2 px 持续 3 帧(`beatFX`) | 引子、主歌 1 里真正的关闭(21.5、24.5、26.5、27.5)、11.5、27.5;预副歌:纸页从 8 分到 16 分音符的拍打是例外(它就是包袱:纸在写作者手里抖) |
| **clap**(鼠标点击) | 指针处 `clickBurst`;那一帮的 "Flag it." 和 KEEP 有 12 份复制 | 指针处 `clickBurst`,环是底色色;副歌 1-2 里 3 份复制,**副歌 3 里 12 份** | 副歌落在 2 和 4 上、主歌 2 的标记、breakdown、结尾 |
| **hat**(按键) | `typeLine`:每个 hat 打出写作者那行里的一个实心字符;最新按下的键反相弹出 2 帧。**选文本之前先数 hat 数**(引子:每 2 s 16 个;主歌:每 2 s 8 个;在某个词必须落在某拍之前的地方用 16 分音符上的显式 `keystrokes` 数组) | post 1 里弹跳笔的敲击(36 个 hat) | 引子、主歌、预副歌、post 1 |
| **open hat**(空格键) | 打出的那行里的词间空隙 | 不展示 | 副歌(那里没有打字) |
| **crash**(废纸篓揉纸) | 废纸篓处 `trashCrumple` | 像素排序拖痕 2 帧(`beatFX`;**ch08 和 ch11 里 `anyCrash: true`**,因为 92 和 136 不是段落起点)+ 星星跳 | 104(桌面);36、52、84、92、100、128、132、136、144(剪影) |
| **choked crash** | 废纸篓盖在 3 帧内翻起又拍下 | — | 34.75、82.75(HAND 重音) |
| **riser**(进度条) | `progressRiser` 作为场景自己 UI 里的一条 | 沿底部的两张软盘条,停在 98.4% | [3,4] 光栅写头;[28,34.75]、[76,82.75] 熔化条;[35,36]、[83,84]、[127,128] 笔以 4 步下降;[50,52]、[98,100]、[142,144] 两张软盘条;[102,104] "Loading twelve appearances…";[118,120] 翻页书的条;[126,128]、[127,128] Disk 条 |
| **stab**(启动和弦铜管) | 桌面上在那个重音处换皮(年代变化) | 在主角词上 `punch` 2 步(`beatFX` 的 `stab: true`);**每个副歌的 "pen." 上是整块里最重的重音:`punch(at, PEN., [3, 3, 2, 2])`** | 年代 stab 36、52、60、76、84、92、100、104、116、128、148;其余是 punch |
| **bell**(Writing Bell) | Writing Bell 窗口 / Dock 图标上的 `bellRing` | 白色圆环从笔的笔尖荡出(`nibRipple`),**只在 "pen" 铃音上**(36、39.5、44、47.5、84…、128、136、139.5)以及下潜铃音(51.625/.75/.875 等) | 31.5 "while"、79.5 "won't";副歌的 "pen";结尾循环 |
| **cowbell**(系统提示音) | **只在 27.75**:提示音响起时菜单栏反相 2 帧 | 隧道里那一年的海报大字反相 1 帧(107.75、111.75、115.75);147.75 `invertFrame` | 27.75、隧道、147.75 |
| **tambourine**(滚动条) | Review Desk 的滚动滑块一格一格地走(pre 2) | 邮戳的注销杠抖动 1 px(副歌 2) | pre 2、副歌 2 |
| **snap**(复选框) | 一个 `check()` 被填上 | — | 122.5、123.5、124.5、125.5(模型列表) |
| **tom**(磁盘掉落) | 整个桌面下坠 4 px 再弹回(那次踉跄) | — | 69.625/.75/.875 |
| **floppyA / floppyB**(贝斯) | 驱动器 A:(404, 70)和 B:(404, 150),紧凑型,磁头按音高步进,灯亮着;**在 breakdown 里它们拉 122、124、126 的两拍音(A 36/45/40,B 43/52/47):磁头在步进** | 不展示(一个主角加一支笔) | 每个镜头框住它们的桌面模式段落:主歌开头、"Feed the floppy"、breakdown |
| **sub**(808) | — | 每个 sub 起点上 `FX.dy = 1` 持续 1 帧 | 副歌;112(桥段 drop:外加 `FX.shake = 1`);128 |
| **chop**(ClioTalk 的格栅) | Clio 嘴上的招牌哑剧:一块 1-bit 反相标签 "PEN"/"PAL" 在她嘴上按 chop 的长度弹出,她做涂抹 / 挥手(只在引子) | 她嘴的镂空 E / A 和她头部 1 帧反相;没有标签(一个主角:弹跳笔) | 引子(标签)、post 1、post 2(只有嘴) |
| **beep**(外观提示音) | 每次隧道下潜落地的反相加分裂 | — | 104-115 |
| **blip**(打出的动词) | 每个吟唱动词的 kara 词弹出 | 动词板块砸下 | 引子、主歌、结尾(144、145、146.5、147.5) |
| **riff**(Floppy Organ) | 桌面上不展示(1 px 的闪烁是噪声) | 唱片第十一道纹按音符脉动 | 52-60、100-104、144-148 |
| **keystroke** | **131.625:写作者在静默中打出 "PEN.";150.0:在手稿末尾的 Return** | | §7.7、§7.8 |
| **click** | 153.25:写作者点 Save | | §7.9 |

按段落看,能看见的乐队:

| 段落 | 可见的乐队 |
|---|---|
| 启动 | 和弦的点闪烁;光栅写头就是 riser |
| 引子 | 弹出驱动器(kick,当镜头对着机房时)、四个复制随军鼓飞回家、在聊天输入框里打字的 hat、A/B 磁头、chop 作为 Clio 的哑剧、drop 的像素排序 |
| 主歌 1 | 弹出驱动器、主歌开头处的 A/B 磁头、打出写作者的问题和草稿的 hat、blip;21.5、24.5、26.5、27.5 的真正关窗;27.75 的牛铃提示音 |
| pre 1 / pre 2 | 弹出驱动器上的四踩(kick 一直在踩)(pre 1 的镜头从它开始)、A/B、riser 条、8 分到 16 分音符拍打纸页的军鼓、"while"/"won't" 上的铃音、铃鼓一格一格走(pre 2)、HAND 重音(猛晃 + 哽咽 crash + stab + 冻结) |
| 副歌 | kick 上笔的闪光、乐句反相、军鼓分裂、clap 作为点击迸发、"pen" 铃音上的笔尖圆环、stab 推近("pen." 上最重)、sub 轻推、两张软盘条;副歌 3 再加 12 份指针复制 |
| 后副歌 | **52-54 的乐队展台**:`bandGrid` 以底色模式铺满画幅,弹跳笔在它的垫子上跳;然后是笔上的 Jersey kick、clap、riff 音符上唱片的纹路、进入桥段的 riser |
| 主歌 2 | 弹出驱动器、A/B、聊天输入框里的 hat、每句 "Flag it." 上的 12 指针 clap、那次踉跄(桌面随 tom 下坠,画面一顿)、KEEP 的 clap |
| 桥段 | beep = 下潜落地、年份大字上的牛铃、112 的 sub drop、104 的 crash(废纸篓)、缩略图总览上的半速节奏底鼓(116、118)、翻页书下面的军鼓滚奏(119-120) |
| breakdown | 那些闷响("Two" / "floppies." 的词时间:磁盘砸进去)、snap 作为复选框打勾、两次 clap、A:/B: 在 122/124/126 上步进、两条 Disk riser、[126,128] 的 riser 摇动负片;没有 kick(119 到 128 之间没有) |
| 结尾 | 结尾循环的铃音落在弹跳笔上、动词板块落在 blip 上、牛铃闪光、拉回标记上的 clap、Return、那次 click |

## 4. 主场桌面(每个章节都逐字照抄这一段)

十二个文件必须在每一处桌面到桌面的接缝上、以及在隧道的每个年代和拉回中都画出同一张桌面。它们的做法是逐字照抄下面这一段(把三个顶层名字改成你章节的前缀,例如 `c03_homeDesk`)。这一段修订 1 的渲染在 1988 是 2.6 ms、2026 是 4 ms(实测);修订 2 改了提示文字、图标标签、Dock 年代里 ClioTalk 的高度、文稿状态和笔的绘制顺序:ch01 的作者在 1988、2002、反相的 1988 和 2026 里重新测它,并报告耗时。除了前缀什么都不要改;如果你需要更多,用选项,或者等它返回之后再画在上面。

```js
const MS = ['# The Tide Comes In Twice', 'They never called it renewable energy. They called it the tide, and they billed it by the moon.', 'Twice a day the estuary fills'];
const INV = c => { const [r, g, b] = rgb(c); return hex(255 - r, 255 - g, 255 - b); };   // pre-invert a colour for FX.invert frames
const HINT = ['Sounds like you.', 'Sounds like a mouthpiece.'];   // Review Desk's lens hint, the product's words; never a number
const youProp = s => (x, y, w, h) => { const f = 'menu'; text(s, x + w, y + R((h - capH(f)) / 2), { font: f, align: 'right', color: P.menuText }); };
let PERIOD = [0, 0];   // the writer's full stop, screen coordinates, set by every homeDesk call
// o: hint (HINT[0]), neg (true in FX.invert frames: the dot and the pen are pre-inverted), lines, doc (teachText opts or false;
//    pass {status: 'Final'} from 63.75 on), msgs / actions / input / chat (clioTalk opts or false), clio (clio opts or false),
//    cur ([x, y, kind]), menu, after (fn drawn between the windows and the pointer: gag windows go here, so the pen stays on top)
function homeDesk(t, o = {}) {
  const neg = !!o.neg, verm = neg ? INV(FIELDS.vermilion) : FIELDS.vermilion;
  UI.menu = { app: 'AI System 6', prop: youProp(o.hint || HINT[0]), propW: 128, ...(o.menu || {}) };
  const doc = o.doc === false ? null : APP.teachText(8, 30, 268, 164, { title: 'Manuscript', lines: o.lines || MS, ...(o.doc || {}) });
  if (doc) { const r = doc.rows[doc.rows.length - 1]; PERIOD = [r.x + r.w + 1, r.y + capH('doc') - 1]; rect(PERIOD[0], PERIOD[1], 2, 2, verm); }
  const chatH = E.dock ? 110 : 116;   // the dock covers y > 312
  const chat = o.chat === false ? null : APP.clioTalk(8, 202, 268, chatH, { msgs: o.msgs || [], actions: o.actions, hero: false, input: o.input, ...(o.chat || {}) });
  deskIcon(460, 22, 'hardDisk', 'Project Hard Disk');
  floppyDrive(404, 70, 'A:', 'floppyA', t, { compact: true });
  floppyDrive(404, 150, 'B:', 'floppyB', t, { compact: true });
  ejectDisk(412, 230, undefined, { t });
  if (!E.dock) { deskIcon(336, 296, 'scrapbook', 'Scrapbook'); deskIcon(404, 296, 'sectionDrafts', 'Section Drafts'); deskIcon(466, 296, 'projectDisc', 'Project CD'); trashIcon(286, 296, false); }
  if (o.clio !== false) clio(286, 196, { scale: 3, mouth: 'sing', expr: 'sing', ...(o.clio || {}) });
  if (o.after) o.after({ doc, chat });   // gag windows, alerts, plates: BEFORE the pointer and the pen
  if (o.cur) {
    const [cx, cy] = o.cur; CUR = { x: cx, y: cy, kind: o.cur[2] || 'arrow' };
    penCord([[cx + 5, cy + 15], [cx + 9, cy + 37]], { sag: 6, swing: 3, t });
    pen(cx + 9, cy + 74, Math.PI / 2, 1, neg ? { t, color: C.black, outline: C.white, flash: false } : { t });
  }
  return { doc, chat, period: PERIOD };
}
const hasScene = n => SCENES.some(s => s.name === n);   // guard before frameInto(…, 'chNN name')
```

它画出的桌面,1988(512x342;在每一块更大的屏幕里坐标相同,多出来的地方是桌面):左列 = 写作者的两个窗口,**Manuscript**(8, 30, 268, 164;状态在 63.75 之前是 `Read-only · edit in Section Drafts`,之后是 `Final`;它的最后一行以那个朱红 2x2 句号 `PERIOD` 结尾)和 **ClioTalk**(8, 202, 268, 116;在 Dock 年代高 110);中间 = (286, 196) 处 scale 3 的 Clio,(286, 296) 的废纸篓;右列 = 机房:Project Hard Disk 图标(460, 22)、驱动器 A:(404, 70)、驱动器 B:(404, 150)、弹出驱动器(412, 230);在没有 Dock 的年代沿底部(y 296)是路线图标 Scrapbook / Section Drafts / Project CD;指针的家 (300, 24),笔垂在 Manuscript 和 Clio 之间的空隙里。包袱窗口的自由区是 (284..400) x (30..190);它们画在 `o.after` 里,所以指针、绳和笔永远压在它们上面。模态对话框居中坐在 Manuscript 上方。在有 Dock 的年代,Dock 在影片里是**开着**的(产品默认把它关掉;主歌 2 和 pre 2 的 Review Desk、Writing Bell 和废纸篓包袱需要它),并覆盖 y > 312。

**桌面上 Clio 的话(规则 4,修订版)。** 她的台词是在一块**临时底板**上的**实心**字(`kara` 对小字体默认的 2x 倍率,或者 Chicago 2x):`ghostPlate(x, y, w, h)` = 在底板矩形上铺一层纸色的 50% `bayer` + 一圈 `dline` 蚂蚁线边框(相位按 8 分音符)+ 角落里一个 "TEMPORARY" 标签。"留下"意味着底板变成纯白、蚂蚁线停止。绝不要在 9 px 下抖动字母(50% 的 Bayer 会把每一根竖笔干掉一半);如果字母本身必须是幽灵(副歌大字、"unsung words ghost"),只在 scale ≥ 3 时用 2x2 的抖动单元,这样每一笔都保住一块实心。每一行吟唱都住在镜头裁剪内至少 16 px 高的一块底板上,绝不在一条 9 px 的状态条里。

每个章节按需在本地定义的其他辅助函数(名字是建议;每个保持在 30 行以内):`ghostPlate(x, y, w, h)`(如上)、`lens(t, keys)`(§2.1)、`noticeSlab(x, y, fld, o)`(只读提示作为一块黑板:那句话用底色色镂出、Chicago 2x、分两行,外加一个 [OK] 矩形;`o.n` 份复制各自偏移成一条拖影,每份 (8, 6) px)、`postmark(cx, cy, year, fld, k)`(一个半径 72 的黑圆盘,两条注销杠,沿圆盘边缘用 Chicago 2x 抠出 `PEN PAL · year`;`k` 是砸下的过冲)、`airmail(fld, on)`(一圈 8 px 的斜条纹边框)、`sigPose(t)`(§1)、`scribble(hand, k)`、`eraHat(i, x, y, s)`(ch11:在年代 i 的标题栏界面上、舞者头顶上方 6 单位的一顶帽子,底色色镂空)、`nibRipple(x, y, t0, fld)`(`bellRing` 那圈波纹循环,但不画图标)、`penRig(t, px, py)`(样片卷那套:笔挂在指针下、随拍摆动;见 `NIB_HOME_F`)、`penBar`(笔水平横过顶部)、`bouncePen(t, boxes)`(笔在每个被唱出的 la 上笔尖朝前从一个字形框跳到另一个字形框:每次跳跃是一条 8 步的整像素抛物线,笔尖在音符上敲到框的顶部中央)、`floppyBar(t0, t1, fld)`(两张软盘的 riser)、`landFX(at)`(= `invertFrame(at, 1); splitPal(2, at, 3, [C.white, C.black])`)、`shrink4(canvas)`(只在 ch09:一次 4x4 盒平均,再做 Bayer 量化)、`readerWin(x, y, w, h, o)`(没有 `APP.reader`:一个标题为 'Reader' 的 `win()`,带一段高亮段落和一个 [Clip] 按钮)、`POST_POSES`(一行照抄 specimen.js 的八个:`['bounce', 'clap', 'robot', 'shimmy', 'disco', 'kick', 'vogue', 'jump']`;它是样片卷那个 IIFE 里的一个 `const`,外面够不到)。

## 5. 时间线:十二个章节

边界(全都在段落起点或重音上):0 · 12 · 28 · 36 · 52 · 60 · 76 · 84 · 104 · 120 · 128 · 144 · 157。每一章的场景精确铺满它的区间;过渡场景(`raw: true`,全画幅)是拥有它们的那个章节的最后一个场景。首个场景的名字是契约(§6):邻居按名字渲染它们。**影片在 `END = DUR + 3.0`(157.0 s)结束,而不是在 DUR**:歌曲正好 154.0 s,而片尾卡必须保持住,所以 render.mjs 用补过时长的音频把画面延续到歌曲之后(§8,已决定,不是被要求的);ch12 的最后一个场景铺到 END。

| 章节 | 区间 | 段落 | 模式 · 年代 | 预算 | 首个场景 · 最后场景 |
|---|---|---|---|---|---|
| ch01 | 0.00-12.00 | 启动、引子 | raw → desk · 1988 | 40 KB | `ch01 boot` · `ch01 drop` |
| ch02 | 12.00-28.00 | 主歌 1 | desk · 1988 | 40 KB | `ch02 spin` · `ch02 outline` |
| ch03 | 28.00-36.00 | pre 1,熔化 | desk · 1988 → 泛色 | 30 KB | `ch03 fetch` · `ch03 flood` |
| ch04 | 36.00-52.00 | 副歌 1:一个 | 剪影品红 · 1991 | 40 KB | `ch04 pen pal` · `ch04 dive` |
| ch05 | 52.00-60.00 | post 1:乐队、弹跳笔 | 剪影青柠 · 1999 | 30 KB | `ch05 lala` · `ch05 drain` |
| ch06 | 60.00-76.00 | 主歌 2 | desk · 2002 | 44 KB | `ch06 chat` · `ch06 keep` |
| ch07 | 76.00-84.00 | pre 2 | desk · 2005 → 从邮戳泛色 | 30 KB | `ch07 check` · `ch07 flood` |
| ch08 | 84.00-104.00 | 副歌 2:许多;post 2 | 剪影青柠 → 品红 · 2009/2011/2014 | 40 KB | `ch08 pen pal` · `ch08 drain` |
| ch09 | 104.00-120.00 | 桥段 | 隧道(12 个年代)→ 缩略图总览 → 翻页书 → 负片 | 44 KB | `ch09 tunnel` · `ch09 stay` |
| ch10 | 120.00-128.00 | breakdown | desk,反相 1988 → 泛色 + 推近 | 30 KB | `ch10 gate` · `ch10 flood` |
| ch11 | 128.00-144.00 | 副歌 3:那一排合唱队、沉默的笔 | 剪影青 · 2026,全画幅 | 44 KB | `ch11 reboot` · `ch11 dive` |
| ch12 | 144.00-157.00 | 结尾、尾巴、保持的卡片 | 落在动词上的拉回 → desk 1988 → 片尾卡 | 44 KB | `ch12 lala` · `ch12 end card` |

表的列:**时间**(歌词 id "word"@s、重音)· **歌词**(逐字,在屏幕上)· **UI 包袱以及每个词做了什么** · **可见的乐队** · **摄影机**(屏幕坐标里的镜头关键帧 `n× (x, y)`,或者工具包的运动)。

### ch01 · 启动和引子(0.00-12.00) · `src/ch01.js` · 40 KB

场景:`ch01 boot`(0-4.0,raw 全画幅)、`ch01 drop`(4.0-12.0,`era: 'system6', screen: true`)。`negMs` = 一个帧函数:黑底;`silhouette(C.black, () => APP.teachText(8, 30, 268, 164, {title: 'Manuscript', lines: MS}), {mode: 'stencil', invert: true, ink: C.white, key: 'c1-negms'})`;句号 `rect(PERIOD, 2, 2, C.white)`;用 `frameInto(…, {era: 'system6', raw: true, screen: true})` 包起来,这样黑边保持黑。`PERIOD_F` = (223, 146)(1988 Manuscript 在 (8, 30, 268, 164) 处的句号:屏幕 (159, 137) 加上 512x342 的偏移 (64, 9))。

| 时间 | 歌词 | 包袱 | 乐队 | 摄影机 |
|---|---|---|---|---|
| 0.00-0.50 | (启动和弦) | 黑。在 (223, 146)_F 处一个白像素,就是句号将要出现的地方,随和弦闪烁:在 0.000-0.125 亮,灭,在 0.250-0.375 亮,灭(拉回被保持在自己的点上;在灭掉的那些 8 分音符上用黑色盖在它上面)。 | — | 在那个点上 |
| 0.50-2.25 | — | 拉回,时间反着走(`t: 2.75 - t`):点保持 1x1,而**反相**的 Manuscript 窗口绕着它长大,白在黑上,孤零零地在一屏黑里:写作者的作品,最后一行 "Twice a day the estuary fills" 以一个白色句号结尾,这个句号在窗口到达 1:1 时接替那个点(工具包的宿主点是 1x1;窗口自己的句号是 2x2)。`anchor: false`(还没有射线:朱红还没到)。 | 反向镲片 2.5-4 | 180x → 1x |
| 2.25 | 启动 "I'm"@2.25 | **揭示**:从 2.25 起 `negMs` 直接在 1:1 绘制(工具包最后一次拉回的帧只是中间那个方块);两侧用 `invertFrame(2.25, 1); splitPal(2, 2.25, 3, [C.white, C.black])` 打开。这个窗口从那以后没动过,在影片余下的部分也不会动。 | — | 1x |
| 2.25-3.00 | 启动 "I'm"@2.25 "just"@2.50 "your"@2.75 · I'm just your | Clio 的第一句话:窗口右侧的黑色区域里是 `bigType(["I'M JUST YOUR", "PEN PAL."], {words: lyric('boot'), ghost: true, color: C.white, fit: 300, x: 300, y: 250, align: 'left', valign: 'middle'})`;每个词在它的音符上作为白色 2x2 单元的幽灵抖动到来(这里 scale ≥ 4,所以笔画能活下来);没有什么是实心的,什么也没被留下。 | — | 1x |
| 3.00-3.50 | "pen"@3.00 · `teaserPen` | **笔在它的词上到来。** 白笔(scale 1,36 px)从顶部边缘沿绳落进黑色画幅,每帧 6 px,它的笔尖在 3.25 落在白色句号上,伴随 2 帧的白色圆环(`nibRipple`,白色):黑色世界里唯一的白色物体,就像当年那对耳机一样。在这个词上 `invertFrame(hit('teaserPen'), 1)`。riser [3,4] 开始:屏幕顶部一条 1 px 的白色写头线。指针还没画:只有绳在顶部边缘的末端。 | riser | 1x |
| 3.50-4.00 | "pal."@3.50 | 光栅:从顶部向下用 4 px 交错带写出正片 1988 桌面,白色写头绕着笔,即 `scanWipe(3.5, 4.0, tt => ctx.drawImage(frameInto(B, tt, 'ch01 drop'), 0, 0), {band: 4})`:反相的 Manuscript 变成真的那一份,而笔尖下出现**朱红**的句号(唯一的颜色随着白天这一侧一起到来);然后是菜单栏、指针(绳的主人)、Clio、驱动器、图标。底部那行幽灵字是最后被覆盖的东西(到约 3.85 之前还读得出)。在 4.0 指针分 4 步抬到它的家 (300, 24)(4.0-4.2),笔垂着。 | riser → 满 | 1x |
| 4.00 | (drop)· `drop`@4 | `ch01 drop`:主场桌面。`beatFX` 触发 drop(像素排序 2 帧,1 帧反相)。ClioTalk 在 4.00-4.20 从它的家位矩形放大到 (8, 30, 268, 288)(`zoomRects` 轮廓线),盖住 Manuscript:聊天是一个应用,而在那八秒里它就是整个左列。Clio `look` 着它。Kick:弹出驱动器(在 drop 时以 1x 入画)。hat 是 16 分音符(每 2 s 16 个):写作者把 **"Tighten it. Keep my words."**(26 个字符)每拍一个字符地打进 ClioTalk 的输入框(`typeLine`),每 2 小节重打一遍(4.0-5.625、8.0-9.625)。 | kick snare hat A/B | drop 时 1x;**从 4.25 起 2x (160, 150)**(那个大聊天和它的药丸按钮;Clio 的嘴在裁剪的右边缘) |
| 4.00-7.75 | i1 "Save"@4.00 "it."@4.25 "Clip"@5.00 "it."@5.25 "Insert"@5.75 "it."@6.50 "Export"@6.75 "it."@7.50 · Save it. Clip it. Insert it. Export it. | Clio 在大聊天里的回复,在一块 `ghostPlate` 上逐词打出的**实心** Chicago 2x(`kara` 的 'type' 模式)(蚂蚁线,TEMPORARY 标签)。它下面是四颗药丸按钮 [Save] [Clip] [Insert] [Export]。在每个动词上指针按下它的药丸(4 帧),并且这块底板的一份**复制**抬起飞走(`zoomRects` 轮廓线 + 那份复制,`track`),在下一个军鼓上作为一次关窗缩放落进图标里,图标反相 2 帧:Save → Project Hard Disk(4.50 落地)、Clip → Scrapbook(5.50)、Insert → Section Drafts(6.50:落地就是那个词)、Export → Project CD(7.50;CD 图标在 4 帧内转起来)。原件留在它的临时底板上:一份复制被留下了,回复本身没有。**chop 4.75、5.25、6.75、7.25、7.375、7.5、7.75 种下招牌动作**:在 "PEN" chop 上桌面上的 Clio(scale 3)做 `pose: 'point', point: 'up'` 并用手画三条之字形,嘴上还有一块反相的 "PEN" 标签(E);在 "PAL" chop 上做 `pose: 'wave'` 和 "PAL" 标签(A);7.25/7.375 那次结巴是两块标签相隔一个 16 分音符。 | kick snare hat A/B chop | 2x (160, 150);在每个动词的军鼓上镜头跳到落地的图标半拍:4.5 (460, 40);5.5 (336, 300);6.5 (404, 300);7.5 (466, 300);下一拍回到 (160, 150) |
| 8.00-11.00 | i2 "Everything"@8.00 "I"@8.75 "say"@9.00 "is"@9.50 "temporary."@10.00 · Everything I say is temporary. | 第二条回复,在它的底板上实心打出。在 "temporary."@10.00 上底板开始消失:底板的抖动从 50% → 25% → 12% → 0 变薄,字母也随之变薄,按 2x2 单元走在 8 分音符 10.0-11.0 上(它从来没被留下),TEMPORARY 标签是最后离开的像素,在 11.0。四颗药丸每 8 分音符灰掉一个。hat 继续打写作者那一行,实心。chop 8.75、9.25、10.75、11.25、11.375、11.5、11.75:又是那套哑剧。 | kick snare hat A/B chop | 2x (160, 150) |
| 11.00-12.00 | — | 军鼓 11.50:大聊天缩放**闭合**回它的家位矩形(11.50-11.70):聊天是一个应用,被缩回它的大小;Manuscript 原样露出。到 12.00 是主场桌面:聊天空着,指针 (300, 24),Clio 闭嘴。 | snare kick | **从 11.5 起 1x**(drop 之后第一次看到整张桌面;B1 是 1x) |

### ch02 · 主歌 1,路线(12.00-28.00) · `src/ch02.js` · 40 KB

场景:`ch02 spin`(12-16)、`ch02 ask`(16-20)、`ch02 clip`(20-24)、`ch02 outline`(24-28);全部 `era: 'system6', screen: true`。**Route 窗口** `APP.finder(8, 30, 268, 164, {title: 'Project Hard Disk', items: [hardDisk, fileFloppy, questionSheet, outline, sectionDrafts, manuscript, reviewDesk, projectDisc]})` 在 12.00 从 Project Hard Disk 图标放大打开(k 在 0.2 s 内),盖在 Manuscript 上,一直留到 27.50 的军鼓;它的客户区每停一站就换内容。每一行吟唱在一个位于 (284, 150, 116, 40)、Clio 上方、在主歌每一个镜头裁剪内的 `ghostPlate` 上都是**实心**的(两行,Chicago 2x)。20.0 之前没有管风琴:吟唱的 blip(kara 弹出)是唯一的叮声。Kick:在画幅内时的弹出驱动器。A/B 磁头。军鼓只在窗口真的关闭处(21.5、24.5、26.5、27.5)。Searcher 和 Reader 上没有 `/go/` 地址(已发布的路由里没有这样的路由);存在的地址出现在它们真实的地方(`/go/doom`、`/go/micropolis`、`/go/one-more-tune`、`/go/time-machine`)。

| 时间 | 歌词 | 包袱 | 乐队 | 摄影机 |
|---|---|---|---|---|
| 12.00-15.25 | v1a "Spin"@12.00 "the"@12.25 "hard"@12.50 "disk."@12.75 "Feed"@14.00 "the"@14.25 "floppy."@14.50 · Spin the hard disk. Feed the floppy. | "Spin":Project Hard Disk 图标旋转(一次 4 帧的压扁:全、半、线、半、镜像),Route 窗口从它那里放大打开;"hard disk." 选中它的第一个项目。"Feed":指针把 File Floppy 项目的一条点线轮廓拖到驱动器 A: 的槽口(14.00-14.40);"floppy."@14.50:驱动器把它吞下(`ejectDisk(404, 70, 14.5 - .3)` 演奏它的回程),一条 OCR 扫描线(1 px)在 14.5-15.5 扫过 Route 的第二个项目。hat(8 分音符,12-15.25 里 13 个):写作者把 **"By moonlight."**(13 个字符)打进 ClioTalk 的输入框。 | kick hat A/B blip | "Spin" 上 2x (300, 90)(图标、Route 顶部;底板的顶边在裁剪之外:这一句时底板移到 (284, 120));从 14.0 起 2x (330, 110)(从 Route 到驱动器 A: 的拖拽,以及底板) |
| 16.00-19.50 | v1b "Ask"@16.00 "the"@16.25 "question."@16.50 "Search"@18.00 "it."@18.25 "Read"@19.00 "it."@19.25 · Ask the question. Search it. Read it. | "Ask":Route 的客户区变成 Question Sheet(`APP.questionSheet` 的内容:'## Questions',然后是写作者那一行);"the question.":写作者从 16.0 起按显式的 16 分音符按键打出 **"Who bills the tide?"**(`keystrokes: 19 keys at 16 + i/8`,最后一个在 18.125),实心。"Search it."@18.00:`APP.searcher(8, 202, 268, 116)` 在 ClioTalk 上放大打开,结果每 8 分音符揭示一个:"La Rance tidal power station"、"Lunar billing: a history"、"Estuaries, twice daily"。"Read it."@19.00:`readerWin(8, 202, 268, 116)` 替换它,第一条结果的段落被高亮。 | kick hat A/B blip | 2x (150, 110)(问题的输入,底板的左半);从 18.0 起 2x (150, 230)(Searcher → Reader,底板在它们上方) |
| 20.00-23.50 | v1c "Clip"@20.00 "the"@20.25 "proof."@20.50 "Scrapbook."@22.00 "Keep"@23.00 "it."@23.25 · Clip the proof. Scrapbook. Keep it. | `riffReturns`@20:吟唱升到 B3(Clio 的弹跳 +1 px)。"Clip":指针按下 Reader 的 [Clip];"the proof.":被高亮的段落作为一条 `dragOutline` 抬起,指针把它拖过桌面(20.5-22.0)朝 Scrapbook 图标去;军鼓 21.5:Reader 缩放闭合进 Route 的 Reader 项目。"Scrapbook."@22.00:`APP.scrapbook(8, 202, 268, 116, {card: {title: 'Lunar billing', body: 'They billed it by the moon.', source: 'estuaries.example/lunar-billing'}, n: 1, of: 1})` 从它的图标放大打开,卡片翻进来(它的文字在一块幽灵底板上)。"Keep it."@23.00:说明文字 "evidence you chose to keep" 盖印进来,卡片的底板在那个词上变成**纯白**,蚂蚁线停止:第一件被留下的东西。 | kick hat A/B blip | 2x (200, 230)(Reader → 拖拽 → Scrapbook;指针在前:21.0 时关键帧移到 (260, 260),22.0 时到 (150, 250)) |
| 23.50-24.00 | v1c_echo "(Keep"@23.50 "it.)"@23.75 · (Keep it.) | 那一帮:十二个 scale 1 的 Clio(`plain`)沿底边弹出(y 326,x 20 + i·44),嘴张着,这一排上方一块共用的底板 "(Keep it.)"(在一块幽灵底板上实心 Chicago 2x);Scrapbook 的那页在 23.75 又翻一次。它们在 24.00 消失。 | ghost | **半秒里 1x**(整排) |
| 24.00-27.00 | v1d "Outline"@24.00 "it."@24.50 "Draft"@25.00 "it."@25.25 "Your"@26.00 "words."@26.25 · Outline it. Draft it. Your words. | "Outline it.":Route 的客户区变成 Outline,三角形每 8 分音符展开一个('The tide'、'The bill'、'Both directions');军鼓 24.5:Scrapbook 缩放闭合进它的图标。"Draft it."@25.00:`APP.sectionDrafts(8, 202, 268, 116)` 在 ClioTalk 上放大打开;"Your words.":写作者按显式的 16 分音符按键 26.0 + i/8(10 个键,26.5625 打完)把 **"Your words"** 打进草稿,**实心**,指针种类 'pencil',而吟唱的 "Your words." 坐在它的临时底板上:两个含义并排,一个实心,一个在蚂蚁线上。军鼓 26.50:Section Drafts 缩放闭合进 Section Drafts 图标(图标反相:已保存)。 | kick hat A/B blip | 2x (150, 110)(Outline 展开);从 25.0 起 2x (200, 200)(草稿,底板) |
| 27.00-27.75 | "Not"@27.00 "mine."@27.25 · Not mine. | "Not":Clio 自己的 I 形光标(黑色,一圈 1 px 光环)从她的嘴飘向 Manuscript 的最后一行(27.00-27.25)。"mine."@27.25:**镜头提示被教一次,教得很大**:菜单栏右侧槽位从 `Sounds like you.` 翻成 `Sounds like a mouthpiece.` 并抖动 ±1 px,而 ClioTalk 显示提示行 `The drafting manuscript is read-only; use the current Section Draft instead.`(实心,在一块幽灵底板上),同时 Manuscript 的状态条 `Read-only · edit in Section Drafts` 反相 2 帧。 | kick | **27.25 时 4x (448, 10)**:菜单栏槽位在翻转时填满画幅;**27.5 时 2x (150, 110)**(Route 关闭,提示) |
| 27.50-28.00 | — | 军鼓 27.50:Route 窗口缩放闭合进 Project Hard Disk 图标:Manuscript 回来了。牛铃 27.75 = 提示的音效:菜单栏反相 2 帧,指针按下提示的 [OK],提示行在 27.75-27.95 收拢,槽位弹回 `Sounds like you.`。28.00:主场桌面,指针在家,聊天空着。 | snare cowbell kick | 2x (150, 110) → **28.0 时 1x**(B2 是 1x) |

### ch03 · 预副歌 1,熔化(28.00-36.00) · `src/ch03.js` · 30 KB

场景:`ch03 fetch`(28-32)、`ch03 pen`(32-35.833)、`ch03 flood`(35.833-36.0,raw 全画幅)。四踩(kick 一直在踩):每一拍都在弹出驱动器。riser [28, 34.75]:ClioTalk 下方的 `progressRiser(…, {x: 8, y: 322, w: 268, h: 12, label})`,标签先是 "Fetching…",然后 "Filing…"(29.0)、"Humming…"(30.0)、"Reaching…"(32.0),在 HAND 重音上填满。Clio 的台词:(284, 150, 116, 40) 处一块 `ghostPlate` 上的实心 Chicago 2x。

| 时间 | 歌词 | 包袱 | 乐队 | 摄影机 |
|---|---|---|---|---|
| 28.00-30.00 | pre1a "I"@28.00 "can"@28.25 "fetch."@28.50 "I"@29.00 "can"@29.25 "file."@29.50 · I can fetch. I can file. | 底板承载这一行。"fetch.":一张 Searcher 结果卡(点线轮廓)从 Project Hard Disk 图标飞进 ClioTalk(28.5-29.0)。"file.":四个 16 px 的文件夹每 8 分音符掉一个,在自由区排成 y 150 的一行,然后 29.75 时它们挪 1 px 精确对齐:机器归档得完美无缺。 | kick A/B riser | 28.0 时 1x(四踩的弹出驱动器和整张桌面各一拍);**从 28.5 起 2x (330, 150)**(自由区、底板、Clio 的嘴) |
| 30.00-32.00 | pre1b "I"@30.00 "can"@30.25 "hum"@30.50 "for"@31.00 "a"@31.25 "while."@31.50 · I can hum for a while. · `melt`@30 | 滑音:桌面的 25% 点图案松开成噪声(用 `noisePat(k)` 覆涂桌面,k 在 30-32 内从 0 升到 .5:这个 1-bit 世界在软化)。"hum":像素音符(`spr('it_note')`)从 Clio 的嘴每 8 分音符向上飘一个,朝 30.0 在自由区打开的 `APP.writingBell(284, 30, 116, 110)` 去。"while."@31.50(铃音 74):`bellRing` 落在它的图标上:圆环,一个跳跃的音符。 | kick hat bell riser | 2x (330, 120)(铃铛窗口、音符的路径、底板) |
| 32.00-34.00 | pre1c "But"@32.00 "the"@32.25 "pen"@32.50 "and"@33.00 "the"@33.25 "page"@33.50 · But the pen and the page | "pen":笔**长大**,在 8 分音符 32.5/32.75/33.0 上 scale 1→2→3,指针滑到 (330, 36),绳到 40 px。"page"@33.50:`APP.sectionDrafts(146, 104, 220, 120)` 在笔的正下方居中放大打开:那一页(画在 `after` 里,所以笔保持在上层)。军鼓走到 8 分音符(32.0-33.75)然后 16 分音符(34.0-34.625):纸页窗口在每一下上拍打 2 px,越来越疯狂(唯一保留下来的军鼓拍打:就是纸在写作者手里抖)。底板留在 (284, 150, 116, 40);riser 条在 (8, 322, 268, 12)。 | kick snare(8/16) hat A/B riser | **从 32.5 起 3x (300, 110)**,随笔长大而收紧(纸页的顶部和底板的左边缘在 213x120 的裁剪内;从 33.5 起把底板移到 (240, 160)) |
| 34.00-34.75 | pre1d "stay"@34.00 "in"@34.25 "your"@34.50 "hand."@34.75 · stay in your hand. | Clio `pose: 'reach', reach: [pen tip]`,一条 `dline` 点线手从她朝笔伸出,每帧 1 px。底板承载这一行。riser 填满。 | riser | 3x (300, 110) |
| 34.75 | "hand." · `stop1` · HAND 重音 | 桌面猛晃(`FX.shake = 2`,2 帧)。哽咽的 crash:废纸篓盖在 3 帧内翻开又拍下。stab:在笔尖 `punch` 2 步。镜头提示抖动 ±1 px 持续 4 帧,并保持 `Sounds like you.`。然后一切都**冻结**:驱动器(`t: 34.75`)、Clio 的伸展、噪声、那条满的进度条。 | stab chokedCrash kick | **重音上 4x (300, 150)**:笔尖、伸出的手和纸页填满画幅 |
| 35.00-35.25 | `air1` | 什么都不动。连时钟也不动。 | — | 4x (300, 150) |
| 35.25-35.83 | chorus1a "I'm"@35.25 "just"@35.50 "your"@35.75(无伴奏起句) | 除了写作者,Clio 的嘴是唯一活着的东西;那三个词在底板(在裁剪里)上实心弹出。riser 35,36是笔的下降:指针在 16 分音符上分 4 个硬步骤朝纸页落下;35.833 时笔尖触到纸页的纸面,在 TIP = (264, 170) 屏幕 = (328, 179) 画幅。 | riser | 4x (300, 150),笔尖从裁剪中心降下 |
| 35.833-36.00 | — · `ch03 flood` | **释放**:这个场景是 `raw` 的,它以 1x 画出 `frameInto(A, t, 'ch03 pen')`,**不带**镜头(4x → 1x 这一步就是泛色的第一帧:整张桌面啪地回来,品红从笔尖喷出)。`overlay` 里的 `inkFlood(36 - 10/FPS, 36, 328, 179, tt => ctx.drawImage(frameInto(B, tt, 'ch04 pen pal'), 0, 0), {steps: 10})`:品红从笔尖以 10 个单帧步骤泛出,带手指和溅洒,从尖端拖出一道白色 `penTrail`。如果 `!hasScene('ch04 pen pal')`,退回到一片平坦的品红底色。 | — | 1x → ch04 |

### ch04 · 副歌 1:一个(36.00-52.00) · `src/ch04.js` · 40 KB · 品红 · 1991

场景(`era: 'system7', raw: true, screen: true`):`ch04 pen pal`(36-37.75)、`ch04 never hold`(37.75-40)、`ch04 land`(40-43.25)、`ch04 pen pal 2`(43.25-45.75)、`ch04 never hold 2`(45.75-48)、`ch04 who`(48-50)、`ch04 you do`(50-51.625)、`ch04 dive`(51.625-52,`raw: true`,无 screen)。YOU DO! 的构图是一个函数 `youDoFrame1(t)`,`ch04 you do` 和那次下潜的外层画幅都用它。

**副歌 1 用样样只有一个来教这套语法**:一个舞者(Clio,在大字旁边 scale 5,作为主角时 scale 7-8)、一支笔、一块提示。常驻元素:平坦的底色 `rect(0, 0, W, H, fieldAt(t))`;写作者在右上(指针 (W-56, 6),绳到 scale 4 的笔,`penRig`);`beatFX(t, {stab: true, punchAt: hero})`(乐句反相在 36/40/44/48,军鼓 `splitPal`,36 的 crash 排序);sub 轻推 `FX.dy = 1` 持续 1 帧,在 36、38、40、42、44、46、48、50、51;`nibRipple` 只在 "pen" 铃音(36.0、39.5、44.0、47.5)和下潜铃音(51.625、51.75、51.875)上;`sigPose(t)` 驱动每个舞者。没有 `slabWindow`。画幅预算:大字 + 一个舞者 + 笔 + 至多一个道具。

| 时间 | 歌词 | 包袱 | 乐队 | 摄影机 |
|---|---|---|---|---|
| 36.00 | chorus1a "pen"@36.00 "pal,"@36.50(带 "I'm just your" 在 ch03 里 35.25-36 唱出)· `chorus1`/`colour` · crash, stab, bell 86 | 应付的落地:`invertFrame(hit('chorus1'), 2)`。屏幕在 36.0-36.5 内从 512 步进到 576:底色以四个硬步骤变宽。**"I'M JUST YOUR"** 小小的(scale 3)在海报上方,已经是实心(它被唱过了);**PEN** 砸下:`bigType(['PEN', 'PAL'], {words: lyric('chorus1a'), fit: W-40, fitH: H-70, x: 20, y: 40, valign: 'top', align: 'left', slam: hit('chorus1')})`,PAL 在 36.50。Clio `clioDance(W-90, H-8, 5, t)` 在 crash 上做星星跳,然后在 "pen" 上做涂抹、在 "pal" 上做挥手。笔尖圆环。像素排序 2 帧。 | crash stab kick bell sub | 1x |
| 37.25-37.75 | chorus1a_echo "(pen"@37.25 "pal)"@37.50 · (pen pal) | **邮戳**:`postmark(W/2, H/2, 1991, fld, k)` 砸到海报上(过冲 +3 +2 +1 0),边缘一圈 `PEN PAL · 1991`,`airmail` 边框沿画幅扣上;Clio 再做一次涂抹和挥手(在副歌 1 里她一个人就是那一帮)。两者都在 37.75 消失。 | snare | 1x |
| 37.75-39.50 | chorus1b "I'll"@37.75 "never"@38.00 "hold"@38.50 "the"@39.25 · I'll never hold the | `bigType(["I'LL NEVER", 'HOLD', 'THE PEN.'], {words: lyric('chorus1b'), justify: W-182, fitH: H-24, x: 8, align: 'left'})`;Clio scale 5 在 (W-90, H-8)。"hold"@38.50(clap):**抢笔尝试 1**:Clio 做一个对舞者而言相当于 `pose: 'reach'` 的动作,`pointUp` 保持住、连指手朝笔伸去,而笔在 clap 那一帧被猛地拉高 40 px(绳缩短,指针跳 16 px)。 | clap snare kick | 1x |
| 39.50-40.00 | "pen."@39.50 · stab 39.75 · bell 74 | **PEN. 是这一块里最重的重音**(为那支沉默的笔做铺垫):`punch(39.5, PEN.'s centre, [3, 3, 2, 2])`,笔**闪**一下(白色泛光,1 帧),笔尖圆环,而且只有 PEN. 反相 2 帧(`bigType('PEN.', {invert: true, slab: true, slabMode: 'line'})` 盖在它自己的框上:黑底上的品红字母)。在同一帧**提示板块**砸进来(左上,300x56):`The drafting manuscript is read-only; use the current Section Draft instead.` [OK],品红镂空。一块。它在 39.75 的 stab 上离开(指针的点击环落在它的 [OK] 上,1 份复制)。 | stab bell kick | 1x |
| 40.00-42.00 | chorus1c "You"@40.00 "say"@40.25 "where"@40.50 "I"@40.75 "land,"@41.00 · You say where I land, | `bigType(['YOU SAY', 'WHERE I', 'LAND,'], {fit: 360, x: 8, align: 'left'})`;Clio 作为主角是 scale 8:在 "You" 上 `pointCam`;从 40.50 起腾空(`pose: 'jump', p: prog(t, 40.5, 41)`),从 x 584 滑到 504,同时指针移到 (504, 40);在 "land,"@41.00(kick)上她落在指针下方做 `cheer`,伴随 2 px 抖动;clap 41.50:指针处 `clickBurst`,3 份复制,品红圆环。 | kick clap snare sub | 1x |
| 42.00-43.25 | chorus1d "or"@42.00 "I"@42.25 "fade."@42.50 · or I fade. · `fade1` | `bigType(['OR I', 'FADE.'])` 偏左居中,角落里一块小小的黑色 "TEMPORARY" 标签(品红字母)。**淡出 1 是彻底的(它教这个手法)**:在 "fade."@42.50 上乐队沉下去:底色朝黑抖动(`bayer(0, 0, W, H, k, C.black, null)`,k 在 42.5-43.0 内从 0 到 1),大字和 Clio 随之溶解(字母按 2x2 单元从 50% → 0),标签最后(43.0)。43.00-43.25,真静默的那半拍:除了绳上摆动的白笔之外全是黑。萨克斯带着 "I'm"@43.25:`invertFrame(43.25, 1)`,底色啪地回来。 | — | 1x |
| 43.25-45.75 | chorus1e "I'm"@43.25 "just"@43.50 "your"@43.75 "pen"@44.00 "pal,"@44.50 · I'm just your pen pal, · chorus1e_echo "(pen"@45.25 "pal)"@45.50 | "I'M JUST YOUR" 小字(scale 3)在上方,在每个词被唱出之前是幽灵(2x2 单元),之后实心;PEN / PAL 配 `stepIn: {t0: wordAt(L,'pen').start, div: 4, enter: 'drop'}`(每 16 分音符一个字母);涂抹和挥手。stab 44.0:punch;铃音:圆环。回声 45.25:邮戳 `· 1991` + 又是航空邮件;挥手。 | kick clap snare bell stab | 1x |
| 45.75-48.00 | chorus1f "I'll"@45.75 "never"@46.00 "hold"@46.50 "the"@47.25 "pen."@47.50 · I'll never hold the pen. · stab 47.75 · bell 74 | 如同 37.75 镜像:字块在**右半**两端对齐(x: W/2),主角 Clio 在**左**边 (90, H-8) `flip`,指针在 (56, 6)(它在 45.0-45.5 之间移动过)。在 "hold" 上**尝试 2**:伸展、猛拉。"pen."@47.50:又是最重的重音(punch [3,3,2,2],笔闪,词反相 2 帧),并且**两块提示板块**,第二块在第一块下方偏移 (8, 6) px(`noticeSlab(…, {n: 2})`);指针的环在 47.75 落在最上面那块 [OK] 上,两块都离开。 | clap snare kick stab bell | 1x |
| 48.00-49.75 | chorus1g "Who"@48.00 "holds"@48.50 "the"@48.75 "pen?"@49.00 · Who holds the pen? · `whoHoldsThePen1` · bell 76 | 那个 who 字块:`bigType(['WHO', 'HOLDS', 'THE PEN?'], {justify: W-16, fitH: H-60, y: 44, valign: 'top', stepIn: {t0: 48, div: 4, enter: 'slam'}})`,每 16 分音符一个字母;笔**水平**横过顶部(`penBar`:尖端 (W-40, 28),绳向上到 (60, 4) 的指针);Clio scale 5 在右下,`pointUp` 指着它。铃音 49.0:圆环。 | kick snare clap bell | 1x |
| 50.00-51.00 | chorus1h "You"@50.00 "do!"@50.50 · chorus1h_gang "You"@50.00 "do!"@50.50(十二个复制也唱它)· You do! You do! · `youDo1` · stabs 50, 51 · riser [50,52] | `youDoFrame1`:YOU 作为黑字砸下(`bigType(['YOU', 'DO!'], {fit: W-32, slam})`),每个词落在它的拍上;Clio scale 7 在底部中央:在 "You" 上做指点(`pointCam`,连指手对着镜头),在 "do!" 上做指笔(`pointUp` 指着白笔);"do!"@50.50(clap):指针处 `clickBurst`,3 份复制。**两张软盘的条** `floppyBar(50, 52, fld)`:一条黑条 (8, H-20, W-16, 12),左端一个软盘图标,右端抠出 `2,902,645 / 2,949,120 B`,按 16 分音符填充并在 51.875 停在 98.4%(差一格;它从不填满)。stab 50:在 YOU 上 punch。笔挂在 (W-56, 6) 的指针下。 | stab clap kick riser | 1x |
| 51.00-51.625 | "You"@51.00 "do!"@51.50 · stab 51 · clap 51.5 | 第二个 "You":只有 YOU 这些字母反相 1 帧(只反相大字,不反相画幅:闪光预算),大字大一档;"do!"@51.50 在 1x 砸下,clap 的三圈环迸出:**第二个 YOU DO! 被完整读出**。"!" 的那个点是 `DOT_F`(来自 bigType 的返回:'!' 字形最下面的那个字体像素,`sx` 见方,加上台面偏移)。 | stab clap | 1x |
| 51.625-52.00 | · `ch04 dive` · bells 51.625/.75/.875 | **下潜 1,甩镜头**:`diveInto(52 - 3/8, 52, DOT_F.x, DOT_F.y, youDoFrame1, 'ch05 lala', {pw: DOT_F.w, color: C.black, power: 2, pw…})`:进入感叹号的那个方点;方块是**黑色**的,它内部青柠后副歌在三个铃音上从 3 px 长到整幅(方块边缘上三次白色环闪,每 16 分音符一次);YOU DO! 的字母从旁掠过。三个 16 分音符,180x。 | stab bell riser | 1x → 180x |

### ch05 · 后副歌 1:乐队、弹跳笔(52.00-60.00) · `src/ch05.js` · 30 KB · 青柠 · 1999

场景(`era: 'platinum', raw: true, screen: true`):`ch05 lala`(52-54:乐队展台;这个名字是与 ch04 下潜的契约)、`ch05 name the ad`(54-56)、`ch05 chops`(56-58)、`ch05 stutter`(58-59.833)、`ch05 drain`(59.833-60,raw)。Jersey 弹跳:每次 kick 笔都闪;乐句反相在 52/54/56/58;clap 在 x.5 = 指针 (W-56, 6) 处 `clickBurst`。**一个主角:那支弹跳的笔。** 白笔在每个被唱出的音符上笔尖朝前从 LA 跳到 LA(`bouncePen`:每次跳跃是一条 8 步的整像素抛物线,笔尖在音符上敲到字形的顶部中央;绳拖向右侧顶部的指针),这是最古老的跟唱装置;la-la 大字就是舞台;除了这支笔,没有东西告诉人群该怎么唱。没有 chop 标签,没有每拍一个姿势的杂乱:Clio(scale 5,右侧)以 `voice: 'choir'` 唱,只在 chop 的嘴形上做招牌动作(每次 chop 头部反相 1 帧)。

| 时间 | 歌词 | 包袱 | 乐队 | 摄影机 |
|---|---|---|---|---|
| 52.00-54.00 | q3 "La"@52.00 "la"@52.25 "la,"@52.50 "la"@52.75 "la"@53.25 "la"@53.50 "la."@53.75 · La la la, la la la la. · `post1`/`lala` · crash stab | 应付的落地:`landFX(hit('post1'))`。屏幕在 52.0-52.5 内从 576 步进到 608。**乐队展台**:`bandGrid(0, 0, W, H, {t, field: fld})` 填满画幅(底色模式下 A:、B:、KICK、SNARE、CLAP、CRASH、BELL 的垫子,实心黑色乐器带青柠镂空,每一个在自己的重音上砸下并反相;Jersey kick 落在 KICK 垫上,A/B 音符落在驱动器上);la-la 那一行横贯网格中排的黑色板块上(`kara(lyric('q3'), W/2, H/2 - 10, {align: 'center', plate: C.black, color: fld, scale: 4, mode: 'pop'})`),而**笔沿着它弹跳**:每个音符上笔尖朝前从 LA 跳到 LA,也落在每个音节下面的垫子上(在 kick 上它闪一下)。crash 上做像素排序。 | crash stab kick clap A/B | 1x |
| 54.00 | q4 "La"@54.00 … "la."@55.50 · `lala` 重新开始 | `scanWipe(54 - .25, 54, …)` 把网格擦成舞台:唱片作为一张半径 104 的黑圆盘在 (168, 196),在大字**背后**(只有它的第十一道纹,一圈半径 100 的青柠环,从 56.0 起按 riff 音符脉动;唱臂是黑的,从 (300, 80) 起,已经落在它上面);la-la 字块 `bigType(['LA LA LA,', 'LA LA LA LA.'], {words: lyric('q4'), fit: 280, x: 320, align: 'left', valign: 'middle'})` 在右边,每个 la 在它的音符上步进进来;笔从一个框弹到另一个框;Clio scale 5 在 (470, H-8),`voice: 'choir'`,做 `bounce`。 | kick clap | 1x |
| 54.00-56.00 | q4 | 测验卡:一块黑板从右下角滑上来(54.0-54.25),青柠镂空 Chicago 2x,只有一行:"Track 11 · Name the ad." 55.00:答案盖印在它下面:"Not in the deck."(青柠药丸,黑字)。没有标题药丸。 | kick clap | 1x |
| 56.00-58.00 | q5 "La"@56.00 … "la."@57.75 · chops 56.75 "pen", 57.25 "pal" · `lala2` | 管风琴低一个八度回来:第十一道纹在每个 riff 音符上脉动(2→4 px)。chop:Clio 嘴的镂空 E / A,每次 chop 她的头反相 1 帧;没有标签。卡片留着。笔继续弹跳。 | kick clap chop riff | 1x |
| 58.00-59.50 | q6 "La"@58.00 … "la."@59.50 · chops 58.75, 59.25, 59.375, 59.5 "pen", 59.75 "pal" | 结巴:每个 16 分音符 chop 她的头就反相。笔最后一跳落在 59.5 最后一个 "la." 上。 | kick clap chop | 1x |
| 59.50-59.833 | — | **笔跳回家**:从最后一个 LA 到指针一次高跳(59.5-59.75),在 `NIB_HOME_F` = (573, 183)_F 处悬着并被冻结(`t: 59.5`)。 | kick | 1x |
| 59.833-60.00 | — · `ch05 drain` | `frameInto(A, t, 'ch05 stutter')` 之上的 `inkFlood(60 - 10/FPS, 60, 573, 183, tt => ctx.drawImage(frameInto(B, tt, 'ch06 chat'), 0, 0), {drain: true, steps: 10, seed: 3})`:青柠以 10 个硬步骤被吸回笔尖,排干时做像素排序,落在活的 Aqua 桌面上。 | — | 1x → ch06 |

### ch06 · 主歌 2,MultiFinder 与 Review Desk(60.00-76.00) · `src/ch06.js` · 44 KB · Aqua

场景(`era: 'aqua', screen: true`):`ch06 chat`(60-63.75)、`ch06 review`(63.75-67.75)、`ch06 flags`(67.75-74)、`ch06 keep`(74-76)。乐队:在画幅内时每次 kick 都弹出驱动器(大拍子)、A/B 磁头、hat(8 分音符,每 4 s 16 个)把 **"Check for drift."**(16 个字符,60.0-63.875)打进 ClioTalk 的输入框,没有牛铃反相,没有 riff 像素。DOOM 是那个昂贵的窗口:它的客户区每 4 帧 `memo` 一次。Dock 是开着的。**Review Desk 的矩形是 (8, 30, 268, 196)**(工具包里那个 164 px 高的窗口在 Aqua 下会裁掉它的计量表和注释行),而它开着时 ClioTalk 缩到 (8, 230, 268, 82);注释列放**短**注释('rhythm'、'generic'、'hedging'、'KEEP'),这样在 268 px 宽下没有东西会压到它的标签;完整的标记文字放在那个 FLAG **本身**上;表头右槽读作 **"Not a score."**(产品自己的免责声明)。吟唱那几行是 ClioTalk 里 Clio 的气泡:在临时底板上实心。Manuscript 在 63.75 被标为 **Final**(产品在 Review Desk 之前要求这一点:它的状态条在 "Review" 那个词上从 `Read-only · edit in Section Drafts` 翻成 `Final`),并一直保持 Final 到最后,所以 150.0 的 Return 落在一份 Final 手稿上。

| 时间 | 歌词 | 包袱 | 乐队 | 摄影机 |
|---|---|---|---|---|
| 60.00 | v2a "Chat"@60.00 · `verse2` · stab | `ch06 chat` 必须容忍 t < 60(ch05 排干进它):Aqua 主场桌面,指针在家,聊天里 Clio 的气泡在 60.0 到来。应付的落地:`punch(hit('verse2'), 573, 183, [2, 2]); invertFrame(hit('verse2'), 1)`。 | stab kick | 落地那一拍 1x(整张 Aqua 桌面,看到这个年代) |
| 60.00-63.75 | v2a "Chat"@60.00 "is"@60.25 "an"@60.50 "app."@60.75 "Not"@62.00 "the"@62.25 "whole"@62.50 "computer."@62.75 · Chat is an app. Not the whole computer. | Clio 的气泡(两行,实心,在一块幽灵底板上)。"an":`APP.doom(284, 30, 116, 100, {walk: t, header: '/go/doom'})` 在自由区放大打开(头 4 帧显示产品的 IWAD 提示,然后是工具包的窗口在玩);"app.":`APP.micropolis(284, 136, 116, 52, {built: prog(t, 60.75, 76), header: '/go/micropolis'})` 在它下面:MultiFinder,游戏放在手稿旁边,整段主歌都在玩(65.0 一个小鬼,66.0 写作者开火)。"whole"@62.50:ClioTalk 的缩放轮廓线鼓成整个屏幕(`zoomRects(home, {x: 0, y: E.menuH, w: W, h: H - E.menuH}, k)` 在 62.50-62.70 内,带拖影轮廓线),镜头提示翻成 `Sounds like a mouthpiece.`;"computer."@62.75:轮廓线在 2 帧内啪地收回家位矩形,`FX.shake = 2`,提示弹回 `Sounds like you.`。 | kick hat A/B | **从 60.5 起 2x (200, 230)**(气泡、游戏的左半);**"whole"@62.5 时 1x**(那条轮廓线需要整个屏幕),**63.0 时 2x (200, 230)** |
| 63.75-67.00 | v2b "Review"@63.75 "Desk."@64.50 "Check"@66.00 "for"@66.25 "drift."@66.50 · Review Desk. Check for drift. | "Review":Manuscript 的状态翻成 `Final`(状态条反相 2 帧)。"Desk."@64.50:`APP.reviewDesk(8, 30, 268, 196, {doc: 'The Tide Comes In Twice', header: ['812 words', 'The Tide Comes In Twice', 'Not a score.'], checks: four pending, reveal: prog(t, 64.5, 65.5), you: 100})` 从 Dock 的 Review Desk 图标在 Manuscript 上放大打开;ClioTalk 在同一拍缩到 (8, 230, 268, 82)。歌词:Clio 的气泡。"Check"@66.00:四个转轮开始转;"drift."@66.50:一根漂移指针(计量表行右侧一个小表里的一条 1 px 线)摆过 20° 然后稳定。 | kick hat | **从 63.75 起 2x (150, 130)**(Review Desk 的行和计量表;气泡的顶行在裁剪的底边上:气泡坐在缩小后的 ClioTalk 顶部) |
| 67.75-68.75 | v2c "Too"@67.75 "regular?"@68.00 · Too regular? | Review Desk 瞄准歌手:第 1 行变成 "Rhythm",带 Clio 的波形:16 根一模一样的条(8x4 px)随每个吟唱音节脉动;这一行被选中。 | kick hat | 2x (150, 130) |
| 69.00-69.50 | v2c_flag "Flag"@69.00 "it."@69.25 · Flag it. · `flagIt1` · clap | 那一帮:`clickBurst(…, 69.0, {copies: 12, kind: 'hand'})`:十二个指针随 clap 在 Rhythm 行上盖下一面红旗,它的标签 **"Over-regular rhythm"** 挂在一小块 1 px 白底板上,从旗子上垂下来(歌词 "Flag it." 是十二张嘴沿底部的那块底板);十二个 scale 1 的 Clio 沿底部(y 300)喊,69.5 消失。 | clap | **半秒里 1x**(十二个指针和十二个 Clio 需要整个屏幕) |
| 69.50-70.00 | (踉跄)· `stumble`@69.625 · toms 69.625/.75/.875 | **一次看得见的失足**:从 69.50 起画面**顿住**(69.50 那一帧被重复 4 帧,驱动器磁头停住,弹出驱动器卡在半途);在第一个 tom(69.625)上整个桌面**下坠** 4 px 并在三个 tom 上弹回(4 → 2 → 0 px);在同一帧 Clio 的头从身体上弹开 2 px,一帧后又回来。这里没有军鼓(EVENTS 在 68.5 和 70.5 之间没有)。"-ner-"@70.0 回到正轨。 | tom | 2x (150, 130)(下坠表现为整个裁剪在猛晃) |
| 69.75-70.50 | v2d "Generic?"@69.75 · Generic? | Clio 的一个新气泡:"In today's fast-paced world, the estuary fills.",其中 "In today's fast-paced world" 被选中(年代的选中样式)。歌词在气泡底板的标签行里。 | kick | 2x (150, 200)(气泡) |
| 71.00-71.50 | v2d_flag "Flag"@71.00 "it."@71.25 · `flagIt2` · clap | 十二个指针在第 2 行 "Summary language" 上盖下第 2 面旗:它的标签 "Generic summary language"。 | clap | 半秒里 1x |
| 72.00-72.75 | v2e "Press"@72.00 "release?"@72.25 · Press release? | 气泡继续:"We are excited to announce the tide.",其中 "We are excited to announce" 被选中。 | kick | 2x (150, 200) |
| 73.00-73.50 | v2e_flag "Flag"@73.00 "it."@73.25 · `flagIt3` · clap | 第 3 面旗盖在第 3 行 "Press-release hedging" 上:它的标签 "Press-release hedging"。现在还有三面小红旗挂在 ClioTalk 气泡的角上。 | clap | 半秒里 1x |
| 74.00-74.50 | v2f "Rough"@74.00 "edge?"@74.25 · Rough edge? | 第 4 行 "Personal detail":写作者那句参差的话 "Twice a day the estuary fills"(白底实心黑字)被选中;旁边是 Clio 抹平过的复制 "The estuary fills twice daily."(在一块幽灵底板上),戴着第 4 面旗:"Personal detail flattened"。 | kick | **两句上 3x (150, 110)** |
| 75.00-75.50 | v2f_keep "Keep"@75.00 "it."@75.25 · Keep it. · `keepIt` · 那记大 clap | 主唱在这段主歌里第一次开口唱(Clio `expr: 'happy'`)。写作者那句得到一个**朱红**的 "KEEP" 印章(Chicago 2x,朱红边框,3 帧过冲),盖在 clap 上(`clickBurst`,1 份复制,朱红圆环);抹平过的复制,它的底板和字母作为 TEMPORARY 溶解(在半秒内从 50% → 0,2x2 单元)。"Keep it." 在 75.00 出现在气泡里,它的底板在 75.25 变成**纯白**:这是写作者留下的第一句 Clio 自己的话,而它说的是"留下"。镜头提示:`Sounds like you.`,它从没动过。 | clap | 3x (150, 110) |
| 75.50-76.00 | — | 保持这个状态以便交接(§6 B6)。 | kick | **75.5 时 2x (150, 130)**(B6 的状态在两侧都是 2x) |

### ch07 · 预副歌 2(76.00-84.00) · `src/ch07.js` · 30 KB · Tiger → 从邮戳泛色

场景:`ch07 check`(76-80,`era: [[75.9, 'aqua'], [76.0, 'tiger', 'wipe']], morph: .35, screen: true`)、`ch07 pen`(80-83.833,`era: 'tiger'`)、`ch07 flood`(83.833-84,raw)。76 的 stab 以一次擦除把桌面换成拉丝金属。铃鼓先是 8 分音符(76-80)然后 16 分音符(80-82.625):每一下 Review Desk 的滚动滑块都走一格。riser [76, 82.75] 是 Review Desk 自己的计量表行做成的一条进度条 "Reviewing…"。Clio 的台词:缩小后的 ClioTalk 里的气泡(实心,在底板上)。

| 时间 | 歌词 | 包袱 | 乐队 | 摄影机 |
|---|---|---|---|---|
| 76.00-78.00 | pre2a "I"@76.00 "can"@76.25 "check."@76.50 "I"@77.00 "can"@77.25 "flag."@77.50 · I can check. I can flag. | Clio 的气泡(一行)。"check.":ok 字形沿 Review Desk 的行每 8 分音符打一个勾;"flag.":三面旗每 8 分音符重新盖一次(反相 1 帧)。游戏继续玩。 | kick(4 踩) hat tambourine riser | **stab 上 1x**(Tiger 的擦除整体看一拍);从 76.5 起 2x (150, 130) |
| 78.00-80.00 | pre2b "I"@78.00 "could"@78.25 "smooth"@78.50 "it."@79.00 "I"@79.25 "won't."@79.50 · I could smooth it. I won't. · `smooth`@78.5 · bell 79.5 | 一个新气泡提供抹平过的复制 "The estuary fills twice daily."。在 "smooth"@78.50 上低通滤波关闭:气泡底板的角变圆(在那一拍里从 r 6 到 r 14),它的填充熔成平灰,字母变粗(这里字母就是包袱:它们在 scale 2 下按 2x2 单元从 50% → 25% → 12%,像素越来越少,辅音被抹平)。"it."@79.00:写作者参差的那句在第 4 行下闪出一条 1 px 的朱红下划线(仍然实心,仍然参差)。"won't."@79.50:抹平过的气泡作为 TEMPORARY **掉落**(6 帧),Writing Bell 响起:`bellRing` 落在 Dock 的 Writing Bell 图标上,伴随 Dock 弹跳;圆环沿屏幕向上荡。 | kick hat tambourine bell | **"smooth" 上 3x (150, 200)**(熔化的字母填满画幅);"won't." 上 2x (150, 200)(气泡掉落,Dock 的铃铛在裁剪底边:关键帧 (150, 240)) |
| 80.00-82.00 | pre2c "But"@80.00 "the"@80.25 "pen"@80.50 "and"@81.00 "the"@81.25 "page"@81.50 · But the pen and the page | 像 pre 1 那样,但在拉丝金属里:笔从 80.5 起在 8 分音符上长大 1→2→3,指针到 (330, 36);"page"@81.50:`APP.sectionDrafts(146, 104, 220, 120)` 居中放大打开(在 `after` 里)。军鼓先是 8 分音符然后 16 分音符拍打纸页;铃鼓的 16 分音符嗒嗒地敲它的滚动条。歌词:(240, 160, 160, 40) 处一块底板,实心在蚂蚁线上。 | kick snare tambourine riser | **从 80.5 起 3x (300, 110)**,随笔收紧 |
| 82.00-82.75 | pre2d "stay"@82.00 "in"@82.25 "your"@82.50 "hand."@82.75 · stay in your hand. | 两条点线轮廓伸出:Clio 的 `reach` 手,以及来自 ClioTalk 气泡尾巴的第二条点线手。riser 填满。 | riser | 3x (300, 110) |
| 82.75 | "hand." · `stop2` · HAND 重音 | 猛晃(`FX.shake = 2`),Dock 废纸篓上哽咽的 crash(鼓出 2 px,啪,3 帧),笔尖上的 stab punch,镜头提示抖动并保持,铃鼓停止,一切**冻结**(`t: 82.75`)。 | stab chokedCrash | **4x (300, 150)** |
| 83.00-83.25 | `air2` | 什么都不动。 | — | 4x (300, 150) |
| 83.25-83.83 | chorus2a "I'm"@83.25 "just"@83.50 "your"@83.75 | Clio 的嘴;词在底板上实心弹出;**这次指针把笔水平地带下来**(笔在 16 分音符上分 4 个硬步骤从垂着转成水平,riser [83,84]),像一只手放下橡皮图章;83.833 时笔杆在 TIP = (264, 170) 屏幕 = (280, 172) 画幅把纸按平,纸上一枚黑色**邮戳** `PEN PAL · 2009`(桌面倍率下 r 40,两条注销杠)在它下面出现。 | riser | 4x (300, 150) |
| 83.833-84.00 | — · `ch07 flood` | 释放到 1x(同 ch03)。`frameInto(A, t, 'ch07 pen')` 之上的 `inkFlood(84 - 10/FPS, 84, 280, 172, tt => ctx.drawImage(frameInto(B, tt, 'ch08 pen pal'), 0, 0), {steps: 10, seed: 2})`:青柠**从印章上**泛出(邮戳的中心),没有笔的拖痕:墨来自印章,不是笔尖。 | — | 1x → ch08 |

### ch08 · 副歌 2:许多;后副歌 2(84.00-104.00) · `src/ch08.js` · 40 KB · 青柠 → 品红

场景(`raw: true, screen: true`;副歌用年代 `[[84, 'snowleopard'], [92, 'lion']], morph: 0`,后副歌用 `'yosemite'`):`ch08 pen pal`(84-85.75)、`ch08 never hold`(85.75-88)、`ch08 land`(88-91.25)、`ch08 harmony`(91.25-93.75)、`ch08 never hold 2`(93.75-96)、`ch08 who`(96-98)、`ch08 you do`(98-99.625)、`ch08 dive`(99.625-100,raw)、`ch08 lala3`(100-102)、`ch08 lala4`(102-103.833)、`ch08 drain`(103.833-104,raw)。`beatFX(t, {stab: true, anyCrash: true, punchAt: hero})`(92 的 crash 不是段落起点)。

**副歌 2 是在副歌 1 的语法上做乘法。** 同样的大字,同样的招牌动作,同样最重的那下 "pen.",外加:从 91.25 起的和声孪生体;十二个一帮(scale 2,沿底边一排,带光环)在两个回声上跳招牌动作;提示**级联**,87.5 四块、95.5 八块,像参考影片里的错误级联一样拖过画幅;邮戳先读 2009,然后 2011;在 "or I fade" 里写作者救下一个词。铃鼓的 16 分音符在邮戳还在屏幕上时抖动它的注销杠。没有 `slabWindow`,没有 Lion 标题栏换皮(在黑板上一片无形:砍掉)。

| 时间 | 歌词 | 包袱 | 乐队 | 摄影机 |
|---|---|---|---|---|
| 84.00 | chorus2a "pen"@84.00 "pal,"@84.50(带 "I'm just your" 在 ch07 里 83.25-84)· `chorus2` · crash stab bell | 应付的:`invertFrame(hit('chorus2'), 2)`。"I'M JUST YOUR" 小字在上方,实心;PEN / PAL 海报在青柠上;Clio scale 5:星星跳、涂抹、挥手;笔尖圆环;像素排序。 | crash stab kick bell sub | 1x |
| 85.25-85.75 | chorus2a_echo "(pen"@85.25 "pal)"@85.50 | 邮戳 `PEN PAL · 2009` 砸下,航空邮件边框扣上,而**十二个一帮**(scale 2,x 20 + i·52 沿底边,`rim: fld`)弹起来,与 Clio 一致地做涂抹和挥手。它们在 85.75 消失(4 帧内掉到边缘之下)。 | snare tambourine | 1x |
| 85.75-87.50 | chorus2b "I'll"@85.75 "never"@86.00 "hold"@86.50 "the"@87.25 · I'll never hold the | 字块在左。在 "hold" 上**尝试 3**:伸展、猛拉。 | clap snare | 1x |
| 87.50-88.00 | "pen."@87.50 · stab 87.75 · bell | 最重的重音(punch [3,3,2,2],笔闪,PEN. 反相 2 帧)以及**四块提示,以窗口拖影方式级联**:`noticeSlab(…, {n: 4})`,四份复制各偏移 (8, 6),在半拍里从左上朝中心拖(`track`,整像素,旧的复制留在后面,像被拖拽窗口的拖影)。指针在 87.75 环住最前面那块 [OK];四块都离开。 | stab bell kick | 1x |
| 88.00-90.00 | chorus2c "You"@88.00 "say"@88.25 "where"@88.50 "I"@88.75 "land,"@89.00 | scale-8 的落地在指针下方;这次落点是一块黑色 CD 板(半径 40,青柠孔)在底部中央:"那些词落在 Project CD 上":她以 `cheer` 落在它**上面**,它转一圈(89.0-90.0)。 | kick clap | 1x |
| 90.00-91.25 | chorus2d "or"@90.00 "I"@90.25 "fade."@90.50 · `fade2` | **淡出 2:写作者选择它落在哪里。** 底色抖动消失时(90.5-91.0)指针走到 LAND 这个词上(上一个字块留下的,缩小画在左下),并在 90.75 **点**它:一圈朱红点击环,1 份复制,那一个词在全黑上保持**实心黑**,用底色色描 1 px 边所以读得出来,其他一切都消失。91.0-91.25:黑、笔、LAND,。91.25 的萨克斯把底色啪地拉回,LAND,也随之溶解(它只在想要的那一拍里被留下)。 | — | 1x |
| 91.25-93.75 | chorus2e "I'm"@91.25 "just"@91.50 "your"@91.75 "pen"@92.00 "pal,"@92.50 · chorus2e_h(和声,同样的词,低一个三度)· chorus2e_echo "(pen"@93.25 "pal)"@93.50 · stab 92 · crash 92 | **和声孪生体在 stab 上到来**:第二个 Clio(scale 5,`flip: true`,同样的 `seed` 所以乐句吻合)在 92.0 分 4 个硬步骤从底边 (110, H-8) 升起,主角(scale 7)在偏右居中:两个剪影同步做涂抹和挥手。"I'M JUST YOUR" 实心在上方;PEN / PAL 用 `stepIn` 掉落;punch;crash 的排序(`anyCrash`)。回声 93.25:邮戳 **`PEN PAL · 2011`**(年代随印章到来,不是随标题栏)+ 航空邮件 + 又是十二个一帮。 | stab crash kick clap bell tambourine | 1x |
| 93.75-95.50 | chorus2f + chorus2f_h "I'll"@93.75 "never"@94.00 "hold"@94.50 "the"@95.25 | 两个 Clio 都在 "hold" 上伸手(同一支笔被拉两次)。 | clap | 1x |
| 95.50-96.00 | "pen."@95.50 · stab 95.75 · bell | 最重的重音,以及级联里的**八块提示**(`n: 8`,拖影现在够到右下)。指针在 95.75 环住最前面那块 [OK];八块都离开。 | stab bell | 1x |
| 96.00-97.75 | chorus2g "Who"@96.00 "holds"@96.50 "the"@96.75 "pen?"@97.00 · `whoHoldsThePen2` · bell 97 | 那个 who 字块;孪生体对着水平的笔 `pointUp`;铃音圆环。 | kick snare clap bell | 1x |
| 98.00-99.00 | chorus2h "You"@98.00 "do!"@98.50 · chorus2h_gang(那十二个)· `youDo2` · stabs 98, 99 · riser [98,100] | `youDoFrame2`:YOU DO! 砸下;孪生体做指点和对笔的指点;98.5 一次 3 份复制的 clickBurst;两张软盘条,又一次停在 98.4%。 | stab clap riser | 1x |
| 99.00-99.625 | "You"@99.00 "do!"@99.50 · stab 99 · clap 99.5 | YOU 这些字母反相 1 帧;"do!"@99.50 在 1x 砸下;clap 的圆环。主角近侧**眼睛的镂空**(底色色,14 px)就是 `EYE_F`(来自 `clioDance` 的 `head` 框;章节引出那个像素)。 | stab clap | 1x |
| 99.625-100.00 | · `ch08 dive` · bells 99.625/.75/.875 | **下潜 2,甩镜头,进入 Clio 的眼睛**:`diveInto(100 - 3/8, 100, EYE_F.x, EYE_F.y, youDoFrame2, 'ch08 lala3', {pw: 14, color: fld, power: 2, outer: {era: 'lion', raw: true, screen: true}, inner: {era: 'yosemite', raw: true, screen: true}})`(那只眼睛是一个青柠方块,而在青柠内部,品红后副歌在三个铃音上长大)。 | stab bell | 1x → 180x |
| 100.00-102.00 | q7 "La"@100.00 "la"@100.25 "la,"@100.50 "la"@100.75 "la"@101.25 "la"@101.50 "la."@101.75 · `post2`/`lala3` · crash stab · chops 100.75 "pen", 101.25 "pal" | 应付的落地:`landFX(hit('post2'))`。品红,Yosemite。唱片圆盘在 la-la 字块背后(第十一道纹按 riff 音符脉动),la-la 字块,**弹跳的笔**,而它下面**十二个一帮跟着唱**(scale 2 沿底部,`voice: 'choir'`,每个 la 嘴都动,做 `bounce`);chop:主角的头反相一帧。 | crash stab kick clap chop | 1x |
| 102.00-103.50 | q8 "La"@102.00 … "la."@103.50 · chops 102.75 "pen", 103.25 "pen", 103.375 "pen", 103.5 "pen", 103.75 "pal" · riser [102,104] | 主角的头结巴。riser:沿底部(那一帮上方)一条黑条按 16 分音符填充,它的标签(品红镂空)是 "Loading twelve appearances…"。 | kick clap chop riser | 1x |
| 103.50-103.833 | — | 笔最后一跳在 103.5 落在最后一个 "la." 上,然后跳回家到 `NIB_HOME_F` = (573, 183)_F 并冻结(`t: 103.5`)。 | kick | 1x |
| 103.833-104.00 | — · `ch08 drain` | `frameInto(A, t, 'ch08 lala4')` 之上的 `inkFlood(104 - 10/FPS, 104, 573, 183, tt => ctx.drawImage(frameInto(B, tt, 'ch09 tunnel'), 0, 0), {drain: true, steps: 10, seed: 5})`:品红排干进笔尖;下面,桥段的 1988 桌面处于它的第一次保持中。 | — | 1x → ch09 |

### ch09 · 桥段:隧道、缩略图总览、翻页书(104.00-120.00) · `src/ch09.js` · 44 KB

场景(全部 `raw: true`,全画幅):`ch09 tunnel`(104-116)、`ch09 sheet`(116-118)、`ch09 stay`(118-120)。

**隧道,保持-甩。** `desk(era)` = `t => homeDesk(t, {cur: [300, 24]})`,经 frameInto 的 opts `{era, screen: true}` 渲染。`PERIOD_F(era)` = 那个年代在画幅坐标里的句号:在章节的第一帧把每个年代的桌面渲染一次到一块临时缓冲区里,读 `PERIOD`,加上 stage-2 偏移 (16, 2),缓存进一个映射(实测:它从 1988/1991 的 (159,137) 到 NeXTSTEP 的 (186,158)、Platinum 的 (171,157)、Big Sur 的 (168,163)、Liquid Glass 的 (173,163),屏幕坐标:位置接近,按年代重新瞄准)。一个场景函数跑全部十二年:`i = max(0, min(11, floor(t - 104)))`(排干会在 t < 104 渲染这个场景:要钳制),`Y = 104 + i`,`era_i` 来自列表 `[system6, system7, nextstep, drawingboard, platinum, aqua, tiger, snowleopard, lion, yosemite, bigsur, liquidglass]`,`hold_i` = 对 i ≤ 6(1988-2005)是 0.5,对 i = 7(2009)是 0.25,对 i ≥ 8(2011-2026)是 0.125。每一年都是锁在吟唱上的两件事:**(1) 保持,Y 到 Y + hold_i**:年代以 1:1 呈现,整体,桌面的界面装饰一览无余(桌面图案、标题栏、NeXT 的 Dock 列、Aqua 的细条纹、拉丝金属、玻璃),而那**一年作为海报大字**横砸在桌面上(`bigType(year, {scale: 10, invert: true, slab: true, pad: 2, slam: Y, x: FW/2, y: FH/2 + 40})`:黑底板上的白字,那个被唱出的词,六个字母宽;107.75/111.75/115.75 的牛铃让它反相一帧);**(2) 甩,Y + hold_i 到 Y + 1**:`diveInto(Y + hold_i, Y + 1, PERIOD_F(era_i).x, PERIOD_F(era_i).y, desk(era_i), i < 11 ? desk(era_i+1) : sheetFrame, {pw: 2, power: 2, outer: {era: era_i, screen: true}, inner: i < 11 ? {era: era_i+1, screen: true} : {raw: true}, mark: PERIOD_F(era_i+1)})` 进入那个朱红句号,写作者最后一个词 "fills" 在那个年代的字体里从旁掠过。从 "Oh-nine"@111 起保持缩短到一个 16 分音符,下潜开始接龙:桥段往上拧紧进缩略图总览,而不是平着跑完。每秒的落地 FX(每帧都调用,在它们的窗口之外是空操作):`landFX(Y)` 用于最近一次落地,`punch(104, 573, 183, [2, 2])` 用于排干的落地。吟唱那一行在一块 System 6 底板上:`withEra('system6', () => kara(lineAt(t, 'chant'), FW / 2, FH - 30, {align: 'center', plate: true, mode: 'pop'}))`(实心字母,底板才是临时的东西)。beep(104…115)= 落地的反相加分裂。112 的 sub drop:`FX.dy = 1`,`FX.shake = 1` 持续 2 帧。104 的 crash:1988 桌面里的 `trashCrumple(276, 290, 104)`(在保持里可见)以及 drop 的像素排序(`isDrop` 识别 `HITS.bridge`)。预算:一个下潜帧约 7 ms;这一章可以平均 10 ms(§9 规则 8)。

| 时间 | 歌词 | 包袱 | 乐队 | 摄影机 |
|---|---|---|---|---|
| 104.00-104.50 | b1 "Eighty-eight."@104.00 · `bridge`, `era_1988`, crash, stab, beep | 应付的:`punch(104.0, 573, 183, [2, 2])`、`landFX(104.0)`。**保持 1988**:1-bit 主场桌面整体,废纸篓在揉纸,弹出驱动器在吐盘,A/B 在步进,Clio 的嘴跟着吟唱,而 **1988** 以白字黑底砸在它上面。 | crash stab beep kick | 1x 保持 |
| 104.50-105.00 | — | **甩**:进入朱红句号;"fills" 以 Geneva、10-60x 从旁掠过;在那个点内部,1991 桌面从 3 px 长到整幅;105.0 的落地 beep。 | beep | 180x |
| 105.00-106.00 | "Ninety-one."@105.00 · `era_1991`, beep | 保持 **1991**(System 7:带明暗的标题栏、彩色图标),甩进句号 → 1995。 | beep | 保持,甩 |
| 106.00-107.00 | b2 "Ninety-five."@106.00 · `era_1995` | 保持 **1995**(NeXTSTEP:深色桌面、右边缘的 Dock 列、菜单是一列;窗口没有移动),甩 → 1998。 | beep | 保持,甩 |
| 107.00-108.00 | "Ninety-eight."@107.00 · `era_1998`, cowbell 107.75 | 保持 **1998**(Drawing Board,制图纸);那一年在牛铃上反相;甩 → 1999。 | beep cowbell | 保持,甩 |
| 108.00-109.00 | b3 "Ninety-nine."@108.00 · `era_1999` | 保持 **1999**(Platinum:那些斜面;手稿从这里起是 serif,所以 "fills" 以 serif 从旁掠过);甩 → 2002。 | beep | 保持,甩 |
| 109.00-110.00 | "Oh-two."@109.00 · `era_2002` | 保持 **2002**(Aqua,细条纹,Dock);甩 → 2005。 | beep | 保持,甩 |
| 110.00-111.00 | b4 "Oh-five."@110.00 · `era_2005` | 保持 **2005**(拉丝金属);甩 → 2009。 | beep | 保持,甩 |
| 111.00-112.00 | "Oh-nine."@111.00 · `era_2009`, cowbell 111.75 | 只保持 **2009** 一个四分之一拍;甩(0.75 s)→ 2011。加速开始。 | beep cowbell | 保持 .25,甩 |
| 112.00-113.00 | b5 "Eleven."@112.00 · `era_2011`, `subDrop` | 保持 **2011** 一个 16 分音符(808:落地时画幅抖 1 px 持续 2 帧);甩(0.875 s)→ 2014。 | beep sub | 保持 .125,甩 |
| 113.00-114.00 | "Fourteen."@113.00 · `era_2014` | 保持 **2014** 一个 16 分音符;甩 → 2020。 | beep | 保持 .125,甩 |
| 114.00-115.00 | b6 "Twenty."@114.00 · `era_2020` | 保持 **2020** 一个 16 分音符;甩 → 2026。 | beep | 保持 .125,甩 |
| 115.00-116.00 | "Twenty-six."@115.00 · `era_2026`, cowbell 115.75 | 保持 **2026** 一个 16 分音符(Liquid Glass,整体看 7 帧:够了);甩 → 缩略图总览:在 2026 最后一个像素里面是全部十二个(116.0 时内层画幅是 `sheetFrame`)。 | beep cowbell | 保持 .125,甩 |
| 116.00-118.00 | b7 "Twelve"@116.00 "eras."@116.50 "One"@117.00 "desk."@117.50 · Twelve eras. One desk. · `contactSheet`, stab 116 | `ch09 sheet`。应付的:`landFX(116)`、`punch(116, FW/2, FH/2, [2, 2])`。黑画幅。**我们这张桌面的 12 格缩略图总览**:十二张 160x90 的缩略图,一个年代一张,每张是 `frameInto(desk(era), 116.0)` 的一次 `shrink4`(4x4 盒平均,Bayer 量化,每个年代 `memo` 一次),按 4x3 铺在 (0, 45)-(640, 315),年份用白色 Geneva 写在各缩略图左下角一块 1 px 黑板里。116.0 时全部都在(我们下潜进了它们)。"Twelve":点名:每张缩略图按顺序反相 1 帧,每 16 分音符一张(116.0-116.75);"eras.":年份底板闪一下;"One":十二个句号(每张缩略图里一个 1 px 朱红)齐声眨;"desk.":一圈 1 px 白框分 4 步围住整个网格画出。歌词:顶部条带里(y 14)居中、白色的 `kara`(scale 2,Chicago),'pop' 模式。116.0 的半速节奏底鼓:缩略图总览反相 1 帧。 | stab kick | 1x |
| 118.00-118.125 | b8 "And"@118.00 · `collapse`, kick 118, riser [118,120] | `ch09 stay`。"And"(kick):1988 那张缩略图(左上)**扩大**,在连续三帧上分三个硬步骤(1x、2x、4x 最近邻,从它的格子朝中心去),变成 1:1、正片的 1988 主场桌面,其他十一张在它长大时被盖住。 | kick | 1x → 缩略图的 4x = 1:1 |
| 118.125-118.875 | "your"@118.25 "windows"@118.50 · your windows | **翻页书**:每个 16 分音符上(118.125、.25、.375、.5、.625、.75、.875:七次切换)整张桌面按下一个年代绘制,`frameInto(desk(era), t, {era, screen: true})` 经过 1991、1995、1999、2002、2005、2009、2014、2026(十二个里的八个;跳过的四个已经在缩略图总览里看过),而 Manuscript 和 ClioTalk **一个像素都不动**:所有界面装饰都在历史里频闪,环绕着写作者的文本和它的朱红句号,纹丝不动。那就是产品宣称,做成一个画面。riser [118,120]:歌词底板下一条白条。 | riser | 1x |
| 119.00-120.00 | "stay."@119.00 · kick 119, snares 119, 119.5-119.875 | "stay.":翻页书**锁**在 1988,桌面**反相**成负片(从 119.0 起 `FX.invert = true`:白字黑底;从这里开始按**名字**渲染,`frameInto(A, t, 'ch10 gate')`,ch10 的第一个场景在 120.0 之前只画反相桌面),笔尖轻敲那个朱红句号:`clickBurst(PERIOD_F…, 119, {pointer: false, color: FIELDS.vermilion})`,那个点眨两下。歌词:(120, 328, 400, 20) 处一块底板,FX.invert 开着时颜色预先反相。进入 breakdown 的军鼓滚奏(119.5-120):Manuscript 在 16 分音符上拍打 2 px(唯一一处拍打就是包袱:桌面在 drop 之前发抖),而桌面的噪声被扫干净。 | kick snare riser | 1x |

### ch10 · breakdown:两张软盘(120.00-128.00) · `src/ch10.js` · 30 KB · 负片

场景(`era: 'system6', screen: true`,每个桌面场景里 `FX.invert = true`):`ch10 gate`(120-122)、`ch10 model`(122-126)、`ch10 pivot`(126-127.833)、`ch10 flood`(127.833-128,raw)。负片:所有必须保持真实颜色的东西都预先反相(`INV`):朱红点(`homeDesk` 里 `neg: true`)、笔(`color: C.black, outline: C.white`)、任何印章。黑边反相成白色边框:那是负片自己的边框,是故意的。**驱动器在演奏**:floppyA/B 在 122、124、126 有两拍音(A 36/45/40,B 43/52/47),所以 A:/B: 的磁头在这些拍上步进,灯亮着;119 到 128 之间没有 kick,112 到 128 之间没有 sub,所以机房里别的什么都不动。"Two" / "floppies." 的那些闷响是烘进乐队里的拟音,按 k1 的**词时间**计时(120.25、120.5)。

| 时间 | 歌词 | 包袱 | 乐队 | 摄影机 |
|---|---|---|---|---|
| 120.00 | — · `breakdown` | `ch10 gate` 必须容忍 t < 120(ch09 从 119.0 起渲染它):在 120.0 之前**只**画反相主场桌面(指针在家,聊天空着,Clio 闭嘴)。从 120.00 起:`APP.floppyMeter(146, 60, 316, 150, {k: prog(t, 120, 120.2), from: [412, 230, 76, 58], count: 0, title: 'Two Floppies'})` 从弹出驱动器居中放大打开。 | — | 1x(整张反相桌面:观众必须看见驱动器弹出) |
| 120.25-122.00 | k1 "Two"@120.25 "floppies."@120.50 "It"@121.25 "fits."@121.50 · Two floppies. It fits. · `twoFloppies` | **贝斯就是启动载荷。** "Two"(闷响):驱动器 A: **弹出**它的盘(紧凑驱动器上的一次 `ejectDisk` 式动作,4 帧),盘飞出去(`track`,6 帧)砸进计量表的 Disk 1 槽,3 帧过冲并 `FX.shake = 1`;"floppies."(闷响):驱动器 B: 弹出,它的盘砸进 Disk 2。"It":`count` 在 16 分音符上分四个硬步骤从 0 → 1(工具包把 `count` 当作已计数字节的占比:为 1 时它显示 2,902,645 / 98.4% 已用,而 "Release gate: PASS" 只在 `count >= 1` 时打印出来);"fits.":PASS 盖下,带 1 帧反相(在负片里这就是一次正片闪光)。那些数字是产品的:2,949,120 字节里的 2,902,645,"Heavy tools load lazily, from a third disk.";第三个软盘图标半露在屏幕右边缘之外,标着 "heavy tools (lazy)"。那句被说出的话,在一块幽灵底板上**实心**(那是机器的声音),高度与计量表的状态条相同但高 16 px(一块位于 (146, 214, 316, 20) 的底板)。G 踏板:别的什么都不动。 | — | 从 120.5 起 2x (300, 140)(计量表、底板,以及裁剪右边缘那两台空驱动器) |
| 122.00-123.75 | k2 "Bring"@122.00 "your"@122.25 "own"@122.50 "model,"@123.00 · Bring your own model, · snaps 122.5, 123.5 · clap 123.5 · A/B 122 | "Bring":指针(它在 121.5-122.0 之间移动过)点击 ClioTalk 的 **"Connect AI…"** 按钮(产品自己的:模型是从 Control Panel 连接的,永远不是从 ClioTalk 的页眉),一个标题为 "Control Panel" 的 `dialog` 居中在 (146, 60, 316, 150) 打开,盖在计量表上,里面是纯文本列表,没有商标:"LM Studio"、"Ollama"、"DeepSeek"、"No model (look around)",每一项带一个 `check()` 框。"your" / "own":每个词一行;"model,":"Ollama" 被高亮。Snap 122.50:"LM Studio" 旁边的框打勾;snap + clap 123.50:"Ollama" 打勾,指针点它(`clickBurst`,1 份复制,预先反相的圆环)。A:/B: 磁头在 122 上步进(灯亮着)。歌词:Clio 的气泡(在一块底板上实心)。 | snap clap A/B | 2x (300, 140) |
| 124.00-126.00 | k3 "it"@124.00 "still"@124.25 "won't"@124.50 "hold"@125.00 "the"@125.25 "pen."@125.50 · it still won't hold the pen. · snaps 124.5, 125.5 · clap 125.5 · A/B 124 | 面板关闭;ClioTalk 的页眉读作 "Ollama · ready"。"still" / "won't":模型的名字(在一块幽灵底板上)从页眉上脱离出来,每帧 1 px 朝顶部挂着的笔走去(124.25-125.0);snap 124.5:页眉上出现一个勾。"hold"@125.00:它够到了;笔被猛地拉上 20 px。"the pen."@125.25-125.50:只读提示,产品里真实的那句话,作为 ClioTalk 自己的提示行(没有模态框,没有 "Ollama" 标题):`The drafting manuscript is read-only; use the current Section Draft instead.`,而镜头提示翻成 `Sounds like a mouthpiece.`(预先反相)。Snap + clap 125.50:指针正好在 "pen." 上点击提示的 [OK];那一行在 125.5-125.7 收拢;提示:`Sounds like you.`。A:/B: 在 124 上步进。歌词:Clio 的气泡(两行)。 | snap clap A/B | 从 124.0 起 2x (200, 200)(ClioTalk、走动的名字、裁剪顶部的笔) |
| 126.00-127.25 | — · `pivot` · risers [126,128], [127,128] · A/B 126 | `ch10 pivot`。E7sus4,没有鼓。计量表还开着;它的两条 Disk 条在 126.0 **清空**,随 riser 重新填充:**手绘在窗口自己的条之上**(工具包只在 Disk 1 满了之后才填 Disk 2,而一个 `count` 驱动不了两条条):Disk 1 在 16 分音符上从 126→128 填满,Disk 2 在 127→128 填满;标签行读作 "Spinning up…"(一处本地覆盖,在章节的报告里点名)。riser [126,128] 在每一拍上把负片的点图案摇 1 px(来自 `evSpan('riser', t)`,不是 sub:没有 sub)。A:/B: 在 126 上步进(它们最后一个音符)。指针从提示的 [OK] 回到 (300, 24)(126.0-126.8),笔摆着。 | riser A/B | **126.0 时 1x**(整个负片、那两条条、那些驱动器) |
| 127.25-127.83 | chorus3a "I'm"@127.25 "just"@127.50 "your"@127.75 | 无伴奏。Clio 唱(在负片里她是黑色带白色特征)。那三个词在一块位于 (120, 328, 400, 20) 的底板上实心弹出,预先反相。指针在 16 分音符上分 4 个硬步骤朝**9:16 竖列内**(画幅 x 219..421)Manuscript 的纸面下降:127.833 时笔尖触到,TIP = (244, 120) 屏幕 = (260, 122) 画幅。两条 Disk 条在 128.0 到达满。 | riser | **从 127.25 起 4x (244, 140)**,对准下降的笔尖和 Clio 的头(竖列在 4x 下) |
| 127.833-128.00 | — · `ch10 flood` | 释放到 1x。这 10 帧里 `FX.invert` 是**关**的。负片桌面是一张带 key 的镂花:`silhouette(C.black, () => { ctx.drawImage(frameInto(A, 128 - 10/FPS, deskFn + the pointer drawn inside with pointer()), 0, 0); }, {mode: 'stencil', invert: true, ink: C.white, key: 'c10-neg', keep: () => { the vermilion dot; the pen and cord, white }})`(静态六分之一秒:没人会看见那张冻住的嘴;黑边在它里面反相成白色,与之前的帧一致);`CUR = null`。在它之上:`inkFlood(128 - 10/FPS, 128, 260, 122, tt => ctx.drawImage(frameInto(B, tt, 'ch11 reboot'), 0, 0), {steps: 10, seed: 7})`:青色从笔尖泛出,带一道白色拖痕。128.0 时是 ch11 和那次推近。 | — | 1x → ch11 |

### ch11 · A 调的最后副歌:重启、那一排合唱队、沉默的笔(128.00-144.00) · `src/ch11.js` · 44 KB · 青 · 2026

场景(`era: 'liquidglass', raw: true, screen: true`;屏幕是 stage 3 = 整个画幅;`screenSize` 自己跑 128.0-128.3 的打掉黑边):`ch11 reboot`(128-129.75)、`ch11 silent pen`(129.75-132)、`ch11 land`(132-135.25)、`ch11 line`(135.25-137.75)、`ch11 give back`(137.75-140)、`ch11 who`(140-142)、`ch11 you do`(142-143.625)、`ch11 dive`(143.625-144,raw)。`beatFX(t, {stab: true, anyCrash: true, punchAt: hero})`(136 的 crash 不是段落起点)。

**副歌 3 就是那一排合唱队。** 128 的打掉黑边就是这个原因:画幅现在宽到能放一排**十二个**舞者,每个戴一个年代的剪影**帽子**(`eraHat(i, …)`:一条 System 6 标题条纹带、System 7 的带明暗带、NeXT 的黑条、Drawing Board 的铅笔线、Platinum 的斜面、一颗 Aqua 药丸、Tiger 的拉丝带、Snow Leopard 的光泽、Lion 的灯、Yosemite 的扁条、Big Sur 的圆角条、Liquid Glass 的菱形牌,全部作为底色色镂空画在 6 单位的帽子上),齐做招牌动作:`clioDance(26 + i·52, H-8, 3, t, {seed: 0})`(约 96 px 高,间距 52,肩膀重叠几像素,光环把它们分开;如果 `danceShapeTest` 说这一排糊了,降到 scale 2 并用间距 52,并在报告里说明)。人头数 1 → 2+12 → 12 个全尺寸。提示数 1 → 8 → **零**:她不再试了,而提示的缺席就是回报。每当主角单独需要画幅时,这一排就在 4 个硬帧里**沉到**底边之下(129.75、137.75),在下一个乐句再**弹**回来。每次 clap 都有**十二份**指针复制(12 份复制的 `clickBurst`)。写作者打出的 "PEN." 从 132.25 到 144 住在每一帧的左下角(scale 3,**朱红**):写作者的词留下来了。**9:16 竖列**:从 127.25(ch10)到 133.0,THE、槽位、Clio 的头和笔都留在一个居中的 202x360 竖列里(画幅 x 219..421),这样这个片段在一次竖屏裁剪后仍然存活。

| 时间 | 歌词 | 包袱 | 乐队 | 摄影机 |
|---|---|---|---|---|
| 128.00 | chorus3a "pen"@128.00 "pal,"@128.50(带 "I'm just your" 在 ch10 里 127.25-128)· `reboot`/`keyChange` · crash, stab, bell 88 · 那记推近 | 应付的:`invertFrame(hit('reboot'), 2)`(它与那次推近自己的两个反相帧和 2x 推近同时发生);然后黑边,黑色带一条白色边框线,分四个硬步骤滑走,每 2 帧一步,带速度线和一次抖动(自动):桌面第一次填满 16:9。第一帧上 `FX.flash = [C.white, 1]`。"I'M JUST YOUR" 实心在上方;PEN / PAL 用青色,比以往更大(`fit: W-24, fitH: H-110, valign: 'top', y: 36`);**十二个一排的合唱队**沿底部,戴着帽子,在 crash 上星星跳,然后齐做涂抹和挥手;笔尖圆环;像素排序。这段副歌里笔挂在顶部**居中**(W/2 - 5, 6)的指针下,在竖列里。 | crash stab kick bell sub | 1x |
| 129.25-129.75 | chorus3a_echo "(pen"@129.25 "pal)"@129.50 | 邮戳 **`PEN PAL · 2026`** + 航空邮件边框;那一排涂抹并挥手。 | snare | 1x |
| 129.75-131.25 | chorus3b "I'll"@129.75 "never"@130.00 "hold"@130.50 "the"@131.25 · I'll never hold the | 那一排沉下去;主角 Clio(scale 5)在底部中央弹起,她的头在竖列里。字块(为这段副歌居中):`bigType(["I'LL NEVER HOLD", "THE PEN."], {words: lyric('chorus3b'), t: Math.min(t, wordAt(L, 'pen.').start - 1/FPS), fit: W-40, fitH: 150, y: 40, valign: 'top'})`,第二行对齐到竖列(那一行 `justify: 202, x: 219`:THE 在 219..290,PEN. 的框在 300..421;那个 `t` 钳制意味着 PEN. 自己永远不会亮;它的字形框在 `letters` 里回来,`on: false`,它们就是那个槽位)。"hold"@130.50(clap,12 份复制):**尝试 6**:她 `pointUp`,而写作者把笔**拉出画幅**:绳缩短,直到 131.0 笔在顶部边缘之上;顶部只露出绳的末端。 | clap snare kick | 1x |
| 131.25 | "the"@131.25 · `bandOut` | THE 落成黑字。**那份静默被画出来了**:在这一帧颜色**排干**:从 131.25 到 132.0 用 `FX.posterize = [C.white, C.black]`:青色在一帧内啪地变成 1-bit 的 1988 纸色和黑色(读成静音:颜色随声音一起走了);乐队落下(从这里起 `beatFX` 关闭);Clio 在 `pointUp` 里**冻结**(`pose: 'pointUp', p: .5`),嘴的镂空**张着**(她唱了 "the");摄影机在 THE 和槽位上**硬推近** 2x:`stepZoom(2, 320, line 2's centre y)` 保持住,不衰减,于是竖列填满画幅。什么都不动。 | — | **2x (320, 槽位的 y)**,保持 |
| 131.25-131.625 | "pen."@131.50(无声)· `silentPen`@131.5 | 槽位里,一个闪烁的**朱红** I 形光标(槽位左边缘一个 4x40 的朱红矩形,在 16 分音符 131.25、131.5 上亮,中间灭):所有人都把它读成"轮到你来打了"。Clio 的嘴对着空无一物张着。仍然什么都不动。 | — | 2x 保持 |
| 131.625 | (keystroke)· `keystroke` | 写作者打字。**PEN. 以朱红**出现在它的槽位里(`bigType('PEN.', {pass: 'type', color: FIELDS.vermilion, slam: hit('keystroke')})` 在槽位的框上,+2 +1 0),它的字母在按下键那一帧是**白**的(1 帧),I 形光标跳到句号之后并开始眨。写作者的颜色,永远不是 Clio 的;在 1-bit 纸上它是画幅里唯一的颜色。131.625-132.00,22 帧:保持。Clio 的嘴仍然张着。笔从顶部边缘降回画幅,每帧 1 px。 | keystroke | 2x 保持 |
| 132.00 | chorus3c "You"@132.00 · `slamBack` · crash stab sub | 那一下砸回:posterize 和 stepZoom 在同一帧落下(青色和乐队一起回来),像素排序 2 帧(`isDrop` 识别 `HITS.slamBack`),在 PEN. 上 stab punch,`invertFrame(132, 1)`,`FX.shake = 6` 在 6 帧内衰减,Clio 的星星跳。新字块 YOU SAY / WHERE I / LAND, 砸进来;旧字块在反相之下消失;写作者的朱红 "PEN." 在 132.0-132.25 内分 4 步**缩**回它的角落(左下,scale 3)并**留到** 144。那一排合唱队弹回来。 | crash stab kick clap sub | 1x |
| 132.00-134.00 | chorus3c "say"@132.25 "where"@132.50 "I"@132.75 "land,"@133.00 · You say where I land, | scale-8 的落地:她以 `cheer` 落在这排的正中(两侧各六个舞者),脚踩在 LAND 的基线上;132.5 的 clap:`clickBurst` 12 份复制。**Liquid Glass 得到它自己的桌面一拍**:在 LAND 那一条(133.0-134.0)上,2026 主场桌面以 25% Bayer 的方式**透过**青色显现(一张 `desk(liquidglass)` 的带 key 镂花以 25% 铺在大字之下):玻璃是半透明的;那是标语后半句,被看见了。 | kick clap(12) | 1x |
| 134.00-135.25 | chorus3d "or"@134.00 "I"@134.25 "fade."@134.50 · `fade3` | 抖动消失到黑,134.5-135.0;半拍的静默 135.0-135.25:除了白笔和角落里写作者的朱红 "PEN." 之外全是黑。**只有写作者的词在淡出中活下来,而且还用写作者的颜色。** 135.25 的萨克斯:`invertFrame(135.25, 1)`。 | — | 1x |
| 135.25-137.75 | chorus3e "I'm"@135.25 "just"@135.50 "your"@135.75 "pen"@136.00 "pal,"@136.50 · chorus3e_h(和声,同样的词)· chorus3e_echo "(pen"@137.25 "pal)"@137.50 · crash stab bell 136 | `ch11 line`。"I'M JUST YOUR" 实心在上方;PEN / PAL 用 `stepIn` 掉落;那十二个做涂抹和挥手;136 上 crash 的排序(`anyCrash`);回声 137.25:邮戳 `PEN PAL · 2026` + 航空邮件。 | crash stab kick bell | 1x |
| 137.75-140.00 | chorus3f "I'll"@137.75 "never"@138.00 "hold"@138.50 "the"@139.25 "pen."@139.50 · chorus3f_h(和声)· stab 139.75 · bell 139.5 | 那一排沉下去;主角(scale 7)居中。**那次交还,是实体的,只发生一次。** "hold"@138.50(clap,12):写作者**松手**:绳从指针处变松,笔**掉落**(每帧 8 px);Clio 在 138.75 用两只连指手**接住**它,这是 139 秒里她第一次碰到它,伴随 2 帧的**冻结**。"the"@139.25:她把它**握柄朝前**、伸直手臂递出来,绝不是笔尖朝下(她从不写字)。"pen."@139.50:指针用一圈朱红点击环(1 份复制)把它拿回去,绳啪地绷紧;在 PEN. 上最重的那记 punch(这一块里是黑的)和笔尖圆环。没有提示,没有提示下沉:"I could smooth it. I won't." 作为编舞。 | clap(12) stab bell | 1x |
| 140.00-141.75 | chorus3g "Who"@140.00 "holds"@140.50 "the"@140.75 "pen?"@141.00 · `whoHoldsThePen3` · bell 141 | 青色的 who 字块;笔水平横过顶部;十二个一排弹起来,**全部十二个**齐声 `pointUp` 指着它。 | kick clap(12) bell | 1x |
| 142.00-143.00 | chorus3h "You"@142.00 "do!"@142.50 · chorus3h_gang(那十二个)· `youDo3` · stab 142 · riser [142,144] | `youDoFrame3`:YOU DO! 砸下;那十二个在 "You" 上做指点(十二只连指手对着镜头,被底边裁掉),在 "do!" 上做指笔;十二个指针在 142.5 点击(青色圆环 ×12);两张软盘条,第三次停在 98.4%。 | stab clap(12) riser | 1x |
| 143.00-143.50 | "You"@143.00 · stab 143 | YOU 这些字母反相 2 帧(只反相大字:高音 E5,全曲最高音);大字大一档;第二个 YOU DO! 在 1x 被完整读出。 | stab | 1x |
| 143.50-143.625 | "do!"@143.50 · clap 143.5 | **那次抛出**:在 "do!" 上指针一弹,笔脱离绳、笔尖朝前**朝镜头**来:这个 16 分音符上 scale 4 → 8,笔尖在画幅中心 (320, 180),尖端有一颗朱红墨滴(2x2,随笔缩放);十二个指针的圆环在它周围迸出。"You do" 把笔交到观众手里。 | clap bell | 1x |
| 143.625-144.00 | · `ch11 dive` · bells 143.625/.75/.875 | 笔继续逼近:143.75 时 scale 16,143.875 时 32(`youDoFrame3(t)` 画出它),白色填满画幅;**下潜 3** 进入那颗墨滴:`diveInto(144 - 3/8, 144, 320, 180, youDoFrame3, 'ch12 lala', {pw: 8, color: FIELDS.vermilion, power: 2, outer/inner: {era: 'liquidglass', raw: true, screen: true}})`;在朱红内部,品红结尾在三个铃音上长大。 | stab bell riser | 1x → 180x |

### ch12 · 结尾和尾巴:落在动词上的拉回、Return、Save、片尾卡(144.00-157.00) · `src/ch12.js` · 44 KB

场景:`ch12 lala`(144-148,raw:拉回,钩子在它上面)、`ch12 voice`(148-150,`era: 'system6', screen: true`,全画幅)、`ch12 return`(150-151,相同)、`ch12 save`(151-153.3,相同)、`ch12 end card`(153.3-END = DUR + 3.0 = 157.0,raw)。这一章铺到 END,不是 DUR。

**结尾就是落在动词上的拉回**:每个吟唱动词都是把历史通过句号往回拉一步的那个按钮。`pullBack(144, 148, [L_mag, L2014, L2009, L2002, L1988], {dot: false, ease})`,其中 `L_mag` = 品红结尾帧函数(底色、Clio scale 5 在右下跳舞、唱片圆盘、笔从右上角的指针垂下:这就是下潜 3 在 144.0 落进去的那一帧),而 `L_era = {draw: t => homeDesk(t, {cur: [300, 24]}), era, px: PERIOD_F(era).x, py: PERIOD_F(era).y, pw: 2}`(每个年代的 PERIOD 来自一次干跑渲染;所有画幅都是完整的 640x360)。`ease` 把工具包均匀的 k 映射到那些动词上:分段线性经过 (144 → 0)、(145.0 → .25)、(145.75 → .5)、(146.75 → .75)、(148.0 → 1),于是每一步的啪地收拢(两侧围绕中心方块合上,一个 2 帧分裂)都落在一个动词上:Save it.@144 开始第一次拉远(品红世界缩进 2014 的句号),Clip it.@145.0 → 2009,Insert it.@145.75 → 2002,Export it.@146.75 → 1988,在 148.0 以 1:1 落在 1-bit 的 1988 桌面上。Clio 随品红世界一起消退进那个句号:AI 的舞台缩进写作者的那个点。**覆盖层**,在拉回之后画在上面:(1) 沿底部排成一行的四块动词板(`bigTypes` 配 `invert: true`,黑板,品红字母),每一块在它的动词上砸下并被指针按下(2 px 的内缩,4 帧);(2) 沿顶部的 la-la(`bigType('LA LA LA, LA LA LA LA.', {scale: 4, y: 40, valign: 'top', words: lyric('o_la1')})`,然后从 146.0 起 `o_la2`),上面有**那支弹跳的笔**(交到观众手里的那支笔,从右上角那份指针复制上垂下的绳上,从 LA 跳到 LA);(3) 唱片,左下角一张半径 60 的黑圆盘,带品红标签 "11 · PEN PAL · AI SYSTEM 6",第十一道纹按 riff 音符脉动。三个钩子,一帧,而桌面在底下回来。

| 时间 | 歌词 | 包袱 | 乐队 | 摄影机 |
|---|---|---|---|---|
| 144.00-145.00 | o1 "Save"@144.00 "it."@144.25 · o_la1 "La"@144.00 "la"@144.25 "la,"@144.50 "la"@144.75 · `outro`/`lala4` · crash stab · bells 144, 144.25, 144.5, 144.75 | 应付的:`landFX(hit('outro'))` + drop 的排序。`ch12 lala` 必须容忍 t < 144(下潜 3 渲染它):品红帧 `L_mag` 整体。SAVE IT. 砸下(blip 144),指针按下它:**第 1 步**,品红世界啪地收拢并拉远进 2014 桌面的句号;la-la 开始,笔从 LA 跳到 LA;唱片转着。144 上除了应付的那一记没有别的 stab(EVENTS 里没有)。 | crash stab kick bell blip | 180x → 2014 的 1x |
| 145.00-145.75 | "Clip"@145.00 "it."@145.25 · o_la1 "la"@145.25 "la"@145.50 "la."@145.75 · blip 145 | CLIP IT. 砸下,被按下:**第 2 步**,2014 进入 2009 的句号。笔继续弹跳。 | kick bell blip | → 2009 |
| 145.75-146.75 | "Insert"@145.75 "it."@146.50 · o_la2 "La"@146.00 … "la"@146.75 · blip 146.5 | INSERT IT. 砸下,被按下:**第 3 步**,2009 进入 2002 的句号。 | kick bell blip | → 2002 |
| 146.75-148.00 | "Export"@146.75 "it."@147.50 · o_la2 "la"@147.00 "la"@147.25 "la."@147.50 · `exportCD`@147 · blip 147.5 · cowbell 147.75 | EXPORT IT. 砸下,被按下:**第 4 步**,2002 进入 1988 的句号;147.00 时唱片的标签盖下它的答案,**"This one."**(黑圆盘上的品红 Chicago 2x:"Name the ad." 的回报,没有卡片)。笔的最后一跳在 147.5 落在最后一个 "la." 上,然后跳回家。牛铃 147.75:`invertFrame(147.75, 1)`。148.0 时:1:1 的 1-bit 1988 桌面,全画幅,正片;覆盖层(板块、la-la、唱片)在那个 stab 的帧上、在它的反相之下落下。 | kick bell blip cowbell | → 1988,148.0 时 1x |
| 148.00-150.00 | o2 "It"@148.00 "was"@148.25 "always"@148.50 "your"@149.25 "voice."@149.50 · It was always your voice. · stab 148 · claps 148.5, 149.5 | `ch12 voice`。**一张静止、安静的桌面。** 1988 主场桌面,全画幅,指针在家,驱动器安静,Clio 在家唱着这一行(她的嘴是唯一的动作):Manuscript(Final)在 148.0 第一次作为它一直以来的东西**打开**(stab 上它的标题栏反相 1 帧),"fills" 之后的朱红句号,以及 "voice."@149.5 时在它之后出现的朱红 I 形光标。clap 148.5、149.5:指针处 `clickBurst`(1 份复制,朱红圆环),此时它正走到手稿末尾。歌词:底部中央一块 System 6 的 `kara` 底板,在蚂蚁线上实心(那些词是 Clio 的);"voice." 随颤音脉动 1 px。 | stab clap | **1x**(整张桌面,第一次 16:9 与 1-bit 同时出现) |
| 150.00-151.00 | "voice."(保持)· `bootChordOut`/`returnKey` · keystroke 150 | `ch12 return`。写作者在一份 Final 手稿上按下 RETURN:"fills" 的句号之后那个 2 px 朱红 I 形光标掉到一个新的空行(光标在这一行开头眨):Amaj9 响起。下一句是写作者的。Clio 的嘴对着被保持的 "voice" 张着;从 150.5 起**冻结**(颗粒循环:`blink: false`、`bob: 0`、嘴形锁住)。提示:`Sounds like you.` 底板仍然显示那一行(它一直到 151.0)。 | keystroke | **150.0 时 3x (150, 130)**(光标掉到新行),保持 |
| 151.00-153.25 | o3 "This"@151.00 "song"@151.25 "is"@151.50 "temporary."@151.75 · This song is temporary. · `saveDialog` | `ch12 save`。Save 对话框居中放大打开(0.2 s):`alert(W/2, H/2 - 10, {icon: 'note', w: 500, h: 132, lines: [line 1], buttons: ["Don't Save", 'Cancel', 'Save'], def: 2})` → 最终矩形 **(70, 104, 500, 132)**;第 2-4 行和那条条是**手绘**在返回的 `client` 矩形上的(`alert` 没有逐行样式)。第 1 行,实心 `ui`:`Save changes to the song "Pen Pal" before quitting?` 第 2 行(y +18),在一块 `ghostPlate` 上实心 Chicago 2x,随说话逐字打出(`kara` 的 'type' 模式):`This song is temporary.` 第 3 行(y +44),实心 `small`:**`system6.aaronlau.me`**(唯一的行动号召,从 151.0 起在屏幕上)。第 4 行(y +58),实心 `small`,影片在这里称量它自己的源代码:来自 `WEIGHT.bytes` / `WEIGHT.floppy` 的 `Source: 891,450 of 1,474,560 bytes (60%)`(这里的数字是今天的;卡片在构建时读 `WEIGHT`),右边有一条 160x8 的单软盘条;如果 `typeof WEIGHT === 'undefined'`,就没有第 4 行也没有条(数字是真的,或者就不显示)。[Save] 是默认按钮,它的圆环是**朱红**:指针下那个保存按钮。指针从手稿走到 Save并停在它上面。和弦衰减;驱动器安静;别的什么都不动。 | — | 对话框上 **2x (320, 170)**(第 1-4 行和按钮在裁剪内) |
| 153.25 | (click)· `saveClick` · click | 指针点击 [Save]:`clickBurst`(1 份复制,朱红圆环,箭头 `down` 5 帧)。第 2 行的底板在点击时变成**纯白**,蚂蚁线停止(被留下:歌曲之所以留存,只因为写作者选择了留它),并保持 3 帧。 | click | 2x (320, 170) |
| 153.30-153.45 | — | `ch12 end card` 在 `FX.crt = prog(t, 153.3, 153.45)`(镜头关闭)之下按**名字**渲染 `ch12 save`:画面坍缩成一条线,然后一个点(工具包最后两帧是它的白点),然后黑。 | — | 坍缩 |
| 153.45-153.55 | — | 黑。画幅中心一个朱红 2x2 点**飞**(`track`,6 帧)到这一行的右端,在 153.55 落下成为 **You may now write.** 的句号(白色 Chicago scale 3,居中,y 140)。 | — | 1x |
| 153.55-153.68 | (落地保持) | **这一行和它的点保持 8 帧,别的什么都没有。** | — | 1x |
| 153.68-157.00 | (片尾卡,保持 3.3 s) | 下面,白色 Geneva:`AI SYSTEM 6 · 1988 OBJECTS / 2026 INTELLIGENCE`(y 200),**`system6.aaronlau.me`**(y 216,Chicago 2x:读得出来)。底部是 1-bit、白在黑上的两张软盘计量表,只用**一张**软盘:一个软盘图标,一条 240x10 的条填到 `WEIGHT.bytes / WEIGHT.floppy`,一行文字 `The source of this whole film: 891,450 of 1,474,560 bytes · one floppy`(构建时的真实数字:最后运行 `tools/weigh.mjs`;WEIGHT 未定义就省略;它只统计源代码,从不统计渲染出的歌曲或画面)。歌曲在 154.0 结束;卡片保持到 157.0,渲染在那里停止。 | — | 1x |

## 6. 交接状态

**机制。** 一个边界之所以无缝,是因为拥有该过渡的章节按**名字**渲染接收方章节的第**一个场景**(`frameInto(buf, t, 'chNN name')`:`frameInto` 会在 `SCENES` 里查任何已注册的场景,不管它在哪个文件)。因此接收方的第一个场景必须 (a) 接受 `t < t0` 并画出它的 `t0` 状态(把 `local` 钳到 0,把任何年代索引钳到它的第一个值;由拍驱动的东西,比如舞蹈、笔的摆动和那些驱动器,可以继续动,它们取 `t`);(b) 自己施加落地的 FX(下面列出的 invert / split / punch),因为发送方到那时已经停止绘制;(c) 不从发送方读任何东西。邻居还没写出来的发送方不能抛错:`hasScene(name) ? frameInto(…) : (平坦底色或黑)`。桌面到桌面的边界(B1、B2、B6)没有过渡:两边都画同样的 `homeDesk`,带着列出的那些选项**以及同一个镜头关键帧**。每个边界上的两个章节都渲染对方的边界帧并互相比对(§9)。

| B | 时间 | 发送方 → 接收方(第一个场景) | 模式 · 年代 · 底色 | 屏幕 · 镜头 | 窗口和道具 | Clio | 指针和笔 | 接收方应付的落地 FX |
|---|---|---|---|---|---|---|---|---|
| B1 | 12.00 | ch01 → ch02(`ch02 spin`),没有过渡 | desk · system6 | 512x342 · **1x**(ch01 在 11.5 释放;ch02 的第一个关键帧是 12.0 **当天**的 2x (300, 90),也就是 "Spin" 那一拍,按两个文件的说法这一步发生在 12.0 并归 ch02) | `homeDesk(t, {cur: [300, 24]})`:聊天空着(`hero: false`),没有包袱窗口;提示 `Sounds like you.`;A/B 磁头在它们各自的音符上;弹出驱动器静止(上一次 kick 在 11.25) | 在家 (286, 196) scale 3,`expr: 'sing'`,嘴闭着(12.00 没有词) | (300, 24) 箭头;笔 scale 1 垂着(绳 (305, 39)→(309, 61),尖端 (309, 98)) | 无;ch02 用 `k = prog(t, 12, 12.2)` 打开 Route 窗口 |
| B2 | 28.00 | ch02 → ch03(`ch03 fetch`),没有过渡 | desk · system6 | 512x342 · **1x**(ch02 在 28.0 释放到 1x;ch03 的第一个关键帧在 28.5 之前是 1x) | 与 B1 相同(Route 在 27.5 关闭,提示在 27.95 关闭,Section Drafts 在 26.5 关闭) | 在家,嘴闭着;`expr: 'sing'` | (300, 24);笔同 B1 | 无 |
| B3 | 36.00 | ch03(`ch03 flood`,35.833-36)→ ch04(`ch04 pen pal`) | 剪影 · system7 · 品红 | 在 36.0-36.5 内从 512 长大到 576(自动)· 1x | 底色;"I'M JUST YOUR"(scale 3,实心)在上方;PEN 在 36.00 砸下 | `clioDance(W-90, H-8, 5, t)`:crash 上工具包的星星跳 | 指针 (W-56, 6);笔 scale 4 挂在绳上,`penRig` | `invertFrame(hit('chorus1'), 2)` |
| B4 | 52.00 | ch04(`ch04 dive`,51.625-52)→ ch05(`ch05 lala`) | 剪影 · platinum · 青柠 | 在 52.0-52.5 内从 576 长大到 608 · 1x(下潜的内层在 52.0 是 1:1) | 底色;`bandGrid(0, 0, W, H, {t, field: lime})` 全画幅;la-la 底板横贯它的中排;笔在第一个 LA 上 | 画幅里没有(网格就是画幅);Clio 在 54.0 进来 | (W-56, 6);笔从绳上弹跳 | `landFX(hit('post1'))` + drop 的像素排序(`beatFX`) |
| B5 | 60.00 | ch05(`ch05 drain`,59.833-60)→ ch06(`ch06 chat`) | desk · aqua | 608x356 · 落地那一拍 **1x**(ch06 的第一个关键帧是 60.5 的 2x (200, 230)) | `homeDesk(t, {cur: [300, 24], msgs: [{who: 'clio', text: 'Chat is an app. Not the whole computer.', at: 60.0}]})`:还没有包袱窗口(DOOM 在 60.5 打开);气泡在一块幽灵底板上 | 在家,嘴在 "Chat" 上张开 | (300, 24);笔 scale 1,在发送方里冻结在 `NIB_HOME_F`,在接收方里是活的 | `punch(hit('verse2'), 573, 183, [2, 2]); invertFrame(hit('verse2'), 1)` |
| B6 | 76.00 | ch06 → ch07(`ch07 check`),没有过渡;Aqua→Tiger 的擦除归 ch07(76.0-76.35) | desk · aqua→tiger | 608x356 · 75.5-76.0 时两侧都是 **2x (150, 130)**;ch07 的 stab 关键帧是 76.0 **当天**的 1x | `homeDesk` 配:Review Desk `APP.reviewDesk(8, 30, 268, 196, {doc: 'The Tide Comes In Twice', header: ['812 words', 'The Tide Comes In Twice', 'Not a score.'], you: 100, checks: [{label: 'Rhythm', state: 'flag', note: 'rhythm'}, {label: 'Summary language', state: 'flag', note: 'generic'}, {label: 'Press-release hedging', state: 'flag', note: 'hedging'}, {label: 'Personal detail', state: 'ok', note: 'KEEP'}]})` 盖在 Manuscript(状态 `Final`)上;第 1-3 行有三面红旗和它们的标签;第 4 行有朱红的 KEEP 印章;`APP.doom(284, 30, 116, 100, {walk: t})`;`APP.micropolis(284, 136, 116, 52, {built: 1})`;ClioTalk 在 (8, 230, 268, 82),消息为 `[{who: 'you', text: 'Check for drift.'}, {who: 'clio', text: 'We are excited to announce the tide.'}]`(气泡在它的底板上,角落有三面小旗) | 在家,嘴闭着,`expr: 'happy'` | (300, 24);笔 scale 1 | 无(morph 是 ch07 自己的关键帧) |
| B7 | 84.00 | ch07(`ch07 flood`)→ ch08(`ch08 pen pal`) | 剪影 · snowleopard · 青柠 | 608x356 · 1x | 同 B3,但在青柠里 | 星星跳 | (W-56, 6);笔 scale 4 | `invertFrame(hit('chorus2'), 2)` |
| B8 | 104.00 | ch08(`ch08 drain`)→ ch09(`ch09 tunnel`) | desk · system6(隧道第一个年代) | 608x356 · 1x(保持) | 第一次**保持**:608x356 屏幕内的 1988 年 `homeDesk(t, {cur: [300, 24]})` + 砸下的年份 "1988" + 底部的吟唱底板;废纸篓在揉纸(crash 104) | 在家,嘴在 "Eighty-eight." 上 | (300, 24);笔 scale 1 | `punch(hit('bridge'), 573, 183, [2, 2]); landFX(hit('bridge'))`;drop 的排序 |
| B9 | 120.00 | ch09(`ch09 stay`,从 119.0 起按名字渲染 `ch10 gate`)→ ch10(`ch10 gate`) | desk · system6 **负片**(`FX.invert = true`) | 608x356(白边框)· 1x | `homeDesk(t, {cur: [300, 24], neg: true})`,120.0 之前别的什么都没有;那个点画成 `INV(vermilion)`,笔预先反相 | 在家,嘴闭着 | (300, 24);笔 scale 1(预先反相) | 无 |
| B10 | 128.00 | ch10(`ch10 flood`)→ ch11(`ch11 reboot`) | 剪影 · liquidglass · 青 | stage 3:推近跑 128.0-128.3(两边都自动)· 1x | 底色;"I'M JUST YOUR" 实心;PEN 砸下;十二个一排的合唱队沿底部,戴着帽子 | 那十二个星星跳 | 指针 (W/2 - 5, 6)(竖列);笔 scale 4 | `invertFrame(hit('reboot'), 2)`,第一帧上 `FX.flash = [C.white, 1]` |
| B11 | 144.00 | ch11(`ch11 dive`)→ ch12(`ch12 lala`) | 剪影 · liquidglass · 品红,拉回的第一层 | 640x360 · 144.0 时 1x(下潜的内层),然后拉回的第一步立刻开始 | `L_mag`:底色、唱片圆盘、144.0 在覆盖层里砸下的 SAVE IT.、la-la 的第一个 LA 和落在它上面的笔 | `L_mag` 里的 `clioDance(W-90, H-8, 5, t)` | (W-56, 6) 处拿着弹跳笔的绳的那份指针复制;发送方抛出的笔变成了这一支 | `landFX(hit('outro'))` + drop 的排序 |

在 ch08 内部(99.625→100)、ch09 内部(每一秒)、ch12 内部(144→148、153.3→153.45),同一套纪律也适用于一个章节自己的场景之间:过渡场景按名字或按函数渲染落地后的场景。

## 7. 特殊时刻,精确到帧

1. **开场那个像素 → 句号(0.0-4.0)。** 第 0 帧:黑,在 (223, 146) 一个白像素,就是句号将要出现的地方;它在前两拍的 8 分音符上亮/灭。从 0.5 起摄影机拉回(反着放的 `pullBack`,点在 `dotAt: PERIOD_F`):**反相**的 Manuscript 窗口(白在黑上,1-bit)绕着那个像素长大,直到它自己的 2x2 句号接手;在 2.25("I'm")`negMs` 直接在 1:1 绘制,带 1 帧反相和 3 帧分裂,而这个窗口从那以后没动过;2.25-3.0 Clio 的第一句话作为白色幽灵抖动出现在它旁边;"pen"@3.0 反相一帧,**那支笔沿绳落进来**,它的笔尖在 3.25 落在句号上;3.5→4.0 光栅绕着笔从上到下写出真桌面,句号在笔尖下变成**朱红**出现。第 240 帧(4.0):drop、桌面、乐队;第 255 帧(4.25):镜头在大聊天上转到 2x。
2. **第一次泛色(35.833-36.0)。** 第 2150 帧:镜头从 4x 释放到 1x,笔尖在一张冻住的 1988 桌面(从 34.75 起冻住)上触到位于 (328, 179)_F 的纸页。第 2150-2159 帧:品红墨水从尖端以十个硬步骤泛出,笔尖后拖着一道白痕。第 2160 帧(36.0):画面就是那张品红海报,第 2160-2161 帧反相;PEN 带着它的 +3 +2 +1 0 过冲在屏幕上;Clio 在涂抹;底色在下一拍里从 512 宽步进到 576 宽。
3. **"Who holds the pen?" / "You do!"(48.0-52.0,以及 96、140)。** WHO / HOLDS / THE PEN? 对齐到屏幕,每 16 分音符一个字母,那支白笔在绳上水平横过顶部,Clio 向上指着它。50.0:YOU 作为黑字砸下,她指着你;50.5 是 DO! 她指着笔,同时三份指针复制点击;51.0 是第二个 YOU(它的字母反相一帧),51.5 是第二个 DO!,在 1x 被**完整**读出;第 3098-3120 帧(51.625-52.0):甩进感叹号的那个点,三个铃音,三次环闪:后副歌就住在 "!" 里面。
4. **桥段隧道(104-116)。** 十二年,每一年一个保持和一个甩。保持:年代以 1:1 整体呈现半拍(从 2009 起是四分之一拍,从 2011 起是一个 16 分音符),被唱出的那一年以白字黑底砸在它上面;甩:一次 `power: 2` 的下潜进入写作者的朱红句号,在每个年代里都接近同一位置,因为窗口从不移动;最后一个词 "fills" 在那个年代的字体里从旁掠过;每次落地都是一声 beep:在被吟唱的那一年上 1 帧反相加 3 帧分裂。保持从 2009 起缩短,所以桥段越拧越紧;最后一次下潜落进同一张桌面的 12 格缩略图总览里面。
5. **"Two floppies. It fits."(120.25-121.5)。** 在负片里:释放闸门的窗口;驱动器 A: 弹出,它的盘在 "Two" 上砸进 Disk 1,驱动器 B: 在 "floppies." 上,`count` 在 "It" 上分四步从 0 → 1,PASS 在 "fits." 上盖下;第三个软盘半露在屏幕之外:"heavy tools (lazy)"。产品的真实数字。那两台贝斯驱动器就是启动载荷;三次停在 98.4% 的 YOU DO! 条在这里被兑现。
6. **转调推近(128.0)。** 第 7680 帧:青色泛色完成,工具包的推近触发:两个反相帧配一次 2x 推近(7680-7681),然后黑边带着它们的白色边框线分四个硬步骤滑走,每两帧一步(7682-7689),速度线,一次在十帧内衰减的抖动;桌面第一次成为 16:9 并保持如此;十二个戴着十二顶帽子的舞者填满了它刚刚获得的宽度。
7. **沉默的笔(131.25-132.0)。** 第 7875 帧(131.25):THE 落下;乐队没了;青色**也随之而去**:画面啪地变成 1-bit 的纸色和黑色(`posterize [white, black]`),摄影机在 THE 和那个空槽位上硬推近 2x,Clio 冻住,向上指着,嘴张着;笔已经被拉出画幅。第 7875-7897 帧:一个朱红 I 形光标在 16 分音符上在槽位里眨。第 7897/7898 帧(131.625):一次按键:PEN. 以**朱红**出现,有一帧是白的,I 形光标跳到它后面。第 7898-7919 帧:保持;笔降回来,每帧一个像素。第 7920 帧(132.0):青色和乐队一起砸回来,crash、stab、invert、抖动 6、像素排序、Clio 的星星跳;写作者的朱红 PEN. 缩到那个角落并在副歌余下的时间里留在那里;在 "or I fade." 期间它是唯一剩下的大字。所有重要的东西都在那个居中的 9:16 竖列里。
8. **结尾落在动词上的拉回(144.0-148.0)。** 第 8640 帧:被抛出的笔上那颗墨滴绽开成品红结尾。SAVE IT.(144.0)、CLIP IT.(145.0)、INSERT IT.(145.75)、EXPORT IT.(146.75):每一次指针按下那块板,画面就在中心方块周围啪地收拢(2 帧分裂)并拉远进更老那一个桌面的句号:品红 → 2014 → 2009 → 2002 → 1988,Clio 随品红一起消退;la-la 带着弹跳的笔骑在顶部;唱片的标签在 147.0 说 "This one."。第 8880 帧(148.0):1:1、全画幅、1-bit 的 1988 桌面,静止;安静的桌面上 "It was always your voice.";第 9000 帧(150.0):写作者在一份 Final 手稿上按下 Return;光标掉到新的一行;和弦响起。
9. **"This song is temporary." → Save(151.0-153.25)。** Save 对话框 (70, 104, 500, 132):问题是实心的,Clio 被说出的话在一块临时底板上是实心的,URL,影片的字节重量,Save 的圆环是朱红。第 9195 帧(153.25):点击;底板变成纯白,蚂蚁线停止。歌曲被留下,因为写作者点了。
10. **CRT 坍缩和那个点(153.3-153.68)。** 第 9198-9207 帧:画面坍缩成一条线、一个点、黑。第 9207 帧:中心一个朱红 2x2 点;第 9207-9213 帧:它向右飞,落下成为 "You may now write." 的句号;第 9213-9221 帧:只有那一行和它的点。
11. **片尾卡称量影片(153.68-157.0)。** 黑底白字:"You may now write." · AI SYSTEM 6 · 1988 OBJECTS / 2026 INTELLIGENCE · system6.aaronlau.me(Chicago 2x)· 一个软盘图标,一条条,1,474,560 字节里的 `WEIGHT.bytes`,"the source of this whole film"。这个数字由 `tools/weigh.mjs` 在构建时写入,否则就不显示。卡片保持 3.3 s,足够把 URL 读两遍。

给 render.mjs 所有者的请求,从 TOOLKIT §12.3 保留下来(不阻塞):逐帧读 `FINISH_AT(t)`,在剪影模式下关掉暗角。

## 8. 预算:整部影片的源代码装在一张软盘里,以及保持的尾巴

**尾巴(已决定)。** 歌曲正好 154.0 s(`build/song.wav` 实测;`DUR` 154.0),而乐谱不生长出一条静默的尾巴:`data/data.js` 里的每个时间都保持原样。改为 render.mjs 把画面延续到歌曲之后:`END = DUR + 3.0`(157.0 s);`video` 默认渲染 `to = END`;音频输入得到 `-af apad`,复用改用 `-t END` 而不是 `-shortest`,于是最后 3.0 s 是静默之上的片尾卡。`renderCheck` 和 `sheet` 接受直到 END 的时间。这是对 render.mjs 的一处改动(约 4 行的编辑,归 ch12 作者的报告),而 §9 规则 2 读作 "铺满 0..END",只有 ch12 跨过 DUR。

**那些字节。** `tools/weigh.mjs` 把每个源文件(js、mjs、py、json、html、sh)对照一张 1,474,560 字节的软盘统计;Markdown 以词数报告、不计入;渲染出的歌曲(44 MB 的 wav)和画面从**不**计入:这个宣称是"这部影片的源代码",卡片和 Save 对话框就是这么措辞的。KB = 1024 字节。今天,在有章节之前,工作树重 **891,450 字节**(`node tools/weigh.mjs`,10 月 8 日;`data/weight.js` 仍然写着上一次构建的 877,308;每当歌曲的 Python 变化,这个数字就会动)。十二个章节分配 **456 KB(466,944 字节)**,外加 **24 KB 储备**(上限:480 KB = 491,520 字节)。按这个分配,影片重 1,358,394 字节(软盘的 92.1%,余量 116,166 字节);到上限是 1,382,970 字节(93.8%,剩 91,590 字节)。余量很薄:各章节合计超出 25% 就会打破卡片的宣称,所以每次加完一章都要重跑这个总和,而超出预算的章节不算完成。

| ch01 | ch02 | ch03 | ch04 | ch05 | ch06 | ch07 | ch08 | ch09 | ch10 | ch11 | ch12 | 合计 | 储备 | 上限 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 40 KB | 40 KB | 30 KB | 40 KB | 30 KB | 44 KB | 30 KB | 40 KB | 44 KB | 30 KB | 44 KB | 44 KB | 456 KB | 24 KB | 480 KB |

规则:每次改动之后都运行 `node tools/weigh.mjs`;影片必须轻于 1,474,560 字节,否则片尾卡就在撒谎。注释也算;写短注释。不要把风格样片卷粘进来:只抄你用到的少数几行(`penRig`、副歌帧的形状)。

## 9. 章节作者规则

1. **一个文件,`src/chNN.js`**,先 `'use strict';`,然后一个 `{ … }` 块,这样什么都不泄漏。每个顶层名字都加 `cNN_` 前缀。不要编辑任何其他文件(ch12 对 render.mjs 尾巴的那处编辑除外,§8)。如果工具包缺什么,就在本地定义它(30 行以内)并在你的报告里点名;§4 的 `homeDesk`、`lens` 及同类都逐字照抄。
2. **场景精确铺满章节的区间**:你那些场景的 `[t0, t1)`,按顺序,覆盖你的区间,没有空隙也没有重叠,第一个从你的起点开始,最后一个在你的终点结束;十二个区间铺满 0..END(157.0)。一个过渡(泛色、排干、下潜、拉回)是区间末尾它自己的 `raw: true` 场景;它在底下渲染的那个场景按名字或按函数调用,绝不用重叠。按 §5 列出的那样给你的第一个场景命名(那是契约)。
3. **时间来自歌曲。** `lyric(id)`、`wordAt(line, 'word')`、`hit(name)`、`section(name)`、`evList`/`evLast`/`evSpan`、`BEATS`。时间表达式里唯一的字面数字是偏移量(`- 10 / FPS`、`+ .2`、`- 3/8`)。分镜表里的一个时间是给你眼睛看的。
4. **歌词在屏幕上,逐字准确、可读、同步**:桌面模式下是场景自己 UI 里的 `kara` 或一个气泡,剪影模式下是带 `words:` 的 `bigType`。Clio 的话在**临时底板**上**实心**(50% 抖动、蚂蚁线、一个 TEMPORARY 标签),直到写作者把它们留下,那时底板变成纯白;写作者的话是白底实心;字母只在 scale ≥ 3 时才用 2x2 单元抖动。在剪影模式下,海报大字是给人群的,并以黑色落地(未唱的词在海报倍率下是幽灵)。让它避开菜单栏和 Dock;被唱出来时没有东西遮住它;它在镜头裁剪之内。
5. **每个被唱出的词都要有事情发生。** 表里说明了是什么。大重音落在拍上(`pulse`、`kick`、`hitPulse`、`beatFX`)。每个 "pen pal" 上做招牌动作。
6. **一镜到底。** 你的第一个场景容忍 `t < t0`;你自己施加你的落地 FX(§6);你的最后一个场景按名字渲染邻居的第一个场景,并用 `hasScene` 保护;在桌面边界上,指针、笔、Clio、每个窗口**以及镜头关键帧**都精确是 §6 的状态。绝不切换。镜头只在拍上重新定位。
7. **硬像素、纯函数**(TOOLKIT §1):不用 `Math.random`、`Date`、`performance.now`、`arc`、`stroke`、`fillText`、不用渐变、不用 alpha、不用平滑。抖动,不要淡出。
8. **预算**:桌面和副歌章节在你的区间内平均每帧低于 6 ms(`renderCheck`);ch09(十二次下潜)、ch12(拉回)以及 ch03、ch05、ch07、ch08、ch10 的泛色/排干帧可以平均 10 ms(一次下潜或拉回帧约 7 ms,一个泛色帧约 10 ms);ch09 的缩略图总览和 ch10 的负片可以到 10 ms(带 key 的镂花、memo 过的缩略图)。你的文件在 §8 的尺寸之内。
9. **闪光安全。** 一份共享的宣传片会自动播放;它必须通过光敏性检查(任何 1 秒窗口内不超过 3 次全面闪光)。全画幅反相只花在落地和乐句强拍上;词上的频闪是**只反相大字**或**只反相板块**(51.0、99.0、143.0 以及那些 chop 就是这样写的)。ch12 作者加上 `tools/flashcheck.mjs`(在一个区间内逐帧读 `renderFrame` 的亮度,并报告超过每秒 3 次转换的窗口);每个剪影章节都在自己的区间上跑它并报告结果。
10. **报告之前先检查**,按这个顺序:
    ```bash
    node render.mjs check 36 52                      # your range: no errors, avgMs within rule 8
    node render.mjs sheet 36 52 0.5 build/ch04.png    # LOOK at every tile: lyric readable? word sync? funny?
    node render.mjs sheet 12 28 0.5 build/ch02.png    # desk chapters: is the gag AND the plate inside every lens crop?
    node render.mjs still 39.5 build/ch04-still.png   # the hero frames of §7 at 1080p
    node render.mjs still 35.983 build/b3-a.png && node render.mjs still 36.0 build/b3-b.png   # both sides of each of your boundaries
    node tools/weigh.mjs
    node tools/flashcheck.mjs 36 52                   # silhouette chapters (once it exists)
    ```
    对一个剪影章节,还要通过 puppeteer 跑可读性审计(像 render.mjs 那样):`page.evaluate('legibilityAudit(36, 52)')` 必须返回 0 失败。也按 320x180 看一眼样表(缩到一半):在手机上每一帧的主体都该在四分之一秒里读得出来。也要渲染**邻居**章节的边界帧(你起点之前那一帧、你终点那一帧),并把它们和你自己的并排比较;如果邻居还没写出来,就渲染你这一侧并注明。
11. **报告**(在你的返回消息里,不是一个文件):场景和它们的区间、你的边界帧(路径)、avgMs、你的字节数、任何本地辅助函数和覆盖(逐盘填充、手绘的对话框行)、以及工具包应该长出什么。

## 10. 章节拆分,一口气说完

ch01 启动和引子(0-12:那个像素、笔在它的词上、光栅、四个按钮、哑剧)· ch02 主歌 1(12-28:透过镜头的路线,提示被教一次)· ch03 熔化和第一次泛色(28-36)· ch04 副歌 1,一个:招牌动作、提示、两张软盘条、下潜进 "!"(36-52)· ch05 post 1:乐队展台、弹跳笔、第十一轨、排干(52-60)· ch06 主歌 2:MultiFinder、Review Desk(Final,Not a score)、那些旗子、那次失足、KEEP(60-76)· ch07 pre 2:smooth、won't、邮戳泛色(76-84)· ch08 副歌 2,许多:孪生体、那一帮、提示级联、LAND 被留下、下潜进她的眼睛;post 2 带着那一帮(84-104)· ch09 桥段:保持-甩穿过十二个年代、缩略图总览、翻页书(104-120)· ch10 负片里的 breakdown:驱动器弹进闸门、Connect AI、青色泛色(120-128)· ch11 副歌 3,那一排合唱队:推近、1-bit 与朱红里的沉默的笔、接住和交还、抛出的笔(128-144)· ch12 结尾:落在动词上的拉回、"This one."、一张安静的桌面、Return、Save、保持的片尾卡(144-157)。

## 11. 修订

两位评论者审阅了修订 1。每一条 "must"(必须)都落实了;每一条让影片更大胆、更清楚或更真实的 "should"(应该)和 "could"(可以)也落实了;其余的在下面带着理由拒绝。12 章的拆分保持不变(没有评论者指出哪处接缝需要移动;ch12 只因为保持的尾巴而变长)。

**已落实(must)。** 副歌升级 1 → 2+12 → 12,提示 1 → 8 → 0(§1,ch04/ch08/ch11)· 招牌动作,种在引子的 chop 上(§1,每张剪影表)· 沉默的笔:PEN. 在 C1/C2 里是最重的重音,颜色在 bandOut 排干成 1-bit,2x 硬推近,朱红 I 形光标,朱红的 PEN.,9:16 竖列(ch11 131.25-132、ch10 127.25)· 最后三个 16 分音符里甩进 "!" 那个点、Clio 的眼睛和被抛出笔上的墨滴的下潜(§2,ch04/ch08/ch11)· 跟随光标的镜头,关键帧在拍上,主歌 2x / 预副歌 3x-4x / 泛色时释放(§2.1,每张桌面表)· Clio 的话在临时底板上实心,绝不抖动 9 px 的字母(§4,规则 4)· 片尾卡保持 3.3 s,URL 从 151.0 起在 Save 对话框上、在卡片上是 Chicago 2x(ch12)· 隧道作为保持-甩,年份作为海报大字,保持从 2009 起缩短(ch09)· 尾巴已决定:render.mjs 把歌曲补到 END = 157.0,不改乐谱(§8)· `count` 0 → 1 以及逐盘填充作为手工覆盖(ch10)· Review Desk 在 (8, 30, 268, 196) 配短注释,标记文字放在旗子上,ClioTalk 在它下面缩小(ch06,B6)。

**已落实(should / could)。** "And your windows stay." 的翻页书以 1:1 呈现(ch09)· 邮戳和航空邮件边框承载年代;Lion 的板块换皮被砍掉;Liquid Glass 在 LAND 条上透过青色显现(§1,ch08,ch11)· 计量表改用 Review Desk 自己的提示 "Sounds like you. / Sounds like a mouthpiece.",没有百分比,窗口里写 "Not a score.",在 4x 下被教一次(§1,ch02,ch06)· 只读提示把产品的真实句子用作 ClioTalk 的一条提示,绝不用模态框;"Ollama" 警示没了;副歌道具是提示板块,级联出现(§1,ch02,ch04,ch08,ch10)· 两张软盘条三次停在 98.4%,驱动器弹进闸门(§1,ch04,ch08,ch10,ch11)· 后副歌:一个主角,弹跳笔;唱片在大字背后;只写 "Track 11 · Name the ad.";post 2 里那一帮在笔下面唱(ch05,ch08)· 结尾落在动词上的拉回,唱片标签上的 "This one.",为 "It was always your voice." 准备的一张安静桌面(ch12)· 交还作为一次接住、一次握柄朝前的递出和一次点击(ch11)· 乐队被剪到只剩包袱和可读的乐器;52-54 的乐队展台,笔在垫子上弹跳(§3,ch05)· 淡出升级:彻底 / LAND 被一次点击留下 / 只有 PEN. 活下来(ch04,ch08,ch11)· 踉跄作为一次看得见的失足(ch06)· 笔在 "pen"@3.0 登场(ch01)· 没有 slabWindow,圆环只在 "pen" 铃音上,一个画幅预算(§1,ch04)· 闪光审计作为规则 9,以及只反相大字的频闪 · 泛色 2 来自邮戳(ch07)· A:/B: 在 122/124/126 演奏,pivot 在 riser 跨段上抖动,没有 kick(120),闷响来自词时间(ch10)· 打出的字符串按 hat 数配好,在某个词必须落地处用显式的 16 分音符按键(ch01,ch02,ch06)· 开场那个点在 (223, 146),第 0 层 `px/py`,`negMs` 从 2.25 起直接绘制并带有自己的揭示,宿主点 1x1(§2,ch01,§7.1)· `scanWipe` 配 `ctx.drawImage`(§2,ch01)· 只用真实的 `/go/` 路由(ch02,ch06)· 模型列表经由 "Connect AI…" 和一个 Control Panel 对话框(ch10)· `readerWin` 和 `POST_POSES` 在本地定义(§4)· Save 对话框 500x132,手绘的行和最终矩形(ch12)· 预算已核对,KB = 1024,今天 891,450 B,卡片说 "the source of this whole film"(§8,ch12)· `NIB_HOME_F` 作为吊具公式,每个 stage 的数字(§2)· 每个副歌开头都有 "I'M JUST YOUR",每个 `_h` / `_echo` / `_gang` id 都在它那一行写清(ch04,ch08,ch11)· Manuscript 从 63.75 起是 Final,Return 落在一份 Final 手稿上(ch06,ch12)· PERIOD "位置接近,按年代重新瞄准"、"几乎每个年代都是一种不同的字体",dive-5 的 serif 说明已修正(§2,ch09)· 69.6 处没有军鼓拍打,144 处没有 stab,ch08 和 ch11 里 `anyCrash: true` · ch09 里 `i = max(0, …)` · §7 的交叉引用 · 完整的路由名,Dock 明确说明是开着的,4 帧的 IWAD 提示(§4,ch06)· SONG §6 的道具被砍掉并说明了(§1)· ch09、ch12 和泛色帧允许 10 ms(规则 8)· 笔在包袱窗口之后重绘(`o.after`),ClioTalk 在 Dock 年代高 110(§4)· `ch12 end card` 在 `FX.crt` 之下渲染 `ch12 save`(ch12)。

**已拒绝。**
- "把一条极简的 Route 条加回来":拒绝;主歌 1 的 Route 窗口就是那条路线,512 px 的菜单栏在镜头提示旁边放不下八个站点,而 §1 现在转而说明了与 SONG §6 的这一处偏离。
- "十二个全高的舞者排成一行":改了,没有照字面采纳;十二个在 scale 7 下宽 1,700 px,所以那一排合唱队用 scale 3(是副歌 2 那一帮的 1.5 倍),主角用 5-8,那里一个身体就是那个镜头。
- "把第三行排成 'THE PEN.' 并对齐到 W-182":改了;副歌 3 的字块居中,它的第二行对齐到那个 9:16 竖列(x 219 处 202 px),这是 THE、那个槽位和 Clio 的头在一次竖屏裁剪后活下来的唯一办法;那个槽位仍然是同一次 `bigType` 调用里 PEN. 自己的字形框。
- "让结尾的排干在 Liquid Glass 桌面上落满一整拍"(给出的替代方案):拒绝,选择在 LAND 条上做 25% 的透视抖动,因为结尾现在没有排干(它落在动词上通过句号拉回),而 148.0 必须落在 1988 上以便 Return。
- "把乐队展台放在 drop 之后那 2 小节的引子里"(给出的替代方案):拒绝;4-8 是四按钮包袱和吟唱;展台占用 52-54,笔在垫子上弹跳,这样 la-la 从它的第一个音符起就仍然被教着。
- 翻页书里 "用 16 分音符轮完所有十二个年代":七个 16 分音符装八个年代,所以最后在缩略图总览里看过的四个被跳过,而不是以每秒 20 次变化的速度频闪(规则 9)。
- "传更短的注释,并把歌词放在窗口外面的一块 kara 底板里"(把 Review Desk 放大的替代方案):拒绝;窗口被放大**而且**注释被缩短,而吟唱那几行住在 Clio 的气泡里,那是在其他地方她的词也会去的地方。
- "在 Section Drafts 里做 Return"(替代方案):拒绝;在 Manuscript 末尾的 Return 是影片里写作者自己那件作品的最后一个画面,所以 Manuscript 在 63.75 被标为 Final,正如产品所要求的。
