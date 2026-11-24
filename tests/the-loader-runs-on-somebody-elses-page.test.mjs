/**
 * THE LOADER RUNS ON SOMEBODY ELSE'S PAGE -- QBP-633.
 *
 *   node --test tests/the-loader-runs-on-somebody-elses-page.test.mjs
 *
 * This is the only file of ours that a partner pastes into their own
 * website, so two kinds of failure matter and they pull in opposite
 * directions.
 *
 *   IT MUST NOT BE DRIVEABLE. It is listening for messages on a page we
 *   do not control, beside scripts we have never seen. A message handler
 *   that takes instructions from anything but our own frame is a way for
 *   anything else on that page to resize, open or close our panel.
 *
 *   IT MUST NOT BE GREEDY. It reads nothing from the host page, stores
 *   nothing and sends nothing anywhere. A loader that did more would be a
 *   script a partner is asked to trust on every page of their site, and
 *   the honest version of that conversation is a short file.
 *
 * The DOM here is a stub rather than a browser: these are assertions about
 * which calls are made and which are refused, and a headless browser would
 * test the same decisions through more machinery.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const SRC = readFileSync(join(root, 'site/js/quotebot-embed-loader.js'), 'utf8');

const require = createRequire(import.meta.url);
const loader = require('../site/js/quotebot-embed-loader.js');

/* ---- the address it frames -------------------------------------------- */

test('THE ORIGIN IS FIXED IN THE FILE, NEVER READ OFF THE TAG', () => {
  /*
   * A data-src would let anything that can edit the partner's page point
   * our snippet at a page of its own, wearing our name and collecting the
   * same date of birth.
   */
  assert.ok(loader.frameSrc('X').startsWith('https://tools.quote-bot.com/'),
    'the frame is not served from our own origin');
  assert.ok(!/getAttribute\(['"]data-src/.test(SRC),
    'the frame address can be set from the host page');
  assert.ok(!/data-origin|data-host|data-endpoint/.test(SRC),
    'the host page can redirect where this frame points');
});

test('and the code is encoded into it', () => {
  const url = loader.frameSrc('DOE TERM&embed=0');
  assert.ok(url.includes('DOE%20TERM%26embed%3D0'), url);
  /* The embed flag cannot be turned off by a code that contains one. */
  assert.equal(url.split('embed=1').length, 2, 'embed=1 appears twice');
});

/* ---- what it will listen to ------------------------------------------- */

function fakeFrame() {
  const listeners = {};
  return {
    contentWindow: { posted: [], postMessage(m, o) { this.posted.push([m, o]); } },
    style: {
      /* As makeFrame leaves it: the starting height, so a test that
         asserts nothing moved is asserting against a real value rather
         than against undefined. */
      props: { height: '560px' },
      setProperty(k, v) { this.props[k] = v; },
      set height(v) { this.props.height = v; },
      get height() { return this.props.height; },
    },
    addEventListener(k, fn) { (listeners[k] ??= []).push(fn); },
    removeEventListener(k, fn) {
      const at = (listeners[k] ?? []).indexOf(fn);
      if (at >= 0) listeners[k].splice(at, 1);
    },
    listeners,
  };
}

function harness() {
  const onMessage = [];
  const win = {
    addEventListener(k, fn) { if (k === 'message') onMessage.push(fn); },
    removeEventListener(k, fn) {
      const at = onMessage.indexOf(fn);
      if (at >= 0) onMessage.splice(at, 1);
    },
    onMessage,
  };
  return win;
}

test('A MESSAGE FROM ANOTHER ORIGIN IS IGNORED', () => {
  const frame = fakeFrame();
  const wired = loader.wire(frame, { window: harness() });
  wired.listen({
    origin: 'https://evil.example.com',
    source: frame.contentWindow,
    data: { type: loader.HEIGHT, px: 9000 },
  });
  assert.equal(frame.style.props.height, '560px',
    'a message from another site resized our panel');
});

test('AND SO IS ONE FROM ANOTHER FRAME ON THE SAME PAGE', () => {
  /* Two embeds on one page must not resize each other, and nothing else
     framed from our origin may drive this one. */
  const frame = fakeFrame();
  const wired = loader.wire(frame, { window: harness() });
  wired.listen({
    origin: loader.TOOLS,
    source: { somebody: 'else' },
    data: { type: loader.HEIGHT, px: 9000 },
  });
  assert.equal(frame.style.props.height, '560px',
    'another frame resized this one');
});

test('and a message that is not an object says nothing', () => {
  const frame = fakeFrame();
  const wired = loader.wire(frame, { window: harness() });
  for (const data of ['quotebot:height', 42, null, undefined]) {
    wired.listen({ origin: loader.TOOLS, source: frame.contentWindow, data });
  }
  assert.equal(frame.style.props.height, '560px');
});

test('A HEIGHT IS A NUMBER, AND IT IS CLAMPED', () => {
  /*
   * The frame is ours, but a height arriving as a string concatenates
   * into nonsense and a negative one collapses the panel to nothing.
   * Clamped at both ends, so neither a bug nor a compromised frame can
   * make a partner's page scroll for a mile.
   */
  const frame = fakeFrame();
  const wired = loader.wire(frame, { window: harness() });
  const say = (px) => wired.listen({
    origin: loader.TOOLS, source: frame.contentWindow,
    data: { type: loader.HEIGHT, px },
  });

  say(742);
  assert.equal(frame.style.props.height, '742px');

  say('1200');       // a string that happens to be a number is fine
  assert.equal(frame.style.props.height, '1200px');

  say(-50);
  assert.equal(frame.style.props.height, '1200px', 'a negative height applied');
  say(0);
  assert.equal(frame.style.props.height, '1200px', 'a zero height applied');
  say('tall');
  assert.equal(frame.style.props.height, '1200px', 'a word was used as a height');
  say(9e9);
  assert.equal(frame.style.props.height, '20000px', 'an absurd height was not clamped');
});

test('the panel takes the window only when the frame asks', () => {
  const frame = fakeFrame();
  let expanded = 0;
  const wired = loader.wire(frame, { window: harness(), onExpand: () => { expanded += 1; } });
  wired.listen({
    origin: 'https://evil.example.com', source: frame.contentWindow,
    data: { type: loader.EXPAND },
  });
  assert.equal(expanded, 0, 'another site opened our panel over their page');
  wired.listen({
    origin: loader.TOOLS, source: frame.contentWindow,
    data: { type: loader.EXPAND },
  });
  assert.equal(expanded, 1);
  assert.equal(frame.style.props.position, 'fixed');
});

test('AND A HEIGHT IS IGNORED WHILE IT HAS THE WINDOW', () => {
  /* Open, the frame is the viewport; a content height would shrink it
     back out from under somebody mid-scroll. */
  const frame = fakeFrame();
  const wired = loader.wire(frame, { window: harness() });
  const from = (type, px) => wired.listen({
    origin: loader.TOOLS, source: frame.contentWindow, data: { type, px },
  });
  from(loader.EXPAND);
  from(loader.HEIGHT, 300);
  assert.equal(frame.style.props.height, '100%',
    'the frame was resized to its content while covering the page');
});

/* ---- the greeting ------------------------------------------------------ */

test('THE GREETING IS ADDRESSED TO OUR ORIGIN, NOT TO EVERY ORIGIN', () => {
  /*
   * postMessage to '*' is readable by whatever the frame has become if it
   * was ever navigated away -- and the greeting is what the guard on the
   * other side turns into permission to draw.
   */
  const frame = fakeFrame();
  loader.wire(frame, { window: harness() }).hello();
  assert.deepEqual(frame.contentWindow.posted, [[{ type: loader.HELLO }, loader.TOOLS]]);
  assert.ok(!/postMessage\([^)]*,\s*['"]\*['"]/.test(SRC),
    'something is posted to any origin that cares to listen');
});

test('and it is sent on every load of the frame', () => {
  /* The guard waits for it with a timeout and refuses on silence, so a
     frame that reloads must be greeted again or it goes dark. */
  const frame = fakeFrame();
  loader.wire(frame, { window: harness() });
  assert.equal((frame.listeners.load ?? []).length, 1,
    'the greeting is not tied to the frame loading');
});

test('AND NOTHING IS LEFT LISTENING WHEN A MODAL CLOSES', () => {
  /*
   * The modal placement builds a frame per open and throws it away on
   * close. Found by writing this file: every open was leaving another
   * handler on the window, each holding a dead frame.
   */
  const win = harness();
  const frame = fakeFrame();
  const wired = loader.wire(frame, { window: win });
  assert.ok(typeof wired.stop === 'function',
    'a wired frame cannot be unwired, so the modal placement leaks');
  wired.stop();
  assert.equal((frame.listeners.load ?? []).length, 0,
    'the frame is still listening for its own load after being discarded');
});

/* ---- what it refuses to be --------------------------------------------- */

test('IT READS NOTHING FROM THE PAGE IT IS ON', () => {
  /*
   * The whole argument for pasting this into a site is that it is a frame
   * and a resize. Anything that walks the host DOM, reads storage or
   * sends a request is a different conversation with the partner.
   */
  for (const greedy of [
    'document.cookie', 'localStorage', 'sessionStorage', 'indexedDB',
    'XMLHttpRequest', 'fetch(', 'navigator.sendBeacon', 'document.forms',
    'new Image(', 'innerHTML',
  ]) {
    assert.ok(!SRC.includes(greedy),
      `the loader uses ${greedy} on the partner's own page`);
  }
});

test('and it queries the host DOM only for what the tag named', () => {
  /* querySelectorAll appears for the opener and the fallback link, both
     of which are selectors the partner wrote in their own snippet. */
  const calls = [...SRC.matchAll(/querySelector(?:All)?\(([^)]*)\)/g)]
    .map((m) => m[1].trim());
  for (const arg of calls) {
    assert.ok(/^(opener|where|fallback)$/.test(arg),
      `the loader looks up "${arg}" on the host page, which the partner `
      + 'did not name in their snippet');
  }
});

/* ---- the three placements ---------------------------------------------- */

test('a tag with no code shows nothing and says so in the console', () => {
  /*
   * READ FROM THE SOURCE, because boot needs a document and this repo has
   * no DOM in its tests -- the behaviour tests above are of wire(), which
   * takes the window it listens on and so can be driven without one.
   *
   * What matters is the shape: refuse before building anything, and say
   * why to whoever is editing the page rather than to the visitor. An
   * error box on a stranger's website is ours to explain; a console line
   * is read by exactly the person who can fix it.
   */
  const at = SRC.indexOf('if (!code) {');
  assert.ok(at > 0, 'a missing tracking code is no longer handled');
  const body = SRC.slice(at, at + 500);
  assert.match(body, /console\.warn/, 'nothing is said at all');
  assert.match(body, /data-code/,
    'the warning does not name the attribute that is missing');
  assert.match(body, /return null;/,
    'something is still built when there is no code to build it for');
  /* And nothing is drawn into their page. */
  assert.ok(!/appendChild|insertBefore/.test(body),
    'an empty frame or a message is put on the partner\u2019s page');
});

test('THE THREE PLACEMENTS ARE ALL THERE', () => {
  assert.match(SRC, /data-open/, 'there is no button placement');
  assert.match(SRC, /data-target/, 'there is no way to say where the form goes');
  assert.match(SRC, /data-fallback/,
    'there is no hosted-link fallback, so a stripped script leaves nothing');
});

test('and the fallback link is hidden only once we are running', () => {
  /*
   * The link is what a visitor gets when WordPress strips the script --
   * which it does to post content for anyone below admin. So it is in the
   * partner's own markup, and taking it away is this file's job, done
   * only because this file ran.
   */
  const at = SRC.indexOf("var fallback = attr(tag, ['data-fallback']);");
  assert.ok(at > 0, 'the fallback is gone');
  const body = SRC.slice(at, at + 400);
  assert.match(body, /display['"]?,\s*['"]none/,
    'the fallback link is not hidden when the script runs');
});

test('the modal builds its frame on the click, not on page load', () => {
  /* A partner putting this on every page of their site should not be
     loading our form on every page of their site. */
  const at = SRC.indexOf('function openable(');
  const body = SRC.slice(at, SRC.indexOf('\n  }', at));
  const madeAt = body.indexOf('makeFrame(');
  const clickAt = body.indexOf('function openNow(');
  assert.ok(clickAt > 0 && madeAt > clickAt,
    'the modal placement builds its frame before anybody clicks');
});
