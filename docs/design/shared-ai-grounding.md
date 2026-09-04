# Shared AI grounding — one evidence contract, many surfaces

> 2026-09-04 · implementation note for the Endfield Terminal × ClioTalk/SideAsk
> work.

## Principle

AI capabilities are shared application-wide. The Endfield Terminal, ClioTalk
and SideAsk are the same shape underneath — retrieve evidence, answer with a
citation contract — and differ only in their RAG object and their surface
character. We share the bones (search, model runtime, citation contract) and
keep each face distinct.

## The shared contract: ClioTalk `grounding`

The single public citation contract is ClioTalk's existing `grounding` object,
consumed by `appendMessageGrounding` / `decorateClioTalkInlineCitations`:

```js
{
  sources: [
    { kind, label, key, index, citation: "[S1]", text, url, speaker, context }
  ],
  sourceCount
}
```

Citations inside ClioTalk/SideAsk answers use `[S1]…[Sn]`. The Endfield
Terminal window keeps its own `【n】` dialect and expandable evidence cards —
that is its character, not a second contract. The adapter guarantees both
numbering schemes follow the same result order.

## Adapter: `app/core/endfield-grounding.js`

`window.AISystem6EndfieldGrounding`:

- `searchForSideAsk(query, { signal })` — calls the shared server endpoint
  `/api/endfield/search`; never calls a model.
- `buildFromResults(results)` — maps search results 1:1 to grounding sources.
- `toSideAskContext(query, results, { lang })` — SideAsk prompt context with
  the citation contract and the no-evidence instruction.
- `prepare(query, { signal })` — run just before a SideAsk message is sent
  while the terminal is the anchor; stores fresh per-question evidence and
  falls back to the terminal's last cached answer when live search fails
  (marked `fallback: true`).

## Data flow

1. Terminal answers single-shot (its own UI, `【n】` evidence cards) through the
   shared `/api/endfield/ask` pipeline.
2. User picks “Ask in SideAsk” — the terminal becomes a SideAsk anchor.
3. On each SideAsk question, `submitUserTextCore` calls
   `ensureEndfieldGroundingLoaded()` then `prepare(userText)`, so the prompt
   context uses fresh evidence for THIS question.
4. `formatSideAskAnchorContext` renders that evidence with the `[S1]` contract;
   `captureClioTalkGroundingSafely` merges the same sources into the reply so
   the chips render and are clickable.
5. Clicking an `endfield` chip focuses the terminal and opens
   `#endfield-evidence-N` (the terminal keeps its own evidence rendering);
   without a window it falls back to the context panel.

## Invariants

- Terminal single-shot; multi-turn memory lives only in SideAsk/ClioTalk.
- No second model invocation, evidence formatter, or prompt contract in the
  client for Endfield RAG.
- ClioTalk ordinary (unpaired) conversation never triggers Endfield search;
  a global “switch retrieval source” is an optional later capability and stays
  off by default.
- No new UI/CSS: grounding chips reuse `clio-basis-chip` /
  `message-grounding-*` classes; no new endpoints.

## Tests

- `tests/integration/endfield-grounding.test.mjs` — adapter numbering,
  labels, keys, empty results, no-evidence wording, request-service usage,
  cache fallback.
- `tests/features/endfield-sideask-grounding.test.mjs` — real local server
  search + adapter mapping + SideAsk context contract.
- Regression: `endfield-archive-meta`, `launch-intent`, `build:app`.

Manual acceptance: terminal “捕梦网” → Ask in SideAsk → ask “那之后安德烈怎么
了” → reply carries clickable evidence chips that return to the terminal’s
evidence card; a worldview question like “帝江号” hits the same shared corpus.
