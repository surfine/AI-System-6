// ClioWorks S11 M1 contract (lane D): the comments windoid. Behaviour only, over a stub
// adapter: the three-band docking rule at its boundary values, add and reply going
// through the adapter, comments that have no anchor kept in their own group, one
// windoid per host window, and close. A real DOM (linkedom) stands in for the browser.
import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("clioworks-s11-m1-comments");

let parseHTML;
try {
  ({ parseHTML } = await import("linkedom"));
} catch {
  test.fail("linkedom is needed to run the windoid against a real DOM");
  test.finish();
}

const { window, document } = parseHTML("<!doctype html><html><body><div id='a'></div><div id='b'></div></body></html>");
window.t = (key, ...args) => `${key}${args.length ? `(${args.join(",")})` : ""}`;
const sandbox = vm.createContext({ window, document, queueMicrotask, console });
vm.runInContext(read("apps/desktop/app/features/clio-chart-comments.js"), sandbox, { filename: "clio-chart-comments.js" });
const Comments = window.AISystem6ClioChartComments;
test.assert(!!Comments && typeof Comments.open === "function", "the comments windoid is published as AISystem6ClioChartComments.open");

// 1. Docking rule, both sides of every boundary.
const place = Comments.windoidPlacement;
test.assert(place(1040, 600) === "float-right", "1040 wide floats right");
test.assert(place(1039, 600) === "dock-below", "1039 wide docks below");
test.assert(place(640, 600) === "dock-below", "640 wide still docks below");
test.assert(place(639, 600) === "swap", "639 wide swaps with the main area");
test.assert(place(900, 200) === "dock-below", "a main area of exactly 200px keeps the dock");
test.assert(place(900, 199) === "swap", "a main area under 200px swaps instead of crushing it");
test.assert(place(2000, 50) === "float-right", "a wide window floats whatever its height");

// 2. A stub adapter that behaves like the narrow comments surface.
function stubAdapter(seed) {
  const rows = seed.slice();
  let next = 100;
  const calls = [];
  return {
    calls,
    comments: () => rows.map((row) => ({ ...row })),
    addComment(sheet, ref, data) { calls.push(["add", sheet, ref, data.text]); rows.push({ id: ++next, ref, author: data.author, text: data.text, date: data.date, done: false, parentId: null }); return { id: next }; },
    replyComment(sheet, rootId, data) { calls.push(["reply", sheet, rootId, data.text]); const root = rows.find((r) => r.id === rootId); rows.push({ id: ++next, ref: root.ref, author: data.author, text: data.text, date: data.date, done: false, parentId: rootId }); return { id: next }; },
  };
}
const seed = [
  { id: 1, ref: "B2", author: "Lin", text: "总数对不上", date: "2026-10-01", done: false, parentId: null },
  { id: 2, ref: "B2", author: "Wu", text: "已改", date: "2026-10-02", done: false, parentId: 1 },
  { id: 3, ref: "", author: "Chen", text: "这条的格子没了", date: "2026-09-30", done: true, parentId: null },
];
const hostA = document.getElementById("a");
const hostB = document.getElementById("b");
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const click = (node) => node.dispatchEvent(new window.Event("click", { bubbles: true }));
const type = (field, text) => { field.value = text; field.dispatchEvent(new window.Event("input", { bubbles: true })); };

const changes = [];
let closed = 0;
const adapter = stubAdapter(seed);
const handle = Comments.open({ host: hostA, adapter, sheet: "Sheet1", ref: "C3", onChange: (c) => changes.push(c.kind), onClose: () => { closed += 1; } });

const root = () => hostA.querySelector(".windoid");
test.assert(!!root() && root().querySelector(".windoid-close"), "the windoid opens with a close box");
test.assert(!root().querySelector(".windoid-title button, .windoid-titlebar button + button"), "the title bar carries the close box and nothing else");
test.assert(root().querySelectorAll(".windoid-body > .windoid-threads .windoid-thread").length === 1, "one anchored thread is listed");
test.assert(root().querySelectorAll(".windoid-orphans .windoid-thread").length === 1, "a comment with no anchor sits in the 找不到落点 group, not dropped");
test.assert(root().querySelector(".windoid-thread").textContent.includes("已改"), "the reply is shown under its root");
test.assert(root().querySelector(".windoid-orphans .windoid-done"), "a resolved comment says so in words");

// 3. Add: anchored to the selected cell, goes through the adapter, listed afterwards.
const addButton = root().querySelector(".windoid-composer .btn");
test.assert(addButton.disabled === true, "adding with no text is not offered");
type(root().querySelector(".windoid-composer textarea"), "这格要核对");
test.assert(root().querySelector(".windoid-composer .btn").disabled === false, "text enables the add button");
click(root().querySelector(".windoid-composer .btn"));
await flush();
test.assert(adapter.calls.some((c) => c[0] === "add" && c[2] === "C3" && c[3] === "这格要核对"), "add goes to the adapter on the selected cell");
test.assert(changes.join() === "add", "onChange reports the add");
test.assert(root().textContent.includes("这格要核对"), "the new comment is listed after the write");

// 4. Reply to a thread.
click(root().querySelector(".windoid-thread .windoid-reply"));
const replyField = root().querySelector(".windoid-thread textarea");
test.assert(!!replyField, "reply opens a field inside that thread");
type(replyField, "我来看");
click(root().querySelector(".windoid-thread .btn.default"));
await flush();
test.assert(adapter.calls.some((c) => c[0] === "reply" && c[2] === 1 && c[3] === "我来看"), "reply goes to the adapter with the root id");
test.assert(changes.join() === "add,reply", "onChange reports the reply");

// 5. A refused reply is shown, not swallowed.
adapter.replyComment = () => ({ status: "blocked", code: "LEGACY_NO_REPLY" });
click(root().querySelector(".windoid-thread .windoid-reply"));
type(root().querySelector(".windoid-thread textarea"), "再回一句");
click(root().querySelector(".windoid-thread .btn.default"));
await flush();
test.assert(root().querySelector(".windoid-note[role='alert']")?.textContent.includes("clio_comments_reply_blocked"), "a blocked reply tells the writer why");
test.assert(changes.join() === "add,reply", "a blocked reply is not reported as a change");

// 5b. A reply to a comment that no longer exists comes back "failed": shown, draft kept, not a change.
adapter.replyComment = () => ({ status: "failed", code: "NO_SUCH_COMMENT" });
type(root().querySelector(".windoid-thread textarea"), "回给已删除的");
click(root().querySelector(".windoid-thread .btn.default"));
await flush();
test.assert(root().querySelector(".windoid-note[role='alert']")?.textContent.includes("clio_comments_failed"), "a failed reply is shown as an error");
test.assert(changes.join() === "add,reply", "a failed reply is not reported as a change");
test.assert(root().querySelector(".windoid-thread textarea")?.value === "回给已删除的", "a failed reply keeps the writer's text in the field");

click(root().querySelector(".windoid-thread .btn:not(.default)"));
// 6. refresh() moves the anchor and re-reads.
handle.refresh({ ref: "D4" });
test.assert(root().querySelector(".windoid-composer textarea").getAttribute("placeholder").includes("D4"), "refresh re-anchors the composer to the new selection");
handle.refresh({ ref: "" });
test.assert(root().querySelector(".windoid-composer .btn").disabled === true, "with no selected cell nothing can be added");

// 6b. A legacy (threaded:false) root cannot take a reply, so it offers no reply button (S11-C1);
// a root that says nothing about it, or threaded:true, still does.
{
  const legacyHost = document.createElement("div");
  document.body.appendChild(legacyHost);
  const legacy = Comments.open({ host: legacyHost, sheet: "Sheet1", ref: "A1", adapter: stubAdapter([
    { id: 1, ref: "B2", author: "Old", text: "旧批注", date: "2026-10-01", done: false, parentId: null, threaded: false },
    { id: 2, ref: "B3", author: "New", text: "新批注", date: "2026-10-01", done: false, parentId: null, threaded: true },
    { id: 3, ref: "B4", author: "Any", text: "没标", date: "2026-10-01", done: false, parentId: null },
    { id: 4, ref: "", author: "Gone", text: "没落点的旧批注", date: "2026-10-01", done: false, parentId: null, threaded: false },
  ]) });
  const threadOf = (id) => legacyHost.querySelector(`.windoid-thread[data-comment-id="${id}"]`);
  test.assert(!threadOf(1).querySelector(".windoid-reply"), "a legacy comment offers no reply button");
  test.assert(!!threadOf(2).querySelector(".windoid-reply") && !!threadOf(3).querySelector(".windoid-reply"), "threaded comments keep their reply button");
  test.assert(!threadOf(4).querySelector(".windoid-reply"), "an unanchored legacy comment offers no reply button either");
  legacy.close();
}

// 6c. refresh({ sheet, ref }) moves both the placeholder and the write target.
{
  const moveHost = document.createElement("div");
  document.body.appendChild(moveHost);
  const moveAdapter = stubAdapter([]);
  const moved = Comments.open({ host: moveHost, sheet: "Sheet1", ref: "B4", adapter: moveAdapter });
  moved.refresh({ sheet: "Sheet2", ref: "E5" });
  const field = moveHost.querySelector(".windoid-composer textarea");
  test.assert(field.getAttribute("placeholder").includes("E5"), "refresh with a new ref updates the placeholder");
  type(field, "换格后写");
  click(moveHost.querySelector(".windoid-composer .btn"));
  await flush();
  test.assert(moveAdapter.calls.some((c) => c[0] === "add" && c[1] === "Sheet2" && c[2] === "E5"), "the next write lands on the new sheet and cell");
  moved.close();
}

// 6d. The windoid never covers the status and input bars: the host's main area (.cwk-body)
// gives the top edge, handed to the stylesheet as --windoid-main-top.
{
  const placeHost = document.createElement("div");
  const body = document.createElement("div");
  body.className = "cwk-body";
  Object.defineProperty(body, "offsetTop", { value: 62, configurable: true });
  placeHost.appendChild(body);
  document.body.appendChild(placeHost);
  const placed = Comments.open({ host: placeHost, sheet: "S", ref: "A1", adapter: stubAdapter([]) });
  const pop = placeHost.querySelector(".windoid");
  test.assert(pop.style.getPropertyValue("--windoid-main-top") === "62px", "the windoid learns where the main area starts");
  Object.defineProperty(body, "offsetTop", { value: 80, configurable: true });
  placed.refresh();
  test.assert(pop.style.getPropertyValue("--windoid-main-top") === "80px", "a taller status bar moves the top edge on the next placement");
  placed.close();
}

// 7. One at a time per host; another host gets its own.
const second = Comments.open({ host: hostA, adapter: stubAdapter([]), sheet: "Sheet1", ref: "A1", onClose: () => { closed += 1; } });
test.assert(hostA.querySelectorAll(".windoid").length === 1, "a second open on the same window replaces the first");
test.assert(closed === 1, "the replaced windoid reports its close");
const other = Comments.open({ host: hostB, adapter: stubAdapter([]), sheet: "Sheet2", ref: "A1" });
test.assert(hostB.querySelectorAll(".windoid").length === 1 && hostA.querySelectorAll(".windoid").length === 1, "a different window keeps its own windoid");

// 8. Close removes it and calls back once; closing twice is harmless.
second.close();
second.close();
test.assert(hostA.querySelectorAll(".windoid").length === 0 && closed === 2, "close removes the windoid and reports once");
click(hostB.querySelector(".windoid-close"));
test.assert(hostB.querySelectorAll(".windoid").length === 0, "the close box closes it");
other.close();

// 9. An adapter without the comments surface degrades to a message.
const bare = Comments.open({ host: hostA, adapter: {}, sheet: "S", ref: "A1" });
test.assert(hostA.querySelector(".windoid-empty")?.textContent.includes("clio_comments_unavailable"), "a missing comments surface reads as unavailable, not a crash");
bare.close();

// 10. Source rules: no product name on screen, no hard-coded colours in the stylesheet.
const css = read("apps/desktop/styles/84-windoid.css");
const js = read("apps/desktop/app/features/clio-chart-comments.js");
test.assert(!/#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(css), "the windoid stylesheet writes no colours of its own");
const rule = (selector) => (css.match(new RegExp(`${selector.replace(/[.\[\]"=-]/g, "\\$&")}\\s*\\{([^}]*)\\}`)) || [])[1] || "";
test.assert(/--windoid-main-top/.test(rule('.windoid[data-windoid-placement="float-right"]')), "the floating windoid sits below the status and input bars");
test.assert(/--windoid-main-top/.test(rule('.windoid[data-windoid-placement="swap"]')) && !/inset:\s*0\s*;/.test(rule('.windoid[data-windoid-placement="swap"]')), "a swapped windoid replaces the grid area only, leaving the status bar");
test.assert(/--system-titlebar-active-bg/.test(rule(".windoid-titlebar")) && /--titlebar-border/.test(rule(".windoid-titlebar")), "the title bar is dressed by the appearance's own title bar tokens");
test.assert(/--glass-reading-surface/.test(rule(".windoid-body")), "the body is an opaque reading surface under Liquid Glass");
test.assert(/--window-shadow/.test(rule(".windoid")), "the frame takes the appearance's window shadow");
test.assert(!/z-index|!important/.test(css), "the windoid stylesheet adds no z-index and no !important");
test.assert(!/ClioWorks/.test(js.replace(/\/\/.*$/gm, "")), "the window never says ClioWorks");

// 11. Windoid buttons are the desk's own .btn (Q-M2-2); the stylesheet styles none of its own.
test.assert(!/windoid-button/.test(css) && !/windoid-button/.test(js), "no private windoid button style or class remains");
for (const other of ["apps/desktop/app/features/clio-stage-native.js", "apps/desktop/app/features/clio-write.js"]) {
  test.assert(!/windoid-button/.test(read(other)), `${other.split("/").pop()} builds its windoid buttons as .btn too`);
}
{
  const probe = Comments.open({ host: hostA, adapter: stubAdapter(seed), sheet: "Sheet1", ref: "C3" });
  await flush();
  const buttons = [...hostA.querySelectorAll(".windoid-body button")];
  test.assert(buttons.length > 0 && buttons.every((b) => b.classList.contains("btn")), "Add comment and Reply render as .btn");
  const add = hostA.querySelector(".windoid-composer .btn.default");
  test.assert(!!add && add.disabled === true, "the default action is .btn.default and uses the disabled attribute while empty");
  probe.close();
}
// D11: on touch the close box keeps its 11px art and gets a 44x36 hit area that the windoid's clip does not cut.
test.assert(/--windoid-close-size:\s*11px/.test(css), "the close box stays 11px");
test.assert(/@media \(hover: none\) and \(pointer: coarse\)\s*\{[^@]*\.windoid-close::before\s*\{\s*inset:\s*-3px -27px -22px -6px/.test(css), "coarse pointers get a close hit area that stays inside the windoid");
test.assert(/@media \(hover: none\) and \(pointer: coarse\)\s*\{[^@]*\.windoid \.btn\s*\{\s*min-block-size:\s*44px/.test(css), "coarse pointers give windoid buttons a 44px touch height");
test.assert(!/^\s*\.windoid \.btn\s*\{/m.test(css.split("@media")[0]), "the fine-pointer look of windoid buttons is untouched");

test.finish();
