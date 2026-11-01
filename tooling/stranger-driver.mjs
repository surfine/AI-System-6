// Throwaway lane harness: keeps one clean browser alive so a stranger-walk
// session can act step by step and save every frame it sees.
import { chromium } from 'playwright';
import { mkdir, readdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';

const ROOT = '/private/tmp/ais6-stranger';
const QUEUE = '/private/tmp/ais6-stranger-queue';
const SHOTS = path.join(ROOT, 'internal/evidence/drafts/stranger-walk');
const PROFILE = '/private/tmp/ais6-stranger-profile';

await rm(PROFILE, { recursive: true, force: true });
await mkdir(QUEUE, { recursive: true });
await mkdir(SHOTS, { recursive: true });

const context = await chromium.launchPersistentContext(PROFILE, {
  headless: true,
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 2,
});
const page = context.pages()[0] ?? (await context.newPage());
const consoleErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300));
});
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + String(e).slice(0, 300)));

const shot = async (name) => {
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
  return `${name}.png`;
};

console.log('driver ready');

for (;;) {
  const files = (await readdir(QUEUE)).filter((f) => f.startsWith('cmd-')).sort();
  for (const f of files) {
    const src = await readFile(path.join(QUEUE, f), 'utf8');
    const outName = f.replace('cmd-', 'out-').replace('.mjs', '.json');
    let result;
    try {
      const fn = new Function('page', 'context', 'shot', 'consoleErrors', `return (async () => { ${src} })();`);
      result = { ok: true, value: await fn(page, context, shot, consoleErrors) };
    } catch (err) {
      result = { ok: false, error: String(err).slice(0, 1200) };
    }
    await writeFile(path.join(QUEUE, outName), JSON.stringify(result, null, 2));
    await rm(path.join(QUEUE, f));
  }
  await new Promise((r) => setTimeout(r, 300));
}
