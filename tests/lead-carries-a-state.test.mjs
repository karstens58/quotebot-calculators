/**
 * Every lead can say which state it came from.
 *
 *   node --test tests/lead-carries-a-state.test.mjs
 *
 * WHY THIS EXISTS. routing.ts assigns a lead from a tracking code owned by
 * an affiliate to the lowest-priority agent LICENSED IN THE APPLICANT'S
 * STATE, and skips one who is not -- "because a lead sitting with someone
 * who cannot write the business is worse than an unassigned lead, it looks
 * handled."
 *
 * A null state skips that filter entirely and the lead routes on priority
 * alone. That is deliberate for a chat lead, where nobody was ever asked.
 * It is not acceptable for a calculator with a form on it: five of these
 * pages collected a name, an email and a phone number, never asked where
 * the person lived, and so produced leads that were assigned without any
 * licensing check. Nothing failed, nothing was flagged, and the only way to
 * notice was to read the routing code.
 *
 * The server reads inputs.state, inputs.stateCode or inputs.businessState.
 * Note that it reads INPUTS, not applicant -- a state put on the applicant
 * object is silently dropped, which is the obvious place to put it and the
 * wrong one.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

const SITE = path.join(import.meta.dirname, '..', 'site');

/** Exactly the keys lead-capture/handler.ts normalises a state out of. */
const KEYS = ['state', 'stateCode', 'businessState'];

function capturingPages() {
  return fs.readdirSync(SITE)
    .filter((f) => f.endsWith('.html'))
    .map((f) => [f, fs.readFileSync(path.join(SITE, f), 'utf8')])
    .filter(([, html]) => /QuoteBot\.capture\s*\(/.test(html));
}

/** The page's scripts, with styles and markup stripped, so a CSS rule or an
 *  attribute cannot be mistaken for a key in the payload. */
function scriptOf(html) {
  return [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((m) => m[1]).join('\n');
}

test('the sweep still finds the calculators', () => {
  const pages = capturingPages();
  assert.ok(pages.length >= 10,
    `only ${pages.length} pages call capture, which means this test has `
    + 'stopped matching the site rather than that the pages are gone');
});

test('EVERY LEAD-CAPTURING PAGE SENDS A STATE', () => {
  const silent = [];
  for (const [file, html] of capturingPages()) {
    const js = scriptOf(html);
    const sends = KEYS.some((k) => new RegExp(`\\b${k}\\s*:`).test(js));
    if (!sends) silent.push(file);
  }
  assert.deepEqual(silent, [],
    'these pages capture a lead without a state, so it is routed with no '
    + `licensing check:\n  ${silent.join('\n  ')}\n\nAdd the field to the `
    + 'form and pass it inside the inputs object — the server reads '
    + `inputs.{${KEYS.join('|')}}, and ignores a state on the applicant.`);
});

test('A STATE FIELD ON THE FORM IS NOT LEFT OUT OF THE PAYLOAD', () => {
  /* The other half: a page that asks where somebody lives and then does not
     send it is worse than one that never asked, because the visitor paid
     for it with a field. */
  const dropped = [];
  for (const [file, html] of capturingPages()) {
    const hasField = /id="(?:cf-|f-|gate-|contact)?[Ss]tate"|id="bizState"/.test(html);
    if (!hasField) continue;
    const js = scriptOf(html);
    if (!KEYS.some((k) => new RegExp(`\\b${k}\\s*:`).test(js))) dropped.push(file);
  }
  assert.deepEqual(dropped, [], `collected but never sent:\n  ${dropped.join('\n  ')}`);
});
