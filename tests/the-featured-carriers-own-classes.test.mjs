/**
 * THE ASSURITY CALCULATOR OFFERS ASSURITY'S OWN CLASSES -- QBP-651.
 *
 *   node --test tests/the-featured-carriers-own-classes.test.mjs
 *
 * Scott, 26 November: "in the assurity calculator, we are showing Assurity
 * prominently. The available health classes should only be the classes for
 * assurity. They will not approve names that don't match in the specific
 * example, because they are the main feature."
 *
 * The page offered Compulife's four -- Preferred Plus, Preferred, Standard
 * Plus, Standard -- had them mapped to Assurity's five on the server, and
 * then printed under the price:
 *
 *   "Priced at Assurity's Standard Non-Tobacco -- they do not write the
 *    class you selected."
 *
 * On a page whose whole subject is that carrier's product. A form that can
 * express a class the featured carrier does not write is a form that has to
 * apologise for itself afterwards, and the apology is the part a carrier
 * reads.
 *
 * THE COMPARISON TOOL IS NOT THIS. There the form belongs to the comparison
 * and each carrier is mapped into it -- the argument is written at the top
 * of underwriting.ts and still holds. This is the single-carrier case that
 * same comment names as the exception.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const JS = readFileSync(join(ROOT, 'site/js/agentlessquote.js'), 'utf8');
const HTML = readFileSync(join(ROOT, 'site/agentlessquote.html'), 'utf8');

test('COMPULIFE\'S CLASSES ARE NOT OFFERED ON THIS PAGE', () => {
  /* The four that were in the markup. "Standard Plus" is the one Assurity
     do not write at all, and the one the apology was about. */
  const control = /<select id="health">([\s\S]*?)<\/select>/.exec(HTML);
  assert.ok(control, 'the health control is gone');
  assert.doesNotMatch(control[1], /Standard Plus/,
    'the page still offers a class Assurity do not write');
});

test('AND THE CONTROL IS FILLED BEFORE ANYTHING IS ASKED OF THE NETWORK', async () => {
  /*
   * The correction to the first attempt at this. The five were moved onto
   * the rider panel, which answers per state -- so on a page where no
   * state had been chosen there was no panel, and the field rendered
   * empty. Scott, in Safari: "the health class field does not show."
   *
   * The riders must come from the panel because they vary by state. These
   * do not, and the backend's own panel test said so while the page was
   * waiting on one.
   *
   * Held to the server's wording here, character for character, because a
   * second copy is only safe while something compares it.
   */
  const control = /<select id="health">([\s\S]*?)<\/select>/.exec(HTML);
  const offered = [...control[1].matchAll(/<option value="([^"]+)"[^>]*>([^<]+)<\/option>/g)]
    .map((m) => [m[1], m[2].trim()]);

  assert.deepEqual(offered, [
    ['PreferredPlusNonTobacco', 'Preferred Plus, non-tobacco'],
    ['PreferredNonTobacco', 'Preferred, non-tobacco'],
    ['StandardNonTobacco', 'Standard, non-tobacco'],
    ['PreferredTobacco', 'Preferred, tobacco'],
    ['StandardTobacco', 'Standard, tobacco'],
  ], 'the page no longer offers Assurity\'s five, best first, in their words');

  const BACKEND = join(ROOT, '..', 'quotebot-backend',
    'amplify/functions/shared/underwriting.ts');
  if (!existsSync(BACKEND)) {
    console.log('  (quotebot-backend is not checked out beside this repo '
      + '\u2014 skipped; the words above are still pinned)');
    return;
  }
  const uw = readFileSync(BACKEND, 'utf8');
  for (const [value, label] of offered) {
    assert.ok(uw.includes(`${value}: '${label}'`),
      `${value} reads "${label}" here and something else on the server`);
  }
});

test('AND THE PAGE HOLDS NO LIST OF THEIR CLASS NAMES', () => {
  /*
   * It held one, and it had already drifted: this file said "Preferred Plus
   * Non-Tobacco" where the server says "Preferred Plus, non-tobacco". Two
   * vocabularies for five classes, on the page whose subject is that
   * carrier -- which is exactly the drift the riders avoid by coming from
   * the panel, as this file already says about them.
   */
  assert.doesNotMatch(JS, /ASSURITY_CLASS_NAMES/,
    'the page carries its own copy of the carrier\'s class names again');
  assert.doesNotMatch(JS, /PreferredPlusNonTobacco\s*:/,
    'a class-name table is back in the page');
  assert.match(JS, /function classLabel\(/,
    'nothing reads the names off the control');
});

test('THE CLASS IS SENT AS CHOSEN, NOT MAPPED', () => {
  /*
   * The control offers nothing but Assurity's five, so there is nothing to
   * map. The route takes riskClass as given and answers approximated:
   * false -- sending healthClass again would put the ladder back and with
   * it the apology.
   */
  assert.match(JS, /riskClass: inp\.health/,
    'the page sends a class for the server to map rather than the one picked');
  assert.doesNotMatch(JS, /healthClass: inp\.health/,
    'the page is still asking to be mapped onto the carrier\'s ladder');
});

test('THE TOBACCO ANSWER DECIDES WHICH CLASSES EXIST', () => {
  /*
   * Assurity fold tobacco into the class, so two controls that can
   * disagree are two controls that will. The tobacco question stays
   * because a visitor expects it and the lead carries it; it now filters
   * the ladder instead of being mapped alongside it.
   *
   * The filter is on the panel's own `tobacco` flag rather than on the
   * name, because every one of the five ends with "Tobacco".
   */
  const at = JS.indexOf('function renderClasses(');
  assert.ok(at > 0, 'nothing builds the control from the panel');
  const body = JS.slice(at, JS.indexOf('\n}', at));
  assert.match(body, /isTobacco !== smokes/,
    'the control does not match the tobacco answer beside it');
  assert.match(body, /NonTobacco\$/,
    'a tobacco class is decided some other way than by what the value is '
    + 'NOT -- all five end in "Tobacco", and reading it the other way '
    + 'offers a smoker the non-tobacco ladder');
  assert.doesNotMatch(body, /sel\.innerHTML/,
    'the options are rebuilt again, which is how the field came up empty');

  /* And it is rebuilt when that answer changes. */
  const seg = JS.slice(JS.indexOf(".inputs-panel .seg"));
  assert.match(seg.slice(0, 700), /renderClasses\(\)/,
    'changing the tobacco answer leaves the old classes on offer');
});

test('and the line under the price names the class rather than apologising', () => {
  assert.doesNotMatch(JS, /they do not write the class you selected/,
    'the page still tells a visitor the featured carrier will not write '
    + 'what it just offered them');
  assert.match(JS, /uw\.hidden = !currentUnderwriting\?\.riskClass/,
    'the element is shown only on an approximation that can no longer '
    + 'happen, which leaves it permanently hidden');
});
