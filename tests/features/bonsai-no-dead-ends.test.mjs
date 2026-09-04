// Bonsai City has no dead ends: every menu item the shell registers and every
// rail tool it draws leads somewhere real. This is the machine form of the
// owner's 「无死角」 acceptance. Three layers, each proving what it can:
//   1. VM run — the shell boots in the app harness, founds a city, and every
//      menu command changes the DOM or the shell state when invoked.
//   2. Pure run — every rail tool's command is one the simulation core
//      understands (accepted, or refused for a rule, never for its shape).
//   3. Static — every translation key the shell, core, tools, and stories
//      reach for exists in both languages.

import vm from "node:vm";
import { webcrypto } from "node:crypto";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";
import { createAppBootVm } from "../helpers/app-boot-vm.mjs";

const test = createFeatureTest("bonsai-no-dead-ends");

// --- 1. VM run: the shell boots, founds a city, every menu command moves --------
const vmw = createAppBootVm();
const ctx = vmw.context;
const menuSets = {};
const registerMenuSet = ctx.window.AISystem6RegisterApplicationMenuSet;
ctx.window.AISystem6RegisterApplicationMenuSet = (appId, definitions) => {
  menuSets[appId] = definitions;
  return typeof registerMenuSet === "function" ? registerMenuSet(appId, definitions) : undefined;
};
await ctx.loadLazyWindowModule("bonsaiCity");
const shell = ctx.window.AISystem6BonsaiCity;
test.assert(!!shell && await shell.attach() === true, "the Bonsai City shell attaches inside the app harness");
const win = ctx.getWindow("bonsaiCity");
test.assert(!!win, "the attached shell owns a queryable bonsaiCity window");

function walkMenuItems(items, out = []) {
  for (const item of items || []) {
    if (item.type === "submenu") walkMenuItems(item.items, out);
    else if (item.type === "item" && typeof item.action === "string" && item.action.startsWith("bonsai-")) out.push(item);
  }
  return out;
}
const menuItems = walkMenuItems((menuSets.bonsaiCity || []).flatMap((menu) => menu.items || []));
test.assert(menuItems.length >= 40, `the Bonsai menu set registers its items (${menuItems.length})`);
const commands = ctx.window.AISystem6Runtime.c;
for (const item of menuItems) {
  test.assert(typeof commands.get(item.action)?.handler === "function", `menu item ${item.action} has a registered handler`);
}

// The harness has no pointer, so a modal would never close. Commands whose
// real flow asks first (send to Micropolis, delete) auto-accept here; the
// side effect that follows is what the dead-ends check must see.
ctx.showSystemModal = async (message, type = "confirm") => (type === "confirm" ? "yes" : "ok");

// Found a city through the real setup form, the way a player does.
const newCity = commands.get("bonsai-new-city");
newCity.handler();
const setupForm = win.querySelector(".bonsai-setup-form");
test.assert(!!setupForm, "New City shows the map setup form");
win.querySelector("[data-bonsai-map-seed]").value = "4242";
win.querySelector("[data-bonsai-map-size]").value = "64";
win.dispatchEvent({ type: "submit", target: setupForm, preventDefault() {} });
await vmw.waitFor(() => !!shell.debugState().currentCityId);
test.assert(!!shell.debugState().currentCityId, "submitting the setup form founds a city");

// A fingerprint of everything a command could visibly change: the shell's
// own state and the window's DOM tree (text, attributes, hidden, checked).
function domFingerprint(el) {
  if (!el || typeof el !== "object") return "";
  const attrs = el.attributes ? Object.entries(el.attributes).map(([k, v]) => `${k}=${v}`).sort().join("|") : "";
  const own = `<${el.tagName || "#"} ${attrs} h=${el.hidden ? 1 : 0} c=${el.checked ? 1 : 0} cls=${el.classList?.toString?.() || ""} v=${el.value ?? ""} t=${el.__text || ""}>`;
  return own + (el.children || []).map(domFingerprint).join("") + `</${el.tagName || "#"}>`;
}
const statusLine = () => win.querySelector("[data-bonsai-status-message]");
const fingerprint = async () => JSON.stringify(shell.debugState()) + domFingerprint(win) + await shell.checkpoint();

// A neutral start for each command: a fresh pane (so a second "open the same
// pane" command still has something to change) and a known speed/overlay.
const preconditions = {
  "bonsai-report": ["bonsai-budget"],
  "bonsai-speed-0": ["bonsai-speed-1"],
  "bonsai-overlay-none": ["bonsai-overlay-power"],
  "bonsai-sound-music": ["bonsai-sound-off"],
};
async function invoke(action) {
  const result = commands.get(action).handler();
  if (result && typeof result.then === "function") await result;
  await vmw.waitFor(() => false, { tries: 8 });
}
const dead = [];
for (const item of menuItems) {
  for (const pre of ["bonsai-report", ...(preconditions[item.action] || [])]) await invoke(pre);
  shell.setSpeed(item.action === "bonsai-speed-0" ? 1 : 0);
  // The harness has no IndexedDB, so save-shaped commands can only report
  // their outcome; a blanked status line makes that report count once.
  if (statusLine()) statusLine().textContent = "";
  const before = await fingerprint();
  try {
    await invoke(item.action);
  } catch (error) {
    dead.push(`${item.action} threw ${error?.message || error}`);
    continue;
  }
  if (await fingerprint() === before) dead.push(item.action);
}
shell.setSpeed(0);
test.assert(dead.length === 0, dead.length ? `menu items that change nothing when chosen: ${dead.join(", ")}` : `all ${menuItems.length} menu items change the DOM or the shell state when chosen`);

// Rail tools arm through the same click path the rail uses.
const shellSource = read("app/features/bonsai-city.js");
const toolIds = [...shellSource.matchAll(/\{ id: "([a-z-]+)", icon: "[^"]+"(?:, shortcut: "[^"]+")?, gesture: "(point|area|path|pan)"/g)].map((m) => ({ id: m[1], gesture: m[2] }));
test.assert(toolIds.length >= 40, `the rail declares its tools (${toolIds.length})`);
const unarmed = [];
for (const tool of toolIds) {
  const button = ctx.document.createElement("button");
  button.setAttribute("data-bonsai-tool", tool.id);
  win.dispatchEvent({ type: "click", target: button, preventDefault() {} });
  if (shell.debugState().tool !== tool.id) unarmed.push(tool.id);
}
test.assert(unarmed.length === 0, unarmed.length ? `rail tools that do not arm: ${unarmed.join(", ")}` : `all ${toolIds.length} rail tools arm through the rail click path`);

// --- 1b. 自动预算: January holds the clock unless auto-budget is on ----------
// The harness's timers are inert; capturing the loop's interval callback lets
// the test drive the real tick() across a year boundary.
{
  let tickFn = null;
  const originalSetInterval = ctx.setInterval;
  ctx.setInterval = (fn) => { tickFn = fn; return 4242; };
  const tickOf = () => shell.debugState().hashInputSummary.tick;
  const yearOf = () => Math.floor(tickOf() / 1500);
  // The menu walk above toggled auto-budget once; start from the default.
  if (shell.debugState().autoBudget) await invoke("bonsai-auto-budget");
  // The loop only runs while the window is on screen; open it for real.
  await commands.get("open-bonsai-city").handler();
  await vmw.waitFor(() => !win.classList.contains("is-hidden"));
  test.assert(!win.classList.contains("is-hidden"), "open-bonsai-city puts the window on screen");
  shell.setSpeed(4);
  test.assert(typeof tickFn === "function", "starting the simulation arms the frame loop");
  let year = yearOf();
  for (let frame = 0; frame < 2000 && yearOf() === year; frame += 1) tickFn();
  test.assert(yearOf() === year + 1 && shell.debugState().yearEndHold === true && shell.debugState().speed === 0, "with auto-budget off, the first January holds the clock");
  test.assert(!!win.querySelector("[data-bonsai-year-end-resume]") && !!win.querySelector("[data-bonsai-auto-budget]"), "the hold opens the budget pane with its resume and auto-budget controls");
  tickFn();
  test.assert(yearOf() === year + 1 && tickOf() === (year + 1) * 1500, "a held clock does not advance");
  await invoke("bonsai-auto-budget");
  test.assert(shell.debugState().autoBudget === true && shell.debugState().yearEndHold === false && shell.debugState().speed === 4, "turning auto-budget on releases the hold at the previous speed");
  year = yearOf();
  for (let frame = 0; frame < 2000 && yearOf() === year; frame += 1) tickFn();
  tickFn();
  test.assert(yearOf() === year + 1 && shell.debugState().yearEndHold === false && tickOf() > (year + 1) * 1500, "with auto-budget on, January rolls on with the previous budget lines");
  shell.setSpeed(0);
  await invoke("bonsai-auto-budget");
  ctx.setInterval = originalSetInterval;
}

// --- 2. Pure run: the core understands every rail tool's command ---------------
const pureContext = vm.createContext({ window: {}, crypto: webcrypto, TextEncoder });
vm.runInContext(read("app/features/bonsai-city-sim.js"), pureContext);
const sim = pureContext.window.AISystem6BonsaiSim;
const toolSpecs = [...shellSource.matchAll(/\{ id: "([a-z-]+)", icon: "[^"]+"(?:, shortcut: "[^"]+")?, gesture: "(point|area|path)", command: "([a-z-]+)"((?:, [a-z]+: "[a-z-]+")*)/g)]
  .map((m) => ({ id: m[1], gesture: m[2], command: m[3], params: Object.fromEntries([...m[4].matchAll(/([a-z]+): "([a-z-]+)"/g)].map((p) => [p[1], p[2]])) }));
test.assert(toolSpecs.length === toolIds.filter((tool) => tool.gesture !== "pan").length - 1, "every non-pan tool except query carries a core command");
const shapeRejects = new Set(["unknown-type", "payload", "not-founded", "target-tick", "stale", "schema"]);
const city = sim.createCity({ seed: 4242, size: 64, terrainPreset: "balanced" });
function dryFlatRect(state, width, height) {
  for (let y = 2; y < state.size - height - 2; y += 1) for (let x = 2; x < state.size - width - 2; x += 1) {
    const base = state.alt[y * state.size + x];
    let ok = true;
    for (let dy = 0; dy < height && ok; dy += 1) for (let dx = 0; dx < width; dx += 1) {
      const i = (y + dy) * state.size + x + dx;
      if (state.water[i] || state.alt[i] !== base || state.zone[i] || state.facilityAt[i] >= 0 || state.road[i]) { ok = false; break; }
    }
    if (ok) return { x, y };
  }
  throw new Error("no dry flat rectangle");
}
const misunderstood = [];
for (const tool of toolSpecs) {
  const spot = dryFlatRect(city, 4, 4);
  let payload;
  if (tool.command === "build-path") payload = { network: tool.params.network, start: spot, end: { x: spot.x + 3, y: spot.y } };
  else if (tool.command === "zone-area") payload = { zone: tool.params.zone, density: tool.params.density, x: spot.x, y: spot.y, width: 3, height: 3 };
  else if (tool.command === "place-facility") payload = { kind: tool.params.kind, x: spot.x, y: spot.y };
  else if (tool.command === "terraform-area") payload = { mode: tool.params.mode, x: spot.x, y: spot.y, width: 2, height: 2 };
  else if (tool.command === "demolish-area") payload = { x: spot.x, y: spot.y, width: 2, height: 2 };
  const receipt = sim.previewCommand(city, { schemaVersion: 2, type: tool.command, payload, targetTick: city.tick, clientCommandId: `probe-${tool.id}` });
  if (!receipt || (!receipt.accepted && shapeRejects.has(receipt.code))) misunderstood.push(`${tool.id}:${receipt?.code || "no-receipt"}`);
}
test.assert(misunderstood.length === 0, misunderstood.length ? `rail tools the core does not understand: ${misunderstood.join(", ")}` : `the core understands all ${toolSpecs.length} rail tool commands`);

// --- 3. Static: every reachable key exists in both languages ------------------
const en = ctx.window.AISystem6TranslationsEn;
const zh = ctx.window.AISystem6TranslationsZh;
const required = new Set([...shellSource.matchAll(/["'`](bonsai_[a-z0-9_]+)["'`]/g)].map((m) => m[1]));
const simSource = read("app/features/bonsai-city-sim.js");
for (const m of simSource.matchAll(/"(bonsai_[a-z0-9_]+)"/g)) required.add(m[1]);
for (const item of menuItems) required.add(item.labelKey);
for (const tool of toolIds) required.add(`bonsai_tool_${tool.id.replaceAll("-", "_")}`);
for (const key of sim.NEWS_STORY_KEYS) required.add(`bonsai_news_${key}`);
for (const id of sim.ORDINANCE_IDS) required.add(`bonsai_ordinance_${id}`);
for (const service of sim.FUNDING_SERVICES) required.add(`bonsai_funding_${service}`);
for (const kind of Object.keys(sim.DISASTER_KINDS)) required.add(`bonsai_tool_disaster_${kind.replaceAll("-", "_")}`);
const missing = [...required].filter((key) => !Object.prototype.hasOwnProperty.call(en, key) || !Object.prototype.hasOwnProperty.call(zh, key)).sort();
test.assert(missing.length === 0, missing.length ? `keys missing in a language: ${missing.join(", ")}` : `all ${required.size} reachable bonsai_* keys exist in English and Chinese`);
const enKeys = Object.keys(en).filter((key) => key.startsWith("bonsai_")).sort();
const zhKeys = Object.keys(zh).filter((key) => key.startsWith("bonsai_")).sort();
test.assert(JSON.stringify(enKeys) === JSON.stringify(zhKeys), "the bonsai_* key sets of both languages are identical");

test.finish();
