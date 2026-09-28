/**
 * Apply the site's header top bar and the shared footer links to every
 * calculator.
 *
 * Thirteen pages carry their own copy of the chrome. That is how they were
 * built and it is not being changed today, so the way to keep them consistent
 * is a script that edits all of them rather than a person editing each — the
 * alternative is twelve correct pages and one that nobody noticed.
 *
 *   node tools/apply-chrome.mjs
 *
 * Idempotent: running it twice changes nothing the second time.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(import.meta.dirname, '..');
const SITE = path.join(ROOT, 'site');

/* Lifted verbatim from the built marketing site, so the two match by copy
   rather than by someone eyeballing a hex value. */
const TOPBAR = fs.readFileSync(path.join(ROOT, 'tools/topbar.html'), 'utf8').trim();

/**
 * The css the lifted markup needs.
 *
 * The calculators' own .topbar centred its content and used a slightly
 * different white; the site lays it out as a rail with the message left and
 * the social icons right. Same variables, so the colours come from each page's
 * own palette rather than being pasted in as literals.
 */
const TOPBAR_CSS = `
/* Top bar — matched to the marketing site. Kept in step by tools/apply-chrome.mjs. */
.topbar { background: var(--primary-dark); color: rgba(255,255,255,0.8); font-size: 12.5px; padding: 7px 32px; position: static; display: block; }
.topbar-inner { max-width: 1240px; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.topbar-phone { color: #ff6b6b; }
.topbar a { color: #9ec9f0; font-weight: 600; }
.topbar strong { color: #fff; }
@media (max-width: 700px) {
  .topbar { padding: 7px 20px; }
  .topbar-inner { flex-wrap: wrap; row-gap: 6px; justify-content: center; text-align: center; }
}
`.trim();

const SITE_URL = 'https://quote-bot.com';

/**
 * The footer links.
 *
 * What changed and why:
 *
 *   Acceptable Use Policy is gone. It is terms of service section 6, the whole
 *   of it, and the standalone url now redirects there — a link to a document
 *   that is a section of another document is one more thing to keep in step.
 *
 *   "Do Not Sell" and "Limit The Use of My Sensitive Information" are both
 *   real rights and both are things the request form actually does, so they
 *   point at it rather than at "#". They are named as the statutes name them,
 *   because that is what someone looking for them will scan for.
 *
 *   Cookie Policy was missing entirely.
 *
 *   Consent Preferences stays, and is the one that had to be built rather than
 *   linked: until now the banner could be answered once and there was no way
 *   back to it. Withdrawing has to be as easy as giving.
 */
const FOOTER = `      <div class="footer-links-row">
        <a href="${SITE_URL}/privacy-request/">Do Not Sell or Share My Personal Information</a><span>|</span>
        <a href="${SITE_URL}/privacy-request/">Limit The Use of My Sensitive Information</a>
      </div>
      <div class="footer-links-row">
        <a href="${SITE_URL}/terms-of-service/">Terms of Use</a><span>|</span>
        <a href="${SITE_URL}/privacy-policy/">Privacy Policy</a><span>|</span>
        <a href="${SITE_URL}/cookie-policy/">Cookie Policy</a><span>|</span>
        <button type="button" class="footer-consent-link" onclick="window.qbConsentReopen &amp;&amp; window.qbConsentReopen()">Consent Preferences</button>
      </div>`;

const FOOTER_CSS = `
/* A button, not a link: it changes a setting rather than going anywhere, and a
   link that goes nowhere is one a screen reader still announces as a link.

   The colour is taken from the row's anchors rather than inherited. \`inherit\`
   picks up the footer's body colour, which on a dark footer is nearly the
   background — the control rendered as a smudge beside five legible links. */
.footer-consent-link { background: none; border: 0; padding: 0; font: inherit; cursor: pointer; text-decoration: none; color: rgba(255,255,255,0.7); transition: color var(--transition); }
.footer-consent-link:hover { color: #fff; text-decoration: underline; }
.footer-consent-link:focus-visible { outline: 2px solid #9ec9f0; outline-offset: 2px; }
`.trim();

let changed = 0;
const report = [];
const skipped = [];

for (const file of fs.readdirSync(SITE).filter((f) => f.endsWith('.html'))) {
  const full = path.join(SITE, file);
  let html = fs.readFileSync(full, 'utf8');
  const before = html;
  const notes = [];

  /*
   * Only pages that already HAVE the chrome.
   *
   * Eleven of the thirteen do not: no brand header, no footer link rows, and
   * most without a top bar either. Giving them one is building a page, not
   * editing it, and a script that guesses where the markup goes would produce
   * thirteen pages nobody has looked at. They are listed instead.
   */
  if (!html.includes('footer-links-row') || !html.includes('<div class="topbar"')) {
    skipped.push(file);
    continue;
  }

  /* ---- top bar ---- */
  const open = html.indexOf('<div class="topbar"');
  if (open >= 0) {
    /* Count div depth rather than take the next </div>: the bar has nested
       spans and, in some pages, nested divs. */
    let depth = 0; let i = open; let end = -1;
    const tag = /<div\b[^>]*>|<\/div>/g;
    tag.lastIndex = open;
    for (let m = tag.exec(html); m; m = tag.exec(html)) {
      depth += m[0] === '</div>' ? -1 : 1;
      if (depth === 0) { end = m.index + m[0].length; break; }
    }
    if (end > 0 && html.slice(open, end) !== TOPBAR) {
      html = html.slice(0, open) + TOPBAR + html.slice(end);
      notes.push('topbar');
    }
  }

  /* ---- top bar css: replace the page's own rules with the shared block ---- */
  if (!html.includes('Kept in step by tools/apply-chrome.mjs')) {
    const rules = html.match(/^\.topbar[^\n]*$/gm) || [];
    if (rules.length) {
      html = html.replace(rules[0], TOPBAR_CSS);
      for (const r of rules.slice(1)) html = html.replace(r + '\n', '');
      notes.push('topbar css');
    }
  }

  /* ---- footer links ---- */
  const fOpen = html.indexOf('<div class="footer-links">');
  if (fOpen >= 0) {
    const fEnd = html.indexOf('</div>', html.lastIndexOf('</div>', html.indexOf('<div class="footer-inner"') + 1));
    const rowsStart = html.indexOf('<div class="footer-links-row">', fOpen);
    const rowsEnd = html.lastIndexOf('</div>', html.indexOf('</div>\n  </div>\n</footer>'));
    if (rowsStart > 0 && rowsEnd > rowsStart && !html.includes('qbConsentReopen')) {
      html = html.slice(0, rowsStart) + FOOTER.trimStart() + html.slice(rowsEnd);
      notes.push('footer links');
    }
  }

  if (!html.includes('.footer-consent-link')) {
    const anchor = html.indexOf('</style>');
    if (anchor > 0) {
      html = html.slice(0, anchor) + FOOTER_CSS + '\n' + html.slice(anchor);
      notes.push('footer css');
    }
  }

  if (html !== before) {
    fs.writeFileSync(full, html);
    changed += 1;
    report.push(`  ${file}: ${notes.join(', ')}`);
  }
}

console.log(changed ? `updated ${changed} page(s):` : 'nothing to change');
report.forEach((r) => console.log(r));
if (skipped.length) {
  console.log(`\n${skipped.length} page(s) have no header/footer to update:`);
  skipped.forEach((f) => console.log(`  ${f}`));
  console.log('  These need the chrome BUILT, which is not this script\'s job.');
}
