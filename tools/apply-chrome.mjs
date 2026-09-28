/**
 * Give every calculator the same header and footer.
 *
 *   node tools/apply-chrome.mjs
 *
 * Thirteen pages carry their own copy of the chrome — that is how they were
 * built, and changing it is a bigger job than today's. So the way to keep them
 * consistent is a script that edits all of them rather than a person editing
 * each, because the alternative is twelve correct pages and one nobody noticed.
 *
 * Two of the thirteen had the chrome. The other eleven had no brand header and
 * no footer at all, and most had no top bar either — so this both FIXES and
 * ADDS, which is why every step checks for what it is about to insert first.
 * Idempotent: running it twice changes nothing the second time.
 *
 * The partials beside this file are the source of truth. The top bar is lifted
 * verbatim from the marketing site's own build rather than matched by eye.
 *
 * Logos are files rather than inlined base64. They were base64 on the two
 * pages that had them, at 97kB of markup each — carrying that into eleven more
 * pages would have added a megabyte of duplicated image to the repo and to
 * every page load, to show one logo that a browser would otherwise cache once.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(import.meta.dirname, '..');
const SITE = path.join(ROOT, 'site');
const part = (f) => fs.readFileSync(path.join(ROOT, 'tools', f), 'utf8').trim();

const TOPBAR = part('topbar.html');
const BRAND = part('brand-header.html');
const FOOTER = part('footer.html');
/* The partials open with an html comment, so a comparison against markup
   sliced from <footer ...> onward never matches and the script rewrites the
   same bytes on every run. Compare against the element, keep the comment. */
const FOOTER_EL = FOOTER.slice(FOOTER.indexOf('<footer'));
const CSS = part('chrome.css');
const MARK = 'Kept in step by tools/apply-chrome.mjs';

/**
 * Pages that carry their own branding and so do not get the brand header.
 *
 * The landing page's hero holds the logo itself, so a brand header above it
 * put the same mark twice within sixty pixels. The calculators are the other
 * way round — their heroes are a title and a subtitle, so the brand header is
 * the only thing identifying whose tool you are using, and it stays.
 */
const NO_BRAND_HEADER = new Set(['index.html']);

/** Replace the element starting at `open`, counting depth so nesting survives. */
function spanOf(html, open, tag = 'div') {
  const re = new RegExp(`<${tag}\\b[^>]*>|</${tag}>`, 'g');
  re.lastIndex = open;
  let depth = 0;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    depth += m[0].startsWith('</') ? -1 : 1;
    if (depth === 0) return m.index + m[0].length;
  }
  return -1;
}

let changed = 0;
const report = [];

for (const file of fs.readdirSync(SITE).filter((f) => f.endsWith('.html'))) {
  const full = path.join(SITE, file);
  let html = fs.readFileSync(full, 'utf8');
  const before = html;
  const notes = [];

  /* ---- css, once, before anything references it ---- */
  if (!html.includes(MARK)) {
    /* Drop the page's own copies of the rules this block replaces, so the
       later definition does not lose to an earlier, more specific one. */
    const owned = /^(\.topbar[^\n]*|\.brand-header[^\n]*|\.brand-header-inner[^\n]*|\.brand-logo-img[^\n]*|footer \{[^\n]*|\.footer-[^\n]*)$/gm;
    html = html.replace(owned, '');
    const close = html.indexOf('</style>');
    if (close > 0) {
      html = `${html.slice(0, close)}\n${CSS}\n${html.slice(close)}`;
      notes.push('css');
    }
  }

  /* ---- top bar ---- */
  const tb = html.indexOf('<div class="topbar"');
  if (tb >= 0) {
    const end = spanOf(html, tb);
    if (end > 0 && html.slice(tb, end) !== TOPBAR) {
      html = html.slice(0, tb) + TOPBAR + html.slice(end);
      notes.push('topbar replaced');
    }
  } else {
    const body = html.match(/<body[^>]*>/);
    if (body) {
      html = html.slice(0, body.index + body[0].length)
        + '\n\n' + TOPBAR + html.slice(body.index + body[0].length);
      notes.push('topbar added');
    }
  }

  /* ---- brand header, directly under the top bar ---- */
  if (NO_BRAND_HEADER.has(file)) {
    const bh = html.indexOf('<div class="brand-header"');
    if (bh >= 0) {
      const end = spanOf(html, bh);
      /* Take the comment above it too, so removing it leaves no orphan. */
      const c = html.lastIndexOf('<!-- BRAND HEADER -->', bh);
      const from = c >= 0 && bh - c < 40 ? c : bh;
      if (end > 0) { html = html.slice(0, from) + html.slice(end); notes.push('brand header removed'); }
    }
  } else if (!html.includes('class="brand-header"')) {
    const after = html.indexOf(TOPBAR);
    if (after >= 0) {
      const at = after + TOPBAR.length;
      html = `${html.slice(0, at)}\n\n${BRAND}${html.slice(at)}`;
      notes.push('brand header added');
    }
  } else {
    /* Present but inlining its logo: swap in the file. */
    html = html.replace(
      /<img class="brand-logo-img"[^>]*src="data:image\/png;base64,[A-Za-z0-9+/=]+"[^>]*>/,
      '<img class="brand-logo-img" src="/img/quotebot-logo.png" alt="Quote-Bot" width="670" height="211">');
    if (html !== before) notes.push('brand logo -> file');
  }

  /* ---- footer, last thing in the body ---- */
  const hasFooter = html.includes('<footer');
  if (!hasFooter) {
    const close = html.lastIndexOf('</body>');
    if (close > 0) {
      html = `${html.slice(0, close)}\n${FOOTER}\n\n${html.slice(close)}`;
      notes.push('footer added');
    }
  } else {
    const f = html.indexOf('<footer');
    const end = spanOf(html, f, 'footer');
    if (end > 0 && html.slice(f, end).trim() !== FOOTER_EL) {
      html = html.slice(0, f) + FOOTER + html.slice(end);
      notes.push('footer replaced');
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
