// Real browser adapter contracts, not a substitute for full-app/theme smoke.
// Uses the same case data in Chromium and WebKit; does not require a server.
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (path) => readFile(resolve(root, path), "utf8");
const { chromium, webkit } = await import(process.env.WINDOWSHADE_PLAYWRIGHT_MODULE || "@playwright/test");
const engineName = process.env.WINDOWSHADE_BROWSER || "chromium";
if (!["chromium", "webkit"].includes(engineName)) throw new Error("WINDOWSHADE_BROWSER must be chromium or webkit");
const engine = engineName === "webkit" ? webkit : chromium;
const browser = await engine.launch({
  headless: true,
  ...(process.env.WINDOWSHADE_BROWSER_EXECUTABLE ? { executablePath: process.env.WINDOWSHADE_BROWSER_EXECUTABLE } : {}),
});
const fixture = await read("tests/fixtures/windowshade-adapter.html");
const moduleSource = await read("apps/desktop/app/core/windowshade.js");
const entrySource = await read("apps/desktop/app/core/windowshade-entry.js");
const cases = JSON.parse(await read("tests/fixtures/windowshade-cases.json"));
const results = [];
const prefix = `const api=window.AISystem6WindowShade; const win=getWindow('first');
const check=(condition,message)=>{if(!condition)throw new Error(message);};
const rect=()=>{const b=win.getBoundingClientRect(),p=win.offsetParent,r=p.getBoundingClientRect();return {left:b.left-r.left-p.clientLeft+p.scrollLeft,top:b.top-r.top-p.clientTop+p.scrollTop,width:b.width,height:b.height}};
const same=(a,b)=>['left','top','width','height'].every(k=>Math.abs(a[k]-b[k])<1);
const tick=()=>new Promise(r=>setTimeout(r,30));\n`;
try {
  for (const contract of cases) {
    const page = await browser.newPage({ viewport: { width: 1800, height: 1000 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    try {
      await page.setContent(fixture);
      await page.evaluate((source) => { window.fixtureWindowShadeSource = source; }, moduleSource);
      await page.addScriptTag({ content: entrySource });
      if (!contract.cold) await page.evaluate(() => ensureLazySystemModule("app/core/windowshade.js", "AISystem6WindowShadeLoaded"));
      for (const step of contract.steps) {
        if (step.viewport) await page.setViewportSize({ width: step.viewport[0], height: step.viewport[1] });
        if (step.wait) await page.waitForTimeout(step.wait);
        if (step.evaluate) await page.evaluate(`async () => { ${prefix}${step.evaluate} }`);
      }
      if (errors.length) throw new Error(errors.join("\n"));
      results.push({ name: contract.name, ok: true });
      console.log(`PASS ${contract.name}`);
    } catch (error) {
      results.push({ name: contract.name, ok: false, error: String(error) });
      console.error(`FAIL ${contract.name}: ${error}`);
    } finally { await page.close(); }
  }
} finally { await browser.close(); }
const output = resolve(root, "dist/verification/windowshade");
await mkdir(output, { recursive: true });
await writeFile(resolve(output, `${engineName}.json`), JSON.stringify({ engine: engineName, scope: "adapter fixture, not full application", results }, null, 2) + "\n");
console.log(`${results.filter((r) => r.ok).length}/${results.length} ${engineName} adapter contracts passed`);
if (results.some((r) => !r.ok)) process.exitCode = 1;
