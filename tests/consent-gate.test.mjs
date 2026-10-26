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

/*
 * THE GATE IS NO LONGER DARK — QBP-324.
 *
 * This used to assert the opposite: that no page configured an analytics
 * tag, because none did, and its comment said turning it on was the moment
 * the policy pages change too. They changed in the same commit as this.
 *
 * What replaces it is the harder half. "No tag anywhere" is one condition.
 * "The same tag, on every page, matching the other site" is three, and the
 * ways it comes apart are all quiet ones: twelve pages measured and the
 * thirteenth not, or a typo in an id that produces a tag which loads
 * perfectly and reports to nothing.
 */

const ID = /^G-[A-Z0-9]{8,}$/;

test('EVERY page configures analytics, and all of them the same one', () => {
  const ids = new Map();
  for (const f of withCapture) {
    const html = fs.readFileSync(path.join(ROOT, 'site', f), 'utf8');
    const m = /data-analytics-id="([^"]*)"/.exec(html);
    assert.ok(m, `${f} configures no analytics id, so this page alone measures nothing`);
    assert.match(m[1], ID,
      `${f} has id "${m[1]}", which is not a GA4 measurement id — the tag would `
      + 'load and report to nothing');
    ids.set(m[1], (ids.get(m[1]) ?? 0) + 1);
  }
  assert.equal(ids.size, 1,
    `the pages report to ${ids.size} different streams: ${[...ids.keys()].join(', ')}`);
});

test('THE ID MATCHES THE MARKETING SITE, or the session breaks at the hop', () => {
  /*
   * The two sites share a stream on purpose. The calculators are a
   * subdomain of quote-bot.com, so the _ga cookie is already shared; what
   * makes a visitor who reads a guide and then opens a calculator ONE
   * visit rather than two is that both pages report to the same property.
   *
   * A drifted id does not break anything visibly. Both sites measure, both
   * dashboards fill, and the journey between them is simply never joined —
   * which is the one question the whole arrangement was set up to answer.
   *
   * SKIPPED when the sibling repo is not checked out, as the other
   * cross-repo tests here are: CI for this repo clones only this repo.
   */
  const sibling = path.join(ROOT, '..', 'quotebot-web', 'qb-site-src', 'consent.mjs');
  if (!fs.existsSync(sibling)) {
    console.log('  (quotebot-web is not checked out beside this repo — skipped)');
    return;
  }
  const theirs = /GA4_MEASUREMENT_ID\s*=\s*'([^']+)'/
    .exec(fs.readFileSync(sibling, 'utf8'))?.[1];
  assert.ok(theirs, 'quotebot-web no longer exports GA4_MEASUREMENT_ID');

  const mine = /data-analytics-id="([^"]*)"/
    .exec(fs.readFileSync(path.join(ROOT, 'site', withCapture[0]), 'utf8'))?.[1];
  assert.equal(mine, theirs,
    `the calculators report to ${mine} and quote-bot.com reports to ${theirs}, `
    + 'so a visit that crosses between them counts as two');
});

test('the gate knows how to start the tag it is given', () => {
  /*
   * gtag.js on its own does nothing. Loading it without the dataLayer
   * bootstrap gives a script tag, no error, and no measurement — the
   * failure that looks exactly like success, and the reason the id is
   * passed rather than a bare src.
   */
  const js = fs.readFileSync(path.join(ROOT, 'site/js/quotebot-consent.js'), 'utf8');
  assert.match(js, /analytics-id/,
    'the gate ignores data-analytics-id, so every page configures nothing');
  assert.match(js, /dataLayer\.push\(arguments\)/,
    'the gtag shim must push the Arguments object — an array loads cleanly '
    + 'and measures nothing');
  assert.match(js, /allow_google_signals:\s*false/,
    'the tag does not disable Google Signals, which privacy policy section 8 '
    + 'relies on being off');
});

test('THE FOOTER CONSENT LINK REACHES SOMETHING', () => {
  /*
   * Every page has had a "Consent Preferences" button calling
   * window.qbConsentReopen() in its footer, and the function did not
   * exist. The onclick guards itself with `&&`, so the button did nothing
   * and said nothing — harmless while there was no banner to reopen, and a
   * dead control the day there is one. Withdrawing has to be as easy as
   * agreeing, and the policy now promises exactly this button.
   */
  const js = fs.readFileSync(path.join(ROOT, 'site/js/quotebot-consent.js'), 'utf8');
  const callers = withCapture.filter((f) =>
    fs.readFileSync(path.join(ROOT, 'site', f), 'utf8').includes('qbConsentReopen'));
  assert.ok(callers.length >= 13,
    `only ${callers.length} pages offer a way to change your mind`);
  assert.match(js, /window\.qbConsentReopen\s*=/,
    'the footer calls window.qbConsentReopen on every page and nothing defines it');
});

test('the banner points at a cookie policy that exists', () => {
  /* This script runs on the tools subdomain and the policy lives on the
     marketing site. A root-relative href here is a 404 inside the one
     dialog whose whole purpose is to be read before answering. */
  const js = fs.readFileSync(path.join(ROOT, 'site/js/quotebot-consent.js'), 'utf8');
  const hrefs = [...js.matchAll(/href="([^"]*cookie-policy[^"]*)"/g)].map((m) => m[1]);
  assert.ok(hrefs.length, 'the banner no longer links to the cookie policy');
  for (const h of hrefs) {
    assert.match(h, /^https:\/\/quote-bot\.com\//,
      `the banner links to ${h}, which does not exist on this host`);
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

const BEACON_FILE = 'site/js/quotebot-consent.js';
test('THE BEACON USES A CONTENT TYPE A BROWSER WILL ACTUALLY SEND', () => {
  /*
   * QBP-326. The consent beacon said 'application/json' and not one
   * choice was ever recorded, in any browser.
   *
   * The endpoint is on api.quote-bot.com and the pages are not, so every
   * one of these is cross-origin. application/json is not a CORS-safelisted
   * content type, so it requires a preflight — and a beacon cannot be
   * preflighted. The browser queues it, sendBeacon returns TRUE, and the
   * request is then dropped with no error, no console warning and no
   * network entry to find.
   *
   * WHY THIS NEEDS A TEST AND NOT A COMMENT: every layer reported success.
   * The banner closed, the choice was stored and honoured, the endpoint
   * was correct and answered a plain fetch properly, and the recording
   * call is deliberately written to swallow failures — "the server copy is
   * evidence, and is allowed to fail". That is right for a network blip
   * and it is exactly what hid this. Nothing anywhere could have gone red.
   *
   * Only the three safelisted types can be used here. Reverting to JSON
   * looks tidier and silently stops the evidence log for everybody.
   */
  const js = fs.readFileSync(path.join(ROOT, BEACON_FILE), 'utf8');

  const beacon = /navigator\.sendBeacon\([^)]*type:\s*TYPE[^)]*\)/.test(js)
    || /navigator\.sendBeacon\([^)]*text\/plain[^)]*\)/.test(js);
  assert.ok(beacon,
    'the consent beacon no longer sends a text/plain Blob — if it is back on '
    + 'application/json the browser will drop it and record nothing');

  /* The declared type itself, wherever it is bound. */
  const type = /TYPE\s*=\s*'([^']+)'/.exec(js)?.[1] ?? '';
  const SAFELISTED = ['text/plain', 'application/x-www-form-urlencoded',
    'multipart/form-data'];
  assert.ok(SAFELISTED.some((t) => type.startsWith(t)),
    `the beacon content type is "${type}", which is not CORS-safelisted, so `
    + 'it needs a preflight and a beacon cannot be preflighted');

  assert.doesNotMatch(js, /sendBeacon\([^)]*application\/json/,
    'a beacon sending application/json is dropped by the browser before it '
    + 'reaches the endpoint');
});
