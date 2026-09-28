/**
 * The consent gate on the calculators.
 *
 * Three things have to hold, and none of them is visible by reading a page.
 *
 * The gate has to load BEFORE the capture script, because capture reads
 * window.qbConsentId() to tie a lead to a choice — and a helper that is not
 * defined yet returns nothing without complaining, so the link would simply
 * never be made and nothing anywhere would say so.
 *
 * It has to be on every calculator. A single page missing it is a page where
 * an analytics tag would either fire unasked or never fire at all, depending
 * which way the omission went.
 *
 * And it has to ship dark: no analytics src configured means no banner, which
 * is right while the tools carry nothing to gate.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const pages = fs.readdirSync(path.join(ROOT, 'site'))
  .filter((f) => f.endsWith('.html'));
const withCapture = pages.filter((f) =>
  fs.readFileSync(path.join(ROOT, 'site', f), 'utf8').includes('quotebot-capture.js'));

test('every calculator that captures leads also loads the consent gate', () => {
  const missing = withCapture.filter((f) =>
    !fs.readFileSync(path.join(ROOT, 'site', f), 'utf8').includes('quotebot-consent.js'));
  assert.deepEqual(missing, [],
    'these pages capture leads with no consent gate loaded');
  assert.ok(withCapture.length >= 13, `expected the full set, found ${withCapture.length}`);
});

test('the gate loads before the capture script that reads it', () => {
  for (const f of withCapture) {
    const html = fs.readFileSync(path.join(ROOT, 'site', f), 'utf8');
    const gate = html.indexOf('quotebot-consent.js');
    const capture = html.indexOf('quotebot-capture.js');
    assert.ok(gate < capture,
      `${f}: capture loads first, so window.qbConsentId() is undefined when it reads it`);
  }
});

test('the gate ships dark — no analytics tag configured', () => {
  /* Turning it on is adding data-analytics-src. That is the same single edit
     the site makes in consent.mjs, and it is the moment the policy pages
     change too. */
  for (const f of withCapture) {
    const html = fs.readFileSync(path.join(ROOT, 'site', f), 'utf8');
    assert.doesNotMatch(html, /data-analytics-src="[^"]+"/,
      `${f} configures an analytics tag — the privacy and cookie policies have to say so in the same release`);
  }
});

test('the capture payload carries the consent id, defensively', () => {
  const js = fs.readFileSync(path.join(ROOT, 'site/js/quotebot-capture.js'), 'utf8');
  assert.match(js, /consentId:/, 'leads no longer carry the consent id');
  /* Read through the helper, not out of storage: one definition of where the
     id lives, and the two files cannot disagree about it. */
  assert.match(js, /typeof window\.qbConsentId === 'function'/,
    'the id should be read through the helper, and tolerate the gate being absent');
});

test('the consent cookie is scoped to the registrable domain, not the origin', () => {
  /* This is the whole reason a choice made on the marketing site is honoured
     on the calculators once both sit on one domain. A cookie without the
     domain attribute is host-only and would silently ask twice. */
  const js = fs.readFileSync(path.join(ROOT, 'site/js/quotebot-consent.js'), 'utf8');
  assert.match(js, /domain=\./, 'the cookie is host-only, so it cannot cross subdomains');
  assert.match(js, /SameSite=Lax/,
    'Strict would drop the answer when arriving from a link, which is how people get here');
});

/* ---- the marketing site's host ------------------------------------------ */

test('every link to the marketing site uses one host, from one place', () => {
  /**
   * These pointed at quote-bot.com, which is still the WordPress site: two of
   * the six footer links 404 there and two more describe policies we have
   * replaced. The host now lives in SITE_URL in tools/apply-chrome.mjs and the
   * partials carry a token, so the cutover is one edit rather than thirteen
   * pages to grep — which is exactly how the brand header came to keep the old
   * host while every footer had moved on.
   */
  const script = fs.readFileSync(path.join(ROOT, 'tools/apply-chrome.mjs'), 'utf8');
  const site = /const SITE_URL = '([^']+)'/.exec(script)?.[1];
  assert.ok(site, 'apply-chrome.mjs no longer declares SITE_URL');
  assert.match(site, /^https:\/\//, 'the marketing site host has to be absolute and https');

  for (const f of pages) {
    const html = fs.readFileSync(path.join(ROOT, 'site', f), 'utf8');
    const hosts = new Set([...html.matchAll(/href="(https:\/\/[^/"]+)[^"]*\/(privacy-policy|terms-of-service|cookie-policy|privacy-request)\//g)]
      .map((m) => m[1]));
    for (const h of hosts) {
      assert.equal(h, site,
        `${f} links to ${h} for a policy page; SITE_URL says ${site}`);
    }
  }
});

test('the partials name no host of their own', () => {
  for (const f of ['footer.html', 'brand-header.html']) {
    const src = fs.readFileSync(path.join(ROOT, 'tools', f), 'utf8');
    assert.doesNotMatch(src, /https:\/\/(quote-bot\.com|[a-z0-9-]+\.amplifyapp\.com)/,
      `tools/${f} hardcodes a host — it should carry {{SITE}}`);
  }
});
