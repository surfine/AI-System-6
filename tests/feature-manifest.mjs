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
    feature: "Draft Desk",
    tests: [
      "draft-desk.test.mjs",
      "draft-desk-persistence.test.mjs",
      "draft-desk-boundaries.test.mjs",
    ],
  },
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
    tests: ["mingming-review.test.mjs", "mingming-handoff-review.test.mjs"],
  },
  {
    feature: "Scrapbook",
    tests: ["scrapbook.test.mjs"],
  },
  {
    feature: "DocMap",
    tests: ["docmap.test.mjs"],
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
