/**
 * Every calculator stores, as consent evidence, the words it actually showed.
 *
 * Each page hands QuoteBot.capture() a `consentText` it picks with a selector.
 * lead-capture stores that string on the ConsentRecord as `disclosureText` --
 * the record of what the visitor read -- and consentTypesFor() reads it to
 * decide whether consent to TEXT was established at all.
 *
 * WHAT WENT WRONG WITHOUT THIS. Six pages pointed at the wrong element and
 * nothing anywhere said so. retirementdistribution stored "¹" -- a footnote
 * marker. Three others stored "Important:", a bold lead-in. careltc stored a
 * paragraph about illustrative premiums. The selectors all matched something,
 * so there was no error; the pages looked fine; the records were fiction.
 *
 * Two failures came out of that, and the second is the one that matters.
 * No transactional SMS consent was recorded on any of them, which fails safe
 * -- mayContact refuses -- but reads like a bug in messaging rather than in a
 * calculator. And a ConsentRecord existed asserting somebody had read "¹".
 * That is evidence we generated ourselves, describing a thing that did not
 * happen.
 *
 * So this resolves each page's OWN selector, the way that page resolves it,
 * and checks what comes back. A page that repoints its consent at the wrong
 * paragraph fails here rather than in a deposition.
 *
 *   node --test tests/consent-selector-resolves.test.mjs
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const site = join(here, '..', 'site');

/** The server's own rule, restated: what establishes consent to text. */
const NAMES_TEXTING = /\bsms\b|\btexts?\b|\btext messages?\b/;

function capturingPages() {
  return readdirSync(site)
    .filter((f) => f.endsWith('.html'))
    .map((f) => [f, readFileSync(join(site, f), 'utf8')])
    .filter(([, h]) => /QuoteBot\.capture\s*\(/.test(h));
}

/* ---- the smallest querySelector that tells the truth ------------------- */

/**
 * First element matching `#id`, `.class`, or a comma list of those.
 *
 * Document order, not list order -- that is what querySelector does, and
 * keyperson relies on it with '.privacy-note, .consent-note, .disclaimer'.
 * Resolving a comma list left-to-right instead would agree with the page on
 * that one by luck and disagree the moment the markup is reordered.
 */
function queryFirst(html, selector) {
  const parts = selector.split(',').map((s) => s.trim()).filter(Boolean);
  let best = null;
  for (const part of parts) {
    const id = part.startsWith('#') ? part.slice(1) : null;
    const cls = part.startsWith('.') ? part.slice(1) : null;
    if (!id && !cls) continue;
    const re = id
      ? new RegExp(`<(\\w+)\\b[^>]*\\bid=["']${id}["'][^>]*>`, 'g')
      : new RegExp(`<(\\w+)\\b[^>]*\\bclass=["'][^"']*\\b${cls}\\b[^"']*["'][^>]*>`, 'g');
    const m = re.exec(html);
    if (m && (best === null || m.index < best.index)) {
      best = { index: m.index, tag: m[1], end: m.index + m[0].length };
    }
  }
  if (!best) return null;

  /* Text of that element: scan to its matching close tag. */
  const open = new RegExp(`<${best.tag}\\b`, 'g');
  const close = new RegExp(`</${best.tag}>`, 'g');
  let depth = 1, i = best.end;
  while (depth > 0) {
    open.lastIndex = i; close.lastIndex = i;
    const o = open.exec(html), c = close.exec(html);
    if (!c) return null;
    if (o && o.index < c.index) { depth++; i = o.index + 1; }
    else { depth--; i = c.index + (depth === 0 ? 0 : 1); }
  }
  return html.slice(best.end, i)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    /* Tags became spaces above, which leaves "Privacy Policy ." where the
       browser gives "Privacy Policy." Cosmetic, but this string is quoted
       back in failures and compared against what Chromium returns. */
    .replace(/ +([.,;:!?])/g, '$1')
    .trim();
}

/** The selectors a page's consentText actually consults, in order. */
function consentSelectors(html) {
  const line = (html.match(/consentText:\s*([^\n]*)/) || [])[1];
  if (!line) return null;

  /* C('sel'), possibly several joined by ||. */
  const direct = [...line.matchAll(/C\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]);
  if (direct.length) return direct;

  /* `name ? name.textContent...` -- follow the variable to its definition. */
  const varName = (line.match(/^\s*([A-Za-z_$][\w$]*)\s*\?/) || [])[1];
  if (!varName) return null;
  const def = html.match(
    new RegExp(`(?:var|const|let)\\s+${varName}\\s*=\\s*([^;\\n]+)`));
  if (!def) return null;
  const src = def[1];
  const byId = src.match(/(?:getElementById|\$)\(\s*['"]([^'"]+)['"]\s*\)/);
  if (byId) return ['#' + byId[1]];
  const byQs = src.match(/querySelector\(\s*['"]([^'"]+)['"]\s*\)/);
  if (byQs) return [byQs[1]];
  return null;
}

test('the sweep still finds the calculators', () => {
  assert.ok(capturingPages().length >= 10,
    'this test has stopped matching the site rather than the pages being gone');
});

test('every page resolves a consent selector this test understands', () => {
  /* An unreadable expression must fail loudly. Skipping it quietly is how a
     page ends up exempt from the only check on its consent evidence. */
  const unreadable = capturingPages()
    .filter(([, h]) => !consentSelectors(h))
    .map(([f]) => f);
  assert.deepEqual(unreadable, [],
    'consentText on these pages is not in a form this test can resolve — '
    + 'either fix the page or teach consentSelectors() the new shape; do not '
    + 'leave it unchecked');
});

test('THE CONSENT SELECTOR RESOLVES TO SOMETHING THAT EXISTS', () => {
  const missing = [];
  for (const [f, h] of capturingPages()) {
    const sels = consentSelectors(h) || [];
    const hit = sels.map((s) => queryFirst(h, s)).find((t) => t != null);
    if (hit == null) missing.push(`${f} (tried ${sels.join(' || ')})`);
  }
  assert.deepEqual(missing, [],
    'these pages send no consent text at all — the record will say nothing '
    + 'about what the visitor was shown');
});

test('IT RESOLVES TO THE CONSENT LINE, NOT WHATEVER ELSE MATCHED', () => {
  /*
   * The check that would have caught all six. A selector that matches the
   * wrong element still returns a string, so existence proves nothing; the
   * text has to name texting, because that is exactly what the server reads
   * it for.
   */
  const wrong = [];
  for (const [f, h] of capturingPages()) {
    const sels = consentSelectors(h) || [];
    const hit = sels.map((s) => queryFirst(h, s)).find((t) => t != null);
    if (hit == null) continue;
    if (hit.length < 40 || !NAMES_TEXTING.test(hit.toLowerCase())) {
      wrong.push(`${f}: ${sels.join(' || ')} -> ${JSON.stringify(hit.slice(0, 70))}`);
    }
  }
  assert.deepEqual(wrong, [],
    'this is what the page stores as the disclosure the visitor read. It does '
    + 'not mention texting, so consentTypesFor() records no SMS consent — and '
    + 'the record we DO keep describes text nobody was shown');
});
