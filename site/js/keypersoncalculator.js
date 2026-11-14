/*
 * keypersoncalculator.html's own script, which used to sit inline in the page.
 *
 * It had to move: a Content-Security-Policy without 'unsafe-inline' blocks an
 * inline <script>, so inline this page would have gone dead the moment the
 * policy went on -- quietly, with the markup looking perfectly correct.
 *
 * Moved verbatim.
 */
/* ============================================================
   KEY PERSON MODEL  (proprietary — from Key_Person_Calculator)
   Base Need  = Total Compensation (salary + bonus) × factor
   factor     = FACTOR_GRID[ employee-count band ][ difficulty to replace ]
   Addl Need  = Employee Benefits + (loan × % responsible)
   Total Need = MIN( Base Need + Addl Need , Total Compensation × 10 )
   ============================================================ */
const FACTOR_GRID = {
  '1-10':   { 'Difficult':6.5, 'Very Difficult':8.0, 'Impossible':10.0 },
  '11-50':  { 'Difficult':4.5, 'Very Difficult':6.5, 'Impossible':8.5 },
  '51-100': { 'Difficult':3.5, 'Very Difficult':5.5, 'Impossible':7.5 },
  '101+':   { 'Difficult':2.5, 'Very Difficult':4.5, 'Impossible':6.5 },
};
const BANDS = ['1-10','11-50','51-100','101+'];
const BAND_LABEL = { '1-10':'1–10','11-50':'11–50','51-100':'51–100','101+':'101+' };
const DIFFICULTIES = ['Difficult','Very Difficult','Impossible'];
const D_CLASS = { 'Difficult':'d-diff','Very Difficult':'d-vdiff','Impossible':'d-imp' };
const COMP_CAP_MULT = 10;

function empBand(n){
  n = Math.max(1, Math.round(n||0));
  if (n <= 10) return '1-10';
  if (n <= 50) return '11-50';
  if (n <= 100) return '51-100';
  return '101+';
}

/* ============================================================
   INDUSTRIES (context / lead data only — does not affect the value)
   ============================================================ */
const INDUSTRIES = [
  'Professional Services (legal, accounting, consulting)','Software / SaaS','Technology / IT Services',
  'Healthcare Services','Manufacturing','Wholesale / Distribution','Marketing / Media Agency',
  'Financial Services','Real Estate Services','Agriculture','Transportation / Logistics',
  'Construction / Contractors','Retail','Auto Services / Repair','Restaurant / Food Service',
  'Consumer / Personal Services','Other / General Business',
];
const STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];

/* ============================================================
   RATE ENGINE  (shared Quote-Bot model — business-owned key person policy)
   ============================================================ */
/* The underwriting classes the quote engine accepts, unchanged: they are
   sent as healthClass and must match what Compulife are asked for. */
const UW_OPTIONS = ['Preferred Plus','Preferred','Standard Plus','Standard','Substandard'];

/* ============================================================
   HELPERS
   ============================================================ */
const $ = id => document.getElementById(id);
const num = v => parseFloat(String(v).replace(/[^0-9.\-]/g,'')) || 0;
const fmtUSD = n => '$' + Math.round(n).toLocaleString();
const fmtUSDk = n => {
  n = Math.round(n);
  if (Math.abs(n) >= 1e6) return '$' + (n/1e6).toFixed(2).replace(/\.?0+$/,'') + 'M';
  if (Math.abs(n) >= 1e3) return '$' + Math.round(n/1e3) + 'K';
  return '$' + n.toLocaleString();
};
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
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function formatUSPhone(v){
  let d = String(v).replace(/\D/g,'');
  if (d.length === 11 && d[0] === '1') d = d.slice(1);
  d = d.slice(0,10);
  if (d.length === 0) return '';
  if (d.length < 4) return '(' + d;
  if (d.length < 7) return '(' + d.slice(0,3) + ') ' + d.slice(3);
  return '(' + d.slice(0,3) + ') ' + d.slice(3,6) + '-' + d.slice(6);
}
function fmtMoneyInput(el){
  el.addEventListener('input', () => {
    const caretEnd = el.selectionStart === el.value.length;
    const v = num(el.value);
    el.value = v ? v.toLocaleString() : '';
    if (caretEnd) el.setSelectionRange(el.value.length, el.value.length);
  });
}
function fullName(p){ return ((p.first||'') + ' ' + (p.last||'')).trim() || 'Key Employee'; }
function firstName(p){ return (p.first||'').trim() || fullName(p).split(' ')[0]; }

/* ============================================================
   KEY EMPLOYEE INPUT CARDS
   ============================================================ */
let keData = [];

/**
 * One blank key person, carrying EVERY field renderKeCards reads.
 *
 * It used to be six copies of a nine-field object, and the template reads
 * nineteen. The four money fields call .toLocaleString() on what they are
 * given, so the first missing one threw, wrap.innerHTML was never assigned,
 * and the whole section rendered as nothing -- silently, because the
 * exception happened inside an event handler.
 *
 * So: one object rather than six identical ones, every field present, and
 * buildKeCards spreads it UNDER whatever it has. A field added to the
 * template and forgotten here is then a blank input, never an exception that
 * takes the section with it.
 *
 * The three that decide a price are the honest middle rather than the
 * flattering end: 'Standard' health, not the 'Preferred Plus' the visitor
 * used to get for free by it being first in the list.
 */
const BLANK_KE = {
  first: '', last: '', title: '', email: '', phone: '',
  gender: 'Male', age: '', state: '', ownership: 0,
  tobacco: 'Non-Tobacco', health: 'Standard',
  salary: 0, bonus: 0, benefits: 0,
  tied: 'No', loan: 0, loanPct: 0,
  difficulty: 'Difficult',
};

function readKeInputs(){
  const cards = document.querySelectorAll('#kesWrap .ke-card');
  const arr = [];
  cards.forEach(c => {
    arr.push({
      first:      c.querySelector('.k-first').value,
      last:       c.querySelector('.k-last').value,
      title:      c.querySelector('.k-title').value,
      gender:     c.querySelector('.k-gender').value,
      age:        num(c.querySelector('.k-age').value),
      state:      c.querySelector('.k-state').value,
      ownership:  num(c.querySelector('.k-own').value),
      tobacco:    c.querySelector('.k-tob').value,
      health:     c.querySelector('.k-health').value,
      salary:     num(c.querySelector('.k-salary').value),
      bonus:      num(c.querySelector('.k-bonus').value),
      benefits:   num(c.querySelector('.k-benefits').value),
      tied:       c.querySelector('.k-tied').value,
      loan:       num(c.querySelector('.k-loan').value),
      loanPct:    num(c.querySelector('.k-loanpct').value),
      difficulty: c.querySelector('.k-diff-active') ? c.querySelector('.k-diff-active').dataset.diff : 'Difficult',
    });
  });
  return arr;
}

function buildKeCards(){
  /* `|| 1` rather than a bare parseInt. An unchosen select gave NaN, the
     loop never ran, and this calculator's entire subject disappeared from
     the page. One card is the floor: there is no such thing as a key person
     valuation with no key person in it. */
  const n = parseInt($('numKeyEmployees').value, 10) || 1;
  const existing = readKeInputs();
  keData = [];
  for (let i = 0; i < n; i += 1){
    /* Spread over the blank, not instead of it, so a card carrying fewer
       fields than the template reads still renders. */
    keData.push({ ...BLANK_KE, ...(existing[i] || {}) });
  }
  renderKeCards();
}

function stateOptions(sel){
  /* Unchosen rather than falling to Alabama.
     The list is alphabetical and a blank value matches nothing, so the
     browser selected the first entry and every untouched key person was
     quoted in Alabama. That is the failure QBP-91 was written to fix -- it
     caught the business state and the health class and missed these cards,
     because nothing on them was rendering by then to notice it on. */
  const chosen = STATES.includes(sel);
  return `<option value="" ${chosen ? '' : 'selected'}>Select a state</option>`
    + STATES.map(s=>`<option ${s===sel?'selected':''}>${s}</option>`).join('');
}
function ynOptions(sel){ return ['No','Yes'].map(o=>`<option ${o===sel?'selected':''}>${o}</option>`).join(''); }
function genderOptions(sel){ return ['Male','Female'].map(o=>`<option ${o===sel?'selected':''}>${o}</option>`).join(''); }
function tobaccoOptions(sel){ return ['Non-Tobacco','Tobacco'].map(o=>`<option ${o===sel?'selected':''}>${o}</option>`).join(''); }
function healthOptions(sel){ return UW_OPTIONS.map(o=>`<option ${o===sel?'selected':''}>${o}</option>`).join(''); }

function renderKeCards(){
  const wrap = $('kesWrap');
  wrap.innerHTML = keData.map((p,i) => `
    <div class="ke-card" data-idx="${i}">
      <div class="ke-card-head">
        <span class="ke-chip">${i+1}</span>
        <span class="lbl">Key Employee ${i+1}</span>
        <span class="tip-mark" tabindex="0" data-tip="Enter the real name of each key employee so our team can prepare an accurate financial-justification and application.">i</span>
      </div>

      <div class="field-row">
        <div class="field"><label>First Name</label><input type="text" class="k-first" value="${esc(p.first)}" placeholder="First"></div>
        <div class="field"><label>Last Name</label><input type="text" class="k-last" value="${esc(p.last)}" placeholder="Last"></div>
      </div>
      <div class="field"><label>Job Title</label><input type="text" class="k-title" value="${esc(p.title)}" placeholder="e.g., Lead Engineer"></div>

      <div class="ke-sub">Profile</div>
      <div class="field-row three">
        <div class="field"><label>Age</label><input type="number" class="k-age" value="${p.age}" min="18" max="80" step="1"></div>
        <div class="field"><label>Gender</label><select class="k-gender">${genderOptions(p.gender)}</select></div>
        <div class="field"><label>State</label><select class="k-state">${stateOptions(p.state)}</select></div>
      </div>
      <div class="field-row three">
        <div class="field"><label>Owner %</label><div class="input-wrap"><input type="number" class="k-own has-suffix" value="${p.ownership}" min="0" max="100" step="1"><span class="input-suffix">%</span></div></div>
        <div class="field"><label>Tobacco</label><select class="k-tob">${tobaccoOptions(p.tobacco)}</select></div>
        <div class="field"><label>Health</label><select class="k-health">${healthOptions(p.health)}</select></div>
      </div>

      <div class="ke-sub">Compensation</div>
      <div class="field-row">
        <div class="field"><label>Annual Salary</label><div class="input-wrap"><span class="input-prefix">$</span><input type="text" inputmode="numeric" class="k-salary k-money has-prefix" value="${p.salary.toLocaleString()}"></div></div>
        <div class="field"><label>Annual Bonus</label><div class="input-wrap"><span class="input-prefix">$</span><input type="text" inputmode="numeric" class="k-bonus k-money has-prefix" value="${p.bonus.toLocaleString()}"></div></div>
      </div>
      <div class="field"><label>Other Comp &amp; Benefits <span class="tip-mark" tabindex="0" data-tip="Employer-paid benefits and other compensation (retirement match, health, equity value, perks). Added on top of base protection as additional coverage.">i</span></label><div class="input-wrap"><span class="input-prefix">$</span><input type="text" inputmode="numeric" class="k-benefits k-money has-prefix" value="${p.benefits.toLocaleString()}"></div></div>

      <div class="ke-sub">Loan Guarantee</div>
      <div class="field"><label>Tied to a Loan?</label><select class="k-tied" data-qb-change="toggleLoan" data-qb-change-args='[${i},"@el"]'>${ynOptions(p.tied)}</select></div>
      <div class="field-row ke-loan-detail ${p.tied==='Yes'?'show':''}" id="loanDetail-${i}">
        <div class="field"><label>Loan Amount</label><div class="input-wrap"><span class="input-prefix">$</span><input type="text" inputmode="numeric" class="k-loan k-money has-prefix" value="${p.loan.toLocaleString()}"></div></div>
        <div class="field"><label>% Responsible</label><div class="input-wrap"><input type="number" class="k-loanpct has-suffix" value="${p.loanPct}" min="0" max="100" step="1"><span class="input-suffix">%</span></div></div>
      </div>

      <div class="ke-sub">Difficulty to Replace</div>
      <div class="seg3 k-diff" data-idx="${i}">
        ${DIFFICULTIES.map(d=>`<button type="button" class="${D_CLASS[d]} ${p.difficulty===d?'active k-diff-active':''}" data-diff="${d}" data-qb-click="pickDiff" data-qb-click-args='[${i},"${d}"]'>${d}</button>`).join('')}
      </div>
    </div>
  `).join('');
  wrap.querySelectorAll('.k-money').forEach(fmtMoneyInput);
  applyKesHeight();
}

/* Cap the key-people scroll area to the height of 2 cards once a 3rd is added.
   Below the 920px breakpoint the layout is single-column, so no cap is applied. */
function applyKesHeight(){
  const wrap = $('kesWrap');
  if (!wrap) return;
  const cards = wrap.querySelectorAll('.ke-card');
  const mobile = window.matchMedia('(max-width: 920px)').matches;
  if (mobile || cards.length < 3){
    wrap.style.maxHeight = 'none';
    wrap.style.overflowY = 'visible';
    return;
  }
  const gap = 14;
  const h = Math.round(cards[0].offsetHeight + gap + cards[1].offsetHeight);
  wrap.style.maxHeight = h + 'px';
  wrap.style.overflowY = 'auto';
}

function toggleLoan(i, sel){
  const d = $('loanDetail-'+i);
  if (d) d.classList.toggle('show', sel.value === 'Yes');
  applyKesHeight();
}
function pickDiff(i, d){
  const seg = document.querySelector(`.k-diff[data-idx="${i}"]`);
  if (!seg) return;
  seg.querySelectorAll('button').forEach(b => {
    const on = b.dataset.diff === d;
    b.classList.toggle('active', on);
    b.classList.toggle('k-diff-active', on);
  });
}

function updateBandTag(){ $('bandTag').textContent = BAND_LABEL[empBand(num($('numEmployees').value))]; }

/* ============================================================
   CORE VALUATION
   ============================================================ */
function valueKeyPerson(p, band){
  const totalComp = (p.salary||0) + (p.bonus||0);
  const empBenefits = p.benefits||0;
  const tiedToLoan = (p.tied === 'Yes') ? (p.loan||0) * ((p.loanPct||0)/100) : 0;
  const factor = (FACTOR_GRID[band] && FACTOR_GRID[band][p.difficulty]) || 0;
  const baseNeed = totalComp * factor;
  const addlNeed = empBenefits + tiedToLoan;
  const maxAllowed = totalComp * COMP_CAP_MULT;
  const raw = baseNeed + addlNeed;
  const capped = raw > maxAllowed + 0.5;
  const totalNeed = Math.min(raw, maxAllowed);
  return { totalComp, empBenefits, tiedToLoan, factor, baseNeed, addlNeed, maxAllowed, raw, capped, totalNeed };
}

/* ============================================================
   STATE
   ============================================================ */
let STATE = null;
const DEFAULT_TERM = 10;

function validateContact(){
  let ok = true;
  const set = (id, valid) => { const f = $('f-'+id); if (f) f.classList.toggle('has-error', !valid); if (!valid) ok = false; };
  set('firstName', $('firstName').value.trim().length > 0);
  set('lastName',  $('lastName').value.trim().length > 0);
  set('title',     $('title').value.trim().length > 0);
  set('email',     /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test($('email').value.trim()));
  set('phone',     $('phone').value.replace(/\D/g,'').length >= 10);
  return ok;
}

function calculate(){
  if (!validateContact()){
    const firstErr = document.querySelector('.field.has-error input');
    if (firstErr){ firstErr.scrollIntoView({behavior:'smooth', block:'center'}); firstErr.focus(); }
    return;
  }
  const people = readKeInputs();
  /*
   * Nobody to value. Cannot happen now — buildKeCards floors at one — but
   * this is the shape of the bug that shipped: the cards stopped rendering
   * and pressing the button did nothing at all, with no red field and no
   * message, because the contact block validated perfectly well. A named
   * refusal beats silence if it ever comes back.
   */
  if (!people.length){
    buildKeCards();
    /* NOT named `note`. consent-selector-resolves.test.mjs follows the
       variable behind the consent-text line in qbCaptureLead to its first
       definition in the file, and a second `note` above that one made it
       read this refusal as the disclosure the visitor agreed to. The test
       caught it; the name is wrong regardless.
       (And this comment deliberately does not spell that field name out --
       the test finds it by searching the source, so prose quoting it is
       matched before the code is.) */
    const refusal = $('kesRefusal');
    if (refusal){
      refusal.hidden = false;
      refusal.scrollIntoView({ behavior: 'smooth', block: 'center' });
      refusal.classList.remove('flash');
      void refusal.offsetWidth;
      refusal.classList.add('flash');
    }
    return;
  }
  const refusal = $('kesRefusal'); if (refusal) refusal.hidden = true;
  const numEmp = Math.max(1, Math.round(num($('numEmployees').value)));
  const band = empBand(numEmp);

  STATE = {
    contact: {
      firstName: $('firstName').value.trim(), lastName: $('lastName').value.trim(),
      title: $('title').value.trim(), email: $('email').value.trim(), phone: $('phone').value.trim(),
    },
    biz: {
      name: $('bizName').value || 'Your Business',
      structure: $('bizStructure').value,
      state: $('bizState').value,
      industry: $('industry').value,
      numOwners: Math.max(1, Math.round(num($('numOwners').value))),
      numEmployees: numEmp,
      band,
    },
    people: people.map(p => {
      const v = valueKeyPerson(p, band);
      return { ...p, val: v, coverage: v.totalNeed, coverageTouched: false, term: DEFAULT_TERM };
    }),
  };
  /* Fresh report, so nothing carries over from the last one. */
  QUOTED = []; lastKey = []; quoteSeq = []; quoteTimer = [];
  renderResults();
  /* After the blocks exist, so each reply has somewhere to land. */
  requestAllQuotes();
  qbCaptureLead();
  $('calcGrid').classList.add('results-mode');
  document.body.classList.add('results-active');
  $('emptyState').style.display = 'none';
  $('resultsContent').classList.add('show');
  window.scrollTo({ top: 0, behavior:'smooth' });
}

/* ---- Quote Bot lead capture -------------------------------------------- */
/* Fires from calculate(), after validateContact() has passed and STATE is    */
/* fully built. Sends the business context, every key person's valuation, and */
/* the coverage totals. The capture module suppresses duplicate submissions,  */
/* so pressing Calculate repeatedly does not create repeat leads.             */
/**
 * Whether anything priced so far came from a carrier's filed rates.
 *
 * Reported rather than assumed, because the engine answers it per response:
 * a Compulife outage serves fixtures, and this page would otherwise file
 * those under a tool the server believes gets real rates. True when nothing
 * has come back yet, which is the safe direction -- "estimates" is the
 * claim you can always defend.
 */
function premiumsAreEstimatesNow(){
  const seen = QUOTED.filter(q => q && q.state === 'ok');
  if (!seen.length) return true;
  return seen.some(q => q.estimates !== false);
}

function qbCaptureLead(){
  if (!window.QuoteBot) return;
  try {
    var t = computeTotals();
    var note = document.querySelector('#qb-consent');
    window.QuoteBot.capture({
      email: STATE.contact.email,
      phone: STATE.contact.phone,
      firstName: STATE.contact.firstName,
      lastName: STATE.contact.lastName,
      productLine: 'TERM_LIFE',
      inputs: {
        contactTitle: STATE.contact.title,
        businessName: STATE.biz.name,
        businessStructure: STATE.biz.structure,
        state: STATE.biz.state,
        industry: STATE.biz.industry,
        numOwners: STATE.biz.numOwners,
        numEmployees: STATE.biz.numEmployees,
        headcountBand: STATE.biz.band,
        keyPeople: STATE.people.map(function(p){
          return {
            role: p.title || null, age: p.age, gender: p.gender,
            tobacco: p.tobacco, health: p.health,
            salary: p.salary, bonus: p.bonus, benefits: p.benefits,
            difficultyToReplace: p.difficulty,
            tiedToLoan: p.tied, loanAmount: p.loan
          };
        })
      },
      /*
       * Null until a quote has actually come back, never a number.
       *
       * This fires the moment Calculate is pressed, which is right -- a lead
       * should not wait on a network call that might fail. But the quotes
       * are still in flight at that point, so the old `t.totalAnnual` wrote
       * a combined premium of 0 into the record and it read like a figure
       * somebody had been shown rather than one nobody had.
       */
      premiumsAreEstimates: premiumsAreEstimatesNow(),
      results: {
        totalKeyPersonValue: t.totalValue,
        totalCoverage: t.totalCoverage,
        totalAnnualPremium: t.priced ? t.totalAnnual : null,
        premiumsPricedFor: t.priced,
        keyPersonCount: t.count,
        valuations: STATE.people.map(function(p){
          return {
            totalComp: p.val.totalComp, factor: p.val.factor,
            baseNeed: p.val.baseNeed, additionalNeed: p.val.addlNeed,
            totalNeed: p.val.totalNeed, cappedAtLimit: p.val.capped,
            coverageSelected: p.coverage, termYears: p.term
          };
        })
      },
      consentText: note ? note.textContent.replace(/\s+/g,' ').trim() : null
    });
  } catch (e) { /* capture must never break the calculator */ }
}

function editInputs(){
  $('calcGrid').classList.remove('results-mode');
  document.body.classList.remove('results-active');
}

/* ============================================================
   DIAGRAM — business at center owns a policy on each key person
   ============================================================ */
function diagramSVG(){
  const ps = STATE.people, N = ps.length;
  const cx = 380;
  const bizW = 192, bizH = 60, bizCy = 92;
  const bizTop = bizCy - bizH/2, bizBottom = bizCy + bizH/2;
  const perRow = N <= 4 ? N : Math.ceil(N/2);
  const rows = Math.ceil(N / perRow);
  const nodeH = 56;
  const nodeW = Math.max(98, Math.min(150, Math.floor(700/perRow) - 16));
  const rowYs = rows === 1 ? [256] : [232, 338];

  function rowCenters(c){
    if (c <= 1) return [cx];
    const margin = 40, left = margin + nodeW/2, right = 760 - margin - nodeW/2;
    const step = (right - left) / (c - 1);
    return Array.from({length:c}, (_,j) => left + step*j);
  }

  const pos = ps.map((p,i) => {
    const row = Math.floor(i / perRow);
    const cThis = (row === rows-1) ? (N - perRow*(rows-1)) : perRow;
    const idxInRow = i - row*perRow;
    const centers = rowCenters(cThis);
    return { x: centers[idxInRow], top: rowYs[row], p, i };
  });

  // connectors: business bottom-center branching down to each key person
  const links = pos.map(n => {
    const sx = cx, sy = bizBottom, tx = n.x, ty = n.top, midY = (sy + ty)/2;
    return `<path d="M${sx} ${sy} C ${sx} ${midY.toFixed(1)}, ${tx.toFixed(1)} ${midY.toFixed(1)}, ${tx.toFixed(1)} ${ty}" fill="none" stroke="#4a90d9" stroke-width="2" opacity="0.55" marker-end="url(#arr)"/>`;
  }).join('');

  // key person nodes
  const nodes = pos.map(n => {
    const first = esc(firstName(n.p)).slice(0,12);
    const rx = (n.x - nodeW/2).toFixed(1), ry = n.top.toFixed(1);
    const cyt = n.top + nodeH/2;
    const dColor = n.p.difficulty==='Impossible' ? '#dc2626' : n.p.difficulty==='Very Difficult' ? '#d97706' : '#93c5fd';
    return `
      <rect x="${rx}" y="${ry}" width="${nodeW}" height="${nodeH}" rx="12" fill="#fff" stroke="${dColor}" stroke-width="2.5"/>
      <text x="${n.x.toFixed(1)}" y="${(cyt-4).toFixed(1)}" text-anchor="middle" fill="#1a3d6b" font-size="14.5" font-weight="700" font-family="'Fraunces',serif">${first}</text>
      <text x="${n.x.toFixed(1)}" y="${(cyt+13).toFixed(1)}" text-anchor="middle" fill="#8a9ab5" font-size="10.5" font-weight="700">${fmtUSDk(n.p.coverage)}</text>`;
  }).join('');

  // business node (top)
  const bizName = esc(STATE.biz.name).slice(0,20);
  const bizNode = `
    <rect x="${(cx-bizW/2).toFixed(1)}" y="${bizTop.toFixed(1)}" width="${bizW}" height="${bizH}" rx="14" fill="#1a3d6b" stroke="#fff" stroke-width="2.5"/>
    <text x="${cx}" y="${(bizCy-4).toFixed(1)}" text-anchor="middle" fill="#fff" font-size="15" font-weight="700" font-family="'Fraunces',serif">${bizName}</text>
    <text x="${cx}" y="${(bizCy+13).toFixed(1)}" text-anchor="middle" fill="#93c5fd" font-size="10.5" font-weight="700">owner &amp; beneficiary</text>`;

  return `
  <svg class="diagram-svg" viewBox="0 0 760 432" xmlns="http://www.w3.org/2000/svg" font-family="'Plus Jakarta Sans',sans-serif">
    <defs><marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#4a90d9"/></marker></defs>
    <text x="380" y="26" text-anchor="middle" fill="#8a9ab5" font-size="13" font-weight="700">${esc(STATE.biz.name).slice(0,32).toUpperCase()} — WHO THE BUSINESS INSURES</text>
    ${links}
    ${bizNode}
    ${nodes}
    <text x="380" y="418" text-anchor="middle" fill="#5a6b85" font-size="13.5" font-weight="700">The business owns, pays for, and is the beneficiary of a policy on each key person.</text>
  </svg>`;
}

function lifecycleHTML(){
  const steps = [
    { c:'red',   t:'<b>A key person dies</b> (or becomes critically disabled, if the policy includes it).' },
    { c:'green', t:'The carrier pays the <b>business</b> an income-tax-free death benefit.' },
    { c:'navy',  t:'Cash covers <b>lost profits, recruiting and training</b> a replacement, and steadies operations.' },
    { c:'teal',  t:'Any <b>loans the key person guaranteed</b> can be repaid, reassuring lenders and creditors.' },
  ];
  return `
    <div class="lifecycle-head">What the coverage does when a key person is lost</div>
    <div class="lifecycle">
      ${steps.map((s,i)=>`<div class="life-step ${s.c}"><span class="life-num">${i+1}</span><p>${s.t}</p></div>`).join('')}
    </div>`;
}

function toggleDiagram(){
  const wrap = $('diagramCollapse'), btn = $('diagramToggle');
  if (!wrap || !btn) return;
  const open = wrap.classList.toggle('open');
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  btn.querySelector('.chev').nextSibling.textContent = open ? ' Hide diagram' : ' Show diagram';
}

/* ============================================================
   FACTOR MATRIX (per person, highlight the applicable cell)
   ============================================================ */
function factorMatrix(person){
  const band = STATE.biz.band;
  const head = `<tr><th class="rowhead">Headcount ＼ Difficulty</th>${DIFFICULTIES.map(d=>`<th>${d}</th>`).join('')}</tr>`;
  const rows = BANDS.map(b => {
    const active = b === band;
    const cells = DIFFICULTIES.map(d => {
      const on = active && d === person.difficulty;
      return `<td class="${on?'cell-active':''}">${FACTOR_GRID[b][d].toFixed(1)}</td>`;
    }).join('');
    return `<tr class="${active?'band-active':''}"><td class="rowhead">${BAND_LABEL[b]} employees</td>${cells}</tr>`;
  }).join('');
  return `<table class="fmatrix">${head}${rows}</table>
    <div class="fmatrix-cap">With <b>${STATE.biz.numEmployees.toLocaleString()}</b> employees (${BAND_LABEL[band]} band) and a <b>${esc(person.difficulty)}</b>-to-replace rating, ${esc(firstName(person))}'s multiplier is <b>${person.val.factor.toFixed(1)}×</b> total compensation.</div>`;
}

/* ============================================================
   QUOTES (business-owned policy on the key person)

   Real rates, from the same engine and the same POST /quote contract the
   quote tool and D.I.M.E. use. What stood here was a table of per-$1,000
   factors with Cincinnati written into the layout: the "Recommended" card
   was `QUOTES.find(x => x.id === 'cinci')` whatever the person's age or
   health, with a `|| sorted[1]` that quietly put somebody else in the same
   card still labelled as our pick.

   Two cards per person, and the second is the carrier in first position in
   the admin console's carrier settings, wearing its own chip. The engine
   ranks them and attaches each pick to the quote row it came from, so a
   card can never name a carrier that returned no premium.

   ONE REQUEST PER PERSON. Each key person has their own age, health and
   coverage, so there is no single quote that covers a report — and each is
   a metered call on one registered address, which is why they are keyed,
   debounced and deduplicated per person below.
   ============================================================ */

/* Carrier chrome arrives with the quote, so a rating or a logo changes in
   the admin console rather than in this file. */
function logoFor(name, url){
  var safe = String(name || '').replace(/[&<>"]/g, '');
  var short = safe.split(' ').slice(0, 2).join(' ');
  if (url){
    return '<img src="' + url + '" alt="' + safe + '" style="max-height:34px;max-width:104px;object-fit:contain" '
      + 'onerror="this.outerHTML=\'<div class=&quot;logo&quot;>' + short + '</div>\'">';
  }
  return '<div class="logo">' + short + '</div>';
}

/**
 * Term length -> Compulife category letter, read off their live list.
 *
 * Same reasoning as D.I.M.E.: the letter IS the coverage choice, the list
 * reports what currently has products, and their documentation disagrees
 * with what this licence returns. Level term only — "25 Year Return of
 * Premium" also starts with a number and is a different product.
 *
 * Empty is a working state: the quote then goes as product + termYears,
 * the older contract the engine still reads.
 */
let TERM_LETTER = {};
const TERM_CHOICES = [10, 15, 20, 25, 30];

async function loadCoverageCategories(){
  const endpoint = window.QB_QUOTE_ENDPOINT || '';
  if (!/^https?:\/\//i.test(endpoint)) return;
  try {
    const res = await fetch(endpoint.replace(/\/$/, '') + '/categories');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const list = (await res.json()).categories;
    if (!Array.isArray(list) || !list.length) throw new Error('empty list');
    const map = {};
    for (const c of list){
      const m = /^\s*(\d+)\s+year\s+level\s+term/i.exec(String((c && c.name) || ''));
      if (m && c && c.letter && !(m[1] in map)) map[m[1]] = String(c.letter);
    }
    if (Object.keys(map).length) TERM_LETTER = map;
  } catch (err){
    console.warn('[keyperson] live coverage list unavailable, quoting by term length', err);
  }
}
loadCoverageCategories();

/** The durations Compulife can currently price, for the per-person select. */
function liveTerms(){
  if (!Object.keys(TERM_LETTER).length) return TERM_CHOICES;
  const live = TERM_CHOICES.filter(t => TERM_LETTER[String(t)]);
  return live.length ? live : TERM_CHOICES;
}

/**
 * A date of birth that yields exactly the age the visitor typed.
 *
 * This page asks for age, not a birth date — an owner valuing their CFO
 * knows "about 47" and not the day. Compulife price off a date, so one is
 * synthesized here rather than a field being added to six cards.
 *
 * What that costs, said plainly: the premium is keyed to whole-year age, so
 * somebody a fortnight from a birthday is priced at the younger age. That is
 * the resolution the page collected and it is not hidden — these are shown
 * as illustrative until an application is taken.
 */
function dobForAge(age){
  const n = Number(age);
  if (!Number.isFinite(n) || n < 18 || n > 85) return null;
  const now = new Date();
  const d = new Date(now.getFullYear() - Math.round(n), now.getMonth(), now.getDate());
  return d.toISOString().slice(0, 10);
}

/* ---- Per-person quote state -------------------------------------------- */

/**
 * One entry per key person, by index.
 *
 * { state: 'idle'|'loading'|'ok'|'empty'|'error', quotes, featured, estimates }
 * Never premiums this file computed: every number in here came off the wire.
 */
let QUOTED = [];
/* The request last sent for each person, so a re-render that changes nothing
   does not spend a call. */
let lastKey = [];
/* Replies can land out of order, per person. */
let quoteSeq = [];
let quoteTimer = [];

function personQuoteBody(person){
  const cvg = Math.max(1000, Math.round((person.coverage || 0) / 1000) * 1000);
  const dob = dobForAge(person.age);
  /* The person's own state when they gave one, otherwise the business's.
     A business-owned policy is issued where the business is, and this page
     asks for both — falling back is better than refusing to quote over a
     field the visitor reasonably left alone. */
  const state = person.state || (STATE && STATE.biz ? STATE.biz.state : '') || '';
  if (!dob || !state || cvg < 1000) return null;
  const term = person.term || DEFAULT_TERM;
  const letter = TERM_LETTER[String(term)];
  const body = {
    faceAmount: cvg,
    dateOfBirth: dob,
    gender: person.gender === 'Female' ? 'Female' : 'Male',
    tobacco: person.tobacco === 'Tobacco',
    healthClass: person.health || 'Standard',
    state: state,
    /* THE DIFFERENCE FROM THE OTHER TWO CALCULATORS. The policy is owned by
       the company on an employee's life, not by the insured on their own. */
    businessOwned: true,
    toolKey: 'keyperson'
  };
  if (letter) body.coverage = letter;
  else { body.product = 'TERM'; body.termYears = term; }
  return body;
}

/**
 * Ask for one person's rates.
 *
 * Debounced per person, because the coverage box fires on every keystroke
 * and a six-person report typed through would otherwise be dozens of calls
 * against an allowance meant for visitors.
 */
function requestPersonQuote(i){
  const person = STATE && STATE.people ? STATE.people[i] : null;
  if (!person) return;
  const body = personQuoteBody(person);
  if (!body){
    QUOTED[i] = { state: 'idle' };
    lastKey[i] = null;
    paintPerson(i);
    return;
  }
  const key = JSON.stringify(body);
  if (key === lastKey[i]){ paintPerson(i); return; }
  lastKey[i] = key;
  QUOTED[i] = { state: 'loading' };
  paintPerson(i);
  if (quoteTimer[i]) clearTimeout(quoteTimer[i]);
  const seq = (quoteSeq[i] = (quoteSeq[i] || 0) + 1);
  quoteTimer[i] = setTimeout(function(){ sendPersonQuote(i, body, seq); }, 500);
}

async function sendPersonQuote(i, body, seq){
  const endpoint = window.QB_QUOTE_ENDPOINT || '';
  if (!/^https?:\/\//i.test(endpoint)){
    QUOTED[i] = { state: 'error' }; lastKey[i] = null;
    paintPerson(i);
    return;
  }
  try {
    const res = await fetch(endpoint.replace(/\/$/, '') + '/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const json = await res.json();
    if (seq !== quoteSeq[i]) return;   // a newer request for this person is in flight
    if (!res.ok || !json.ok) throw new Error(json.error || ('HTTP ' + res.status));

    /* One mapper for both lists. The featured picks ARE quote rows, so
       shaping them differently is how a card ends up disagreeing with the
       price beside it. */
    const toRow = q => ({
      id: String(q.companyCode || q.carrierName || '').toLowerCase(),
      name: q.carrierName,
      prodResolved: q.productName,
      rating: q.amBestRating || 'NR',
      monthly: q.monthlyPremium,
      annual: q.annualPremium,
      coverage: q.faceAmount != null ? q.faceAmount : body.faceAmount,
      logo: logoFor(q.carrierName, q.logoUrl)
    });

    const quotes = (json.quotes || []).map(toRow);
    const featured = (json.featured || []).map(f => Object.assign(toRow(f), {
      bullets: Array.isArray(f.bullets) ? f.bullets : [],
      badge: typeof f.badge === 'string' ? f.badge : '',
      curated: f.curated === true
    }));
    QUOTED[i] = {
      state: quotes.length ? 'ok' : 'empty',
      quotes, featured,
      estimates: json.premiumsAreEstimates !== false
    };
  } catch (err){
    if (seq !== quoteSeq[i]) return;
    console.error('[keyperson] the quote request failed for person ' + i, err);
    QUOTED[i] = { state: 'error' };
    /* Null, so the next edit re-asks rather than reading a failed key as a
       question already answered. */
    lastKey[i] = null;
  }
  paintPerson(i);
}

/** Every person's quote, after the report is first drawn. */
function requestAllQuotes(){
  if (!STATE || !STATE.people) return;
  STATE.people.forEach((_, i) => requestPersonQuote(i));
}

/* Write one person's cards into the block that is already on the page, and
   refresh the totals, which are a sum over these. */
function paintPerson(i){
  const host = document.getElementById('quote-' + i);
  if (host) host.innerHTML = policyCards(STATE.people[i], i);
  updateTotals();
}

/* ---- Drawing it -------------------------------------------------------- */

function cheapestOf(rows){
  let best = null;
  for (const r of rows || []){
    if (typeof r.monthly !== 'number' || !isFinite(r.monthly)) continue;
    if (best === null || r.monthly < best.monthly) best = r;
  }
  return best;
}

/**
 * The carrier whose premium the report totals.
 *
 * The recommendation, not the cheapest, because that is the card the reader
 * is being pointed at — and because it is what this page has always summed.
 * Falls back to the cheapest when nobody is curated, which is the same row
 * the second card shows in that case.
 */
function billedRow(i){
  const q = QUOTED[i];
  if (!q || q.state !== 'ok') return null;
  return (q.featured && q.featured[0]) || cheapestOf(q.quotes);
}

function quoteNotice(kind, icon, html){
  return '<div class="kp-quote-note ' + kind + '"><span class="ic">' + icon + '</span><p>' + html + '</p></div>';
}

const CALL_US = '<a href="tel:8888048590">(888) 804-8590</a>';

function policyCards(person, i){
  const q = QUOTED[i] || { state: 'idle' };
  const first = esc(firstName(person));

  if (q.state === 'idle'){
    return quoteNotice('wait', '\u{1F4CB}',
      'Add ' + first + '’s age and state above and we will price this coverage with our carriers.');
  }
  if (q.state === 'loading'){
    return quoteNotice('wait', '\u{23F3}',
      'Pricing ' + fmtUSD(Math.max(0, person.coverage || 0)) + ' on ' + first
      + ' with our carriers…');
  }
  if (q.state === 'error'){
    return quoteNotice('warn', '\u{260E}\u{FE0F}',
      'We could not reach the quote service just now. Rather than show an estimate '
      + 'that might be wrong, we would rather have someone call you with real '
      + 'numbers — ' + CALL_US + '.');
  }
  const cheapest = cheapestOf(q.quotes);
  if (q.state === 'empty' || !cheapest){
    return quoteNotice('warn', '\u{260E}\u{FE0F}',
      '<b>No carrier returned an offer for ' + first + '.</b> That is a statement '
      + 'about this comparison, not about them — it prices a fixed set of '
      + 'carriers at standard underwriting, and business-owned cases often need '
      + 'a conversation about financial justification anyway: ' + CALL_US + '.');
  }

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
            <div class="best-carrier-prod">${esc(cfg.prod)} &bull; ${fmtUSD(cfg.coverage)}</div>
          </div>
          <div class="best-rating">Rating: <b>${esc(cfg.rating)}</b></div>
        </div>
        <button type="button" class="select-btn" data-qb-apply
                data-carrier-name="${esc(cfg.name)}" data-product="${esc(cfg.prod)}"
                data-coverage="${cfg.coverage}" data-premium="${cfg.monthly}"
                data-insured="${esc(cfg.insured || '')}">Apply Now</button>
      </div>
    </div>`;

  /* Both cards are rows the engine returned. There is no other source. */
  const fromRow = (r, extra) => cardHTML(Object.assign({
    monthly: r.monthly, annual: r.annual, logo: r.logo, name: r.name,
    prod: r.prodResolved, coverage: r.coverage, rating: r.rating,
    /* WHOSE CARD THIS IS. Both tools quote several people, and an
       Apply that does not say which one makes an agent guess from a
       premium. policyCards() has the person; the card carries it. */
    insured: firstName(person)
  }, extra));

  let out = fromRow(cheapest, {
    cardClass: '', badgeClass: 'affordable', badgeText: 'Most Affordable',
    mid: `<div class="trophy">\u{1F3C6} Lowest Price</div>
          <p>The most affordable way to insure the business against losing ${first}.</p>`
  });

  /*
   * The second card is the carrier in FIRST POSITION in the admin console's
   * carrier settings — rank 1, with the chip and the reasons typed against
   * it there. Two cards on this page rather than the three the other
   * calculators show, so only the first pick is used.
   *
   * When nobody is curated the engine fills the slot on price alone and says
   * so. Such a card keeps the position but loses the endorsement: no chip of
   * ours, no bullets. Borrowing another carrier's words or inventing generic
   * ones would both be lying quietly.
   */
  const pick = (q.featured && q.featured[0]) || null;
  if (pick && pick.id !== cheapest.id){
    const curated = pick.curated === true;
    const tag = String(pick.badge || '').trim();
    const bullets = Array.isArray(pick.bullets) ? pick.bullets : [];
    out += fromRow(pick, {
      cardClass: curated ? 'recommended' : 'agentless',
      badgeClass: curated ? 'recommended' : 'agentless',
      badgeText: tag || (curated ? 'Our Recommendation' : 'Another Option'),
      mid: curated && bullets.length
        ? `<ul>${bullets.map(b => `<li>${esc(b)}</li>`).join('')}</ul>`
        : ''
    });
  }

  if (q.estimates){
    out += '<div class="kp-estimate-note"><b>Illustrative estimates.</b> These premiums '
      + 'are modelled, not carrier-filed rates, and are not an offer of insurance.</div>';
  }
  return out;
}

/* ============================================================
   PER-PERSON RESULT BLOCK
   ============================================================ */
function coverageStatusHTML(person){
  const v = person.val, need = v.totalNeed, cov = Math.max(0, person.coverage||0), diff = cov - need;
  const first = esc(firstName(person));
  let out = '';
  if (v.capped){
    out += `<div class="cov-status cap"><span class="ic">🛡️</span>
      <div><b>Capped at 10× total compensation.</b> The raw model value of <b>${fmtUSD(v.raw)}</b> exceeds the insurable-interest ceiling of <b>${fmtUSD(v.maxAllowed)}</b> (10 × ${fmtUSD(v.totalComp)} total comp), so ${first}'s recommended coverage is held at <b>${fmtUSD(need)}</b>. Carriers generally won't justify key person coverage above this without extra documentation.</div></div>`;
  }
  if (Math.abs(diff) >= 1000 && need > 0){
    if (diff < 0){
      const pct = need ? Math.round(Math.abs(diff)/need*100) : 0;
      out += `<div class="cov-status under"><span class="ic">⚠️</span>
        <div><b>Insuring below the calculated value.</b> This policy covers <b>${fmtUSD(cov)}</b> — <b>${fmtUSD(Math.abs(diff))}</b> (${pct}%) less than ${first}'s <b>${fmtUSD(need)}</b> value. The shortfall would land on the business at the worst possible time.</div></div>`;
    } else {
      out += `<div class="cov-status over"><span class="ic">ℹ️</span>
        <div><b>Coverage set above the calculated value.</b> This policy covers <b>${fmtUSD(cov)}</b>, <b>${fmtUSD(diff)}</b> more than the <b>${fmtUSD(need)}</b> value — a cushion, though carriers will want financial justification for amounts well above the model.</div></div>`;
    }
  }
  return out;
}

function keBlock(person, i){
  const v = person.val;
  const need = v.totalNeed;
  const changed = Math.abs((person.coverage||0) - need) >= 1000;
  const factorNote = `${BAND_LABEL[STATE.biz.band]} employees × ${esc(person.difficulty)}`;
  return `
  <div class="ke-block" id="keb-${i}">
    <div class="ke-block-head">
      <span class="kbh-chip">${i+1}</span>
      <div>
        <div class="kbh-name">${esc(fullName(person))}</div>
        <div class="kbh-meta">
          ${esc(person.title || 'Key Employee')}${(person.ownership > 0) ? ` · Owner ${Number(person.ownership).toFixed(2)}%` : ''} · Age ${person.age} · ${esc(person.gender)}
          <span class="d-badge ${D_CLASS[person.difficulty]}"><span class="dot"></span>${esc(person.difficulty)} to replace</span>
        </div>
      </div>
      <div class="kbh-cov">
        <div class="l">Recommended Coverage</div>
        <div class="v">${fmtUSD(need)}</div>
      </div>
    </div>

    <div class="calc-card">
      <div class="calc-panel base">
        <div class="calc-panel-head"><span class="ic">🛡️</span>Base Protection</div>
        <div class="calc-line"><span class="lbl">Salary <small>+ bonus</small></span><span class="val">${fmtUSD(v.totalComp)}</span></div>
        <div class="calc-line op"><span class="lbl">× replace-difficulty factor</span><span class="val">${v.factor.toFixed(1)}×</span></div>
        <div class="calc-line"><span class="lbl">Total compensation × factor</span><span class="val">${fmtUSD(v.totalComp)} × ${v.factor.toFixed(1)}</span></div>
        <div class="calc-line total"><span class="lbl">Base Need</span><span class="val">${fmtUSD(v.baseNeed)}</span></div>
      </div>
      <div class="calc-panel addl">
        <div class="calc-panel-head"><span class="ic">＋</span>Additional Coverage</div>
        <div class="calc-line"><span class="lbl">Other comp &amp; benefits</span><span class="val">${fmtUSD(v.empBenefits)}</span></div>
        <div class="calc-line"><span class="lbl">Tied to loan ${person.tied==='Yes' ? `<small>${fmtUSDk(person.loan)} × ${person.loanPct}%</small>` : ''}</span><span class="val">${fmtUSD(v.tiedToLoan)}</span></div>
        <div class="calc-line total"><span class="lbl">Additional Need</span><span class="val">${fmtUSD(v.addlNeed)}</span></div>
      </div>
    </div>

    <div class="kbh-controls">
      <div class="kbh-ctl">
        <label>Coverage Amount</label>
        <div class="input-wrap"><span class="input-prefix">$</span>
          <input type="text" inputmode="numeric" class="cov-input ${changed?'changed':''}" id="cov-${i}" value="${(person.coverage||0).toLocaleString()}" data-qb-input="onCoverageInput" data-qb-input-args='[${i},"@el"]' data-qb-blur="onCoverageBlur" data-qb-blur-args='[${i},"@el"]'></div>
      </div>
      <div class="kbh-ctl">
        <label>Term Duration</label>
        <select id="term-${i}" data-qb-change="onTerm" data-qb-change-args='[${i},"@el"]'>
          ${liveTerms().map(t=>`<option value="${t}" ${ (person.term||DEFAULT_TERM)===t ?'selected':''}>${t}-Year Term</option>`).join('')}
        </select>
      </div>
      <button class="reset-cov" id="reset-${i}" ${changed?'':'disabled'} data-qb-click="resetCoverage" data-qb-click-args='[${i}]'>↺ Reset to value</button>
      <span class="cov-need-tag">Value: <b>${fmtUSD(need)}</b></span>
    </div>

    <div id="status-${i}">${coverageStatusHTML(person)}</div>
    <div class="best-row" id="quote-${i}">${policyCards(person, i)}</div>
  </div>`;
}

/* ---- live per-person updates ---- */
function refreshPerson(i){
  const person = STATE.people[i];
  const need = person.val.totalNeed;
  const changed = Math.abs((person.coverage||0) - need) >= 1000;
  requestPersonQuote(i);
  $('status-'+i).innerHTML = coverageStatusHTML(person);
  const inp = $('cov-'+i); if (inp) inp.classList.toggle('changed', changed);
  const rst = $('reset-'+i); if (rst) rst.disabled = !changed;
  updateTotals();
}
function onCoverageInput(i, el){ STATE.people[i].coverage = num(el.value); STATE.people[i].coverageTouched = true; refreshPerson(i); }
function onCoverageBlur(i, el){ const v = Math.max(0, num(el.value)); STATE.people[i].coverage = v; el.value = v.toLocaleString(); }
function onTerm(i, el){ STATE.people[i].term = parseInt(el.value, 10); requestPersonQuote(i); }
function resetCoverage(i){ const p = STATE.people[i]; p.coverage = p.val.totalNeed; p.coverageTouched = false; const inp = $('cov-'+i); if (inp) inp.value = (p.val.totalNeed||0).toLocaleString(); refreshPerson(i); }

/* ============================================================
   TOTALS + RENDER
   ============================================================ */
function computeTotals(){
  let totalValue = 0, totalCoverage = 0, totalAnnual = 0, priced = 0;
  STATE.people.forEach((p, i) => {
    totalValue += p.val.totalNeed;
    totalCoverage += Math.max(0, p.coverage || 0);
    /*
     * Summed from the row the reader is actually being shown -- the
     * recommendation card -- rather than recomputed here. A total that is
     * derived separately is a total that can disagree with the cards above
     * it, and this one used to be a seventh call to an invented rate table.
     *
     * People still in flight contribute nothing and are counted, so the
     * figure can say what it is a total OF rather than quietly reading as
     * the whole report.
     */
    const row = billedRow(i);
    if (row && typeof row.annual === 'number' && isFinite(row.annual)){
      totalAnnual += row.annual;
      priced += 1;
    }
  });
  const top = STATE.people.reduce((m,p)=> p.val.totalNeed>m.val.totalNeed?p:m, STATE.people[0]);
  return { totalValue, totalCoverage, totalAnnual, priced,
           count: STATE.people.length, top };
}

/* "$412/yr" once everybody is priced, "$310/yr so far (2 of 3)" while the
   rest are still coming back, and a dash before any of them have. */
function premiumLabel(t){
  /* The "/yr" lives in here rather than at the two call sites, so that the
     nothing-yet case is a bare dash and not "\u2014/yr", which reads as a
     typo rather than as an absent figure. */
  const per = '<span style="font-size:13px;font-weight:600;color:var(--gray-mid);">/yr</span>';
  if (!t.priced) return '\u2014';
  const amount = fmtUSD(t.totalAnnual) + per;
  return t.priced === t.count ? amount
    : amount + ' <span class="prem-partial">so far (' + t.priced + ' of ' + t.count + ')</span>';
}

function renderResults(){
  const b = STATE.biz;
  const t = computeTotals();

  $('resultsContent').innerHTML = `
    <div class="analysis-for">
      <span class="analysis-for-name">${esc(b.name)}</span>
      <span class="analysis-for-item"><b>${esc(b.structure)}</b></span>
      <span class="analysis-for-item">${esc(b.industry)}</span>
      <span class="analysis-for-item"><b>${esc(b.state)}</b></span>
      <span class="analysis-for-item"><b>${b.numOwners}</b> owner${b.numOwners===1?'':'s'}</span>
      <span class="analysis-for-item"><b>${b.numEmployees.toLocaleString()}</b> employees</span>
      <span class="analysis-for-item"><b>${t.count}</b> key</span>
      <button class="edit-inputs-btn" data-qb-click="editInputs">✎ Edit inputs</button>
    </div>

    <div class="headline-card">
      <div class="headline-inner">
        <div>
          <div class="headline-label">Total Key Person Coverage Need</div>
          <div class="headline-value">${fmtUSD(t.totalValue)}</div>
          <div class="headline-sub">Combined recommended coverage to protect ${esc(b.name)} against the loss of its ${t.count} key ${t.count===1?'person':'people'}.</div>
        </div>
        <div class="headline-mini">
          <div class="headline-mini-item"><div class="v">${t.count}</div><div class="l">Key People</div></div>
          <div class="headline-mini-item"><div class="v">${fmtUSDk(t.top.val.totalNeed)}</div><div class="l">Largest (${esc(firstName(t.top))})</div></div>
          <div class="headline-mini-item"><div class="v">${t.priced ? fmtUSDk(t.totalAnnual) : '\u2014'}</div><div class="l">Est. Premium/yr</div></div>
        </div>
      </div>
    </div>

    <div class="section-card">
      <h3 class="sc-title">How Key Person Insurance Works</h3>
      <p class="sc-sub">The business buys, owns, pays for, and is the beneficiary of a life insurance policy on each key person. If that person is lost, the company — not the family — receives the proceeds to stay afloat.</p>
      <button type="button" class="diagram-toggle" id="diagramToggle" aria-expanded="false" data-qb-click="toggleDiagram"><span class="chev">▼</span> Show diagram</button>
      <div class="diagram-collapse" id="diagramCollapse"><div class="diagram-wrap">${diagramSVG()}</div></div>
      ${lifecycleHTML()}
    </div>

    <div class="section-card">
      <h3 class="sc-title">Coverage Needed for Each Key Person</h3>
      <p class="sc-sub">Each person's value combines a <b>base protection</b> figure (total compensation multiplied by how hard they are to replace) and <b>additional coverage</b> for benefits and any loans they guarantee — capped at 10× total compensation. Adjust the coverage amount or term per person; quotes update instantly.</p>
      <div id="keBlocks">${STATE.people.map((p,i)=>keBlock(p,i)).join('')}</div>
    </div>

    <div class="section-card">
      <h3 class="sc-title">Funding Summary</h3>
      <p class="sc-sub">Across all key people, based on the coverage amounts and terms set above.</p>
      <div class="totals-strip">
        <div class="total-box"><div class="l">Total Calculated Value</div><div class="v">${fmtUSD(t.totalValue)}</div></div>
        <div class="total-box"><div class="l">Total Coverage Applied</div><div class="v accent" id="tot-cov">${fmtUSD(t.totalCoverage)}</div></div>
        <div class="total-box"><div class="l">Est. Combined Premium</div><div class="v gold" id="tot-prem">${premiumLabel(t)}</div></div>
        <div class="total-box"><div class="l">Policies</div><div class="v">${t.count}</div></div>
      </div>

      <div class="insight-box blue" style="margin-top:18px;">
        <span class="insight-icon">🧾</span>
        <div class="insight-text">
          <h4>Keep the death benefit tax-free (IRC §101(j))</h4>
          <p>For employer-owned life insurance, the death benefit is income-tax-free only if the business meets the <b>notice-and-consent</b> requirements <b>before</b> the policy is issued and files <b>Form 8925</b> with its return each year. Skipping these steps can make the proceeds taxable. Your agent and CPA will handle the paperwork — it's straightforward when done up front.</p>
        </div>
      </div>
      <div class="insight-box gold">
        <span class="insight-icon">💡</span>
        <div class="insight-text">
          <h4>Why size it this way?</h4>
          <p>Carriers require a reasonable <b>financial justification</b> for key person coverage. Tying the amount to compensation, replacement difficulty, benefits, and guaranteed debt — and capping it at 10× total compensation — produces a number underwriters recognize, so the application moves smoothly.</p>
        </div>
      </div>
    </div>

    <div class="disclaimer">
      <b>Important:</b> This tool provides educational illustrations only and is not legal, tax, accounting, or investment advice, the quote is showing real values and you can apply for this coverage. After you apply, our Client Solutions Advisors will connect with you to finalize your application. The key person value is produced by a simplified proprietary model from the figures you entered; actual insurable amounts are subject to carrier financial-underwriting limits.  Employer-owned life insurance is governed by IRC §101(j); coordinate notice-and-consent and Form 8925 with your CPA and attorney. QB Insurance LLC (dba Quote-Bot) is a licensed insurance agency.
    </div>
  `;
}

function updateTotals(){
  if (!STATE) return;
  const t = computeTotals();
  const cov = $('tot-cov'); if (cov) cov.textContent = fmtUSD(t.totalCoverage);
  const prem = $('tot-prem'); if (prem) prem.innerHTML = premiumLabel(t);
}

/* ============================================================
   INIT
   ============================================================ */
function populateSelect(sel, items, selected, placeholder){
  /* Unchosen on arrival when a placeholder is given, so the list does not
     fall to its first entry and answer on the visitor's behalf. */
  if (placeholder){ const ph = document.createElement('option');
    ph.value = ''; ph.textContent = placeholder; ph.selected = true;
    sel.appendChild(ph); }
  items.forEach(it => { const o = document.createElement('option'); o.value = it; o.textContent = it; if (it===selected) o.selected = true; sel.appendChild(o); });
}

function resetDefaults(){
  $('firstName').value = ''; $('lastName').value = ''; $('title').value = ''; $('email').value = ''; $('phone').value = '';
  ['firstName','lastName','title','email','phone'].forEach(id => $('f-'+id).classList.remove('has-error'));
  $('bizName').value = 'ABC Inc';
  $('bizStructure').value = 'S-Corporation';
  $('bizState').value = 'CO';
  $('industry').value = INDUSTRIES[1];
  $('numOwners').value = '3';
  $('numEmployees').value = '50';
  $('numKeyEmployees').value = '3';
  updateBandTag();
  keData = [];
  buildKeCards();
  editInputs();
}

document.addEventListener('DOMContentLoaded', () => {
  populateSelect($('bizState'), STATES, null, 'Select a state');
  populateSelect($('industry'), INDUSTRIES, null, 'Select an industry');
  buildKeCards();
  updateBandTag();

  $('numKeyEmployees').addEventListener('change', buildKeCards);
  $('numEmployees').addEventListener('input', updateBandTag);
  window.addEventListener('resize', applyKesHeight);
  ['firstName','lastName','title','email','phone'].forEach(id =>
    $(id).addEventListener('input', () => $('f-'+id).classList.remove('has-error')));
  $('phone').addEventListener('input', e => { e.target.value = formatUSPhone(e.target.value); });

  // custom tooltip (document-level so the scrollable list can't clip it)
  const tip = document.createElement('div');
  tip.id = 'tipBubble';
  document.body.appendChild(tip);
  function showTip(el){
    const text = el.getAttribute('data-tip'); if (!text) return;
    tip.textContent = text; tip.classList.add('show');
    const r = el.getBoundingClientRect();
    const bw = tip.offsetWidth, bh = tip.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
    let left = r.left; if (left + bw > vw - 8) left = vw - 8 - bw; if (left < 8) left = 8;
    let top = r.bottom + 8; if (top + bh > vh - 8) top = r.top - bh - 8;
    tip.style.left = left + 'px'; tip.style.top = top + 'px';
    const ax = Math.max(8, Math.min(bw - 16, r.left + r.width/2 - left - 6));
    tip.style.setProperty('--ax', ax + 'px');
  }
  function hideTip(){ tip.classList.remove('show'); }
  document.addEventListener('mouseover', e => { const m = e.target.closest && e.target.closest('.tip-mark'); if (m) showTip(m); });
  document.addEventListener('mouseout',  e => { const m = e.target.closest && e.target.closest('.tip-mark'); if (m) hideTip(); });
  document.addEventListener('focusin',   e => { const m = e.target.closest && e.target.closest('.tip-mark'); if (m) showTip(m); });
  document.addEventListener('focusout',  e => { const m = e.target.closest && e.target.closest('.tip-mark'); if (m) hideTip(); });
  document.addEventListener('click',     e => { const m = e.target.closest && e.target.closest('.tip-mark'); if (m) { tip.classList.contains('show') ? hideTip() : showTip(m); } else hideTip(); });
});

/* The markup names actions rather than carrying onclick attributes, which a
   Content-Security-Policy without 'unsafe-inline' blocks wherever they came
   from -- including markup this script builds itself. Only what is listed
   here can be reached from an attribute. */
window.qbActions.register({ calculate: calculate, editInputs: editInputs, onCoverageBlur: onCoverageBlur, onCoverageInput: onCoverageInput, onTerm: onTerm, pickDiff: pickDiff, resetCoverage: resetCoverage, resetDefaults: resetDefaults, toggleDiagram: toggleDiagram, toggleLoan: toggleLoan });
