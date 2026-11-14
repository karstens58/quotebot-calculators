/**
 * The agentless quote page is served, and nothing points at it.
 *
 * THAT IS THE WHOLE GATE while Assurity's display approval is pending, and it
 * is the kind of gate that disappears by accident. Somebody adds the page to
 * the index because it looks missing, or a sitemap starts listing everything
 * in site/, and a consumer runs a real quote against Assurity's TEST
 * environment without anyone deciding that should happen.
 *
 * So the arrangement is asserted rather than remembered. Scott's call, 14
 * November: a saved URL for testing rather than a PIN.
 *
 * WHEN ASSURITY APPROVE THE DISPLAY all of this goes, in the commit that
 * links the page from the index — along with the noindex and the comment at
 * the top of the page. The matching half lives in quotebot-backend
 * (carrierbases.test.mjs), which ties main's carrier environment to the
 * display record in one assertion; this file cannot see that repository, so
 * it names it instead.
 *
 *   node --test tests/agentless-is-unlisted.test.mjs
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SITE = fileURLToPath(new URL('../site/', import.meta.url));
const PAGE = 'agentlessquote.html';
const HTML = readFileSync(SITE + PAGE, 'utf8');

test('IT IS SERVED — the point is a URL that can be saved', () => {
  assert.ok(existsSync(SITE + PAGE),
    'the page is not in site/, so tools.quote-bot.com does not serve it at all');
});

test('AND NOTHING IN THE SITE LINKS TO IT', () => {
  /*
   * Every href in every other page, not just the index. A "Try the agentless
   * quote" button added to a calculator is the likeliest way this ends, and
   * it would not look like a mistake to whoever added it.
   */
  const linking = readdirSync(SITE)
    .filter((f) => f.endsWith('.html') && f !== PAGE)
    .filter((f) => new RegExp(`href="[^"]*${PAGE}`).test(readFileSync(SITE + f, 'utf8')));

  assert.deepEqual(linking, [],
    `${linking.join(', ')} links to ${PAGE}, which is unlisted until Assurity `
    + 'approve the display — see the comment at the top of the page');
});

test('nor does any sitemap or robots file', () => {
  /* Neither exists today. The test is for the day one is added by a tool
     that lists everything in site/ without being asked. */
  for (const f of ['sitemap.xml', 'robots.txt']) {
    if (!existsSync(SITE + f)) continue;
    assert.ok(!readFileSync(SITE + f, 'utf8').includes(PAGE),
      `${f} lists ${PAGE}`);
  }
});

test('IT TELLS CRAWLERS NOT TO INDEX IT, BECAUSE UNLINKED IS NOT UNREACHABLE', () => {
  /*
   * A referrer header, a pasted link, a crawler that saw the URL once. "Nobody
   * linked to it" is not a robots instruction, and the card this page carries
   * means a pasted link renders properly — which is exactly how it will be
   * shared while it is being tested.
   */
  const robots = /<meta\s+name="robots"\s+content="([^"]*)"/i.exec(HTML);
  assert.ok(robots, 'the page carries no robots meta');
  assert.match(robots[1], /\bnoindex\b/, `robots content is "${robots[1]}"`);
  assert.match(robots[1], /\bnofollow\b/, `robots content is "${robots[1]}"`);
});

test('and it says, in the page, why it is arranged this way', () => {
  /* The arrangement is temporary and deliberate. A temporary state with no
     explanation attached is a permanent one nobody can safely undo. */
  assert.match(HTML, /UNLISTED ON PURPOSE/,
    'nothing in the page explains why it is unlinked — the next person will '
    + 'either link it or delete it');
  assert.match(HTML, /TEST ENVIRONMENT/,
    'the page does not record that its rates come from Assurity’s sandbox');
});
