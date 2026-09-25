/**
 * The single coverage dropdown, tested against THE REAL functions cut out of
 * site/quotetool.html.
 *
 * This replaced two selects -- a product and a duration -- which could
 * contradict each other: "Guaranteed UL" paired with "20 Year Term" described
 * nothing Compulife could price. One category letter cannot disagree with
 * itself.
 *
 * What can still go wrong: the list fails to load and the visitor is left with
 * no way to quote; a category name off the wire is written into the page as
 * markup; or a term length is invented for a coverage that has none.
 *
 *   node --test tests/quotetool-coverage.test.mjs
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const HTML = readFileSync(new URL('../site/quotetool.html', import.meta.url), 'utf8');

function cut(start, endMarker, { keepEnd = true } = {}) {
  const i = HTML.indexOf(start);
  assert.notEqual(i, -1, `could not find ${start}`);
  const j = HTML.indexOf(endMarker, i + start.length);
  assert.notEqual(j, -1, `could not find the end of ${start}`);
  return HTML.slice(i, keepEnd ? j + endMarker.length : j);
}

const source = [
  cut('function catSel(){', '\n}'),
  cut('function termYearsOf(name){', '\n}'),
  cut('async function loadCoverageCategories(){', '\n}\nloadCoverageCategories();', { keepEnd: false }) + '\n}',
].join('\n');

/* A select element with just enough behaviour to be wrong in the ways that
   matter: options carry value and textContent, and innerHTML='' clears them. */
function makeSelect(initial = []) {
  const sel = {
    options: initial.map((o) => ({ ...o })),
    _value: initial.find((o) => o.selected)?.value ?? (initial[0]?.value ?? ''),
    get value() { return this._value; },
    set value(v) { this._value = v; },
    set innerHTML(v) { assert.equal(v, '', 'innerHTML was used for anything but clearing'); this.options = []; },
    appendChild(o) { this.options.push(o); },
    querySelector(q) {
      const m = /option\[value="(.*)"\]/.exec(q);
      return m ? this.options.find((o) => o.value === m[1]) ?? null : null;
    },
    get selectedOptions() {
      const o = this.options.find((x) => x.value === this._value);
      return o ? [o] : [];
    },
  };
  return sel;
}

function run(select, { endpoint = 'https://engine.test/', fetchImpl } = {}) {
  const document = {
    getElementById: (id) => (id === 'coverageCat' ? select : null),
    createElement: () => ({ value: '', textContent: '' }),
  };
  const warnings = [];
  const console_ = { warn: (...a) => warnings.push(a.join(' ')) };
  const fn = new Function('document', 'window', 'fetch', 'console',
    `${source}\n return { termYearsOf, loadCoverageCategories };`);
  const api = fn(document, { QB_QUOTE_ENDPOINT: endpoint }, fetchImpl, console_);
  return { api, warnings };
}

const ok = (categories) => async () => ({
  ok: true, status: 200, json: async () => ({ categories }),
});

const FALLBACK = [
  { value: '3', textContent: '10 Year Level Term Guaranteed', selected: true },
  { value: '5', textContent: '20 Year Level Term Guaranteed' },
];

/* ---- the shipped markup ---------------------------------------------------- */

test('the page ships with usable options before any network call', () => {
  const block = HTML.slice(HTML.indexOf('<select id="coverageCat">'));
  const opts = [...block.slice(0, block.indexOf('</select>')).matchAll(/value="([^"]+)"/g)]
    .map((m) => m[1]);
  assert.ok(opts.length >= 4, 'no fallback options in the markup');
  /* Real Compulife letters, not the old 10/15/20/30 year numbers -- those
     would be sent as a category and rejected. */
  for (const o of opts) assert.match(o, /^[0-9A-Za-z]$/, `"${o}" is not a category letter`);
});

test('the old product and duration selects are gone', () => {
  assert.ok(!HTML.includes('id="productType"'));
  assert.ok(!HTML.includes('id="duration"'));
});

/* ---- termYearsOf ------------------------------------------------------------ */

test('a level term yields its year count', () => {
  const { api } = run(makeSelect(FALLBACK));
  assert.equal(api.termYearsOf('10 Year Level Term Guaranteed'), 10);
  assert.equal(api.termYearsOf('20 Year Level Term Guaranteed'), 20);
  assert.equal(api.termYearsOf('1 Year Level Term'), 1);
  assert.equal(api.termYearsOf('15 Year Return of Premium'), 15);
});

test('A COVERAGE WITH NO TERM LENGTH GETS NONE INVENTED', () => {
  const { api } = run(makeSelect(FALLBACK));
  for (const name of [
    'To Age 121 Level  (No Lapse U/L)',
    'To Age 65 Level Guaranteed',
    'GIWL - Graded Benefit Whole Life',
    'To Age 121 Level - 20 Pay',        // a pay period, not a term
    'To Age 121 Level - 20 Year Pay',   // still a pay period, though it says "year"
    'Return of Premium over 30 Years',  // only a LEADING count is a term length
    'Other Term', '', null, undefined,
  ]) {
    assert.equal(api.termYearsOf(name), null,
      `${JSON.stringify(name)} produced a term length`);
  }
});

/* ---- loading the live list -------------------------------------------------- */

test('the live list replaces the fallback options', async () => {
  const sel = makeSelect(FALLBACK);
  const { api } = run(sel, { fetchImpl: ok([
    { letter: '3', name: '10 Year Level Term Guaranteed' },
    { letter: '5', name: '20 Year Level Term Guaranteed' },
    { letter: 'Y', name: 'GIWL - Graded Benefit Whole Life' },
  ]) });
  await api.loadCoverageCategories();
  assert.deepEqual(sel.options.map((o) => o.value), ['3', '5', 'Y']);
  assert.equal(sel.options[2].textContent, 'GIWL - Graded Benefit Whole Life');
});

test('A CATEGORY NAME OFF THE WIRE IS TEXT, NEVER MARKUP', async () => {
  const sel = makeSelect(FALLBACK);
  const nasty = '<img src=x onerror="alert(1)">';
  const { api } = run(sel, { fetchImpl: ok([{ letter: 'Z', name: nasty }]) });
  await api.loadCoverageCategories();
  /* textContent holds it verbatim; the makeSelect stub asserts innerHTML was
     only ever used to clear, so it cannot have been parsed as HTML. */
  assert.equal(sel.options[0].textContent, nasty);
});

test('the visitor keeps the coverage they had chosen', async () => {
  const sel = makeSelect(FALLBACK);
  sel.value = '5';
  const { api } = run(sel, { fetchImpl: ok([
    { letter: '3', name: '10 Year' }, { letter: '5', name: '20 Year' },
  ]) });
  await api.loadCoverageCategories();
  assert.equal(sel.value, '5');
});

test('a choice the live list no longer offers falls back to 20-year term', async () => {
  /* The 20-year term is deliberately NOT first here. An earlier version of
     this test put it first, so "prefer 5" and "just take options[0]" gave the
     same answer and the assertion proved nothing. */
  const sel = makeSelect(FALLBACK);
  sel.value = '3';
  const { api } = run(sel, { fetchImpl: ok([
    { letter: 'Y', name: 'GIWL - Graded Benefit Whole Life' },
    { letter: '1', name: '1 Year Level Term' },
    { letter: '5', name: '20 Year Level Term Guaranteed' },
  ]) });
  await api.loadCoverageCategories();
  assert.equal(sel.value, '5',
    'a dropped choice should land on the 20-year term, not on whatever is first');
});

test('malformed rows are skipped rather than rendered blank', async () => {
  const sel = makeSelect(FALLBACK);
  const { api } = run(sel, { fetchImpl: ok([
    { letter: '5', name: '20 Year Level Term Guaranteed' },
    { letter: '', name: 'no letter' }, { letter: 'X' }, null,
  ]) });
  await api.loadCoverageCategories();
  assert.deepEqual(sel.options.map((o) => o.value), ['5']);
});

/* ---- failure ----------------------------------------------------------------- */

test('A FAILED LIST LEAVES THE VISITOR ABLE TO QUOTE', async () => {
  for (const [label, impl] of [
    ['network error', async () => { throw new Error('offline'); }],
    /* A body that WOULD parse, so the status check is the only thing
       standing between an error response and the visitor's dropdown. */
    ['HTTP 500', async () => ({
      ok: false, status: 500,
      json: async () => ({ categories: [{ letter: 'Z', name: 'error page content' }] }),
    })],
    ['empty list', ok([])],
    ['not an array', async () => ({ ok: true, status: 200, json: async () => ({ categories: 'nope' }) })],
  ]) {
    const sel = makeSelect(FALLBACK);
    const { api, warnings } = run(sel, { fetchImpl: impl });
    await api.loadCoverageCategories();
    assert.deepEqual(sel.options.map((o) => o.value), ['3', '5'],
      `${label} destroyed the fallback options`);
    assert.equal(warnings.length, 1, `${label} was not logged`);
  }
});

test('no engine configured means no call and no damage', async () => {
  const sel = makeSelect(FALLBACK);
  let called = false;
  const { api } = run(sel, {
    endpoint: '', fetchImpl: async () => { called = true; return ok([])(); },
  });
  await api.loadCoverageCategories();
  assert.equal(called, false, 'called an endpoint that is not configured');
  assert.deepEqual(sel.options.map((o) => o.value), ['3', '5']);
});
