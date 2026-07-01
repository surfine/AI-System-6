<!-- canonical-source: README.md -->
<!-- source-sha256: 654c4f3e445419e4405575e605b3b25d89582533b97aef2dbeef3985c16b4d48 -->

# AI System 6

英文版为准。本文档仅供人类参考。

[English](README.md) · [简体中文](README.zh-CN.md)

AI System 6 是一个本地优先的写作桌面，适合需要围绕资料工作的写作者。它把研究、摘录、草稿、审校和导出放成可见对象，而不是全塞进一个聊天框。

它借用 Macintosh System 6 的克制感：小窗口、清楚的对象、主动保存，以及一次只处理一件写作任务。重点不在复古皮肤；它要保护写作者自己的语言、来源、判断和交付意图。

## 这里包含什么

这是公开安全版源码快照，包含 app 源码、服务端路由、测试和本地开发所需的小型运行资产。

这里不包含私人草稿、本地浏览器数据、API key、生成 bundle、构建产物、包缓存、大型抓取语料，也不包含原来的私有 Git 历史。

## 写作流程

```text
Project Hard Disk -> File Floppy -> Question Sheet -> Outline
-> Section Drafts -> Manuscript -> Review Desk -> Project CD
```

每一站都有自己的任务。AI 可以帮助阅读、整理、起草、改写和审校，但模型输出在写作者保存、摘录、插入或导出之前都只是临时内容。

## 本地运行

```sh
npm install
npm start
```

然后打开 `http://localhost:4173`。

前端改动通常可以只重建浏览器 bundle：

```sh
npm run build:app
```

## 模型

AI System 6 可以连接 LM Studio 兼容的本地端点，也可以连接用户配置的云模型。API key 由用户在运行时或环境变量中提供，不写入仓库。

常用本地设置：

```sh
PORT=4173
LM_STUDIO_BASE_URL=http://127.0.0.1:1234
LM_STUDIO_URL=http://127.0.0.1:1234/v1/chat/completions
DEEPSEEK_API_KEY=...
```

## 常用检查

```sh
npm run build:app
npm run verify:features
npm run verify:css
npm run verify:docs
```

`npm run verify:release` 更重，适合打包前使用，可能需要发布资产和有效构建号。

## 双语维护

`README.md` 是 canonical source。`README.zh-CN.md` 是给中文读者看的简体中文镜像，不是另一份产品规格。

修改 README 时：

1. 先改 `README.md`。
2. 同一次改动里更新 `README.zh-CN.md`。
3. 运行 `npm run verify:docs`；它会检查中文镜像的 source marker 和 hash。

## License

目前还没有选择开源许可证。在 license 加入前，代码公开用于查看和协作，但默认不授予复用权利。
