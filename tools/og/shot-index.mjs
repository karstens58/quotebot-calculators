// The index card is a photograph of the page, not a typographic card like the
// rest of the set -- what the index is selling is the shelf itself, and a
// drawing of a shelf is less convincing than the shelf.
//
// Two things are decided here rather than cropped by eye afterwards:
//
//   1. The cut lands just under the FIRST ROW OF TILES. A share card that
//      slices the second row in half looks like a bug, so the shot measures
//      where row one ends and stops ten pixels later, then pads down to the
//      1.91:1 Open Graph ratio with the page's own background.
//   2. The floating chat launcher is hidden. It is a widget, not content, and
//      on a card it reads as a smudge in the corner.
//
// Run: node shot-index.mjs   (from tools/og; writes site/og/index-card.png)
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const siteDir = join(here, '..', '..', 'site');
const out = join(siteDir, 'og', 'index-card.png');
const W = 2400;
const H = 1260;

const TYPES = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp',
};

const server = createServer(async (req, res) => {
  const path = decodeURIComponent(req.url.split('?')[0]);
  try {
    const body = await readFile(join(siteDir, path === '/' ? 'index.html' : path));
    res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM_PATH || undefined,
});
// 1600 CSS px wide at 1.5x: the tiles sit three across and the hero keeps its
// line breaks. Narrower and the tiles crowd; wider and the page is mostly margin.
const page = await browser.newPage({
  viewport: { width: 1600, height: 1200 },
  deviceScaleFactor: 1.5,
});
await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);

await page.evaluate(() => {
  for (const el of document.querySelectorAll('body *')) {
    const s = getComputedStyle(el);
    if (s.position === 'fixed' && el.getBoundingClientRect().top > innerHeight * 0.5) {
      el.style.display = 'none';
    }
  }
});

const rowBottom = await page.evaluate(() => {
  const tiles = [...document.querySelectorAll('a,div')].filter((e) => {
    const r = e.getBoundingClientRect();
    return r.width > 250 && r.width < 500 && r.height > 120 && r.height < 300 && r.top > 400;
  });
  if (!tiles.length) return null;
  const top = Math.min(...tiles.map((t) => t.getBoundingClientRect().top));
  return Math.max(
    ...tiles
      .filter((t) => Math.abs(t.getBoundingClientRect().top - top) < 20)
      .map((t) => t.getBoundingClientRect().bottom),
  );
});
if (!rowBottom) throw new Error('could not find the first row of tiles -- has index.html changed shape?');

const shot = await page.screenshot({
  clip: { x: 0, y: 0, width: 1600, height: Math.round(rowBottom + 10) },
});
const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
await browser.close();
server.close();

// Pad to the Open Graph ratio. Composited in the browser rather than with an
// image library so this script keeps playwright as its only dependency.
const pad = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM_PATH || undefined,
});
const canvas = await pad.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await canvas.setContent(
  `<body style="margin:0;width:${W}px;height:${H}px;background:${bg}">` +
  `<img src="data:image/png;base64,${shot.toString('base64')}" style="display:block;width:${W}px">`,
);
await canvas.screenshot({ path: out });
await pad.close();
console.log(`index-card.png  cut at ${Math.round(rowBottom + 10)}px, padded to ${W}x${H}`);
