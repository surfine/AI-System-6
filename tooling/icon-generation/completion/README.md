# Completion icon masters

Each production master in `masters/<era>/` was generated individually with the built-in Image Gen tool. The tool does not expose a model version; this project does not assign one. The corresponding text in `prompts/<era>/` records the generation request. A `-final` or `-opaque` prompt supersedes the initial prompt for the same icon; the generated asset ledger names the exact selected prompt and master hash.

Run `npm run build:completion-icons` to produce the native tiers and the derived System 7 family. The build requires every master and never substitutes code-drawn artwork. Classic uses 1-bit conversion; the other families retain raster color. Source images stay outside the web release payload.

## Liquid Glass

The current Apple [App icons HIG](https://developer.apple.com/design/human-interface-guidelines/app-icons/) was checked on 2026-10-08 (guidance revised 2026-06-08). The completion cohort follows its guidance on simple filled shapes, centered content, clearly defined edges, and consistent features across default, dark and clear appearances. Dark variants are subdued; clear variants retain the same composition with restrained monochromatic treatment.

These are flattened static icons for a browser-based historical appearance, not a native Icon Composer package. They intentionally omit baked-in glass rims, glare, refraction, bloom, bevels and inter-layer shadows. Native Apple icons instead supply unmasked layers and let the system apply masking and dynamic effects; see [Creating your app icon using Icon Composer](https://developer.apple.com/documentation/xcode/creating-your-app-icon-using-icon-composer).
