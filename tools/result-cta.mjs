/**
 * Put the advisor ask against the number.
 *
 *   node tools/result-cta.mjs
 *
 * WHY. Every calculator's only ask sat in a band at the foot of the page,
 * after the results, the chart and the disclaimer. The figure that makes the
 * argument -- the shortfall, the gap, the monthly income -- is at the top of
 * the results header, and the reader's intent peaks the moment it renders.
 * This adds one button to that header. The band at the foot stays: the two
 * are different asks, a quick action against the number and a fuller pitch
 * for whoever reads to the end.
 *
 * Idempotent, like apply-now.mjs: the insert is delimited and replaced on
 * every run, so running this twice does not give a page two buttons. Pages
 * are listed by name and an unlisted one throws, because a calculator that
 * quietly grows a results header should be a decision, not a side effect.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(import.meta.dirname, '..');
const SITE = path.join(ROOT, 'site');

const START = '<!-- qb:result-cta:start -->';
const END = '<!-- qb:result-cta:end -->';

/* The six whose only ask is the advisor. The four here share a
   .results-header; Retirement Distribution and Sequence of Returns have no
   such element and are deliberately absent until they get one. */
const PAGES = [
  'incomefloorcalculator.html',
  'careltccalculator.html',
  'ltcannuitytaxillustration.html',
  'mugcalculator.html'
];

const BUTTON =
  START + '<button type="button" data-qb-advisor class="qb-result-cta">' +
  'Have an advisor design this &rarr;</button>' + END;

/* The closing tag of the element the opening tag at `from` starts. Counting
   rather than regex, because these headers nest two or three divs deep and a
   lazy match closes on the first </div> it meets -- which would drop the
   button inside the title block instead of beside it. */
function closingTagOf(html, from) {
  const open = /<div\b[^>]*>/g;
  const close = /<\/div\s*>/g;
  let depth = 0;
  let i = from;
  for (;;) {
    open.lastIndex = i;
    close.lastIndex = i;
    const o = open.exec(html);
    const c = close.exec(html);
    if (!c) throw new Error('results header opens and never closes');
    if (o && o.index < c.index) { depth += 1; i = o.index + o[0].length; continue; }
    depth -= 1;
    if (depth === 0) return c.index;
    i = c.index + c[0].length;
  }
}

let touched = 0;
for (const file of PAGES) {
  const full = path.join(SITE, file);
  let html = fs.readFileSync(full, 'utf8');

  /* Replace an existing insert rather than adding a second one. */
  const had = html.indexOf(START);
  if (had !== -1) {
    const to = html.indexOf(END, had);
    if (to === -1) throw new Error(file + ': result cta opens and never closes');
    html = html.slice(0, had) + html.slice(to + END.length);
  }

  const m = /<div class="results-header">/.exec(html);
  if (!m) throw new Error(file + ': no .results-header to anchor to');

  const at = closingTagOf(html, m.index);
  html = html.slice(0, at) + BUTTON + html.slice(at);

  fs.writeFileSync(full, html);
  touched += 1;
  console.log('  ' + file);
}
console.log('results-header CTA on ' + touched + ' page' + (touched === 1 ? '' : 's'));
