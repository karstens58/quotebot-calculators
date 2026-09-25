/**
 * Every calculator that asks for a phone number offers the opt-in.
 *
 * The box only appears where a page places the marker element, which makes a
 * new calculator's default "collects a phone number, never asks permission
 * to use it". Nothing breaks in that state and nothing says so — the lead
 * arrives, the number is stored, and the first anyone notices is an agent
 * asking why they cannot text a lead who left their mobile.
 *
 * So this walks the pages rather than listing them: add a calculator with a
 * phone field and no opt-in, and this fails on the day it is written.
 *
 *   node --test tests/sms-optin-present.test.mjs
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const site = join(here, '..', 'site');

const MARKER = 'data-qb-sms-optin';

/** Pages that ask for a phone number and send a lead. */
function capturingPages() {
  return readdirSync(site)
    .filter((f) => f.endsWith('.html'))
    .map((f) => [f, readFileSync(join(site, f), 'utf8')])
    .filter(([, html]) => /QuoteBot\.capture\s*\(/.test(html))
    .filter(([, html]) => /<input[^>]*(type="tel"|id="[^"]*phone)/i.test(html));
}

test('the sweep still finds the calculators', () => {
  /* If this stops matching, every assertion below passes over an empty list
     — the failure mode of every guard that walks files. */
  const pages = capturingPages();
  assert.ok(pages.length >= 10,
    `only ${pages.length} capturing pages were found, which means this test `
    + 'has stopped matching the site rather than that the pages are gone');
});

test('EVERY PAGE THAT ASKS FOR A PHONE NUMBER OFFERS THE OPT-IN', () => {
  const missing = capturingPages()
    .filter(([, html]) => !html.includes(MARKER))
    .map(([file]) => file);

  assert.deepEqual(missing, [],
    `these calculators collect a phone number and never ask permission to `
    + `text it. Add <div ${MARKER}></div> under the phone field; the wording, `
    + 'the box and the unticked state all come from quotebot-capture.js');
});

test('the marker sits with the phone field, not somewhere else on the page', () => {
  /*
   * Placement is the whole of the visitor's experience of this: an opt-in
   * floating at the bottom of a results panel is a different thing from a
   * line under the number it is asking about.
   */
  for (const [file, html] of capturingPages()) {
    let at = html.indexOf(MARKER);
    while (at !== -1) {
      const before = html.slice(Math.max(0, at - 700), at);
      assert.match(before, /<input[^>]*(type="tel"|id="[^"]*phone)/i,
        `${file}: an opt-in marker has no phone input above it`);
      at = html.indexOf(MARKER, at + 1);
    }
  }
});

test('THE PHONE FIELD IS NEVER REQUIRED — INCLUDING IN SCRIPT', () => {
  /*
   * The attribute is the easy half and it was never the problem. Five of
   * these calculators had no `required` attribute anywhere and refused to
   * show results without a phone number, because the gate's own handler
   * checked it: `if (!first || !last || !email || !phone)`. A survey of the
   * markup said they were all optional. They were not.
   *
   * Two reasons it matters. Demanding a number to see a quote costs quotes
   * from people who will not give one. And an opt-in sitting under a
   * compulsory field reads as part of the toll, which is the opposite of
   * what "consent is not required to make a purchase" says two lines below.
   *
   * A number that IS typed may still be validated — a half-entered one is a
   * lead nobody can ring — so this looks for emptiness treated as failure,
   * not for validation as such.
   */
  for (const [file, html] of capturingPages()) {
    const tags = (html.match(/<input[^>]*>/g) ?? [])
      .filter((t) => /type="tel"|id="[^"]*phone/i.test(t));
    for (const tag of tags) {
      assert.ok(!/\brequired\b/.test(tag),
        `${file}: a phone field carries the required attribute`);
    }

    /*
     * Any `!<identifier containing phone>` used as a condition, except the
     * `!phone ||` that makes a format check skip an empty one.
     *
     * Matched in two steps rather than one pattern. The first version was
     * `![a-zA-Z_$][\w$]*[Pp]hone` and never matched a bare `!phone` — it
     * demanded at least one character before "phone", so it caught
     * `!contactPhone` and sailed past the exact line that is live in three
     * of these files. A mutation put `if (!phone)` back and this test stayed
     * green.
     */
    const offenders = (html.split('\n'))
      .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
      .filter((line) => {
        const hits = line.match(/!\s*[A-Za-z_$][\w$]*/g) ?? [];
        return hits.some((h) => {
          /*
           * The variable that HOLDS the number, not one derived from it.
           * `!phone` and `!contactPhone` block the form on an empty field;
           * `!phoneOk` and `!phoneDigits` are validation results and are
           * fine. Matching "contains phone" flagged `if (!phoneOk)`, which
           * is the line that correctly lets an empty number through.
           */
          if (!/phone$/i.test(h.replace(/^!\s*/, ''))) return false;
          /*
           * `!phone ||` means opposite things in the two places it appears,
           * and the syntax is identical:
           *
           *   const phoneOk = !phone || digits.length >= 10;   // empty PASSES
           *   if (!phone || digits.length < 10) { fail(); }    // empty FAILS
           *
           * So the test is not the `||` but what the line is doing. An
           * assignment computing a validity flag may short-circuit on empty;
           * a condition may not. A mutation that turned the first shape into
           * the second slipped past the earlier version of this check.
           */
          const isAssignment = /^\s*(const|let|var)\s+[\w$]+\s*=/.test(line);
          if (!isAssignment) return true;
          const after = line.slice(line.indexOf(h) + h.length, line.indexOf(h) + h.length + 4);
          return !/^\s*\|\|/.test(after);
        });
      });

    assert.deepEqual(offenders.map((l) => l.trim().slice(0, 80)), [],
      `${file}: an empty phone number blocks the results. Drop it from the `
      + 'required list; validate the format only when one is given');
  }
});

test('nothing hard-codes the disclosure into a page', () => {
  /* The wording lives in quotebot-capture.js so there is one of it. A page
     that spells it out has forked it, and the mirror test guards only the
     one in the script. */
  for (const [file, html] of capturingPages()) {
    assert.ok(!/automated marketing text messages/i.test(html),
      `${file} contains its own copy of the disclosure wording`);
  }
});
