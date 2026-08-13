<!-- canonical-source: apps/desktop/app/vendor/micropolis/NOTICE.md -->
<!-- source-sha256: b9ced4c02e9f3fe548aae87e719be5df9c0022b45587c011ba5a4664caf4436c -->

# Micropolis 引擎第三方声明

> 中文参考版。英文版为准；本文件仅供人类参考。

- 上游项目：https://github.com/graememcc/micropolisJS
- 固定提交：f13a1624d111d235e804bd80f48ba7c9f66a8e0f
- 构建：`npm run build:micropolis-vendor`（esbuild IIFE、未压缩、仅包含引擎模块）
- 入口：`tooling/vendor/micropolis-engine-entry.mjs`
- 已排除的上游模块（界面、文字、存储）：game、splashScreen、splashCanvas、
  infoBar、inputStatus、notification、rci、queryTool、text、storage、monsterTV、
  所有 `*Window.js`，以及 data-URI 图块集。
- 许可：GNU GPL v3 及附加条款——详见本目录内 LICENSE 与 COPYING。
- 名称／用语「MICROPOLIS」是 Micropolis GmbH 的注册商标；商标所有者出于善意，
  许可 Micropolis 项目使用。
- AI System 6 外壳代码（`app/features/micropolis.js`）及全部界面文字均为
  AI System 6 原创，不衍生自上游 `text.js`。
