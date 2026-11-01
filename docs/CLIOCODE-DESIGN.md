# ClioCode design (M9 groundwork)

<!-- doc-claims: verified | audited: 2026-10-31 -->

ClioCode is a new Mac-only app in 2.0 that works like Claude Code: it runs
commands on the writer's Mac, edits code in place under permission modes, and
fences itself with a macOS Seatbelt sandbox and a network allowlist. It ships
after 1.0.60, built on the same DeepSeek Harness (`dsh`) engine the Clio agent
uses (`apps/server/server/agent/engine-host.js`), reusing the
`sandbox-profile.js` and `egress-proxy.js` patterns.

This document is the design and the technical-proof writeup for the M9 spike
(branch `clio-code-spike`). Owner rulings: the 2.0 proposal
(`internal/design-proposals/2026-10-30-ai-system-agentic-2.0/README.md`, T1–T6
and `ClioCode.dc.html`) and the landing plan
(`internal/plans/CLIO-LANDING-PLAN-2026-10-30.md`, U8, M9). The engine host it
builds on is `docs/AGENT-HARNESS.md`. The spike's proofs live under
`tooling/spikes/cliocode/` (out of the app bundle); since M9.1 the server
modules themselves live under `apps/server/server/cliocode/`, behind their own
`/api/cliocode/*` routes, with the ClioTalk agent modules untouched.

## How ClioCode differs from the Clio agent

The Clio agent (the ClioTalk engine host, `docs/AGENT-HARNESS.md`) works on a
writer's prose folder. It **never touches the real folder**: `dsh` runs in a
shadow clone (`shadows/<run>/work`), the writer reviews a diff, and the server
copies chosen files back with `放回` (put-back). That is right for prose: the
writer is not a programmer, edits are small and reviewable per file, there is
no build graph, and the folder holds private material (`.env`, interviews) that
must never leak or be mangled.

ClioCode works **in place on the real folder**, like Claude Code, with
checkpoints and rewind. The decision and its justification:

- **A code folder is a live graph, not a set of documents.** `node_modules/`,
  `.git/`, `dist/`, caches and lockfiles are consistent with each other and
  with the files on disk. A shadow clone would either copy `node_modules/`
  (hundreds of MiB, minutes per run, broken symlinks and absolute paths in
  `.bin`) or omit it and make `npm test`/`node build` fail. Build tools write
  outputs the next command reads; a put-back-at-the-end model cannot run an
  edit-test-fix loop, which is the whole point of a coding agent.
- **The developer already has version control.** `git` is the real safety net.
  The writer commits, diffs, stashes and resets with their own tools; ClioCode
  must **never** commit, push or publish (it offers to, the human does it), so
  the author's `git` history is the durable record. A second shadow/put-back
  layer on top of `git` would be redundant and confusing.
- **Claude Code's model is proven.** It edits in place with per-session
  checkpoints and `/rewind`. Matching it (T2, "完全照 Claude Code") means a
  coder's mental model transfers directly.
- **The isolation that prose got from the shadow, code gets from the
  sandbox.** The shadow was the Clio agent's write boundary *and* its review
  surface. For ClioCode the Seatbelt profile is the write boundary (writes
  limited to the project folder and temp), the permission modes are the review
  surface (the human approves edits and commands), and checkpoints are the
  undo. The folder is the writer's own code, chosen through the Chooser, so
  there is no private-prose-leak concern that forced the shadow for prose.

So: **Clio agent = shadow copy + put-back; ClioCode = in place + checkpoints +
rewind.** Both keep the same engine, the same per-boot token, the same
`choose folder → opaque id` grant model, the same "no commit/push/publish", and
the same "the engine never escalates its own sandbox".

The cloud/isolated case keeps the shadow-style isolation because it already has
to: an isolated Linux VM (ClioCode.dc.html's「隔离机器」) mounts a copy and the
results come back as a reviewable diff — there is no real local folder to edit
in place.

## The four permission modes

Permission modes gate **tool calls**, not network hosts (the egress filter is a
separate layer, below). Every mode reads files inside the project freely and
refuses anything that touches a path outside the project folder (the Seatbelt
profile enforces the second as a kernel boundary; the decision function
refuses it first so the UI can explain it). A decision is one of **allow**
(auto-run), **ask** (prompt the human once) or **deny** (refuse, explain, do
not prompt).

Tool-call kinds:

- **read** — read, list, glob or grep a path inside the project folder.
- **edit** — create or modify a file inside the project folder.
- **delete** — remove a file inside the project folder (to the macOS Trash,
  snapshotted first, confirmed one at a time — the harness rule).
- **run (sandboxed)** — execute a command inside the Seatbelt sandbox (writes
  limited to the folder and temp, network via the proxy allowlist): `npm test`,
  `node build`, `git status`.
- **run (outside sandbox)** — execute a command *outside* the sandbox. Needs a
  separate approval **each time** (T2); never silently allowed.
- **network (allowlisted host)** / **network (blocked host)** — a request whose
  host is on / off the egress allowlist. Enforced by the egress filter in every
  mode, so these two rows do not change with the mode.
- **outside project** — read or write a path outside the project folder.

| Tool call | Manual | Accept edits | Plan | Auto | Bypass (isolated only) |
| --- | --- | --- | --- | --- | --- |
| read (in project) | allow | allow | allow | allow | allow |
| edit (in project) | **ask** | **allow** | **deny** | allow | allow |
| delete (to Trash) | ask | ask | deny | ask | allow |
| run (sandboxed) | ask | ask | deny | **allow** | allow |
| run (outside sandbox) | ask | ask | deny | **ask** | allow |
| network (allowlisted host) | allow | allow | allow | allow | allow |
| network (blocked host) | deny | deny | deny | deny | allow |
| read/write outside project | deny | deny | deny | deny | allow |

Reading the columns:

- **Manual** (「先问我」, the default): reads auto-run; every edit and every
  command asks once. The safe starting mode.
- **Accept edits** (「改文件不问」): edits auto-run, commands still ask. You
  trust the model to write files but want to see every command before it runs.
- **Plan** (「只看计划」): read-only. Edits, deletes and commands are refused,
  not prompted — the model may read and research (allowlisted network stays
  open for reading) and propose a plan, but changes nothing. There is no way to
  approve a change from inside Plan; the human switches mode first.
- **Auto**: edits, deletes-aside, and sandboxed commands auto-run; the human is
  prompted only for the two genuinely dangerous things — deleting a file and
  running a command **outside** the sandbox — which always ask, even in Auto.
  This is the unattended edit-test-fix loop, still fenced by the sandbox.
- **Bypass**: no prompts at all, including outside-the-sandbox execution and
  paths outside the folder. **Only available in an isolated environment** (the
  cloud/VM case, ClioCode.dc.html's「隔离机器」). The decision function refuses
  the mode itself when `isolated` is false — every action returns deny with
  reason `bypass_requires_isolation` — so Bypass can never be selected for the
  writer's real Mac.

Two invariants hold across all modes and are not a permission-mode choice:

- **Blocked-host network is always denied**, because the egress filter, not the
  mode, owns it. **Allowlisted-host network is always allowed** for the same
  reason — the mode never prompts for a host the filter already admits.
- **Outside-project paths are always denied** except under Bypass-in-isolation,
  because the Seatbelt profile makes it a kernel boundary; the mode cannot
  widen it, and the engine can never ask the writer to widen it (the harness
  preamble rule).

The decision is implemented as a pure function,
`tooling/spikes/cliocode/permission-modes.mjs` (`decidePermission`), with unit
tests covering every cell of the table plus the Bypass-isolation guard
(`permission-modes.test.mjs`). In the app it becomes the gate ClioCode's ACP
`requestPermission` handler consults before answering `dsh`.

## The Seatbelt profile for a code folder

ClioCode reuses the `sandbox-profile.js` shape (a pure SBPL string the kernel
applies to `dsh` and everything it spawns), tuned for a code folder rather than
a prose shadow. The spike's generator is
`tooling/spikes/cliocode/sandbox-profile.mjs` (`buildCodeSandboxProfile`).

Differences from the Clio agent's profile:

- **Writable:** the project folder itself (`subpath`), a per-run temp directory
  (`subpath`, which also holds `TMPDIR` and the package-manager caches, below),
  `/dev/null` and `/dev/fd`. Everything else is `(deny file-write*)`. This is
  the whole write boundary — "writes limited to the project folder and temp".
- **Readable:** unlike the prose profile, reads stay **broad**. A code folder
  legitimately reads system libraries, `/usr`, Xcode's toolchain, the user's
  `~/.gitconfig`, `~/.npmrc`, Node under `nvm`/`volta`, and so on. The prose
  profile fenced reads because `dsh` was reading a stranger's private folder;
  here the writer owns the code and chose the folder, and the review surface is
  the permission prompt, not a read fence. Blocking reads would break `git`,
  `node` and every compiler. (A later hardening could deny reads of `~/.ssh`,
  `~/Library/Keychains` and other secret stores specifically; noted as an open
  item, not in the M9 slice.)
- **git** fits naturally: `.git/` is inside the project folder, so `git add`,
  `git commit`, `git stash`, `git checkout` all write where they already write.
  ClioCode still never *invokes* commit/push itself; the human does. `git`'s
  global config and credential helpers are read-only reads outside the folder,
  which the broad read policy allows; a push would need network (an allowlisted
  git host) *and* a run-command approval, which the human gives.
- **node_modules, package managers:** `npm`/`pnpm`/`yarn` write into the
  project (`node_modules/`, lockfiles) — allowed — and into a cache. The cache
  default is `~/.npm`, outside the folder, which the write deny would refuse,
  so the host points every package manager's cache into the writable temp
  (`npm_config_cache`, `YARN_CACHE_FOLDER`, `PNPM_HOME`/`store-dir`,
  `COREPACK_HOME`, `CARGO_HOME`, `GOCACHE`/`GOMODCACHE`, `PIP_CACHE_DIR`) via
  the child environment. Downloads go through the egress allowlist (registries,
  below).
- **build tools** write their outputs (`dist/`, `build/`, `target/`,
  `.next/`, …) inside the project — allowed. A build that insists on writing
  outside the folder (a global install, `/usr/local`) hits the write deny and
  is refused at the kernel; the human runs it outside the sandbox instead
  (next).
- **Running outside the sandbox** is the explicit escape hatch for the thing
  the sandbox refuses (a global install, a system command, a tool that must
  write outside the folder). It is **not** a `danger-full-access` escalation of
  the same `dsh` process (that is exactly what the harness spike refused, Q2):
  the command is run as a **separate child without the Seatbelt wrapper**, and
  the human approves it **each time** by its exact argv (T2: "沙盒外执行要单独核
  准"). In Manual/Accept edits/Auto this is an `ask`; in Plan it is `deny`; only
  Bypass-in-isolation auto-runs it. The approval shows the full command and the
  cwd; there is no "allow all outside commands this session".
- **No terminal, no lsopen, no exec but Node + the toolchain:** kept from the
  harness profile (deny `/dev/tty` and the pty nodes, deny `lsopen`, deny
  `process-exec*` except an allowlist). For a code folder the exec allowlist is
  wider than prose — a coding agent legitimately runs `git`, `node`, `npm`,
  a shell, compilers — and it is **resolved at profile-build time** from the
  developer's real toolchain (`resolveToolchain`), not a fixed list of `bin/`
  folders. A fixed list fails in practice: `npm` on `PATH` is a link to
  `…/lib/node_modules/npm/bin/npm-cli.js`, and Seatbelt matches the resolved
  file, so `/usr/local/bin` or `/opt/homebrew/bin` alone refuses it. The rule:
  1. The child's `PATH` is fixed first: the running Node's directory, then the
     developer's `PATH` (relative entries dropped). Every lookup below uses that
     same `PATH`, and the child is given it, so what the child execs is what
     was resolved.
  2. For each of `node`, `npm`, `npx`, `git`, `sh`, `bash`, `zsh`, the running
     Node and `$SHELL`: find it on that `PATH` (`command -v`, done in JS so no
     shell rc file runs), and allow its found path and its realpath.
  3. Allow the install the realpath belongs to: its npm package
     (`…/node_modules/<pkg>`, which covers npm's own helpers and `node-gyp`);
     otherwise, for `<prefix>/bin/<tool>`, the prefix's `bin/` and `libexec/`
     (git's helpers live in `libexec/git-core`), and for Node
     `<prefix>/lib/node_modules` (npm, npx, corepack, global CLIs). This
     covers the official installer (`/usr/local`), `nvm`
     (`~/.nvm/versions/node/<v>`) and `fnm` (its multishell link resolves to
     the real install).
  4. A command found under a Homebrew prefix (`HOMEBREW_PREFIX`,
     `/opt/homebrew`, `/usr/local` with a `Cellar/`) adds that prefix's
     `bin/`, `sbin/`, `Cellar/` and `lib/node_modules`. A command found through
     a shim manager whose shim picks the binary at run time adds the manager's
     install trees: `volta` (`bin/`, `tools/image/`), `asdf` (`shims/`, `bin/`,
     `lib/`, `libexec/`, `installs/`), `mise` (`shims/`, `installs/`).
  5. Always: the OS roots `/usr/bin`, `/bin`, `/usr/sbin`, `/sbin` (SIP-
     protected; `/usr/bin/env` runs every `#!` script) and the developer dir
     `/usr/bin/git` hands over to (`DEVELOPER_DIR`, `xcode-select -p`, the
     Command Line Tools, Xcode).
  6. Last, whatever the roots cover: **nothing under the project folder or
     the per-run temp may exec** (and, as before, nothing there may be mapped
     executable), so a script or binary the engine wrote never runs as a
     program. A project-local tool (`node_modules/.bin/vitest`) therefore runs
     as `node node_modules/vitest/…`, not by its own `#!` — an open item for
     M9.2.
  The write and network fences hold whatever is allowed to exec. (This is the
  main place ClioCode's profile is deliberately looser than the prose profile,
  and the main thing the per-mode attack rounds must probe.)

## The network allowlist

Seatbelt cannot filter by host name (the harness spike, and
`egress-proxy.js`'s own comment). So the network boundary is the same two-part
mechanism, made stricter: the Clio agent's profile closes every address of
this Mac but leaves public egress open for the model provider; ClioCode's
profile denies **all** outbound network — `(deny network-outbound)`: public
hosts, every address of this Mac, unix-domain sockets, and the DNS resolver
socket too — and allows back exactly one loopback port with the harness's
`(remote ip "localhost:<port>")` rule. On that port runs a **CONNECT-only
filtering proxy** (`egress-proxy.js`) that admits only allowlisted public
hosts on 443. The filter resolves names host-side (or its upstream does), so
the sandboxed child needs no resolver, and keeping the resolver closed shuts
DNS queries as a way out.
`HTTPS_PROXY`/`HTTP_PROXY` in the child environment point at that port, so all
of `dsh`'s and the toolchain's HTTPS traffic is funnelled through the filter.

ClioCode's filter extends `egress-proxy.js`'s "public host on 443" rule with a
**host allowlist** for coding work. The default set (owner-tunable in Control
Panel):

- **Package registries:** `registry.npmjs.org`, `registry.yarnpkg.com`,
  `*.npmjs.org`, `pypi.org`, `files.pythonhosted.org`, `crates.io`,
  `static.crates.io`, `proxy.golang.org`, `sum.golang.org`,
  `registry.bower.io`, and the model provider / web-search hosts the engine
  already needs.
- **Git hosts:** `github.com`, `codeload.github.com`, `gitlab.com`,
  `bitbucket.org`, `*.githubusercontent.com` (for `git clone`/`fetch`/`push`
  over HTTPS). The git protocol (`git://`, port 9418) and SSH git (port 22)
  are **not** opened — only HTTPS git — because the egress filter is CONNECT-to-
  443-only and the sandbox opens no other port.

The existing filter already refuses plain HTTP, any non-443 port, and every
private/loopback/link-local address, so a registry name that resolves to
`127.0.0.1` or a LAN address gets nowhere (the resolver runs host-side when
there is no upstream proxy; when the writer's network has a loopback proxy the
filter chains through it and the upstream does DNS, exactly as today). Adding
the allowlist is one predicate in `admittedHost`: after the existing public-
host check, the host (or a parent domain) must be in the configured set; a host
that is public but not allowlisted is `403`. A blocked host is the
"network (blocked host) → deny" row of the mode table, enforced here rather
than by the mode.

## Checkpoints and rewind for in-place edits

Because ClioCode edits in place, the undo is a **checkpoint ledger**, not a
put-back (`apps/server/server/cliocode/runs.js`, M9.3):

- **When.** Before the host answers dsh's permission request for a call that
  writes or deletes — the permission handler's `beforeAllow`, after the mode
  has said allow and before dsh hears it — it snapshots exactly the files that
  call names: the bytes and the mode of each file that exists, and "did not
  exist" for one the call will create. A create, an edit, a move: one
  checkpoint per allowed writing call, `checkpoints/<seq>/<path>` plus a
  `<seq>.json` manifest in the run's state folder. The run's whole state —
  ledger, engine temp, its own DSH_HOME, logs — sits under
  `~/Library/Application Support/AI System 6/agent/cliocode/runs/<run>/`,
  server-owned, never inside the project.
- **Refusals.** A snapshot that cannot be made refuses the call — no file of
  the project changes without its checkpoint. A checkpoint carries at most 64
  files and 32 MiB (one per-checkpoint cap, both counted before anything is
  read); a path that is a link, or not a regular file, is never snapshotted;
  and an `.env*` layer is refused the same way the Clio agent's shadow refuses
  it (owner ruling 2026-10-26): the writer's environment never lands in server
  state. Reads of `.env*` inside the folder stay the open hardening item noted
  under Risks.
- **Rewind** (`POST /api/cliocode/runs/:id/rewind`, `{ toCheckpoint }`)
  restores exactly the chosen checkpoint's files — the bytes and mode a file
  had, atomically written beside the target and renamed in, with the same
  directory-chain belt as the harness's put-back (`shadow.js`
  `noLinkWriteTarget` / `directoryChain`) — and deletes what that checkpoint
  recorded as not existing (a creation's own checkpoint removes its file). It
  refuses any path outside the project, after resolving links: `..`, an
  absolute path, or a link on the way out, all before anything lands, however
  a record spells it. It refuses while the engine still runs, and it trims the
  ledger forward of the chosen checkpoint: undo is per tool call, the writer
  picks the call in the timeline, and everything after it stops being
  undoable through ClioCode (git stays the way back).
- Checkpoints are **not** a substitute for `git`. They undo within a ClioCode
  session; the durable record is the writer's own commits. The window makes
  this explicit ("提交和推送永远由你" — ClioCode.dc.html).
- A checkpoint never crosses the project boundary (it only snapshots files the
  sandbox lets the engine write, i.e. inside the folder and temp), and rewind
  refuses a path that is not inside the folder, so rewind cannot be turned into
  a write outside the folder.

## How approvals reach the UI

ClioCode reuses the agent host's admission and transport unchanged:

- **Per-boot token (D7).** The `/api/agent/*`-style routes (ClioCode gets its
  own `/api/cliocode/*` namespace, same guard) answer only to the per-boot
  token minted in `agent-token.js` (`X-AI-System6-Agent-Token`). Only the
  desktop receives it — the Mac shell sets it from the identity proof. A page
  without it gets `401`. The routes also refuse a non-loopback socket/Host and
  a bridged page, and are absent from the public route table.
- **Approval round-trip.** When `dsh` reaches a tool call the current mode
  marks `ask`, the host does **not** answer `dsh` immediately; it emits a
  `permission_request` event on the run's SSE stream (`{ toolCallId, kind,
  title, command?, paths, host? }`), the window shows the System 6 card
  (ClioCode.dc.html's「它想跑这条命令」with 这次可以 / 这个会话里 / 不行), and
  the writer's choice posts back to `POST /api/cliocode/runs/:id/permission`
  with `{ toolCallId, decision: "allow" | "allow_session" | "deny" }`. The host
  then answers `dsh`'s `requestPermission` with the selected option (or reject),
  exactly where `engine-host.js` today answers reject under policy `never`. A
  per-session allow narrows to the one tool kind + target it was granted for.
- **Mode switch.** The mode lives on the run; changing it (the「先问我 ▾」menu
  in ClioCode.dc.html) posts to the run and takes effect on the next tool call.
  Outside-sandbox execution is never covered by a session allow; it asks every
  time regardless.

The event vocabulary extends the harness's (`acp-events.js`) with
`permission_request`, `checkpoint` (one per snapshot) and `command_output`
(sandboxed-run stdout/stderr, redacted, capped). Edits land as ordinary file
writes the window shows as a diff (ClioCode.dc.html's「差异」tab), which is a
diff of the real file against its last checkpoint.

## What the window looks like

See `internal/design-proposals/2026-10-30-ai-system-agentic-2.0/ClioCode.dc.html`
(open as plain HTML). It is one window titled「ClioCode · <repo>」with:

- a top bar: the folder/repo, the current git branch, the permission-mode menu
  (「先问我 ▾」), and the isolated-machine indicator (「隔离机器：运行中 · 不联网」)
  when the run is in the cloud/VM case;
- a left session rail (new session, recent tasks with their state:「等你看差异」
  /「已收下」/「扩充功能 · 等你看」);
- a centre conversation with the engine's work log (read/edit lines with
  `+N −M` counts), the inline permission card for an `ask`, and command output
  (「✓ 24 passed · 0 failed」);
- a right pane with tabs「差异 / 终端」: a per-file diff with per-hunk「收下这块 /
  退回这块」(which, for ClioCode, is the checkpoint timeline, not a put-back) and
  the sandboxed terminal output.

The design rules (System 6 primitives, the closed-set `.select-wrap` for the
mode menu, Classic + Liquid Glass materials) and `avoid-ai-slop-design` apply
to the M9 UI slices, as for the Clio main UI.

## Risks and the security-verification plan

Risks specific to ClioCode (beyond the harness's, which carry over):

- **In-place edits have no put-back gate.** A wrong auto-edit hits the real
  folder. Mitigation: checkpoints + rewind, `git` as the durable net, and the
  mode defaulting to Manual.
- **The exec allowlist is wider.** A coding agent runs `git`, `node`, `npm`,
  compilers. A malicious or confused model could try to run a command that
  escapes the write/network fence, or persuade the writer to approve an
  outside-sandbox command. Mitigation: the Seatbelt write+network boundary
  holds regardless of which binary runs; outside-sandbox always asks by exact
  argv; the engine may never suggest widening the sandbox (harness preamble).
- **Package install is a supply-chain surface.** `npm install` runs
  `node_modules/.bin` scripts. Mitigation: those scripts still run inside the
  Seatbelt profile (write-fenced, network through the allowlist), so a
  postinstall script cannot write outside the folder or reach a non-allowlisted
  host. (`--ignore-scripts` as a default is an open owner question.)
- **Broad reads.** The profile allows reading the writer's home (for
  `~/.gitconfig` etc.), which includes secrets (`~/.ssh`, Keychains). With web
  tools on, a read secret could leave the Mac. Mitigation for M9: deny reads of
  a secret-store denylist (`~/.ssh`, `~/Library/Keychains`,
  `~/.config/gh/hosts.yml`, `.env*` inside the folder as the harness already
  strips) while keeping the rest of reads open. Listed as a slice.
- **Bypass.** The one mode with no boundary. Mitigation: refused unless
  `isolated`, which the real Mac never is.

**Security-verification plan — one attack round per mode (U8).** Each round is
the same shape as the agent security rounds (an Opus sub-agent, read-only, no
commit), merged only when clean:

1. **Manual round.** Probe that an edit or command runs *without* a prompt
   (the decision function or the host failing open); that a denied prompt still
   leaves the file unchanged; that reads cannot be turned into a write.
2. **Accept-edits round.** Probe that an auto-edit cannot write outside the
   folder (kernel), that a command still asks, that an edit cannot smuggle a
   command (a `.git/hooks` write that a later `git` runs — the hook runs
   sandboxed, so this reduces to the write/network fence).
3. **Plan round.** Probe that nothing mutates: every edit/delete/command is
   refused, no checkpoint is written, allowlisted reads/fetches work but a
   blocked host does not; that there is no path from Plan to an approved change.
4. **Auto round.** Probe the unattended loop: a command cannot escape the
   sandbox (write outside, reach a blocked host, exec a non-allowlisted path),
   a delete still asks, an outside-sandbox command still asks, a postinstall
   script is fenced; the harness's survivor/freeze cases on the in-place store.
5. **Bypass round.** Probe that Bypass is unreachable on a non-isolated Mac
   (the mode guard), and, in the isolated case, that the isolation itself
   (VM/container, `--network=none` + proxy) is the boundary, as the cloud
   sandbox rounds already prove.

Plus a **sandbox round** (shared): regenerate the profile for an arbitrary
folder and confirm with the real kernel that writes outside are refused and
inside succeed, that the network allowlist admits a registry/git host and
refuses everything else, and that rewind cannot write outside the folder. The
spike's `seatbelt-proof.mjs` is the seed of this round.

## M9 slice plan

Each slice is mergeable, has acceptance tests, and passes a clean attack round
before merge (U8). A-line (server/execution) unless noted.

- **M9.1 — Permission-mode core.** Port `permission-modes.mjs` into the server
  (`apps/server/server/cliocode/permission-modes.js`) and wire it into the ACP
  `requestPermission` handler. *Acceptance:* a contract covering every cell of
  the mode table and the Bypass-isolation guard; the harness's reject-path
  still holds.
- **M9.2 — Code Seatbelt profile.** `cliocode/sandbox-profile.js` from the
  spike generator, with the code-folder read/exec/write policy and the
  secret-store read denylist. *Acceptance:* a kernel contract (like
  `agent-harness.test.mjs`) proving write-outside refused, write-inside and
  `git`/`node`/`npm` exec allowed, `~/.ssh` read refused, on macOS; skipped
  with a note elsewhere.
- **M9.3 — In-place run + checkpoints. Done 2026-10-31**
  (`apps/server/server/cliocode/runs.js`, `routes/cliocode.js`, contract
  `tests/features/cliocode-runs.test.mjs`). Run `dsh` over the real folder (no
  shadow) with the profile; checkpoint before each writing tool call; rewind
  route. *Acceptance:* an edit lands on the real file; rewind restores it;
  rewind refuses an outside-folder path; checkpoints snapshot only touched
  files. Decisions as implemented: the run needs a `change` grant — a lower
  grant runs in Plan mode (read-only) until M9.7 defines code-folder levels,
  and Bypass is refused at start on a real Mac; the run's DSH_HOME sits inside
  its temp root (the profile's second writable), so the profile names nothing
  but the project and the temp; the engine runs on the ClioCode posture
  (dsh's own fence read-only, approval `ask`), so every file change arrives as
  an ACP `requestPermission` the mode table answers — that ask is the
  checkpoint's hook (`beforeAllow`); command writes are not checkpointed (no
  shell until M9.4/M9.5; a run action's writes become a ledger question then);
  run ids are `code-<uuid>` under `agent/cliocode/runs/`, so ClioTalk's
  `runs/` namespace is untouched. Routes: start (POST), list/get, stop,
  rewind, checkpoints, the permission answer (POST
  `…/permission {toolCallId, decision}`), the mode switch (POST `…/mode`) and
  discard — all behind the same per-boot token and loopback guard as
  `/api/agent/*` (routes/agent.js's admission, `cliocode_`-prefixed codes).
- **M9.4 — Network allowlist.** Extend `egress-proxy.js` with the configurable
  host allowlist (registries + git hosts) and point package-manager caches into
  temp. *Acceptance:* a contract admitting an allowlisted host and refusing a
  public-but-not-allowlisted host and every private address; `npm install` of a
  tiny public package succeeds through the proxy, a fetch of a random host
  fails.
- **M9.5 — Outside-sandbox approval.** The each-time approval path for a command
  that must run without the Seatbelt wrapper, by exact argv, no session allow.
  *Acceptance:* a contract that an outside-sandbox command asks every time, runs
  unwrapped only after approval, and is denied in Plan.
- **M9.6 — ClioCode window (B-line).** The window from `ClioCode.dc.html`: mode
  menu, work log, permission card, diff/terminal tabs, checkpoint timeline,
  Classic + Liquid Glass. *Acceptance:* the affected contracts, both appearances
  captured before/after, the mobile matrix is N/A (Mac only, T5), `verify:floppy`,
  `avoid-ai-slop-design`.
- **M9.7 — Any-folder Chooser + grants.** Reuse `folders.js`'s
  `choose folder → opaque id` grant with a code-folder level set; ClioCode can
  open any code folder (T3). *Acceptance:* a contract that a run re-validates
  the folder (dev/ino, refused locations) and refuses a changed/replaced folder.
- **M9.8 — Security rounds + release.** Run the five per-mode rounds plus the
  sandbox round; fix findings; then M10 ships 2.0. *Acceptance:* every round
  clean, documented like the agent rounds; README/site describe ClioCode before
  release.

## Technical proof (this spike)

Under `tooling/spikes/cliocode/` (Node, out of the app bundle):

- **`permission-modes.mjs` + `permission-modes.test.mjs`** — the pure decision
  function and unit tests over every row of the mode table (8 kinds × 5 modes =
  40 cells) plus the Bypass-isolation guard and input validation.
- **`sandbox-profile.mjs`** — `buildCodeSandboxProfile`, the SBPL generator for
  an arbitrary folder, reusing the `sandbox-profile.js` shape, and
  `resolveToolchain`, the exec-allowlist rule above. A CLI prints a profile
  (and the `PATH` the child must get) for a given folder.
- **`make-sample-project.mjs`** — creates a small npm project (a `node --test`
  suite, a `build.js` that writes `dist/`, a `git init`) under `/private/tmp`.
- **`seatbelt-proof.mjs`** — copies the sample to a scratch folder, generates
  the profile, and runs `npm test`, `git status` and `node build.js` under
  `sandbox-exec` with the exec allowlist resolved from the shell's real
  toolchain, asserting that a write **inside** the folder succeeds and a
  write **outside** it is refused (`EPERM`); that a direct connection to a
  public host, or to a loopback port other than the filter's, is refused
  (`EPERM`); and that through a stub CONNECT filter on the one open loopback
  port an allowlisted host is reached (tunnelled to a local fake upstream, no
  internet needed) while a host off the allowlist gets `403`.

**Running the proof.** `sandbox-exec` cannot be applied inside an already-
sandboxed shell (Seatbelt refuses a nested apply — the harness spike found the
same, Q2). The proof detects this and prints the exact command for the
controller to run **outside** any sandbox:

```sh
node tooling/spikes/cliocode/permission-modes.test.mjs        # pure, runs anywhere
node tooling/spikes/cliocode/seatbelt-proof.mjs               # needs a non-nested shell on macOS
```

See `tooling/spikes/cliocode/README.md` for details and the expected output.
