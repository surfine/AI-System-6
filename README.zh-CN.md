<!-- canonical-source: README.md -->
<!-- source-sha256: 9aebdf564a54fcdf16724322cb083f09225fff928f15955a90ab2c27895fe9ab -->

# AI System 6

英文版为准。本文档仅供人类参考。

**这是一套真正运行的 AI 桌面，而不是又一个聊天框。**

[English](README.md) · [在线体验](https://system6.aaronlau.me) · [演示视频](https://www.bilibili.com/video/BV1ht3m6UEDb/)

![AI System 6 实时桌面](assets/readme/ai-system-6-live-desktop.png)

AI System 6 是一套受 Macintosh System 6 启发、本地优先、基于文件的 AI 工作环境。它把研究、写作与创作变成桌面上看得见的工作：多个应用同时运行，资料来源始终可检查；AI 输出只有在用户主动保存、剪藏、插入或导出后，才会成为项目的一部分。

## 它有什么不同

### 桌面，而非聊天窗口

MultiFinder 让 Searcher、Reader、Scrapbook、DocMap、ClioChart、ClioStage 和 ClioTalk 等工具同时留在桌面上。应用之间交换真正的项目文件，工作过程不会被藏进一段对话里。

### 从资料到成品的一条路径

```text
搜索 → 阅读 → 剪藏 → 整理 → 写作 → 审校 → 呈现
```

- **Searcher + Reader** 搜索来源并打开可读的证据。
- **Time Machine** 通过 Wayback Machine 回到历史网页。
- **Scrapbook + DocMap** 保存人工挑选的材料，并展开其中的结构。
- **问题单 → 大纲 → 分节草稿 → TeachText** 让同一篇文章走完整个写作流程。
- **审校台** 检查事实和结构风险，也检查文章是否滑向泛化的“AI 代言感”。
- **ClioChart + ClioStage + Cover Glass** 把同一份工作继续做成图表、演示文稿和视觉成品。

### 本地 AI 是一等选择

可以使用 **LM Studio** 中的本地聊天与 Embedding 模型、连接 **Ollama**，也可以配置 **DeepSeek** 或其他 **OpenAI 兼容**接口。模型服务可以切换；AI System 6 是工作环境，而不是某个模型的套壳。

项目、参考资料、剪藏和设置保存在浏览器本地，服务端不保存状态。模型凭据不会写入项目文件、聊天、备份或导出内容。

### 装在 1988 年电脑里的现代工具

- **CMF Studio** 编辑 3D iPhone 配色，并导出用于 AR 的 USDZ。
- **Cover Glass** 渲染带折射效果的 WebGL 文字与封面。
- **文件软盘** 导入文档、图片和音频，并提供 OCR 与转写流程。
- **ClioChart** 把 Markdown 数据转换成可编辑的可视化投影。
- **ClioStage** 以源码、幻灯片和提词视图播放 Markdown 演示文稿。
- **Classic / Liquid Glass** 让同一个实时桌面跨越两个视觉时代，已经打开的工作仍留在原处。

经典界面依据真实的 System 6.0.8 资源和同时代 Macintosh 交互方式制作，而非凭记忆重新绘制。

## 立即体验

打开[在线体验](https://system6.aaronlau.me)，或在本地运行：

```sh
npm install
npm start
```

然后访问 `http://localhost:4173`。

如需本地 AI，请先在 LM Studio 中加载聊天模型，再到控制面板刷新模型。Ollama、云端和 OpenAI 兼容接口也可在控制面板配置。

## 产品原则

- AI 输出默认是临时材料，只有用户能决定是否保留。
- 来源、提示词、运行输入和项目文件应当看得见、可检查。
- AI 可以协助阅读、整理、起草、改写和审校，但不应把作者的语言磨平成统一的模型腔。
- 完成一件可交付的作品，比延续一场没有尽头的对话更重要。

## 开发

浏览器端使用原生 JavaScript，配合一个小型、无状态的 Node.js 服务；没有前端框架或转译器。架构、构建规则、验证方式与产品约束见 [CLAUDE.md](CLAUDE.md)。

```sh
npm run verify:quick
npm run verify:features
npm run verify:release
```

## 许可证

[MIT](LICENSE)
