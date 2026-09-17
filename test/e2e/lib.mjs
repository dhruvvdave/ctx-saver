import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '../..');
// CTX_EXT lets 06-packaged-build.mjs point the same harness at an unzipped build.
export const EXT = process.env.CTX_EXT || path.join(ROOT, 'packages/extension');
export const FIXTURES = path.join(HERE, 'fixtures');
export const PROFILES = path.join(HERE, '.profiles');
// Screenshots and debug dumps land here; the whole dir is gitignored.
export const ARTIFACTS = path.join(HERE, '.profiles/artifacts');
fs.mkdirSync(ARTIFACTS, { recursive: true });
export const SITE = process.env.CTX_SITE || 'http://127.0.0.1:8099';
export const results = [];
export function check(name, pass, detail='') {
  results.push({name, pass, detail});
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
  return pass;
}
export function summary() {
  const f = results.filter(r => !r.pass);
  console.log(`\n=== ${results.length - f.length}/${results.length} passed ===`);
  if (f.length) { console.log('FAILURES:'); f.forEach(r => console.log(' -', r.name, r.detail)); process.exitCode = 1; }
}
export async function launch(profile, opts={}) {
  const ctx = await chromium.launchPersistentContext(profile, {
    headless: true, channel: 'chromium',
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
    ...opts,
  });
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 20000 });
  const id = new URL(sw.url()).host;
  return { ctx, sw, id };
}
export const sleep = (ms) => new Promise(r => setTimeout(r, ms));
// Read extension storage from the service worker context.
export const store = (sw, keys=null) => sw.evaluate((k) => chrome.storage.local.get(k), keys);
