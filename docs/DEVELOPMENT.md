# Development

This guide describes the supported public-source workflow. For product and
interaction rules, read [Architecture](ARCHITECTURE.md) and the
[Design Contract](design/DESIGN.md).

## Requirements

- Node.js 20 or newer
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
| `npm test` | Run executable feature contracts |
| `npm run verify:version` | Check package, build, runtime, and release identity |
| `npm run verify:checkjs` | Type-check the annotated frontend JavaScript |
| `npm run verify:public` | Verify commands, required files, asset budgets, docs, and CI |
| `npm run test:e2e` | Optional Playwright browser diagnostics |

The default CI sequence is `npm ci`, `npm run build`, `npm test`,
`npm run verify:version`, `npm run verify:checkjs`, and
`npm run verify:public`.

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

Playwright tests are optional diagnostics, not the release condition. A flaky
browser probe must not replace a deterministic product contract.

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

## Pull request loop

1. Reproduce and define the owning contract.
2. Make the smallest coherent source change.
3. Add or update a feature contract.
4. Rebuild generated output through the documented command.
5. Run the targeted check, then the complete public CI sequence.
6. Explain risk, verification, and visual evidence in the pull request.

See [CONTRIBUTING.md](../CONTRIBUTING.md) for community and review expectations.
