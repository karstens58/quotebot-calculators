/**
 * An action is only as good as the script that registers it.
 *
 * THIS IS WRITTEN FROM A FAILURE. The first page converted had its inline
 * handlers replaced by data-qb-click attributes, the dispatcher loaded, every
 * unit test passed -- and the button did nothing, because the page's own
 * 42kB <script> was inline, the policy blocked it, and the register() call
 * inside it never ran. Nothing in the markup or the dispatcher was wrong.
 * The registration simply was not there.
 *
 * It took a browser with the real policy to see it, which is the point: a
 * page can be entirely correct about actions and still be dead on arrival.
 * So the two halves are asserted together -- a page that names actions must
 * register them from a file the policy will actually execute.
 *
 *   node --test tests/actions-survive-csp.test.mjs
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.join(ROOT, 'site');
const pages = fs.readdirSync(SITE).filter((f) => f.endsWith('.html'));
const read = (f) => fs.readFileSync(path.join(SITE, f), 'utf8');
const INLINE = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;

/** Every script file a page loads, in order, as text. */
function externals(html) {
  return [...html.matchAll(/<script[^>]*\bsrc="([^"]+)"/g)]
    .map((m) => m[1])
    .filter((s) => !/^https?:/.test(s))
    .map((s) => {
      const f = path.join(SITE, s);
      return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '';
    });
}

test('a page that names actions registers them from an external file', () => {
  for (const f of pages) {
    const html = read(f);
    if (!/\sdata-qb-(click|change|input|focus|blur)=/.test(html)) continue;

    const inline = [...html.matchAll(INLINE)].map((m) => m[1]).join('\n');
    const outside = externals(html).join('\n');

    assert.ok(/qbActions\.register\s*\(/.test(outside),
      `${f} names actions but nothing in a loaded file registers them — `
      + 'if the only register() call is in an inline script, the policy blocks it '
      + 'and every action on the page is dead');

    assert.ok(!/qbActions\.register\s*\(/.test(inline),
      `${f} registers actions from an INLINE script, which a CSP without `
      + "'unsafe-inline' will not execute");
  }
});

test('every action named in the markup is registered somewhere', () => {
  for (const f of pages) {
    const html = read(f);
    const named = new Set(
      [...html.matchAll(/\sdata-qb-(?:click|change|input|focus|blur)="([^"]+)"/g)].map((m) => m[1]),
    );
    if (!named.size) continue;
    const js = externals(html).join('\n');
    for (const name of named) {
      /* The registry is written as an object literal, so the name appears as
         a key. Loose on purpose -- this is here to catch a typo or a rename,
         not to parse JavaScript. */
      assert.ok(new RegExp(`\\b${name}\\b`).test(js),
        `${f}: the markup calls action "${name}" and no loaded script mentions it`);
    }
  }
});

test('the dispatcher loads before the scripts that register against it', () => {
  for (const f of pages) {
    const html = read(f);
    const disp = html.indexOf('js/qb-actions.js');
    assert.notEqual(disp, -1, `${f} does not load the dispatcher`);
    const first = html.indexOf('<script');
    assert.equal(html.lastIndexOf('<script', disp), first,
      `${f}: a script runs before the dispatcher, so a register() call in it `
      + 'would throw on an undefined qbActions');
  }
});

test('the shared config is a file, not an inline script repeated per page', () => {
  for (const f of pages) {
    assert.doesNotMatch(read(f), /<script>\s*window\.QB_QUOTE_ENDPOINT/,
      `${f} sets the quote endpoint from an inline script, which the policy blocks `
      + '(and which was the same line on five pages)');
  }
  const users = pages.filter((f) => /QB_QUOTE_ENDPOINT/.test(externals(read(f)).join('\n')));
  assert.ok(users.length >= 5, `only ${users.length} pages can see the endpoint`);
});
