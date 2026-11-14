/**
 * The 83 inline hover handlers these pages carried are gone, and stay gone.
 *
 * They were `onmouseenter="this.style.background='...'"` pairs -- 75 of them
 * the same five social icons repeated across fourteen pages. Each pair became
 * a class in site/css/qb-hover.css. The point is not tidiness: a
 * Content-Security-Policy without 'unsafe-inline' blocks an inline handler
 * attribute however the element reached the DOM, so every one of these had to
 * go before tools.quote-bot.com could have a CSP at all.
 *
 * The subtle test here is the third one. Moving a hover into a stylesheet is
 * only half the job: the resting value lived in the element's `style=`
 * attribute, and an inline declaration beats any `:hover` rule in a
 * stylesheet no matter how it is written. Leave `background:#fff` inline and
 * `.hv-x:hover { background:#eee }` never fires -- silently, with no error
 * anywhere. So the converter removed each property the class sets from the
 * inline style, and this asserts it stayed removed.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGES = [
  ...fs.readdirSync(path.join(ROOT, 'site')).filter((f) => f.endsWith('.html')).map((f) => `site/${f}`),
  ...fs.readdirSync(path.join(ROOT, 'tools')).filter((f) => f.endsWith('.html')).map((f) => `tools/${f}`),
];
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/* Comments are prose, not code. Nothing in these files quotes a handler
   today, but a note explaining why they were removed is exactly the sort of
   thing somebody adds later, and it must not fail the build for saying so. */
const stripComments = (html) => html.replace(/<!--[\s\S]*?-->/g, '');

const HOVER_CSS = read('site/css/qb-hover.css');
const LINK = 'css/qb-hover.css';

test('no page carries an inline hover handler', () => {
  const offenders = [];
  for (const p of PAGES) {
    const hits = stripComments(read(p)).match(/\sonmouse(?:enter|leave|over|out)\s*=/gi) || [];
    if (hits.length) offenders.push(`${p} (${hits.length})`);
  }
  assert.deepEqual(offenders, [], `inline hover handlers are back in: ${offenders.join(', ')}`);
});

test('the check above can actually fail', () => {
  /* A test that cannot fail is decoration. Prove this one bites. */
  const sample = '<a class="hv-social" onmouseenter="this.style.color=\'#fff\'">x</a>';
  assert.match(sample, /\sonmouse(?:enter|leave|over|out)\s*=/i);
  assert.doesNotMatch(stripComments(`<!-- ${sample} -->`), /\sonmouse(?:enter|leave|over|out)\s*=/i,
    'a handler quoted inside a comment must not count as a live one');
});

test('no element keeps an inline value for a property its hover class sets', () => {
  /* Build {class -> properties the resting rule sets} straight from the
     stylesheet, so this follows the CSS rather than a list copied beside it. */
  const owns = new Map();
  for (const m of HOVER_CSS.matchAll(/^\.(hv-[a-z0-9-]+)(?:,\s*\.[a-z0-9-]+)*\s*\{([^}]*)\}/gm)) {
    const props = [...m[2].matchAll(/([a-z-]+)\s*:/g)].map((x) => x[1]);
    owns.set(m[1], [...new Set([...(owns.get(m[1]) || []), ...props])]);
  }
  assert.ok(owns.size >= 9, `expected the nine hover classes, parsed ${owns.size}`);

  const offenders = [];
  for (const p of PAGES) {
    for (const tag of stripComments(read(p)).matchAll(/<[a-zA-Z][\w-]*\b[^>]*\bclass="([^"]*\bhv-[^"]*)"[^>]*>/g)) {
      const style = tag[0].match(/\sstyle="([^"]*)"/);
      if (!style) continue;
      const declared = new Set([...style[1].matchAll(/(?:^|;)\s*([a-z-]+)\s*:/g)].map((x) => x[1]));
      for (const cls of tag[1].split(/\s+/).filter((c) => c.startsWith('hv-'))) {
        for (const prop of owns.get(cls) || []) {
          /* `border-color` in the class vs a `border:` shorthand inline is the
             same collision wearing a different name -- the shorthand sets the
             colour too. The converter split those into width and style. */
          const clash = declared.has(prop) || (prop === 'border-color' && declared.has('border'));
          if (clash) offenders.push(`${p}: .${cls} sets ${prop}, element still declares it inline`);
        }
      }
    }
  }
  assert.deepEqual(offenders, [], offenders.join('\n'));
});

test('every page using a hover class links the stylesheet that defines it', () => {
  const offenders = [];
  for (const p of PAGES.filter((f) => f.startsWith('site/'))) {
    const html = read(p);
    if (/class="[^"]*\bhv-/.test(html) && !html.includes(LINK)) offenders.push(p);
  }
  assert.deepEqual(offenders, [], `uses hover classes without linking ${LINK}: ${offenders.join(', ')}`);
});

test('every hover class used is defined, and every class defined is used', () => {
  const used = new Set();
  for (const p of PAGES) {
    for (const m of read(p).matchAll(/class="([^"]*)"/g)) {
      for (const c of m[1].split(/\s+/)) if (c.startsWith('hv-')) used.add(c);
    }
  }
  const defined = new Set([...HOVER_CSS.matchAll(/\.(hv-[a-z0-9-]+)/g)].map((m) => m[1]));
  assert.deepEqual([...used].filter((c) => !defined.has(c)), [], 'used but undefined');
  assert.deepEqual([...defined].filter((c) => !used.has(c)), [], 'defined but unused -- dead CSS');
});

test('each hover class defines a resting value for every property it hovers', () => {
  /* The reason the resting value cannot live in the `style=` attribute is the
     reason it must live here instead: with the inline declaration removed,
     a class that only has a :hover rule has nothing to hover back to. */
  const rest = new Map();
  const hover = new Map();
  for (const m of HOVER_CSS.matchAll(/^((?:\.[a-z0-9-]+(?::hover)?,?\s*)+)\{([^}]*)\}/gm)) {
    const props = [...m[2].matchAll(/([a-z-]+)\s*:/g)].map((x) => x[1]);
    for (const sel of m[1].split(',').map((s) => s.trim()).filter(Boolean)) {
      const cls = sel.replace(/^\./, '').replace(/:hover$/, '');
      const bag = sel.endsWith(':hover') ? hover : rest;
      bag.set(cls, [...new Set([...(bag.get(cls) || []), ...props])]);
    }
  }
  const offenders = [];
  for (const [cls, props] of hover) {
    for (const prop of props) {
      if (!(rest.get(cls) || []).includes(prop)) offenders.push(`.${cls}:hover sets ${prop} with no resting value`);
    }
  }
  assert.deepEqual(offenders, [], offenders.join('\n'));
});
