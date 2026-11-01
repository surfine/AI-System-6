#!/usr/bin/env node
// Real application shells and state fixtures; never opens engines or runs business actions.
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { chromium } from "playwright";
import { windowInterfaceRegistry } from "./interface-guidelines-contract.mjs";
import { lazyStyleBundles } from "./style-manifest.mjs";
import { controlFixtureUrl, installControlFixture } from "./lib/control-fixture.mjs";

const args = process.argv.slice(2);
const options = { output: "dist/verification/liquid-shapes" };
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === "--self-test") { options.selfTest = true; continue; }
  if (args[i] === "--primitives") { options.primitives = true; options.selectOnly = true; continue; }
  if (args[i] === "--select-only") { options.selectOnly = true; continue; }
  if (!["--url", "--output"].includes(args[i]) || !args[i + 1]) throw new Error("Usage: (--primitives | --url URL [--select-only]) [--output directory]");
  options[args[i].slice(2)] = args[++i];
}
if (options.selfTest && !options.primitives) throw new Error("--self-test requires --primitives");
if (options.primitives) options.url = controlFixtureUrl;
if (!options.url || !/^https?:$/.test(new URL(options.url).protocol)) throw new Error("--url must be an HTTP(S) application URL");
await mkdir(resolve(options.output), { recursive: true });
const output = options.primitives ? await mkdtemp(resolve(options.output, "primitives-")) : resolve(options.output);
const started = performance.now();
const report = { url: options.url, expectedWindows: options.selectOnly ? 0 : Object.keys(windowInterfaceRegistry).length, coveredWindows: 0, blockedBusinessRequests: 0, checks: [], failures: [] };
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce", deviceScaleFactor: 1 });
await context.route("**/*", (route) => {
  const request = route.request(), url = new URL(request.url());
  if (!["GET", "HEAD"].includes(request.method()) || url.pathname.startsWith("/api/") || (["fetch", "xhr"].includes(request.resourceType()) && url.origin !== new URL(options.url).origin)) {
    report.blockedBusinessRequests += 1;
    return route.fulfill({ status: 200, contentType: "application/json", body: '{"models":[],"available":false}' });
  }
  return route.continue();
});
await context.addInitScript(() => localStorage.setItem("ai-system-6-theme", "liquid-glass"));
const page = await context.newPage();
if (options.primitives) page.setDefaultTimeout(5000);
const failure = (scene, message) => report.failures.push({ scene, message });
function selectPaintState(wrap) {
  const draws = (el, pseudo) => { const s = getComputedStyle(el, pseudo); return s.display !== "none" && s.visibility !== "hidden" && !["none", "normal"].includes(s.content) && Number(s.opacity) > 0; };
  const control = wrap.querySelector("button.system-select-button") || wrap.querySelector("select"), s = getComputedStyle(control);
  const backgroundArrows = (s.backgroundImage.match(/url\(/g) || []).length;
  const nativeArrow = control.tagName === "SELECT" && s.appearance !== "none"
    && (s.appearance !== "base-select" || getComputedStyle(control, "::picker-icon").display !== "none");
  const count = Number(draws(wrap, "::after")) + Number(draws(control, "::after")) + backgroundArrows + Number(nativeArrow);
  const hiddenNative = wrap.querySelector("button") && wrap.querySelector("select");
  return { kind: control.tagName, disabled: control.disabled, count, font: s.fontFamily, size: s.fontSize, weight: s.fontWeight, uiFont: getComputedStyle(document.querySelector("#shape-button")).fontFamily, controlSize: s.getPropertyValue("--system-control-size").trim(), modern: document.body.classList.contains("use-modern-fonts"), duplicateControl: !!hiddenNative && Number(getComputedStyle(hiddenNative).opacity) > 0 };
}
function badSelectType(result) {
  return result.font !== result.uiFont || result.size !== result.controlSize || (result.modern && result.weight !== "400");
}
function badSelectPaint(result) { return result.count !== 1 || result.duplicateControl; }
async function inspect(scene, selector) {
  const result = await page.evaluate((rootSelector) => {
    const root = document.querySelector(rootSelector);
    if (!root) return { error: `Missing root: ${rootSelector}`, tested: 0, failures: [] };
    const controls = 'button,input:not([type="hidden"]),textarea,select,summary,[role="button"]';
    const excluded = '.sys-icon,.icon,.mini-icon,.clio-chat-file-mark,svg,img';
    const visible = (el) => {
      if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true, contentVisibilityAuto: true }) || el.closest('[hidden],.is-hidden,[aria-hidden="true"]')) return false;
      const r = el.getBoundingClientRect();
      let left = Math.max(0, r.left), top = Math.max(0, r.top), right = Math.min(innerWidth, r.right), bottom = Math.min(innerHeight, r.bottom);
      for (let p = el.parentElement; p; p = p.parentElement) {
        const s = getComputedStyle(p), b = p.getBoundingClientRect();
        if (s.display === "none" || s.visibility !== "visible" || Number(s.opacity) === 0) return false;
        if (/(hidden|clip|auto|scroll)/.test(s.overflowX)) { left = Math.max(left, b.left); right = Math.min(right, b.right); }
        if (/(hidden|clip|auto|scroll)/.test(s.overflowY)) { top = Math.max(top, b.top); bottom = Math.min(bottom, b.bottom); }
      }
      return r.width > 0 && r.height > 0 && right > left && bottom > top;
    };
    if (!visible(root)) return { error: `Root not visible: ${rootSelector}`, tested: 0, failures: [] };
    const opaque = (color) => color !== "transparent" && !/(?:^rgba\([^)]*,|\/)\s*0(?:\.0+)?\s*\)$/.test(color);
    const identify = (el) => {
      if (el.id) return `#${CSS.escape(el.id)}`;
      const parts = [];
      for (let p = el; p && p !== root; p = p.parentElement) {
        let part = p.tagName.toLowerCase() + [...p.classList].map(c => `.${CSS.escape(c)}`).join("");
        if (p.parentElement) part += `:nth-child(${[...p.parentElement.children].indexOf(p) + 1})`;
        parts.unshift(part);
      }
      return `${rootSelector}${parts.length ? " > " + parts.join(" > ") : ""}`;
    };
    const result = { tested: 0, failures: [] };
    for (const el of [root, ...root.querySelectorAll("*")]) {
      if (!(el instanceof HTMLElement) || el.closest(excluded) || !visible(el)) continue;
      const s = getComputedStyle(el);
      const edges = ["Top", "Right", "Bottom", "Left"].filter(side => parseFloat(s[`border${side}Width`]) > 0 && !["none", "hidden"].includes(s[`border${side}Style`]) && opaque(s[`border${side}Color`]));
      // A fill alone is not a panel: clipped layout children must not become false positives.
      if (!el.matches(controls) && edges.length < 3) continue;
      result.tested += 1;
      const corners = ["TopLeft", "TopRight", "BottomRight", "BottomLeft"].map(c => s[`border${c}Radius`]);
      if (corners.some(value => value.split(/\s+/).some(v => !(parseFloat(v) > 0)))) result.failures.push({ selector: identify(el), corners, kind: el.matches(controls) ? "control" : "bordered-surface" });
    }
    return result;
  }, selector);
  report.checks.push({ scene, tested: result.tested });
  if (result.error) failure(scene, result.error);
  for (const item of result.failures) report.failures.push({ scene, ...item });
  return !result.error;
}
async function showWindow(id) {
  await page.evaluate((name) => {
    for (const win of document.querySelectorAll(".window")) { win.classList.add("is-hidden"); win.classList.remove("is-active"); }
    const win = document.querySelector(`.window[data-window="${CSS.escape(name)}"]`);
    if (!win) throw new Error(`Registered window missing: ${name}`);
    win.hidden = false;
    win.removeAttribute("aria-hidden");
    win.classList.remove("is-hidden", "is-collapsed");
    win.classList.add("is-active");
    if (win instanceof HTMLDialogElement && !win.open) win.show();
    win.style.left = "24px";
    win.style.top = "40px";
    if (typeof clampWindowToViewport === "function") clampWindowToViewport(win);
  }, id);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
try {
  if (options.primitives) await installControlFixture(context);
  await page.goto(options.url, { waitUntil: "domcontentloaded" });
  if (!options.primitives) await page.waitForFunction(() => document.body.dataset.appReady === "ready", null, { timeout: 60000 });
  await page.evaluate(() => {
    for (const dialog of document.querySelectorAll("dialog[open]")) dialog.close();
    window.AISystem6Theme.applyTheme("liquid-glass", { persist: false, announce: false });
  });
  if (!options.selectOnly) {
    for (const [id, entry] of Object.entries(windowInterfaceRegistry)) {
      if (entry.ensure !== "loadLazyWindowModule") continue;
      try {
        await page.evaluate(async (name) => {
          if (!await loadLazyWindowAppearanceShell(name)) throw new Error(`Appearance shell not installed: ${name}`);
        }, id);
      } catch (error) { failure(`mount:${id}`, error.message); }
    }
    await page.evaluate(async (bundles) => {
      await Promise.all(bundles.map(bundle => new Promise((resolve, reject) => {
        let link = [...document.querySelectorAll('link[rel="stylesheet"]')].find(el => new URL(el.href).pathname.endsWith(`/${bundle.output}`));
        if (link?.sheet) return resolve();
        const added = !link;
        if (!link) { link = document.createElement("link"); link.rel = "stylesheet"; link.href = bundle.output; }
        link.addEventListener("load", resolve, { once: true });
        link.addEventListener("error", () => reject(new Error(`Stylesheet failed: ${bundle.output}`)), { once: true });
        const timer = setTimeout(() => reject(new Error(`Stylesheet timeout: ${bundle.output}`)), 15000);
        link.addEventListener("load", () => clearTimeout(timer), { once: true });
        if (added) document.head.append(link);
      })));
    }, lazyStyleBundles);
    const unknown = await page.locator(".window[data-window]").evaluateAll((nodes, known) => nodes.map(el => el.dataset.window).filter(id => !known.includes(id)), Object.keys(windowInterfaceRegistry));
    for (const id of unknown) failure("registry", `Unregistered window: ${id}`);
    for (const id of Object.keys(windowInterfaceRegistry)) {
      try {
        await showWindow(id);
        if (await inspect(`desktop:${id}`, `.window[data-window="${id}"]`)) report.coveredWindows += 1;
        if (["control", "bonsaiCity"].includes(id)) await page.screenshot({ path: join(output, `desktop-${id}.png`) });
      } catch (error) { failure(`desktop:${id}`, error.message); }
    }
    await page.evaluate(() => {
      renderAppMenuBar("finder", { force: true });
      const menu = document.querySelector('.menu > button[data-i18n="menu_file"]')?.closest(".menu");
      if (!menu) throw new Error("File menu is missing");
      menu.classList.add("is-open");
    });
    await inspect("desktop:file-menu", ".menu.is-open .menu-popover");
    await page.evaluate(() => document.querySelectorAll(".menu.is-open").forEach(el => el.classList.remove("is-open")));
    for (const selector of ["#system-modal", "#startup-settings-modal"]) {
      await page.locator(selector).evaluate(el => el.showModal());
      await inspect(`desktop:dialog:${selector}`, selector);
      await page.locator(selector).evaluate(el => el.close());
    }
  }
  await page.evaluate(() => {
    for (const win of document.querySelectorAll(".window")) win.classList.add("is-hidden");
    const fixture = document.createElement("section");
    fixture.id = "liquid-shape-fixture";
    fixture.className = "window-pane";
    fixture.lang = "zh-Hans";
    fixture.style.cssText = "position:fixed;left:40px;top:60px;width:420px;padding:24px;display:grid;gap:12px;background:white;z-index:99999";
    fixture.innerHTML = '<button id="shape-button" class="btn">Button</button><button class="btn" disabled>Disabled button</button><input id="shape-field" type="text" value="Field"><input type="text" disabled value="Disabled field"><textarea id="shape-textarea">Text</textarea><div class="control-section"><label><input type="checkbox" checked> Checkbox</label><label><input type="radio" checked> Radio</label></div><span class="select-wrap" id="shape-custom-wrap"><select id="shape-custom"><option>星光白色 · Custom</option><option>Second</option></select></span><span class="select-wrap"><select disabled><option>Disabled custom select</option></select></span>';
    document.body.append(fixture);
    initSystemSelectControls();
    fixture.insertAdjacentHTML("beforeend", '<span class="select-wrap" id="shape-native-wrap"><select id="shape-native"><option>合盖 · Native</option></select></span><span class="select-wrap"><select disabled><option>Disabled native select</option></select></span>');
  });
  await inspect("fixture:default-disabled", "#liquid-shape-fixture");
  for (const selector of ["#shape-button", "#shape-field", "#shape-textarea", "#shape-custom-wrap .system-select-button", "#shape-native"]) {
    await page.keyboard.press("Tab");
    await page.locator(selector).focus();
    if (!await page.locator(selector).evaluate(el => el.matches(":focus-visible"))) failure("fixture:focus-visible", `Focus-visible not reached: ${selector}`);
    await inspect(`fixture:focus:${selector}`, "#liquid-shape-fixture");
  }
  const arrowAsset = await page.evaluate(async () => {
    const image = new Image();
    image.src = new URL("assets/select-arrow.svg", location.href).href;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 17;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0);
    return { corners: [[0, 0], [16, 0], [0, 16], [16, 16]].map(([x, y]) => ctx.getImageData(x, y, 1, 1).data[3]), ink: ctx.getImageData(8, 8, 1, 1).data[3] };
  });
  if (arrowAsset.corners.some(alpha => alpha !== 0) || arrowAsset.ink === 0) failure("select:asset", "Arrow must have visible ink and transparent corners");
  // Arrow ownership is shared across appearances. Check both initialization paths
  // and disabled controls, so a theme-only fix cannot conceal another duplicate.
  for (const theme of ["classic", "platinum", "aqua", "snow-leopard", "yosemite", "liquid-glass"]) {
    await page.evaluate(theme => window.AISystem6Theme.applyTheme(theme, { persist: false, announce: false }), theme);
    for (const state of ["default", "hover", "focus"]) {
      const controls = page.locator("#liquid-shape-fixture .select-wrap");
      for (let i = 0; i < await controls.count(); i += 1) {
        const wrap = controls.nth(i);
        // Use the actual painted element; native controls under the harness have opacity zero.
        const target = await wrap.locator("button.system-select-button").count() ? wrap.locator("button.system-select-button") : wrap.locator("select");
        if (state === "hover") await target.hover();
        if (state === "focus" && await target.isEnabled()) await target.focus();
        const result = await wrap.evaluate(selectPaintState);
        report.checks.push({ scene: `select:${theme}:${state}:${i}`, ...result });
        if (badSelectType(result)) failure(`select-type:${theme}:${state}:${i}`, JSON.stringify(result));
        if (badSelectPaint(result)) failure(`select:${theme}:${state}:${i}`, JSON.stringify(result));
        await target.evaluate(el => el.blur());
        await page.mouse.move(0, 0);
      }
    }
    if (!options.primitives) await page.screenshot({ path: join(output, `select-states-${theme}.png`) });
  }
  await page.locator("#shape-custom-wrap .system-select-button").click();
  await page.waitForFunction(() => getComputedStyle(document.querySelector("#shape-custom-wrap .system-select-menu")).opacity === "1", null, { timeout: 3000 });
  await inspect("fixture:open-select", "#shape-custom-wrap .system-select-menu");
  await page.locator("#shape-custom-wrap .system-select-option").nth(1).click();
  const selected = await page.locator("#shape-custom-wrap").evaluate(wrap => {
    const select = wrap.querySelector("select"), button = wrap.querySelector("button");
    const chosen = select.selectedIndex === 1 && button.textContent === select.selectedOptions[0].textContent && button.getAttribute("aria-expanded") === "false";
    select.value = select.options[0].value;
    return chosen && button.textContent === select.selectedOptions[0].textContent;
  });
  report.checks.push({ scene: "fixture:selection-and-programmatic-label", passed: selected });
  if (!selected) failure("fixture:selection-and-programmatic-label", "Visible label drifted from the native value");
  if (options.selfTest) {
    // Reintroduce the observed defects in the browser, then ask the same
    // production checks to reject them. Never alter repository sources.
    const proofs = [
      ["duplicate-arrow", "#shape-native-wrap::after { display:block }", "#shape-native-wrap", badSelectPaint],
      ["focus-erases-arrow", "#shape-native:focus { background:white }", "#shape-native-wrap", badSelectPaint],
      ["content-font-in-control", "#shape-native { font-family:serif }", "#shape-native-wrap", badSelectType],
      ["custom-bold-drift", "#shape-custom-wrap .system-select-button { font-weight:700 }", "#shape-custom-wrap", badSelectType],
      ["hidden-native-reappears", "#shape-custom-wrap select { opacity:1 }", "#shape-custom-wrap", badSelectPaint],
      ["square-glass", "#shape-button { border-radius:0 }", "#shape-button", null],
    ];
    report.selfTests = [];
    for (const [name, css, selector, rejects] of proofs) {
      const style = await page.addStyleTag({ content: css });
      await page.locator("#shape-native").focus();
      let rejected;
      if (rejects) rejected = rejects(await page.locator(selector).evaluate(selectPaintState));
      else {
        const before = report.failures.length;
        await inspect(`self-test:${name}`, selector);
        rejected = report.failures.length > before;
        report.failures.splice(before);
      }
      await style.evaluate(el => el.remove());
      report.selfTests.push({ name, rejected });
      if (!rejected) failure(`self-test:${name}`, "Regression escaped the control gate");
    }
  }
  if (!options.primitives || report.failures.length) await page.screenshot({ path: join(output, "control-states.png") });
  await page.locator("#liquid-shape-fixture").evaluate(el => el.remove());
  for (const viewport of (options.selectOnly ? [] : [{ width: 390, height: 760 }, { width: 844, height: 390 }])) {
    await page.setViewportSize(viewport);
    await page.evaluate(async () => {
      const win = document.querySelector('.window[data-window="control"]');
      // Remove desktop fixture placement so responsive CSS and the real window
      // manager own the mobile frame (including the centered floating panel).
      for (const name of ["left", "top", "width", "height", "max-height"]) win.style.removeProperty(name);
      await openWindow("control");
    });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const scene = `${viewport.width}x${viewport.height}`;
    const fits = await page.locator('.window[data-window="control"]').evaluate(el => {
      const r = el.getBoundingClientRect();
      return r.left >= -1 && r.top >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1;
    });
    if (!fits) failure(`${scene}:control`, "Control Panel extends beyond the viewport");
    await inspect(`${scene}:control`, '.window[data-window="control"]');
    await inspect(`${scene}:shared-chrome`, ".menu-bar");
    await page.screenshot({ path: join(output, `${scene}-control.png`) });
  }
} catch (error) { failure("setup-or-fixture", error.stack || error.message); }
finally {
  await browser.close();
  await writeFile(join(output, "report.json"), JSON.stringify(report, null, 2) + "\n");
}
console.log(`${options.primitives ? "UI primitives" : "Liquid shapes"}: ${report.coveredWindows}/${report.expectedWindows} windows, ${report.checks.length} scenes, ${report.failures.length} failures (${((performance.now() - started) / 1000).toFixed(1)}s). ${join(output, "report.json")}`);
for (const item of report.failures) console.error(`${item.scene}: ${item.selector || item.message}${item.corners ? ` [${item.corners.join(", ")}]` : ""}`);
process.exitCode = report.failures.length ? 1 : 0;
