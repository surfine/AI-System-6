# Contributing to AI System 6

Thank you for helping build an AI computer whose work stays visible. AI System
6 values focused changes, historical evidence, executable contracts, and an
interface that remains quiet under pressure.

## Before opening a change

1. Search existing issues and pull requests.
2. Use the live desktop to reproduce the behavior.
3. For a bug, record the appearance, browser or Mac version, exact path, and
   expected versus actual result.
4. For a new feature or major interaction, open an issue before investing in a
   large implementation.

Security issues follow [SECURITY.md](SECURITY.md), not the public issue tracker.

## Local setup

Use Node.js 20 or newer.

```bash
git clone https://github.com/surfine/AI-System-6.git
cd AI-System-6
npm ci
npm start
```

The app opens at [http://localhost:4173](http://localhost:4173). It works
without an AI provider; model-specific changes can be tested later through
Control Panel.

## Repository map

| Path | Owns |
| --- | --- |
| `app/` | Browser runtime, apps, core services, generated registries |
| `src/` | Stateless Node.js server and provider adapters |
| `styles/` | Shared object grammar and appearance layers |
| `assets/` | Runtime icons, fonts, OCR, media, and 3D payloads |
| `scripts/` | Deterministic build and verification tools |
| `tests/` | Executable product and architecture contracts |
| `docs/` | Public architecture, development, and design evidence |

See [Architecture](docs/ARCHITECTURE.md) before changing a boundary and
[Development](docs/DEVELOPMENT.md) for the command surface.

## Change discipline

- Keep one pull request focused on one product contract.
- Add or update an executable feature test when behavior changes.
- Rebuild generated browser output through the documented command; do not edit
  generated bundles by hand.
- Preserve local-first behavior and keep provider credentials out of projects,
  chats, backups, and exports.
- Do not add a frontend framework or application database without an accepted
  architecture proposal.
- Keep English documentation canonical and update its `.zh-CN.md` reference
  mirror in the same change.

## Visual and icon changes

AI System 6 begins with evidence, not nostalgia. A classic object must be
checked against an original System 6 resource or observed behavior before it is
drawn. Do not smooth known 1-bit art into a generic vector, normalize distinct
glyph sizes, or mix eras accidentally.

For a visual change, include before and after screenshots in both System 6 and
Liquid Glass. Explain the owning layer instead of patching a local symptom.
Read the [Design Contract](docs/design/DESIGN.md) and
[Human Interface Guidelines](docs/design/HIG.md) first.

## Verify before the pull request

```bash
npm run build
npm test
npm run verify:version
npm run verify:checkjs
npm run verify:public
```

Run the smallest relevant check while iterating, then the complete public
surface before opening the pull request. CI runs the same sequence on Node.js
20.

## Pull request checklist

- Describe the problem and why the chosen boundary owns it.
- Link the issue when one exists.
- List verification performed.
- Attach visual evidence for UI changes.
- Call out user-visible, storage, security, or compatibility impact.
- Keep generated files and documentation synchronized.

By contributing, you agree that your contribution is licensed under the
project's [MIT License](LICENSE) and that you will follow the
[Code of Conduct](CODE_OF_CONDUCT.md).
