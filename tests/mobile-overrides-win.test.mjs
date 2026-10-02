/**
 * A mobile override actually beats the rule it is overriding.
 *
 *   node --test tests/mobile-overrides-win.test.mjs
 *
 * WHY THIS EXISTS. A media query does not change specificity. Writing
 *
 *     table.proj-table { min-width: 400px }              <- (0,1,1)
 *     @media (max-width:560px){ .proj-table { min-width: 0 } }   <- (0,1,0)
 *
 * leaves the table 400px wide on a phone, and nothing says so. Worse, the
 * same weak rule also set `display:block`, which DID apply because no other
 * rule competed for display — so the override looked like it had worked,
 * and the only way to find out was to measure the rendered width.
 *
 * That is twice in one day: the apply modal had `hidden` losing to
 * `.qbm-grid { display:grid }` for the same reason. Both were invisible to
 * every other check here, because the markup was right and the CSS parsed.
 *
 * This compares specificity directly. It knows nothing about rendering; it
 * only asks whether a rule written to win can win.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(import.meta.dirname, '..');
const SITE = path.join(ROOT, 'site');

/** Every stylesheet the site ships: page <style> blocks and the css dir. */
function sheets() {
  const out = [];
  for (const f of fs.readdirSync(SITE).filter((x) => x.endsWith('.html'))) {
    const html = fs.readFileSync(path.join(SITE, f), 'utf8');
    for (const m of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) out.push([f, m[1]]);
  }
  const cssDir = path.join(SITE, 'css');
  if (fs.existsSync(cssDir)) {
    for (const f of fs.readdirSync(cssDir).filter((x) => x.endsWith('.css'))) {
      out.push([`css/${f}`, fs.readFileSync(path.join(cssDir, f), 'utf8')]);
    }
  }
  return out;
}

/** (ids, classes+attrs+pseudo-classes, elements+pseudo-elements). */
function specificity(sel) {
  const s = sel.replace(/\s*[>+~]\s*/g, ' ').trim();
  const ids = (s.match(/#[\w-]+/g) || []).length;
  const cls = (s.match(/\.[\w-]+|\[[^\]]+\]|:(?!:)[\w-]+/g) || []).length;
  const el = (s.replace(/#[\w-]+|\.[\w-]+|\[[^\]]+\]|:{1,2}[\w-()-]+/g, ' ')
    .match(/\b[a-zA-Z][\w-]*/g) || []).length;
  return [ids, cls, el];
}
const beats = (a, b) => (a[0] !== b[0] ? a[0] > b[0] : a[1] !== b[1] ? a[1] > b[1] : a[2] > b[2]);

/** Rules, split by whether they sit inside a max-width media query. */
function parse(css) {
  const base = [], mobile = [];
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const mediaRe = /@media([^{]*)\{((?:[^{}]|\{[^{}]*\})*)\}/g;
  let rest = stripped, m;
  while ((m = mediaRe.exec(stripped))) {
    const cond = m[1];
    const target = /max-width/.test(cond) ? mobile : base;
    for (const r of m[2].matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      target.push({ sel: r[1].trim(), body: r[2] });
    }
    rest = rest.replace(m[0], '');
  }
  for (const r of rest.matchAll(/([^{}@]+)\{([^{}]*)\}/g)) base.push({ sel: r[1].trim(), body: r[2] });
  return { base, mobile };
}

const props = (body) => [...body.matchAll(/(^|;)\s*([a-z-]+)\s*:/g)].map((x) => x[2]);

test('the sweep still finds stylesheets and mobile rules', () => {
  const all = sheets();
  assert.ok(all.length >= 10, `only ${all.length} stylesheets found`);
  const mobiles = all.reduce((n, [, css]) => n + parse(css).mobile.length, 0);
  assert.ok(mobiles >= 20,
    `only ${mobiles} rules inside max-width media queries, which means this test `
    + 'has stopped matching the CSS rather than the rules having gone');
});

test('NO MOBILE OVERRIDE IS OUTRANKED BY THE RULE IT OVERRIDES', () => {
  const losers = [];
  for (const [file, css] of sheets()) {
    const { base, mobile } = parse(css);

    for (const b of base) {
      for (const bsel of b.sel.split(',').map((s) => s.trim()).filter(Boolean)) {
        const bSpec = specificity(bsel);
        for (const p of props(b.body)) {

          /* Every mobile rule aiming at this thing and this property. A rule
             is judged by its STRONGEST relevant selector, not each one in
             turn: `.x, .scope .x { ... }` wins through its second half, and
             flagging the first would be noise that teaches people to pad
             selector lists. */
          let attempted = false, won = false;
          for (const mob of mobile) {
            if (!props(mob.body).includes(p)) continue;
            for (const msel of mob.sel.split(',').map((s) => s.trim()).filter(Boolean)) {
              if (msel !== bsel && !bsel.endsWith(msel)) continue;
              attempted = true;
              if (/!important/.test(mob.body) || !beats(bSpec, specificity(msel))) won = true;
            }
          }
          if (attempted && !won) {
            losers.push(`${file}: @media override of { ${p} } cannot beat ${bsel}`);
          }
        }
      }
    }
  }
  assert.deepEqual([...new Set(losers)], [],
    'these mobile rules cannot win — a media query does not raise specificity:\n  '
    + [...new Set(losers)].join('\n  '));
});

/*
 * The same clipping MYGA had, still live on these. Each is a wide table (or
 * a chart) inside a narrower column: on a phone the right-hand columns sit
 * off the screen, and because the parent scrolls rather than the page, there
 * is no scrollbar and nothing to say so. Each needs what MYGA got — the
 * table turned into one card per row at the mobile breakpoint — which is a
 * per-page job, since the columns mean different things on each.
 *
 * A name comes off this list when the page is converted, not when somebody
 * is tired of reading it. The assertion below fails if a listed page has
 * been fixed and left here, so the list cannot quietly go stale.
 */
const WIDE_ON_PHONES = [
  'dimeneedscalculator.html: table.detail { min-width: 440px } with no mobile override that wins',
  'fiaincomeridercalculator.html: table.sched { min-width: 520px } with no mobile override that wins',
  'ltcannuitytaxillustration.html: table.year-table { min-width: 470px } with no mobile override that wins',
  'retirementdistributioncalculator.html: table.dist-table { min-width: 560px } with no mobile override that wins',
  'sequenceofreturnscalculator.html: .bar-chart { min-width: 560px } with no mobile override that wins',
  'sequenceofreturnscalculator.html: table { min-width: 600px } with no mobile override that wins',
];

test('NO min-width WIDER THAN A PHONE SURVIVES THE MOBILE BREAKPOINT', () => {
  /* 360px, because the narrowest screen worth supporting is around 320-375
     and these sit inside padded columns narrower still — the MYGA tables
     were min-width:400 inside a 277px parent. */
  const stuck = [];
  for (const [file, css] of sheets()) {
    const { base, mobile } = parse(css);
    for (const b of base) {
      const mw = /(^|;)\s*min-width\s*:\s*(\d+)px/.exec(b.body);
      if (!mw || Number(mw[2]) <= 360) continue;
      for (const bsel of b.sel.split(',').map((s) => s.trim()).filter(Boolean)) {
        const cleared = mobile.some((mob) =>
          /(^|;)\s*min-width\s*:/.test(mob.body)
          && mob.sel.split(',').map((s) => s.trim()).some((msel) =>
            (msel === bsel || bsel.endsWith(msel) || msel.endsWith(bsel))
            && !beats(specificity(bsel), specificity(msel))));
        if (!cleared) stuck.push(`${file}: ${bsel} { min-width: ${mw[2]}px } with no mobile override that wins`);
      }
    }
  }
  const found = [...new Set(stuck)];
  const unlisted = found.filter((x) => !WIDE_ON_PHONES.includes(x));
  assert.deepEqual(unlisted, [],
    'content wider than the phone it has to fit on:\n  ' + unlisted.join('\n  '));

  const fixed = WIDE_ON_PHONES.filter((x) => !found.includes(x));
  assert.deepEqual(fixed, [],
    'these were fixed — take them out of WIDE_ON_PHONES:\n  ' + fixed.join('\n  '));
});

test('A FLEX BASIS IN PX IS RESET WHERE THE ROW BECOMES A COLUMN', () => {
  /*
   * flex-basis is along the main axis, so turning a container to
   * `flex-direction: column` at a breakpoint turns every px basis on its
   * children from a WIDTH into a HEIGHT.
   *
   *   .results-header > :first-child { flex: 1 1 320px }       <- a width
   *   @media (max-width:680px){ .results-header { flex-direction: column } }
   *
   * pinned a text block to 320px tall against ~156px of copy, so the MYGA
   * projection card carried about 164px of empty navy under its last line,
   * on all five pages with a results header. Nothing overflowed, nothing
   * clipped, nothing scrolled: the only symptom was white space, which no
   * other check here can see.
   */
  const offenders = [];
  for (const [file, css] of sheets()) {
    const { base, mobile } = parse(css);

    const columns = mobile
      .filter((r) => /flex-direction\s*:\s*column/.test(r.body))
      .flatMap((r) => r.sel.split(',').map((x) => x.trim()).filter(Boolean));
    if (!columns.length) continue;

    for (const b of base) {
      const basis = /(^|;)\s*flex(?:-basis)?\s*:[^;]*?(\d+)px/.exec(b.body);
      if (!basis || Number(basis[2]) === 0) continue;
      for (const bsel of b.sel.split(',').map((x) => x.trim()).filter(Boolean)) {
        /* A child of a container that becomes a column. */
        if (!columns.some((c) => bsel.startsWith(c + ' ') || bsel === c)) continue;
        const reset = mobile.some((m) =>
          /(^|;)\s*flex(?:-basis)?\s*:/.test(m.body)
          && m.sel.split(',').map((x) => x.trim()).includes(bsel));
        if (!reset) {
          offenders.push(`${file}: ${bsel} keeps a ${basis[2]}px basis where its container turns to a column`);
        }
      }
    }
  }
  assert.deepEqual([...new Set(offenders)], [],
    'a px basis becomes a HEIGHT in a column — reset it in the same media query:\n  '
    + [...new Set(offenders)].join('\n  '));
});
