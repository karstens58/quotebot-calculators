/**
 * A FIRST VISIT PAINTS IN THEIR COLOURS -- QBP-649.
 *
 *   node --test tests/a-first-visit-paints-in-their-colours.test.mjs
 *
 * QBP-648 removed the flash for everybody the six-hour store covers and
 * could not remove it for anybody else. The reason is structural: these
 * pages carry Quote Bot's palette in their own :root, and no script can
 * beat the parser to it. The JSON answer always arrives after the page
 * has painted, so a visitor with nothing cached always watched our
 * colours become somebody else's -- and that visitor is every one of a
 * partner's customers.
 *
 * A STYLESHEET IS THE ONE THING THAT CAN BEAT IT, because the browser
 * will not paint with one outstanding. The server answers the same six
 * declarations it puts in the JSON, and the first paint is already
 * theirs.
 *
 * WHICH PUTS api.quote-bot.com ON THE CRITICAL PATH OF THIRTEEN CONSUMER
 * PAGES, and that is the thing to be careful about rather than the
 * colours. A host that is merely slow would turn a flash into a white
 * screen, which is a worse failure than the one being fixed -- so the
 * link stands itself down after BRAND_CSS_MS and the page draws in ours.
 * Most of this file is about that, and about the paths where no
 * stylesheet should be asked for at all.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CAPTURE_SRC } from './capture-api.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CAPTURE = CAPTURE_SRC;
const BACKEND = join(ROOT, '..', 'quotebot-backend',
  'amplify/functions/shared/brand.ts');

const PAINT = {
  primary: '#1d2142', primaryInk: '#ffffff', accent: '#7d3f77',
  ground: '#faf7f3', ink: '#000000', dim: '#565350',
  tint: '#f2efeb', line: '#d6d3d0', disclosure: '#000000',
};

/* ---- enough of a head to watch a <link> go into it ---------------------- */

function page({ href, cached, endpoint = 'https://api.quote-bot.com/lead/',
  readyState = 'loading', script = {} }) {
  const store = new Map();
  if (cached !== undefined) {
    store.set('qb.brand', JSON.stringify({
      [cached.code]: { ...cached.brand, at: Date.now() },
    }));
  }

  const head = { children: [], appendChild(c) { c.parentNode = head; head.children.push(c); },
    removeChild(c) {
      const i = head.children.indexOf(c);
      if (i >= 0) head.children.splice(i, 1);
      c.parentNode = null;
    } };
  const timers = [];

  const written = [];
  const doc = {
    readyState, referrer: '', cookie: '',
    /*
     * A PARSER, not a string sink. document.write during parsing is what
     * makes the stylesheet render-blocking in browsers that never shipped
     * blocking="render" -- so a harness that only recorded the markup
     * would agree with a script that wrote nothing into the document.
     */
    write(html) {
      written.push(html);
      const node = doc.createElement('link');
      const attr = (name) => {
        const m = new RegExp(`${name}="([^"]*)"`).exec(html);
        return m ? m[1] : null;
      };
      node.id = attr('id') ?? '';
      node.rel = attr('rel') ?? '';
      node.href = attr('href') ?? '';
      if (attr('blocking')) node.setAttribute('blocking', attr('blocking'));
      head.appendChild(node);
    },
    documentElement: { style: { setProperty() {}, removeProperty() {} } },
    head,
    body: { insertBefore() {}, firstChild: null },
    addEventListener() {}, removeEventListener() {},
    querySelectorAll: () => [], getElementsByTagName: () => [],
    querySelector: () => null,
    getElementById: (id) => head.children.find((c) => c.id === id) ?? null,
    createElement: () => {
      const node = {
        id: '', style: { cssText: '' }, children: [], parentNode: null,
        attrs: {},
        setAttribute(k, v) { node.attrs[k] = String(v); },
        getAttribute: (k) => (k in node.attrs ? node.attrs[k] : null),
        removeAttribute(k) { delete node.attrs[k]; },
        appendChild() {},
      };
      return node;
    },
    currentScript: {
      getAttribute: (k) => (k === 'data-endpoint' ? endpoint : ''),
      ...script,
    },
  };

  const win = {
    get location() { return new URL(href); },
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
    history: { replaceState() {} },
    URL, URLSearchParams,
    /* Captured rather than run: the point of the timer is what it does
       when the stylesheet has NOT arrived, and a test that waited 1.2
       seconds for each of those would not be run. */
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimeout: (id) => { if (timers[id - 1]) timers[id - 1].cleared = true; },
    navigator: { sendBeacon: () => true, userAgent: 'node' },
    addEventListener() {}, removeEventListener() {},
    matchMedia: () => ({ matches: false, addEventListener() {} }),
  };
  win.document = doc;
  win.window = win;

  const fn = new Function('window', 'document', 'history', 'localStorage',
    'navigator', 'location', 'fetch', `${CAPTURE}\nreturn window.QuoteBot;`);
  fn(win, doc, win.history, win.localStorage, win.navigator, win.location,
    () => new Promise(() => {}));

  return {
    head, timers, written,
    sheet: () => head.children.find((c) => c.rel === 'stylesheet') ?? null,
    /** The timer the stylesheet set, whatever else has set one. */
    standDown: () => timers.find((t) => t.ms === 1200) ?? null,
  };
}

const CO = 'https://tools.quote-bot.com/quotetool.html?qb=BR-QUOTE';
const PLAIN = 'https://tools.quote-bot.com/quotetool.html';

/* ============================================== it is asked for, and when */

test('A FIRST VISIT ON A PARTNER\'S LINK LINKS THEIR STYLESHEET', () => {
  /*
   * readyState is still 'loading' and boot has not run, so this went into
   * the head while the head was being parsed -- which is the only moment
   * at which it can still decide the first paint.
   */
  const p = page({ href: CO });
  const sheet = p.sheet();
  assert.ok(sheet, 'nothing links the palette, so the first paint is ours');
  /*
   * AT THE ROOT OF THE HOST, not under /lead. The brand reads have their
   * own cached behaviour at the edge and the writes must not share it --
   * a '/lead/brand*' pattern would match '/lead*'s own literal prefix,
   * and which won would rest on object key order surviving CDK. See the
   * block on '/brand*' in the backend's backend.ts.
   */
  assert.equal(sheet.href, 'https://api.quote-bot.com/brand.css?qb=BR-QUOTE');
});

test('and the address is built from the configured endpoint', () => {
  /* Typed here instead, a staging build would paint from production. */
  const p = page({ href: CO, endpoint: 'https://api.staging.quote-bot.com/lead/' });
  assert.equal(p.sheet().href,
    'https://api.staging.quote-bot.com/brand.css?qb=BR-QUOTE');
});

test('A RETURNING VISITOR IS NOT ASKED FOR ONE', () => {
  /*
   * They are painted inline from their own store before this would have
   * been requested, and an inline property beats a stylesheet anyway --
   * so the request would buy nothing and cost a round trip on a page
   * that is already correct.
   */
  const p = page({ href: CO,
    cached: { code: 'BR-QUOTE', brand: { name: 'X', paint: PAINT } } });
  assert.equal(p.sheet(), null);
});

test('and neither is an ordinary visitor', () => {
  const p = page({ href: PLAIN });
  assert.equal(p.sheet(), null,
    'a page nobody pointed at a partner waits on a palette it cannot have');
});

test('a code with no co-branding costs one cached request and no flash', () => {
  /*
   * Most codes. The answer is an empty stylesheet, so nothing changes --
   * which is the point. Asking only for codes we already know are
   * co-branded is not possible: that is what the request is for.
   */
  const p = page({ href: CO,
    cached: { code: 'BR-QUOTE', brand: { name: 'BenefitHub' } } });
  assert.equal(p.sheet(), null, 'a cached plain affiliate was asked anyway');
});

/* ======================================== it does not hold the page hostage */

test('IT IS DECLARED RENDER-BLOCKING, OR IT IS DECORATION', () => {
  /*
   * The one the live page caught. Measured on tools.quote-bot.com, the
   * stylesheet finished 900ms AFTER first-contentful-paint and the page
   * had painted perfectly happily without it -- which is the whole
   * approach doing nothing at all.
   *
   * A stylesheet the PARSER finds in the head blocks rendering. One added
   * by a script does not: Chromium stopped treating those as
   * render-blocking, and this attribute is the platform's answer to
   * exactly that. Without it the link is an ordinary late stylesheet.
   */
  const p = page({ href: CO });
  assert.equal(p.sheet().getAttribute('blocking'), 'render',
    'the stylesheet does not hold the paint, so the first paint is ours '
    + 'and the whole approach is decoration');
});

test('THE FIRST PAINT IS NOT HELD FOR EVER', () => {
  /*
   * The risk this whole approach carries. Before it, a slow or dead
   * api.quote-bot.com cost a calculator nothing it could see; now it
   * would cost the first paint. A white screen is a worse failure than
   * the flash being fixed, so the wait is bounded.
   */
  const p = page({ href: CO });
  const timer = p.standDown();
  assert.ok(timer, 'nothing stands the stylesheet down, so a slow host is a '
    + 'blank page rather than a flash');

  timer.fn();
  assert.equal(p.sheet().media, 'print',
    'the link still matches, so it is still holding the paint');
  assert.equal(p.sheet().getAttribute('blocking'), null,
    'the render-blocking attribute is still set, so the medium change '
    + 'released nothing and the page is still waiting');
});

test('and if it then arrives it is put back', () => {
  const p = page({ href: CO });
  p.standDown().fn();
  p.sheet().onload();
  assert.equal(p.sheet().media, 'all',
    'the palette arrived and was left on a medium nothing matches');
});

test('the usual path does not touch media at all', () => {
  /* It arrived in time. Writing media for symmetry is a write on the
     critical path that buys nothing. */
  const p = page({ href: CO });
  p.sheet().onload();
  assert.equal(p.sheet().media, undefined);
  assert.ok(p.timers.some((t) => t.cleared), 'the stand-down timer still runs');
  assert.equal(p.sheet().getAttribute('blocking'), null,
    'a sheet that has already arrived is left declared render-blocking, '
    + 'which is harmless today and a trap for the next reader');
});

test('A STYLESHEET THAT FAILS IS TAKEN OUT RATHER THAN LEFT', () => {
  const p = page({ href: CO });
  const sheet = p.sheet();
  sheet.onerror();
  assert.equal(p.sheet(), null, 'a dead link was left in the head');
});

/* ============================================================= the CSP */

test('THE PAGES ARE ALLOWED TO LOAD IT', () => {
  /*
   * style-src did not include api.quote-bot.com, so the browser would
   * have refused the stylesheet and the console would have shown a CSP
   * violation and nothing else: the page renders, in our colours, and
   * every test above still passes.
   */
  const csp = readFileSync(join(ROOT, 'customHttp.yml'), 'utf8');
  const line = /style-src ([^;]+);/.exec(csp);
  assert.ok(line, 'style-src is gone from the policy');
  assert.ok(line[1].includes('https://api.quote-bot.com'),
    'the palette stylesheet is refused by our own policy');
});

/* ================================================== one table, two painters */

test('THE SERVER AND THE BROWSER PAINT THE SAME SIX TOKENS', () => {
  /*
   * The stylesheet decides the first paint; paintPage writes the same six
   * inline when the JSON lands. Disagree and the page would paint one set
   * and correct itself to another a moment later -- a flash with extra
   * steps, and a harder one to explain.
   *
   * SKIPPED WHEN THE BACKEND IS NOT CHECKED OUT BESIDE THIS REPO, as the
   * other cross-repo tests here are: CI for this repo clones only this
   * repo, and a read that throws fails the preBuild and stops the deploy.
   * The server half has its own guard beside the file it is about.
   */
  if (!existsSync(BACKEND)) {
    console.log('  (quotebot-backend is not checked out beside this repo '
      + '— skipped; the backend has its own guard)');
    return;
  }
  const brand = readFileSync(BACKEND, 'utf8');
  const table = /export const PAINTED_TOKENS[\s\S]*?\n\];/.exec(brand);
  assert.ok(table, 'the server no longer names the tokens it paints');

  const theirs = [...table[0].matchAll(/\['(--[a-z-]+)', '(\w+)'\]/g)]
    .map((m) => [m[1], m[2]]);

  const at = CAPTURE.indexOf('var tokens = {');
  assert.ok(at > 0, 'paintPage no longer names the tokens it paints');
  const ours = [...CAPTURE.slice(at, CAPTURE.indexOf('};', at))
    .matchAll(/'(--[a-z-]+)': paint\.(\w+)/g)].map((m) => [m[1], m[2]]);

  assert.deepEqual(ours, theirs,
    'the stylesheet and the inline paint disagree about which colour goes '
    + 'in which token, so a first paint and the one after it would differ');
});

/* ============================================ our mark is not on their page */

test('THE STYLESHEET ALSO HOLDS OUR MARK BACK, AND ONE ATTRIBUTE RELEASES IT', () => {
  /*
   * Colours are not the whole of a first paint. The page ships with Quote
   * Bot's logo in its markup and the swap waits on the JSON, so a
   * stylesheet that fixed only the palette would still show our mark on
   * their page -- the half of the complaint that is about whose page it
   * is rather than what colour.
   *
   * The server's hold is a RULE, not an element, so the script cannot
   * remove it. It is released by the attribute instead, and the same
   * attribute releases the inline hold a returning visitor gets: one
   * answer to "may our mark be seen" rather than two that can disagree.
   */
  assert.match(CAPTURE, /img\.setAttribute\('data-qb-swapped', '1'\)/,
    'nothing marks the logo as settled, so the server rule hides it for ever');

  const at = CAPTURE.indexOf('function markSettled(');
  assert.ok(at > 0, 'the release is gone');

  /* On EVERY path out, including the ones where no mark arrives: a failed
     lookup must show our mark rather than an empty header. */
  const show = CAPTURE.indexOf('function showLogo(');
  assert.ok(show > 0, 'showLogo is gone');
  assert.match(CAPTURE.slice(show, CAPTURE.indexOf('\n  }', show)),
    /markSettled\(\)/,
    'the server rule is only released when a mark actually swapped in, so '
    + 'a partner with no logo gets an empty header for ever');
});

test('and the server only hides it when a mark is actually coming', () => {
  /*
   * Gated on the same test swapLogo applies -- a data URL or nothing.
   * Hiding ours on the strength of a value the browser will then refuse
   * to use would leave the header permanently empty.
   */
  if (!existsSync(BACKEND)) {
    console.log('  (quotebot-backend is not checked out beside this repo '
      + '— skipped; the backend has its own guard)');
    return;
  }
  const brand = readFileSync(BACKEND, 'utf8');
  assert.match(brand, /slice\(0, 5\) === 'data:'/,
    'the server hides our mark without checking that theirs is usable');
  assert.match(brand, /:not\(\[data-qb-swapped\]\)/,
    'the server rule has no release, so the script cannot undo it');
});

/* ================================ in front of the parser, not after it */

test('THE STYLESHEET IS WRITTEN INTO THE PAGE, NOT APPENDED TO IT', () => {
  /*
   * Measured, on a Mac and an iPhone: with blocking="render" alone the
   * page "does show blue first. it is quick, but still does flash."
   * Safari has not shipped that attribute, so there the link was an
   * ordinary late stylesheet and a first visit flashed as it always had.
   *
   * A stylesheet the PARSER finds is render-blocking in every browser and
   * has been for twenty years. document.write during parsing puts one in
   * the token stream, so no attribute and no per-browser branch decides
   * whether the first paint is the partner's.
   */
  const p = page({ href: CO });
  assert.equal(p.written.length, 1,
    'nothing was written into the parser, so every browser without '
    + 'blocking="render" paints ours first');
  assert.match(p.written[0],
    /^<link id="qb-brand-css" rel="stylesheet" blocking="render" href="https:\/\/api\.quote-bot\.com\/brand\.css\?qb=BR-QUOTE">$/);
  assert.ok(p.sheet(), 'the written tag did not reach the document');
});

test('AND IT IS NOT WRITTEN ONCE THE PARSER HAS FINISHED', () => {
  /*
   * The footgun. document.write after parsing replaces the whole
   * document -- a blank page instead of a flash, which is the one
   * outcome worse than the bug.
   */
  const p = page({ href: CO, readyState: 'interactive' });
  assert.deepEqual(p.written, [],
    'document.write was called after parsing, which blanks the page');
  assert.ok(p.sheet(), 'and the fallback did not append one either');
  assert.equal(p.sheet().getAttribute('blocking'), 'render',
    'the appended path lost the attribute that makes it work in Chromium');
});

test('nor when this script is the kind that outlives the parser', () => {
  /*
   * An async script can be running while readyState is still 'loading',
   * and document.write from one blanks the document just the same. The
   * tag on all thirteen pages is an ordinary blocking script today; this
   * is what happens the day somebody adds defer or async to it.
   */
  for (const kind of [{ async: true }, { defer: true }]) {
    const p = page({ href: CO, script: kind });
    assert.deepEqual(p.written, [],
      `a script with ${Object.keys(kind)[0]} wrote into the document`);
    assert.ok(p.sheet(), 'and nothing was appended instead');
  }
});

test('A SHEET THAT WAS ALREADY CACHED IS NOT STOOD DOWN LATER', () => {
  /*
   * A cached stylesheet can be applied before the next line runs, and
   * then onload never fires -- so the stand-down would arrive a second
   * later and take a stylesheet that had already painted back off the
   * page, in the partner's own colours, in front of their customer.
   */
  const p = page({ href: CO });
  const sheet = p.sheet();
  sheet.sheet = {};
  /* Re-run the pass with the sheet already in. */
  const q = page({ href: CO, cached: undefined });
  assert.ok(q.sheet(), 'nothing to check');

  const src = CAPTURE.slice(CAPTURE.indexOf('function linkBrandCss('));
  assert.match(src.slice(0, 2600), /if \(link\.sheet\) \{[\s\S]{0,160}?return;/,
    'nothing checks whether the sheet is already in, so the stand-down '
    + 'can unapply a stylesheet that has already painted');
});

test('A CODE WITH NO PARTNER BEHIND IT TAKES THE PALETTE BACK OFF', () => {
  /*
   * What makes an hour at the edge safe. The stylesheet is cached far
   * longer than anything else here, so without this the longest-cached
   * answer in the system would be the one deciding how long a former
   * partner's colours stay on a consumer page -- and nothing would
   * correct it, because paintPage is never called when there is no
   * brand. The stale colours would simply stay, under Quote Bot's name,
   * with no strip and no mark to say whose they were.
   */
  const at = CAPTURE.indexOf('function dropBrandCss(');
  assert.ok(at > 0, 'nothing takes the stylesheet off when the partner is gone');

  const load = CAPTURE.slice(CAPTURE.indexOf('function loadBrand('));
  const refused = load.slice(load.indexOf('if (!brand || !brand.name)'));
  assert.match(refused.slice(0, 300), /dropBrandCss\(\)/,
    'a deactivated partner keeps their colours on the page for as long as '
    + 'the edge holds the stylesheet');
});
