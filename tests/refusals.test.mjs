/**
 * What the two business calculators do when they will not produce a report.
 *
 * This is written from a real afternoon. The owner cards stopped rendering on
 * both pages, and the symptom was not an error — it was nothing at all.
 * Cross-Purchase disabled its Calculate button, which cannot be clicked and
 * therefore cannot explain itself, while the reason sat far above the fold
 * saying a total was 0% with no cards on screen to set. Key Person simply
 * did nothing, because the contact block validated perfectly well and nobody
 * was checking whether there was anyone to value.
 *
 * A refusal has to happen AT the thing that needs fixing, and it has to be
 * reachable by pressing the button the visitor already pressed.
 *
 *   node --test tests/refusals.test.mjs
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const CP = readFileSync(new URL('../site/crosspurchasebuysellcalculator.html', import.meta.url), 'utf8');
const KP = readFileSync(new URL('../site/keypersoncalculator.html', import.meta.url), 'utf8');

function cut(html, start, endMarker) {
  const i = html.indexOf(start);
  assert.notEqual(i, -1, `could not find ${start}`);
  const j = html.indexOf(endMarker, i + start.length);
  assert.notEqual(j, -1, `could not find the end of ${start}`);
  return html.slice(i, j + endMarker.length);
}

/* ---- Cross-Purchase ---------------------------------------------------- */

test('THE BUTTON IS NEVER DISABLED', () => {
  /*
   * The whole point. A disabled button is a refusal with no voice: the
   * visitor presses it, nothing happens, and the explanation is somewhere
   * they are not looking.
   */
  assert.ok(!/calcBtn'\)\.disabled\s*=/.test(CP),
    'the Calculate button is being disabled again — it cannot explain itself that way');
});

test('pressing it with a bad ownership total sends you to the total', () => {
  const calc = cut(CP, 'function calculate(){', '\n}');
  assert.match(calc, /Math\.abs\(total - 100\) >= 0\.5/);
  assert.match(calc, /flashOwnership\(\)/,
    'the ownership check refuses without taking the visitor to the reason');
  const flash = cut(CP, 'function flashOwnership(){', '\n}');
  assert.match(flash, /scrollIntoView/);
  assert.match(flash, /classList\.add\('flash'\)/);
});

test('and the box still says what is wrong', () => {
  assert.match(CP, /Must total 100% — currently/);
});

test('a report is never built with fewer than two owners', () => {
  /* Cannot happen — buildPartners floors at two — but this is the shape of
     the bug that shipped, and a named refusal beats an empty report. */
  const calc = cut(CP, 'function calculate(){', '\n}');
  assert.match(calc, /partners\.length < 2/);
});

test('CAPTURE FIRES AFTER THE STATE IT DESCRIBES, NOT BEFORE', () => {
  /*
   * `setTimeout(qbCaptureLead, 0)` used to be the first thing calculate()
   * did — before the ownership check and before STATE was rebuilt. So a
   * refused submission still captured a lead, and it captured whatever the
   * previous run had left in STATE. Measured in a browser: a refused
   * submission now fires zero captures, a valid one fires one.
   */
  const calc = cut(CP, 'function calculate(){', '\n}');
  const capturedAt = calc.indexOf('qbCaptureLead');
  const stateAt = calc.indexOf('STATE = {');
  const renderAt = calc.indexOf('renderResults()');
  assert.ok(capturedAt > stateAt && capturedAt > renderAt,
    'capture runs before the report exists — a refused submission will file a lead');
});

/* ---- Key Person -------------------------------------------------------- */

test('Key Person refuses by name when there is nobody to value', () => {
  const calc = cut(KP, 'function calculate(){', '\n  renderResults();');
  assert.match(calc, /if \(!people\.length\)\{/,
    'the report can be asked for with no key people on it');
  assert.match(calc, /kesRefusal/);
  assert.match(calc, /scrollIntoView/);
  /* The message is real text in the markup, not something assembled in JS
     where nobody would ever see it in a diff. */
  assert.match(KP, /Add at least one key person above/);
  assert.match(KP, /id="kesRefusal" hidden/);
});

test('the refusal is cleared once there is somebody', () => {
  const calc = cut(KP, 'function calculate(){', '\n  renderResults();');
  assert.match(calc, /if \(note\) note\.hidden = true;/,
    'the refusal would stay on screen after the visitor fixed it');
});

/* ---- both -------------------------------------------------------------- */

test('the contact block still explains itself field by field', () => {
  /* This part was never broken and is easy to break while fixing the rest. */
  for (const [name, html] of [['key person', KP], ['cross-purchase', CP]]) {
    for (const msg of ['Enter your first name', 'Enter your title',
      'Enter a valid email address', 'Enter a valid phone number']) {
      assert.ok(html.includes(msg), `${name} lost "${msg}"`);
    }
    assert.match(html, /\.field\.has-error \.field-err \{ display: block; \}/,
      `${name} no longer shows its field errors`);
  }
});

test('a refusal that animates has a still version for reduced motion', () => {
  for (const [name, html] of [['key person', KP], ['cross-purchase', CP]]) {
    assert.match(html, /prefers-reduced-motion: reduce/,
      `${name} flashes with no alternative for anyone who asked not to see it`);
  }
});
