/**
 * The footer names the right companies, on every page.
 *
 * WHY THIS FILE EXISTS. Thirteen calculators carried
 * "Copyright (c) 2026 Quote Bot LLC" — an entity that appears nowhere else
 * in any of these repositories and is not one of the two real companies.
 * Meanwhile quote-bot.com said "QB Insurance LLC" 114 times and the
 * published privacy policy told visitors, in as many words, that QB
 * Insurance LLC decides how their information is used and Broker Backoffice
 * LLC merely operates the platform on its behalf.
 *
 * So the footer contradicted the privacy policy two clicks away, on a
 * licensed insurance site, in the one line that exists to say who is
 * legally behind the page. Nothing failed, nothing looked wrong, and it
 * took a redesign of a different page to notice.
 *
 * A copyright line is not something to leave to whoever copies the next
 * page from the last one.
 *
 *   node --test tests/footer-entities.test.mjs
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const site = join(dirname(fileURLToPath(import.meta.url)), '..', 'site');
const pages = readdirSync(site).filter((f) => f.endsWith('.html'));

/** The publisher of the site: the entity a visitor is dealing with. */
const COPYRIGHT = 'Copyright &copy; 2026 QB Insurance LLC.';
/** The affiliate that operates the platform — named, but not as the owner. */
const PLATFORM = 'Platform by Broker Backoffice LLC';

test('THERE ARE PAGES TO CHECK', () => {
  /* Checked on its own, because a glob that quietly matches nothing is how
     a guard stops guarding without ever failing. */
  assert.ok(pages.length >= 10, `only ${pages.length} pages found in site/`);
});

test('EVERY PAGE CREDITS QB INSURANCE LLC, AND NAMES THE PLATFORM SEPARATELY', () => {
  const wrong = [];
  for (const name of pages) {
    const html = readFileSync(join(site, name), 'utf8');
    if (!html.includes(COPYRIGHT)) wrong.push(`${name}: no "${COPYRIGHT}"`);
    if (!html.includes(PLATFORM)) wrong.push(`${name}: no "${PLATFORM}"`);
  }
  assert.deepEqual(wrong, [], `\n${wrong.join('\n')}\n`);
});

test('and no page claims copyright for an entity that does not exist', () => {
  /*
   * "Quote Bot LLC" is the brand with LLC bolted on. It is nobody. Broker
   * Backoffice is real but is the processor, so it must not hold the
   * copyright on a consumer page either — it gets its own line above.
   */
  const wrong = [];
  for (const name of pages) {
    const html = readFileSync(join(site, name), 'utf8');
    if (/Quote[\s&#;‑-]*Bot,? LLC/i.test(html)) wrong.push(`${name}: says "Quote Bot LLC"`);
    if (/Copyright[^<]{0,40}Broker ?Back ?office/i.test(html)) {
      wrong.push(`${name}: Broker Backoffice holds the copyright`);
    }
  }
  assert.deepEqual(wrong, [], `\n${wrong.join('\n')}\n`);
});
