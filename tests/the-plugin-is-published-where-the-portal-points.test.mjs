/**
 * THE PLUGIN IS PUBLISHED WHERE THE PORTAL POINTS -- QBP-637.
 *
 *   node --test tests/the-plugin-is-published-where-the-portal-points.test.mjs
 *
 * The portal's Marketing screen has a Download the plugin button. It is a
 * plain href to a path on this host, which means the two repositories
 * agree about a string and nothing checks that they still do. If they
 * stop agreeing the partner gets a 404 from a button we told them to
 * press, and the first report of it comes from the partner.
 *
 * AND THE ARCHIVE HAS A SHAPE. WordPress installs a zip that contains ONE
 * top-level folder and refuses one whose files sit at the root -- the
 * same packaging mistake that took this site down on 24 September, which
 * is why it is built from inside wordpress/ rather than from the plugin
 * folder's contents.
 *
 * THE ZIP IS NOT COMMITTED, deliberately: *.zip is ignored, so the
 * archive is always built from the PHP next to it. A committed one is a
 * stale copy the first time anybody edits the plugin, and it fails on
 * somebody else's WordPress rather than here.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const BUILD = readFileSync(join(root, 'amplify.yml'), 'utf8');
const IGNORE = readFileSync(join(root, '.gitignore'), 'utf8');

/** Where the archive lands under site/, which is what the host serves. */
const SERVED = 'wordpress/quotebot-embed.zip';

test('THE DEPLOY BUILDS THE ARCHIVE', () => {
  assert.ok(BUILD.includes(`site/${SERVED}`),
    'the build no longer writes the plugin archive into site/, so the '
    + 'Download button in the portal has nothing to fetch');
  assert.ok(/mkdir -p site\/wordpress/.test(BUILD),
    'zip will not create the directory it is asked to write into');
});

test('from inside wordpress/, so WordPress will accept it', () => {
  /*
   * The distinction is one `cd`. `zip -r x.zip quotebot-embed` from
   * wordpress/ gives an archive with the folder inside it; the same
   * command from quotebot-embed/ gives one with the files at the root,
   * which WordPress rejects as "the package could not be installed".
   */
  assert.ok(/cd wordpress && zip [^\n]*quotebot-embed\b/.test(BUILD),
    'the archive is no longer built from inside wordpress/ with the plugin '
    + 'folder as its argument, so it may unpack without its folder');
  assert.ok(!/cd wordpress\/quotebot-embed/.test(BUILD),
    'zipping from inside the plugin folder puts its files at the archive root');
});

test('and it is built rather than committed', () => {
  assert.ok(/^\*\.zip$/m.test(IGNORE), '*.zip is no longer ignored');
  assert.ok(!existsSync(join(root, 'site', SERVED)),
    'a built plugin archive is committed. It is a stale copy of the PHP '
    + 'beside it the moment anybody edits the plugin, and it fails on a '
    + "partner's WordPress rather than here.");
});

test('everything the plugin needs is in the folder being zipped', () => {
  /*
   * A block registered in PHP alone never appears in the inserter -- the
   * editor script and block.json are what put it there, and leaving
   * either out of the archive is invisible until somebody looks for the
   * block and cannot find it.
   */
  for (const file of ['quotebot-embed.php', 'readme.txt',
    'block/block.json', 'block/editor.js']) {
    assert.ok(existsSync(join(root, 'wordpress/quotebot-embed', file)),
      `${file} is missing from the plugin folder`);
  }
});

test('THE PORTAL POINTS AT EXACTLY THAT PATH', () => {
  const screen = join(root, '..', 'quotebot-affiliates',
    'src/app/features/embed.component.ts');
  if (!existsSync(screen)) {
    /* Said out loud rather than skipped quietly: a guard that silently
       does nothing in CI is the guard everybody believes is running. */
    console.warn('[skip] ../quotebot-affiliates is not checked out, so the '
      + 'half of this test that matters did not run.');
    return;
  }
  const src = readFileSync(screen, 'utf8');
  assert.ok(src.includes(`'/${SERVED}'`),
    'the Marketing screen asks for a different path than the deploy '
    + `publishes. It must be /${SERVED} on this host.`);
  /* And on this host, not some other one. */
  assert.ok(/TOOLS \+ '\/wordpress\/quotebot-embed\.zip'/.test(src),
    'the download link no longer hangs off the tools host constant');
});
