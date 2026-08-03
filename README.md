# AI System 6

**A live AI desktop — not another chatbot.**

[中文](README.zh-CN.md) · [Live demo](https://system6.aaronlau.me) · [Video](https://www.bilibili.com/video/BV1ht3m6UEDb/)

![AI System 6 live desktop](assets/readme/ai-system-6-live-desktop.png)

AI System 6 is a local-first, file-native AI workspace inspired by Macintosh System 6. It turns research, writing, and making into visible desktop work: apps stay open together, sources remain inspectable, and AI output does not become part of a project until you choose to save, clip, insert, or export it.

## What makes it different

### A desktop, not a chat window

MultiFinder keeps Searcher, Reader, Scrapbook, DocMap, ClioChart, ClioStage, ClioTalk, and other tools visible at the same time. They exchange real project files instead of hiding the work inside one conversation.

### One source-to-artifact route

```text
Search → Read → Clip → Map → Write → Review → Present
```

- **Searcher + Reader** find sources and open readable evidence.
- **Time Machine** revisits archived web pages through the Wayback Machine.
- **Scrapbook + DocMap** preserve selected material and expose its structure.
- **Question Sheet → Outline → Section Drafts → TeachText** carries one manuscript through the writing process.
- **Review Desk** checks factual and structural risk, including generic AI-mouthpiece drift.
- **ClioChart + ClioStage + Cover Glass** turn the same work into charts, slides, and a finished visual artifact.

### Local AI is a first-class option

Use chat and embedding models from **LM Studio**, connect **Ollama**, or configure **DeepSeek** or another **OpenAI-compatible** endpoint. The selected provider is interchangeable; AI System 6 is the working environment, not a model wrapper.

Projects, references, scraps, and settings live in browser-local storage. The server is stateless, and provider credentials stay outside project files, chats, backups, and exports.

### Modern tools inside a 1988 machine

- **CMF Studio** edits a 3D iPhone colorway and exports USDZ for AR.
- **Cover Glass** renders refractive WebGL typography and cover art.
- **File Floppy** imports documents, images, and audio with OCR and transcription workflows.
- **ClioChart** converts Markdown data into editable visual projections.
- **ClioStage** presents Markdown slide decks with source, slide, and cue views.
- **Classic / Liquid Glass** switches the same live desktop between two visual eras without losing the work in place.

The classic interface is grounded in real System 6.0.8 resources and period Macintosh interaction patterns rather than redrawn from memory.

## Try it

Open the [live demo](https://system6.aaronlau.me), or run it locally:

```sh
npm install
npm start
```

Then visit `http://localhost:4173`.

For local AI, start LM Studio and load a chat model before refreshing models in Control Panel. Ollama and cloud/OpenAI-compatible routes can also be configured there.

## Principles

- AI output is temporary until the user deliberately keeps it.
- Sources, prompts, run inputs, and project files should remain visible and inspectable.
- AI may help read, organize, draft, rewrite, and review; it should not flatten the writer's language into a generic model voice.
- A finished artifact matters more than an endless conversation.

## Development

The browser application is plain JavaScript with a small stateless Node.js server. There is no frontend framework or transpiler. See [CLAUDE.md](CLAUDE.md) for architecture, build rules, verification, and product contracts.

```sh
npm run verify:quick
npm run verify:features
npm run verify:release
```

## License

[MIT](LICENSE)
