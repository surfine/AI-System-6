<!-- canonical-source: promo/claude-pop/BRIEF.md -->
<!-- source-sha256: 5e877b8e8e4bf67acd98ad0c1e338543e2c707811803ce72979610e12370f67f -->
> 英文版为准 / 仅供人类参考

# Claude-Pop for AI System 6：工作简报

这个文件夹要用纯代码为 **AI System 6** 制作一支宣传音乐视频：一首原创歌曲，由本文件夹里的程序完成词曲、编曲、演唱和混音；画面则在一张画布上一帧一帧地画出来。没有任何内容来自录音、唱片采样，也没有使用任何外部的音乐或视频模型生成。

在这里工作的每一个 agent 都要先读这份文件。它是契约。

## 1. 我们在模仿什么，不模仿什么

**形式**来自 [amemiya02/pdoom-video-win95](https://github.com/amemiya02/pdoom-video-win95)，那是"I'm Upping My P(doom)"（它的 Claude-Pop 版本）的音乐视频，整支片子是一段对一台虚构的 1995 年 PC 的连续屏幕录像。学它的方法，不要学它的代码（它没有许可证；这里的一切都要从零写起）。它之所以成立，是因为：

- **每一句歌词都是一个界面玩笑。** 每一句唱出来的词都变成一个对话框、一个工具程序、一个游戏、一个错误提示。歌词原封不动地出现在屏幕上，可读、对得上拍、并且身处场景自己的 UI 之内（被输入到某个输入框里、作为某个对话框的提示文字、作为某个窗口的标题）。
- **每唱一个字，屏幕上都有事情发生**，而重要的重音落在拍子上。
- **角色就是界面对象。** 在那支片子里，鼠标指针是人类，回形针是 AI。
- **一个贯穿全片的道具在追踪歌曲的论点**（在那里是：每个副歌不断攀升的 P(doom) 进度条；任务栏里的一个末日时钟）。
- **配色方案跟着歌曲的段落走。**
- **冷面幽默。** 操作系统用它报告磁盘满了的那种平淡口吻，报告极其重大的事情。
- **硬像素。** 640x360 画布，3 倍最近邻放大，隐约的扫描线；1 位文字栅格化；没有抗锯齿，没有渐变（改用抖动）；运动以整像素为单位；窗口从轮廓缩放着打开；被拖动的窗口会留下拖影。
- **每一帧都是歌曲时间的纯函数。** 帧与帧之间没有状态，没有 `Math.random()`，没有 `Date`。

**音乐**："Claude-Pop"。我们找不到这个说法的权威定义（参考对象只说它用了自己那首歌的"Claude-Pop 版本"）。我们的工作定义，也就是这里的当家风格：一首明亮、上口、稍微有点怪异的流行歌，**由 Claude 创作并制作**，由一个明摆着是机器、而且自己也知道这一点的声音来演唱。它的基因是 **One More Tune** 里的音乐——那是 AI System 6 自己做的、关于 Apple 放在广告里的那些歌的猜歌游戏（见 §3）。它听起来应该像是能给一支 30 秒产品广告配乐，而且第一次听就该让你笑出来。

## 2. 产品（视频唯一可以做的宣称）

标语：**1988 OBJECTS / 2026 INTELLIGENCE.**（1988 年的物件 / 2026 年的智能。）"A local-first writing desk where the AI never becomes your voice."（一张本地优先的写作桌，在这里 AI 永远不会变成你的声音。）线上地址 `system6.aaronlau.me`。

- **信念。** 你的语言、你的资料、你的判断、你对题材的感觉、以及你对这篇东西是写给谁的感觉，才是有价值的部分。如果模型握着笔，它会把这些都抹平成熟练却令人过目即忘的散文；在这里，它不握笔。
- **AI 的输出是临时的**，直到你保存、剪下、插入或导出它。回复落在哪里，由你说了算。
- **流程本身就是产品：** Project Hard Disk → File Floppy → Question Sheet → Outline → Section Drafts → Manuscript（TeachText，起草期间只读）→ Review Desk → Project CD。
- **Review Desk**（审阅台）检查文稿是否漂移进了模型的腔调：过度规整的节奏、泛泛而谈的概括用语、被抹平的个人细节、新闻稿式的闪躲措辞。**你的粗糙不是缺陷。**
- 可以被召唤到流程上的应用：Searcher 和 Reader（实时网页）、Time Machine（存档页面）、File Floppy（带 OCR 与转录的导入）、Scrapbook（你选择留下的证据）、DocMap、ClioTalk（聊天是一个应用，不是整台电脑）、Note Pad、Dictionary、Writing Bell、Image Prompt Studio。
- **MultiFinder** 让真正在干活的多个应用同时开着。聊天是一个应用。不是整台电脑。
- **两张软盘。** 当启动负载超出两张 1.44 MB 软盘的容量时，发布门禁会让构建失败：2,902,645 / 2,949,120 字节。重型工具从第三张盘上惰性加载。
- **自带模型**：LM Studio、Ollama、DeepSeek。不装模型也能四处看看。无状态服务器；项目存放在你的浏览器里。
- **十二种外观**，同一个实时桌面：1988 System 6 · 1991 System 7 · 1999 Platinum · 2002 Aqua · 2005 Tiger · 2009 Snow Leopard · 2011 Lion · 2014 Yosemite · 2020 Big Sur · 2026 Liquid Glass，外加两个分支：1995 NeXTSTEP 和 1998 Drawing Board。文件和打开的窗口待在原地；整台电脑在它们周围换时代。
- **七个游戏**：DOOM、Micropolis（开源的 SimCity）、OpenTTD、Bonsai City、Rootline、Joyride、Plaintext。编译成 WebAssembly，在文稿旁边的窗口里运行。
- **One More Tune**：一个关于 Apple 广告里那些音乐的猜歌游戏。一张白标唱片，有十个音轨位置；听几个小节，说出这是哪支广告；作答后打开原版内容，同时整张桌子换上那一年的外观，随后把你的外观还回来。
- 每个应用都有一个可分享的地址：`/go/<app-id>`。

## 3. One More Tune 的曲库：我们从中衍生的声音

这叠牌（`apps/desktop/data/one-more-tune-deck.json`，108 张）横跨 1999-2025 年。构成这条谱系的曲目，以及各自可以借鉴的东西（绝不借鉴它们的旋律、歌词或录音）：

| 曲目 | 广告 | 借鉴 |
|---|---|---|
| Feist, "1234" (2007) | iPod nano | 把数数当作钩子；班卓琴、拍手、一段铜管；近乎无伴奏的亲近感 |
| Yael Naïm, "New Soul" (2008) | MacBook Air | 无词的 "la-la" 钩子；钢琴的弹跳；开场时孤零零的一个声音 |
| Daft Punk, "Technologic" (2005) | iPod 剪影广告 | 一个机器人般的嗓音在一段厚实的循环上念出一串动词 |
| The Ting Tings, "Shut Up and Let Me Go" (2008) | iPod | 口号式念唱、牛铃、拍手、操场上的那种挑衅 |
| CSS, "Music Is My Hot Hot Sex" (2008) | iPod touch | 舞曲朋克的弹跳，面无表情的唱法 |
| Chairlift, "Bruises" (2008) | iPod nano | 甜美的合成器二重唱，略微跑偏 |
| Caesars, "Jerk It Out" (2005) | iPod shuffle | 一段你能用口哨吹出来的风琴乐句 |
| Propellerheads, "Take California" (2001) | 第一代 iPod | 大拍碎拍，一段口白采样 |
| Portugal. The Man, "Feel It Still" (2017) | iPad Pro | 贝斯律动，假声 |
| Marian Hill, "Down" (2017) | AirPods | 稀疏、响指、一记萨克斯的戳刺、留白 |
| Jungle, "GOOD TIMES" (2024) | 主题演讲开场 | 迪斯科式的大摇大摆，群体人声 |
| Hark Madley, "Welcome To Joy" (2024) | Apple Intelligence | 光鲜、乐观 |

这个类型的规则：钩子在头五秒内到达；一段标志性的乐句、配一个独特的音色；拍手；数数、念唱或一唱一和；副歌处有一个让你胸口发紧的抬升；在让人嫌长之前就结束。

## 4. 硬性限制

- 不用 Apple 标志，不用 Happy Mac，不用 Apple 开机音（自己写一个启动和弦），不整套照搬 Apple 产品的 UI。AI System 6 自己的应用、名称和外观，是我们自己的，可以展示。
- 不得使用任何既有歌曲的旋律、歌词或录音。歌曲名可以作为文字出现，但只出现在 One More Tune 本身会显示它们的地方，而且要少用。
- 产品宣称只限于 §2。口吻要冷面、干燥、温暖。绝不用"revolutionary"，绝不用"unleash"。
- 歌手就是 AI。屏幕上的字是作者的。这个反讽正是重点：一个合成的声音唱着它永远不会变成你的声音。

## 5. 唯一的事实来源：`music/score.json`

歌曲和画面共用一条时间轴，因为两者都由同一个文件生成。`music/song.py` 写出 `music/score.json`；`music/build_song.py` 由它渲染出 `build/song.wav`；`music/export_timing.py` 为视频写出 `data/data.js`。**千万不要在视频里手工修改时间点；时间点要从 `data/data.js` 取。**

```jsonc
{
  "title": "…", "bpm": 120, "key": "C major", "beatsPerBar": 4,
  "durationBeats": 280,                       // total length including the tail
  "sections": [ { "name": "intro", "startBeat": 0, "beats": 16, "label": "…" } ],
  "chords":   [ { "startBeat": 0, "beats": 4, "symbol": "Cmaj7", "notes": [48, 52, 55, 59] } ],
  "lines": [ {
      "id": "v1a", "section": "verse1", "voice": "lead",   // lead | chant | choir | spoken
      "text": "Exactly as shown on screen",
      "words": [ { "w": "hello", "notes": [ [69, 8.0, 0.5], [72, 8.5, 1.0] ] } ]   // [midi, startBeat, beats]
  } ],
  "parts": { … }   // arrangement data the producer needs: riff, bass, drum patterns per section, hits
}
```

拍数是相对歌曲开头的绝对拍数。秒数 = 拍数 × 60 / bpm。`data/data.js` 暴露 `LYRICS`（各行带有以秒为单位的 `start`/`end`，以及逐字的 `start`/`end`）、`SECTIONS`、`BEATS`（每一拍的秒数）、`BARS`、`HITS`（有名字的重音）和 `DUR`。

## 6. 机器

**音频**（Python，用 `python3 -I` 运行）：Piper 神经 TTS（`.cache/voices/*.onnx`：`en_US-amy-medium`、`en_US-lessac-medium`、`en_GB-jenny_dioco-medium`），用 Praat PSOLA 逐词重新合成来演唱（`parselmouth`：把音高曲线替换成旋律，把时长曲线替换成音符长度）。原型：`.cache/proto-sing.py`；它在每一个音高上都落在 0.1 个半音以内，Whisper 把它逐词转写了出来。乐器：FluidSynth 配 `/usr/share/sounds/sf2/FluidR3_GM.sf2`，加上任何用 numpy/scipy 合成的东西。QA：`faster_whisper`（`small.en`，传入 16 kHz 的 float32 numpy 数组，不要传路径）、Praat 音高跟踪、`pyloudnorm`。`tools/setup.sh` 会把这一切都装好。

**画面**（纯浏览器 JavaScript，不用打包器）：`index.html` 加载 `data/data.js`，然后加载 `src/*.js`。640x360 画布。`render.mjs` 驱动无头 Chromium，并要求页面定义 `window.READY`、`renderFrame(t)`（返回不带 data-URL 前缀的 PNG base64）、`renderSheet(times, cols)`、`renderCheck(t0, t1)`（返回 `{frames, errors, avgMs, maxMs, maxAt}`）和 `DUR`。

```bash
node render.mjs check 0 30               # every frame: exceptions and draw times
node render.mjs sheet 24 38 0.4 build/sheet.png    # contact sheet; open the PNG and look
node render.mjs still 25.6 build/still.png         # one frame at full 1080p
node render.mjs video                    # the whole thing, 1920x1080 60 fps, with build/song.wav
```

System 6 外观所用的像素字体在 `../../system.css-reference/fonts/` 里：`ChiKareGo2`（Chicago，菜单和标题字体）、`FindersKeepers`（Geneva 9，小的界面文字）、`monaco`（Monaco）。更晚的时代可以用别的字体，但文字始终是栅格化并做阈值处理的，以保持硬边。
