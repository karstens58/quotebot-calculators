/**
 * THE HOST DOES NOT GET TO SAY WHO IT IS -- QBP-633.
 *
 *   node --test tests/the-host-does-not-get-to-say-who-it-is.test.mjs
 *
 * The quote form can be embedded on a partner's website, and it must draw
 * only where that partner registered it. The site doing the framing writes
 * its own loader, so everything it SAYS is worthless: it can claim in a
 * message to be any domain on earth.
 *
 * What it cannot do is write `event.origin`. The browser stamps that on
 * the message itself, and the sender has no say in it. Every test in this
 * file is ultimately the same test -- that the stamp is what decides and
 * nothing else is ever allowed to stand in for it.
 *
 * THE DEFAULTS ARE THE OTHER HALF. Silence refuses. A server that cannot
 * be reached refuses. An answer in an unexpected shape refuses. Each of
 * those is a line somebody could write the other way round without it
 * looking wrong, and each of them would open the form to anybody.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const guard = require('../site/js/quotebot-embed-guard.js');

/* A window with a parent, and a way to post it a message as a browser
   would -- which means WE supply the origin stamp, exactly as the browser
   does, and the code under test never gets to choose it. */
function fakeWindow() {
  const listeners = [];
  const win = {
    listeners,
    addEventListener(kind, fn) { if (kind === 'message') listeners.push(fn); },
    removeEventListener(kind, fn) {
      const at = listeners.indexOf(fn);
      if (at >= 0) listeners.splice(at, 1);
    },
  };
  win.parent = { name: 'the page that framed us' };
  win.deliver = (event) => listeners.slice().forEach((fn) => fn(event));
  /* The browser's own doing: source is the real sending window, origin is
     the real sending origin. Neither is readable from the message body. */
  win.greet = (origin, body) => win.deliver({
    source: win.parent, origin, data: body ?? { type: guard.HELLO },
  });
  return win;
}

const yes = { embed: { allowed: true } };
const no = { embed: { allowed: false } };

/* ---- what the stamp is allowed to be ---------------------------------- */

test('a greeting is read for its stamp and nothing else', () => {
  const win = fakeWindow();
  const event = {
    source: win.parent,
    origin: 'https://partner.example.com',
    data: { type: guard.HELLO, origin: 'https://evil.example.com' },
  };
  assert.equal(guard.hostOriginOf(event, win), 'https://partner.example.com',
    'the origin claimed in the body was believed over the browser stamp');
});

test('AND THE BODY CANNOT NAME A DOMAIN AT ALL', () => {
  /* Every field a hostile loader controls, offered as an origin. None of
     them is read, so none of them can change the answer. */
  const win = fakeWindow();
  for (const body of [
    { type: guard.HELLO, origin: 'https://partner.example.com' },
    { type: guard.HELLO, host: 'https://partner.example.com' },
    { type: guard.HELLO, referrer: 'https://partner.example.com' },
    { type: guard.HELLO, location: 'https://partner.example.com' },
  ]) {
    assert.equal(
      guard.hostOriginOf({ source: win.parent, origin: 'https://evil.com', data: body }, win),
      'https://evil.com',
      'something in the body was read as the origin');
  }
});

test('a message from anything but our framer is not a greeting', () => {
  /* Otherwise a popup we opened, or another frame on the page, could
     greet us on the host's behalf. */
  const win = fakeWindow();
  const stranger = { name: 'some other window' };
  assert.equal(guard.hostOriginOf(
    { source: stranger, origin: 'https://partner.example.com',
      data: { type: guard.HELLO } }, win), null);
});

test('and neither is any other message', () => {
  const win = fakeWindow();
  for (const data of [
    { type: 'quotebot:height', px: 600 },
    { type: 'something-else' },
    'quotebot:hello',
    null,
    42,
  ]) {
    assert.equal(guard.hostOriginOf(
      { source: win.parent, origin: 'https://partner.example.com', data }, win),
      null, JSON.stringify(data));
  }
});

test('AN OPAQUE ORIGIN IS NOBODY’S WEBSITE', () => {
  /*
   * A sandboxed frame, a page opened from a file, and a few redirect
   * shapes all arrive with the literal string null. It is a real value
   * that reads like an absent one, which is what makes it worth a test:
   * treated as a name, it would be a name that matches nothing and
   * crashes nothing, and the mistake would be invisible.
   */
  const win = fakeWindow();
  for (const origin of ['null', 'http://partner.example.com', '', undefined]) {
    assert.equal(guard.hostOriginOf(
      { source: win.parent, origin, data: { type: guard.HELLO } }, win),
      null, String(origin));
  }
});

/* ---- the same site, spelled their way --------------------------------- */

test('an origin is normalised the way the server stores one', () => {
  /* Two ideas of what "the same site" means is how a partner registers
     their website and the form refuses to draw on it. */
  assert.equal(guard.originOf('https://Example.com/'), 'https://example.com');
  assert.equal(guard.originOf('https://example.com:443'), 'https://example.com');
  assert.equal(guard.originOf('https://example.com:8443'), 'https://example.com:8443');
  assert.equal(guard.originOf('https://example.com/path?x=1#y'), 'https://example.com');
  assert.equal(guard.originOf('https://www.example.com'), 'https://www.example.com');
});

test('and anything that is not an https site is not an origin', () => {
  for (const bad of ['http://example.com', 'javascript:alert(1)',
    'data:text/html,x', 'example.com', 'https://localhost',
    'https://user:pass@example.com', 'null', '', null, undefined, {}]) {
    assert.equal(guard.originOf(bad), null, String(bad));
  }
});

/* ---- being framed ----------------------------------------------------- */

test('a window that is its own parent is not framed', () => {
  const win = {};
  win.parent = win;
  assert.equal(guard.isFramed(win), false);
});

test('and a parent that cannot be read counts as framed', () => {
  /*
   * Some embedded webviews and privacy modes make this throw. The only
   * safe reading of a throw is "yes, framed" -- the other way round, an
   * exception opens the gate for everybody.
   */
  const win = {};
  Object.defineProperty(win, 'parent', {
    get() { throw new Error('cross-origin'); },
  });
  assert.equal(guard.isFramed(win), true);
});

/* ---- the verdict ------------------------------------------------------ */

test('ONLY A TRUE YES IS A YES', () => {
  /*
   * A truthy test here turns every shape of failure into permission: an
   * error body, a string, a 1, a redirect page.
   */
  assert.equal(guard.mayDraw(yes), true);
  for (const answer of [no, {}, null, undefined, 'yes', 1,
    { embed: {} }, { embed: { allowed: 'true' } }, { embed: { allowed: 1 } },
    { allowed: true }, { error: 'nope' }]) {
    assert.equal(guard.mayDraw(answer), false, JSON.stringify(answer));
  }
});

test('the code and the origin are both encoded on the way out', () => {
  const url = guard.verdictUrl('https://api.example.com/',
    'DOE TERM&x=1', 'https://partner.example.com');
  assert.ok(url.startsWith('https://api.example.com/brand?qb='), url);
  assert.ok(url.includes('DOE%20TERM%26x%3D1'), 'the code went over raw');
  assert.ok(url.includes('embedOrigin=https%3A%2F%2Fpartner.example.com'),
    'the origin went over raw');
});

/* ---- the handshake, end to end ---------------------------------------- */

test('a registered host is greeted back', async () => {
  const win = fakeWindow();
  const asked = [];
  let allowed = null;
  guard.waitForHost({
    window: win,
    ask: (origin) => { asked.push(origin); return Promise.resolve(yes); },
    onAllowed: (origin) => { allowed = origin; },
    onRefused: () => { throw new Error('refused a registered host'); },
    timeoutMs: 0,
  });
  win.greet('https://partner.example.com');
  await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(asked, ['https://partner.example.com']);
  assert.equal(allowed, 'https://partner.example.com');
});

test('AND AN UNREGISTERED ONE IS REFUSED', async () => {
  const win = fakeWindow();
  let why = null;
  guard.waitForHost({
    window: win,
    ask: () => Promise.resolve(no),
    onAllowed: () => { throw new Error('drew on an unregistered site'); },
    onRefused: (reason) => { why = reason; },
    timeoutMs: 0,
  });
  win.greet('https://evil.example.com');
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(why, 'not-registered');
});

test('SILENCE IS A REFUSAL', async () => {
  /*
   * A hostile site does not greet us at all -- it simply frames the page
   * and waits. So the timeout is part of the gate and not a nicety: with
   * no answer the form must never appear.
   */
  const win = fakeWindow();
  let why = null;
  guard.waitForHost({
    window: win,
    ask: () => Promise.resolve(yes),
    onAllowed: () => { throw new Error('drew with no greeting at all'); },
    onRefused: (reason) => { why = reason; },
    timeoutMs: 5,
  });
  await new Promise((r) => setTimeout(r, 25));
  assert.equal(why, 'no-greeting');
});

test('and a server we cannot reach is a refusal too', async () => {
  const win = fakeWindow();
  let why = null;
  guard.waitForHost({
    window: win,
    ask: () => Promise.reject(new Error('offline')),
    onAllowed: () => { throw new Error('drew without an answer'); },
    onRefused: (reason) => { why = reason; },
    timeoutMs: 0,
  });
  win.greet('https://partner.example.com');
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(why, 'unreachable');
});

test('A SECOND GREETING CANNOT REOPEN A DECISION', async () => {
  /*
   * A page refused once stays refused. Without this, a hostile site
   * greets from an origin that fails, waits, and greets again -- and any
   * later yes would draw the form on a page we had already turned away.
   */
  const win = fakeWindow();
  const seen = [];
  guard.waitForHost({
    window: win,
    ask: (origin) => Promise.resolve(
      origin === 'https://partner.example.com' ? yes : no),
    onAllowed: () => seen.push('allowed'),
    onRefused: () => seen.push('refused'),
    timeoutMs: 0,
  });
  win.greet('https://evil.example.com');
  await new Promise((r) => setTimeout(r, 5));
  win.greet('https://partner.example.com');
  await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(seen, ['refused'], 'a later greeting changed the answer');
});

test('AND NOT EVEN TWO ARRIVING AT ONCE', async () => {
  /*
   * THE RACE THE TEST ABOVE IS TOO SLOW TO SEE, found by mutation: it
   * waits between the two greetings, so the first has already finished
   * and the listener has already been removed.
   *
   * Delivered in the same tick, both greetings get past the check at the
   * top of the listener before either verdict comes back -- so the only
   * thing standing between a hostile page and a second answer is the
   * check inside settle(). Removing it let a refusal be followed by a
   * yes, which draws the form on a site we had just turned away.
   *
   * A hostile loader greeting twice from two origins is one line of
   * JavaScript, so this is the shape to defend against rather than a
   * theoretical one.
   */
  const win = fakeWindow();
  const seen = [];
  guard.waitForHost({
    window: win,
    ask: (origin) => Promise.resolve(
      origin === 'https://partner.example.com' ? yes : no),
    onAllowed: () => seen.push('allowed'),
    onRefused: () => seen.push('refused'),
    timeoutMs: 0,
  });
  /* No await in between: this is the whole point. */
  win.greet('https://evil.example.com');
  win.greet('https://partner.example.com');
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(seen, ['refused'],
    'two greetings in one tick produced two answers');
});

test('and nothing is left listening afterwards', async () => {
  const win = fakeWindow();
  guard.waitForHost({
    window: win,
    ask: () => Promise.resolve(yes),
    onAllowed: () => {},
    onRefused: () => {},
    timeoutMs: 0,
  });
  assert.equal(win.listeners.length, 1);
  win.greet('https://partner.example.com');
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(win.listeners.length, 0,
    'the page is still listening for messages after it has decided');
});

test('and tearing the page down mid-handshake leaves nothing behind', () => {
  const win = fakeWindow();
  const stop = guard.waitForHost({
    window: win, ask: () => Promise.resolve(yes), timeoutMs: 5000,
  });
  assert.equal(win.listeners.length, 1);
  stop();
  assert.equal(win.listeners.length, 0);
});
