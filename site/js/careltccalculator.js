/*
 * careltccalculator.html's own script, which used to sit inline in the page.
 *
 * It had to move: a Content-Security-Policy without 'unsafe-inline' blocks an
 * inline <script>, so inline this page would have gone dead the moment the
 * policy went on -- quietly, with the markup looking perfectly correct.
 *
 * Moved verbatim.
 */
let curStep = 0;
const TOTAL_STEPS = 5;
const BADGE_LABELS = ['C','A','R','E','✉'];

function syncVal(id, outId, isCurrency, suffix) {
  const v = parseInt(document.getElementById(id).value);
  const el = document.getElementById(outId);
  if (isCurrency) el.textContent = '$' + v.toLocaleString();
  else if (suffix) el.textContent = v + ' ' + suffix;
  else el.textContent = v;
}

function pickRadio(el, groupId) {
  document.querySelectorAll('#' + groupId + ' .radio-opt').forEach(o => o.classList.remove('sel'));
  el.classList.add('sel');
}

function toggleCheck(el) {
  el.classList.toggle('sel');
  el.querySelector('.check-box').textContent = el.classList.contains('sel') ? '✓' : '';
}

function pickSingle(el, groupId) {
  document.querySelectorAll('#' + groupId + ' .check-opt').forEach(o => {
    o.classList.remove('sel');
    o.querySelector('.check-box').textContent = '';
  });
  el.classList.add('sel');
  el.querySelector('.check-box').textContent = '✓';
}

// Auto-format phone as (xxx) xxx-xxxx
document.addEventListener('DOMContentLoaded', function() {
  const ph = document.getElementById('cf-phone');
  if (ph) {
    ph.addEventListener('input', function() {
      let digits = this.value.replace(/\D/g, '').slice(0, 10);
      let formatted = '';
      if (digits.length > 0) formatted = '(' + digits.slice(0,3);
      if (digits.length >= 4) formatted += ') ' + digits.slice(3,6);
      if (digits.length >= 7) formatted += '-' + digits.slice(6,10);
      this.value = formatted;
    });
  }
});

function goStep(n) {
  if (n > curStep) {
    for (let i = 0; i < curStep; i++) {
      document.getElementById('tab' + i).classList.remove('active');
      document.getElementById('tab' + i).classList.add('done');
      document.getElementById('badge' + i).textContent = '✓';
    }
  }
  document.getElementById('step' + curStep).classList.remove('active');
  document.getElementById('tab' + curStep).classList.remove('active');
  document.getElementById('resultsPanel').classList.remove('show');

  curStep = n;
  document.getElementById('step' + curStep).classList.add('active');
  document.getElementById('tab' + curStep).classList.add('active');
  document.getElementById('tab' + curStep).classList.remove('done');

  window.scrollTo({ top: document.querySelector('.calc-card').offsetTop - 80, behavior: 'smooth' });
}

function getRadioVal(groupId) {
  const sel = document.querySelector('#' + groupId + ' .sel');
  return sel ? sel.dataset.val : null;
}

function fmt(n) { return '$' + Math.round(n).toLocaleString(); }
function pct(n) { return (n * 100).toFixed(1) + '%'; }

/* ── Contact validation ── */
function setErr(id, msg) {
  const el = document.getElementById(id);
  const inp = document.getElementById(id.replace('err-', 'cf-'));
  el.textContent = msg;
  if (inp) { msg ? inp.classList.add('error') : inp.classList.remove('error'); }
}

function validateContact() {
  let ok = true;
  const fname = document.getElementById('cf-fname').value.trim();
  const lname = document.getElementById('cf-lname').value.trim();
  const email = document.getElementById('cf-email').value.trim();
  const phone = document.getElementById('cf-phone').value.trim();
  const dob   = document.getElementById('cf-dob').value;
  const state = document.getElementById('cf-state').value;

  if (!fname) { setErr('err-fname', 'First name is required.'); ok = false; } else setErr('err-fname', '');
  if (!lname) { setErr('err-lname', 'Last name is required.'); ok = false; } else setErr('err-lname', '');
  /* Required because it decides WHO may take this lead: an agent not
     licensed where the applicant lives is skipped by routing, and a lead
     with no state skips that check entirely. */
  if (!state) { setErr('err-state', 'State is required.'); ok = false; } else setErr('err-state', '');

  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email) { setErr('err-email', 'Email address is required.'); ok = false; }
  else if (!emailRe.test(email)) { setErr('err-email', 'Please enter a valid email address.'); ok = false; }
  else setErr('err-email', '');

  const digits = phone.replace(/\D/g, '');
  /* Optional. Only the number that unlocks results can trigger a text, and
     making it compulsory costs quotes from people who will not give one.
     Still validated when they DO type one -- a half-entered number is a
     lead nobody can ring. */
  if (phone && digits.length < 10) { setErr('err-phone', 'Please enter a 10-digit phone number.'); ok = false; }
  else setErr('err-phone', '');

  if (!dob) { setErr('err-dob', 'Date of birth is required.'); ok = false; }
  else {
    const dobDate = new Date(dob);
    const today = new Date();
    const age = today.getFullYear() - dobDate.getFullYear() - (today < new Date(today.getFullYear(), dobDate.getMonth(), dobDate.getDate()) ? 1 : 0);
    if (age < 18 || age > 100) { setErr('err-dob', 'Please enter a valid date of birth.'); ok = false; }
    else setErr('err-dob', '');
  }
  return ok;
}

function submitContact() {
  if (!validateContact()) {
    // Scroll to first error
    const firstErr = document.querySelector('.text-input.error');
    if (firstErr) firstErr.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  showResults();
}

/* ── Mobile tab switcher ── */
function mobTab(col) {
  ['trad','hybrid','abltc'].forEach(c => {
    document.getElementById('mob-tab-' + c).classList.toggle('active', c === col);
    document.getElementById('mob-panel-' + c).classList.toggle('active', c === col);
  });
}

/* ── Results ── */
/* ---- Quote Bot lead capture ------------------------------------------ */
function qbCaptureLead(){
  if (!window.QuoteBot) return;
  try {
    var V = function(id){ var e=document.getElementById(id); return e ? String(e.value).trim() : ""; };
    var N = function(id){ var e=document.getElementById(id); return e ? (parseFloat(String(e.value).replace(/[^0-9.\-]/g,""))||0) : null; };
    var C = function(sel){ var e=document.querySelector(sel); return e ? e.textContent.replace(/\s+/g," ").trim() : null; };
    if (!V('cf-email')) return;
    window.QuoteBot.capture({
      email: V('cf-email'), phone: V('cf-phone'),
      firstName: V('cf-fname'), lastName: V('cf-lname'),
      productLine: 'LONG_TERM_CARE',
      inputs: { dateOfBirth: V('cf-dob'), state: V('cf-state') },
      results: null,
      consentText: C('#qb-consent')
    });
  } catch (e) { /* capture must never break the calculator */ }
}

function showResults() {
  qbCaptureLead();
  document.getElementById('step4').classList.remove('active');
  document.getElementById('tab4').classList.remove('active');
  document.getElementById('tab4').classList.add('done');
  document.getElementById('badge4').textContent = '✓';

  // ── Inputs ──────────────────────────────────────────────────────────────
  const retAssets    = parseInt(document.getElementById('retAssets').value);
  const homeEq       = parseInt(document.getElementById('homeEq').value);
  const age          = parseInt(document.getElementById('age').value);
  const gender       = getRadioVal('genderGroup');
  const marital      = getRadioVal('maritalGroup');
  const familyHx     = getRadioVal('familyHxGroup');
  const health       = getRadioVal('healthGroup');
  const careRegion   = parseInt(getRadioVal('careRegionGroup'));
  const benefitYears = parseInt(document.getElementById('benefitYears').value);
  const selfFund     = parseInt(document.getElementById('selfFund').value);
  const inflation    = getRadioVal('inflationGroup');
  const policyType   = getRadioVal('policyTypeGroup') || 'hybrid';
  const spouse       = getRadioVal('spouseGroup');
  const repo         = getRadioVal('repoGroup');

  // ── Core benefit numbers ─────────────────────────────────────────────────
  const totalAssets    = retAssets + homeEq;
  const netMonthlyCare = Math.max(500, careRegion - selfFund);
  const careExposure   = netMonthlyCare * 12 * benefitYears;
  const benefitPool    = Math.min(careExposure, retAssets * 0.85);

  // ── Risk score ───────────────────────────────────────────────────────────
  let riskScore = 45;
  if (gender === 'female')       riskScore += 15;
  if (familyHx === 'yes')        riskScore += 22;
  if (familyHx === 'unknown')    riskScore += 8;
  if (age >= 65)                 riskScore += 18;
  else if (age >= 60)            riskScore += 10;
  if (health === 'fair')         riskScore += 12;
  if (marital === 'single')      riskScore += 8;
  if (marital === 'married')     riskScore -= 5;
  riskScore = Math.min(95, Math.max(18, riskScore));

  let riskLabel, riskColor, riskClass;
  if      (riskScore >= 68) { riskLabel = 'High';     riskColor = '#dc2626'; riskClass = 'high'; }
  else if (riskScore >= 42) { riskLabel = 'Moderate'; riskColor = '#d97706'; riskClass = 'moderate'; }
  else                      { riskLabel = 'Lower';    riskColor = '#16a34a'; riskClass = 'lower'; }

  // ── Insurability string (shared) ─────────────────────────────────────────
  let insurabilityText;
  if (age + 5 >= 70 || health === 'fair') insurabilityText = 'Uncertain';
  else if (age + 5 >= 65)                 insurabilityText = 'Possible — 1-in-4 declined at 65+';
  else                                    insurabilityText = 'Likely insurable';

  const waitAge = age + 5;

  // ── Couple discount flags ────────────────────────────────────────────────
  const coupleDisc     = (spouse === 'yes' && marital === 'married') ? 0.83 : 1.0;
  const abltcCoupleDisc = (spouse === 'yes' && marital === 'married') ? 0.93 : 1.0;
  const coupleLabel    = (spouse === 'yes' && marital === 'married') ? '10–30% applied' : 'Not applicable';
  const abltcCoupleLbl = (spouse === 'yes' && marital === 'married') ? '5–10% applied'  : 'Not applicable';

  // ── Inflation label ──────────────────────────────────────────────────────
  const inflLabels = { none: 'None', simple: '3% simple', compound: '3% compound' };
  const inflLabel  = inflLabels[inflation] || '3% compound';

  // ── Base annual premium mid (Traditional / Hybrid shared base) ────────────
  let base = (gender === 'female') ? 3900 : 2800;
  if      (age < 50) base *= 0.62;
  else if (age < 55) base *= 0.80;
  else if (age < 60) base *= 1.00;
  else if (age < 65) base *= 1.38;
  else               base *= 1.80;
  base *= (careRegion / 5000);
  if (inflation === 'compound') base *= 1.30;
  else if (inflation === 'simple') base *= 1.15;
  if (benefitYears > 3) base *= (1 + (benefitYears - 3) * 0.18);
  base *= coupleDisc;

  const ageFactor5 = age < 60 ? 1.40 : 1.60;

  // ── Traditional premium range ─────────────────────────────────────────────
  const tradBase      = base * 1.00;
  const tradLowNow    = Math.round(tradBase * 0.78 / 100) * 100;
  const tradHighNow   = Math.round(tradBase * 1.28 / 100) * 100;
  const tradLowWait   = Math.round(tradBase * 0.78 * ageFactor5 / 100) * 100;
  const tradHighWait  = Math.round(tradBase * 1.28 * ageFactor5 / 100) * 100;
  const tradMidNow    = (tradLowNow + tradHighNow) / 2;
  const tradMidWait   = (tradLowWait + tradHighWait) / 2;
  const tradDelay     = Math.round(((tradMidWait - tradMidNow) * 20 + tradMidNow * 5) / 100) * 100;

  // ── Hybrid premium range ──────────────────────────────────────────────────
  const hybBase       = base * 1.20;
  const hybLowNow     = Math.round(hybBase * 0.72 / 100) * 100;
  const hybHighNow    = Math.round(hybBase * 1.45 / 100) * 100;
  const hybLowWait    = Math.round(hybBase * 0.72 * ageFactor5 / 100) * 100;
  const hybHighWait   = Math.round(hybBase * 1.45 * ageFactor5 / 100) * 100;
  const hybMidNow     = (hybLowNow + hybHighNow) / 2;
  const hybMidWait    = (hybLowWait + hybHighWait) / 2;
  const hybDelay      = Math.round(((hybMidWait - hybMidNow) * 20 + hybMidNow * 5) / 100) * 100;

  // ── ABLTC single-premium range ────────────────────────────────────────────
  let leverageLow, leverageMid, leverageHigh;
  if      (age < 55) { leverageLow = 2.5; leverageMid = 3.0; leverageHigh = 3.5; }
  else if (age < 60) { leverageLow = 2.2; leverageMid = 2.6; leverageHigh = 3.0; }
  else if (age < 65) { leverageLow = 1.9; leverageMid = 2.2; leverageHigh = 2.6; }
  else if (age < 70) { leverageLow = 1.6; leverageMid = 1.9; leverageHigh = 2.2; }
  else               { leverageLow = 1.3; leverageMid = 1.6; leverageHigh = 1.9; }

  const abltcLowNow  = Math.round((benefitPool / leverageHigh) * abltcCoupleDisc / 1000) * 1000;
  const abltcHighNow = Math.round((benefitPool / leverageLow)  * abltcCoupleDisc / 1000) * 1000;

  const levLowW  = Math.max(1.1, leverageLow  - 0.30);
  const levHighW = Math.max(1.3, leverageHigh - 0.40);
  const abltcLowWait  = Math.round((benefitPool / levHighW) * abltcCoupleDisc / 1000) * 1000;
  const abltcHighWait = Math.round((benefitPool / levLowW)  * abltcCoupleDisc / 1000) * 1000;
  const abltcMidNow   = (abltcLowNow  + abltcHighNow)  / 2;
  const abltcMidWait  = (abltcLowWait + abltcHighWait) / 2;
  const abltcDelay    = Math.round((abltcMidWait - abltcMidNow) / 1000) * 1000;

  // ── Summary tiles ────────────────────────────────────────────────────────
  const fname   = document.getElementById('cf-fname').value.trim();
  const titleEl = document.querySelector('.results-title');
  if (titleEl && fname) titleEl.textContent = fname + "'s C.A.R.E. Analysis";

  document.getElementById('r-totalAssets').textContent   = fmt(totalAssets);
  document.getElementById('r-careExp').textContent        = fmt(careExposure);
  document.getElementById('r-careExpSub').textContent     = 'over ' + benefitYears + '-year benefit period';
  document.getElementById('r-benefitPool').textContent    = fmt(benefitPool);
  document.getElementById('r-monthlyBenefit').textContent = fmt(netMonthlyCare);

  const rBadge = document.getElementById('r-riskBadge');
  rBadge.textContent = riskLabel; rBadge.className = 'risk-badge ' + riskClass;
  document.getElementById('r-riskFill').style.width      = riskScore + '%';
  document.getElementById('r-riskFill').style.background = riskColor;

  // ── Highlight selected column ─────────────────────────────────────────────
  const colMap = { traditional: 'trad', hybrid: 'hybrid', annuity: 'abltc' };
  const sel    = colMap[policyType] || 'hybrid';
  ['trad','hybrid','abltc'].forEach(c => {
    const head = document.getElementById('cmp-head-' + c);
    if (head) head.classList.toggle('selected', c === sel);
    document.querySelectorAll('#c-' + c + '-monthly, #c-' + c + '-period, #c-' + c + '-pool, #c-' + c + '-inflation, #c-' + c + '-couple, #c-' + c + '-prem-now, #c-' + c + '-cum20, #c-' + c + '-prem-wait, #c-' + c + '-prem-delay, #c-' + c + '-insure, #c-' + c + '-assets, #c-' + c + '-pct, #c-' + c + '-costpct').forEach(el => {
      if (el) el.classList.toggle('selected', c === sel);
    });
  });

  // ── Coverage Design rows ─────────────────────────────────────────────────
  const monthly    = fmt(netMonthlyCare) + ' / mo';
  const period     = benefitYears + ' years';
  const pool       = fmt(benefitPool);

  ['trad','hybrid','abltc'].forEach(c => {
    document.getElementById('c-' + c + '-monthly').textContent    = monthly;
    document.getElementById('c-' + c + '-period').textContent     = period;
    document.getElementById('c-' + c + '-pool').textContent       = pool;
    document.getElementById('c-' + c + '-inflation').textContent  = inflLabel;
  });

  // ── Couple discount ───────────────────────────────────────────────────────
  document.getElementById('c-trad-couple').textContent   = coupleLabel;
  document.getElementById('c-hybrid-couple').textContent = coupleLabel;
  document.getElementById('c-abltc-couple').textContent  = abltcCoupleLbl;

  // ── Wait age labels ───────────────────────────────────────────────────────
  ['cmp-waitAge','cmp-waitAge2','cmp-waitAge3'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = waitAge;
  });

  // ── Cost of Delay ─────────────────────────────────────────────────────────
  document.getElementById('c-trad-prem-now').textContent   = fmt(tradLowNow)  + ' – ' + fmt(tradHighNow)  + '/yr';
  document.getElementById('c-hybrid-prem-now').textContent = fmt(hybLowNow)   + ' – ' + fmt(hybHighNow)   + '/yr';
  document.getElementById('c-abltc-prem-now').textContent  = fmt(abltcLowNow) + ' – ' + fmt(abltcHighNow) + '\n(lump sum)';

  // Cumulative 20yr cost: annual × 20 for Traditional & Hybrid; ABLTC is one-time (same range)
  const tradCum20Low  = Math.round(tradLowNow  * 20 / 100) * 100;
  const tradCum20High = Math.round(tradHighNow * 20 / 100) * 100;
  const hybCum20Low   = Math.round(hybLowNow   * 20 / 100) * 100;
  const hybCum20High  = Math.round(hybHighNow  * 20 / 100) * 100;
  document.getElementById('c-trad-cum20').textContent   = fmt(tradCum20Low)  + ' – ' + fmt(tradCum20High);
  document.getElementById('c-hybrid-cum20').textContent = fmt(hybCum20Low)   + ' – ' + fmt(hybCum20High);
  document.getElementById('c-abltc-cum20').textContent  = fmt(abltcLowNow)   + ' – ' + fmt(abltcHighNow) + '\n(one-time)';

  document.getElementById('c-trad-prem-wait').textContent   = fmt(tradLowWait)  + ' – ' + fmt(tradHighWait)  + '/yr';
  document.getElementById('c-hybrid-prem-wait').textContent = fmt(hybLowWait)   + ' – ' + fmt(hybHighWait)   + '/yr';
  document.getElementById('c-abltc-prem-wait').textContent  = fmt(abltcLowWait) + ' – ' + fmt(abltcHighWait) + '\n(lump sum)';

  document.getElementById('c-trad-prem-delay').textContent   = fmt(tradDelay)  + ' lifetime';
  document.getElementById('c-hybrid-prem-delay').textContent = fmt(hybDelay)   + ' lifetime';
  document.getElementById('c-abltc-prem-delay').textContent  = fmt(abltcDelay) + ' more deposit';

  ['trad','hybrid','abltc'].forEach(c => {
    document.getElementById('c-' + c + '-insure').textContent = insurabilityText;
  });

  // ── Asset Protection ──────────────────────────────────────────────────────
  ['trad','hybrid','abltc'].forEach(c => {
    document.getElementById('c-' + c + '-assets').textContent = fmt(retAssets);
    document.getElementById('c-' + c + '-pct').textContent    = pct(benefitPool / retAssets);
  });
  document.getElementById('c-trad-costpct').textContent   = pct(tradMidNow  / retAssets) + '/yr';
  document.getElementById('c-hybrid-costpct').textContent = pct(hybMidNow   / retAssets) + '/yr';
  document.getElementById('c-abltc-costpct').textContent  = pct(abltcMidNow / retAssets) + ' (deposit)';

  // ── Populate mobile cards ─────────────────────────────────────────────
  const mobCols = { traditional: 'trad', hybrid: 'hybrid', annuity: 'abltc' };
  const mobSel = mobCols[policyType] || 'hybrid';

  // Set selected tab styling and panel selection class
  ['trad','hybrid','abltc'].forEach(c => {
    const tab   = document.getElementById('mob-tab-' + c);
    const panel = document.getElementById('mob-panel-' + c);
    if (tab)   tab.classList.toggle('selected-tab', c === mobSel);
    if (panel) panel.classList.toggle('selected', c === mobSel);
  });
  // Start on selected tab
  mobTab(mobSel);

  // Mirror all values into mobile IDs
  const mobMap = [
    ['m-trad-monthly',   'c-trad-monthly'],   ['m-hybrid-monthly',  'c-hybrid-monthly'],  ['m-abltc-monthly',   'c-abltc-monthly'],
    ['m-trad-period',    'c-trad-period'],     ['m-hybrid-period',   'c-hybrid-period'],   ['m-abltc-period',    'c-abltc-period'],
    ['m-trad-pool',      'c-trad-pool'],       ['m-hybrid-pool',     'c-hybrid-pool'],     ['m-abltc-pool',      'c-abltc-pool'],
    ['m-trad-inflation', 'c-trad-inflation'],  ['m-hybrid-inflation','c-hybrid-inflation'],['m-abltc-inflation', 'c-abltc-inflation'],
    ['m-trad-couple',    'c-trad-couple'],     ['m-hybrid-couple',   'c-hybrid-couple'],   ['m-abltc-couple',    'c-abltc-couple'],
    ['m-trad-prem-now',  'c-trad-prem-now'],  ['m-hybrid-prem-now', 'c-hybrid-prem-now'], ['m-abltc-prem-now',  'c-abltc-prem-now'],
    ['m-trad-cum20',     'c-trad-cum20'],      ['m-hybrid-cum20',    'c-hybrid-cum20'],    ['m-abltc-cum20',     'c-abltc-cum20'],
    ['m-trad-prem-wait', 'c-trad-prem-wait'], ['m-hybrid-prem-wait','c-hybrid-prem-wait'],['m-abltc-prem-wait', 'c-abltc-prem-wait'],
    ['m-trad-delay',     'c-trad-prem-delay'],['m-hybrid-delay',    'c-hybrid-prem-delay'],['m-abltc-delay',    'c-abltc-prem-delay'],
    ['m-trad-insure',    'c-trad-insure'],     ['m-hybrid-insure',   'c-hybrid-insure'],   ['m-abltc-insure',    'c-abltc-insure'],
    ['m-trad-assets',    'c-trad-assets'],     ['m-hybrid-assets',   'c-hybrid-assets'],   ['m-abltc-assets',    'c-abltc-assets'],
    ['m-trad-pct',       'c-trad-pct'],        ['m-hybrid-pct',      'c-hybrid-pct'],      ['m-abltc-pct',       'c-abltc-pct'],
    ['m-trad-costpct',   'c-trad-costpct'],    ['m-hybrid-costpct',  'c-hybrid-costpct'],  ['m-abltc-costpct',   'c-abltc-costpct'],
  ];
  mobMap.forEach(([mobId, deskId]) => {
    const src  = document.getElementById(deskId);
    const dest = document.getElementById(mobId);
    if (src && dest) dest.textContent = src.textContent;
  });
  // Age labels in mobile cards
  ['trad','hybrid','abltc'].forEach(c => {
    const wa  = document.getElementById('m-' + c + '-wait-age');
    const ia  = document.getElementById('m-' + c + '-insure-age');
    if (wa) wa.textContent = waitAge;
    if (ia) ia.textContent = waitAge;
  });

  document.getElementById('resultsPanel').classList.add('show');
  setTimeout(() => {
    document.getElementById('resultsPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 100);
}

function restart() {
  document.getElementById('resultsPanel').classList.remove('show');
  document.querySelectorAll('.progress-step').forEach((t, i) => {
    t.classList.remove('active', 'done');
    document.getElementById('badge' + i).textContent = BADGE_LABELS[i];
  });
  document.querySelectorAll('.step-panel').forEach(p => p.classList.remove('active'));
  // Clear contact fields
  ['cf-fname','cf-lname','cf-email','cf-phone','cf-dob'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.value = ''; el.classList.remove('error'); }
  });
  ['err-fname','err-lname','err-email','err-phone','err-dob'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = '';
  });
  curStep = 0;
  document.getElementById('step0').classList.add('active');
  document.getElementById('tab0').classList.add('active');
  window.scrollTo({ top: document.querySelector('.calc-card').offsetTop - 80, behavior: 'smooth' });
}

/* The markup names actions rather than carrying onclick attributes, which a
   Content-Security-Policy without 'unsafe-inline' blocks wherever they came
   from -- including markup this script builds itself. Only what is listed
   here can be reached from an attribute. */
window.qbActions.register({ goStep: goStep, mobTab: mobTab, pickRadio: pickRadio, pickSingle: pickSingle, restart: restart, submitContact: submitContact, syncVal: syncVal, toggleCheck: toggleCheck });
