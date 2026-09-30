// Renders one 2400x1260 social card per entry in cards.mjs.
//
// The design is the one already shipped on quotetool.html: a pale ruled panel
// carrying logo / eyebrow / headline / rule / body / domain across the left
// 69%, and a navy rail on the right holding three serif words, each over a
// one-line gloss, separated by hairlines. Colours and geometry below were
// sampled from site/og/quotetool-card.png so a new card sits beside the
// original without looking like a different house.
//
// Run: node render.mjs [outDir]   (default ./out)
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cards } from './cards.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = process.argv[2] ?? join(here, 'out');
const W = 2400;
const H = 1260;

const FONT_DIR = '/home/claude/node_modules/@fontsource';
const b64 = (p) => readFileSync(p).toString('base64');
const face = (family, file, weight, style) =>
  `@font-face{font-family:'${family}';font-weight:${weight};font-style:${style};font-display:block;` +
  `src:url(data:font/woff2;base64,${b64(file)}) format('woff2');}`;

const fonts = [
  face('Fraunces', `${FONT_DIR}/fraunces/files/fraunces-latin-600-normal.woff2`, 600, 'normal'),
  face('Fraunces', `${FONT_DIR}/fraunces/files/fraunces-latin-700-normal.woff2`, 700, 'normal'),
  face('Fraunces', `${FONT_DIR}/fraunces/files/fraunces-latin-600-italic.woff2`, 600, 'italic'),
  face('Jakarta', `${FONT_DIR}/plus-jakarta-sans/files/plus-jakarta-sans-latin-400-normal.woff2`, 400, 'normal'),
  face('Jakarta', `${FONT_DIR}/plus-jakarta-sans/files/plus-jakarta-sans-latin-700-normal.woff2`, 700, 'normal'),
].join('');

const logo = b64('/mnt/user-data/uploads/Developer/GitHub/quotebot-calculators/site/img/quotebot-logo.png');

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function html(card) {
  const lines = card.head
    .map((l, i) =>
      i === card.head.length - 1
        ? `<span class="last">${esc(l)}</span>`
        : `<span>${esc(l)}</span>`,
    )
    .join('');
  const rail = card.rail
    .map(
      ([word, gloss], i) =>
        `<div class="item"><div class="word w${i}">${esc(word)}</div>` +
        `<div class="gloss">${esc(gloss)}</div></div>`,
    )
    .join('<div class="hair"></div>');

  return `<!doctype html><html><head><meta charset="utf-8"><style>
${fonts}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${W}px;height:${H}px}
body{display:flex;font-family:'Jakarta',sans-serif;-webkit-font-smoothing:antialiased}

/* left: pale panel, faint rules every 90px like a ledger sheet */
.left{width:1656px;height:${H}px;background:#f4f7fb;position:relative;
  padding:96px 130px 96px 128px;display:flex;flex-direction:column}
.rules{position:absolute;inset:0;
  background:repeating-linear-gradient(to bottom,transparent 0 88px,#e5ebf2 88px 90px)}
.left>*:not(.rules){position:relative}
.logo{height:60px;width:auto;align-self:flex-start}
.mid{flex:1;display:flex;flex-direction:column;justify-content:center;padding:28px 0}
.eyebrow{font-size:23px;font-weight:700;letter-spacing:.17em;color:#1e4d85}
.head{font-family:'Fraunces',Georgia,serif;font-weight:600;color:#12233b;
  line-height:1.2;margin-top:34px;display:flex;flex-direction:column;align-items:flex-start}
.head .last{font-style:italic;color:#1e4d85}
.rule{width:182px;height:7px;background:#b45309;margin-top:52px}
.body{font-size:30px;line-height:1.62;color:#3f5470;margin-top:38px;max-width:1240px}
.url{font-size:27px;font-weight:700;color:#1a3d6b}

/* right: navy rail, three serif words each over one line of plain sans */
.right{width:744px;height:${H}px;background:#12233b;padding:96px 88px;
  display:flex;flex-direction:column;justify-content:center}
.word{font-family:'Fraunces',Georgia,serif;font-weight:700;font-size:66px;line-height:1.1}
.w0{color:#8ec4f5}.w1{color:#6ee7a8}.w2{color:#8ec4f5}
.gloss{font-size:23px;line-height:1.45;color:#a9c3e0;margin-top:18px}
.hair{height:2px;background:#38465a;margin:44px 0}
</style></head><body>
<div class="left"><div class="rules"></div>
  <img class="logo" src="data:image/png;base64,${logo}" alt="">
  <div class="mid">
    <div class="eyebrow">${esc(card.eyebrow)}</div>
    <div class="head" id="head">${lines}</div>
    <div class="rule"></div>
    <div class="body">${esc(card.body)}</div>
  </div>
  <div class="url">tools.quotebot.io</div>
</div>
<div class="right">${rail}</div>
</body></html>`;
}

// Headlines are hand-broken, so line lengths vary between cards. Start at the
// size the original card uses and step down only as far as the longest line
// needs, so most cards keep the same headline size and the set stays even.
async function fitHeadline(page) {
  return page.evaluate(() => {
    const head = document.getElementById('head');
    const room = 1656 - 128 - 130;
    for (let size = 117; size >= 74; size -= 1) {
      head.style.fontSize = size + 'px';
      const widest = Math.max(
        ...[...head.children].map((s) => s.getBoundingClientRect().width),
      );
      if (widest <= room) return size;
    }
    return 74;
  });
}

const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM_PATH || undefined,
});
const page = await browser.newPage({
  viewport: { width: W, height: H },
  deviceScaleFactor: 1,
});

if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

for (const card of cards.filter((c) => !c.screenshot)) {
  await page.setContent(html(card), { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const size = await fitHeadline(page);
  await page.screenshot({ path: join(outDir, card.file), type: 'png' });
  console.log(`${card.file.padEnd(34)} headline ${size}px`);
}

await browser.close();
