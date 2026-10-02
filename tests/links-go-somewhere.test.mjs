/**
 * No page may link to a host we do not serve.
 *
 *   node --test tests/links-go-somewhere.test.mjs
 *
 * WHY THIS EXISTS. Thirteen buttons across nine calculators pointed at
 * app.quotebot.io, a host that does not exist. They were the Apply Now in
 * every rate card and the "Help Me With My Plan" band at the foot of the
 * page -- the highest-intent click on the whole site, and the one nobody who
 * works here ever presses, because we already know what the tools say. So it
 * could be dead indefinitely with nothing to catch it: the pages render, the
 * tests pass, the deploy is green, and the only person who finds out is the
 * one who wanted to buy something.
 *
 * A link checker that fetches is the wrong instrument -- it needs the network
 * in CI, it goes red when somebody else's site has a bad morning, and a
 * flaky gate gets switched off. This asks a narrower question with a certain
 * answer: is the host one we have decided to point at? A typo, a dead
 * internal host and a copy-paste from a half-built app all fail it; a
 * legitimate new destination fails it exactly once, until somebody adds it
 * here on purpose.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

const SITE = path.join(import.meta.dirname, '..', 'site');
const PAGES = fs.readdirSync(SITE).filter((f) => f.endsWith('.html'));

/**
 * Hosts a page is allowed to name. Everything here is either ours, a CDN the
 * pages load from, or a social profile the footer links to.
 *
 * `main.d32nxpxr4k5tgh.amplifyapp.com` is the marketing site's Amplify build
 * and is deliberately temporary -- apply-chrome.mjs carries the note about
 * swapping it for quote-bot.com at the DNS cutover. It is listed rather than
 * patterned so that the cutover changes this file too, which is the point.
 */
const ALLOWED = new Set([
  'quotebot.io', 'tools.quotebot.io',
  'quote-bot.com', 'www.quote-bot.com',
  'main.d32nxpxr4k5tgh.amplifyapp.com',
  'fonts.googleapis.com', 'fonts.gstatic.com', 'cdnjs.cloudflare.com',
  'www.facebook.com', 'www.instagram.com', 'www.linkedin.com',
  'www.youtube.com', 'x.com',
]);

/** Every absolute http(s) host named by a src or href, with its page. */
function hostsIn(file) {
  const src = fs.readFileSync(path.join(SITE, file), 'utf8');
  const out = [];
  const re = /(?:src|href)="(https?:\/\/[^"]+)"/gi;
  let m;
  while ((m = re.exec(src))) {
    try { out.push(new URL(m[1]).host); } catch { out.push(m[1]); }
  }
  return out;
}

test('EVERY ABSOLUTE LINK NAMES A HOST WE SERVE', () => {
  const bad = [];
  for (const page of PAGES) {
    for (const host of new Set(hostsIn(page))) {
      if (!ALLOWED.has(host)) bad.push(`${page} -> ${host}`);
    }
  }
  assert.deepEqual(bad, [],
    'these point somewhere we have not decided to point:\n  ' + bad.join('\n  '));
});

test('and app.quotebot.io in particular is gone and stays gone', () => {
  /*
   * Named on its own because it is the one that actually happened, and
   * because it reads like a real host -- which is why thirteen of them
   * survived review. A future copy-paste from the same source is caught by
   * the test above; this one says why out loud.
   */
  for (const page of PAGES) {
    const src = fs.readFileSync(path.join(SITE, page), 'utf8');
    assert.ok(!/app\.quotebot\.io/.test(src),
      `${page} points at app.quotebot.io, which does not exist`);
  }
});

test('the highest-intent buttons open something rather than going somewhere', () => {
  /*
   * The regression this pair is really guarding. An Apply Now that is an
   * anchor is an Apply Now that leaves, and leaving is how it came to be
   * pointed at nothing. They are buttons now, and a button cannot rot into
   * a dead URL.
   */
  for (const page of PAGES) {
    const src = fs.readFileSync(path.join(SITE, page), 'utf8');
    const anchors = src.match(/<a\b[^>]*>\s*(?:&#\d+;|\s)*Apply Now/gi) || [];
    assert.deepEqual(anchors, [],
      `${page} has an Apply Now that is a link rather than a button`);
  }
});

test('EVERY SELECT AND APPLY BUTTON IS WIRED TO SOMETHING', () => {
  /*
   * The quote tool's two Select buttons did nothing at all -- no handler, no
   * href, no listener. Press one and the page sat there. That is harder to
   * notice than a dead link, because a dead link at least navigates
   * somewhere and shows an error; a dead button looks like a slow page, so
   * the visitor presses it again and then leaves.
   *
   * Any button wearing the class that means "choose this one" has to carry
   * data-qb-apply. A new rate card copied from an old one fails here rather
   * than in front of somebody who wanted to buy.
   */
  const bad = [];
  for (const page of PAGES) {
    const src = fs.readFileSync(path.join(SITE, page), 'utf8');
    const re = /<button\b[^>]*class="[^"]*\bselect-btn\b[^"]*"[^>]*>/gi;
    let m;
    while ((m = re.exec(src))) {
      if (!/data-qb-apply/.test(m[0])) bad.push(`${page}: ${m[0].slice(0, 70)}…`);
    }
  }
  assert.deepEqual(bad, [],
    'these look like a choose-this button and do nothing:\n  ' + bad.join('\n  '));
});
