/**
 * Every page's own script actually parses.
 *
 *   node --test tests/pages-parse.test.mjs
 *
 * WHY THIS EXISTS. These calculators carry their script inline — MYGA alone
 * is about 950 lines of it — and nothing here ever parsed any of it. A
 * missing comma in an object literal left the whole page dead on arrival:
 * no calculation, no modal, no lead capture, nothing. The full suite passed
 * 251 tests over that page, because every one of them reads the HTML as
 * text and asks questions about markup.
 *
 * This is the cheapest possible check and it catches the whole class: a
 * stray comma, an unclosed brace, a quote inside a string nobody escaped.
 * It says nothing about whether the code is right, only that the browser
 * will get as far as running it.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const SITE = path.join(import.meta.dirname, '..', 'site');
const PAGES = fs.readdirSync(SITE).filter((f) => f.endsWith('.html'));

/** The page's own script, with the src= includes left out. */
function inlineScript(html) {
  return [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((m) => m[1])
    .filter((s) => s.trim())
    .join('\n;\n');
}

test('the sweep still finds the pages and their script', () => {
  assert.ok(PAGES.length >= 10, `only ${PAGES.length} pages found`);
  const withScript = PAGES.filter(
    (f) => inlineScript(fs.readFileSync(path.join(SITE, f), 'utf8')).length > 500);
  assert.ok(withScript.length >= 10,
    `only ${withScript.length} pages have inline script, which means this test `
    + 'has stopped matching the site rather than the script having gone');
});

test('EVERY PAGE SCRIPT PARSES', () => {
  const broken = [];
  for (const file of PAGES) {
    const src = inlineScript(fs.readFileSync(path.join(SITE, file), 'utf8'));
    if (!src.trim()) continue;
    try {
      /* Compiled, never run: running it would need a DOM, and whether it
         parses is the whole question. */
      new vm.Script(src, { filename: file });
    } catch (e) {
      broken.push(`${file}: ${e.message}`);
    }
  }
  assert.deepEqual(broken, [], `these pages ship script a browser cannot parse:\n  ${broken.join('\n  ')}`);
});
