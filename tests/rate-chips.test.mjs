/**
 * The chips on the tools index, checked against what the pages actually do.
 *
 * Each tile carries "Live Quotes" or "Estimates Only", and the chip is a
 * promise to the visitor about which kind of number they are about to see.
 * It is also the easiest thing in this repo to get wrong: wiring a
 * calculator to the rate engine and relabelling its tile are two edits in
 * two files, and doing one without the other is silent in every direction —
 * the page looks right, the index looks right, and the only person who finds
 * out is the customer who was told these were real rates.
 *
 * So the chip is not trusted here. It is checked against whether the page it
 * points at asks a rate service for a price.
 *
 *   node --test tests/rate-chips.test.mjs
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';

const dir = new URL('../site/', import.meta.url);
const INDEX = readFileSync(new URL('index.html', dir), 'utf8');

/* Every tile: its href and the rate chip on it, if it has one. */
const TILES = [...INDEX.matchAll(/<a class="card[^"]*" href="([^"]+)">([\s\S]*?)<\/a>/g)]
  .map(([, href, inner]) => {
    const chip = /<span class="tag (live|est) tag-rate">([^<]+)<\/span>/.exec(inner);
    return { href, kind: chip ? chip[1] : null, label: chip ? chip[2].trim() : null };
  });

/** Does this page ask a service what something costs? */
function pricesLive(html) {
  const asksQuote = html.includes('QB_QUOTE_ENDPOINT') && /'\/quote'/.test(html);
  const asksRates = /['"`]\/rates/.test(html) || /\/rates\?/.test(html);
  return asksQuote || asksRates;
}

test('every tile carries a rate chip', () => {
  assert.ok(TILES.length >= 12, `only found ${TILES.length} tiles`);
  for (const t of TILES) {
    assert.ok(t.kind, `${t.href} has no Live Quotes / Estimates Only chip`);
  }
});

test('the two labels are the only two labels', () => {
  /* One wording, so the promise means the same thing on every tile. */
  for (const t of TILES) {
    assert.equal(t.label, t.kind === 'live' ? 'Live Quotes' : 'Estimates Only',
      `${t.href} invents a third label: "${t.label}"`);
  }
});

for (const t of TILES) {
  test(`${t.href} — the chip matches what the page does`, () => {
    /* The tiles used to be root-relative ("/mug.html") and are now relative
       to the page ("mug.html"), because these files are moving under a
       /tools/ prefix where a leading slash points at the wrong site. Resolve
       either form against site/ rather than assuming one: this test is about
       chips, and it should not fail again the next time a path shape moves. */
    const file = new URL(t.href.replace(/^\//, ''), dir);
    assert.ok(existsSync(file), `${t.href} is on the index and not in site/`);
    const html = readFileSync(file, 'utf8');
    const live = pricesLive(html);
    if (t.kind === 'live') {
      assert.ok(live,
        `${t.href} is chipped "Live Quotes" and never asks a rate service for a price`);
    } else {
      assert.ok(!live,
        `${t.href} asks a rate service for real prices but is chipped "Estimates Only" — `
        + 'the tile is understating what it now does');
    }
  });
}

test('D.I.M.E. is wired and chipped, together', () => {
  /* Named on its own because it is the one that just moved, and because the
     pair of edits is the thing that goes wrong. */
  /* Matched on the filename rather than the exact href, for the same reason
     as the resolution above: the tiles are relative now and the shape of the
     link is not what this test is about. */
  const tile = TILES.find((t) => t.href.replace(/^\//, '') === 'dimeneedscalculator.html');
  assert.ok(tile, 'the D.I.M.E. tile is gone from the index');
  assert.equal(tile.kind, 'live');
  const html = readFileSync(new URL('dimeneedscalculator.html', dir), 'utf8');
  assert.ok(pricesLive(html));
});
