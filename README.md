# AI System 6

AI System 6 is a local-first writing desktop for people who work from sources.
It keeps research, notes, drafts, review, and export as visible objects instead
of folding the whole job into one chat box.

The project borrows the restraint of Macintosh System 6: small windows, named
objects, deliberate saving, and one writing task at a time. The goal is not a
retro skin. The goal is to keep the writer's own language, sources, and intent
from being flattened into generic model prose.

## What is here

This is a public-safe source snapshot. It includes the app source, server
routes, tests, and the small runtime assets needed for local development.

It does not include private drafts, local browser data, API keys, generated
bundles, build output, package caches, large scraped corpora, or the original
private Git history.

## Run it

```sh
npm install
npm start
```

Then open `http://localhost:4173`.

`npm start` rebuilds the browser bundle before starting the local Node server.
For frontend-only edits, this is usually enough:

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
```

`npm run verify:release` is the heavier local gate. It is useful before a
packaged build, but it may require release assets and a valid build stamp.

## License

No open-source license has been selected yet. Until a license is added, the code
is published for review and collaboration, but no reuse rights are granted by
default.
