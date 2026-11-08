/**
 * Money on the screen: cents only when there are cents.
 *
 * Scott, 8 November: "if there is 1,000.01 vs 1,000.00 we should show
 * the .01."
 *
 * WHY THIS FILE EXISTS. The rule is written out in FOUR calculators,
 * because each page is self-contained and a shared script is not what
 * these are. Four copies of a formatting rule is three chances to fix a
 * penny in one place and leave it rounded in the others.
 *
 * AND IT IS NOT ONLY THESE FOUR. The quote page, the rate card and the
 * automated quote email all print the same premium, and all three were
 * built to MIRROR these two lines -- the backend's `moneyText` is the
 * same rule, and the day it disagreed with this one is the day a
 * customer got an email saying $1,595.00 about a screen that said
 * $1,595. QBP-537 is the whole argument: the surfaces have to agree,
 * and they agree by sharing a rule rather than by four people
 * separately choosing it.
 *
 *   node --test tests/a-penny-is-shown-or-it-is-not-there.test.mjs
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..', 'site');

/** Every page that prices anything, found rather than listed. */
const PRICING_PAGES = readdirSync(SITE)
  .filter((f) => f.endsWith('.html'))
  .filter((f) => readFileSync(join(SITE, f), 'utf8').includes('const fmtMo ='));

test('every page that prints a premium has the rule at all', () => {
  /* Found rather than listed, so a fifth calculator is covered the day
     it ships rather than the day somebody remembers this file. */
  assert.ok(PRICING_PAGES.length >= 4,
    `only ${PRICING_PAGES.length} pricing pages found — the marker has moved`);
});

for (const page of PRICING_PAGES) {
  test(`${page} shows a penny that is there and none that is not`, () => {
    const html = readFileSync(join(SITE, page), 'utf8');
    const from = html.indexOf('const fmtMo =');
    const to = html.indexOf('const fmtYr = fmtMo;', from);
    assert.ok(from > 0 && to > from, 'fmtMo and its fmtYr alias are not both here');
    const src = html.slice(from, to + 'const fmtYr = fmtMo;'.length);
    const { fmtMo, fmtYr } = new Function(`${src}\n return { fmtMo, fmtYr };`)();

    /* The half Scott asked for. */
    assert.equal(fmtMo(1000.01), '$1,000.01');
    assert.equal(fmtMo(107.01), '$107.01');
    /* And the half that comes with it: no padding where there is nothing. */
    assert.equal(fmtMo(1000), '$1,000');
    assert.equal(fmtMo(107), '$107');
    assert.equal(fmtYr(1595), '$1,595');
    assert.equal(fmtYr(1613.44), '$1,613.44');

    /*
     * A FLOAT THAT IS REALLY A WHOLE NUMBER. An annual built by
     * multiplying a monthly by twelve arrives like this, and the obvious
     * test -- Number.isInteger -- calls it $1,595.00.
     */
    assert.equal(fmtYr(1594.9999999999998), '$1,595');

    /*
     * AND THE SEPARATOR. fmtMo was '$' + n.toFixed(2) with no
     * toLocaleString, so a $10M policy priced monthly printed $1234.56
     * where every other surface wrote $1,234.56.
     */
    assert.equal(fmtMo(1234.56), '$1,234.56');
  });
}
