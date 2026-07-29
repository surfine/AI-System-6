<h1 align="center">AI System 6</h1>

<p align="center">
  A local-first writing desktop for work that begins with sources.<br>
  <span lang="zh-CN">把资料、摘录、草稿、审校和导出，放回看得见的对象里。</span>
</p>

<p align="center">
  <a href="https://system6.aaronlau.me"><strong>Open the live desktop</strong></a>
  ·
  <a href="https://www.bilibili.com/video/BV1Bw726uE9g/">Watch the demo</a>
  ·
  <a href="README.zh-CN.md">简体中文</a>
  ·
  <a href="README.md">English</a>
</p>

<p align="center">
  <a href="https://system6.aaronlau.me"><img alt="Live demo" src="https://img.shields.io/badge/live-system6.aaronlau.me-1f883d?style=flat-square"></a>
  <img alt="Local first" src="https://img.shields.io/badge/data-local--first-555?style=flat-square">
  <img alt="Node 18 or newer" src="https://img.shields.io/badge/Node.js-18%2B-339933?style=flat-square&logo=nodedotjs&logoColor=white">
</p>

<p align="center">
  <a href="https://www.bilibili.com/video/BV1Bw726uE9g/">
    <img src="assets/readme/ai-system-6-desktop.png" alt="AI System 6 desktop with ClioTalk open" width="960">
  </a><br>
  <sub>The screenshot opens the Bilibili demo.</sub>
</p>

AI System 6 gives source-based writing the shape of a desktop. Research,
notes, drafts, review, and export live in separate, visible places instead of
collapsing into one long chat transcript.

It borrows the restraint of Macintosh System 6: small windows, named objects,
deliberate saving, and one task at a time. The retro language is a constraint,
not the destination. The real aim is to protect the writer's voice, sources,
judgment, and handoff intent.

## 中文简介

AI System 6 是一个本地优先的写作桌面，适合那些要围着资料做事的人。查资料、摘句子、搭结构、改稿和导出各有位置，不必全挤进一个聊天框。

它借用了 Macintosh System 6 的克制感：小窗口、清楚的对象、主动保存，一次只处理一件事。复古只是约束，真正想守住的是写作者自己的语气、来源、判断和交付意图。

完整中文说明见 [README.zh-CN.md](README.zh-CN.md)。

## Why a desktop?

- **Work stays visible.** Sources, clips, drafts, conversations, and exports are objects you can return to.
- **AI stays provisional.** A model can read, organize, draft, and review, but nothing becomes part of the project until you act on it.
- **The writer keeps the final say.** The system is built around evidence, revision, and handoff rather than frictionless text generation.

## Writing flow

```text
Project Hard Disk -> File Floppy -> Question Sheet -> Outline
-> Section Drafts -> Manuscript -> Review Desk -> Project CD
```

Each stop has one job. ClioTalk and SideAsk can help along the way, while
Reader, Scrapbook, TeachText, Review Desk, and Project CD keep the work
grounded in visible files.

## Try it

The quickest way in is the [live desktop](https://system6.aaronlau.me).

To run the public source snapshot locally:

```sh
git clone https://github.com/surfine/AI-System-6.git
cd AI-System-6
npm install
npm start
```

Then open `http://localhost:4173`.

## Models and data

AI System 6 supports LM Studio-compatible local endpoints and user-configured
cloud providers. Keys are supplied at runtime and are not stored in this
repository. Local-first is the default direction, not a claim that every
optional provider runs offline.

## Public snapshot

This repository contains a public-safe source snapshot: app code, server
routes, tests, and the small assets needed for local development. It excludes
private drafts, browser data, credentials, generated bundles, build output,
package caches, large scraped corpora, and the original private Git history.

The project is under active development. Some surfaces are experiments, and
behavior may change between snapshots.

## License

No open-source license has been selected yet. Until one is added, the code is
available for review and collaboration, but no reuse rights are granted by
default.
