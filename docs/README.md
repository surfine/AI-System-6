# AI System 6 Documentation

This directory is the public map of the system. Start with the smallest document
that owns your question.

## Build and architecture

- [Architecture](ARCHITECTURE.md) — runtime boundaries, state, providers,
  assets, build outputs, and the public-source contract.
- [Development](DEVELOPMENT.md) — local setup, commands, tests, generated
  files, and contribution workflow.
- [Desk Port: MCP](MCP.md) — design proposal for a Model Context Protocol
  server that lets other agents read the route and propose, never commit.
- [Contributing](../CONTRIBUTING.md) — issue and pull request expectations.
- [Security](../SECURITY.md) — supported versions and private reporting.

## Design evidence

- [Design Contract](design/DESIGN.md) — product identity, object grammar, and
  cross-era rules.
- [Human Interface Guidelines](design/HIG.md) — repeatable application and
  control decisions.
- [Appearance QA](design/APPEARANCE-QA.md) — evidence and review method across
  the supported appearances.
- [Theme Family Contract](design/THEME-FAMILY-CONTRACT.md) — shared asset and
  behavior expectations.
- [Historical UI Mapping](design/historical-ui-mapping.md) — provenance of the
  classic interaction vocabulary.

## City simulator

- [City Simulator](city-simulator/README.md) — the original Bonsai City
  simulator foundation: architecture, determinism, save format, license
  boundaries, and OpenSC2K research.

## Documentation policy

English files are canonical. Each has a `.zh-CN.md` reference mirror with the
source path and content hash pinned in its header. `npm run verify:docs` catches
missing or stale mirrors in the maintainer source; public CI verifies that all
linked files and supported commands exist in the published tree.

Internal release orchestration, signing, host configuration, working notes, and
accepted-source icon archives do not belong to this public documentation tree.
Completed plans and closeout reports are not documentation: durable decisions
must graduate into an owning contract, test, or runbook before the temporary
document is removed.
