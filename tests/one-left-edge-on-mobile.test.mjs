/**
 * ONE LEFT EDGE, ONCE THE COLUMNS STACK.
 *
 * Three calculators use the two-panel shell: a sticky .left-panel of inputs
 * beside a .right-panel of results, inside .page-layout. The shared
 * "one left edge" block gives .page-layout and .calc-hero the same 32px side
 * padding, so the hero and the content line up.
 *
 * The panels then add their own padding INSIDE that. Side by side it reads as
 * the gutter between two columns, which is what it is. Stacked on a phone it
 * is no longer between anything: it just pushes each panel's content further
 * in than the hero above it. Measured on MYGA at 408px before this was fixed:
 *
 *     hero     32     (.calc-hero, from the shared block)
 *     inputs   46     32 + .left-panel's 14
 *     results  52     32 + .right-panel's 20
 *
 * Three left edges down one page -- the staircase the shared block exists to
 * stop, reintroduced one level below it, where that block cannot see it.
 * quotetool has no inner padding on its results column, which is the whole
 * reason it reads as clean on a phone: hero 32, content 32, nothing to notice.
 *
 * This guard resolves what the side padding actually computes to below the
 * stack breakpoint, rather than grepping for a rule that may be losing to a
 * more specific one somewhere else in the file.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const SITE = path.join(import.meta.dirname, '..', 'site');

/* Pages whose panels are flat below the stack. */
const FLAT = ['mygacalculator.html'];

/* Same shell, same staircase, not yet done. A page here that has been fixed
   fails too: move it up to FLAT rather than deleting the assertion, so the
   list cannot quietly rot into "nobody checks these any more". */
const STAIRCASE = [
  'incomefloorcalculator.html',
  'retirementdistributioncalculator.html'
];

const STACK_AT = 900;

/* The @media blocks in force on a phone, plus the top level, in source order.
   A max-width above the stack breakpoint still applies at phone width, so 900
   and 1100 both count; min-width queries are someone else's business. */
function phoneCascade(css) {
  const out = [];
  let i = 0;
  let top = '';
  while (i < css.length) {
    const at = css.indexOf('@media', i);
    if (at === -1) { top += css.slice(i); break; }
    top += css.slice(i, at);

    const open = css.indexOf('{', at);
    if (open === -1) break;
    const query = css.slice(at + 6, open).trim();

    let depth = 1;
    let j = open + 1;
    while (j < css.length && depth > 0) {
      if (css[j] === '{') depth += 1;
      else if (css[j] === '}') depth -= 1;
      j += 1;
    }
    const body = css.slice(open + 1, j - 1);

    const max = /max-width\s*:\s*(\d+)px/.exec(query);
    const min = /min-width\s*:\s*(\d+)px/.exec(query);
    if (max && Number(max[1]) >= STACK_AT && !min) out.push({ query, body });

    i = j;
  }
  out.unshift({ query: '', body: top });   /* top level is always in force */
  return out;
}

/* Specificity of the strongest selector in a comma-separated list that could
   match this element. Only ids and classes matter here -- none of these rules
   put an element type on the panel.
   A ::pseudo-element selector is skipped outright. .left-panel::-webkit-
   scrollbar styles a different box, but a naive count reads the pseudo as a
   second class and scores it 2 -- which, when this guard was first written,
   out-ranked the real .left-panel rules and made them invisible to it. The
   guard then failed on a page that was already correct. */
function weight(selectorList, cls) {
  let best = -1;
  for (const sel of selectorList.split(',')) {
    if (sel.includes('::')) continue;
    /* The SUBJECT -- the last compound -- is what the rule styles.
       `.left-panel .run-btn` mentions the panel and styles the button inside
       it; a plain includes() counted it as a weight-2 rule on the panel
       itself, which then out-ranked and silently discarded every real
       weight-1 rule, including the one under test. The guard reported 14px on
       a page whose CSS says 0. Match the subject, score the whole selector. */
    const subject = sel.trim().split(/[\s>+~]+/).pop() || '';
    if (!subject.includes(cls)) continue;
    const ids = (sel.match(/#[\w-]+/g) || []).length;
    const classes = (sel.match(/[.:[][\w-]+/g) || []).length;
    best = Math.max(best, ids * 100 + classes);
  }
  return best;
}

/* Last-wins among the strongest, over padding shorthand and side longhands. */
function sidePadding(cascade, cls) {
  let strongest = -1;
  let left = null;
  let right = null;

  for (const block of cascade) {
    const rule = /([^{}]+)\{([^}]*)\}/g;
    let m;
    while ((m = rule.exec(block.body))) {
      const w = weight(m[1], cls);
      if (w < 0 || w < strongest) continue;
      strongest = w;
      const decls = m[2];

      const short = /(?:^|;)\s*padding\s*:\s*([^;]+)/.exec(decls);
      if (short) {
        const parts = short[1].trim().split(/\s+/);
        /* 1 value: all. 2 or 3: sides are [1]. 4: right [1], left [3]. */
        const r = parts.length === 1 ? parts[0] : parts[1];
        const l = parts.length === 4 ? parts[3] : r;
        left = l; right = r;
      }
      const pl = /(?:^|;)\s*padding-left\s*:\s*([^;]+)/.exec(decls);
      const pr = /(?:^|;)\s*padding-right\s*:\s*([^;]+)/.exec(decls);
      if (pl) left = pl[1].trim();
      if (pr) right = pr[1].trim();
    }
  }
  return { left, right };
}

function px(v) {
  if (v == null) return null;
  if (/^0(px)?$/.test(v.trim())) return 0;
  const n = /^(-?[\d.]+)px$/.exec(v.trim());
  return n ? Number(n[1]) : NaN;
}

function panelPadding(file) {
  const html = fs.readFileSync(path.join(SITE, file), 'utf8');
  /* Comments out, first. A comment sitting between one rule's } and the next
     rule's selector is swallowed into that selector by any regex that reads
     "everything up to the next {" -- so a prose paragraph mentioning .left-panel
     and the word padding becomes part of the rule, and its dotted words get
     counted as specificity. Measured here: the block comment above the fix
     scored higher than every real rule in the file. */
  const css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)]
    .map((m) => m[1]).join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');
  const cascade = phoneCascade(css);
  return {
    left: sidePadding(cascade, '.left-panel'),
    right: sidePadding(cascade, '.right-panel')
  };
}

for (const file of FLAT) {
  test(`${file}: the panels add nothing to the shell's left edge on a phone`, () => {
    const p = panelPadding(file);
    for (const [name, pad] of Object.entries(p)) {
      assert.equal(px(pad.left), 0,
        `.${name}-panel adds ${pad.left} on the left below ${STACK_AT}px; the ` +
        `hero sits at the shell's 32px, so the content would start further in`);
      assert.equal(px(pad.right), 0,
        `.${name}-panel adds ${pad.right} on the right below ${STACK_AT}px`);
    }
  });
}

for (const file of STAIRCASE) {
  test(`${file}: still has the staircase (move it to FLAT once fixed)`, () => {
    const p = panelPadding(file);
    const flat = px(p.left.left) === 0 && px(p.right.left) === 0;
    assert.equal(flat, false,
      `${file} now lines up on a phone -- move it from STAIRCASE to FLAT so ` +
      `the fix is guarded instead of merely done`);
  });
}
