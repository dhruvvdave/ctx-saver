import { launch, check, summary, sleep, store, SITE, PROFILES, ARTIFACTS } from './lib.mjs';
import fs from 'fs';

const errors = [];
const { ctx, sw, id } = await launch(`${PROFILES}/prof1`);
ctx.on('page', p => {
  p.on('pageerror', e => errors.push(`pageerror ${p.url()}: ${e.message}`));
  p.on('console', m => { if (m.type()==='error') errors.push(`console ${p.url()}: ${m.text()}`); });
});
sw.on('console', m => { if (m.type()==='error') errors.push(`SW console: ${m.text()}`); });

// ---- browse across several tabs -------------------------------------------
const urls = ['article.html','mdn.html','pr.html','longtitle.html','search.html?q=jwt+expiry+nodejs'];
const pages = [];
for (const u of urls) {
  const p = await ctx.newPage();
  await p.goto(`${SITE}/${u}`, { waitUntil: 'load' });
  await p.waitForTimeout(400);
  pages.push(p);
}
// simulate reading: scroll + dwell, switching focus between tabs
for (const p of pages) {
  await p.bringToFront();
  await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.8));
  await p.waitForTimeout(1500);
}
await pages[0].bringToFront();
await pages[0].waitForTimeout(1500);
await pages[1].bringToFront();   // forces PAGE_LEAVE flush on pages[0]
await pages[1].waitForTimeout(4200);  // exceed FIRST_BEAT_MS so heartbeats land

let st = await store(sw, ['ctxState']);
let session = st.ctxState?.session;
const tracked = Object.values(session?.tabs || {});
check('session persisted to chrome.storage.local', !!session?.id, `id=${session?.id}`);
check('pages tracked across tabs', tracked.length >= 5, `${tracked.length} pages`);
check('time spent accumulates', tracked.some(t => (t.timeSpent||0) > 0),
  'max=' + Math.max(0,...tracked.map(t=>t.timeSpent||0)) + 's');
check('scroll depth recorded', tracked.some(t => (t.scrollDepth||0) > 50),
  'max=' + Math.max(0,...tracked.map(t=>t.scrollDepth||0)) + '%');
check('search query captured', (session.searchQueries||[]).includes('jwt expiry nodejs'),
  JSON.stringify(session.searchQueries));

// ---- privacy gating --------------------------------------------------------
const blockedFixtures = [
  ['login.html', 'URL pattern /login'],
  ['secretform.html', 'password field'],
  ['results.html', 'health title heuristic'],
  ['taxes.html', 'tax title heuristic'],
];
for (const [u, why] of blockedFixtures) {
  const p = await ctx.newPage();
  await p.goto(`${SITE}/${u}`, { waitUntil: 'load' });
  await p.waitForTimeout(700);
  await p.close();
}
// late-rendered password field
const lp = await ctx.newPage();
await lp.goto(`${SITE}/late.html`, { waitUntil: 'load' });
await lp.waitForTimeout(3200);

st = await store(sw, ['ctxState']);
session = st.ctxState.session;
const allUrls = Object.values(session.tabs).map(t => t.url || '');
const blocked = session.blockedDomains || [];

check('blocked pages recorded only as a bare domain', blocked.length > 0, JSON.stringify(blocked));
for (const [u, why] of blockedFixtures) {
  check(`blocked: ${u} (${why})`, !allUrls.some(x => x.includes(u)), '');
}
// Strict: the page was captured at document_idle, THEN grew a password field.
// Everything already recorded for it must have been retracted.
check('blocked: late-rendered password field is retracted, not just stopped',
  !allUrls.some(x => x.includes('late.html')),
  allUrls.filter(x=>x.includes('late.html')).join() || 'no trace left');
check('no title/url stored for any blocked page',
  !Object.values(session.tabs).some(t => /Lab Results|Tax Return|Sign in|Members area/.test(t.title||'')),
  '');

// ---- SPA route into a blocked path ----------------------------------------
const spa = await ctx.newPage();
await spa.goto(`${SITE}/spa.html`, { waitUntil: 'load' });
await spa.waitForTimeout(600);
await spa.click('#go');
await spa.waitForTimeout(2000);
st = await store(sw, ['ctxState']);
const spaUrls = Object.values(st.ctxState.session.tabs).map(t=>t.url||'');
check('SPA navigation into /account/transactions is gated',
  !spaUrls.some(u => u.includes('account/transactions')), spaUrls.filter(u=>u.includes('spa')||u.includes('account')).join(' ') || 'none');
// The /spa.html entry itself is legitimate — it was a normal page before the route change.
check('SPA: the pre-navigation page is still tracked', spaUrls.some(u=>u.includes('spa.html')), '');

// ---- highlight capture + secret filter ------------------------------------
const hp = await ctx.newPage();
await hp.goto(`${SITE}/secrets.html`, { waitUntil: 'load' });
await hp.waitForTimeout(500);
for (const sel of ['#a', '#b']) {
  await hp.evaluate((s) => {
    const r = document.createRange(); r.selectNodeContents(document.querySelector(s));
    const sel2 = window.getSelection(); sel2.removeAllRanges(); sel2.addRange(r);
  }, sel);
  await hp.dispatchEvent('body', 'mouseup');
  await hp.waitForTimeout(500);
}
st = await store(sw, ['ctxState']);
const hl = (st.ctxState.session.highlights||[]).map(h=>h.text);
check('ordinary highlight captured', hl.some(t=>t.includes('validated against server time')), `${hl.length} highlight(s)`);
check('secret-looking highlight dropped', !hl.some(t=>t.includes('sk_live_')), JSON.stringify(hl));

// ---- popup ----------------------------------------------------------------
const popup = await ctx.newPage();
await popup.setViewportSize({ width: 380, height: 540 });
await popup.goto(`chrome-extension://${id}/popup/popup.html`);
await popup.waitForTimeout(1800);

const rows = await popup.locator('.row').count();
const blockedRows = await popup.locator('.blocked-row').count();
check('popup Live tab lists pages', rows >= 5, `${rows} rows`);
check('popup Live tab lists blocked domains', blockedRows >= 1, `${blockedRows} blocked rows`);
const gauges = await popup.evaluate(() => ({
  pages: document.getElementById('g-pages').textContent,
  time: document.getElementById('g-time').textContent,
  blocked: document.getElementById('g-blocked').textContent,
}));
check('popup gauges populated', gauges.pages !== '0' && gauges.time !== '0s', JSON.stringify(gauges));

// overflow check at 380px
const overflow = await popup.evaluate(() => {
  const scrollers = [document.documentElement, document.body];
  const hOverflow = scrollers.some(e => e.scrollWidth > e.clientWidth + 1);
  const wide = [...document.querySelectorAll('.row,.blocked-row,.session,.rule-row,.gauge')]
    .filter(e => e.getBoundingClientRect().right > 381 || e.scrollWidth > e.clientWidth + 1)
    .map(e => e.className + ':' + Math.round(e.getBoundingClientRect().right) + '/' + e.scrollWidth + 'v' + e.clientWidth);
  return { hOverflow, wide };
});
check('no horizontal overflow at 380px', !overflow.hOverflow && overflow.wide.length === 0, JSON.stringify(overflow).slice(0,300));

// fonts actually loaded from disk
const fonts = await popup.evaluate(async () => {
  await document.fonts.ready;
  return [...document.fonts].map(f => `${f.family}:${f.status}`);
});
check('bundled fonts loaded', fonts.every(f=>f.endsWith(':loaded')) && fonts.length===2, fonts.join(', '));

fs.writeFileSync(`${ARTIFACTS}/errors.json`, JSON.stringify(errors, null, 1));
check('no console/page errors during normal use',
  errors.filter(e=>!/favicons|ERR_|net::/.test(e)).length === 0,
  errors.filter(e=>!/favicons|ERR_|net::/.test(e)).slice(0,3).join(' | '));
console.log('\n(filtered network noise: ' + errors.filter(e=>/favicons|ERR_|net::/.test(e)).length + ' entries)');

await popup.screenshot({ path: `${ARTIFACTS}/shot-live.png` });
await ctx.close();
summary();
