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
/**
 * Where the marketing site lives, in ONE place.
 *
 * The partials carry {{SITE}} rather than a host, because the answer changes
 * on a known date and a host typed into thirteen pages is thirteen places to
 * miss. This is the calculators' half of QBP-128 — the other half is HOST in
 * quotebot-web's qb-site-src/calculators.mjs, pointing the other way.
 *
 * Today it is the Amplify build, because that is the site these links
 * describe: quote-bot.com still serves the WordPress site, where
 * /privacy-request/ does not exist and /cookie-policy/ is Termly's. Pointing
 * at it would mean two of the six footer links 404 and two more describe
 * policies we have replaced.
 *
 * AT THE DNS CUTOVER: change this to https://quote-bot.com and re-run. That
 * is the whole change, and it is on the cutover checklist.
 */
const SITE_URL = 'https://main.d32nxpxr4k5tgh.amplifyapp.com';

/**
 * Where THESE pages live, which is not where the marketing site lives.
 *
 * SITE_URL above is the site the footer links point AT. This is the address
 * of the page doing the pointing, and it goes in a canonical tag so that the
 * same calculator answering on two hostnames has one authoritative URL.
 * Twelve of the thirteen had no canonical at all, and the thirteenth named
 * this host in markup rather than from here.
 *
 * It points at the CURRENT home on purpose. A canonical naming a URL that
 * does not exist yet is worse than none: it tells a crawler the real address
 * of this page is a 404, and it would say so for however long sits between
 * shipping it and moving the DNS.
 *
 * AT THE DNS CUTOVER: change this to https://quote-bot.com/tools and re-run,
 * in the same commit as SITE_URL above. Both are QBP-128.
 *
 * The paths in these pages are relative, so they resolve at a host root and
 * under a /tools/ prefix alike. This constant is the only thing that has to
 * know which it is.
 */
const CANON_BASE = 'https://tools.quotebot.io';

const part = (f) => fs.readFileSync(path.join(ROOT, 'tools', f), 'utf8')
  .trim()
  .replaceAll('{{SITE}}', SITE_URL);

const TOPBAR = part('topbar.html');
const BRAND = part('brand-header.html');
const FOOTER = part('footer.html');
/* The partials open with an html comment, so a comparison against markup
   sliced from <footer ...> onward never matches and the script rewrites the
   same bytes on every run. Compare against the element, keep the comment. */
const FOOTER_EL = FOOTER.slice(FOOTER.indexOf('<footer'));
const BRAND_EL = BRAND.slice(BRAND.indexOf('<div class="brand-header"'));
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

  /* ---- css, replaced on EVERY run ----
   *
   * This used to be `if (!html.includes(MARK))`, so the block went in once
   * and never again: the partial could change forever and the pages would
   * keep whichever version landed first. Which is precisely the drift this
   * script exists to prevent, and it bit twice in one day -- the footer
   * named a company that does not exist, somebody fixed it in all thirteen
   * pages by hand, and the partial it came from still said the old name.
   * The next run of this tool would have put the wrong name back.
   *
   * The region is delimited now, so replacing it cannot eat page CSS on
   * either side of it. */
  {
    const START = '/* qb:chrome-css:start */';
    const END = '/* qb:chrome-css:end */';
    const from = html.indexOf(START);
    if (from !== -1) {
      const to = html.indexOf(END, from);
      if (to === -1) throw new Error(`${file}: chrome css opens and never closes`);
      const was = html.slice(from, to + END.length);
      if (was !== CSS.trim()) {
        html = html.slice(0, from) + CSS.trim() + html.slice(to + END.length);
        notes.push('css refreshed');
      }
    } else {
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
  }

  /* ---- canonical, so two hostnames do not become two pages ---- */
  {
    /* The landing page canonicalises to the directory, not to index.html:
       that is the URL people link to and the one a server hands back for the
       bare path, so naming the filename would make every inbound link point
       at a non-canonical address. */
    const self = file === 'index.html' ? '/' : `/${file}`;
    const want = `<link rel="canonical" href="${CANON_BASE}${self}">`;
    const has = html.match(/<link rel="canonical"[^>]*>/);
    if (!has) {
      /* After the charset and title rather than at the top of head: a
         canonical is metadata about the document, and the things that decide
         how the document is PARSED come first. */
      const t = html.indexOf('</title>');
      const at = t >= 0 ? t + '</title>'.length : html.indexOf('<head>') + '<head>'.length;
      if (at > 0) { html = `${html.slice(0, at)}\n${want}${html.slice(at)}`; notes.push('canonical added'); }
    } else if (has[0] !== want) {
      html = html.replace(has[0], want);
      notes.push('canonical updated');
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
  } else {
    const bh = html.indexOf('<div class="brand-header"');
    if (bh < 0) {
      const after = html.indexOf(TOPBAR);
      if (after >= 0) {
        const at = after + TOPBAR.length;
        html = `${html.slice(0, at)}\n\n${BRAND}${html.slice(at)}`;
        notes.push('brand header added');
      }
    } else {
      /* Replace rather than patch, so a header already on the page picks up
         everything the partial changes — the logo becoming a file, and the
         host in its link moving at the cutover. Patching only the bits
         somebody thought to patch is how the eleven new pages ended up
         correct while the two old ones still named the wrong host. */
      const end = spanOf(html, bh);
      if (end > 0 && html.slice(bh, end) !== BRAND_EL) {
        html = html.slice(0, bh) + BRAND_EL + html.slice(end);
        notes.push('brand header refreshed');
      }
    }
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
    let f = html.indexOf('<footer');
    const end = spanOf(html, f, 'footer');
    /*
     * Swallow the comments above it, however many there are.
     *
     * The partial opens with `<!-- FOOTER -->` and the replacement used to
     * start at `<footer`, so every run left the previous comment behind and
     * added its own — four of them had stacked up on some pages before anyone
     * looked at the source. Comments are invisible, which is exactly why this
     * kind of thing accumulates.
     */
    let c = html.lastIndexOf('<!-- FOOTER -->', f);
    while (c >= 0 && html.slice(c, f).trim() === '<!-- FOOTER -->') {
      f = c;
      c = html.lastIndexOf('<!-- FOOTER -->', f - 1);
    }
    if (end > 0 && html.slice(f, end).trim() !== FOOTER.trim()) {
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
