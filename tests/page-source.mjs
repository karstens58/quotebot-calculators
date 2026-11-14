/**
 * A page's source: its markup, plus the script that used to be inside it.
 *
 * These calculators carried their script inline. It moved into js/<page>.js
 * because a Content-Security-Policy without 'unsafe-inline' will not execute
 * an inline <script>, and a page whose script does not run is a dead page.
 *
 * Every test that asserted on that script by reading the .html file broke in
 * the same moment and for the same reason -- ten of them at once. Rather than
 * seventeen files each deciding separately where a page's script lives, they
 * ask here.
 *
 * WHAT IS INCLUDED, and why not more: the page's markup and the page's OWN
 * script. Not js/quotebot-apply.js or the other shared files, even though the
 * page loads them -- a test asserting a page does NOT contain something would
 * start finding it in a file eleven other pages share, and pass or fail for
 * reasons that have nothing to do with the page it names.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'site');

/** The files holding a page's own script, in load order. */
export function ownScripts(file) {
  const stem = path.basename(file, '.html');
  const html = readFileSync(path.join(SITE, file), 'utf8');
  return [...html.matchAll(/<script[^>]*src="([^"]+)"/g)]
    .map((m) => m[1])
    .filter((src) => new RegExp(`^js/${stem}(-\\d+)?\\.js$`).test(src))
    .map((src) => path.join(SITE, src))
    .filter(existsSync);
}

/** Markup and own script together, as the page read before the script moved. */
export function pageSource(file) {
  return [
    readFileSync(path.join(SITE, file), 'utf8'),
    ...ownScripts(file).map((f) => readFileSync(f, 'utf8')),
  ].join('\n');
}

/** Just the page's own script, with no markup around it. */
export function pageScript(file) {
  return ownScripts(file).map((f) => readFileSync(f, 'utf8')).join('\n;\n');
}

export const pages = () => readdirSync(SITE).filter((f) => f.endsWith('.html'));
export const SITE_DIR = SITE;
