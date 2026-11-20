/**
 * THE TWELVE CALCULATORS WEAR A PARTNER'S BRAND -- QBP-602.
 *
 *   node --test tests/a-partners-calculator-wears-their-colours.test.mjs
 *
 * Scott, 17 November: "if we can use qb=BR-QUOTE to re-skin the twelve
 * calculators to match the co-brand coloring that would be ideal", and
 * "with this new co-branding option the strip should say 'In partnership
 * with Quote Bot'."
 *
 * These pages are static files. Everything about whose link this is
 * arrives from one public endpoint at load, so the failures worth guarding
 * are the ones where a page paints itself from something it should not
 * have, or does not paint itself from something it should.
 *
 * THE DEFAULT IS THE ONE THAT MATTERS MOST. Twelve calculators serve
 * everybody, and nearly nobody is co-branded. A regression that paints an
 * ordinary visitor's page in the last partner's colours, or that leaves
 * "Presented by" off a page that should carry it, is a defect on every
 * page at once -- so the uncobranded answers are asserted as hard as the
 * co-branded ones.
 *
 * AND NOTHING FROM THE ENDPOINT REACHES A STYLESHEET UNCHECKED. The
 * colours are written with setProperty and the mark with img.src, both
 * from a response any stranger can provoke by guessing a code. Junk is
 * dropped rather than written.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CAPTURE_SRC } from './capture-api.mjs';

/* This repo's root, for the one assertion that reaches across to the
   backend -- the client-side split below buys nothing unless the server
   permits revalidation, so the two are tested together. */
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CAPTURE = CAPTURE_SRC;

const PAINT = {
  primary: '#1d2142', primaryInk: '#ffffff', accent: '#7d3f77',
  ground: '#faf7f3', ink: '#000000', dim: '#565350',
  tint: '#f2efeb', line: '#d6d3d0', disclosure: '#000000',
};
const LOGO = 'data:image/png;base64,iVBORw0KGgo=';

/**
 * Enough of a browser to run the co-branding path and watch what it does.
 *
 * The real script, not a stand-in -- see the note in capture-api.mjs about
 * what a stub agrees with.
 */
function page({ brand, href = 'https://tools.quote-bot.com/quotetool.html?qb=BR-QUOTE' }) {
  const store = new Map();
  if (brand !== undefined) {
    store.set('qb.brand', JSON.stringify({
      'BR-QUOTE': { ...brand, at: Date.now() },
    }));
  }

  const painted = {};
  const logo = { src: 'img/quotebot-logo.png', alt: 'Quote-Bot',
    removeAttribute() {} };
  const inserted = [];
  const node = () => ({
    style: { cssText: '' }, children: [], textContent: '',
    setAttribute(k, v) { this[k] = v; },
    appendChild(c) { this.children.push(c); },
  });

  const doc = {
    readyState: 'loading', referrer: '', cookie: '',
    documentElement: {
      style: { setProperty(k, v) { painted[k] = v; } },
    },
    body: { insertBefore(el) { inserted.push(el); }, firstChild: null },
    addEventListener() {}, removeEventListener() {},
    querySelectorAll: () => [],
    querySelector: (sel) => (sel.indexOf('brand-logo-img') >= 0 ? logo : null),
    getElementById: () => null,
    createElement: node,
    head: { appendChild() {} },
    /* The endpoint has to be absolute or the script never asks. */
    currentScript: { getAttribute: (k) =>
      (k === 'data-endpoint' ? 'https://api.quote-bot.com' : '') },
  };
  const win = {
    get location() { return new URL(href); },
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
    history: { replaceState() {} },
    URL, URLSearchParams, setTimeout, clearTimeout,
    fetch: async () => ({ ok: true, json: async () => ({}) }),
    navigator: { sendBeacon: () => true, userAgent: 'node' },
    addEventListener() {}, removeEventListener() {},
    matchMedia: () => ({ matches: false, addEventListener() {} }),
  };
  win.document = doc;
  win.window = win;

  const fn = new Function('window', 'document', 'history', 'localStorage',
    'navigator', 'location', `${CAPTURE_SRC}\nreturn window.QuoteBot;`);
  const api = fn(win, doc, win.history, win.localStorage, win.navigator,
    win.location);
  api.brand();
  return { painted, logo, strip: inserted[0] ?? null };
}

/** Everything the strip ended up saying, however it was assembled. */
const words = (strip) => {
  const out = [];
  const walk = (n) => {
    if (!n) return;
    if (n.textContent) out.push(n.textContent);
    (n.children ?? []).forEach(walk);
  };
  walk(strip);
  return out.join(' ');
};

/* ---- co-branded -------------------------------------------------------- */

test('A CO-BRANDED CODE REPAINTS THE PAGE IN THEIR COLOURS', () => {
  const { painted } = page({ brand: { name: 'Protectmyspouse.com LLC',
    paint: PAINT, logoUrl: LOGO, partnership: 'In partnership with Quote Bot' } });

  assert.equal(painted['--primary'], PAINT.primary);
  assert.equal(painted['--primary-dark'], PAINT.primary);
  assert.equal(painted['--primary-mid'], PAINT.primary);
  assert.equal(painted['--accent'], PAINT.accent);
  assert.equal(painted['--accent-light'], PAINT.tint);
  assert.equal(painted['--band-ink'], PAINT.primaryInk);
});

test('and the neutral scale is left alone, on purpose', () => {
  /* `color: var(--white)` is a TEXT colour on dark fills on these pages,
     beside eight or nine hardcoded #fff each. Taking the ground out from
     under those would be invisible on a cream palette and unreadable on
     a dark one, on the surface somebody reads a premium off. */
  const { painted } = page({ brand: { name: 'X', paint: PAINT,
    partnership: 'In partnership with Quote Bot' } });
  for (const token of ['--white', '--off-white', '--text', '--gray-mid',
    '--gray-dark', '--gray-light', '--border']) {
    assert.equal(painted[token], undefined,
      `${token} was repainted; the calculator body is not the partner's to colour`);
  }
});

test('THE STRIP NAMES US RATHER THAN THEM', () => {
  const { strip } = page({ brand: { name: 'Protectmyspouse.com LLC',
    paint: PAINT, partnership: 'In partnership with Quote Bot' } });
  assert.match(words(strip), /In partnership with Quote Bot/);
  assert.doesNotMatch(words(strip), /Presented by/,
    'a co-branded page credited the partner instead of disclosing us');
});

test('and the wording is the server\'s, not this file\'s', () => {
  /* Thirteen static files each deciding the words of a disclosure is
     thirteen places for it to drift. */
  const { strip } = page({ brand: { name: 'X', paint: PAINT,
    partnership: 'Working together with Quote Bot' } });
  assert.match(words(strip), /Working together with Quote Bot/);
});

test('their mark replaces ours in the header, and so does its name', () => {
  const { logo } = page({ brand: { name: 'Protectmyspouse.com LLC',
    paint: PAINT, logoUrl: LOGO,
    partnership: 'In partnership with Quote Bot' } });
  assert.equal(logo.src, LOGO);
  /* Not an empty alt. On these pages the header logo is the only thing
     naming whose page a reader is on, so decorative is the wrong answer. */
  assert.equal(logo.alt, 'Protectmyspouse.com LLC');
});

/* ---- the default ------------------------------------------------------- */

test('AN ORDINARY AFFILIATE LINK PAINTS NOTHING', () => {
  const { painted, logo, strip } = page({ brand: { name: 'BenefitHub' } });
  assert.deepEqual(Object.keys(painted), [],
    'a page with no co-branding arrangement was repainted');
  assert.equal(logo.src, 'img/quotebot-logo.png');
  assert.match(words(strip), /Presented by BenefitHub/);
});

test('and a code nobody claims leaves the page entirely alone', () => {
  const { painted, strip } = page({ brand: { name: null } });
  assert.deepEqual(Object.keys(painted), []);
  assert.equal(strip, null, 'an unknown code drew a strip');
});

/* ---- nothing from the endpoint is trusted ------------------------------ */

test('ONLY A HEX COLOUR IS EVER WRITTEN INTO THE PAGE', () => {
  /* setProperty with a junk value is how a stylesheet acquires a
     declaration nobody wrote, and this value came from an endpoint any
     stranger can provoke. */
  const { painted } = page({ brand: { name: 'X', partnership: 'p', paint: {
    ...PAINT,
    primary: 'red',
    accent: 'url(https://example.test/x)',
    tint: '#fff',
    primaryInk: '#ffffff; background: url(evil)',
  } } });
  assert.equal(painted['--primary'], undefined, 'a colour name was written');
  assert.equal(painted['--accent'], undefined, 'a url() was written');
  assert.equal(painted['--accent-light'], undefined, 'a short hex was written');
  assert.equal(painted['--band-ink'], undefined, 'a second declaration was written');
});

test('and only a data: URL is ever set as the mark', () => {
  /* The logo is a data URL on the Brand row. Anything else is a request
     this page would make to somewhere a stranger chose. */
  for (const bad of ['https://example.test/logo.png', 'javascript:alert(1)',
    '//example.test/x.png', '']) {
    const { logo } = page({ brand: { name: 'X', paint: PAINT,
      partnership: 'p', logoUrl: bad } });
    assert.equal(logo.src, 'img/quotebot-logo.png',
      `${JSON.stringify(bad)} was loaded into the header`);
  }
});

test('a half answer paints neither half', () => {
  /* The server sends the palette, the mark and the wording together or
     not at all -- but this page is what a stranger reaches, so it does
     not rely on that. */
  const { painted, strip } = page({ brand: { name: 'X', partnership: 'p' } });
  assert.deepEqual(Object.keys(painted), []);
  assert.ok(strip, 'the strip went missing with the palette');
});

/* =====================================================================
 * HOW LONG A COLOUR CHANGE TAKES TO ARRIVE -- QBP-602.
 *
 * Scott, 20 November: the colours did reach a ?qb= page "but had a
 * significant delay". Two caches were stacked and neither was wrong on
 * its own terms -- the HTTP header bounded how stale a DEACTIVATED
 * affiliate could be, and the localStorage copy stopped a visitor
 * watching the page repaint on every calculator they opened.
 *
 * What was wrong was using the second number for the first job: one
 * six-hour TTL answered "do not repaint in front of somebody" and was
 * also deciding "do not ask again during this visit".
 *
 * These tests hold the two apart, because the tempting fix -- delete
 * the cache -- brings the repaint back, and the tempting other fix --
 * shorten the TTL to a minute -- brings back both the repaint and the
 * five-invocations-per-visitor the comment there warns about.
 * ================================================================== */

test('THE PAINT CACHE OUTLIVES THE ASK WINDOW', () => {
  const fresh = /var BRAND_FRESH = ([^;]+);/.exec(CAPTURE);
  const ttl = /var BRAND_TTL = ([^;]+);/.exec(CAPTURE);
  assert.ok(fresh, 'there is no window for "do not ask again this visit"');
  assert.ok(ttl, 'there is no window for "do not repaint in front of them"');

  const ms = (expr) => Function(`"use strict"; return (${expr});`)();
  const freshMs = ms(fresh[1]);
  const ttlMs = ms(ttl[1]);

  assert.ok(freshMs >= 5 * 60 * 1000,
    'the ask window is under five minutes, so a visitor moving through '
    + 'the calculators pays a Lambda invocation per page');
  assert.ok(freshMs <= 30 * 60 * 1000,
    `the ask window is ${freshMs / 60000} minutes; a palette change waits `
    + 'that long before anything even checks');
  assert.ok(ttlMs > freshMs,
    'the paint cache does not outlive the ask window, so beyond it a '
    + 'visitor watches the page repaint instead of seeing their colours '
    + 'straight away');
});

test('and a stale cache is PAINTED FROM, then refreshed behind them', () => {
  const at = CAPTURE.indexOf('function loadBrand()');
  assert.ok(at > 0, 'loadBrand is gone');
  const body = CAPTURE.slice(at, CAPTURE.indexOf('\n  function fetchBrand', at));

  /* Painted first, unconditionally, whenever there is a cached answer.
     A branch that fetched before painting when the entry was stale is
     the repaint this whole mechanism exists to avoid. */
  const paintAt = body.indexOf('paintPage(hit.paint)');
  const refreshAt = body.indexOf('refreshBrand(code)');
  assert.ok(paintAt > 0, 'a cached palette is no longer painted at once');
  assert.ok(refreshAt > paintAt,
    'the refresh is started before the page is painted from cache');

  /* And the refresh must not draw. Applying a newer answer to the page
     somebody is already looking at is the repaint, one second later. */
  const fn = CAPTURE.slice(CAPTURE.indexOf('function refreshBrand('));
  const upTo = fn.slice(0, fn.indexOf('\n  }'));
  for (const draws of ['paintPage', 'swapLogo', 'drawStrip']) {
    assert.ok(!upTo.includes(draws),
      `refreshBrand calls ${draws}; a background refresh must update the `
      + 'cache and never touch the page in front of somebody');
  }
});

test('the server lets the browser revalidate rather than sit on it', () => {
  /* Without stale-while-revalidate the script's background refresh is
     answered out of the browser's own HTTP cache and changes nothing,
     so the client-side split above would buy exactly zero. */
  const handler = readFileSync(
    join(ROOT, '..', 'quotebot-backend',
      'amplify/functions/lead-capture/handler.ts'), 'utf8');
  const at = handler.indexOf("case '/brand'") > 0
    ? handler.indexOf("case '/brand'") : handler.indexOf('async function handleBrand');
  assert.ok(at > 0, 'the brand endpoint is gone');
  const body = handler.slice(at, at + 3000);
  const header = /'Cache-Control': '([^']+)'/.exec(body);
  assert.ok(header, 'the brand response no longer sets Cache-Control');
  assert.match(header[1], /stale-while-revalidate=\d+/,
    'the brand response does not allow revalidation, so a background '
    + 'refresh is served from the browser cache and the colours still wait');
  const maxAge = Number(/max-age=(\d+)/.exec(header[1])?.[1] ?? 0);
  assert.ok(maxAge > 0 && maxAge <= 300,
    `max-age is ${maxAge}s; beyond a few minutes the browser will not even `
    + 'attempt the refresh that makes a change arrive');
});
