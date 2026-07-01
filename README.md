<p align="center">
  <strong>AI System 6</strong><br>
  A local-first writing desktop for source-based work.<br>
  <span lang="zh-CN">把资料、摘录、草稿、审校和导出放回可见对象里。</span>
</p>

<p align="center">
  <a href="README.zh-CN.md">简体中文</a> · <a href="README.md">English</a>
</p>

<p align="center">
  <a href="https://www.bilibili.com/video/BV1Bw726uE9g/">
    <img src="assets/readme/ai-system-6-desktop.png" alt="AI System 6 desktop screenshot" width="900">
  </a><br>
  <sub>Click the screenshot to watch the demo on Bilibili.</sub>
</p>

---

AI System 6 is a local-first writing desktop for people who work from sources.
Research, notes, drafts, review, and export each get their own place, so the
writing job does not collapse into a single chat transcript.

The project borrows the restraint of Macintosh System 6: small windows, named
objects, deliberate saving, and one writing task at a time. The point is not a
retro skin. The point is to protect the writer's language, sources, judgment,
and handoff intent from being flattened into generic model prose.

## Chinese intro

AI System 6 是一个本地优先的写作桌面，适合需要围绕资料工作的写作者。研究、摘录、草稿、审校和导出都有自己的位置，不必全挤进一个聊天框。

它借用 Macintosh System 6 的克制感：小窗口、清楚的对象、主动保存，一次只处理一件写作任务。重点不在复古皮肤；它要保护写作者自己的语言、来源、判断和交付意图。

完整中文说明见 [README.zh-CN.md](README.zh-CN.md)。

## What is here

This is a public-safe source snapshot. It includes the app source, server
routes, tests, and the small runtime assets needed for local development.

It does not include private drafts, local browser data, API keys, generated
bundles, build output, package caches, large scraped corpora, or the original
private Git history.

## Writing flow

```text
Project Hard Disk -> File Floppy -> Question Sheet -> Outline
-> Section Drafts -> Manuscript -> Review Desk -> Project CD
```

Each stop has a job. AI can help read, organize, draft, rewrite, and review,
but its output stays temporary until the writer saves, clips, inserts, or
exports it.

## Run it

```sh
npm install
npm start
```

Then open `http://localhost:4173`.

For frontend-only edits, rebuild the browser bundle:

```sh
npm run build:app
```

## Models

AI System 6 can talk to local LM Studio-compatible endpoints and to configured
cloud providers. Keys are supplied by the user at runtime or through environment
variables; no keys are stored in this repository.

Common local settings:

```sh
PORT=4173
LM_STUDIO_BASE_URL=http://127.0.0.1:1234
LM_STUDIO_URL=http://127.0.0.1:1234/v1/chat/completions
DEEPSEEK_API_KEY=...
```

## Useful checks

```sh
npm run build:app
npm run verify:features
npm run verify:css
npm run verify:docs
```

`npm run verify:release` is the heavier local gate. It is useful before a
packaged build, but it may require release assets and a valid build stamp.

## Maintaining both READMEs

`README.md` is the canonical source. `README.zh-CN.md` is the Simplified
Chinese mirror for readers, not a separate product spec.

When changing this page:

1. Update `README.md`.
2. Update `README.zh-CN.md` in the same change.
3. Run `npm run verify:docs`; it checks the Chinese mirror's source marker and
   hash.

## License

No open-source license has been selected yet. Until a license is added, the code
is published for review and collaboration, but no reuse rights are granted by
default.
