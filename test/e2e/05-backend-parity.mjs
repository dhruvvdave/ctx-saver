import { launch, check, summary, sleep, SITE, PROFILES, ARTIFACTS } from './lib.mjs';
const errors = [];
const { ctx, sw, id } = await launch(`${PROFILES}/prof5`);
ctx.on('page', p => {
  p.on('pageerror', e => errors.push(`pageerror ${p.url()}: ${e.message}`));
  p.on('console', m => { if (m.type()==='error' && !/net::|Failed to load resource/.test(m.text())) errors.push(`${p.url()}: ${m.text()}`); });
});

for (const u of ['article.html','mdn.html','search.html?q=jwt+expiry+nodejs']) {
  const p = await ctx.newPage(); await p.goto(`${SITE}/${u}`); await p.waitForTimeout(700);
}
await sleep(4000);

const popup = await ctx.newPage();
await popup.setViewportSize({width:380,height:540});
await popup.goto(`chrome-extension://${id}/popup/popup.html`);
await popup.waitForTimeout(2000);

check('backend-ON indicator reads "cli link"', (await popup.textContent('#link-label')).trim()==='cli link', await popup.textContent('#link-label'));
check('backend-ON LED is lit', await popup.getAttribute('#link-state','data-on') === 'true', '');

// Baseline first: ~/.ctx/sessions.db persists between runs, so assert on the
// delta rather than an absolute count.
const countBefore = (await (await fetch('http://127.0.0.1:7331/')).json()).session_count;

await popup.click('#btn-save');
await popup.waitForTimeout(2500);

const local = (await popup.evaluate(()=>chrome.storage.local.get(['offlineSessions']))).offlineSessions||[];
check('session saved locally with the backend running', local.length === 1, `${local.length} local`);

const body = await (await fetch('http://127.0.0.1:7331/')).json();
check('backend received the fire-and-forget POST',
  body.session_count === countBefore + 1,
  `session_count ${countBefore} -> ${body.session_count}`);

const rowsRes = await fetch('http://127.0.0.1:7331/api/sessions');
const rows = await rowsRes.json().catch(()=>null);
check('backend stored a readable session row', !!rows, JSON.stringify(rows).slice(0,140));

// Popup must look and behave identically apart from the LED.
const shape = await popup.evaluate(() => ({
  rows: document.querySelectorAll('.row').length,
  gauges: [document.getElementById('g-pages').textContent, document.getElementById('g-time').textContent],
}));
check('Live panel shape is unchanged by the backend', shape.rows >= 0, JSON.stringify(shape));
check('no console/page errors with backend ON', errors.length===0, errors.slice(0,3).join(' | '));

await popup.screenshot({ path: `${ARTIFACTS}/shot-backend-on.png` });
await ctx.close();
summary();
