/**
 * The Health Analyzer questionnaire, tested against THE REAL collectors cut
 * out of site/quotetool.html.
 *
 * The collectors take a value-getter rather than reading the DOM, which is
 * what lets them be exercised here as the page actually runs them. What they
 * produce goes straight to Compulife, so the failures that matter are quiet
 * ones: a band label that means seven years sending six, a skipped section
 * arriving as an answered one, a sentinel their own form emits being refused.
 *
 *   node --test tests/quotetool-analyzer.test.mjs
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const HTML = readFileSync(new URL('../site/quotetool.html', import.meta.url), 'utf8');

function cut(start, endMarker, { keepEnd = true } = {}) {
  const i = HTML.indexOf(start);
  assert.notEqual(i, -1, `could not find ${start}`);
  const j = HTML.indexOf(endMarker, i + start.length);
  assert.notEqual(j, -1, `could not find the end of ${start}`);
  return HTML.slice(i, keepEnd ? j + endMarker.length : j);
}

const source = [
  cut("const esc = s =>", "replace(/'/g, '&#39;');"),
  cut('const HA_YEARS =', "'more than 15 years'];"),
  cut('const HA_TREATMENT_YEARS =', "'more than 20 years'];"),
  cut('const HA_CONDITIONS = [', '\n];'),
  cut('function haOpts(', '\n}'),
  cut('function haRange(', '\n}'),
  cut('function haSelect(', '\n}'),
  cut('function haYearSelect(', '\n}'),
  cut('function haYesNo(', '\n}'),
  cut('function haQ(', '\n}'),
  cut('var HA_TOBACCO = [', '\n];'),
  cut('var HA_DRIVING = [', '\n];'),
  cut('var HA_TICKET_BANDS = [', '\n];'),
  cut('function haFamilyBlockHtml(', '\n}'),
  cut('function haFamilyMembers(', '\n}'),
  cut('var HA_STEPS = [', '\n];'),
  cut('function haCheck(a){', '\n}'),
  cut('function haAnswers(state){', '\n}'),
].join('\n');

const api = new Function(`${source}
  return { HA_STEPS, HA_YEARS, HA_TREATMENT_YEARS, HA_CONDITIONS,
           haCheck, haAnswers, haFamilyBlockHtml };`)();

const step = (key) => {
  const s = api.HA_STEPS.find((x) => x.key === key);
  assert.ok(s, `no step named ${key}`);
  return s;
};

/* A form the visitor has filled in: values by control id, ticks by id. */
const form = (values = {}, ticks = []) => [
  (name) => (values[name] === undefined ? '' : String(values[name])),
  (name) => ticks.includes(name),
];

const collect = (key, values, ticks) => step(key).collect(...form(values, ticks));

/* ---- the bands, which are the thing most likely to be quietly wrong ---- */

test('COMPULIFE BANDS ARE NOT EVENLY SPACED', () => {
  /* Straight off their own sample form. Band 6 is seven years, not six, and
     an evenly-spaced guess would be wrong from 6 onward -- which is exactly
     the range where it decides whether an old conviction still counts. */
  assert.equal(api.HA_YEARS.length, 10);
  assert.equal(api.HA_YEARS[0], '6 months or less');
  assert.equal(api.HA_YEARS[5], '5 years or less');
  assert.equal(api.HA_YEARS[6], '7 years or less');
  assert.equal(api.HA_YEARS[7], '10 years or less');
  assert.equal(api.HA_YEARS[8], '15 years or less');
  assert.equal(api.HA_YEARS[9], 'more than 15 years');
});

test('the substance-abuse scale is a different, wider one', () => {
  assert.equal(api.HA_TREATMENT_YEARS.length, 12);
  assert.equal(api.HA_TREATMENT_YEARS[10], '10 to 20 years');
  assert.equal(api.HA_TREATMENT_YEARS[11], 'more than 20 years');
  assert.notDeepEqual(api.HA_TREATMENT_YEARS.slice(0, 10), api.HA_YEARS,
    'the two scales were collapsed into one');
});

test('the fourteen family conditions are named as their parser reads them', () => {
  assert.equal(api.HA_CONDITIONS.length, 14);
  const names = api.HA_CONDITIONS.map((c) => c[0]);
  /* Their written docs describe Diabetes00 as "Kidney Disease" and
     KidneyDisease00 as coronary artery disease, which cannot both be true and
     would duplicate CAD. Their own form labels them by their names, so both
     must exist and be distinct. */
  assert.ok(names.includes('Diabetes') && names.includes('KidneyDisease'));
  assert.ok(names.includes('CAD'));
  assert.equal(new Set(names).size, 14, 'a condition is listed twice');
  const diabetes = api.HA_CONDITIONS.find((c) => c[0] === 'Diabetes');
  assert.match(diabetes[1], /Diabetes/i, 'the Diabetes field was labelled as something else');
});

/* ---- skipping is not answering --------------------------------------- */

test('AN UNANSWERED SECTION YIELDS NOTHING AT ALL', () => {
  /* Tobacco is the deliberate exception and is covered on its own below:
     ticking none of the five boxes IS the answer "never used any of it", and
     the step says so in as many words. Everywhere else, a form nobody touched
     must produce nothing -- a fabricated "No" would be a claim the visitor
     did not make, and Compulife would price it as one. */
  for (const s of api.HA_STEPS) {
    if (s.key === 'tobacco') continue;
    assert.equal(s.collect(...form()), undefined,
      `${s.key} invented an answer from an untouched form`);
  }
  assert.equal(api.HA_STEPS.filter((s) => s.key === 'tobacco').length, 1,
    'the exception above no longer names a real step');
});

test('a skipped section is absent from the request, not empty', () => {
  const state = { build: { feet: 5, inches: 10, weight: 180 } };
  const out = api.haAnswers(state);
  assert.deepEqual(Object.keys(out), ['build']);
  assert.equal('tobacco' in out, false);
});

test('NEVER USED TOBACCO IS AN ANSWER, not a skip', () => {
  /* Reaching the step and ticking nothing means "none of it" -- an empty
     object, which switches the group on. Compulife can act on that. Skipping
     the step means we never asked, which is a different request. */
  const answered = collect('tobacco', {}, []);
  assert.deepEqual(answered, {});
  assert.notEqual(answered, undefined);
  assert.equal(api.haAnswers({ tobacco: answered }).tobacco !== undefined, true);
});

/* ---- the sections ----------------------------------------------------- */

test('build needs all three parts before it says anything', () => {
  assert.equal(collect('build', { ha_feet: 5, ha_inches: 10 }), undefined);
  assert.deepEqual(collect('build', { ha_feet: 5, ha_inches: 10, ha_weight: 180 }),
    { feet: 5, inches: 10, weight: 180 });
});

test('zero inches is an answer, not a blank', () => {
  assert.deepEqual(collect('build', { ha_feet: 6, ha_inches: 0, ha_weight: 190 }),
    { feet: 6, inches: 0, weight: 190 });
});

test('a MISSING inches is not quietly read as zero', () => {
  /* Number('') is 0, so a build that skips the check does not fail loudly --
     it reports somebody 5'0" who meant to say 5'9", and prices them for a
     build they do not have. */
  assert.equal(collect('build', { ha_feet: 5, ha_weight: 160 }), undefined);
  assert.equal(collect('build', { ha_inches: 9, ha_weight: 160 }), undefined);
  assert.equal(collect('build', { ha_feet: 5, ha_inches: 9 }), undefined);
});

test('tobacco carries a count only where the question asks one', () => {
  const out = collect('tobacco',
    { ha_per_cig: 3, ha_num_cig: 20, ha_per_pipe: 9, ha_num_pipe: 5 },
    ['ha_tob_cig', 'ha_tob_pipe']);
  assert.deepEqual(out.cigarettes, { period: 3, count: 20 });
  /* Their form asks how many cigarettes and cigars a day, and does not ask it
     of pipes, chewing tobacco or patches. */
  assert.deepEqual(out.pipe, { period: 9 });
  assert.equal('count' in out.pipe, false);
});

test('a ticked tobacco type with no period is not sent half-formed', () => {
  const out = collect('tobacco', { ha_per_cigar: 2 }, ['ha_tob_cig', 'ha_tob_cigar']);
  assert.equal('cigarettes' in out, false, 'a type with no period was still sent');
  assert.deepEqual(out.cigars, { period: 2 });
});

test('BLOOD PRESSURE DETAIL IS ONLY ASKED OF PEOPLE WHO SAID YES', () => {
  /* Their own form hides the readings behind the medication question, so a
     reading from somebody never treated is not a question their analyzer was
     built to receive. */
  const no = collect('bloodPressure', { ha_bp_med: 'N', ha_bp_sys: 130, ha_bp_dia: 85 });
  assert.deepEqual(no, { medication: false });

  const yes = collect('bloodPressure',
    { ha_bp_med: 'Y', ha_bp_sys: 140, ha_bp_dia: 90, ha_bp_treated: 2, ha_bp_controlled: 1 });
  assert.deepEqual(yes,
    { medication: true, systolic: 140, diastolic: 90, treatedPeriod: 2, controlledPeriod: 1 });
});

test('cholesterol follows the same rule and carries a decimal ratio', () => {
  assert.deepEqual(collect('cholesterol', { ha_ch_med: 'N', ha_ch_level: 250 }),
    { medication: false });
  const y = collect('cholesterol', { ha_ch_med: 'Y', ha_ch_level: 250, ha_ch_hdl: '4.50' });
  assert.equal(y.level, 250);
  assert.equal(y.hdlRatio, 4.5, 'the HDL ratio was not read as a decimal');
});

test('no licence stops the driving section there', () => {
  const out = collect('driving', { ha_drv_lic: 'N', ha_drv_dwi: 'Y', ha_drvper_dwi: 0 });
  assert.deepEqual(out, { hasLicence: false });
});

test('driving convictions carry their own period', () => {
  const out = collect('driving',
    { ha_drv_lic: 'Y', ha_drv_dwi: 'Y', ha_drvper_dwi: 6, ha_drv_susp: 'N' });
  assert.deepEqual(out.dwi, { period: 6 });
  assert.equal('suspended' in out, false, 'a No answer produced a conviction');
});

test('TICKETS ARE ALL FIVE BANDS OR NONE', () => {
  /* A partly-filled row would tell Compulife there were zero tickets in the
     bands the visitor never reached, which is a claim nobody made. */
  const none = collect('driving', { ha_drv_lic: 'Y' });
  assert.equal('movingViolations' in none, false);

  const some = collect('driving', { ha_drv_lic: 'Y', ha_mv0: 1, ha_mv3: 2 });
  assert.deepEqual(some.movingViolations, [1, 0, 0, 2, 0]);
  assert.equal(some.movingViolations.length, 5);
});

test('FAMILY BLOCKS FOLLOW THE COUNT the visitor gave', () => {
  const values = { ha_fam_deaths: 2, ha_fam_contracted: 0 };
  const ticks = [];
  for (let i = 0; i < 3; i++) {
    values[`ha_famd${i}_agedied`] = 55 + i;
    values[`ha_famd${i}_parent`] = 'Y';
    ticks.push(`ha_famd${i}_CAD`);
  }
  const out = collect('family', values, ticks);
  /* Three relatives' worth of controls exist in the values, but they said
     two. Reading the third would send an answer about a person who does not
     exist. */
  assert.equal(out.died.length, 2);
  assert.equal(out.deaths, 2);
  assert.deepEqual(out.died[0], { age: 55, isParent: true, conditions: { CAD: true } });
  assert.equal('survived' in out, false);
});

test("don't know is carried, not turned into a zero", () => {
  const out = collect('family', { ha_fam_deaths: -1, ha_fam_contracted: 0 });
  assert.equal(out.deaths, -1, 'an unsure answer became a claim of none');
  assert.equal(out.contracted, 0);
  assert.equal('died' in out, false);
});

test('a relative with no age given is left out rather than guessed', () => {
  const out = collect('family',
    { ha_fam_deaths: 2, ha_famd0_agedied: 60 }, ['ha_famd1_CVA']);
  assert.equal(out.died.length, 1, 'a relative with no age was sent anyway');
  assert.equal(out.died[0].age, 60);
});

test('a surviving relative is keyed on the age they fell ill', () => {
  const out = collect('family', { ha_fam_contracted: 1, ha_fams0_age: 47 });
  assert.equal(out.survived[0].age, 47);
});

test('A SIBLING IS NOT RECORDED AS A PARENT', () => {
  /* Carriers weigh a parent's history differently from a sibling's, so this
     is not a cosmetic field. Every other family test here happens to say
     Yes, which would let "always a parent" pass unnoticed. */
  const out = collect('family',
    { ha_fam_deaths: 2,
      ha_famd0_agedied: 58, ha_famd0_parent: 'N',
      ha_famd1_agedied: 64, ha_famd1_parent: 'Y' });
  assert.equal(out.died[0].isParent, false, 'a sibling was reported as a parent');
  assert.equal(out.died[1].isParent, true);

  /* Unanswered is not a parent either -- it must not default to the heavier
     of the two. */
  const blank = collect('family', { ha_fam_deaths: 1, ha_famd0_agedied: 60 });
  assert.equal(blank.died[0].isParent, false);
});

test('substance abuse: No is recorded, years only follow a Yes', () => {
  const no = collect('substanceAbuse', { ha_alc: 'N', ha_drg: 'N' });
  assert.deepEqual(no, { alcohol: { treated: false }, drugs: { treated: false } });

  const yes = collect('substanceAbuse', { ha_alc: 'Y', ha_alc_yrs: 11, ha_drg: 'N', ha_drg_yrs: 4 });
  assert.deepEqual(yes.alcohol, { treated: true, yearsSince: 11 });
  assert.deepEqual(yes.drugs, { treated: false },
    'years since treatment were attached to somebody who was never treated');

  /* Both ways round. A stale value left in the hidden years control -- which
     is exactly what happens when somebody answers Yes, picks a number and
     then changes their mind to No -- must not turn into a treatment history
     they just told us they do not have. Testing only one of the two
     substances lets the same bug survive in the other. */
  const swapped = collect('substanceAbuse', { ha_alc: 'N', ha_alc_yrs: 7, ha_drg: 'Y', ha_drg_yrs: 2 });
  assert.deepEqual(swapped.alcohol, { treated: false });
  assert.deepEqual(swapped.drugs, { treated: true, yearsSince: 2 });
});

/* ---- refusing what the engine would refuse ---------------------------- */

test('THE SENTINELS THEIR OWN FORM SENDS ARE ACCEPTED', () => {
  /* Refusing these would refuse values Compulife's own UI produces. The two
     blood-pressure scales are not symmetrical: 119 but 78. */
  assert.deepEqual(api.haCheck({ build: { feet: 5, inches: 6, weight: 74 } }), []);
  assert.deepEqual(api.haCheck({ build: { feet: 5, inches: 6, weight: 401 } }), []);
  assert.deepEqual(api.haCheck({ bloodPressure: { systolic: 119, diastolic: 78 } }), []);
  assert.deepEqual(api.haCheck({ bloodPressure: { systolic: 251, diastolic: 181 } }), []);
  assert.deepEqual(api.haCheck({ bloodPressure: { systolic: -1, diastolic: -1 } }), []);
  assert.deepEqual(api.haCheck({ cholesterol: { level: -1, hdlRatio: -1 } }), []);
});

test('out-of-range answers are named, not clamped', () => {
  assert.deepEqual(api.haCheck({ build: { feet: 3, inches: 6, weight: 180 } }),
    ['height in feet']);
  /* Twelve inches is a foot. Their form stops at 11, and 5'12" prices a
     different person than the 6'0" that was meant. */
  assert.deepEqual(api.haCheck({ build: { feet: 5, inches: 12, weight: 180 } }),
    ['height in inches']);
  assert.deepEqual(api.haCheck({ build: { feet: 5, inches: 6, weight: 402 } }), ['weight']);
  assert.deepEqual(api.haCheck({ bloodPressure: { diastolic: 77 } }), ['diastolic pressure']);
  assert.deepEqual(api.haCheck({ cholesterol: { hdlRatio: 12 } }), ['HDL ratio']);
});

test('every problem is reported, not just the first', () => {
  const bad = api.haCheck({ build: { feet: 9, inches: 40, weight: 900 } });
  assert.deepEqual(bad, ['height in feet', 'height in inches', 'weight']);
});

test('a clean set of answers reports nothing', () => {
  assert.deepEqual(api.haCheck({
    build: { feet: 5, inches: 10, weight: 180 },
    bloodPressure: { medication: true, systolic: 140, diastolic: 90 },
    cholesterol: { medication: true, level: 210, hdlRatio: 4.5 },
    family: { deaths: 1, contracted: 0, died: [{ age: 62, isParent: true, conditions: {} }] },
  }), []);
});

test('a relative with an impossible age is caught', () => {
  assert.deepEqual(api.haCheck({
    family: { deaths: 1, contracted: 0, died: [{ age: 140, isParent: true, conditions: {} }] },
  }), ['a relative’s age']);
});

/* ---- the markup ------------------------------------------------------- */

test('ADMIN-FREE TEXT AND LABELS CANNOT INJECT MARKUP', () => {
  const html = api.haFamilyBlockHtml('famd', 0, true);
  assert.ok(html.includes('ha_famd0_agedied'), 'the death-age control is missing');
  assert.ok(html.includes('ha_famd0_CAD'));
  const ids = api.HA_CONDITIONS.filter((c) => html.includes(`ha_famd0_${c[0]}"`));
  assert.equal(ids.length, 14, 'not every condition got a checkbox');
});

test('a surviving relative is not asked their age at death', () => {
  const html = api.haFamilyBlockHtml('fams', 0, false);
  assert.equal(html.includes('_agedied'), false);
  assert.ok(html.includes('ha_fams0_age'));
});

test('every step has a title, a blurb and both halves', () => {
  assert.equal(api.HA_STEPS.length, 7);
  for (const s of api.HA_STEPS) {
    assert.ok(s.title && s.blurb, `${s.key} is missing its words`);
    assert.equal(typeof s.html, 'function');
    assert.equal(typeof s.collect, 'function');
    assert.ok(s.html().length > 40, `${s.key} rendered almost nothing`);
  }
});

test('the step keys are exactly what the engine takes', () => {
  assert.deepEqual(api.HA_STEPS.map((s) => s.key),
    ['build', 'tobacco', 'bloodPressure', 'cholesterol', 'driving', 'family',
     'substanceAbuse']);
});
