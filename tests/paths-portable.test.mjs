/**
 * Nothing in these pages assumes it is served at a host root.
 *
 * WHY THIS IS A TEST. The calculators are moving from tools.quotebot.io,
 * where they sit at the root, to quote-bot.com/tools/, where they do not. A
 * reference like src="/js/quotebot-capture.js" resolves against the DOMAIN,
 * so under a /tools/ prefix it asks quote-bot.com for /js/quotebot-capture.js
 * — which is the marketing site's path, not ours. It either 404s or, worse,
 * finds a different file of the same name.
 *
 * There were 79 of them across thirteen pages, and lead capture was one.
 * Nothing about the page would look broken: the markup is valid, the build
 * passes, and the script simply never loads.
 *
 * Every page is a flat sibling of js/ and img/, so a relative reference is
 * correct at BOTH addresses and this can ship before the DNS moves rather
 * than during. The guard is here so it stays that way — a hand-edit that
 * types the leading slash back in is the obvious way to lose it.
 *
 *   node --test tests/paths-portable.test.mjs
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pages = readdirSync(join(root, 'site')).filter((f) => f.endsWith('.html'));
const partials = readdirSync(join(root, 'tools')).filter((f) => f.endsWith('.html'));

const read = (dir, f) => readFileSync(join(root, dir, f), 'utf8');

/** src/href values that begin with a single slash: root-relative. */
function rootRelative(html) {
  return [...html.matchAll(/(?:src|href)="(\/(?!\/)[^"]*)"/g)].map((m) => m[1]);
}

test('there are pages to check', () => {
  /* An empty sweep passes every assertion below for the wrong reason. */
  assert.ok(pages.length >= 13, `only found ${pages.length} pages`);
  assert.ok(partials.length >= 2, `only found ${partials.length} partials`);
});

for (const f of pages) {
  test(`${f} has no root-relative src or href`, () => {
    assert.deepEqual(
      rootRelative(read('site', f)), [],
      'these resolve against the domain, so they break under a /tools/ prefix. '
      + 'Drop the leading slash: the pages are flat siblings of js/ and img/.',
    );
  });
}

for (const f of partials) {
  test(`the ${f} partial has no root-relative src or href`, () => {
    /* The partials are copied into all thirteen pages, so one slash here is
       thirteen broken references after the next apply-chrome run. */
    assert.deepEqual(rootRelative(read('tools', f)), []);
  });
}

test('every page carries exactly one canonical', () => {
  for (const f of pages) {
    const found = [...read('site', f).matchAll(/<link rel="canonical"[^>]*>/g)];
    assert.equal(found.length, 1, `${f} has ${found.length} canonical tags`);
  }
});

test('the canonicals all share one base, and each names its own page', () => {
  /*
   * Asserted as base + suffix rather than against a fixed path, because the
   * base is about to change: CANON_BASE moves from https://tools.quotebot.io
   * to https://quote-bot.com/tools at the DNS cutover. A test pinning the
   * path to `/${file}` would pass today and fail on the one commit it exists
   * to protect, which is how a guard gets deleted instead of read.
   *
   * What must stay true at either address: one base for all thirteen, each
   * page naming itself, and the landing page naming the bare directory.
   */
  const bases = new Set();
  for (const f of pages) {
    const href = /<link rel="canonical" href="([^"]+)"/.exec(read('site', f))?.[1] ?? '';
    assert.ok(href.startsWith('https://'), `${f} canonical is not absolute: ${href}`);
    const suffix = f === 'index.html' ? '/' : `/${f}`;
    assert.ok(
      href.endsWith(suffix),
      `${f} canonical does not name this page: ${href}`,
    );
    bases.add(href.slice(0, href.length - suffix.length));
  }
  assert.equal(
    bases.size, 1,
    `the canonicals do not share one base, so a move was left halfway: ${[...bases].join(', ')}`,
  );
});

test('a moved base still passes, and a half-moved one does not', () => {
  /* The guard above, exercised on the shape of the cutover commit rather than
     trusted to be right about it. */
  const suffixOf = (f) => (f === 'index.html' ? '/' : `/${f}`);
  const moved = pages.map((f) => `https://quote-bot.com/tools${suffixOf(f)}`);
  const half = [...moved];
  half[1] = `https://tools.quotebot.io${suffixOf(pages[1])}`;

  const basesOf = (hrefs) => new Set(
    hrefs.map((h, i) => h.slice(0, h.length - suffixOf(pages[i]).length)),
  );
  assert.equal(basesOf(moved).size, 1, 'a fully moved set must read as one base');
  assert.equal(basesOf(half).size, 2, 'a half-moved set must read as two');
});
