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
