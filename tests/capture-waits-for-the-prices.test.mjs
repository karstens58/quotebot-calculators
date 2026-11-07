/*
 * CAPTURE HAPPENS AFTER THE PRICES ARRIVE, NOT BESIDE THEM.
 *
 * `Illustration` is the record of what the visitor was actually shown,
 * kept for the reason quotetool.html states where it builds the payload:
 * "the premiums sent here are what was DISPLAYED, which is what you want
 * on file if a quoted price is ever disputed."
 *
 * It was not what was displayed. The click handler called the async
 * recalc() without awaiting it and then called qbCaptureLead() on the
 * next line, so capture always won the race:
 *
 *   first run  -- QUOTES was still empty, and the record of what they
 *                 saw was written with no premiums in it at all.
 *   re-run     -- QUOTES held the PREVIOUS run's figures, which is the
 *                 worse half: a record that is confidently wrong rather
 *                 than visibly empty.
 *
 * Nothing reported it. Every Quote Tool quote on every lead read
 * "0 offers" and the console showed nothing under "What they saw", for
 * as long as the page has existed. Found 7 November, after a live quote
 * text's link opened to "we cannot find that quote" -- which was true,
 * and was the first thing loud enough to notice.
 *
 * So this guards the ORDER, which is the part that was wrong, rather
 * than the figures, which were never the problem.
 *
 *   node --test tests/capture-waits-for-the-prices.test.mjs
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SITE = fileURLToPath(new URL('../site/', import.meta.url));
const PAGES = readdirSync(SITE).filter((f) => f.endsWith('.html'));

const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

/** Every function this page declares with `async function <name>`. */
function asyncFunctions(src) {
  return new Set([...src.matchAll(/\basync\s+function\s+([A-Za-z_$][\w$]*)/g)]
    .map((m) => m[1]));
}

/**
 * Calls to `fn` in `text` that are not awaited.
 *
 * THE DECLARATION IS NOT A CALL, and the first draft of this counted it
 * -- `async function recalc(` matches "recalc(" as surely as `recalc()`
 * does. On this page the declaration sits hundreds of lines from the
 * handler so nothing was harmed, but on a page where they were close it
 * would have reported a bug that is not there, which is the way a guard
 * stops being believed.
 *
 * ONE READER, USED BY THE GUARD AND BY ITS CONTROL, so the control
 * cannot pass by implementing the check differently from the check.
 */
function unawaited(text, fn) {
  const call = new RegExp(`(^|[^.\\w])(await\\s+)?(function\\s+)?${fn}\\s*\\(`, 'g');
  return [...text.matchAll(call)].filter((m) => !m[2] && !m[3]);
}

test('A PAGE NEVER CAPTURES A LEAD BESIDE AN UNAWAITED PRICING CALL', () => {
  const guilty = [];

  for (const page of PAGES) {
    const src = strip(readFileSync(SITE + page, 'utf8'));
    if (!src.includes('qbCaptureLead()')) continue;
    const asyncs = asyncFunctions(src);
    if (!asyncs.size) continue;

    /*
     * Each call to capture, with the few statements before it. An
     * async function called in there WITHOUT `await` has not finished
     * when capture reads what it produced.
     */
    for (const m of src.matchAll(/qbCaptureLead\(\)/g)) {
      const before = src.slice(Math.max(0, m.index - 400), m.index);
      for (const fn of asyncs) {
        if (unawaited(before, fn).length) {
          guilty.push(`${page}: ${fn}() is async and is called un-awaited `
            + 'before qbCaptureLead()');
        }
      }
    }
  }

  assert.deepEqual(guilty, [], 'capture will read figures that have not '
    + 'arrived, and file them as what the visitor was shown:\n  '
    + guilty.join('\n  '));
});

test('quotetool awaits its pricing before capturing', () => {
  const src = strip(readFileSync(`${SITE}quotetool.html`, 'utf8'));
  const at = src.indexOf("getElementById('quoteBtn').addEventListener");
  assert.notEqual(at, -1, 'the quote button no longer has a handler');
  const handler = src.slice(at, at + 600);
  assert.match(handler, /await\s+recalc\s*\(/,
    'the quote button calls recalc() without waiting for it');
});

test('AND CAPTURES EVEN WHEN PRICING FAILS', () => {
  /*
   * The other half, and the reason this is a try/finally rather than a
   * bare await. The consent and the routing matter whether or not the
   * engine answered; a lead lost because Compulife was briefly down is
   * a worse outcome than a record with no premiums in it.
   */
  const src = strip(readFileSync(`${SITE}quotetool.html`, 'utf8'));
  const at = src.indexOf("getElementById('quoteBtn').addEventListener");
  const handler = src.slice(at, at + 600);
  assert.match(handler, /finally\s*\{[\s\S]{0,80}qbCaptureLead\s*\(/,
    'a failed price run would now cost the lead as well as the figures');
});

test('control: the reader can see an un-awaited async call when there is one', () => {
  /*
   * Proves the guard above compares rather than agreeing with itself.
   * The same shape the bug had, checked against the same logic.
   */
  const bad = strip(`
    async function recalc(){ await fetch('/quote'); }
    function go(){ recalc(); qbCaptureLead(); }
  `);
  const asyncs = asyncFunctions(bad);
  assert.ok(asyncs.has('recalc'), 'the reader did not find the async function');
  const at = bad.indexOf('qbCaptureLead()');
  const before = bad.slice(Math.max(0, at - 400), at);
  assert.equal(unawaited(before, 'recalc').length, 1,
    'the reader missed an un-awaited async call, or counted the declaration');

  /* And the fixed shape is clean, so the guard is not simply always red. */
  const good = strip(`
    async function recalc(){ await fetch('/quote'); }
    async function go(){ try { await recalc(); } finally { qbCaptureLead(); } }
  `);
  const gat = good.indexOf('qbCaptureLead()');
  assert.equal(unawaited(good.slice(0, gat), 'recalc').length, 0,
    'an awaited call was reported as un-awaited');
});
