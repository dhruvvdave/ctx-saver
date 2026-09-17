import { launch, check, summary, sleep, store, SITE, PROFILES } from './lib.mjs';
const PROFILE = `${PROFILES}/prof3`;
let { ctx, sw, id } = await launch(PROFILE);

// Storage read via an extension page — survives service-worker restarts, and is
// the same view of the data the popup gets.
let reader = await ctx.newPage();
await reader.goto(`chrome-extension://${id}/popup/popup.html`);
const read = (keys = null) => reader.evaluate((k) => chrome.storage.local.get(k), keys);

let alarms = await sw.evaluate(() => chrome.alarms.getAll());
check('save alarm exists with a 5-minute period',
  alarms.length === 1 && alarms[0].name === 'ctx-save' && alarms[0].periodInMinutes === 5, JSON.stringify(alarms));

const before = (await sw.evaluate(() => chrome.alarms.get('ctx-save'))).scheduledTime;
for (const u of ['article.html','mdn.html','pr.html','search.html?q=test']) {
  const p = await ctx.newPage(); await p.goto(`${SITE}/${u}`); await p.waitForTimeout(350); await p.close();
}
await sleep(1500);
const after = (await sw.evaluate(() => chrome.alarms.get('ctx-save'))).scheduledTime;
check('alarm is NOT rescheduled by page activity (the starvation bug)', before === after,
  `scheduledTime ${before === after ? 'unchanged' : `moved ${after-before}ms`}`);

await sw.evaluate(() => chrome.alarms.create('ctx-save', { when: Date.now() + 1500 }));
await sleep(5000);
let saved = (await read(['offlineSessions'])).offlineSessions || [];
check('alarm fires and a session lands in chrome.storage.local', saved.length >= 1,
  `${saved.length} saved; "${(saved[0]?.summary||'').slice(0,50)}"`);
check('saved session has duration and pages',
  (saved[0]?.duration ?? -1) >= 0 && Object.keys(saved[0]?.tabs||{}).length > 0,
  `duration=${saved[0]?.duration}s pages=${Object.keys(saved[0]?.tabs||{}).length}`);

// ---- terminate the worker --------------------------------------------------
const stateBefore = (await read(['ctxState'])).ctxState;
const idBefore = stateBefore.session.id;
const pagesBefore = Object.keys(stateBefore.session.tabs).length;

const cdp = await ctx.newCDPSession(reader);
await cdp.send('ServiceWorker.enable');
await cdp.send('ServiceWorker.stopAllWorkers');
await sleep(3000);
let swAlive = true;
try { await sw.evaluate(() => 1); } catch { swAlive = false; }
check('service worker was genuinely terminated', !swAlive, swAlive ? 'still running' : 'context destroyed');

// A page load must wake it and be recorded — that is the whole point.
const wake = await ctx.newPage();
await wake.goto(`${SITE}/longtitle.html`);
await wake.waitForTimeout(4000);

const stateAfter = (await read(['ctxState'])).ctxState;
check('session survives worker termination (same id, nothing lost)',
  stateAfter.session.id === idBefore && Object.keys(stateAfter.session.tabs).length >= pagesBefore,
  `id ${stateAfter.session.id === idBefore ? 'same' : 'CHANGED'}, pages ${pagesBefore} -> ${Object.keys(stateAfter.session.tabs).length}`);
check('the woken worker recorded the new page',
  Object.values(stateAfter.session.tabs).some(t => (t.url||'').includes('longtitle.html')), '');

// Read alarms from the extension page: Playwright's worker handles do not
// survive a termination, but chrome.alarms is available to any extension page.
const alarmsAfter = await reader.evaluate(() => chrome.alarms.getAll());
check('alarm still registered after worker restart',
  !!alarmsAfter && alarmsAfter.some(a => a.name === 'ctx-save'), JSON.stringify(alarmsAfter));

const savedCount = ((await read(['offlineSessions'])).offlineSessions||[]).length;
await ctx.close();

// ---- full browser restart --------------------------------------------------
await sleep(1500);
({ ctx, sw, id } = await launch(PROFILE));
reader = await ctx.newPage();
await reader.goto(`chrome-extension://${id}/popup/popup.html`);
await sleep(1200);
const afterRestart = await reader.evaluate(() => chrome.storage.local.get(null));
check('saved sessions persist across a full browser restart',
  (afterRestart.offlineSessions||[]).length >= savedCount && savedCount > 0,
  `${savedCount} before -> ${(afterRestart.offlineSessions||[]).length} after`);
check('current session is resumed, not reset',
  afterRestart.ctxState?.session?.id === idBefore,
  afterRestart.ctxState?.session?.id === idBefore ? 'same id' : `new id ${afterRestart.ctxState?.session?.id}`);

const p = await ctx.newPage(); await p.goto(`${SITE}/secrets.html`); await p.waitForTimeout(2000);
const resumed = (await reader.evaluate(() => chrome.storage.local.get(['ctxState']))).ctxState.session;
check('tracking resumes after restart',
  Object.values(resumed.tabs).some(t=>(t.url||'').includes('secrets.html')), `${Object.keys(resumed.tabs).length} pages`);
const ar = await reader.evaluate(() => chrome.alarms.getAll());
check('alarm survives browser restart', !!ar && ar.some(a=>a.name==='ctx-save'), JSON.stringify(ar));

await ctx.close();
summary();
