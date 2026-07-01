# AI System 6

A local-first AI writing environment that protects the writer's voice, sources,
and intent.

AI System 6 is a quiet desktop for source-based writing. It separates projects,
temporary source material, reading, clipping, outlining, section drafting,
manuscript editing, review, and export into visible objects instead of putting
the whole writing process into one chat box.

## Status

This repository is a public-safe source snapshot. It intentionally excludes
local build output, package caches, private drafts, captured screenshots,
experimental side projects, generated bundles, and scraped reference corpora.

The current app is a beta. The core route is usable, but releases should still
be treated as unsigned beta builds unless a release explicitly says otherwise.

## Run Locally

```sh
npm install
npm start
```

Then open `http://localhost:4173`.

`npm start` rebuilds the browser bundles before starting the local Node server.
If you edit files under `app/` or `app.js`, run:

```sh
npm run build:app
```

## Models

Local models are supported through LM Studio-compatible endpoints. Cloud model
routes use API keys supplied by the user at runtime or through environment
variables.

No API keys, local conversations, IndexedDB records, private drafts, or local
profile data are included in this repository.

Common environment variables:

```sh
PORT=4173
LM_STUDIO_URL=http://127.0.0.1:1234/v1/chat/completions
LM_STUDIO_BASE_URL=http://127.0.0.1:1234
DEEPSEEK_API_KEY=...
```

## Useful Commands

```sh
npm run build:app        # rebuild app.bundle.js and styles.bundle.css
npm run verify:features  # run executable feature contracts
npm run verify:css       # CSS budget and layer checks
npm run verify:release   # full local release gate
npm run bundle:mac-app   # build the packaged macOS app shell
```

## Public Snapshot Notes

This source snapshot vendors the small System 6-style font and UI assets needed
by the app. Generated files such as `app.bundle.js`, `styles.bundle.css`,
`dist/`, `.build/`, and `node_modules/` are intentionally ignored.

Large scraped corpora and private writing/demo material are not part of the
public source release. Demo text included in `app/data/` is synthetic or
sanitized for public development.

## License

No open-source license has been selected yet. Until a license is added, the code
is published for review and collaboration, but no reuse rights are granted by
default.
