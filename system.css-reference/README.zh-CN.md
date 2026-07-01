<!-- canonical-source: system.css-reference/README.md -->
<!-- source-sha256: c0684343b63a770b7c8544d2dfbe624cd98b7eb8dc1450638b2926a9c36bd136 -->

# System.css 参考说明

> 中文参考版。英文版为准；本文件仅供人类参考。英文源文件更新后，请同步刷新本文件并运行 `npm run verify:docs`。

![system.css](https://i.imgur.com/goRcNZK.png)

> AI System 6 本地说明：这个目录是视觉参考和零件库，不是要整体引入的运行时依赖。App 的可读 CSS 在 `styles.css`，启动运行时使用生成的 `styles.bundle.css`，以便软盘预算保持在 `1,474,560` bytes 内。

[Documentation](https://sakofchit.github.io/system.css/)

System.css 是一个 CSS library，用于构建类似 Apple System OS 的界面。System OS 运行于 1984-1991；从 System 1 到 System 6 的视觉变化不大，本 library 基于 System 6，因为它是 macOS 最后的 monochrome version。

这个 library 不使用 JavaScript，可兼容任意前端框架。大多数 styles 也可以覆盖，以便做更深层定制。

## Getting Started

可以通过两种方式开始使用 System.css。

**从 CDN 引入（最简单）**

在 head tag 中加入：

```html
<link rel="stylesheet" href="https://unpkg.com/@sakun/system.css" />
```

基础 starter code 见英文 canonical 文件。AI System 6 当前使用本地 `system.css-reference/` 作为视觉实现参考，不依赖这个 README 的示例运行。

**从 npmjs 引入**

```sh
npm i @sakun/system.css
```

## Developing

1. Clone repository 并运行 `npm install`。
2. 运行 `npm start` 启动 development environment。

主要内容在 upstream [style.css](https://github.com/sakofchit/system.css/blob/main/style.css)。

## Contributing, Credits, Etc.

这个 library 受 [98.css](https://github.com/jdan/98.css) 启发。Chicago 12pt 和 Geneva 9pt fonts 由 [@blogmywiki](https://twitter.com/blogmywiki) recreate。

System.css 仍处于 beta。作者基于 Apple Human Interface Guidelines recreate components，但可能有遗漏，也 recreate 了多数 assets。

Bug 和新增建议请走 upstream issue/PR。更多信息见作者 [Twitter](https://twitter.com/sakofchit) 和 [personal site](https://sakun.co)。

## Sponsors

原文赞助信息见英文 canonical 文件。
