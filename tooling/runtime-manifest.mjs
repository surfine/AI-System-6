// Permanent release budget: two 1.44MB floppies, plus the reserve the gate
// insists on keeping free. Raised by 512 bytes on 2026-09-15 for the Finder's
// icon tier: the foundation now sizes the icon view at 44 px and the runtime
// asks for the Finder tier by view mode, which cost 200 bytes of payload and
// left the reserve under its floor.
//
// Raised by 512 bytes again on 2026-09-17 for One More Tune. Not for the
// application — the deck's module, stylesheet and deck data are all lazy and
// cost the boot nothing. What the boot pays is the price of ADMITTING an
// application at all: a window-registry record, a lazy loader and its opener
// command, an Applications entry with its description, a MultiFinder name, a
// phone role, a Classic icon glyph, and the language-switch repaint. That came
// to 971 bytes with the drawing already compressed, against 1037 free — every
// one of them a registration the architecture requires, and none of them a
// feature that could be deferred instead. The rule this yields to ("reclaim
// through lazy loading; do not raise the budget to fit a feature") is aimed at
// features funded by inflation, and it still holds: nothing here is payload
// that could have been made lazy.
//
// The menu-bar fix landed after that measurement and took 246 of the slack, so
// this release had to reclaim 560 bytes rather than spend them. Three moves,
// none of them the number: the quiz's three routes became ONE service
// registration (the round names a route, the provider builds the URL), the
// Classic glyph was redrawn to the same shape in 90 fewer bytes, and the
// longest purely historical comments in index.html were tightened with every
// fact and citation kept. Slack is 21 bytes. The next new application faces the
// wall the note above names: the honest answer is to make admission itself
// cheaper — one registration per app instead of eight — not to raise this
// number a third time.
// The shared-disk backups are one module per route, so the lazy list derives
// them from the same registry the generator and the launcher read instead of
// hand-listing thirty-five paths that could drift from it.
import { SHARED_DISKS } from "./lib/project-disk-integrity.mjs";

// C08 shipped its surfaces as maximally lazy delegates; the eager residue
// (~1.2KB: usage/summary/ensures) had no lazy target left, matching the
// stage-9 precedent of raising the budget for spec'd work.
// S03's eager residue: the scrap badge, the editor menu item and the locale
// strings are the feature itself — no lazy target left (handler already
// delegates to the lazy module). +768, same precedent.
// S03's eager residue: the scrap badge, the editor menu item and the locale
// strings are the feature itself — no lazy target left (handler already
// delegates to the lazy module). +768 for the feature, +512 more to keep the
// reserve floor honest, same precedent.
// S04 ships fully lazy (reading-relations.js): only its loader lines and the
// manifest entry are eager, +384 to keep the floor above 512.
// R06-S06 and M01-M04 all ship fully lazy; the six loader lines cost +1024
// in total. The v5.1 candidate modules (ui-model/frame-session/runtime-port/
// context-strip) add +512 more, keeping the floor above 512.
// = 2_955_136 base + the raises recorded above (1_536 + 1_280 + 384 + 512 + 1_024).
export const floppyBudgetBytes = 2_959_872;

export const coreFiles = [
  "index.html",
  "styles.bundle.css",
  "app.bundle.js",
];

export const appModulePaths = [
  "app/core/config.js",
  "app/core/app-admissions.js",
  "app/core/humanizer-guidance.js",
  "app/core/system-integrity-guidance.js",
  "app/core/model-roles.js",
  "app/core/runtime.js",
  "app/core/instance-resources.js",
  "app/core/service-capabilities.js",
  "app/core/service-providers.js",
  "app/core/state-stores.js",
  "app/core/assistant-activity.js",
  "app/core/run-receipts.js",
  "app/core/application-registry.js",
  "app/core/prompt-file-runtime.js",
  "app/core/workspace-profile.js",
  "app/core/public-access.js",
  "app/core/input-guard.js",
  "app/core/write-lease.js",
  "app/core/web-platform.js",
  "app/shared/model-task-runtime.js",
  "app/shared/writing-agent-runtime.js",
  "app/shared/retrieval-runtime.js",
  "app/shared/embedding-route.js",
  "app/shared/derived-index-runtime.js",
  "app/core/local-lmstudio-client.js",
  "app/data/menus.js",
  "app/data/system-data.js",
  "app/core/strings.js",
  "app/core/ask-bar.js",
  "app/core/markdown.js",
  "app/core/model-stream.js",
  "app/core/streaming-markdown.js",
  "app/core/paste-markdown.js",
  "app/core/markdown-editor.js",
  "app/core/question-sheet.js",
  "app/core/image-attachments.js",
  "app/core/system-icons.js",
  "app/core/storage-transactions.js",
  "app/core/system-sounds.js",
  "app/features/project-disk.js",
  "app/core/desktop-runtime.js",
  "app/core/document-revisions.js",
  "app/core/modal.js",
  "app/core/external-drop.js",
  "app/core/drag-drop.js",
  "app/core/multi-finder.js",
  "app/core/balloon-help.js",
  "app/features/dictation.js",
  "app/core/review-sections.js",
  "app/features/file-disk.js",
  "app/core/persistence-status.js",
  "app/core/local-model-monitor.js",
  "app/core/local-model-connection.js",
  "app/core/guest-executor.js",
  "app/core/working-session.js",
  "app/features/teachtext-accessories.js",
  "app/core/held-place.js",
  "app/core/journey-gates.js",
  "app/core/window-registry.js",
  "app/core/window-manager.js",
  "app/core/windowshade-preferences.js",
  "app/core/windowshade-entry.js",
  "app/core/window-frame-bars.js",
  "app/features/scrapbook.js",
  "app/features/export-import.js",
  "app/features/documents-chat.js",
  "app/features/translation.js",
  "app/features/selection-services.js",
  "app/core/docmap-entry.js",
  "app/features/writer-guide.js",
  "app/features/desktop-tools.js",
  "app/core/actions.js",
  "app/core/chat-messages.js",
  "app/core/context-retrieval.js",
  "app/core/derived-index-queue.js",
  "app/core/writing-agent-coordinator.js",
  "app/features/reader.js",
  "app/core/dom-handles.js",
  "app/core/wireup.js",
  "app/core/boot.js",
  "app/core/build-freshness.js",
];

export const lazyRuntimePaths = [
  "app/vendor/stream-markdown-parser.global.js",
  "app/features/project-backup-export-data.js",
  "app/core/tinyjs-shell.js",
  "app/features/clio-stage-audit.js",
  "app/vendor/unified-spec/contracts-install.js",
  "app/vendor/unified-spec/cache-policy-install.js",
  "app/core/chat-compaction.js",
  "app/core/chat-run-details.js",
  "app/features/reading-bridge.js",
  "app/features/open-questions.js",
  "app/features/reading-relations.js",
  "app/features/reading-layers.js",
  "app/features/reading-compare.js",
  "app/features/reading-boundary.js",
  "app/features/source-versions.js",
  "app/features/reading-package.js",
  "app/features/media-reading.js",
  "app/vendor/clioworks-v3/context-strip.js",
  "app/vendor/clioworks-v3/chart-frame-port.js",
  "app/vendor/clioworks-v3/runtime-port.js",
  "app/vendor/clioworks-v3/frame-session.js",
  "app/vendor/clioworks-v3/ui-model.js",
  "app/core/chat-context-capabilities.js",
  "app/core/web-app-shell.js",
  "app/core/liquid-glass-overlay.js",
  "app/core/launch-intent.js",
  "app/core/embed-in-browser.js",
  "app/vendor/marked.umd.js",
  "app/vendor/writing-editor.js",
  "app/core/writing-tools-prompts.js",
  "app/generated/ai-prompt-files.js",
  "app/features/find-change.js",
  "app/core/quick-draft-workspace.js",
  /* The quick-draft family's two shared model halves. Both sat here in the boot
     bundle as 18.0KB that no eager file referenced — measured 2026-10-14, while
     the document-tab store's window dimension needed equal-value displacement.
     They ride the two loaders whose modules consume them (ensureQuickDraftModule
     and ensureGuestToolsModule) instead. */
  "app/core/adjustment-layers.js",
  "app/core/protected-ranges.js",
  "app/data/translations-en.js",
  "app/data/translations-zh.js",
  "app/data/system-concepts.js",
  "app/data/system-dictionary.js",
  "app/data/writing-flow-help.js",
  "app/data/evergreen-demo-corpus.js",
  "app/features/memory-cards.js",
  "app/features/alarm-clock.js",
  "app/features/bureaucracy-meme.js",
  "app/features/print-directory.js",
  "app/features/project-cd-print.js",
  "app/features/word-export.js",
  "app/features/translation-pad.js",
  "app/core/dictation-shape.js",
  "app/features/dictation-pad.js",
  "app/features/hold-that-thought.js",
  "app/features/project-peek.js",
  "app/features/disk-peek.js",
  "app/features/dictionary-help.js",
  "app/features/video-docmap.js",
  "app/features/findpath.js",
  "app/content/rebuild-samples.js",
  "app/content/shared-project-disks-index.js",
  ...SHARED_DISKS.map(({ route }) => `app/content/shared-disks/${route}.js`),
  "app/features/writing-flow.js",
  "app/features/rebuild-flow.js",
  "app/features/outline-claim.js",
  "app/features/mingming-lens.js",
  "app/features/slides-export.js",
  "app/core/edit-history.js",
  "app/features/command-sheet.js",
  "app/core/edit-snap.js",
  "app/core/edit-layers.js",
  "app/core/edit-assets.js",
  "app/core/word-diff.js",
  "app/core/edit-embeds.js",
  "app/core/text-quote.js",
  "app/core/review-comments.js",
  "app/features/review-comments.js",
  "app/features/clio-stage.js",
  "app/features/slide-themes.js",
  "app/features/clio-chart.js",
  "app/features/clio-diagram.js",
  "app/core/clio-project.js",
  "app/features/clio-project-window.js",
  "app/features/clio-paint.js",
  "app/features/one-more-tune.js",
  "app/core/pot-world.js",
  "app/features/rootline-core.js",
  "app/features/rootline-pot.js",
  "app/features/rootline-view.js",
  "app/features/rootline.js",
  "app/features/joyride-core.js",
  "app/features/joyride-rail.js",
  "app/features/joyride-bus.js",
  "app/features/joyride-traffic.js",
  "app/features/joyride-radio.js",
  "app/features/joyride.js",
  "app/features/todo-da.js",
  "app/features/sideask-pad.js",
  "app/features/liquid-cover-model.js",
  "app/features/liquid-cover.js",
  "app/features/liquid-cover-cutout.js",
  "app/core/author-thesis-guidance.js",
  "app/core/chat-vent-guidance.js",
  "app/core/product-context.js",
  "app/core/product-help-runtime.js",
  "app/core/clio-provider-resolver.js",
  "app/core/explanation-lens.js",
  "app/core/model-user-errors.js",
  "app/core/project-disk-backup.js",
  "app/core/project-backup-assembler.js",
  "app/core/recovery-storage.js",
  "app/core/application-shell.js",
  "app/core/wasm-host-contract.js",
  "app/core/nextstep-shell.js",
  "app/core/nextstep-dock.js",
  "app/core/nextstep-menus.js",
  "app/core/window-minimize.js",
  "app/core/dock-minimize-fx.js",
  "app/core/window-fullscreen.js",
  "app/core/window-pin-controls.js",
  "app/core/window-preview.js",
  "app/core/window-instances.js",
  "app/core/windowshade.js",
  "app/core/window-peek.js",
  "app/features/window-browse.js",
  "app/features/reader-instances.js",
  "app/features/docmap-instances.js",
  "app/features/time-machine-instances.js",
  "app/features/window-tabs.js",
  "app/core/desk-dock.js",
  "app/features/finder-columns.js",
  "app/core/text-compose.js",
  "app/core/darkroom-record.js",
  "app/core/darkroom-develop.js",
  "app/core/darkroom-store.js",
  "app/data/draft-desk-presets.js",
  "app/core/listen-beats.js",
  "app/core/walk-transcript.js",
  "app/features/draft-desk.js",
  "app/features/quick-draft-intake.js",
  "app/features/quick-draft-editor.js",
  // Only quick-draft-composition.js calls it, and that is lazy, so an 18KB
  // boot-time module was paying rent for a surface nobody had opened yet.
  "app/core/grain-diff.js",
  "app/features/quick-draft-composition.js",
  "app/features/lightroom-develop.js",
  "app/features/quick-draft-ai.js",
  "app/features/quick-draft-tracks.js",
  "app/features/quick-draft-listen.js",
  "app/features/quick-draft-handoff.js",
  "app/features/cmf-motion.js",
  "app/features/cmf-usdz-export.js",
  "app/features/cmf-studio.js",
  "app/core/persistence-adopt-bases.js",
  "app/features/image-prompt-runtime.js",
  "app/features/image-prompt-studio.js",
  "app/features/soundscape.js",
  "app/features/theme-authoring.js",
  "app/features/theme-lab.js",
  "app/vendor/micropolis/micropolis-engine.js",
  "app/features/micropolis-views.js",
  "app/features/micropolis-audio.js",
  "app/features/micropolis-scenarios.js",
  "app/features/micropolis.js",
  "app/features/city-demand-gauge.js",
  "app/features/openttd.js",
  "app/features/bonsai-translations.js",
  "app/features/bonsai-city-sim.js",
  // The mayor's bill for a Rootline plan: pure, and only the Bonsai window and
  // its contracts load it.
  "app/core/basin-flip-pot.js",
  "app/features/bonsai-sc2-codec.js",
  "app/features/bonsai-micropolis-codec.js",
  "app/features/bonsai-micropolis-export.js",
  "app/features/bonsai-osm-import.js",
  "app/features/micropolis-cty-codec.js",
  "app/features/bonsai-catalog.js",
  "app/features/bonsai-audio.js",
  "app/features/bonsai-save-worker-manager.js",
  "app/features/bonsai-repository.js",
  "app/features/bonsai-renderer.js",
  "app/generated/bonsai-atlas.js",
  "app/features/bonsai-renderer-canvas.js",
  "app/features/bonsai-renderer-voxel.js",
  "app/features/bonsai-city.js",
  "app/features/doom.js",
  "app/features/mingwen.js",
  "app/features/endfield-terminal.js",
  "app/features/time-machine-engine.js",
  "app/features/time-machine.js",
  "app/features/video-transcript.js",
  "app/features/hkrr-review.js",
  "app/features/guest-tools.js",
  "app/core/rebuild-pack.js",
  "app/features/mcp-servers.js",
  "app/features/mingming-handoff-review.js",
  "app/features/docmap.js",
  "app/features/finder-objects.js",
  "app/core/desktop-maintenance.js",
  "app/core/scripting.js",
  "app/features/control-strip.js",
  "app/features/control-strip-modules.js",
  "app/features/control-strip-modules-folder.js",
  "app/features/writing-demo.js",
  "app/core/context-gist.js",
  "app/core/docmap-source-policy.js",
  "app/core/user-recovery-messages.js",
  "app/features/teachtext-writing.js",
  "app/core/document-role-policy.js",
  "app/data/storyboard-shots.js",
  "app/core/storyboard-ascii.js",
];

export const lazyStartupExclusions = [
  "app/vendor/markmap/d3.min.js",
  "app/vendor/markmap/markmap-view.js",
  "app/vendor/markmap/markmap-lib.js",
  ...lazyRuntimePaths,
];

// ClioWorks v4 native Office editing: never in the boot bundle, never in the
// floppy budget. Loaded on demand only when an xlsx edit intent actually
// fires (ensureClioWorksLedgerModule).
export const clioWorksNativeRuntimePaths = [
  "app/core/native-binaries.js",
  "app/vendor/clioworks-v3/native-host.js",
  "app/vendor/clioworks-v3/ledger-adapter.js",
  "app/vendor/clioworks-v3/quire-adapter.js",
  "app/vendor/clioworks-v3/lectern-adapter.js",
];

export const appRuntimePaths = [
  ...appModulePaths,
  "app.js",
  "app/features/cloud-model.js",
];
