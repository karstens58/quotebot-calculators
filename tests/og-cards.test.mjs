/**
 * Link preview cards.
 *
 * This is the one thing on these pages that nobody sees break. The tags only
 * do anything when somebody pastes the URL into Facebook, LinkedIn, iMessage
 * or Slack, and by then the wrong answer has already been shared. A relative
 * og:image, or one pointing at a file that never got committed, renders as a
 * bare grey box and no error appears anywhere.
 *
 * So: every page carries a card, the image exists in the repo at the path the
 * tag claims, with the dimensions the tag declares, and no two pages share one.
 *
 * This used to check quotetool.html alone, which was fine when it was the only
 * page with a card. It is not any more -- and a test that passes while eleven
 * pages go unread is worse than no test, because it reads like coverage.
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

const PAGES = readdirSync(SITE).filter((f) => f.endsWith('.html')).sort();
const META = new Map(PAGES.map((f) => [f, metas(readFileSync(SITE + f, 'utf8'))]));

/* The image path a page claims, as a path inside site/. */
const imageOf = (m) => m['og:image'].slice(ORIGIN.length + 1);

test('EVERY PAGE CARRIES A CARD', () => {
  /* The gate that matters for a page added later: a new calculator shipped
     without a card looks completely normal until somebody shares it. */
  assert.ok(PAGES.length, 'no pages found in site/');
  const missing = PAGES.filter((f) => !META.get(f)['og:image']);
  assert.deepEqual(missing, [],
    `these pages have no link preview card -- run: cd tools/og && npm run meta`);
});

test('every page declares a large-image card', () => {
  for (const f of PAGES) {
    const m = META.get(f);
    assert.equal(m['og:type'], 'website', `${f}: og:type`);
    assert.equal(m['twitter:card'], 'summary_large_image',
      `${f}: without this the image renders as a small square thumbnail`);
    assert.ok(m['og:title'], `${f}: no og:title`);
    assert.ok(m['og:description'], `${f}: no og:description`);
    assert.ok(m['og:image:alt'], `${f}: the card has no alt text`);
  }
});

test('OG:IMAGE IS ABSOLUTE', () => {
  /* A scraper fetches this from its own servers, where a relative path
     resolves against nothing at all. */
  for (const f of PAGES) {
    const m = META.get(f);
    for (const key of ['og:image', 'og:image:secure_url', 'twitter:image']) {
      assert.ok(m[key], `${f}: ${key} is missing`);
      assert.ok(m[key].startsWith('https://'),
        `${f}: ${key} is not an absolute https url: ${m[key]}`);
    }
    assert.equal(m['og:image'], m['twitter:image'],
      `${f}: the two networks were pointed at different pictures`);
  }
});

test('THE IMAGE IT POINTS AT IS ACTUALLY IN THE REPO', () => {
  for (const f of PAGES) {
    const m = META.get(f);
    assert.ok(m['og:image'].startsWith(ORIGIN + '/'), `${f}: og:image is not on ${ORIGIN}`);
    const rel = imageOf(m);
    assert.ok(existsSync(SITE + rel),
      `${f}: og:image points at ${rel}, which is not in site/ -- the preview would be a grey box`);
  }
});

test('the declared dimensions are the file’s real ones', () => {
  for (const f of PAGES) {
    const m = META.get(f);
    const rel = imageOf(m);
    const real = pngSize(SITE + rel);
    assert.equal(Number(m['og:image:width']), real.width, `${f}: declared width`);
    assert.equal(Number(m['og:image:height']), real.height, `${f}: declared height`);
    /* 1.91:1 is what every network crops to. Off that, the card gets cut. */
    const ratio = real.width / real.height;
    assert.ok(Math.abs(ratio - 1.91) < 0.02,
      `${f}: aspect ratio is ${ratio.toFixed(3)}, not ~1.91:1`);
    assert.ok(real.width >= 1200, `${f}: below 1200px wide the card renders soft on retina`);
  }
});

test('the cards are small enough for every network to fetch them', () => {
  for (const f of PAGES) {
    const rel = imageOf(META.get(f));
    const bytes = readFileSync(SITE + rel).length;
    /* LinkedIn refuses above 5MB and simply shows nothing. */
    assert.ok(bytes < 5 * 1024 * 1024,
      `${f}: ${(bytes / 1048576).toFixed(1)}MB is over LinkedIn's limit`);
  }
});

test('no two pages claim the same card', () => {
  /* Each tool wants its own picture. A copy-pasted head block pointing every
     calculator at one card is the easy mistake here, and it is silent. */
  const seen = new Map();
  for (const f of PAGES) {
    const rel = imageOf(META.get(f));
    assert.ok(!seen.has(rel), `${f} and ${seen.get(rel)} both point at ${rel}`);
    seen.set(rel, f);
  }
});

test('no card is left in site/og that nothing points at', () => {
  /* Not a failure anyone would notice in a browser, but an orphan here is
     usually a rename that only got done on one side. */
  const claimed = new Set(PAGES.map((f) => imageOf(META.get(f)).replace(/^og\//, '')));
  const onDisk = readdirSync(SITE + 'og').filter((f) => f.endsWith('.png'));
  const orphans = onDisk.filter((f) => !claimed.has(f));
  assert.deepEqual(orphans, [], 'these cards are in site/og but no page references them');
});
