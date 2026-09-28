/**
 * The two policy cards on the Key Person report, rendered by THE REAL
 * policyCards cut out of site/keypersoncalculator.html.
 *
 * This page used to price from a table of per-$1,000 factors kept in the
 * file, and the second card was `QUOTES.find(x => x.id === 'cinci')` —
 * Cincinnati was the recommendation whatever the person's age or health,
 * with a `|| sorted[1]` that quietly substituted somebody else while still
 * calling it our pick.
 *
 * Two cards, not three: the cheapest, and the carrier in first position in
 * the admin console's carrier settings wearing its own chip. Both come off
 * the wire, and the tests below are that claim in several shapes.
 *
 *   node --test tests/keyperson-quotes.test.mjs
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const HTML = readFileSync(new URL('../site/keypersoncalculator.html', import.meta.url), 'utf8');

function cut(start, endMarker, { keepEnd = true } = {}) {
  const i = HTML.indexOf(start);
  assert.notEqual(i, -1, `could not find ${start} in keypersoncalculator.html`);
  const j = HTML.indexOf(endMarker, i + start.length);
  assert.notEqual(j, -1, `could not find the end of ${start}`);
  return HTML.slice(i, keepEnd ? j + endMarker.length : j);
}

const source = [
  cut('const esc = s =>', "'\"':'&quot;'}[c]));"),
  cut('const fmtUSD =', '\n'),
  cut('const fmtMo =', "const fmtYr = n => '$' + Math.round(n).toLocaleString();"),
  cut('function firstName(p){', '\n'),
  cut('function fullName(p){', '\n'),
  cut('function cheapestOf(rows){', '\n}'),
  cut('function quoteNotice(kind, icon, html){', '\n}'),
  cut('const CALL_US =', "</a>';"),
  cut('function policyCards(person, i){', '\n  return out;\n}'),
].join('\n');

const PARAMS = ['QUOTED', 'STATE'];
function render(person, quoted) {
  const fn = new Function(...PARAMS, `${source}\n return policyCards(arguments[2], 0);`);
  return fn([quoted], { biz: { state: 'CO' } }, person);
}

const PERSON = { first: 'Dana', last: 'Reyes', coverage: 700000, age: 48,
  state: 'CO', health: 'Preferred', gender: 'Male', tobacco: 'Non-Tobacco', term: 10 };

const row = (id, name, monthly) => ({
  id, name, prodResolved: `${name} Term 10`, rating: 'A+',
  monthly, annual: monthly * 12, coverage: 700000,
  logo: `<div class="logo">${name}</div>`,
});

const QUOTES = [
  row('bann', 'Banner Life', 61.20),
  row('amge', 'American General', 54.80),
  row('cinn', 'Cincinnati Life', 70.15),
];
const ok = (featured) => ({ state: 'ok', quotes: QUOTES, featured: featured ?? [], estimates: false });

const cards = (html) => (html.match(/class="best-card/g) || []).length;

/* ---------------------------------------------------------------------- */

test('TWO cards, never three', () => {
  /* The other calculators show cheapest plus two featured. This one shows
     cheapest plus the first position only, and a second curated pick in the
     payload must not sneak a third card onto the page. */
  const featured = [
    Object.assign({}, row('cinn', 'Cincinnati Life', 70.15),
      { curated: true, badge: 'Best Customer Service', bullets: ['No exam up to $1M'] }),
    Object.assign({}, row('bann', 'Banner Life', 61.20),
      { curated: true, badge: 'Living Benefits!', bullets: ['Chronic illness'] }),
  ];
  const html = render(PERSON, ok(featured));
  assert.equal(cards(html), 2, 'the second featured pick drew a third card');
  assert.ok(!html.includes('Living Benefits!'), 'rank 2 reached the page');
});

test('the second card is first position, wearing its own chip', () => {
  const featured = [Object.assign({}, row('cinn', 'Cincinnati Life', 70.15),
    { curated: true, badge: 'Best Customer Service', bullets: ['No exam up to $1M'] })];
  const html = render(PERSON, ok(featured));
  assert.match(html, /Most Affordable/);
  assert.match(html, /Best Customer Service/);
  assert.match(html, /No exam up to \$1M/);
  /* The slot's own wording is the fallback, not the label. */
  assert.ok(!html.includes('Our Recommendation'), 'the chip was ignored in favour of the slot');
});

test("without a chip the slot's wording is used", () => {
  const featured = [Object.assign({}, row('cinn', 'Cincinnati Life', 70.15),
    { curated: true, badge: '', bullets: ['No exam up to $1M'] })];
  assert.match(render(PERSON, ok(featured)), /Our Recommendation/);
});

test('a carrier nobody curated gets no chip of ours and no reasons', () => {
  const featured = [Object.assign({}, row('cinn', 'Cincinnati Life', 70.15),
    { curated: false, badge: '', bullets: ['borrowed'] })];
  const html = render(PERSON, ok(featured));
  assert.ok(!html.includes('borrowed'), 'bullets shown under a carrier nobody chose');
  assert.ok(!html.includes('Our Recommendation'));
  assert.match(html, /Another Option/);
});

test('THE POINT: no premium appears that is not in the payload', () => {
  const html = render(PERSON, ok([Object.assign({}, row('cinn', 'Cincinnati Life', 70.15),
    { curated: true, badge: 'Pick', bullets: [] })]));
  const shown = [...html.matchAll(/\$(\d+\.\d\d) <small>\/m/g)].map((m) => Number(m[1]));
  const offered = QUOTES.map((r) => Number(r.monthly.toFixed(2)));
  assert.ok(shown.length === 2);
  for (const p of shown) assert.ok(offered.includes(p), `${p} came from no quote`);
  assert.equal(shown[0], 54.80, 'the cheapest card is not the cheapest row');
});

test('the source carries no rate table of its own', () => {
  for (const gone of ['per1000', 'TERM_FACTOR', 'HEALTH_FACTOR', 'TOBACCO_FACTOR',
    'ANNUAL_DIVISOR', 'function rateFor']) {
    assert.ok(!HTML.includes(gone), `${gone} is back in keypersoncalculator.html`);
  }
  /* And no carrier is picked by name. The old page found Cincinnati by id and
     called it the recommendation for everybody; the engine's ranking is now
     the only thing that decides who sits in the second card. Asserted as code
     rather than as an absent string, because the comment above policyCards
     quotes the line it replaced. */
  const body = cut('function policyCards(person, i){', '\n  return out;\n}');
  assert.match(body, /q\.featured && q\.featured\[0\]/,
    'the second card is no longer taken from the engine ranking');
  assert.ok(!/\.id === '/.test(body),
    'a carrier is being selected by hard-coded id inside policyCards again');
});

test('a failed or empty quote shows no numbers at all', () => {
  for (const state of ['error', 'empty', 'loading', 'idle']) {
    const html = render(PERSON, { state, quotes: [], featured: [] });
    assert.ok(!/\$\d+\.\d\d <small>/.test(html), `a price survived state "${state}"`);
    assert.equal(cards(html), 0);
  }
  assert.match(render(PERSON, { state: 'error' }), /could not reach the quote service/);
  assert.match(render(PERSON, { state: 'empty', quotes: [] }),
    /statement about this comparison, not about them/);
});

test('estimates are declared, filed rates are not', () => {
  const f = [Object.assign({}, row('cinn', 'C', 70), { curated: true, badge: 'P', bullets: [] })];
  assert.match(render(PERSON, { state: 'ok', quotes: QUOTES, featured: f, estimates: true }),
    /Illustrative estimates/);
  assert.ok(!render(PERSON, { state: 'ok', quotes: QUOTES, featured: f, estimates: false })
    .includes('Illustrative estimates'));
});

/* ---- the request ------------------------------------------------------- */

test('the policy is business-owned, and says so', () => {
  const body = cut('function personQuoteBody(person){', '\n}');
  assert.match(body, /businessOwned:\s*true/,
    'a company-owned policy on an employee is being quoted as personal cover');
  assert.match(body, /toolKey:\s*'keyperson'/);
});

test('age becomes a date of birth, because Compulife price off one', () => {
  const fn = cut('function dobForAge(age){', '\n}');
  const dobForAge = new Function(`${fn}; return dobForAge;`)();
  const now = new Date();
  const d = dobForAge(48);
  assert.match(d, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(Number(d.slice(0, 4)), now.getFullYear() - 48);
  /* Refused rather than guessed: a blank age field reads as 0 through num(),
     and quoting a newborn on a key person policy is not a rounding error. */
  for (const bad of [0, '', null, 17, 99, 'abc']) {
    assert.equal(dobForAge(bad), null, `accepted an age of ${JSON.stringify(bad)}`);
  }
});

test("a person's own state wins, and the business's is the fallback", () => {
  const body = cut('function personQuoteBody(person){', '\n}');
  assert.match(body, /person\.state \|\| \(STATE && STATE\.biz \? STATE\.biz\.state : ''\)/);
});

test('one request per person, coalesced and sequenced', () => {
  const req = cut('function requestPersonQuote(i){', '\n}');
  assert.match(req, /clearTimeout\(quoteTimer\[i\]\)/);
  assert.match(req, /key === lastKey\[i\]/);
  const send = cut('async function sendPersonQuote(i, body, seq){', '\n  paintPerson(i);\n}');
  assert.ok((send.match(/if \(seq !== quoteSeq\[i\]\) return;/g) || []).length >= 2,
    'a late reply for one person can still overwrite a newer one');
});

test('the total is summed from the card, not recomputed beside it', () => {
  const totals = cut('function computeTotals(){', '\n}');
  assert.match(totals, /billedRow\(i\)/);
  assert.ok(!/rateFor/.test(totals), 'the total is being computed from a rate table again');
  /* People still in flight are counted rather than silently dropped, so the
     figure can say what it is a total of. */
  assert.match(totals, /priced/);
});
