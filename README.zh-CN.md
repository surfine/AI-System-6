<!-- canonical-source: README.md -->
<!-- source-sha256: 04cdc303d6895d0af2875cc520e1ec2e5609e358d8a59e908704bfb6c052c20e -->

> 英文版为准 ・ 仅供人类参考

<div align="center">

<samp>AI SYSTEM 6 / 本地优先 AI 电脑 / BUILD 20260812.1</samp>

# CHAT 只是一个 APP。<br>不是整台电脑。

**AI System 6 是一张以 Macintosh System 6 为灵感、以文件为原生对象的 AI 桌面。**<br>
搜索、阅读、剪贴、映射、写作、审阅、演示——让工作留在桌面上。

[**启动实时系统 ↗**](https://system6.aaronlau.me)　·　[**观看 50 秒短片 ↗**](https://www.bilibili.com/video/BV1ht3m6UEDb/)　·　[**产品官网 ↗**](https://aisystem6.pages.dev)　·　[**下载 MAC 测试版 ↓**](https://github.com/surfine/AI-System-6/releases/latest)

<sub><a href="README.md">ENGLISH</a>　/　<a href="docs/README.zh-CN.md">文档</a>　/　<a href="CONTRIBUTING.zh-CN.md">参与贡献</a>　/　<a href="https://github.com/surfine/AI-System-6/stargazers">给这台机器一颗星 ★</a></sub>

<br>

[![真实运行的 AI System 6 桌面：以经典虚线轮廓移动窗口，然后切换六套外观](apps/desktop/assets/readme/hero-desktop.gif)](https://system6.aaronlau.me)

<sub>录自真实运行中的系统 · 不是概念渲染</sub>

</div>

```text
AI SYSTEM 6 / 启动记录
──────────────────────────────────────────────────────
[ OK ] 本地优先          项目留在你的浏览器里
[ OK ] 模型无关          LM Studio · Ollama · DeepSeek
[ OK ] 文件原生          来源进入 · 成品输出
[ OK ] 无 UI 框架        原生 JavaScript · 机械结构可见
[ 2× ] 1.44 MB          由 CI 强制执行的启动预算
──────────────────────────────────────────────────────
状态：AI 现在有桌面了。
```

## 模型与工作之间缺失的那一层

Chat 很适合谈话，却不适合充当文件系统、工作空间、来源记录与长期项目界面。
AI System 6 把 Chat 砍掉的电脑能力放了回来：

| 聊天产品 | 这台电脑 |
| --- | --- |
| 一条对话独占流程 | MultiFinder 让真实工作应用同时保持打开 |
| 上下文消失在提示词里 | 来源、剪贴、地图、草稿和输出始终可见 |
| 生成文字悄悄变成真相 | 只有保存、剪贴、插入或导出后，AI 输出才会持久化 |
| 回答就是终点 | 终点是文件、手稿、图表、演示、封面或 3D 对象 |
| 模型本身就是产品 | 接入本地模型、云模型，或者完全不用模型 |

> 硬盘告诉你什么会留下，软盘告诉你什么只是临时材料；Scrapbook 只包含你主动
> 留下的东西。

## 来源进入，文件出来

```text
 网页 / PDF / 音频 / 图片 / 笔记
                  │
                  ▼
  搜索 ── 阅读 ── 剪贴 ── 映射 ── 写作 ── 审阅
   │       │        │       │        │       │
搜索器   阅读器  Scrapbook 文档地图  创作坊  审阅台
                  │
                  └──────────────►  .md  .pdf  .pptx  .png  .usdz
```

钟点稿负责短路线；创作坊把严肃项目从研究和问题纸带过大纲、章节、手稿和审阅。
ClioChart、ClioStage、玻璃封面与配色工作台则把同一份可见工作变成图表、演示、
视觉成品和可用于 AR 的 3D 文件。

## 一张桌面，六套系统

`SYSTEM 6` → `PLATINUM` → `AQUA` → `SNOW LEOPARD` → `YOSEMITE` → `LIQUID GLASS`

工作从不移动，整台电脑在它周围改变时代。System 6 是默认外观，从真实的 System
6.0.8 资源和实测 Macintosh 行为出发；已知历史对象以证据为先，不做泛化复古重绘。
现代外观拥有各自独立、适配 Retina 的图标家族。

## 一台 1988 年电脑不该会的软件

| 机器 | 现在可以 |
| --- | --- |
| **搜索器 + 时光机** | 搜索网页并重访历史页面 |
| **文件软盘** | OCR 图片和文档；转写音频 |
| **ClioChart** | 把 Markdown 数据投影成可编辑图表 |
| **ClioStage** | 制作并播放 Markdown 演示文稿 |
| **玻璃封面** | 渲染折射式 WebGL 字体 |
| **配色工作台** | 编辑 3D 产品配色并导出 AR 所需的 USDZ |
| **控制面板** | 切换模型、服务、语言与整套视觉时代 |

## 仓库本身就是系统图

```text
AI-System-6/
├── apps/
│   ├── desktop/       浏览器电脑：OS 服务、应用、样式、资产
│   └── server/        无状态 Node.js 桥接层与模型适配器
├── site/              可独立部署的产品官网
├── platform/
│   ├── macos/         原生重写与轻量桌面外壳
│   └── web/           生产 Web 发版契约
├── tooling/           构建、验证、打包、快照、发布
├── tests/             可执行的产品与架构契约
├── docs/              公开架构、开发与设计知识
└── internal/          证据、实验、归档、维护者运维资料
```

这些是物理所有权边界，不是装饰目录。浏览器 URL 继续保持稳定（`/app`、`/assets`、
`/data`），但所有构建器都通过 `apps/desktop` 解析真源。服务端没有应用数据库；
持久项目状态留在 IndexedDB。重型工具从“第三张软盘”懒加载。

继续阅读[架构](docs/ARCHITECTURE.zh-CN.md)、[开发指南](docs/DEVELOPMENT.zh-CN.md)
与[设计证据](docs/design/DESIGN.zh-CN.md)。

## 在本地启动一台机器

需要 Node.js 20 或更新版本。

```bash
git clone https://github.com/surfine/AI-System-6.git
cd AI-System-6
npm ci
npm start
```

打开 [localhost:4173](http://localhost:4173)。探索桌面不需要模型，之后再到控制面板连接。

```bash
npm run build          # 确定性生成桌面 bundle
npm test               # 可执行的功能契约
npm run site:check     # 官网与规范图标同步门禁
npm run verify:public  # 仓库、命令、资产与文档门禁
```

公开仓库是一份经过整理、可独立验证的源码快照；它暴露的每条命令都必须能在全新
clone 中运行。

## 接入你自己的智能

| 路线 | 适合场景 |
| --- | --- |
| **LM Studio** | 本地对话、embedding、模型发现和加载 |
| **Ollama** | 本地 OpenAI 兼容服务 |
| **DeepSeek** | 内置云端配置 |
| **自定义 endpoint** | 任意兼容服务与模型 |
| **无模型** | 桌面与全部非 AI 工具 |

凭证不会进入项目文件、对话、备份或导出。

## 帮这台电脑逃出实验室

AI System 6 采用 MIT 许可证。请先阅读
[CONTRIBUTING.zh-CN.md](CONTRIBUTING.zh-CN.md)，或提交带有可复现产品契约的 issue。
安全报告遵循 [SECURITY.zh-CN.md](SECURITY.zh-CN.md)。

<div align="center">

### 如果你也想让 AI 软件重新像一台电脑——

# [★ 给 AI SYSTEM 6 一颗星](https://github.com/surfine/AI-System-6)

Star 是让这台奇怪机器找到更多构建者的信号。

[**实时桌面**](https://system6.aaronlau.me)　·　[**B 站短片**](https://www.bilibili.com/video/BV1ht3m6UEDb/)　·　[**产品官网**](https://aisystem6.pages.dev)　·　[**最新 RELEASE**](https://github.com/surfine/AI-System-6/releases/latest)

<sub>独立项目，与 Apple Inc. 无隶属或背书关系。</sub>

</div>
