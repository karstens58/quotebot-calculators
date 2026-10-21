/**
 * An affiliate keeps the credit when the consumer moves between our hosts —
 * QBP-257.
 *
 * Scott: "Jim visits AT-Tools affiliate page, then decides to go to
 * quote-bot.com but they have never filled out a form before. Jim would
 * count directly towards quote-bot.com vs AT-Tools code."
 *
 * The attribution itself was never wrong. The script has always read `qb`,
 * always kept first and last touch, and the server has always paid the
 * first. What was wrong is WHERE it was kept: localStorage is scoped to one
 * ORIGIN, and this business runs on four of them --
 *
 *   quote-bot.com   partners.quote-bot.com   tools.quote-bot.com   book.quote-bot.com
 *
 * -- so Jim's first touch was recorded on the partner host and could not be
 * read on the one he bought from. The credit was not lost by a bug in the
 * logic; it was filed somewhere the next page could not reach.
 *
 * All four are subdomains of one registrable domain, so the fix is a cookie
 * on `.quote-bot.com`. THE DOMAIN ATTRIBUTE IS THE ENTIRE FIX -- a cookie
 * without it is scoped to the host that set it and behaves exactly like the
 * localStorage it replaced, on every test that only ever looks at one host.
 * So that attribute is asserted directly, and crossing hosts is simulated
 * rather than assumed.
 *
 *   node --test tests/a-first-touch-crosses-our-hosts.test.mjs
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadCaptureApi, CAPTURE_SRC } from './capture-api.mjs';

const FIRST = 'qb.attr.first';
const LAST = 'qb.attr.last';

/** Hand one host's cookies to the next, the way a browser would. */
function carryOver(from, to) {
  for (const [name, { value, attrs }] of from.cookies.all()) {
    /* Only a cookie scoped to the parent domain travels. A host-only
       cookie would stay behind, which is the bug this guards. */
    if (!attrs.domain || !attrs.domain.startsWith('.')) continue;
    to.cookies.set(`${name}=${value};domain=${attrs.domain}`);
  }
}

test('THE REPORTED CASE: a partner touch survives the move to the main site', () => {
  const partner = loadCaptureApi('https://partners.quote-bot.com/at-tools?qb=AT-TOOLS');
  const first = partner.api.attribution().first;
  assert.equal(first.trackingCode, 'AT-TOOLS', 'the partner page recorded nothing');

  /* Jim now goes to the main site. No referrer, no parameter -- he could
     equally have typed it, which is the case Scott thought unsolvable. */
  const main = loadCaptureApi('https://quote-bot.com/');
  carryOver(partner, main);

  assert.equal(main.api.attribution().first.trackingCode, 'AT-TOOLS',
    'the main site saw a stranger, and the affiliate lost the credit');
});

test('and again on to the calculators, where the quote is actually run', () => {
  const partner = loadCaptureApi('https://partners.quote-bot.com/at-tools?qb=AT-TOOLS');
  const tools = loadCaptureApi('https://tools.quote-bot.com/dimeneedscalculator.html');
  carryOver(partner, tools);
  assert.equal(tools.api.attribution().first.trackingCode, 'AT-TOOLS');
});

test('THE DOMAIN ATTRIBUTE IS THE FIX, so it is asserted directly', () => {
  /*
   * Without a leading dot on the parent domain the cookie is host-only and
   * every single-host test above still passes. This is the assertion that
   * cannot be satisfied by the behaviour we are replacing.
   */
  const { cookies } = loadCaptureApi('https://partners.quote-bot.com/x?qb=AT-TOOLS');
  const stored = cookies.all().get(FIRST);
  assert.ok(stored, 'the first touch was not written as a cookie at all');
  assert.equal(stored.attrs.domain, '.quote-bot.com');
  assert.equal(stored.attrs.samesite, 'Lax');
  assert.ok('secure' in stored.attrs, 'the attribution cookie is not Secure');
  assert.equal(stored.attrs.path, '/');
});

test('the window is 90 days, on the cookie as well as in the rule', () => {
  /*
   * Scott, 21 October: 365 was "far too generous", 30 "may be too short".
   * Both halves are checked -- a cookie outliving the rule would keep a
   * record nobody will pay on, and a rule outliving the cookie would pay on
   * a record that is gone.
   */
  const { cookies } = loadCaptureApi('https://quote-bot.com/?qb=AT-TOOLS');
  const until = Date.parse(cookies.all().get(FIRST).attrs.expires);
  const days = (until - Date.now()) / 864e5;
  assert.ok(days > 89 && days < 91, `the cookie lasts ${days.toFixed(1)} days`);
  assert.match(CAPTURE_SRC, /FIRST_TOUCH_DAYS = 90;/);
});

test('LAST TOUCH TRAVELS TOO, because the server falls back to it', () => {
  /* lead-capture reads `first ?? last`. A last touch left behind on another
     host would make that fallback silently useless. */
  const a = loadCaptureApi('https://partners.quote-bot.com/at-tools?qb=AT-TOOLS');
  const b = loadCaptureApi('https://quote-bot.com/');
  carryOver(a, b);
  assert.equal(b.api.attribution().last.trackingCode, 'AT-TOOLS');
});

test('A FIRST TOUCH ALREADY IN localStorage IS NOT THROWN AWAY', () => {
  /*
   * Everybody carrying attribution today has it in some origin's
   * localStorage. Shipping a cookie that ignored it would reset every
   * in-flight credit on the day attribution improved -- the affiliates
   * would be the ones to notice, in a statement.
   */
  const page = loadCaptureApi('https://tools.quote-bot.com/quotetool.html');
  page.stored.set(FIRST, JSON.stringify({
    trackingCode: 'OLD-CODE', capturedAt: new Date().toISOString(),
  }));
  assert.equal(page.api.attribution().first.trackingCode, 'OLD-CODE',
    'an existing first touch was ignored');
});

test('a second touch does not displace the first', () => {
  /* The whole point of first-touch credit: the affiliate who introduced
     them is not overwritten by whoever they clicked most recently. */
  const a = loadCaptureApi('https://partners.quote-bot.com/at-tools?qb=AT-TOOLS');
  const b = loadCaptureApi('https://quote-bot.com/?qb=DONALD');
  carryOver(a, b);
  const attr = b.api.attribution();
  assert.equal(attr.first.trackingCode, 'AT-TOOLS', 'the first touch was overwritten');
  assert.equal(attr.last.trackingCode, 'DONALD', 'the last touch was not updated');
});

test('no attribution at all stays no attribution', () => {
  const plain = loadCaptureApi('https://quote-bot.com/');
  const attr = plain.api.attribution();
  assert.equal(attr.first, null);
  assert.equal(attr.last, null);
  assert.equal(plain.cookies.all().size, 0, 'a cookie was set for a visitor with no signal');
});

test('the queue and the session stay per-origin', () => {
  /*
   * Only the two attribution keys were meant to move. A queued POST belongs
   * to the page that made it, and a session is a visit to one site --
   * sharing either would be wrong rather than merely unnecessary.
   */
  const { cookies } = loadCaptureApi('https://quote-bot.com/?qb=AT-TOOLS');
  for (const name of cookies.all().keys()) {
    assert.ok(name === FIRST || name === LAST,
      `${name} was put in a cookie and should have stayed in localStorage`);
  }
});
