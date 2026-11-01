# MCP in AI System 6

<!-- doc-claims: verified | audited: 2026-10-31 -->

AI System 6 speaks the Model Context Protocol in both directions. Outside
agents (Claude Code, Claude Desktop, Codex, Cursor) can work at this desk as
**guests**, and the desk can ask outside **servers**. Both live in Chooser.
This page describes what ships; how the bridge is wired, invitations over the
internet and the trust boundary are in [MCP Guest Bridge](MCP-GUEST-BRIDGE.md).
The 2026-09-28 "Desk Port" proposal this replaced is kept in
`internal/design-proposals/2026-09-28-desk-port/`.

## Guests: other agents at this desk

- **Endpoint.** `POST /mcp` on the local server (Streamable HTTP). The page
  executes every call; the server relays and executes nothing itself.
- **Protocol.** Revision `2025-11-25`, and older clients on `2025-06-18`,
  `2025-03-26` and `2024-11-05`.
- **Approval.** Each guest is approved once by name, with a privilege level.
  The writer changes or revokes it in Chooser → Guests.

### One table, every application

Every tool and resource is declared once, in
`apps/desktop/app/core/mcp-surface.js`. The server's schemas and the page's
implementation both read that table, so they cannot drift apart. Every
application in the registry declares its MCP surface there; a contract fails
when one does not (`tests/features/mcp-surface.test.mjs`).

Tool names start with `ais6_`. Each tool carries:

- annotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`);
- an `outputSchema`, and answers with `structuredContent`;
- an English and a Chinese description.

| Level | Tools | What it allows |
| --- | --- | --- |
| Read only (`read`) | 37 | Reads the desk, the writing route, projects, File Floppy, Scrapbook, run receipts, revisions, ClioWorks projections, Clio tasks, Cover Glass, ClioPaint and ClioProject |
| May propose (`propose`) | 9 | Puts proposals where the writer reviews them: File Floppy, review notes, ClioWorks revisions, lens results, rebuild packs. Nothing enters a manuscript until the writer adopts it |
| May change (`change`) | 13 | Operates the desk: open an application, switch project, write the manuscript, burn a Project CD and similar |

A guest sees only the tools its level allows. When the writer changes a
guest's level, the server sends `notifications/tools/list_changed` with its
answer to that guest's next request.

### Asking before a change

Every **May change** call first sends `elicitation/create` (form mode) to the
guest's client, which shows a confirmation the writer must answer. A decline
or a cancel means the tool does not run. This happens on every call; there is
no "always allow" for this level.

### Resources

Resources use `ais6://` URIs, among them `ais6://desk`, `ais6://plan`,
`ais6://route/…`, `ais6://floppy/…`, `ais6://scrapbook/…`,
`ais6://receipts/…`, `ais6://docmap/…`, `ais6://cover/{id}` and
`ais6://painting/{id}`. They support list, read and subscribe. A write that
touches a subscribed resource sends `notifications/resources/updated`.

### Progress, cancel, audit

- **Progress.** A call that asks for progress receives
  `notifications/progress`.
- **Cancel.** `notifications/cancelled` abandons a call that has not
  finished.
- **Audit.** Every `tools/call` leaves one record in the desk's bounded audit
  ring, reads and refusals included. Each record says who called, when, which
  tool, a summary of the arguments, and the result.

### What the writer controls in Chooser

- **Tool permissions.** For each approved guest, every tool its level allows
  can be set to Allow, Ask each time, or Off. Off hides the tool from the
  guest's list and refuses it. Ask puts a confirmation on the desk before a
  read or a proposal runs. A May change tool offers only Ask each time (its
  confirmation is the elicitation above) or Off; it can never be Allow.
- **Projects.** By default a guest works in whichever project the desk has
  open. Limited to chosen projects, it is refused while another project is
  open, sees only its projects in `ais6_list_projects`, and can switch only
  to them.
- **Recent calls.** Every call from the audit ring, newest first, filtered by
  guest and exportable as CSV.

### The switch

Chooser's corner reads **MCP ◉ Active ○ Inactive**. Inactive is the default:
the page does not open the guest bridge, so no guest reaches the desk. Active
opens it, and the Guests driver decides per agent what each one may do.

## Servers: this desk asking others

Chooser → Servers lists the MCP servers the writer added. A server that
answers a search tool joins Searcher's engine menu. Whatever a server returns
lands on the File Floppy, never in the manuscript. Reach, headers and the
proxy are described in [MCP Guest Bridge](MCP-GUEST-BRIDGE.md#asking-other-servers).

## Not yet

- Copy-config buttons for each client and a `.mcpb` package.
- Clio itself using outside MCP servers as connectors.

These are planned for 2.0; until they ship, this page does not describe them.
