<!-- canonical-source: README.md -->
<!-- source-sha256: 3e2553f7c1b3b3b2f5ecc5a6e9fbc2f5c443a012f3081cb0094de552a6fe9412 -->

# AI System 6

英文版为准。本文档仅供人类参考。

[English](README.md) · [演示视频](https://www.bilibili.com/video/BV1Bw726uE9g/)

[![AI System 6 桌面截图](assets/readme/ai-system-6-desktop.png)](https://www.bilibili.com/video/BV1Bw726uE9g/)

AI System 6 是一个本地优先的写作桌面。它适合那种要翻资料、摘句子、搭结构、反复改稿的人。

我不想把整个写作过程塞进一个聊天框。研究、摘录、草稿、审校、导出，都应该有自己的位置。模型可以帮忙，但不能把作者的语气、判断和犹豫磨成一段看起来很顺的通用文本。

界面借了一点 Macintosh System 6 的克制感：小窗口，清楚的对象，主动保存，一次只处理一件事。复古不是目的，只是一个约束。

## 公开版里有什么

这份仓库是公开安全版源码快照。里面有 app 源码、服务端路由、测试，以及本地开发需要的小型运行资产。

没有私人草稿、本地浏览器数据、API key、生成 bundle、构建产物、包缓存、大型抓取语料，也没有原来的私有 Git 历史。

## 写作路线

```text
Project Hard Disk -> File Floppy -> Question Sheet -> Outline
-> Section Drafts -> Manuscript -> Review Desk -> Project CD
```

每一站只做一件事。模型输出在你保存、摘录、插入或导出之前，都只是临时内容。

## 跑起来

```sh
npm install
npm start
```

然后打开 `http://localhost:4173`。

只改前端时，通常重建 bundle 就够了：

```sh
npm run build:app
```

## 模型

可以接 LM Studio 兼容的本地端点，也可以接用户自己配置的云模型。API key 由运行时或环境变量提供，不写进仓库。

常见本地设置：

```sh
PORT=4173
LM_STUDIO_BASE_URL=http://127.0.0.1:1234
LM_STUDIO_URL=http://127.0.0.1:1234/v1/chat/completions
DEEPSEEK_API_KEY=...
```

## 检查

```sh
npm run build:app
npm run verify:features
npm run verify:css
npm run verify:docs
```

`npm run verify:release` 更重，适合打包前跑。它可能需要发布资产和有效构建号。

## 双语维护

`README.md` 是 canonical source；这份中文 README 给中文读者看，不单独当产品规格。

改 README 时，请同一次更新英文和中文，然后跑：

```sh
npm run verify:docs
```

这个检查会确认中文镜像的 source marker 和 hash 没有落后。

## License

目前还没有选择开源许可证。在 license 加入前，代码公开用于查看和协作，但默认不授予复用权利。
