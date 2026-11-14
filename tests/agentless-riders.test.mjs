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

const source = cut('/* ---------- RIDERS (from the carrier', "\n  } else {\n    chosenRiders.delete(lookup);\n  }\n});");

/* ---- the carrier's answer, shaped as quote-engine returns it ------------ */

const disclosure = (lookup, name, variations = []) => ({
  lookup, name, form: 'R-I1' + lookup.slice(0, 3),
  base: `Approved paragraph for ${name}, long enough to be a real disclosure rather than a label.`,
  variations,
});
const PANEL = {
  state: 'CO', term: 'TwentyYears',
  base: { lookup: 'Base', name: 'Term Life', disclosure: disclosure('Base', 'Term Life') },
  riders: [
    { lookup: 'AccidentOnlyDisabilityIncome', name: 'Accident-Only Disability Income Rider',
      exclusiveWith: ['MonthlyDisabilityIncome'],
      disclosure: disclosure('AccidentOnlyDisabilityIncome', 'Accident-Only Disability Income Rider') },
    { lookup: 'MonthlyDisabilityIncome', name: 'Monthly Disability Income Rider',
      exclusiveWith: ['AccidentOnlyDisabilityIncome'],
      disclosure: disclosure('MonthlyDisabilityIncome', 'Monthly Disability Income Rider') },
    { lookup: 'Child', name: "Children's Term Insurance Rider", exclusiveWith: [],
      disclosure: disclosure('Child', "Children's Term Insurance Rider",
        ['In this state the rider terminates at age 26.']) },
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
  const on = {};
  riders.addEventListener = (type, fn) => { on[type] = fn; };
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

  const body = `
    let selectedTerm = TERM;
    function getInputs(){ return { state: WHERE.state }; }
    ${source}
    return { loadPanel, renderRiders, chosenRiders, read: () => panel };
  `;
  const api = new Function('document', 'window', 'fetch', 'console', 'WHERE', 'TERM', body)(
    document, window, fetchImpl, { warn() {}, error() {} }, where, term);

  return {
    ...api, riderList, riderIncluded, asked, notes, helps,
    setResponse: (fn) => { respond = fn; },
    bound: () => Object.keys(on).sort(),
    moveTo: (s2) => { where.state = s2; },
    noteOf: (lookup) => { build(); return notes.get('note-' + lookup); },
    hover(lookup) {
      build();
      on.mouseover?.({ target: helps.get(lookup) });
      return notes.get('note-' + lookup);
    },
    unhover(lookup, into = null) {
      on.mouseout?.({ target: helps.get(lookup), relatedTarget: into });
      return notes.get('note-' + lookup);
    },
    tapHelp(lookup) {
      build();
      on.click({ target: helps.get(lookup) });
      return notes.get('note-' + lookup);
    },
    click(lookup, val) {
      build();
      const tg = toggles.get(lookup);
      assert.ok(tg, `${lookup} is not on the page`);
      const btn = tg.children.find((b) => b.dataset.val === val);
      on.click({ target: btn });
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

test('and nothing clears that flag except an answer from the carrier', () => {
  /* Any assignment to it other than the safe default must come from a quote
     response. Today there is none, so the label is always up. */
  const writes = [...HTML.matchAll(/premiumIsEstimate\s*=\s*([^;]+);/g)].map((m) => m[1].trim());
  assert.deepEqual(writes, ['true'],
    `premiumIsEstimate is set to ${writes.join(', ')} — only a carrier answer may clear it`);
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
  assert.deepEqual(s.bound(), ['click'],
    'hover listeners were bound on a device that cannot hover');
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
