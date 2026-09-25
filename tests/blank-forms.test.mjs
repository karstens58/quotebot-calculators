/**
 * The calculators open blank.
 *
 * They shipped seeded with a worked example, and the example was a real
 * person: "Scott Karstens", a real date of birth, "Karstens & Co.", a key
 * employee named after a real actor. On a public consumer page that is
 * somebody's details sitting in a form a stranger is about to type over.
 *
 * Checked against the shipped files. Regex over HTML is a blunt instrument,
 * so this deliberately tests the narrow, factual thing -- no personal detail
 * is present, and no input carries a value -- rather than trying to parse the
 * pages.
 *
 * NOT checked here, on purpose:
 *   - range sliders, which have no empty state. Zeroing a rider fee or an
 *     inflation rate does not clear it, it asserts a different and
 *     flattering scenario, so they keep the values they shipped with.
 *   - fields a calculator computes for itself, such as the suggested
 *     valuation multiple, which is output rather than demo data.
 *
 *   node --test tests/blank-forms.test.mjs
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SITE = fileURLToPath(new URL('../site/', import.meta.url));
const PAGES = readdirSync(SITE).filter((f) => f.endsWith('.html'));

/* Script and style blocks hold template literals whose ${...} legitimately
   carry values; the markup rules below apply only outside them. */
const stripScripts = (html) => html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '');

test('PAGES CARRY NOBODY’S PERSONAL DETAILS', () => {
  /* Names and a birthday that belong to real people, including ours. A
     placeholder like "e.g. Owner, CFO, Managing Partner" is prompting, not
     filling, so only the bare name forms are searched for. */
  const forbidden = [/Karstens/i, /1978-01-26/, /Jane\s+Fonda/i,
    /Jordan\s+Avery/i, /Morgan\s+Lee/i, /Casey\s+Rivera/i];
  for (const page of PAGES) {
    const html = readFileSync(SITE + page, 'utf8');
    for (const re of forbidden) {
      assert.ok(!re.test(html), `${page} still contains ${re}`);
    }
  }
});

test('NO INPUT ARRIVES WITH SOMETHING ALREADY TYPED IN IT', () => {
  const skip = new Set(['hidden', 'radio', 'checkbox', 'button', 'submit',
    'reset', 'file', 'image', 'range']);
  const offenders = [];
  for (const page of PAGES) {
    const markup = stripScripts(readFileSync(SITE + page, 'utf8'));
    for (const m of markup.matchAll(/<input\b[^>]*>/g)) {
      const tag = m[0];
      const type = (/\btype="([^"]*)"/.exec(tag) ?? [, 'text'])[1];
      if (skip.has(type)) continue;
      const value = /\svalue="([^"]*)"/.exec(tag);
      if (value && value[1].trim()) {
        offenders.push(`${page}: ${(/\bid="([^"]*)"/.exec(tag) ?? [, '?'])[1]}="${value[1]}"`);
      }
    }
  }
  assert.deepEqual(offenders, []);
});

test('a dropdown that decides a price is not answered for the visitor', () => {
  /* State and health class move the premium; industry drives the valuation
     multiple. A select with no placeholder falls to its first option, which
     is an answer nobody gave. */
  const mustBeUnchosen = [
    ['quotetool.html', 'health'], ['quotetool.html', 'coverageCat'],
    ['dimeneedscalculator.html', 'uwClass'],
    ['crosspurchasebuysellcalculator.html', 'bizStructure'],
    ['retirementdistributioncalculator.html', 'ltcgRate'],
  ];
  for (const [page, id] of mustBeUnchosen) {
    const markup = stripScripts(readFileSync(SITE + page, 'utf8'));
    const sel = new RegExp(`<select\\b[^>]*\\bid="${id}"[^>]*>([\\s\\S]*?)</select>`).exec(markup);
    assert.ok(sel, `${page} has no static select #${id}`);
    assert.match(sel[1], /<option[^>]*value=""[^>]*selected/,
      `${page} #${id} does not start on a placeholder`);
  }
});

test('the lists built in script start unchosen too', () => {
  /* These are appended by JS, so the markup test above cannot see them. The
     state list is the one that matters most: it changes the rates. */
  for (const [page, marker] of [
    ['quotetool.html', 'Select your state'],
    ['dimeneedscalculator.html', 'Select your state'],
    ['crosspurchasebuysellcalculator.html', 'Select an industry'],
    ['keypersoncalculator.html', 'Select a state'],
  ]) {
    assert.ok(readFileSync(SITE + page, 'utf8').includes(marker),
      `${page} never offers "${marker}", so its list falls to its first entry`);
  }
});

test('NO DEFAULT STATE IS CHOSEN ANYWHERE', () => {
  /* The specific bug: every state list preselected Colorado, so a visitor in
     Florida was quoted Colorado rates unless they noticed. */
  for (const page of PAGES) {
    const html = readFileSync(SITE + page, 'utf8');
    assert.ok(!/===?\s*["']Colorado["']\s*\)\s*\S*\.?selected\s*=\s*true/.test(html),
      `${page} still preselects Colorado`);
  }
});

test('sliders keep the values they shipped with', () => {
  /* The counterpart rule, asserted so a later tidy-up does not "clear" them.
     A rate slider at zero is not blank, it is a claim -- a 0% rider fee and
     0% tax make an illustration look better than the product is. */
  const html = readFileSync(SITE + 'fiaincomeridercalculator.html', 'utf8');
  for (const [id, value] of [['riderFee', '1.05'], ['rollRate', '7'], ['payout', '5.4']]) {
    const tag = new RegExp(`<input[^>]*\\bid="${id}"[^>]*>`).exec(html);
    assert.ok(tag, `no slider #${id}`);
    assert.match(tag[0], new RegExp(`value="${value.replace('.', '\\.')}"`),
      `#${id} was zeroed, which asserts a cheaper product rather than an empty form`);
  }
});
