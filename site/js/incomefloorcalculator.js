/*
 * incomefloorcalculator.html's own script, which used to sit inline in the page.
 *
 * It had to move: a Content-Security-Policy without 'unsafe-inline' blocks an
 * inline <script>, so inline this page would have gone dead the moment the
 * policy went on -- quietly, with the markup looking perfectly correct.
 *
 * Moved verbatim.
 */
/* ============================================================================
   GLWB ILLUSTRATION MODEL  —  carrier-substitutable constants
   These mirror the Quote-Bot FIA Designer so the two tools stay consistent.
   Replace with live carrier figures when available.
   ============================================================================ */
const ROLLUP_RATE      = 0.10;   // guaranteed simple-interest roll-up on the income base
const ROLLUP_MAX_YEARS = 10;     // years the roll-up applies during deferral
function payoutFactor(startAge) {
  if (startAge <= 50) return 0.040;
  if (startAge <= 55) return 0.045;
  if (startAge <= 60) return 0.050;
  if (startAge <= 65) return 0.055;
  if (startAge <= 70) return 0.060;
  return 0.065;
}

/* ── FORMATTERS ───────────────────────────────────────────────────────────── */
const fmt0 = n => '$' + Math.round(n).toLocaleString('en-US');
const fmtPct = n => (n).toFixed(1) + '%';

/* read a text field's numeric value, ignoring commas/symbols */
const numVal = id => parseFloat((document.getElementById(id).value || '').replace(/[^0-9.]/g, '')) || 0;

/* live thousands-separator formatting that preserves cursor position */
function formatThousandsInput(el) {
  const caret = el.selectionStart;
  const raw = el.value;
  const digitsLeftOfCaret = raw.slice(0, caret).replace(/[^0-9]/g, '').length;
  const digits = raw.replace(/[^0-9]/g, '');
  if (digits === '') { el.value = ''; return; }
  const formatted = parseInt(digits, 10).toLocaleString('en-US');
  el.value = formatted;
  // restore caret after the same number of digits
  let pos = 0, seen = 0;
  while (pos < formatted.length && seen < digitsLeftOfCaret) {
    if (/[0-9]/.test(formatted[pos])) seen++;
    pos++;
  }
  try { el.setSelectionRange(pos, pos); } catch (e) {}
}

/* live US phone formatting: (XXX) XXX-XXXX */
function formatPhoneInput(el) {
  const d = el.value.replace(/\D/g, '').slice(0, 10);
  let out = d;
  if (d.length > 6)      out = `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
  else if (d.length > 3) out = `(${d.slice(0,3)}) ${d.slice(3)}`;
  else if (d.length > 0) out = `(${d}`;
  el.value = out;
}

/* ── NON-NEGOTIABLE EXPENSE LIST ──────────────────────────────────────────── */
/* The categories are prompts; the amounts are the visitor's to fill in. */
let expenses = [
  { name: 'Housing (rent / mortgage)', amt: '' },
  { name: 'Utilities', amt: '' },
  { name: 'Groceries', amt: '' }
];

function renderExpenses() {
  const wrap = document.getElementById('expList');
  wrap.innerHTML = expenses.map((e, i) => `
    <div class="exp-row">
      <input type="text" value="${e.name.replace(/"/g,'&quot;')}" placeholder="Expense name"
        data-qb-input="expenseNameTyped" data-qb-input-args='[${i},"@el"]'>
      <div class="exp-amt"><span>$</span><input type="text" inputmode="numeric" value="${e.amt === '' || e.amt == null ? '' : Number(e.amt).toLocaleString('en-US')}"
        data-qb-input="expenseAmountTyped" data-qb-input-args='[${i},"@el"]'></div>
      <button class="exp-del" title="Remove" data-qb-click="removeExpense" data-qb-click-args='[${i}]'>✕</button>
    </div>`).join('');
  refreshTotal();
}
function addExpense() { expenses.push({ name: '', amt: 0 }); renderExpenses(); }
function removeExpense(i) { expenses.splice(i, 1); if (!expenses.length) expenses.push({ name: '', amt: 0 }); renderExpenses(); }
function monthlyTotal() { return expenses.reduce((s, e) => s + (parseFloat(e.amt) || 0), 0); }
function refreshTotal() {
  document.getElementById('expTotal').innerHTML = fmt0(monthlyTotal()) + '<small> /mo</small>';
}

/* ── ALLOCATION SLIDER ────────────────────────────────────────────────────── */
const allocSlider = document.getElementById('allocSlider');
function updateAlloc() {
  const stock = parseInt(allocSlider.value);
  const bond  = 100 - stock;
  const liquid = numVal('liquid');
  allocSlider.style.setProperty('--val', stock + '%');
  document.getElementById('stockPct').textContent = stock + '%';
  document.getElementById('bondPct').textContent  = bond + '%';
  document.getElementById('stockDollars').textContent = fmt0(liquid * stock / 100);
  document.getElementById('bondDollars').textContent  = fmt0(liquid * bond / 100);
}
allocSlider.addEventListener('input', updateAlloc);

/* ── PANEL TOGGLES ────────────────────────────────────────────────────────── */
function openInputPanel() {
  document.getElementById('pageLayout').classList.remove('inputs-hidden');
  document.getElementById('editInputsBar').classList.remove('visible');
}
function closeInputPanel() {
  document.getElementById('pageLayout').classList.add('inputs-hidden');
  const name = (document.getElementById('contactFirst').value.trim() + ' ' +
                document.getElementById('contactLast').value.trim()).trim() || 'your income floor';
  document.getElementById('editInputsName').textContent = name;
  document.getElementById('editInputsBar').classList.add('visible');
}

/* ── GATED CALCULATE ──────────────────────────────────────────────────────── */
/* ---- Quote Bot lead capture ------------------------------------------ */
function qbCaptureLead(){
  if (!window.QuoteBot) return;
  try {
    var V = function(id){ var e=document.getElementById(id); return e ? String(e.value).trim() : ""; };
    var N = function(id){ var e=document.getElementById(id); return e ? (parseFloat(String(e.value).replace(/[^0-9.\-]/g,""))||0) : null; };
    var C = function(sel){ var e=document.querySelector(sel); return e ? e.textContent.replace(/\s+/g," ").trim() : null; };
    if (!V('contactEmail')) return;
    window.QuoteBot.capture({
      email: V('contactEmail'), phone: V('contactPhone'),
      firstName: V('contactFirst'), lastName: V('contactLast'),
      productLine: 'ANNUITY_IMMEDIATE',
      inputs: { currentAge: N('curAge'), state: V('contactState') },
      results: null,
      consentText: C('#qb-consent')
    });
  } catch (e) { /* capture must never break the calculator */ }
}

function runCalcGated() {
  const first = document.getElementById('contactFirst').value.trim();
  const last  = document.getElementById('contactLast').value.trim();
  const email = document.getElementById('contactEmail').value.trim();
  const phone = document.getElementById('contactPhone').value.trim();
  const state = document.getElementById('contactState').value;
  const errEl = document.getElementById('contactError');

  /* Phone is optional; the other four are not. State decides who may take
     the lead -- routing skips an agent not licensed where they live, and a
     lead with no state skips that check altogether. */
  if (!first || !last || !email || !state) {
    errEl.textContent = '⚠ Please complete all fields in Your Information before calculating.';
    errEl.style.display = 'block';
    document.getElementById('contactFirst').closest('.input-section').scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errEl.textContent = '⚠ Please enter a valid email address.';
    errEl.style.display = 'block';
    return;
  }
  errEl.style.display = 'none';
  qbCaptureLead();
  document.getElementById('resultsLocked').style.display = 'none';
  document.getElementById('resultsArea').classList.add('visible');
  closeInputPanel();
  runCalc();
  document.getElementById('resultsArea').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ── MAIN CALC ────────────────────────────────────────────────────────────── */
function runCalc() {
  const curAge   = parseInt(document.getElementById('curAge').value) || 55;
  const retAge   = parseInt(document.getElementById('retAge').value) || 65;
  const netWorth = numVal('netWorth');
  const liquid   = numVal('liquid');
  const stockPct = parseInt(allocSlider.value);
  const bondPct  = 100 - stockPct;
  const bondDollars  = liquid * bondPct / 100;

  const monthly = monthlyTotal();
  const annual  = monthly * 12;

  // GLWB inversion: solve for the premium that produces the needed income
  const deferYears  = Math.max(0, retAge - curAge);
  const rollupYears = Math.min(deferYears, ROLLUP_MAX_YEARS);
  const baseFactor  = 1 + ROLLUP_RATE * rollupYears;   // income base growth
  const payout      = payoutFactor(retAge);
  // annual income = premium * baseFactor * payout  →  premium = annual / (baseFactor * payout)
  const premium     = annual / (baseFactor * payout);

  // Portfolio shares
  const nwPct   = netWorth > 0 ? (premium / netWorth) * 100 : 0;
  const bondShare = bondDollars > 0 ? (premium / bondDollars) * 100 : null;
  const liquidPct = liquid > 0 ? (premium / liquid) * 100 : 0;

  /* ── Headline ── */
  document.getElementById('rMonthlyTitle').textContent = fmt0(monthly) + '/mo';
  document.getElementById('rSubtitle').textContent =
    `Beginning at age ${retAge} and continuing for as long as you live — funded by a Fixed Indexed Annuity with a lifetime income rider.`;
  document.getElementById('rPremium').textContent = fmt0(premium);
  document.getElementById('rMonthly').textContent = fmt0(monthly);
  document.getElementById('rAnnual').textContent  = fmt0(annual);
  document.getElementById('rDeferYears').textContent = deferYears;

  /* ── Total-portfolio meter ── */
  document.getElementById('rNwPct').textContent = fmtPct(nwPct);
  const nwBar = document.getElementById('rNwBar');
  nwBar.style.width = Math.min(nwPct, 100) + '%';
  nwBar.style.background = nwPct > 50 ? 'var(--red)' : nwPct > 35 ? 'var(--gold-mid)' : 'var(--accent)';
  document.getElementById('rNwPct').style.color = nwPct > 50 ? 'var(--red)' : 'var(--primary-dark)';
  document.getElementById('rNwNote').innerHTML =
    `<strong>${fmt0(premium)}</strong> of your <strong>${fmt0(netWorth)}</strong> net worth would fund the annuity. The remaining <strong>${fmt0(Math.max(netWorth - premium, 0))}</strong> stays invested for growth, legacy, and flexibility.`;

  /* ── Bond-allocation meter ── */
  const bondPctEl = document.getElementById('rBondPct');
  const bondBar   = document.getElementById('rBondBar');
  if (bondShare === null) {
    bondPctEl.textContent = 'N/A';
    bondPctEl.style.color = 'var(--gray-mid)';
    bondBar.style.width = '0%';
    document.getElementById('rBondNote').innerHTML =
      `You currently hold <strong>no bond allocation</strong>, so the floor would have to be funded from cash or equities. Many advisors treat a guaranteed-income annuity as a bond substitute — adding a fixed-income sleeve is worth discussing.`;
  } else {
    bondPctEl.textContent = fmtPct(bondShare);
    bondPctEl.style.color = bondShare > 100 ? 'var(--red)' : 'var(--primary-dark)';
    bondBar.style.width = Math.min(bondShare, 100) + '%';
    bondBar.style.background = bondShare > 100 ? 'var(--red)' : 'var(--teal)';
    if (bondShare > 100) {
      document.getElementById('rBondNote').innerHTML =
        `Your bond allocation is <strong>${fmt0(bondDollars)}</strong> (${bondPct}% of liquid assets). The required premium <strong>exceeds your entire bond sleeve</strong> — covering this floor would mean drawing on equities or other assets as well. Consider a smaller floor or a larger fixed-income allocation.`;
    } else {
      document.getElementById('rBondNote').innerHTML =
        `Your bond allocation is <strong>${fmt0(bondDollars)}</strong> (${bondPct}% of liquid assets). Funding the income floor from this sleeve would use <strong>${fmtPct(bondShare)}</strong> of it — turning a portion of your fixed-income holdings into guaranteed lifetime income, while your equity allocation is left fully intact.`;
    }
  }

  /* ── Compliance checks (two) ── */
  const checks = [
    {
      title: '50% of net worth',
      pass: nwPct <= 50,
      actual: nwPct,
      limit: 50,
      base: netWorth,
      passDesc: `At ${fmtPct(nwPct)}, the premium is within the 50%-of-net-worth limit, leaving the majority of your wealth outside the contract.`,
      failDesc: `At ${fmtPct(nwPct)}, the premium exceeds 50% of net worth. A smaller floor, a longer deferral, or additional assets would be needed to clear this guardrail.`
    },
    {
      title: '30% of liquid net worth',
      pass: liquidPct <= 30,
      actual: liquidPct,
      limit: 30,
      base: liquid,
      passDesc: `At ${fmtPct(liquidPct)}, the premium is within the 30%-of-liquid-assets limit — preserving ample accessible cash for emergencies and near-term needs.`,
      failDesc: `At ${fmtPct(liquidPct)}, the premium exceeds 30% of liquid assets. This is the tighter guardrail — a reduced floor or more liquidity would be needed before this could be recommended.`
    }
  ];
  document.getElementById('complianceWrap').innerHTML = checks.map(c => `
    <div class="compliance-card ${c.pass ? 'pass' : 'fail'}">
      <div class="compliance-badge">${c.pass ? '✓' : '✕'}</div>
      <div class="compliance-main">
        <div class="compliance-title">
          <span>${c.pass ? 'Within' : 'Exceeds'} ${c.title}</span>
          <span class="compliance-stat">${fmtPct(c.actual)} <span style="font-weight:400;color:var(--gray-mid);font-size:11px;">of ${fmt0(c.base)} · limit ${c.limit}%</span></span>
        </div>
        <div class="compliance-desc">${c.pass ? c.passDesc : c.failDesc}</div>
      </div>
    </div>`).join('');

  /* ── Compliance-adjusted alternative (shown when over either guardrail) ── */
  const compliantMax = Math.min(netWorth * 0.50, liquid * 0.30);
  const adjPanel = document.getElementById('adjustedPanel');
  if (premium > compliantMax + 1 && compliantMax > 0) {
    const ratio     = compliantMax / premium;       // income scales linearly with premium
    const cMonthly  = monthly * ratio;
    const coverage  = ratio * 100;
    const uncovered = Math.max(0, monthly - cMonthly);
    const liquidBinds = (liquid * 0.30) <= (netWorth * 0.50);
    document.getElementById('adjNeeded').textContent    = fmt0(premium);
    document.getElementById('adjCompliant').textContent = fmt0(compliantMax);
    document.getElementById('adjCapNote').textContent   =
      liquidBinds ? 'Capped at 30% of liquid assets' : 'Capped at 50% of net worth';
    document.getElementById('adjDetail').innerHTML =
      `The compliant lump sum of <strong>${fmt0(compliantMax)}</strong> is <strong>${fmt0(premium - compliantMax)}</strong> short of the amount needed. ` +
      `It would guarantee about <strong>${fmt0(cMonthly)}/mo</strong> — roughly <strong>${coverage.toFixed(0)}%</strong> of your ${fmt0(monthly)}/mo floor — ` +
      `leaving about <strong>${fmt0(uncovered)}/mo</strong> to be covered from other sources such as Social Security, a pension, or other assets. ` +
      `A licensed specialist can right-size the floor, extend the deferral period, or stage premiums over time to help close this gap within suitability limits.`;
    adjPanel.style.display = 'block';
  } else {
    adjPanel.style.display = 'none';
  }

  /* ── Projection detail table ── */
  const incomeBaseAtRet = premium * baseFactor;
  const rows = [
    ['Premium funded today', fmt0(premium)],
    [`Guaranteed roll-up`, `${(ROLLUP_RATE*100).toFixed(0)}% simple × ${rollupYears} yr${rollupYears===1?'':'s'}`],
    [`Income base at age ${retAge}`, fmt0(incomeBaseAtRet)],
    [`Lifetime payout factor (age ${retAge})`, (payout*100).toFixed(1) + '%'],
    ['Guaranteed annual income', fmt0(incomeBaseAtRet * payout)],
    ['Guaranteed monthly income', fmt0(incomeBaseAtRet * payout / 12)]
  ];
  document.querySelector('#projTable tbody').innerHTML =
    rows.map(r => `<tr><td>${r[0]}</td><td data-qb-sum="${r[0]}">${r[1]}</td></tr>`).join('');
}

/* ── INIT ─────────────────────────────────────────────────────────────────── */
renderExpenses();
updateAlloc();

/* ── TOOLTIP POSITIONING (fixed, escapes scroll-panel clipping) ───────────── */
function positionTip(tip) {
  const body = tip.querySelector('.tip-body');
  if (!body) return;
  const r = tip.getBoundingClientRect();
  const bw = body.offsetWidth || 210;
  const bh = body.offsetHeight || 60;
  let left = r.left + r.width / 2 - bw / 2;
  left = Math.max(8, Math.min(left, window.innerWidth - bw - 8));
  let top = r.top - bh - 8;
  if (top < 8) top = r.bottom + 8;   // flip below if no room above
  body.style.left = left + 'px';
  body.style.top  = top + 'px';
}
document.querySelectorAll('.tip').forEach(tip => {
  tip.addEventListener('mouseenter', () => positionTip(tip));
  tip.addEventListener('focus',      () => positionTip(tip));
});

/*
 * Three handlers on this page did two or three things in a row rather than
 * calling one function -- formatting the field, writing the figure back into
 * the model, then refreshing the total, all in the attribute.
 *
 * An action names ONE function, so each is a function now, named for what it
 * is. The statements are unchanged and in the same order; the only thing
 * that moved is where they are written. Better here anyway: an expression
 * that trims, strips non-digits and falls back to zero is code, and code in
 * an attribute is code nobody can test or set a breakpoint in.
 */
function allocAmountTyped(el) {
  formatThousandsInput(el);
  updateAlloc();
}

function expenseNameTyped(i, el) {
  expenses[i].name = el.value;
  refreshTotal();
}

function expenseAmountTyped(i, el) {
  formatThousandsInput(el);
  expenses[i].amt = el.value.trim() === ''
    ? ''
    : (parseFloat(el.value.replace(/[^0-9.]/g, '')) || 0);
  refreshTotal();
}

/* The markup names actions rather than carrying onclick attributes, which a
   Content-Security-Policy without 'unsafe-inline' blocks wherever they came
   from -- including markup this script builds itself. Only what is listed
   here can be reached from an attribute. */
window.qbActions.register({ addExpense: addExpense, allocAmountTyped: allocAmountTyped, expenseAmountTyped: expenseAmountTyped, expenseNameTyped: expenseNameTyped, formatPhoneInput: formatPhoneInput, formatThousandsInput: formatThousandsInput, openInputPanel: openInputPanel, removeExpense: removeExpense, runCalcGated: runCalcGated });
