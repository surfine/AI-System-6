<p align="center">
  <strong>AI System 6</strong><br>
  Source-based writing, kept out of the one-chat-box trap.<br>
  <span lang="zh-CN">一个本地优先的写作桌面：把资料、摘录、草稿、审校和导出放回可见对象里。</span>
</p>

<p align="center">
  <a href="README.zh-CN.md">简体中文</a> · <a href="README.md">English</a>
</p>

---

AI System 6 is a local-first writing desktop for people who work from sources.
It gives research, notes, drafts, review, and export their own visible places
instead of folding the whole job into a single chat.

The project borrows the restraint of Macintosh System 6: small windows, named
objects, deliberate saving, and one writing task at a time. The point is not a
retro skin. The point is to protect the writer's language, sources, judgment,
and handoff intent from being flattened into generic model prose.

## Chinese intro

AI System 6 是一个本地优先的写作桌面，适合需要围绕资料工作的写作者。它把研究、摘录、草稿、审校和导出放成可见对象，而不是全塞进一个聊天框。

它借用 Macintosh System 6 的克制感：小窗口、清楚的对象、主动保存，以及一次只处理一件写作任务。重点不在复古皮肤；它要保护写作者自己的语言、来源、判断和交付意图。

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
