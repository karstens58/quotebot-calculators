/**
 * The D.I.M.E. results screen is styled in one place. QBP-544.
 *
 *   node --test tests/the-results-styling-has-one-home.test.mjs
 *
 * WHY THIS FILE EXISTS. /q/<token> shows somebody the analysis they
 * already saw, and Scott asked for the same screen rather than one that
 * resembles it: "if it is possible to show them the same beautiful quote
 * screen they saw their quote on initially that is my first choice."
 *
 * The backend page cannot reproduce this design; it links the stylesheet
 * below. That makes this file a contract with another repository, and the
 * failure it guards against is quiet: a tidy-up that inlines these rules
 * again, or a second declaration of the category colours, leaves this page
 * looking exactly right and the quote page drifting away from it with
 * nothing failing.
 *
 * That is not hypothetical here. QBP-537 renamed a card label in
 * quotetool.html and not in dimeneedscalculator.html, and the suite stayed
 * green for weeks because every test asserted the absence of the old word
 * rather than the presence of the new one.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

const SITE = new URL('../site/', import.meta.url).pathname;
const SHEET = 'css/dime-calculator.css';
const page = fs.readFileSync(path.join(SITE, 'dimeneedscalculator.html'), 'utf8');
const sheet = fs.readFileSync(path.join(SITE, SHEET), 'utf8');

test('the calculator links the shared stylesheet and holds no copy of it', () => {
  assert.ok(page.includes(`href="${SHEET}"`),
    `dimeneedscalculator.html no longer links ${SHEET}`);
  assert.ok(!/<style[\s>]/i.test(page),
    'the calculator grew a <style> block again -- rules there are invisible '
    + 'to the quote page, so the two screens would drift apart silently');
});

test('the category colours are declared exactly once in the whole site', () => {
  /*
   * The colours mean something: each is the category its badge, bar
   * segment and card border stand for, on this page and in the email's
   * ledger. A second declaration is a ledger whose colours stop agreeing
   * with the inputs that produced it.
   */
  const declarations = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!/\.(html|css)$/.test(entry.name)) continue;
      const text = fs.readFileSync(full, 'utf8');
      for (const letter of ['d', 'i', 'm', 'e']) {
        if (new RegExp(`--cat-${letter}\\s*:`).test(text)) {
          declarations.push(`${path.relative(SITE, full)}: --cat-${letter}`);
        }
      }
    }
  };
  walk(SITE);
  assert.deepEqual(declarations.sort(), [
    `${SHEET}: --cat-d`,
    `${SHEET}: --cat-e`,
    `${SHEET}: --cat-i`,
    `${SHEET}: --cat-m`,
  ], 'the four category colours are declared somewhere other than the sheet');
});

test('the stylesheet carries the pieces the quote page draws with', () => {
  /*
   * Named one at a time rather than as "the file is big enough". The
   * backend renders the number, the composition bar and the D/I/M/E
   * ledger with these class names; a rule deleted here is a backend page
   * that renders unstyled, in a different repository, with nothing in
   * this one to say why.
   */
  for (const rule of [
    '.comp-bar', '.comp-seg', '.comp-seg.d', '.comp-seg.i',
    '.comp-seg.m', '.comp-seg.e', '.comp-legend', '.comp-leg-val',
    '.cat-card', '.cat-badge', '.cat-name', '.cat-amount',
    '.results-content',
  ]) {
    /*
     * A SELECTOR, NOT A SUBSTRING. `sheet.includes('.comp-bar')` is also
     * true of `.comp-barX`, so renaming the rule passed this test while
     * breaking the page it guards -- caught by mutating it, which is the
     * only reason it is written the harder way.
     */
    const selector = new RegExp(
      rule.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\w-])');
    assert.match(sheet, selector,
      `${rule} is gone from ${SHEET}, and the quote page draws with it`);
  }
});

test('the stylesheet is the rules themselves, not a pointer at them', () => {
  /* An @import would publish a file the backend page cannot resolve from
     its own origin, which is a stylesheet that works in exactly one of
     the two places that load it. */
  assert.ok(!/@import/.test(sheet), `${SHEET} pulls in another file`);
});
