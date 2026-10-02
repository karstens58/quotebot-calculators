/**
 * Every capture field on every page can be found by the modal's carry-over.
 *
 *   node --test tests/capture-ids-are-reachable.test.mjs
 *
 * WHY THIS EXISTS. The modal copies what the visitor already typed into the
 * page -- name, phone, email -- so it does not ask twice. It finds those
 * fields by id, and the ids were never standardised: there are five
 * conventions across this site (bare, cf-, f-, gate-, contact), because the
 * capture forms were not built together.
 *
 * The map was a hand-kept list and it was wrong twice. First it held only
 * MYGA's cf- names, so the income pages asked for a name they were already
 * holding. Then it gained contact* and the bare names, and Sequence of
 * Returns still failed, because it uses gate-. Both times the failure was
 * silent and worse than blank: a separate pass finds email and phone by
 * input TYPE, so the form plainly knew the visitor and asked their name
 * anyway.
 *
 * A list cannot catch the convention nobody has thought of yet. So the
 * module generates candidates from the prefix set, and this reads that
 * same rule out of the module and checks it reaches every capture field
 * actually on the site. A new page using a sixth convention fails here on
 * the day it is written.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(import.meta.dirname, '..');
const SITE = path.join(ROOT, 'site');
const MODULE = path.join(SITE, 'js', 'quotebot-apply.js');

const src = fs.readFileSync(MODULE, 'utf8');

/** The prefix list and the field spellings, read from the module itself so
 *  this test cannot drift from the code it is checking. */
function ruleFromModule() {
  const pm = /var PREFIXES = \[([^\]]*)\]/.exec(src);
  assert.ok(pm, 'PREFIXES not found in quotebot-apply.js — has the carry-over been rewritten?');
  const prefixes = [...pm[1].matchAll(/'([^']*)'/g)].map((m) => m[1]);

  const names = new Set();
  for (const m of src.matchAll(/candidates\(\[([^\]]*)\]\)/g)) {
    for (const n of m[1].matchAll(/'([^']+)'/g)) names.add(n[1]);
  }
  assert.ok(prefixes.length >= 2 && names.size >= 5,
    `read ${prefixes.length} prefixes and ${names.size} names, which means this `
    + 'test has stopped matching the module rather than that the rule shrank');
  return { prefixes, names: [...names] };
}

/** Exactly the combination the module performs. */
function reachableIds({ prefixes, names }) {
  const out = new Set();
  for (const p of prefixes) {
    for (const n of names) {
      out.add(p === 'contact' ? 'contact' + n[0].toUpperCase() + n.slice(1) : p + n);
    }
  }
  return out;
}

const BASES = ['first', 'last', 'fname', 'lname', 'firstname', 'lastname',
  'email', 'phone', 'dob', 'state'];

/** Ids on a page that are plainly capture fields, whatever they are called. */
function captureIdsIn(html) {
  const found = new Set();
  for (const m of html.matchAll(/id="([^"]+)"/g)) {
    const id = m[1];
    if (id.startsWith('qbm-')) continue;            // the modal's own fields
    const lower = id.toLowerCase();
    for (const p of ['', 'cf-', 'f-', 'gate-', 'contact', 'lead-', 'form-']) {
      if (BASES.some((b) => lower === p + b)) { found.add(id); break; }
    }
  }
  return [...found];
}

function modalPages() {
  return fs.readdirSync(SITE)
    .filter((f) => f.endsWith('.html'))
    .map((f) => [f, fs.readFileSync(path.join(SITE, f), 'utf8')])
    .filter(([, html]) => html.includes('quotebot-apply.js'));
}

test('the sweep still finds the pages and their fields', () => {
  const pages = modalPages();
  assert.ok(pages.length >= 8,
    `only ${pages.length} pages use the apply modal, which means this test has `
    + 'stopped matching the site');
  const total = pages.reduce((n, [, html]) => n + captureIdsIn(html).length, 0);
  assert.ok(total >= 20,
    `only ${total} capture fields were found across those pages — the id sweep `
    + 'has stopped matching rather than the fields having gone');
});

test('EVERY CAPTURE FIELD IS REACHABLE BY THE CARRY-OVER', () => {
  const reachable = reachableIds(ruleFromModule());
  const unreachable = [];

  for (const [file, html] of modalPages()) {
    for (const id of captureIdsIn(html)) {
      if (!reachable.has(id)) unreachable.push(`${file}: #${id}`);
    }
  }

  assert.deepEqual(unreachable, [],
    'these capture fields cannot be found by the modal, so the visitor will be '
    + 'asked for something they already typed:\n  ' + unreachable.join('\n  ')
    + '\n\nAdd the prefix or the spelling to the rule in quotebot-apply.js '
    + 'rather than renaming the page field, unless the name is a one-off.');
});
