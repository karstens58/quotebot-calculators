/**
 * The agentless page's rider panel, tested against THE REAL source cut out of
 * preview/agentlessquote.html.
 *
 * The thing this page must never do is offer a rider on its own authority.
 * Assurity do not write the same riders in every state, the wording they have
 * approved varies by state too, and this repository is public — so the list
 * and the words both come from GET /assurity-panel and neither is typed here.
 * The failures that matter are therefore: a hardcoded list creeping back; a
 * refusal falling back to one; carrier text appearing in this repo; a "?" over
 * nothing; an applicant selecting two disability riders the carrier will not
 * write together; and a slow answer for Colorado landing after the visitor has
 * moved to Florida.
 *
 *   node --test tests/agentless-riders.test.mjs
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const HTML = readFileSync(new URL('../site/agentlessquote.html', import.meta.url), 'utf8');

function cut(start, endMarker) {
  const i = HTML.indexOf(start);
  assert.notEqual(i, -1, `could not find ${start}`);
  const j = HTML.indexOf(endMarker, i + start.length);
  assert.notEqual(j, -1, `could not find the end of ${start}`);
  return HTML.slice(i, j + endMarker.length);
}

/* The rider section, from the panel client through to the Apply handler.
   The end marker is the last line of that handler; if it moves, this throws
   rather than silently testing half a feature. */
const source = cut('/* ---------- RIDERS (from the carrier',
  '  clearTimeout(priceTimer);\n  invalidatePrice();\n  priceNow();\n});');

/* ---- the carrier's answer, shaped as quote-engine returns it ------------ */

const disclosure = (lookup, name, variations = []) => ({
  lookup, name, form: 'R-I1' + lookup.slice(0, 3),
  base: `Approved paragraph for ${name}, long enough to be a real disclosure rather than a label.`,
  variations,
});
const PANEL = {
  state: 'CO', term: 'TwentyYears',
  base: { lookup: 'Base', name: 'Term Life', disclosure: disclosure('Base', 'Term Life') },
  /* Amounts and needsOccupation exactly as the route returns them for
     Colorado: $100 increments on the disability riders, $1,000 on Child,
     and our own $20,000 floor on Critical Illness over the carrier's
     $10,000. */
  riders: [
    { lookup: 'AccidentOnlyDisabilityIncome', name: 'Accident-Only Disability Income Rider',
      exclusiveWith: ['MonthlyDisabilityIncome'], needsOccupation: true,
      amount: { minimum: 300, maximum: 3000, increment: 100 },
      disclosure: disclosure('AccidentOnlyDisabilityIncome', 'Accident-Only Disability Income Rider') },
    { lookup: 'MonthlyDisabilityIncome', name: 'Monthly Disability Income Rider',
      exclusiveWith: ['AccidentOnlyDisabilityIncome'], needsOccupation: true,
      amount: { minimum: 300, maximum: 3000, increment: 100 },
      disclosure: disclosure('MonthlyDisabilityIncome', 'Monthly Disability Income Rider') },
    { lookup: 'Child', name: "Children's Term Insurance Rider", exclusiveWith: [],
      needsOccupation: false, amount: { minimum: 1000, maximum: 25000, increment: 1000 },
      disclosure: disclosure('Child', "Children's Term Insurance Rider",
        ['In this state the rider terminates at age 26.']) },
    { lookup: 'CriticalIllnessBenefit', name: 'Critical Illness Benefit Rider',
      exclusiveWith: [], needsOccupation: false,
      amount: { minimum: 20000, maximum: 100000, increment: 1 },
      amountFloor: { minimum: 20000, source: 'Term Life Product Guide', why: 'the product is not written below it' },
      disclosure: disclosure('CriticalIllnessBenefit', 'Critical Illness Benefit Rider') },
    { lookup: 'WaiverOfPremium', name: 'Disability Waiver of Premium Rider',
      exclusiveWith: [], needsOccupation: false,
      disclosure: disclosure('WaiverOfPremium', 'Disability Waiver of Premium Rider') },
  ],
  included: [
    { lookup: 'AcceleratedBenefits', name: 'Accelerated Benefits Rider',
      disclosure: disclosure('AcceleratedBenefits', 'Accelerated Benefits Rider') },
  ],
};

/* ---- a DOM small enough to read, built from what the page actually wrote - */

function el(tag = 'div') {
  const classes = new Set();
  const attrs = {};
  return {
    tag, dataset: {}, hidden: false, innerHTML: '', attrs, children: [], parent: null,
    classList: {
      add: (c) => classes.add(c), remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c),
      toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)),
    },
    has: (c) => classes.has(c),
    setAttribute(k, v) { attrs[k] = String(v); },
    getAttribute(k) { return k in attrs ? attrs[k] : null; },
    hasAttribute(k) { return k in attrs; },
    removeAttribute(k) { delete attrs[k]; },
    contains(n) { return n === this || this.children.includes(n); },
    querySelector(sel) {
      return this.children.find((c) => c.sel === sel) ?? null;
    },
    querySelectorAll() { return this.children; },
    /*
     * Selector-aware on purpose. A closest() that answered "yes" to anything
     * made every click on a Yes/No button look like a click on the "?", and
     * the exclusivity test passed while testing nothing.
     */
    closest(sel) {
      let n = this;
      while (n) { if (n.sel === sel) return n; n = n.parent; }
      return null;
    },
  };
}

function sandbox({ state = 'Colorado', term = 20, pointer = 'fine' } = {}) {
  const where = { state };
  const riderList = el(), riderIncluded = el();

  /* The panel: one element, several listeners now (hover opens, tap pins),
     so they are kept by type rather than overwriting one another. */
  const riders = el();
  riders.sel = '.cov-riders';
  /* A LIST PER TYPE, not one handler. The page registers two click
     listeners on this panel -- one for the disclosure and the toggles, one
     for the rider fields and Apply -- and a stub that kept only the last
     silently unbound the first, which read as the toggles being broken. */
  const on = {};
  riders.addEventListener = (type, fn) => { (on[type] ??= []).push(fn); };
  const fire = (type, ev) => (on[type] ?? []).forEach((fn) => fn(ev));
  const notes = new Map();
  const helps = new Map();
  const toggles = new Map();
  riders.querySelectorAll = (sel) => (sel === '.rider-note'
    ? [...notes.values()]
    : sel === '.rider-help' ? [...helps.values()] : []);

  /*
   * The elements under test are derived from the markup renderRiders WROTE,
   * not hand-built here, so an assertion about them is an assertion about
   * the page rather than about this file.
   */
  /* Rebuilt only when the page has re-rendered. Rebuilding on every
     interaction threw away state the page had just set -- a pinned
     disclosure vanished between a tap and the next hover, and the test
     that caught it looked like a bug in the page. */
  let builtFrom = null;
  const build = () => {
    const html = riderList.innerHTML + riderIncluded.innerHTML;
    if (html === builtFrom) return;
    builtFrom = html;
    notes.clear(); helps.clear(); toggles.clear();
    for (const m of html.matchAll(/data-note="([^"]*)"/g)) {
      const lookup = m[1];
      const item = el(); item.sel = '.rider-item';
      const help = el('button'); help.sel = '.rider-help';
      help.dataset.note = lookup; help.parent = item;
      const note = el(); note.sel = '.rider-note'; note.hidden = true; note.parent = item;
      item.children.push(help, note);
      helps.set(lookup, help); notes.set('note-' + lookup, note);
    }
    const re = /<div class="rider-toggle" data-rider="([^"]*)"\s*\n?\s*data-exclusive="([^"]*)">([\s\S]*?)<\/div>/g;
    let m;
    while ((m = re.exec(riderList.innerHTML))) {
      const tg = el(); tg.sel = '.rider-toggle';
      tg.dataset.rider = m[1]; tg.dataset.exclusive = m[2];
      for (const b of m[3].matchAll(/data-val="(yes|no)"([^>]*)/g)) {
        const btn = el('button'); btn.sel = '.rider-toggle button';
        btn.dataset.val = b[1]; btn.parent = tg;
        if (b[2].includes('class="active"')) btn.classList.add('active');
        tg.children.push(btn);
      }
      toggles.set(m[1], tg);
    }
  };

  const document = {
    getElementById: (id) => (id === 'riderList' ? riderList
      : id === 'riderIncluded' ? riderIncluded
      : notes.get(id) || null),
    querySelector: (sel) => {
      if (sel === '.cov-riders') return riders;
      const m = /^\.rider-toggle\[data-rider="(.+)"\]$/.exec(sel);
      return m ? toggles.get(m[1]) || null : null;
    },
  };

  const asked = [];
  let respond = async () => ({ ok: true, status: 200, headers: new Map(),
    json: async () => ({ panel: PANEL }) });
  const fetchImpl = (url) => { asked.push(String(url)); return respond(String(url)); };

  const window = {
    QB_QUOTE_ENDPOINT: 'https://engine.example/quote/',
    /* What the page asks before binding hover at all. */
    matchMedia: (q) => ({ matches: pointer === 'fine' && /hover: hover/.test(q) }),
  };

  /* The rest of the page, as far as this section can see it. Each of these
     is a real thing defined elsewhere in agentlessquote.html; stubbed here
     so the section under test can be exercised on its own, and recorded so
     a test can assert what it asked for. */
  const priced = [];
  const body = `
    let selectedTerm = TERM;
    let premiumIsEstimate = true, currentQuote = null, currentUnderwriting = null;
    let sliderIndex = 6;
    const COV_STOPS = [275000,300000,325000,350000,400000,450000,500000,550000,600000,650000,700000,750000,800000];
    function getInputs(){ return { state: WHERE.state, age: 48, gender: 'Male',
      health: 'Standard', tobacco: 'No' }; }
    function renderPrice(){ RECORD.push(['renderPrice', premiumIsEstimate]); }
    function renderTermCards(){}
    ${source}
    return { loadPanel, renderRiders, chosenRiders, riderAmounts, occupation,
             buildAsk, settleAmount, priceNow, PRICED,
             state: () => ({ premiumIsEstimate, currentQuote, currentUnderwriting }),
             read: () => panel };
  `;
  const api = new Function('document', 'window', 'fetch', 'console', 'WHERE', 'TERM',
    'RECORD', 'setTimeout', 'clearTimeout', body)(
    document, window, fetchImpl, { warn() {}, error() {} }, where, term, priced,
    /* Synchronous, so a debounce is not a sleep in a test. */
    (fn) => { priced.push(['scheduled']); return fn; }, () => {});

  return {
    ...api, riderList, riderIncluded, asked, notes, helps, priced,
    setResponse: (fn) => { respond = fn; },
    bound: () => Object.keys(on).sort(),
    fire,
    moveTo: (s2) => { where.state = s2; },
    noteOf: (lookup) => { build(); return notes.get('note-' + lookup); },
    hover(lookup) {
      build();
      fire('mouseover', { target: helps.get(lookup) });
      return notes.get('note-' + lookup);
    },
    unhover(lookup, into = null) {
      fire('mouseout', { target: helps.get(lookup), relatedTarget: into });
      return notes.get('note-' + lookup);
    },
    tapHelp(lookup) {
      build();
      fire('click', { target: helps.get(lookup) });
      return notes.get('note-' + lookup);
    },
    click(lookup, val) {
      build();
      const tg = toggles.get(lookup);
      assert.ok(tg, `${lookup} is not on the page`);
      const btn = tg.children.find((b) => b.dataset.val === val);
      fire('click', { target: btn });
      return toggles;
    },
  };
}

/* ---- the list and the words are the carrier's -------------------------- */

test('THE RIDERS AND THEIR WORDS COME FROM THE CARRIER, NOT FROM THIS FILE', async () => {
  const s = sandbox();
  await s.loadPanel();

  assert.equal(s.asked.length, 1);
  assert.match(s.asked[0], /\/assurity-panel\?state=CO&term=TwentyYears$/,
    'the route was asked for the wrong state or term');

  const escaped = (v) => v.replace(/&/g, '&amp;').replace(/'/g, '&#39;');
  for (const r of PANEL.riders) {
    assert.ok(s.riderList.innerHTML.includes(escaped(r.name)), `${r.name} is not on the page`);
    assert.ok(s.riderList.innerHTML.includes(escaped(r.disclosure.base)),
      `${r.name} has a "?" over nothing`);
  }
  assert.ok(s.riderList.innerHTML.includes('In Colorado:'),
    "a state's own variation was not set off from the general text");
});

test('A HARDCODED RIDER LIST HAS NOT CREPT BACK IN', () => {
  /* The exact failure this wiring removed: five rider names typed into a
     public repository, right in Colorado and quietly wrong elsewhere. */
  assert.doesNotMatch(HTML, /const RIDERS\s*=/);
  for (const name of ['Critical Illness Rider', 'Disability Waiver of Premium Rider',
    "Children's Term Insurance Rider", 'Accident-Only Disability Income']) {
    assert.ok(!HTML.includes(name),
      `${name} is still typed into the page; it must come from the panel`);
  }
});

test('and no approved carrier wording is stored here either', () => {
  /* quotebot-backend holds one digest-verified copy. A second copy in this
     repository would have nothing checking it had not drifted. */
  assert.doesNotMatch(HTML, /Accelerated Benefits Rider[^<"]{40,}/);
  assert.doesNotMatch(HTML, /\bwe will pay\b|\bthe insured\b/i);
});

test('A DISCLOSURE STARTS CLOSED, AND THE STYLESHEET LETS IT', () => {
  /*
   * A source-level guard for a cascade bug, which is the honest description
   * of what it is. `.rider-note` sets `display: flex`, and an author's
   * display rule outranks the browser's own `[hidden] { display: none }` --
   * so the markup said hidden, the attribute toggled correctly, and every
   * disclosure sat open anyway with the "?" doing nothing visible. A stubbed
   * DOM resolves no cascade and can never catch this; a real browser did.
   */
  assert.match(HTML, /\.rider-note\[hidden\]\s*\{[^}]*display:\s*none/,
    '.rider-note sets display, so it needs its own [hidden] rule or it never hides');
  assert.match(HTML, /class="rider-note" id="note-\$\{esc\(d\.lookup\)\}" hidden/,
    'the disclosure is rendered open');
});

test('the free benefit is shown, described, and cannot be switched off', async () => {
  const s = sandbox();
  await s.loadPanel();
  assert.equal(s.riderIncluded.hidden, false);
  assert.ok(s.riderIncluded.innerHTML.includes('Accelerated Benefits Rider'));
  assert.ok(s.riderIncluded.innerHTML.includes(PANEL.included[0].disclosure.base
    .replace(/&/g, '&amp;').replace(/'/g, '&#39;')),
    'the included benefit has a "?" over nothing');
  assert.ok(!s.riderIncluded.innerHTML.includes('rider-toggle'),
    'a benefit nobody chooses was given a Yes/No');
});

/* ---- refusing ---------------------------------------------------------- */

for (const [name, reply] of [
  ['a 502 — they offer something we have no approved words for',
    async () => ({ ok: false, status: 502, json: async () => ({ undescribed: ['LongTermCare'] }) })],
  ['a 503 — the integration is not configured',
    async () => ({ ok: false, status: 503, json: async () => ({ error: 'not configured' }) })],
  ['the network is simply gone', async () => { throw new Error('offline'); }],
]) {
  test(`NOTHING IS OFFERED WHEN ${name}`, async () => {
    const s = sandbox();
    s.setResponse(reply);
    await s.loadPanel();

    assert.equal(s.read(), null);
    assert.ok(!s.riderList.innerHTML.includes('rider-toggle'),
      'a rider was offered without the carrier saying it is available');
    assert.ok(s.riderList.innerHTML.includes("aren't available to show right now"),
      'the visitor was given a blank space instead of a sentence');
    assert.ok(!s.riderList.innerHTML.includes('Critical Illness'),
      'the page fell back to a list of its own');
    assert.equal(s.riderIncluded.hidden, true);
  });
}

test('A REFUSAL AFTER A GOOD ANSWER CLEARS WHAT WAS THERE', async () => {
  /*
   * THE FAILURE THIS CATCHES IS THE WHOLE POINT OF QBP-562. A visitor loads
   * Colorado, sees its riders, then switches to New York -- where Assurity's
   * wording is not approved and the route refuses. Keeping the last good
   * panel leaves Colorado's riders, and Colorado's approved words, sitting
   * under a New York quote: a complete-looking disclosure for the wrong
   * state, which is worse than no riders at all.
   *
   * Every other refusal test here refuses on the FIRST call, when there is
   * nothing to keep -- so they all passed while this held stale carrier
   * wording on screen. A mutation found it; the tests had not.
   */
  const s = sandbox();
  await s.loadPanel();
  assert.equal(s.read().state, 'CO');

  s.moveTo('New York');
  s.setResponse(async () => ({ ok: false, status: 502,
    json: async () => ({ error: 'no approved description', undescribed: ['Base'] }) }));
  await s.loadPanel();

  assert.equal(s.read(), null, "the refused state kept the previous state's panel");
  assert.ok(!s.riderList.innerHTML.includes('Disability'),
    "Colorado's riders are still on screen under a New York quote");
  assert.ok(s.riderList.innerHTML.includes("aren't available to show right now"));
  assert.equal(s.riderIncluded.hidden, true);
});

test('an unconfigured endpoint asks nobody and offers nothing', async () => {
  const s = sandbox();
  /* The preview convention: no endpoint means no call, not a guess. */
  const api = new Function('document', 'window', 'fetch', 'console', 'STATE', 'TERM',
    `let selectedTerm = TERM; function getInputs(){ return { state: STATE }; }
     ${source}
     return { loadPanel, read: () => panel };`)(
    { getElementById: () => ({ innerHTML: '', hidden: false }),
      querySelector: () => ({ addEventListener() {}, querySelectorAll: () => [] }) },
    { QB_QUOTE_ENDPOINT: '', matchMedia: () => ({ matches: false }) },
    () => { throw new Error('must not be called'); },
    { warn() {} }, 'Colorado', 20);
  await api.loadPanel();
  assert.equal(api.read(), null);
});

/* ---- the carrier's own rules ------------------------------------------- */

test('ONE DISABILITY RIDER PER POLICY — TURNING ONE ON TURNS THE OTHER OFF', async () => {
  const s = sandbox();
  await s.loadPanel();

  s.click('MonthlyDisabilityIncome', 'yes');
  assert.ok(s.chosenRiders.has('MonthlyDisabilityIncome'));

  const toggles = s.click('AccidentOnlyDisabilityIncome', 'yes');
  assert.ok(s.chosenRiders.has('AccidentOnlyDisabilityIncome'));
  assert.ok(!s.chosenRiders.has('MonthlyDisabilityIncome'),
    'the applicant now holds two disability riders Assurity will not write together');

  const other = toggles.get('MonthlyDisabilityIncome');
  assert.ok(other.children.find((b) => b.dataset.val === 'no').has('active'),
    'the other rider was dropped silently — the page still shows it switched on');
});

test('a rider with no exclusions leaves the others alone', async () => {
  const s = sandbox();
  await s.loadPanel();
  s.click('MonthlyDisabilityIncome', 'yes');
  s.click('Child', 'yes');
  assert.deepEqual([...s.chosenRiders].sort(), ['Child', 'MonthlyDisabilityIncome']);
});

/* ---- answers arriving out of order ------------------------------------- */

test('A SLOW ANSWER FOR ONE STATE CANNOT LAND ON TOP OF A NEWER ONE', async () => {
  /* A visitor who changes state while the first answer is still in flight.
     Without the sequence guard, Colorado's riders land after Florida's and
     the page offers riders for the state the visitor just left. */
  const s = sandbox();
  let release;
  const held = new Promise((r) => { release = r; });
  s.setResponse(async (url) => {
    const code = /state=([A-Z]{2})/.exec(url)[1];
    if (code === 'CO') await held;
    return { ok: true, status: 200,
      json: async () => ({ panel: { ...PANEL, state: code } }) };
  });

  const slow = s.loadPanel();            // Colorado, held open
  s.moveTo('Florida');
  await s.loadPanel();                   // Florida, answers first
  assert.equal(s.read().state, 'FL');

  release();
  await slow;
  assert.equal(s.read().state, 'FL',
    "Colorado's late answer overwrote the state the visitor had moved to");
  assert.deepEqual(s.asked.map((u) => /state=([A-Z]{2})/.exec(u)[1]), ['CO', 'FL']);
});

test('the state the visitor picks is the state that is asked for', async () => {
  const s = sandbox({ state: 'Florida', term: 30 });
  await s.loadPanel();
  assert.match(s.asked[0], /state=FL&term=ThirtyYears$/);
});

test('asking twice for the same state and term does not ask twice', async () => {
  const s = sandbox();
  await s.loadPanel();
  await s.loadPanel();
  assert.equal(s.asked.length, 1);
});

/* ---- carrier text is text, not markup ---------------------------------- */

test('carrier text is escaped, never injected', async () => {
  const s = sandbox();
  s.setResponse(async () => ({ ok: true, status: 200, json: async () => ({
    panel: { ...PANEL, included: [], riders: [{
      lookup: 'X', name: '<img src=x onerror=alert(1)>', exclusiveWith: [],
      disclosure: { lookup: 'X', name: 'X', form: 'F', base: '<script>bad()</script>', variations: [] },
    }] } }) }));
  await s.loadPanel();
  assert.ok(!s.riderList.innerHTML.includes('<img'), 'markup from the wire reached the DOM');
  assert.ok(!s.riderList.innerHTML.includes('<script'), 'markup from the wire reached the DOM');
  assert.ok(s.riderList.innerHTML.includes('&lt;img'));
});

/* ---- the price is not the carrier's yet -------------------------------- */

test('THE PRICE IS MARKED AN ESTIMATE UNTIL A CARRIER HAS ANSWERED', () => {
  /*
   * The figure on this page comes from a hand-calibrated table, not from
   * Assurity. It went live unlabelled for one deploy, looking exactly like a
   * quote -- which is how it was mistaken for one.
   *
   * The flag defaults TRUE and only a carrier answer may clear it, so a
   * refusal, an outage or an unpriceable state all leave the label up
   * without anyone handling those cases. "Estimates" is the claim that can
   * always be defended.
   */
  assert.match(HTML, /let premiumIsEstimate = true;/,
    'the estimate flag does not default to the safe side');
  assert.match(HTML, /id="priceEstimate"/, 'the price carries no estimate note');
  assert.match(HTML, /Estimate only[^<]*not a price from Assurity/,
    'the note does not say whose price it is not');
  assert.match(HTML, /priceEstimate'\)\.hidden = !premiumIsEstimate/,
    'the note is not driven by the flag, so the two can disagree');
});

test('AND ONLY ONE PLACE IN THE PAGE MAY CLEAR IT', () => {
  /*
   * This test was written while nothing cleared the flag at all, so that
   * the first assignment would have to be justified rather than just
   * appear. Here is the justification.
   *
   * There is exactly ONE `= false`, and it sits in applyQuote -- the
   * function reached only with a parsed carrier answer in hand. Every other
   * assignment sets it back to true: the default, and each way a price can
   * fail. A second `= false` somewhere else is how this page starts
   * presenting a figure as the carrier's that the carrier never sent, so
   * the count is asserted rather than the intent.
   */
  const writes = [...HTML.matchAll(/premiumIsEstimate\s*=\s*(true|false)\s*;/g)].map((m) => m[1]);
  assert.equal(writes.filter((w) => w === 'false').length, 1,
    `${writes.filter((w) => w === 'false').length} places clear the estimate flag; only applyQuote may`);
  assert.ok(writes.filter((w) => w === 'true').length >= 3,
    'the failure paths do not put the estimate label back');

  const applyQuote = /function applyQuote\(data\)\{?[\s\S]*?\n\}/.exec(HTML);
  assert.ok(applyQuote, 'applyQuote has been renamed — re-read this test');
  assert.match(applyQuote[0], /premiumIsEstimate = false;/,
    'the one clearing assignment is not in applyQuote');
  assert.match(applyQuote[0], /currentQuote = data\.quote/,
    'applyQuote clears the flag without a carrier quote in hand');
});

test('EVERY WAY A PRICE CAN FAIL PUTS THE LABEL BACK', () => {
  /*
   * The half that gets forgotten. A refused quote, an unreachable engine, a
   * deployment not allowed to show rates, or simply not enough entered yet
   * -- each must return to the estimate, because the figure still on screen
   * came from our own table.
   */
  for (const path of [
    /if \(!res\.ok \|\| !data\.quote\)\{[\s\S]*?premiumIsEstimate = true;/,
    /catch \(err\) \{[\s\S]*?premiumIsEstimate = true;/,
    /function invalidatePrice\(\)\{[\s\S]*?premiumIsEstimate = true;/,
  ]) assert.match(HTML, path, 'a failure path leaves the carrier label on our own number');
});

test('AND ANY CHANGE TO THE ASK INVALIDATES THE PRICE', () => {
  /*
   * Assurity's premium for $500,000 is not their premium for $550,000.
   * Leaving the old figure up while the slider moves is the most believable
   * wrong number this page could show, so every input that feeds the ask
   * goes through the debounced re-price, which invalidates first.
   */
  assert.match(HTML, /function pricePresently\(\)\{\s*\n\s*invalidatePrice\(\);/,
    'the debounced re-price does not invalidate before it waits');
});

/* ---- opening the disclosure ------------------------------------------- */

test('WITH A POINTER, HOVERING THE "?" OPENS IT', async () => {
  const s = sandbox({ pointer: 'fine' });
  await s.loadPanel();
  assert.ok(s.hover('Child').hidden === false, 'hover did not open the disclosure');
  assert.equal(s.helps.get('Child').getAttribute('aria-expanded'), 'true');
});

test('and leaving the row closes it again', async () => {
  const s = sandbox({ pointer: 'fine' });
  await s.loadPanel();
  s.hover('Child');
  assert.equal(s.unhover('Child').hidden, true);
});

test('BUT MOVING INTO THE BUBBLE IS NOT LEAVING', async () => {
  /*
   * The bubble sits INSIDE the row it belongs to, so the pointer entering
   * it is still inside .rider-item. Without this, the disclosure closes the
   * instant you move towards it — which, on a paragraph of carrier wording,
   * means it can be seen and never read.
   */
  const s = sandbox({ pointer: 'fine' });
  await s.loadPanel();
  const note = s.hover('Child');
  assert.equal(s.unhover('Child', note).hidden, false,
    'the disclosure closed as the pointer moved into it');
});

test('A CLICK PINS IT, SO IT SURVIVES THE POINTER WANDERING OFF', async () => {
  /* Nobody reads a paragraph holding the mouse still. */
  const s = sandbox({ pointer: 'fine' });
  await s.loadPanel();
  s.tapHelp('Child');
  assert.equal(s.unhover('Child').hidden, false, 'a pinned disclosure was closed by a mouseout');
  s.tapHelp('Child');
  assert.equal(s.noteOf('Child').hidden, true, 'a second click did not close it');
});

test('ON A TOUCH SCREEN NOTHING IS BOUND TO HOVER AT ALL', async () => {
  /*
   * THE REASON THE DISCLOSURE IS NOT A TOOLTIP. A phone has no hover, and
   * what sits behind the "?" is Assurity's approved rider wording — the one
   * thing on this page that may never be unreachable. The floating
   * treatment is presentation over an element a tap opens; the listeners
   * that drive it are not even registered where there is no pointer.
   */
  const s = sandbox({ pointer: 'coarse' });
  await s.loadPanel();
  /* Named rather than listed in full: the panel also binds click and input
     for the rider fields, and asserting the whole set would fail the next
     time something unrelated is bound. What must never appear is hover. */
  assert.deepEqual(s.bound().filter((t) => t.startsWith('mouse')), [],
    'hover listeners were bound on a device that cannot hover');
  assert.ok(s.bound().includes('click'), 'nothing is bound to click either');
  assert.equal(s.tapHelp('Child').hidden, false, 'a tap did not open the disclosure');
});

test('only one disclosure is open at a time', async () => {
  /* They float over the rows beneath them, so two open at once overlap. */
  const s = sandbox({ pointer: 'fine' });
  await s.loadPanel();
  s.tapHelp('Child');
  s.hover('MonthlyDisabilityIncome');
  assert.equal(s.noteOf('Child').hidden, true);
  assert.equal(s.noteOf('MonthlyDisabilityIncome').hidden, false);
});

test('the floating treatment is fenced behind a fine pointer in CSS too', () => {
  /* The listeners are fenced in JS; the positioning has to be fenced in the
     stylesheet, or a touch screen gets an absolutely-positioned panel it
     cannot scroll to. */
  const fenced = /@media \(hover: hover\) and \(pointer: fine\) \{[\s\S]*?\.rider-note \{[^}]*position: absolute/;
  assert.match(HTML, fenced,
    'the bubble positioning is not inside a fine-pointer media query');
});

/* ---- the fields a rider opens ------------------------------------------ */

test('A RIDER WITH AN AMOUNT OPENS A FIELD FOR IT, BOUNDED BY THE CARRIER', async () => {
  const s = sandbox();
  await s.loadPanel();
  const html = s.riderList.innerHTML;
  assert.ok(html.includes('id="fields-Child"'), "Children's Term has no fields");
  assert.match(html, /\$1,000 to \$25,000, in \$1,000 steps/,
    'the field does not say what the carrier will accept');
  /* Hidden until the rider is switched on. */
  assert.match(html, /id="fields-Child"[^>]*\shidden/);
});

test('AN ON-OR-OFF RIDER OPENS NO FIELDS AT ALL', async () => {
  /* Waiver of Premium carries no BenefitAmount, so there is nothing to fill
     in and a panel with only a button in it would be ceremony. */
  const s = sandbox();
  await s.loadPanel();
  assert.ok(!s.riderList.innerHTML.includes('id="fields-WaiverOfPremium"'));
});

test('OUR STRICTER MINIMUM IS SHOWN AS OURS, NOT AS THE CARRIER’S', async () => {
  /*
   * /options returns a Critical Illness minimum of 10,000 and the quote
   * service prices it. The product is written from 20,000. Saying so is the
   * difference between a visitor understanding a limit and discovering it at
   * underwriting.
   */
  const s = sandbox();
  await s.loadPanel();
  const html = s.riderList.innerHTML;
  assert.match(html, /Our minimum is \$20,000/);
  assert.match(html, /refused at underwriting/);
});

test('ONLY THE RIDERS THAT NEED AN INCOME ASK FOR ONE', async () => {
  /* And the page does not decide which those are -- the panel says. */
  const s = sandbox();
  await s.loadPanel();
  const block = (l) => {
    const i = s.riderList.innerHTML.indexOf('id="fields-' + l + '"');
    return i === -1 ? '' : s.riderList.innerHTML.slice(i, i + 2200);
  };
  assert.match(block('MonthlyDisabilityIncome'), /Gross monthly income/);
  assert.match(block('MonthlyDisabilityIncome'), /Railroad worker/);
  assert.doesNotMatch(block('Child'), /Gross monthly income/,
    "a visitor was asked their salary to price their children's rider");
  assert.doesNotMatch(block('CriticalIllnessBenefit'), /Gross monthly income/);
});

/* ---- what Apply sends -------------------------------------------------- */

test('AN AMOUNT IS ROUNDED DOWN TO THE CARRIER’S INCREMENT, NEVER UP', () => {
  /*
   * Every limit on these riders is a ceiling, so down is the only direction
   * that cannot breach one. Assurity refuse an off-increment amount rather
   * than tidying it, so this is what stops a visitor being refused for
   * typing a round number.
   */
  const s = sandbox();
  s.read?.();
  const settle = s.settleAmount;
  /* The panel has to be loaded for the ranges to exist. */
  return (async () => {
    await s.loadPanel();
    assert.equal(s.settleAmount('MonthlyDisabilityIncome', '1,250'), 1200);
    assert.equal(s.settleAmount('MonthlyDisabilityIncome', '1,200'), 1200,
      'an amount already on an increment is kept');
    assert.equal(s.settleAmount('MonthlyDisabilityIncome', '99,999'), 3000,
      'above the carrier maximum is the maximum, not a refusal');
    assert.equal(s.settleAmount('MonthlyDisabilityIncome', '50'), 300,
      'below the minimum is the minimum');
    assert.equal(s.settleAmount('CriticalIllnessBenefit', '15,000'), 20000,
      'our floor holds, not the carrier’s 10,000');
    assert.equal(s.settleAmount('Child', 'abc'), null);
  })();
});

test('NOTHING IS PRICED UNTIL THERE IS ENOUGH TO ASK WITH', async () => {
  const s = sandbox({ state: 'Colorado' });
  await s.loadPanel();
  s.chosenRiders.add('MonthlyDisabilityIncome');
  /* A disability rider with no income yet: the ask cannot be built, and the
     carrier would answer 400 "'Occupation' must not be empty". */
  assert.equal(s.buildAsk(), null);
  s.occupation.grossMonthlyIncome = 6000;
  s.riderAmounts.set('MonthlyDisabilityIncome', 1500);
  const ask = s.buildAsk();
  assert.ok(ask, 'an ask that had everything was still refused');
  assert.deepEqual(ask.riders, [{ lookup: 'MonthlyDisabilityIncome', amount: 1500 }]);
  assert.equal(ask.occupation.grossMonthlyIncome, 6000);
});

test('and occupation is not sent for a rider that does not need it', async () => {
  const s = sandbox();
  await s.loadPanel();
  s.chosenRiders.add('Child');
  s.riderAmounts.set('Child', 10000);
  s.occupation.grossMonthlyIncome = 6000;      // left over from looking at a disability rider
  assert.equal(s.buildAsk().occupation, undefined,
    'a visitor’s salary was sent to price their children’s rider');
});

test('AN EXACT REPEAT COSTS NO CARRIER REQUEST', async () => {
  const s = sandbox();
  await s.loadPanel();
  const before = s.asked.length;
  s.setResponse(async () => ({ ok: true, status: 200, headers: new Map(),
    json: async () => ({ quote: { total: { Monthly: 185.49, Annual: 2132 }, coverages: [] },
      underwriting: { riskClass: 'StandardNonTobacco', approximated: false } }) }));
  await s.priceNow();
  const after = s.asked.length;
  assert.equal(after - before, 1);
  await s.priceNow();
  assert.equal(s.asked.length, after, 'the same ask was sent to the carrier twice');
  assert.equal(s.state().premiumIsEstimate, false, 'a carrier answer did not clear the label');
});

test('A REFUSAL AFTER A GOOD PRICE PUTS THE LABEL BACK', async () => {
  /*
   * THE ONLY VERSION OF THIS TEST THAT BITES. Refusing on the first ask
   * proves nothing: the label is already up and removing the assignment
   * that restores it changes no outcome — a mutation walked straight
   * through the first version of this test.
   *
   * The case that matters is a visitor who HAS a carrier price on screen,
   * changes something, and is refused. The figure showing is now ours
   * again, and must say so.
   */
  const s = sandbox();
  await s.loadPanel();
  s.setResponse(async () => ({ ok: true, status: 200, headers: new Map(),
    json: async () => ({ quote: { total: { Monthly: 185.49, Annual: 2132 }, coverages: [] },
      underwriting: { riskClass: 'StandardNonTobacco', approximated: false } }) }));
  await s.priceNow();
  assert.equal(s.state().premiumIsEstimate, false, 'nothing was priced to begin with');

  s.riderAmounts.set('Child', 10000);
  s.chosenRiders.add('Child');            // a different ask, so past the cache
  s.setResponse(async () => ({ ok: false, status: 422, headers: new Map(),
    json: async () => ({ error: 'the carrier did not price this quote',
      problems: [{ field: 'PrimaryInsured.Person.Occupation',
        message: "'Occupation' must not be empty." }] }) }));
  await s.priceNow();

  assert.equal(s.state().premiumIsEstimate, true,
    'a refused quote left the carrier label on our own number');
});

test('AND A DEPLOYMENT THAT MAY NOT SHOW RATES SAYS NOTHING TO THE VISITOR', async () => {
  /* A 403 is ours — the display approval — and not something a visitor can
     act on or should be shown a carrier error about. */
  const s = sandbox();
  await s.loadPanel();
  s.setResponse(async () => ({ ok: false, status: 403, headers: new Map(),
    json: async () => ({ error: 'not approved', reason: 'display-not-approved' }) }));
  await s.priceNow();
  assert.equal(s.state().premiumIsEstimate, true);
  assert.match(HTML, /res\.status === 403\s*\n?\s*\? null/,
    'a 403 is shown to the visitor as a carrier problem');
});

test('NO id IS RENDERED TWICE IN THE PANEL', async () => {
  /*
   * Both disability riders render their own copy of the income and
   * employment fields, and an unscoped `id="income"` therefore appeared
   * twice in the document. getElementById returns the first, a <label for>
   * resolves to whichever it finds, and the field a visitor can see need
   * not be the one being read — a real browser refused to type into it.
   * Only one of the two riders can ever be chosen; both are in the DOM.
   */
  const s = sandbox();
  await s.loadPanel();
  const ids = [...(s.riderList.innerHTML + s.riderIncluded.innerHTML)
    .matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const seen = new Set();
  const twice = ids.filter((id) => (seen.has(id) ? true : (seen.add(id), false)));
  assert.deepEqual([...new Set(twice)], [], `rendered more than once: ${[...new Set(twice)].join(', ')}`);
});

test('and every label points at a field that exists', async () => {
  const s = sandbox();
  await s.loadPanel();
  const html = s.riderList.innerHTML + s.riderIncluded.innerHTML;
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  for (const m of html.matchAll(/<label for="([^"]+)"/g)) {
    assert.ok(ids.has(m[1]), `a label points at "${m[1]}", which is not in the panel`);
  }
});
