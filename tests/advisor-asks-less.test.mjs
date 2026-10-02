/**
 * An advisor request never carries answers nobody gave.
 *
 *   node --test tests/advisor-asks-less.test.mjs
 *
 * WHY THIS EXISTS. One modal serves two intents. "Start my application" is a
 * contract: it needs an owner, beneficiaries, a mailing address and a state
 * to sign in. "Have an advisor design this" is a request for a phone call,
 * and those sections are hidden on it.
 *
 * Hidden is not empty. The fields still exist, still hold their defaults,
 * and still get read at submit time unless something drops them -- so the
 * failure mode is silent and specific: an unanswered question arrives in the
 * record looking like an answer. "The owner is the annuitant" is a statement
 * the person never made; an address with a state and no street is a half
 * address nobody typed. An agent reading that screen cannot tell the
 * difference between a default and a decision.
 *
 * The module already dropped the owner and the beneficiaries for this
 * reason. The address was added to the hidden set later and had to be
 * dropped for the same reason. This holds the pair together, because the
 * next section hidden on this intent will have the same problem and nothing
 * else would notice.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(
  path.join(import.meta.dirname, '..', 'site', 'js', 'quotebot-apply.js'), 'utf8');

/** The body of the `if (intent === 'advisor')` block in qbSubmitApply. */
function advisorBlock() {
  const at = SRC.indexOf("if (intent === 'advisor') {");
  assert.notEqual(at, -1,
    'the advisor branch in qbSubmitApply was not found — this test has '
    + 'stopped matching the module rather than the branch having gone');
  let depth = 0, i = SRC.indexOf('{', at);
  const start = i;
  for (; i < SRC.length; i += 1) {
    if (SRC[i] === '{') depth += 1;
    else if (SRC[i] === '}') { depth -= 1; if (depth === 0) break; }
  }
  return SRC.slice(start, i + 1);
}

/** Sections hidden when the intent is advisor. */
function hiddenSections() {
  const m = /\[([^\]]*)\]\.forEach\(function \(name\) \{\s*var el = document\.querySelector\('\[data-sec="'/.exec(SRC);
  assert.ok(m, 'the hidden-section list was not found in quotebot-apply.js');
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

test('the advisor branch still drops the owner and the beneficiaries', () => {
  const block = advisorBlock();
  assert.match(block, /details\.owner\s*=\s*null/,
    'an advisor request would send an owner nobody chose');
  assert.match(block, /details\.beneficiaries\s*=\s*\[\]/,
    'an advisor request would send beneficiaries nobody named');
  assert.match(block, /delete details\.ownerIsAnnuitant/,
    'an advisor request would assert the owner is the annuitant, unasked');
});

test('AN ADVISOR REQUEST SENDS NO ADDRESS BEYOND THE STATE', () => {
  const block = advisorBlock();

  assert.match(block, /details\.address\s*=\s*\{\s*state:/,
    'the address is not reduced to the state on the advisor intent, so a '
    + 'half-filled address from hidden fields reaches the record');
  assert.match(block, /delete details\.signedState/,
    'a signing state is a question about a contract that does not exist on '
    + 'this intent');

  for (const field of ['line1', 'line2', 'city', 'zip', 'postalCode']) {
    assert.ok(!new RegExp(`qbm-${field}|${field}:`).test(block),
      `the advisor branch still reads ${field}`);
  }
});

test('THE ADVISOR FORM DOES NOT ASK WHERE YOU LIVE', () => {
  /* The payload assertions below all pass if the section is simply shown
     again -- they only police what is sent once it is hidden. This is the
     visitor-facing half: an advisor request is a request for a phone call,
     and a street address is not a question a phone call needs answered. */
  assert.ok(hiddenSections().includes('where'),
    'the address section is shown on the advisor intent again. An advisor '
    + 'request should ask for the state, which decides which licensed '
    + 'producer may take the call, and nothing else about where they live.');
});

test('EVERY SECTION HIDDEN ON THIS INTENT IS ALSO DROPPED FROM THE PAYLOAD', () => {
  /* The actual rule, rather than a list of today's three. A section hidden
     without its fields being dropped is the bug this file is about. */
  const block = advisorBlock();
  const DROPS = {
    owner: /details\.owner\s*=\s*null/,
    bens: /details\.beneficiaries\s*=\s*\[\]/,
    where: /details\.address\s*=\s*\{\s*state:/
  };
  const undropped = hiddenSections().filter((name) => {
    const rule = DROPS[name];
    return !rule || !rule.test(block);
  });
  assert.deepEqual(undropped, [],
    `these sections are hidden on the advisor intent but their fields still `
    + `reach the payload, so a default nobody typed is recorded as an answer: `
    + `${undropped.join(', ')}. Drop them in the advisor branch, and add the `
    + 'rule to DROPS here.');
});
