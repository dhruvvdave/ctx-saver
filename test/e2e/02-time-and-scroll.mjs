import { launch, check, summary, sleep, store, SITE, PROFILES } from './lib.mjs';
const { ctx, sw, id } = await launch(`${PROFILES}/prof2`, { headless: false });

const a = await ctx.newPage(); await a.goto(`${SITE}/article.html`);
const b = await ctx.newPage(); await b.goto(`${SITE}/mdn.html`);
await a.bringToFront(); await a.waitForTimeout(500);
console.log('visibility works headed? a.hidden=', await a.evaluate(()=>document.hidden), 'b.hidden=', await b.evaluate(()=>document.hidden));

// Read page A for ~5s with scrolling, then switch away (flushes PAGE_LEAVE)
await a.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await a.waitForTimeout(1000);
await a.evaluate(() => window.scrollTo(0, 0));   // scroll back to top
await a.waitForTimeout(4500);
await b.bringToFront(); await b.waitForTimeout(1200);

let s = (await store(sw, ['ctxState'])).ctxState.session;
const pageA = Object.values(s.tabs).find(t => (t.url||'').includes('article.html'));
check('time spent accrues on a foreground page', (pageA?.timeSpent||0) >= 3, `${pageA?.timeSpent}s`);
check('scroll depth records the PEAK, not the position at flush',
  (pageA?.scrollDepth||0) > 90, `${pageA?.scrollDepth}% (scrolled to bottom then back to top)`);

// popup shows non-zero time without waiting for a tab switch
const c = await ctx.newPage(); await c.goto(`${SITE}/pr.html`);
await c.bringToFront(); await c.waitForTimeout(4200);   // > FIRST_BEAT_MS
s = (await store(sw, ['ctxState'])).ctxState.session;
const pageC = Object.values(s.tabs).find(t => (t.url||'').includes('pr.html'));
check('first heartbeat lands within ~4s (popup never stuck on 0s)', (pageC?.timeSpent||0) > 0, `${pageC?.timeSpent}s`);

await ctx.close();
summary();
