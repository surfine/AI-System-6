# Development

<!-- doc-claims: mixed | audited: 2026-09-18 -->

This guide describes the supported public-source workflow. For product and
interaction rules, read [Architecture](ARCHITECTURE.md) and the
[Design Contract](design/DESIGN.md).

## Requirements

- Node.js 24 or newer
- npm from the matching Node.js installation
- a modern Chromium, Firefox, or Safari browser
- optional: LM Studio or Ollama for local model testing

## Setup

```bash
git clone https://github.com/surfine/AI-System-6.git
cd AI-System-6
npm ci
npm start
```

Open [http://localhost:4173](http://localhost:4173). `npm start` rebuilds the
browser bundle before starting the server.

## Supported commands

| Command | Contract |
| --- | --- |
| `npm start` | Build and serve the desktop at port 4173 |
| `npm run build` | Produce the deterministic browser bundle |
| `npm test` | Compatibility alias for executable feature contracts |
| `npm run lint` | Lint the hardened server and integration-test boundary |
| `npm run verify:contracts` | Run source and architecture contracts |
| `npm run test:unit` | Run focused behavior tests for hardened boundaries |
| `npm run test:integration` | Run route tests against local fake upstreams |
| `npm run test:static-smoke` | Boot the desk in Chromium and WebKit from a static file server (startup, persistence, two windows) |
| `npm run verify:version` | Check package, build, runtime, and release identity |
| `npm run verify:checkjs` | Type-check the annotated frontend JavaScript |
| `npm run verify:src` | Type-check the canonical Node server |
| `npm run verify:public-tree` | Verify commands, required files, asset budgets, docs, and CI |
| `npm run verify:public` | Compatibility alias for `verify:public-tree` |

CI installs from the lockfile, lints, builds, runs contracts, focused unit and
fake-upstream integration tests, checks version/checkJs/server types/docs/public
tree, and executes the static smoke in separate Chromium and WebKit jobs. In the
maintainer source tree it also builds a clean public snapshot in a temporary
directory and really runs `npm ci`, `npm run build`, and `npm test` there.

### The loop you actually work in

The contracts (`node tooling/verify-features.mjs --list` prints the current
count, 361 at the last audit) are about 210 CPU-seconds together. Paying that
for a module you touched is the single largest cost of a small change, so pick
the run that matches the work:

| Command | What it runs | Cost |
| --- | --- | --- |
| `npm run verify:quick -- --file <path>` | only the contracts that READ that file | seconds |
| `npm run verify:changed -- --base <sha>` | the same selection, derived from your diff | seconds |
| `npm test` | the fast lane: every contract except the six whole-system simulations | ~30 s |
| `npm run verify:features -- --lane batch` | only those six simulators | ~45 s |
| `npm run verify:features -- --all` | every contract: the nightly and CI answer | ~45 s |
| `node tooling/preview-translation-pad.mjs` | one component in a real browser: the shipped Translation Pad, the shipped markup, and a translation that answers on demand | seconds |

One runner, several names: `npm test`, `npm run verify:contracts` and
`npm run verify:features` all run `tooling/verify-features.mjs`, and `verify:feature`
is the same runner for a single name. Running two of them runs the same contracts
twice — pick one. `verify:public` is an alias of `verify:public-tree`.

`--file` over-approximates on purpose: a contract that mentions the path still
runs, and a path no contract mentions runs none — the run says so rather than
quietly passing. The appearance pixel net is not in any of these; it runs in the
release lane (see `internal/operations/RELEASE.md`), because a screenshot is
worth a minute and a unit of source is not.

## Editing the browser runtime

Source lives in `apps/desktop/app/` and `apps/desktop/app.js`. The browser loads
the generated `apps/desktop/app.bundle.js`, so rebuild after changing browser source. Do not edit
the generated bundle by hand.

Keep feature modules behind their owning application or shared service. A fix
that crosses several applications usually belongs in `apps/desktop/app/core/`;
a local workflow should stay in `apps/desktop/app/features/`.

## Editing styles or appearances

Styles are split by ownership under `apps/desktop/styles/`. Before changing a visual
surface, identify its base rule, responsive rule, appearance override, and any
inline layout that participates in the result. Validate both System 6 and Liquid
Glass; attach before and after evidence to the pull request.

Classic UI and icons begin with original resources or observed emulator
behavior. Preserve 1-bit pixel art and deliberate family-size differences.
Modern SVGs are appropriate for modern appearance families, not as replacements
for known classic artifacts.

## Tests

Feature tests in `tests/features/` are lightweight executable contracts. Add a
test when a bug exposed a missing invariant, or when a feature creates a new
boundary. Prefer testing observable structure or behavior over implementation
spelling.

The Chromium and WebKit static smoke runs in CI on every change
(`.github/workflows/ci.yml`, one job per engine); a release adds the eight-stop
`verify:walk` on top of it. Broader browser probes remain diagnostics, and no
browser probe replaces a deterministic product contract.

## Assets and generated files

Runtime icon families, fonts, OCR payloads, and model assets live in
`apps/desktop/assets/`.
The public repository contains the files loaded by the product. Duplicate
accepted-source image archives and internal proof boards remain in the
maintainer source and are not required by public commands.

Do not add a heavyweight asset to the boot path. New lazy payloads must have an
explicit consumer and a verification path.

## Documentation

English Markdown is canonical. Every canonical file has a `.zh-CN.md` reference
mirror whose header records the source path and SHA-256. When canonical text
changes, update the mirror and its hash in the same contribution.

Keep README focused on product value and the first successful run. Put durable
technical detail here or in [Architecture](ARCHITECTURE.md).

## Writing an application

An application registers once, owns its own content area, and gives its
resources back when it is really destroyed. The interfaces it talks to are
small on purpose; the examples below are the ones ClioPaint and the Translation
Pad actually use.

- **Register**: `AISystem6Runtime.registerApplication({ id, windowName, mount, restore, commands })`.
  Registration is all-or-nothing: a missing id, a `mount` that is not a
  function, or a command without a handler is refused before anything is
  written, so no application is ever half-registered. A lazy command
  (`registerLazyCommand`) may hand its id to the real command exactly once.
  Concurrent `mountApplication(id)` callers share one initialization and are
  told success only after it finished.
- **Let one entry open your objects**: `AISystem6ApplicationRegistry.openProjectObject(id, intent)`
  resolves the id again where the action runs, and
  `applicationObjectAvailability(id, intent, appId?)` is the cheap,
  side-effect-free answer menus, toolbars and shortcuts use while drawing. A
  row drawn a moment ago can name a file another window has since deleted, so
  both questions are answered by the same resolver and the action re-checks
  before it does anything.
- **Commands carry their reason**: register with
  `{ handler, isAvailable, unavailableReason }`. `AISystem6Runtime.commandAvailability(id, payload)`
  returns `{ available, reason }`, and `dispatchCommand` reports `unavailable`
  with that same reason instead of an empty refusal. A handler that returns
  `{ ok: false }` is a business failure and is never reported as a success.
- **Windows and lifecycle**: hiding or WindowShade'ing a window keeps its
  state; `dispose` is for a real destroy. `AISystem6InstanceResources.create(name)`
  collects listeners (`listen`), timers (`timeout`) and other cleanups; its
  `dispose()` runs once, keeps going when one cleanup throws, and the next
  mount cycle gets a fresh registry. Register render tasks with their owner
  window - `registerRenderTask(name, handler, { windowName })` - so a hidden
  window keeps a pending repaint until it is shown again.
- **Read state, do not copy it**: `AISystem6StateStores.watch(store, select, { immediate, isEqual })`
  watches a slice of one store, hands the listener the selected value plus the
  change that produced it, and returns the store's own unsubscribe function.
  Do not keep a second writable copy of project data, and do not write to the
  store from an input event just to keep a control fresh.
- **Answers arrive late**: carry the identity the work started with (project
  id, object id, run id) and re-check it before applying anything. A picture
  that changed, a pad that moved on, or a project the writer left means the
  answer is not shown; the run receipt still records it.
- **A writer says what it moved**: after changing a record the desk already
  holds, call `markDeskDirty(kind, id)` (`markDeskDeleted` for a removal). A
  save plan carries the records whose writers reported them and only
  fingerprints the rest, so a writer that stays silent on a trusted collection
  would lose its edit at the next save.

  `chatFiles`, `chatFolders`, `scraps`, `trash` and `imageAttachments` are on
  the trust list: each joined it when the comparison in
  `app/core/persistence-scan-shadow.js` (loaded lazily by the check that uses
  it, so it is not part of the boot payload) showed every writer there
  reporting, with the run's deliberate unreported edit still caught. `projects` is not on the
  list — the outline claim, DocMap, the dictionary and the Finder labels still
  write that record in place — so it keeps the full scan and an unreported edit
  there is still caught. The instrument names the two cases apart, so a miss on
  a trusted collection is a regression and a miss anywhere else is the
  migration list (`notYetMigrated`).

### What the two pilots cost to maintain

Measured once, on the two applications this framework work was proved against,
so the next person can tell a regression from a rounding error. Counts are of
the source file; bytes are what a first open actually requested then. They are
a dated comparison, not a live pin: re-measure a stylesheet with
`npm run verify:floppy` (it prints each lazy sheet) and a script from its
`lazyRuntimePaths` entry before calling a difference a regression.

| | ClioPaint | Translation Pad |
| --- | --- | --- |
| Cross-application DOM lookups (`document.querySelector` / `getElementById`) | 17 → 5 | 0 |
| Window-root lookups (the five that remain in ClioPaint) | the window's own root, plus "which window is active" | n/a |
| Lifecycle: listeners, timers and cleanups | `AISystem6InstanceResources.create("clioPaint")`, `dispose()`, `resourceCount()` for diagnostics | same, `create("translationPad")` |
| First open: script | 50,711 B | 11,524 B |
| First open: stylesheet | 3,009 B | none |
| First open: network time on a local dev server | ~20 ms script, ~20 ms stylesheet | ~4 ms |

Adding an action to either pilot is one file: the command is declared in that
application's own `registerApplication({ commands })` call, and its
availability comes from the same resolver the menu draws with. Changing how a
window closes is also one file for the application's own content, plus
`window-manager.js` if the framework's default close behaviour itself changes -
which is the split the framework is supposed to keep.

The startup side is unchanged by application work: the desk ships
`app.bundle.js` and `styles.bundle.css` (their current sizes are the first two
lines of `npm run verify:floppy`), against a Floppy budget of 2,954,624 B for
the whole core. Development-only instruments
do not live in that payload - the save-plan shadow comparison, for instance,
ships as a lazy file that the check using it loads
(`app/core/persistence-scan-shadow.js`).

### Compatibility aliases

Kept for consumers that still read them. Each entry names its consumers and
what has to happen before it can go. (`AISystem6Runtime.c` and
`AISystem6Runtime.lazyCommands` used to be listed here; every consumer now
reads `listCommands`, `listLazyCommands`, `forEachCommand`, `getCommand` or
`getLazyCommand`, and the maps are no longer handed out.)

The list is empty. An alias earns a row only while something reads it: name that
consumer and what has to happen before the alias can go, and delete the row with
the alias. `setMirroredEditorValue` was the last entry; nothing in the app called
it, the external review harness that extracted it by name no longer does, and the
guarantee it stood beside — a mirrored message never overwrites a pending local
edit — is held by the record feed.

## Pull request loop

1. Reproduce and define the owning contract.
2. Make the smallest coherent source change.
3. Add or update a feature contract.
4. Rebuild generated output through the documented command.
5. Run the targeted check for what you changed (`npm run verify:quick -- --file <path>`).
   The complete public CI sequence runs in CI and before a release, not after every
   targeted check.
6. Explain risk, verification, and visual evidence in the pull request.

See [CONTRIBUTING.md](../CONTRIBUTING.md) for community and review expectations.

<!-- claim-check: node tooling/verify-features.mjs --list (361 contracts) | npm run verify:floppy (budget + bundle sizes) | .github/workflows/ci.yml | apps/desktop/app/core/persistence-scan-shadow.js -->
