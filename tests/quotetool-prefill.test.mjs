/**
 * The query-string prefill, tested against THE REAL block cut out of
 * site/quotetool.html.
 *
 * The hero form on quote-bot.com/life-insurance/ asks for date of birth,
 * gender, coverage, term and health, and hands them over in the url. Before
 * this existed the visitor typed all five again, because the button opened
 * this page with nothing attached.
 *
 * What can still go wrong, and is what this covers:
 *
 *   - the date arriving as 01/15/1980. The field is <input type="date">,
 *     which takes YYYY-MM-DD and nothing else: hand it the American shape and
 *     it stays empty, showing the visitor a blank birth date and no error.
 *     This is the bug the browser caught and a source review would not have.
 *   - the term matched against the option's value rather than its text. Twenty
 *     years is option "5" here; matching on that puts an internal id in a
 *     public url and breaks the day the ids are renumbered.
 *   - a value that is not on offer being assigned anyway. A <select> set to a
 *     string none of its options carry goes silently empty, which looks to the
 *     visitor exactly like a field they forgot — so an unknown value has to be
 *     ignored and the field left alone.
 *   - an impossible or future birth date being accepted.
 *   - the answers staying in the address bar after they are in the form.
 *
 *   node --test tests/quotetool-prefill.test.mjs
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const HTML = readFileSync(new URL('../site/quotetool.html', import.meta.url), 'utf8');

const START = '(function prefillFromQuery() {';
const END = '})();';
const i = HTML.indexOf(START);
assert.notEqual(i, -1, 'the prefill block is gone from quotetool.html');
const j = HTML.indexOf(END, i);
assert.notEqual(j, -1, 'the prefill block is not closed');
const SOURCE = HTML.slice(i, j + END.length);

/** Just enough DOM for the block: the controls it touches and nothing else. */
function makeDom(search) {
  const ev = [];
  const el = (id, extra = {}) => ({ id, value: '', dispatchEvent: (e) => ev.push([id, e.type]), ...extra });

  const select = (id, opts) => el(id, {
    options: opts.map(([value, textContent, disabled = false]) => ({ value, textContent, disabled })),
  });

  const segment = (id, vals, active) => {
    const buttons = vals.map((v) => ({
      dataset: { val: v },
      classList: {
        _on: v === active,
        add(c) { if (c === 'active') this._on = true; },
        remove(c) { if (c === 'active') this._on = false; },
      },
      dispatchEvent: (e) => ev.push([id, e.type]),
    }));
    return { id, buttons, querySelectorAll: () => buttons };
  };

  const nodes = {
    dob: el('dob'),
    coverage: el('coverage'),
    state: select('state', [['', 'Select…', true], ['Colorado', 'Colorado'], ['Texas', 'Texas']]),
    health: select('health', [['', 'Select…', true], ['Preferred Plus', 'Preferred Plus'],
      ['Preferred', 'Preferred'], ['Standard Plus', 'Standard Plus'], ['Standard', 'Standard']]),
    coverageCat: select('coverageCat', [['', 'Select…', true],
      ['3', '10 Year Level Term Guaranteed'], ['4', '15 Year Level Term Guaranteed'],
      ['5', '20 Year Level Term Guaranteed'], ['7', '30 Year Level Term Guaranteed'],
      ['8', 'To Age 121 Level (No Lapse U/L)']]),
    genderSeg: segment('genderSeg', ['Male', 'Female'], 'Male'),
    tobaccoSeg: segment('tobaccoSeg', ['Yes', 'No'], 'No'),
  };

  const location = { search, pathname: '/quotetool.html' };
  const sandbox = {
    URLSearchParams, Date, RegExp, Number, location, events: ev,
    document: {
      getElementById: (id) => nodes[id] ?? null,
      querySelector: (sel) => {
        const m = sel.match(/^#(\w+) \.active$/);
        return m ? nodes[m[1]].buttons.find((b) => b.classList._on) ?? null : null;
      },
    },
    history: { replaceState: (_a, _b, url) => { location.search = ''; location.replaced = url; } },
    Event: class { constructor(type) { this.type = type; } },
  };

  const run = new Function(...Object.keys(sandbox), `"use strict";${SOURCE}`);
  run(...Object.values(sandbox));

  return {
    dob: nodes.dob.value,
    coverage: nodes.coverage.value,
    health: nodes.health.value,
    state: nodes.state.value,
    term: nodes.coverageCat.value,
    gender: nodes.genderSeg.buttons.find((b) => b.classList._on)?.dataset.val,
    tobacco: nodes.tobaccoSeg.buttons.find((b) => b.classList._on)?.dataset.val,
    search: location.search,
  };
}

test('a full handoff fills every field the hero asked for', () => {
  const r = makeDom('?dob=1980-01-15&gender=Female&coverage=750000&term=20&health=Preferred&tobacco=Yes&state=Colorado');
  assert.equal(r.dob, '1980-01-15');
  assert.equal(r.coverage, '750,000', 'coverage should be formatted the way the field formats it');
  assert.equal(r.health, 'Preferred');
  assert.equal(r.term, '5', '20 years is option 5 — matched by its text, not by this number');
  assert.equal(r.gender, 'Female');
  assert.equal(r.tobacco, 'Yes');
  assert.equal(r.state, 'Colorado');
});

test('an American date is normalised rather than dropped', () => {
  // <input type="date"> takes ISO only. This exact case shipped broken and the
  // field came back empty with nothing shown to the visitor.
  assert.equal(makeDom('?dob=01/15/1980').dob, '1980-01-15');
  assert.equal(makeDom('?dob=1/5/1980').dob, '1980-01-05', 'single digits are padded');
});

test('an impossible or future birth date is ignored', () => {
  assert.equal(makeDom('?dob=02/31/1980').dob, '', 'February 31st is not a date');
  assert.equal(makeDom('?dob=13/01/1980').dob, '', 'there is no thirteenth month');
  assert.equal(makeDom('?dob=2099-01-01').dob, '', 'a birth date cannot be in the future');
});

test('all four term lengths the hero offers reach an option', () => {
  for (const [years, value] of [[10, '3'], [15, '4'], [20, '5'], [30, '7']]) {
    assert.equal(makeDom(`?term=${years}`).term, value, `${years} years should select option ${value}`);
  }
});

test('a value that is not on offer leaves the field alone', () => {
  const r = makeDom('?health=Excellent&term=25&gender=Other&state=Atlantis&coverage=abc');
  assert.equal(r.health, '', '"Excellent" is the hero\'s word — the map should have converted it');
  assert.equal(r.term, '', '25 years is not offered');
  assert.equal(r.gender, 'Male', 'an unknown gender leaves the default segment alone');
  assert.equal(r.state, '');
  assert.equal(r.coverage, '');
});

test('the answers are taken out of the address bar', () => {
  assert.equal(makeDom('?dob=1980-01-15&health=Preferred').search, '',
    'a birth date should not sit in a url the visitor might copy or bookmark');
});

test('a visit with no query string changes nothing', () => {
  const r = makeDom('');
  assert.equal(r.dob, '');
  assert.equal(r.gender, 'Male', 'the page\'s own defaults should survive');
  assert.equal(r.tobacco, 'No');
});
