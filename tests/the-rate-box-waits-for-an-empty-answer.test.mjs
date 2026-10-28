/**
 * The MYGA calculator's manual rate box, and the window it used to sit open in.
 *
 * The box lets a visitor type a rate when we cannot show them a carrier's.
 * It used to be on screen from page load, through the whole state lookup,
 * and only hidden once rates arrived. Scott, 28 October: a state takes a few
 * seconds to answer, and anything typed in that window is silently discarded
 * when the real rates land — so the box has to wait until we have actually
 * looked and come back with nothing.
 *
 * Read off the source rather than a browser, the way rate-chips does: the
 * rules here are about which call happens where, and a DOM check would pass
 * on a page that reached the same state by accident.
 *
 *   node --test tests/the-rate-box-waits-for-an-empty-answer.test.mjs
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const PAGE = readFileSync(new URL('../site/mygacalculator.html', import.meta.url), 'utf8');

/**
 * The same text with its comments taken out.
 *
 * These assertions are about control flow, and the comment explaining WHY a
 * line was removed naturally quotes the line. Without this, documenting the
 * change is what breaks the test that checks it — which teaches the next
 * person to delete the explanation rather than keep it.
 */
function code(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
}

/** The body of one top-level function in the page. */
function fnBody(name) {
  const at = PAGE.indexOf(`function ${name}(`);
  assert.notEqual(at, -1, `${name}() is gone from the calculator`);
  const open = PAGE.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < PAGE.length; i += 1) {
    if (PAGE[i] === '{') depth += 1;
    else if (PAGE[i] === '}') { depth -= 1; if (!depth) return PAGE.slice(open, i + 1); }
  }
  throw new Error(`could not find the end of ${name}()`);
}

test('ONE FUNCTION OWNS WHETHER THE BOX EXISTS', () => {
  /*
   * Hiding the wrapper and disabling the input are two halves of one
   * decision. Split across call sites they drift, and the screen ends up
   * typeable while invisible or visible and dead.
   */
  const body = fnBody('offerManualRate');
  /* Both halves must depend on the ARGUMENT. "touches style.display" is
     satisfied by a function that always shows the box, which is the bug. */
  assert.match(body, /style\.display\s*=\s*on\s*\?/,
    'the wrapper is shown or hidden without consulting the argument');
  assert.match(body, /\.disabled\s*=\s*!on\b/,
    'the input is enabled or disabled without consulting the argument');

  /* And nobody else touches the wrapper's display. */
  const writes = [...PAGE.matchAll(/manualRateWrap[^\n]*style\.display\s*=/g)];
  assert.equal(writes.length, 0,
    'something sets manualRateWrap.style.display outside offerManualRate');
});

test('DISABLED AS WELL AS HIDDEN', () => {
  /* display:none is a styling decision. The next person to restyle this
     panel must not be able to hand the visitor a live field by accident. */
  const body = fnBody('offerManualRate');
  assert.match(body, /disabled\s*=\s*!on/,
    'the input is hidden but left enabled');
});

test('THE BOX IS WITHHELD WHILE A LOOKUP IS IN FLIGHT', () => {
  /* The window Scott described. A previous state that came back empty leaves
     the box on screen, and it must go before the next lookup starts. */
  const body = fnBody('loadRates');
  const looking = body.indexOf('Looking up rates for');
  const withdraw = body.indexOf('offerManualRate(false)');
  assert.ok(looking > 0, 'the lookup no longer announces itself');
  assert.ok(withdraw > 0 && withdraw > looking,
    'the box is not withdrawn when a lookup starts');
});

test('AND BEFORE A STATE IS CHOSEN, BECAUSE NOTHING HAS BEEN LOOKED UP', () => {
  const body = code(fnBody('loadRates'));
  const noState = body.slice(0, body.indexOf('Looking up rates for'));
  assert.match(noState, /enterManualMode\([^)]*,\s*false\s*\)/s,
    'the no-state branch still offers a rate box before anything was looked up');
});

test('it IS offered once a lookup comes back with nothing', () => {
  /* Both ways of coming back with nothing are the same thing to a visitor:
     we looked, and we cannot show them a carrier rate. */
  for (const marker of [
    'We have no published rates for that state yet',
    'We could not load current rates just now',
  ]) {
    const at = PAGE.indexOf(marker);
    assert.notEqual(at, -1, `the "${marker}" path is gone`);
    const call = PAGE.lastIndexOf('enterManualMode(', at);
    const args = PAGE.slice(call, PAGE.indexOf(');', at) + 2);
    assert.ok(!/,\s*false\s*\)/.test(args),
      `the box is withheld after "${marker}", which is the one case it exists for`);
  }
});

test('and hidden again as soon as real rates arrive', () => {
  const body = fnBody('applyRates');
  assert.match(body, /offerManualRate\(false\)/,
    'a successful lookup leaves the manual box on screen');
});

/* ---- the status line ---- */

test('THE INPUT FORM NO LONGER DATES THE RATES AT THE VISITOR', () => {
  /*
   * "Rates in effect since X, checked Y, for CO." sat above the first number
   * anyone saw. It is gone from the control flow — the string survives only
   * in the comment explaining why.
   */
  const body = code(fnBody('applyRates'));

  /* The STATUS LINE specifically — the one under the state picker, which
     fires before the visitor has seen a number. Not every date in the
     function: the carrier card in the results still carries "Rates effective
     X · checked Y", and that one is next to the figures, which is where the
     QBP-338 note says a date belongs. */
  const status = /setRateStatus\(([\s\S]*?)\);/.exec(body);
  assert.ok(status, 'applyRates no longer sets a rate status at all');
  assert.ok(!/Rates in effect since/.test(status[1]),
    'the status line still dates the rates at the visitor');
  assert.ok(!/checked/.test(status[1]), 'the status line still carries a checked date');
  assert.ok(!/payload\.state/.test(status[1]), 'the status line still names the state back');
});

test('BUT THE PROVENANCE IS STILL ON THE PAGE, next to the figures', () => {
  /*
   * This is the whole reason the change is allowed rather than a quiet
   * erosion: the date did not leave, it stayed where it belongs. If this
   * assertion ever fails, the page is showing rates with no indication of
   * when they were published, which is a different decision entirely.
   */
  assert.match(PAGE, /Rates as published '\s*\+\s*rateEffectiveDate/,
    'the results no longer say when these rates were published');
  assert.match(PAGE, /contact us to confirm before you apply/,
    'the results no longer tell the visitor the rate is confirmed before they buy');
});

test('the band NUDGE survives, because it is not a disclaimer', () => {
  /* "enter your amount above to see the rate for a larger deposit" tells a
     visitor a bigger deposit earns more. Removing it would hide an upside. */
  const body = code(fnBody('describeBand'));
  assert.match(body, /see the rate for a larger deposit/,
    'the larger-deposit prompt was removed with the disclaimers');
  assert.ok(!/and over\./.test(body),
    'the "deposits of $X and over" note is still being produced');
});

/* ---- the failure path, which had never once run — QBP-368 ---- */

test('EVERYTHING THE CATCH TOUCHES IS IN SCOPE FOR THE CATCH', () => {
  /*
   * `const url` lived inside the try, and the catch logs it. A const is
   * block-scoped, so the catch's own first line threw a ReferenceError, the
   * real error was never reported, and the enterManualMode() underneath it
   * never ran. Every failed lookup left the visitor on "Looking up rates for
   * CO…" with no fallback and no way to know it had stopped — the precise
   * thing the comment inside that catch says must not happen.
   *
   * The source reads correctly right up to the line that reports the
   * failure, which is why this was found by firing a 500 at the page rather
   * than by reading it.
   */
  const body = code(fnBody('loadRates'));
  const tryAt = body.indexOf('try {');
  const catchAt = body.indexOf('} catch (err)');
  assert.ok(tryAt > 0 && catchAt > tryAt, 'loadRates no longer has a try/catch');

  const tail = body.slice(catchAt);
  const names = [...tail.matchAll(/\b(?:console\.\w+|enterManualMode)\s*\(([^)]*)\)/g)]
    .flatMap(([, args]) => args.match(/\b[a-z][A-Za-z0-9_]*\b/g) || []);

  const head = body.slice(0, tryAt);
  const inTry = body.slice(tryAt, catchAt);
  for (const n of new Set(names)) {
    if (!new RegExp(`\\b(?:const|let|var)\\s+${n}\\b`).test(inTry)) continue;
    assert.ok(new RegExp(`\\b(?:const|let|var)\\s+${n}\\b`).test(head),
      `the catch block reads "${n}", which is declared inside the try and is `
      + 'not in scope there — the catch will throw before it can report anything');
  }
});

test('and the failure path still offers the visitor a way forward', () => {
  const body = code(fnBody('loadRates'));
  const tail = body.slice(body.indexOf('} catch (err)'));
  assert.match(tail, /enterManualMode\(/,
    'a failed lookup no longer drops the visitor into manual mode');
  assert.ok(!/enterManualMode\([^)]*,\s*false\s*\)/s.test(tail),
    'a failed lookup withholds the rate box, leaving the visitor with nothing');
});
