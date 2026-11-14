/*
 * crosspurchasebuysellcalculator.html's own script, which used to sit inline in the page.
 *
 * It had to move: a Content-Security-Policy without 'unsafe-inline' blocks an
 * inline <script>, so inline this page would have gone dead the moment the
 * policy went on -- quietly, with the markup looking perfectly correct.
 *
 * Moved verbatim.
 */
/* ============================================================
   INDUSTRY MULTIPLES (mid-of-range EBITDA multiples, lower / lower-mid market)
   ============================================================ */
const INDUSTRIES = [
  { id:'prof',     name:'Professional Services (legal, accounting, consulting)', base:4.0 },
  { id:'saas',     name:'Software / SaaS',                base:6.0 },
  { id:'tech',     name:'Technology / IT Services',       base:5.5 },
  { id:'health',   name:'Healthcare Services',            base:5.0 },
  { id:'mfg',      name:'Manufacturing',                  base:5.0 },
  { id:'wholesale',name:'Wholesale / Distribution',       base:4.0 },
  { id:'media',    name:'Marketing / Media Agency',       base:5.0 },
  { id:'financial',name:'Financial Services',             base:6.0 },
  { id:'realestate',name:'Real Estate Services',          base:4.0 },
  { id:'agri',     name:'Agriculture',                    base:4.0 },
  { id:'transport',name:'Transportation / Logistics',     base:3.5 },
  { id:'construct',name:'Construction / Contractors',     base:3.5 },
  { id:'retail',   name:'Retail',                         base:3.0 },
  { id:'auto',     name:'Auto Services / Repair',         base:3.0 },
  { id:'restaurant',name:'Restaurant / Food Service',     base:2.75 },
  { id:'consumer', name:'Consumer / Personal Services',   base:2.75 },
  { id:'other',    name:'Other / General Business',       base:3.5 },
];
const TANGIBLE_RATE = 0.09; // fair return on net tangible assets (Rev. Rul. 68-609 style)

/* ============================================================
   RATE ENGINE  (shared Quote-Bot model)
   ============================================================ */
/* The underwriting classes the quote engine accepts. Sent as healthClass,
   so these strings must stay the ones Compulife are asked for. */

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

// format digits into a US phone number: (XXX) XXX-XXXX
function formatUSPhone(v){
  let d = String(v).replace(/\D/g,'');
  if (d.length === 11 && d[0] === '1') d = d.slice(1);
  d = d.slice(0,10);
  if (d.length === 0) return '';
  if (d.length < 4) return '(' + d;
  if (d.length < 7) return '(' + d.slice(0,3) + ') ' + d.slice(3);
  return '(' + d.slice(0,3) + ') ' + d.slice(3,6) + '-' + d.slice(6);
}

/* attach thousands formatting to money fields */
function fmtMoneyInput(el){
  el.addEventListener('input', () => {
    const caretEnd = el.selectionStart === el.value.length;
    const v = num(el.value);
    el.value = v ? v.toLocaleString() : '';
    if (caretEnd) el.setSelectionRange(el.value.length, el.value.length);
  });
}

/* ============================================================
   PARTNER INPUT CARDS
   ============================================================ */
const UW_OPTIONS = ['Preferred Plus','Preferred','Standard Plus','Standard','Substandard'];
const US_STATES = [
  ['AL','Alabama'],['AK','Alaska'],['AZ','Arizona'],['AR','Arkansas'],['CA','California'],
  ['CO','Colorado'],['CT','Connecticut'],['DE','Delaware'],['DC','District of Columbia'],['FL','Florida'],
  ['GA','Georgia'],['HI','Hawaii'],['ID','Idaho'],['IL','Illinois'],['IN','Indiana'],
  ['IA','Iowa'],['KS','Kansas'],['KY','Kentucky'],['LA','Louisiana'],['ME','Maine'],
  ['MD','Maryland'],['MA','Massachusetts'],['MI','Michigan'],['MN','Minnesota'],['MS','Mississippi'],
  ['MO','Missouri'],['MT','Montana'],['NE','Nebraska'],['NV','Nevada'],['NH','New Hampshire'],
  ['NJ','New Jersey'],['NM','New Mexico'],['NY','New York'],['NC','North Carolina'],['ND','North Dakota'],
  ['OH','Ohio'],['OK','Oklahoma'],['OR','Oregon'],['PA','Pennsylvania'],['RI','Rhode Island'],
  ['SC','South Carolina'],['SD','South Dakota'],['TN','Tennessee'],['TX','Texas'],['UT','Utah'],
  ['VT','Vermont'],['VA','Virginia'],['WA','Washington'],['WV','West Virginia'],['WI','Wisconsin'],['WY','Wyoming']
];
let partnerData = []; // {name, pct, dob, age, gender, uw, email, phone, state}

const TODAY = new Date().toISOString().slice(0,10);
function computeAge(dobStr){
  if (!dobStr) return 0;
  const d = new Date(dobStr), n = new Date();
  if (isNaN(d)) return 0;
  let a = n.getFullYear() - d.getFullYear();
  const m = n.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && n.getDate() < d.getDate())) a--;
  return a;
}
function ageLabel(dobStr){ const a = computeAge(dobStr); return a > 0 ? String(a) : '—'; }

/**
 * One blank owner, carrying every field renderPartners reads.
 *
 * It was six copies of the same object. One is enough, and spreading it
 * UNDER whatever buildPartners already has means a field added to the card
 * and forgotten here is a blank input rather than an exception -- which is
 * exactly what the equivalent drift did to the key person calculator, where
 * the blanked shape was ten fields short and every render threw.
 *
 * `uw` is the honest middle rather than the flattering end. Blank matched no
 * option, so the browser selected the first in the list and every untouched
 * owner was quoted Preferred Plus: the cheapest class, which is the wrong
 * direction to be wrong about a premium.
 */
const BLANK_PARTNER = {
  name: '', pct: 0, dob: '', gender: 'Male', uw: 'Standard',
  tobacco: 'Non-Tobacco', email: '', phone: '', state: '',
};

function buildPartners(){
  /* `|| 2` rather than a bare parseInt. An unchosen select gave NaN, the
     loop never ran, and the owners disappeared from the one calculator whose
     subject is what happens between them. */
  const n = parseInt($('numPartners').value, 10) || 2;
  // read current values so we keep edits when count changes
  const existing = readPartnerInputs();
  partnerData = [];
  for (let i=0;i<n;i++){
    /* Spread over the blank, not instead of it. */
    partnerData.push({ ...BLANK_PARTNER, ...(existing[i] || {}) });
  }
  // if a fresh build (no existing), distribute even ownership for 2 defaults only
  if (existing.length === 0 && n === 2){
    partnerData[0].pct = 50; partnerData[1].pct = 50;
  }
  renderPartners();
}

function readPartnerInputs(){
  const cards = document.querySelectorAll('#partnersWrap .partner-card');
  const arr = [];
  cards.forEach((c,i) => {
    arr.push({
      name:   c.querySelector('.p-name').value,
      pct:    num(c.querySelector('.p-pct').value),
      dob:    c.querySelector('.p-dob').value,
      age:    computeAge(c.querySelector('.p-dob').value),
      gender: c.querySelector('.p-gender').value,
      uw:     c.querySelector('.p-uw').value,
      tobacco: c.querySelector('.p-tob') ? c.querySelector('.p-tob').value : 'Non-Tobacco',
      email:  c.querySelector('.p-email').value,
      phone:  c.querySelector('.p-phone').value,
      state:  c.querySelector('.p-state').value,
    });
  });
  return arr;
}

function renderPartners(){
  const wrap = $('partnersWrap');
  wrap.innerHTML = partnerData.map((p,i) => `
    <div class="partner-card">
      <div class="partner-card-head">
        <span class="partner-chip">${i+1}</span>
        <span class="lbl">Partner ${i+1}</span>
        <span class="tip-mark" tabindex="0" data-tip="Please enter the real name of each partner to properly utilize our automations.">i</span>
      </div>
      <div class="field">
        <label>Name</label>
        <input type="text" class="p-name" value="${esc(p.name)}" placeholder="Partner name">
      </div>
      <div class="field">
        <label>Email</label>
        <input type="email" class="p-email" value="${esc(p.email||'')}" placeholder="partner@company.com" autocomplete="off">
      </div>
      <div class="partner-mini-row">
        <div class="field">
          <label>Phone</label>
          <input type="tel" class="p-phone" value="${esc(p.phone||'')}" placeholder="(555) 123-4567" autocomplete="off">
        </div>
        <div class="field">
          <label>State</label>
          <select class="p-state">
            <option value="" ${!p.state?'selected':''}>Select…</option>
            ${US_STATES.map(s=>`<option value="${s[0]}" ${p.state===s[0]?'selected':''}>${s[1]}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="partner-mini-row">
        <div class="field">
          <label>Ownership %</label>
          <div class="input-wrap"><input type="number" class="p-pct" value="${p.pct}" min="0" max="100" step="1"></div>
        </div>
        <div class="field">
          <label>D.O.B.<span class="age-pill p-agepill">${ageLabel(p.dob)}</span></label>
          <input type="date" class="p-dob" value="${p.dob||''}" max="${TODAY}" data-qb-input="updateDobAge" data-qb-input-args='["@el"]'>
        </div>
      </div>
      <div class="partner-mini-row">
        <div class="field">
          <label>Gender</label>
          <select class="p-gender">
            <option ${p.gender==='Male'?'selected':''}>Male</option>
            <option ${p.gender==='Female'?'selected':''}>Female</option>
          </select>
        </div>
        <div class="field">
          <label>Health / UW</label>
          <select class="p-uw">
            ${UW_OPTIONS.map(o=>`<option ${p.uw===o?'selected':''}>${o}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="partner-mini-row">
        <!-- Asked because the rate cannot be right without it. Tobacco is the
             single largest factor in a term premium, and a page that does not
             ask quietly prices every smoker as a non-smoker. -->
        <div class="field">
          <label>Tobacco</label>
          <select class="p-tob">
            ${['Non-Tobacco','Tobacco'].map(o=>`<option ${p.tobacco===o?'selected':''}>${o}</option>`).join('')}
          </select>
        </div>
      </div>
    </div>
  `).join('');
  wrap.querySelectorAll('.p-pct').forEach(el => el.addEventListener('input', updateOwnershipTotal));
  updateOwnershipTotal();
}

function updateDobAge(el){
  const card = el.closest('.partner-card');
  const pill = card && card.querySelector('.p-agepill');
  if (pill) pill.textContent = ageLabel(el.value);
}

function updateOwnershipTotal(){
  const total = readPartnerInputs().reduce((s,p)=>s+p.pct,0);
  const box = $('ownershipTotal');
  $('ownPctText').textContent = total + '%';
  const ok = Math.abs(total - 100) < 0.5;
  box.className = 'ownership-total ' + (ok ? 'ok' : 'bad');
  box.querySelector('span:first-child').textContent = ok ? '✓ Total Ownership' : 'Must total 100% — currently';
  /*
   * The button is NOT disabled here any more, and that is the fix.
   *
   * A disabled control cannot be clicked, so it cannot explain itself. This
   * box says exactly what is wrong, but it sits under the owner cards while
   * the button is far below it past the financials and the contact block —
   * so the visitor pressed a dead button and nothing at the place they were
   * looking said why. calculate() checks the same condition and brings them
   * here instead.
   */
}

/* Send the visitor to the thing that needs fixing, and make it catch the
   eye when they arrive. Same job the red field borders do for the contact
   block, for a total that lives too far from the button. */
function flashOwnership(){
  const box = $('ownershipTotal');
  if (!box) return;
  box.scrollIntoView({ behavior: 'smooth', block: 'center' });
  box.classList.remove('flash');
  void box.offsetWidth;          // restart the animation if it is still running
  box.classList.add('flash');
}

/* ============================================================
   MULTIPLE SUGGESTION
   ============================================================ */
let multipleTouched = false;
function suggestMultiple(){
  const ind = INDUSTRIES.find(x => x.id === $('industry').value) || INDUSTRIES[0];
  const ebitda = num($('ebitda').value);
  let adj = 0;
  if (ebitda < 250000) adj = -0.5;
  else if (ebitda < 1000000) adj = 0;
  else if (ebitda < 5000000) adj = 0.5;
  else adj = 1.0;
  let m = Math.max(1.5, Math.min(9, ind.base + adj));
  m = Math.round(m*4)/4; // nearest 0.25
  $('multTip').textContent = 'suggested ' + m.toFixed(2).replace(/\.?0+$/,'') + '×';
  if (!multipleTouched) $('multiple').value = m;
}

/* ============================================================
   VALUATION
   ============================================================ */
function computeValuation(){
  const ebitda = num($('ebitda').value);
  const ownerEstimate = num($('ownerEstimate').value);
  const assets = num($('assets').value);
  const liabilities = num($('liabilities').value);
  const multiple = num($('multiple').value);
  const discount = num($('discountRate').value)/100;
  const growth = Math.min(0.06, num($('growthRate').value)/100);

  const bookValue = assets - liabilities;
  const capRate = Math.max(0.05, discount - growth);

  const ebitdaMultiple = ebitda * multiple;
  const capEarnings = ebitda / capRate;

  // Excess-earnings (Cap of Earnings + Book Value)
  const bvPos = Math.max(0, bookValue);
  const returnOnTangibles = bvPos * TANGIBLE_RATE;
  const excessEarnings = ebitda - returnOnTangibles;
  const goodwill = Math.max(0, excessEarnings) / capRate;
  const capPlusBook = bvPos + goodwill;

  // Recommended = blend of the three calculated valuation engines
  const recommended = (ebitdaMultiple + capEarnings + capPlusBook) / 3;

  return {
    ebitda, multiple, capRate, discount, growth, bookValue, goodwill,
    methods: {
      est:     { key:'est',     label:"What You Think It's Worth",        val: ownerEstimate, color:'var(--v-est)' },
      mult:    { key:'mult',    label:`EBITDA × Multiple (${multiple}×)`,  val: ebitdaMultiple, color:'var(--v-mult)' },
      book:    { key:'book',    label:'Book Value',                       val: bookValue,     color:'var(--v-book)' },
      cap:     { key:'cap',     label:'Capitalization of Earnings',       val: capEarnings,   color:'var(--v-cap)' },
      capbook: { key:'capbook', label:'Cap. of Earnings + Book Value',    val: capPlusBook,   color:'var(--v-capbook)' },
    },
    recommended,
  };
}

/* ============================================================
   STATE
   ============================================================ */
let STATE = null;        // { biz, partners, valuation }
let fundingBasis = 'recommended';
const DEFAULT_TERM = 10;

function fundingValue(){
  if (!STATE) return 0;
  if (fundingBasis === 'recommended') return STATE.valuation.recommended;
  return STATE.valuation.methods[fundingBasis].val;
}
function fundingLabel(){
  if (fundingBasis === 'recommended') return 'Recommended (blended)';
  return STATE.valuation.methods[fundingBasis].label;
}
const policyKey = (i,j) => i + '-' + j;
// face amount the buyer should own on the insured = insured's buy-out × buyer's share of the survivors
function policyNeed(buyerIdx, insuredIdx){
  const ps = STATE.partners, buyer = ps[buyerIdx], insured = ps[insuredIdx];
  const insuredBuyout = fundingValue() * (insured.pct/100);
  const denom = 100 - insured.pct;                       // surviving owners' combined %
  const share = denom > 0.0001 ? (buyer.pct/denom) : (1/(ps.length-1)); // fallback: equal split
  return Math.max(0, Math.round(insuredBuyout * share / 1000) * 1000);
}
function buildPolicies(){
  const ps = STATE.partners;
  const pol = {};
  for (let i=0;i<ps.length;i++){
    for (let j=0;j<ps.length;j++){
      if (i === j) continue;
      const need = policyNeed(i, j);
      pol[policyKey(i,j)] = { buyerIdx:i, insuredIdx:j, need, coverage:need, coverageTouched:false, term:DEFAULT_TERM };
    }
  }
  return pol;
}
// recompute each policy's need; keep coverage in sync unless the user overrode it
function recalcNeeds(){
  Object.values(STATE.policies).forEach(p => {
    p.need = policyNeed(p.buyerIdx, p.insuredIdx);
    if (!p.coverageTouched) p.coverage = p.need;
  });
}

/* ============================================================
   CONTACT VALIDATION (gate)
   ============================================================ */
function validateContact(){
  let ok = true;
  const set = (id, valid) => {
    const f = $('f-'+id);
    if (f) f.classList.toggle('has-error', !valid);
    if (!valid) ok = false;
  };
  set('firstName', $('firstName').value.trim().length > 0);
  set('lastName',  $('lastName').value.trim().length > 0);
  set('title',     $('title').value.trim().length > 0);
  set('email',     /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test($('email').value.trim()));
  set('phone',     $('phone').value.replace(/\D/g,'').length >= 10);
  return ok;
}

/* ============================================================
   CALCULATE
   ============================================================ */
/* ---- Quote Bot lead capture ------------------------------------------ */
function qbCaptureLead(){
  if (!window.QuoteBot) return;
  try {
    var V = function(id){ var e=document.getElementById(id); return e ? String(e.value).trim() : ""; };
    var N = function(id){ var e=document.getElementById(id); return e ? (parseFloat(String(e.value).replace(/[^0-9.\-]/g,""))||0) : null; };
    var C = function(sel){ var e=document.querySelector(sel); return e ? e.textContent.replace(/\s+/g," ").trim() : null; };
    if (!V('email')) return;
    window.QuoteBot.capture({
      email: V('email'), phone: V('phone'),
      firstName: V('firstName'), lastName: V('lastName'),
      productLine: 'TERM_LIFE',
      inputs: {
        arrangementType: 'BUY_SELL_CROSS_PURCHASE',
        businessName: V('bizName'), businessState: V('bizState'),
        businessStructure: V('bizStructure'), industry: V('industry'),
        numOwners: N('numOwners'), numEmployees: N('numEmployees')
      },
      results: { totalCoverage: N('tot-cov'), totalPremium: N('tot-prem') },
      consentText: C('#qb-consent')
    });
  } catch (e) { /* capture must never break the calculator */ }
}

function calculate(){
  // required contact fields must be valid before results are shown
  if (!validateContact()){
    const firstErr = document.querySelector('.field.has-error input');
    if (firstErr){ firstErr.scrollIntoView({behavior:'smooth', block:'center'}); firstErr.focus(); }
    return;
  }
  const partners = readPartnerInputs();
  /*
   * No owners at all. Cannot happen now — buildPartners floors at two — but
   * this is the exact shape of the bug that shipped: the cards stopped
   * rendering, ownership totalled 0%, and the page refused with a message
   * about a total nobody could see anything to set. A named refusal beats
   * an empty report if it ever comes back.
   */
  if (partners.length < 2){
    buildPartners();
    flashOwnership();
    return;
  }
  const total = partners.reduce((s,p)=>s+p.pct,0);
  if (Math.abs(total - 100) >= 0.5){ updateOwnershipTotal(); flashOwnership(); return; }

  STATE = {
    contact: {
      firstName: $('firstName').value.trim(),
      lastName:  $('lastName').value.trim(),
      title:     $('title').value.trim(),
      email:     $('email').value.trim(),
      phone:     $('phone').value.trim(),
    },
    biz: {
      name: $('bizName').value || 'Your Business',
      structure: $('bizStructure').value,
      industry: (INDUSTRIES.find(x=>x.id===$('industry').value)||INDUSTRIES[0]).name,
    },
    partners,
    valuation: computeValuation(),
  };
  fundingBasis = 'recommended';
  // build the cross-purchase policy matrix (each buyer owns one policy per other partner)
  STATE.policies = buildPolicies();
  /* Fresh report: nothing carries over from the last one. */
  QUOTE_BY_KEY = new Map(); ROW_KEY = {}; quoteQueue = []; seqByKey = new Map();
  renderResults();
  /* After the rows exist, so each staggered reply has somewhere to land. */
  requestAllPolicyQuotes();
  /*
   * Capture AFTER the state it describes exists.
   *
   * This used to be the first thing calculate() did, before the ownership
   * check and before STATE was rebuilt — so a refused submission still
   * fired it, and it read whatever STATE the previous run had left behind.
   * Deferred rather than inline so it never delays the render.
   */
  setTimeout(qbCaptureLead, 0);
  $('calcGrid').classList.add('results-mode');
  document.body.classList.add('results-active');
  $('emptyState').style.display = 'none';
  $('resultsContent').classList.add('show');
  window.scrollTo({ top: 0, behavior:'smooth' });
}

function editInputs(){
  $('calcGrid').classList.remove('results-mode');
  document.body.classList.remove('results-active');
}

/* ============================================================
   DIAGRAM
   ============================================================ */
function diagramSVG(){
  const biz = STATE.biz.name;
  const ps = STATE.partners;
  const N = ps.length;
  const cx = 380, cy = 215, R = (N === 2) ? 150 : 140;
  const nodeW = 134, nodeH = 54;
  const base = (N === 2) ? 180 : -90;   // 2 owners sit left/right; 3+ start at top
  const pos = ps.map((p, i) => {
    const ang = (base + i * 360 / N) * Math.PI / 180;
    return { x: cx + R * Math.cos(ang), y: cy + R * Math.sin(ang), p, i };
  });

  // policy web: a two-headed connector between every pair of owners (drawn behind nodes)
  let links = '';
  for (let a = 0; a < N; a++) for (let b = a + 1; b < N; b++) {
    links += `<line x1="${pos[a].x.toFixed(1)}" y1="${pos[a].y.toFixed(1)}" x2="${pos[b].x.toFixed(1)}" y2="${pos[b].y.toFixed(1)}" stroke="#4a90d9" stroke-width="2" opacity="0.55" marker-start="url(#dot)" marker-end="url(#dot)"/>`;
  }

  // owner nodes on top
  let nodes = '';
  pos.forEach((n, i) => {
    const first = esc((n.p.name || ('Owner ' + (i+1))).split(' ')[0]).slice(0, 12);
    const rx = (n.x - nodeW/2).toFixed(1), ry = (n.y - nodeH/2).toFixed(1);
    nodes += `
      <rect x="${rx}" y="${ry}" width="${nodeW}" height="${nodeH}" rx="13" fill="#1a3d6b" stroke="#fff" stroke-width="2.5"/>
      <text x="${n.x.toFixed(1)}" y="${(n.y-3).toFixed(1)}" text-anchor="middle" fill="#fff" font-size="16" font-weight="700" font-family="'Fraunces',serif">${first}</text>
      <text x="${n.x.toFixed(1)}" y="${(n.y+15).toFixed(1)}" text-anchor="middle" fill="#93c5fd" font-size="12" font-weight="700">${n.p.pct}% owner</text>`;
  });
  const centerLabel = (N >= 3)
    ? `<text x="380" y="210" text-anchor="middle" fill="#aebacd" font-size="12" font-weight="700">each line =</text>
       <text x="380" y="226" text-anchor="middle" fill="#aebacd" font-size="12" font-weight="700">one mutual policy</text>`
    : '';
  const policies = N * (N - 1);

  return `
  <svg class="diagram-svg" viewBox="0 0 760 432" xmlns="http://www.w3.org/2000/svg" font-family="'Plus Jakarta Sans',sans-serif">
    <defs>
      <marker id="dot" viewBox="0 0 6 6" refX="3" refY="3" markerWidth="5" markerHeight="5"><circle cx="3" cy="3" r="3" fill="#4a90d9"/></marker>
    </defs>
    <text x="380" y="26" text-anchor="middle" fill="#8a9ab5" font-size="13" font-weight="700">${esc(biz).slice(0,30).toUpperCase()} — WHO INSURES WHOM</text>
    ${links}
    ${centerLabel}
    ${nodes}
    <text x="380" y="412" text-anchor="middle" fill="#5a6b85" font-size="13.5" font-weight="700">Each owner owns a policy on every other owner — ${N} owners, ${policies} policies.</text>
  </svg>`;
}

// "what happens at a death" — responsive HTML so the text never shrinks on mobile
function lifecycleHTML(){
  const steps = [
    { c:'red',   t:'<b>An owner passes away.</b>' },
    { c:'green', t:"That owner's policies pay the <b>surviving owners</b> — income-tax-free." },
    { c:'navy',  t:"Survivors <b>buy the deceased's shares</b> from the family at the agreed price." },
    { c:'teal',  t:"The family is paid in cash and the <b>survivors' cost basis steps up</b>." },
  ];
  return `
    <div class="lifecycle-head">What happens when an owner dies</div>
    <div class="lifecycle">
      ${steps.map((s,i)=>`<div class="life-step ${s.c}"><span class="life-num">${i+1}</span><p>${s.t}</p></div>`).join('')}
    </div>`;
}

function diagramLegend(){
  const items = [
    ['Each owner <b>personally owns a policy on every other owner</b> and is the policy\u2019s beneficiary.'],
    ['Each owner <b>pays the premiums</b> on the policies they own, directly to the carrier.'],
    ['At an owner\u2019s death, the carrier pays the <b>income-tax-free death benefit to the surviving owners</b>.'],
    ['The survivors use that cash to <b>buy the deceased\u2019s share from the family</b> at the agreed value.'],
    ['The family gets liquidity and the <b>survivors\u2019 cost basis steps up</b> to the price they paid.'],
  ];
  return `<div class="diagram-legend">${items.map((t,i)=>`<div class="legend-item"><span class="legend-num">${i+1}</span><span>${t}</span></div>`).join('')}</div>`;
}

/* ============================================================
   VALUATION CHART
   ============================================================ */
function valuationChart(){
  const m = STATE.valuation.methods;
  const order = ['est','mult','book','cap','capbook'];
  const vals = order.map(k => Math.max(0, m[k].val));
  const max = Math.max(...vals, STATE.valuation.recommended, 1);
  const basisKey = fundingBasis === 'recommended' ? null : fundingBasis;
  const rows = order.map(k => {
    const mm = m[k];
    const w = Math.max(0, mm.val) / max * 100;
    const isBasis = basisKey === k;
    return `<div class="vbar-row ${isBasis?'is-basis':''}">
      <div class="vbar-label"><span class="dot" style="background:${mm.color}"></span>${esc(mm.label)} ${isBasis?'<span class="basis-badge">★ Used to size coverage</span>':''}</div>
      <div class="vbar-track"><div class="vbar-fill" style="width:${w}%;background:${mm.color}"></div></div>
      <div class="vbar-val">${fmtUSD(mm.val)}</div>
    </div>`;
  }).join('');
  // recommended reference row
  const recW = STATE.valuation.recommended / max * 100;
  const recBasis = fundingBasis === 'recommended';
  const recRow = `<div class="vbar-row ${recBasis?'is-basis':''}" style="background:rgba(74,144,217,.05);border-radius:8px;">
      <div class="vbar-label"><span class="dot" style="background:linear-gradient(135deg,#4a90d9,#1a3d6b)"></span><b>Recommended (blended)</b> ${recBasis?'<span class="basis-badge">★ Used to size coverage</span>':''}</div>
      <div class="vbar-track"><div class="vbar-fill" style="width:${recW}%;background:linear-gradient(90deg,#4a90d9,#1a3d6b)"></div></div>
      <div class="vbar-val">${fmtUSD(STATE.valuation.recommended)}</div>
    </div>`;
  return rows + recRow;
}

function methodDetailHTML(){
  const v = STATE.valuation;
  return `
  <dl>
    <div><dt>What You Think It's Worth</dt><dd>Your own estimate of fair market value — useful as a sanity check against the calculated methods.</dd></div>
    <div><dt>EBITDA × Multiple</dt><dd><code>EBITDA × ${v.multiple}×</code>. The multiple is suggested from your industry and earnings size and can be overridden. This is the most commonly cited figure in buy-sell agreements.</dd></div>
    <div><dt>Book Value</dt><dd><code>Assets − Liabilities</code>. The net equity on the balance sheet. Often a floor, not fair value, since it ignores goodwill and earning power.</dd></div>
    <div><dt>Capitalization of Earnings</dt><dd><code>EBITDA ÷ cap rate</code>, where cap rate = discount (${(v.discount*100).toFixed(1)}%) − growth (${(v.growth*100).toFixed(1)}%) = <code>${(v.capRate*100).toFixed(1)}%</code>. Treats earnings as a perpetuity growing at the long-term rate.</dd></div>
    <div><dt>Cap. of Earnings + Book Value</dt><dd>Excess-earnings method (Rev. Rul. 68-609 style): a fair ${(TANGIBLE_RATE*100)}% return is credited to tangible book assets, the remaining "excess" earnings are capitalized into goodwill of ${fmtUSD(v.goodwill)}, and goodwill is added back to book value.</dd></div>
    <div><dt>Recommended (blended)</dt><dd>The simple average of the three calculated engines (EBITDA × Multiple, Capitalization of Earnings, and Cap. + Book). A balanced default for sizing coverage; switch the funding basis above to use any single method.</dd></div>
  </dl>`;
}

/* ============================================================
   POLICIES — real rates, one request per distinct quote

   Same POST /quote contract the quote tool, D.I.M.E. and the key person
   calculator use. What stood here was a table of per-$1,000 factors with
   Cincinnati written into the layout: the second card was
   `QUOTES.find(x => x.id === 'cinci')` whatever the insured's age or
   health, with a `|| sorted[1]` that quietly put somebody else in the card
   still labelled as our pick.

   Two cards per policy: the cheapest, and the carrier in FIRST POSITION in
   the admin console's carrier settings, wearing its own chip.

   WHAT IS DIFFERENT HERE, and it is the whole design of this file:

   n owners means n x (n-1) POLICIES -- six owners is thirty rows. It does
   not mean thirty quotes. A premium depends on the life being insured, the
   face amount and the term; it does not depend on which co-owner writes the
   cheque. So the rows are collapsed onto the distinct REQUESTS behind them,
   and with the equal ownership most agreements use, six owners is six
   requests rather than thirty.

   Uneven ownership is the case that costs more: two buyers with different
   shares need different face amounts on the same life, which is genuinely
   two different questions. Those are not merged -- a premium is never
   scaled from another one, which is the bug that put an invented Assurity
   rate on the quote tool.

   Whatever the count, they go out STAGGERED, one every QUOTE_GAP_MS, so a
   large report never arrives as a burst.
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
 * The letter IS the coverage choice. Level term only: "25 Year Return of
 * Premium" also begins with a number and is a different product.
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
    console.warn('[buysell] live coverage list unavailable, quoting by term length', err);
  }
}
loadCoverageCategories();

function liveTerms(){
  if (!Object.keys(TERM_LETTER).length) return TERM_CHOICES;
  const live = TERM_CHOICES.filter(t => TERM_LETTER[String(t)]);
  return live.length ? live : TERM_CHOICES;
}

/* ---- The shared quote store -------------------------------------------- */

/** How long between requests. Staggered, never bursted. */
const QUOTE_GAP_MS = 1500;

/**
 * Results keyed by the REQUEST, not by the row.
 *
 * Two policies asking the same question of Compulife -- same life, same
 * face, same term -- are one entry here and one call out. That is what
 * turns thirty rows into six requests when the owners hold equal shares.
 */
let QUOTE_BY_KEY = new Map();
/** "i-j" -> the request key its card is showing. */
let ROW_KEY = {};
/** Keys waiting to go out, and the runner that spaces them. */
let quoteQueue = [];
let queueRunning = false;
/** Per key, so a late reply cannot overwrite a newer one. */
let seqByKey = new Map();
/** Per row, so typing in a coverage box does not enqueue every keystroke. */
let rowTimer = {};

function policyBody(insured, pol){
  const cvg = Math.max(1000, Math.round((pol.coverage || 0) / 1000) * 1000);
  /* This page collects a real date of birth per owner, so unlike the key
     person calculator there is nothing to synthesize. */
  const dob = String(insured.dob || '').trim();
  /* No business-level state on this page, and no fallback invented for one:
     each owner names their own, and without it there is nothing to quote. */
  const state = String(insured.state || '').trim();
  if (!dob || !state || cvg < 1000) return null;
  const term = pol.term || DEFAULT_TERM;
  const letter = TERM_LETTER[String(term)];
  const body = {
    faceAmount: cvg,
    dateOfBirth: dob,
    gender: insured.gender === 'Female' ? 'Female' : 'Male',
    tobacco: insured.tobacco === 'Tobacco',
    healthClass: insured.uw || 'Standard',
    state: state,
    /* Cross-purchase is owner-to-owner: each partner personally owns the
       policy on the others, so this is NOT a business-owned case the way
       key person or an entity-purchase agreement is. */
    businessOwned: false,
    toolKey: 'buysell'
  };
  if (letter) body.coverage = letter;
  else { body.product = 'TERM'; body.termYears = term; }
  return body;
}

/** Ask for one policy's rates — or attach it to a request already in hand. */
function requestPolicyQuote(i, j){
  const pol = STATE && STATE.policies ? STATE.policies[policyKey(i, j)] : null;
  const insured = STATE && STATE.partners ? STATE.partners[j] : null;
  if (!pol || !insured) return;
  const rowId = i + '-' + j;
  const body = policyBody(insured, pol);
  if (!body){
    ROW_KEY[rowId] = null;
    paintPolicy(i, j);
    return;
  }
  const key = JSON.stringify(body);
  ROW_KEY[rowId] = key;

  const held = QUOTE_BY_KEY.get(key);
  /* Somebody already asked this exact question. Show their answer, or wait
     on the request already in flight, and spend nothing. */
  if (held && held.state !== 'error'){ paintPolicy(i, j); return; }

  QUOTE_BY_KEY.set(key, { state: 'loading' });
  paintPolicy(i, j);
  if (!quoteQueue.includes(key)) quoteQueue.push(key);
  runQuoteQueue();
}

/** Debounced, for the controls that fire while somebody is still typing. */
function queuePolicyQuote(i, j){
  const rowId = i + '-' + j;
  if (rowTimer[rowId]) clearTimeout(rowTimer[rowId]);
  rowTimer[rowId] = setTimeout(function(){ requestPolicyQuote(i, j); }, 400);
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * One request at a time, spaced by QUOTE_GAP_MS.
 *
 * Sequential rather than parallel on purpose: a thirty-row report with
 * uneven ownership is a real number of questions, and arriving as a burst
 * is how a visitor gets rate-limited halfway through their own report.
 */
async function runQuoteQueue(){
  if (queueRunning) return;
  queueRunning = true;
  try {
    while (quoteQueue.length){
      const key = quoteQueue.shift();
      const held = QUOTE_BY_KEY.get(key);
      /* Dropped while it waited — the row that wanted it has moved on. */
      if (!held || held.state !== 'loading') continue;
      await sendQuote(key);
      if (quoteQueue.length) await sleep(QUOTE_GAP_MS);
    }
  } finally {
    queueRunning = false;
  }
}

async function sendQuote(key){
  const endpoint = window.QB_QUOTE_ENDPOINT || '';
  const seq = (seqByKey.get(key) || 0) + 1;
  seqByKey.set(key, seq);
  if (!/^https?:\/\//i.test(endpoint)){
    QUOTE_BY_KEY.set(key, { state: 'error' });
    paintKey(key);
    return;
  }
  try {
    const res = await fetch(endpoint.replace(/\/$/, '') + '/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: key   // the key IS the request body, which is what makes it a key
    });
    const json = await res.json();
    if (seqByKey.get(key) !== seq) return;
    if (!res.ok || !json.ok) throw new Error(json.error || ('HTTP ' + res.status));

    const face = JSON.parse(key).faceAmount;
    const toRow = q => ({
      id: String(q.companyCode || q.carrierName || '').toLowerCase(),
      name: q.carrierName,
      prodResolved: q.productName,
      rating: q.amBestRating || 'NR',
      monthly: q.monthlyPremium,
      annual: q.annualPremium,
      coverage: q.faceAmount != null ? q.faceAmount : face,
      logo: logoFor(q.carrierName, q.logoUrl)
    });
    const quotes = (json.quotes || []).map(toRow);
    const featured = (json.featured || []).map(f => Object.assign(toRow(f), {
      bullets: Array.isArray(f.bullets) ? f.bullets : [],
      badge: typeof f.badge === 'string' ? f.badge : '',
      curated: f.curated === true
    }));
    QUOTE_BY_KEY.set(key, {
      state: quotes.length ? 'ok' : 'empty',
      quotes, featured,
      estimates: json.premiumsAreEstimates !== false
    });
  } catch (err){
    if (seqByKey.get(key) !== seq) return;
    console.error('[buysell] the quote request failed', err);
    /* Left as an error rather than deleted, so the rows showing it say so
       and a later edit re-asks rather than reading it as answered. */
    QUOTE_BY_KEY.set(key, { state: 'error' });
  }
  paintKey(key);
}

/** Every row waiting on this request, and then the totals. */
function paintKey(key){
  Object.keys(ROW_KEY).forEach(function(rowId){
    if (ROW_KEY[rowId] !== key) return;
    const parts = rowId.split('-');
    const host = document.getElementById('pquote-' + rowId);
    if (host) host.innerHTML = policyCards(STATE.partners[+parts[1]], +parts[0], +parts[1]);
  });
  updateTotals();
}

function paintPolicy(i, j){
  const host = document.getElementById('pquote-' + i + '-' + j);
  if (host) host.innerHTML = policyCards(STATE.partners[j], i, j);
  updateTotals();
}

/** Every policy on the report, once it has been drawn. */
function requestAllPolicyQuotes(){
  if (!STATE || !STATE.policies) return;
  Object.values(STATE.policies).forEach(p => requestPolicyQuote(p.buyerIdx, p.insuredIdx));
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

/** The row the combined premium totals: the recommendation the reader sees. */
function billedRow(i, j){
  const held = QUOTE_BY_KEY.get(ROW_KEY[i + '-' + j]);
  if (!held || held.state !== 'ok') return null;
  return (held.featured && held.featured[0]) || cheapestOf(held.quotes);
}

function quoteNotice(kind, icon, html){
  return '<div class="cp-quote-note ' + kind + '"><span class="ic">' + icon + '</span><p>' + html + '</p></div>';
}

const CALL_US = '<a href="tel:8888048590">(888) 804-8590</a>';

function policyCards(insured, i, j){
  const held = QUOTE_BY_KEY.get(ROW_KEY[i + '-' + j]) || { state: 'idle' };
  const first = esc(String(insured.name || 'this owner').split(' ')[0]);

  if (held.state === 'idle'){
    return quoteNotice('wait', '\u{1F4CB}',
      'Add ' + first + '’s date of birth and state above and we will price this policy.');
  }
  if (held.state === 'loading'){
    return quoteNotice('wait', '\u{23F3}', 'Pricing this policy on ' + first + '…');
  }
  if (held.state === 'error'){
    return quoteNotice('warn', '\u{260E}\u{FE0F}',
      'We could not reach the quote service just now. Rather than show an estimate '
      + 'that might be wrong, we would rather have someone call you with real '
      + 'numbers — ' + CALL_US + '.');
  }
  const cheapest = cheapestOf(held.quotes);
  if (held.state === 'empty' || !cheapest){
    return quoteNotice('warn', '\u{260E}\u{FE0F}',
      '<b>No carrier returned an offer on ' + first + '.</b> That is a statement about '
      + 'this comparison, not about them — it prices a fixed set of carriers at '
      + 'standard underwriting. A funded buy-sell is worth a conversation anyway: '
      + CALL_US + '.');
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

  const fromRow = (r, extra) => cardHTML(Object.assign({
    monthly: r.monthly, annual: r.annual, logo: r.logo, name: r.name,
    prod: r.prodResolved, coverage: r.coverage, rating: r.rating,
    /* WHOSE CARD THIS IS. Both tools quote several people, and an
       Apply that does not say which one makes an agent guess from a
       premium. policyCards() has the person; the card carries it. */
    insured: String(insured.name || '').split(' ')[0]
  }, extra));

  let out = fromRow(cheapest, {
    cardClass: '', badgeClass: 'affordable', badgeText: 'Most Affordable',
    mid: `<div class="trophy">\u{1F3C6} Lowest Price</div>
          <p>The most affordable way to cover ${first}'s buy-out.</p>`
  });

  /* The carrier in first position in carrier settings, with the chip typed
     against it there. One pick, not two -- this page shows two cards. A
     carrier nobody curated keeps the slot and loses the endorsement. */
  const pick = (held.featured && held.featured[0]) || null;
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

  if (held.estimates){
    out += '<div class="cp-estimate-note"><b>Illustrative estimates.</b> These premiums '
      + 'are modelled, not carrier-filed rates, and are not an offer of insurance.</div>';
  }
  return out;
}

function policyStatusHTML(pol, insuredName){
  const need = pol.need || 0, cov = Math.max(0, pol.coverage||0), diff = cov - need;
  if (Math.abs(diff) < 1000 || need === 0) return '';
  const first = esc((insuredName||'this owner').split(' ')[0]);
  if (diff < 0){
    const pct = need ? Math.round(Math.abs(diff)/need*100) : 0;
    return `<div class="cov-status under"><span class="ic">⚠️</span>
      <div><b>Insuring below the calculated need.</b> This policy covers <b>${fmtUSD(cov)}</b> — <b>${fmtUSD(Math.abs(diff))}</b> (${pct}%) less than the <b>${fmtUSD(need)}</b> needed to fund this buyer's share of ${first}'s buy-out. The gap would have to be covered from other sources.</div></div>`;
  }
  return `<div class="cov-status over"><span class="ic">ℹ️</span>
    <div><b>Coverage set above the calculated need.</b> This policy covers <b>${fmtUSD(cov)}</b>, <b>${fmtUSD(diff)}</b> more than the <b>${fmtUSD(need)}</b> share — a cushion for valuation growth or transfer costs.</div></div>`;
}

function policyRow(i, j){
  const ps = STATE.partners, buyer = ps[i], insured = ps[j];
  const pol = STATE.policies[policyKey(i,j)];
  const need = pol.need || 0;
  const changed = Math.abs((pol.coverage||0) - need) >= 1000;
  const survivors = 100 - insured.pct;
  const denomNote = survivors > 0.0001
    ? `${fmtUSDk(fundingValue()*(insured.pct/100))} buy-out × ${buyer.pct}% ÷ ${survivors}% survivors`
    : `equal split among co-owners`;
  return `
  <div class="policy-row" id="prow-${i}-${j}">
    <div class="policy-head">
      <div class="policy-on">Policy on <b>${esc(insured.name)}</b></div>
      <div class="policy-meta">Age ${insured.age} · ${insured.gender} · ${insured.uw} · ${insured.pct}% owner</div>
      <div class="policy-need">Need: <b>${fmtUSD(need)}</b></div>
    </div>
    <p class="pbh-formula">${esc(buyer.name.split(' ')[0])}'s share of ${esc(insured.name.split(' ')[0])}'s buy-out = ${denomNote} = <b>${fmtUSD(need)}</b>.</p>
    <div class="pbh-controls">
      <div class="pbh-ctl">
        <label>Coverage Amount</label>
        <div class="input-wrap"><span class="input-prefix">$</span>
          <input type="text" inputmode="numeric" class="cov-input ${changed?'changed':''}" id="cov-${i}-${j}" value="${(pol.coverage||0).toLocaleString()}" data-qb-input="onCoverageInput" data-qb-input-args='[${i},${j},"@el"]' data-qb-blur="onCoverageBlur" data-qb-blur-args='[${i},${j},"@el"]'></div>
      </div>
      <div class="pbh-ctl">
        <label>Term Duration</label>
        <select id="term-${i}-${j}" data-qb-change="onPolicyTerm" data-qb-change-args='[${i},${j},"@el"]'>
          ${liveTerms().map(t=>`<option value="${t}" ${ (pol.term||DEFAULT_TERM)===t ?'selected':''}>${t}-Year Term</option>`).join('')}
        </select>
      </div>
      <button class="reset-cov" id="reset-${i}-${j}" ${changed?'':'disabled'} data-qb-click="resetCoverage" data-qb-click-args='[${i},${j}]'>↺ Reset to need</button>
      <span class="cov-need-tag">Need: <b>${fmtUSD(need)}</b></span>
    </div>
    <div id="pstatus-${i}-${j}">${policyStatusHTML(pol, insured.name)}</div>
    <div class="best-row" id="pquote-${i}-${j}">${policyCards(insured, i, j)}</div>
  </div>`;
}

function partnerBlocks(){
  const ps = STATE.partners;
  return ps.map((buyer,i) => {
    const others = ps.map((_,j)=>j).filter(j=>j!==i);
    const buyerTotal = others.reduce((s,j)=> s + (STATE.policies[policyKey(i,j)].need||0), 0);
    const rows = others.map(j => policyRow(i,j)).join('');
    const first = esc(buyer.name.split(' ')[0]);
    return `
    <div class="partner-block" id="pblock-${i}">
      <div class="partner-block-head">
        <span class="pbh-chip">${i+1}</span>
        <div>
          <div class="pbh-name">${esc(buyer.name)}</div>
          <div class="pbh-meta">${buyer.pct}% owner · buys ${others.length} polic${others.length===1?'y':'ies'}</div>
        </div>
        <div class="pbh-cov">
          <div class="l">Amount of Total Coverage on Owners</div>
          <div class="v">${fmtUSD(buyerTotal)}</div>
        </div>
      </div>
      <p class="buyer-intro">As a ${buyer.pct}% owner, <b>${first}</b> personally owns and pays for a policy on each other partner, sized to ${first}'s share of that partner's buy-out.</p>
      <div class="policy-list">${rows}</div>
    </div>`;
  }).join('');
}

/* ---- live per-policy updates ---- */
function refreshPolicy(i, j){
  const pol = STATE.policies[policyKey(i,j)];
  const insured = STATE.partners[j];
  const need = pol.need || 0;
  const changed = Math.abs((pol.coverage||0) - need) >= 1000;
  queuePolicyQuote(i, j);
  $('pstatus-'+i+'-'+j).innerHTML = policyStatusHTML(pol, insured.name);
  const inp = $('cov-'+i+'-'+j); if (inp) inp.classList.toggle('changed', changed);
  const rst = $('reset-'+i+'-'+j); if (rst) rst.disabled = !changed;
  updateTotals();
}
function onCoverageInput(i, j, el){
  const pol = STATE.policies[policyKey(i,j)];
  pol.coverage = num(el.value); pol.coverageTouched = true;
  refreshPolicy(i,j);
}
function onCoverageBlur(i, j, el){
  const v = Math.max(0, num(el.value));
  STATE.policies[policyKey(i,j)].coverage = v;
  el.value = v.toLocaleString();
}
function onPolicyTerm(i, j, el){
  const pol = STATE.policies[policyKey(i,j)];
  pol.term = parseInt(el.value, 10);
  /* Straight to the queue rather than debounced: a select fires once. */
  requestPolicyQuote(i, j);
}
function resetCoverage(i, j){
  const pol = STATE.policies[policyKey(i,j)];
  pol.coverage = pol.need; pol.coverageTouched = false;
  const inp = $('cov-'+i+'-'+j); if (inp) inp.value = (pol.need||0).toLocaleString();
  refreshPolicy(i,j);
}

/* ============================================================
   RENDER RESULTS
   ============================================================ */
function computeTotals(){
  let totalCoverage = 0, totalNeed = 0, totalAnnual = 0, count = 0, priced = 0;
  Object.values(STATE.policies).forEach(pol => {
    const need = pol.need || 0, cov = Math.max(0, pol.coverage || 0);
    totalNeed += need; totalCoverage += cov; count++;
    /* Summed from the row the reader is being shown -- the recommendation
       card -- rather than recomputed beside it. A total derived separately
       is a total that can disagree with the cards above it. */
    const row = billedRow(pol.buyerIdx, pol.insuredIdx);
    if (row && typeof row.annual === 'number' && isFinite(row.annual)){
      totalAnnual += row.annual;
      priced += 1;
    }
  });
  return { totalCoverage, totalNeed, totalAnnual, count, priced,
           shortfall: Math.max(0, totalNeed - totalCoverage) };
}

/* "$4,120/yr" once every policy is priced, "$2,300/yr so far (7 of 12)" while
   the staggered queue is still working through them, and a dash before any
   have landed -- never $0, which reads as a figure somebody was shown. */
function premiumLabel(t){
  const per = '<span style="font-size:13px;font-weight:600;color:var(--gray-mid);">/yr</span>';
  if (!t.priced) return '\u2014';
  const amount = fmtUSD(t.totalAnnual) + per;
  return t.priced === t.count ? amount
    : amount + ' <span class="prem-partial">so far (' + t.priced + ' of ' + t.count + ')</span>';
}

function renderResults(){
  const v = STATE.valuation;
  const fv = fundingValue();
  const t = computeTotals();

  const fbOptions = [
    ['recommended','Recommended (blended) — ' + fmtUSD(v.recommended)],
    ['est', "What You Think It's Worth — " + fmtUSD(v.methods.est.val)],
    ['mult', v.methods.mult.label + ' — ' + fmtUSD(v.methods.mult.val)],
    ['book','Book Value — ' + fmtUSD(v.methods.book.val)],
    ['cap','Capitalization of Earnings — ' + fmtUSD(v.methods.cap.val)],
    ['capbook','Cap. of Earnings + Book Value — ' + fmtUSD(v.methods.capbook.val)],
  ];

  $('resultsContent').innerHTML = `
    <!-- summary -->
    <div class="analysis-for">
      <span class="analysis-for-name">${esc(STATE.biz.name)}</span>
      <span class="analysis-for-item"><b>${esc(STATE.biz.structure)}</b></span>
      <span class="analysis-for-item">${esc(STATE.biz.industry)}</span>
      <span class="analysis-for-item"><b>${STATE.partners.length}</b> owners</span>
      <span class="analysis-for-item">EBITDA <b>${fmtUSDk(v.ebitda)}</b></span>
      <button class="edit-inputs-btn" data-qb-click="editInputs">✎ Edit inputs</button>
    </div>

    <!-- diagram -->
    <div class="section-card">
      <h3 class="sc-title">How a Cross-Purchase Buy-Sell Works</h3>
      <p class="sc-sub">In a cross-purchase plan, <b>each owner personally</b> owns and is the beneficiary of a life insurance policy on every other owner. Follow the numbered flow:</p>
      <div class="diagram-wrap">${diagramSVG()}</div>
      ${lifecycleHTML()}
    </div>

    <!-- headline valuation -->
    <div class="headline-card">
      <div class="headline-inner">
        <div>
          <div class="headline-label">Recommended Business Valuation</div>
          <div class="headline-value">${fmtUSD(v.recommended)}</div>
          <div class="headline-sub">A blend of the three calculated methods — a balanced figure to anchor the buy-sell price and size coverage.</div>
        </div>
        <div class="headline-mini">
          <div class="headline-mini-item"><div class="v">${fmtUSDk(v.methods.mult.val)}</div><div class="l">EBITDA × Mult.</div></div>
          <div class="headline-mini-item"><div class="v">${fmtUSDk(v.methods.cap.val)}</div><div class="l">Cap. Earnings</div></div>
          <div class="headline-mini-item"><div class="v">${fmtUSDk(v.methods.capbook.val)}</div><div class="l">Cap. + Book</div></div>
        </div>
      </div>
      <div class="funding-basis">
        <label for="fundingBasisSel">Fund the buy-sell on</label>
        <select id="fundingBasisSel" data-qb-change="onFundingChange" data-qb-change-args='["@value"]'>
          ${fbOptions.map(o=>`<option value="${o[0]}" ${fundingBasis===o[0]?'selected':''}>${esc(o[1])}</option>`).join('')}
        </select>
        <span class="select-hint">▾ Tap to choose a method</span>
        <span class="fb-note">Each policy is sized as the insured's <b>buy-out value × the buyer's share of the surviving owners</b>. Change the basis to see coverage update.</span>
      </div>
    </div>

    <!-- valuation chart -->
    <div class="section-card">
      <h3 class="sc-title">Business Valuation — Five Methods</h3>
      <p class="sc-sub">Different methods can produce very different numbers. A defensible buy-sell agreement names one method (or a blend) up front so there's no dispute later.</p>
      <p class="basis-callout">Currently sizing coverage on the <b>${esc(fundingLabel())}</b> figure of <b>${fmtUSD(fundingValue())}</b> — highlighted below. Change the funding basis above to use a different method.</p>
      <div id="vchart">${valuationChart()}</div>
      <div class="method-note" data-qb-click="toggleMethods">ⓘ How each method is calculated</div>
      <div class="method-detail" id="methodDetail">${methodDetailHTML()}</div>
    </div>

    <!-- per-partner policies + quotes -->
    <div class="section-card">
      <h3 class="sc-title">Coverage &amp; Quotes by Partner</h3>
      <p class="sc-sub">Each partner personally owns a policy on every other partner. Each policy is pre-filled with the buyer's share of that partner's buy-out and priced on the insured partner's profile. Adjust the <b>coverage amount</b> or <b>term</b> per policy — changes are highlighted, and we'll flag any policy set below the calculated need.</p>
      <div id="partnerBlocks">${partnerBlocks()}</div>
    </div>

    <!-- totals -->
    <div class="section-card">
      <h3 class="sc-title">Funding Summary</h3>
      <p class="sc-sub">Across all owners, based on the <b>${esc(fundingLabel())}</b> valuation and the coverage amounts set above.</p>
      <div class="totals-strip">
        <div class="total-box"><div class="l">Total Calculated Need</div><div class="v">${fmtUSD(t.totalNeed)}</div></div>
        <div class="total-box"><div class="l">Total Coverage Applied</div><div class="v accent" id="tot-cov">${fmtUSD(t.totalCoverage)}</div></div>
        <div class="total-box"><div class="l">Est. Combined Premium</div><div class="v gold" id="tot-prem">${premiumLabel(t)}</div></div>
        <div class="total-box"><div class="l">Policies</div><div class="v">${t.count}</div></div>
      </div>
      <div id="tot-shortfall">${shortfallInsightHTML(t)}</div>
      <div class="insight-box blue" style="margin-top:18px;">
        <span class="insight-icon">💡</span>
        <div class="insight-text">
          <h4>Why cross-purchase?</h4>
          <p>Because each survivor buys the deceased's shares directly, their <b>cost basis steps up</b> to the price paid — a real tax advantage when the business is later sold. The trade-off is administration: ${STATE.partners.length} owners means <b>${t.count} separate policies</b> (each owner insuring every other owner), and premiums can differ by age and health. With many owners, some firms prefer an entity plan or a trusteed cross-purchase. Your agent and tax advisor can compare structures.</p>
        </div>
      </div>
    </div>

    <div class="disclaimer">
      <b>Important:</b> This tool provides educational illustrations only and is not legal, tax, accounting, or investment advice, nor a binding insurance quote or business appraisal. Valuation methods rely on the assumptions you entered and simplified formulas; actual fair market value requires a qualified appraiser. Life insurance premiums shown are sample rates for the profiles entered and are subject to full underwriting. A buy-sell agreement should be drafted by an attorney and coordinated with your CPA. QB Insurance LLC is a licensed insurance agency.
    </div>
  `;
}

function shortfallInsightHTML(t){
  if (t.shortfall < 1000) return '';
  const pct = t.totalNeed ? Math.round(t.shortfall/t.totalNeed*100) : 0;
  return `<div class="cov-status under" style="margin-top:18px;">
    <span class="ic">⚠️</span>
    <div><b>Combined coverage is below the calculated need.</b> One or more policies are set under their target, leaving a total funding gap of <b>${fmtUSD(t.shortfall)}</b> (${pct}% of the ${fmtUSD(t.totalNeed)} total need). The buying owners would need another source for that amount at a buy-out.</div>
  </div>`;
}
function updateTotals(){
  if (!STATE) return;
  const t = computeTotals();
  const cov = $('tot-cov'); if (cov) cov.textContent = fmtUSD(t.totalCoverage);
  const prem = $('tot-prem'); if (prem) prem.innerHTML = premiumLabel(t);
  const sf = $('tot-shortfall'); if (sf) sf.innerHTML = shortfallInsightHTML(t);
}

function onFundingChange(val){ fundingBasis = val; recalcNeeds(); renderResults(); }
function toggleMethods(){ $('methodDetail').classList.toggle('show'); }

/* ============================================================
   INIT
   ============================================================ */
function populateIndustries(){
  const sel = $('industry');
  /* Unchosen on arrival. It drives the valuation multiple, so falling to
     the first entry would price the business as a profession nobody named. */
  { const ph = document.createElement('option');
    ph.value = ''; ph.textContent = 'Select an industry'; ph.selected = true;
    sel.appendChild(ph); }
  INDUSTRIES.forEach(ind => {
    const o = document.createElement('option');
    o.value = ind.id; o.textContent = ind.name;
    /* No default industry: it drives the valuation multiple. */
    sel.appendChild(o);
  });
}

function resetDefaults(){
  $('firstName').value = '';
  $('lastName').value = '';
  $('title').value = '';
  $('email').value = '';
  $('phone').value = '';
  ['firstName','lastName','title','email','phone'].forEach(id => $('f-'+id).classList.remove('has-error'));
  $('bizName').value = '';
  $('bizStructure').value = 'LLC';
  $('numPartners').value = '2';
  $('industry').value = 'prof';
  $('ebitda').value = '750,000';
  $('ownerEstimate').value = '3,000,000';
  $('assets').value = '1,200,000';
  $('liabilities').value = '400,000';
  $('discountRate').value = '25';
  $('growthRate').value = '3';
  multipleTouched = false;
  buildPartners();
  suggestMultiple();
  editInputs();
}

document.addEventListener('DOMContentLoaded', () => {
  populateIndustries();
  ['ebitda','ownerEstimate','assets','liabilities'].forEach(id => fmtMoneyInput($(id)));
  buildPartners();
  suggestMultiple();

  $('numPartners').addEventListener('change', buildPartners);
  $('industry').addEventListener('change', suggestMultiple);
  $('ebitda').addEventListener('input', suggestMultiple);
  $('multiple').addEventListener('input', () => { multipleTouched = true; });
  // clear contact errors as the user corrects them
  ['firstName','lastName','title','email','phone'].forEach(id =>
    $(id).addEventListener('input', () => $('f-'+id).classList.remove('has-error')));

  // auto-format the phone field as a US number while typing
  $('phone').addEventListener('input', (e) => { e.target.value = formatUSPhone(e.target.value); });

  // ---- custom tooltip (rendered at document level so the scrollable partner list can't clip it) ----
  const tip = document.createElement('div');
  tip.id = 'tipBubble';
  document.body.appendChild(tip);
  function showTip(el){
    const text = el.getAttribute('data-tip');
    if (!text) return;
    tip.textContent = text;
    tip.classList.add('show');
    const r = el.getBoundingClientRect();
    const bw = tip.offsetWidth, bh = tip.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
    let left = r.left;
    if (left + bw > vw - 8) left = vw - 8 - bw;
    if (left < 8) left = 8;
    let top = r.bottom + 8;
    if (top + bh > vh - 8) top = r.top - bh - 8; // flip above if no room below
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
    const ax = Math.max(8, Math.min(bw - 16, r.left + r.width / 2 - left - 6));
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
window.qbActions.register({ calculate: calculate, editInputs: editInputs, onCoverageBlur: onCoverageBlur, onCoverageInput: onCoverageInput, onFundingChange: onFundingChange, onPolicyTerm: onPolicyTerm, resetCoverage: resetCoverage, toggleMethods: toggleMethods, updateDobAge: updateDobAge });
