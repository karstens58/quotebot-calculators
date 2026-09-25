/**
 * The three cards, rendered by THE REAL renderBest out of quotetool.html.
 *
 * The function is not imported -- it is cut out of the shipped file and run,
 * so this cannot drift from what the page actually does. Testing a retyped
 * copy would assert that my copy is right, which is not the question.
 *
 *   node --test tests/quotetool-cards.test.mjs
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const HTML = readFileSync(new URL('../site/quotetool.html', import.meta.url), 'utf8');

/* The helpers renderBest leans on, plus renderBest itself, lifted verbatim. */
function cut(start, endMarker, { keepEnd = true } = {}) {
  const i = HTML.indexOf(start);
  assert.notEqual(i, -1, `could not find ${start} in quotetool.html`);
  const j = HTML.indexOf(endMarker, i + start.length);
  assert.notEqual(j, -1, `could not find the end of ${start}`);
  return HTML.slice(i, keepEnd ? j + endMarker.length : j);
}

const source = [
  /* fmtMo and fmtYr only -- stop BEFORE ratingRank, or the slice ends on a
     bare `const` and every test fails on a syntax error in the harness. */
  cut('const fmtMo =', 'const ratingRank', { keepEnd: false }),
  cut('const esc = s =>', "replace(/'/g, '&#39;');"),
  cut('function cheapestQuote(rows){', '\n}'),
  cut('function renderBest(){', "\n  row.innerHTML = cards.join('');\n}"),
].join('\n');

/* A DOM just large enough: renderBest reads one element and writes its HTML. */
let bestRow;
const ctx = {
  document: { getElementById: (id) => (id === 'bestRow' ? bestRow : null) },
  QUOTES: [], FEATURED: [],
};

const run = (quotes, featured) => {
  bestRow = { innerHTML: null };
  const fn = new Function('document', 'QUOTES', 'FEATURED',
    `${source}\n return renderBest();`);
  fn(ctx.document, quotes, featured);
  return bestRow.innerHTML;
};

const q = (id, name, monthly) => ({
  id, name, prodResolved: `${name} Term 20`, rating: 'A+',
  monthly, annual: monthly * 11.832, coverage: 500000,
  logo: `<div class="logo">${name}</div>`,
});

const QUOTES = [
  q('bann', 'Banner Life', 44.10),
  q('amge', 'American General', 38.20),
  q('cinn', 'Cincinnati Life', 51.75),
  q('prot', 'Protective Life', 47.00),
];

const feat = (row, bullets, curated = true, badge = '') =>
  Object.assign({}, row, { bullets, curated, badge });

const cardCount = (html) => (html.match(/class="best-card/g) || []).length;
const badges = (html) =>
  [...html.matchAll(/class="best-badge [^"]*">([^<]*)</g)].map((m) => m[1]);

test('three cards, with the cheapest on the left', () => {
  const html = run(QUOTES, [
    feat(QUOTES[0], ['No medical exam up to $2M']),
    feat(QUOTES[2], ['A+ rated since 1950']),
  ]);
  assert.equal(cardCount(html), 3);
  /* The cheapest is American General at 38.20, and it must be card one even
     though it is not first in the array. */
  const first = html.slice(0, html.indexOf('best-card', 20));
  assert.ok(html.indexOf('American General') < html.indexOf('Banner Life'),
    'the cheapest carrier is not on the left');
  assert.deepEqual(badges(html), ['Most Affordable', 'Our Pick', 'Also Consider']);
});

test('the chosen carriers show the words written about them', () => {
  const html = run(QUOTES, [
    feat(QUOTES[0], ['No medical exam up to $2M', 'Decision in 24 hours']),
    feat(QUOTES[2], ['A+ rated since 1950']),
  ]);
  assert.ok(html.includes('<li>No medical exam up to $2M</li>'));
  assert.ok(html.includes('<li>Decision in 24 hours</li>'));
  assert.ok(html.includes('<li>A+ rated since 1950</li>'));
});

test('AN UNCHOSEN CARD CLAIMS NOTHING', () => {
  /* curated false: here on price alone. No endorsement badge, no reasons. */
  const html = run(QUOTES, [
    feat(QUOTES[0], [], false),
    feat(QUOTES[2], [], false),
  ]);
  assert.deepEqual(badges(html), ['Most Affordable', 'Another Option', 'Another Option']);
  assert.ok(!html.includes('Our Pick'));
  assert.ok(!html.includes('<li>'), 'a card nobody chose carried bullet points');
});

test('no featured picks still yields three cards, by price, saying nothing', () => {
  const html = run(QUOTES, []);
  assert.equal(cardCount(html), 3);
  assert.deepEqual(badges(html), ['Most Affordable', 'Another Option', 'Another Option']);
  assert.ok(!html.includes('<li>'));
  /* Cheapest first, then the next two cheapest: 38.20, then 44.10 and 47.00.
     Cincinnati at 51.75 is the one left out. */
  assert.ok(!html.includes('Cincinnati Life'), 'the fallback did not order by price');
});

test('the fallback never repeats the cheapest carrier', () => {
  const twoProducts = [
    q('amge', 'American General', 38.20),
    { ...q('amge', 'American General', 49.00), prodResolved: 'American General Term 30' },
    q('bann', 'Banner Life', 44.10),
    q('prot', 'Protective Life', 47.00),
  ];
  const html = run(twoProducts, []);
  /* Counted on the carrier-name slot only: the name also appears in each
     card's product line, so a raw string count is two per card and can never
     be 1. The first version of this test asserted exactly that and failed
     against correct code. */
  const named = [...html.matchAll(/class="best-carrier-name">([^<]*)</g)]
    .map((m) => m[1]);
  assert.deepEqual(named, ['American General', 'Banner Life', 'Protective Life']);
  assert.equal(named.filter((n) => n === 'American General').length, 1,
    'the cheapest carrier appeared on a second card');
});

test('no quotes renders nothing rather than an empty shell', () => {
  assert.equal(run([], []), '');
});

test('a quote with no premium cannot be the cheapest', () => {
  const broken = [
    { ...q('bann', 'Banner Life', 0), monthly: null },
    q('amge', 'American General', 38.20),
    q('prot', 'Protective Life', 47.00),
  ];
  const html = run(broken, []);
  assert.ok(html.indexOf('American General') < html.indexOf('Protective'),
    'a row with no premium took the cheapest card');
  assert.ok(!html.includes('$NaN') && !html.includes('undefined'));
});

test('ADMIN TEXT CANNOT INJECT MARKUP', () => {
  const nasty = '<img src=x onerror="alert(1)">';
  const html = run(QUOTES, [
    feat({ ...QUOTES[0], name: 'Smith & Sons <Life>' }, [nasty]),
    feat(QUOTES[2], ['fine']),
  ]);
  assert.ok(!html.includes('<img src=x'), 'a bullet injected raw markup');
  assert.ok(html.includes('&lt;img src=x'), 'the bullet was not escaped');
  assert.ok(html.includes('Smith &amp; Sons &lt;Life&gt;'),
    'the carrier name was not escaped');
});

/* ---- the card tag -------------------------------------------------------- */

test('a carrier’s own tag replaces the slot wording', () => {
  const html = run(QUOTES, [
    feat(QUOTES[0], ['No medical exam'], true, 'Fastest decision'),
    feat(QUOTES[2], ['A+ rated'], true, 'Best service'),
  ]);
  assert.deepEqual(badges(html), ['Most Affordable', 'Fastest decision', 'Best service']);
});

test('no tag falls back to the wording for that position', () => {
  const html = run(QUOTES, [
    feat(QUOTES[0], ['x'], true, ''),
    feat(QUOTES[2], ['y'], true, '   '),
  ]);
  assert.deepEqual(badges(html), ['Most Affordable', 'Our Pick', 'Also Consider']);
});

test('one carrier can have a tag while the other falls back', () => {
  const html = run(QUOTES, [
    feat(QUOTES[0], ['x'], true, 'Best for non-smokers'),
    feat(QUOTES[2], ['y'], true, ''),
  ]);
  assert.deepEqual(badges(html), ['Most Affordable', 'Best for non-smokers', 'Also Consider']);
});

test('an unchosen card wears the tag typed against that carrier', () => {
  const html = run(QUOTES, [
    feat(QUOTES[0], [], false, 'Fastest decision'),
    feat(QUOTES[2], [], false, 'Best service'),
  ]);
  assert.deepEqual(badges(html), ['Most Affordable', 'Fastest decision', 'Best service']);
});

test('an unchosen card with no tag still says Another Option', () => {
  const html = run(QUOTES, [
    feat(QUOTES[0], [], false, ''),
    feat(QUOTES[2], [], false, '   '),
  ]);
  assert.deepEqual(badges(html), ['Most Affordable', 'Another Option', 'Another Option']);
});

test('AN UNCHOSEN CARD STILL GIVES NO REASONS', () => {
  /* The tag travels to a fallback card; the bullets deliberately do not. */
  const html = run(QUOTES, [
    feat(QUOTES[0], ['should not show'], false, 'Fastest decision'),
    feat(QUOTES[2], [], false, ''),
  ]);
  assert.ok(html.includes('Fastest decision'));
  assert.ok(!html.includes('<li>'), 'a card nobody chose listed reasons');
});

test('A TAG CANNOT INJECT MARKUP', () => {
  const html = run(QUOTES, [
    feat(QUOTES[0], ['ok'], true, '<img src=x onerror="alert(1)">'),
    feat(QUOTES[2], ['ok'], true, 'fine'),
  ]);
  assert.ok(!html.includes('<img src=x'), 'a card tag injected raw markup');
  assert.ok(html.includes('&lt;img src=x'), 'the tag was not escaped');
});

test('a missing badge field is treated as no tag, not as undefined', () => {
  /* An older engine returns featured picks with no `badge` key at all. */
  const noBadge = [
    Object.assign({}, QUOTES[0], { bullets: ['x'], curated: true }),
    Object.assign({}, QUOTES[2], { bullets: ['y'], curated: true }),
  ];
  const html = run(QUOTES, noBadge);
  assert.deepEqual(badges(html), ['Most Affordable', 'Our Pick', 'Also Consider']);
  assert.ok(!html.includes('undefined'));
});

/* ---- the mapper the harness cannot reach --------------------------------- */

test('THE FEATURED MAPPER CARRIES EVERY FIELD THE CARDS READ', () => {
  /*
   * renderBest is tested above by running it. The step BEFORE it -- turning
   * the engine's response into FEATURED -- lives inside the async fetch and
   * cannot be run here, so dropping a field from it passed every test while
   * the cards silently lost it. That is the same shape as the bug that lost
   * bookProducts in the console, so it is guarded at source instead.
   */
  const i = HTML.indexOf('FEATURED = (json.featured || []).map(');
  assert.notEqual(i, -1, 'the FEATURED mapper is not where this test looks');
  const block = HTML.slice(i, HTML.indexOf('});', i));
  for (const field of ['bullets', 'curated', 'badge']) {
    assert.match(block, new RegExp(`\\b${field}:`),
      `the mapper drops ${field}, so the cards can never show it`);
  }
});

test('the cheapest card always says Most Affordable, tag or no tag', () => {
  /*
   * "Most Affordable" is a fact the engine computed, not a claim anybody
   * wrote, so the left card does not take a carrier's tag even when one
   * exists. Today a QUOTES row carries no badge at all, so this cannot
   * happen by accident -- the row here has one anyway, so the rule is pinned
   * against the day the mapper starts carrying it.
   */
  const withBadge = QUOTES.map((q) =>
    q.id === 'amge' ? { ...q, badge: 'Cheapest by miles' } : q);
  const html = run(withBadge, [
    feat(withBadge[0], ['x'], true, 'Fastest decision'),
    feat(withBadge[2], ['y'], true, 'Best service'),
  ]);
  assert.deepEqual(badges(html),
    ['Most Affordable', 'Fastest decision', 'Best service']);
  assert.ok(!html.includes('Cheapest by miles'));
});
