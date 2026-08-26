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
- The server was migrated from the root `server.js` into `apps/server/server.js` with a
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

## Public Beta 1.0.34 - 2026-08-09

- Draft Desk New never loses a draft: an unsaved draft is saved as a durable
  Project Hard Disk document first ("Save & New", the default), a durable
  draft updates its existing document, and a failed save aborts New with the
  old draft intact. The fresh workspace gets a new identity — no stale
  document, versions, composite, or protects.
- Every asynchronous Draft Desk AI path is project-owned. Mingming rewrites,
  adjustment composites, and Develop commit back to the project that started
  them; a response that lands after a project switch is discarded and never
  writes through the new project's UI.
- Draft Desk model failures join the shared ModelUserErrors mapper: localized
  message + next step in the status line, raw HTTP details only in the
  console. Recovery settings route by route — local failures open Local AI
  settings, cloud failures open Cloud settings — and the global Retry action
  re-runs the actual failing owner (Draft Desk request, adjustment apply, or
  ClioTalk submit) with a stale-project / stale-conversation guard.
- Two Web instances can no longer overwrite each other: a single-writer lease
  (BroadcastChannel with localStorage fallback) makes the second window
  read-only, rejects its mutating storage transactions with
  READ_ONLY_INSTANCE, and lets it take over explicitly — the old window loses
  write access, cancels pending autosaves, and is prompted to reload or
  continue read-only.
- Boot failure is recoverable: the Sad Mac offers Retry, Start without
  restoring windows (clears only the Working Session), and a minimal Recovery
  panel that reports project storage / project count / Working Session / AI
  configuration and can export a Project Backup, reset the Working Session,
  or reset the AI connection. Boot has a re-entry guard and never offers a
  destructive reset from this screen.
- Warm resume no longer plays the boot chime (which the sound engine could
  queue and fire seconds after a refresh); explicit Restart still clears the
  warm flag and plays the full ceremony.
- Draft Desk help copy now distinguishes the three save verbs: ⌘S keeps the
  working draft in the project, Save to Project Hard Disk creates or updates
  a reopenable document, and New preserves the current draft first.

## Public Beta 1.0.35 - 2026-08-09

- The single-writer lease is fenced, not trusted from memory. Acquire claims
  then reads the stored lease back before becoming a writer; the heartbeat
  refreshes only a lease still stored under this instance (never overwriting
  a new owner); release deletes only its own lease; and every mutating
  IndexedDB transaction re-verifies the stored owner via assertCanWrite.
  Even two instances that briefly believe they own the lease cannot both pass
  the write-time fence.
- Takeover is a handshake: the requesting window asks the old writer to flush
  Draft Desk, the Working Session, and desk state, and only becomes the
  writer after a takeover-ready reply. A failed flush denies the takeover
  with the old draft intact; unresponsive windows time out (never auto-force);
  Force Take Over is reserved for stale owners or an explicit danger
  confirmation.
- BFCache and foreground resume reconcile the lease instead of trusting
  pre-freeze memory: stored owner → writer, no owner → try acquire, other
  fresh owner → read-only, never an automatic takeover.
- Startup Recovery no longer depends on the desktop runtime: a new
  recovery-storage layer reads projects, files, folders, scraps, trash, and
  document revisions directly from IndexedDB, lists real recoverable
  projects, and exports a verified per-project backup without mounting it.
  Retry, Start without restoring windows, and Recovery's Retry Startup all
  reload into a fresh runtime instead of re-running boot in a half-initialized
  one.
- Read-only is honest at the UI layer: the body advertises write mode, and
  mutating surfaces (Draft Desk textarea and Save/New/Apply/Develop/Protect,
  TeachText body, Finder rename/delete/new-folder, project create/import) are
  disabled while reading, copying, sharing, downloading, and exporting stay
  available.
- Retry is truly async: one in-flight retry at a time (double-click safe),
  callbacks are awaited, successes clear the owner, and rejections never
  surface as unhandled promise errors.
- Research appearances (Aqua, Snow Leopard, Yosemite) keep their recipes,
  assets, canonical references, and Theme Lab support, but preview only
  through ?debugTheme= on a development surface; public hosted deployments
  ignore the parameter and always land on the saved release Appearance.

## Public Beta 1.0.36 - 2026-08-09

- Recovery and normal Export share one Project Backup assembler, so a backup
  from the Startup Recovery panel is byte-identical in schema to a normal
  Project Hard Disk backup. Recovery now reads Project CD items and
  References from their real IndexedDB sources, attaches integrity, verifies
  it, and refuses to download a bundle that does not validate.
- Project Backup round-trips through the real validator: a complex project
  (nested folders, alias files, scraps, references with chunks, Project CD,
  trash, revision parent chains, Quick Draft state) exports, verifies,
  remaps, and every relation still resolves after import — including the
  Quick Draft projectDocId, which now remaps to the imported document.
- Takeover is targeted at the stored writer by instance id; read-only
  bystanders never answer. The old writer enters a handoff mode that freezes
  new user edits while pending durable writes finish, re-checks the stored
  lease before releasing, restores writer mode on a failed flush, and goes
  read-only if the lease moved mid-flush.
- Research previews default to deny: `?debugTheme=` works only on an explicit
  development surface (development capability or loopback); an unresolved
  deployment profile is never treated as development.
- Write access is declarative: mutating surfaces carry `data-requires-write`
  (frozen by the UI layer), the action router rejects mutating commands
  before their handlers run, and IndexedDB remains the final storage fence.
  Recovery export works from read-only instances because it never requests a
  write transaction.
- A reproducible Developer ID / Hardened Runtime / notarization / staple
  pipeline ships as a script and credential contract. No signing identity is
  present in this environment, so notarization is reported NOT EXECUTED and
  the beta keeps its ad-hoc caveat until credentials are provided.

## System Closing: Application Services · Run Receipts · Assistant Activity · Teaser — 2026-08-10

- Application Services: one object-routing registry owns "which app handles
  this object/intent". Finder open, File → Open, Quick Draft send-to, Review /
  DocMap menus, and Droplets converge on one dispatch contract; broken
  aliases, cross-project items, and no-handler cases fail visibly instead of
  silently falling back.
- Run Receipts: the existing ClioTalk run-record artifact becomes one
  project-scoped receipt system (schemaVersion 2) covering AI and
  artifact-producing operations, with checkpoint accept/edit/reject recording,
  produced-by provenance in Get Info, Recent Runs in System Status, and
  Repeat This Run.
- Assistant Activity: a single state source (offline / idle / reading /
  working / waiting / ready / error) derived only from real model and run
  events, with a stale-run watchdog, project-switch reset, cancel, and
  bring-to-front; System Status exposes it through semantic data-* hooks.
- Teaser: a seeded, deterministic "30-Second Demo" (Start Here and the
  Applications folder) shows a 2026 source becoming a clipping and then a file
  on the Project Hard Disk — no model, no network, desk restored on exit.
- The live Writing Demo is unchanged; Theme/Appearance files were not touched.

## Public Beta 1.0.37 - 2026-08-10

- Application Services: one object-routing registry owns "which app handles
  this object/intent"; Finder open, File → Open, Quick Draft send-to,
  Review / DocMap menus, and Droplets converge on one dispatch contract with
  visible failures.
- Run Receipts: the ClioTalk run-record becomes one project-scoped receipt
  system covering AI and artifact-producing operations, with checkpoint
  accept/edit/reject recording, Get Info provenance, System Status Recent
  Runs, and Repeat This Run.
- Assistant Activity: a single state source (offline / idle / reading /
  working / waiting / ready / error) derived only from real events, exposed
  in System Status with Cancel and Bring to Front.
- All six appearances are released (System 6, Platinum, Aqua, Snow Leopard,
  Yosemite, Liquid Glass); the research switch is gone and Theme Lab now
  lives in the System folder.
- Theme acceptance closeout: fixed Aqua/Snow Leopard/Yosemite collapsing the
  dictation, translation-pad, and rebuild textareas to a 22 px field row
  (their era field recipes stopped overriding app-owned textarea min-heights);
  fixed Yosemite's blue default button turning white on hover (now the 10.10
  hover blue #619fe8, verified against the cited GTK source); and synced
  README / README.zh-CN to the six released appearances.
- The 30-second seeded teaser demo shows a source becoming a file on the
  Project Hard Disk without a model or network.

## Public Beta 1.0.38 - 2026-08-12

- Completed all six 56-object icon families with zero fallback artwork:
  System 6, Platinum, Aqua, Snow Leopard, Yosemite, and Liquid Glass now carry
  independent, era-owned construction behind the same semantic object ids.
- Redrew Finder, MultiFinder, and ClioTalk across every era while preserving
  their shared identities and rebuilding each era's material, perspective,
  pixel density, lighting, and small-size optical hints.
- Rebuilt Liquid Glass from 56 independent Image Gen masters into four native
  sizes and three appearances per object; Classic and Platinum retain reviewed
  32/16 px families, and the three OS X eras retain their native multi-size
  raster families.
- Closed the reproducibility gap for accepted Aqua, Snow Leopard, and Yosemite
  Image Gen art: 490 hash-pinned accepted source files now live in the tracked
  source boundary, so a clean clone can rebuild without ignored draft
  candidates.
- Added fail-closed family, source-archive, continuity, runtime-dispatch,
  distinguishability, native-canvas, and release-asset gates for the completed
  six-era system.

## Public Beta 1.0.39 - 2026-08-12

- Rebuilt the complete System 6 family as authored 32/16 px SVGs: surviving
  classic objects are grounded in real System 6 resources, new application
  objects use the same one-bit grammar, and selected-state masks are embedded
  in the artwork for clean Retina rendering without generic vector smoothing.
- Added a dedicated 42 px Platinum desktop tier with optical-parity tests, and
  tightened its runtime dispatch so Finder uses the era-native canvas instead
  of stretching another size.
- Removed keyed-magenta residue from the accepted Aqua, Snow Leopard, and
  Yosemite families while protecting intentional violet pixels, alpha edges,
  and the distinct shadow/material recipes of each era.
- Expanded Theme Lab evidence and fail-closed gates for canonical fidelity,
  runtime payloads, native-size coverage, cross-era distinction, selected
  masks, and Classic/Liquid visual snapshots.
- Corrected Aqua's Jaguar current-application menu: its bold title now follows
  the actual menu owner (Finder at startup) instead of the hard-coded product
  name. The real-app browser gate now switches owners and rejects this exact
  semantic regression across all six appearances.
- Closed the packaged theme asset gap: Aqua, Snow Leopard, Yosemite, and
  Liquid Glass now ship every family-declared PNG size/appearance; the Aqua and
  Snow Leopard runtime sprites and Platinum desktop texture ship too. The
  macOS bundle gate serves all 1,291 UI-referenced theme PNGs from the finished
  pkg binary and compares their bytes with the reviewed sources before signing.

## Public Beta 1.0.40 - 2026-08-13

- Fixed the ClioTalk composer end to end: typing and paste events immediately
  resynchronize the send button, while the website-AI summary leaves its
  connecting state after every success, failure, and reset path. Added focused
  regressions for Enter, the Send button, and both failures reported from the
  public build.
- Migrated browser-local LM Studio inference to the current REST APIs:
  tool-free turns use native `/api/v1/chat`, project-tool turns use stateful
  `/v1/responses`, and saved response IDs continue without replaying settled
  history. Older compatible servers retain one bounded fallback; missing,
  expired, and silent response chains fail visibly without losing the draft or
  leaving the desk Busy.
- Replaced first launch with a three-page Start Here path that clearly offers
  website AI, BYOK, and local-model choices, then links the official site,
  repository, video guide, and iOS Home Screen instructions without requiring
  an account.
- Restored the two-floppy boot budget by moving outline and review surfaces
  behind their application launch boundaries. The packaged startup payload is
  2,931,185 of 2,949,120 bytes, leaving 17,935 bytes of headroom; the gate now
  publishes that measured result for the site and documentation to consume.
- Completed the mobile/HIG sweep across all six appearances, including narrow
  window geometry, scroll ownership, selection and default-button feedback,
  keyboard access, menus, and readable status/help copy.
- Closed the audited priority icon lineages for Finder, MultiFinder, Searcher,
  Review Desk, and ClioTalk across six eras; accepted sources, native optical
  sizes, runtime dispatch, and Theme Lab provenance now fail closed together.
- Hardened every website-AI transport: credential scope follows the normalized
  endpoint, DNS results are checked and pinned to the outgoing socket, private
  targets are blocked, staged credentials expire and are bounded, and shared
  cloud reservations reconcile streamed and multi-call usage exactly under
  concurrent processes without double settlement or cross-day corruption.
- Added a persistent IndexedDB write fence beneath the multi-window lease, so a
  tab that loses ownership cannot commit with a stale epoch after a handoff.
  Chromium and WebKit end-to-end tests cover simultaneous pages, late release,
  read-only controls, and foreground reconciliation.
- Moved CMF rendering and USDZ work off the HTTP thread into a bounded worker
  queue with per-session isolation, cancellation, timeouts, result limits, and
  crash recovery; health checks remain responsive while a render is running.
- Reworked the official site's era narrative and proof wall around concrete
  product evidence while keeping site checks and public deployment boundaries
  intact.

## Public Beta 1.0.41 - 2026-08-13

- Fixed blurry modern-era raster icons on Retina displays by selecting source
  artwork from the icon's real rendered size and the browser's device-pixel
  ratio, instead of treating a legacy compact class as the source-size owner.
- Applied the same dispatch contract to static and dynamic Finder windows,
  desktop objects, list rows, File Floppy, Project Hard Disk, Documents, and
  ClioTalk's welcome surface across Aqua, Snow Leopard, Yosemite, and Liquid
  Glass.
- Added a fail-closed real-application gate that renders all six appearances at
  2× density and rejects any modern raster smaller than the pixels its visible
  surface requires, including the legacy `mini`-inside-Finder collision that
  caused the public VPS regression.

## Public Beta 1.0.42 - 2026-08-14

- DOOM landed as the third and final Games slot: the official Chocolate Doom
  3.1.1 engine compiled to WebAssembly runs in a same-origin iframe with a
  local-only WAD picker, an explicit Play gesture, IDBFS-backed saves, and a
  menu-aware input bridge shared by touch and gamepads.
- Phones and tablets get dedicated portrait and landscape touch layouts with
  concurrent move, turn, and fire; hiding, backgrounding, or rotating the
  window zeroes input and pauses the engine and audio.
- The phone/tablet orientation contract became a product invariant in
  CLAUDE.md, DESIGN.md, and a device × orientation × input acceptance matrix
  in the HIG.
- The GPL engine travels with its corresponding source archive, patch,
  license, and a reproducible build recipe; no game data enters the
  repository or the release.

## Public Beta 1.0.43 - 2026-08-14

- Retired the unmaintained vercel/pkg packaging step, which could only target
  the end-of-life Node 18. The macOS app now bundles a repo-shaped server
  payload with the packaging machine's own current Node runtime, enforced at
  24 or newer, plus a lockfile-exact production dependency tree.
- Upgraded pdfjs-dist from 4.8 to 6.2 and served its JBIG2, JPEG 2000, and ICC
  wasm decoders from an app-owned URL in every deployment, so image-heavy PDFs
  keep full fidelity in the browser, the packaged app, and the web release.
- Upgraded https-proxy-agent to 9 and moved the server typecheck to NodeNext
  resolution, which is what exports-map-only packages require.
- Moved `three` to devDependencies, pruned sourcemaps and the PDF.js viewer
  from the packaged payload, and raised the supported Node window to 24-26.
- Rebuilt the DOOM and OpenTTD WebAssembly games on emscripten 6.0.6 through
  their reproducible build scripts, with both verified in-browser. Micropolis
  vendors JavaScript and is unaffected.
- Declared one CSS cascade layer per stylesheet and pinned the layer order in
  the bundle. No rule is wrapped yet, so the runtime cascade is unchanged;
  this is the scaffolding for retiring the file-order cascade, and
  `verify:css` now blocks a file from opening any layer but its own.

## Public Beta 1.0.44 - 2026-08-16

- Cloud model routing now lives in one policy: the Automatic choice resolves
  per task — DeepSeek V4 Pro for critique and HKRR review, V4 Flash elsewhere —
  and each task reserves reasoning headroom on top of its answer budget. A
  budget sized for the answer alone had let a long thinking chain consume the
  whole allowance and return an empty message with `finish_reason: "length"`.
- Searcher's streamed web-search answers were silently failing: address pinning
  forced the buffered Node transport, which read the whole response before
  resolving and handed back no stream. The transport keeps the upstream open
  until the first delta, with a contract test to match.
- Micropolis gains deterministic 2× tile and sprite atlases for Retina, built
  from the upstream 1× art by a new reproducible HD pipeline; caller-facing
  coordinates stay on the logical 16 px grid.
- Theme Lab becomes a data-driven appearance workbench: object provenance,
  per-era art tiers, token homes, and the sixteen-object priority lineage are
  declared as data and painted through the real runtime renderer.
- Bonsai City's MIT-clean simulation core lands as headless foundation — seeded
  deterministic grid rules with no DOM or timers — ready for a window to host.
- The Project CD burn opens a Finishing Receipt: a Get Info-shaped window whose
  every line is read back from the stored record — word count, draft count as
  distinct stored texts, the days from the first revision to the burn, how many
  times the opening was replaced, and which first-draft lines survive, from a
  longest-common-subsequence over the two line lists. A fact with no stored
  source is left out rather than estimated.
- Writing surfaces take over paste. `app/core/paste-markdown.js` converts the
  clipboard's `text/html` flavour to Markdown locally and synchronously, so
  headings, lists, emphasis, links, and tables survive. The heading floor is
  load-bearing: only the Outline may receive `##`, and elsewhere a fragment is
  pushed down so its shallowest heading becomes `###`, which stops one paste
  from cutting the article into new sections.
- The menu bar answers for itself on five measured defects: shortcut labels
  survive an application switch through one shared writer, four Go To rows
  report their real availability instead of refusing a black row, and three
  rows that printed a borrowed key now own their own Open and New entries.
- The Application Registry carries an optional lifecycle — `onSuspend`,
  `onResume`, `onDispose` — and MultiFinder drives it on window class flips,
  `visibilitychange`, and `pagehide`. Seven applications implement it: the three
  games stop their real loops and release held SDL input first, CMF Studio
  takes the render loop off the renderer, and Cover Glass stops its motion
  preview. An application that registers nothing behaves exactly as before.
- Four measured defects in the writing Desk Accessories: SideAsk's row keeps
  Ask on line one (47 px → 20 px), the Writing Bell no longer applies the
  one-minute setting floor to the time remaining, the floating Dictate button
  stops overlapping `.da-origin` (1,446 px² → 0), and Hold That Thought joins
  Hold My Place under Your Place instead of answering only to its key.
- Searcher moves off the startup disk into `lazyRuntimePaths` through the
  lazy-window contract, which returns 17,227 bytes of boot headroom.

## Public Beta 1.0.45 - 2026-08-16

- External drop becomes one router: a dropped File mounts on the File Floppy,
  a dragged text/uri-list opens in Reader, dropped text reaches the Clipboard.
  shareArtifact() takes over the download exits each feature had grown, and the
  four hidden file inputs leave index.html with every reference to them.
- Working Session moves from one global record to a per-project keyspace
  (workingSession:v2:desktop and the project scopes under it), migrated once at
  boot inside a transaction that verifies the new record before deleting the
  old, and capped at 24 scopes. Project backups move to v4 and carry the scene,
  with a forbidden-key pattern that keeps credentials out of an exported desk.
- Hold My Place and Hold That Thought share one Control Strip module that owns
  no state and no command: its rows dispatch the existing actions and read
  availability from getActionAvailability(), the map the menu rows use.
- The File Floppy leaves the studio-only window set, and the writing-route menu
  rows report whether a project is mounted instead of reporting a literal true.
- The title-bar drag handler cancels pointerdown's default action, so a drag no
  longer opens a text selection under WebKit.
- Theme Lab, its stylesheet, its markup and its eight contracts are restored
  from 337dac6d, whose content a merge resolution had replaced with its
  predecessor while keeping the commit in the history.
- 26,771 bytes of style rules whose every selector names nothing are deleted,
  checked against template-literal class construction so dynamically built
  names such as the finder-label family are kept.
- Every dependency moves to its current release, TypeScript 7 included. The two
  AST gates move to Acorn, because TypeScript 7 publishes only its version from
  the main entry and offers its AST under an export named unstable. A new
  verify:dependency-freshness gate compares the installed tree against
  package.json and the lock file.

## Public Beta 1.0.46 - 2026-08-16

- ClioTalk streams with tools. A tool loop used to force complete JSON
  messages, so the route a mounted project actually takes waited in silence
  and Stop had nothing to keep. Streamed tool calls now assemble across
  fragments: a name that arrives once stays one name, argument JSON is glued
  from many frames, parallel calls merge by index, snapshots are not appended
  twice, and truncated arguments fail instead of being guessed. Every round
  streams whenever a token listener is watching, later rounds continue the
  reply instead of erasing it, and stopping keeps the cumulative text of every
  round the writer already read. The JSON fallback path is repaired
  underneath: the stream reader used to lock the response body with
  getReader() before checking the content type, so a provider that ignored
  stream:true could never answer through response.json().
- The whole iPad family is verified and fitted: standard iPad, Air, Pro and
  mini, every representative size, both orientations, and iPadOS Split View
  and Slide Over panes — 1,348 checks green. The window clamp now reads
  --keyboard-inset, so the window that owns the focused field lifts above the
  on-screen keyboard like the phone shell does, and its frame returns when the
  keyboard closes; the clamp also writes max-height with the kebab-case
  property it always meant to.
- The Finishing Receipt stays reachable on a phone in landscape: the restore
  path re-asserts the clamp once the receipt reaches its real height, and on
  short viewports the pane scrolls instead of clipping a stated fact.
- Boot payload re-measured at 2,948,416 bytes against the two-floppy budget.

## Public Beta 1.0.47 - 2026-08-17

- Image Prompt Studio is a new creative lab: one short idea (and an optional
  reference image) becomes two ready-to-paste prompts — a natural-language
  GPT-Image paragraph and a compact universal prompt. It is a pure prompt writer
  with no image backend, so it can never silently drop a reference image; on a
  cloud text model it says so instead of pretending.
- CMF Studio completes the 3D loop: every view preset renders to PNG in the
  browser, the source USDZ previews and recolors locally, and fflate exports the
  recolored result as USDZ for AR. Background rendering degrades gracefully when
  a cloud image is unavailable, and high-resolution views render offscreen at 2x.
- Classic and Platinum get a real fidelity pass: 0-blur bevels, token-level
  chrome, and a Classic/Platinum fidelity contract pin the two oldest appearances
  against native references, with refreshed Theme Lab baselines and fingerprints.
- The four objects added since the era timeline — Image Prompt Studio, Micropolis,
  OpenTTD and DOOM — now carry their own recognisable Classic line-art icons
  (with selection masks), and a Control Panel switch can apply line-art icons
  across every appearance. The retired inline Liquid Glass icon dictionary is
  removed and its export/test references reconciled.
- Help and the writing-flow help text are revisited: balloon help stays clear of
  the next clickable target, and the window manager's lazy-attach path is fixed.
- The website and README are re-shot from the running app and reorganized: every
  era frame and feature proof is captured fresh (including a filled Image Prompt
  Studio shot), the README fixes two broken image links and gains a table of
  contents and a clearer structure, and the marketing page's contrast and type
  sizes meet readability standards with per-era Chinese font stacks corrected.
- Cloudflare Pages ships the shared-cloud-budget Worker, BYOK cloud keys beside
  the shared allowance, route parity, and the deploy/release tooling that keeps
  the public snapshot independently verifiable.
- The runtime moves to an application registry with commands, render tasks,
  lifecycle and state stores, plus a service-boundary contract that keeps
  direct service access out of feature modules.

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

## Public Beta 1.0.48 - 2026-08-17

Historical fidelity and the Golden Gate recalibration of Liquid Glass.

Aqua reaches 16 of 16 specimens and Snow Leopard 17 of 17. The Aqua work was
four real painter defects: a disabled column-browser row that dropped its icon,
a scrollbar lane assembled from separate boxes instead of one outline,
incomplete row separators, and a Finder toolbar that drew its own frame on top
of the window's, rendered no view-mode glyphs, and held "Search" as placeholder
text where the 10.2 toolbar labels the item beneath the pill.

Yosemite gains four more pinned native 10.10 captures. Six specimens had been
measured against crops that did not contain the control they claimed to test --
there was no push button, text field, dialog, backdrop window or selected list
row anywhere in the three sources pinned at the time. One wrong reference had
also produced a wrong token: the source-list selection colour was sampled from a
folder icon's tab in a capture with nothing selected.

Liquid Glass moves toward macOS 27 Golden Gate: a concentric corner ladder so
nested objects stop repeating the window's own curve, one continuous chrome
region at the top of a window instead of three banded strips, a backdrop window
that quietens its chrome without fading its document, and a press response that
drops its movement under reduced motion.

Two long-standing paint bugs surfaced along the way. No appearance's menu-bar
hairline colour had ever reached the screen -- a shared surface rule painted
every one of them with ink -- and the pop-up button's arrow well was measured
against the padding box, so it sat a pixel clear of the border and read as a
separate pill. Snow Leopard's traffic lights are rescaled to the red measured
off the native 10.6 capture.

## Public Beta 1.0.49 - 2026-08-19

Control Panel and Theme Lab corrections, all of them one-way faults where a
control existed but could not do its job.

The Liquid Glass tint slider never moved the chrome. `body.use-liquid-glass`
declared `--liquid-tint-level` itself, which shadowed the value the slider
writes on the root element, so every CSS surface resolved the 0.5 middle
setting while only the WebGL overlay followed the control. The declaration is
gone; every reader already carried the default in its own `var()` fallback.

The same slider showed in all six appearances. `.settings label` sets
`display: block`, which outranks the browser's `[hidden]` rule, so the
attribute the runtime set did nothing -- the third instance of that trap after
the Finder items and the CMF controls. The scoped guard joins them. The
runtime side was wrong in the other direction: it decided visibility from the
`themechange` event alone, and boot, settings restore and launch intent all
apply a theme without announcing one, so the decision moved into `applyTheme`,
which every path already goes through.

Classic's Control Panel filled the whole rail cell with ink to mark the current
section. That is a modern sidebar-row highlight, and it swallowed the 1-bit art
it was supposed to reverse: the icon mask is black, so a selected icon read as a
hollow outline. Classic now selects the way the Finder selects an icon -- the
cell keeps its paper, the icon shows its mask and reverses, the name carries the
highlight box -- and hover paints nothing, because System 6 has no hover state.
The other five appearances pass neutral values for the new tokens and are
unchanged.

Theme Lab's era timeline was unusable in portrait: a fixed three-column rule
left over from the older six-button era switch squeezed the rail into a third
of the pane with the year labels piled up beside it. The rail is one column at
every width again, and the tick axis now takes the same half-thumb inset the
range thumb travels within, so the knob lands exactly on the year mark it
selects.


## Public Beta 1.0.50 - 2026-08-24

A convergence release. Eight lanes of work that had been running beside each
other for a day came back together, and what the merge exposed is as much a
part of this version as what the lanes built.

文字亮室 became its own application rather than a drawer inside Quick Draft.
The negative, the adjustment stack, the writer's locks and the version chain
moved out of the Quick Draft workspace and into a record of their own, keyed by
document, so the same manuscript can be developed whichever surface it came
from. The boundary is one sentence: Quick Draft writes, 文字亮室 looks. Finder
mode is single-task, so seeing the grain beside the sentence is a MultiFinder
arrangement -- a real second application costs a real second window, and that
was chosen with the cost known.

That record now travels with the disk. It lived in keyval, outside the seven
collections a Project Hard Disk backup carried, so exporting a project and
restoring it lost the negative, the stack, the locks and the chain without
saying anything. The backup format is v5 and carries it; a record pointing at a
document the backup does not contain is refused rather than restored as a
darkroom belonging to nothing. Project CD is unchanged, because a CD is a
read-only handoff of finished text and not a restore path.

Every project shows on the desktop as a disk. The mounted one is solid, the
others are dimmed and ejected; double-clicking an ejected disk opens it
read-only, and dragging one to the Trash archives it instead of trashing it --
Erase Disk is still the door that destroys. The mounted disk wears the
project's own name rather than the generic one.

Hold That Thought arrived as a Desk Accessory: a pause for an interruption that
gives the writer their window and their caret back, rather than a note to
write later.

A picture became material the writing route can read. Question Sheet photos,
File Floppy imports, Review Desk figure checking, Scrapbook picture clips,
Quick Draft product photos and DocMap from a picture all reach one shared
layer. A Scrapbook clip may now be a picture with no text at all, and the
window says plainly that Searcher cannot find it; a model's reading of a
picture is a proposal the writer must keep before it is saved.

The web host stopped throwing away its own cache. It served the two bundles
`no-cache, no-store, must-revalidate`, so the edge bypassed and every visit
re-downloaded about 430 KB. The rule now splits the way the original incident
warrants: a success carrying the build stamp gets a long lifetime, an
unversioned URL gets a day, and a 404 is explicitly no-store.

Four low-frequency stylesheets -- ClioChart, Time Machine, Endfield Terminal
and the Bureaucracy meme -- now travel with their window instead of the startup
disk, which is what paid for everything above staying inside two floppies.

The appearance sheets went from 848 geometry declarations to 719, with a
ratchet that only lets the count fall. Layout carried by an appearance is what
makes the verification matrix multiply, so draining it is not tidying.

Bonsai City had six real defects: the city oscillated instead of growing, zone
dragging was unusable, and roads, wires and rails drew as disconnected studs
with an axis-aligned blob at every intersection. All six are fixed.

Two failures are worth recording because the gates could not see them. An
action handler written as a bare identifier, naming a function that only exists
once a lazy module loads, threw while the command registry was being built and
took every menu command and every data-action button down in silence -- with
240 executable contracts and a green release gate saying nothing, because no
static assertion executes that path. It now has a gate that resolves the name
rather than matching the shape. And the Mac payload had never learned about the
four stylesheets that went lazy, so it would have shipped four windows with no
styling and nothing local would have complained.


Two more days of work landed under the same version number, and the heaviest
item is a defect the export format had been carrying in silence.

**A project disk now travels with its pictures.** Export a disk, import it
somewhere else, and the Question Sheet photographs were gone, Scrapbook clips
pointed at images that no longer existed, and every figure in the manuscript
fell back to a bare image tag pointing at an `aisystem6-image:` id that the
disc no longer carried. Each of those failed
without saying anything. The backup format is now version 6 and carries both the
original and the preview. The hard part had no precedent in the format: the
manuscript refers to its pictures by id from inside prose, and every other
pointer in a backup is a field a remapper can walk. Remapping the picture ids
without rewriting those references would have broken every figure on the disk,
which is worse than not remapping at all.

**A picture the writer has read is searchable.** The Picture Album had been
storing the model's reading of an image and nothing in the entire repository
ever read it back — one write, no readers. Those readings now enter the search
index alongside documents and clips, so a photograph can be found by what it
says.

**The cloud can read an imported image.** OCR gained a cloud rung underneath all
three local engines and behind the existing switch, and the app says plainly
when the cloud is the one reading, rather than leaving the writer to guess where
their picture went.

**Nineteen menu commands can be run again.** A menu migration three months ago
moved the menu bar into its own module and dropped 88 labelled controls on the
way; nineteen of them had a handler, a translation and a shortcut, and no way to
reach any of it. They are restored, five names that had outlived their handlers
are deleted, and a gate now resolves command names rather than matching their
shape.

**文字亮室 is reachable from the whole drafting route**, not only from the
Manuscript, and its window carries its own Classic line art on the desk. The
Picture Album, Quick Draft and DocMap all keep a picture the same way now.

Writer Mode lost its menu switch. It could be entered once, from a clean desk,
and that still works — but toggling it in the middle of a session arranged the
desk differently each time, and one of those arrangements closed the manuscript
the writer was in. A control that can close the writer's work is worse than no
control, so it is deleted rather than shipped uncertain. The mode itself, and
everything it arranges, stays.

Smaller repairs: the Trash is no longer flung into a column of its own, Theme
Lab can be resized, two people's names are spelled with their own characters
rather than homophones, and the games — which had been shipping to the web host
with their frames blocked — actually run there.

The startup payload dropped again, by about 140 KB: seven more windows build
their own markup instead of carrying it in the boot document. Moving them lost
three pieces of markup in silence along the way, each caught by counting
elements rather than by reading the diff.

The final convergence day brought Bonsai City into the public beta. The window
was rebuilt around the map: commands moved into Macintosh menus, the tool rail
became a compact palette, the minimap and overlays became permanent
instruments, and touch gained an explicit Pan tool. Under it sits the largest
city expansion yet: 128-square maps, transport and utilities, budgets and
bonds, services and disasters, scenarios and terrain editing, original sound
and seasonal art, two views over one deterministic snapshot, and clean-room
browser-local `.sc2` import and export with synthetic fixtures only.

The writing desk closed four quiet breaks exposed by the merge. Status now
lands in the surface that owns the caret; linked previews repaint without
resetting the reader's place; sentence focus works; and Find/Change, Balloon
Help and popovers remain attached to the window they serve. ClioTalk's welcome
copy follows the selected era's type, and Image Prompt Studio got back the
stylesheet whose absence had collapsed the whole window to zero width.
