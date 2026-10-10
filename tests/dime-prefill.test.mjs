/**
 * The query-string prefill, tested against THE REAL block cut out of
 * site/dimeneedscalculator.html.
 *
 * The inline DIME card on quote-bot.com/life-insurance/ asks for five numbers
 * and used to throw them away: its button opened this page empty and the
 * visitor typed all five again.
 *
 * Four of the five land in a field that means the same thing. Education does
 * not, and that is the part worth pinning down: the card asks for a total and
 * this page asks for cost per child per year. The number goes into the latter,
 * and Children to Fund and Years Each are left alone on purpose — this page
 * multiplies the three together, so seeding them with invented 1s would turn
 * the visitor's first correction into a figure nobody intended. A later edit
 * that "helpfully" fills those in would be a real bug, and this is what would
 * catch it.
 *
 *   node --test tests/dime-prefill.test.mjs
 */
import { loadCaptureApi } from './capture-api.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const HTML = readFileSync(new URL('../site/dimeneedscalculator.html', import.meta.url), 'utf8');

const START = '(function prefillFromQuery() {';
const END = '})();';
const i = HTML.indexOf(START);
assert.notEqual(i, -1, 'the prefill block is gone from dimeneedscalculator.html');
const j = HTML.indexOf(END, i);
assert.notEqual(j, -1, 'the prefill block is not closed');
const SOURCE = HTML.slice(i, j + END.length);

const IDS = ['debtCards', 'debtAuto', 'debtOther', 'incAnnual', 'incYears',
  'mortBal', 'eduKids', 'eduCost', 'eduYears'];

function run(search) {
  const nodes = {};
  const events = [];
  for (const id of IDS) {
    nodes[id] = { id, value: '', dispatchEvent: (e) => events.push([id, e.type]) };
  }
  /* The REAL tidyQuery — see the note in quotetool-prefill. A stub that
     blanked the search agreed with a page that blanked the search, and
     the affiliate's code went with it. */
  const captured = loadCaptureApi(
    'https://tools.quotebot.io/dimeneedscalculator.html' + (search || ''));
  const location = { search, pathname: '/dimeneedscalculator.html' };
  const QuoteBot = {
    tidyQuery: () => {
      captured.api.tidyQuery();
      location.search = new URL(captured.hrefNow()).search;
    },
  };
  let recalculated = 0;

  const sandbox = {
    URLSearchParams, Number, isNaN,
    location,
    liveUpdate: () => { recalculated++; },
    document: { getElementById: (id) => nodes[id] ?? null },
    window: { QuoteBot },
    history: { replaceState: () => { location.search = ''; } },
    Event: class { constructor(type) { this.type = type; } },
  };
  new Function(...Object.keys(sandbox), `"use strict";${SOURCE}`)(...Object.values(sandbox));

  return {
    values: Object.fromEntries(IDS.map((id) => [id, nodes[id].value])),
    events, recalculated, search: location.search,
  };
}

test('all five numbers land in the right fields', () => {
  const r = run('?debt=25000&income=80000&years=12&mortgage=320000&education=100000');
  assert.equal(r.values.debtOther, '25000', 'an unsplit total belongs in the unspecified bucket');
  assert.equal(r.values.incAnnual, '80000');
  assert.equal(r.values.incYears, '12');
  assert.equal(r.values.mortBal, '320000');
  assert.equal(r.values.eduCost, '100000');
});

test('education does not invent a number of children or years', () => {
  // This page multiplies children x years x cost. Seeding 1 and 1 makes the
  // total look right until the visitor corrects either one, at which point
  // their $100,000 silently becomes $800,000.
  const r = run('?education=100000');
  assert.equal(r.values.eduCost, '100000');
  assert.equal(r.values.eduKids, '', 'Children to Fund must be left for the visitor');
  assert.equal(r.values.eduYears, '', 'Years Each must be left for the visitor');
});

test('the debt total does not touch the other two debt buckets', () => {
  const r = run('?debt=25000');
  assert.equal(r.values.debtOther, '25000');
  assert.equal(r.values.debtCards, '', 'nothing was said about credit cards');
  assert.equal(r.values.debtAuto, '', 'nothing was said about auto loans');
});

test('each filled field is pushed through the page\'s own input handler', () => {
  // Assigning the value directly would skip the comma formatting and leave
  // the totals stale, so the event matters as much as the value.
  const r = run('?debt=25000&income=80000');
  assert.deepEqual(r.events, [['debtOther', 'input'], ['incAnnual', 'input']]);
  assert.equal(r.recalculated, 1, 'the totals should be refreshed once, after filling');
});

test('a value that is not cleanly a number is refused whole', () => {
  const r = run('?debt=abc&income=&mortgage=12three4');
  assert.equal(r.values.debtOther, '');
  assert.equal(r.values.incAnnual, '');
  assert.equal(r.values.mortBal, '', 'a value that is not cleanly a number is refused whole');
});

test('a partly filled card still carries what it has', () => {
  const r = run('?mortgage=250000');
  assert.equal(r.values.mortBal, '250000');
  assert.equal(r.values.incAnnual, '');
  assert.equal(r.recalculated, 1);
});

test('nothing happens, and nothing recalculates, without a query string', () => {
  const r = run('');
  assert.deepEqual(Object.values(r.values).filter(Boolean), []);
  assert.equal(r.recalculated, 0);
});

test('the numbers are taken out of the address bar and the code is left in', () => {
  assert.equal(run('?income=80000').search, '');

  /* The half that was missing, and the half that mattered: every visitor
     who reached this calculator from an affiliate's page arrived with
     their code and was recorded as having arrived from nowhere. */
  const left = new URLSearchParams(run('?qb=AT-DIME&income=80000').search);
  assert.equal(left.get('qb'), 'AT-DIME',
    'the affiliate who sent this visitor was tidied out of the url');
  assert.equal(left.get('income'), null, 'an answer was left in the url');
});
