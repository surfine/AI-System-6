// A completion notice is the one moment the writer wants a notification, and
// it is also the moment the system's authorization question has to be asked:
// UNUserNotificationCenter silently drops a post the app was never authorized
// for, and the product asked for nothing else. The shell's notify handler is
// run here as source, the way the storage-health contract runs the selection
// handler, so the order (ask, then post) is a real assertion and not a reading
// of the file.

import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("tinyjs-notify-permission");
const backendSource = read("platform/macos/tinyjs/src/main.js");
const notifySource = backendSource
  .slice(backendSource.indexOf('"shell.notify": async '), backendSource.indexOf('"shell.checkUpdate": '))
  .trim()
  .replace(/,$/, "");

function notifyHandler({ state = "undetermined" } = {}) {
  const order = [];
  const posts = [];
  let current = state;
  const context = vm.createContext({
    crypto: webcrypto,
    host: {
      permissions: {
        check: async (name) => { order.push("check:" + name); return current; },
        request: async (name) => { order.push("request:" + name); current = "granted"; return "granted"; },
      },
      notify: async (payload) => { order.push("post"); posts.push(payload); },
    },
  });
  const handler = vm.runInContext("({" + notifySource + "})['shell.notify']", context);
  return { handler, order, posts };
}

// The first notice asks, then posts.
{
  const { handler, order, posts } = notifyHandler({ state: "undetermined" });
  assert.equal(await handler({ id: "task-1", title: "AI System 6" }), true);
  assert.deepEqual(order.filter((entry) => entry !== "check:notifications"), ["request:notifications", "post"]);
  assert.equal(posts.length, 1);
  assert.equal(posts[0].id, "task-1");
  test.assert(true, "an undetermined notification permission is asked for before the notice is posted");
}

// Already granted: post, never ask again.
{
  const { handler, order, posts } = notifyHandler({ state: "granted" });
  await handler({ id: "task-2" });
  assert.deepEqual(order.filter((entry) => entry.startsWith("request")), []);
  assert.equal(posts.length, 1);
  test.assert(true, "a granted permission posts without asking again");
}

// Denied: the app does not nag, and the post still goes out (the system is the one that drops it).
{
  const { handler, order, posts } = notifyHandler({ state: "denied" });
  await handler({ id: "task-3" });
  assert.deepEqual(order.filter((entry) => entry.startsWith("request")), []);
  assert.equal(posts.length, 1);
  test.assert(true, "a denied permission is not re-asked on every notice");
}

// The click target stays validated before anything is asked or posted.
{
  const { handler, order, posts } = notifyHandler({ state: "granted" });
  await assert.rejects(handler({ id: "bad id!" }), /Invalid notification target/);
  assert.equal(order.length, 0);
  assert.equal(posts.length, 0);
  test.assert(true, "an invalid notification target is refused before any permission or post work");
}

test.finish();
