/*
 * dimeneedscalculator.html's own script, which used to sit inline in the page.
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

/* ---------- FORMAT HELPERS ---------- */
const fmt$ = n => '$' + Math.round(n).toLocaleString('en-US');
function fmtShort(n){
  const a = Math.abs(n);
  if (a >= 1000000) return '$' + (n/1000000).toFixed(a>=10000000?1:2) + 'M';
  if (a >= 1000) return '$' + Math.round(n/1000) + 'K';
  return '$' + Math.round(n);
}
function parseNum(id){ return parseFloat(String(document.getElementById(id).value).replace(/[^0-9.]/g,'')) || 0; }
function computeAge(dobStr){
  if(!dobStr) return 0;
  const d = new Date(dobStr), n = new Date();
  let a = n.getFullYear() - d.getFullYear();
  const m = n.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && n.getDate() < d.getDate())) a--;
  return a;
}

/* ---------- GATHER INPUTS ---------- */
function getInputs(){
  const dob = document.getElementById('dob').value;
  return {
    firstName: document.getElementById('firstName').value.trim(),
    lastName:  document.getElementById('lastName').value.trim(),
    /* The raw date as well as the age. Compulife price off the date of
       birth, and a whole-year age loses whoever is a fortnight from a
       birthday -- which is a different premium, not a rounding. */
    dob: dob,
    age: computeAge(dob),
    state: document.getElementById('state').value,
    gender: document.querySelector('#genderSeg .active').dataset.val,
    tobacco: document.querySelector('#tobaccoSeg .active').dataset.val,
    uwClass: document.getElementById('uwClass').value,
    debt: { cards: parseNum('debtCards'), auto: parseNum('debtAuto'), other: parseNum('debtOther') },
    inc:  { annual: parseNum('incAnnual'), years: Math.max(1, parseNum('incYears')), ret: parseNum('incReturn'), growth: parseNum('incGrowth') },
    mort: { bal: parseNum('mortBal'), rate: parseNum('mortRate'), years: Math.max(1, parseNum('mortYears')) },
    edu:  { kids: Math.max(0, Math.round(parseNum('eduKids'))), years: Math.max(1, parseNum('eduYears')), cost: parseNum('eduCost') },
    extra:{ emergency: parseNum('emergFund'), final: parseNum('finalExp') },
    exist:{ life: parseNum('existLife'), savings: parseNum('existSavings') }
  };
}

/* ---------- CALCULATIONS ---------- */
// Debt = simple sum of line items
function calcDebt(d){
  const items = [
    { label:'Credit cards & loans', val:d.cards },
    { label:'Auto loans',           val:d.auto },
    { label:'Other debts',          val:d.other }
  ];
  return { total: items.reduce((s,i)=>s+i.val,0), items };
}

// Income = present value of a growing income stream (lump sum needed today)
function calcIncome(inc){
  const r = inc.ret/100, g = inc.growth/100;
  const rows = []; let pvTotal = 0, nominalTotal = 0;
  for (let t=1; t<=inc.years; t++){
    const nominal = inc.annual * Math.pow(1+g, t-1);
    const pv = nominal / Math.pow(1+r, t);
    pvTotal += pv; nominalTotal += nominal;
    rows.push({ t, nominal, pv });
  }
  return { total: pvTotal, nominalTotal, rows };
}

// Mortgage = remaining balance (payoff). Schedule for the "details" view.
function calcMortgage(m){
  const im = (m.rate/100)/12, nM = Math.round(m.years*12);
  let monthly;
  if (im === 0) monthly = m.bal / nM;
  else monthly = m.bal * im / (1 - Math.pow(1+im, -nM));
  // build monthly then aggregate to annual rows
  let bal = m.bal, totalInterest = 0;
  const yearly = []; let yPrin = 0, yInt = 0, yStartBal = bal;
  const balanceByYear = [bal];
  for (let k=1; k<=nM; k++){
    const interest = bal * im;
    let principal = monthly - interest;
    if (principal > bal) principal = bal;
    bal -= principal; totalInterest += interest;
    yPrin += principal; yInt += interest;
    if (k % 12 === 0 || k === nM){
      yearly.push({ year: Math.ceil(k/12), startBal: yStartBal, principal: yPrin, interest: yInt, endBal: Math.max(0,bal) });
      balanceByYear.push(Math.max(0,bal));
      yStartBal = bal; yPrin = 0; yInt = 0;
    }
  }
  return { payoff: m.bal, monthly, totalInterest, totalPaid: m.bal + totalInterest, yearly, balanceByYear, termYears: m.years };
}

// Education & Everything Else = schooling + emergency fund + final expenses
function calcEducation(e, extra){
  const perChild = e.years * e.cost;
  const children = [];
  for (let i=1; i<=e.kids; i++) children.push({ n:i, years:e.years, cost:e.cost, total:perChild });
  const eduTotal = e.kids * perChild;
  return { total: eduTotal + extra.emergency + extra.final, eduTotal, perChild, children, emergency: extra.emergency, final: extra.final };
}

/* ---------- SVG CHART BUILDERS ---------- */
// Income: bars per year (nominal) with a present-value overlay
function svgIncomeBars(inc){
  const rows = inc.rows, W = 640, H = 200, padL = 8, padR = 8, padT = 14, padB = 26;
  const maxV = Math.max(...rows.map(r=>r.nominal), 1);
  const n = rows.length;
  const gap = 5;
  const bw = (W - padL - padR - gap*(n-1)) / n;
  const plotH = H - padT - padB;
  let bars = '';
  rows.forEach((r,i)=>{
    const x = padL + i*(bw+gap);
    const hNom = (r.nominal/maxV)*plotH;
    const hPv  = (r.pv/maxV)*plotH;
    const yNom = padT + plotH - hNom;
    const yPv  = padT + plotH - hPv;
    // nominal (light) behind, present value (solid) in front
    bars += `<rect x="${x.toFixed(1)}" y="${yNom.toFixed(1)}" width="${bw.toFixed(1)}" height="${hNom.toFixed(1)}" rx="2.5" fill="#cfe0f3"></rect>`;
    bars += `<rect x="${x.toFixed(1)}" y="${yPv.toFixed(1)}" width="${bw.toFixed(1)}" height="${hPv.toFixed(1)}" rx="2.5" fill="#4a90d9"><title>Year ${r.t}: ${fmt$(r.nominal)} (PV ${fmt$(r.pv)})</title></rect>`;
    if (n <= 20){
      bars += `<text x="${(x+bw/2).toFixed(1)}" y="${H-9}" text-anchor="middle" font-size="9" fill="#8a9ab5" font-family="Plus Jakarta Sans">${r.t}</text>`;
    }
  });
  return `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${bars}<text x="${padL}" y="${H-9}" font-size="9" fill="#8a9ab5" font-family="Plus Jakarta Sans">${n>20?'Year 1':''}</text></svg>`;
}

// Mortgage: declining-balance area curve over remaining years
function svgMortgageCurve(m){
  const pts = m.balanceByYear, W = 640, H = 210, padL = 46, padR = 12, padT = 14, padB = 26;
  const maxV = pts[0] || 1, n = pts.length;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const X = i => padL + (i/(n-1))*plotW;
  const Y = v => padT + plotH - (v/maxV)*plotH;
  let line = '', area = `M ${X(0).toFixed(1)} ${Y(pts[0]).toFixed(1)} `;
  pts.forEach((v,i)=>{ const cmd = (i===0?'M':'L'); line += `${cmd} ${X(i).toFixed(1)} ${Y(v).toFixed(1)} `; if(i>0) area += `L ${X(i).toFixed(1)} ${Y(v).toFixed(1)} `; });
  area += `L ${X(n-1).toFixed(1)} ${(padT+plotH).toFixed(1)} L ${X(0).toFixed(1)} ${(padT+plotH).toFixed(1)} Z`;
  // gridlines + y labels (0, 50%, 100% of balance)
  let grid = '';
  [0,0.5,1].forEach(f=>{
    const y = padT + plotH - f*plotH;
    grid += `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${W-padR}" y2="${y.toFixed(1)}" stroke="#eef1f6" stroke-width="1"></line>`;
    grid += `<text x="${padL-8}" y="${(y+3).toFixed(1)}" text-anchor="end" font-size="9" fill="#8a9ab5" font-family="Plus Jakarta Sans">${fmtShort(maxV*f)}</text>`;
  });
  // x labels (year 0, mid, end)
  let xlab = '';
  [0, Math.floor((n-1)/2), n-1].forEach(i=>{
    xlab += `<text x="${X(i).toFixed(1)}" y="${H-8}" text-anchor="middle" font-size="9" fill="#8a9ab5" font-family="Plus Jakarta Sans">Yr ${i}</text>`;
  });
  // dots
  let dots = '';
  pts.forEach((v,i)=>{ if(i===0||i===n-1) dots += `<circle cx="${X(i).toFixed(1)}" cy="${Y(v).toFixed(1)}" r="3.5" fill="#d97706"></circle>`; });
  return `<svg class="chart-svg" viewBox="0 0 ${W} ${H}">${grid}<path d="${area}" fill="rgba(217,119,6,0.12)"></path><path d="${line}" fill="none" stroke="#d97706" stroke-width="2.5" stroke-linejoin="round"></path>${dots}${xlab}</svg>`;
}

/* ---------- RENDER DETAIL HTML PER CATEGORY ---------- */
function detailDebt(d, dc){
  const max = Math.max(...dc.items.map(i=>i.val), 1);
  const rows = dc.items.map(i=>`
    <div class="item-row">
      <div class="item-label">${i.label}</div>
      <div class="item-track"><div class="item-fill" style="width:${(i.val/max*100).toFixed(1)}%"></div></div>
      <div class="item-val">${fmt$(i.val)}</div>
    </div>`).join('');
  return `
    <p class="cat-detail-intro">Debt is paid off dollar-for-dollar, so your family isn't left servicing balances on a single income. We add up your outstanding non-mortgage debts — credit cards, auto loans, and anything else owed.</p>
    ${rows}
    <div class="insight-box blue">
      <div class="insight-icon">💡</div>
      <div class="insight-text"><h4>Why pay off debt first?</h4><p>Clearing these balances removes monthly payments that would otherwise compete with everyday living expenses — and it stops interest from quietly growing the amount owed while your family adjusts.</p></div>
    </div>`;
}

function detailIncome(inc, ic){
  const r = inc; // raw inputs ({ annual, years, ret, growth })
  const tbl = ic.rows.map(row=>`
    <tr><td>Year ${row.t}</td><td>${fmt$(row.nominal)}</td><td class="pv-cell">${fmt$(row.pv)}</td></tr>`).join('');
  return `
    <p class="cat-detail-intro">Rather than just multiplying income by years, we calculate the <strong>lump sum needed today</strong> that — invested at ${r.ret}% — could replace ${fmt$(r.annual)}/yr (growing ${r.growth}%/yr for raises &amp; inflation) for ${r.years} years. That present-value approach avoids over-insuring.</p>
    <div class="stat-strip">
      <div class="stat-box"><div class="l">Annual income</div><div class="v">${fmt$(r.annual)}</div></div>
      <div class="stat-box"><div class="l">Years replaced</div><div class="v">${r.years}</div></div>
      <div class="stat-box"><div class="l">Total paid out</div><div class="v">${fmtShort(ic.nominalTotal)}</div></div>
      <div class="stat-box"><div class="l">Lump sum today</div><div class="v accent">${fmtShort(ic.total)}</div></div>
    </div>
    <div class="chart-frame">
      <div class="chart-frame-title">Income replaced each year
        <span class="legend"><span><i style="background:#cfe0f3"></i>Income paid</span><span><i style="background:#4a90d9"></i>Present value</span></span>
      </div>
      ${svgIncomeBars(ic)}
    </div>
    <span class="toggle-schedule" data-target="incSchedule">▾ Show year-by-year table</span>
    <div class="schedule-wrap" id="incSchedule">
      <div class="detail-table-wrap"><div class="detail-table-scroll">
        <table class="detail">
          <thead><tr><th>Year</th><th>Income Needed</th><th>Present Value</th></tr></thead>
          <tbody>${tbl}</tbody>
          <tfoot><tr><td>Lump sum needed</td><td>${fmt$(ic.nominalTotal)}</td><td>${fmt$(ic.total)}</td></tr></tfoot>
        </table>
      </div></div>
    </div>`;
}

function detailMortgage(m, mc){
  const sched = mc.yearly.map(y=>`
    <tr><td>Year ${y.year}</td><td>${fmt$(y.startBal)}</td><td>${fmt$(y.principal)}</td><td>${fmt$(y.interest)}</td><td>${fmt$(y.endBal)}</td></tr>`).join('');
  return `
    <p class="cat-detail-intro">Paying off the mortgage frees your family of their largest monthly bill. The coverage need is simply today's payoff balance — but the schedule below shows how much interest you'd otherwise pay over the remaining ${mc.termYears} years.</p>
    <div class="stat-strip">
      <div class="stat-box"><div class="l">Payoff balance</div><div class="v gold">${fmtShort(mc.payoff)}</div></div>
      <div class="stat-box"><div class="l">Monthly P&amp;I</div><div class="v">${fmt$(mc.monthly)}</div></div>
      <div class="stat-box"><div class="l">Interest remaining</div><div class="v">${fmtShort(mc.totalInterest)}</div></div>
      <div class="stat-box"><div class="l">Total if paid out</div><div class="v">${fmtShort(mc.totalPaid)}</div></div>
    </div>
    <div class="chart-frame">
      <div class="chart-frame-title">Balance paid down over time</div>
      ${svgMortgageCurve(mc)}
    </div>
    <span class="toggle-schedule" data-target="mortSchedule">▾ Show amortization schedule</span>
    <div class="schedule-wrap" id="mortSchedule">
      <div class="detail-table-wrap"><div class="detail-table-scroll">
        <table class="detail">
          <thead><tr><th>Year</th><th>Beginning</th><th>Principal</th><th>Interest</th><th>Ending</th></tr></thead>
          <tbody>${sched}</tbody>
          <tfoot><tr><td>Totals</td><td>—</td><td>${fmt$(mc.payoff)}</td><td>${fmt$(mc.totalInterest)}</td><td>$0</td></tr></tfoot>
        </table>
      </div></div>
    </div>
    <div class="insight-box gold">
      <div class="insight-icon">🏠</div>
      <div class="insight-text"><h4>The hidden cost of the loan</h4><p>Over the remaining term you're scheduled to pay about <strong>${fmt$(mc.totalInterest)}</strong> in interest alone. Coverage that retires the mortgage erases that future obligation entirely.</p></div>
    </div>`;
}

function detailEducation(e, ec){
  // top-level breakdown across the three sub-buckets
  const buckets = [
    { label:'Education funding', val:ec.eduTotal },
    { label:'Emergency fund',    val:ec.emergency },
    { label:'Final expenses',    val:ec.final }
  ];
  const max = Math.max(...buckets.map(b=>b.val), 1);
  const bucketRows = buckets.map(b=>`
    <div class="item-row">
      <div class="item-label">${b.label}</div>
      <div class="item-track"><div class="item-fill" style="width:${(b.val/max*100).toFixed(1)}%;background:var(--cat-e)"></div></div>
      <div class="item-val">${fmt$(b.val)}</div>
    </div>`).join('');

  const childGrid = ec.children.length ? `
    <div class="chart-frame-title" style="margin:20px 0 10px;">Education detail</div>
    <div class="child-grid">${ec.children.map(c=>`
      <div class="child-box">
        <div class="who">🎓 Child ${c.n}</div>
        <div class="amt">${fmtShort(c.total)}</div>
        <div class="meta">${c.years} yrs × ${fmt$(c.cost)}/yr</div>
      </div>`).join('')}</div>` : '';

  return `
    <p class="cat-detail-intro">This bucket covers your children's schooling plus the cash needs that don't fit anywhere else — an <strong>emergency fund</strong> so your family isn't forced to sell assets in a crisis, and <strong>final expenses</strong> for funeral and uncovered medical costs.</p>
    ${bucketRows}
    ${childGrid}
    <div class="insight-box gold">
      <div class="insight-icon">🛟</div>
      <div class="insight-text"><h4>Why the emergency fund &amp; final expenses?</h4><p>An emergency fund (typically 3–6 months of expenses) buys your family time to grieve and regroup without rushing decisions, and final expenses of ${fmt$(ec.final)} keep funeral and medical costs off their shoulders.</p></div>
    </div>`;
}

/* ---------- QUOTE ENGINE -------------------------------------------------
 *
 * Real rates, over the same contract quotetool.html uses: POST /quote with
 * a Compulife category letter, and cards built out of nothing but what
 * comes back.
 *
 * What stood here was a table of per-$1,000 factors with two carriers
 * written into the layout. Cincinnati was always "Recommended", and the
 * "Agent-less" card priced Assurity by scaling whoever happened to be
 * cheapest on that render -- a premium no carrier had ever quoted, on a
 * page whose whole job is to tell somebody what their number costs. There
 * is no longer any way for a card here to name a price the engine did not
 * return.
 */
const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

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

let selectedTerm = 20;       // results-page control (the input panel has no term)
let currentCoverage = 0;     // rounded recommended need, set by render()
let coverageOverride = null; // user-entered coverage; null = use recommendation
let currentInp = null;       // last computed inputs, set by render()
/*
 * The four category totals AS THE SCREEN SHOWED THEM -- QBP-543.
 *
 * The record already carried the need; it did not carry its parts, so any
 * surface wanting to draw the stacked math had to recompute all four from
 * the seventeen inputs. That means a second implementation of this page's
 * arithmetic living somewhere else and drifting from this one -- and
 * calcEducation alone returns eduTotal + emergency + final, which is not
 * obvious from the field names and is exactly what a reimplementation gets
 * subtly wrong. An illustration is a record of what was on the screen, so
 * the screen's own figures go on it.
 */
let currentBreakdown = null; // { parts:[{letter,name,detail,amount}], offset, gross }

/**
 * The line under each category, composed from what they actually entered.
 *
 * "$90,000 a year for 8 years" is checkable; "Lump sum to replace
 * earnings" -- which is the page's own standing description -- is not.
 * The approved email draws the first kind, so the figures that make it up
 * are composed here, where the inputs are, rather than reassembled in the
 * backend from a breakdown that carries only totals.
 *
 * IT NAMES ONLY WHAT IS THERE. A debt line reading "credit cards, auto
 * and other balances" over a figure that is one car loan describes a
 * situation the visitor did not describe, and the whole value of the line
 * is that somebody can check it against what they typed.
 */
function detailLines(inp){
  const and = (list) => list.length < 2 ? (list[0] || '')
    : list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1];

  const debts = [
    inp.debt.cards > 0 ? 'credit cards' : null,
    inp.debt.auto  > 0 ? 'auto loans'   : null,
    inp.debt.other > 0 ? 'other balances' : null,
  ].filter(Boolean);

  const eduBits = [
    inp.edu.kids > 0 && inp.edu.cost > 0
      ? (inp.edu.kids === 1 ? 'one child' : inp.edu.kids + ' children') : null,
    inp.extra.emergency > 0 ? 'emergency fund' : null,
    inp.extra.final > 0 ? 'final costs' : null,
  ].filter(Boolean);

  return {
    D: debts.length ? 'Wiping out ' + and(debts) : '',
    I: inp.inc.annual > 0
      ? fmt$(inp.inc.annual) + ' a year for ' + inp.inc.years
        + (inp.inc.years === 1 ? ' year' : ' years')
      : '',
    M: inp.mort.bal > 0 ? 'The balance left on the loan' : '',
    E: eduBits.length ? and(eduBits).replace(/^./, (c) => c.toUpperCase()) : '',
  };
}
function effectiveCoverage(){ return coverageOverride != null ? coverageOverride : currentCoverage; }

let QUOTES = [];                   // the engine's rows: the only source of a price
let FEATURED = [];                 // the admin's picks, cheapest already excluded
let SHOWN = [];                    // what renderQuoteCards actually drew -- QBP-543
let PREMIUMS_ARE_ESTIMATES = true; // until a response says otherwise
let QUOTE_STATE = 'idle';          // idle | loading | ok | empty | error

/**
 * Term length -> Compulife category letter, read off their live list.
 *
 * The letter IS the coverage choice: '5' means 20 Year Level Term. It is
 * fetched rather than written down because the list reports the categories
 * that currently have products, so it moves as carriers file and withdraw,
 * and because their published documentation and what this licence actually
 * returns do not agree. A duration the list does not carry leaves the menu
 * rather than being offered, sent and refused.
 *
 * Only level term is taken. "20 Year Return of Premium" also begins with a
 * number and is a different product at a very different price.
 *
 * Empty is a working state, not a broken one: the quote then goes as
 * product + termYears, the older contract the engine still reads.
 */
let TERM_LETTER = {};
const TERM_CHOICES = [10, 15, 20, 30];

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
    applyTermOptions();
  } catch (err){
    /* Silent to the visitor: without a letter the quote still goes, on the
       older product + termYears contract. Logged so it is findable. */
    console.warn('[dime] live coverage list unavailable, quoting by term length', err);
  }
}
loadCoverageCategories();

/**
 * Offer only durations Compulife can currently price.
 *
 * Called on load and again after every render, because the select is part
 * of the results markup and is rebuilt with it. A no-op until the list has
 * arrived, so the four options the page ships with stand until there is
 * something better to say.
 */
function applyTermOptions(){
  const sel = document.getElementById('termSelect');
  if (!sel || !Object.keys(TERM_LETTER).length) return;
  const live = TERM_CHOICES.filter(t => TERM_LETTER[String(t)]);
  if (!live.length) return;
  if (live.indexOf(selectedTerm) === -1) selectedTerm = live.indexOf(20) !== -1 ? 20 : live[0];
  sel.innerHTML = live.map(t => '<option value="' + t + '">' + t + '-Year Term</option>').join('');
  sel.value = String(selectedTerm);
}

/* ---- Asking for the price ---------------------------------------------- */

/* The request last sent, so an edit that changes nothing does not spend a
   call against the visitor's allowance. */
let lastQuoteKey = null;
/* Replies can land out of order. Only the newest request may write. */
let quoteSeq = 0;
let quoteTimer = null;

function quoteBody(){
  const cvg = effectiveCoverage();
  if (!currentInp || !currentInp.dob || !currentInp.state || !(cvg >= 1000)) return null;
  const letter = TERM_LETTER[String(selectedTerm)];
  const body = {
    faceAmount: cvg,
    dateOfBirth: currentInp.dob,
    gender: currentInp.gender,
    tobacco: currentInp.tobacco === 'Yes',
    healthClass: currentInp.uwClass || 'Standard',
    state: currentInp.state,
    toolKey: 'dime'
  };
  /* The letter when the live list gave us one, the older shape when it did
     not -- never both, which only invites them to disagree. */
  if (letter) body.coverage = letter;
  else { body.product = 'TERM'; body.termYears = selectedTerm; }
  return body;
}

/**
 * Every field on this page recalculates the need, and the need is the face
 * amount, so any keystroke is a new quote. Each quote is a metered call on
 * one registered address, so they are coalesced: somebody typing "750000"
 * into the coverage box spends one call, not six.
 */
function requestQuotes(){
  const body = quoteBody();
  if (!body){
    QUOTE_STATE = 'idle'; QUOTES = []; FEATURED = []; lastQuoteKey = null;
    renderQuoteCards();
    return;
  }
  const key = JSON.stringify(body);
  if (key === lastQuoteKey){ renderQuoteCards(); return; }
  lastQuoteKey = key;
  QUOTE_STATE = 'loading';
  renderQuoteCards();
  if (quoteTimer) clearTimeout(quoteTimer);
  const seq = ++quoteSeq;
  quoteTimer = setTimeout(function(){ sendQuote(body, seq); }, 500);
}

/**
 * The one priced quote the engine KEEPS -- QBP-534, applied here at last.
 *
 * Every quote this page sends while somebody types is anonymous: no
 * session, so quote-engine persists nothing. That is the right default and
 * the engine says so -- "somebody who answers the analyzer out of
 * curiosity and leaves has left nothing behind."
 *
 * But it meant NOTHING was ever kept. The engine files a QuoteRequest and
 * its priced rows only when it has a contact or a session to attach them
 * to, and this page sent neither, so a D.I.M.E. lead has never had a
 * single QuoteResult behind it. Downstream: withOffers matches nothing,
 * every card comes back with no resultId, the quote page draws cards with
 * no Select button, and the automated quote email refuses the whole send
 * rather than post fewer cards than the page shows.
 *
 * So the session goes on ONE call, made when they press Calculate -- which
 * is the moment the engine's own model describes: "a calculator prices and
 * then captures, both on the same button press, about a second apart."
 *
 * NOT ON EVERY KEYSTROKE, and that is deliberate. This page re-quotes on
 * every edit; attaching the session to all of them would file a
 * QuoteRequest per edit, leave a pile of unclaimed rows behind every
 * visitor, and push past the twenty rows lead-capture reads when it goes
 * looking for the one to claim.
 */
async function keepQuote(){
  const body = quoteBody();
  if (!body) return;
  const sid = (window.QuoteBot && typeof window.QuoteBot.sessionId === 'function')
    ? window.QuoteBot.sessionId() : '';
  if (!sid) return;
  body.sessionId = sid;
  /* The debounced typing quote is superseded by this one -- letting it
     land afterwards would write a stale render over a fresh one. */
  if (quoteTimer) clearTimeout(quoteTimer);
  lastQuoteKey = JSON.stringify(body);
  await sendQuote(body, ++quoteSeq);
}

async function sendQuote(body, seq){
  const endpoint = window.QB_QUOTE_ENDPOINT || '';
  if (!/^https?:\/\//i.test(endpoint)){
    QUOTES = []; FEATURED = []; QUOTE_STATE = 'error'; lastQuoteKey = null;
    renderQuoteCards();
    return;
  }
  try {
    const res = await fetch(endpoint.replace(/\/$/, '') + '/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const json = await res.json();
    if (seq !== quoteSeq) return;   // a newer request is already in flight
    if (!res.ok || !json.ok) throw new Error(json.error || ('HTTP ' + res.status));

    PREMIUMS_ARE_ESTIMATES = json.premiumsAreEstimates !== false;

    /* One mapper for both lists. The featured picks ARE quote rows -- the
       engine selects them from the same array it returns -- so shaping them
       differently is how a card ends up disagreeing with the row below it. */
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

    QUOTES = (json.quotes || []).map(toRow);
    FEATURED = (json.featured || []).map(f => Object.assign(toRow(f), {
      /* The admin's own words, already filtered of blanks server-side.
         `curated` false means nobody chose this carrier -- it is here on
         price alone, and it gets no reasons and no claim of endorsement. */
      bullets: Array.isArray(f.bullets) ? f.bullets : [],
      badge: typeof f.badge === 'string' ? f.badge : '',
      curated: f.curated === true
    }));
    QUOTE_STATE = QUOTES.length ? 'ok' : 'empty';
  } catch (err){
    if (seq !== quoteSeq) return;
    /* The visitor gets the calm sentence in the card; whoever is debugging
       gets the reason. */
    console.error('[dime] the quote request failed', err);
    QUOTES = []; FEATURED = []; QUOTE_STATE = 'error';
    /* Null, so the next edit re-asks rather than reading the failed key as
       a question already answered. */
    lastQuoteKey = null;
  }
  renderQuoteCards();
}

/* ---- Drawing it -------------------------------------------------------- */

/* The cheapest row, found by price rather than assumed to be first -- being
   the cheapest is the entire claim the left-hand card makes. */
function cheapestQuote(rows){
  let best = null;
  for (const r of rows){
    if (typeof r.monthly !== 'number' || !isFinite(r.monthly)) continue;
    if (best === null || r.monthly < best.monthly) best = r;
  }
  return best;
}

function quoteNotice(kind, icon, html){
  return '<div class="no-need-card ' + kind + '"><span class="ic">' + icon + '</span><p>' + html + '</p></div>';
}

const CALL_US = '<a href="tel:8888048590">(888) 804-8590</a>';

/* The estimates line sits under the cards rather than in them: it is about
   the whole set, and .best-row is a row of cards. */
function renderPremiumNote(){
  const el = document.getElementById('quoteNote');
  if (!el) return;
  if (QUOTE_STATE !== 'ok' || !PREMIUMS_ARE_ESTIMATES){ el.innerHTML = ''; return; }
  el.innerHTML = '<div class="quote-estimate-note"><b>Illustrative estimates.</b> '
    + 'These premiums are modelled, not carrier-filed rates, and are not an offer of '
    + 'insurance. Your actual premium is set by the carrier after underwriting.</div>';
}

function renderQuoteCards(){
  const host = document.getElementById('quoteCards');
  if (!host) return;

  /* The record of what this function draws, emptied every time it runs so
     it cannot describe a previous render. Cleared HERE rather than beside
     the cheapest guard the way quotetool does it, because this function
     has five earlier returns -- no inputs, no date of birth, loading,
     error, nothing quoted -- and each one puts a notice on the screen
     instead of cards. SHOWN has to say so. */
  SHOWN = [];
  const cvg = effectiveCoverage();

  const done = (html) => { host.innerHTML = html; renderPremiumNote(); };

  if (!currentInp || !(cvg >= 1000)){
    return done(quoteNotice('', '\u{1F4AC}',
      'Enter a coverage amount above and we will price it with our carriers.'));
  }
  if (!currentInp.dob || !currentInp.state){
    return done(quoteNotice('wait', '\u{1F4CB}',
      'Add your date of birth and state above and we will price '
      + fmt$(cvg) + ' of cover with our carriers.'));
  }
  if (QUOTE_STATE === 'loading' || QUOTE_STATE === 'idle'){
    return done(quoteNotice('wait', '\u{23F3}',
      'Pricing ' + fmt$(cvg) + ' of ' + selectedTerm + '-year term with our carriers…'));
  }
  if (QUOTE_STATE === 'error'){
    return done(quoteNotice('warn', '\u{260E}\u{FE0F}',
      'We could not reach the quote service just now. Rather than show an estimate '
      + 'that might be wrong, we would rather have someone call you with real '
      + 'numbers — ' + CALL_US + '.'));
  }
  const cheapest = QUOTE_STATE === 'ok' ? cheapestQuote(QUOTES) : null;
  if (!cheapest){
    /*
     * Worth saying plainly, because the honest version is not "you are
     * uninsurable": this prices a fixed set of carriers at standard
     * underwriting, which is a narrow slice of the market. Rated offers,
     * simplified issue and guaranteed issue all sit outside it.
     */
    return done(quoteNotice('warn', '\u{260E}\u{FE0F}',
      '<b>No carrier on this comparison returned an offer for this profile.</b> '
      + 'That is a statement about this tool, not about you — it prices a fixed '
      + 'set of carriers at standard underwriting, and rated offers, simplified issue '
      + 'and guaranteed issue all sit outside it. Someone here would rather talk it '
      + 'through than leave you with an empty page: ' + CALL_US + '.'));
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
            <div class="best-carrier-prod">${esc(cfg.prod)} &bull; $${cfg.coverage.toLocaleString('en-US')}</div>
          </div>
          <div class="best-rating">Rating: <b>${esc(cfg.rating)}</b></div>
        </div>
        <button type="button" class="select-btn" data-qb-apply
                data-carrier-name="${esc(cfg.name)}" data-product="${esc(cfg.prod)}"
                data-coverage="${cfg.coverage}" data-premium="${cfg.monthly}">Apply Now</button>
      </div>
    </div>`;

  /* Every card is built from a row the engine returned. There is no other
     source, and that is what stops a carrier appearing at a price nobody
     quoted. */
  const fromRow = (r, extra) => cardHTML(Object.assign({
    monthly: r.monthly, annual: r.annual, logo: r.logo, name: r.name,
    prod: r.prodResolved, coverage: r.coverage, rating: r.rating
  }, extra));

  SHOWN.push({ row: cheapest, label: 'Most Affordable' });
  const cards = [ fromRow(cheapest, {
    cardClass: '', badgeClass: 'affordable', badgeText: 'Most Affordable',
    mid: `<div class="trophy">\u{1F3C6} Lowest Price</div>
          <p>The most affordable rate available for your profile.</p>`
  }) ];

  /*
   * The engine chooses these and has already excluded the cheapest carrier
   * and de-duplicated by company, so nothing here re-checks either.
   *
   * If it returned none -- an older engine, or its carrier table was
   * briefly unreadable -- fall back to price so the visitor still has three
   * to compare. Same rule the engine uses, and the same silence underneath:
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
     * A card nobody chose does not get an endorsement badge and does not
     * get reasons. It is a real carrier at a real price, shown for
     * comparison, and saying less is the honest option -- borrowing another
     * carrier's bullets or inventing generic ones would both be lying
     * quietly.
     *
     * The carrier's own tag wins over the slot's wording either way: it is
     * words typed against this carrier, so it says something true about
     * them whichever card they land on. "Why we chose them" under a carrier
     * nobody chose would describe a decision that never happened.
     */
    const tag = String(f.badge || '').trim();
    /* The slot's claim, never `tag`. The carrier's own badge is decoration
       and belongs on the card; writing it into the record would make the
       record say the agency endorsed a carrier in words nobody chose for
       that purpose -- and "Another Option" is what an uncurated card
       claims. quotetool.html says the same thing at its own push. */
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

  done(cards.join(''));
}

/* ---------- MAIN RENDER ---------- */
function render(){
  const inp = getInputs();
  const dc = calcDebt(inp.debt);
  const ic = calcIncome(inp.inc); ic.inc = inp.inc;
  const mc = calcMortgage(inp.mort);
  const ec = calcEducation(inp.edu, inp.extra);

  const gross = dc.total + ic.total + mc.payoff + ec.total;
  const offset = inp.exist.life + inp.exist.savings;
  const net = Math.max(0, gross - offset);
  const name = (inp.firstName + ' ' + inp.lastName).trim() || 'Your';
  currentInp = inp;
  currentCoverage = Math.max(0, Math.round(net/1000)*1000);
  const cats = [
    { k:'d', letter:'D', name:'Debt', desc:'Wipe out outstanding balances', amt:dc.total, detail:detailDebt(inp.debt, dc), col:'var(--cat-d)' },
    { k:'i', letter:'I', name:'Income Replacement', desc:'Lump sum to replace earnings', amt:ic.total, detail:detailIncome(inp.inc, ic), col:'var(--cat-i)' },
    { k:'m', letter:'M', name:'Mortgage Payoff', desc:'Retire the home loan', amt:mc.payoff, detail:detailMortgage(inp.mort, mc), col:'var(--cat-m)' },
    { k:'e', letter:'E', name:'Education & Everything Else', desc:'Schooling, emergency fund, final costs', amt:ec.total, detail:detailEducation(inp.edu, ec), col:'var(--cat-e)' }
  ];

  /*
   * THE RECORD OF THE STACKED MATH -- QBP-543, and it is built from
   * `cats` rather than from the four totals again, so the email cannot
   * call a category something the screen did not call it, or put them in
   * a different order.
   *
   * Below `cats` on purpose: it reads from it.
   */
  const lines = detailLines(inp);
  currentBreakdown = {
    parts: cats.map(function(c){
      return { letter: c.letter, name: c.name,
               detail: lines[c.letter] || null, amount: c.amt };
    }),
    offset: offset,
    gross: gross,
  };

  // composition segments
  const segs = cats.map(c=>`<div class="comp-seg ${c.k}" style="width:${gross>0?(c.amt/gross*100):0}%"><title>${c.name}: ${fmt$(c.amt)}</title></div>`).join('');
  const legend = cats.map(c=>`
    <div class="comp-leg-item">
      <div class="comp-leg-top"><span class="comp-leg-dot" style="background:${c.col}"></span>${c.letter} · ${c.name.split(' ')[0]}</div>
      <div class="comp-leg-val">${fmtShort(c.amt)}</div>
      <div class="comp-leg-pct">${gross>0?(c.amt/gross*100).toFixed(0):0}% of need</div>
    </div>`).join('');

  // category cards
  const cards = cats.map(c=>`
    <div class="cat-card ${c.k}" data-cat="${c.k}">
      <div class="cat-header">
        <div class="cat-badge">${c.letter}</div>
        <div class="cat-titlewrap">
          <div class="cat-name">${c.name}</div>
          <div class="cat-desc">${c.desc}</div>
        </div>
        <div class="cat-amount">${fmt$(c.amt)}<small>see details</small></div>
        <div class="cat-chevron">▾</div>
      </div>
      <div class="cat-detail">${c.detail}</div>
    </div>`).join('');

  document.getElementById('resultsContent').innerHTML = `
    <div class="analysis-for">
      <span class="analysis-for-name">${name === 'Your' ? 'Your Analysis' : name + "'s Analysis"}</span>
      <span class="analysis-for-item">Age <b>${inp.age}</b></span>
      <span class="analysis-for-item">${inp.gender}</span>
      <span class="analysis-for-item">${inp.uwClass}</span>
      <span class="analysis-for-item">${inp.state}</span>
      <span class="risk-tag">D.I.M.E. Method</span>
      <button class="edit-inputs-btn" id="editInputsBtn">✎ Edit Inputs</button>
    </div>

    <div class="headline-card">
      <div class="headline-inner">
        <div>
          <div class="headline-label">Recommended Coverage</div>
          <div class="headline-value">${fmt$(net)}</div>
          <div class="headline-sub">The total D.I.M.E. need of ${fmt$(gross)}, less ${fmt$(offset)} you already have set aside.</div>
        </div>
        <div class="headline-mini">
          <div class="headline-mini-item"><div class="v">${fmtShort(gross)}</div><div class="l">Total need</div></div>
          <div class="headline-mini-item"><div class="v minus">−${fmtShort(offset)}</div><div class="l">Resources</div></div>
        </div>
      </div>
    </div>

    <div class="quote-block">
      <div class="quote-block-head">
        <div>
          <div class="quote-block-title">Here is your recommended coverage</div>
        </div>
        <div class="quote-controls">
          <div class="qc-field">
            <label>Coverage Amount <span class="info-tip" tabindex="0">i<span class="tip-bubble">You can change your coverage amount here.</span></span></label>
            <div class="input-wrap"><span class="input-prefix">$</span><input type="text" id="coverageInput" class="has-prefix" value="${effectiveCoverage().toLocaleString('en-US')}" inputmode="numeric" data-qb-sum="Coverage amount" data-qb-sum-prefix="$"></div>
          </div>
          <div class="qc-field">
            <label>Term Length <span class="info-tip" tabindex="0">i<span class="tip-bubble">You can change the term length to match your desired coverage goal or budget.</span></span></label>
            <select id="termSelect" data-qb-sum="Term length">
              <option value="10">10-Year Term</option>
              <option value="15">15-Year Term</option>
              <option value="20">20-Year Term</option>
              <option value="30">30-Year Term</option>
            </select>
          </div>
        </div>
      </div>
      <div class="best-row" id="quoteCards"></div>
      <div id="quoteNote"></div>
    </div>

    <div class="comp-card">
      <div class="comp-head">
        <div class="comp-title">Where your coverage comes from</div>
        <div class="comp-total">Total D.I.M.E. need: <b>${fmt$(gross)}</b></div>
      </div>
      <div class="comp-bar">${segs}</div>
      <div class="comp-legend">${legend}</div>
    </div>

    ${cards}

    <div class="offset-card">
      <div class="offset-title">How we get to your number</div>
      <div class="offset-row"><span class="lbl"><span class="dot" style="background:var(--cat-d)"></span>Debt</span><span class="amt">${fmt$(dc.total)}</span></div>
      <div class="offset-row"><span class="lbl"><span class="dot" style="background:var(--cat-i)"></span>Income replacement</span><span class="amt">${fmt$(ic.total)}</span></div>
      <div class="offset-row"><span class="lbl"><span class="dot" style="background:var(--cat-m)"></span>Mortgage payoff</span><span class="amt">${fmt$(mc.payoff)}</span></div>
      <div class="offset-row"><span class="lbl"><span class="dot" style="background:var(--cat-e)"></span>Education &amp; everything else</span><span class="amt">${fmt$(ec.total)}</span></div>
      <div class="offset-row subtract"><span class="lbl"><span class="dot" style="background:var(--green)"></span>Less: existing life insurance</span><span class="amt">−${fmt$(inp.exist.life)}</span></div>
      <div class="offset-row subtract"><span class="lbl"><span class="dot" style="background:var(--green)"></span>Less: liquid savings</span><span class="amt">−${fmt$(inp.exist.savings)}</span></div>
      <div class="offset-row total"><span class="lbl">Recommended coverage</span><span class="amt">${fmt$(net)}</span></div>
    </div>

    <div class="cta-card">
      <div class="cta-inner">
        <div class="cta-eyebrow">🛡️ Ready to put this in place?</div>
        <h3>Let Quote-Bot design the <em>right policy</em> around your number</h3>
        <p>Your analysis shows a ${fmt$(net)} target. Our licensed advisors can compare term, indexed UL, and whole life options built around that figure — online, with or without an agent, and no pressure.</p>
        <div class="cta-feats">
          <div class="cta-feat"><span class="ck">✓</span> Term &amp; permanent options</div>
          <div class="cta-feat"><span class="ck">✓</span> Built around your D.I.M.E. need</div>
          <div class="cta-feat"><span class="ck">✓</span> Buy online or with an agent</div>
        </div>
        <div class="cta-actions">
          <button type="button" data-qb-advisor class="cta-primary">Have an advisor design this &rarr;</button>
          <a class="cta-secondary" href="tel:8888048590">📞 (888) 804-8590</a>
        </div>
      </div>
    </div>
  `;

  // wire collapsibles + schedule toggles for the freshly-rendered content
  const termSel = document.getElementById('termSelect');
  if (termSel){
    termSel.value = String(selectedTerm);
    termSel.addEventListener('change', ()=>{ selectedTerm = parseInt(termSel.value); requestQuotes(); });
  }
  const covInput = document.getElementById('coverageInput');
  if (covInput){
    covInput.addEventListener('input', e=>{
      const n = e.target.value.replace(/[^0-9]/g,'');
      e.target.value = n ? parseInt(n).toLocaleString('en-US') : '';
      coverageOverride = n ? parseInt(n) : 0;
      requestQuotes();
    });
  }
  /* The select is part of the markup just written, so the live durations
     are applied to the new one before anything asks it what it holds. */
  applyTermOptions();
  requestQuotes();
  const editBtn = document.getElementById('editInputsBtn');
  if (editBtn) editBtn.addEventListener('click', editInputs);
  document.querySelectorAll('.cat-header').forEach(h=>{
    h.addEventListener('click', ()=> h.closest('.cat-card').classList.toggle('open'));
  });
  document.querySelectorAll('.toggle-schedule').forEach(t=>{
    t.addEventListener('click', e=>{
      e.stopPropagation();
      const el = document.getElementById(t.dataset.target);
      const open = el.classList.toggle('show');
      t.textContent = (open ? '▴ Hide' : '▾ Show') + t.textContent.replace(/^[▾▴]\s\w+/, '');
    });
  });
}

/* ---------- INTERACTIONS ---------- */
let shown = false;
function liveUpdate(){ if (shown) render(); }

// comma-format money inputs
['debtCards','debtAuto','debtOther','incAnnual','mortBal','eduCost','emergFund','finalExp','existLife','existSavings'].forEach(id=>{
  document.getElementById(id).addEventListener('input', e=>{
    const n = e.target.value.replace(/[^0-9]/g,'');
    e.target.value = n ? parseInt(n).toLocaleString('en-US') : '';
    liveUpdate();
  });
});
// numeric / select fields
['incYears','incReturn','incGrowth','mortRate','mortYears','eduKids','eduYears','state','uwClass'].forEach(id=>{
  document.getElementById(id).addEventListener('input', liveUpdate);
  document.getElementById(id).addEventListener('change', liveUpdate);
});
['firstName','lastName'].forEach(id=> document.getElementById(id).addEventListener('input', liveUpdate));

// gender toggle
document.getElementById('genderSeg').addEventListener('click', e=>{
  if (e.target.tagName !== 'BUTTON') return;
  document.querySelectorAll('#genderSeg button').forEach(b=>b.classList.remove('active'));
  e.target.classList.add('active');
  liveUpdate();
});

// tobacco toggle
document.getElementById('tobaccoSeg').addEventListener('click', e=>{
  if (e.target.tagName !== 'BUTTON') return;
  document.querySelectorAll('#tobaccoSeg button').forEach(b=>b.classList.remove('active'));
  e.target.classList.add('active');
  liveUpdate();
});

// age pill
document.getElementById('dob').addEventListener('change', ()=>{
  document.getElementById('agePill').textContent = 'Age ' + computeAge(document.getElementById('dob').value);
  liveUpdate();
});

// US phone auto-format → (123) 456-7890
document.getElementById('phone').addEventListener('input', e=>{
  const d = e.target.value.replace(/\D/g,'').slice(0,10);
  let out = '';
  if (d.length === 0) out = '';
  else if (d.length < 4) out = '(' + d;
  else if (d.length < 7) out = '(' + d.slice(0,3) + ') ' + d.slice(3);
  else out = '(' + d.slice(0,3) + ') ' + d.slice(3,6) + '-' + d.slice(6);
  e.target.value = out;
});

// main calculate
document.getElementById('calcBtn').addEventListener('click', async ()=>{
  render();
  /*
   * AWAITED, AND IN A FINALLY -- the shape quotetool.html uses and
   * capture-waits-for-the-prices.test.mjs argues for. Awaited because
   * capture reads what the quote produced; in a finally because "a lead
   * lost because Compulife was briefly down is a worse outcome than a
   * record with no premiums in it."
   */
  try { await keepQuote(); } finally { qbCaptureLead(); }
  shown = true;
  document.getElementById('emptyState').style.display = 'none';
  document.getElementById('resultsContent').classList.add('show');
  document.querySelector('.calc-grid').classList.add('results-mode');
  document.body.classList.add('results-active');
  // open the income card by default so the "artful" detail is discoverable
  const ic = document.querySelector('.cat-card.i'); if (ic) ic.classList.add('open');
  window.scrollTo({ top: 0, behavior:'smooth' });
});

/* ---- Quote Bot lead capture ------------------------------------------ */
/**
 * Every row the engine returned, with a label on the ones that were drawn.
 *
 * NOT JUST THE THREE. The full list is the evidence of what was available
 * at that moment, which is what answers a disputed price; the labels are
 * what say which three were on the screen and what each was called. One
 * array, written by the renderer, read here -- so the screen and the
 * record cannot disagree.
 *
 * Matched on carrier and premium rather than identity, because FEATURED
 * rows are rebuilt by toRow and are not the same objects as QUOTES rows.
 * A drawn card that matches nothing is appended rather than dropped: a
 * card that was on the screen has to be in the record of what was on the
 * screen.
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
    var V = function(id){ var e=document.getElementById(id); return e ? String(e.value).trim() : ""; };
    var N = function(id){ var e=document.getElementById(id); return e ? (parseFloat(String(e.value).replace(/[^0-9.\-]/g,""))||0) : null; };
    var C = function(sel){ var e=document.querySelector(sel); return e ? e.textContent.replace(/\s+/g," ").trim() : null; };
    var inp = getInputs();
    if (!V('email')) return;
    window.QuoteBot.capture({
      email: V('email'), phone: V('phone'),
      firstName: inp.firstName, lastName: inp.lastName,
      productLine: 'TERM_LIFE',
      inputs: inp,
      /* The premiums sent here are the ones that were DISPLAYED, which is
         what you want on file if a quoted price is ever disputed. Empty on
         the first submit, because the quote is still in flight then -- and
         an empty list is the truth about what they had been shown. */
      premiumsAreEstimates: PREMIUMS_ARE_ESTIMATES,
      results: {
        totalCoverageNeed: currentCoverage || null,
        breakdown: currentBreakdown,
        quotedCoverage: (typeof effectiveCoverage === 'function' ? effectiveCoverage() : null),
        termYears: selectedTerm,
        quotes: shownResults()
      },
      consentText: C('#qb-consent')
    });
  } catch (e) { /* capture must never break the calculator */ }
}

// "Edit Inputs" on the results page brings the input panel back
function editInputs(){
  document.querySelector('.calc-grid').classList.remove('results-mode');
  document.body.classList.remove('results-active');
  document.querySelector('.left-col').scrollIntoView({ behavior:'smooth', block:'start' });
}

// reset
/* Reset means an empty form, not somebody else's file. Kept as a field
   list so Reset still clears every input rather than the ones a
   later edit happened to remember. */
const DEFAULTS = {
  firstName: '',
  lastName: '',
  dob: '',
  gender: '',
  state: '',
  uwClass: '',
  debtCards: '',
  debtAuto: '',
  debtOther: '',
  incAnnual: '',
  incYears: '',
  incReturn: '',
  incGrowth: '',
  mortBal: '',
  mortRate: '',
  mortYears: '',
  eduKids: '',
  eduYears: '',
  eduCost: '',
  emergFund: '',
  finalExp: '',
  existLife: '',
  existSavings: '',
}
document.getElementById('resetBtn').addEventListener('click', ()=>{
  Object.entries(DEFAULTS).forEach(([id,v])=>{
    const el = document.getElementById(id); if (el) el.value = v;
  });
  document.querySelectorAll('#genderSeg button').forEach(b=>b.classList.toggle('active', b.dataset.val==='Male'));
  document.querySelectorAll('#tobaccoSeg button').forEach(b=>b.classList.toggle('active', b.dataset.val==='No'));
  document.getElementById('agePill').textContent = 'Age ' + computeAge(DEFAULTS.dob);
  liveUpdate();
});

/* ---------- PREFILL FROM THE QUERY STRING ----------
   The inline DIME card on /life-insurance/ asks for five numbers and used to
   throw them away: its button opened this page empty, so the visitor typed
   all five again.

   Every value is pushed through the field's own 'input' handler rather than
   assigned, so it gets the same comma formatting as typing and the totals
   recalculate the way they would for a person.

   Four arrive in the field that means the same thing. Education does not:
   the card asks for a total and this page asks for cost per child per year,
   and the number is placed in the latter. Children to Fund and Years Each are
   deliberately left empty — this page multiplies the three together, so
   seeding them with invented 1s would turn the visitor's first correction
   into a figure nobody intended.

   Nothing is submitted; the numbers are filled in and the page recalculates.  */
/* ---------- REDEEM A HANDOFF ----------
   The assistant collected a name, and will collect an email and a date of
   birth once the interview lands (QBP-185). None of that belongs in a query
   string, so the link carries a token and the values come back over HTTPS.
   See amplify/functions/shared/handofftoken.ts.

   READ FIRST, because prefillFromQuery below calls tidyQuery, which keeps
   the attribution params and drops everything else — `h` included. That is
   the behaviour we want and the reason this sits above it rather than
   below.

   SILENT ON FAILURE. An expired or spent token leaves the form exactly as
   it would have been without a link at all, which is a form somebody fills
   in. A red banner about a token would be a page explaining its own
   plumbing to a person who just wants a number.  */
(function redeemHandoff() {
  var token;
  try {
    token = new URLSearchParams(location.search).get('h');
  } catch (e) { return; }
  if (!token) return;

  var ENDPOINT = 'https://api.quote-bot.com/chat/';

  /* Identity and underwriting, which the premium depends on even though
     the needs number does not. */
  var IDENTITY = ['firstName', 'lastName', 'email', 'phone', 'dob', 'state',
    'uwClass'];

  /*
   * THE SEVENTEEN THE NUMBER IS BUILT FROM -- QBP-545, for the quote
   * page's Edit button. All of them or none: a handoff carrying a chosen
   * few would be making the calculation by deciding what to leave out,
   * and leaving a field out is never neutral here. Blank emergency fund
   * and final expenses silently zero half the E; blank return and growth
   * collapse income replacement to annual x years, which recommends MORE
   * cover than a discounted figure would.
   *
   * The same list prefillFromQuery can reach, which is the point --
   * dime-prefill.test.mjs derives it from getInputs() rather than
   * repeating it, so a new field on the form fails until it is carried
   * here too.
   */
  var FIGURES = ['debtCards', 'debtAuto', 'debtOther',
    'incAnnual', 'incYears', 'incReturn', 'incGrowth',
    'mortBal', 'mortRate', 'mortYears',
    'eduKids', 'eduYears', 'eduCost',
    'emergFund', 'finalExp',
    'existLife', 'existSavings'];

  var FIELDS = IDENTITY.concat(FIGURES);

  /*
   * THE TWO ANSWERS THAT ARE NOT FIELDS. Sex and tobacco are segmented
   * buttons, not inputs, so `el.value` reaches neither -- getInputs reads
   * them as `#genderSeg .active`. A handoff that filled every box and
   * left these on their defaults would quote a male non-smoker's rates
   * under somebody else's name, with the form looking complete.
   */
  var SEGMENTS = { gender: 'genderSeg', tobacco: 'tobaccoSeg' };

  fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ redeem: token }),
  })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (res) {
      if (!res || !res.handoff) return;
      var filled = 0;
      FIELDS.forEach(function (f) {
        var v = res.handoff[f];
        if (typeof v !== 'string' || !v) return;
        var el = document.getElementById(f);
        if (!el) return;
        /* A <select> can only hold a value it has an option for. Setting
           one it does not know leaves it blank, which reads as the handoff
           having silently dropped the field. */
        if (el.tagName === 'SELECT'
          && !Array.prototype.some.call(el.options, function (o) { return o.value === v; })) {
          return;
        }
        el.value = v;
        /* Through the field's own listener, so it formats and recalculates
           the way typing would — the same rule prefillFromQuery follows. */
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        filled += 1;
      });
      Object.keys(SEGMENTS).forEach(function (key) {
        var want = res.handoff[key];
        if (typeof want !== 'string' || !want) return;
        var seg = document.getElementById(SEGMENTS[key]);
        if (!seg) return;
        var hit = null;
        Array.prototype.forEach.call(seg.querySelectorAll('button'), function (b) {
          if (b.dataset.val === want) hit = b;
        });
        /* A value this control has no button for is dropped, exactly as a
           <select> value with no option is above. */
        if (!hit) return;
        /* CLICKED, NOT CLASS-TOGGLED. The page's own handler is what moves
           the active mark and calls liveUpdate; a class set from outside
           leaves the control looking right and the number stale. */
        if (!hit.classList.contains('active')) hit.click();
        filled += 1;
      });

      /* The age pill and the quote read the date of birth, and neither
         updates off an input event alone. */
      if (filled) { try { liveUpdate(); } catch (e) {} }

      /*
       * NOTHING IS SUBMITTED. The figures are in and the totals have
       * moved; pressing Calculate is theirs. prefillFromQuery has said
       * the same since QBP-183, and it matters more here: Calculate runs
       * a quote and files a capture, and doing that because somebody
       * clicked Edit would put a lead in the system they never asked for.
       */
    })
    .catch(function () { /* Offline, blocked, refused. The form still works. */ });
})();

(function prefillFromQuery() {
  var q = new URLSearchParams(location.search);
  if (![...q.keys()].length) return;

  var MAP = [
    ['debt', 'debtOther'],      // an unsplit total belongs in the unspecified bucket
    ['income', 'incAnnual'],
    ['years', 'incYears'],
    ['mortgage', 'mortBal'],
    ['education', 'eduCost'],   // the card's total, into cost per child per year

    /* ---- the chat's keys, added for the in-chat interview (QBP-183) ----
       The card above sends five numbers from a form it drew itself. The
       assistant collects its numbers one question at a time and knows which
       is which, so it can fill the fields the card could not.

       WHY THESE AND NOT OTHERS. `existing` is the offset: without it a
       visitor with $250k of group life through work is handed a figure
       $250k too high, and nothing on the page says the calculation assumed
       they had none. That is the one that produces a confidently wrong
       number rather than an incomplete one.

       EDUCATION TAKES ALL THREE OR IT IS WORTH NOTHING. Line ~997 computes
       kids x years x cost, with years falling back to 1 and the other two
       to 0, so `kids` on its own contributes exactly zero -- the question
       was asked, the answer was carried, and the total did not move. Either
       a caller sends enough to multiply or it sends none of it. Nothing
       here invents the missing one: the note above about seeding Children
       to Fund with an invented 1 applies just as much to a cost.

       `educost` after `education` on purpose. They land in the same field,
       the card's key is a total and the chat's is a genuine per-child
       figure, and when both arrive the explicit one should win. MAP order
       is what decides that, so it is stated rather than left to luck. */
    ['kids', 'eduKids'],
    ['eduyears', 'eduYears'],
    ['educost', 'eduCost'],

    /* THE REST OF THE E, which is not only education.
       calcEducation returns eduTotal + emergency + final, so these two are
       half the category and both default to blank. A caller that fills the
       schooling and skips these has not produced a smaller answer, it has
       produced one with the funeral left out -- and final expenses is the
       figure that applies to everybody, including the visitor with no
       children and no mortgage, for whom it is the entire E. */
    ['emergency', 'emergFund'],
    ['final', 'finalExp'],

    ['existing', 'existLife'],
    ['savings', 'existSavings'],

    /* ---- EVERY FIELD THE NEEDS NUMBER READS, not a chosen few ----
       getInputs() feeds seventeen fields into gross = debt + income +
       mortgage payoff + E, less what they already have. All seventeen are
       reachable from here, and dime-prefill.test.mjs derives that list from
       getInputs() itself rather than repeating it, so a new field on the
       form is a failing test until it can be carried too.

       THE ASSISTANT DOES NOT DO THIS ARITHMETIC. It collects answers and
       hands them over; this page computes. A collector that carried only
       the fields somebody judged important would be making the calculation
       by choosing what to leave out, which is the same thing wearing a
       different hat -- and leaving a field out is never neutral. Blank
       emergency fund and final expenses silently zero half the E; blank
       return and growth collapse income replacement to annual x years,
       which recommends MORE cover than a discounted figure would, and we
       sell the policy.

       The three split debts arrive separately now. `debt` stays as the
       card's unsplit total and still lands in the unspecified bucket. */
    ['debtcards', 'debtCards'],
    ['debtauto', 'debtAuto'],
    ['increturn', 'incReturn'],
    ['incgrowth', 'incGrowth'],
    ['mortrate', 'mortRate'],
    ['mortyears', 'mortYears'],
  ];

  var filled = 0;
  MAP.forEach(function (m) {
    // Whole value or nothing. Stripping the stray characters out of
    // "12three4" would quietly put 124 into a money field, which is worse
    // than ignoring it: the visitor sees a number they never typed.
    var raw = (q.get(m[0]) || '').replace(/[\s,$]/g, '');
    if (!/^\d+(\.\d+)?$/.test(raw)) return;
    var el = document.getElementById(m[1]);
    if (!el) return;
    el.value = raw;
    // The page's own listener formats the number and refreshes the totals.
    el.dispatchEvent(new Event('input', { bubbles: true }));
    filled++;
  });

  if (filled) { try { liveUpdate(); } catch (e) {} }

  /* Take the answers out of the address bar once they are in the form. */
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
