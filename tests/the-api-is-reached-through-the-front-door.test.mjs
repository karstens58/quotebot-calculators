import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.join(here, '..', 'site');

/**
 * WHY THIS EXISTS (QBP-4).
 *
 * Every page here talks to three Lambdas: lead capture, the chat widget and
 * the quote engine. Until 13 October they each named a raw
 * `*.lambda-url.us-east-2.on.aws` address, which is the one shape AWS will
 * not let you put a WAF in front of -- so there was no per-IP rate limit on
 * any of them and no way to add one. They now go through
 * api.quote-bot.com, a CloudFront distribution with a web ACL on it.
 *
 * THE FAILURE THIS CATCHES is not a typo. It is somebody copying a working
 * endpoint out of amplify_outputs.json into a new calculator, because that
 * file still names the raw addresses and always will -- it is the backend's
 * record of its own functions. That page would work perfectly, pass every
 * other test here, and quietly sit outside the rate limit. Nothing else
 * would ever say so.
 *
 * links-go-somewhere.test.mjs does not cover this: it reads src and href,
 * and every one of these is a data-endpoint attribute or a JS constant.
 */

const PAGES = fs.readdirSync(SITE).filter((f) => f.endsWith('.html'));
const SCRIPTS = fs.readdirSync(path.join(SITE, 'js')).filter((f) => f.endsWith('.js'));

const read = (p) => fs.readFileSync(path.join(SITE, p), 'utf8');

/* The prefixes the distribution actually routes. A fourth would need a
   behaviour added in quotebot-backend/amplify/backend.ts first, and until
   then it reaches the edge 404 rather than a function. */
const DOORS = new Set(['lead', 'chat', 'quote']);

test('NO PAGE NAMES A RAW FUNCTION URL', () => {
  const bad = [];
  for (const page of PAGES) {
    const hits = read(page).match(/https:\/\/[a-z0-9]+\.lambda-url\.[a-z0-9-]+\.on\.aws/g) ?? [];
    for (const h of new Set(hits)) bad.push(`${page} -> ${h}`);
  }
  assert.deepEqual(bad, [],
    'these bypass the CloudFront distribution and so sit outside the rate '
    + 'limit, however well they work:\n  ' + bad.join('\n  '));
});

test('and no shipped script hard-codes one either', () => {
  const bad = [];
  for (const js of SCRIPTS) {
    const src = read(path.join('js', js));
    /* The usage comment at the top of each file shows a placeholder host in
       angle brackets. That is documentation, not an address. */
    const hits = src.match(/https:\/\/[a-z0-9]+\.lambda-url\.[a-z0-9-]+\.on\.aws/g) ?? [];
    for (const h of new Set(hits)) bad.push(`js/${js} -> ${h}`);
  }
  assert.deepEqual(bad, [], bad.join('\n  '));
});

test('EVERY API ADDRESS IS A DOOR THE DISTRIBUTION ROUTES', () => {
  const bad = [];
  for (const page of PAGES) {
    const hits = read(page).match(/https:\/\/api\.quote-bot\.com[^"'\s)]*/g) ?? [];
    for (const url of new Set(hits)) {
      const first = new URL(url).pathname.split('/').filter(Boolean)[0];
      if (!DOORS.has(first)) bad.push(`${page} -> ${url}`);
    }
  }
  assert.deepEqual(bad, [],
    'the first path segment picks the origin, and these name no door -- they '
    + 'reach the edge 404, not a function:\n  ' + bad.join('\n  '));
});

test('and the three doors are each still reached from somewhere', () => {
  /* The other direction. A rename that quietly dropped every caller of one
     door would pass the tests above by naming nothing wrong. */
  const all = PAGES.map((p) => read(p)).join('\n');
  for (const door of DOORS) {
    assert.ok(all.includes(`https://api.quote-bot.com/${door}`),
      `nothing calls the ${door} door any more — either it moved somewhere `
      + 'this test cannot see, or a caller was lost');
  }
});
