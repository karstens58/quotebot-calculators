/*
 * quotetool.html's own script, which used to sit inline in the page.
 *
 * It had to move: a Content-Security-Policy without 'unsafe-inline' blocks an
 * inline <script>, so inline this page would have gone dead the moment the
 * policy went on -- quietly, with the markup looking perfectly correct.
 *
 * Moved verbatim.
 */
/* ---------- STATES ---------- */
const STATES = ["Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut","Delaware","District of Columbia","Florida","Georgia","Hawaii","Idaho","Illinois","Indiana","Iowa","Kansas","Kentucky","Louisiana","Maine","Maryland","Massachusetts","Michigan","Minnesota","Mississippi","Missouri","Montana","Nebraska","Nevada","New Hampshire","New Jersey","New Mexico","New York","North Carolina","North Dakota","Ohio","Oklahoma","Oregon","Pennsylvania","Rhode Island","South Carolina","South Dakota","Tennessee","Texas","Utah","Vermont","Virginia","Washington","West Virginia","Wisconsin","Wyoming"];
const stateSel = document.getElementById('state');
  /* Unchosen on arrival. Without this the list falls to its first entry
     and the visitor is quoted somewhere they never picked. */
  { const ph = document.createElement('option');
    ph.value = ''; ph.textContent = 'Select your state'; ph.selected = true;
    stateSel.appendChild(ph); }

STATES.forEach(s => { const o = document.createElement('option'); o.value = s; o.textContent = s; /* No default state: it changes the rates, so it is theirs to pick. */ stateSel.appendChild(o); });

/* ---------- PREFILL FROM THE QUERY STRING ----------
   The hero form on /life-insurance/ collects date of birth, gender, coverage,
   term and health, and used to throw them away: its button opened this page
   with no parameters, so the visitor typed everything twice.

   Every value is matched against what this page actually offers rather than
   assigned. A select set to a string that is not one of its options silently
   becomes empty, which would look to the visitor exactly like a field they
   forgot to fill in — so an unrecognised value is ignored and the field is
   left for them, which is the honest failure.

   Runs after STATES is populated above, because a state cannot be selected
   before its option exists.

   Nothing here submits anything. It fills the form; the visitor still presses
   the button, and still has to supply whatever the hero did not ask for.     */
(function prefillFromQuery() {
  var q = new URLSearchParams(location.search);
  if (![...q.keys()].length) return;

  /* Set a <select> only if the wanted value is genuinely one of its options. */
  function pickOption(sel, wanted, matcher) {
    if (!sel || !wanted) return false;
    var opt = [...sel.options].find(matcher || function (o) { return o.value === wanted; });
    if (!opt || opt.disabled) return false;
    sel.value = opt.value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  /* Gender and tobacco are segmented buttons, not selects: the active one is
     read from the DOM when quoting, so this has to move the class, not a value. */
  function pickSegment(id, wanted) {
    if (!wanted) return false;
    var seg = document.getElementById(id);
    if (!seg) return false;
    var btn = [...seg.querySelectorAll('button')]
      .find(function (b) { return (b.dataset.val || '').toLowerCase() === wanted.toLowerCase(); });
    if (!btn) return false;
    seg.querySelectorAll('button').forEach(function (b) { b.classList.remove('active'); });
    btn.classList.add('active');
    btn.dispatchEvent(new Event('click', { bubbles: true }));
    return true;
  }

  /* The field is <input type="date">, which accepts YYYY-MM-DD and nothing
     else: hand it 01/15/1980 and it silently stays empty, so the visitor sees
     a blank birth date and no error. Both shapes are accepted here and
     normalised, and the parts are range-checked so an impossible date is
     ignored rather than quietly dropped by the control. */
  var dob = (q.get('dob') || '').trim();
  var iso = null;
  var us = dob.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (us) iso = [us[3], us[1].padStart(2, '0'), us[2].padStart(2, '0')];
  else if (/^\d{4}-\d{2}-\d{2}$/.test(dob)) iso = dob.split('-');
  if (iso) {
    var y = +iso[0], m = +iso[1], d = +iso[2];
    var real = new Date(y, m - 1, d);
    var sane = m >= 1 && m <= 12 && d >= 1 && real.getMonth() === m - 1
      && real.getDate() === d && y >= 1900 && real <= new Date();
    var el = document.getElementById('dob');
    if (sane && el) { el.value = iso.join('-'); el.dispatchEvent(new Event('change', { bubbles: true })); }
  }

  var coverage = (q.get('coverage') || '').replace(/[^0-9]/g, '');
  if (coverage) {
    var cov = document.getElementById('coverage');
    if (cov) { cov.value = Number(coverage).toLocaleString('en-US'); cov.dispatchEvent(new Event('input', { bubbles: true })); }
  }

  pickSegment('genderSeg', q.get('gender'));
  pickSegment('tobaccoSeg', q.get('tobacco'));
  pickOption(document.getElementById('state'), q.get('state'));
  pickOption(document.getElementById('health'), q.get('health'));

  /* Term arrives as a number of years and is matched against the option text
     ("20 Year Level Term Guaranteed"), not against the option's value, which
     is an internal id — 20 years is "5" — and would be meaningless in a url
     and would break the day those ids are renumbered. */
  var years = (q.get('term') || '').replace(/[^0-9]/g, '');
  if (years) {
    pickOption(document.getElementById('coverageCat'), years, function (o) {
      return new RegExp('^\\s*' + years + '\\s+Year\\b').test(o.textContent);
    });
  }

  /* Take the answers out of the address bar once they are in the form. They
     have already been sent, so this is not privacy in any strong sense — but
     it keeps a birth date out of a url the visitor might copy, bookmark or
     hand to someone, and out of this page's own outbound referrers. */
  /* Take the answers out of the address bar once they are in the form, and
     LEAVE THE TRACKING CODE. This used to clear the whole query string, so
     every visitor who arrived here from an affiliate's page lost the
     affiliate on the way in. QuoteBot.tidyQuery keeps the attribution
     params and drops the rest — one keep-list, next to the code that reads
     them. See js/quotebot-capture.js. */
  try {
    if (window.QuoteBot && window.QuoteBot.tidyQuery) window.QuoteBot.tidyQuery();
  } catch (e) {}
})();

/* ---------- CARRIERS (per1000 = annual rate per $1,000, calibrated to 48 / Male / Non-tobacco / Standard / 10yr) ---------- */
const CARRIERS = [
  { id:'amgen',  name:'American General Life Insurance Company', prod:'Select-a-Term - {T} Year',     rating:'A',       per1000:1.557, logo:`<div class="logo logo-corebridge">corebridge<i> :</i><small>financial</small></div>` },
  { id:'banner', name:'Banner Life Insurance Company',          prod:'OPTerm {T} - {T} Year Term',    rating:'A',       per1000:1.566, logo:`<div class="logo"><div class="logo-banner">BannerLife</div></div>` },
  { id:'better', name:'BetterLife',                              prod:'Term to 95 - {T} Year Level (Par)', rating:'Unknown', per1000:1.600, logo:`<div class="logo logo-better">Better<i>Life</i></div>` },
  { id:'cinci',  name:'Cincinnati Life Insurance Company',      prod:'Termsetter {T}',                rating:'A+',      per1000:1.710, logo:`<div class="logo logo-cinci">CINCINNATI<small>LIFE INSURANCE CO.</small></div>` },
  { id:'northam',name:'North American Co for Life and Health',  prod:'ADDvantage Term {T} Gen 9',     rating:'A+',      per1000:1.730, logo:`<div class="logo logo-northam">NORTH AMERICAN<small>A Sammons Company</small></div>` },
  { id:'aaa',    name:'AAA Life Insurance Company',             prod:'{T} Year Level Term',           rating:'A',       per1000:2.050, logo:`<div class="logo logo-aaa">AAA<small>Life Insurance Co.</small></div>` },
  { id:'sw',     name:'Life Insurance Company of the Southwest',prod:'{T}-Year Term',                 rating:'A+',      per1000:2.120, logo:`<div class="logo logo-sw"><div class="logo-tri"></div>National Life<small>Group</small></div>` },
];

/* ---------- RATE ENGINE ---------- */
const TERM_FACTOR  = { 10:1.0, 15:1.28, 20:1.65, 30:2.55 };
const HEALTH_FACTOR= { 'Preferred Plus':0.68, 'Preferred':0.80, 'Standard Plus':0.91, 'Standard':1.0 };
const ANNUAL_DIVISOR = 11.832; // monthly = annual / divisor (reflects annual-pay discount)

function computeAge(dobStr){
  if(!dobStr) return 0;
  const d = new Date(dobStr), n = new Date();
  let a = n.getFullYear() - d.getFullYear();
  const m = n.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && n.getDate() < d.getDate())) a--;
  return a;
}
function getInputs(){
  const dob = document.getElementById('dob').value;
  return {
    firstName: document.getElementById('firstName').value.trim(),
    lastName:  document.getElementById('lastName').value.trim(),
    dob, age: computeAge(dob),
    state: document.getElementById('state').value,
    gender: document.querySelector('#genderSeg .active').dataset.val,
    tobacco: document.querySelector('#tobaccoSeg .active').dataset.val,
    health: document.getElementById('health').value,
    coverage: parseInt(document.getElementById('coverage').value.replace(/[^0-9]/g,'')) || 0,
    /*
     * The Compulife category letter IS the coverage -- one value where there
     * used to be a product and a duration, which could contradict each other
     * (Guaranteed UL paired with "20 Year Term" meant nothing).
     */
    cat: catSel().value,
    catName: catSel().selectedOptions[0] ? catSel().selectedOptions[0].textContent.trim() : '',
    /* Years, for the lead record only, and null when the category is not a
       level term -- a to-age-95 UL has no term length to record. */
    term: termYearsOf(catSel().selectedOptions[0]
      ? catSel().selectedOptions[0].textContent : ''),
  };
}

function catSel(){ return document.getElementById('coverageCat'); }

/* "20 Year Level Term Guaranteed" -> 20. Anything without a leading year
   count -- to-age, UL, whole life -- returns null rather than a wrong number. */
function termYearsOf(name){
  const m = /^\s*(\d+)\s+year\b/i.exec(String(name || ''));
  return m ? parseInt(m[1], 10) : null;
}

/*
 * The live category list, so the tool offers exactly what the engine will
 * price. Failure is not fatal: the markup ships with the five options the
 * page used to offer, so a visitor can still get a quote if this call fails.
 */
async function loadCoverageCategories(){
  const endpoint = window.QB_QUOTE_ENDPOINT || '';
  if (!/^https?:\/\//i.test(endpoint)) return;
  try {
    const res = await fetch(endpoint.replace(/\/$/, '') + '/categories');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const list = (await res.json()).categories;
    if (!Array.isArray(list) || !list.length) throw new Error('empty list');
    const sel = catSel();
    const had = sel.value;
    sel.innerHTML = '';
    for (const c of list){
      if (!c || !c.letter || !c.name) continue;
      const o = document.createElement('option');
      /* textContent, not innerHTML: these names come off the wire. */
      o.value = String(c.letter);
      o.textContent = String(c.name);
      sel.appendChild(o);
    }
    /* Keep what the visitor had chosen if it survived; otherwise the
       20-year term, falling back to whatever is first. */
    const wanted = [had, '5'].find(v => v && sel.querySelector(`option[value="${v}"]`));
    sel.value = wanted || (sel.options[0] ? sel.options[0].value : '');
  } catch (err) {
    /* Silent by design: the fallback options are real and the visitor can
       still quote. Logged so it is findable. */
    console.warn('[quotetool] live coverage list unavailable, using fallback', err);
  }
}
loadCoverageCategories();
function rateFor(carrier, inp){
  const ageF = Math.pow(1.072, inp.age - 48);
  const termF = TERM_FACTOR[inp.term] || 1;
  const healthF = HEALTH_FACTOR[inp.health] || 1;
  const tobaccoF = inp.tobacco === 'Yes' ? 2.6 : 1.0;
  const genderF = inp.gender === 'Female' ? 0.86 : 1.0;
  const annual = carrier.per1000 * (inp.coverage/1000) * ageF * termF * healthF * tobaccoF * genderF;
  const monthly = annual / ANNUAL_DIVISOR;
  return { annual, monthly };
}
/*
 * MONEY, WITH CENTS ONLY WHEN THERE ARE CENTS -- Scott, 8 November:
 * "if there is 1,000.01 vs 1,000.00 we should show the .01."
 *
 * These were '$' + n.toFixed(2) and '$' + Math.round(n): the monthly
 * always padded to .00, the annual always rounded to the dollar. The
 * quote page, the rate card and the quote email all mirrored them,
 * because matching this screen is their whole job -- so the four
 * surfaces move together or not at all. They move together.
 *
 * ROUNDED TO THE CENT BEFORE ASKING. An annual built by multiplying a
 * monthly by twelve arrives as 1594.9999999999998, which is not a whole
 * number and is not $1,594.99 either.
 *
 * AND toLocaleString ON BOTH. fmtMo had no thousands separator, so a
 * $10M policy priced at $1234.56 a month printed without the comma
 * every other surface puts in.
 *
 * SELF-CONTAINED ON PURPOSE: the card tests slice these lines out of
 * this file and eval them, so a helper declared above would be a
 * reference to nothing in the harness.
 */
const fmtMo = n => {
  const cents = Math.round(n * 100) % 100 !== 0;
  return '$' + n.toLocaleString('en-US', {
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  });
};
/* The same rule. Two names because the call sites say which figure
   they are printing, and that is worth keeping readable. */
const fmtYr = fmtMo;
const ratingRank = r => ({ 'A+':4, 'A':3, 'A-':2, 'B++':1, 'Unknown':0 }[r] ?? 0);

/* ---------- STATE ---------- */
let QUOTES = [];        // computed rows
/* The middle and right cards: carriers chosen in the admin console, with the
   reasons written there. Returned by the engine alongside the quotes, and
   always drawn FROM them, so a card can never name a carrier that did not
   quote. Empty is an ordinary state -- renderBest falls back to price and
   shows no reasons rather than inventing any. */
let FEATURED = [];

/*
 * WHAT THE THREE CARDS ACTUALLY SAID, and whether the premiums were filed
 * or modelled -- QBP-533.
 *
 * Both exist so the RECORD of this quote can say what the SCREEN said.
 * lead-capture stores the quote list as an Illustration, which is the
 * evidence of what was displayed, and until now it stored the list alone:
 * no note of which three were drawn as cards, and no note of where the
 * numbers came from. So the page we later text somebody a link to could
 * recover the cheapest row by price and nothing else -- it could not know
 * which carrier was Our Recommendation, because that comes from the engine's
 * separate `featured` list and was never written down.
 *
 * Recorded as the SLOT's claim rather than the badge on screen. A curated
 * carrier may show the admin's own words instead of "Our Recommendation", and those
 * are decoration; what the record needs is which claim the card made.
 */
let SHOWN = [];
let ESTIMATES = true;
/* Set per quote: was this result set narrowed by Health Analyzer answers. */
let FILTERED_BY_HEALTH = false;
/*
 * The Health Analyzer answers, once the visitor has given them.
 *
 * Null until they open the analyzer, which they do from the results -- they
 * have already been shown a price by then, so this only ever narrows a list
 * they have seen. The questionnaire's whole job is to fill this and re-quote.
 */
let HEALTH_ANSWERS = null;
let visibleCount = 5;   // for Show More

/* Admin-entered text reaches the page through innerHTML, so it is escaped
   here. Not because the admin is hostile, but because a carrier named
   "Smith & Sons <Life>" should render as itself rather than as broken markup. */
const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/* The cheapest quote, found by price rather than assumed to be first -- being
   the cheapest is the entire claim the left-hand card makes. Mirrors
   cheapestOf() in the engine's shared/featured.ts. */
function cheapestQuote(rows){
  let best = null;
  for (const r of rows){
    if (typeof r.monthly !== 'number' || !isFinite(r.monthly)) continue;
    if (best === null || r.monthly < best.monthly) best = r;
  }
  return best;
}

/* ---- Quote engine -------------------------------------------------------
 * Pricing is server-side now. CARRIERS below is kept only to supply logos;
 * rateFor() no longer prices anything a visitor sees.
 *
 * On failure this shows an error rather than falling back to a locally
 * computed premium. Someone seeing an invented number they believe is a
 * carrier rate is the failure this change exists to remove.
 * ---------------------------------------------------------------------- */
let PREMIUMS_ARE_ESTIMATES = true;

/* Compulife hosts a logo per company code, so every carrier in their book
 * renders — not just the handful that were hand-coded here. Falls back to the
 * carrier name if the image 404s. */
function logoFor(name, code, url){
  var safe = String(name || '').replace(/[&<>"]/g, '');
  if (url){
    return '<img src="' + url + '" alt="' + safe + '" style="max-height:34px;max-width:104px;object-fit:contain" ' +
           'onerror="this.outerHTML=\'<div class=&quot;logo&quot;>' + safe.split(' ').slice(0,2).join(' ') + '</div>\'">';
  }
  return '<div class="logo">' + safe.split(' ').slice(0,2).join(' ') + '</div>';
}

/**
 * Turn the qualify banner into an invitation to talk, for the two cases where
 * the comparison has nothing to show.
 *
 * Reuses the banner rather than adding a second thing to the page: whatever it
 * was offering, it is not the useful next step once the list is empty.
 */
let QUALIFY_ORIGINAL = null;

/* Put the banner back to whatever the page shipped with. Called on every
   result set that has rows in it: without this, one empty quote leaves the
   analyzer offer reading "Have someone call me" for the rest of the visit. */
function resetQualifyBanner(){
  if (!QUALIFY_ORIGINAL) return;
  const wrap = document.querySelector('.qualify');
  if (!wrap) return;
  const h = wrap.querySelector('.qualify-text h3');
  const p = wrap.querySelector('.qualify-text p');
  const btn = wrap.querySelector('.qualify-btn');
  if (h) h.textContent = QUALIFY_ORIGINAL.h;
  if (p) p.textContent = QUALIFY_ORIGINAL.p;
  if (btn) { btn.textContent = QUALIFY_ORIGINAL.btn; delete btn.dataset.mode; }
}

function showTalkToUs(){
  const wrap = document.querySelector('.qualify');
  if (!wrap) return;
  const h = wrap.querySelector('.qualify-text h3');
  const p = wrap.querySelector('.qualify-text p');
  const btn = wrap.querySelector('.qualify-btn');
  /* Captured on the first swap only -- capturing later would save the
     already-swapped words and make the reset a no-op. */
  if (!QUALIFY_ORIGINAL) {
    QUALIFY_ORIGINAL = {
      h: h ? h.textContent : '', p: p ? p.textContent : '',
      btn: btn ? btn.textContent : ''
    };
  }
  if (h) h.textContent = 'Let\u2019s find you a policy the hard way';
  if (p) {
    p.textContent = 'Automated comparisons give up early. A licensed agent can '
      + 'work carriers and products this page does not price, and will tell you '
      + 'plainly if there is nothing worth doing.';
  }
  if (btn) {
    btn.textContent = 'Have someone call me';
    btn.dataset.mode = 'contact';
  }
  wrap.scrollIntoView({ behavior: 'smooth', block: 'center' });
}


/* ======================================================================
 * Health Analyzer questionnaire
 *
 * Fills HEALTH_ANSWERS and re-quotes. Every label and every band below is
 * taken from Compulife's own sample form, not from their prose docs -- the
 * two disagree, and the form is what their parser was built against. The
 * year bands are theirs and are NOT evenly spaced: band 6 is "7 years or
 * less", not 6. Getting that wrong prices a different person.
 *
 * Seven sections, each skippable. Skipping one is not the same as answering
 * it "no": a skipped section is absent from the request entirely, which is
 * Compulife's default, and the verdict for anything it would have decided
 * comes back as "not enough information" rather than wrong.
 * ==================================================================== */

/* Their 0-9 scale, verbatim. */
const HA_YEARS = ['6 months or less', '1 year or less', '2 years or less',
  '3 years or less', '4 years or less', '5 years or less', '7 years or less',
  '10 years or less', '15 years or less', 'more than 15 years'];

/* Their substance-abuse scale is wider and differently spaced: 0-11. */
const HA_TREATMENT_YEARS = ['1 year or less', '1 to 2 years', '2 to 3 years',
  '3 to 4 years', '4 to 5 years', '5 to 6 years', '6 to 7 years', '7 to 8 years',
  '8 to 9 years', '9 to 10 years', '10 to 20 years', 'more than 20 years'];

/* Field name first: their parser reads the name, and their own form labels
   these exactly as below -- which settles the contradiction in their written
   docs, where Diabetes00 is described as "Kidney Disease". */
const HA_CONDITIONS = [
  ['CVD', 'Cardiovascular disease'],
  ['CAD', 'Coronary artery disease or heart attack'],
  ['CVI', 'Cardiovascular impairments'],
  ['CVA', 'Cerebrovascular disease or stroke'],
  ['Diabetes', 'Diabetes'],
  ['KidneyDisease', 'Kidney disease'],
  ['ColonCancer', 'Colon cancer'],
  ['IntestinalCancer', 'Intestinal cancer'],
  ['BreastCancer', 'Breast cancer'],
  ['ProstateCancer', 'Prostate cancer'],
  ['OvarianCancer', 'Ovarian cancer'],
  ['OtherInternalCancer', 'Other internal cancer'],
  ['MalignantMelanoma', 'Malignant melanoma'],
  ['BasalCellCarcinoma', 'Basal cell carcinoma'],
];

/* ---- small builders, all returning strings ---------------------------- */

function haOpts(pairs, placeholder){
  var out = placeholder ? '<option value="">' + esc(placeholder) + '</option>' : '';
  for (var i = 0; i < pairs.length; i++){
    out += '<option value="' + esc(String(pairs[i][0])) + '">' + esc(String(pairs[i][1])) + '</option>';
  }
  return out;
}
function haRange(lo, hi){
  var p = [];
  for (var i = lo; i <= hi; i++) p.push([i, i]);
  return p;
}
function haSelect(name, pairs, placeholder){
  return '<select id="' + name + '">' + haOpts(pairs, placeholder) + '</select>';
}
function haYearSelect(name){
  return haSelect(name, HA_YEARS.map(function(l, i){ return [i, l]; }), 'Select…');
}
function haYesNo(name){
  return '<span class="ha-yn">'
    + '<label><input type="radio" name="' + name + '" value="Y">Yes</label>'
    + '<label><input type="radio" name="' + name + '" value="N">No</label></span>';
}
function haQ(label, control){
  return '<div class="ha-q"><span class="ha-qlabel">' + label + '</span>'
    + '<div class="ha-row">' + control + '</div></div>';
}

/* ---- the seven sections ----------------------------------------------
 * Each has html() and collect(v, vc). `v(name)` gives a control's string
 * value ('' when unanswered) and `vc(name)` whether a checkbox is ticked.
 * Keeping the collectors off the DOM is what makes them testable against
 * the real page rather than against a retyped copy.
 * -------------------------------------------------------------------- */

var HA_TOBACCO = [
  ['cig', 'cigarettes', 'Cigarettes', 'smoked a cigarette', 'cigarettes'],
  ['cigar', 'cigars', 'Cigars', 'smoked a cigar', 'cigars'],
  ['pipe', 'pipe', 'A pipe', 'smoked a pipe', ''],
  ['chew', 'chewing', 'Chewing tobacco', 'used chewing tobacco', ''],
  ['nrt', 'nicotineReplacement', 'Nicotine patches or gum', 'used patches or gum', ''],
];

var HA_DRIVING = [
  ['dwi', 'dwi', 'Have you ever been convicted of drunk driving (DUI/DWI)?',
    'How long since the most recent conviction?'],
  ['reckless', 'reckless', 'Have you ever been convicted of reckless driving?',
    'How long since the most recent conviction?'],
  ['susp', 'suspended', 'Has your licence ever been revoked or suspended?',
    'How long since the most recent one?'],
  ['acc', 'moreThanOneAccident', 'Have you ever had more than one accident?',
    'Not counting the last one, how long since the accident before it?'],
];

var HA_TICKET_BANDS = [
  ['in the last 6 months', 'ha_mv0'],
  ['6 to 12 months ago', 'ha_mv1'],
  ['1 to 2 years ago', 'ha_mv2'],
  ['2 to 3 years ago', 'ha_mv3'],
  ['3 to 5 years ago', 'ha_mv4'],
];

function haFamilyBlockHtml(kind, i, withDeathAge){
  var p = 'ha_' + kind + i;
  var h = '<div class="ha-member"><h4>' + (i === 0 ? 'Youngest' : i === 1 ? 'Next youngest' : 'Third')
    + ' relative</h4>';
  if (withDeathAge) h += haQ('Age at death', haSelect(p + '_agedied', haRange(0, 99), 'Select…'));
  h += haQ('Age when they first had any of these illnesses',
    haSelect(p + '_age', haRange(0, 99), 'Select…'));
  h += haQ('Was this person a parent?', haYesNo(p + '_parent'));
  h += '<span class="ha-qlabel">Which of these did they have?</span><div class="ha-checks">';
  for (var c = 0; c < HA_CONDITIONS.length; c++){
    h += '<label><input type="checkbox" id="' + p + '_' + HA_CONDITIONS[c][0] + '">'
      + esc(HA_CONDITIONS[c][1]) + '</label>';
  }
  return h + '</div></div>';
}

function haFamilyMembers(kind, count, v, vc, withDeathAge){
  var out = [];
  for (var i = 0; i < count; i++){
    var p = 'ha_' + kind + i;
    var conds = {};
    for (var c = 0; c < HA_CONDITIONS.length; c++){
      if (vc(p + '_' + HA_CONDITIONS[c][0])) conds[HA_CONDITIONS[c][0]] = true;
    }
    /* Compulife ask a died relative for both ages; ours carries one, and for
       a death the age at death is the one their block is keyed on. */
    var age = v(withDeathAge ? p + '_agedied' : p + '_age');
    if (age === '') continue;
    out.push({ age: Number(age), isParent: v(p + '_parent') === 'Y', conditions: conds });
  }
  return out;
}

var HA_STEPS = [
  {
    key: 'build',
    title: 'Height and weight',
    blurb: 'Build is the single biggest factor in what a carrier will offer, so this one is worth answering even if you skip the rest.',
    html: function(){
      return haQ('Height',
          haSelect('ha_feet', haRange(4, 7), 'ft') + '<span>feet</span>'
          + haSelect('ha_inches', haRange(0, 11), 'in') + '<span>inches</span>')
        + haQ('Weight', haSelect('ha_weight',
            [[74, 'Under 75 lbs']].concat(haRange(75, 400)).concat([[401, 'Over 400 lbs']]),
            'Select…') + '<span>lbs</span>');
    },
    collect: function(v){
      var f = v('ha_feet'), i = v('ha_inches'), w = v('ha_weight');
      if (f === '' || i === '' || w === '') return undefined;
      return { feet: Number(f), inches: Number(i), weight: Number(w) };
    },
  },
  {
    key: 'tobacco',
    title: 'Tobacco and nicotine',
    blurb: 'Tick anything you have ever used, even once and even long ago. Ticking nothing is an answer too, and a useful one.',
    html: function(){
      var h = '';
      for (var i = 0; i < HA_TOBACCO.length; i++){
        var t = HA_TOBACCO[i];
        h += '<div class="ha-q"><label><input type="checkbox" id="ha_tob_' + t[0]
          + '" data-ha-reveal="ha_tobsub_' + t[0] + '"> ' + esc(t[2]) + '</label>'
          + '<div class="ha-sub" id="ha_tobsub_' + t[0] + '" hidden>'
          + haQ('How long since you last ' + esc(t[3]) + '?', haYearSelect('ha_per_' + t[0]))
          + (t[4] ? haQ('On average, how many ' + esc(t[4]) + ' a day?',
              haSelect('ha_num_' + t[0], haRange(1, 99), 'Select…')) : '')
          + '</div></div>';
      }
      return h;
    },
    collect: function(v, vc){
      /* An empty object is deliberate: it switches the section on and says
         "never used any of it", which is a verdict they can act on. Skipping
         the step returns undefined instead, and those are not the same. */
      var out = {};
      for (var i = 0; i < HA_TOBACCO.length; i++){
        var t = HA_TOBACCO[i];
        if (!vc('ha_tob_' + t[0])) continue;
        var per = v('ha_per_' + t[0]);
        if (per === '') continue;
        var use = { period: Number(per) };
        if (t[4] && v('ha_num_' + t[0]) !== '') use.count = Number(v('ha_num_' + t[0]));
        out[t[1]] = use;
      }
      return out;
    },
  },
  {
    key: 'bloodPressure',
    title: 'Blood pressure',
    blurb: 'If you have never been treated for it, answer No and move on.',
    html: function(){
      return haQ('Have you ever been treated for, or taken medication for, high blood pressure?',
          haYesNo('ha_bp_med'))
        + '<div class="ha-sub" id="ha_bp_sub" hidden>'
        + haQ('Systolic pressure (the top number)', haSelect('ha_bp_sys',
            [[-1, 'I don’t know'], [119, 'Less than 120']]
              .concat(haRange(120, 250)).concat([[251, 'Over 250']]), 'Select…'))
        + haQ('Diastolic pressure (the bottom number)', haSelect('ha_bp_dia',
            [[-1, 'I don’t know'], [78, 'Less than 80']]
              .concat(haRange(79, 180)).concat([[181, 'Over 180']]), 'Select…'))
        + haQ('When were you last treated for it?', haYearSelect('ha_bp_treated'))
        + haQ('If you take medication for it now, how long has it been well controlled?',
            haYearSelect('ha_bp_controlled'))
        + '</div>';
    },
    collect: function(v){
      var med = v('ha_bp_med');
      if (med === '') return undefined;
      var out = { medication: med === 'Y' };
      /* Their own form asks the numbers only of people who answered Yes, so
         we do too: a reading volunteered by somebody never treated is not a
         question their analyzer was built to receive. */
      if (med !== 'Y') return out;
      if (v('ha_bp_sys') !== '') out.systolic = Number(v('ha_bp_sys'));
      if (v('ha_bp_dia') !== '') out.diastolic = Number(v('ha_bp_dia'));
      if (v('ha_bp_treated') !== '') out.treatedPeriod = Number(v('ha_bp_treated'));
      if (v('ha_bp_controlled') !== '') out.controlledPeriod = Number(v('ha_bp_controlled'));
      return out;
    },
  },
  {
    key: 'cholesterol',
    title: 'Cholesterol',
    blurb: 'Same again — if you have never been treated for it, answer No and move on.',
    html: function(){
      var ratios = [[-1, 'I don’t know']];
      for (var r = 25; r <= 100; r++) ratios.push([(r / 10).toFixed(2), (r / 10).toFixed(2)]);
      return haQ('Have you ever been treated for, or taken medication for, high cholesterol?',
          haYesNo('ha_ch_med'))
        + '<div class="ha-sub" id="ha_ch_sub" hidden>'
        + haQ('Total cholesterol level', haSelect('ha_ch_level',
            [[-1, 'I don’t know']].concat(haRange(100, 300)), 'Select…'))
        + haQ('HDL ratio', haSelect('ha_ch_hdl', ratios, 'Select…'))
        + haQ('When were you last treated for it?', haYearSelect('ha_ch_treated'))
        + haQ('If you take medication for it now, how long has it been well controlled?',
            haYearSelect('ha_ch_controlled'))
        + '</div>';
    },
    collect: function(v){
      var med = v('ha_ch_med');
      if (med === '') return undefined;
      var out = { medication: med === 'Y' };
      if (med !== 'Y') return out;
      if (v('ha_ch_level') !== '') out.level = Number(v('ha_ch_level'));
      if (v('ha_ch_hdl') !== '') out.hdlRatio = Number(v('ha_ch_hdl'));
      if (v('ha_ch_treated') !== '') out.treatedPeriod = Number(v('ha_ch_treated'));
      if (v('ha_ch_controlled') !== '') out.controlledPeriod = Number(v('ha_ch_controlled'));
      return out;
    },
  },
  {
    key: 'driving',
    title: 'Driving record',
    blurb: 'Carriers price this more heavily than most people expect.',
    html: function(){
      var h = haQ('Have you ever held a driver’s licence?', haYesNo('ha_drv_lic'))
        + '<div class="ha-sub" id="ha_drv_sub" hidden>';
      for (var i = 0; i < HA_DRIVING.length; i++){
        var d = HA_DRIVING[i];
        h += '<div class="ha-q"><span class="ha-qlabel">' + esc(d[2]) + '</span>'
          + '<div class="ha-row">' + haYesNo('ha_drv_' + d[0]) + '</div>'
          + '<div class="ha-sub" id="ha_drvsub_' + d[0] + '" hidden>'
          + haQ(esc(d[3]), haYearSelect('ha_drvper_' + d[0])) + '</div></div>';
      }
      h += '<span class="ha-qlabel">Moving violations (not parking tickets) in each period:</span>';
      for (var b = 0; b < HA_TICKET_BANDS.length; b++){
        h += haQ(esc(HA_TICKET_BANDS[b][0]),
          haSelect(HA_TICKET_BANDS[b][1], [[0, 'None']].concat(haRange(1, 9)), 'Select…'));
      }
      return h + '</div>';
    },
    collect: function(v){
      var lic = v('ha_drv_lic');
      if (lic === '') return undefined;
      var out = { hasLicence: lic === 'Y' };
      if (lic !== 'Y') return out;
      for (var i = 0; i < HA_DRIVING.length; i++){
        var d = HA_DRIVING[i];
        if (v('ha_drv_' + d[0]) !== 'Y') continue;
        var per = v('ha_drvper_' + d[0]);
        if (per !== '') out[d[1]] = { period: Number(per) };
      }
      var mv = [], any = false;
      for (var b = 0; b < HA_TICKET_BANDS.length; b++){
        var val = v(HA_TICKET_BANDS[b][1]);
        if (val !== '') any = true;
        mv.push(val === '' ? 0 : Number(val));
      }
      /* All five or none. A partly-filled row would tell Compulife there were
         zero tickets in the bands the visitor simply never got to. */
      if (any) out.movingViolations = mv;
      return out;
    },
  },
  {
    key: 'family',
    title: 'Family history',
    blurb: 'Parents and siblings only, and only before the age of 70. If you are not sure, say so — that is a real answer here, and better than a guess.',
    html: function(){
      var counts = [[-1, 'I don’t know'], [0, 'None']].concat(haRange(1, 3));
      return haQ('How many parents or siblings <b>died</b> of cardiovascular disease, cancer, diabetes or kidney disease before 70?',
          haSelect('ha_fam_deaths', counts, 'Select…'))
        + '<div id="ha_fam_died"></div>'
        + haQ('How many <b>had</b> one of those before 70 and did not die of it?',
          haSelect('ha_fam_contracted', counts, 'Select…'))
        + '<div id="ha_fam_survived"></div>';
    },
    collect: function(v, vc){
      var d = v('ha_fam_deaths'), c = v('ha_fam_contracted');
      if (d === '' && c === '') return undefined;
      var out = { deaths: d === '' ? -1 : Number(d), contracted: c === '' ? -1 : Number(c) };
      var died = haFamilyMembers('famd', Math.max(0, out.deaths), v, vc, true);
      var surv = haFamilyMembers('fams', Math.max(0, out.contracted), v, vc, false);
      if (died.length) out.died = died;
      if (surv.length) out.survived = surv;
      return out;
    },
  },
  {
    key: 'substanceAbuse',
    title: 'Alcohol and drugs',
    blurb: 'Treatment history only. Carriers ask this, and the answer is usually less damaging than people fear, particularly once some years have passed.',
    html: function(){
      var yrs = HA_TREATMENT_YEARS.map(function(l, i){ return [i, l]; });
      return haQ('Have you ever been treated for alcohol abuse?', haYesNo('ha_alc'))
        + '<div class="ha-sub" id="ha_alc_sub" hidden>'
        + haQ('Years since treatment', haSelect('ha_alc_yrs', yrs, 'Select…')) + '</div>'
        + haQ('Have you ever been treated for drug abuse?', haYesNo('ha_drg'))
        + '<div class="ha-sub" id="ha_drg_sub" hidden>'
        + haQ('Years since treatment', haSelect('ha_drg_yrs', yrs, 'Select…')) + '</div>';
    },
    collect: function(v){
      var a = v('ha_alc'), g = v('ha_drg');
      if (a === '' && g === '') return undefined;
      var out = {};
      if (a !== ''){
        out.alcohol = { treated: a === 'Y' };
        if (a === 'Y' && v('ha_alc_yrs') !== '') out.alcohol.yearsSince = Number(v('ha_alc_yrs'));
      }
      if (g !== ''){
        out.drugs = { treated: g === 'Y' };
        if (g === 'Y' && v('ha_drg_yrs') !== '') out.drugs.yearsSince = Number(v('ha_drg_yrs'));
      }
      return out;
    },
  },
];

/*
 * Client-side range checks mirroring the engine's. They exist to name the
 * wrong answer while the visitor is still looking at it -- the engine
 * refuses out-of-range values too, and that refusal would arrive here as a
 * failed quote with nothing pointing at the guilty field.
 */
function haCheck(a){
  var bad = [];
  var whole = function(n, label, lo, hi, extra){
    if (n === undefined) return;
    if (extra && extra.indexOf(n) >= 0) return;
    if (!Number.isInteger(n) || n < lo || n > hi) bad.push(label);
  };
  if (a.build){
    whole(a.build.feet, 'height in feet', 4, 7);
    whole(a.build.inches, 'height in inches', 0, 11);
    whole(a.build.weight, 'weight', 74, 401);
  }
  if (a.bloodPressure){
    whole(a.bloodPressure.systolic, 'systolic pressure', 119, 251, [-1]);
    whole(a.bloodPressure.diastolic, 'diastolic pressure', 78, 181, [-1]);
  }
  if (a.cholesterol){
    whole(a.cholesterol.level, 'cholesterol level', 100, 300, [-1]);
    var r = a.cholesterol.hdlRatio;
    if (r !== undefined && r !== -1 && !(r >= 2.5 && r <= 10)) bad.push('HDL ratio');
  }
  if (a.family){
    var members = (a.family.died || []).concat(a.family.survived || []);
    for (var i = 0; i < members.length; i++) whole(members[i].age, 'a relative’s age', 0, 99);
    if ((a.family.died || []).length > 3 || (a.family.survived || []).length > 3){
      bad.push('more relatives than Compulife accept');
    }
  }
  return bad;
}

/* Assemble what the engine takes. A section the visitor skipped is absent,
   not empty -- those mean different things to Compulife. */
function haAnswers(state){
  var out = {};
  for (var i = 0; i < HA_STEPS.length; i++){
    var k = HA_STEPS[i].key;
    if (state[k] !== undefined) out[k] = state[k];
  }
  return out;
}

/* ---- the wizard itself ------------------------------------------------ */

var HA_STATE = {};   /* per-section collected answers, by step key */
var HA_AT = 0;       /* which step is on screen */
/*
 * Every control's raw value, by key, kept as the visitor types.
 *
 * Each step is re-rendered from scratch when it comes back on screen, so
 * without this, Back would hand somebody a blank version of the page they
 * just filled in. Keeping the raw values rather than reversing HA_STATE back
 * into controls means a half-answered section survives too -- and a
 * half-answered section is the normal case here.
 */
var HA_RAW = {};

function haRecord(e){
  var el = e.target;
  if (!el) return;
  if (el.type === 'radio' && el.name) HA_RAW['r:' + el.name] = el.value;
  else if (el.type === 'checkbox' && el.id) HA_RAW['c:' + el.id] = el.checked;
  else if (el.id) HA_RAW['v:' + el.id] = el.value;
}

function haRestore(){
  for (var k in HA_RAW){
    if (!Object.prototype.hasOwnProperty.call(HA_RAW, k)) continue;
    var kind = k.slice(0, 2), name = k.slice(2);
    if (kind === 'r:'){
      var rs = document.querySelectorAll('input[type=radio][name="' + name + '"]');
      for (var i = 0; i < rs.length; i++) rs[i].checked = (rs[i].value === HA_RAW[k]);
    } else {
      var el = document.getElementById(name);
      if (!el) continue;
      if (kind === 'c:') el.checked = HA_RAW[k];
      else el.value = HA_RAW[k];
    }
  }
}

function haVal(name){
  var el = document.getElementById(name);
  if (el) return el.value;
  /* Radios share a name rather than carrying an id. */
  var rs = document.querySelectorAll('input[type=radio][name="' + name + '"]');
  for (var i = 0; i < rs.length; i++) if (rs[i].checked) return rs[i].value;
  return '';
}
function haChecked(name){
  var el = document.getElementById(name);
  return Boolean(el && el.checked);
}

/* Show or hide the block a control gates, so nobody is asked how long since
   they smoked a pipe they never smoked. */
function haSyncReveals(){
  for (var i = 0; i < HA_TOBACCO.length; i++){
    var sub = document.getElementById('ha_tobsub_' + HA_TOBACCO[i][0]);
    if (sub) sub.hidden = !haChecked('ha_tob_' + HA_TOBACCO[i][0]);
  }
  var pairs = [['ha_bp_med', 'ha_bp_sub'], ['ha_ch_med', 'ha_ch_sub'],
    ['ha_drv_lic', 'ha_drv_sub'], ['ha_alc', 'ha_alc_sub'], ['ha_drg', 'ha_drg_sub']];
  for (var p = 0; p < pairs.length; p++){
    var el = document.getElementById(pairs[p][1]);
    if (el) el.hidden = haVal(pairs[p][0]) !== 'Y';
  }
  for (var d = 0; d < HA_DRIVING.length; d++){
    var ds = document.getElementById('ha_drvsub_' + HA_DRIVING[d][0]);
    if (ds) ds.hidden = haVal('ha_drv_' + HA_DRIVING[d][0]) !== 'Y';
  }
  haSyncFamily();
}

/* The family blocks are built to match the counts, and only grow: rebuilding
   them on every change would wipe answers the visitor already gave when they
   corrected one count. */
function haSyncFamily(){
  var specs = [['ha_fam_deaths', 'ha_fam_died', 'famd', true],
               ['ha_fam_contracted', 'ha_fam_survived', 'fams', false]];
  for (var s = 0; s < specs.length; s++){
    var host = document.getElementById(specs[s][1]);
    if (!host) continue;
    var raw = haVal(specs[s][0]);
    var want = raw === '' ? 0 : Math.max(0, Number(raw));
    var have = host.children.length;
    for (var i = have; i < want; i++){
      var wrap = document.createElement('div');
      wrap.innerHTML = haFamilyBlockHtml(specs[s][2], i, specs[s][3]);
      host.appendChild(wrap.firstChild);
    }
    for (var j = have - 1; j >= want; j--) host.removeChild(host.children[j]);
  }
}

function haRender(){
  var step = HA_STEPS[HA_AT];
  var body = document.getElementById('haBody');
  document.getElementById('haCount').textContent =
    'Step ' + (HA_AT + 1) + ' of ' + HA_STEPS.length;
  document.getElementById('haBar').style.width =
    Math.round(((HA_AT + 1) / HA_STEPS.length) * 100) + '%';
  body.innerHTML = '<h4 class="ha-steptitle">' + esc(step.title) + '</h4>'
    + '<p class="ha-blurb">' + esc(step.blurb) + '</p>' + step.html();
  body.scrollTop = 0;
  /* Twice on purpose: the first pass puts back the counts that decide how
     many family blocks exist, haSyncReveals then builds them, and the second
     pass fills the controls inside blocks that did not exist a moment ago. */
  haRestore();
  document.getElementById('haBack').style.visibility = HA_AT === 0 ? 'hidden' : 'visible';
  document.getElementById('haNext').textContent =
    HA_AT === HA_STEPS.length - 1 ? 'See what I qualify for' : 'Next';
  haShowErr('');
  haSyncReveals();
  haRestore();
}

function haShowErr(msg){
  var el = document.getElementById('haErr');
  if (!el) return;
  el.hidden = !msg;
  el.textContent = msg || '';
}

/* Take what is on screen into HA_STATE. Returns false when an answer is out
   of range, so Next does not advance past a question that cannot be sent. */
function haTakeStep(){
  var step = HA_STEPS[HA_AT];
  var got = step.collect(haVal, haChecked);
  if (got === undefined) delete HA_STATE[step.key];
  else HA_STATE[step.key] = got;
  var bad = haCheck(haAnswers(HA_STATE));
  if (bad.length){
    haShowErr('Please check ' + bad.join(', ') + ' — that is outside the range '
      + 'the carriers accept, and we would rather ask again than price the wrong person.');
    return false;
  }
  return true;
}

function haOpen(){
  HA_AT = 0;
  document.getElementById('haMask').hidden = false;
  haRender();
}
function haClose(){
  document.getElementById('haMask').hidden = true;
}

async function haFinish(){
  var answers = haAnswers(HA_STATE);
  HEALTH_ANSWERS = Object.keys(answers).length ? answers : null;
  haClose();
  await recalc();
}

function haWire(){
  var mask = document.getElementById('haMask');
  if (!mask) return;
  var btn = document.querySelector('.qualify-btn');
  if (btn) btn.addEventListener('click', function(){
    /* Once the list is empty the banner is an invitation to talk, not the
       analyzer -- showTalkToUs sets that mode and it wins here. */
    if (btn.dataset.mode === 'contact'){ haRequestCall(); return; }
    haOpen();
  });
  document.getElementById('haClose').addEventListener('click', haClose);
  document.getElementById('haBack').addEventListener('click', function(){
    if (HA_AT > 0){ haTakeStep(); HA_AT--; haRender(); }
  });
  document.getElementById('haSkip').addEventListener('click', function(){
    delete HA_STATE[HA_STEPS[HA_AT].key];
    if (HA_AT < HA_STEPS.length - 1){ HA_AT++; haRender(); } else haFinish();
  });
  document.getElementById('haNext').addEventListener('click', function(){
    if (!haTakeStep()) return;
    if (HA_AT < HA_STEPS.length - 1){ HA_AT++; haRender(); } else haFinish();
  });
  /* One listener for the whole body: the controls are rebuilt every step. */
  document.getElementById('haBody').addEventListener('change', function(e){
    haRecord(e);
    haSyncReveals();
  });
  mask.addEventListener('click', function(e){ if (e.target === mask) haClose(); });
  document.addEventListener('keydown', function(e){
    if (e.key === 'Escape' && !mask.hidden) haClose();
  });
}

/*
 * The empty-result invitation. The page already collects a phone number, so
 * send them there and focus it rather than inventing a second form -- and
 * give the number to call as well, because somebody staring at an empty
 * comparison should not have to wait on us.
 */
function haRequestCall(){
  var phone = document.getElementById('phone');
  setQuoteNotice('<b>Leave your number above and an agent will call you</b>, or '
    + 'ring <a href="tel:8888048590">(888) 804-8590</a> now. Either way, say the '
    + 'comparison came back empty and they will know where to start.', 'info');
  if (phone){
    phone.scrollIntoView({ behavior: 'smooth', block: 'center' });
    phone.focus({ preventScroll: true });
  }
}

if (document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', haWire);
} else { haWire(); }

/*
 * The Health Analyzer's verdict, as a badge.
 *
 * Nothing at all until the analyzer has run: a blank badge on an ordinary
 * quote would read as a doubt nobody expressed. Compulife's own three
 * colours, so this page and theirs say the same thing the same way.
 *
 * With their filter on, the products somebody would not be offered never
 * arrive -- which is why the list quietly got shorter and nothing explained
 * it. 'no' is handled anyway, for the day that changes.
 */
function healthBadge(q){
  const v = q && q.healthVerdict;
  if (v !== 'go' && v !== 'dk' && v !== 'no') return '';
  const text = v === 'go' ? 'Available' : v === 'dk' ? 'Need more answers' : 'Not offered';
  const mark = v === 'go' ? '\u2713' : v === 'dk' ? '?' : '\u2717';
  /* Their words on why, escaped: they are underwriting it, and this is a
     page that prints what it is given. */
  const why = (q.healthReasons || []).join(' \u2022 ');
  return '<span class="pr-health ' + v + '"'
    + (why ? ' title="' + esc(why) + '"' : '')
    + '><span aria-hidden="true">' + mark + '</span> ' + esc(text) + '</span>';
}

function setQuoteNotice(msg, kind){
  var el = document.getElementById('quoteNotice');
  if (!el){
    el = document.createElement('div');
    el.id = 'quoteNotice';
    el.style.cssText = 'margin:0 0 14px;padding:10px 14px;border-radius:10px;font-size:12.5px;line-height:1.55;';
    var anchor = document.getElementById('bestRow');
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(el, anchor);
  }
  if (!msg){ el.style.display = 'none'; return; }
  el.style.display = 'block';
  el.style.background = kind === 'error' ? '#fee2e2' : '#fef3c7';
  el.style.border = '1px solid ' + (kind === 'error' ? '#fca5a5' : '#f0d089');
  el.style.color = kind === 'error' ? '#991b1b' : '#7a4d08';
  el.innerHTML = msg;
}

async function recalc(){
  var inp = getInputs();
  renderQuoteFor(inp);

  var endpoint = window.QB_QUOTE_ENDPOINT || '';
  if (!/^https?:\/\//i.test(endpoint)){
    setQuoteNotice('Quote service is not configured on this page, so no premiums can be shown.', 'error');
    QUOTES = []; FEATURED = []; SHOWN = []; renderBest(); renderList();
    return;
  }

  /* Captured before the request so the empty-result branch can tell "nobody
     quotes this profile" from "the analyzer removed everything". */
  const sentHealth = HEALTH_ANSWERS;
  setQuoteNotice(sentHealth ? 'Checking which of these you qualify for\u2026'
    : 'Pricing with carriers\u2026', 'info');

  try {
    var res = await fetch(endpoint.replace(/\/$/, '') + '/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        /* The category letter alone. The engine reads `coverage` in
           preference to product/termYears, and sending all three invited
           them to disagree. */
        coverage: inp.cat,
        faceAmount: inp.coverage,
        dateOfBirth: inp.dob,
        gender: inp.gender,
        tobacco: inp.tobacco === 'Yes',
        healthClass: inp.health,
        state: inp.state,
        toolKey: 'quote',
        /*
         * THE SESSION, SO THE QUOTE CAN BE KEPT -- QBP-534.
         *
         * The engine files a QuoteRequest and its priced rows against
         * this, and the capture a second later claims that row instead
         * of writing a second one with no prices in it. Without it the
         * engine has nobody to attach the quote to and keeps nothing,
         * which is why every Quote Tool quote read 0 offers.
         *
         * Read from the capture script rather than generated here, so
         * the price and the capture cannot disagree about which visit
         * this is.
         */
        sessionId: (window.QuoteBot && typeof window.QuoteBot.sessionId === 'function')
          ? window.QuoteBot.sessionId() : undefined,
        /* Omitted entirely until answered. An absent key is Compulife's own
           default -- every analyzer group is off unless switched on. */
        ...(sentHealth ? { health: sentHealth } : {})
      })
    });
    var json = await res.json();
    if (!res.ok || !json.ok) throw new Error(json.error || ('HTTP ' + res.status));

    PREMIUMS_ARE_ESTIMATES = json.premiumsAreEstimates !== false;
    /* Whether THIS quote was filtered by health answers. Two very different
       empty results hide behind one empty array, and they need different
       things said to them. */
    FILTERED_BY_HEALTH = Boolean(sentHealth);

    /* One mapper for both lists. The featured picks ARE quote rows -- the
       engine selects from the same array it returns -- so shaping them
       differently is how a card ends up disagreeing with the row below it. */
    function toRow(q){
      return {
        id: String(q.companyCode || q.carrierName || '').toLowerCase(),
        name: q.carrierName,
        prodResolved: q.productName,
        rating: q.amBestRating || 'NR',
        monthly: q.monthlyPremium,
        annual: q.annualPremium,
        coverage: q.faceAmount != null ? q.faceAmount : inp.coverage,
        logo: logoFor(q.carrierName, q.companyCode, q.logoUrl),
        /* The Health Analyzer's verdict for THIS product, when it ran.
           Null on an ordinary quote, which is not the same as 'dk'. */
        healthVerdict: q.healthVerdict || null,
        healthReasons: Array.isArray(q.healthReasons) ? q.healthReasons : []
      };
    }

    /* The engine's own answer, not a guess from the tool. Its comment:
       "the calculators use this to decide whether to show the estimate
       caveat, and it is what gets written to Illustration." It was being
       dropped here, so every quote-tool illustration was filed as an
       estimate -- including the ones priced from Compulife's filed rates. */
    ESTIMATES = json.premiumsAreEstimates !== false;
    QUOTES = (json.quotes || []).map(toRow);
    FEATURED = (json.featured || []).map(function(f){
      return Object.assign(toRow(f), {
        /* The admin's own words, already filtered of blanks server-side.
           `curated` false means nobody chose this carrier -- it is here on
           price alone, and it gets no reasons and no claim of endorsement. */
        bullets: Array.isArray(f.bullets) ? f.bullets : [],
        /* The pill across the top of the card, in the admin's words. */
        badge: typeof f.badge === 'string' ? f.badge : '',
        curated: f.curated === true
      });
    });

    if (!QUOTES.length && FILTERED_BY_HEALTH){
      /*
       * The worst page this tool can show, and the one that most needs a
       * person on the other end: somebody has just told us about their blood
       * pressure, their driving record and their family history, and the
       * comparison has nothing left to show them.
       *
       * What is true and worth saying: this compares a fixed set of carriers
       * at standard underwriting, and that is a narrow slice of the market.
       * Table-rated offers, simplified issue and guaranteed issue all sit
       * outside it. What is NOT said, because it would not be true: that we
       * can get them covered.
       */
      setQuoteNotice(
        '<b>Nothing on this comparison fits what you told us.</b> That is a '
        + 'statement about this tool, not about you \u2014 it prices a fixed set of '
        + 'carriers at standard underwriting, which is a narrow slice of the '
        + 'market. Rated offers, simplified issue and guaranteed issue are all '
        + 'outside it, and they are where people in your position are usually '
        + 'placed. Someone here would rather talk it through than leave you '
        + 'with an empty page.', 'error');
      showTalkToUs();
    } else if (!QUOTES.length){
      setQuoteNotice('No carrier returned an offer for this profile. An agent can look at options a comparison engine will not show.', 'error');
      showTalkToUs();
    } else if (PREMIUMS_ARE_ESTIMATES){
      resetQualifyBanner();
      setQuoteNotice('<b>Illustrative estimates.</b> These premiums are modelled, not carrier-filed rates, and are not an offer of insurance. Your actual premium is set by the carrier after underwriting.', 'info');
    } else {
      resetQualifyBanner();
      setQuoteNotice('', null);
    }
  } catch (err){
    /* The visitor gets the calm sentence below; whoever is debugging gets the
       reason. Swallowing this meant a failing quote left nothing at all in the
       console to look at. */
    console.error('[quotetool] the quote request failed', err);
    QUOTES = [];
    FEATURED = [];
    ESTIMATES = true;
    setQuoteNotice('We could not reach the quote service just now. Rather than show an estimate that might be wrong, we would rather have someone call you with real numbers.', 'error');
    showTalkToUs();
  }

  renderBest();
  renderList();
}

/* ---------- RENDERERS ---------- */
function renderQuoteFor(inp){
  const name = (inp.firstName + ' ' + inp.lastName).trim() || 'Your quote';
  document.getElementById('quoteFor').innerHTML = `
    <span class="quote-for-name">${name}</span>
    <span class="quote-for-item">Age <b>${inp.age}</b></span>
    <span class="quote-for-item"><b>${inp.state}</b></span>
    <span class="quote-for-item"><b>${inp.gender}</b></span>
    <span class="quote-for-item">Tobacco <b>${inp.tobacco}</b></span>
    <span class="quote-for-item"><b>${inp.health}</b></span>
    <span class="quote-for-item">$<b>${inp.coverage.toLocaleString()}</b></span>
    <span class="quote-for-item"><b>${esc(inp.catName)}</b></span>
    <span class="quote-for-edit" data-qb-click="editInputs">✎ Edit</span>`;
}

function renderBest(){
  const row = document.getElementById('bestRow');

  /* By price, not by position -- being the cheapest is the whole claim the
     left-hand card makes, so it is not left resting on the engine's ordering
     staying the way it is today. */
  const cheapest = cheapestQuote(QUOTES);
  if (!cheapest){ row.innerHTML = ''; SHOWN = []; return; }

  /* The record of what this function draws, rebuilt every time it runs so
     it cannot describe a previous render -- QBP-533. */
  SHOWN = [{ row: cheapest, label: 'Most Affordable' }];

  const cardHTML = (cfg) => `
    <div class="best-card ${cfg.cardClass}">
      <span class="best-badge ${cfg.badgeClass}">${esc(cfg.badgeText)}</span>
      <div class="best-top">
        <div class="best-price">
          <div class="mo">${fmtMo(cfg.monthly)} <small>/m</small></div>
          <div class="yr">${fmtYr(cfg.annual)} <small>annual</small></div>
        </div>
        <div style="width:104px;display:flex;justify-content:center;">${cfg.logo}</div>
      </div>
      <div class="best-mid">${cfg.mid}</div>
      <div class="best-bottom">
        <div class="best-carrier">
          <div>
            <div class="best-carrier-name">${esc(cfg.name)}</div>
            <div class="best-carrier-prod">${esc(cfg.prod)} &bull; $${cfg.coverage.toLocaleString()}</div>
          </div>
          <div class="best-rating">Rating: <b>${esc(cfg.rating)}</b></div>
        </div>
        ${cfg.health ? '<div class="best-health">' + cfg.health + '</div>' : ''}
        <button class="select-btn" type="button" data-qb-apply
                data-carrier-name="${esc(cfg.name)}" data-product="${esc(cfg.prod)}"
                data-coverage="${cfg.coverage}" data-premium="${cfg.monthly}">Select</button>
      </div>
    </div>`;

  /* Every card is built from a quote row the engine returned. There is no
     other source, which is what stops a carrier appearing at a price nobody
     quoted -- the bug in the build before last, where an "Assurity Life" card
     showed a premium derived by scaling somebody else's rate. */
  const fromRow = (r, extra) => cardHTML(Object.assign({
    monthly: r.monthly, annual: r.annual, logo: r.logo, name: r.name,
    prod: r.prodResolved, coverage: r.coverage, rating: r.rating,
    /* The same verdict the row below carries. A card is one of these rows,
       so a card saying nothing while its row says "need more answers" would
       be the page disagreeing with itself. */
    health: healthBadge(r)
  }, extra));

  const cards = [ fromRow(cheapest, {
    cardClass: '', badgeClass: 'affordable', badgeText: 'Most Affordable',
    mid: `<div class="trophy">\u{1F3C6} Lowest Price</div>
          <p>The most affordable rate available for your profile.</p>`
  }) ];

  /*
   * The engine chooses these and has already excluded the cheapest carrier
   * and de-duplicated by company, so nothing here re-checks either.
   *
   * If it returned none -- an older engine, or its carrier table was briefly
   * unreadable -- fall back to price so the visitor still has three to
   * compare. Same rule the engine uses, and the same silence underneath:
   * these are carriers nobody picked, so they get no reasons.
   */
  let picks = FEATURED;
  if (!picks.length){
    const seen = new Set([cheapest.id]);
    picks = [];
    const byPrice = QUOTES
      .filter(q => typeof q.monthly === 'number' && isFinite(q.monthly))
      .sort((a, b) => a.monthly - b.monthly);
    for (const q of byPrice){
      if (seen.has(q.id)) continue;
      seen.add(q.id);
      picks.push(Object.assign({}, q, { bullets: [], curated: false }));
      if (picks.length === 2) break;
    }
  }

  /* Position decides the styling; the engine decides who sits there. */
  const SLOTS = [
    { cardClass: 'recommended', badgeClass: 'recommended', badgeText: 'Our Recommendation' },
    { cardClass: 'agentless',   badgeClass: 'agentless',   badgeText: 'Also Consider' }
  ];

  picks.slice(0, SLOTS.length).forEach((f, i) => {
    const slot = SLOTS[i];
    const curated = f.curated === true;
    const bullets = Array.isArray(f.bullets) ? f.bullets : [];
    /*
     * A card nobody chose does not get an endorsement badge and does not get
     * reasons. It is a real carrier at a real price, shown for comparison,
     * and saying less is the honest option -- borrowing another carrier's
     * bullets or inventing generic ones would both be lying quietly.
     */
    /*
     * The carrier's own tag wins over the slot's wording wherever it lands,
     * curated or not. It is words typed against this carrier, so it says
     * something true about them whichever card they end up on.
     *
     * The bullets are not treated the same way and that is deliberate: "why
     * we chose them" under a carrier nobody chose would describe a decision
     * that never happened. A label is not a rationale.
     */
    const tag = String(f.badge || '').trim();
    /*
     * THE CLAIM, NOT THE WORDING. `tag` is the admin's own badge and is
     * decoration; "Another Option" is what an uncurated card says, and
     * calling it Our Recommendation in the record would endorse a carrier nobody
     * chose -- the same thing the `mid` below refuses to do with bullets.
     */
    SHOWN.push({ row: f, label: curated ? slot.badgeText : 'Another Option' });
    cards.push(fromRow(f, {
      cardClass: curated ? slot.cardClass : 'agentless',
      badgeClass: curated ? slot.badgeClass : 'agentless',
      badgeText: tag || (curated ? slot.badgeText : 'Another Option'),
      mid: curated && bullets.length
        ? `<ul>${bullets.map(b => `<li>${esc(b)}</li>`).join('')}</ul>`
        : ''
    }));
  });

  row.innerHTML = cards.join('');
}

function renderList(){
  // populate carrier filter once
  const cf = document.getElementById('carrierFilter');
  if (cf.options.length <= 1){
    CARRIERS.forEach(c => { const o = document.createElement('option'); o.value = c.id; o.textContent = c.name; cf.appendChild(o); });
  }

  let rows = [...QUOTES];

  // sort
  const sort = document.getElementById('sortBy').value;
  if (sort === 'priceLow')  rows.sort((a,b)=>a.monthly-b.monthly);
  if (sort === 'priceHigh') rows.sort((a,b)=>b.monthly-a.monthly);
  if (sort === 'rating')    rows.sort((a,b)=>ratingRank(b.rating)-ratingRank(a.rating));
  if (sort === 'name')      rows.sort((a,b)=>a.name.localeCompare(b.name));
  if (sort === 'none')      rows.sort((a,b)=>a.monthly-b.monthly); // default cheapest first like the screenshot

  // filter
  const carrierVal = cf.value;
  const search = document.getElementById('searchProducts').value.trim().toLowerCase();
  rows = rows.filter(q => {
    if (carrierVal && q.id !== carrierVal) return false;
    if (search && !(q.name.toLowerCase().includes(search) || q.prodResolved.toLowerCase().includes(search))) return false;
    return true;
  });

  const list = document.getElementById('productList');
  list.innerHTML = rows.map((q,i) => `
    <div class="product-row ${i >= visibleCount ? 'hidden' : ''}">
      <div class="pr-price">
        <div class="mo">${fmtMo(q.monthly)} <small>/m</small></div>
        <div class="yr">${fmtYr(q.annual)} <small>annual</small></div>
      </div>
      <div>${q.logo}</div>
      <div>
        <div class="pr-name">${q.name}</div>
        <div class="pr-prod">${q.prodResolved} • $${q.coverage.toLocaleString()}</div>
      </div>
      <div class="pr-rating ${q.rating==='Unknown'?'unknown':''}">Rating: <b>${q.rating}</b></div>
      ${healthBadge(q)}
      <button class="select-btn sm" type="button" data-qb-apply
              data-carrier-name="${esc(q.name)}" data-product="${esc(q.prodResolved)}"
              data-coverage="${q.coverage}" data-premium="${q.monthly}">Select</button>
    </div>`).join('');

  // show more visibility
  const wrap = document.getElementById('showMoreWrap');
  if (rows.length <= visibleCount) wrap.classList.add('gone');
  else wrap.classList.remove('gone');
}

/* ---------- INTERACTIONS ---------- */
// segmented toggles
document.querySelectorAll('.seg').forEach(seg => {
  seg.addEventListener('click', e => {
    if (e.target.tagName !== 'BUTTON') return;
    seg.querySelectorAll('button').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    if (document.getElementById('resultsContent').classList.contains('show')) recalc();
  });
});
// age pill live update
document.getElementById('dob').addEventListener('change', () => {
  document.getElementById('agePill').textContent = 'Age ' + computeAge(document.getElementById('dob').value);
  if (document.getElementById('resultsContent').classList.contains('show')) recalc();
});
// coverage formatting
document.getElementById('coverage').addEventListener('input', e => {
  const n = e.target.value.replace(/[^0-9]/g,'');
  e.target.value = n ? parseInt(n).toLocaleString() : '';
});
// live recalc on any other input once results are shown
['state','health','coverageCat','coverage'].forEach(id => {
  document.getElementById(id).addEventListener('change', () => {
    if (document.getElementById('resultsContent').classList.contains('show')) recalc();
  });
});
['firstName','lastName'].forEach(id => {
  document.getElementById(id).addEventListener('input', () => {
    if (document.getElementById('resultsContent').classList.contains('show')) recalc();
  });
});
// product tools
document.getElementById('searchProducts').addEventListener('input', renderList);
document.getElementById('carrierFilter').addEventListener('change', renderList);
document.getElementById('sortBy').addEventListener('change', renderList);
// show more
document.getElementById('showMoreBtn').addEventListener('click', () => {
  visibleCount = CARRIERS.length;
  renderList();
});

/* ---- Quote Bot lead capture -------------------------------------------- */
/* Runs after recalc(), so QUOTES holds what the visitor is about to see.    */
/* The premiums sent here are what was DISPLAYED, which is what you want on  */
/* file if a quoted price is ever disputed.                                  */
/*
 * The quote list, with the three cards marked -- QBP-533.
 *
 * The full list, because the visitor could see all of it and the
 * Illustration is the record of what was displayed. The three cards are
 * marked rather than sent separately, so the stored shape stays one array
 * and anything already reading it is unaffected.
 *
 * A featured row is rebuilt by toRow() from the engine's own `featured`
 * list, so it is a DIFFERENT OBJECT from the matching row in QUOTES and
 * cannot be found by identity. Matched on carrier and premium instead,
 * and appended when it matches nothing -- a card that was on the screen
 * has to be in the record of what was on the screen.
 */
function shownResults(){
  var out = QUOTES.map(function(q){
    return { carrierId: q.id, carrier: q.name, product: q.prodResolved,
             rating: q.rating, monthlyPremium: q.monthly,
             annualPremium: q.annual, label: '' };
  });
  var find = function(r){
    for (var i = 0; i < out.length; i++){
      if (out[i].carrier === r.name && out[i].monthlyPremium === r.monthly) return out[i];
    }
    return null;
  };
  SHOWN.forEach(function(s){
    var hit = find(s.row);
    if (hit){ hit.label = s.label; return; }
    out.push({ carrierId: s.row.id, carrier: s.row.name,
               product: s.row.prodResolved, rating: s.row.rating,
               monthlyPremium: s.row.monthly, annualPremium: s.row.annual,
               label: s.label });
  });
  return out;
}

function qbCaptureLead(){
  if (!window.QuoteBot) return;
  try {
    var inp = getInputs();
    var v = function(id){ var el = document.getElementById(id); return el ? el.value.trim() : ''; };
    var email = v('email');
    if (!email) return;   // nothing to attach a lead to
    var note = document.querySelector('#qb-consent');
    window.QuoteBot.capture({
      email: email,
      phone: v('phone'),
      firstName: inp.firstName,
      lastName: inp.lastName,
      productLine: 'TERM_LIFE',
      inputs: {
        dateOfBirth: inp.dob, issueAge: inp.age, state: inp.state,
        gender: inp.gender, tobacco: inp.tobacco, health: inp.health,
        faceAmount: inp.coverage, termYears: inp.term,
        coverage: inp.cat, coverageName: inp.catName
      },
      premiumsAreEstimates: ESTIMATES,
      results: shownResults(),
      consentText: note ? note.textContent.replace(/\s+/g, ' ').trim() : null
    });
  } catch (e) { /* capture must never break the quote */ }
}

// MAIN: reveal results
document.getElementById('quoteBtn').addEventListener('click', async () => {
  /*
   * AWAITED, AND THE WHOLE RECORD DEPENDED ON IT.
   *
   * recalc() is async -- it fetches the prices from the engine. This
   * handler called it and then called qbCaptureLead() on the very next
   * line, synchronously, so capture ALWAYS ran before the prices came
   * back. The comment over qbCaptureLead has said since it was written
   * that it "runs after recalc(), so QUOTES holds what the visitor is
   * about to see". It did not.
   *
   * What that cost: on a first run QUOTES was still empty, so the
   * Illustration -- the record of what was displayed, kept precisely so
   * a disputed premium can be answered -- was written with no premiums
   * in it. On a re-run it held the PREVIOUS run's figures, which is
   * worse: a record that is confidently wrong rather than visibly
   * empty. Every "Quote Tool" quote on every lead reads 0 offers, and
   * nothing anywhere reported it.
   *
   * FINALLY, NOT JUST AWAIT. A lead must never be lost because pricing
   * failed -- the consent and the routing matter whether or not the
   * engine answered. If recalc throws, capture still runs, with
   * whatever is there to send.
   */
  try {
    await recalc();
  } finally {
    qbCaptureLead();
  }
  document.getElementById('emptyState').style.display = 'none';
  document.getElementById('resultsContent').classList.add('show');
  document.querySelector('.quote-grid').classList.add('results-mode');
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

// "Edit" in results brings the input panel back
function editInputs(){
  document.querySelector('.quote-grid').classList.remove('results-mode');
  document.querySelector('.inputs-panel').scrollIntoView({ behavior:'smooth', block:'start' });
}

/* The markup names actions rather than carrying onclick attributes, which a
   Content-Security-Policy without 'unsafe-inline' blocks wherever they came
   from -- including markup this script builds itself. Only what is
   registered here can be reached from an attribute. */
window.qbActions.register({ editInputs: editInputs });
