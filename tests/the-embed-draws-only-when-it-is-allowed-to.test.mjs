/**
 * THE EMBED DRAWS ONLY WHEN IT IS ALLOWED TO -- QBP-633.
 *
 *   node --test tests/the-embed-draws-only-when-it-is-allowed-to.test.mjs
 *
 * One page serves two jobs: the quote tool at tools.quote-bot.com, and a
 * panel inside a partner's website when it is opened with ?embed=1. That
 * is deliberate -- a separate embed page would be a second copy of a
 * thousand lines of form, and the two would drift until a field was asked
 * of half the people who quote.
 *
 * So the things worth testing are the seams:
 *
 *   NOTHING SHOWS BEFORE THE VERDICT. The gate is only a gate if it is
 *   closed at first paint. Revealed after, it is a flicker, and the form
 *   was on an unregistered site for as long as the network took.
 *
 *   THE ORDINARY PAGE IS UNTOUCHED. Every rule is scoped and every script
 *   returns early without ?embed=1. A regression here breaks the tool for
 *   everybody to serve a feature almost nobody uses yet.
 *
 *   THE LICENCE LINE SURVIVES. Hiding our chrome inside somebody's page is
 *   right; hiding who is actually behind the insurance is not, and it is
 *   one selector away at all times.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const read = (p) => readFileSync(join(root, 'site', p), 'utf8');

const PAGE = read('quotetool.html');
const CSS = read('css/quotebot-embed.css');
const JS = read('js/quotebot-embed.js');

const require = createRequire(import.meta.url);
const embed = require('../site/js/quotebot-embed.js');

/* ---- closed at first paint -------------------------------------------- */

test('THE GUARD AND THE BOOT ARE IN THE HEAD, IN THAT ORDER', () => {
  const head = PAGE.slice(0, PAGE.indexOf('</head>'));
  const guardAt = head.indexOf('js/quotebot-embed-guard.js');
  const bootAt = head.indexOf('js/quotebot-embed.js');
  assert.ok(guardAt > 0,
    'the guard is not in the head, so the page paints before anything has '
    + 'decided whether it may');
  assert.ok(bootAt > guardAt,
    'the boot script runs before the guard it calls is defined');
  const cssAt = head.indexOf('css/quotebot-embed.css');
  assert.ok(cssAt > 0,
    'the embed stylesheet is not in the head, so the rule that hides the '
    + 'page cannot apply at first paint');
});

test('AND THE WAITING CLASS IS SET BEFORE THE BODY EXISTS', () => {
  /* On documentElement, which exists while the head is parsing. On the
     body it would be set after the body had already been laid out. */
  assert.match(JS, /documentElement\.classList\.add\(\s*'qb-embed',\s*'qb-embed-waiting'\s*\)/,
    'the document is not marked as waiting, or not on documentElement');
  assert.match(CSS, /html\.qb-embed-waiting[^{]*\{[^}]*visibility:\s*hidden/,
    'nothing hides the page while the verdict is outstanding');
});

test('a refusal reveals the box and never the form', () => {
  /* replaceChildren, so the form is gone rather than merely covered: a
     form still in the document is a form a determined host can show. */
  const at = JS.indexOf('function refuse(');
  assert.ok(at > 0, 'the refusal path is gone');
  const body = JS.slice(at, JS.indexOf('\n  }', at));
  assert.match(body, /replaceChildren\(/,
    'the refusal leaves the form in the document underneath it');
  assert.match(body, /reveal\(\)/, 'the refusal box is never made visible');
});

test('NO GUARD MEANS NO FORM', () => {
  /* If the file failed to load there is nothing to decide, and the safe
     answer to "I cannot tell" is no. */
  const at = JS.indexOf('if (!g) {');
  assert.ok(at > 0, 'a missing guard is no longer handled');
  assert.match(JS.slice(at, at + 200), /refuse\(/,
    'a missing guard draws the form anyway');
});

/* ---- the ordinary page is untouched ----------------------------------- */

test('WITHOUT ?embed=1 THE SCRIPT DOES NOTHING AT ALL', () => {
  const at = JS.indexOf('function boot(');
  assert.ok(at > 0, 'boot is gone');
  const body = JS.slice(at, JS.indexOf('\n  }', at));
  assert.match(body, /if \(!DOC \|\| !wanted\(\)\) return;/,
    'boot does something before it has checked that this page is an embed');
  /* And the check is the first statement, not merely present somewhere. */
  const firstLine = body.split('\n').filter((l) => l.trim() && !l.trim().startsWith('*')
    && !l.trim().startsWith('/*'))[1] ?? '';
  assert.match(firstLine, /wanted\(\)/,
    'something runs before the page has been checked for ?embed=1');
});

test('and every rule is scoped to the embed', () => {
  /*
   * A bare selector here restyles the quote tool for everybody. The
   * refusal box is the one exception: it is drawn into a page that has
   * replaced its own contents, and scoping it would mean it could not be
   * styled on a page that failed before the class was set.
   */
  const rules = CSS.replace(/\/\*[\s\S]*?\*\//g, '')
    .split('}').map((r) => r.split('{')[0].trim()).filter(Boolean);
  for (const selector of rules) {
    const ok = selector.split(',').every((one) => {
      const s = one.trim();
      return s.startsWith('html.qb-embed') || s.startsWith('.qb-embed-refusal');
    });
    assert.ok(ok, `"${selector}" is not scoped to the embed, so it restyles `
      + 'the quote tool for every visitor');
  }
});

/* ---- the disclosure survives ------------------------------------------ */

test('THE LICENCE LINE IS NOT HIDDEN BY THE EMBED LAYOUT', () => {
  /*
   * The reason the form lives in an iframe at all is that nothing on the
   * host page can remove this -- so removing it ourselves would give away
   * the argument for the whole design.
   */
  const stripped = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  const hidden = stripped.split('}')
    .filter((r) => /display:\s*none|visibility:\s*hidden/.test(r))
    .map((r) => r.split('{')[0]);
  for (const selector of hidden) {
    assert.ok(!/footer-fulfilment(?!-head)/.test(selector),
      `the embed hides ${selector.trim()}, which carries who is behind the `
      + 'insurance and the licence number');
  }
  /* And it is positively drawn, not merely left alone by accident. */
  assert.match(stripped,
    /html\.qb-embed \.footer-fulfilment\s*\{[^}]*display:\s*block/,
    'the fulfilment notice is not explicitly kept, so it rides on whatever '
    + 'the footer rules happen to do');
});

/* ---- three placements, one form -- QBP-636 ----------------------------- */

test('THE QUESTIONS NEVER CHANGE, WHEREVER THE FORM IS REACHED FROM', () => {
  /*
   * The point of the whole design. The fields are what the carriers price
   * on, so a placement that asked fewer of them would be a different,
   * lesser form that then had to hand its answers over. Nothing here may
   * hide or add a field: the placements differ in where the form is
   * drawn, never in what it asks.
   */
  const stripped = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  const hiding = stripped.split('}')
    .filter((r) => /display:\s*none|visibility:\s*hidden/.test(r))
    .map((r) => r.split('{')[0].trim());
  for (const selector of hiding) {
    /* The whole panel may be hidden -- that is what showing the prices
       does. What must never be hidden is a FIELD inside it. */
    assert.ok(!/\binput\b|\bselect\b|\blabel\b|\.field|#dob|#state|#coverage|#email|#phone/
      .test(selector),
      `${selector} hides part of the form, so a placement asks different `
      + 'questions from the others');
  }
  /* And the opener asks nothing, so nothing is answered twice. */
  const at = JS.indexOf('function addOpener(');
  assert.ok(at > 0, 'the invitation is gone');
  const body = JS.slice(at, JS.indexOf('\n  }', at));
  assert.ok(!/createElement\('(input|select|textarea)'\)/.test(body),
    'the invitation asks a question, so its answer has to be carried into '
    + 'the form and the handoff is back');
});

test('A COLUMN TOO NARROW FOR THE FORM OPENS IT OVER THE PAGE', () => {
  /*
   * The form does not shrink, because the questions cannot. Below the
   * floor it goes in front of the page, where it has the whole viewport,
   * and leaves an invitation in the column.
   */
  assert.equal(typeof embed.NARROW, 'number');
  assert.ok(embed.NARROW >= 240 && embed.NARROW <= 480,
    `the floor is ${embed.NARROW}px, which is not a column width`);
  const at = JS.indexOf('function formRestsInPage(');
  assert.ok(at > 0, 'nothing decides whether the form fits');
  const body = JS.slice(at, JS.indexOf('\n  }', at));
  assert.match(body, /placement === 'page'/, 'the floor ignores the placement');
  assert.match(body, /!narrow\(\)/, 'the width is never asked about');
});

test('and a width it cannot measure is treated as room, not as narrow', () => {
  /* A form in a column that turns out to be tight is a worse day than an
     invitation where there was space. It is not a broken page either way,
     and guessing "narrow" would put an invitation on every page that
     blocks the measurement. */
  const at = JS.indexOf('function narrow(');
  /* Comments stripped: the reason this returns false is written in one,
     and a window counted in characters would be measuring the prose. */
  const body = JS.slice(at, JS.indexOf('\n  }', at))
    .replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(body, /catch[\s\S]{0,60}return false;/,
    'a window it cannot measure is treated as a narrow column');
});

test('A BUTTON OPENS STRAIGHT INTO THE FORM', () => {
  /* The loader already put the frame in front of their page before the
     visitor saw anything, so inviting them to something they just asked
     for would be a second click for nothing. */
  const at = JS.indexOf('function start(');
  const body = JS.slice(at, JS.indexOf('\n  }', at));
  assert.match(body, /placement === 'button'[\s\S]{0,160}qb-embed-overlay/,
    'a button-opened frame does not show the form');
  assert.match(body, /addOpener\(\)/,
    'nothing is left in the page where the form does not rest');
});

test('AND THE LICENCE LINE IS PINNED WHERE THE FORM COVERS THE PAGE', () => {
  /*
   * In that state the panel and the prices are both fixed across the
   * whole window, so a notice below them in the flow would be behind
   * them. Being unreachable by the host's CSS is the entire argument for
   * the form living in a frame, and it is worth nothing if our own
   * layout hides it.
   */
  const stripped = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(stripped,
    /qb-embed-overlay \.footer-fulfilment[\s\S]{0,240}position:\s*fixed/,
    'the licence line is not pinned while the form is over their page');
  assert.match(stripped,
    /qb-embed-open \.footer-fulfilment[\s\S]{0,240}position:\s*fixed/,
    'the licence line is not pinned while the prices are over their page');
});

/* ---- back is not close -- QBP-635 -------------------------------------- */

test('BACK TO THE FORM DOES NOT DISMISS THE FORM', () => {
  /*
   * THE DEFECT THIS IS WRITTEN FROM. One control said "Back to the form"
   * and sent one message, `collapse`, which the loader read as "this
   * modal is finished" wherever the form had no resting place in the
   * page. A visitor who read the prices and pressed Back to change their
   * coverage lost the form and everything typed into it.
   *
   * So back only collapses where collapsing IS going back -- in the
   * partner's own layout. In front of their page it is a change of view
   * and the frame must not move.
   */
  const at = JS.indexOf('function backToForm(');
  assert.ok(at > 0, 'the way back to the form is gone');
  const body = JS.slice(at, JS.indexOf('\n  }', at));
  assert.match(body, /restsOverTheirPage\(\)/,
    'back behaves the same wherever the form was put, so one of the two '
    + 'placements is wrong');
  const guard = body.indexOf('restsOverTheirPage()');
  const sends = body.indexOf('send(COLLAPSE)');
  assert.ok(sends > guard,
    'the frame is collapsed before anybody has asked where the form rests');
});

test('AND THERE IS A SEPARATE WAY OUT, ONLY WHERE THERE IS SOMETHING TO LEAVE',
  () => {
    /* In the partner's layout the form is part of their page: hiding the
       prices puts the page back as it was, and a Close would be a control
       that removes a section of somebody's own website. */
    const at = JS.indexOf('function addControls(');
    assert.ok(at > 0, 'the controls are gone');
    const body = JS.slice(at, JS.indexOf('\n  }', at));
    assert.match(body, /if \(!restsOverTheirPage\(\)\) return;/,
      'a close control is drawn even where the form lives in the page');
    const dismiss = JS.indexOf('function dismiss(');
    assert.ok(dismiss > 0, 'nothing dismisses the frame');
    assert.match(JS.slice(dismiss, JS.indexOf('\n  }', dismiss)), /send\(COLLAPSE\)/,
      'closing never tells the host, so the frame stays over their page');
  });

test('the placement is read strictly, and anything else rests in the page', () => {
  /*
   * It arrives in a message body, which a hostile host writes. The
   * failure to avoid is a value we do not draw for leaving a visitor with
   * no way out at all, so an unknown one falls to the placement that
   * cannot strand anybody.
   */
  const at = JS.indexOf('onAllowed: function (_origin, said)');
  assert.ok(at > 0, 'the greeting body is no longer read');
  const body = JS.slice(at, at + 420);
  assert.match(body, /told === 'button' \|\| told === 'bar'/,
    'any placement a host names is believed');
  assert.match(JS, /var placement = 'page';/,
    'the placement does not default to the one with a form in the page');
});

/* ---- what the host is told -------------------------------------------- */

test('NOTHING IS POSTED TO EVERY ORIGIN', () => {
  /*
   * A message addressed to '*' is readable by whatever frames us next,
   * and what is on this page is somebody's quote.
   */
  assert.ok(!/postMessage\([^)]*,\s*['"]\*['"]/.test(JS),
    'a message is posted to any origin that cares to listen');
  const at = JS.indexOf('function send(');
  const body = JS.slice(at, JS.indexOf('\n  }', at));
  assert.match(body, /if \(!hostOrigin\) return;/,
    'a message can be sent before the host origin has been confirmed');
  assert.match(body, /postMessage\(body, hostOrigin\)/,
    'the message is not addressed to the confirmed host');
});

test('the host origin is the one the guard confirmed, never one we parsed', () => {
  /* It is assigned inside ask(), which the guard calls with the origin it
     took off the browser's own stamp. */
  const at = JS.indexOf('ask: function (origin)');
  assert.ok(at > 0, 'the verdict is no longer asked for per origin');
  assert.match(JS.slice(at, at + 160), /hostOrigin = origin;/,
    'the host origin comes from somewhere other than the guard');
});

test('the height stops being reported while the results are open', () => {
  /* Open, the frame is the whole viewport; a content height would shrink
     it back mid-scroll. */
  const at = JS.indexOf('function reportHeight(');
  const body = JS.slice(at, JS.indexOf('\n  }', at));
  assert.match(body, /qb-embed-open/,
    'the height is reported while the modal has the window, so the frame '
    + 'collapses under the results');
});

test('and the names the host listens for are exported', () => {
  for (const name of ['READY', 'HEIGHT', 'EXPAND', 'COLLAPSE', 'REFUSED']) {
    assert.match(String(embed[name] ?? ''), /^quotebot:/,
      `${name} is not a quotebot: message, so the loader cannot match it`);
  }
  assert.equal(new Set(['READY', 'HEIGHT', 'EXPAND', 'COLLAPSE', 'REFUSED']
    .map((n) => embed[n])).size, 5, 'two messages share a name');
});

test('the refusal points a partner at their own portal', () => {
  assert.match(embed.PORTAL, /^https:\/\/partners\.quote-bot\.com\//,
    'the refusal does not link to the partner portal');
  const at = JS.indexOf('function refuse(');
  const body = JS.slice(at, JS.indexOf('\n  }', at));
  assert.match(body, /not registered/i,
    'the refusal does not say plainly that the site is not registered');
  /* Built as text, never as markup: the origin came from another website
     and this is the one place it is shown. */
  assert.ok(!/innerHTML/.test(body),
    'the refusal box is assembled as markup, with an origin in it');
});
