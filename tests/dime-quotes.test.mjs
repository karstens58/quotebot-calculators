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
import { readFileSync, readdirSync } from 'node:fs';

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
  /* Ends on the fmtYr alias rather than on a newline or on the next
     declaration: fmtMo is a block now, so either of those cuts it in
     half and every test in this file dies on a syntax error. */
  cut('const fmtMo =', 'const fmtYr = fmtMo;'),
  cut('function cheapestQuote(rows){', '\n}'),
  cut('function quoteNotice(kind, icon, html){', '\n}'),
  cut('const CALL_US =', "</a>';"),
  cut('function renderPremiumNote(){', '\n}'),
  cut('function renderQuoteCards(){', "\n  done(cards.join(''));\n}"),
  cut('function shownResults(){', '\n}'),
  /* A real binding rather than the global a bare assignment would create
     inside new Function -- otherwise SHOWN leaks between tests and the
     one that runs second reads the first one's cards. */
  'let SHOWN = [];',
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
  const fn = new Function(...PARAMS,
    `${source}\n renderQuoteCards(); return shownResults();`);
  let recorded;
  recorded = fn(doc,
    state.currentInp === undefined ? INP : state.currentInp,
    state.QUOTE_STATE ?? 'ok',
    state.QUOTES ?? [],
    state.FEATURED ?? [],
    state.selectedTerm ?? 20,
    state.PREMIUMS_ARE_ESTIMATES ?? false,
    () => (state.coverage ?? 500000));
  return { cards: nodes.quoteCards.innerHTML, note: nodes.quoteNote.innerHTML,
           recorded };
}

const badges = (html) =>
  [...html.matchAll(/class="best-badge [^"]*">([^<]*)</g)].map((m) => m[1]);

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
  assert.ok(!cards.includes('Our Recommendation'));
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
  assert.match(cap, /quotes: shownResults\(\)/,
    'the capture is building its own list again instead of reading the one '
    + 'the renderer wrote');
  assert.match(cap, /premiumsAreEstimates: PREMIUMS_ARE_ESTIMATES/);
});

test('the record says which three were drawn, and what each was called', () => {
  const { cards, recorded } = run({ QUOTES, FEATURED: [
    Object.assign({}, QUOTES[0], { curated: true, bullets: ['No medical exam'], badge: '' }),
    Object.assign({}, QUOTES[2], { curated: true, bullets: ['A+ rated'], badge: '' }),
  ] });
  /* Every row stays on the record -- the full list is the evidence of what
     was available -- and exactly the drawn three carry a label. */
  assert.equal(recorded.length, QUOTES.length);
  const labelled = recorded.filter((r) => r.label);
  assert.equal(labelled.length, 3);
  /* DERIVED FROM THE RENDERER, not restated beside it: the labels on the
     record are read back out of the cards the renderer actually drew. */
  assert.deepEqual(labelled.map((r) => r.label).sort(), badges(cards).slice().sort());
  for (const r of labelled) {
    assert.ok(cards.includes(r.carrier), `${r.carrier} is on the record but not on a card`);
  }
  assert.ok(recorded.every((r) => r.carrierId),
    'a row went to the record with no carrier id, so nothing downstream can '
    + 'build a Select button or find the logo');
});

test('an uncurated card records Another Option, not the endorsement', () => {
  const { recorded } = run({ QUOTES, FEATURED: [
    Object.assign({}, QUOTES[0], { curated: false, bullets: [], badge: '' }),
  ] });
  const labels = recorded.filter((r) => r.label).map((r) => r.label);
  assert.ok(labels.includes('Another Option'));
  assert.ok(!labels.includes('Our Recommendation'),
    'the record is endorsing a carrier nobody chose');
});

/*
 * TWO RENDERS IN ONE SCOPE, and that is the whole point of this harness.
 *
 * `run` builds a fresh Function every call, so SHOWN is re-initialised
 * between them and a test written on top of it cannot tell a cleared array
 * from one that was never dirty. The first version of the test below passed
 * with `SHOWN = []` deleted from the calculator, which is to say it proved
 * nothing. This renders cards, then renders a notice, in the same scope.
 */
function runThen(secondState) {
  const nodes = { quoteCards: { innerHTML: '' }, quoteNote: { innerHTML: '' } };
  const doc = { getElementById: (id) => nodes[id] ?? null };
  const fn = new Function(...PARAMS, 'nextState',
    `${source}
     renderQuoteCards();
     if (nextState.QUOTE_STATE !== undefined) QUOTE_STATE = nextState.QUOTE_STATE;
     if (nextState.currentInp !== undefined) currentInp = nextState.currentInp;
     if (nextState.QUOTES !== undefined) QUOTES = nextState.QUOTES;
     renderQuoteCards();
     return shownResults();`);
  return fn(doc, INP, 'ok', QUOTES, [
    Object.assign({}, QUOTES[0], { curated: true, bullets: ['x'], badge: '' }),
    Object.assign({}, QUOTES[2], { curated: true, bullets: ['y'], badge: '' }),
  ], 20, false, () => 500000, secondState);
}

test('a notice instead of cards records nothing from the render before it', () => {
  for (const next of [{ QUOTE_STATE: 'loading' }, { QUOTE_STATE: 'error' },
    { currentInp: null }, { QUOTES: [] }]) {
    const recorded = runThen(next);
    assert.equal(recorded.filter((r) => r.label).length, 0,
      `${JSON.stringify(next)} drew no cards but the record still describes `
      + 'the render before it');
  }
});

test('the three slots are named the way the quote tool names them', () => {
  /*
   * POSITIVE, AND THAT IS THE POINT. The only label assertion this file had
   * was that an uncurated card does NOT say the slot's wording -- which is
   * true whatever the slot is called, so QBP-537 renamed quotetool's middle
   * slot to "Our Recommendation" and left this calculator saying "Our Pick"
   * with the suite green. The same card was called two different things
   * depending on which tool somebody used.
   */
  const { cards } = run({ QUOTES, FEATURED: [
    Object.assign({}, QUOTES[0], { curated: true, bullets: ['No medical exam'], badge: '' }),
    Object.assign({}, QUOTES[2], { curated: true, bullets: ['A+ rated'], badge: '' }),
  ] });
  assert.deepEqual(badges(cards),
    ['Most Affordable', 'Our Recommendation', 'Also Consider']);
});

test('no calculator in site/ is still using the old slot wording', () => {
  /* The rename was applied by hand, file by file, and missed one. This is
     what notices the next time that happens. */
  const dir = new URL('../site/', import.meta.url);
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.html')) continue;
    const text = readFileSync(new URL(f, dir), 'utf8');
    assert.ok(!/badgeText:\s*'Our Pick'/.test(text),
      `${f} still has a slot named "Our Pick"`);
  }
});

test('the record carries the four category totals, not just the need', () => {
  /*
   * Read off render() itself rather than restated here, so a category that
   * stops being recorded fails this rather than quietly leaving the stacked
   * math to be recomputed -- badly -- somewhere downstream.
   */
  const cap = cut('function qbCaptureLead(){', '\n}');
  assert.match(cap, /breakdown: currentBreakdown/,
    'the lead record has stopped carrying the four category totals, so the '
    + 'stacked math has to be recomputed from the inputs somewhere else');
  /* BUILT FROM `cats`, which is what the screen draws, so the record
     cannot name a category something the page did not or reorder them. */
  /*
   * RUN, NOT READ. The first version of this asserted the source text
   * contained "detail:", which `detail: null` satisfies -- so the record
   * could stop carrying the lines altogether and the test still passed. A
   * mutation caught it. This evaluates the real assignment.
   */
  const set = cut('  currentBreakdown = {', '\n  };');
  const build = new Function('cats', 'lines', 'offset', 'gross',
    `let currentBreakdown;\n${set}\n return currentBreakdown;`);
  const got = build(
    [{ letter: 'D', name: 'Debt', amt: 34500 },
      { letter: 'I', name: 'Income Replacement', amt: 720000 }],
    { D: 'Wiping out auto loans', I: '$90,000 a year for 8 years' },
    290000, 1187500);
  assert.deepEqual(got.parts, [
    { letter: 'D', name: 'Debt', detail: 'Wiping out auto loans', amount: 34500 },
    { letter: 'I', name: 'Income Replacement',
      detail: '$90,000 a year for 8 years', amount: 720000 },
  ]);
  assert.equal(got.offset, 290000);
  assert.equal(got.gross, 1187500);
  /* A category with nothing to say carries null, not an empty string --
     the email draws no line rather than an empty one. */
  assert.equal(build([{ letter: 'M', name: 'Mortgage Payoff', amt: 0 }],
    { M: '' }, 0, 0).parts[0].detail, null);
});

test('a category line names only what the visitor actually entered', () => {
  /*
   * "Wiping out credit cards, auto loans and other balances" over a figure
   * that is one car loan describes a situation nobody described, and the
   * whole value of the line is that it can be checked against what they
   * typed.
   */
  const fn = new Function('fmt$', `${cut('function detailLines(inp){', '\n}')}\n return detailLines;`)(
    (n) => '$' + Number(n).toLocaleString('en-US'));
  const base = { debt: { cards: 0, auto: 0, other: 0 },
    inc: { annual: 0, years: 1 }, mort: { bal: 0 },
    edu: { kids: 0, years: 1, cost: 0 }, extra: { emergency: 0, final: 0 } };

  assert.equal(fn({ ...base, debt: { cards: 0, auto: 9000, other: 0 } }).D,
    'Wiping out auto loans');
  assert.equal(fn({ ...base, debt: { cards: 1, auto: 1, other: 1 } }).D,
    'Wiping out credit cards, auto loans and other balances');
  /* Nothing entered says nothing, rather than a sentence about zero. */
  assert.equal(fn(base).D, '');
  assert.equal(fn(base).M, '');
  assert.equal(fn({ ...base, inc: { annual: 90000, years: 8 } }).I,
    '$90,000 a year for 8 years');
  assert.equal(fn({ ...base, inc: { annual: 90000, years: 1 } }).I,
    '$90,000 a year for 1 year');
  assert.equal(fn({ ...base, edu: { kids: 1, years: 4, cost: 20000 },
    extra: { emergency: 25000, final: 15000 } }).E,
    'One child, emergency fund and final costs');
});
