/**
 * A PAGE THAT TIDIES ITS ADDRESS BAR MUST NOT TIDY AWAY THE AFFILIATE.
 *
 * Reported from a live affiliate page: "the calculator buttons work well
 * on the affiliate page, but they do not link to the affiliates coded
 * page." The links were right — ?qb=AT-QUOTE, exactly as built. What
 * happened was at the other end.
 *
 * The quote tool and the DIME calculator each prefill their form from the
 * query string and then clear it, so a date of birth does not sit in a URL
 * somebody might copy, bookmark or leak as a referrer. They cleared it
 * with:
 *
 *     history.replaceState(null, '', location.pathname);
 *
 * — the WHOLE query string, tracking code included. And the capture script
 * read the address bar on DOMContentLoaded, which is after every inline
 * script in the body has run. So the order was: arrive with the code,
 * throw the code away, then look for the code.
 *
 * NOTHING LOOKED BROKEN. The calculator worked, the lead was captured, the
 * visitor saw what they expected. The only thing missing was whose lead it
 * was, and the only place that shows is a report nobody reads daily.
 *
 * Two properties, because the bug needed both halves:
 *   - attribution is read at parse time, so no later script can take it;
 *   - tidying keeps the attribution params and drops the rest.
 *
 *   node --test tests/tidy-query-keeps-the-code.test.mjs
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.join(ROOT, 'site');
const SRC = fs.readFileSync(path.join(SITE, 'js/quotebot-capture.js'), 'utf8');

const pages = () => fs.readdirSync(SITE).filter((f) => f.endsWith('.html'));

/* ---- the half that let the code be thrown away --------------------- */

test('no page clears its whole query string', () => {
  /*
   * DERIVED over every shipped page, not a list of the two that had it.
   * The next calculator to prefill from a URL will copy one of these, and
   * copying the old line is how this comes back.
   */
  const guilty = [];
  for (const f of pages()) {
    const src = fs.readFileSync(path.join(SITE, f), 'utf8');
    /* replaceState to a bare pathname, however it is spelled. */
    if (/replaceState\s*\([^)]*,\s*['"]['"]\s*,\s*(location|window\.location)\.pathname\s*\)/
      .test(src)) guilty.push(f);
  }
  assert.deepEqual(guilty, [],
    'these pages drop the affiliate code out of the address bar — '
    + 'call QuoteBot.tidyQuery() instead');
});

test('a page that tidies its query does it through the shared keep-list', () => {
  const tidying = pages().filter((f) =>
    /tidyQuery|replaceState/.test(fs.readFileSync(path.join(SITE, f), 'utf8')));
  assert.ok(tidying.length >= 2,
    'the two pages that prefill from a URL are not tidying at all any more');
  for (const f of tidying) {
    const src = fs.readFileSync(path.join(SITE, f), 'utf8');
    assert.match(src, /QuoteBot\s*&&\s*window\.QuoteBot\.tidyQuery|QuoteBot\.tidyQuery\(\)/,
      `${f} rewrites its own URL without the shared keep-list`);
  }
});

/* ---- the half that read the address bar too late -------------------- */

test('attribution is read at parse time, not at DOMContentLoaded', () => {
  /*
   * The call must be OUTSIDE boot(). Inside it, the read happens after
   * every inline script in the body, which is where the code went.
   */
  const boot = SRC.slice(SRC.indexOf('function boot()'));
  const bootBody = boot.slice(0, boot.indexOf('\n  }'));
  assert.ok(!/resolveAttribution\s*\(/.test(bootBody),
    'attribution is resolved inside boot(), so a page script can still '
    + 'clear the URL before it is read');
  assert.match(SRC, /^\s*var attrAtLoad = resolveAttribution\(\);/m,
    'attribution is not resolved at parse time');
});

/* ---- the keep-list is the read-list --------------------------------- */

test('tidying keeps every param the capture actually reads', () => {
  /*
   * DERIVED from currentParams itself. A new signal added there and not
   * to the keep-list would be tidied away on exactly the two pages that
   * matter most, and nothing else would say so.
   */
  const fn = SRC.slice(SRC.indexOf('function currentParams()'));
  const body = fn.slice(0, fn.indexOf('\n  }'));
  const read = [...body.matchAll(/get\(\s*'([^']+)'\s*\)/g)].map((m) => m[1]);
  assert.ok(read.length >= 8, `currentParams reads only ${read.length} params`);

  const list = SRC.slice(SRC.indexOf('var ATTRIBUTION_PARAMS = ['));
  const kept = [...list.slice(0, list.indexOf('];')).matchAll(/'([^']+)'/g)]
    .map((m) => m[1]);

  for (const k of read) {
    assert.ok(kept.includes(k),
      `currentParams reads "${k}" and the keep-list drops it`);
  }
});

/* ---- and it actually does it ---------------------------------------- */

test('tidyQuery drops the answers and keeps the code', async () => {
  /*
   * Run against the shipped file rather than a reimplementation, in the
   * smallest shim that lets it load. The assertion is the URL a visitor
   * is left looking at.
   */
  const store = new Map();
  let href = 'https://tools.quotebot.io/quotetool.html'
    + '?qb=AT-QUOTE&age=48&dob=1978-03-02&utm_source=fb&gender=male';
  const win = {
    get location() { return new URL(href); },
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
    history: { replaceState: (_s, _t, to) => { href = new URL(to, href).href; } },
    URL, URLSearchParams, setTimeout, clearTimeout, fetch: async () => ({ ok: true }),
    navigator: { sendBeacon: () => true, userAgent: 'node' },
    addEventListener() {}, removeEventListener() {},
    matchMedia: () => ({ matches: false, addEventListener() {} }),
  };
  const doc = {
    /* 'loading', so boot() waits for a DOMContentLoaded this shim never
       fires. That is the point of the test above: everything attribution
       needs has already happened by now, with no DOM in the room. */
    readyState: 'loading', referrer: '',
    addEventListener() {}, removeEventListener() {},
    querySelectorAll: () => [], querySelector: () => null,
    getElementById: () => null, createElement: () => ({ setAttribute() {}, style: {},
      appendChild() {}, classList: { add() {} } }),
    head: { appendChild() {} }, body: { appendChild() {} },
    currentScript: { getAttribute: () => '' },
  };
  win.document = doc;
  win.window = win;

  const fn = new Function('window', 'document', 'history', 'localStorage',
    'navigator', 'location', `${SRC}\nreturn window.QuoteBot;`);
  const api = fn(win, doc, win.history, win.localStorage, win.navigator, win.location);

  assert.ok(api && typeof api.tidyQuery === 'function', 'tidyQuery is not exposed');
  api.tidyQuery();

  const after = new URL(href);
  assert.equal(after.searchParams.get('qb'), 'AT-QUOTE', 'the code was tidied away');
  assert.equal(after.searchParams.get('utm_source'), 'fb', 'the source was tidied away');
  assert.equal(after.searchParams.get('dob'), null, 'a date of birth was left in the URL');
  assert.equal(after.searchParams.get('age'), null, 'an answer was left in the URL');
  assert.equal(after.searchParams.get('gender'), null, 'an answer was left in the URL');
  assert.equal(after.pathname, '/quotetool.html');
});
