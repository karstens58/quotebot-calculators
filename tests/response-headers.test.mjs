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

test('A CSP IS NOT ADDED WHILE THE INLINE HANDLERS ARE STILL THERE', () => {
  /*
   * THE TRAP THIS EXISTS TO CATCH. These pages carry hundreds of inline
   * event handlers. A CSP strict enough to be worth having blocks every one
   * of them, and the site breaks in a way that looks like nothing at all
   * until somebody presses a button -- exactly how the admin console's
   * deferred stylesheets broke the same night.
   *
   * And the escape hatch is worse than the omission: `script-src` with
   * 'unsafe-inline' permits precisely the injection the header exists to
   * stop, while turning an F into an A on a scanner. A control that reports
   * success is worse than one that is absent.
   *
   * So: either there are no inline handlers, or there is no CSP. Both is
   * fine. A CSP with 'unsafe-inline' is not.
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
  assert.ok(!/unsafe-inline/.test(csp.raw),
    "the CSP allows 'unsafe-inline', which permits the injection it exists to stop");
});
