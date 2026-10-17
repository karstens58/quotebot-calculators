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
  'mortBal', 'eduKids', 'eduCost', 'eduYears', 'existLife', 'existSavings',
  'emergFund', 'finalExp'];

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
    'https://tools.quote-bot.com/dimeneedscalculator.html' + (search || ''));
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

/* ------------------------------------------- the chat's keys (QBP-183) -- */
/*
 * The card above sends five numbers from a form it drew. The assistant
 * collects its numbers one question at a time and knows which is which, so
 * it can fill fields the card never could.
 */

test('EXISTING COVER IS CARRIED, OR THE FIGURE IS CONFIDENTLY WRONG', () => {
  // The one that produces a wrong answer rather than an incomplete one.
  // Without it a visitor with $250k of group life through work is handed a
  // recommendation $250k too high, and nothing on the page says the
  // calculation assumed they had none.
  const r = run('?income=140000&existing=250000&savings=40000');
  assert.equal(r.values.existLife, '250000');
  assert.equal(r.values.existSavings, '40000');
  assert.equal(r.values.incAnnual, '140000');
});

test('education takes all three or the answer does not move', () => {
  // kids x years x cost, with years falling back to 1 and the other two to
  // 0. A caller that sends kids alone asked a question, carried the answer,
  // and changed the total by nothing.
  const all = run('?kids=2&eduyears=4&educost=30000');
  assert.equal(all.values.eduKids, '2');
  assert.equal(all.values.eduYears, '4');
  assert.equal(all.values.eduCost, '30000');
});

test('THE E IS NOT ONLY EDUCATION', () => {
  // calcEducation returns eduTotal + emergency + final. Both of those
  // default to blank, so a handoff that fills the schooling and skips them
  // has not produced a smaller answer -- it has produced one with the
  // funeral left out.
  const r = run('?emergency=25000&final=15000');
  assert.equal(r.values.emergFund, '25000');
  assert.equal(r.values.finalExp, '15000');
});

test('final expenses is the whole E for somebody with no children', () => {
  // The visitor with no kids and no mortgage. Education contributes nothing
  // for them by design, and if `final` is not carried the entire category
  // is zero -- which is wrong for everybody, not just for them.
  const r = run('?income=90000&final=15000');
  assert.equal(r.values.finalExp, '15000');
  assert.equal(r.values.eduKids, '');
});

test('AN EXPLICIT PER-CHILD COST BEATS THE CARD TOTAL', () => {
  // Both land in eduCost. The card's key is a total it asked for as a
  // total; the chat's is a genuine per-child-per-year figure. When both
  // arrive the explicit one wins, and MAP ORDER is the only thing deciding
  // that -- which is why it is pinned here rather than left to luck.
  const r = run('?education=100000&educost=30000&kids=2&eduyears=4');
  assert.equal(r.values.eduCost, '30000',
    'the card total overwrote a figure the visitor actually gave');
});

test('the card still behaves exactly as it did', () => {
  // The new keys must not have changed the old path. Children and Years are
  // still left alone when only a total arrives.
  const r = run('?education=100000');
  assert.equal(r.values.eduCost, '100000');
  assert.equal(r.values.eduKids, '');
  assert.equal(r.values.eduYears, '');
});

test('a chat handoff fills what it collected and nothing else', () => {
  // The six questions, as the interview will send them. Everything the
  // visitor was not asked stays empty for the page's own defaults.
  const r = run('?income=140000&years=20&mortgage=310000&debt=25000&existing=250000');
  assert.deepEqual(
    Object.fromEntries(Object.entries(r.values).filter(([, v]) => v !== '')),
    {
      incAnnual: '140000', incYears: '20', mortBal: '310000',
      debtOther: '25000', existLife: '250000',
    },
  );
});

test('a junk value in a new key is ignored like any other', () => {
  // Whole value or nothing, the same rule the original keys get: stripping
  // the stray characters out of "12three4" would quietly put 124 into a
  // money field, which is worse than ignoring it.
  const r = run('?existing=two%20hundred&kids=-1&savings=40000');
  assert.equal(r.values.existLife, '');
  assert.equal(r.values.eduKids, '');
  assert.equal(r.values.existSavings, '40000', 'one bad key dropped a good one');
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
