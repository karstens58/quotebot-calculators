/**
 * THE WORDPRESS PLUGIN AND THE LOADER AGREE -- QBP-633.
 *
 *   node --test tests/the-wordpress-plugin-and-the-loader-agree.test.mjs
 *
 * The plugin writes attributes into a page; the loader reads them. The two
 * are in different languages, in different folders, and nothing but this
 * file notices when one of them is renamed. A data-code that became
 * data-partner on one side would render a div that sits there doing
 * nothing, on somebody's website, with no error anywhere.
 *
 * THERE IS NO PHP HERE TO RUN. These are the agreements between the two
 * files plus the handful of properties worth asserting about PHP as text:
 * that nothing reaches a page unescaped, that the settings screen checks
 * who is asking, and that the fallback link is really inside the
 * placeholder. The plugin's behaviour needs a WordPress to prove, and this
 * does not pretend otherwise.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const PLUGIN_DIR = join(root, 'wordpress/quotebot-embed');
const PHP = readFileSync(join(PLUGIN_DIR, 'quotebot-embed.php'), 'utf8');
const BLOCK = JSON.parse(readFileSync(join(PLUGIN_DIR, 'block/block.json'), 'utf8'));
const LOADER = readFileSync(join(root, 'site/js/quotebot-embed-loader.js'), 'utf8');
const EDITOR = readFileSync(join(PLUGIN_DIR, 'block/editor.js'), 'utf8');
const README = readFileSync(join(PLUGIN_DIR, 'readme.txt'), 'utf8');

/* ---- the two halves name the same things ------------------------------ */

/** Every data- attribute the loader actually reads. */
function loaderReads() {
  const names = new Set();
  for (const m of LOADER.matchAll(/attr\([^,]+,\s*\[([^\]]+)\]/g)) {
    for (const one of m[1].matchAll(/'([^']+)'/g)) names.add(one[1]);
  }
  for (const m of LOADER.matchAll(/getAttribute\('([^']+)'\)/g)) names.add(m[1]);
  for (const m of LOADER.matchAll(/querySelectorAll\('\[([^\]']+)\]'\)/g)) names.add(m[1]);
  assert.ok(names.size >= 5, 'this test has stopped reading the loader');
  return names;
}

test('EVERY ATTRIBUTE THE PLUGIN WRITES IS ONE THE LOADER READS', () => {
  const reads = loaderReads();
  const written = new Set();
  /* The map in quotebot_embed_markup, plus the two it always writes. */
  for (const m of PHP.matchAll(/'(data-[a-z-]+)'\s*=>/g)) written.add(m[1]);
  for (const m of PHP.matchAll(/=>\s*'(data-[a-z-]+)'/g)) written.add(m[1]);
  assert.ok(written.size >= 4, 'this test has stopped reading the plugin');

  for (const name of written) {
    assert.ok(reads.has(name),
      `the plugin writes ${name} and the loader never reads it, so the `
      + 'block renders a div that sits there doing nothing');
  }
});

test('AND THE PLACEHOLDER MARKER IS THE ONE IT SCANS FOR', () => {
  assert.match(PHP, /'data-quotebot-embed'/,
    'the plugin does not mark its div as a placeholder');
  assert.match(LOADER, /querySelectorAll\('\[data-quotebot-embed\]'\)/,
    'the loader does not look for the marker the plugin writes');
});

test('the block declares the same settings the renderer reads', () => {
  const shortcode = PHP.slice(PHP.indexOf('shortcode_atts('));
  const declared = new Set(
    [...shortcode.slice(0, shortcode.indexOf('),')).matchAll(/'(\w+)'\s*=>/g)]
      .map((m) => m[1]));
  assert.ok(declared.size >= 4, 'the shortcode no longer declares its settings');
  assert.deepEqual(
    Object.keys(BLOCK.attributes).sort(), [...declared].sort(),
    'the block and the shortcode offer different settings, so one of them '
    + 'silently ignores what somebody typed');
});

test('the plugin says one version of itself', () => {
  /*
   * WordPress reads the header to decide whether an installed copy is
   * out of date, and a partner reads the readme. Two numbers that drift
   * mean a partner on an old copy is never told there is a new one --
   * and nothing about that looks wrong from either side.
   */
  const header = /^ \* Version:\s+(\S+)$/m.exec(PHP)?.[1];
  const stable = /^Stable tag:\s+(\S+)$/m.exec(README)?.[1];
  assert.ok(header, 'the plugin header has no version');
  assert.equal(header, stable,
    'the plugin header and the readme claim different versions');
});

test('THE THREE PLACEMENTS ARE THE SAME THREE ON BOTH SIDES -- QBP-637', () => {
  /*
   * The loader falls back to the page for anything it does not
   * recognise, which is right on somebody's live website: it has to
   * leave something useful behind. That same forgiveness is what makes
   * a typo here invisible -- "botton" would render, publish, and quietly
   * be the page placement on every page a partner put it on.
   *
   * So the plugin emits only words the loader tests for, and this reads
   * both lists rather than trusting either.
   */
  const loaderKnows = new Set(
    [...LOADER.matchAll(/placement (?:!==|===) '(\w+)'/g)].map((m) => m[1]));
  assert.deepEqual([...loaderKnows].sort(), ['bar', 'button'],
    'the loader now recognises a different set of placements');

  const pluginEmits = new Set(
    [...PHP.matchAll(/\$placement === '(\w+)'/g)].map((m) => m[1]));
  assert.deepEqual([...pluginEmits].sort(), [...loaderKnows].sort(),
    'the plugin passes a placement word the loader does not test for, which '
    + 'is silently the page placement on every page it is used');
});

test('and anything else a person types is dropped rather than passed on', () => {
  /*
   * The whitelist is the point: an attribute written straight through
   * would reach the page as data-placement="botton" and behave like a
   * setting that did not work, with nothing anywhere saying why.
   */
  assert.ok(!/'placement' => 'data-placement'/.test(PHP),
    'placement is being copied through the generic attribute map, so an '
    + 'unrecognised word reaches the page');
  assert.match(PHP, /\$data\['data-placement'\] = \$placement;/,
    'the plugin no longer writes a checked placement');
});

test('the editor offers exactly those, and the page as the empty one', () => {
  /*
   * The empty string, deliberately: it is what the loader does with no
   * attribute at all, so the commonest choice writes nothing and there
   * is one less value to keep in step.
   */
  const offered = [...EDITOR.matchAll(/\{ value: '(\w*)', label:/g)].map((m) => m[1]);
  assert.deepEqual(offered, ['', 'bar', 'button'],
    'the block editor offers a different set of placements than the plugin '
    + 'emits, so an author picks something that does nothing');
});

test('AND THE BLOCK HAS AN EDITOR SCRIPT THAT EXISTS', () => {
  /*
   * A block registered without one is registered on the server and
   * nowhere else: it never appears in the inserter, so nobody can add it,
   * and the plugin ships a block that does not exist.
   */
  assert.ok(BLOCK.editorScript, 'the block has no editor script');
  const file = BLOCK.editorScript.replace(/^file:\.\//, '');
  assert.ok(existsSync(join(PLUGIN_DIR, 'block', file)),
    `block.json names ${BLOCK.editorScript} and there is no such file`);
  assert.match(PHP, /register_block_type\(\s*__DIR__ \. '\/block'/,
    'the block is registered by name rather than from its block.json, so '
    + 'the editor script is never enqueued');
});

/* ---- it points at files that are really there -------------------------- */

test('the script it enqueues is a file this repo publishes', () => {
  const m = /QUOTEBOT_EMBED_SRC\s*=\s*'([^']+)'/.exec(PHP);
  assert.ok(m, 'the plugin no longer says where the script comes from');
  const path = m[1].replace('https://tools.quote-bot.com/', 'site/');
  assert.ok(existsSync(join(root, path)),
    `the plugin loads ${m[1]} and this repo does not publish it`);
});

test('and the fallback link goes to a page this repo publishes', () => {
  const m = /QUOTEBOT_EMBED_HOSTED\s*=\s*'([^']+)'/.exec(PHP);
  assert.ok(m, 'the plugin no longer has a hosted page to fall back to');
  const path = m[1].replace('https://tools.quote-bot.com/', 'site/');
  assert.ok(existsSync(join(root, path)),
    `the fallback points at ${m[1]} and this repo does not publish it`);
});

/* ---- what it puts on somebody's page ----------------------------------- */

test('THE FALLBACK LINK IS INSIDE THE PLACEHOLDER', () => {
  /*
   * Inside, because the loader empties the placeholder before it inserts
   * the frame. Beside it, a visitor whose script ran would see the form
   * AND a link to the same form.
   */
  const at = PHP.indexOf("return '<div class=\"quotebot-embed\"'");
  assert.ok(at > 0, 'the placeholder markup has moved');
  const markup = PHP.slice(at, PHP.indexOf(';', at));
  const divAt = markup.indexOf('<div');
  const linkAt = markup.indexOf('<a href=');
  const closeAt = markup.indexOf('</div>');
  assert.ok(divAt >= 0 && linkAt > divAt && closeAt > linkAt,
    'the fallback link is not inside the placeholder div');
  assert.match(markup, /esc_url\(/, 'the fallback link is not escaped');
});

test('and the tracking code rides on the link too', () => {
  /* A visitor who never ran our script still reaches the co-branded page,
     and the partner is still credited for them. */
  assert.match(PHP, /add_query_arg\('qb',\s*rawurlencode\(\$code\)/,
    'the fallback link carries no tracking code, so a lead that comes '
    + 'through it is credited to nobody');
});

test('NOTHING REACHES A PAGE UNESCAPED', () => {
  /*
   * Every value here is text somebody typed into a settings field or a
   * shortcode. Read as a list of what is echoed: each one must go
   * through an esc_ function on the way out.
   */
  const echoes = [...PHP.matchAll(/echo\s+([^;]+);/g)].map((m) => m[1].trim());
  assert.ok(echoes.length >= 5, 'this test has stopped reading the plugin');
  for (const said of echoes) {
    assert.match(said, /esc_(html|attr|url)/,
      `this is echoed without escaping: ${said.slice(0, 80)}`);
  }
  /* And the one place a variable is concatenated into markup. */
  const built = [...PHP.matchAll(/\$attributes \.= ([^;]+);/g)].map((m) => m[1]);
  for (const one of built) {
    assert.match(one, /esc_attr\(/,
      'an attribute is built into markup without escaping');
  }
});

test('the settings screen asks who is there', () => {
  assert.match(PHP, /current_user_can\('manage_options'\)/,
    'the settings page does not check the capability');
  assert.match(PHP, /settings_fields\('quotebot_embed'\)/,
    'the settings form has no nonce, so it can be submitted from elsewhere');
  assert.match(PHP, /'sanitize_callback'\s*=>\s*'quotebot_embed_clean_code'/,
    'the saved code is not sanitised on the way in');
});

test('AND THE PLUGIN COLLECTS NOTHING', () => {
  /*
   * The honest version of asking a partner to run our code on every page
   * of their site is a file that does nothing but render a div. Anything
   * that reads a visitor, stores one, or calls home is a different
   * conversation and should be had before it ships, not after.
   */
  for (const greedy of [
    'wp_remote_get', 'wp_remote_post', 'file_get_contents', 'curl_',
    '$_COOKIE', 'setcookie', 'wp_set_current_user', 'base64_decode',
    'eval(', 'create_function',
  ]) {
    assert.ok(!PHP.includes(greedy),
      `the plugin uses ${greedy}, which is more than rendering a div`);
  }
  /* The only superglobals it should touch are the ones the settings API
     hands it, which it does not read directly at all. */
  assert.ok(!/\$_(GET|POST|REQUEST)\b/.test(PHP),
    'the plugin reads a request directly rather than through the settings API');
});

test('it is not loaded by being asked for directly', () => {
  assert.match(PHP, /if \(!defined\('ABSPATH'\)\)/,
    'the file runs when fetched directly rather than through WordPress');
});
