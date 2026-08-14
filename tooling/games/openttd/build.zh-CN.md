<!-- canonical-source: tooling/games/openttd/build.md -->
<!-- source-sha256: 2226cb7fc95c3fbcedc241db88d1539225bfc879bda1015f534befcbad8aae27 -->

> 英文版为准 ・ 仅供人类参考

# OpenTTD wasm 构建（中文 + 触控）

本目录是把 OpenTTD 15.3 变成 `apps/desktop/assets/openttd/` 里游戏文件的流水线。
上游的 wasm 构建只带英文：它不编译 FreeType，画不了中日韩文字。我们的构建加上
FreeType、简体中文语言文件和一套 CJK 像素字体。触控层不在引擎里：由外壳页面
`apps/desktop/assets/openttd/index.html` 负责。

## 输入

| 内容 | 位置 | 版本 | 许可证 |
| --- | --- | --- | --- |
| OpenTTD 源码 | `external/OpenTTD`（git 忽略） | 15.3（cdn.openttd.org 的 `openttd-15.3-source.tar.xz`） | GPLv2 |
| 基础图形 | `external/openttd-assets/unpacked/opengfx-8.0` | OpenGFX 8.0 | GPLv2 |
| CJK 像素字体 | `external/openttd-assets/unpacked/fusion-proportional` | 缝合像素字体 12px zh_hans，v2026.08.11 | OFL-1.1 |
| 工具链 | `~/emsdk` | emsdk 3.1.57（上游 CI 钉住的版本） | — |
| 宿主工具 | cmake ≥ 3.16、ninja | Homebrew | — |

声音和音乐保持关闭：上游 wasm 构建用空声音/空音乐驱动启动（`pre.js` 传
`-mnull -snull`），OpenSFX/OpenMSX 数据只会白白增大下载量。

## 补丁（配置前应用到 `external/OpenTTD`）

1. `patches/FindFreetype.cmake` → 复制到 `os/emscripten/cmake/`。
   把 `find_package(Freetype)` 映射到 emscripten 的 FreeType 端口
   （`-sUSE_FREETYPE=1`）。FreeType 的改动只有这一处：顶层 CMakeLists 在
   非 Apple 的 Unix 目标上本来就调用 `find_package(Freetype)`，emscripten
   也在其中。
2. `patches/emscripten-zh.patch` → CMakeLists.txt、os/emscripten/pre.js、
   src/network/network.cpp 和 src/fontcache/freetypefontcache.cpp：
   - 预载 `lang/simplified_chinese.lng` 和 `/font` 目录；
   - 给 WASM 链接块里所有路径标志加引号（源码路径带空格 — 比如本仓库 —
     会把裸标志拆散）；
   - 首次运行时用 `Module.openttdDefaultConfig` 写入默认 `openttd.cfg`，
     以后每次启动改写其中的 `resolution` 行（SDL 端口不会跟随画布尺寸）；
   - 导出 `em_openttd_set_resolution(w, h)`，让外壳页面在手机旋转、窗口
     改变大小时实时调整游戏画面；
   - 在 FreeType 字形缓存中把 U+00A0 和 U+2003 映射为普通空格。缝合像素
     字体没有为这些不可见空白画字形，OpenTTD 否则会在首次启动时弹出
     “字体缺字”阻断对话框。
3. emsdk 3.1.57 没有 LibLZMA 端口。把
   `os/emscripten/ports/liblzma.py` 复制到
   `~/emsdk/upstream/emscripten/tools/ports/contrib/liblzma.py`
   （与上游 Dockerfile 的做法相同）。存档需要 LZMA。

## 构建

```sh
source ~/emsdk/emsdk_env.sh
tooling/games/openttd/build-openttd.sh
```

脚本先编译本机宿主工具（`strgen` 等），再配置 wasm 构建，把字体和 OpenGFX
放进构建树（链接阶段的 `--preload-file` 会把它们打进 `openttd.data`），
构建后把 `openttd.js` / `openttd.wasm` / `openttd.data` 复制到
`apps/desktop/assets/openttd/`。这三个产物提交进 git；公开的 GitHub 快照
排除它们（见 `tooling/public-snapshot-manifest.mjs`）。

## 首次运行配置（由外壳页面写入）

`[misc]`：`language = simplified_chinese.lng`；手机上 `gui_scale = 200`
（桌面 100）；四个 `*_font` 键都指向
`/font/fusion-pixel-12px-proportional-zh_hans.ttf`；`global_aa = false`
（1-bit 锐利字形）；`resolution` = iframe 尺寸。
`[gui]`：`osk_activation = single`（点文本框弹出游戏内键盘）、
`hover_delay_ms = 0`（提示气泡改挂在右键上，触控层把长按映射为右键）。

配置只播种一次。之后游戏内设置归玩家自己。
