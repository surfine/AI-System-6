# Standalone launch links — one link, straight into a feature

> Design proposal · 2026-09-04 · status: decided for 1.0.52, implementation in
> progress
>
> Related work: Endfield Terminal archive refresh
> (`internal/operations/ENDFIELD-ARCHIVE-REFRESH.md`) and the desktop-app
> window/launch architecture described below.

## 1. Goal

Let an **external link** (wiki page, forum post, game site, a friend's chat
message, a QR code) open AI System 6 **already inside a specific feature**:

- Example A: a link about the Endfield story terminal opens AI System 6 with
  the Endfield Terminal window front and centre, ready to answer a story
  question.
- Example B: a link on a city-building site opens Bonsai City; one on a
  transport-game site opens the OpenTTD/DOOM arcade.

The purpose is **traffic in**: other pages and other apps point *into* AI
System 6 instead of pointing at a generic homepage. The destination window
should fill the screen (System 6 “zoomed” window at minimum), while the rest
of the desktop stays one obvious step away.

## 2. Non-goals

- No new launcher, dock, or “recent items” surface (the product rule says to
  extend the existing Finder/Applications/Working Session equivalents first).
- No browser extension, no native plugin, no account system.
- No rewriting of feature internals; the link only *launches* what the app
  already knows how to open.
- No forced fullscreen that traps the user (desktop escape must always work).

## 3. Existing seams this builds on (verified in the codebase)

| Seam | Where | What it gives us |
| --- | --- | --- |
| Feature commands | `apps/desktop/app/core/actions.js` — lazy commands like `open-endfield-terminal`, `open-bonsai-city`, `open-micropolis`, `open-openttd`, `open-doom`, each with an `ensure*Module` loader | One stable id per launchable feature |
| Window manager | `apps/desktop/app/core/window-manager.js` — `openWindow(name, options)`; Endfield Terminal, Reader, Scrapbook etc. already `maximizeWindow(win, {top})` in the desktop profile | The “fill the work area” behaviour already exists |
| Zoom state | same module + `apps/desktop/app/core/working-session.js` — windows persist `dataset.zoomed`; the title-bar zoom box toggles it | Fullscreen can be the existing zoom, persisted like a normal window state |
| Lazy app loading | `window.AISystem6Runtime.registerLazyCommand(...)` | Cold links don’t pay for loading unopened games |
| Boot query parsing | `apps/desktop/app.js` already reads `window.location.search` at boot (e.g. `debugTheme`) | A boot-time `launch=` param fits the existing pattern |
| Separate feature page | `apps/desktop/endfield-terminal.html` ships as its own published page | Web fallback/landing options already exist |
| macOS shell | `platform/macos/shell/macos-webview/Sources/AISystem6Shell/main.swift` (currently CLI args only) | Needs URL-scheme registration to become a link target |
| Mobile immersive states | `apps/desktop/styles/60-responsive.css` (`is-mobile-fullscreen`, `mobile-immersive-landscape`) | Phone links can hand the whole screen to the app |

## 4. Link contract

### 4.1 Web (works everywhere, no install)

```text
https://aisystem6.pages.dev/?launch=endfield-terminal&mode=fullscreen
```

or a short branded route:

```text
https://aisystem6.pages.dev/go/endfield-terminal?mode=fullscreen
```

Parameters:

- `launch` (required): one of the route ids in §6. Unknown ids → normal boot +
  a small “this app is not available” notice (never an error page).
- `mode=fullscreen` (optional, recommended): zoomed window that fills the
  work area (see §5). Absent → the app’s ordinary window layout.
- Unknown extra query parameters (e.g. `ref=`) are ignored; the product does
  **no traffic analytics** for now.

### 4.2 Installed desktop app (macOS)

Register a custom URL scheme and forward it into the same boot path:

```text
aisystem6://launch?route=endfield-terminal&mode=fullscreen
```

The shell’s `AppDelegate` receives the URL (`application(_:open:)`), maps
`route` through the same allowlist, and loads
`http://127.0.0.1:4173/?launch=endfield-terminal&mode=fullscreen`. If the app
is already running, the second link focuses the app and re-launches the
window (existing `openWindow` behaviour already focuses an open window).

Recommended scheme name: `aisystem6` (matches the existing internal
`aisystem6-image:` references). Registration lives in the shell/native app
`Info.plist` (`CFBundleURLTypes`) — new work, see §9.

### 4.3 Where links live

Initially on pages the project controls (README badges, the Endfield archive
runbook, the public site), then on partner/wiki pages with the project’s
consent wording. Links are ordinary `<a>` tags; nothing special is needed on
the embedding side.

## 5. What “fullscreen” means

Two nested levels, both safe:

1. **Zoomed window (default for `mode=fullscreen`).** The System 6 zoom box
   behaviour: the window fills the available work area, title bar and menu
   bar stay, and closing it returns to the ordinary desktop. This is what the
   Endfield Terminal already does in the desktop profile via
   `maximizeWindow`, so it is the cheapest and most authentic level.
2. **Kiosk immersion (future, opt-in `mode=kiosk`).** Add a reversible body
   class (`is-launch-kiosk`) that hides Finder desktop icons/menu strip while
   the window is open, like the existing mobile immersive states. Escape /
   window close restores the desktop. This is a real CSS change and must go
   through the css-no-pingpong evidence protocol and `verify:css`/`verify:visual`
   budgets before shipping.

**Decision: 1.0.52 ships level 1 (zoomed window) only.** Level 2 (kiosk) stays
out of scope for now.

## 6. First routes

| Route id | Command | Window/app | Profile | Why it is a funnel candidate |
| --- | --- | --- | --- | --- |
| `endfield-terminal` | `open-endfield-terminal` | Endfield Terminal | desktop | story Q&A linkable from Endfield wikis/communities |
| `bonsai-city` | `open-bonsai-city` | Bonsai City | desktop | city-sim pages can link straight to a city |
| `micropolis` | `open-micropolis` | Micropolis | desktop | retro city-builder audiences |
| `openttd` | `open-openttd` | OpenTTD | desktop | transport-game audiences |
| `doom` | `open-doom` | DOOM arcade | desktop | shareable “play in your browser” links |
| `time-machine` | `open-time-machine` | Time Machine | desktop | history/retro audiences |
| `liquid-cover` | `open-liquid-cover` | Liquid Cover (Cover Glass) | desktop | music/visual-audience shares |

Route ids are chosen to be human-readable and stable; they are *not* window
names and do not expose internals.

**Decision: all seven routes ship in 1.0.52**, with the Endfield Terminal as
the lead example.

## 7. Boot flow

As implemented in 1.0.52 (the earlier “new launch-links.js + pendingLaunch
queue” sketch was simplified during implementation — the route table and parse
helpers extend the existing lazy `launch-intent` module, and the request is the
one-shot boot URL, so nothing needs a queue):

1. **Parse.** The boot regex in `apps/desktop/app.js` now also wakes on
   `?launch=`; `applyBootLaunchIntent()` reads `launch` + `mode` through
   `window.AISystem6LaunchIntent.parse` (the same module that already handled
   `?open=` / `?appearance=` / `?tour=`).
2. **Validate.** `launch-intent.js` holds the allowlist — route → command id →
   owning window name. Unknown routes are refused and the app boots normally.
   The same route table is replicated in the local `/go/` server route and the
   Cloudflare Pages `/go/<route>` function; a feature test keeps the three
   copies in sync.
3. **Boot.** The normal boot/workspace-profile sequence runs first
   (`document.body.dataset.appReady === "ready"`).
4. **Confirm (writing profile only).** If the session was left in the Writing
   view, a system confirm asks before switching to the desktop profile; the
   default action is Cancel so an external link cannot silently move a writer.
5. **Open.** `runStandaloneLaunchIntent()` dispatches the registered lazy
   command through the existing `handleAction` (module loader included) and,
   for `mode=fullscreen`, polls briefly for the route’s own window and applies
   the existing `maximizeWindow` (System 6 zoom). No parallel window opener and
   no new zoom helper were needed.
6. **Fall back.** If the feature needs a model/local server that is not
   available, show the feature’s own degraded state (the Endfield Terminal
   already has an “archive unavailable” state) instead of inventing content.

## 8. Security and privacy

- Allowlist only: `launch` maps to known command ids; arbitrary window names,
  file paths, or `javascript:` values never reach `openWindow`.
- Same-origin only for web deep links; no new third-party requests.
- No analytics: extra query parameters are ignored and never stored.
- macOS scheme links only launch the local app; the shell forwards only the
  parsed route (never raw query into a script context).

## 9. Implementation checklist (1.0.52 status)

Web + shared core:

- [x] `apps/desktop/app/core/launch-intent.js` — route table, URL parsing,
      allowlist validation, per-route window name (extended in place, not a new
      module). `tests/features/launch-intent.test.mjs` covers parsing and the
      three-way route-table consistency contract.
- [x] `apps/desktop/app.js` — boot regex + `applyBootLaunchIntent()` +
      `runStandaloneLaunchIntent()` (lazy dispatch, writing-profile confirm,
      zoom application).
- [x] Window mode reuses the existing `maximizeWindow`; no window-manager
      change was required (the launched features already place themselves, and
      games/Time Machine accept the zoom frame).
- [x] Short links: `GET /go/:route` in `apps/server/server/router.js` +
      `apps/server/server/routes/go.js`, and the Cloudflare Pages function
      `functions/go/[route].js` — both 302 to
      `/?launch=<route>&mode=fullscreen`.
- [x] Writing-profile guard: system confirm dialog (default Cancel) before
      switching to the desktop profile and launching.
- [x] i18n copy in `translations-en/zh` (`launch_switch_to_desktop`,
      `launch_open_desktop`, `launch_cancelled`).
- [x] Payload unchanged on boot: routes are lazy feature commands and the
      short-link handlers are server/edge code, not new bundle bytes.

macOS shell:

- [x] `tooling/build-mac-shell-app.mjs` emits `CFBundleURLTypes` for the
      `aisystem6` scheme in the generated `Info.plist`.
- [x] `main.swift`: `application(_:open:)` validates the route against the same
      allowlist, builds `http://127.0.0.1:PORT/?launch=…&mode=fullscreen`, and
      loads it — directly when the webview is already up, or via a pending slot
      consumed by the first successful load for cold starts.
- [x] Second-launch focus: the handler activates the app and orders the window
      front before loading.

Milestone: **1.0.52**.

Verification:

- [x] `npm run verify:features -- launch-intent` (route parsing + sync).
- [x] Swift build of the shell package compiles (`swift build
      --package-path platform/macos/shell/macos-webview`).
- [ ] Live-browser smoke for `?launch=endfield-terminal&mode=fullscreen`
      (boot → window visible → zoomed → close returns to desktop).
- [ ] Packaged macOS: `open "aisystem6://launch?route=endfield-terminal&mode=fullscreen"`
      against a built `dist/AI System 6 Beta.app` (scheme registration only
      exists once the app is packaged).
- [ ] If level-2 kiosk CSS ships: css-no-pingpong skill, before/after
      screenshots, `verify:css` + `verify:visual`, budget note.

## 10. Decisions (all resolved for 1.0.52)

1. Ship level-1 zoomed fullscreen in 1.0.52; level-2 kiosk stays a later
   follow-up (not in this release).
2. Scheme `aisystem6://launch?route=…&mode=…`; web param `?launch=…`.
3. Route set: seven routes in §6 (incl. `time-machine`, `liquid-cover`).
4. Analytics: none; extra query parameters ignored.
5. Writing-profile behaviour: deep links land in the **desktop** profile, but
   a session left in the Writing view first sees a system confirm dialog
   (default Cancel).
6. Both web and macOS ship in 1.0.52; web is the lead channel, macOS scheme
   (`aisystem6://`) follows in the same release.

## 11. Definition of done (for the chosen scope)

- A link opens AI System 6 directly into the requested feature in the agreed
  mode, cold start and warm start (already running) included.
- Unknown/unsafe routes boot the app normally and never throw.
- Desktop escape (close/zoom toggle) always returns to the System desktop.
- Unit + E2E green; macOS scheme verified; docs (this file + README/runbook
  link recipes) updated.
