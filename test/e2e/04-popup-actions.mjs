import { launch, check, summary, sleep, SITE, PROFILES } from './lib.mjs';
const errors = [];
const { ctx, sw, id } = await launch(`${PROFILES}/prof4`);
ctx.on('page', p => {
  p.on('pageerror', e => errors.push(`${p.url()}: ${e.message}`));
  p.on('console', m => { if (m.type()==='error' && !/net::|Failed to load resource/.test(m.text())) errors.push(`${p.url()}: ${m.text()}`); });
});

const browse = async (list) => { for (const u of list) { const p = await ctx.newPage(); await p.goto(`${SITE}/${u}`); await p.waitForTimeout(600); } };
await browse(['article.html','mdn.html','pr.html']);
await sleep(1000);

const openPopup = async () => {
  const p = await ctx.newPage();
  await p.setViewportSize({width:380, height:540});
  await p.goto(`chrome-extension://${id}/popup/popup.html`);
  await p.waitForTimeout(1500);
  return p;
};
const read = async (keys) => (await ctx.pages()[0].evaluate((k)=>chrome.storage.local.get(k), keys));

// ===== BUG 1: Discard must NOT save =========================================
let popup = await openPopup();
let savedBefore = ((await popup.evaluate(()=>chrome.storage.local.get(['offlineSessions']))).offlineSessions||[]).length;
let stateBefore = (await popup.evaluate(()=>chrome.storage.local.get(['ctxState']))).ctxState;

await popup.click('#btn-discard');
await popup.waitForTimeout(300);
const armedLabel = await popup.textContent('#btn-discard');
check('Discard requires a second click to confirm', /discard\?/i.test(armedLabel), `label="${armedLabel}"`);
await popup.click('#btn-discard');
await popup.waitForTimeout(1200);

const afterDiscard = await popup.evaluate(()=>chrome.storage.local.get(null));
check('BUG 1 FIXED — Discard does NOT write a session to history',
  (afterDiscard.offlineSessions||[]).length === savedBefore,
  `history ${savedBefore} -> ${(afterDiscard.offlineSessions||[]).length}`);
check('BUG 1 FIXED — Discard starts a brand-new empty session',
  afterDiscard.ctxState.session.id !== stateBefore.session.id &&
  Object.keys(afterDiscard.ctxState.session.tabs).length === 0,
  `id changed=${afterDiscard.ctxState.session.id !== stateBefore.session.id}, pages=${Object.keys(afterDiscard.ctxState.session.tabs).length}`);
check('Discard shows a confirmation flash', await popup.textContent('#flash') === 'Session discarded', '');

// ===== Save Session does save ===============================================
await popup.close();
await browse(['longtitle.html','secrets.html']);
await sleep(3500);
popup = await openPopup();
savedBefore = ((await popup.evaluate(()=>chrome.storage.local.get(['offlineSessions']))).offlineSessions||[]).length;
await popup.click('#btn-save');
await popup.waitForTimeout(1500);
const afterSave = await popup.evaluate(()=>chrome.storage.local.get(null));
check('Save Session files the session to history',
  (afterSave.offlineSessions||[]).length === savedBefore + 1,
  `history ${savedBefore} -> ${(afterSave.offlineSessions||[]).length}`);
check('Save Session then starts a fresh session',
  Object.keys(afterSave.ctxState.session.tabs).length === 0, '');
check('save flash appears', await popup.getAttribute('#flash','data-show') !== null, await popup.textContent('#flash'));

// ===== BUG 2 area: CLEAR_SESSIONS is reachable and scoped ===================
await popup.click('#tab-sessions'); await popup.waitForTimeout(800);
const sessionCards = await popup.locator('.session').count();
check('Sessions tab renders saved sessions', sessionCards >= 1, `${sessionCards} cards`);
const stateKeep = (await popup.evaluate(()=>chrome.storage.local.get(['ctxState']))).ctxState.session.id;
await popup.click('#btn-clear-history'); await popup.waitForTimeout(250);
check('Clear-history requires a second click', /delete all\?/i.test(await popup.textContent('#btn-clear-history')), '');
await popup.click('#btn-clear-history'); await popup.waitForTimeout(1200);
const afterClear = await popup.evaluate(()=>chrome.storage.local.get(null));
check('Clear history empties saved sessions', (afterClear.offlineSessions||[]).length === 0, `${(afterClear.offlineSessions||[]).length} left`);
check('Clear history leaves the CURRENT session alone',
  afterClear.ctxState.session.id === stateKeep, 'current session untouched');

// ===== blocklist add/remove takes effect on the next page load ==============
await popup.click('#tab-privacy'); await popup.waitForTimeout(500);
await popup.fill('#blocklist-input', 'https://127.0.0.1/some/path');
await popup.click('#blocklist-add');
await popup.waitForTimeout(700);
const bl = (await popup.evaluate(()=>chrome.storage.local.get(['customBlocklist']))).customBlocklist;
check('blocklist input normalises a pasted URL to a bare domain', JSON.stringify(bl) === '["127.0.0.1"]', JSON.stringify(bl));

const t = await ctx.newPage(); await t.goto(`${SITE}/mdn.html`); await t.waitForTimeout(1800);
let s = (await popup.evaluate(()=>chrome.storage.local.get(['ctxState']))).ctxState.session;
check('custom blocklist takes effect on the NEXT page load, no extension reload',
  !Object.values(s.tabs).some(x=>(x.url||'').includes('mdn.html')) && (s.blockedDomains||[]).includes('127.0.0.1'),
  `pages=${Object.keys(s.tabs).length} blocked=${JSON.stringify(s.blockedDomains)}`);
await t.close();

await popup.locator('.blocklist-row .x-btn').first().click();
await popup.waitForTimeout(700);
const bl2 = (await popup.evaluate(()=>chrome.storage.local.get(['customBlocklist']))).customBlocklist;
check('blocklist removal persists', (bl2||[]).length === 0, JSON.stringify(bl2));
const t2 = await ctx.newPage(); await t2.goto(`${SITE}/article.html`); await t2.waitForTimeout(1800);
s = (await popup.evaluate(()=>chrome.storage.local.get(['ctxState']))).ctxState.session;
check('tracking resumes after removing the domain',
  Object.values(s.tabs).some(x=>(x.url||'').includes('article.html')), `${Object.keys(s.tabs).length} pages`);

// ===== pause toggle =========================================================
await popup.click('#tab-privacy'); await popup.waitForTimeout(400);
await popup.check('#opt-pause'); await popup.waitForTimeout(600);
const t3 = await ctx.newPage(); await t3.goto(`${SITE}/pr.html`); await t3.waitForTimeout(1800);
s = (await popup.evaluate(()=>chrome.storage.local.get(['ctxState']))).ctxState.session;
check('Pause all tracking stops capture entirely',
  !Object.values(s.tabs).some(x=>(x.url||'').includes('pr.html')), `${Object.keys(s.tabs).length} pages`);
await popup.uncheck('#opt-pause'); await popup.waitForTimeout(400);

// ===== highlight toggle =====================================================
await popup.uncheck('#opt-highlights'); await popup.waitForTimeout(500);
const t4 = await ctx.newPage(); await t4.goto(`${SITE}/secrets.html`); await t4.waitForTimeout(1200);
await t4.evaluate(()=>{const r=document.createRange();r.selectNodeContents(document.querySelector('#a'));const s=getSelection();s.removeAllRanges();s.addRange(r);});
await t4.dispatchEvent('body','mouseup'); await t4.waitForTimeout(800);
s = (await popup.evaluate(()=>chrome.storage.local.get(['ctxState']))).ctxState.session;
check('highlight capture can be switched off', (s.highlights||[]).length === 0, `${(s.highlights||[]).length} highlights`);

// ===== link indicator matches whichever state the optional backend is in =====
const backendUp = await fetch('http://127.0.0.1:7331/', { signal: AbortSignal.timeout(1500) })
  .then((r) => r.ok).catch(() => false);
await popup.reload();
await popup.waitForTimeout(2200);
const label = (await popup.textContent('#link-label')).trim();
check(`link indicator reads "${backendUp ? 'cli link' : 'cli off'}" (backend ${backendUp ? 'up' : 'down'})`,
  label === (backendUp ? 'cli link' : 'cli off'), `shows "${label}"`);

check('no popup console/page errors', errors.length === 0, errors.slice(0,3).join(' | '));
await ctx.close();
summary();
