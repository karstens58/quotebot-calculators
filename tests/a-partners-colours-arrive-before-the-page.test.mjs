/**
 * A PARTNER'S COLOURS ARRIVE WITH THE PAGE, NOT AFTER IT -- QBP-648.
 *
 *   node --test tests/a-partners-colours-arrive-before-the-page.test.mjs
 *
 * Scott, 25 November, relaying Redbird Advisors and Protectmyspouse: "the
 * tool links show the Quote Bot colors then flip to their branding."
 *
 * They did. These thirteen pages are static files carrying our palette in
 * their own :root and our mark in their markup, and the lookup that says
 * otherwise did not START until DOMContentLoaded -- so a visitor watched
 * the finished Quote Bot page for a whole round trip and then saw the
 * colours, the mark and a newly inserted strip all move at once.
 *
 * NOBODY INSIDE THE COMPANY SEES IT, which is why a partner had to report
 * it: the answer is cached for six hours, so only the first page of a
 * visit flashes, and every one of a partner's customers is a first page.
 *
 * WHAT IS HELD HERE is that the two halves of the answer have different
 * requirements and now run at different times. The colours need only
 * documentElement, which exists while the head is parsing; the mark, the
 * strip and the notice need a body. Anything that quietly moves the paint
 * back into boot() restores the flash for every returning visitor, and
 * nothing on screen would say so.
 *
 * THE OTHER HALF IS THE ORDINARY VISITOR. Most links are a plain
 * affiliate code with no co-branding behind it, and on those the page is
 * ours and stays ours. Holding our own mark back on the chance that a
 * lookup might replace it would put a blank box on pages that were never
 * going to change -- so the hold is asserted to be as narrow as it is
 * useful, and asserted to be released on every path out.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CAPTURE_SRC } from './capture-api.mjs';

const CAPTURE = CAPTURE_SRC;

const PAINT = {
  primary: '#1d2142', primaryInk: '#ffffff', accent: '#7d3f77',
  ground: '#faf7f3', ink: '#000000', dim: '#565350',
  tint: '#f2efeb', line: '#d6d3d0', disclosure: '#000000',
};
const LOGO = 'data:image/png;base64,iVBORw0KGgo=';

/* ---- a DOM small enough to read and faithful where it matters ----------- */

function textNode(value) {
  return { isText: true, textContent: value, children: [], parentNode: null };
}

/*
 * textContent CLEARS CHILDREN AND BECOMES ONE, the way a browser's does.
 *
 * drawStrip empties the reserved line with `while (bar.firstChild)` before
 * it writes the words in. A fake where textContent was a plain string
 * would leave the placeholder behind and still pass -- and would agree
 * with a strip that printed its own placeholder to a visitor.
 */
function el(tag) {
  const node = {
    tag, id: '', attrs: {}, style: { cssText: '' }, children: [],
    parentNode: null,
    get firstChild() { return this.children[0] ?? null; },
    get textContent() {
      return this.children.map((c) => c.textContent ?? '').join('');
    },
    set textContent(v) {
      this.children.length = 0;
      if (String(v)) this.children.push(textNode(String(v)));
    },
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) {
      return Object.prototype.hasOwnProperty.call(this.attrs, k)
        ? this.attrs[k] : null;
    },
    removeAttribute(k) { delete this.attrs[k]; },
    appendChild(c) { c.parentNode = node; node.children.push(c); return c; },
    removeChild(c) {
      const i = node.children.indexOf(c);
      if (i >= 0) node.children.splice(i, 1);
      c.parentNode = null;
      return c;
    },
    insertBefore(c, ref) {
      const i = ref ? node.children.indexOf(ref) : -1;
      if (i >= 0) node.children.splice(i, 0, c);
      else node.children.unshift(c);
      c.parentNode = node;
      return c;
    },
  };
  return node;
}

const find = (root, id) => {
  if (!root || root.isText) return null;
  if (root.id === id) return root;
  for (const c of root.children ?? []) {
    const hit = find(c, id);
    if (hit) return hit;
  }
  return null;
};

/**
 * Load the real script into that DOM and hand back the levers.
 *
 * `cached` seeds the six-hour store, which is what tells the parse-time
 * pass whether it has anything to paint from. `settle` is the lookup's
 * answer, delivered when the test chooses, so the gap between load and
 * answer is something the test can stand inside.
 */
function page({ href, cached, endpoint = 'https://api.quote-bot.com/lead/' }) {
  const store = new Map();
  if (cached !== undefined) {
    store.set('qb.brand', JSON.stringify({
      [cached.code]: { ...cached.brand, at: Date.now() },
    }));
  }

  const painted = {};
  const head = el('head');
  const body = el('body');
  const html = el('html');
  html.style = {
    setProperty(k, v) { painted[k] = v; },
    removeProperty(k) { delete painted[k]; },
  };

  const logo = { src: 'img/quotebot-logo.png', alt: 'Quote-Bot',
    closest: () => null, removeAttribute() {} };
  const notice = {
    textContent: 'Fulfilled by QB Insurance LLC.',
    attrs: {},
    getAttribute(k) { return this.attrs[k] ?? null; },
    setAttribute(k, v) { this.attrs[k] = String(v); },
  };

  /*
   * THE LOOKUP'S RESOLVER IS KEPT BY URL, not in one slot.
   *
   * boot() also fetches -- trackClick goes out on the same host -- and a
   * single slot was overwritten by it, so the test resolved the click
   * instead of the brand and every assertion read an unanswered page.
   */
  const waiting = [];
  const asked = [];
  const ready = [];

  const doc = {
    readyState: 'loading', referrer: '', cookie: '',
    documentElement: html, head, body,
    addEventListener(name, fn) { if (name === 'DOMContentLoaded') ready.push(fn); },
    removeEventListener() {},
    querySelectorAll: () => [],
    getElementsByTagName: () => [],
    querySelector: (sel) => {
      if (sel.indexOf('brand-logo-img') >= 0) return logo;
      if (sel.indexOf('data-qb-fulfilment') >= 0) return notice;
      return null;
    },
    getElementById: (id) => find(head, id) || find(body, id),
    createElement: el,
    currentScript: { getAttribute: (k) =>
      (k === 'data-endpoint' ? endpoint : '') },
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
    fetch: (url) => {
      asked.push(String(url));
      if (String(url).indexOf('/brand?') < 0) {
        return Promise.resolve({ ok: true, json: async () => ({}) });
      }
      return new Promise((resolve) => { waiting.push(resolve); });
    },
    navigator: { sendBeacon: () => true, userAgent: 'node' },
    addEventListener() {}, removeEventListener() {},
    matchMedia: () => ({ matches: false, addEventListener() {} }),
  };
  win.document = doc;
  win.window = win;

  /*
   * `fetch` IS A PARAMETER, and it has to be.
   *
   * The script calls it bare, so without this it resolves to node's real
   * global and the test makes an actual request to api.quote-bot.com --
   * which fails, is swallowed by fetchBrand's catch, and leaves every
   * assertion below reading a page that was never answered.
   */
  const fn = new Function('window', 'document', 'history', 'localStorage',
    'navigator', 'location', 'fetch', `${CAPTURE}\nreturn window.QuoteBot;`);
  fn(win, doc, win.history, win.localStorage, win.navigator, win.location,
    win.fetch);

  return {
    painted, logo, notice, head, body, asked,
    /** Everything the lookup was asked for, as whole URLs. */
    brandAsks: () => asked.filter((u) => u.indexOf('/brand?') >= 0),
    /** The page finishes parsing. */
    loaded() { doc.readyState = 'interactive'; ready.forEach((f) => f()); },
    /** The lookup answers. */
    async replies(brand) {
      const resolve = waiting.shift();
      assert.ok(resolve, 'nothing was waiting on a lookup');
      resolve({ ok: true, json: async () => brand });
      await new Promise((r) => setTimeout(r, 0));
    },
    strip: () => find(body, 'qb-cobrand'),
    hold: () => find(head, 'qb-logo-hold'),
    links: () => head.children.filter((c) => c.tag === 'link'),
  };
}

const CO = 'https://tools.quote-bot.com/quotetool.html?qb=BR-QUOTE';
const PLAIN = 'https://tools.quote-bot.com/quotetool.html';
const BRAND = { name: 'Protectmyspouse.com LLC', paint: PAINT, logoUrl: LOGO,
  partnership: 'In partnership with Quote Bot' };

/* ================================================= before the first paint */

test('A RETURNING VISITOR IS PAINTED BEFORE THE BODY IS READ', () => {
  /*
   * The whole fix for everybody the cache covers. readyState is still
   * 'loading' and boot has not run, so anything in `painted` here was
   * written while the head was parsing -- which is before a single pixel
   * of ours could have been shown.
   */
  const p = page({ href: CO, cached: { code: 'BR-QUOTE', brand: BRAND } });
  assert.equal(p.painted['--primary'], PAINT.primary,
    'the colours wait for DOMContentLoaded again, and the page flashes');
  assert.equal(p.painted['--accent'], PAINT.accent);
  assert.equal(p.painted['--band-ink'], PAINT.primaryInk);
});

test('and their mark is held back so ours is not shown first', () => {
  const p = page({ href: CO, cached: { code: 'BR-QUOTE', brand: BRAND } });
  assert.ok(p.hold(), 'our mark is painted and then replaced in front of them');
  p.loaded();
  assert.equal(p.logo.src, LOGO, 'their mark never arrived');
  assert.equal(p.hold(), null, 'the hold was never released');
});

test('A PARTNER WITH NO MARK OF THEIR OWN KEEPS OURS, AND KEEPS IT VISIBLE', () => {
  /*
   * Held only where we KNOW a swap is coming. Hiding our mark on the
   * chance that one might would put a blank box in the header of every
   * page that was never going to change.
   */
  const p = page({ href: CO,
    cached: { code: 'BR-QUOTE', brand: { ...BRAND, logoUrl: null } } });
  assert.equal(p.hold(), null, 'our mark was hidden with nothing to replace it');
  p.loaded();
  assert.equal(p.logo.src, 'img/quotebot-logo.png');
});

test('AN ORDINARY VISITOR IS PAINTED NOTHING AND ASKED NOTHING', () => {
  /* Most traffic. A regression here is a defect on every page at once. */
  const p = page({ href: PLAIN });
  assert.deepEqual(Object.keys(p.painted), []);
  assert.deepEqual(p.brandAsks(), []);
  assert.equal(p.hold(), null);
  p.loaded();
  assert.equal(p.strip(), null);
});

test('and a plain affiliate link keeps our colours and our mark', () => {
  /*
   * A code with no co-branding behind it: the page is ours and stays
   * ours. The strip names them and nothing else moves.
   */
  const p = page({ href: CO,
    cached: { code: 'BR-QUOTE', brand: { name: 'BenefitHub' } } });
  assert.deepEqual(Object.keys(p.painted), [],
    'a page with no co-branding arrangement was repainted');
  assert.equal(p.hold(), null);
  p.loaded();
  assert.equal(p.logo.src, 'img/quotebot-logo.png');
  /* No space between them in the text: the gap is a margin on the lead
     span, not a character. */
  assert.match(p.strip().textContent, /Presented by/);
  assert.match(p.strip().textContent, /BenefitHub/);
});

/* ======================================================= the lookup itself */

test('THE LOOKUP IS IN FLIGHT BEFORE THE PAGE HAS FINISHED PARSING', () => {
  const p = page({ href: CO });
  assert.equal(p.brandAsks().length, 1,
    'nothing was asked until DOMContentLoaded, which is the delay itself');
  assert.match(p.brandAsks()[0], /\/brand\?qb=BR-QUOTE$/);
});

test('and the connection is warmed from the configured endpoint', () => {
  /* Typed here instead, a staging build would quietly warm production. */
  const p = page({ href: CO, endpoint: 'https://api.staging.quote-bot.com/lead/' });
  const pre = p.links().filter((l) => l.rel === 'preconnect');
  assert.equal(pre.length, 1, 'the handshake is not started in advance');
  assert.equal(pre[0].href, 'https://api.staging.quote-bot.com');
  assert.equal(pre[0].crossOrigin, '',
    'a preconnect without this warms a different connection from the one '
    + 'a CORS lookup then opens');
});

test('a returning visitor does not ask twice for one page', () => {
  /* Fresh in the cache: painted from it and left alone. */
  const p = page({ href: CO, cached: { code: 'BR-QUOTE', brand: BRAND } });
  p.loaded();
  assert.deepEqual(p.brandAsks(), []);
});

/* ========================================================= the strip's line */

test('THE STRIP\'S LINE IS HELD OPEN WHILE THE ANSWER IS COMING', async () => {
  /*
   * Otherwise the whole page drops by a line the moment it lands, which
   * is the third thing a partner watches move.
   */
  const p = page({ href: CO });
  p.loaded();
  const shell = p.strip();
  assert.ok(shell, 'nothing reserved the line the strip will take');
  assert.equal(shell.getAttribute('aria-hidden'), 'true',
    'an empty line was announced as something to read');
  assert.equal(shell.textContent, '\u00a0');
});

test('AND THE WORDS UPGRADE IT IN PLACE RATHER THAN PUSHING IT DOWN', async () => {
  const p = page({ href: CO });
  p.loaded();
  const shell = p.strip();
  await p.replies(BRAND);

  const strip = p.strip();
  assert.equal(strip, shell, 'a second bar was inserted above the reserved one');
  assert.equal(p.body.children.filter((c) => c.id === 'qb-cobrand').length, 1);
  assert.match(strip.textContent, /In partnership with Quote Bot/);
  assert.equal(strip.getAttribute('data-qb-shell'), null,
    'the upgraded strip still reads as a placeholder');
  assert.equal(strip.getAttribute('aria-hidden'), null,
    'the words were added and left hidden from a screen reader');
  assert.equal(strip.getAttribute('role'), 'note');
});

test('and the reserved line is exactly the box the real one takes', () => {
  /*
   * A shell whose padding or line-height had drifted would reserve the
   * wrong height -- a smaller version of the same jump, and much harder
   * to see. One constant, used twice.
   */
  const box = /var STRIP_BOX = \[([\s\S]*?)\]\.join\(';'\);/.exec(CAPTURE);
  assert.ok(box, 'the shared box is gone and the two can drift');
  assert.ok(/padding:8px 16px/.test(box[1]));
  assert.equal((CAPTURE.match(/STRIP_BOX/g) ?? []).length, 3,
    'the box is declared once and used by both drawings');
});

test('A CODE NOBODY CLAIMS TAKES THE LINE BACK', async () => {
  const p = page({ href: CO });
  p.loaded();
  assert.ok(p.strip(), 'nothing was reserved to take back');
  await p.replies({});
  assert.equal(p.strip(), null, 'an empty line was left at the top of the page');
  assert.equal(p.hold(), null);
  assert.equal(p.logo.src, 'img/quotebot-logo.png');
});

test('and so does a lookup that fails outright', async () => {
  const p = page({ href: CO });
  p.loaded();
  await p.replies(null);
  assert.equal(p.strip(), null);
  assert.deepEqual(Object.keys(p.painted), [],
    'a failed lookup left colours on the page');
});

/* ==================================================== it is not in boot() */

test('THE PAINT DOES NOT QUIETLY MOVE BACK INTO boot()', () => {
  /*
   * The whole fix is that this runs at parse time. Moved into boot for
   * tidiness it would still work, still pass every behavioural test
   * above that fires DOMContentLoaded itself, and restore the flash for
   * every returning visitor -- with nothing on screen to say so.
   */
  const boot = /function boot\(\) \{([\s\S]*?)\n  \}/.exec(CAPTURE);
  assert.ok(boot, 'boot is gone');
  assert.doesNotMatch(boot[1], /beginBrand\(\)/,
    'the lookup starts at DOMContentLoaded again');
  assert.match(CAPTURE, /^  beginBrand\(\);$/m,
    'nothing starts the lookup at parse time');
});
