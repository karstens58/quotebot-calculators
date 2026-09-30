/**
 * Where this site lives, in one place.
 *
 * The link-preview tags cannot use a relative path -- a scraper fetches the
 * image from its own servers, where a relative path resolves against nothing
 * -- so the domain is written out in full on every page, three times each.
 * That makes a domain change the kind of failure nobody sees: the pages load
 * fine, and only the share previews quietly point at a host that has moved.
 *
 * So it is declared once, here.
 *
 * TO MOVE THE SITE TO A NEW DOMAIN:
 *   1. change ORIGIN below
 *   2. cd tools/og && npm run meta
 *   3. node --test tests/og-cards.test.mjs
 *
 * Step 3 is not optional politeness -- og-cards.test.mjs checks every page's
 * og:url and canonical link against this value, so a page missed in step 2
 * fails the build instead of shipping a stale domain.
 */
export const ORIGIN = 'https://tools.quotebot.io';

/**
 * The canonical url of a page.
 *
 * index.html is the exception and has to be: the homepage's address is the
 * bare domain, not `/index.html`. og:url is what the networks dedupe a share
 * on, so a homepage advertising `/index.html` splits its own share count
 * between two addresses for the same page. Declared here rather than in both
 * apply-meta.mjs and the test, because two copies of a rule is one copy too
 * many -- the first version of this shipped `/index.html` in the tag and `/`
 * in the canonical link, and neither one knew about the other.
 */
export const pageUrl = (page) => (page === 'index.html' ? `${ORIGIN}/` : `${ORIGIN}/${page}`);
