/**
 * Anything the modal hides is actually off the screen.
 *
 *   node --test tests/hidden-actually-hides.test.mjs
 *
 * WHY THIS EXISTS. `hidden` is a UA stylesheet rule, and ANY author
 * `display` beats it. .qbm-grid sets display:grid, and #qbm-owner-fields
 * carries both that class and the hidden attribute — so the owner's name
 * fields rendered on "I own it, and it is measured on my life", which is
 * the default and the answer almost everyone gives.
 *
 * Nothing was wrong in the markup or in the handler. Both said hidden.
 * qbOwnerChanged set .hidden correctly on every click. The stylesheet
 * simply outvoted them, and the only symptom was two name fields sitting
 * there asking to be filled in by people they did not apply to.
 *
 * That makes it the kind of bug a test has to catch structurally, because
 * reading either half on its own says it works.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

const PARTIALS = path.join(import.meta.dirname, '..', 'tools', 'partials');
const HTML = fs.readFileSync(path.join(PARTIALS, 'apply-modal.html'), 'utf8');
const CSS = fs.readFileSync(path.join(PARTIALS, 'apply-modal.css'), 'utf8');

/** Classes the modal stylesheet gives a `display` to. */
function classesWithDisplay() {
  const out = new Set();
  for (const m of CSS.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    if (!/(^|[;\s])display\s*:/.test(m[2])) continue;
    if (/\[hidden\]/.test(m[1])) continue;          // the neutraliser itself
    for (const c of m[1].matchAll(/\.([A-Za-z0-9_-]+)/g)) out.add(c[1]);
  }
  return out;
}

/** Elements in the partial that are hidden, with the classes they carry. */
function hiddenElements() {
  const out = [];
  for (const m of HTML.matchAll(/<(\w+)([^>]*\bhidden\b[^>]*)>/g)) {
    const cls = /class="([^"]*)"/.exec(m[2]);
    out.push({ tag: m[1], classes: cls ? cls[1].split(/\s+/).filter(Boolean) : [] });
  }
  return out;
}

/*
 * !important is required rather than merely accepted. `.qbm-veil [hidden]`
 * is (0,2,0) and already outranks `.qbm-grid`, so it would work today
 * without it -- but it would lose to an id rule, and #qbm-owner-fields is
 * exactly the kind of element someone reaches for an id to style. The
 * fields this hides ask for a third party's name, so the rule should not
 * depend on nobody later writing a more specific selector.
 */
const NEUTRALISER = /\[hidden\][^{]*\{[^}]*display\s*:\s*none\s*!important/;

test('the sweep still finds the modal and its rules', () => {
  assert.ok(hiddenElements().length >= 1,
    'no hidden elements found in the modal partial — this test has stopped '
    + 'matching the markup rather than the modal having none');
  assert.ok(classesWithDisplay().size >= 2,
    'no classes with a display found in the modal stylesheet — this test has '
    + 'stopped matching the CSS');
});

test('HIDDEN IS NOT OVERRULED BY A DISPLAY IN THE MODAL STYLESHEET', () => {
  if (NEUTRALISER.test(CSS)) return;   // covered for every element at once

  const withDisplay = classesWithDisplay();
  const broken = hiddenElements()
    .filter((el) => el.classes.some((c) => withDisplay.has(c)))
    .map((el) => `<${el.tag} class="${el.classes.join(' ')}" hidden>`);

  assert.deepEqual(broken, [],
    'these elements are hidden in the markup but their class gives them a '
    + `display, so they stay on screen:\n  ${broken.join('\n  ')}\n\n`
    + 'Either drop the display or restore the `.qbm-veil [hidden]` rule in '
    + 'apply-modal.css, which settles it for every element in the modal.');
});
