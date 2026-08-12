<div align="center">

<samp>AI SYSTEM 6 / LOCAL-FIRST AI COMPUTER / BUILD 20260812.1</samp>

# CHAT IS AN APP.<br>NOT THE WHOLE COMPUTER.

**AI System 6 is a file-native AI desktop inspired by Macintosh System 6.**<br>
Search. Read. Clip. Map. Write. Review. Present. Keep the work on the desk.

[**BOOT LIVE SYSTEM ↗**](https://system6.aaronlau.me)　·　[**WATCH 50S FILM ↗**](https://www.bilibili.com/video/BV1ht3m6UEDb/)　·　[**PRODUCT SITE ↗**](https://aisystem6.pages.dev)　·　[**MAC BETA ↓**](https://github.com/surfine/AI-System-6/releases/latest)

<sub><a href="README.zh-CN.md">简体中文</a>　/　<a href="docs/README.md">DOCS</a>　/　<a href="CONTRIBUTING.md">CONTRIBUTE</a>　/　<a href="https://github.com/surfine/AI-System-6/stargazers">STAR THE MACHINE ★</a></sub>

<br>

[![The real AI System 6 desktop moving a window by its classic dotted outline, then switching through all six appearances](apps/desktop/assets/readme/hero-desktop.gif)](https://system6.aaronlau.me)

<sub>RECORDED FROM THE RUNNING SYSTEM · NOT A CONCEPT RENDER</sub>

</div>

```text
AI SYSTEM 6 / BOOT RECORD
──────────────────────────────────────────────────────
[ OK ] LOCAL-FIRST        projects live in your browser
[ OK ] MODEL-AGNOSTIC     LM Studio · Ollama · DeepSeek
[ OK ] FILE-NATIVE        sources go in · artifacts come out
[ OK ] NO UI FRAMEWORK    plain JavaScript · visible machinery
[ 2× ] 1.44 MB            hard boot budget, enforced in CI
──────────────────────────────────────────────────────
STATUS: THE AI HAS A DESKTOP NOW.
```

## The missing layer between a model and your work

Chat is excellent at conversation. It is a poor filesystem, workspace,
provenance model, and long-running project surface. AI System 6 restores the
parts of a computer that chat removed:

| A chat product | This computer |
| --- | --- |
| One thread owns the workflow | MultiFinder keeps real working apps open together |
| Context disappears into a prompt | Sources, scraps, maps, drafts, and outputs stay visible |
| Generated text quietly becomes truth | AI output is temporary until you save, clip, insert, or export it |
| The answer is the endpoint | The endpoint is a file, manuscript, chart, deck, cover, or 3D object |
| The model is the product | Bring a local model, a cloud model, or no model at all |

> A disk tells you what lasts. A floppy tells you what is temporary. A
> Scrapbook contains only what you chose to keep.

## Sources go in. Files come out.

```text
 WEB / PDF / AUDIO / IMAGE / NOTES
                  │
                  ▼
  SEARCH ── READ ── CLIP ── MAP ── WRITE ── REVIEW
     │        │       │       │        │         │
 Searcher   Reader  Scrapbook DocMap  Studio  Review Desk
                  │
                  └──────────────►  .md  .pdf  .pptx  .png  .usdz
```

Draft Desk handles the quick route. Writing Studio carries a serious project
from research and Question Sheet through outline, sections, manuscript, and
review. ClioChart, ClioStage, Cover Glass, and CMF Studio turn the same visible
work into charts, presentations, visual artifacts, and AR-ready 3D files.

## One desk. Six systems.

`SYSTEM 6` → `PLATINUM` → `AQUA` → `SNOW LEOPARD` → `YOSEMITE` → `LIQUID GLASS`

The work never moves; the entire computer changes era around it. System 6 is
the default and begins with real System 6.0.8 resources and observed Macintosh
behavior. Known historical objects are evidence-led, not generic retro redraws.
Modern appearances own independent, Retina-ready icon families.

## Impossible software for a 1988 computer

| MACHINE | CAN NOW |
| --- | --- |
| **Searcher + Time Machine** | search the web and revisit archived pages |
| **File Floppy** | OCR images and documents; transcribe audio |
| **ClioChart** | project Markdown data into editable charts |
| **ClioStage** | build and present Markdown slide decks |
| **Cover Glass** | render refractive WebGL typography |
| **CMF Studio** | recolor 3D products and export USDZ for AR |
| **Control Panel** | switch models, providers, language, and the whole visual era |

## The repository is the system diagram

```text
AI-System-6/
├── apps/
│   ├── desktop/       browser computer: OS services, apps, styles, assets
│   └── server/        stateless Node.js bridge and model adapters
├── site/              independently deployable product website
├── platform/
│   ├── macos/         native rewrite + lightweight desktop shell
│   └── web/           production web-release contracts
├── tooling/           build, verify, package, snapshot, release
├── tests/             executable product and architecture contracts
├── docs/              public architecture, development, and design knowledge
└── internal/          evidence, experiments, archives, maintainer operations
```

These are physical ownership boundaries, not decorative folders. Browser URLs
remain stable (`/app`, `/assets`, `/data`), while every builder resolves them
through `apps/desktop`. The server owns no application database; durable project
state lives in IndexedDB. Heavy tools load lazily from a third “floppy.”

Read [Architecture](docs/ARCHITECTURE.md), [Development](docs/DEVELOPMENT.md),
and [Design evidence](docs/design/DESIGN.md).

## Boot a local machine

Requires Node.js 20+.

```bash
git clone https://github.com/surfine/AI-System-6.git
cd AI-System-6
npm ci
npm start
```

Open [localhost:4173](http://localhost:4173). No model is required to explore
the desktop; connect one later in Control Panel.

```bash
npm run build          # deterministic desktop bundle
npm test               # executable feature contracts
npm run site:check     # official website + canonical icon sync
npm run verify:public  # repository + command + asset + docs gate
```

The public repository is a curated, independently verifiable source snapshot.
Every command it exposes must work from a fresh clone.

## Bring your own intelligence

| Route | Use it for |
| --- | --- |
| **LM Studio** | local chat, embeddings, discovery, and model loading |
| **Ollama** | local OpenAI-compatible serving |
| **DeepSeek** | built-in cloud configuration |
| **Custom endpoint** | any compatible provider and model |
| **No model** | the desktop and every non-AI tool |

Credentials never enter project files, chats, backups, or exports.

## Help this computer escape the lab

AI System 6 is MIT licensed. Start with [CONTRIBUTING.md](CONTRIBUTING.md) or
open an issue with a reproducible product contract. Security reports follow
[SECURITY.md](SECURITY.md).

<div align="center">

### IF YOU WANT AI SOFTWARE TO FEEL LIKE A COMPUTER AGAIN—

# [★ STAR AI SYSTEM 6](https://github.com/surfine/AI-System-6)

Stars are the signal that helps this strange machine find its builders.

[**LIVE DESKTOP**](https://system6.aaronlau.me)　·　[**BILIBILI FILM**](https://www.bilibili.com/video/BV1ht3m6UEDb/)　·　[**PRODUCT SITE**](https://aisystem6.pages.dev)　·　[**LATEST RELEASE**](https://github.com/surfine/AI-System-6/releases/latest)

<sub>Independent project. Not affiliated with or endorsed by Apple Inc.</sub>

</div>
