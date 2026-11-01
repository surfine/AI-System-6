// The web deployment can raise a system notification too.
//
// The mac app notifies through the shell's own bridge, so the public
// deployment - same desk, no bridge - had no way to reach a reader whose tab
// was in the background. A page has the Notification API for exactly that.
// The rules mirror the shell's: a new message only (a repeat that folds into
// the last entry is not a second event), only while the desk is hidden,
// because with the desk on screen its own Notification Center is the notice,
// and a click on the notification returns to the object it named - the same
// thing the shell's own onNotificationClick does.

import { createFeatureTest } from "../helpers/feature-test-harness.mjs";
import { createAppBootVm } from "../helpers/app-boot-vm.mjs";

const test = createFeatureTest("web-notification-fallback");
const vmw = createAppBootVm();

const outcome = await vmw.run(`
  (function () {
    const shown = [];
    const asked = [];
    let permission = "granted";
    window.Notification = class {
      constructor(title) { shown.push(title); this.onclick = null; Notification.last = this; }
    };
    Object.defineProperty(window.Notification, "permission", { get: () => permission });
    Object.defineProperty(window.Notification, "requestPermission", { value: () => { asked.push(1); return Promise.resolve("granted"); } });
    let hidden = true;
    Object.defineProperty(document, "hidden", { get: () => hidden, configurable: true });

    pushSystemNotification("Run finished", { windowName: "scrapbook" });
    const hiddenShown = shown.length;
    hidden = false;
    pushSystemNotification("Another run finished", { windowName: "scrapbook" });
    const visibleShown = shown.length - hiddenShown;
    hidden = true;
    permission = "default";
    pushSystemNotification("Third run finished");

    // A reader who clicks the notification lands where it points.
    const opened = [];
    const realOpenWindow = openWindow;
    openWindow = function (name) { opened.push(name); return realOpenWindow.apply(this, arguments); };
    if (Notification.last?.onclick) Notification.last.onclick();
    openWindow = realOpenWindow;
    return { hiddenShown, visibleShown, asked: asked.length, shown, opened };
  })()
`);

test.assert(outcome.hiddenShown === 1, "a notification pushed while the tab is hidden reaches the reader");
test.assert(outcome.visibleShown === 0, "a notification pushed with the desk on screen stays with its own Notification Center");
test.assert(outcome.asked === 1 && outcome.shown.length === 1, "the first use asks for permission instead of showing nothing, and does not show twice");
test.assert(outcome.opened.includes("scrapbook"),
  "a click on the notification opens what it named, the way the shell's own notification click does");

test.finish();
