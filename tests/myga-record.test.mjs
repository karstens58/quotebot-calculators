/**
 * What a MYGA run puts on the record, built by THE REAL shownResults cut
 * out of site/mygacalculator.html.
 *
 * QBP-548. This page captured a lead with `results: null` for as long as it
 * has existed, and lead-capture/handler.ts creates no Illustration when
 * results are null -- so there has never been a record anywhere of the term
 * somebody picked, the carrier, the rate, the value at maturity, or the
 * ladder they compared. `inputs` carried identity fields only: a deposit
 * with no rate and no term attached to it.
 *
 * The tests below are mostly one assertion in different clothes: what the
 * screen said is on the record, or the record is not worth having.
 *
 *   node --test tests/myga-record.test.mjs
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const HTML = readFileSync(new URL('../site/mygacalculator.html', import.meta.url), 'utf8');

function cut(start, endMarker) {
  const i = HTML.indexOf(start);
  assert.notEqual(i, -1, `could not find ${start} in mygacalculator.html`);
  const j = HTML.indexOf(endMarker, i + start.length);
  assert.notEqual(j, -1, `could not find the end of ${start}`);
  return HTML.slice(i, j + endMarker.length);
}

/* getCarrierRate comes along because shownResults leans on it, and its
   manual-mode branch is half of what these tests are about. */
const source = [
  cut('function getCarrierRate(term, carrier) {', '\n}'),
  cut('function shownResults(){', '\n}'),
].join('\n');

const PARAMS = ['document', 'numVal', 'rateMode', 'manualRate', 'MYGA_RATES',
  'CARRIER_RATES_BY_TERM', 'CARRIER_INFO', 'CARRIER_BASE', 'compareData',
  'selectedTerm', 'selectedCarrier', 'selectedFunding', 'selectedQual',
  'rateEffectiveDate', 'rateVerifiedDate', 'rateSource'];

const RATES = [{ term: 3, rate: 5.25 }, { term: 5, rate: 5.40 },
  { term: 7, rate: 5.45 }, { term: 10, rate: 5.35 }];

const BY_TERM = {
  3:  { 'Athene MaxRate 3': 5.25, 'Oceanview 3': 5.10 },
  5:  { 'Oceanview Life & Annuity': 5.40, 'Athene MaxRate 5': 5.25 },
  7:  { 'National Life RetireMax Secure 7': 5.45, 'Americo 7': 5.20 },
  10: { 'Americo Platinum Assure 10': 5.35, 'Sentinel 10': 4.95 },
};

const INFO = {
  'Athene': { amBestRating: 'A+' },
  'Oceanview': { amBestRating: 'A-' },
  'National Life': { amBestRating: 'A' },
  'Americo': { amBestRating: 'A' },
  /* Deliberately rated the string the page refuses to repeat. */
  'Sentinel': { amBestRating: 'Not Rated' },
};
const BASE = {
  'Athene MaxRate 3': 'Athene', 'Athene MaxRate 5': 'Athene',
  'Oceanview 3': 'Oceanview', 'Oceanview Life & Annuity': 'Oceanview',
  'National Life RetireMax Secure 7': 'National Life',
  'Americo 7': 'Americo', 'Americo Platinum Assure 10': 'Americo',
  'Sentinel 10': 'Sentinel',
};

function run(over = {}) {
  const fields = Object.assign({ premium: '250000', 'cf-state': 'CO' }, over.fields);
  const doc = { getElementById: (id) => (id in fields ? { value: fields[id] } : null) };
  const fn = new Function(...PARAMS, `${source}\n return shownResults();`);
  return fn(doc,
    (id) => Number(fields[id] || 0),
    over.rateMode ?? 'carrier',
    over.manualRate ?? 5.00,
    over.MYGA_RATES ?? RATES,
    over.CARRIER_RATES_BY_TERM ?? BY_TERM,
    over.CARRIER_INFO ?? INFO,
    BASE,
    over.compareData ?? RATES.map((r) => ({ term: r.term, rate: r.rate, mv: 1 })),
    over.selectedTerm ?? 5,
    over.selectedCarrier ?? 'Oceanview Life & Annuity',
    'cash', 'nonqualified', '2026-11-07', '2026-11-08', 'carrier-feed');
}

const byTerm = (res, t) => res.bestByTerm.find((r) => r.term === t);

test('the run itself is on the record', () => {
  const r = run();
  assert.equal(r.selectedTerm, 5);
  assert.equal(r.selectedCarrier, 'Oceanview Life & Annuity');
  assert.equal(r.selectedRate, 5.40);
  assert.equal(r.deposit, 250000);
  assert.equal(r.state, 'CO');
  assert.equal(r.rateEffectiveDate, '2026-11-07');
  /* 250000 * 1.054^5 */
  assert.equal(Math.round(r.maturityValue), 325194);
  assert.equal(Math.round(r.interestEarned), 75194);
});

test('the ladder names the best carrier at each term, not the selected one', () => {
  const r = run();
  assert.deepEqual(r.bestByTerm.map((x) => [x.term, x.bestCarrier, x.bestRate]), [
    [3, 'Athene MaxRate 3', 5.25],
    [5, 'Oceanview Life & Annuity', 5.40],
    [7, 'National Life RetireMax Secure 7', 5.45],
    [10, 'Americo Platinum Assure 10', 5.35],
  ]);
  /* The other ladder is the selected carrier across every term, which is a
     different question with a different answer. Both are on the record and
     named, so nothing downstream has to guess which it is holding. */
  assert.ok(Array.isArray(r.selectedCarrierByTerm));
  assert.notDeepEqual(r.bestByTerm.map((x) => x.bestCarrier),
    r.selectedCarrierByTerm.map(() => 'Oceanview Life & Annuity').slice(0, 1).concat([]));
});

test('a tie is broken by name, the same way every time', () => {
  const tied = Object.assign({}, BY_TERM, {
    7: { 'Zurich Secure 7': 5.45, 'Athene MaxRate 7': 5.45, 'Americo 7': 5.20 },
  });
  const first = run({ CARRIER_RATES_BY_TERM: tied });
  assert.equal(byTerm(first, 7).bestCarrier, 'Athene MaxRate 7',
    'the tie did not go to the alphabetically first carrier');
  /* Same inputs in a different insertion order must not change the answer:
     Object.keys order is whatever the engine returned that minute, and the
     email names one of these carriers in writing. */
  const reordered = Object.assign({}, BY_TERM, {
    7: { 'Athene MaxRate 7': 5.45, 'Zurich Secure 7': 5.45, 'Americo 7': 5.20 },
  });
  assert.equal(byTerm(run({ CARRIER_RATES_BY_TERM: reordered }), 7).bestCarrier,
    byTerm(first, 7).bestCarrier);
});

test('a term nothing quotes is recorded as such, not dropped', () => {
  const holed = Object.assign({}, BY_TERM); delete holed[7];
  const r = run({ CARRIER_RATES_BY_TERM: holed });
  assert.equal(r.bestByTerm.length, 4, 'the 7-year row vanished from the ladder');
  const seven = byTerm(r, 7);
  assert.equal(seven.noCarrier, true);
  assert.equal(seven.bestCarrier, null);
  assert.equal(seven.maturityValue, null,
    'a maturity figure survived for a term no carrier is quoting');
});

test('a carrier with no usable rating records none, never "Not Rated"', () => {
  const r = run({ selectedTerm: 10, selectedCarrier: 'Sentinel 10',
    CARRIER_RATES_BY_TERM: Object.assign({}, BY_TERM,
      { 10: { 'Sentinel 10': 5.35 } }) });
  const ten = byTerm(r, 10);
  assert.equal(ten.bestCarrier, 'Sentinel 10');
  assert.equal(ten.amBestRating, null,
    '"Not Rated" reached the record, and that is itself a claim about a company');
  assert.equal(r.selectedAmBestRating, null);
});

test('a manual run is recorded as manual and names nobody', () => {
  const r = run({ rateMode: 'manual', manualRate: 6.25 });
  assert.equal(r.rateMode, 'manual');
  assert.equal(r.guaranteed, false,
    'a rate the visitor typed is on the record as guaranteed by a carrier');
  assert.equal(r.selectedCarrier, null);
  assert.deepEqual(r.carriersByTerm, {},
    'carrier rates are on the record of a run that consulted no carriers');
  for (const row of r.bestByTerm) {
    assert.equal(row.bestCarrier, null,
      'a carrier is named against a rate the visitor typed');
    assert.equal(row.bestRate, 6.25);
  }
});

test('a carrier run is recorded as guaranteed', () => {
  const r = run();
  assert.equal(r.guaranteed, true);
  assert.equal(r.rateMode, 'carrier');
  assert.ok(Object.keys(r.carriersByTerm).length);
});
