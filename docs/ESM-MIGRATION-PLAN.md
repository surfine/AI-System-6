# Incremental ESM Migration Plan

This is a follow-up plan, not part of the security, budget, persistence, or
rendering fixes. It does not authorize a framework migration or a UI rewrite.

## Goals

- Move low-coupling browser logic to explicit imports before stateful features.
- Reduce reliance on the shared top-level global namespace.
- Keep the current HTML, window structure, themes, product copy, and public API.
- Preserve the existing generated bundle, packaged app, offline startup, and
  public-snapshot workflows throughout the migration.

## Compatibility bridge

Each migrated capability gets one ESM implementation and, only where an
unmigrated caller still needs it, a thin bridge that exposes the existing
`window.AISystem6*` contract. The bridge may forward calls; it must not contain
a second implementation or execute initialization twice. New ESM code imports
the module directly and must not consume the compatibility global.

The runtime manifest remains the source of load order until the final boot
phase. Build tooling must fail on duplicate module/bridge ownership and on a
bridge whose underlying export no longer exists.

## Sequence

1. **Inventory and guardrails**
   - Generate a dependency map of top-level declarations, lazy loaders, inline
     handlers, and `window.AISystem6*` contracts.
   - Add tests for startup order, offline loading, bridge identity, and public
     snapshot completeness before moving code.

2. **Pure logic modules**
   - Start with deterministic helpers that do not access DOM, IndexedDB,
     storage, network, or mutable globals: parsing, normalization, validation,
     hashing, token estimation, and model-routing policy.
   - Move one ownership cluster per commit and retain its existing tests.

3. **Read-only registries and data adapters**
   - Migrate application registries, translation/data readers, and immutable
     configuration behind explicit exports.
   - Keep current lazy-load boundaries; do not make heavyweight data part of
     startup merely to simplify imports.

4. **State services**
   - Migrate persistence, write-lease, and store facades only after their
     transaction and fencing behavior has black-box coverage.
   - Inject storage, clock, channel, and database dependencies. Do not hide
     them behind new module-level singletons.

5. **Feature modules**
   - Convert one application at a time from the leaves toward shared
     coordinators. A feature is complete only when its ESM callers no longer
     read its compatibility global.
   - Preserve application lazy loading, cancellation, error codes, and user
     visible behavior.

6. **Boot and bridge retirement**
   - Introduce an ESM boot entry only after all boot-critical dependencies are
     modules and the bundle-size/startup gates remain within budget.
   - Remove a bridge in the same commit that removes its last global caller.
   - Retire concatenation only after Chromium, WebKit, packaged-app, offline,
     and clean-public-snapshot gates all pass without it.

## Commit and verification rules

- Do not combine ESM moves with behavior changes, styling, renaming, or data
  migrations.
- Each commit must be independently revertible and keep the old public API
  through the compatibility bridge where needed.
- Run build, feature contracts, checkJs, server typecheck, Chromium/WebKit
  smoke, and clean public snapshot smoke at every phase boundary.
- Track the count of top-level globals and bridge exports as a ratchet; the
  count may not increase without an explicit compatibility justification.

## Completion criteria

The migration is complete when browser source has explicit dependency edges,
no feature implementation is duplicated between ESM and globals, all bridges
have been removed or documented as public compatibility APIs, and the existing
product and release gates pass unchanged. React, Svelte, or another UI
framework is outside this plan.
