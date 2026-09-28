/**
 * The D.I.M.E. quote cards, rendered by THE REAL renderQuoteCards cut out of
 * site/dimeneedscalculator.html.
 *
 * What this page used to do is the reason the test exists. It carried its own
 * table of per-$1,000 factors and a three-card layout with two carriers
 * written into it: Cincinnati was always "Recommended", and the third card
 * showed Assurity at a premium computed by scaling whoever happened to be
 * cheapest on that render. That number was nobody's rate, on the page that
 * tells somebody what their coverage costs.
 *
 * So the tests below are mostly one assertion in different clothes: a price
 * on this page came from the engine, or it is not on this page.
 *
 *   node --test tests/dime-quotes.test.mjs
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const HTML = readFileSync(new URL('../site/dimeneedscalculator.html', import.meta.url), 'utf8');

function cut(start, endMarker, { keepEnd = true } = {}) {
  const i = HTML.indexOf(start);
  assert.notEqual(i, -1, `could not find ${start} in dimeneedscalculator.html`);
  const j = HTML.indexOf(endMarker, i + start.length);
  assert.notEqual(j, -1, `could not find the end of ${start}`);
  return HTML.slice(i, keepEnd ? j + endMarker.length : j);
}

const source = [
  cut('const esc = s =>', "replace(/'/g, '&#39;');"),
  cut('const fmt$ =', '\n'),
  cut('const fmtMo =', "const fmtYr = n => '$' + Math.round(n).toLocaleString('en-US');"),
  cut('function cheapestQuote(rows){', '\n}'),
  cut('function quoteNotice(kind, icon, html){', '\n}'),
  cut('const CALL_US =', "</a>';"),
  cut('function renderPremiumNote(){', '\n}'),
  cut('function renderQuoteCards(){', "\n  done(cards.join(''));\n}"),
].join('\n');

/*
 * The state renderQuoteCards reads is passed in as parameters rather than
 * cut out with the code, which is what lets one harness drive every branch.
 */
const PARAMS = ['document', 'currentInp', 'QUOTE_STATE', 'QUOTES', 'FEATURED',
  'selectedTerm', 'PREMIUMS_ARE_ESTIMATES', 'effectiveCoverage'];

function run(state) {
  const nodes = { quoteCards: { innerHTML: '' }, quoteNote: { innerHTML: '' } };
  const doc = { getElementById: (id) => nodes[id] ?? null };
  const fn = new Function(...PARAMS, `${source}\n return renderQuoteCards();`);
  fn(doc,
    state.currentInp === undefined ? INP : state.currentInp,
    state.QUOTE_STATE ?? 'ok',
    state.QUOTES ?? [],
    state.FEATURED ?? [],
    state.selectedTerm ?? 20,
    state.PREMIUMS_ARE_ESTIMATES ?? false,
    () => (state.coverage ?? 500000));
  return { cards: nodes.quoteCards.innerHTML, note: nodes.quoteNote.innerHTML };
}

const INP = { dob: '1978-04-02', state: 'CO', gender: 'Male', tobacco: 'No',
  uwClass: 'Preferred' };

const q = (id, name, monthly) => ({
  id, name, prodResolved: `${name} Term 20`, rating: 'A+',
  monthly, annual: monthly * 12, coverage: 500000,
  logo: `<div class="logo">${name}</div>`,
});

const QUOTES = [
  q('bann', 'Banner Life', 44.10),
  q('amge', 'American General', 38.20),
  q('cinn', 'Cincinnati Life', 51.75),
  q('nort', 'North American', 47.30),
];

/* ---------------------------------------------------------------------- */

test('THE POINT: no premium appears that is not in the engine payload', () => {
  const { cards } = run({ QUOTES });
  const shown = [...cards.matchAll(/\$(\d+\.\d\d) <small>\/m/g)].map((m) => Number(m[1]));
  assert.ok(shown.length >= 1, 'no prices rendered at all');
  const offered = QUOTES.map((r) => Number(r.monthly.toFixed(2)));
  for (const price of shown) {
    assert.ok(offered.includes(price),
      `${price} is on the page and came from no quote — a derived premium is back`);
  }
});

test('and no carrier appears that did not quote', () => {
  const { cards } = run({ QUOTES });
  for (const banned of ['Assurity', 'assurity']) {
    assert.ok(!cards.includes(banned),
      'Assurity is being shown again, and it never quoted');
  }
  const names = [...cards.matchAll(/best-carrier-name">([^<]+)</g)].map((m) => m[1]);
  assert.ok(names.length >= 1);
  for (const n of names) {
    assert.ok(QUOTES.some((r) => r.name === n), `${n} is on a card but never quoted`);
  }
});

test('the source file carries no rate table of its own', () => {
  /* The factors the old cards priced from. Any of them back in the file
     means a second, un-auditable source of premiums has returned. */
  for (const gone of ['per1000', 'TERM_FACTOR', 'HEALTH_FACTOR', 'ANNUAL_DIVISOR',
    'function rateFor', 'ASSURITY_PER1000']) {
    assert.ok(!HTML.includes(gone), `${gone} is back in dimeneedscalculator.html`);
  }
});

test('the cheapest card is the cheapest row, not the first one', () => {
  const { cards } = run({ QUOTES });
  const prices = [...cards.matchAll(/\$(\d+\.\d\d) <small>\/m/g)].map((m) => m[1]);
  assert.equal(prices[0], '38.20',
    'the "Most Affordable" card is not showing the lowest price');
});

test('a carrier nobody curated gets no badge of endorsement and no reasons', () => {
  const featured = [Object.assign({}, q('bann', 'Banner Life', 44.10),
    { curated: false, bullets: ['made up'], badge: '' })];
  const { cards } = run({ QUOTES, FEATURED: featured });
  assert.ok(!cards.includes('made up'),
    'bullets are showing under a carrier nobody chose');
  assert.ok(cards.includes('Another Option'));
  assert.ok(!cards.includes('Our Pick'));
});

test("a curated carrier's own tag beats the slot's wording", () => {
  const featured = [Object.assign({}, q('cinn', 'Cincinnati Life', 51.75),
    { curated: true, bullets: ['Top-rated A+ carrier'], badge: 'Best for families' })];
  const { cards } = run({ QUOTES, FEATURED: featured });
  assert.ok(cards.includes('Best for families'));
  assert.ok(cards.includes('Top-rated A+ carrier'));
});

test('admin text and carrier names are escaped on the way in', () => {
  const featured = [Object.assign({}, q('x', 'Smith & Sons <Life>', 60),
    { curated: true, bullets: ['<script>alert(1)</script>'], badge: '"quoted"' })];
  const { cards } = run({ QUOTES, FEATURED: featured });
  assert.ok(!cards.includes('<script>alert(1)</script>'), 'unescaped admin text');
  assert.ok(cards.includes('Smith &amp; Sons &lt;Life&gt;'));
});

test('estimates are declared, filed rates are not', () => {
  const est = run({ QUOTES, PREMIUMS_ARE_ESTIMATES: true });
  assert.match(est.note, /Illustrative estimates/);
  const filed = run({ QUOTES, PREMIUMS_ARE_ESTIMATES: false });
  assert.equal(filed.note, '',
    'filed carrier rates are being labelled as modelled estimates');
});

test('a failed quote shows no numbers at all', () => {
  const { cards, note } = run({ QUOTE_STATE: 'error', QUOTES });
  assert.ok(!/\$\d+\.\d\d/.test(cards),
    'a price survived a failed quote — that price came from nowhere');
  assert.match(cards, /could not reach the quote service/);
  assert.match(cards, /888/);
  assert.equal(note, '');
});

test('an empty result says it is about the tool, not the person', () => {
  const { cards } = run({ QUOTE_STATE: 'empty', QUOTES: [] });
  assert.match(cards, /statement about this tool, not about you/);
  assert.ok(!/uninsurable/i.test(cards));
  assert.ok(!/\$\d+\.\d\d/.test(cards));
});

test('nothing is priced before there is anything to price it for', () => {
  const noDob = run({ currentInp: { dob: '', state: 'CO' }, QUOTES });
  assert.ok(!/\$\d+\.\d\d/.test(noDob.cards));
  assert.match(noDob.cards, /date of birth and state/);

  const noCoverage = run({ coverage: 0, QUOTES });
  assert.match(noCoverage.cards, /Enter a coverage amount/);
});

/* ---- the request, rather than the render ------------------------------- */

test('the quote carries tobacco, and the page asks for it', () => {
  assert.ok(HTML.includes('id="tobaccoSeg"'),
    'the tobacco question is gone — every smoker is now priced as a non-smoker');
  const body = cut('function quoteBody(){', '\n}');
  assert.match(body, /tobacco:\s*currentInp\.tobacco === 'Yes'/);
  assert.match(body, /dateOfBirth:\s*currentInp\.dob/);
  assert.match(body, /toolKey:\s*'dime'/);
});

test('the category letter and the old termYears shape are never sent together', () => {
  const body = cut('function quoteBody(){', '\n}');
  /* Both would let the request contradict itself, and the engine prefers
     `coverage` — so the duration the visitor picked would be silently
     ignored rather than refused. */
  assert.match(body, /if \(letter\) body\.coverage = letter;\s*\n\s*else \{/);
});

test('the term menu is built from what Compulife currently offer', () => {
  const load = cut('async function loadCoverageCategories(){', '\n}');
  assert.match(load, /\/categories/);
  /* Level term only: "20 Year Return of Premium" also starts with a number
     and is a different product at a different price. */
  assert.match(load, /year\\s\+level\\s\+term/i);
});

test('quotes are coalesced, and a stale reply cannot overwrite a fresh one', () => {
  const req = cut('function requestQuotes(){', '\n}');
  assert.match(req, /clearTimeout\(quoteTimer\)/);
  assert.match(req, /key === lastQuoteKey/);
  const send = cut('async function sendQuote(body, seq){', '\n  renderQuoteCards();\n}');
  assert.ok((send.match(/if \(seq !== quoteSeq\) return;/g) || []).length >= 2,
    'a late reply can still write over a newer one');
});

test('the lead record carries the premiums that were on the screen', () => {
  const cap = cut('function qbCaptureLead(){', '\n}');
  assert.match(cap, /monthlyPremium: q\.monthly/);
  assert.match(cap, /premiumsAreEstimates: PREMIUMS_ARE_ESTIMATES/);
});
