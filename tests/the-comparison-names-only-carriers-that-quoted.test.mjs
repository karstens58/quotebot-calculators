/*
 * OTHER CARRIERS, WITH AN AGENT -- QBP-653.
 *
 *   node --test tests/the-comparison-names-only-carriers-that-quoted.test.mjs
 *
 * The section below the fold used to show this carrier at other term
 * lengths, which compared the product to itself. It now compares it to the
 * market, and that raises two things the old cards could not get wrong.
 *
 * A PREMIUM UNDER A CARRIER'S NAME IS A CLAIM ABOUT THAT CARRIER. There is
 * no placeholder row, no sample carrier and no invented figure anywhere in
 * the path -- an empty or failed /quote takes the whole section out of the
 * page instead.
 *
 * AND ONLY THE DIRECTLY-QUOTED PRODUCT MAY SAY "NO AGENT". That line is
 * Assurity's to approve and it is true of exactly one row. The distinction
 * has to survive a screenshot, because a screenshot is how it reaches
 * their compliance reviewer.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const JS = readFileSync(join(root, 'site/js/agentlessquote.js'), 'utf8');
const HTML = readFileSync(join(root, 'site/agentlessquote.html'), 'utf8');

/* The render, so a match in the fetch or the legend cannot stand in for
   one in the rows. */
const render = (() => {
  const at = JS.indexOf('function renderComparison(){');
  assert.ok(at > 0, 'renderComparison is gone, and every test below reads it');
  const end = JS.indexOf('\n}\n', JS.indexOf('altFoot', at));
  return JS.slice(at, end === -1 ? at + 12000 : end);
})();

test('THE DELTA IS BASE AGAINST BASE, SO RIDERS CANNOT MOVE IT', () => {
  /*
   * The Compulife rows are base term and nothing else. Measuring a
   * rider-loaded Assurity policy against them reports a saving nobody is
   * being offered -- switch on Return of Premium and every carrier appears
   * fifty dollars a month cheaper, when in truth they would charge for it
   * too.
   *
   * It is also what stops the delta drifting while the thing being
   * compared stands still: riders moved the number without moving a single
   * Compulife figure.
   */
  assert.match(render, /const mine = baseMonthly\(\);/,
    'the comparison measures against the price in the box, which carries '
    + "whatever riders are switched on, against carrier rows that carry none");
  assert.ok(!/const mine = .*currentQuote\.total/.test(render),
    'the rider-loaded total is back as the baseline');
  assert.match(JS, /c\.lookup\).toLowerCase\(\) === 'base'/,
    'the base premium is no longer read off the carrier\'s own coverage '
    + 'rows, so it is being computed here instead');
});

test('AND IT SAYS WHY ITS FIGURE IS NOT THE ONE IN THE BOX ABOVE', () => {
  /*
   * With riders on, the anchor row shows a smaller number than the price
   * box. Unexplained that reads as a bug; the line is what makes the
   * anchor row carry its own weight.
   */
  assert.match(render, /base cover only \\u00b7 riders add/,
    'the anchor row shows a different figure from the price box with '
    + 'nothing saying why');
  assert.match(render, /riders > 0\.005/,
    'the note shows even with no riders on, where it explains nothing');
  assert.match(JS, /base cover with no riders on either side/,
    'the footnote no longer says what was compared');
});

test('NOTHING IS DRAWN WITHOUT BOTH ROWS AND A BASELINE', () => {
  /*
   * Two conditions, not one. Rows with no Assurity price to measure
   * against would render a saving of the entire premium -- the delta
   * column IS the section, and a wrong delta is worse than no section.
   */
  assert.match(render, /if \(!rows\.length \|\| !\(mine > 0\)\) \{ sec\.hidden = true; return; \}/,
    'the section no longer hides itself when it has nothing true to say');
  assert.match(HTML, /<section class="alt-sec" id="altSec" hidden>/,
    'the section starts visible, so an empty frame is on the page until '
    + 'the first quote lands');
});

test('NO INVENTED CARRIER, NO PLACEHOLDER ROW, NO FALLBACK PREMIUM', () => {
  /*
   * quotetool.js kept a CARRIERS table for logos and had to say in a
   * comment that it no longer prices anything. This page never grows one:
   * every name and every figure in the comparison arrived from /quote.
   */
  for (const invented of ['Banner Life', 'Pacific Life', 'Protective', 'Foresters',
    'OPTerm', 'per1000', 'rateFor']) {
    assert.ok(!JS.includes(invented),
      `"${invented}" is in the page, so a carrier or a rate is being named `
      + 'by us rather than by the quote');
  }
  assert.match(JS, /\.filter\(\(q\) => Number\(q\.monthlyPremium\) > 0\)/,
    'a carrier that returned no premium can reach the table, where it will '
    + 'render a saving against a price it never quoted');
});

test('ONLY THE ASSURITY ROW SAYS NO AGENT', () => {
  /* One each, in the table and in the phone cards. More than that means a
     carrier row has picked it up. */
  assert.equal((render.match(/tag-self/g) ?? []).length, 2,
    'the "No agent needed" pill appears somewhere other than the two '
    + 'Assurity rows');
  assert.ok(!/tag-self[^]*?r\.carrierName/.test(render.split('rows.map')[1] ?? ''),
    'a carrier row carries the agentless pill');
  /* And every carrier row carries the opposite one. */
  assert.equal((render.match(/tag-agent/g) ?? []).length, 2,
    'a carrier row is missing its "With an agent" pill, so the two kinds '
    + 'of row look alike');
});

test('THE ASSURITY PILL CARRIES NO HELPER AND NO ICON', () => {
  /*
   * Scott, 26 Nov. It is our own row: there is no carrier caveat to make,
   * and the three helper texts all begin "Complete your application with
   * an agent", which is the one thing that row is not.
   */
  const anchors = render.split('rows.map')[0];
  assert.ok(anchors.includes('<span class="tag-uw instant">Instant decision</span>'),
    'the Assurity row no longer carries a plain instant-decision pill');
  assert.ok(!anchors.includes('INFO_ICON'),
    'the Assurity pill has an information icon, which promises a helper '
    + 'that is not there');
});

test('THE HELPER TEXTS ARE THE ONES THAT WERE APPROVED', () => {
  /*
   * Verbatim, all three. "Your agent will confirm the decision" is what
   * stops "a decision in minutes" reading as a binding offer, which is
   * precisely the sentence a compliance reviewer looks for.
   */
  assert.equal((JS.match(/confirm the decision\./g) ?? []).length, 3,
    'one of the three helpers has lost "Your agent will confirm the '
    + 'decision", which is the sentence that stops "a decision in minutes" '
    + 'reading as a binding offer');
  assert.ok(JS.includes('provide a decision the same day, often within minutes'),
    'the instant-decision helper has drifted from the approved wording');
  assert.ok(JS.includes('underwrite you without an exam and make an offer within a few days'),
    'the accelerated helper has drifted from the approved wording');
  assert.ok(JS.includes('commonly takes two to six weeks'),
    'the traditional helper has drifted, or has started promising a date');
});

test('AN UNRECORDED PRODUCT GETS NO PILLS, NEVER A GUESSED ONE', () => {
  /*
   * The mirror of shared/underwritingroutes.ts. Compulife says nothing
   * about underwriting, so a product nobody has filled in yet must show
   * nothing rather than fall back to "traditional" -- that would assert a
   * route on a carrier's behalf from the absence of information.
   */
  assert.match(JS, /const have = Array\.isArray\(routes\) \? routes : \[\]/,
    'uwPills no longer survives a row that came back without routes');
  assert.ok(!/\|\|\s*\[\s*'traditional'\s*\]/.test(JS),
    'the page falls back to traditional when a product has no routes set');
  assert.match(JS, /const UW_ORDER = \['instant', 'accelerated', 'traditional'\]/,
    'the pill order is gone, so two rows can disagree about how to read');
});

test('THE PHONE GETS CARDS AND THE TABLE GOES AWAY', () => {
  /* Not both, ever: the table and the cards hold the same rows, and a
     breakpoint that showed both would read as the page repeating itself. */
  assert.match(HTML, /\.alt-cards \{ display: none;/,
    'the phone cards are on the page at desktop width as well');
  assert.match(HTML, /\.alt-scroll \{ display: none; \}\n\s*\.alt-table \{ min-width: 0; \}/,
    'the table survives the phone breakpoint, or keeps a min-width wider '
    + 'than the screen');
});

test('THE COMPARISON IS ASKED FOR ONCE PER PROFILE, NOT PER RENDER', () => {
  /*
   * A rider toggle and the monthly/yearly switch both change the Assurity
   * figure and redraw the delta. Neither changes who should be compared,
   * and each one spending a Compulife request would turn a page people
   * fiddle with into a metered allowance.
   */
  assert.match(JS, /if \(key === COMPARE_KEY\) return;/,
    'an unchanged profile asks Compulife again');
  assert.match(JS, /if \(key !== COMPARE_KEY\) return;\s*\/\/ a later ask/,
    'a slow answer for an old profile can land on top of a newer one');
});
