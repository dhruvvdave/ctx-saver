import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'fs';

// --- compose only ---
// --- 2. compose 1280x800 promo frames ---------------------------------------
const b64 = (f) => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
const fontMono = 'data:font/woff2;base64,' + fs.readFileSync('/home/user/ctx-saver/packages/extension/popup/fonts/jetbrains-mono-latin.woff2').toString('base64');
const fontDisp = 'data:font/woff2;base64,' + fs.readFileSync('/home/user/ctx-saver/packages/extension/popup/fonts/space-grotesk-latin.woff2').toString('base64');

const frames = [
  { file: 'cap-live.png',     out: 'screenshot-1-live.png',
    kicker: 'Live', head: 'What you are working on,\nwhile you work on it.',
    sub: 'Every page ranked by the time you actually spent on it, with scroll depth and a meter showing where your attention went.' },
  { file: 'cap-sessions.png', out: 'screenshot-2-sessions.png',
    kicker: 'Sessions', head: 'Come back a week later.\nPick up the thread.',
    sub: 'Each saved session carries a one-line summary of what it was about, the domains involved, and the first thing you highlighted.' },
  { file: 'cap-privacy.png',  out: 'screenshot-3-privacy.png',
    kicker: 'Privacy', head: 'It refuses to look at\nthe things that matter.',
    sub: '301 blocked domains, plus hostname, URL, page-title and form rules. Banking, webmail, health and login pages are never read — only the bare domain is noted.' },
];

const browser = await chromium.launch({ channel: 'chromium' });
const page = await browser.newPage();
await page.setViewportSize({ width: 1280, height: 800 });

for (const f of frames) {
  await page.setContent(`<html><head><style>
    @font-face{font-family:JB;src:url(${fontMono}) format('woff2');font-weight:400 700}
    @font-face{font-family:SG;src:url(${fontDisp}) format('woff2');font-weight:500 700}
    *{margin:0;padding:0;box-sizing:border-box}
    body{width:1280px;height:800px;background:#0a0b0a;display:flex;align-items:center;
         gap:72px;padding:0 90px;overflow:hidden;position:relative}
    body::before{content:"";position:absolute;inset:0;
      background-image:repeating-linear-gradient(to bottom,rgba(255,255,255,.02) 0 1px,transparent 1px 3px)}
    body::after{content:"";position:absolute;left:-10%;top:-30%;width:70%;height:110%;
      background:radial-gradient(closest-side,rgba(201,244,58,.10),transparent 70%)}
    .copy{position:relative;z-index:2;flex:1;max-width:620px}
    .kicker{font-family:SG;font-weight:700;font-size:13px;letter-spacing:.22em;text-transform:uppercase;
            color:#c9f43a;margin-bottom:22px;display:flex;align-items:center;gap:11px}
    .kicker i{display:block;width:34px;height:2px;background:#c9f43a}
    h1{font-family:SG;font-weight:700;font-size:52px;line-height:1.08;letter-spacing:-.03em;
       color:#e6e9e0;white-space:pre-line;margin-bottom:24px}
    p{font-family:JB;font-size:16px;line-height:1.72;color:#8e9686;max-width:530px}
    .foot{margin-top:40px;display:flex;align-items:center;gap:13px;font-family:JB;font-size:13px;color:#5c6356}
    .foot img{width:30px;height:30px;border-radius:7px}
    .foot b{color:#c9f43a;font-weight:700}
    .shot{position:relative;z-index:2;flex-shrink:0;border-radius:13px;overflow:hidden;
          border:1px solid #23271f;box-shadow:0 44px 90px rgba(0,0,0,.72),0 0 0 1px rgba(201,244,58,.09),
          0 0 70px rgba(201,244,58,.055)}
    .shot img{display:block;width:380px;height:540px}
  </style></head><body>
    <div class="copy">
      <div class="kicker"><i></i>${f.kicker}</div>
      <h1>${f.head}</h1>
      <p>${f.sub}</p>
      <div class="foot"><img src="${b64('/home/user/ctx-saver/packages/extension/icons/icon128.png')}">
        <span><b>ctx</b> — context saver &nbsp;·&nbsp; everything stays on your machine</span></div>
    </div>
    <div class="shot"><img src="${b64(f.file)}"></div>
  </body></html>`);
  await page.waitForTimeout(700);
  await page.screenshot({ path: f.out, clip: { x: 0, y: 0, width: 1280, height: 800 } });
  console.log('wrote', f.out);
}
await browser.close();
