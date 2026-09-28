/**
 * The two policy cards on the Cross-Purchase report, and the thing that makes
 * this page different from the other three: n owners means n x (n-1)
 * POLICIES, and that is not n x (n-1) quotes.
 *
 * A premium depends on the life insured, the face amount and the term. It
 * does not depend on which co-owner writes the cheque. So six owners holding
 * equal shares is thirty rows and six requests. Uneven shares genuinely do
 * ask different questions and are not merged — a premium is never scaled
 * from another one, which is the bug that put an invented Assurity rate on
 * the quote tool.
 *
 *   node --test tests/buysell-quotes.test.mjs
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const HTML = readFileSync(new URL('../site/crosspurchasebuysellcalculator.html', import.meta.url), 'utf8');

function cut(start, endMarker, { keepEnd = true } = {}) {
  const i = HTML.indexOf(start);
  assert.notEqual(i, -1, `could not find ${start}`);
  const j = HTML.indexOf(endMarker, i + start.length);
  assert.notEqual(j, -1, `could not find the end of ${start}`);
  return HTML.slice(i, keepEnd ? j + endMarker.length : j);
}

const source = [
  cut('const esc = s =>', '\n'),
  cut('const fmtUSD =', '\n'),
  cut('const fmtMo =', '\n'),
  cut('const fmtYr =', '\n'),
  cut('function cheapestOf(rows){', '\n}'),
  cut('function quoteNotice(kind, icon, html){', '\n}'),
  cut('const CALL_US =', "</a>';"),
  cut('function policyCards(insured, i, j){', '\n  return out;\n}'),
].join('\n');

function render(insured, held) {
  const fn = new Function('QUOTE_BY_KEY', 'ROW_KEY',
    `${source}\n return policyCards(arguments[2], 0, 1);`);
  return fn(new Map([['K', held]]), { '0-1': 'K' }, insured);
}

const INSURED = { name: 'Dana Reyes', dob: '1978-04-02', state: 'CO',
  gender: 'Male', uw: 'Preferred', tobacco: 'Non-Tobacco' };

const row = (id, name, monthly) => ({
  id, name, prodResolved: `${name} Term 10`, rating: 'A+',
  monthly, annual: monthly * 12, coverage: 500000,
  logo: `<div class="logo">${name}</div>`,
});
const QUOTES = [row('amge', 'American General', 40.10), row('cinn', 'Cincinnati Life', 52.30)];
const ok = (featured) => ({ state: 'ok', quotes: QUOTES, featured: featured ?? [], estimates: false });
const cards = (h) => (h.match(/class="best-card/g) || []).length;

/* ---------------------------------------------------------------------- */

test('TWO cards, and the second is first position with its own chip', () => {
  const featured = [
    Object.assign({}, row('cinn', 'Cincinnati Life', 52.30),
      { curated: true, badge: 'Best Customer Service', bullets: ['No exam up to $1M'] }),
    Object.assign({}, row('amge', 'American General', 40.10),
      { curated: true, badge: 'Living Benefits!', bullets: ['Chronic illness'] }),
  ];
  const html = render(INSURED, ok(featured));
  assert.equal(cards(html), 2, 'a rank-2 pick drew a third card');
  assert.match(html, /Most Affordable/);
  assert.match(html, /Best Customer Service/);
  assert.ok(!html.includes('Living Benefits!'));
});

test('a carrier nobody curated keeps the slot and loses the endorsement', () => {
  const html = render(INSURED, ok([Object.assign({}, row('cinn', 'Cincinnati Life', 52.30),
    { curated: false, badge: '', bullets: ['borrowed'] })]));
  assert.ok(!html.includes('borrowed'));
  assert.match(html, /Another Option/);
});

test('no premium appears that is not in the payload', () => {
  const html = render(INSURED, ok([Object.assign({}, row('cinn', 'Cincinnati Life', 52.30),
    { curated: true, badge: 'Pick', bullets: [] })]));
  const shown = [...html.matchAll(/\$(\d+\.\d\d) <small>\/m/g)].map((m) => Number(m[1]));
  assert.deepEqual(shown, [40.10, 52.30]);
});

test('a failed or empty quote shows no numbers at all', () => {
  for (const state of ['error', 'empty', 'loading', 'idle']) {
    const html = render(INSURED, { state, quotes: [], featured: [] });
    assert.ok(!/\$\d+\.\d\d <small>/.test(html), `a price survived state "${state}"`);
    assert.equal(cards(html), 0);
  }
});

test('the source carries no rate table of its own', () => {
  for (const gone of ['per1000', 'TERM_FACTOR', 'HEALTH_FACTOR', 'ANNUAL_DIVISOR',
    'function rateFor', 'const CINCI']) {
    assert.ok(!HTML.includes(gone), `${gone} is back in the buy-sell calculator`);
  }
  const body = cut('function policyCards(insured, i, j){', '\n  return out;\n}');
  assert.match(body, /held\.featured && held\.featured\[0\]/);
  assert.ok(!/\.id === '/.test(body), 'a carrier is picked by hard-coded id again');
});

/* ---- what makes this page different ------------------------------------ */

test('THE POINT: the quote is keyed by the request, not by the row', () => {
  /*
   * Two buyers purchasing the same face amount on the same life at the same
   * term are asking Compulife one question, not two. If this store were ever
   * keyed by "i-j" instead, a six-owner agreement would fire thirty requests
   * for six answers and rate-limit the visitor out of their own report.
   */
  const req = cut('function requestPolicyQuote(i, j){', '\n}');
  assert.match(req, /const key = JSON\.stringify\(body\)/);
  assert.match(req, /QUOTE_BY_KEY\.get\(key\)/);
  assert.match(req, /if \(held && held\.state !== 'error'\)\{ paintPolicy\(i, j\); return; \}/,
    'a row no longer attaches itself to an answer already in hand');
  /* And the buyer is nowhere in the request: including them would make two
     identical questions look different and defeat the whole thing. */
  const body = cut('function policyBody(insured, pol){', '\n}');
  assert.ok(!/buyer/i.test(body), 'the buyer leaked into the quote request');
});

test('requests are staggered, never bursted', () => {
  const gap = cut('const QUOTE_GAP_MS =', ';');
  assert.match(gap, /\d{3,}/);
  const runner = cut('async function runQuoteQueue(){', '\n}');
  assert.match(runner, /await sendQuote\(key\)/);
  assert.match(runner, /await sleep\(QUOTE_GAP_MS\)/);
  assert.match(runner, /if \(queueRunning\) return/,
    'two runners could drain the queue at once, which is the burst this avoids');
});

test('cross-purchase is owner-to-owner, not company-owned', () => {
  /* Each partner personally owns the policy on the others. Sending
     businessOwned: true here would describe an entity-purchase agreement,
     which is a different structure with different tax treatment. */
  const body = cut('function policyBody(insured, pol){', '\n}');
  assert.match(body, /businessOwned:\s*false/);
  assert.match(body, /toolKey:\s*'buysell'/);
});

test('tobacco is asked, and reaches the request', () => {
  assert.ok(HTML.includes('class="p-tob"'),
    'the tobacco question is gone — every smoker is priced as a non-smoker');
  const body = cut('function policyBody(insured, pol){', '\n}');
  assert.match(body, /tobacco:\s*insured\.tobacco === 'Tobacco'/);
  /* Read back off the card, or the answer never leaves the form. */
  assert.match(cut('function readPartnerInputs(){', '\n}'), /p-tob/);
});

test("the insured's own date of birth is used, and no state is invented", () => {
  const body = cut('function policyBody(insured, pol){', '\n}');
  assert.match(body, /insured\.dob/);
  /* Unlike the key person calculator this page collects a real DOB, so
     nothing is synthesized from a whole-year age. */
  assert.ok(!HTML.includes('dobForAge'));
  assert.match(body, /String\(insured\.state \|\| ''\)\.trim\(\)/);
});

test('a late reply cannot overwrite a newer one', () => {
  const send = cut('async function sendQuote(key){', '\n  paintKey(key);\n}');
  assert.ok((send.match(/if \(seqByKey\.get\(key\) !== seq\) return;/g) || []).length >= 2);
});

test('the total is summed from the cards, and says what it is a total of', () => {
  const totals = cut('function computeTotals(){', '\n}');
  assert.match(totals, /billedRow\(pol\.buyerIdx, pol\.insuredIdx\)/);
  assert.ok(!/rateFor/.test(totals));
  const label = cut('function premiumLabel(t){', '\n}');
  assert.match(label, /so far/);
  assert.match(label, /\\u2014/, 'nothing priced yet should read as a dash, never $0');
});
