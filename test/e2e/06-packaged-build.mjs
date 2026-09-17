import { chromium } from 'playwright';
import { check, summary, sleep, SITE, PROFILES, ARTIFACTS } from './lib.mjs';
const EXT = process.env.CTX_EXT_ZIP || `${PROFILES}/unpacked`;
const errors = [];
const ctx = await chromium.launchPersistentContext(`${PROFILES}/profZ`, {
  headless: true, channel: 'chromium',
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});
ctx.on('page', p => {
  p.on('pageerror', e => errors.push(`pageerror ${p.url()}: ${e.message}`));
  p.on('console', m => { if (m.type()==='error' && !/net::|Failed to load resource/.test(m.text())) errors.push(`${p.url()}: ${m.text()}`); });
});
let [sw] = ctx.serviceWorkers();
if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 20000 });
sw.on('console', m => { if (m.type()==='error') errors.push(`SW: ${m.text()}`); });
const id = new URL(sw.url()).host;
check('extension loads from the zip on a clean profile', !!id, `id=${id}`);

const mf = await sw.evaluate(() => chrome.runtime.getManifest());
check('manifest v3, version 1.0.1', mf.manifest_version === 3 && mf.version === '1.0.1', `v${mf.version} mv${mf.manifest_version}`);
check('no unused permissions', JSON.stringify(mf.permissions) === '["storage","alarms","unlimitedStorage"]', JSON.stringify(mf.permissions));
check('host permissions scoped to the local backend',
  JSON.stringify(mf.host_permissions) === '["http://localhost:7331/*","http://127.0.0.1:7331/*"]', JSON.stringify(mf.host_permissions));

for (const u of ['article.html','mdn.html','pr.html']) { const p = await ctx.newPage(); await p.goto(`${SITE}/${u}`); await p.waitForTimeout(700); }
await sleep(4500);

const popup = await ctx.newPage();
await popup.setViewportSize({width:380,height:540});
await popup.goto(`chrome-extension://${id}/popup/popup.html`);
await popup.waitForTimeout(2500);
check('popup opens from the zipped build', (await popup.title()) === 'ctx', await popup.title());
check('popup renders tracked pages', (await popup.locator('.row').count()) >= 3, `${await popup.locator('.row').count()} rows`);
const fonts = await popup.evaluate(async () => { await document.fonts.ready; return [...document.fonts].map(f=>`${f.family}:${f.status}`); });
check('bundled fonts load from inside the zip', fonts.length===2 && fonts.every(f=>f.endsWith(':loaded')), fonts.join(', '));
check('privacy rules module loaded in popup', await popup.evaluate(()=>!!globalThis.CTX_PRIVACY), '');
const rules = await popup.evaluate(()=>globalThis.CTX_PRIVACY.stats);
check('privacy rules intact after zipping', rules.domains === 301, JSON.stringify(rules));

for (const t of ['sessions','privacy','live']) { await popup.click(`#tab-${t}`); await popup.waitForTimeout(700); }
check('all three tabs render without error', true, '');
check('NO console or page errors from the zipped build', errors.length === 0, errors.slice(0,4).join(' | '));
await popup.screenshot({ path: `${ARTIFACTS}/zip-popup.png` });
await ctx.close();
summary();
