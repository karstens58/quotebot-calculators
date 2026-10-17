/**
 * The handoff redemption, run as THE REAL BLOCK cut out of the page.
 *
 * QBP-191. The assistant collects a name — and once the interview lands, an
 * email and a date of birth — and none of that belongs in a query string:
 * it would land in browser history, in the Referer of every request this
 * page then makes, in access logs, and in a screenshot. So the link carries
 * a token and the values come back over HTTPS.
 *
 * What is worth pinning here is mostly what happens when it does NOT work.
 * A spent token, a page offline, a state the dropdown has never heard of —
 * all of them have to leave a working form rather than a broken one.
 *
 *   node --test tests/dime-handoff.test.mjs
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const HTML = readFileSync(new URL('../site/dimeneedscalculator.html', import.meta.url), 'utf8');

const START = '(function redeemHandoff() {';
const END = '})();';
const i = HTML.indexOf(START);
assert.notEqual(i, -1, 'the redeem block is gone from dimeneedscalculator.html');
const SOURCE = HTML.slice(i, HTML.indexOf(END, i) + END.length);

const IDS = ['firstName', 'lastName', 'email', 'phone', 'dob', 'state'];

/** Runs the real block against a fake DOM and a fake network. */
async function run({ search = '?h=abcdefghjkmnpqrstuvw', reply, fails = false } = {}) {
  const nodes = {};
  const events = [];
  for (const id of IDS) {
    nodes[id] = {
      id, value: '', tagName: 'INPUT',
      dispatchEvent: (e) => events.push([id, e.type]),
    };
  }
  /* The state dropdown is a <select> and only holds values it has options
     for — the real one is populated from a list at load. */
  nodes.state.tagName = 'SELECT';
  nodes.state.options = [{ value: 'CO' }, { value: 'TX' }];

  const posted = [];
  let recalculated = 0;

  const sandbox = {
    URLSearchParams, JSON, Array, Event: class { constructor(t) { this.type = t; } },
    location: { search },
    document: { getElementById: (id) => nodes[id] ?? null },
    liveUpdate: () => { recalculated += 1; },
    fetch: (url, init) => {
      posted.push({ url, body: JSON.parse(init.body) });
      if (fails) return Promise.reject(new Error('offline'));
      return Promise.resolve({ ok: true, json: () => Promise.resolve(reply) });
    },
  };
  new Function(...Object.keys(sandbox), `"use strict";${SOURCE}`)(...Object.values(sandbox));
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));

  return {
    values: Object.fromEntries(IDS.map((id) => [id, nodes[id].value])),
    events, posted, recalculated,
  };
}

/* ------------------------------------------------------------ it works -- */

test('a redeemed handoff fills the identity fields', async () => {
  const r = await run({
    reply: { handoff: { firstName: 'Dana', lastName: 'Reed', email: 'dana@example.com', state: 'CO' } },
  });
  assert.equal(r.values.firstName, 'Dana');
  assert.equal(r.values.lastName, 'Reed');
  assert.equal(r.values.email, 'dana@example.com');
  assert.equal(r.values.state, 'CO');
});

test('the token is posted, never put in the URL of the request', async () => {
  const r = await run({ reply: { handoff: { firstName: 'Dana' } } });
  assert.equal(r.posted.length, 1);
  assert.equal(r.posted[0].body.redeem, 'abcdefghjkmnpqrstuvw');
  assert.equal(r.posted[0].url.includes('abcdefghjkmnpqrstuvw'), false,
    'the token went back out in a URL, which is the thing this avoids');
});

test('every filled field goes through its own listener', async () => {
  // The same rule prefillFromQuery follows: assigning a value silently
  // skips the formatting and the recalculation that typing would cause.
  const r = await run({ reply: { handoff: { firstName: 'Dana', dob: '1984-03-02' } } });
  assert.ok(r.events.some(([id, t]) => id === 'dob' && t === 'input'));
  assert.ok(r.events.some(([id, t]) => id === 'dob' && t === 'change'));
  assert.equal(r.recalculated, 1, 'the age pill and the quote never refreshed');
});

/* --------------------------------------------------- it does not work -- */

test('NO TOKEN MEANS NO REQUEST AT ALL', async () => {
  for (const search of ['', '?qb=CHAT-DIME', '?income=140000']) {
    const r = await run({ search, reply: { handoff: { firstName: 'Dana' } } });
    assert.equal(r.posted.length, 0, search);
    assert.equal(r.values.firstName, '');
  }
});

test('A SPENT TOKEN LEAVES A WORKING FORM', async () => {
  // Silent on purpose. A red banner about an expired token is a page
  // explaining its own plumbing to somebody who just wants a number.
  const r = await run({ reply: { error: 'That link has expired. Ask the assistant for a fresh one.' } });
  assert.deepEqual(Object.values(r.values), ['', '', '', '', '', '']);
  assert.equal(r.recalculated, 0);
});

test('being offline leaves a working form', async () => {
  const r = await run({ fails: true });
  assert.deepEqual(Object.values(r.values), ['', '', '', '', '', '']);
});

test('a junk payload fills nothing and throws nothing', async () => {
  for (const reply of [null, {}, { handoff: null }, { handoff: 'nope' },
    { handoff: { firstName: 42, email: {} } }]) {
    const r = await run({ reply });
    assert.equal(r.values.firstName, '', JSON.stringify(reply));
  }
});

test('A STATE THE DROPDOWN DOES NOT KNOW IS LEFT ALONE', async () => {
  // Setting a <select> to a value it has no option for leaves it blank,
  // which reads as the handoff having silently dropped the field — and on
  // this form the state decides who is licensed to help.
  const r = await run({ reply: { handoff: { firstName: 'Dana', state: 'ZZ' } } });
  assert.equal(r.values.state, '', 'an unknown state was written into the select');
  assert.equal(r.values.firstName, 'Dana', 'one bad field dropped a good one');
});

test('only the named fields are written', async () => {
  const r = await run({
    reply: { handoff: { firstName: 'Dana', incAnnual: '999999', uwClass: 'Preferred Plus' } },
  });
  assert.equal(r.values.firstName, 'Dana');
  // The needs answers travel in the query string, which is readable and
  // debuggable on purpose; the handoff is identity only.
  assert.equal(SOURCE.includes('incAnnual'), false);
});

/* ------------------------------------------------------------- shape --- */

test('the page tells browsers not to leak the token in a referrer', async () => {
  // The token is in the address bar until tidyQuery strips it, and the page
  // has already started fetching its own scripts by then.
  assert.match(HTML, /<meta name="referrer" content="strict-origin">/);
});

test('it reads the token BEFORE the prefill strips it', async () => {
  // prefillFromQuery calls tidyQuery, which keeps the attribution params and
  // drops everything else — `h` included. That is the behaviour we want, and
  // the only reason it is safe is the order these two blocks run in.
  assert.ok(HTML.indexOf('(function redeemHandoff() {') < HTML.indexOf('(function prefillFromQuery() {'),
    'tidyQuery will drop the token before anything reads it');
});
