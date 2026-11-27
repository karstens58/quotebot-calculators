/*
 * THE CARRIER RAIL SAYS ONLY WHAT ASSURITY SAY -- QBP-653.
 *
 *   node --test tests/the-rail-says-only-what-assurity-says.test.mjs
 *
 * The rail sits above the Continue button on a page carrying Assurity's
 * mark, and every line in it is a claim they have to stand behind. Two of
 * the three were wrong on the first pass and neither looked it:
 *
 *   "Since 1890"        -- their timeline says the story began in 1890 as
 *                          the Modern Woodmen Accident Association, and
 *                          that Assurity came out of a 2005 combination of
 *                          three OTHER Lincoln insurers, which does not
 *                          include it. They avoid stating a founding year
 *                          and say "over 130 years" instead.
 *   "Mutual holding co." -- they describe themselves as a mutual
 *                          organization owned by policyholders. The phrase
 *                          "holding company" appears nowhere.
 *
 * Both read as ordinary corporate furniture, which is the point: a wrong
 * one will not look wrong to whoever edits this next. So the strings are
 * pinned, and changing one means going back to assurity.com/about-us.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const HTML = readFileSync(join(root, 'site/agentlessquote.html'), 'utf8');

const rail = (() => {
  const at = HTML.indexOf('<div class="carrier-rail">');
  assert.ok(at > 0, 'the carrier rail is gone from the page');
  const end = HTML.indexOf('</div>', HTML.indexOf('</dl>', at));
  return HTML.slice(at, end);
})();

test('EVERY LINE IS ONE ASSURITY PUBLISH THEMSELVES', () => {
  for (const line of [
    'AM Best',                 // "We're rated A- (Excellent) by AM Best"
    'Over 130 years',          // "over 130 years old"
    'Lincoln, Nebraska',       // "our Lincoln, Nebraska headquarters"
    'Mutual',                  // "As a mutual organization"
    'Owned by policyholders',  // "owned by and accountable to the people we insure"
  ]) {
    assert.ok(rail.includes(line),
      `the rail no longer says "${line}", which is the carrier's own wording`);
  }
  /* Their styling, and they do not punctuate it. */
  assert.ok(!rail.includes('A.M. Best'),
    'the rail punctuates AM Best, which the carrier does not');
});

test('AND NOTHING THEY DO NOT SAY', () => {
  for (const [wrong, why] of [
    ['Since 1890', 'they do not claim 1890 as a founding year'],
    ['1890', 'a founding year is back in the rail'],
    ['holding', 'they are a mutual organization, not a holding company'],
    ['136 years', 'a computed age goes stale on its own and is not their phrasing'],
    ['largest', 'a superlative nobody has checked'],
    ['#1', 'a superlative nobody has checked'],
  ]) {
    assert.ok(!rail.includes(wrong), `${why} ("${wrong}" is in the rail)`);
  }
});

test('IT STAYS THREE CREDENTIALS WIDE', () => {
  /* Three fits the band beside the mark and becomes a clean three-up strip
     on a phone. A fourth wraps on desktop and squeezes the strip to
     unreadable at 390px. */
  assert.equal((rail.match(/<dt>/g) ?? []).length, 3,
    'the rail is no longer three credentials, so the phone strip will not '
    + 'lay out three-up');
});
