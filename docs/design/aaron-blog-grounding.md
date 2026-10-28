# 潮汐信笺 grounding — the blog as a SideAsk corpus

<!-- doc-claims: verified | audited: 2026-10-24 -->

> 2026-10-24 · implementation note for 潮汐信笺 (the aaronlau.me reader) ×
> SideAsk. Second anchor on the contract in `shared-ai-grounding.md`.

## Principle

The blog and the desk are built by the same person, so the corpus is not
scraped: the blog generator publishes its own chunk index next to the reader's
content pack, and the desk only fetches, verifies, caches and ranks it. The
evidence contract, model call and chip styles are the shared ones from the
Endfield work; 潮汐信笺 adds a corpus, a timeline order and a way back to the
cited paragraph.

## Corpus: `ai6/rag.json` (blog side)

`internal/design-proposals/aaronlau-me/build.mjs --ai6` writes, in its AI6
pack section only:

- `ai6/rag.json` — `{ schema: 1, kind: "aaronlau-rag", chunking: "top-block-v1", docs, chunks }`.
  - `docs[]`: `id, k (post|long|note), t (title), d (date), u (aaronlau.me URL), g (tags), s (series), a (1 = App-scope)`.
  - `chunks[]`: `d (doc index), p (block index), h (heading), x (text)`; a
    prediction-ledger entry is its own chunk with `k: "pred"`, `p: -1` and
    `pr: { id, made, status, label, due, resolved, confidence }`.
- One chunk = one top-level block of the rendered article (paragraph, list,
  quote, table). `p` is that block's child index in
  `.aaron-blog-article-body`, so a chip can scroll to it. Headings label the
  following chunks instead of standing alone; blocks over 700 characters split
  at sentence ends and keep their `p`.
- `ai6/long.json` and `index.longs` — long reads (`/long/`) travel in the pack
  so the reader can open them. A long read carries `diskUrl` (its AI System 6
  demo disk) or, without a disk, `origin` and `source: "原载 App-scope"`.
- `manifest.json` gains `rag: { path, sha256, bytes, docs, chunks }`, and the
  pack's `contentHash` now covers `long.json` and `rag.json`.

Built from the 2026-10-24 tree with the 49 long reads on `aaronlau-site`:
2,621 docs, 9,225 chunks, 420 prediction chunks, 3.30 MB uncompressed.

## Ranking: `app/shared/blog-rag-runtime.js`

One pure UMD module, loaded by the server (`require`) and the browser (a
classic script the reader loads when it opens), so both paths rank
identically:

- Queries and text fold through a character-level OpenCC t2s table, so a
  Traditional-Chinese question matches the Simplified corpus.
- Chinese runs become overlapping bigrams, Latin and digit runs lowercase
  words; BM25 (k1 1.2, b 0.75) with the title added to every chunk.
- Question furniture (怎么看, 看法, 变化, 他…) is cut from the query; a chunk
  must cover a share of the remaining query weight, and partial matches are
  discounted, so one shared bigram is not evidence.
- Years are first-class: a year in the question filters (`2013 年`), a range
  bounds (`2013 到 2016`); if the year has nothing, other years answer and the
  result says `yearRelaxed`. "How did his view change" questions pick the best
  block of each year and return the set in date order (`order: "chronological"`).
- At most three blocks per post; asking from one post puts that post's blocks
  first.

No embeddings: the desk's embedding routes depend on which model is connected,
and a lexical index works offline with no download.

## Server: `/api/aaron-blog/retrieve`

`apps/server/server/routes/aaron-blog.js` (same fixed, session-free door as the
reader's pack):

- fetches `manifest.json`, then `rag.json`, and refuses bytes whose SHA-256
  differs from the manifest;
- keeps the verified copy in memory and on disk
  (`~/.ai-system6/aaron-blog/`, or `AI_SYSTEM6_AARON_BLOG_CACHE_DIR`); when the
  blog is unreachable it answers from that copy with `pack.offline: true`;
- `GET /api/aaron-blog/rag` serves the same verified bytes to the reader;
- `AI_SYSTEM6_AARON_BLOG_PACK_DIR` points the route at a local `dist/ai6`
  build, so a new index can be tried before the blog is deployed.

It never crawls the site and never calls a model.

## Adapter: `app/core/aaron-blog-grounding.js`

`window.AISystem6AaronBlogGrounding`, the same API shape as the Endfield
adapter:

- `searchForSideAsk(query, { signal })` — the retrieval route; never a model.
- `searchLocally(query)` — offline: ranks the pack 潮汐信笺 keeps in its
  IndexedDB (`ais6-aaron-blog`, key `rag`, refreshed when the manifest's
  `rag.sha256` changes).
- `buildFromResults(results)` — 1:1 grounding sources: `kind: "aaronBlog"`,
  `[S1]…[Sn]`, `postId`, `para`, `quote`, `url`, `date`.
- `toSideAskContext(query, results, options)` / `anchorContext(lang)` — the
  prompt section: the citation contract, dates on every claim, the timeline
  instruction, the year-relaxed note, and the no-evidence instruction (say the
  blog has not written about it; do not answer for the author).
- `prepare(query)` — server first, then the offline pack, then the previous
  question's evidence (`fallback: true`).
- `setScope({ type: "post", id, title, date } | { type: "blog" })`,
  `reveal(source)`.

It registers itself in SideAsk's anchor registry,
`window.AISystem6SideAskAnchors.aaronBlog = { prepare, grounding, context, label, reveal }`.
`chat-messages.js` reads that registry through one helper, `anchorHook()`, and
`window-manager.js` takes the pairing label from it, so a future retrieval
anchor costs no further boot bytes. The runtime and the adapter are not in any
boot manifest: `app/features/aaron-blog.js` loads both with
`ensureLazySystemModule` when the reader mounts (declared in
`tests/features/orphan-sources.test.mjs`, like the Endfield grounding core).

## Data flow

1. 潮汐信笺 syncs: manifest → index → (background) `rag` into IndexedDB.
2. The user picks **在 SideAsk 中问** (status bar: whole blog, or the post
   when a passage is selected) or **问这篇** (article head: this post). A
   selected passage becomes the start of the question.
3. On each SideAsk question, `submitUserTextCore` calls
   `anchorHook()?.prepare(userText, signal)` while the anchor is `aaronBlog`.
4. `formatSideAskAnchorContext` adds the hook's `context()`;
   `captureClioTalkGroundingSnapshot` merges the same sources so the chips
   render and every `[Sn]` stays clickable (up to 24 blog sources).
5. A chip calls `reveal(source)`: 潮汐信笺 opens (the window is created if
   absent), opens the post or long read, and marks the cited block
   (`.is-cited`), located by `p` and confirmed by the opening words; if the
   post cannot be shown, the aaronlau.me page opens. The article footer also
   links the post on aaronlau.me.

## Invariants

- Only the question text and the public post id leave the browser; no project
  or personal data enters this retrieval.
- No second model invocation or evidence formatter: the model is whatever the
  SideAsk model source is set to.
- Chips reuse `clio-basis-chip` / `message-grounding-*`; the reader adds only
  its own ask link and the cited-paragraph mark.
- The blog generator change is confined to the AI6 pack section of `build.mjs`.

## Tests

- `tests/integration/aaron-blog-grounding.test.mjs` — t2s folding, bigrams,
  year filter and relaxation, timeline order, prediction and long-read fields,
  post scope, numbering and keys, context wording (zh/en, no evidence), the
  retrieval request, offline and stale fallbacks, chip routing.
- `tests/features/aaron-blog-sideask-grounding.test.mjs` — real local server
  over a fixture pack: retrieval, hash refusal, disk copy answering offline,
  the verified pack served to the reader, wiring in chat-messages,
  window-manager, the adapter's registration and the reader; the built
  `dist/ai6` pack's SHA-256 when present.
- Regression: `aaron-blog`, `endfield-sideask-grounding`,
  `endfield-grounding`, `launch-intent`, `orphan-sources`,
  `lazy-module-reachable`, `verify:floppy`, `build:app`.
