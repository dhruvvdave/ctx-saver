import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

// A terminal prompt: chevron + block cursor. Stroke weights and the corner
// radius are expressed as fractions of the canvas so the mark holds its
// proportions from 128px down to 16px, where it has to survive as two shapes.
const svg = (s) => {
  const small = s <= 24;
  // At 16px the mark has about six usable pixels per stroke, so it gets a
  // heavier chevron, tighter padding, and no inner ring — that hairline just
  // turns to mud at toolbar size.
  const r = s * (small ? 0.18 : 0.22);
  const pad = s * (small ? 0.17 : 0.20);
  const sw = s * (small ? 0.135 : 0.105);
  const x0 = pad, x1 = pad + s * 0.185, yMid = s / 2, yTop = yMid - s * 0.155, yBot = yMid + s * 0.155;
  const cx = s * (small ? 0.58 : 0.60), cw = s * (small ? 0.24 : 0.20);
  const ch = s * (small ? 0.135 : 0.105), cy = yBot - ch;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
    <rect width="${s}" height="${s}" rx="${r}" fill="#0a0b0a"/>
    ${small ? "" : `<rect x="${s*0.02}" y="${s*0.02}" width="${s-s*0.04}" height="${s-s*0.04}" rx="${r-s*0.02}"
          fill="none" stroke="#c9f43a" stroke-opacity="0.22" stroke-width="${s*0.016}"/>`}
    <path d="M ${x0} ${yTop} L ${x1} ${yMid} L ${x0} ${yBot}"
          fill="none" stroke="#c9f43a" stroke-width="${sw}"
          stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="${cx}" y="${cy}" width="${cw}" height="${ch}" rx="${ch*0.25}" fill="#c9f43a"/>
  </svg>`;
};

const browser = await chromium.launch({ channel: 'chromium' });
const page = await browser.newPage();
for (const size of [16, 48, 128]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg(size)}</body></html>`);
  await page.screenshot({ path: `icon${size}.png`, omitBackground: true });
}
// a large one for inspection
await page.setViewportSize({ width: 512, height: 512 });
await page.setContent(`<html><body style="margin:0">${svg(512)}</body></html>`);
await page.screenshot({ path: 'icon-preview.png' });
await browser.close();
console.log('icons rendered');
