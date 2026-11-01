# System dialogs — when the desk is allowed to ask

<!-- doc-claims: verified | audited: 2026-09-19 -->

> Owner's decision, 2026-09-19: a dialog that only asks permission for
> something the reader just asked for should not exist. The desk decides, and
> the writer's own work is what has to survive.

This is the standing review of every blocking surface in the app — the
`showSystemModal` calls, the desk's own `<dialog>` windows, and the write-lease
dialog. Each one is either **removed** (the desk acts and reports in a
non-blocking channel) or **kept**, with the reason it is still allowed to stop
the writer.

## The rule

A dialog may stay only when it does one of these:

1. **Collects input the desk cannot invent** — a name, a path, a URL, a
   literal the writer has to type.
2. **Protects work** — unsaved changes, a document about to be overwritten or
   deleted, a burn or erase with no undo.
3. **Confirms something irreversible** — Trash is not; Delete, Erase, Reset and
   Discard are.
4. **Puts a real decision in front of the writer** — sending their material to
   a cloud model, reading a remote page, handing the pen to a window that could
   not save.

Everything else is information or an acknowledgement. Those now travel in the
status line (`setStatus`) or the notification list (`pushSystemNotification`),
which the writer reads when they look and never has to answer.

## 1. Removed

| Where | What it asked | What replaced it |
| --- | --- | --- |
| `apps/desktop/app.js` — `runStandaloneLaunchIntent` | "Opening this app switches from the writing view to the Finder desktop. Continue?" | The link is the reader's own click: the session moves, the writing route keeps every window and document, the desk record still stores `writing`, and the status line says where the app opened |
| `apps/desktop/app/core/actions.js` — four `open-system-file-*` commands | "This system file is used by AI System 6…" | status line |
| `apps/desktop/app/core/actions.js` — `open-droplet` | "Droplets are drag targets, double-clicking opens no window" | notification |
| `apps/desktop/app/core/window-manager.js` — `showAboutMultiFinder` | MultiFinder about text | notification |
| `apps/desktop/app/core/window-manager.js` — `shutDownSystem` | "Shut down AI System 6?" | Shut Down is the writer's own command and the desk saves on the way out; the shutdown screen reports a save that failed |
| `apps/desktop/app/core/desktop-runtime.js` — `resetSystemStorage` failure | "Reset failed. Close other tabs and try again." | failed notification |
| `apps/desktop/app/features/desktop-tools.js` — `completeWritingBell` | "The work bell rang." | status line plus the bell's own knock notification, which carries the way back to the sentence; the next interval loads immediately |
| `apps/desktop/app/features/desktop-tools.js` — `movePuzzleTile` | "Solved in N moves." | status line (the puzzle already had one) |
| `apps/desktop/app/features/clio-stage.js` — `ensureSlidesMarkdownValidForExport` | "…failed validation" | status line plus failed notification |
| `apps/desktop/app/features/slides-export.js` — Marp and AI slide exports | "…generation failed / did not validate" | status line plus failed notification |
| `apps/desktop/app/core/local-model-connection.js` — `openSafariHttpLocalEntry` | "Paste the address into the tab that opened." | notification, which stays readable while the other tab is used |
| `apps/desktop/app/features/outline-claim.js` — `organizeQuestionSheet` failure | "Question Sheet organization failed: …" | status line plus failed notification |
| `apps/desktop/app/features/bonsai-city.js` — `reportMicropolisImport` | "Import finished with these notes: …" | notification |
| `apps/desktop/app/features/writing-demo.js` — preflight failure and demo failure | "Live demo preflight failed before recording: …" | failed notification |
| `apps/desktop/app/core/persistence-status.js` — `reportWritingRouteModelFailure` | "…Open Control Panel to connect a model?" then the failure, as two dialogs | one failed notification that opens Control Panel from its button |
| `apps/desktop/app/features/export-import.js` — `noteProjectCdExportReviewState` | "…has no recorded Review Desk completion. Continue anyway?" | notification; the export is the writer's own command and an unfinished review costs no work |
| `apps/desktop/app/features/mcp-servers.js` — remove server | "Remove the server “…”?" | status line; material already on the File Floppy stays, and re-adding is the same form |
| `apps/desktop/app/features/scrapbook.js` — Forget | "Move this memory item to Trash?" | status line; the item stays recoverable in the Trash |
| `apps/desktop/app/features/scrapbook.js` — Trash double-click | "Restore: …?" | the double-click is the answer; restoring loses nothing |
| `apps/desktop/app/features/documents-chat.js` — `createProjectMemoryDraft` | "Save this draft as durable Project Memory?" | status line; the two input dialogs above had already shown and allowed editing of exactly what gets saved |
| `apps/desktop/app/features/documents-chat.js` — `createSkillDraftFromSelectedRetrospective` | "Create a Skill draft from “…”?" | status line; a draft installs and enables nothing |
| `apps/desktop/app/features/hkrr-review.js` — `saveHkrrReview` | "Save this HKRR Lift review to Project CD?" with a preview | status line; the review on screen is what is saved |
| `apps/desktop/app/core/web-app-shell.js` — update ready | "A new version of AI System 6 is ready. Restart now to use it?" | Nothing restarts. A waiting build takes over only when the page on screen already runs it (the usual case: navigation had already fetched the new page), with no reload; an older page is left alone and the next load brings the new one. The reason it was kept -- a restart drops open content -- no longer applies |

## 2. Kept: they protect work

| Where | Why it stays |
| --- | --- |
| `apps/desktop/app/core/window-manager.js` — `closeWindow`, `quitApp`, `prepareFinderModeForApp`; `apps/desktop/app/features/teachtext-accessories.js` — `closeTeachTextDocumentTab`; `apps/desktop/app/core/workspace-profile.js` — `exitWritingStudio` | Unsaved TeachText changes: Save / Don't Save / Cancel is the writer's call, and Cancel is what a bare Enter fires |
| `apps/desktop/app/core/window-manager.js` — `restartSystem` save failure | The desk could not write the state; reloading anyway would discard it |
| `apps/desktop/app/core/desktop-runtime.js` — Empty Trash, Erase Disk, Reset System | Permanent removal with no undo |
| `apps/desktop/app/features/micropolis.js` — delete city, and the three New City commands | "Unsaved progress in the current city will be lost" |
| `apps/desktop/app/features/bonsai-city.js` — delete city, send to Micropolis, import a Micropolis record | Both directions are lossy and the report says what changed |
| `apps/desktop/app/features/clio-paint.js` — New Picture | "Unsaved canvas content will be lost" |
| `apps/desktop/app/features/soundscape.js` — delete a saved moment | Removes the saved item from the writer's collection |
| `apps/desktop/app/features/project-disk.js` — `moveProjectReferencesToTrash` | Deleting a referenced source orphans `[Sn]` citations in existing drafts |
| `apps/desktop/app/core/chat-messages.js` — discard reply; `apps/desktop/app/features/documents-chat.js` — discard temporary conversation | Discards conversation content that cannot be regenerated identically |
| `apps/desktop/app/features/documents-chat.js` — `restoreSelectedTaskCheckpoint` | Replaces the task file's current references |
| `apps/desktop/app/features/find-change.js` — Change All | One command rewrites every match in the document |
| `apps/desktop/app/features/quick-draft-handoff.js` — `openBlank` | Offers to save the draft on screen before starting a new one |
| `apps/desktop/app/features/outline-claim.js`, `apps/desktop/app/features/writing-flow.js`, `apps/desktop/app/features/docmap.js`, `apps/desktop/app/features/translation.js`, `apps/desktop/app/features/quick-draft-ai.js`, `apps/desktop/app/features/quick-draft-composition.js` | AI output about to enter the writer's own text: outline overwrite, replace outline, organize Question Sheet, append suggestion, apply section draft, final label, translate/rewrite, develop layers. The preview is what makes it a decision rather than a surprise |
| `apps/desktop/app/core/write-lease.js` — `requestForceTakeoverWithConfirm` | Forcing the pen away from another window that may hold work it could not save |

## 3. Kept: input, or a decision the desk must not make

| Where | Why it stays |
| --- | --- |
| `apps/desktop/app/core/modal.js` — `showInputDialog` and the desk's form dialogs (`startup-settings-modal`, `new-project-disk-modal`, `app-input-modal`, `public-verification-modal`, `erase-disk-modal` preview) | They collect names, paths, codes and settings the desk cannot invent |
| `apps/desktop/app/core/external-drop.js` | "Read the source of this URL, or keep its text?" — two different results, and one of them fetches a remote page |
| `apps/desktop/app/features/clio-paint.js` and `apps/desktop/app/features/teachtext-accessories.js` — cloud read confirms | The writer's own material leaves the machine |
| `apps/desktop/app/core/desktop-runtime.js` — `setStartupEnvironmentPreference` | Restarting to change the startup environment |
| `apps/desktop/app/features/documents-chat.js` — `configureSkillAutoCall`, `confirmSuggestedProjectSkill` | Grants a Skill standing permission over the project |
| `apps/desktop/app/features/guest-tools.js` — rotate desk, adopt review, commit a guest intent | Rotating invalidates every invitation the writer sent; adopting writes a review record and marks the receipt accepted; committing runs a guest's request as the owner |
| `apps/desktop/app/features/writing-demo.js` — teaser closing card | A two-way offer at the end of the teaser, not a permission |
| `apps/desktop/index.html` — `guest-approval-modal`, `boot-recovery-modal`, `document-versions-modal`, `clio-use-result-modal` | An external agent asking to run a tool, a recovery choice after a failed boot, the version list, and how to use an AI result — each is a real choice with different outcomes |

## 4. Registration surface, not dialog design

The launch-flow takeover also carries the write lease: a window that navigates
to a link gives the pen back on `pagehide`
(`apps/desktop/app/core/write-lease.js` — `releaseWriteLease({ unload: true })`),
so the arriving window claims the desk directly instead of waiting out the
handshake and asking about a window that had already left. The remaining lease
dialog is kept: it appears only when the other window is still there and its
flush failed, which is the one case where the writer has to choose.

## 5. Verification

- `tests/features/launch-intent.test.mjs` — the launch takeover opens no
  dialog and leaves the writer's profile in the desk record.
- `tests/features/workspace-profile.test.mjs` — the desk record stores the
  writer's own profile while the takeover visit is on screen.
- `tests/features/takeover-handshake.test.mjs`, `tests/features/single-writer-race.test.mjs`
  — a window that leaves is claimed without a question, a window that stays
  silent still is not.
- `tests/features/failure-copy-honesty.test.mjs` — an offline model offers
  Control Panel from a notification, and no dialog appears.
- `tests/e2e/probe-launch-takeover.spec.mjs` — a real browser: a shared link
  opens the app it names, opens no dialog, and the next launch returns to the
  writer's own view.
- `tests/e2e/probe-quiet-dialogs.spec.mjs` — a real browser: the finished
  writing bell, an export with an unfinished review, Shut Down, a system file
  and a droplet all run without opening a dialog, and each one's replacement
  message reaches the status line or the notification list.
- `tests/features/dialog-default-safety.test.mjs` — every remaining
  `danger: true` confirm still pairs `defaultAction: "cancel"`.
