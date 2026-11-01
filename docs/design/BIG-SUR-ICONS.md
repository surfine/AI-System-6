# Big Sur icon delivery

Big Sur has an independent 59-object family: the existing 56 semantic IDs plus ClioPaint, ClioProject and One More Tune. Its 236 runtime images are transparent sRGB PNGs at 16, 32, 64 and 128 px. The three new applications also have original artwork in Classic, Platinum, Aqua, Snow Leopard, Yosemite, Liquid Glass and NeXTSTEP. NeXTSTEP continues to use Classic for its other 56 objects.

## Design evidence

The historical target is macOS 11 in 2020. The [archived Apple app-icon HIG](https://web.archive.org/web/20201223123443/https://developer.apple.com/design/human-interface-guidelines/macos/icons-and-images/app-icon) supplies rounded-square app bodies, frontal presentation, coherent shadows and physical materials; recognizable tools may extend beyond the body. The [2020 document-icon HIG](https://web.archive.org/web/20201223162058/https://developer.apple.com/design/human-interface-guidelines/macos/icons-and-images/document-icons/) supplies the folded-page document grammar. The [Apple Big Sur release article](https://www.apple.com/newsroom/2020/11/macos-big-sur-is-here/) and [native-system capture archive](https://512pixels.net/projects/aqua-screenshot-library/macos-11-0-big-sur/) provide period context.

Applications and launchable tools use rounded-square bodies; folders keep tabs, documents keep folded pages, storage retains hardware outlines, and empty/full trash retain matching silhouettes. Floppies and project media are explicit product adaptations. Big Sur has one default icon appearance for light and dark backgrounds. Later Liquid Glass masks, clear variants and tint rules are not attributed to 2020.

Downloaded Apple figures have resolved capture URLs and SHA-256 hashes in the reference manifest. They are evidence-only and are excluded from runtime releases. The comparison board places contemporary Apple examples beside original applications and the existing core 16.

## Production and review record

[The 59-object specification](../../tooling/icon-generation/big-sur-specs.json) records roles and visual subjects. Per-object historical review records identity anchors, sources and A/B/C classification: native-counterpart reconstruction, contemporary analog adaptation, or original design. Finder, folder, generic document and System Preferences have direct reference reviews. These are reference-guided reconstructions, not exact pixel replicas. Other objects retain explicit pending historical status where a native counterpart or measured match cannot be established. The three added applications are original designs in every era and do not claim invented historical counterparts.

The built-in image generator produced individual material masters; prompts, revisions and originals remain in `internal/evidence/drafts/big-sur-icons/masters/` and `internal/evidence/drafts/added-app-era-icons/masters/`. Generation is not historical evidence. The 16/32 px images use separate optical compositions, simplified landmarks and stronger small-scale contrast; 64/128 px images use cropped, proportionally scaled material masters. Tools are not clipped to a universal tile mask.

The [Big Sur family ledger](../../apps/desktop/assets/themes/big-sur/big-sur-icon-family.json) stores output hashes, paths, source records and review status. [The cross-era provenance matrix](../../apps/desktop/assets/themes/icon-provenance-matrix.json) covers 472 cells: 416 independent mappings and 56 explicit Classic fallbacks. The original six-era historical review set is preserved separately from expanded eight-era runtime coverage.

## Delivered artifacts and checks

- All 59 Big Sur icons, actual 16/32 px light/dark samples, and the three applications across eight eras.
- Decoded asset report: all 236 PNGs have correct dimensions, sRGB profiles, alpha, visible foreground, transparent margins and matching ledger hashes. Empty/full trash and cloud online/offline differ at every tier.
- Browser report: all 59 IDs switch through eight eras at 1× and 2×, with one visible group per object. Big Sur desktop selects 64/128 px and compact surfaces select 16/32 px. Refresh restores Big Sur/dark; an offline reload retrieves all 236 warmed icon resources.
- The 22 website icons now use the Big Sur family. Web/macOS resource manifests include required PNG tiers and lazy appearance styles, with authoring masters and references excluded. The existing startup budget and 512-byte reserve remain enforced.

Rebuild with `node tooling/build-big-sur-icons.mjs`, `node tooling/build-added-app-icons.mjs`, `node tooling/build-icon-provenance-matrix.mjs` and `node tooling/sync-site-assets.mjs`. Validate decoded resources with `node tooling/verify-big-sur-icons.mjs`; use the existing icon feature tests, Theme Lab snapshot tool, release-asset checker and floppy-budget check for integration. Local preview: `http://127.0.0.1:4187/?appearance=big-sur`.
