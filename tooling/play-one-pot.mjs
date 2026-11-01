#!/usr/bin/env node
// play-one-pot.mjs — the real-desk recording instrument for the Basin plan
// (internal/plans/BASIN-WORLD.zh-CN.md, lane T and section D).
//
// It plays AI System 6 the way a person does: a real Chromium, real pointer
// and keyboard input through CDP Input.dispatchMouseEvent/dispatchKeyEvent,
// and a screen recording through CDP Page.startScreencast assembled into a
// constant-30-fps H.264 file. Page JavaScript is used only to READ: element
// rectangles to aim at, on-screen text, and the games' read-only instrument
// hooks (AISystem6BonsaiCity.debugState/checkpoint, AISystem6Joyride.debugState/
// streetEvents, AISystem6Rootline.inspect/stationScreen). Nothing the player
// does is done by script.
//
// The one exception is the profile fixture, written BEFORE the desk boots and
// never afterwards: a same-origin blank document (served by a Playwright
// route, so no app code runs) opens the app's IndexedDB "ai-system-6-db" at
// version 1 with only its "keyval" store and puts the settings record the
// desk itself reads at boot (persistence-status.js applySettings):
//   { clioOnboardingCompleted: true, guideSeen: true, language: "zh",
//     workspaceProfile: "desktop", theme: <scenario theme> }
// The app then opens the database at its own version (config.js, v5) and its
// own upgrade handler (project-disk.js openAppDb) creates every other store,
// because each createObjectStore there is guarded by objectStoreNames.contains.
// A fresh desk creates and mounts one Project Hard Disk on its own
// (project-disk.js ensureActiveProject), so no project record is seeded; the
// boot step asserts that a disk is mounted. "desktop" is chosen over the
// source default "writing" because the games are peers there and no writing
// route window competes for the screen; MultiFinder stays at its default
// (off), i.e. single-task Finder, as section D requires.
//
// Usage:
//   PORT=4198 node apps/server/server.js &          # or pass --serve
//   node tooling/play-one-pot.mjs [--scenario=today|basin] [--steps=1-4,7]
//        [--run=<name>] [--url=http://localhost:4198/] [--serve]
//        [--theme=system-7] [--headed] [--no-video] [--keep-frames]
//        [--keep-open] [--debug-port=9334] [--list]
// Steps are one continuous session: --steps runs only the chosen ones and a
// step still needs the state the earlier ones leave (so --steps=1-6 works,
// --steps=6 alone does not). --keep-open with --debug-port leaves the desk
// for inspection; Ctrl-C closes it.
// Output: dist/verification/one-pot/<run>/{steps.json, step-NN.png,
//   recording.mp4, console.log}; profile in dist/verification/one-pot/profile-<run>.
//   step-NN.png are viewport screenshots (1600×1000); Chrome's screencast
//   delivers CSS-pixel frames, so recording.mp4 is 1600×1000. Screencast only
//   sends a frame when the screen changes; steps.json gives each step's
//   screencast rate and its offset in the video (step.screencast.videoAt).
// --serve starts apps/server/server.js from this worktree on PORT (default
// 4198) and refuses to record anything else: the port must be free first,
// the child must print its "server running at" line before the page is
// fetched, and the served app.bundle.js must be byte-identical to this
// worktree's. steps.json "server" records pid, the page's ?v=<build> stamp,
// /api/version and both bundle hashes (without --serve the mismatch is only
// reported). The server and the browser are stopped on every exit path.
// Exit status 0 when every hard assertion holds, 1 on a failed assertion or
// a step error, 2 on a usage or environment error (no ffmpeg/ffprobe with
// video on, port taken, server exited or serves another build, browser
// would not start; steps.json result "error"). step.expect() is a hard
// assertion; step.observe() records a plan gap without failing the run.

import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT_ROOT = join(ROOT, "dist", "verification", "one-pot");
const VIEWPORT = { width: 1600, height: 1000 };
const SCALE = 1;
const FPS = 30;

// ---------------------------------------------------------------- arguments
function parseArgs(argv) {
  const args = { scenario: "today", steps: null, run: "", url: "", serve: false, theme: "", headed: false, video: true, keepFrames: false, keepOpen: false, debugPort: 0, list: false };
  for (const raw of argv) {
    const [key, ...rest] = raw.replace(/^--/, "").split("=");
    const value = rest.join("=");
    switch (key) {
      case "scenario": args.scenario = value; break;
      case "steps": args.steps = parseSteps(value); break;
      case "run": args.run = value.replace(/[^\w.-]+/g, "-"); break;
      case "url": args.url = value; break;
      case "serve": args.serve = true; break;
      case "theme": args.theme = value; break;
      case "headed": args.headed = true; break;
      case "no-video": args.video = false; break;
      case "keep-frames": args.keepFrames = true; break;
      case "keep-open": args.keepOpen = true; break;
      case "debug-port": args.debugPort = Number(value) || 9334; break;
      case "list": args.list = true; break;
      case "help": case "h": args.help = true; break;
      default: throw new Error(`unknown option ${raw}`);
    }
  }
  return args;
}

function parseSteps(value) {
  const set = new Set();
  for (const part of String(value).split(",").map((s) => s.trim()).filter(Boolean)) {
    const m = part.match(/^(\d+)(?:-(\d+))?$/);
    if (!m) throw new Error(`bad --steps part "${part}"`);
    const a = Number(m[1]); const b = m[2] ? Number(m[2]) : a;
    for (let i = Math.min(a, b); i <= Math.max(a, b); i += 1) set.add(i);
  }
  return set;
}

const stamp = () => new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const pad = (n) => String(n).padStart(2, "0");

// --------------------------------------------------------------- in-page code
// Runs in the page, READ-ONLY: find the element a player would aim at and
// return its rectangle. Matching is on what is on screen (innerText,
// aria-label, title), with "…"/"..." treated alike.
function locateInPage(spec) {
  const norm = (s) => String(s ?? "").replace(/ /g, " ").replace(/\s+/g, " ").replace(/\.{3}|…+/g, "…").trim();
  const want = norm(spec.text);
  const isVisible = (el) => {
    if (!el || !el.isConnected) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    if (r.right <= 0 || r.bottom <= 0 || r.left >= innerWidth || r.top >= innerHeight) return false;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      if (n.hidden) return false;
      const cs = getComputedStyle(n);
      if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) return false;
    }
    return true;
  };
  const roots = spec.within ? [...document.querySelectorAll(spec.within)].filter(isVisible) : [document.body];
  if (!roots.length) return { error: `no visible container ${spec.within}` };
  const score = (el) => {
    const texts = [norm(el.innerText), norm(el.getAttribute?.("aria-label")), norm(el.getAttribute?.("title"))];
    if (texts.some((t) => t === want)) return 3;
    if (spec.match === "prefix" && texts.some((t) => t && t.startsWith(want))) return 2;
    if (spec.match === "includes" && texts.some((t) => t && t.includes(want))) return 1;
    return 0;
  };
  const hits = [];
  for (const root of roots) {
    for (const el of root.querySelectorAll(spec.selector || "*")) {
      const cheap = `${el.textContent || ""} ${el.getAttribute("aria-label") || ""} ${el.getAttribute("title") || ""}`;
      if (!norm(cheap).includes(want)) continue;
      const s = score(el);
      if (s) hits.push({ el, s, root });
    }
  }
  // Deepest match wins: drop an element whose descendant matched as well.
  const deep = hits.filter((h) => !hits.some((o) => o !== h && h.el.contains(o.el) && o.s >= h.s));
  const clickable = "button, [role=button], [role=menuitem], [role=radio], [role=tab], [role=option], a[href], summary, label, input, select";
  const seen = new Set();
  const cands = [];
  for (const h of deep) {
    let target = spec.icon
      // An icon is an icon: a window title that happens to read the same
      // (the Games window is titled 「游戏」) is not a target.
      ? h.el.closest(".desktop-icon, .finder-item, [data-finder-item], [data-app-id]")
      : (h.el.closest(clickable) || h.el);
    if (!target) continue;
    if (!h.root.contains(target) && h.root !== document.body) target = h.el;
    if (seen.has(target) || !isVisible(target)) continue;
    seen.add(target);
    let aim = target;
    if (spec.icon) {
      const glyph = [...target.querySelectorAll(".sys-icon, .finder-item-icon, img, svg, canvas")].find(isVisible);
      if (glyph) aim = glyph;
    }
    const r = aim.getBoundingClientRect();
    const x = r.left + r.width / 2; const y = r.top + r.height / 2;
    const top = document.elementFromPoint(x, y);
    const hit = Boolean(top && (top === aim || aim.contains(top) || target.contains(top)));
    const win = target.closest(".window");
    const rank = (hit ? 100 : 0) + h.s * 10 + (win?.classList.contains("is-active") ? 5 : win ? 0 : 3);
    const tr = target.getBoundingClientRect();
    cands.push({ x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, rect: [tr.left, tr.top, tr.width, tr.height].map(Math.round), area: tr.width * tr.height, hit, rank, tag: target.tagName.toLowerCase(), cls: String(target.className || "").slice(0, 60), text: norm(target.innerText).slice(0, 60), window: win?.dataset.window || "", covering: hit ? "" : (top ? `${top.tagName.toLowerCase()}.${String(top.className || "").slice(0, 40)}` : "") });
  }
  cands.sort((a, b) => b.rank - a.rank || a.area - b.area);
  if (!cands.length) return { error: `no visible element shows "${spec.text}"${spec.within ? ` inside ${spec.within}` : ""}` };
  return { best: cands[0], count: cands.length, others: cands.slice(1, 4) };
}

// ------------------------------------------------------------------ the desk
const KEY_TABLE = {
  ArrowUp: { code: "ArrowUp", keyCode: 38 }, ArrowDown: { code: "ArrowDown", keyCode: 40 },
  ArrowLeft: { code: "ArrowLeft", keyCode: 37 }, ArrowRight: { code: "ArrowRight", keyCode: 39 },
  Escape: { code: "Escape", keyCode: 27 }, Enter: { code: "Enter", keyCode: 13, text: "\r" },
  Tab: { code: "Tab", keyCode: 9 }, Backspace: { code: "Backspace", keyCode: 8 },
  " ": { code: "Space", keyCode: 32, text: " " }, Space: { key: " ", code: "Space", keyCode: 32, text: " " },
};
function keyInfo(key) {
  if (KEY_TABLE[key]) return { key: KEY_TABLE[key].key || key, ...KEY_TABLE[key] };
  if (/^[a-z]$/i.test(key)) return { key, code: `Key${key.toUpperCase()}`, keyCode: key.toUpperCase().charCodeAt(0), text: key };
  if (/^\d$/.test(key)) return { key, code: `Digit${key}`, keyCode: key.charCodeAt(0), text: key };
  throw new Error(`no key mapping for "${key}"`);
}

class Desk {
  constructor(page, cdp, recorder) {
    this.page = page; this.cdp = cdp; this.recorder = recorder;
    this.mouse = { x: VIEWPORT.width / 2, y: VIEWPORT.height / 2, buttons: 0 };
    this.held = new Set();
    this.step = null;
  }

  act(kind, detail = {}) {
    const entry = { t: Date.now(), kind, ...detail };
    this.step?.actions.push(entry);
    return entry;
  }

  // ---- read-only evidence
  read(fn, arg) { return this.page.evaluate(fn, arg); }

  async waitFor(label, fn, arg, { timeout = 15000, interval = 100 } = {}) {
    const t0 = Date.now();
    try {
      const handle = await this.page.waitForFunction(fn, arg, { timeout, polling: interval });
      const value = await handle.jsonValue().catch(() => true);
      await handle.dispose().catch(() => {});
      this.act("wait", { label, ms: Date.now() - t0 });
      return value;
    } catch (error) {
      this.act("wait-timeout", { label, ms: Date.now() - t0 });
      throw new Error(`timed out after ${timeout} ms waiting for ${label}`);
    }
  }

  async locate(spec, { timeout = 8000 } = {}) {
    const t0 = Date.now();
    let last;
    while (Date.now() - t0 <= timeout) {
      last = await this.page.evaluate(locateInPage, spec);
      if (last.best && last.best.hit) return last.best;
      await sleep(120);
    }
    if (last?.best) throw new Error(`"${spec.text}" is covered by ${last.best.covering || "something"} at (${last.best.x}, ${last.best.y})`);
    throw new Error(last?.error || `cannot find "${spec.text}"`);
  }

  // ---- raw input (CDP)
  async mouseMove(x, y, { steps = 1, stepMs = 12 } = {}) {
    const from = { ...this.mouse };
    for (let i = 1; i <= steps; i += 1) {
      const px = from.x + (x - from.x) * (i / steps);
      const py = from.y + (y - from.y) * (i / steps);
      await this.cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: px, y: py, button: this.mouse.buttons ? "left" : "none", buttons: this.mouse.buttons });
      this.mouse.x = px; this.mouse.y = py;
      if (steps > 1) await sleep(stepMs);
    }
  }

  async mouseDown(clickCount = 1) {
    this.mouse.buttons = 1;
    await this.cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: this.mouse.x, y: this.mouse.y, button: "left", buttons: 1, clickCount });
  }

  async mouseUp(clickCount = 1) {
    this.mouse.buttons = 0;
    await this.cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: this.mouse.x, y: this.mouse.y, button: "left", buttons: 0, clickCount });
  }

  // Aim like a hand does: move to the target, look again, and correct if the
  // layout moved under the pointer before pressing (Bonsai's gauge is one
  // flowing row whose "saved N s ago" label shifts the speed buttons; the
  // first draft pressed 「慢」 while aiming at 「正常」). Every correction is
  // logged as a "re-aim" action: a layout that moves under a player's pointer
  // is itself a finding.
  async aim(spec, { timeout = 8000 } = {}) {
    let best = await this.locate(spec, { timeout });
    await this.mouseMove(best.x, best.y, { steps: 8 });
    for (let i = 0; i < 5; i += 1) {
      await sleep(80);
      const again = await this.locate(spec, { timeout: 3000 });
      if (Math.hypot(again.x - this.mouse.x, again.y - this.mouse.y) <= 1.5) return again;
      this.act("re-aim", { label: spec.text, from: [Math.round(this.mouse.x), Math.round(this.mouse.y)], to: [Math.round(again.x), Math.round(again.y)] });
      await this.mouseMove(again.x, again.y, { steps: 3 });
      best = again;
    }
    return best;
  }

  async click(x, y, { label = "", count = 1 } = {}) {
    if (Math.hypot(x - this.mouse.x, y - this.mouse.y) > 0.5) await this.mouseMove(x, y, { steps: 8 });
    await sleep(40);
    for (let c = 1; c <= count; c += 1) {
      await this.mouseDown(c);
      await sleep(45);
      await this.mouseUp(c);
      if (c < count) await sleep(90);
    }
    this.act(count === 2 ? "double-click" : "click", { label, x: Math.round(x), y: Math.round(y) });
  }

  doubleClick(x, y, opts = {}) { return this.click(x, y, { ...opts, count: 2 }); }

  // Press, travel through every point, release. `points` are [x, y] or a
  // function returning [x, y] (re-aimed right before that leg starts).
  async drag(from, ...rest) {
    const opts = rest.length && !Array.isArray(rest.at(-1)) && typeof rest.at(-1) !== "function" ? rest.pop() : {};
    const { steps = 18, stepMs = 16, holdMs = 90, label = "" } = opts;
    const resolve = async (p) => (typeof p === "function" ? p() : p);
    const start = await resolve(from);
    await this.mouseMove(start[0], start[1], { steps: 6 });
    await sleep(60);
    await this.mouseDown();
    await sleep(holdMs);
    const path = [start.map(Math.round)];
    for (const p of rest) {
      const to = await resolve(p);
      await this.mouseMove(to[0], to[1], { steps, stepMs });
      path.push(to.map(Math.round));
      await sleep(holdMs);
    }
    await this.mouseUp();
    this.act("drag", { label, path });
    return path;
  }

  async keyDown(key, { autoRepeat = false } = {}) {
    const k = keyInfo(key);
    await this.cdp.send("Input.dispatchKeyEvent", { type: k.text ? "keyDown" : "rawKeyDown", key: k.key, code: k.code, windowsVirtualKeyCode: k.keyCode, nativeVirtualKeyCode: k.keyCode, text: k.text, unmodifiedText: k.text, autoRepeat });
    if (!autoRepeat) this.held.add(key);
  }

  async keyUp(key) {
    const k = keyInfo(key);
    await this.cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: k.key, code: k.code, windowsVirtualKeyCode: k.keyCode, nativeVirtualKeyCode: k.keyCode });
    this.held.delete(key);
  }

  async pressKey(key, { label = "" } = {}) {
    await this.keyDown(key);
    await sleep(60);
    await this.keyUp(key);
    this.act("key", { key, label });
  }

  // A key timeline the way a keyboard produces it: [ms, "down"|"up", key]
  // events; the most recently pressed key that is still held auto-repeats
  // (500 ms delay, ~30 Hz), as on macOS. `sample(ms)` (optional) is called
  // about every `sampleMs` for read-only evidence while keys are held.
  async keyTimeline(events, totalMs, { sample = null, sampleMs = 1000, label = "" } = {}) {
    const plan = [...events].sort((a, b) => a[0] - b[0]);
    const t0 = Date.now();
    let i = 0; let lastPressed = null; let lastPressAt = 0; let lastRepeat = 0; let nextSample = sampleMs;
    const samples = [];
    while (Date.now() - t0 < totalMs) {
      const now = Date.now() - t0;
      while (i < plan.length && plan[i][0] <= now) {
        const [, kind, key] = plan[i];
        if (kind === "down") { await this.keyDown(key); lastPressed = key; lastPressAt = now; lastRepeat = now; }
        else { await this.keyUp(key); if (lastPressed === key) lastPressed = null; }
        i += 1;
      }
      if (lastPressed && this.held.has(lastPressed) && now - lastPressAt > 500 && now - lastRepeat >= 33) {
        await this.keyDown(lastPressed, { autoRepeat: true });
        lastRepeat = now;
      }
      if (sample && now >= nextSample) { samples.push({ ms: now, ...(await sample(now)) }); nextSample += sampleMs; }
      await sleep(16);
    }
    for (const key of [...this.held]) await this.keyUp(key);
    this.act("keys", { label, ms: totalMs, events: plan });
    return samples;
  }

  holdKey(key, ms, opts = {}) { return this.keyTimeline([[0, "down", key], [ms, "up", key]], ms + 20, { label: `hold ${key}`, ...opts }); }

  // ---- player helpers
  async clickText(text, { within = "", match = "exact", selector = "" } = {}) {
    const best = await this.aim({ text, within, match, selector });
    await this.click(best.x, best.y, { label: text });
    return best;
  }

  async clickMenu(title, item) {
    const head = await this.aim({ text: title, within: ".menu-bar", selector: ".menu > button, .menu > [role=button], button" });
    await this.click(head.x, head.y, { label: `menu ${title}` });
    await sleep(250);
    const entry = await this.aim({ text: item, within: ".menu-bar .menu-popover", selector: "button, [role=menuitem]", match: "prefix" }, { timeout: 4000 });
    await this.click(entry.x, entry.y, { label: `${title} → ${item}` });
    return entry;
  }

  async doubleClickIcon(label, { within = "" } = {}) {
    const best = await this.aim({ text: label, within, icon: true });
    await this.doubleClick(best.x, best.y, { label: `icon ${label}` });
    return best;
  }

  async screenshot(file) {
    await this.page.screenshot({ path: file });
    this.act("screenshot", { file: relative(ROOT, file) });
  }
}

// -------------------------------------------------------------- the recorder
class Recorder {
  constructor(cdp, dir) {
    this.cdp = cdp; this.dir = dir; this.frames = []; this.on = false; this.pending = Promise.resolve();
    this.queue = []; this.drainPromise = null; this.drainError = null; this.acked = 0;
    this.handler = (event) => this.onFrame(event);
  }

  // One async writer per run: it drains the queue serially, so frames reach disk
  // in arrival order without blocking the CDP event loop.
  drain() {
    // One writer at a time; callers (stop() included) await the same promise,
    // so nothing is assembled before the last queued frame is on disk.
    if (this.drainPromise) return this.drainPromise;
    this.drainPromise = (async () => {
      while (this.queue.length) {
        const item = this.queue.shift();
        try { await writeFile(item.file, item.buf); } catch (error) { this.drainError = this.drainError || error; }
      }
    })().finally(() => { this.drainPromise = null; });
    return this.drainPromise;
  }

  async start() {
    mkdirSync(this.dir, { recursive: true });
    this.cdp.on("Page.screencastFrame", this.handler);
    await this.cdp.send("Page.startScreencast", { format: "jpeg", quality: 82, maxWidth: VIEWPORT.width, maxHeight: VIEWPORT.height, everyNthFrame: 1 });
    this.on = true;
    this.startedWall = Date.now() / 1000;
  }

  // Ack first, then enqueue: the renderer encodes the next frame as soon as the
  // ack lands, while the async drain writes this one to disk.
  async onFrame({ data, metadata, sessionId }) {
    // Keep memory bounded: if the writer has fallen behind, wait for it before
    // acking further frames (which would only add more to the queue).
    if (this.queue.length > 200) await this.drain();
    const file = join(this.dir, `${String(this.frames.length + 1).padStart(6, "0")}.jpg`);
    this.frames.push({ file, t: metadata.timestamp || Date.now() / 1000 });
    this.queue.push({ file, buf: Buffer.from(data, "base64") });
    this.drain();
    this.pending = this.cdp.send("Page.screencastFrameAck", { sessionId }).then(() => { this.acked += 1; }, () => {});
    await this.pending;
  }

  async stop() {
    if (!this.on) return;
    this.on = false;
    this.stoppedWall = Date.now() / 1000;
    await this.cdp.send("Page.stopScreencast").catch(() => {});
    await this.pending;
    while (this.queue.length || this.drainPromise) await this.drain();
    if (this.drainError) throw this.drainError;
    this.cdp.off("Page.screencastFrame", this.handler);
  }

  // Constant 30 fps by timestamp: output frame k shows the newest screencast
  // frame whose timestamp is <= t0 + k/30 (screencast only sends a frame
  // when the screen changes, so still stretches become duplicates).
  async assemble(outFile) {
    if (!this.frames.length) throw new Error("the screencast delivered no frames");
    const frames = [...this.frames].sort((a, b) => a.t - b.t);
    const t0 = frames[0].t;
    const lastT = frames.at(-1).t;
    const end = Math.abs(this.stoppedWall - lastT) < 120 ? Math.max(lastT, this.stoppedWall) : lastT + 1;
    const total = Math.max(1, Math.round((end - t0) * FPS));
    // ffmpeg 9 has no -vsync; -fps_mode cfr with -r 30 keeps the output
    // constant. VideoToolbox first, with -allow_sw 0 so it cannot fall back
    // to software silently; a busy encoder (-12903) gets one retry, then
    // libx264. Colour: Chrome's JPEG frames are JFIF (BT.601, full range);
    // they are converted to BT.709 limited range and tagged as such.
    const vt = { name: "h264_videotoolbox", args: ["-c:v", "h264_videotoolbox", "-q:v", "62", "-profile:v", "high", "-allow_sw", "0"] };
    const encoders = [vt, { ...vt, retry: true }, { name: "libx264", args: ["-c:v", "libx264", "-preset", "veryfast", "-crf", "20"] }];
    let lastError = "";
    for (const encoder of encoders) {
      if (encoder.retry) await sleep(2000);
      const ff = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y",
        "-f", "image2pipe", "-c:v", "mjpeg", "-framerate", String(FPS), "-i", "pipe:0",
        "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2:in_color_matrix=bt601:in_range=pc:out_color_matrix=bt709:out_range=tv,format=yuv420p",
        ...encoder.args, "-r", String(FPS), "-fps_mode", "cfr",
        "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", "-color_range", "tv",
        // VideoToolbox leaves primaries/transfer out of the VUI; write them
        // into the bitstream so every player reads BT.709.
        "-bsf:v", "h264_metadata=video_full_range_flag=0:colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1",
        "-movflags", "+faststart", outFile], { stdio: ["pipe", "inherit", "pipe"] });
      let stderr = "";
      ff.stderr.on("data", (d) => { stderr += d; });
      ff.stdin.on("error", () => {});
      // A spawn failure (ENOENT, EACCES) arrives as 'error', possibly without
      // 'close'; without this listener Node would crash the whole run.
      let spawnError = null;
      const done = new Promise((resolve) => {
        ff.on("close", resolve);
        ff.on("error", (error) => { spawnError = error; resolve(-1); });
      });
      let j = 0; let cache = { file: "", buf: null }; let distinct = 0; let broken = false;
      ff.on("close", () => { broken = true; });
      ff.on("error", () => { broken = true; });
      for (let k = 0; k < total && !broken; k += 1) {
        const t = t0 + k / FPS;
        while (j + 1 < frames.length && frames[j + 1].t <= t) j += 1;
        if (cache.file !== frames[j].file) { cache = { file: frames[j].file, buf: readFileSync(frames[j].file) }; distinct += 1; }
        if (!ff.stdin.write(cache.buf)) await Promise.race([new Promise((resolve) => ff.stdin.once("drain", resolve)), done]);
      }
      ff.stdin.end();
      const code = await done;
      if (spawnError) throw new Error(`cannot run ffmpeg: ${spawnError.code || spawnError.message}`);
      if (code === 0) {
        return { encoder: encoder.name, t0, frames: total, screencastFrames: frames.length, distinctFramesUsed: distinct, seconds: total / FPS, screencastFps: Math.round((frames.length / Math.max(0.001, lastT - t0)) * 10) / 10 };
      }
      lastError = `${encoder.name}: ffmpeg exited ${code}: ${stderr.trim().slice(-400)}`;
    }
    throw new Error(lastError);
  }
}

// ------------------------------------------------------- read-only probes
const probe = {
  desk: () => ({
    lang: typeof currentLanguage !== "undefined" ? currentLanguage : null,
    profile: document.body.dataset.workspaceProfile || "",
    theme: document.documentElement.dataset.theme || document.body.dataset.theme || "",
    multiFinder: typeof isMultiFinderMode === "function" ? isMultiFinderMode() : null,
    onboarding: typeof clioOnboardingCompleted !== "undefined" ? clioOnboardingCompleted : null,
    mountedDisk: typeof isProjectMounted !== "undefined" ? isProjectMounted : null,
    projects: typeof projects !== "undefined" ? projects.length : null,
    visibility: document.visibilityState,
    focused: document.hasFocus(),
    windows: [...document.querySelectorAll(".window")].filter((w) => w.offsetParent && !w.hidden && !w.classList.contains("is-hidden") && getComputedStyle(w).display !== "none").map((w) => w.dataset.window),
    active: document.querySelector(".window.is-active")?.dataset.window || "",
    dialogs: [...document.querySelectorAll("[role=dialog],[role=alertdialog]")].filter((d) => d.offsetParent).map((d) => d.id || d.className).slice(0, 5),
  }),
  life: (ids) => Object.fromEntries(ids.map((id) => [id, window.AISystem6ApplicationRegistry?.getApplicationLifecycleState?.(id) ?? null])),
  text: (selector) => {
    const el = [...document.querySelectorAll(selector)].find((n) => n.getBoundingClientRect().width > 0);
    return el ? el.innerText.replace(/\s+/g, " ").trim() : null;
  },
  bonsai: async () => {
    const api = window.AISystem6BonsaiCity;
    const w = document.querySelector('.window[data-window="bonsaiCity"]');
    const on = (sel) => { const n = w?.querySelector(sel); return n && n.getBoundingClientRect().width > 0 ? n.textContent.trim() : null; };
    const s = api?.debugState?.();
    return {
      visible: Boolean(w && w.getBoundingClientRect().width > 0 && getComputedStyle(w).display !== "none" && !w.classList.contains("is-hidden")),
      name: on("[data-bonsai-city-name]"), date: on("[data-bonsai-date]"), weather: on("[data-bonsai-weather]"),
      funds: on("[data-bonsai-funds]"), population: on("[data-bonsai-population]"),
      playing: s?.playing ?? null, speed: s?.speed ?? null, cityId: s?.currentCityId || "", tick: s?.hashInputSummary?.tick ?? null,
      checkpoint: api?.checkpoint ? await api.checkpoint() : null,
    };
  },
  // The gauge's own date string and the weather tooltip: the pot's calendar
  // and the deterministic weather (bonsai-translations.js bonsai_pot_date /
  // bonsai_weather_detail).
  potClock: () => {
    const w = document.querySelector('.window[data-window="bonsaiCity"]');
    const date = w?.querySelector("[data-bonsai-date]")?.textContent.trim() || null;
    const weather = w?.querySelector("[data-bonsai-weather]") || null;
    return { date, weather: weather?.textContent.trim() || null, weatherTitle: weather?.getAttribute("title") || null };
  },
  // Rootline's chosen drawing mode (the M key and the mode control both land
  // in state.drawMode, which snapshot() exposes).
  rootlineMode: () => {
    const snap = window.AISystem6Rootline?.snapshot?.() || null;
    return { drawMode: snap?.drawMode ?? null, screen: snap?.screen ?? null, planning: snap?.planning ?? null };
  },
  joyride: () => {
    const api = window.AISystem6Joyride;
    const s = api?.debugState?.();
    const w = document.querySelector('.window[data-window="joyride"]');
    const on = (sel) => { const n = w?.querySelector(sel); return n && n.getBoundingClientRect().width > 0 ? n.textContent.trim() : null; };
    return s ? {
      visible: Boolean(w && w.getBoundingClientRect().width > 0 && getComputedStyle(w).display !== "none"),
      phase: s.phase, intro: s.intro, town: s.town, area: s.area, camera: s.camera, style: s.style,
      hudCity: on("[data-joyride-city]"), hudArea: on("[data-joyride-area]"), hudSpeed: on("[data-joyride-speed]"),
      message: on("[data-joyride-message]"), dash: s.dash,
      car: s.car ? { x: +s.car.x.toFixed(2), z: +s.car.z.toFixed(2), heading: +(s.car.heading || 0).toFixed(2), speed: +(s.car.speed || 0).toFixed(3) } : null,
      clear: s.clear, wanted: s.street?.wanted ?? null, events: api.streetEvents?.() || [], hasStreetEvents: typeof api.streetEvents === "function",
      menuBarHidden: document.body.classList.contains("joyride-driving"),
    } : { visible: Boolean(w), phase: null };
  },
  // A passive per-frame reader: on every painted frame it reads Joyride's
  // debugState() phase/intro and keeps the transitions plus frame counts.
  frameSamplerStart: () => {
    const box = { on: true, frames: 0, introFrames: 0, introFirst: null, introLast: null, introLongestGap: 0, lastIntroT: null, phases: [] };
    window.__onePotFrames = box;
    const tick = (t) => {
      if (!box.on) return;
      box.frames += 1;
      const s = window.AISystem6Joyride?.debugState?.();
      const key = s ? `${s.phase}${s.intro ? "+intro" : ""}` : "none";
      if (box.phases.at(-1)?.key !== key) box.phases.push({ key, t: Math.round(t) });
      if (s?.intro) {
        box.introFrames += 1;
        if (box.introFirst === null) box.introFirst = t;
        if (box.lastIntroT !== null) box.introLongestGap = Math.max(box.introLongestGap, t - box.lastIntroT);
        box.lastIntroT = t; box.introLast = t;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return true;
  },
  frameSamplerPeek: () => ({ introFrames: window.__onePotFrames?.introFrames || 0 }),
  frameSamplerStop: () => {
    const box = window.__onePotFrames;
    if (!box) return null;
    box.on = false;
    const t0 = box.phases[0]?.t || 0;
    return {
      frames: box.frames, introFrames: box.introFrames,
      introSpanMs: box.introFirst === null ? 0 : Math.round(box.introLast - box.introFirst),
      introLongestGapMs: Math.round(box.introLongestGap),
      phases: box.phases.map((p) => ({ key: p.key, ms: p.t - t0 })),
    };
  },
  // A second passive per-frame sampler: it records requestAnimationFrame
  // timestamps only (no game reads at all) so a step can time an opening
  // transition that runs on the page's own animation frames — the way the
  // descent sampler times Joyride's.
  transitionSamplerStart: () => {
    const box = { on: true, t0: null, frames: [], longestGap: 0, longestGapMs: 0 };
    window.__onePotTransition = box;
    const tick = (t) => {
      if (!box.on) return;
      if (box.t0 === null) box.t0 = t;
      if (box.frames.length) {
        const dt = t - box.frames.at(-1);
        if (dt > box.longestGap) { box.longestGap = dt; box.longestGapMs = Math.round(dt * 10) / 10; }
      }
      box.frames.push(t);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return true;
  },
  transitionSamplerStop: (windowMs) => {
    const box = window.__onePotTransition;
    if (!box) return null;
    box.on = false;
    const frames = box.frames;
    const span = frames.length > 1 ? Math.round(frames.at(-1) - frames[0]) : 0;
    const withinWindow = frames.filter((t) => t - box.t0 <= (Number(windowMs) || 2500));
    return {
      frames: withinWindow.length,
      spanMs: span,
      gapCount: Math.max(0, frames.length - 1),
      longestGapMs: box.longestGapMs,
      t0: box.t0,
    };
  },
  rootline: () => {
    const api = window.AISystem6Rootline;
    const g = api?.inspect?.();
    const w = document.querySelector('.window[data-window="rootline"]');
    const canvas = w?.querySelector("canvas");
    const r = canvas?.getBoundingClientRect();
    return {
      visible: Boolean(w && getComputedStyle(w).display !== "none" && w.getBoundingClientRect().width > 0),
      screen: api?.snapshot?.()?.screen ?? null,
      tick: g?.tick ?? null, delivered: g?.delivered ?? null, trains: g?.trains?.length ?? 0, over: g?.over ?? null,
      lines: (g?.lines || []).map((l) => ({ id: l.id, stations: l.stops || l.stations || [], loop: l.loop, slot: l.slot, mode: l.mode ?? null })),
      canvas: r ? [r.left, r.top, r.width, r.height] : null,
      stations: (g?.stations || []).map((s) => {
        const p = api.stationScreen(s.id);
        return { id: s.id, kind: s.kind, name: s.name || null, screen: p && r ? [Math.round((r.left + p.x) * 10) / 10, Math.round((r.top + p.y) * 10) / 10] : null };
      }),
      overlay: w?.querySelector(".rootline-panel")?.innerText.replace(/\s+/g, " ").trim().slice(0, 300) || "",
      hud: w ? w.innerText.replace(/\s+/g, " ").trim().slice(0, 200) : "",
    };
  },
};

// ------------------------------------------------------------- scenarios
// A step: { id, title, run(desk, step, memo) }. `step.expect(name, ok,
// detail)` is a hard assertion (fails the run), `step.observe(name, ok,
// detail)` records a finding without failing it, `step.evidence[...]` keeps
// read-only values. `memo` carries values between steps.
const IN = {
  bonsai: '.window[data-window="bonsaiCity"]',
  joyride: '.window[data-window="joyride"]',
  rootline: '.window[data-window="rootline"]',
};

// The pot's own calendar in words (bonsai-translations.js bonsai_pot_date):
// 「1952年7月1日 周一 · 小暑」. Steps assert on this exact shape, so it lives
// here once, and the Joyride dashboard is checked against the same shape.
const POT_DATE = /^\d{4}年\d{1,2}月\d{1,2}日 周[一二三四五六日] · /;

// Bonsai's File menu item that hands the pot to Rootline (real menu click).
const PLAN_TRANSIT_ITEM = "在根线里规划线网……";

const GAMES = ["盆景城市", "根线", "兜风"];

// Read-only: the visible, unshaded window that lists all three games.
function gamesWindowInPage(names) {
  const w = [...document.querySelectorAll(".window")].find((n) => n.getBoundingClientRect().height > 60 && getComputedStyle(n).display !== "none" && !n.classList.contains("is-hidden") && !n.classList.contains("is-collapsed") && names.every((x) => [...n.querySelectorAll(".finder-item")].some((i) => i.innerText.includes(x))));
  if (!w) return null;
  return { window: w.dataset.window || "", listed: [...w.querySelectorAll(".finder-item")].map((i) => (i.querySelector("span:not(.sys-icon)")?.innerText || i.innerText).trim()).filter(Boolean) };
}

// Desktop 「应用程序」 → 「游戏」, the way a player gets there. The Finder may
// bring the Games window back by itself when 应用程序 opens (it did after a
// game had been closed); then there is nothing more to double-click.
async function openGamesFolder(d) {
  let found = await d.read(gamesWindowInPage, GAMES);
  let route = "already open";
  if (!found) {
    await d.doubleClickIcon("应用程序", { within: ".desktop-icons, body" });
    const which = await d.waitFor("Applications or Games window", (names) => {
      const visible = (n) => n && n.getBoundingClientRect().height > 60 && getComputedStyle(n).display !== "none" && !n.classList.contains("is-hidden");
      const games = [...document.querySelectorAll(".window")].some((n) => visible(n) && names.every((x) => [...n.querySelectorAll(".finder-item")].some((i) => i.innerText.includes(x))));
      if (games) return "games";
      return visible(document.querySelector('.window[data-window="applications"]')) ? "applications" : false;
    }, GAMES, { timeout: 10000 });
    await sleep(400);
    route = which === "games" ? "应用程序 (Finder reopened 游戏 itself)" : "应用程序 → 游戏";
    if (which !== "games") {
      await d.doubleClickIcon("游戏", { within: '.window[data-window="applications"]' });
    }
    found = await d.waitFor("Games folder lists the three games", gamesWindowInPage, GAMES, { timeout: 10000 });
    await sleep(400);
  }
  return { ...found, route, selector: found.window ? `.window[data-window="${found.window}"]` : "" };
}

// Steps the two scenarios share, written once. `today` plays today's journey;
// `basin` plays the same five opening steps (boot → games folder → Bonsai →
// example city → run), then proves the three games are one world through the
// real UI. A step's run() receives (desk, step, memo, scenario).
const SHARED = {
  boot: {
    id: "boot",
    title: "Boot the prepared desk (Chinese, Clio onboarding done, desktop profile, single-task Finder).",
    async run(d, s, memo) {
      await d.waitFor("desk ready (menu bar + Applications icon in Chinese)", () => {
        const bar = document.querySelector(".menu-bar");
        const apps = document.querySelector('.desktop-icon[data-open="applications"]');
        return Boolean(bar && bar.getBoundingClientRect().height > 0 && apps && apps.innerText.trim() === "应用程序" && typeof openWindow === "function");
      }, null, { timeout: 60000 });
      await sleep(1200);
      const desk = await d.read(probe.desk);
      s.evidence.desk = desk;
      s.expect("UI language is Chinese", desk.lang === "zh", desk.lang);
      s.expect("Clio onboarding is complete", desk.onboarding === true, desk.onboarding);
      s.expect("workspace profile is desktop", desk.profile === "desktop", desk.profile);
      s.expect("no onboarding window (ClioTalk) opened at boot", !desk.windows.includes("assistant"), desk.windows);
      s.expect("single-task Finder (MultiFinder off)", desk.multiFinder === false, desk.multiFinder);
      s.expect("a Project Hard Disk is mounted", desk.mountedDisk === true && desk.projects >= 1, { mounted: desk.mountedDisk, projects: desk.projects });
      s.expect("tab is foregrounded and focused", desk.visibility === "visible" && desk.focused, { visibility: desk.visibility, focused: desk.focused });
      s.expect("no dialog on screen", desk.dialogs.length === 0, desk.dialogs);
      if (memo.theme) s.expect(`appearance is ${memo.theme}`, desk.theme === memo.theme, desk.theme);
    },
  },
  "games-folder": {
    id: "games-folder",
    title: "Desktop 「应用程序」 → 「游戏」 by double-clicking icons.",
    async run(d, s) {
      const games = await openGamesFolder(d);
      s.evidence.route = games.route; s.evidence.games = games.listed;
      for (const name of GAMES) s.expect(`Games folder shows 「${name}」`, games.listed.includes(name), games.listed);
    },
  },
  "bonsai-open": {
    id: "bonsai-open",
    title: "Double-click 「盆景城市」 in the Games folder.",
    async run(d, s) {
      await d.doubleClickIcon("盆景城市");
      await d.waitFor("Bonsai City window", (sel) => {
        const w = document.querySelector(sel);
        return Boolean(w && w.getBoundingClientRect().width > 0 && getComputedStyle(w).display !== "none" && w.querySelector('[data-bonsai-action="open"]')?.getBoundingClientRect().width > 0);
      }, IN.bonsai, { timeout: 30000 });
      await sleep(1500);
      const b = await d.read(probe.bonsai);
      s.evidence.bonsai = b;
      s.expect("Bonsai City window is on screen", b.visible, b.visible);
      s.expect("「打开城市……」 is offered", Boolean(await d.read(() => [...document.querySelectorAll('.window[data-window="bonsaiCity"] [data-bonsai-action="open"]')].some((n) => n.getBoundingClientRect().width > 0))), true);
    },
  },
  // Require the selected example; a missing city must fail verification.
  "bonsai-example": {
    id: "bonsai-example",
    title: "「打开城市……」 → example city, through Bonsai's own browser.",
    async run(d, s, memo, scenario) {
      await d.clickText("打开城市……", { within: IN.bonsai, selector: "button" });
      await d.waitFor("city browser", (sel) => {
        const b = document.querySelector(`${sel} [data-bonsai-city-browser]`);
        return Boolean(b && !b.hidden && b.getBoundingClientRect().width > 0);
      }, IN.bonsai, { timeout: 10000 });
      await sleep(500);
      s.evidence.browser = await d.read(probe.text, `${IN.bonsai} [data-bonsai-city-browser]`);
      const wanted = scenario.example;
      const example = wanted;
      memo.exampleUsed = example;
      s.evidence.example = { asked: wanted, used: example };
      await d.clickText(example, { within: `${IN.bonsai} [data-bonsai-city-browser]`, selector: "button" });
      await d.waitFor("example city loaded", (sel) => {
        const w = document.querySelector(sel);
        const b = w?.querySelector("[data-bonsai-city-browser]");
        const name = w?.querySelector("[data-bonsai-city-name]")?.textContent.trim();
        return Boolean((!b || b.hidden) && name && name !== "—" && window.AISystem6BonsaiCity?.debugState?.().currentCityId);
      }, IN.bonsai, { timeout: 20000 });
      await sleep(800);
      const b = await d.read(probe.bonsai);
      s.evidence.bonsai = b;
      memo.cityName = b.name; memo.cityId = b.cityId;
      s.expect(`gauge shows the example's name 「${example}」`, b.name === example, b.name);
      s.expect("the city has a record id", Boolean(b.cityId), b.cityId);
      s.expect("the date is on screen", Boolean(b.date), b.date);
      s.expect("example opens at normal speed", b.speed === 1 && b.playing, { speed: b.speed, playing: b.playing });
    },
  },
  "bonsai-run": {
    id: "bonsai-run",
    title: "Let the city run: click the gauge's 「正常」 speed and watch the date move.",
    async run(d, s, memo) {
      const before = await d.read(probe.bonsai);
      await d.clickText("正常", { within: `${IN.bonsai} .bonsai-speed-controls`, selector: "button" });
      await sleep(5000);
      const after = await d.read(probe.bonsai);
      s.evidence.before = before; s.evidence.after = after;
      memo.preDrive = after;
      s.expect("speed is normal (1)", after.speed === 1, after.speed);
      s.expect("simulation ticks advanced", after.tick > before.tick, { before: before.tick, after: after.tick });
      s.expect("on-screen date changed", after.date !== before.date, { before: before.date, after: after.date });
    },
  },
  "drive-descent": {
    id: "drive-descent",
    title: "文件 → 到街上兜风; wait through the descent to the kerb.",
    async run(d, s, memo) {
      // The descent is 2.6 s of wall clock on requestAnimationFrame, and the
      // first street frames are heavy, so a 200 ms poll from outside can miss
      // it entirely (the page is busy while it plays). A passive per-frame
      // sampler reads debugState() on every painted frame instead; it only
      // reads.
      await d.read(probe.frameSamplerStart);
      const t0 = Date.now();
      await d.clickMenu("文件", "到街上兜风");
      const samples = [];
      while (Date.now() - t0 < 20000) {
        const j = await d.read(probe.joyride);
        samples.push({ ms: Date.now() - t0, phase: j.phase, intro: j.intro });
        const f = await d.read(probe.frameSamplerPeek);
        if (f.introFrames > 0 && !j.intro && j.phase === "ready") break;
        if (j.phase === "driving" || j.phase === "failed") break;
        if (j.phase === "ready" && !j.intro && Date.now() - t0 > 12000) break;
        await sleep(200);
      }
      await sleep(600);
      const frames = await d.read(probe.frameSamplerStop);
      const j = await d.read(probe.joyride);
      const b = await d.read(probe.bonsai);
      const life = await d.read(probe.life, ["bonsaiCity", "joyride"]);
      memo.frozen = b;
      s.evidence.samples = samples; s.evidence.frames = frames; s.evidence.joyride = j; s.evidence.bonsai = { ...b, checkpoint: b.checkpoint?.slice?.(0, 80) }; s.evidence.lifecycle = life;
      memo.descentMs = Date.now() - t0;
      s.expect("the descent started and landed (intro frames painted, then ready at the kerb)", frames.introFrames > 0 && !j.intro && j.phase === "ready", { introFrames: frames.introFrames, intro: j.intro, phase: j.phase });
      s.observe("the descent is visibly animated (≥ 20 painted frames over its 2.6 s)", frames.introFrames >= 20, { introFrames: frames.introFrames, introSpanMs: frames.introSpanMs, longestGapMs: frames.introLongestGapMs });
      s.expect("Joyride window is on screen with a car", j.visible && Boolean(j.car), { visible: j.visible, car: j.car });
      s.expect("Joyride's town is Bonsai's city (debugState)", j.town?.name === memo.cityName, { joyride: j.town?.name, bonsai: memo.cityName });
      s.expect("on-screen city names match: Joyride HUD == Bonsai gauge", j.hudCity === memo.cityName, { joyrideHud: j.hudCity, bonsaiGauge: memo.cityName });
      s.observe("Bonsai is suspended while driving (single-task Finder)", life.bonsaiCity === "suspended", life);
      s.observe("Joyride town carries Bonsai's record id (plan D3: town.ref.cityId)", Boolean(j.town?.cityId === memo.cityId), { town: j.town, cityId: memo.cityId });
    },
  },
  drive: {
    id: "drive",
    title: "Hold ↑ and steer (←, then →) for a few seconds.",
    async run(d, s, memo) {
      await sleep(300);
      const before = await d.read(probe.joyride);
      const samples = await d.keyTimeline([
        [0, "down", "ArrowUp"],
        [2600, "down", "ArrowLeft"], [3300, "up", "ArrowLeft"],
        [4600, "down", "ArrowRight"], [5100, "up", "ArrowRight"],
        [6500, "up", "ArrowUp"],
      ], 6600, {
        label: "drive",
        sampleMs: 1000,
        sample: async () => {
          const j = await d.read(probe.joyride);
          return { phase: j.phase, car: j.car, area: j.hudArea, wanted: j.wanted };
        },
      });
      await sleep(500);
      const after = await d.read(probe.joyride);
      const b = await d.read(probe.bonsai);
      const moved = before.car && after.car ? Math.hypot(after.car.x - before.car.x, after.car.z - before.car.z) : 0;
      const maxSpeed = Math.max(0, ...samples.map((x) => Math.abs(x.car?.speed || 0)));
      // ← then → can cancel out: measure the widest swing, not the net.
      const turned = before.car ? Math.max(0, ...[...samples.map((x) => x.car), after.car].filter(Boolean).map((c) => Math.abs(c.heading - before.car.heading))) : 0;
      s.evidence.before = before.car; s.evidence.after = after.car; s.evidence.samples = samples; s.evidence.events = after.events;
      s.evidence.moved = +moved.toFixed(2); s.evidence.maxSpeed = maxSpeed; s.evidence.turned = +turned.toFixed(2);
      s.expect("phase became driving", samples.some((x) => x.phase === "driving"), samples.map((x) => x.phase));
      s.expect("the car moved", moved > 1, { moved });
      s.expect("steering swung the heading", turned > 0.2, { turned, headings: samples.map((x) => x.car?.heading) });
      s.expect("on-screen city names still match", after.hudCity === memo.cityName, { joyrideHud: after.hudCity, bonsai: memo.cityName });
      const wanted = after.events.filter((e) => e.type === "wanted");
      s.observe("no wanted event in the first seconds (plan D3)", wanted.length === 0, wanted);
      const tail = samples.slice(-2).map((x) => Math.abs(x.car?.speed || 0));
      s.observe("the car is still rolling with ↑ held at the end (not caught on a kerb, friction 9)", tail.length === 2 && Math.min(...tail) > 0.2, { lastSpeeds: tail, clear: after.clear });
      s.expect("Bonsai checkpoint unchanged by driving", b.checkpoint === memo.frozen.checkpoint && b.tick === memo.frozen.tick, { before: memo.frozen.tick, after: b.tick, same: b.checkpoint === memo.frozen.checkpoint });
      memo.afterDrive = b;
    },
  },
  "joyride-close": {
    id: "joyride-close",
    title: "Esc (menu bar back) → 文件 → 关闭; does single-task Finder return to Bonsai?",
    async run(d, s, memo) {
      await d.pressKey("Escape", { label: "pause, show menu bar" });
      await sleep(500);
      await d.clickMenu("文件", "关闭");
      await d.waitFor("Joyride window closed", (sel) => {
        const w = document.querySelector(sel);
        return !w || getComputedStyle(w).display === "none" || w.getBoundingClientRect().width === 0 || w.classList.contains("is-hidden");
      }, IN.joyride, { timeout: 8000 });
      // Single-task Finder must bring Bonsai City back in front, active and
      // live. Wait for exactly that (window shown + is-active + registry
      // lifecycle "active"), up to 10 s; not coming back fails.
      let back = true;
      try {
        await d.waitFor("Bonsai City back in front and active", (sel) => {
          const w = document.querySelector(sel);
          const shown = Boolean(w && getComputedStyle(w).display !== "none" && w.getBoundingClientRect().width > 0 && !w.classList.contains("is-hidden"));
          return shown && w.classList.contains("is-active") && window.AISystem6ApplicationRegistry?.getApplicationLifecycleState?.("bonsaiCity") === "active";
        }, IN.bonsai, { timeout: 10000 });
      } catch { back = false; }
      const desk = await d.read(probe.desk);
      const life = await d.read(probe.life, ["bonsaiCity", "joyride"]);
      const b = await d.read(probe.bonsai);
      // Then the clock must move on from where it stood at the return.
      const frozenTick = memo.frozen?.tick ?? null;
      await d.waitFor("Bonsai clock moves on after the return", (t) => (window.AISystem6BonsaiCity?.debugState?.()?.hashInputSummary?.tick ?? -1) > t, b.tick ?? Number.MAX_SAFE_INTEGER, { timeout: 8000 }).catch(() => {});
      const later = await d.read(probe.bonsai);
      s.evidence.desk = desk; s.evidence.lifecycle = life;
      s.evidence.bonsai = { ...b, checkpoint: b.checkpoint?.slice?.(0, 80) };
      s.evidence.ticks = { frozen: frozenTick, atReturn: b.tick, later: later.tick };
      s.expect("Joyride window is gone", !desk.windows.includes("joyride"), desk.windows);
      s.expect("single-task Finder brings Bonsai City back within 10 s", back && b.visible, { back, visible: b.visible, windows: desk.windows, active: desk.active, lifecycle: life });
      s.expect("Bonsai City lifecycle is active again", life.bonsaiCity === "active", life);
      s.expect("only Bonsai City is on screen, and it is the active window", desk.windows.length === 1 && desk.windows[0] === "bonsaiCity" && desk.active === "bonsaiCity", { windows: desk.windows, active: desk.active });
      s.expect("returned Bonsai is the same city", b.cityId === memo.cityId && b.name === memo.cityName, { id: b.cityId, name: b.name, wantId: memo.cityId, wantName: memo.cityName });
      s.expect("returned Bonsai did not lose time (tick at return ≥ tick when frozen)", frozenTick !== null && b.tick !== null && b.tick >= frozenTick, s.evidence.ticks);
      s.expect("returned Bonsai keeps running (tick strictly rises after the return)", b.tick !== null && later.tick !== null && later.tick > b.tick, s.evidence.ticks);
    },
  },
  "rootline-open": {
    id: "rootline-open",
    title: "Open 「根线」 from the Games folder (应用程序 → 游戏 → 根线).",
    async run(d, s, memo) {
      const games = await openGamesFolder(d);
      s.evidence.route = games.route;
      await d.doubleClickIcon("根线", { within: games.selector });
      await d.waitFor("Rootline start panel", (sel) => {
        const w = document.querySelector(sel);
        return Boolean(w && getComputedStyle(w).display !== "none" && w.querySelector(".rootline-start")?.getBoundingClientRect().width > 0);
      }, IN.rootline, { timeout: 20000 });
      await sleep(1200);
      const r = await d.read(probe.rootline);
      const life = await d.read(probe.life, ["bonsaiCity", "rootline"]);
      s.evidence.rootline = { ...r, stations: r.stations.length }; s.evidence.lifecycle = life;
      s.expect("Rootline window is on screen at the start panel", r.visible && r.screen === "start", { visible: r.visible, screen: r.screen });
      s.expect("start panel offers 「修第一条线」", r.overlay.includes("修第一条线"), r.overlay);
      const shown = await d.read((sel) => {
        const box = document.querySelector(`${sel} .rootline-start-city`);
        return box ? { name: box.querySelector("strong")?.textContent.trim() || "", number: box.querySelector(".rootline-start-number")?.textContent.trim() || "" } : null;
      }, IN.rootline);
      s.evidence.city = shown;
      s.observe("Rootline opens on the Bonsai city (plan L3: same name on screen)", shown?.name === memo.cityName, { rootline: shown?.name, bonsai: memo.cityName });
      s.observe("no seed number on screen (friction 4)", !shown?.number, shown?.number);
    },
  },
  "rootline-first-line": {
    id: "rootline-first-line",
    title: "「修第一条线」, then drag the first line through the stations (aimed with stationScreen).",
    async run(d, s) {
      await d.clickText("修第一条线", { within: IN.rootline, selector: "button" });
      await d.waitFor("play screen", () => window.AISystem6Rootline?.snapshot?.()?.screen === "play", null, { timeout: 8000 });
      // Let the camera settle: two reads 300 ms apart within 1.5 px.
      let r = await d.read(probe.rootline);
      const tickAtStart = r.tick;
      for (let i = 0; i < 20; i += 1) {
        await sleep(300);
        const next = await d.read(probe.rootline);
        const still = next.stations.length === r.stations.length && next.stations.every((st, k) => st.screen && r.stations[k].screen && Math.hypot(st.screen[0] - r.stations[k].screen[0], st.screen[1] - r.stations[k].screen[1]) < 1.5);
        r = next;
        if (still && r.stations.length >= 2) break;
      }
      const tickBeforeDraw = r.tick;
      const order = r.stations.slice(0, Math.min(3, r.stations.length));
      s.evidence.stations = r.stations; s.evidence.canvas = r.canvas;
      s.expect("at least two stations to join", order.length >= 2, r.stations.length);
      const aim = (id) => async () => {
        const now = await d.read(probe.rootline);
        const st = now.stations.find((x) => x.id === id);
        if (!st?.screen) throw new Error(`station ${id} has no screen position`);
        return st.screen;
      };
      const path = await d.drag(aim(order[0].id), ...order.slice(1).map((st) => aim(st.id)), { label: `line through ${order.map((x) => `${x.id}:${x.kind}`).join(" → ")}`, steps: 22, holdMs: 120 });
      await sleep(800);
      const drawn = await d.read(probe.rootline);
      const line = drawn.lines[0];
      s.evidence.path = path; s.evidence.lines = drawn.lines;
      s.expect("a line exists", drawn.lines.length >= 1, drawn.lines);
      s.expect("the line joins the dragged stations", Boolean(line) && order.every((st) => line.stations.includes(st.id)), { line: line?.stations, dragged: order.map((x) => x.id) });
      await sleep(6000);
      const run = await d.read(probe.rootline);
      s.evidence.after = { tick: run.tick, trains: run.trains, delivered: run.delivered, hud: run.hud };
      s.expect("a train runs on the line", run.trains >= 1, run.trains);
      s.expect("the clock runs after the line", run.tick > drawn.tick, { drawn: drawn.tick, now: run.tick });
      s.observe("clock stands still before the first line (plan D9)", tickBeforeDraw === tickAtStart, { atStart: tickAtStart, beforeDraw: tickBeforeDraw });
    },
  },
};

const SCENARIOS = {
  today: {
    description: "What exists now: Bonsai City example → Drive Its Streets → Joyride → close → Rootline first line.",
    theme: "system-7",
    example: "开局小镇",
    steps: [
      SHARED.boot,
      SHARED["games-folder"],
      SHARED["bonsai-open"],
      SHARED["bonsai-example"],
      SHARED["bonsai-run"],
      SHARED["drive-descent"],
      SHARED.drive,
      SHARED["joyride-close"],
      SHARED["rootline-open"],
      SHARED["rootline-first-line"],
    ],
  },
  // The Basin plan's world test: one pot, three games, played through the real
  // UI. The first five steps are today's own (shared definitions), then the
  // pot goes down to the streets, back up, into Rootline and home again with
  // its id and its clock intact.
  basin: {
    description: "One world: Bonsai City 鹤洲 → 到街上兜风 → drive → back → 在根线里规划线网 → metro + bus lines → back to the pot.",
    theme: "system-7",
    example: "鹤洲",
    steps: [
      SHARED.boot,
      SHARED["games-folder"],
      SHARED["bonsai-open"],
      SHARED["bonsai-example"],
      {
        id: "auto-budget",
        title: "选项 → 自动预算 keeps the year running during the cross-game journey.",
        async run(d, s) {
          await d.clickMenu("选项", "自动预算");
          const enabled = await d.read(() => window.AISystem6BonsaiCity?.debugState?.().autoBudget);
          s.expect("auto-budget was enabled through the menu", enabled === true, enabled);
        },
      },
      SHARED["bonsai-run"],
      {
        id: "reopen-example",
        title: "Reopen 鹤洲 from its example button; keep the saved city and its elapsed ticks.",
        async run(d, s, memo) {
          const before = await d.read(probe.bonsai);
          await d.clickMenu("文件", "打开城市……");
          await d.clickText("鹤洲", { within: `${IN.bonsai} [data-bonsai-city-browser]`, selector: "button" });
          await d.waitFor("saved example reopened", (sel) => document.querySelector(`${sel} [data-bonsai-city-browser]`)?.hidden === true, IN.bonsai);
          const after = await d.read(probe.bonsai);
          s.evidence.before = before; s.evidence.after = after;
          s.expect("reopening keeps the example record id", after.cityId === memo.cityId && after.cityId === "example-hezhou-1952", after.cityId);
          s.expect("reopening loads saved progress instead of replaying tick 3750", after.tick >= before.tick && after.tick > 3750, { before: before.tick, after: after.tick });
          await d.clickText("正常", { within: `${IN.bonsai} .bonsai-speed-controls`, selector: "button" });
        },
      },
      {
        id: "pot-calendar",
        title: "The Bonsai gauge: the pot's own calendar date and a weather tooltip in °C and km/h.",
        async run(d, s, memo) {
          const pot = await d.read(probe.potClock);
          s.evidence.calendar = pot;
          s.expect("the gauge date is the pot's calendar (YYYY年M月D日 周X · term)", POT_DATE.test(pot.date || ""), pot.date);
          s.expect(`the weather tooltip carries °C`, (pot.weatherTitle || "").includes("°C"), pot.weatherTitle);
          s.expect("the weather tooltip carries km/h", /km\/h|公里\/小时/.test(pot.weatherTitle || ""), pot.weatherTitle);
          s.expect("the weather tooltip has no °F", !(pot.weatherTitle || "").includes("°F"), pot.weatherTitle);
          memo.potDateText = pot.date;
        },
      },
      {
        id: "drive-descent",
        title: "文件 → 到街上兜风; the descent keeps the pot's id, and the dashboard shows its date.",
        async run(d, s, memo) {
          // The checkpoint the way down everything must not change: recorded
          // before the click, so the return can prove the clock stopped.
          memo.checkpointBefore = await d.read(probe.bonsai);
          s.evidence.checkpointBefore = memo.checkpointBefore;
          // A passive per-frame sampler reads debugState() on every painted
          // frame, so nothing of the 2.6 s transition is missed (it only
          // reads).
          await d.read(probe.frameSamplerStart);
          const t0 = Date.now();
          await d.clickMenu("文件", "到街上兜风");
          const samples = [];
          while (Date.now() - t0 < 20000) {
            const j = await d.read(probe.joyride);
            samples.push({ ms: Date.now() - t0, phase: j.phase, intro: j.intro });
            const f = await d.read(probe.frameSamplerPeek);
            if (f.introFrames > 0 && !j.intro && j.phase === "ready") break;
            if (j.phase === "driving" || j.phase === "failed") break;
            if (j.phase === "ready" && !j.intro && Date.now() - t0 > 12000) break;
            await sleep(200);
          }
          await sleep(600);
          const frames = await d.read(probe.frameSamplerStop);
          const j = await d.read(probe.joyride);
          const b = await d.read(probe.bonsai);
          const life = await d.read(probe.life, ["bonsaiCity", "joyride"]);
          memo.frozen = b;
          s.evidence.samples = samples; s.evidence.frames = frames; s.evidence.joyride = j;
          s.evidence.bonsai = { ...b, checkpoint: b.checkpoint?.slice?.(0, 80) }; s.evidence.lifecycle = life;
          memo.descentMs = Date.now() - t0;
          s.expect("the descent started and landed (intro frames painted, then ready at the kerb)", frames.introFrames > 0 && !j.intro && j.phase === "ready", { introFrames: frames.introFrames, intro: j.intro, phase: j.phase });
          s.expect("Joyride window is on screen with a car", j.visible && Boolean(j.car), { visible: j.visible, car: j.car });
          s.expect("Joyride's town is Bonsai's city (debugState)", j.town?.name === memo.cityName, { joyride: j.town?.name, bonsai: memo.cityName });
          // The world is one object graph: Joyride's town carries the pot's
          // own record id (plan D3: town.ref.cityId).
          s.expect("Joyride's debug town carries the Bonsai record id (cityId)", j.town?.cityId === memo.cityId, { town: j.town, cityId: memo.cityId });
          s.expect("on-screen city names match: Joyride HUD == Bonsai gauge", j.hudCity === memo.cityName, { joyrideHud: j.hudCity, bonsaiGauge: memo.cityName });
          // The dashboard must show the pot's own date in the calendar shape
          // the gauge uses (joyride_pot_date: 「1952 年 7 月 1 日」).
          const dashDate = (j.dash || []).find((text) => /^\d{4} 年 \d{1,2} 月 \d{1,2} 日$/.test(String(text).trim()));
          // The suspended window is hidden: read its retained gauge text,
          // which was painted after the departure command stopped its clock.
          const frozenGauge = await d.read(probe.potClock);
          s.evidence.frozenGauge = frozenGauge;
          const frozenDate = frozenGauge.date?.match(/^(\d+)年(\d+)月(\d+)日/);
          const streetDate = dashDate?.match(/^(\d+) 年 (\d+) 月 (\d+) 日$/);
          s.expect("the Joyride dashboard shows the same date as the frozen pot", Boolean(frozenDate && streetDate && frozenDate.slice(1).every((part, i) => part === streetDate[i + 1])), { dash: j.dash, potDate: frozenGauge.date });
          s.observe("Bonsai is suspended while driving (single-task Finder)", life.bonsaiCity === "suspended", life);
          s.observe("the descent is visibly animated (≥ 20 painted frames over its 2.6 s)", frames.introFrames >= 20, { introFrames: frames.introFrames, introSpanMs: frames.introSpanMs, longestGapMs: frames.introLongestGapMs });
        },
      },
      {
        id: "drive",
        title: "Hold ↑ a few seconds: the car moves and the pot brings no wanted event.",
        async run(d, s, memo) {
          await sleep(300);
          const before = await d.read(probe.joyride);
          const samples = await d.keyTimeline([
            [0, "down", "ArrowUp"],
            [4000, "up", "ArrowUp"],
          ], 4200, {
            label: "hold ↑",
            sampleMs: 1000,
            sample: async () => {
              const j = await d.read(probe.joyride);
              return { phase: j.phase, car: j.car, wanted: j.wanted, events: j.events.length };
            },
          });
          await sleep(500);
          const after = await d.read(probe.joyride);
          const b = await d.read(probe.bonsai);
          const moved = before.car && after.car ? Math.hypot(after.car.x - before.car.x, after.car.z - before.car.z) : 0;
          s.evidence.before = before.car; s.evidence.after = after.car; s.evidence.samples = samples;
          s.evidence.events = after.events; s.evidence.moved = +moved.toFixed(2);
          s.expect("phase became driving", samples.some((x) => x.phase === "driving"), samples.map((x) => x.phase));
          s.expect("the car moved", moved > 1, { moved });
          // The pot's streets are quiet in the first seconds: a red light the
          // mayor ran would be a wanted event with why 'red-light'. The event
          // log only exists on a build that ships the street instrument, so
          // the check is skipped (observed) rather than failed when absent.
          s.expect("the street event log is available", after.hasStreetEvents, after.hasStreetEvents);
          if (after.hasStreetEvents && Array.isArray(after.events)) {
            const early = after.events.filter((e) => e.type === "wanted" && e.why === "red-light" && Number(e.seconds ?? e.at ?? 0) <= 5);
            s.expect("no wanted event for a red light in the first 5 s", early.length === 0, early);
          } else {
            s.observe("the street event log is available to check red-light wanted events", false, { events: after.events });
          }
          s.expect("Bonsai checkpoint unchanged by driving", b.checkpoint === memo.frozen.checkpoint && b.tick === memo.frozen.tick, { before: memo.frozen.tick, after: b.tick, same: b.checkpoint === memo.frozen.checkpoint });
          memo.afterDrive = b;
        },
      },
      {
        id: "back-to-city",
        title: "Esc → 文件 → 关闭 returns from Joyride to the same pot.",
        async run(d, s, memo) {
          const before = await d.read(probe.bonsai);
          // Closing Joyride invokes the real lifecycle return to Bonsai.
          await d.pressKey("Escape", { label: "pause, show menu bar" });
          await sleep(400);
          await d.clickMenu("文件", "关闭");
          s.evidence.route = "关闭";
          await d.waitFor("Joyride window closed", (sel) => {
            const w = document.querySelector(sel);
            return !w || getComputedStyle(w).display === "none" || w.getBoundingClientRect().width === 0 || w.classList.contains("is-hidden");
          }, IN.joyride, { timeout: 8000 });
          // Single-task Finder brings the pot back in front and running.
          let back = true;
          try {
            await d.waitFor("Bonsai City back in front and active", (sel) => {
              const w = document.querySelector(sel);
              const shown = Boolean(w && getComputedStyle(w).display !== "none" && w.getBoundingClientRect().width > 0 && !w.classList.contains("is-hidden"));
              return shown && w.classList.contains("is-active") && window.AISystem6ApplicationRegistry?.getApplicationLifecycleState?.("bonsaiCity") === "active";
            }, IN.bonsai, { timeout: 10000 });
          } catch { back = false; }
          const desk = await d.read(probe.desk);
          const life = await d.read(probe.life, ["bonsaiCity", "joyride"]);
          const b = await d.read(probe.bonsai);
          // The earlier driving step checked the frozen checkpoint. After
          // returning, allow normal pacing to resume before this read.
          await d.waitFor("Bonsai clock moves on after the return", (t) => (window.AISystem6BonsaiCity?.debugState?.()?.hashInputSummary?.tick ?? -1) > t, b.tick ?? Number.MAX_SAFE_INTEGER, { timeout: 8000 }).catch(() => {});
          const later = await d.read(probe.bonsai);
          s.evidence.desk = desk; s.evidence.lifecycle = life;
          s.evidence.bonsai = { ...b, checkpoint: b.checkpoint?.slice?.(0, 80) };
          s.evidence.ticks = { beforeDescent: memo.checkpointBefore?.tick ?? null, atReturn: b.tick, later: later.tick };
          s.expect("single-task Finder brings Bonsai City back within 10 s", back && b.visible, { back, visible: b.visible, windows: desk.windows, active: desk.active, lifecycle: life });
          s.expect("Bonsai City is the active window at the return", desk.active === "bonsaiCity" && life.bonsaiCity === "active", { windows: desk.windows, active: desk.active, lifecycle: life });
          s.expect("the returned pot is the same city", b.cityId === memo.cityId && b.name === memo.cityName, { id: b.cityId, name: b.name, wantId: memo.cityId, wantName: memo.cityName });
          s.expect("the returned clock did not go backwards", memo.frozen?.tick != null && b.tick >= memo.frozen.tick, s.evidence.ticks);
          s.expect("the returned pot keeps running (tick strictly rises after the return)", b.tick !== null && later.tick !== null && later.tick > b.tick, s.evidence.ticks);
        },
      },
      {
        id: "plan-transit",
        title: "Bonsai 文件 → 「在根线里规划线网……」; the Rootline window opens on the pot's name.",
        async run(d, s, memo) {
          // A passive per-frame sampler times the opening transition (read
          // only), the way the descent sampler times its own.
          await d.read(probe.transitionSamplerStart);
          const t0 = Date.now();
          await d.clickMenu("文件", PLAN_TRANSIT_ITEM);
          await d.waitFor("Rootline window", (sel) => {
            const w = document.querySelector(sel);
            return Boolean(w && getComputedStyle(w).display !== "none" && w.getBoundingClientRect().width > 0 && !w.classList.contains("is-hidden"));
          }, IN.rootline, { timeout: 15000 });
          // The transition is a two-and-a-half second opening: let it finish.
          const plays = await d.waitFor("the opening transition ends (Rootline is playing)", () => {
            const r = window.AISystem6Rootline;
            const screen = r?.snapshot?.()?.screen;
            return screen === "play" || (Boolean(r?.inspect?.()) && screen !== "start");
          }, null, { timeout: 12000 }).then(() => true, () => false);
          await sleep(300);
          const frames = await d.read(probe.transitionSamplerStop, 2500);
          const r = await d.read(probe.rootline);
          const text = await d.read(probe.text, `${IN.rootline} .rootline-top`);
          s.evidence.frames = frames; s.evidence.rootline = { ...r, stations: r.stations.length };
          s.evidence.openMs = Date.now() - t0;
          s.expect("the Rootline window opened from Bonsai's File menu", r.visible, { visible: r.visible, screen: r.screen });
          s.expect("the opening transition ends (play screen or a planning state)", plays && (r.screen === "play" || r.screen === null), { screen: r.screen });
          const hud = `${r.hud} ${text || ""}`;
          s.expect("the Rootline HUD names the pot", hud.includes(memo.cityName), { hud, city: memo.cityName });
          s.expect("no seed number on screen", !/#\d+/.test(hud), { hud });
          s.observe(`the command-to-play sample has frames and its longest gap is ≤ 50 ms`, (frames?.gapCount ?? 0) > 0 && (frames?.longestGapMs ?? 0) <= 50, frames);
        },
      },
      {
        id: "rootline-lines",
        title: "Draw a metro line through three stations, then a bus line along the roads.",
        async run(d, s, memo) {
          // ---- metro: drag through the first three stations.
          let r = await d.read(probe.rootline);
          for (let i = 0; i < 20; i += 1) {
            await sleep(300);
            const next = await d.read(probe.rootline);
            const still = next.stations.length === r.stations.length && next.stations.every((st, k) => st.screen && r.stations[k].screen && Math.hypot(st.screen[0] - r.stations[k].screen[0], st.screen[1] - r.stations[k].screen[1]) < 1.5);
            r = next;
            if (still && r.stations.length >= 3) break;
          }
          const order = r.stations.slice(0, Math.min(3, r.stations.length));
          s.evidence.stations = r.stations; s.evidence.canvas = r.canvas;
          s.expect("at least two stations to join", order.length >= 2, r.stations.length);
          const aim = (id) => async () => {
            const now = await d.read(probe.rootline);
            const st = now.stations.find((x) => x.id === id);
            if (!st?.screen) throw new Error(`station ${id} has no screen position`);
            return st.screen;
          };
          const path = await d.drag(aim(order[0].id), ...order.slice(1).map((st) => aim(st.id)), { label: `metro line ${order.map((x) => x.id).join(" → ")}`, steps: 22, holdMs: 120 });
          await sleep(800);
          const metro = await d.read(probe.rootline);
          s.evidence.path = path; s.evidence.metroLines = metro.lines;
          s.expect("a metro line exists", metro.lines.some((line) => line.mode === "metro" || !line.mode), metro.lines);
          s.expect("the line joins the dragged stations", Boolean(metro.lines[0]) && order.every((st) => metro.lines[0].stations.includes(st.id)), { line: metro.lines[0]?.stations, dragged: order.map((x) => x.id) });
          // Click the real mode button; its label also includes stock counts.
          await d.clickText("公交", { within: `${IN.rootline} .rootline-transit`, selector: "button", match: "prefix" });
          s.evidence.modeSwitch = "control";
          await sleep(400);
          const busDrawMode = await d.read(probe.rootlineMode);
          s.evidence.drawMode = busDrawMode;
          s.expect("Rootline is drawing bus lines now", busDrawMode.drawMode === "bus", busDrawMode);
          const r2 = await d.read(probe.rootline);
          const sticks = r2.stations.filter((st) => st.screen).slice(0, 3);
          s.expect("stations are still on screen for the bus line", sticks.length >= 2, sticks.length);
          const aim2 = (id) => async () => {
            const now = await d.read(probe.rootline);
            const st = now.stations.find((x) => x.id === id);
            if (!st?.screen) throw new Error(`station ${id} has no screen position`);
            return st.screen;
          };
          const busPath = await d.drag(aim2(sticks[0].id), ...sticks.slice(1).map((st) => aim2(st.id)), { label: `bus line ${sticks.map((x) => x.id).join(" → ")}`, steps: 24, holdMs: 120 });
          await sleep(1000);
          const after = await d.read(probe.rootline);
          s.evidence.busPath = busPath; s.evidence.lines = after.lines;
          const busLine = after.lines.find((l) => l.mode === "bus");
          s.expect("a bus line exists (inspect().lines carries mode 'bus')", Boolean(busLine), after.lines);
          s.expect("the bus line joins the dragged stations", Boolean(busLine) && sticks.every((station) => busLine.stations.includes(station.id)), { line: busLine?.stations, dragged: sticks.map((station) => station.id) });
          s.expect("the metro line remains after drawing the bus line", after.lines.some((l) => l.mode === "metro" || !l.mode), after.lines);
        },
      },
      {
        id: "back-again",
        title: "Rootline 文件 → 「回到「<city>」」: Bonsai City is the active window again.",
        async run(d, s, memo) {
          const before = await d.read(probe.desk);
          s.evidence.deskBefore = before;
          await d.clickMenu("文件", "回到「盆景城市」");
          s.evidence.route = "回到「盆景城市」";
          let back = true;
          try {
            await d.waitFor("Bonsai City back in front and active", (sel) => {
              const w = document.querySelector(sel);
              const shown = Boolean(w && getComputedStyle(w).display !== "none" && w.getBoundingClientRect().width > 0 && !w.classList.contains("is-hidden"));
              return shown && w.classList.contains("is-active") && window.AISystem6ApplicationRegistry?.getApplicationLifecycleState?.("bonsaiCity") === "active";
            }, IN.bonsai, { timeout: 10000 });
          } catch { back = false; }
          const desk = await d.read(probe.desk);
          const b = await d.read(probe.bonsai);
          s.evidence.desk = desk; s.evidence.bonsai = { ...b, checkpoint: b.checkpoint?.slice?.(0, 80) };
          s.expect("Bonsai City is back in front within 10 s", back && b.visible, { back, visible: b.visible, windows: desk.windows, active: desk.active });
          s.expect("Bonsai City is the active window with the same city id", desk.active === "bonsaiCity" && b.cityId === memo.cityId, { active: desk.active, id: b.cityId, wantId: memo.cityId });
        },
      },
    ],
  },
};

// ------------------------------------------------------------------- main
// A setup problem (no ffmpeg, port taken, server died, wrong build, browser
// would not start) is an environment error: exit 2, never a recorded PASS.
class EnvError extends Error {}

function portFree(port, host) {
  return new Promise((resolve, reject) => {
    const probeServer = createServer();
    probeServer.once("error", (error) => {
      if (error.code === "EADDRINUSE") resolve(false);
      else reject(new EnvError(`cannot check local port ${port}: ${error.code}: ${error.message}`));
    });
    probeServer.listen(Number(port), host, () => probeServer.close(() => resolve(true)));
  });
}

async function answers(url, ms = 1500) {
  try { await fetch(url, { signal: AbortSignal.timeout(ms) }); return true; } catch { return false; }
}

async function waitForServer(url, ms, child = null) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (child && (child.exitCode !== null || child.signalCode)) return { ok: false, exited: child.exitCode ?? child.signalCode };
    if (!child || child.readyLine) {
      try { const res = await fetch(url, { signal: AbortSignal.timeout(2000) }); if (res.ok) return { ok: true, ms: Date.now() - t0 }; } catch {}
    }
    await sleep(200);
  }
  return { ok: false };
}

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

// Which build is answering: the ?v=<build> stamp the page pins, /api/version,
// and the served app.bundle.js compared byte for byte with this worktree's.
async function identifyServer(url) {
  const html = await (await fetch(url, { signal: AbortSignal.timeout(5000) })).text();
  const buildStamp = html.match(/app\.bundle\.js\?v=([^"'\s>]+)/)?.[1] || null;
  let version = null;
  try { const res = await fetch(new URL("/api/version", url), { signal: AbortSignal.timeout(5000) }); if (res.ok) version = await res.json(); } catch {}
  let bundleSha256 = null;
  try {
    const res = await fetch(new URL(`app.bundle.js${buildStamp ? `?v=${buildStamp}` : ""}`, url), { signal: AbortSignal.timeout(15000) });
    if (res.ok) bundleSha256 = sha256(Buffer.from(await res.arrayBuffer()));
  } catch {}
  let localBundleSha256 = null;
  try { localBundleSha256 = sha256(readFileSync(join(ROOT, "apps/desktop/app.bundle.js"))); } catch {}
  return { buildStamp, version, bundleSha256, localBundleSha256, matchesWorktree: Boolean(bundleSha256 && bundleSha256 === localBundleSha256) };
}

async function main() {
  let args;
  try { args = parseArgs(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exit(2); }
  const scenario = SCENARIOS[args.scenario];
  if (args.help || !scenario) {
    if (!scenario) console.error(`unknown scenario "${args.scenario}"; known: ${Object.keys(SCENARIOS).join(", ")}`);
    const head = readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1);
    console.log(head.slice(0, head.findIndex((l) => !l.startsWith("//"))).map((l) => l.slice(3)).join("\n"));
    process.exit(scenario ? 0 : 2);
  }
  if (args.list) {
    scenario.steps.forEach((st, i) => console.log(`${pad(i + 1)} ${st.id.padEnd(22)} ${st.title}`));
    return;
  }

  const port = Number(process.env.PORT) || 4198;
  const url = args.url || `http://localhost:${port}/`;
  const run = args.run || `${args.scenario}-${stamp()}`;
  const outDir = join(OUT_ROOT, run);
  const profileDir = join(OUT_ROOT, `profile-${run}`);
  rmSync(outDir, { recursive: true, force: true });
  rmSync(profileDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const consoleLog = join(outDir, "console.log");
  writeFileSync(consoleLog, "");
  const log = (line) => appendFileSync(consoleLog, `${new Date().toISOString()} ${line}\n`);
  const say = (line) => { console.log(line); log(`[instrument] ${line}`); };

  const theme = args.theme || scenario.theme || "";
  const settings = { clioOnboardingCompleted: true, guideSeen: true, language: "zh", workspaceProfile: "desktop", ...(theme ? { theme } : {}) };
  const report = {
    run, scenario: args.scenario, description: scenario.description, url, startedAt: new Date().toISOString(),
    selectedSteps: args.steps ? [...args.steps].sort((a, b) => a - b) : "all",
    environment: { viewport: VIEWPORT, deviceScaleFactor: SCALE, headless: !args.headed, node: process.version },
    server: null,
    profile: { dir: relative(ROOT, profileDir), method: "pre-boot IndexedDB ai-system-6-db keyval/settings (opened at v1; the app upgrades to v5 itself)", settings },
    steps: [], pageErrors: [], dialogs: [], video: null, result: "running", error: null,
  };
  const writeReport = () => writeFileSync(join(outDir, "steps.json"), `${JSON.stringify(report, null, 2)}\n`);
  writeReport();

  let server = null;
  let context = null;
  let browserClosed = true;
  let recorder = null;
  let phase = "setup";
  let failed = false;
  let envError = null;
  let releaseKeepOpen = null;

  // Whatever ends this process, the server it started and the browser it
  // launched go with it ('exit' also runs after an uncaught error).
  process.on("exit", () => {
    if (server && server.exitCode === null && !server.signalCode) { try { server.kill("SIGTERM"); } catch {} }
    if (!browserClosed) spawnSync("pkill", ["-9", "-f", `user-data-dir=${profileDir}`]);
  });
  const onSignal = (signal) => {
    if (releaseKeepOpen) { releaseKeepOpen(); releaseKeepOpen = null; return; }
    report.result = "interrupted"; report.error = `interrupted by ${signal} during ${phase}`; report.finishedAt = new Date().toISOString();
    try { writeReport(); say(`INTERRUPTED (${signal}) ${relative(ROOT, join(outDir, "steps.json"))}`); } catch {}
    process.exit(signal === "SIGINT" ? 130 : 143);
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);

  try {
    // ---- preflight: the encoder and prober exist before anything starts
    if (args.video) {
      for (const tool of ["ffmpeg", "ffprobe"]) {
        const r = spawnSync(tool, ["-version"], { encoding: "utf8" });
        if (r.error || r.status !== 0) throw new EnvError(`${tool} is not runnable (${r.error?.code || `exit ${r.status}`}); put it on PATH or pass --no-video`);
      }
    }

    // ---- the desk server: ours (--serve) on a port that must be free, or
    // an existing one at --url/PORT.
    if (args.serve) {
      const target = new URL(url);
      const servePort = target.port || "80";
      if (!await portFree(servePort, "127.0.0.1") || await answers(url)) {
        throw new EnvError(`--serve: port ${servePort} is already taken (another server answers at ${url}); stop it or pick another PORT`);
      }
      server = spawn(process.execPath, [join(ROOT, "apps/server/server.js")], { cwd: ROOT, env: { ...process.env, PORT: servePort }, stdio: ["ignore", "pipe", "pipe"] });
      server.readyLine = "";
      server.stdout.on("data", (d) => {
        const text = String(d);
        log(`[server] ${text.trim()}`);
        const m = text.match(/server running at (\S+)/);
        if (m) server.readyLine = m[0];
      });
      server.stderr.on("data", (d) => log(`[server] ${String(d).trim()}`));
      server.on("error", (error) => { log(`[server] spawn error ${error.message}`); });
      report.server = { spawned: true, pid: server.pid, port: Number(servePort) };
      const ready = await waitForServer(url, 30000, server);
      if (!ready.ok) {
        throw new EnvError(ready.exited !== undefined
          ? `--serve: the server (pid ${server.pid}) exited (${ready.exited}) before it was ready; see console.log`
          : `--serve: the server (pid ${server.pid}) was not ready at ${url} within 30 s`);
      }
      report.server.readyMs = ready.ms;
      report.server.readyLine = server.readyLine;
    } else {
      const ready = await waitForServer(url, 3000);
      if (!ready.ok) throw new EnvError(`no desk at ${url}; start one (PORT=${port} node apps/server/server.js) or pass --serve`);
      report.server = { spawned: false, pid: null };
    }
    Object.assign(report.server, await identifyServer(url));
    if (server && (server.exitCode !== null || server.signalCode)) throw new EnvError(`--serve: the server (pid ${server.pid}) exited right after start; see console.log`);
    if (args.serve && !report.server.matchesWorktree) {
      throw new EnvError(`--serve: the page at ${url} does not serve this worktree's apps/desktop/app.bundle.js (served ${report.server.bundleSha256?.slice(0, 12) || "nothing"}, local ${report.server.localBundleSha256?.slice(0, 12) || "missing; run npm run build:app"})`);
    }
    say(`desk at ${url} build ${report.server.buildStamp || "?"}${report.server.version?.build ? ` (server ${report.server.version.build})` : ""}${server ? `, server pid ${server.pid}` : ""}; bundle ${report.server.matchesWorktree ? "matches this worktree" : "DOES NOT match this worktree"}`);
    writeReport();

    // ---- browser
    const launchArgs = ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"];
    if (args.debugPort) launchArgs.push(`--remote-debugging-port=${args.debugPort}`);
    browserClosed = false;
    context = await chromium.launchPersistentContext(profileDir, {
      channel: "chromium", headless: !args.headed, args: launchArgs,
      viewport: VIEWPORT, deviceScaleFactor: SCALE, locale: "zh-CN",
    });
    const page = context.pages()[0] || await context.newPage();
    page.on("console", (m) => log(`console.${m.type()} ${m.text()}${m.location()?.url ? ` @ ${m.location().url}:${m.location().lineNumber}` : ""}`));
    page.on("pageerror", (e) => { report.pageErrors.push({ t: Date.now(), message: e.message }); log(`PAGEERROR ${e.message} :: ${(e.stack || "").split("\n").slice(0, 3).join(" | ")}`); });
    page.on("dialog", (dlg) => { report.dialogs.push({ type: dlg.type(), message: dlg.message() }); log(`DIALOG ${dlg.type()} ${dlg.message()}`); dlg.dismiss().catch(() => {}); });
    page.on("requestfailed", (r) => log(`REQFAILED ${r.url()} ${r.failure()?.errorText}`));
    page.on("response", (r) => { if (r.status() >= 400) log(`HTTP ${r.status()} ${r.url()}`); });

    // ---- profile fixture, before boot only
    const prepareUrl = new URL("/__one-pot-profile__", url).href;
    await page.route(prepareUrl, (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><meta charset=utf-8><title>profile</title>" }));
    await page.goto(prepareUrl);
    const stored = await page.evaluate((record) => new Promise((resolve, reject) => {
      const req = indexedDB.open("ai-system-6-db", 1);
      req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains("keyval")) req.result.createObjectStore("keyval"); };
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction("keyval", "readwrite");
        tx.objectStore("keyval").put(record, "settings");
        tx.oncomplete = () => {
          const check = db.transaction("keyval", "readonly").objectStore("keyval").get("settings");
          check.onsuccess = () => { db.close(); resolve(check.result); };
        };
        tx.onerror = () => reject(tx.error);
      };
    }), settings);
    await page.unroute(prepareUrl);
    report.profile.stored = stored;

    const cdp = await context.newCDPSession(page);
    await cdp.send("Page.enable");
    await cdp.send("Page.bringToFront");
    await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: true });
    recorder = new Recorder(cdp, join(outDir, "frames"));
    const desk = new Desk(page, cdp, recorder);

    const memo = { theme };
    if (args.video) await recorder.start();
    say(`run ${run} → ${relative(ROOT, outDir)}`);
    await page.goto(url, { waitUntil: "domcontentloaded" });
    phase = "steps";
    for (let i = 0; i < scenario.steps.length; i += 1) {
      const n = i + 1;
      if (args.steps && !args.steps.has(n)) continue;
      const def = scenario.steps[i];
      const step = {
        n, id: def.id, title: def.title, startedAt: new Date().toISOString(), ms: 0,
        actions: [], assertions: [], evidence: {}, screenshot: `step-${pad(n)}.png`, ok: true, error: null,
        expect(name, ok, actual) { this.assertions.push({ name, ok: Boolean(ok), hard: true, actual }); if (!ok) this.ok = false; },
        observe(name, ok, actual) { this.assertions.push({ name, ok: Boolean(ok), hard: false, actual }); },
      };
      desk.step = step;
      report.steps.push(step);
      const t0 = Date.now();
      try {
        await cdp.send("Page.bringToFront");
        let deadline;
        try {
          await Promise.race([
            def.run(desk, step, memo, scenario),
            new Promise((_, reject) => { deadline = setTimeout(() => reject(new Error("step exceeded 90 seconds")), 90000); }),
          ]);
        } finally { clearTimeout(deadline); }
        const fg = await desk.read(() => ({ visibility: document.visibilityState, focused: document.hasFocus() }));
        step.expect("tab stays foregrounded", fg.visibility === "visible", fg);
        const reaims = step.actions.filter((a) => a.kind === "re-aim");
        if (reaims.length) step.observe("targets stayed still under the pointer", false, reaims);
      } catch (error) {
        step.ok = false;
        step.error = String(error?.message || error);
      }
      try { await desk.screenshot(join(outDir, step.screenshot)); } catch (error) { step.ok = false; step.screenshot = null; step.error ||= `screenshot: ${error.message}`; }
      step.ms = Date.now() - t0;
      step.wall = [t0 / 1000, Date.now() / 1000];
      const hardFails = step.assertions.filter((a) => a.hard && !a.ok).map((a) => a.name);
      const softFails = step.assertions.filter((a) => !a.hard && !a.ok).map((a) => a.name);
      say(`${step.ok ? "PASS" : "FAIL"} ${pad(n)} ${def.id} (${step.ms} ms)${step.error ? ` — ${step.error}` : ""}${hardFails.length ? ` — failed: ${hardFails.join("; ")}` : ""}${softFails.length ? ` — observed gaps: ${softFails.join("; ")}` : ""}`);
      writeReport();
      if (!step.ok) { failed = true; break; }
    }
  } catch (error) {
    const message = String(error?.message || error);
    if (error instanceof EnvError || phase === "setup") {
      envError = message;
      say(`ERROR (environment) ${message}`);
    } else {
      failed = true;
      say(`FAIL ${message}`);
    }
    report.error = message;
  } finally {
    if (report.pageErrors.length) { failed = true; say(`FAIL ${report.pageErrors.length} uncaught page error(s); see console.log`); }
    if (recorder?.on) {
      await recorder.stop();
      try {
        const mp4 = join(outDir, "recording.mp4");
        const info = await recorder.assemble(mp4);
        const probeOut = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_name,profile,width,height,pix_fmt,color_range,color_space,r_frame_rate,avg_frame_rate,nb_frames:format=duration,size", "-of", "json", mp4], { encoding: "utf8" });
        // Decodes end to end without an error.
        const decode = spawnSync("ffmpeg", ["-v", "error", "-xerror", "-hwaccel", "videotoolbox", "-i", mp4, "-f", "null", "-"], { encoding: "utf8" });
        report.video = { file: "recording.mp4", ...info, decodes: decode.status === 0, ffprobe: probeOut.status === 0 ? JSON.parse(probeOut.stdout) : (probeOut.stderr || String(probeOut.error)) };
        if (decode.status !== 0) throw new Error(`recording.mp4 does not decode: ${(decode.stderr || String(decode.error || "")).trim().slice(-300)}`);
        // Screencast only sends a frame when the screen changes, so a still
        // desk is a low rate by design; a game that is moving should not be.
        for (const step of report.steps) {
          if (!step.wall) continue;
          const n = recorder.frames.filter((f) => f.t >= step.wall[0] && f.t <= step.wall[1]).length;
          step.screencast = { frames: n, fps: Math.round((n / Math.max(0.001, step.wall[1] - step.wall[0])) * 10) / 10, videoAt: Math.max(0, Math.round((step.wall[0] - info.t0) * 10) / 10) };
        }
        if (!args.keepFrames) rmSync(join(outDir, "frames"), { recursive: true, force: true });
        say(`video ${relative(ROOT, mp4)} ${info.seconds.toFixed(1)} s, ${info.frames} frames @ ${FPS} fps (screencast ${info.screencastFrames} frames ≈ ${info.screencastFps} fps)`);
      } catch (error) {
        report.video = { error: String(error.message || error) };
        failed = true;
        say(`FAIL video: ${error.message}`);
      }
    }
    report.finishedAt = new Date().toISOString();
    report.result = envError ? "error" : failed ? "fail" : "pass";
    writeReport();
    if (args.keepOpen && context && !envError) {
      say(`keeping the browser open${args.debugPort ? ` (CDP on ${args.debugPort})` : ""}; Ctrl-C to quit`);
      await new Promise((resolve) => { releaseKeepOpen = resolve; });
    }
    // A persistent GPU context can take half a minute to close; the run is
    // already written, so do not wait for it. (A persistent context has no
    // Browser object to ask for its process, so a straggler is found by its
    // profile directory.)
    if (context) {
      const closed = await Promise.race([context.close().then(() => true, () => true), sleep(5000).then(() => false)]);
      if (!closed) spawnSync("pkill", ["-9", "-f", `user-data-dir=${profileDir}`]);
    }
    browserClosed = true;
    if (server && server.exitCode === null && !server.signalCode) {
      const gone = new Promise((resolve) => server.once("exit", resolve));
      server.kill("SIGTERM");
      if (!await Promise.race([gone.then(() => true), sleep(3000).then(() => false)])) server.kill("SIGKILL");
    }
  }
  say(`${report.result.toUpperCase()} ${relative(ROOT, join(outDir, "steps.json"))}`);
  process.exit(envError ? 2 : failed ? 1 : 0);
}

main().catch((error) => { console.error(error); process.exit(2); });
