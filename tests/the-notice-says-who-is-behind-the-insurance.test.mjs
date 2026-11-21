/**
 * Every calculator says who offers and fulfils the insurance. QBP-602.
 *
 *   node --test tests/the-notice-says-who-is-behind-the-insurance.test.mjs
 *
 * WHY THIS FILE EXISTS. These fourteen pages quote premiums, take a name
 * and a phone number, and hand the visitor to a licensed agency. Until this
 * ticket the only thing on them naming an entity was a copyright line --
 * which footer-entities.test.mjs guards precisely because it had been wrong
 * on thirteen pages at once and nobody noticed for months.
 *
 * The fulfilment notice is the same class of thing and a stronger claim: it
 * is what makes these pages compliant advertising by a licensed agency
 * rather than a quote from nobody in particular. Scott's framing of the
 * portal page's version, which these words are copied from: the notice and
 * the licence numbers "are not boilerplate attached to the bottom of an
 * advertisement -- they are the outsourcing model stated to the consumer,
 * on the page, at the moment it matters."
 *
 * It is in the page SOURCE on every page, not fetched. A disclosure that
 * arrives after the content is a disclosure somebody can read past.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SITE = join(ROOT, 'site');
const pages = readdirSync(SITE).filter((f) => f.endsWith('.html'));

/**
 * The fixed sentence, as the portal page says it.
 *
 * Copied here rather than imported because these are static files with no
 * build step -- but not left to drift either: the last test in this file
 * reads the backend's own constant when the repo is beside this one.
 */
const NOTICE = 'Insurance products are offered and fulfilled by QB Insurance '
  + 'LLC, doing business as Quote Bot, a licensed insurance agency.';
const HEAD = 'Fulfilled by Quote Bot';
/**
 * The Colorado licence number, which for THIS agency is also its NPN.
 *
 * Scott, 21 November: "for QB Insurance the state license number is = to
 * the NPN." Not true of agencies in general -- the NPN is national and the
 * licence is Colorado's -- which is why apply-chrome.mjs holds them as two
 * constants and builds the line from them. This file checks the result
 * either way rather than assuming the coincidence holds for ever.
 */
const LICENCE = 'Colorado licence #738600';

test('THERE ARE PAGES TO CHECK', () => {
  /* A glob that quietly matches nothing is how a guard stops guarding
     without ever failing. */
  assert.ok(pages.length >= 10, `only ${pages.length} pages found in site/`);
});

test('EVERY PAGE CARRIES THE NOTICE, THE NPN AND THE LICENCE', () => {
  const wrong = [];
  for (const name of pages) {
    const html = readFileSync(join(SITE, name), 'utf8');
    if (!html.includes(HEAD)) wrong.push(`${name}: no "${HEAD}"`);
    if (!html.includes(NOTICE)) wrong.push(`${name}: the fulfilment sentence is missing or reworded`);
    if (!html.includes(LICENCE)) wrong.push(`${name}: no "${LICENCE}"`);
    /*
     * A REAL NUMBER BEHIND THE LABEL, in whichever of the two shapes the
     * script built. The failure this catches is the one that looks fine:
     * "NPN" followed by a placeholder, an empty string, or nothing at
     * all. Each renders as a tidy footer.
     *
     * Deliberately NOT asserting which shape. Whether the NPN and the
     * licence are one number is a fact about this agency's licensing,
     * and a test that insisted on today's answer would fail the day it
     * changed -- on a correct page.
     */
    const shared = /NPN \/ Colorado licence #(\d{5,10})\b/.test(html);
    const apart = /NPN\s+(\d{5,10})\b/.test(html);
    if (!shared && !apart) {
      wrong.push(`${name}: "NPN" with no number behind it`);
    }
  }
  assert.deepEqual(wrong, [], `\n${wrong.join('\n')}\n`);
});

test('AND THE SAME NUMBER ON ALL OF THEM', () => {
  /* Fourteen pages carrying two different NPNs is worse than fourteen
     carrying none: one of them is wrong and nothing says which. */
  const seen = new Map();
  for (const name of pages) {
    const html = readFileSync(join(SITE, name), 'utf8');
    const m = /NPN(?: \/ Colorado licence #|\s+)(\d{5,10})\b/.exec(html);
    if (m) seen.set(m[1], [...(seen.get(m[1]) ?? []), name]);
  }
  assert.equal(seen.size, 1,
    `the pages carry ${seen.size} different NPNs: `
    + [...seen].map(([n, f]) => `${n} on ${f.join(', ')}`).join(' | '));
});

test('THE NOTICE IS IN THE SOURCE, NOT FETCHED', () => {
  /*
   * The whole point of putting it in the chrome. The partner's half of the
   * sentence arrives with their name, because it cannot be known earlier --
   * but the part naming the licensed agency can never wait on a lookup.
   */
  const capture = readFileSync(join(SITE, 'js/quotebot-capture.js'), 'utf8');
  assert.ok(!capture.includes(NOTICE),
    'the fixed disclosure is assembled in JavaScript, so a visitor with a '
    + 'slow or blocked endpoint reads a quote with nobody behind it');
});

test('and the partner sentence lands with the name, on both paths', () => {
  /*
   * A page that named a partner for even a moment without saying they are
   * independent is the misattribution the co-branding feature exists to
   * avoid. Asserted on the source because the behaviour under test is
   * which call sites it sits beside -- the DOM half is covered in
   * a-partners-calculator-wears-their-colours.test.mjs.
   */
  const capture = readFileSync(join(SITE, 'js/quotebot-capture.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  const drawn = (capture.match(/drawStrip\(/g) ?? []).length;
  const named = (capture.match(/nameThePartner\(/g) ?? []).length;
  assert.ok(drawn >= 3, 'drawStrip is no longer called from both paths');
  assert.equal(named, drawn,
    `the strip names a partner on ${drawn - 1} paths but the notice follows `
    + `on ${named - 1} of them`);
});

test('THE WORDS ARE THE SERVER\'S', () => {
  /*
   * A test that skips in CI guards nothing in CI, so this is the weaker
   * half on purpose: the backend holds the same words in
   * shared/portalpage.ts and has its own guard on them. What this adds is
   * that somebody working on a machine with both repos finds out
   * immediately when the two drift -- which is the moment it is cheap.
   *
   * SKIPPED RATHER THAN FAILED when the sibling is absent. Amplify clones
   * one repo, this file runs in preBuild, and a throwing read here stops
   * the deploy -- which is exactly how QBP-612 took the calculators down.
   */
  const portal = join(ROOT, '..', 'quotebot-backend',
    'amplify/functions/shared/portalpage.ts');
  if (!existsSync(portal)) {
    console.log('# (quotebot-backend is not beside this repo — skipped; '
      + 'the backend has its own guard)');
    return;
  }
  const src = readFileSync(portal, 'utf8');
  assert.ok(src.includes("'Insurance products are offered and fulfilled by QB Insurance LLC, '"),
    'the backend reworded the fulfilment notice and these pages still say '
    + 'the old words');
  assert.ok(src.includes("export const FULFILLED_BY = 'Fulfilled by Quote Bot'"),
    'the backend renamed the fulfilment heading');
});
