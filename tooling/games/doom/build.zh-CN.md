<!-- canonical-source: tooling/games/doom/build.md -->
<!-- source-sha256: 31df1eb7dfaccb18607c345e4bacf4334e3f85218a84ecdd61ce63840c5cba97 -->

# Chocolate Doom WebAssembly 本机可玩切片

> 中文参考版。英文版为准；本文件仅供人类参考。英文源文件更新后，请同步刷新本文件并运行 `npm run verify:docs`。

这是 AI System 6 移植 DOOM 的第二阶段可复现构建。它把官方 Chocolate Doom
3.1.1 编译为单线程 WebAssembly 引擎，让引擎留在同源 iframe 内；只有用户选择
本机 IWAD 并明确点按「开始」后，游戏才会启动。未选择 IWAD 时，`needs-data`
是预期的就绪状态。

## 固定输入

| 输入 | 版本或设置 |
| --- | --- |
| Chocolate Doom | 3.1.1，commit `410d96855b5df5410ff591a90efeafa889119224` |
| Emscripten | 3.1.57 |
| SDL | Emscripten SDL2 port（`USE_SDL=2`） |
| 音频 | Emscripten SDL2_mixer port（`USE_SDL_MIXER=2`、`SDL2_MIXER_FORMATS=[]`） |
| 本次受检构建使用的 CMake / Ninja | 4.4.2 / 1.13.2 |

`SDL2_MIXER_FORMATS=[]` 会保留 SDL2_mixer 的核心 WAV 路径，但不链接可选的
OGG、MP3、MOD 或 Timidity MIDI codec。Chocolate Doom 通过默认 Sound Blaster
音乐设备使用自身内建的 OPL 模拟器。构建明确关闭 FluidSynth，因此不需要
SoundFont。

**Emscripten 固定在 3.1.57 是有意为之。** 用 emsdk 6.0.6 构建的产物能启动
外壳，但按下「开始」后浏览器主线程会永远卡死在 `I_InitMusic`（OPL 音乐
初始化；日志停在 `I_Init: Setting up machine state.` 之后）。加 `-nomusic`
就不卡，单加 `-nosfx` 仍然卡，说明 SDL2_mixer 的音频设备打开没有问题，
问题出在新版 SDL2 端口上的 OPL 音乐路径。音乐是产品要求，所以在新构建
通过下面这个完整检查之前不要升级此固定版本：导入本机 Freedoom IWAD、
按「开始」、再从游戏菜单真正开一局 — 只验证启动到外壳碰不到这个卡死。

## 复现引擎载荷

把准确的上游源码 clone 到被忽略的 `external/` 目录：

```sh
git clone --branch chocolate-doom-3.1.1 --depth 1 \
  https://github.com/chocolate-doom/chocolate-doom.git \
  external/chocolate-doom
git -C external/chocolate-doom rev-parse HEAD
```

第二条命令必须输出
`410d96855b5df5410ff591a90efeafa889119224`。激活 emsdk 3.1.57，让
`emcmake`、`emcc`、CMake 与 Ninja 位于 `PATH`，然后运行：

```sh
tooling/games/doom/build-doom.sh
```

脚本会在构建前核对 commit：若有需要，会应用
`patches/emscripten-runtime.patch`；若该准确补丁已经应用，也可继续；若源码目录
包含非预期修改，则立即停止。脚本只构建 `chocolate-doom` target，并覆盖
`apps/desktop/assets/doom/` 中这些可分发引擎材料：

- `chocolate-doom.js` 与 `chocolate-doom.wasm`；
- `ENGINE-COPYING.txt`；
- `chocolate-doom-3.1.1-source.tar.gz`，即未修改的固定上游源码；
- `chocolate-doom-3.1.1-ai-system6.patch`，即准确的 AI System 6 原生补丁。

浏览器适配器以可读源码直接维护在这些输出旁；构建脚本不会生成或压缩它们。
用以下命令检查重建结果及发布清单：

```sh
cmp tooling/games/doom/patches/emscripten-runtime.patch \
  apps/desktop/assets/doom/chocolate-doom-3.1.1-ai-system6.patch
node --check apps/desktop/assets/doom/chocolate-doom.js
npm run check:release-assets
npm run verify:docs
```

## 浏览器入口、主循环与原生 ABI

Emscripten 输出使用 `INVOKE_RUN=0` 链接，iframe 同时设置 `noInitialRun`。加载或
恢复桌面可以初始化 runtime 与 IDBFS，但不能进入 `main`。只有 iframe 内「开始」
按钮自己的点击路径，才会在已经验证所选 IWAD 后调用 `Module.callMain`。

Chocolate Doom 原生主循环不会返回。补丁只对浏览器 target 把该循环替换为
`emscripten_set_main_loop(D_RunFrame, 0, 1)`；`callMain` 安装 frame callback 后会
把执行权交还浏览器。原生构建仍保留原有循环。

除了正常的 `_main` 入口，只有 Doom target 会导出四个自定义适配函数：

| C 函数 | Emscripten export | 用途 |
| --- | --- | --- |
| `AI_DoomWebInput` | `_AI_DoomWebInput` | 把一帧归一化输入转换为原生 Doom event |
| `AI_DoomWebReleaseAll` | `_AI_DoomWebReleaseAll` | 释放全部保持输入并清除边缘触发动作 |
| `AI_DoomWebPause` | `_AI_DoomWebPause` | 释放输入并暂停已经安装的浏览器主循环 |
| `AI_DoomWebResume` | `_AI_DoomWebResume` | 恢复已经安装的浏览器主循环 |

归一化输入记录包括 `move`、`strafe`、`turn`、`fire`、`use`、`run`、
`map`、`menu` 与 `weaponDelta`。输入桥会投递 Chocolate Doom event；shell 不会
伪造 DOM 键盘事件。blur、切到后台、`pointercancel`、resize、旋转、隐藏与 Quit
都会在生命周期或几何变化以前释放输入。

`move`、`strafe`、`turn`、`fire`、`use` 与 `run` 是保持值；`map`、`menu`
与 `weaponDelta` 是单帧 pulse，每个非零帧都会且只会消费一次。Chocolate Doom
原生菜单开启时，移动与转向会变成 D-pad 导航，Fire 变成前进／确认，Use 变成
返回／取消。菜单里的 Fire 与 Use 仍采用上升沿，因此持续按住按钮不会重复选择。

## 本机数据与持久化边界

AI System 6 不附带任何 WAD：包括 DOOM、DOOM II、TNT、Plutonia、Freedoom 或
其他游戏数据。用户必须通过明确的本机文件选择手势提供文件。`wad-picker.js` 会
验证 `IWAD` 或 `PWAD` 文件头、lump 目录及范围，执行 128 MiB 产品上限，在
浏览器内计算 SHA-256，并且只写入经过净化命名的本机副本。可玩路径必须选中
一个 IWAD；PWAD 启用与加载顺序仍然延后。

iframe 在 IDBFS 中拥有 `/doom/iwads`、`/doom/saves` 与 `/doom/config`。WAD
目录修改和文件系统同步会串行执行；导入或移除只有在同步完成后才可报告为持久。
WAD 字节、目录记录、配置与存档都不会上传，也不会进入 AI System 6 项目存储、
项目备份、模型上下文或分析。

## 音频边界

SDL2_mixer 已启用，用于音效及其核心 WAV 支持。音乐使用 Chocolate Doom 已有的
OPL 模拟，由上游默认 `snd_musicdevice=SNDDEVICE_SB` 选中。受检构建不存在
FluidSynth 路径，不含 SoundFont，也不会下载音频 codec。「开始」这个明确手势
同时也是 Web Audio 解锁边界。隐藏／后台会挂起音频并暂停游戏；回到前台只可
恢复已经启动的游戏，绝不会自动启动。

## 源码、许可与发布边界

Chocolate Doom 许可文本、未修改的固定源码压缩包与完整原生补丁都会随引擎分发。
以下可读浏览器文件是 GPL 引擎侧适配器，遵循各自的 `GPL-2.0-only` 声明：

- `shell.js`；
- `wad-picker.js`；
- `touch-controls.js`；
- `touch-controls.css`。

shell、本机选择器、触控控制、Emscripten runtime、文件系统与原生输入桥全部留在
iframe 内。AI System 6 桌面宿主只使用带版本的 `postMessage` 协议。该边界记录
分发源码与 runtime 架构，并不对衍生作品关系作法律结论。

网页与原生包的 glob 都包含完整 `assets/doom/` 目录；发布资产 gate 会逐项列出
所有必需 runtime、适配器、许可与对应源码文件。

## 明确排除

- 不附带或下载任何 WAD，包括不附带 Freedoom 测试夹具；
- 不含 FluidSynth、SoundFont、可选 SDL2_mixer codec library 或 codec 获取；
- 不含 pthread、Wasm worker、shared memory 或 SharedArrayBuffer 要求；
- 不含 SDL2_net、多人、telemetry、云存档或 WAD 上传；
- 不会在启动、刷新或会话恢复时自动调用 `main`。
