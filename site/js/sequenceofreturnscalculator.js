/*
 * sequenceofreturnscalculator.html's own script, which used to sit inline in the page.
 *
 * It had to move: a Content-Security-Policy without 'unsafe-inline' blocks an
 * inline <script>, so inline this page would have gone dead the moment the
 * policy went on -- quietly, with the markup looking perfectly correct.
 *
 * Moved verbatim.
 */
// ---- S&P 500 actual year-end returns 2000–2019 ----
const ACTUAL_RETURNS = [
  { year: 2000, ret: -10.14 },
  { year: 2001, ret: -13.04 },
  { year: 2002, ret: -23.37 },
  { year: 2003, ret:  26.38 },
  { year: 2004, ret:   8.99 },
  { year: 2005, ret:   3.00 },
  { year: 2006, ret:  13.50 },
  { year: 2007, ret:   3.53 },
  { year: 2008, ret: -38.49 },
  { year: 2009, ret:  23.45 },
  { year: 2010, ret:  12.78 },
  { year: 2011, ret:   0.00 },
  { year: 2012, ret:  13.41 },
  { year: 2013, ret:  29.50 },
  { year: 2014, ret:  11.39 },
  { year: 2015, ret:  -0.73 },
  { year: 2016, ret:   9.54 },
  { year: 2017, ret:  19.42 },
  { year: 2018, ret:  -6.24 },
  { year: 2019, ret:  28.88 },
];
const REVERSED_RETURNS = [...ACTUAL_RETURNS].reverse().map((r, i) => ({
  year: ACTUAL_RETURNS[i].year,
  ret: r.ret
}));

function fmt(n) {
  if (n === 0) return '$0';
  const abs = Math.abs(n);
  if (abs >= 1000000) return (n < 0 ? '-' : '') + '$' + (abs / 1000000).toFixed(2) + 'M';
  return (n < 0 ? '-$' : '$') + abs.toLocaleString('en-US', { maximumFractionDigits: 0 });
}
function fmtPct(n) {
  return (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
}
function fmtShort(n) {
  const abs = Math.abs(n);
  if (abs >= 1000000) return (n < 0 ? '-' : '') + '$' + (abs / 1000000).toFixed(1) + 'M';
  if (abs >= 1000) return (n < 0 ? '-' : '') + '$' + Math.round(abs / 1000) + 'K';
  return (n < 0 ? '-$' : '$') + Math.round(abs);
}

// Sliders
// Comma formatting for portfolio input
const portfolioInput = document.getElementById('portfolio');

function parsePortfolio() {
  return parseFloat(portfolioInput.value.replace(/,/g, '')) || 1000000;
}

function formatPortfolio(val) {
  const num = parseFloat(String(val).replace(/,/g, ''));
  if (isNaN(num)) return '';
  return Math.round(num).toLocaleString('en-US');
}

portfolioInput.addEventListener('input', function() {
  const raw = this.value.replace(/[^0-9]/g, '');
  const cursor = this.selectionStart;
  const prevLen = this.value.length;
  this.value = raw ? parseInt(raw, 10).toLocaleString('en-US') : '';
  // adjust cursor for added/removed commas
  const diff = this.value.length - prevLen;
  this.setSelectionRange(cursor + diff, cursor + diff);
  updateAnnualIncome();
});

portfolioInput.addEventListener('blur', function() {
  const num = parsePortfolio();
  this.value = num.toLocaleString('en-US');
  updateAnnualIncome();
});

document.getElementById('income-pct-slider').addEventListener('input', function() {
  document.getElementById('income-pct-display').textContent = this.value + '%';
  updateAnnualIncome();
});
document.getElementById('portfolio').addEventListener('input', updateAnnualIncome);
document.getElementById('cv-rate-slider').addEventListener('input', function() {
  document.getElementById('cv-rate-display').textContent = this.value + '%';
});
document.getElementById('scenario').addEventListener('change', function() {
  document.getElementById('custom-returns-wrap').style.display = this.value === 'custom' ? 'block' : 'none';
});

function updateAnnualIncome() {
  const portfolio = parsePortfolio();
  const pct = parseFloat(document.getElementById('income-pct-slider').value) || 4;
  const annual = portfolio * pct / 100;
  document.getElementById('annual-income-display').textContent = fmt(annual);
}
updateAnnualIncome();

function getReturns() {
  const scenario = document.getElementById('scenario').value;
  if (scenario === 'actual') return ACTUAL_RETURNS;
  if (scenario === 'reversed') return REVERSED_RETURNS;
  // custom
  const raw = document.getElementById('custom-returns').value;
  const vals = raw.split(',').map(s => parseFloat(s.trim())).filter(v => !isNaN(v)).slice(0, 20);
  if (vals.length === 0) return ACTUAL_RETURNS;
  return vals.map((ret, i) => ({ year: 2000 + i, ret }));
}

function _calculateCore() {
  const startPortfolio = parsePortfolio();
  const incomePct = parseFloat(document.getElementById('income-pct-slider').value) / 100;
  const annualIncome = startPortfolio * incomePct;
  const cvGrowthRate = parseFloat(document.getElementById('cv-rate-slider').value) / 100;
  const EXPENSE_RATE = 0.035;
  const returns = getReturns();

  // We need the required CV first (from renderResults binary search) —
  // run a quick pre-solve so we know the starting CV for both scenarios.
  // Pre-solve: replicate the binary search logic inline.
  const negYearCount = returns.filter(r => r.ret < 0).length;
  function simulateCVquick(startingCV) {
    let cv = startingCV;
    for (let i = 0; i < returns.length; i++) {
      cv = cv * (1 - EXPENSE_RATE);
      if (returns[i].ret < 0) cv -= annualIncome;
      else cv = cv * (1 + cvGrowthRate);
    }
    let cv2 = startingCV, minBal = startingCV;
    for (let i = 0; i < returns.length; i++) {
      cv2 = cv2 * (1 - EXPENSE_RATE);
      if (returns[i].ret < 0) cv2 -= annualIncome;
      else cv2 = cv2 * (1 + cvGrowthRate);
      minBal = Math.min(minBal, cv2);
    }
    return minBal;
  }
  let lo = 0, hi = annualIncome * returns.length * 3;
  for (let iter = 0; iter < 60; iter++) {
    const mid = (lo + hi) / 2;
    if (simulateCVquick(mid) >= 0) hi = mid; else lo = mid;
  }
  const requiredCV = Math.ceil(hi);

  // --- Simulate both scenarios ---
  let portAll = startPortfolio;
  let cvAll  = requiredCV;      // CV balance for the "always draw" scenario
  let portSkip = startPortfolio;
  let cvSkip = requiredCV;      // CV balance for the "with policy" scenario

  let totalCashNeeded = 0;
  let rows = [];
  let maxPortfolio = startPortfolio;

  returns.forEach((r) => {
    const isNeg = r.ret < 0;

    // ---- Scenario A: always draw from portfolio; stop at $0 ----
    const portAllAfterReturn = portAll * (1 + r.ret / 100);
    cvAll = cvAll * (1 - EXPENSE_RATE);
    let cashFromPolicyAll = 0;
    let portAllAfterDist = portAllAfterReturn - annualIncome;
    if (!isNeg) cvAll = cvAll * (1 + cvGrowthRate);

    // ---- Scenario B: draw from policy in negative years, portfolio in positive ----
    const portSkipAfterReturn = portSkip * (1 + r.ret / 100);
    cvSkip = cvSkip * (1 - EXPENSE_RATE); // expenses first
    let cashFromPolicy = 0;
    let portSkipAfterDist;
    if (isNeg) {
      if (cvSkip >= annualIncome) {
        // CV covers full income draw
        cashFromPolicy = annualIncome;
        cvSkip = cvSkip - annualIncome;
        portSkipAfterDist = portSkipAfterReturn; // no draw from portfolio
      } else if (cvSkip > 0) {
        // CV partially covers — draw remainder from portfolio
        cashFromPolicy = cvSkip;
        const portDraw = annualIncome - cvSkip;
        cvSkip = 0;
        portSkipAfterDist = portSkipAfterReturn - portDraw;
      } else {
        // CV exhausted — draw full income from portfolio
        cashFromPolicy = 0;
        portSkipAfterDist = portSkipAfterReturn - annualIncome;
      }
      totalCashNeeded += cashFromPolicy;
    } else {
      portSkipAfterDist = portSkipAfterReturn - annualIncome;
      cvSkip = cvSkip * (1 + cvGrowthRate);
    }

    maxPortfolio = Math.max(maxPortfolio, Math.max(0, portSkipAfterDist));

    rows.push({
      year: r.year,
      ret: r.ret,
      isNeg,
      portAll: Math.max(0, portAllAfterDist),
      portSkip: Math.max(0, portSkipAfterDist),
      cashFromPolicy,
    });

    portAll = Math.max(0, portAllAfterDist);
    portSkip = Math.max(0, portSkipAfterDist);
  });

  const benefit = portSkip - portAll;

  renderResults(rows, annualIncome, totalCashNeeded, benefit, negYearCount, maxPortfolio, startPortfolio, cvGrowthRate);
}

function renderResults(rows, annualIncome, totalCashNeeded, benefit, negYearCount, maxPortfolio, startPortfolio, cvGrowthRate) {
  const panel = document.getElementById('results-panel');
  const EXPENSE_RATE = 0.035; // 3.5% annual policy expense drag

  // --- Year-by-year cash value simulation ---
  // We need to find the minimum starting cash value (CV) such that the policy
  // can cover every negative year's income draw after expenses are deducted each year.
  // Logic:
  //   - Each year, expenses of 2% are deducted from the CV balance first
  //   - In negative market years, the full annual income is drawn from CV
  //   - In positive years, CV earns cvGrowthRate (default 0% for IUL floor)
  //   - We solve for the starting CV by working through all years and finding
  //     the minimum required so the balance never goes below zero

  // Binary search for the minimum required starting cash value
  function simulateCV(startingCV) {
    let cv = startingCV;
    let minBalance = startingCV;
    for (let i = 0; i < rows.length; i++) {
      // Deduct annual expenses first
      cv = cv * (1 - EXPENSE_RATE);
      if (rows[i].isNeg) {
        // Draw income from policy in negative years
        cv -= annualIncome;
      } else {
        // Policy grows at cvGrowthRate in positive years
        cv = cv * (1 + cvGrowthRate);
      }
      minBalance = Math.min(minBalance, cv);
    }
    return { finalCV: cv, minBalance };
  }

  // Solve: find smallest startingCV where minBalance >= 0
  let lo = 0, hi = annualIncome * rows.length * 3;
  for (let iter = 0; iter < 60; iter++) {
    const mid = (lo + hi) / 2;
    const { minBalance } = simulateCV(mid);
    if (minBalance >= 0) hi = mid;
    else lo = mid;
  }
  const requiredCashValue = Math.ceil(hi);
  const pctOfPortfolio = (requiredCashValue / startPortfolio * 100).toFixed(1);

  // Build year-by-year CV trace for display
  let cvTrace = [];
  let cv = requiredCashValue;
  for (let i = 0; i < rows.length; i++) {
    const cvBeforeExpenses = cv;
    cv = cv * (1 - EXPENSE_RATE);
    const expenseDeducted = cvBeforeExpenses - cv;
    const cvAfterExpenses = cv;
    if (rows[i].isNeg) {
      cv -= annualIncome;
    } else {
      cv = cv * (1 + cvGrowthRate);
    }
    cvTrace.push({
      year: rows[i].year,
      isNeg: rows[i].isNeg,
      cvStart: cvBeforeExpenses,
      expenses: expenseDeducted,
      draw: rows[i].isNeg ? annualIncome : 0,
      cvEnd: cv,
    });
  }

  // Build summary cards
  const summaryHTML = `
    <div class="summary-row">
      <div class="summary-card blue">
        <div class="summary-label">Total Cash Value Needed</div>
        <div class="summary-value" style="font-size:22px;">${fmt(totalCashNeeded)}</div>
        <div class="summary-sub">${negYearCount} negative years × ${fmt(annualIncome)}/yr</div>
      </div>
      <div class="summary-card green">
        <div class="summary-label">Portfolio Benefit With Insurance</div>
        <div class="summary-value" style="font-size:22px;color:var(--green);">${fmt(Math.max(0, benefit))}</div>
        <div class="summary-sub">More portfolio with life insurance</div>
      </div>
      <div class="summary-card gold">
        <div class="summary-label">Min. Cash Value at Retirement</div>
        <div class="summary-value" style="font-size:22px;color:var(--gold);">${fmt(requiredCashValue)}</div>
        <div class="summary-sub">${pctOfPortfolio}% of portfolio · 3.5% annual expenses applied</div>
      </div>
    </div>`;

  // Build bar chart
  const maxVal = Math.max(...rows.map(r => r.portSkip), startPortfolio) * 1.05;
  const barsHTML = rows.map(r => {
    const allH = Math.max(1, (r.portAll / maxVal) * 200);
    const skipH = Math.max(1, (r.portSkip / maxVal) * 200);
    const cashH = r.isNeg ? Math.max(2, (r.cashFromPolicy / maxVal) * 200) : 0;
    return `
      <div class="bar-group">
        <div class="bar-stack" style="height:200px;gap:2px;justify-content:flex-end;">
          ${r.isNeg ? `
          <div class="bar-segment" style="height:${cashH}px;background:var(--primary);border-radius:3px 3px 0 0;" title="Cash from policy: ${fmt(r.cashFromPolicy)}">
            <span class="bar-amount">${fmtShort(r.cashFromPolicy)}</span>
          </div>` : ''}
          <div class="bar-segment" style="height:${allH}px;background:rgba(220,38,38,0.35);border-radius:${r.isNeg ? '0' : '3px 3px'} 0 0;" title="Portfolio (always draw): ${fmt(r.portAll)}">
            <span class="bar-amount">${fmtShort(r.portAll)}</span>
          </div>
        </div>
        <div class="bar-label ${r.isNeg ? 'negative-year' : ''}">${String(r.year).slice(2)}<br>${r.isNeg ? '▼' : '▲'}</div>
      </div>`;
  }).join('');

  const skipBarsHTML = rows.map(r => {
    const skipH = Math.max(1, (r.portSkip / maxVal) * 200);
    return `
      <div class="bar-group">
        <div class="bar-stack" style="height:200px;">
          <div style="flex:1;"></div>
          <div class="bar-segment" style="height:${skipH}px;background:${r.isNeg ? 'var(--primary)' : 'var(--accent)'};border-radius:3px 3px 0 0;" title="Portfolio (skip neg years): ${fmt(r.portSkip)}">
            <span class="bar-amount">${fmtShort(r.portSkip)}</span>
          </div>
        </div>
        <div class="bar-label ${r.isNeg ? 'negative-year' : ''}">${String(r.year).slice(2)}</div>
      </div>`;
  }).join('');

  // Table rows
  const tableRows = rows.map(r => {
    const portAllZero = r.portAll === 0;
    return `
    <tr class="${r.isNeg ? 'neg-row' : ''}">
      <td>${r.year}</td>
      <td class="${r.ret < 0 ? 'neg' : 'pos'}">${fmtPct(r.ret)}</td>
      <td>${r.isNeg ? `<span class="cash-needed">${fmt(r.cashFromPolicy)}</span>` : '<span class="zero">—</span>'}</td>
      <td>${portAllZero ? '<span class="neg">$0 — Depleted</span>' : fmt(r.portAll)}</td>
      <td style="color:var(--primary);font-weight:600;">${fmt(r.portSkip)}</td>
      <td style="color:${r.portSkip - r.portAll > 0 ? 'var(--green)' : 'var(--red)'};font-weight:600;">${fmt(r.portSkip - r.portAll)}</td>
    </tr>`}).join('');

  const finalRow = rows[rows.length - 1];
  const totalTable = `
    <tr>
      <td colspan="2">Final Balance</td>
      <td><span class="cash-needed">${fmt(totalCashNeeded)}</span></td>
      <td>${fmt(finalRow.portAll)}</td>
      <td style="color:var(--primary);">${fmt(finalRow.portSkip)}</td>
      <td style="color:var(--green);">${fmt(finalRow.portSkip - finalRow.portAll)}</td>
    </tr>`;

  const insightHTML = `
    <div class="insight-box">
      <div class="insight-icon">💡</div>
      <div class="insight-text">
        <h4>What this means for your policy</h4>
        <p>You need at least <strong>${fmt(requiredCashValue)}</strong> in life insurance cash value at retirement to fully cover income in every negative market year. That figure is calculated year-by-year, deducting <strong>3.5% annually for policy expenses</strong> (cost of insurance and admin fees) before each draw. That's <strong>${pctOfPortfolio}% of your portfolio</strong> — a relatively small allocation that protects the remaining ${(100 - parseFloat(pctOfPortfolio)).toFixed(1)}% from being drawn down in a bear market. By skipping distributions in those ${negYearCount} negative year${negYearCount !== 1 ? 's' : ''}, your portfolio ends <strong>${fmt(Math.max(0, benefit))} larger</strong>.</p>
      </div>
    <!-- qb:result-cta:start --><button type="button" data-qb-advisor class="qb-result-cta qb-result-cta--onlight">Have an advisor design this &rarr;</button><!-- qb:result-cta:end --></div>`;

  panel.innerHTML = `
    ${summaryHTML}
    ${insightHTML}
    <div class="chart-section">
      <div class="chart-header" data-qb-click="toggleChart" style="cursor:pointer;user-select:none;">
        <div>
          <div class="chart-title">Portfolio Value — Drawing Every Year vs. Skipping Negative Years</div>
          <div class="chart-sub">Blue bars = portfolio when policy covers negative years &nbsp;·&nbsp; Red bars = portfolio when always drawing</div>
        </div>
        <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;">
          <div class="chart-legend" id="chart-legend" style="display:none;">
            <div class="legend-item"><div class="legend-dot" style="background:var(--accent);"></div> Policy-protected</div>
            <div class="legend-item"><div class="legend-dot" style="background:rgba(220,38,38,0.5);"></div> Always drawing</div>
            <div class="legend-item"><div class="legend-dot" style="background:var(--primary);"></div> Cash from policy</div>
          </div>
          <div class="hv-menu-item" id="chart-toggle-btn" style="display:flex;align-items:center;gap:6px;padding:7px 14px;border:1.5px solid var(--border);border-radius:8px;font-size:12.5px;font-weight:700;white-space:nowrap;transition:background 0.2s;">
            <span id="chart-toggle-icon" style="font-size:11px;transition:transform 0.25s;display:inline-block;">▶</span> Show Chart
          </div>
        </div>
      </div>
      <div id="chart-body-wrap" style="display:none;overflow:hidden;">
        <div class="chart-body">
          <div style="display:flex;gap:6px;height:220px;overflow-x:auto;min-width:560px;align-items:flex-end;">
            ${rows.map((r, i) => {
              const allH = Math.max(1, (r.portAll / maxVal) * 200);
              const skipH = Math.max(1, (r.portSkip / maxVal) * 200);
              const cashH = r.isNeg ? Math.max(3, (r.cashFromPolicy / maxVal) * 200) : 0;
              return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;min-width:28px;">
                <div style="width:100%;height:200px;display:flex;align-items:flex-end;gap:2px;position:relative;">
                  <div style="flex:1;display:flex;flex-direction:column;justify-content:flex-end;height:100%;gap:1px;">
                    ${r.isNeg ? `<div style="height:${cashH}px;background:var(--primary);border-radius:3px 3px 0 0;cursor:default;" title="Cash from policy: ${fmt(r.cashFromPolicy)}"></div>` : ''}
                    <div style="height:${allH}px;background:rgba(220,38,38,0.45);border-radius:${r.isNeg ? '0' : '3px 3px'} 0 0;cursor:default;" title="Always drawing: ${fmt(r.portAll)}"></div>
                  </div>
                  <div style="flex:1;height:${skipH}px;background:${r.isNeg ? 'var(--teal)' : 'var(--accent)'};border-radius:3px 3px 0 0;align-self:flex-end;cursor:default;" title="With policy: ${fmt(r.portSkip)}"></div>
                </div>
                <div style="font-size:10px;font-weight:${r.isNeg ? '700' : '500'};color:${r.isNeg ? 'var(--red)' : 'var(--gray-mid)'};margin-top:5px;text-align:center;line-height:1.2;">${String(r.year).slice(2)}<br>${r.isNeg ? '▼' : '▲'}</div>
              </div>`;
            }).join('')}
          </div>
        </div>
      </div>
    </div>
    <div class="table-section">
      <div class="table-header">
        <div>
          <div class="table-title">Year-by-Year Breakdown</div>
          <div class="table-sub">Highlighted rows = negative market years where cash value is deployed</div>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th style="text-align:left;">Year</th>
              <th>Market Return</th>
              <th>Cash from Policy</th>
              <th>Portfolio (Always Draw)</th>
              <th>Portfolio (With Policy)</th>
              <th>Difference</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
            ${totalTable}
          </tbody>
        </table>
      </div>
    </div>
    <div style="position:relative;overflow:hidden;background:linear-gradient(145deg,var(--primary-dark) 0%,var(--primary-mid) 100%);border-radius:var(--radius-xl);padding:32px 32px 30px;box-shadow:var(--shadow-lg);">
      <div style="position:absolute;inset:0;background:radial-gradient(ellipse 70% 60% at 85% 20%,rgba(74,144,217,0.25) 0%,transparent 60%);pointer-events:none;"></div>
      <div style="position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.03) 1px,transparent 1px);background-size:40px 40px;pointer-events:none;"></div>
      <div style="position:relative;z-index:1;display:flex;align-items:center;justify-content:space-between;gap:28px;flex-wrap:wrap;">
        <div style="flex:1;min-width:260px;">
          <div style="display:inline-flex;align-items:center;gap:7px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.18);color:rgba(255,255,255,0.85);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;padding:4px 12px;border-radius:100px;margin-bottom:14px;">🛡️ Turn these numbers into a real plan</div>
          <div style="font-family:'Fraunces',serif;font-size:22px;font-weight:700;color:var(--white);line-height:1.25;margin-bottom:10px;">Let Quote-Bot design the <em style="font-style:italic;color:#93c5fd;">right policy</em> around your results</div>
          <p style="font-size:13.5px;color:rgba(255,255,255,0.65);line-height:1.7;margin:0;max-width:520px;">Your analysis shows exactly how much cash value you need at retirement. Our licensed advisors can build an IUL or whole life policy around that number — no pressure, no obligation, buy online with or without an agent.</p>
        </div>
        <div style="display:flex;flex-direction:column;gap:10px;min-width:220px;flex-shrink:0;">
          <button type="button" data-qb-advisor style="display:block;padding:14px 22px;background:var(--white);color:var(--primary);border-radius:var(--radius);font-size:14.5px;font-weight:700;text-align:center;text-decoration:none;transition:box-shadow 0.2s,transform 0.2s;">Have an advisor design this &rarr;</button>
          <a class="hv-ghost-85" href="tel:8888048590" style="display:block;padding:12px 22px;background:transparent;border-radius:var(--radius);font-size:13.5px;font-weight:600;text-align:center;text-decoration:none;border-width:1.5px;border-style:solid;transition:border-color 0.2s,color 0.2s;">📞 (888) 804-8590</a>
        </div>
      </div>
    </div>`;
}

function resetCalc() {
  gateUnlocked = false;
  document.getElementById('portfolio').value = '';
  document.getElementById('income-pct-slider').value = 4;
  document.getElementById('income-pct-display').textContent = '4%';
  document.getElementById('cv-rate-slider').value = 5.5;
  document.getElementById('cv-rate-display').textContent = '5.5%';
  document.getElementById('scenario').value = 'actual';
  document.getElementById('custom-returns-wrap').style.display = 'none';
  updateAnnualIncome();
  // Restore the gate form exactly as it was, rather than from a copy
  rememberGate();
  if (GATE_HTML !== null) document.getElementById('lead-gate').innerHTML = GATE_HTML;
  ['gate-first', 'gate-last', 'gate-phone', 'gate-email', 'gate-state'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.value = '';
  });
  var optin = document.getElementById('qb-sms-optin');
  if (optin) optin.checked = false;
  document.getElementById('results-panel').innerHTML = `
    <div class="empty-state">
      <div class="empty-icon">🔒</div>
      <div class="empty-title">Results are locked</div>
      <div class="empty-sub">Fill in your details in the form below the calculator inputs to unlock your personalized analysis.</div>
    </div>`;
  // Restore the full input/hero layout
  leadName = '';
  const hero = document.getElementById('calc-hero');
  if (hero) hero.style.display = '';
  document.getElementById('calc-grid').classList.remove('inputs-hidden');
  const left = document.getElementById('left-column');
  if (left) left.style.display = '';
  document.getElementById('editInputsBar').classList.remove('visible');
}

function toggleChart() {
  const body = document.getElementById('chart-body-wrap');
  const icon = document.getElementById('chart-toggle-icon');
  const btn = document.getElementById('chart-toggle-btn');
  const legend = document.getElementById('chart-legend');
  if (!body) return;
  const isOpen = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : 'block';
  legend.style.display = isOpen ? 'none' : 'flex';
  icon.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(90deg)';
  btn.innerHTML = `<span id="chart-toggle-icon" style="font-size:11px;transition:transform 0.25s;display:inline-block;transform:${isOpen ? 'rotate(0deg)' : 'rotate(90deg)'}">${isOpen ? '▶' : '▼'}</span> ${isOpen ? 'Show Chart' : 'Hide Chart'}`;
}

// ---- LEAD GATE ----
let gateUnlocked = false;
let leadName = '';

// ---- RESULTS LAYOUT (hide inputs + hero, show Edit Inputs bar) ----
function showResultsLayout() {
  const hero = document.getElementById('calc-hero');
  if (hero) hero.style.display = 'none';
  const grid = document.getElementById('calc-grid');
  grid.classList.add('inputs-hidden');
  const left = document.getElementById('left-column');
  if (left) left.style.display = 'none';
  const bar = document.getElementById('editInputsBar');
  document.getElementById('editInputsName').textContent = leadName || 'your projection';
  bar.classList.add('visible');
}

function openInputPanel() {
  const hero = document.getElementById('calc-hero');
  if (hero) hero.style.display = '';
  document.getElementById('calc-grid').classList.remove('inputs-hidden');
  const left = document.getElementById('left-column');
  if (left) left.style.display = '';
  document.getElementById('editInputsBar').classList.remove('visible');
  // Bring the inputs back into view
  setTimeout(() => {
    const ip = document.querySelector('.inputs-panel');
    if (ip) ip.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 80);
}

function formatPhone(el) {
  let d = el.value.replace(/\D/g, '');
  // Drop a leading US country code "1" so 11-digit entries format cleanly
  if (d.length === 11 && d[0] === '1') d = d.slice(1);
  d = d.slice(0, 10);
  let out = d;
  if (d.length > 6)      out = '(' + d.slice(0,3) + ') ' + d.slice(3,6) + '-' + d.slice(6);
  else if (d.length > 3) out = '(' + d.slice(0,3) + ') ' + d.slice(3);
  else if (d.length > 0) out = '(' + d;
  el.value = out;
}

/* ---- Quote Bot lead capture ------------------------------------------ */
function qbCaptureLead(){
  if (!window.QuoteBot) return;
  try {
    var V = function(id){ var e=document.getElementById(id); return e ? String(e.value).trim() : ""; };
    var N = function(id){ var e=document.getElementById(id); return e ? (parseFloat(String(e.value).replace(/[^0-9.\-]/g,""))||0) : null; };
    var C = function(sel){ var e=document.querySelector(sel); return e ? e.textContent.replace(/\s+/g," ").trim() : null; };
    if (!V('gate-email')) return;
    window.QuoteBot.capture({
      email: V('gate-email'), phone: V('gate-phone'),
      firstName: V('gate-first'), lastName: V('gate-last'),
      productLine: 'INDEXED_UL',
      inputs: { annualIncome: N('annualIncome'), state: V('gate-state') },
      results: null,
      consentText: C('#qb-consent') || C('.disclaimer')
    });
  } catch (e) { /* capture must never break the calculator */ }
}

function qbEsc(v) {
  /* The gate's own values go back into innerHTML below. Unescaped, a name
     containing markup executes it -- the visitor's own input, so the blast
     radius is their browser, but this is a lead form and the repo's rule is
     that nothing ever posts HTML a person wrote. */
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* The gate's own markup, kept before anything overwrites it.
 *
 * resetCalc used to rebuild this form from a second copy of the markup
 * written out longhand, and the copy had drifted: it carried no SMS
 * opt-in marker at all, so after a reset the page asked for a phone
 * number with no consent box on the form. The static-markup guard
 * could not see it, because the second copy lives inside a template
 * string. Restoring what was actually on the page removes the duplicate
 * rather than patching it, so it cannot drift again. */
var GATE_HTML = null;
function rememberGate() {
  if (GATE_HTML === null) {
    var el = document.getElementById('lead-gate');
    if (el) GATE_HTML = el.innerHTML;
  }
}

function submitGate() {
  rememberGate();
  const first = document.getElementById('gate-first').value.trim();
  const last  = document.getElementById('gate-last').value.trim();
  const phone = document.getElementById('gate-phone').value.trim();
  const email = document.getElementById('gate-email').value.trim();
  const state = document.getElementById('gate-state').value;
  const err   = document.getElementById('gate-error');

  // Validation
  /* Phone is optional; the other four are not. State decides who may take
     the lead -- routing skips an agent not licensed where they live, and a
     lead with no state skips that check altogether. */
  if (!first || !last || !email || !state) {
    err.textContent = 'Please fill in all required fields.';
    err.style.display = 'block';
    return;
  }
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!emailOk) {
    err.textContent = 'Please enter a valid email address.';
    err.style.display = 'block';
    return;
  }
  /* An empty phone passes; a half-typed one does not. */
  const phoneOk = !phone || phone.replace(/\D/g,'').length >= 10;
  if (!phoneOk) {
    err.textContent = 'Please enter a valid phone number.';
    err.style.display = 'block';
    return;
  }

  err.style.display = 'none';
  gateUnlocked = true;
  qbCaptureLead();
  leadName = (first + ' ' + last).trim() || first || 'your projection';

  // Replace gate with a success confirmation + recalculate control
  document.getElementById('lead-gate').innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;padding:18px 20px;background:var(--green-light);border-radius:var(--radius-lg);border:1.5px solid rgba(22,163,74,0.2);">
      <div style="font-size:22px;flex-shrink:0;">✅</div>
      <div>
        <div style="font-size:14px;font-weight:700;color:var(--green);margin-bottom:2px;">Results Unlocked — Thanks, ${qbEsc(first)}!</div>
        <div style="font-size:12.5px;color:var(--gray-dark);line-height:1.5;">A Quote-Bot advisor will follow up with you shortly.</div>
      </div>
    </div>
    <button class="calc-btn" data-qb-click="calculate" style="margin-top:14px;"><span>⚡</span> View Updated Results</button>
    <button class="reset-btn" data-qb-click="resetCalc" style="margin-top:10px;">Reset to defaults</button>
    <!--
      The four fields above were just destroyed by this very assignment, and
      the apply modal reads the visitor's details out of the DOM to avoid
      asking twice. Kept as hidden inputs under their original ids so the
      carry-over still finds them; no id map could have fixed this, because
      there was nothing left on the page to find.
    -->
    <input type="hidden" id="gate-first" value="${qbEsc(first)}">
    <input type="hidden" id="gate-last" value="${qbEsc(last)}">
    <input type="hidden" id="gate-phone" value="${qbEsc(phone)}">
    <input type="hidden" id="gate-email" value="${qbEsc(email)}">
    <input type="hidden" id="gate-state" value="${qbEsc(state)}">`;

  // Now run the calculation and show results
  calculate();

  // Scroll results into view
  setTimeout(() => {
    const panel = document.getElementById('results-panel');
    if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 200);
}

// Gate-aware wrapper around the core calculation
function calculate() {
  if (!gateUnlocked) {
    // Show locked state in results panel
    document.getElementById('results-panel').innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔒</div>
        <div class="empty-title">Results are locked</div>
        <div class="empty-sub">Fill in your details in the form below the calculator inputs to unlock your personalized analysis.</div>
      </div>`;
    return;
  }
  _calculateCore();
  showResultsLayout();
}

window.addEventListener('load', () => { calculate(); });

/* The markup names actions rather than carrying onclick attributes, which a
   Content-Security-Policy without 'unsafe-inline' blocks wherever they came
   from -- including markup this script builds itself. Only what is listed
   here can be reached from an attribute. */
window.qbActions.register({ calculate: calculate, formatPhone: formatPhone, openInputPanel: openInputPanel, resetCalc: resetCalc, submitGate: submitGate, toggleChart: toggleChart });
