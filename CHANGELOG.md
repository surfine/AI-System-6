# AI System 6 Changelog

This changelog is a product-level narrative, not a commit-by-commit ledger. It
is reconstructed from the git history that starts on 2026-05-18. Entries are
grouped around product changes rather than every internal commit.

The repository only has two historical tags, `pre-refactor-baseline` and
`src-pilot`, so entries are grouped by dated product phases rather than
invented release tags.

## First Version - 1.0.0 / 2026-05-18

The initial version already contained the recognizable AI System 6 idea: a
quiet Macintosh-inspired desktop for source-based writing.

- The core route existed from the start: Project Hard Disk, File Floppy,
  Question Sheet, Outline, Section Drafts, TeachText, Review Desk, and Project
  CD.
- Project Hard Disk and Reader workflows were stabilized on day one.
- Writing Flow became quieter and more sequential, resisting the temptation to
  expose every AI tool at once.
- Assistant model status, TTFT/TPOT performance meters, contextual dictation
  intent, multi-page Note Pad, Finder Get Info, Print to AI, Clipboard Window,
  Export Disk, Import Utility, project backup export, and clearer menu
  structure established the basic desktop vocabulary.

## Alpha Source Workflow — 2026-05-19 to 2026-05-23

- First-run API setup, lighter Windows defaults, Windows LM Studio discovery,
  direct loopback HTTP, and model discovery made local setup more approachable.
- LM Studio context loading, RAG context budgeting, rich import formats, and
  source controls turned File Floppy into a more serious context object.
- Supported material expanded to rich documents, PDFs, images for OCR, video
  sources, and SRT subtitles.
- Study Studio, Scrapbook writing actions, Reader clipping, source registry
  visibility, and DocMap made source work visible rather than hidden inside a
  prompt.
- Finder file management, project picture album, writing exports, Reader
  fixes, local model performance work, and System 6 desktop affordances moved
  the project from prototype to usable alpha.

## Cloud, Packaging, And Side Projects — 2026-05-24 to 2026-05-26

- Cloud model support was added beside LM Studio, with provider status checks,
  cloud model listing, cloud chat, cloud embeddings, context-window display,
  password styling, and local repair fallback.
- ClioTalk window behavior and model popovers were stabilized.
- The package assets caught up with the app's import, OCR, PDF, MarkItDown, and
  generated-bundle needs.
- Endfield Terminal was integrated with a standalone archive prototype and
  shared server routes.

## Server Refactor And Release Gates — 2026-05-27 to 2026-05-29

- Documentation was consolidated into `CLAUDE.md` as the single source of truth,
  with `CLAUDE.zh-CN.md` as the human reference mirror.
- The server was migrated from the root `server.js` into `src/server.js` with a
  route table, shared libraries, focused route handlers, importers, and
  `npm --prefix src run typecheck` in the release gate.
- `/api/version`, cloud routes, local model routes, import routes, Reader,
  Searcher, Endfield, static serving, and import-text parity were moved into
  the new structure.
- CSS, design, data, docs, smoke, bundle-size, and packaging checks became part
  of a stricter release verification story.
- Prompts and Reader subtitle workflows were localized and hardened.

## Source-Centered Writing Matures — 2026-05-30 to 2026-05-31

- The app version/build stamp moved to `1.0.2` and `20260530.0`.
- Reader tabs were aligned with the TDI-style tab system and responsive mode.
- Saved references became visible in Project Hard Disk and could be reopened in
  Reader, strengthening the durable-source model.
- Source citations, TeachText focus modes, Memory Cards icon redraws, and
  Section Draft layout polish made the route easier to use for real writing.

## Creative Labs And Onboarding — 2026-06-03 to 2026-06-11

- Liquid Cover, later renamed Cover Glass, arrived as a lazy-loaded creative
  tool beside the writing route rather than another mandatory writing step.
- CMF Studio was added as a device color/material/finish workbench with server
  support for USDZ preview and export.
- The help and onboarding copy was rewritten to explain the first writing route
  before listing tools.
- DocMap gained a two-sided balanced layout and stronger print-to-PDF behavior,
  making maps usable outside the browser.
- Writing Flow and TeachText received layout and focus refinements so Question
  Sheet, Outline, Section Drafts, Manuscript, and Review Desk feel connected.

## Trust And Local Model Foundations - 1.0.10 / 2026-06-13

AI System 6 is now a local-first writing desktop with a much stronger trust
layer around source use, model voice, and creative output.

- Cover Glass has grown from a Liquid Glass experiment into a full cover-making
  tool: text and shape layers, solid title layers, iOS 27 and 9to5Mac presets,
  vision-adaptive shadows and tint, background generation support, high
  resolution export, and visible fallback when WebGL is unavailable.
- The writing stack now has explicit Humanizer and System Integrity guardrails
  so models preserve the writer's roughness, avoid generic AI voice, treat
  source objects as data rather than instructions, and do not claim actions
  such as saving, clipping, exporting, searching, or fact-checking unless the
  app state proves them.
- Shared Writing Tools prompts make Proofread, Rewrite, Summary, Key Points,
  Tables, and Describe Change behave like direct text services while preserving
  facts, names, dates, citations, and the user's voice.
- Context Gist compresses project context into coarse cards, reveals matching
  details only when needed, and falls back to raw excerpts for high-risk
  source, fact-check, or reconstruction tasks.
- Dictation and File Floppy have become more source-aware: Dictation Pad can
  organize spoken intent for the target surface, while File Floppy accepts audio
  recordings for local transcription and optional conservative repair.
- Local model support now covers modern Qwen and Gemma 4 naming, task-aware
  sampling defaults, no-thinking payloads, and local vision requests for image
  OCR or writing-context notes.

## System.css Fidelity And Theme Closure - 2026-06-16

This pass tightened the Classic skin against the checked-in `system.css`
reference while keeping Liquid Glass as a separate material treatment rather
than an accidental victim of the retro work.

- Classic scrollbars, title bars, close/resize buttons, checkboxes, radio
  buttons, and select menus now use the local `system.css-reference` assets and
  geometry more directly.
- Title bars were settled on the five-stripe proportion that matches the app
  icon, with centered captions and scaled System 6 controls.
- Control Panel and related form controls now use the System 6 select harness,
  rounded select corners, 12px radio art, and square checkbox art without
  leaking those decisions into Liquid Glass.
- Liquid Glass kept its own surface language: window chrome, menu chips, and
  form controls retain glass material tokens, while the cloud model and project
  switcher menu-bar buttons were pulled back from full capsules into a more
  compact rounded-rectangle shape.
- Desktop layering was pulled back onto named `--z-*` tokens so Classic
  scrollbars, command popovers, dictation affordances, modals, boot/shutdown,
  demo overlays, and system menus no longer compete through arbitrary values.
- The final pass kept Apple menu popovers from being artificially clipped,
  hid the contextual Dictation button during boot/shutdown and system-modal
  states, and tightened the Liquid Glass desktop icon column so the Trash stays
  visible at the standard desktop height.
- Control Panel now has a tokenized maximum height and a scoped Classic settings
  scroll lane, reducing the cut-off look without leaking retro scrollbar
  treatment into Liquid Glass.
- The CSS work stayed inside the source files and continued to pass the CSS
  budget, floppy budget, smoke, and macOS app bundle gates.

## First Public Beta 1.0.10 - 2026-07-29

The first downloadable Apple silicon beta turned the product into something
people could install and run.

- Local-first writing route: Project Hard Disk, File Floppy, Question Sheet,
  Outline, Section Drafts, TeachText, Review Desk, and Project CD as visible
  desktop objects.
- Bring your own model (LM Studio, Ollama, OpenAI-compatible); projects and
  keys stay on the Mac.
- Creative labs beside writing: Cover Glass, CMF Studio, DocMap, Soundscape,
  and Time Machine.
- Humanizer and System Integrity guardrails from the first public build.

## Public Beta 1.0.11 - 2026-08-04

- Source windows share one ask bar; ClioTalk rebuilt around clearer send/stop
  controls.
- Time Machine: complete captures over previews, reports in their own window,
  named snapshots, DocMap beside the question.
- One shared window-control family and System 6 polish: icon stroke weights,
  hidden dialog buttons, brand naming, Finder icon view.
- Soundscape player rebuilt in System 6 controls; beta packaging and web
  deployment hardened.

## Public Beta 1.0.12 - 2026-08-04

This release makes the desktop quieter and more coherent while expanding the
parts that benefit from visible, direct manipulation.

- Finder navigation, menus, icons, dialogs, shared window controls, and
  responsive layouts were tightened across Classic and Liquid Glass.
- Soundscape became a fuller music workspace, with local audio, clearer queue
  controls, repeat and shuffle modes, project links, saved moments, and a
  synesthetic color view.
- ClioTalk and the writing route shed redundant commands. Files, sources,
  context, skills, checkpoints, and run receipts remain visible without asking
  every surface to expose every possible action.
- Public source publishing, website deployment, and the Apple silicon Mac beta
  now share stronger version, privacy, asset, and release checks.

Version `1.0.12`, build `20260804.2`.

## Public Beta 1.0.13 - 2026-08-05

- Meme captions and Endfield asks work with BYOK or the shared allowance,
  behind one cloud preflight with a model allowlist.
- Time Machine accepts bare domains and unblocks its web view; DocMap fit-view
  dodges SideAsk and auto-refits.
- Finder continuation arrows unified and centered; meme generator
  popover/zoom/narrow layouts fixed; ClioStage scrollbar no longer covers the
  title bar.
- Balloon Help discoverable by default on hover devices, with a persisted
  opt-out.

## Public Beta 1.0.14 - 2026-08-05

- CMF Studio USDZ export and previews on the public VPS.
- Touch title-bar drags no longer pull down the page on iPad/iPhone.
- Safari local entry copies the HTTP address and shows paste instructions.
- Liquid Glass greys out Modern Font; Start Here adds Watch Promo Video;
  subtitle translation and thesis drafts on public cloud routes.

## Public Beta 1.0.15 - 2026-08-05

- Balloon Help coverage expanded (File Floppy, Project CD, Question Sheet,
  Review Desk, ask bar, cloud status dot, DocMap switcher).
- Disabled buttons now explain why (meme download, Reader-to-ClioStage, DocMap
  save).

## Public Beta 1.0.16 - 2026-08-05

- DeepSeek web search: cited live answers in Searcher, Review Desk claim
  checks, Reader Find Related Sources, opt-in per-message ClioTalk search.
- Subtitle translation on the structured-output endpoint; reasoning effort
  auto-chosen by task type.
- Shared cloud allowance reserved up front and settled against real token
  usage.

## Public Beta 1.0.17 - 2026-08-06

- Control Strip groundwork (optional, off by default).
- Finder Objects: aliases, clippings, Stationery Pad, droplets, finder labels
  via menus, Get Info, and selection services.
- DocMap split into eager entry + lazy map module; composer web-search switch
  appears only when Advanced is on; Searcher carries DeepSeek citations;
  system-prompt editor moved to Startup Disk > AI Prompts.

## Public Beta 1.0.18 - 2026-08-06

- DocMap opens the real tabbed surface (desktop icon waits for the lazy
  module).
- Finder labels only via Get Info or Claim Check suggestions; folder labels
  never cascade.
- Aliases to Scrapbook entries and project references resolve and open.
- Clipping drag-back inserts text at the drop point; no-direct-quote and
  read-only rules enforced.

## Public Beta 1.0.19 - 2026-08-07

- Faster startup: Markdown renderer, prompt files, and both dictionaries moved
  out of the bootstrap; lazy loading now times out and degrades gracefully.
- Default language follows the host system; English-first prompt bodies for
  English environments.
- Mobile and touch polish: cleaner phone workspace, double-tap hint, Finder
  droplets under "Drop Tools".
- Classic and Liquid Glass converge after a large cascade cleanup.

## Public Beta 1.0.20 - 2026-08-07

- CMF Studio: iPhone 17e and MacBook Neo screens keep their wallpaper instead
  of blank white slabs; true-black trim is never a finish surface; Touch ID
  wears the keycap finish.
- MacBook Neo USDZ models are lighter — only referenced textures are packaged
  (about 12.6 MB down to 5.2-6.7 MB).

## Public Beta 1.0.21 - 2026-08-07

- Copy overhaul: help balloons, System Help, and dialogs speak plainly;
  technical terms are kept with parenthetical explanations; long sentences
  were split; Chinese copy follows one consistent style.
- Balloon Help extended and accessibility labels localized, with a new check
  that keeps English and Chinese copy in sync.
- The Safari local entry works end to end.
- Classic and Liquid Glass materials were tokenized for icons, memory notes,
  Soundscape surfaces, and Get Info.

## Public Beta 1.0.22 - 2026-08-07

- Control Strip became a full system part with its own module registry,
  persistence, and desk integration.

## Public Beta 1.0.23 - 2026-08-08

- UI batch: WindowShade, Control Strip, dictionary, fonts, and cloud-status
  fixes; Soundscape gained an optional Apple Music link via the gamdl bridge.
- Desktop Maintenance was deduplicated (one plan-based path), repairs became
  typed and conservative, and pre-repair snapshots now persist before any
  change. Release identity was split into version / build / sourceCommit with
  runtime snapshotCommit + generatedAt.
- Transferable lessons were documented for future agents.

## Public Beta 1.0.24 - 2026-08-08

- Compression Grain and the Quick Draft Adjustment Layers (mingming / luoluo /
  hkrr) landed with corpus expansion and a core retrieval/state refactor.

## Public Beta 1.0.25 - 2026-08-08

- Compression Grain refinement and Finder Draft polish with expanded tests.
- Document revisions became durable (awaited writes, rollback on failure);
  backups carry revision history (v3 schema); store commits gained failure
  semantics; a WebKit abort-timeout misclassification that silently left the
  desk Busy was fixed.

## Public Beta 1.0.26 - 2026-08-08

- Durability & Mobile Completion: the Project CD burn contract is fully async
  (explicit source options, droplet + download semantics split); StateStore
  rollback works in real browsers; Project Hard Disk backup fails closed when
  version history cannot be read; revision restore verifies persistence and
  rolls back on a failed save.
- A local `verify:ship` gate generates `dist/verification-report.json` and is
  the release condition (hosted GitHub Actions availability remains an account
  matter). Browser failure tests now cover the durability matrix end to end.
- iPhone / WebKit can complete the full writing route and a black-box mobile
  user journey ships.

## Public Beta 1.0.27 - 2026-08-08

- Quick Draft Completion: the window is now one writing application with
  three states (Start / Write / Adjust), a durable workspace schema with
  legacy migration, plain-language adjustment layers (switch + strength +
  range + one-line description), immutable-sentinel protected ranges,
  Original/Current/Difference compression grain, a single-object canvas that
  persists its transform, versions, and explicit delivery actions (Save to
  Project Hard Disk, Send to TeachText, Send to Review Desk, Export Markdown).
- Non-destructive by contract: every layer reads the negative, AI passes can
  never overwrite the working body, protected text that a model breaks fails
  the composition instead of being guessed back into place, and Develop saves
  a revision and asks before promoting a composite.
- Project Hard Disk v2 backups are supported again (validate → verify
  integrity → remap → import → export v3), with a real hand-written v2
  fixture proving folder/file/alias/Scrapbook/reference/Project CD
  relationships survive.
- The release gate is fast and deterministic: `verify:ship` runs build,
  feature tests, version consistency, checkJs, src typecheck, data, docs,
  CSS, design, public tree, runtime syntax, smoke, release assets, and floppy
  budget — no Playwright, no browser download, no WebKit. E2E is an optional
  diagnostic and never blocks a release.
- StateStore commit callbacks are audited statically: UI ephemeral state
  (selection, activation, focus, toasts) may only change after a commit
  resolves, and two existing violations were fixed.

## Public Beta 1.0.28 - 2026-08-09

- Quick Draft Closure separates working updates from awaited durable commits,
  captures debounced saves by project, persists exact-stack Composite previews,
  and keeps delivery failures from reporting success.
- Workspace schema v3 migrates legacy `quick-draft-dump` entries into bounded
  document Versions and excludes Versions defensively from model material.
- Empty masks now mean whole draft, new adjustment stacks start disabled, four
  enabled layers make one model request, and duplicate protected passages use
  occurrence-unique stateless sentinels.
- Send to TeachText opens the saved Project document without mutating the main
  writing pipeline. Public snapshots promise `verify:public`; `verify:ship`
  remains a maintainer/private-source gate.

## Public Beta 1.0.29 - 2026-08-09

- Quick Draft becomes an independent Draft Desk application instead of a
  Writing Studio-owned surface.
- The former Finder Draft and separate canvas are consolidated into one durable
  workspace with materials, paper, adjustments, versions, receipts, and
  Body / Grain / Read views.
- Quick Draft gains explicit SideAsk and a one-way, save-first handoff into
  Writing Studio. Desktop, Applications, MultiFinder, menus, mobile shell,
  restore, and native parity contracts follow the new application boundary.

## Public Beta 1.0.30 - 2026-08-09

- Platinum becomes the third release-ready Appearance beside System 6 and
  Liquid Glass. One boot-safe registry, persisted Control Panel selector, and
  Special-menu submenu now own appearance state without changing application
  structure or writing semantics.
- Platinum applies an evidence-led Mac OS 8 material recipe to shared windows,
  controls, fields, menus, scroll surfaces, typography, and selection states.
  Theme Lab remains the three-theme acceptance specimen; unfinished Aqua,
  Snow Leopard, and Yosemite experiments are excluded from the release.
- The promotional performance and 4K edits gain tighter deep trims, a
  multi-device CMF Studio montage, and reusable Bilibili cover renderers.

## Public Beta 1.0.31 - 2026-08-09

- Aqua becomes the fourth release-ready Appearance beside System 6, Platinum,
  and Liquid Glass, with Jaguar-era geometry, the current-application menu,
  three-column Open dialogs, attached sheets, and Finder toolbars evidenced
  from the period HIG and pinned canonical sources.
- The Appearance registry gains an explicit recipe lineage (Platinum ← Classic,
  Snow Leopard ← Aqua, Yosemite ← Liquid Glass), so each era owns only its
  deltas; release gating keeps Snow Leopard and Yosemite out of the shipped
  surface while retaining their recipes for later work.
- Theme Lab becomes a multi-era acceptance surface with era-accurate fixtures
  and SHA-256-pinned canonical references (Mac OS 9 Platinum menus, Jaguar
  Aqua column browser, sheets, scrollbars, and choice states).
- Draft Desk hardening lands: guided Write-a-Short-Draft onboarding with one
  setup surface, Continue-last returns to the previous draft, broken or
  missing model setups no longer block the desktop, and Markdown can be shared
  or the app installed to the home screen from phones.
- Draft Desk durability contracts expand: recovery messaging, persistence of
  selection and scroll, and a broader executable test suite for onboarding,
  boundaries, handoff, and working sessions.

## Public Beta 1.0.32 - 2026-08-09

- The release-supported Appearance surface narrows to three — System 6
  (Classic), Platinum, and Liquid Glass. Aqua, Snow Leopard, and Yosemite
  become research appearances: their recipes, references, and fixtures stay,
  but they no longer appear in ordinary product UI, cannot be selected from
  Control Panel or the Special menu, and never load from saved settings.
- Existing saved experimental appearances migrate safely: `aqua` and
  `snow-leopard` resolve to Classic, `yosemite` to Liquid Glass, and the
  release `applyTheme` path refuses research themes entirely.
- Theme Lab leaves the production runtime: its styles are no longer part of
  the startup bundle, and it is a development/acceptance tool reached through
  the dedicated verification commands instead of a product window.
- Public verification joins the design system: the Turnstile flow now uses the
  system finder-operation modal in all three appearances, all copy lives in
  translations, and Use Website AI verifies the session before marking the
  model ready instead of waiting for the first 401.
- The public repository becomes self-sufficient: the snapshot carries
  `docs/RELEASE-SMOKE.md` and the HIG docs, excludes tests that reference
  private-only files, and runs a real `npm ci` → `build` → `test` →
  `verify:checkjs`/`verify:version`/`verify:public` pass before anything is
  pushed.
- Continue now restores the real Working Session (project, application,
  document, window, selection, scroll) before falling back to the last draft,
  the most recent project document, or Project Hard Disk.
- README presents the two mature writing paths — Draft Desk for a short piece,
  Writing Studio for a longer project — and promises exactly three release
  appearances.

## Public Beta 1.0.33 - 2026-08-09

- Draft Desk joins the standard command vocabulary: ⌘S / Ctrl+S flushes the
  working body through a durable public Save API, ⌘W flushes pending or
  Modified work before closing and never closes over a failed persist, and ⌘N
  starts a fresh draft through the app's public New API. Edit commands
  (Undo/Redo/Select All/Cut/Copy/Paste) stay native while a field has focus.
- The Working Session gains one commit layer: high-frequency changes debounce
  through scheduleWorkingSessionCommit, and project switches, Continue, and
  window close flush through flushWorkingSessionCommit before ownership moves.
- Model failures now map to a localized message plus an executable recovery
  action (reconnect / choose a model / retry / check connection). Raw HTTP
  codes and fetch internals stay in the console and System Status detail,
  never in ordinary UI.
- Public tests are layered: `tests/features/public/` holds public-safe
  contracts for File Floppy, ClioStage, CMF Studio, Dictation, Menu Bar,
  Streaming Output, Cover Glass, and ClioTalk, and `npm test` prints a public
  product coverage summary so a public feature can never silently lose its
  contract.
- Warm resume: a refresh or same-session reopen skips the visual boot hold
  (≤300ms) while new sessions and explicit Restart keep the full Happy Mac
  ceremony; desk-state load, migration, and Working Session restore are never
  skipped.
- IME safety: a shared composition guard protects Enter-submit across Draft
  Desk, ClioTalk, modals, Reader, Start Here, and the global shortcut router.
- Accessibility closure: icon-only controls all carry accessible names, and a
  contract test locks visible keyboard focus, disabled, and selected states
  across the three release appearances.

## What Changed Most In One Month

- The product moved from "an AI writing prototype" to a local-first writing
  environment with durable projects, temporary context, visible sources, review
  surfaces, exports, and creative labs.
- Model calls became more disciplined: task kinds, prompt registries, context
  budgeting, source-data boundaries, voice guardrails, and task-specific local
  model tuning are now part of the product contract.
- The System 6 metaphor became stricter rather than looser: named objects,
  deliberate saving, quiet windows, lazy tools, two-floppy startup budgeting,
  and verification gates now protect the app from feature sprawl.
