/**
 * Link preview cards.
 *
 * This is the one thing on these pages that nobody sees break. The tags only
 * do anything when somebody pastes the URL into Facebook, LinkedIn, iMessage
 * or Slack, and by then the wrong answer has already been shared. A relative
 * og:image, or one pointing at a file that never got committed, renders as a
 * bare grey box and no error appears anywhere.
 *
 * So: the image must exist in the repo, at the path the tag claims, with the
 * dimensions the tag declares.
 *
 *   node --test tests/og-cards.test.mjs
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SITE = fileURLToPath(new URL('../site/', import.meta.url));
const ORIGIN = 'https://tools.quotebot.io';

const metas = (html) => {
  const out = {};
  for (const m of html.matchAll(/<meta\s+(?:property|name)="((?:og|twitter):[^"]+)"\s+content="([^"]*)"/g)) {
    out[m[1]] = m[2];
  }
  return out;
};

/* Reads width and height straight out of the PNG's IHDR chunk. Trusting a
   number written in the HTML to describe a file on disk is the bug. */
function pngSize(path) {
  const b = readFileSync(path);
  assert.equal(b.subarray(1, 4).toString('ascii'), 'PNG', `${path} is not a PNG`);
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

const PAGE = 'quotetool.html';
const html = readFileSync(SITE + PAGE, 'utf8');
const m = metas(html);

test('the quote tool declares a large-image card', () => {
  assert.equal(m['og:type'], 'website');
  assert.equal(m['twitter:card'], 'summary_large_image',
    'without this the image renders as a small square thumbnail');
  assert.ok(m['og:title'] && m['og:description']);
  assert.ok(m['og:image:alt'], 'the card has no alt text');
});

test('OG:IMAGE IS ABSOLUTE', () => {
  /* A scraper fetches this from its own servers, where a relative path
     resolves against nothing at all. */
  for (const key of ['og:image', 'og:image:secure_url', 'twitter:image']) {
    assert.ok(m[key], `${key} is missing`);
    assert.ok(m[key].startsWith('https://'), `${key} is not an absolute https url: ${m[key]}`);
  }
  assert.equal(m['og:image'], m['twitter:image'],
    'the two networks were pointed at different pictures');
});

test('THE IMAGE IT POINTS AT IS ACTUALLY IN THE REPO', () => {
  assert.ok(m['og:image'].startsWith(ORIGIN + '/'), `og:image is not on ${ORIGIN}`);
  const rel = m['og:image'].slice(ORIGIN.length + 1);
  assert.ok(existsSync(SITE + rel),
    `og:image points at ${rel}, which is not in site/ -- the preview would be a grey box`);
});

test('the declared dimensions are the file’s real ones', () => {
  const rel = m['og:image'].slice(ORIGIN.length + 1);
  const real = pngSize(SITE + rel);
  assert.equal(Number(m['og:image:width']), real.width);
  assert.equal(Number(m['og:image:height']), real.height);
  /* 1.91:1 is what every network crops to. Off that, the card gets cut. */
  const ratio = real.width / real.height;
  assert.ok(Math.abs(ratio - 1.91) < 0.02, `aspect ratio is ${ratio.toFixed(3)}, not ~1.91:1`);
  assert.ok(real.width >= 1200, 'below 1200px wide the card renders soft on retina');
});

test('the card is small enough for every network to fetch it', () => {
  const rel = m['og:image'].slice(ORIGIN.length + 1);
  const bytes = readFileSync(SITE + rel).length;
  /* LinkedIn refuses above 5MB and simply shows nothing. */
  assert.ok(bytes < 5 * 1024 * 1024, `${(bytes / 1048576).toFixed(1)}MB is over LinkedIn's limit`);
});

test('no other page claims this same card by accident', () => {
  /* Each tool wants its own picture. A copy-pasted head block pointing every
     calculator at the quote tool's card is the easy mistake here, and it is
     silent. */
  const others = readdirSync(SITE).filter((f) => f.endsWith('.html') && f !== PAGE);
  for (const f of others) {
    const om = metas(readFileSync(SITE + f, 'utf8'));
    if (!om['og:image']) continue;
    assert.notEqual(om['og:image'], m['og:image'],
      `${f} points at the quote tool's card`);
  }
});
