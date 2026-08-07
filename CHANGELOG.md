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
