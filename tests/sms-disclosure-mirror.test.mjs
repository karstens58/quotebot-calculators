/**
 * The SMS opt-in wording, held to the server's copy.
 *
 * There are two copies of this sentence and there have to be: the browser
 * shows it, the Lambda validates it. They are in different repositories and
 * different languages, so nothing but a test can keep them the same.
 *
 * WHAT GOES WRONG WITHOUT THIS. The server refuses an opt-in whose wording
 * omits "not required to buy" or how to stop, and the refusal is SILENT by
 * design — it logs and records nothing, because recording a weak consent is
 * the expensive failure. So an innocent copy edit here produces a form that
 * looks like it is collecting consent, collects none, and says so nowhere a
 * person would look. You would find out when a campaign had no recipients.
 *
 * The contraction is the specific trap. "Consent isn't required to buy" reads
 * better than "is not required to buy" and fails the check, because the
 * pattern looks for "not required to buy".
 *
 *   node --test tests/sms-disclosure-mirror.test.mjs
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const backend = join(root, '..', 'quotebot-backend');
const backendSource = join(backend, 'amplify/functions/shared/smsconsent.ts');
const captureSource = join(root, 'site/js/quotebot-capture.js');

const capture = readFileSync(captureSource, 'utf8');
const haveBackend = existsSync(backendSource);

/** A single- or multi-part JS string literal assigned to `name`. */
function literal(source, name, decl) {
  const re = new RegExp(`${decl}\\s+${name}\\s*=\\s*([\\s\\S]*?);\\n`);
  const m = re.exec(source);
  assert.ok(m, `${name} was not found — this test is now checking nothing`);
  const parts = [...m[1].matchAll(/'((?:[^'\\]|\\.)*)'/g)]
    .map((p) => p[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\'));
  assert.ok(parts.length, `${name} did not parse as a string literal`);
  return parts.join('');
}

const clientLabel = () => literal(capture, 'SMS_OPTIN_LABEL', 'var');
const clientFine = () => literal(capture, 'SMS_FINE_PRINT', 'var');
const clientVersion = () => literal(capture, 'SMS_DISCLOSURE_VERSION', 'var');

test('the capture script still declares the wording this test reads', () => {
  assert.ok(clientLabel().length > 5);
  assert.ok(clientFine().length > 80);
  assert.match(clientVersion(), /^\d{4}-\d{2}-[a-z]$/);
});

test('THE WORDING MATCHES THE SERVER, WORD FOR WORD',
  { skip: !haveBackend }, () => {
    const server = readFileSync(backendSource, 'utf8');
    assert.equal(clientLabel(), literal(server, 'SMS_OPTIN_LABEL', 'export const'),
      'the checkbox label differs from the server\'s copy');
    assert.equal(clientFine(), literal(server, 'SMS_FINE_PRINT', 'export const'),
      'the fine print differs from the server\'s copy, so the server may refuse '
      + 'every opt-in this form collects — silently');
  });

test('the version stamp matches, so a record can name the wording it saw',
  { skip: !haveBackend }, () => {
    const server = readFileSync(backendSource, 'utf8');
    assert.equal(clientVersion(),
      literal(server, 'SMS_DISCLOSURE_VERSION', 'export const'));
  });

test('THE SHOWN WORDING SATISFIES THE SERVER\'S OWN CHECKS', () => {
  /*
   * The checks re-stated here rather than imported: this repo cannot run the
   * backend's TypeScript, and a mirror that only compares two strings would
   * happily agree that both are wrong.
   *
   * An earlier version of this comment claimed the backend's own tests would
   * catch it if these drifted. They do not, and they cannot -- they test the
   * backend's copy. When the server's not-a-condition pattern was widened to
   * accept "not required to make a purchase", this copy stayed narrow and
   * failed a wording the server was perfectly happy with. Failing loudly here
   * is the right outcome; the claim about where it gets caught was wrong.
   */
  const shown = `${clientLabel()} ${clientFine()}`.toLowerCase();

  assert.ok(shown.length >= 40, 'too short to be the wording that was shown');
  assert.match(shown, /\btexts?\b|\btext messages?\b|\bsms\b/,
    'does not mention texting');
  assert.match(shown,
    /not a condition|no purchase (necessary|required)|not required (to (buy|purchase|make a purchase)|for purchase)|consent is not required/,
    'does not say agreeing is not a condition of purchase — express written '
    + 'consent requires it, and the server will refuse every opt-in. Mind the '
    + 'contraction: "isn\'t required to buy" does not match');
  assert.match(shown, /\bstop\b/, 'does not tell the person how to stop');
});

test('it names Quote Bot, not the affiliate whose page it is on', () => {
  /* The person has to know who is texting them, and affiliates never text.
     Co-branding changes the logo on the page, not who is asking. */
  assert.match(clientFine(), /Quote Bot/,
    'the disclosure does not name who will be texting');
});

test('the label is honest that this is marketing', () => {
  /* A label reading like a transactional update over fine print that says
     marketing is the kind of mismatch that voids the consent it collects. */
  assert.match(`${clientLabel()} ${clientFine()}`.toLowerCase(), /offers?|marketing/);
});

test('THE BOX IS RENDERED UNTICKED, AND IS NOT REQUIRED', () => {
  /* A pre-ticked box is not express written consent, and making it a
     condition of seeing the quote would void what it collects. */
  assert.match(capture, /box\.checked\s*=\s*false/,
    'the opt-in checkbox is not explicitly unticked');
  assert.ok(!/box\.required\s*=\s*true/.test(capture),
    'the opt-in checkbox is marked required');
  assert.ok(!/checked\s*=\s*true/.test(capture),
    'something in the capture script ticks a box by default');
});

test('A GRID PARENT CANNOT TURN THE OPT-IN INTO A COLUMN', () => {
  /*
   * Four of the twelve calculators lay their contact fields out on a
   * two-column grid. A marker element dropped into one becomes a CELL, so the
   * opt-in was placed beside the phone field rather than under it -- on
   * careltc in the right-hand column level with the phone LABEL, fine print
   * clipped by the column width, reading as a separate offer someone had
   * bolted on. On sequenceofreturns it rendered ABOVE the phone number it is
   * asking about.
   *
   * It survived review because the markup is right and it looked correct on
   * the two single-column pages it was first checked against. Only rendering
   * shows it, and only rendering every page shows all four.
   *
   * So mountSmsOptIn spans the slot across every column when its parent is a
   * grid. This pins that logic: without it the next grid-based calculator
   * reproduces the bug, and the symptom looks like a design decision rather
   * than a defect.
   */
  const block = capture.slice(capture.indexOf('function mountSmsOptIn'),
    capture.indexOf('function injectSmsStyles'));

  assert.match(block, /getComputedStyle/,
    'mountSmsOptIn no longer inspects the parent layout, so a grid parent '
    + 'will place the opt-in as a cell beside the phone field');
  assert.match(block, /['"]inline-grid['"]/,
    'only display:grid is handled; inline-grid places children as cells too');
  assert.match(block, /gridColumn\s*=\s*['"]1 \/ -1['"]/,
    'the slot is not spanned across the grid, so it lands in one column');

  /*
   * The span must be REACHED, not merely present.
   *
   * An earlier version of this test checked only that those three strings
   * appeared somewhere in the function. Replacing the enclosing condition
   * with `if (false)` disabled the whole thing and the test still passed --
   * every string it looked for was still there, just unreachable. So this
   * reads the condition that actually guards the block and requires it to be
   * derived from the parent element.
   *
   * HONEST LIMIT: this pins structure, not behaviour. It catches the branch
   * being deleted, narrowed or switched off, which is what a careless edit
   * does. It cannot catch a condition rewritten to something true-but-wrong.
   * Only running mountSmsOptIn against a real grid does that, and this repo
   * has no DOM to run it in -- the browser sweep covers it out of band.
   */
  const at = block.indexOf('slot.parentNode');
  assert.notEqual(at, -1, 'mountSmsOptIn no longer looks at the parent node');
  const cond = block.slice(at).match(/if\s*\(([^)]*(?:\([^)]*\)[^)]*)*)\)/);
  assert.ok(cond, 'no condition guards the grid handling');
  assert.match(cond[1], /\bparent\b/,
    `the grid handling is guarded by \`${cond[1].trim()}\`, which does not `
    + 'depend on the parent element — so it is switched off, not conditional');
});

test('THE CONSENT TEXT IS NOT LEFT TO INHERIT A WASHED-OUT COLOUR', () => {
  /*
   * myga styles `.field label` with --gray-mid (#8a9ab5), about 2.8:1 on its
   * background -- under WCAG AA. The opt-in label inherited it and rendered
   * at 2.85:1. That label is the affirmative act itself; a disclosure nobody
   * can comfortably read is a compliance problem, not a styling nitpick.
   *
   * var(--text) rather than a literal, so a page's own palette still wins and
   * a dark calculator would not invert into unreadability.
   *
   * This rebuilds the CSS from the concatenated fragments and checks each
   * rule, because the first version of this test searched the whole block for
   * one pinned colour -- and passed while the LABEL's colour was stripped,
   * still matching the fine print's. It was blind to the exact bug it names.
   */
  const block = capture.slice(capture.indexOf('function injectSmsStyles'),
    capture.indexOf('document.head.appendChild'))
    /* Comments first. They contain apostrophes -- "quotetool's own label
       styling" -- and a naive quote match treats one as a string delimiter
       and swallows the rest of the block, which is how the first run of this
       reported that .qb-sms-label was not styled at all. */
    .replace(/\/\*[\s\S]*?\*\//g, '');
  const css = [...block.matchAll(/'((?:[^'\\]|\\.)*)'/g)]
    .map((m) => m[1]).join('');
  assert.ok(css.includes('.qb-sms'), 'the stylesheet did not reassemble');

  for (const rule of ['.qb-sms .qb-sms-label', '.qb-sms .qb-sms-fine']) {
    const at = css.indexOf(rule);
    assert.notEqual(at, -1, `${rule} is no longer styled at all`);
    const body = css.slice(at, css.indexOf('}', at));
    assert.match(body, /color:\s*var\(--text,[^)]*\)\s*!important/,
      `${rule} does not pin its colour, so it inherits whatever the page `
      + 'sets — which on at least one calculator fails WCAG AA');
  }
});

test('the disclosure is written with textContent, never innerHTML', () => {
  /* It is read back out of the DOM and stored as evidence; markup in it
     would be stored too, and script in it would be worse. */
  const block = capture.slice(capture.indexOf('function mountSmsOptIn'),
    capture.indexOf('function injectSmsStyles'));
  /*
   * Comments stripped first. The only innerHTML in that function is inside
   * the comment saying not to use innerHTML, and the first version of this
   * test failed on its own documentation — a guard that greps source has to
   * read the code, not the prose about the code.
   */
  const code = block
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ');
  assert.ok(!/innerHTML/.test(code),
    'the opt-in is built with innerHTML somewhere');
  assert.match(block, /lead\.textContent\s*=\s*SMS_OPTIN_LABEL/);
  assert.match(block, /fine\.textContent\s*=\s*SMS_FINE_PRINT/);
});
