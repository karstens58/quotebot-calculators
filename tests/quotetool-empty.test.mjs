/**
 * What the page says when it has nothing to show, tested against THE REAL
 * recalc cut out of site/quotetool.html.
 *
 * Two different empty results hide behind one empty array. "No carrier
 * returned an offer" is the tool's ordinary miss. "The Health Analyzer removed
 * everything" is somebody who has just typed out their blood pressure and
 * their family history and been handed a blank page. They need different
 * words, and both need a way to reach a person.
 *
 * What can still go wrong: the two cases collapse into one message; the
 * invitation never appears; the banner stays swapped for the rest of the visit
 * after one empty quote; or health answers leak into a request nobody
 * answered.
 *
 *   node --test tests/quotetool-empty.test.mjs
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
  cut('let QUALIFY_ORIGINAL = null;',
    "wrap.scrollIntoView({ behavior: 'smooth', block: 'center' });\n}"),
  cut('function setQuoteNotice(msg, kind){', '\n  el.innerHTML = msg;\n}'),
  cut('async function recalc(){', '\n  renderBest();\n  renderList();\n}'),
].join('\n');

/* The banner as the page ships it. If recalc ever leaves these words on
   screen after an empty result, the visitor is being offered a health
   questionnaire instead of a person. */
const SHIPPED = {
  h: 'Not sure which policy you qualify for?',
  p: 'Answer a few health questions and we will narrow this list.',
  btn: 'Health Analyzer',
};

function sandbox({ health = null, responses = [] } = {}) {
  const notice = { style: {}, innerHTML: '' };
  const h = { textContent: SHIPPED.h };
  const p = { textContent: SHIPPED.p };
  const btn = { textContent: SHIPPED.btn, dataset: {} };
  const wrap = {
    scrolls: 0,
    querySelector(s) {
      return s === '.qualify-text h3' ? h
        : s === '.qualify-text p' ? p
        : s === '.qualify-btn' ? btn : null;
    },
    scrollIntoView() { this.scrolls += 1; },
  };
  const document = {
    /* Returns null for quoteNotice so setQuoteNotice takes its create path;
       createElement hands back the one object every call, which is what the
       real page gets once it has inserted it. */
    getElementById: (id) =>
      (id === 'bestRow' ? { parentNode: { insertBefore() {} } } : null),
    createElement: () => notice,
    querySelector: (s) => (s === '.qualify' ? wrap : null),
  };

  const sent = [];
  const queue = responses.slice();
  const fetchImpl = async (url, opts) => {
    sent.push(JSON.parse(opts.body));
    const next = queue.shift();
    if (typeof next === 'function') return next();
    return { ok: true, status: 200, json: async () => next };
  };

  const body = `
    let QUOTES = [], FEATURED = [];
    let PREMIUMS_ARE_ESTIMATES = true, FILTERED_BY_HEALTH = false;
    let HEALTH_ANSWERS = HEALTH_IN;
    function getInputs(){ return { cat: 'T', coverage: 500000, dob: '1980-01-01',
      gender: 'Male', tobacco: 'No', health: 'Preferred', state: 'OH' }; }
    function renderQuoteFor(){}
    function renderBest(){}
    function renderList(){}
    function logoFor(n){ return '<div>' + n + '</div>'; }
    ${source}
    return { recalc, read: () => ({ QUOTES, FEATURED, FILTERED_BY_HEALTH }),
             setHealth: (v) => { HEALTH_ANSWERS = v; } };
  `;
  const api = new Function('document', 'window', 'fetch', 'HEALTH_IN', body)(
    document, { QB_QUOTE_ENDPOINT: 'https://engine.example/' }, fetchImpl, health);

  return { ...api, notice, banner: { h, p, btn }, wrap, sent };
}

const withQuotes = {
  ok: true, premiumsAreEstimates: false,
  quotes: [{ carrierName: 'Banner Life', companyCode: 'BANN',
    productName: 'OPTerm 20', monthlyPremium: 44.1, annualPremium: 521,
    faceAmount: 500000, amBestRating: 'A+' }],
  featured: [],
};
const empty = { ok: true, premiumsAreEstimates: false, quotes: [], featured: [] };

test('ANSWERS GIVEN AND NOTHING LEFT: the page says why, and offers a person', async () => {
  const s = sandbox({ health: { DoBloodPressure: 'ON' }, responses: [empty] });
  await s.recalc();

  assert.equal(s.read().FILTERED_BY_HEALTH, true);
  const said = s.notice.innerHTML;
  assert.match(said, /not about you/,
    'the page blamed the applicant rather than the tool');
  assert.match(said, /guaranteed issue/,
    'the routes that exist outside this comparison were not named');
  assert.doesNotMatch(said, /\bwe can get you\b|\bguarantee\b|\bwill find you\b/i,
    'the empty-result copy promised coverage');
  assert.equal(s.banner.btn.textContent, 'Have someone call me');
  assert.equal(s.banner.btn.dataset.mode, 'contact');
  assert.equal(s.wrap.scrolls, 1, 'the invitation was never scrolled into view');
});

test('NO ANSWERS AND NOTHING LEFT: a different message, same way out', async () => {
  const s = sandbox({ responses: [empty] });
  await s.recalc();

  assert.equal(s.read().FILTERED_BY_HEALTH, false);
  assert.match(s.notice.innerHTML, /No carrier returned an offer/);
  /* The discriminator: this case must NOT reach for the analyzer wording. A
     visitor who answered nothing has not been told anything about themselves,
     and saying "nothing fits what you told us" to them is a lie. */
  assert.doesNotMatch(s.notice.innerHTML, /what you told us/);
  assert.equal(s.banner.btn.textContent, 'Have someone call me');
});

test('the two empty messages are actually different text', async () => {
  const a = sandbox({ health: { DoBloodPressure: 'ON' }, responses: [empty] });
  const b = sandbox({ responses: [empty] });
  await a.recalc();
  await b.recalc();
  assert.notEqual(a.notice.innerHTML, b.notice.innerHTML);
});

test('THE BANNER GOES BACK once a quote returns rows', async () => {
  const s = sandbox({ responses: [empty, withQuotes] });
  await s.recalc();
  assert.equal(s.banner.h.textContent, 'Let’s find you a policy the hard way');

  await s.recalc();
  assert.equal(s.banner.h.textContent, SHIPPED.h, 'the heading stayed swapped');
  assert.equal(s.banner.p.textContent, SHIPPED.p, 'the body stayed swapped');
  assert.equal(s.banner.btn.textContent, SHIPPED.btn, 'the button stayed swapped');
  assert.equal(s.banner.btn.dataset.mode, undefined,
    'the contact mode outlived the empty result');
});

test('TWO EMPTIES IN A ROW do not overwrite the remembered banner', async () => {
  /* The discriminating order: swap, swap AGAIN with no reset in between, then
     get rows. If the original were captured on every swap rather than only on
     the first, the second capture would save the already-swapped words and
     this restore would put "Have someone call me" back as the "original". A
     single empty followed by rows cannot tell those two apart. */
  const s = sandbox({ responses: [empty, empty, withQuotes] });
  await s.recalc();
  await s.recalc();
  assert.equal(s.banner.btn.textContent, 'Have someone call me');

  await s.recalc();
  assert.equal(s.banner.h.textContent, SHIPPED.h);
  assert.equal(s.banner.p.textContent, SHIPPED.p);
  assert.equal(s.banner.btn.textContent, SHIPPED.btn,
    'the second swap was remembered as the original');
});

test('estimate copy shows with rows, and does not offer the call', async () => {
  const s = sandbox({ responses: [{ ...withQuotes, premiumsAreEstimates: true }] });
  await s.recalc();
  assert.match(s.notice.innerHTML, /Illustrative estimates/);
  assert.equal(s.banner.btn.textContent, SHIPPED.btn);
  assert.equal(s.wrap.scrolls, 0, 'a successful quote scrolled to the invitation');
});

test('ESTIMATED rows restore the banner too, not just carrier-filed ones', async () => {
  /* Both success branches call the reset, and this is the only test that
     reaches the estimates one from a swapped banner. Asserting SHIPPED on a
     banner that was never swapped passes against code that never restores. */
  const s = sandbox({
    responses: [empty, { ...withQuotes, premiumsAreEstimates: true }] });
  await s.recalc();
  assert.equal(s.banner.btn.textContent, 'Have someone call me');

  await s.recalc();
  assert.match(s.notice.innerHTML, /Illustrative estimates/);
  assert.equal(s.banner.h.textContent, SHIPPED.h);
  assert.equal(s.banner.btn.textContent, SHIPPED.btn,
    'an estimated quote left the empty-result invitation on screen');
  assert.equal(s.banner.btn.dataset.mode, undefined);
});

test('HEALTH IS ABSENT FROM THE BODY until somebody answers', async () => {
  const s = sandbox({ responses: [withQuotes] });
  await s.recalc();
  assert.equal('health' in s.sent[0], false,
    'an unanswered analyzer still sent a health key');
});

test('answers reach the engine once they exist', async () => {
  const s = sandbox({ responses: [withQuotes, withQuotes] });
  await s.recalc();
  s.setHealth({ DoBloodPressure: 'ON', Systolic: '128' });
  await s.recalc();
  assert.deepEqual(s.sent[1].health, { DoBloodPressure: 'ON', Systolic: '128' });
  /* The first request is the control: without it this test would pass on code
     that always sent whatever HEALTH_ANSWERS happened to hold. */
  assert.equal('health' in s.sent[0], false);
});

test('a service outage offers the call it promises', async () => {
  const s = sandbox({ responses: [() => { throw new Error('network down'); }] });
  await s.recalc();
  assert.match(s.notice.innerHTML, /could not reach the quote service/);
  assert.equal(s.banner.btn.textContent, 'Have someone call me',
    'the outage copy offered a call with no way to ask for one');
  assert.deepEqual(s.read().QUOTES, []);
});

test('an HTTP error is an outage, not an empty result', async () => {
  const s = sandbox({ responses: [
    () => ({ ok: false, status: 502, json: async () => ({ ok: false, error: 'bad gateway' }) }),
  ] });
  await s.recalc();
  assert.match(s.notice.innerHTML, /could not reach the quote service/);
  assert.doesNotMatch(s.notice.innerHTML, /No carrier returned an offer/);
});

test('THE VERDICT SURVIVES THE TRIP FROM THE ENGINE TO A ROW', () => {
  /* toRow is the only path from the engine's answer to anything on screen,
     and it is not reachable from the card tests -- a mapper that dropped
     healthVerdict passed every one of them while the badge never appeared. */
  const s = sandbox({ responses: [{
    ok: true, premiumsAreEstimates: false,
    quotes: [{ carrierName: 'Banner Life', companyCode: 'BANN',
      productName: 'OPTerm 20', monthlyPremium: 44.1, annualPremium: 521,
      faceAmount: 500000, amBestRating: 'A+',
      healthVerdict: 'dk', healthReasons: ['Blood pressure not answered'] }],
    featured: [],
  }] });
  return s.recalc().then(() => {
    const [row] = s.read().QUOTES;
    assert.equal(row.healthVerdict, 'dk');
    assert.deepEqual(row.healthReasons, ['Blood pressure not answered']);
  });
});

test('a row with no verdict carries null and an empty reason list', () => {
  const s = sandbox({ responses: [withQuotes] });
  return s.recalc().then(() => {
    const [row] = s.read().QUOTES;
    assert.equal(row.healthVerdict, null,
      'an ordinary quote came back with a verdict it was never given');
    assert.deepEqual(row.healthReasons, []);
  });
});

test('reasons that arrive as something other than a list do not become one', () => {
  const s = sandbox({ responses: [{ ...withQuotes,
    quotes: [{ ...withQuotes.quotes[0], healthVerdict: 'go', healthReasons: 'oops' }] }] });
  return s.recalc().then(() => {
    assert.deepEqual(s.read().QUOTES[0].healthReasons, [],
      'a string was passed through where the page expects a list');
  });
});
