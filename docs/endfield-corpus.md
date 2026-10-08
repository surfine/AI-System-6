# Endfield corpus maintenance

The 2026-10-08 refresh targets the public Warfarin v1.5 corpus, whose index reports an update date of 2026-09-24. The runtime reads five aggregate JSON files under `apps/desktop/data/warfarin-*`; the individual historical export files are not runtime inputs.

The official [Danqingdu development update](https://www.taptap.cn/moment/856662494825941594) schedules 丹青渡 for 2026-10-15. Its preview is not released story evidence. The preparation record is endfield-danqingdu-preparation.json; it does not automatically activate a new version or import previews into answers.

## Refresh safely

Use a new staging directory for every refresh. Run the existing scrapers with `--out <stage>/<kind>`: `scrape-warfarin-missions.mjs`, `scrape-warfarin-operator.mjs --all`, `scrape-warfarin-tutorials.mjs --all`, `scrape-warfarin-lore.mjs --all`, and `scrape-warfarin-documents.mjs --all`. The plural staging kinds are `missions`, `operators`, `tutorials`, `lore`, and `documents`.

The mission scraper recognizes English and Chinese section headings and preserves each speaker turn within a scene card. It includes both dialogue and radio in the runtime transcript; radio lines carry `channel: "radio"`. `--cache-dir <new-cache>` saves source HTML for inspection and reparsing. Use a new cache for a new upstream refresh: an existing cache is an offline snapshot, not a freshness check.

Prepare a candidate without touching production data:

```sh
node tooling/prepare-endfield-refresh.mjs \
  --previous apps/desktop/data \
  --staging /path/to/stage \
  --out /path/to/new-candidate
```

The output directory must not exist or overlap either input. All five datasets must have valid counts, unique IDs, provenance, and usable body text before output is created. Missing records, emptied records, and records whose body shrank by more than half retain their previous text, version, and scrape time. This includes the official Skland supplement. Review the retained list before replacing anything; a retained record is not evidence that the upstream source was freshly verified.

`refresh-receipt.json` records added, updated and retained IDs and the SHA256 of every old, staged and candidate aggregate. The dataset `scrapedAt` remains the oldest record date; `refreshedAt` records this refresh. Per-record version metadata takes priority over a dataset fallback, so a future refresh cannot silently relabel old evidence. Non-mission scrapers currently omit the global footer version; the preparer records an explicit fallback to the same Warfarin mission index, and rejects an unknown version.

Before copying the five candidate aggregates, save the old bytes and hashes. Review newly added content and a sample of changed dialogue, radio, speaker attribution and retained official records. Run the three `endfield-mission-scraper`, `endfield-refresh` and `endfield-version-stamps` feature tests, existing Endfield contracts, then verify both empty-search metadata and searches for new and retained content over the actual HTTP service. Keep the receipt with the delivery evidence.

For 丹青渡, confirm the public release and upstream version first, then review its actual chapter IDs and spoiler-progress mapping before enabling a new chapter option. Do not change every existing row to the announced version or infer a numeric version from the scheduled date.
