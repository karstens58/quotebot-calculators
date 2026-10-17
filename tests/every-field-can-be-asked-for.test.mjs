/**
 * One true copy per field, and nowhere else for it to live.
 *
 * THE FINDING THAT STARTED THIS. There was no per-field explanation
 * anywhere in dimeneedscalculator.html — four tip elements in two thousand
 * lines. So anything the assistant said about what "Annual Income to
 * Replace" meant was invented per visitor, different every time, and
 * unreviewable. In a licensed context that is the part that should worry
 * somebody, not the tone.
 *
 * The problem was never making the bot consistent. It was that no true copy
 * existed for it to be consistent WITH.
 *
 * So the words live on the input, beside the label they explain:
 *   data-qb-ask       how the assistant puts the question
 *   data-qb-why       what the field means
 *   data-qb-followup  the one follow-up that actually recurs
 *   data-qb-answer    and its answer
 *
 * The page can render `why` as help text and the chat reads the same
 * attribute. One string, two surfaces, no second copy to drift.
 *
 * DERIVED FROM getInputs(), which is the only place that says which fields
 * feed the recommendation. An eighteenth field is a failing test until
 * somebody writes its copy, which is the only moment that is cheap.
 *
 *   node --test tests/every-field-can-be-asked-for.test.mjs
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const HTML = readFileSync(new URL('../site/dimeneedscalculator.html', import.meta.url), 'utf8');

const NEEDS_FIELDS = (() => {
  const i = HTML.indexOf('    debt: { cards:');
  assert.notEqual(i, -1, 'getInputs no longer looks the way this test reads it');
  const block = HTML.slice(i, HTML.indexOf('  };', i));
  const ids = [...block.matchAll(/parseNum\('(\w+)'\)/g)].map((m) => m[1]);
  assert.ok(ids.length > 12, `only ${ids.length} fields found in getInputs`);
  return [...new Set(ids)];
})();

const ATTRS = ['data-qb-ask', 'data-qb-why', 'data-qb-followup', 'data-qb-answer'];

/** The opening tag of one field, whatever element it is. */
function tagFor(id) {
  const m = new RegExp(`<(?:input|select)\\b[^>]*\\bid="${id}"[^>]*>`).exec(HTML);
  return m ? m[0] : null;
}

const valueOf = (tag, attr) => {
  const m = new RegExp(`${attr}="([^"]*)"`).exec(tag);
  return m ? m[1] : null;
};

test('there are fields to check, or this guard proves nothing', () => {
  assert.equal(NEEDS_FIELDS.length, 17,
    `getInputs reads ${NEEDS_FIELDS.length} fields; the copy was written for 17`);
});

test('EVERY FIELD THE NUMBER READS CAN BE ASKED FOR IN WORDS', () => {
  const missing = [];
  for (const id of NEEDS_FIELDS) {
    const tag = tagFor(id);
    if (!tag) { missing.push(`${id}: no input found`); continue; }
    for (const a of ATTRS) {
      const v = valueOf(tag, a);
      if (!v || !v.trim()) missing.push(`${id}: ${a}`);
    }
  }
  assert.deepEqual(missing, [],
    'these fields feed the recommendation and the assistant has no agreed '
    + 'words for them, so it will invent some:\n  ' + missing.join('\n  '));
});

test('the ask is a question and the answer is not', () => {
  for (const id of NEEDS_FIELDS) {
    const tag = tagFor(id);
    assert.match(valueOf(tag, 'data-qb-ask'), /\?$/, `${id} is not asked as a question`);
    assert.match(valueOf(tag, 'data-qb-followup'), /[?.]$/, `${id} follow-up is unpunctuated`);
  }
});

test('nothing is so long it reads as a document', () => {
  // These go into a chat bubble and into help text under a field. A
  // paragraph in either place is a paragraph nobody reads.
  for (const id of NEEDS_FIELDS) {
    const tag = tagFor(id);
    assert.ok(valueOf(tag, 'data-qb-ask').length <= 120, `${id} ask is too long`);
    assert.ok(valueOf(tag, 'data-qb-why').length <= 320, `${id} why is too long`);
    assert.ok(valueOf(tag, 'data-qb-answer').length <= 320, `${id} answer is too long`);
  }
});

test('THE ASK DOES NOT SETTLE GROSS VERSUS NET; THE FOLLOW-UP DOES', () => {
  // Scott, 17 Oct: do not ask it directly, and if they ask, net is the more
  // accurate figure. Asking "gross or net" up front invites a decision most
  // people cannot make; answering it when raised is what an agent does.
  const tag = tagFor('incAnnual');
  const ask = valueOf(tag, 'data-qb-ask').toLowerCase();
  assert.equal(/gross|net|pre-?tax|after.?tax/.test(ask), false,
    'the income question is settling gross versus net before it is asked');
  assert.match(valueOf(tag, 'data-qb-followup').toLowerCase(), /gross or net/);
  assert.match(valueOf(tag, 'data-qb-answer').toLowerCase(), /\bnet\b/);
});

test('THE TWO FIELDS THAT CHANGE NOTHING SAY SO', () => {
  // mc.payoff is the mortgage balance; rate and term only shape the
  // schedule on screen. A visitor who gives up an answer deserves to know
  // when it did not move the recommendation.
  for (const id of ['mortRate', 'mortYears']) {
    const why = valueOf(tagFor(id), 'data-qb-why').toLowerCase();
    assert.match(why, /does not change|not change the recommend/,
      `${id} is asked as though it affects the figure`);
  }
});

test('the education fields say that one of them alone is worth nothing', () => {
  // kids x years x cost, with years falling back to 1 and the rest to 0.
  const why = valueOf(tagFor('eduKids'), 'data-qb-why').toLowerCase();
  assert.match(why, /all three|multiplied/,
    'nothing warns that a child count on its own contributes zero');
});

/**
 * Figures the house has agreed, by field, and what they are.
 *
 * The rule below bars the DRAFTER from inventing a number. It was never
 * meant to bar Scott from setting one, and the original comment said so.
 * He set this one on 17 Oct with the returned field-copy sheet: $25,000 as
 * the recommended minimum for final expenses, which for a visitor with no
 * mortgage and no children is the whole of that section and the only
 * anchor they get.
 *
 * The excuse is the FIGURE, not the field. Listing the amount means a
 * later edit to $50,000 fails here and goes back to him, instead of the
 * exemption quietly becoming a licence for that field to say anything.
 */
const AGREED_FIGURES = {
  finalExp: { amount: '$25,000', agreed: 'Scott, 17 Oct 2026, field-copy sheet' },
};

test('no copy invents a figure the house has not agreed', () => {
  // The repo's standing position, written on the prefill block: seeding an
  // invented number turns the visitor's first correction into a total
  // nobody chose. A dollar amount in this copy is the same mistake with
  // more digits, and it is Scott's to set, not the drafter's.
  for (const id of NEEDS_FIELDS) {
    const tag = tagFor(id);
    const agreed = AGREED_FIGURES[id];
    for (const a of ['data-qb-ask', 'data-qb-why', 'data-qb-answer']) {
      const v = valueOf(tag, a);
      const figures = v.match(/\$\s?[\d,]+/g) ?? [];
      if (!agreed) {
        assert.deepEqual(figures, [],
          `${id} ${a} states a dollar figure that nobody has signed off`);
        continue;
      }
      for (const f of figures) {
        assert.equal(f.replace(/\s/g, ''), agreed.amount,
          `${id} ${a} states ${f}; the agreed figure is ${agreed.amount} `
          + `(${agreed.agreed}). Changing it is Scott's call, not a test's.`);
      }
    }
  }
});

test('AN EXCUSED FIELD STILL HAS TO SAY THE THING IT WAS EXCUSED FOR', () => {
  // Otherwise the list outlives the copy: somebody rewrites finalExp
  // without the figure, the exemption stays, and the next drafter inherits
  // a blank cheque for that field.
  for (const [id, { amount }] of Object.entries(AGREED_FIGURES)) {
    const tag = tagFor(id);
    const says = ['data-qb-ask', 'data-qb-why', 'data-qb-answer']
      .some((a) => valueOf(tag, a).includes(amount));
    assert.ok(says,
      `${id} is excused for ${amount} and no longer states it — drop the excuse`);
  }
});
