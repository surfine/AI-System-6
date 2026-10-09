<!-- canonical-source: promo/claude-pop/STATUS.md -->
<!-- source-sha256: 3a42bf2dea7df5d53747c79d4fd3173d67a99e2486e842c3e0f746b93a7fb3f9 -->
> 英文版为准 / 仅供人类参考

# 交接：Claude-Pop 这支片子的进度

如果你是在一个新的会话里接手这项工作，先读这份文件。

## 已完成

- **画面：完成。** `index.html` + `src/`（工具包、样式包、ch01–ch12 各章）画出了全部 9,420 帧（0–157 秒），没有报错；`tools/flashcheck.mjs` 在全片范围内通过了 WCAG 的 general-flash 和 red-flash 测试；11 个章节接缝都逐帧审查过。`render.mjs` 可渲染 1080p（`--scale 3`）或 4K（`--scale 6`），片尾卡在歌曲结束后多停留 3 秒，并遵守 `FINISH_AT`（剪影模式下不加暗角）。
- **字幕：** `node tools/srt.mjs` 由同一条时间轴写出 `build/pen-pal.zh-en.srt` 和 `build/pen-pal.zh.srt`（中文内容放在 `data/lyrics-zh.json`）。
- **歌曲结构：** "Pen Pal"（SONG.md），乐谱在 `music/score.json`，时间轴在 `data/data.js`。**`data/data.js` 里每一个歌词词的时间点和每一个 EVENTS 时间点，都是画面同步所依据的：不要改动它们。**

## 那个悬而未决的决定，已由所有者拍板

第一版音轨（Piper + PSOLA 人声、拟音鼓、软盘步进电机贝斯；`music/build_song.py`）被判定为不好听。所有者想要"Claude Pop - I'm Upping My P(Doom)"那支视频的成功，它的强项是一首听起来像真的歌。决定如下：

- **歌手：** Kokoro `af_heart`（美式女声）。`music/sing_world.py` 用 WORLD 重合成来演唱。
- **歌曲来源：** 一个 AI 歌曲模型，**GPU 加速**：ACE-Step 1.5（MIT）跑在它的 Hugging Face Space（`ACE-Step/Ace-Step-v1.5`，ZeroGPU A10G）上，以 **cover** 模式套在我们的引导混音（`music/build_guide.py` → `build/guide.wav`）上，这样结构和速度能保留下来。匿名配额已用完；它需要 `HF_TOKEN`。
- **歌曲来源，修订：** 手头没有 Hugging Face token，所以 ACE-Step 1.5 通过 acestep.cpp（C++/GGML，Q8 GGUF 模型，MIT）在 CPU 上本地运行，`ACE_THREADS=4`（这是本地打的补丁：那个二进制原本会把核心数减半）。整首歌做一次 cover 大约要 15-25 分钟。优先用 `cover-nofsq`（保留源的结构和时序），`audio_cover_strength` 取 0.3-0.5。
- **3D：** 每个副歌、桥段隧道和尾声拉远都用 three.js（所有者的选择），再量化回硬像素。three 放在 node_modules 里，`tools/weigh.mjs` 不把它算进去；片尾卡说明那个字节数是本片自己的代码，并对 three.js 致谢。
- **演员：** Clio 仍是主角；不用 Clawd。
- **交付：** 4K60 母版切成 ≤30 MB 的分片发给所有者，附一条合并命令；一份小于 30 MB 的 1080p60 分享版；两个 SRT 文件；然后一个 pull request，并推进到绿灯。

## 歌曲，第三轮（所有者：两个 cover 听起来都不自然、断断续续、做作）

给一段含合成人声的引导做 cover，会把那个人声的音色和它逐词之间的接缝一起复制过去。所以现在这首歌由 ACE-Step 的 LM + DiT 从零生成（text2music：我们的歌词、120 BPM、G 大调、154 秒），由它自己规划自然的断句。它的句子落在它想落的地方，所以**画面反过来跟着歌走**：先 `tools/retime.py NEW.wav --measure-only`，然后 `tools/warp.py` 写出 `data/warp.js`（歌曲时间 -> 画面时间，每一行歌词一个锚点，速度限制在 0.8-1.25），`src/main.js` 画出 `warpT(t)`。章节不做改动。

### 在 warp 之前先做整小节对齐：`tools/barfit.py`

自由生成也会自己挑段落长度（种子 23：前奏和主歌各句挤得只差一小节，副歌后段的 la-la 长了 4 小节），于是偏移量会达到 warp 弯不过来的整小节量级（-8 秒）。`tools/barfit.py` 在**音频**上、按歌曲自己的小节线修掉这些，然后 warp 再处理小节以内的余量：

    python3 -I tools/barfit.py build/ace/NEW.wav                # -> build/song.fitted.wav + build/retime-report.json
    python3 -I tools/warp.py                                    # -> data/warp.js for the residual
    python3 -I tools/barfit.py build/ace/NEW.wav --silent-pen   # (or --pen-only) add the silent pen at warped times
    cp build/song.fitted.wav build/song.wav

它测量每一行歌词，找出拍网格和重拍，并在行与行之间规划整小节的插入和删除。一条 demucs 人声分轨用来确保没有任何唱词被切掉或重复。插入是在人声空隙里开出一小节纯器乐（伴奏，也就是混音减去人声分轨，在它的小节线上复制）。删除是砍掉 la-la 或无人声的小节，切口落在人声空隙里的拍上。编辑之外的每一处都是输入，逐位一致。之后它重新测量，并报告每个段落的前值 / 预测值 / 后值（`build/barfit-report.json`）。它无法安全放置的编辑会被跳过并列出。模型在一个段落内部加出来的断句差异属于小节以内，留给 warp 处理。`--silent-pen` 在 HITS.bandOut 处把混音压到静音，在 HITS.keystroke 处加一条合成的按键声，并在 HITS.slamBack 处猛然回来，画面时间通过 data/warp.js 映射到歌曲时间。完整用法和算法在文件头里。

在 `build/ace/free-seed23.wav` 上测试过。Retime 的段落中位数从 -7.6/-7.9/-7.9 秒（verse1/pre1/chorus1）、-3.7/-3.9/-3.9 秒（verse2/pre2/chorus2）和 -0.7/-0.05/-0.05/-0.8 秒（bridge/breakdown/chorus3/outro），变成 -0.07/-0.10/-0.03、-0.02/-0.09/-0.11 和 -0.83/-0.18/-0.20/-0.97 秒。这些数字来自在挤在一起的行之间开出的 4 小节器乐、删掉的 6 小节 la-la，以及一段 1.85 秒的开头补白。Boot/intro 落在 -0.49/-0.37 秒。桥段和尾声在各自的小节里早唱了大约一拍半：属于小节以内，留给 warp。在结果上跑 warp.py 之后，每个段落的同步误差（中位数）都在 ±0.13 秒以内，只有 breakdown 是 +0.37 秒（3 个词）。就全部词而言：中位数 0.14 秒，p90 0.39 秒。静默的笔除了那记按键声之外，从 bandOut 到 slamBack 是数字静音（峰值 -9 dBFS）。种子 23 的 warp 保留为 `build/warp.seed23-fitted.js`；`data/warp.js` 被清空了，因为 `build/song.wav` 还是旧的那条音轨。

## 后续步骤

1. `HF_TOKEN=… python3 -I music/ace_cover.py --seed 42`（从 `music/hit_prompt.json`、即 SONG2.md 那首歌做 text2music；候选 B 用 `--bpm 112`；多试几个种子和强度；每次运行都把音频 + LRC + 设置保存在 `build/ace/` 下）。
2. `python3 -I tools/retime.py build/ace/<pick>.flac` → 测量相对 `data/data.js` 的漂移，并写出 `build/song.retimed.wav`；把选中的、对齐好的文件复制为 `build/song.wav`。
3. 让所有者凭耳朵挑选（发一些短片段）。然后按需要更新片尾卡的宣称：音乐不再"每一个音符都是代码"，所以卡片不能说"没有采样"，也不能把一个模型算作源码。
4. `node tools/weigh.mjs`、`node tools/srt.mjs`、`node render.mjs video --scale 6 --out build/claude-pop-4k.mp4`，切成 ≤30 MB 的分片，再加一份 1080p60 分享版；开 PR。

预览：`node tools/serve.mjs`，然后打开 http://127.0.0.1:8640/promo/claude-pop/index.html（从磁盘直接打开 index.html 读不到图标，也加载不了 three.js）。

在新机器上搭建：`tools/setup.sh`，然后 `pip install kokoro-onnx pyworld gradio_client`，并把 Kokoro 的文件下载到 `.cache/kokoro/`（见 `music/PRODUCTION.md`）。

## 最终的歌（所有者选定，10 月 9 日）

"Pen Pal"，性感舞曲流行版，ACE-Step 1.5 text2music（4B LM + turbo DiT，本地 CPU，经 acestep.cpp），种子 59（`build/ace/pen-pal-sexy-59.wav`）。组装过程，完全可复现：

    python3 -I music/assemble_final.py                 # 1.537 s boot-chord pre-roll (downbeats on picture bars) + 2 la-la bars cut
    python3 -I tools/retime.py build/song.assembled.wav --measure-only
    python3 -I tools/warp.py --beat                     # data/warp.js: beat-snapped offsets, 1x between lines
    python3 -I music/assemble_final.py --pen            # the silent pen at the warped times -> build/song.wav
    node tools/weigh.mjs && node tools/srt.mjs          # end-card bytes; subtitles in song time
    node render.mjs video --scale 6 --preset medium --crf 16 --out build/claude-pop-4k.mp4

render.mjs 和 tools/flashcheck.mjs 在歌曲时间里运行，并在 SONG_END（画面的 END 经 warp 反推回来的位置）停下。对这首歌的检查结果：9,390 帧，0 个错误；闪光检查通过（general 3 次/秒峰值，red 2 次/秒）。
