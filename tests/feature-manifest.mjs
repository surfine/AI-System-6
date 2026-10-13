// Product feature → public-safe contract test mapping.
//
// `tests/features/public/*.test.mjs` ship in the public snapshot and must run
// from a fresh clone with no private fixtures. Maintainer tests (everything
// else in tests/features) may reference private prompt sources, visual-capture
// tooling or native assets and run only in the private tree.
//
// npm test prints a coverage summary from this manifest so a public feature
// can never silently lose its public-safe contract.

export const publicProductContracts = [
  {
    feature: "Writing Studio",
    tests: ["writing-studio-entry.test.mjs"],
  },
  {
    feature: "Application Services",
    tests: ["application-registry.test.mjs"],
  },
  {
    feature: "Run Receipts",
    tests: ["run-receipts.test.mjs"],
  },
  {
    feature: "Assistant Activity",
    tests: ["assistant-activity.test.mjs"],
  },
  {
    feature: "Writing Demo Teaser",
    tests: ["writing-demo-teaser.test.mjs"],
  },
  {
    feature: "Icon Distinguishability",
    tests: ["icon-distinguishability.test.mjs"],
  },
  {
    feature: "Menu Keyboard Navigation",
    tests: ["menu-keyboard.test.mjs"],
  },
  {
    feature: "Project Hard Disk",
    tests: ["project-disk.test.mjs", "project-backup-integrity.test.mjs"],
  },
  {
    feature: "File Floppy",
    tests: ["public/file-floppy-contract.test.mjs"],
  },
  {
    // ClioWorks v4.3 (I43-01): the server iWork importer's resource and
    // result-reporting contracts (bounded Snappy, multi-message archives,
    // short/repeated text, preview honesty).
    feature: "iWork Import",
    tests: ["iwork-import-quality.test.mjs"],
  },
  {
    // Unified spec (2026-10-10) W02: the mount:open reentrancy contract —
    // nested opens complete, shared initialization runs once, and a second
    // open of a mounting window waits instead of returning an early ready.
    feature: "Window Open Reentrancy",
    tests: ["window-open-reentrancy.test.mjs"],
  },
  {
    // Unified spec (2026-10-10) C01: chat history integrity — no arbitrary
    // last-6 window, no text-identity dedup, block-on-overflow for the chat
    // path, and compaction that never splices the original history.
    feature: "Chat History Integrity",
    tests: ["chat-history-integrity.test.mjs"],
  },
  {
    // Unified spec (2026-10-10) C02: the send view is separate from the
    // original record — versioned compaction records with identity fields,
    // legacy-unverified handling, a user-role envelope (never system), and
    // a CAS-style coverage commit in the send path.
    feature: "Compaction Record",
    tests: ["compaction-record.test.mjs"],
  },
  {
    // Unified spec (2026-10-10) C03: the budget comes from the final payload
    // and the provider's real input limit; unknown providers carry nulls,
    // never advertised maxima; the vendored contextBudget formula is the 8K
    // fixture's authority.
    feature: "Chat Context Budget",
    tests: ["chat-context-budget.test.mjs"],
  },
  {
    // Unified spec (2026-10-10) C05: summary content and permissions — pins
    // app-verified against originals, model summaries structurally validated,
    // assistant suggestions never recorded as user decisions, and provenance
    // (open questions, covered ids, source versions) riding the record.
    feature: "Chat Compaction C05",
    tests: ["chat-compaction-c05.test.mjs"],
  },
  {
    // Unified spec (2026-10-10) C04: the prepared-request snapshot at the
    // last send boundary carries no credentials, and the compaction fork is
    // gated on the vendored canForkSafely contract (tools never execute
    // server-side; a forced tool call or any changed prefix component
    // blocks the hot-prefix reuse — standalone request with tools closed).
    feature: "Chat Compaction Fork",
    tests: ["chat-compaction-fork.test.mjs"],
  },
  {
    feature: "ClioTalk",
    tests: ["public/clio-talk-contract.test.mjs"],
  },
  {
    feature: "Reader",
    tests: ["reader.test.mjs"],
  },
  {
    feature: "Searcher",
    tests: ["web-search-answer.test.mjs"],
  },
  {
    feature: "ClioStage",
    tests: ["public/clio-stage-contract.test.mjs"],
  },
  {
    feature: "CMF Studio",
    tests: ["public/cmf-studio-contract.test.mjs"],
  },
  {
    feature: "Cover Glass",
    tests: ["public/liquid-cover-contract.test.mjs"],
  },
  {
    feature: "Dictation",
    tests: ["public/dictation-contract.test.mjs"],
  },
  {
    feature: "Menu Bar",
    tests: ["public/menu-bar-contract.test.mjs"],
  },
  {
    feature: "Streaming Output",
    tests: ["public/streaming-output-contract.test.mjs"],
  },
  {
    feature: "Review Desk",
    tests: ["mingming-review.test.mjs", "mingming-handoff-review.test.mjs", "review-comments.test.mjs", "review-comments-backup.test.mjs", "review-decorations.test.mjs"],
  },
  {
    feature: "Scrapbook",
    tests: ["scrapbook.test.mjs"],
  },
  {
    feature: "Project CD",
    tests: ["project-cd-simple.test.mjs", "project-cd-async.test.mjs"],
  },
  {
    feature: "ClioChart",
    tests: ["clio-chart.test.mjs"],
  },
  {
    feature: "Edit kernel",
    tests: ["edit-kernel.test.mjs"],
  },
  {
    feature: "One More Tune",
    tests: ["one-more-tune.test.mjs", "one-more-tune-preview-relay.test.mjs"],
  },
  {
    feature: "Time Machine",
    tests: ["time-machine.test.mjs"],
  },
  {
    feature: "Writing Surface Ink",
    tests: ["editor-ink-visible.test.mjs"],
  },
];

export function publicContractFiles() {
  return publicProductContracts.flatMap((entry) => entry.tests);
}

/**
 * The contracts that exercise a whole system, and cost the wall clock.
 *
 * Measured on this machine, 2026-10-12, from the newest fast-lane run
 * (dist/verification/features-NYlH21 — 516 contracts, 310 s wall): the default
 * lane's wall clock is set by a handful of whole-system contracts — joyride
 * 160 s, bonsai-playable 99 s, bonsai-sc2 97 s, basin-flip-pot 88 s,
 * basin-flip-pot-ui 81 s, bonsai-city-windows 69 s. They run a city simulator, a
 * street drive or a world model for simulated time; none of them can answer a
 * question about a stylesheet or a window, which is what a development loop is
 * usually asking.
 *
 * Recompute this list from measured cost — the per-contract `durationMs` in
 * `dist/verification/features-<run>/summary.json` — rather than from memory.
 * Before 2026-10-12 it had not moved since 2026-09-15, when the suite was 334
 * contracts and the six names below were 104 s of a 42 s run; the suite has
 * since grown past 520 contracts, so a list drawn from that impression had
 * stopped matching what is actually slow (it deferred none of the six above).
 *
 * The default `npm test` is the fast lane and leaves these out, and it says how
 * many it left out. `npm run verify:features -- --all` runs everything,
 * `--lane batch` runs only these, and naming one runs it. A release does NOT
 * skip them: `verify:release` runs the whole suite, so a contract the
 * development loop defers is still verified before anything ships. (Cloud CI is
 * off, so that release step is the only gate that sees them.)
 */
export const batchContractNames = Object.freeze([
  // Bonsai City and the Micropolis it grew from: simulated years, the atlas,
  // the save/continuation path.
  "bonsai-no-dead-ends",
  "bonsai-atlas",
  "bonsai-kernel",
  "bonsai-save",
  "bonsai-systems",
  "bonsai-playable",
  "bonsai-sc2",
  "bonsai-city-windows",
  "bonsai-osm-import",
  "bonsai-renderer",
  "bonsai-micropolis-roundtrip",
  "bonsai-playthrough",
  "bonsai-save-continuation",
  "micropolis-scenarios",
  // Other world models and games.
  "joyride",
  "basin-flip-pot",
  "basin-flip-pot-ui",
  // Not a simulation, but it walks the whole lazy-command graph: a whole-system
  // answer, and the wall clock follows it.
  "lazy-command-loading",
]);
