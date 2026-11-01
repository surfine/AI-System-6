// One entry for "open this project file": the menu row, the Finder's
// double-click and the command all resolve the same object with the same
// rules, and an id that moved or disappeared is refused with a reason instead
// of opening an empty window.

import { createFeatureTest } from "../helpers/feature-test-harness.mjs";
import { createAppBootVm } from "../helpers/app-boot-vm.mjs";

const test = createFeatureTest("file-open-entry");

const vmw = createAppBootVm();
const run = (code) => vmw.run(code);

run(`
  window.__projectId = "project-open-a";
  activeProjectId = window.__projectId;
  chatFiles.length = 0;
  chatFiles.push({ id: "open-file-a", projectId: window.__projectId, type: "chat", name: "Chat A", messages: [], folderId: null });
  chatFiles.push({ id: "open-file-other", projectId: "project-open-b", type: "chat", name: "Chat B", messages: [], folderId: null });
  window.__status = "";
  setStatus = (message) => { window.__status = String(message); };
`);

const availability = await run(`
  (() => {
    const registry = window.AISystem6ApplicationRegistry;
    return {
      present: registry.applicationObjectAvailability("open-file-a", "open"),
      missing: registry.applicationObjectAvailability("open-file-missing", "open"),
      otherProject: registry.applicationObjectAvailability("open-file-other", "open"),
      blank: registry.applicationObjectAvailability("", "open"),
    };
  })()
`);
test.assert(
  availability.present.available === true && availability.present.appId === "clioTalk",
  "a file in the active project is offered to the application that opens it"
);
test.assert(
  availability.missing.available === false && availability.missing.reason === "missing",
  "a file that is gone is not available, and says why"
);
test.assert(
  availability.otherProject.available === false && availability.otherProject.reason === "missing",
  "a file in another project is not offered by this project's entries"
);
test.assert(availability.blank.available === false, "an entry with no id is not available either");

// A row drawn before the file was deleted must refuse when it is used.
const staleRow = await run(`
  (async () => {
    const registry = window.AISystem6ApplicationRegistry;
    const wasAvailable = registry.applicationObjectAvailability("open-file-a", "open").available;
    chatFiles.splice(chatFiles.findIndex((file) => file.id === "open-file-a"), 1);
    const opened = await registry.openProjectObject("open-file-a", "open");
    return { wasAvailable, opened, status: window.__status, chatWindow: !!document.querySelector('[data-window="chatFile"]:not(.is-hidden)') };
  })()
`);
test.assert(staleRow.wasAvailable === true, "the row was actionable when it was drawn");
test.assert(
  staleRow.opened.ok === false && staleRow.opened.reason === "missing",
  "the same id is refused where the open actually happens"
);
test.assert(staleRow.status.length > 0, "and the refusal reaches the writer in words");
test.assert(staleRow.chatWindow === false, "no empty transcript window is opened for it");

// The command entry agrees with the resolver: unavailable before it runs, and
// a business failure that is not dressed up as success.
const command = await run(`
  (async () => {
    const unavailable = await window.AISystem6Runtime.dispatchCommand("open-chat-file", { fileId: "open-file-missing" });
    return { status: unavailable.status, ok: unavailable.ok };
  })()
`);
test.assert(
  command.status === "unavailable" && command.ok === false,
  "the command reports its own precondition instead of opening nothing"
);

const commandWithTarget = await run(`
  (async () => {
    chatFiles.push({ id: "open-file-c", projectId: window.__projectId, type: "chat", name: "Chat C", messages: [], folderId: null });
    const result = await window.AISystem6Runtime.dispatchCommand("open-chat-file", { fileId: "open-file-c" });
    return { status: result.status, ok: result.ok, resultOk: result.result?.ok === true };
  })()
`);
test.assert(
  commandWithTarget.status === "success" && commandWithTarget.resultOk === true,
  "a real file opens through the same entry"
);

test.finish();
