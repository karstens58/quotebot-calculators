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

const IDENTITY = ['firstName', 'lastName', 'email', 'phone', 'dob', 'state',
  'uwClass'];

/* The seventeen the needs number is built from -- QBP-545. */
const FIGURES = ['debtCards', 'debtAuto', 'debtOther',
  'incAnnual', 'incYears', 'incReturn', 'incGrowth',
  'mortBal', 'mortRate', 'mortYears',
  'eduKids', 'eduYears', 'eduCost',
  'emergFund', 'finalExp',
  'existLife', 'existSavings'];

const IDS = IDENTITY.concat(FIGURES);

/** Runs the real block against a fake DOM and a fake network. */
async function run({ search = '?h=abcdefghjkmnpqrstuvw', reply, fails = false,
  starting = { genderSeg: 'Male', tobaccoSeg: 'No' } } = {}) {
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
  nodes.uwClass.tagName = 'SELECT';
  nodes.uwClass.options = [{ value: 'Preferred' }, { value: 'Standard' }];

  /*
   * The two segmented controls. Sex and tobacco are buttons, not inputs --
   * getInputs reads `#genderSeg .active` -- so the block has to press one
   * rather than set a value, and these record which press it made.
   */
  const clicks = [];
  const segment = (id, vals, active) => {
    const buttons = vals.map((val) => {
      const b = {
        dataset: { val },
        classList: {
          contains: (c) => c === 'active' && b.active,
          add: () => { b.active = true; },
          remove: () => { b.active = false; },
        },
        active: val === active,
        click: () => {
          buttons.forEach((x) => { x.active = false; });
          b.active = true;
          clicks.push([id, val]);
          recalculated += 1;        // the page's own handler calls liveUpdate
        },
      };
      return b;
    });
    nodes[id] = { id, querySelectorAll: () => buttons, buttons };
    return buttons;
  };
  segment('genderSeg', ['Male', 'Female'], starting.genderSeg);
  segment('tobaccoSeg', ['No', 'Yes'], starting.tobaccoSeg);

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

  const activeIn = (id) => (nodes[id].buttons.find((b) => b.active) ?? {}).dataset?.val ?? '';
  return {
    values: Object.fromEntries(IDS.map((id) => [id, nodes[id].value])),
    gender: activeIn('genderSeg'),
    tobacco: activeIn('tobaccoSeg'),
    clicks, events, posted, recalculated,
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
  /* Derived from the field list, not a row of empty strings as long as
     the list happened to be -- that spelling broke the day QBP-545 added
     seventeen more, which is a test reporting on its own fixture. */
  assert.deepEqual(r.values, Object.fromEntries(IDS.map((id) => [id, ''])));
  assert.equal(r.gender, 'Male', 'a refused handoff moved a segment');
  assert.equal(r.tobacco, 'No');
  assert.equal(r.recalculated, 0);
});

test('being offline leaves a working form', async () => {
  const r = await run({ fails: true });
  assert.deepEqual(r.values, Object.fromEntries(IDS.map((id) => [id, ''])));
  assert.deepEqual(r.clicks, []);
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

test('THE NEEDS ANSWERS NOW TRAVEL IN THE TOKEN TOO', async () => {
  /*
   * THIS TEST USED TO ASSERT THE OPPOSITE -- QBP-545. It read "only the
   * named fields are written" and checked that `incAnnual` appeared
   * nowhere in this block, because "the needs answers travel in the query
   * string, which is readable and debuggable on purpose".
   *
   * They are also what somebody earns, what they owe on their house and
   * what they have put aside, and a query string puts all of it in
   * browser history, in the Referer of every request this page then
   * makes, and in any forwarded link. The query keys still work and the
   * inline card on /life-insurance/ still uses them; the quote page's
   * Edit button, which hands back a whole analysis, does not.
   */
  const r = await run({
    reply: {
      handoff: {
        firstName: 'Dana',
        debtCards: '12000', debtAuto: '23000', debtOther: '0',
        incAnnual: '90000', incYears: '10', incReturn: '4', incGrowth: '2',
        mortBal: '320000', mortRate: '6.5', mortYears: '27',
        eduKids: '3', eduYears: '4', eduCost: '25000',
        emergFund: '40000', finalExp: '15000',
        existLife: '100000', existSavings: '50000',
        uwClass: 'Preferred',
      },
    },
  });
  assert.equal(r.values.firstName, 'Dana');
  assert.equal(r.values.uwClass, 'Preferred');
  for (const id of FIGURES) {
    assert.notEqual(r.values[id], '', `${id} did not come back`);
  }
  assert.equal(r.values.incAnnual, '90000');
  assert.equal(r.values.mortRate, '6.5');
});

test('ALL SEVENTEEN, or the number comes back different', async () => {
  /*
   * Leaving a field out is never neutral: a blank emergency fund and
   * final expenses silently zero half the E, and a blank return and
   * growth collapse income replacement to annual x years, which
   * recommends MORE cover than the discounted figure -- and we sell the
   * policy. So the block has to be able to reach every one of them.
   */
  for (const id of FIGURES) {
    assert.ok(SOURCE.includes(`'${id}'`),
      `${id} is not in the redeem block, so Edit hands back a hole`);
  }
});

test('SEX AND TOBACCO ARE PRESSED, NOT ASSIGNED', async () => {
  /*
   * They are segmented buttons, not inputs, so el.value reaches neither
   * and getInputs reads `#genderSeg .active`. A handoff that filled every
   * box and left these on their defaults would quote a male non-smoker's
   * rates under somebody else's name, with the form looking complete.
   */
  const r = await run({
    reply: { handoff: { firstName: 'Dana', gender: 'Female', tobacco: 'Yes' } },
  });
  assert.equal(r.gender, 'Female');
  assert.equal(r.tobacco, 'Yes');
  /* Pressed, so the page's own handler ran. Setting the class from
     outside would leave the control right and the number stale. */
  assert.deepEqual(r.clicks, [['genderSeg', 'Female'], ['tobaccoSeg', 'Yes']]);
});

test('a segment value with no button is dropped, like an unknown state', async () => {
  /*
   * STARTED OFF THE DEFAULT ON PURPOSE. With the control sitting on its
   * first button, "leave it alone" and "fall back to the first button"
   * produce the same answer, and a mutation that did the second passed.
   * Starting on Female is what tells them apart.
   */
  const r = await run({
    reply: { handoff: { firstName: 'Dana', gender: 'Other', tobacco: 'Yes' } },
    starting: { genderSeg: 'Female', tobaccoSeg: 'No' },
  });
  assert.equal(r.gender, 'Female', 'an unknown value moved the control anyway');
  assert.equal(r.tobacco, 'Yes', 'one bad answer dropped a good one');
  assert.equal(r.values.firstName, 'Dana');
});

test('an answer that is already right is not pressed again', async () => {
  const r = await run({
    reply: { handoff: { firstName: 'Dana', gender: 'Male' } },
  });
  assert.equal(r.gender, 'Male');
  assert.deepEqual(r.clicks, [], 'the block pressed a button that was already active');
});

test('NOTHING IS SUBMITTED', async () => {
  /*
   * The figures are in and the totals have moved; pressing Calculate is
   * theirs. It runs a quote and files a capture, and doing that because
   * somebody clicked Edit would put a lead in the system they never
   * asked for.
   */
  const r = await run({
    reply: { handoff: { firstName: 'Dana', incAnnual: '90000' } },
  });
  assert.ok(r.recalculated > 0, 'the totals never moved');
  assert.equal(r.posted.length, 1, 'the block talked to something other than the redeem');
  assert.equal(r.posted[0].body.redeem, 'abcdefghjkmnpqrstuvw');
  for (const name of ['qbCaptureLead', 'sendQuote', 'keepQuote', 'runCalc']) {
    assert.equal(SOURCE.includes(name), false,
      `the redeem block calls ${name}, which files a lead nobody asked for`);
  }
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
