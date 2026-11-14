/**
 * The response headers tools.quote-bot.com sends, and the one it does not.
 *
 * securityheaders.com graded this host F on 14 November 2026. Five of the six
 * were genuinely missing; the sixth is deliberate and this file is where that
 * decision is kept honest.
 *
 * A NOTE ON THAT GRADE, because it will be re-run and misread otherwise: the
 * scan never reached the site. CloudFront answered it 403 -- the report says
 * "Scan was blocked" and the raw headers show HTTP/2 403 -- because the
 * Amplify firewall refuses the scanner. Adding headers does not change that.
 * A real browser gets 200 and these headers.
 *
 *   node --test tests/response-headers.test.mjs
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = new URL('../', import.meta.url);
const YML = readFileSync(fileURLToPath(new URL('customHttp.yml', ROOT)), 'utf8');

function headers() {
  const lines = YML.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    const key = /^\s*- key: '([^']+)'\s*$/.exec(lines[i]);
    if (!key) continue;
    let j = i + 1;
    while (j < lines.length && /^\s*#/.test(lines[j])) j += 1;
    const value = /^\s*value: (.*)$/.exec(lines[j] ?? '');
    out.push({
      key: key[1],
      raw: value ? value[1] : null,
      continued: !!value && !!(lines[j + 1] ?? '').trim()
        && !/^\s*- key:/.test(lines[j + 1]) && !/^\s*#/.test(lines[j + 1]),
    });
  }
  return out;
}

test('THE FIVE HEADERS ARE PRESENT AND DELIVERABLE', () => {
  /*
   * Single-line values, because a header value cannot contain a newline and
   * Amplify drops one that does WITHOUT failing the build. That happened on
   * admin.quote-bot.com the same night: a YAML folded block with indented
   * continuation lines, five headers delivered and the sixth silently absent.
   */
  const hs = headers();
  const keys = hs.map((h) => h.key);
  for (const required of ['Strict-Transport-Security', 'X-Frame-Options',
    'X-Content-Type-Options', 'Referrer-Policy', 'Permissions-Policy']) {
    assert.ok(keys.includes(required), `${required} is missing from customHttp.yml`);
  }
  for (const h of hs) {
    assert.ok(h.raw !== null, `${h.key} has no value line`);
    assert.ok(!h.continued, `${h.key} spans more than one line; Amplify will drop it`);
    assert.ok(!/^[>|]/.test(h.raw.trim()), `${h.key} uses a YAML block scalar`);
  }
});

test('X-Frame-Options does not break an embed that exists', () => {
  /* SAMEORIGIN is safe only while nothing frames these pages cross-origin.
     If a marketing page ever embeds a calculator, this header is what will
     break it, and the failure is a blank box with no error. */
  assert.match(YML, /X-Frame-Options'\s*\n\s*value: 'SAMEORIGIN'/,
    'X-Frame-Options is DENY, which also stops our own pages embedding these');
});

test('THE CSP IS REAL, OR THERE IS NONE', () => {
  /*
   * THE TRAP THIS EXISTS TO CATCH, and it held for the whole conversion.
   * These pages carried hundreds of inline event handlers. A CSP strict
   * enough to be worth having blocks every one, and the site breaks in a way
   * that looks like nothing at all until somebody presses a button.
   *
   * And the escape hatch is worse than the omission: script-src with
   * 'unsafe-inline' permits precisely the injection the header exists to
   * stop, while turning an F into an A on a scanner. A control that reports
   * success is worse than one that is absent.
   *
   * So: no inline handlers, or no CSP. Both is fine. A script-src with
   * 'unsafe-inline' is not.
   *
   * style-src IS allowed 'unsafe-inline'. These pages are inline-styled
   * throughout and the chat widget injects a <style> element; inline CSS
   * cannot execute, and conflating the two would have blocked the whole
   * policy over a risk that is not the one this is about.
   */
  const site = fileURLToPath(new URL('site/', ROOT));
  const inline = readdirSync(site).filter((f) => f.endsWith('.html'))
    .reduce((n, f) => n + (readFileSync(site + f, 'utf8')
      .match(/\son(click|change|input|blur|focus|mouse[a-z]+|submit|load|error)=/gi) || []).length, 0);

  const csp = headers().find((h) => h.key === 'Content-Security-Policy');
  if (!csp) {
    assert.ok(inline > 0,
      'the inline handlers are gone — add the Content-Security-Policy now, and '
      + 'see admin.quote-bot.com/customHttp.yml for the shape of it');
    return;
  }
  assert.equal(inline, 0,
    `a CSP was added while ${inline} inline event handlers remain; the site will `
    + 'break silently on the first button somebody presses');

  const scriptSrc = /(?:^|;)\s*script-src\s+([^;]+)/.exec(csp.raw);
  assert.ok(scriptSrc, 'the CSP sets no script-src, so default-src decides and nobody reading it can tell');
  assert.ok(!/'unsafe-inline'/.test(scriptSrc[1]),
    "script-src allows 'unsafe-inline', which permits the injection it exists to stop");
  assert.ok(!/'unsafe-eval'/.test(scriptSrc[1]), "script-src allows 'unsafe-eval'");
});

test('THE POLICY ADMITS EVERY HOST THESE PAGES ACTUALLY LOAD', () => {
  /*
   * WRITTEN FROM A LIVE BREAKAGE ON quote-bot.com. Its policy shipped
   * without googletagmanager.com; the consent gate loads gtag.js from there
   * once somebody accepts cookies, so the tag was refused and nothing was
   * measured for anyone who consented. The site looked perfect and the
   * scanner said A+.
   *
   * Report-only did not catch it because the tag only loads after a click
   * nobody made while measuring. So this does not wait to observe anything:
   * the hosts are in the shipped files as text, the policy is in this file
   * as text, and a host in the first and not the second is the bug.
   */
  const csp = headers().find((h) => h.key === 'Content-Security-Policy');
  if (!csp) return;

  const directive = (name) => {
    const m = new RegExp(`(?:^|;)\\s*${name}\\s+([^;]+)`).exec(csp.raw);
    return m ? m[1].trim().split(/\s+/) : [];
  };
  const admits = (list, host) => list.some((e) => {
    /* `https:` is a scheme, not an origin -- img-src carries one, and it
       admits every https host there is. new URL('https:') also throws, which
       is how this was noticed. */
    if (e === 'https:' || e === '*') return true;
    if (!e.startsWith('https://')) return false;
    const allowed = new URL(e).host;
    return allowed === host || (allowed.startsWith('*.') && host.endsWith(allowed.slice(1)));
  });

  const jsDir = fileURLToPath(new URL('site/js/', ROOT));
  const site = fileURLToPath(new URL('site/', ROOT));
  const shipped = readdirSync(jsDir).filter((f) => f.endsWith('.js'))
    .map((f) => readFileSync(jsDir + f, 'utf8')).join('\n');

  /*
   * EVERY EXTERNAL HOST NAMED IN SHIPPED CODE, however it is written.
   *
   * An earlier version of this looked for `src: 'https://...'`, which is the
   * shape quotebot-web's consent config uses. This repo builds the same URL
   * by concatenation -- 'https://www.googletagmanager.com/gtag/js?id=' + ID
   * -- so the pattern matched nothing and the test passed while admitting
   * nothing. It was caught by a mutation that should have turned it red and
   * did not, which is the only way a vacuous test ever is caught.
   *
   * So: collect the hosts, and require the policy to admit each one
   * somewhere. Which directive is the right one depends on how the host is
   * used and is not worth parsing; a host the policy has never heard of is
   * the failure that matters, and that is what this sees.
   */
  /*
   * Checked against script-src and connect-src, NOT against every directive.
   *
   * Flattening them all looked thorough and was the opposite: img-src here
   * carries a bare `https:`, which admits every https host in existence, so
   * a flattened list admits everything and the test can never fail. The two
   * directives below carry no such blanket -- and a host named in shipped
   * JavaScript is there to be loaded as a script or fetched, which is
   * exactly what these two govern.
   */
  const LOADABLE = [...directive('script-src'), ...directive('connect-src')];
  const LINKS_ONLY = new Set(['quote-bot.com', 'tools.quote-bot.com', 'www.instagram.com',
    'www.facebook.com', 'x.com', 'www.linkedin.com', 'www.youtube.com',
    'fonts.googleapis.com', 'fonts.gstatic.com', 'www.w3.org', 'schema.org']);

  const seen = new Set();
  for (const m of shipped.matchAll(/https:\/\/([a-z0-9.-]+\.[a-z]{2,})/gi)) {
    const host = m[1].toLowerCase();
    if (LINKS_ONLY.has(host) || seen.has(host)) continue;
    seen.add(host);
    assert.ok(admits(LOADABLE, host),
      `shipped code names https://${host} and no directive in the policy admits it — `
      + 'whatever loads it will be refused, silently, on whatever path reaches it');
  }
  /* Named rather than counted. A count drifts with every host added or
     removed; these two are the ones that must never fall out of the sweep --
     the analytics tag, because omitting it is what broke quote-bot.com, and
     the API, because every page depends on it. */
  for (const must of ['www.googletagmanager.com', 'api.quote-bot.com']) {
    assert.ok(seen.has(must),
      `the sweep no longer finds ${must} in the shipped script — either it moved `
      + 'somewhere this test cannot see, or this has stopped matching the site');
  }

  /*
   * AND THE SCRIPTS THE MARKUP NAMES, which is a different set.
   *
   * The sweep above reads the shipped .js files. Chart.js is named in a
   * <script src> on the retirement distribution page and nowhere else, so
   * dropping cdnjs.cloudflare.com from the policy broke that page's graph
   * and this test said nothing -- caught by a mutation, not by reading.
   */
  for (const f of readdirSync(site).filter((x) => x.endsWith('.html'))) {
    for (const m of readFileSync(site + f, 'utf8').matchAll(/<script[^>]*\ssrc="(https:\/\/[^/"]+)/g)) {
      const host = new URL(m[1]).host;
      assert.ok(admits(directive('script-src'), host),
        `${f} loads a script from ${host} and script-src does not admit it`);
    }
  }

  /* If analytics is configured, the tag must also be able to send. */
  if (/data-analytics-id="G-/.test(readFileSync(site + 'index.html', 'utf8'))) {
    assert.ok(admits(directive('connect-src'), 'www.google-analytics.com'),
      'GA4 is configured but connect-src does not admit google-analytics.com, so '
      + 'the tag loads and its events never leave the browser');
  }
});
