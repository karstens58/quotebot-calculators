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
import { CAPTURE_SRC } from './capture-api.mjs';

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
