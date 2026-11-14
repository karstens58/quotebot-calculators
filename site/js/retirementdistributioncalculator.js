/*
 * retirementdistributioncalculator.html's own script, which used to sit inline in the page.
 *
 * It had to move: a Content-Security-Policy without 'unsafe-inline' blocks an
 * inline <script>, so inline this page would have gone dead the moment the
 * policy went on -- quietly, with the markup looking perfectly correct.
 *
 * Moved verbatim.
 */
// ── SLIDER ──────────────────────────────────────────────────────────────────
const slider = document.getElementById('taxSlider');
const taxPct = document.getElementById('taxPct');
function updateSlider() {
  const v = parseInt(slider.value);
  const pct = (v / 45) * 100;
  slider.style.setProperty('--val', pct + '%');
  taxPct.textContent = v;
  document.getElementById('qualTaxBadge').textContent = v + '% ordinary income tax';
}
slider.addEventListener('input', updateSlider);
updateSlider();

// ── INFLATION SLIDER ─────────────────────────────────────────────────────────
const inflSlider = document.getElementById('inflSlider');
function updateInflSlider() {
  const v = parseFloat(inflSlider.value);
  document.getElementById('inflDisp').textContent = v + '%';
  const base = parseFloat(document.getElementById('targetIncome').value) || 80000;
  const yr20 = Math.round(base * Math.pow(1 + v / 100, 20) / 1000);
  document.getElementById('inflExample').textContent = yr20 + 'k';
}
inflSlider.addEventListener('input', updateInflSlider);
document.getElementById('targetIncomeDisplay').addEventListener('input', updateInflSlider);
updateInflSlider();

// ── CURRENCY & PERCENT INPUT HELPERS ─────────────────────────────────────────
function setupCurrencyInput(displayId, hiddenId) {
  const disp = document.getElementById(displayId);
  const hid  = document.getElementById(hiddenId);
  disp.addEventListener('focus', () => {
    disp.value = hid.value || '';
  });
  disp.addEventListener('input', () => {
    hid.value = parseFloat(disp.value.replace(/[^0-9.]/g, '')) || 0;
  });
  disp.addEventListener('blur', () => {
    const raw = parseFloat(hid.value) || 0;
    hid.value = raw;
    disp.value = raw > 0 ? Math.round(raw).toLocaleString('en-US') : '0';
  });
  disp.addEventListener('keydown', e => { if (e.key === 'Enter') disp.blur(); });
}

function setupPercentInput(displayId, hiddenId) {
  const disp = document.getElementById(displayId);
  const hid  = document.getElementById(hiddenId);
  disp.addEventListener('focus', () => {
    disp.value = hid.value || '';
  });
  disp.addEventListener('input', () => {
    hid.value = parseFloat(disp.value.replace(/[^0-9.]/g, '')) || 0;
  });
  disp.addEventListener('blur', () => {
    const raw = parseFloat(hid.value) || 0;
    hid.value = raw;
    disp.value = raw.toFixed(1) + '%';
  });
  disp.addEventListener('keydown', e => { if (e.key === 'Enter') disp.blur(); });
}

setupCurrencyInput('qualValDisplay',   'qualVal');
setupCurrencyInput('rothValDisplay',   'rothVal');
setupCurrencyInput('nonqValDisplay',   'nonqVal');
setupCurrencyInput('targetIncomeDisplay', 'targetIncome');
setupPercentInput('qualGrowAccDisplay',  'qualGrowAcc');
setupPercentInput('rothGrowAccDisplay',  'rothGrowAcc');
setupPercentInput('nonqGrowAccDisplay',  'nonqGrowAcc');

// ── LI POOL CURRENCY INPUT ───────────────────────────────────────────────────
const liPoolDisplay = document.getElementById('liPoolDisplay');
const liPoolHidden  = document.getElementById('liPool');
function parseCurrency(s) {
  return parseFloat(s.replace(/[^0-9.]/g, '')) || 0;
}
function formatCurrency(n) {
  return Math.round(n).toLocaleString('en-US');
}
let liPoolDebounce = null;
liPoolDisplay.addEventListener('input', () => {
  const raw = parseCurrency(liPoolDisplay.value) || 0;
  liPoolHidden.value = raw;
  clearTimeout(liPoolDebounce);
  liPoolDebounce = setTimeout(() => {
    if (document.getElementById('resultsArea').classList.contains('visible')) runLI();
  }, 400);
});
liPoolDisplay.addEventListener('blur', () => {
  clearTimeout(liPoolDebounce);
  const raw = parseCurrency(liPoolDisplay.value) || 0;
  liPoolHidden.value = raw;
  liPoolDisplay.value = formatCurrency(raw);
  if (document.getElementById('resultsArea').classList.contains('visible')) runLI();
});
liPoolDisplay.addEventListener('focus', () => {
  liPoolDisplay.value = liPoolHidden.value || '';
});
liPoolDisplay.addEventListener('keydown', e => {
  if (e.key === 'Enter') liPoolDisplay.blur();
});

// ── DRAG & DROP ──────────────────────────────────────────────────────────────
let dragSrc = null;
document.querySelectorAll('.drag-item').forEach(el => {
  el.addEventListener('dragstart', e => { dragSrc = el; el.classList.add('dragging'); });
  el.addEventListener('dragend', () => { dragSrc.classList.remove('dragging'); updateRanks(); });
  el.addEventListener('dragover', e => { e.preventDefault(); el.classList.add('drag-over'); });
  el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
  el.addEventListener('drop', e => {
    e.preventDefault();
    el.classList.remove('drag-over');
    if (dragSrc && dragSrc !== el) {
      const list = document.getElementById('dragList');
      const items = [...list.children];
      const si = items.indexOf(dragSrc), ti = items.indexOf(el);
      if (si < ti) list.insertBefore(dragSrc, el.nextSibling);
      else list.insertBefore(dragSrc, el);
      updateRanks();
    }
  });
});
function updateRanks() {
  document.querySelectorAll('.drag-item').forEach((el, i) => {
    const acct = el.dataset.acct;
    const rankEl = document.getElementById('rank-' + acct);
    if (rankEl) rankEl.textContent = i + 1;
  });
}

// ── TOOLTIP POSITIONING ──────────────────────────────────────────────────────
// Tooltips use position:fixed so they escape the left-panel overflow stacking
// context and never get clipped by the right panel.
document.querySelectorAll('.info-tooltip-wrap').forEach(wrap => {
  const icon    = wrap.querySelector('.info-icon');
  const tooltip = wrap.querySelector('.info-tooltip');
  if (!icon || !tooltip) return;

  function showTip() {
    const r = icon.getBoundingClientRect();
    tooltip.style.display = 'block';
    // Try to position to the right of the icon; if it overflows the viewport, flip left
    const tipW = 200;
    const spaceRight = window.innerWidth - r.right - 8;
    if (spaceRight >= tipW) {
      tooltip.style.left  = (r.right + 8) + 'px';
    } else {
      tooltip.style.left  = Math.max(8, r.left - tipW - 8) + 'px';
    }
    // Vertically center on icon, clamp to viewport
    let top = r.top + r.height / 2 - tooltip.offsetHeight / 2;
    top = Math.max(8, Math.min(top, window.innerHeight - tooltip.offsetHeight - 8));
    tooltip.style.top = top + 'px';
  }

  icon.addEventListener('mouseenter', showTip);
  icon.addEventListener('mousemove', showTip);
  icon.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });
});

// ── COLLAPSIBLE CARDS ────────────────────────────────────────────────────────
function toggleCard(cardId, canvasId) {
  const card = document.getElementById(cardId);
  const isOpen = card.classList.toggle('open');
  if (isOpen && canvasId) {
    requestAnimationFrame(() => {
      const chart = Chart.getChart(canvasId);
      if (chart) chart.resize();
    });
  }
}

function toggleTableSection(wrapperId) {
  const wrap   = document.getElementById(wrapperId);
  const bodyId = wrapperId === 'tableAWrap' ? 'tableABody' : 'tableBBody';
  const togId  = wrapperId === 'tableAWrap' ? 'tableAToggle' : 'tableBToggle';
  const body   = document.getElementById(bodyId);
  const tog    = document.getElementById(togId);
  const isOpen = body.style.display === 'none';
  body.style.display = isOpen ? 'block' : 'none';
  tog.style.transform = isOpen ? 'rotate(180deg)' : '';
  tog.style.background = isOpen
    ? (wrapperId === 'tableBWrap' ? 'rgba(79,70,229,0.15)' : 'var(--accent-light)')
    : (wrapperId === 'tableBWrap' ? 'rgba(79,70,229,0.08)' : 'var(--off-white)');
  tog.style.color = isOpen
    ? (wrapperId === 'tableBWrap' ? '#4338ca' : 'var(--primary)')
    : 'var(--gray-mid)';
}

// ── HELPERS ──────────────────────────────────────────────────────────────────
function fmt(n) {
  if (n === 0) return '—';
  const abs = Math.abs(Math.round(n));
  return (n < 0 ? '-$' : '$') + abs.toLocaleString();
}
function fmtFull(n) {
  return (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString();
}

// ── S&P 500 HISTORICAL ANNUAL RETURNS 1928–2024 ───────────────────────────────
const SP500 = {
  1928:43.81,1929:-8.30,1930:-25.12,1931:-43.84,1932:-8.64,1933:49.98,
  1934:-1.19,1935:46.74,1936:31.94,1937:-35.34,1938:29.28,1939:-1.10,
  1940:-10.67,1941:-12.77,1942:19.17,1943:25.06,1944:19.03,1945:35.82,
  1946:-8.43,1947:5.20,1948:5.70,1949:18.30,1950:30.81,1951:23.68,
  1952:18.15,1953:-1.21,1954:52.56,1955:32.60,1956:7.44,1957:-10.46,
  1958:43.72,1959:12.06,1960:0.34,1961:26.64,1962:-8.81,1963:22.61,
  1964:16.42,1965:12.40,1966:-9.97,1967:23.80,1968:10.81,1969:-8.24,
  1970:3.56,1971:14.22,1972:18.76,1973:-14.31,1974:-25.90,1975:37.00,
  1976:23.83,1977:-6.98,1978:6.51,1979:18.52,1980:31.74,1981:-4.70,
  1982:20.42,1983:22.34,1984:6.15,1985:31.24,1986:18.49,1987:5.81,
  1988:16.54,1989:31.48,1990:-3.06,1991:30.23,1992:7.49,1993:9.97,
  1994:1.33,1995:37.20,1996:22.68,1997:33.10,1998:28.34,1999:20.89,
  2000:-9.03,2001:-11.85,2002:-21.97,2003:28.36,2004:10.74,2005:4.83,
  2006:15.61,2007:5.48,2008:-36.55,2009:25.94,2010:14.82,2011:2.10,
  2012:15.89,2013:32.15,2014:13.52,2015:1.38,2016:11.77,2017:21.61,
  2018:-4.23,2019:31.21,2020:18.02,2021:28.47,2022:-18.04,2023:26.06,
  2024:24.88
};

// ── CHART INSTANCES ──────────────────────────────────────────────────────────
let accumCI = null, distCI = null, balCI = null, liCI = null, liBalCI = null;

// ── SHARED STATE (set by runCalc, consumed by runLI) ────────────────────────
let _retQ=0, _retR=0, _retN=0, _distYrs=0, _retAge=0, _endAge=0;
let _target=0, _inflRate=0, _taxRate=0, _cgRate=0;
let _qualGA=0, _rothGA=0, _nonqGA=0;
let _order=[], _rows=[], _bQ=[], _bR=[], _bN=[], _dLabels=[], _dQW=[], _dTax=[], _shortfallYrs=0;
let _spSeq=[], _accumYrs=0;  // S&P 500 year sequence and accumulation years

// ── STRATEGY B: STANDALONE LI CALCULATOR ────────────────────────────────────
function runLI() {
  if (!_retQ && !_retR && !_retN) return; // runCalc hasn't fired yet

  const liPoolStart = parseFloat(document.getElementById('liPool').value) || 0;
  let liPool = liPoolStart;
  let bq2 = _retQ, br2 = _retR, bn2 = _retN;
  const liRows = [];
  const bQB = [_retQ];
  const bLI = [liPoolStart];

  const LI_GROSS = 0.045;
  const LI_EXPENSE = 0.035;
  const LI_NET = LI_GROSS - LI_EXPENSE; // 1.0% net

  for (let i = 0; i < _distYrs; i++) {
    const age = _retAge + i;
    const yearTarget = _target * Math.pow(1 + _inflRate, i);
    const spRet = i < _spSeq.length ? SP500[_spSeq[i]] / 100 : _qualGA;
    // Investment accounts grow with S&P returns
    bq2 = Math.max(0, bq2 * (1 + spRet));
    br2 = Math.max(0, br2 * (1 + spRet));
    bn2 = Math.max(0, bn2 * (1 + spRet));
    // LI pool grows at fixed net rate — completely independent of market
    liPool = Math.max(0, liPool * (1 + LI_NET));

    let q2draw = 0, r2draw = 0, n2draw = 0, q2tax = 0, n2tax = 0, liPays = 0;
    let incomeDelivered = 0;

    for (const acct of _order) {
      if (incomeDelivered >= yearTarget - 0.01) break;
      const stillNeed = yearTarget - incomeDelivered;
      if (acct === 'qual' && bq2 > 0) {
        // How much tax can LI cover this year?
        const liAvailable = liPool;
        if (liAvailable > 0) {
          // LI has funds — draw only what's needed for income (no gross-up)
          const draw = Math.min(stillNeed, bq2);
          const taxOwed = draw * _taxRate;
          const liCover = Math.min(taxOwed, liAvailable);
          const uncoveredTax = taxOwed - liCover;
          liPool = Math.max(0, liPool - liCover);
          liPays += liCover;
          // If LI covers all tax: full draw is spendable
          // If LI runs out mid-year: gross up extra to cover uncovered portion
          if (uncoveredTax > 0.01) {
            // Need to gross up to cover the uncovered tax from the account itself
            const extraGross = _taxRate < 1 ? uncoveredTax / (1 - _taxRate) : uncoveredTax;
            const totalDraw = Math.min(draw + extraGross, bq2);
            const totalTax = totalDraw * _taxRate;
            const additionalLI = Math.min(totalTax - liCover, liPool);
            liPool = Math.max(0, liPool - additionalLI);
            liPays += additionalLI;
            q2draw += totalDraw; q2tax += totalTax; bq2 = Math.max(0, bq2 - totalDraw);
            incomeDelivered += totalDraw - (totalTax - liCover - additionalLI);
          } else {
            q2draw += draw; q2tax += taxOwed; bq2 = Math.max(0, bq2 - draw);
            incomeDelivered += draw;
          }
        } else {
          // No LI available — revert to standard gross-up (identical to Strategy A)
          const gross = _taxRate < 1 ? Math.min(stillNeed / (1 - _taxRate), bq2) : Math.min(bq2, stillNeed);
          const after = gross * (1 - _taxRate);
          q2draw += gross; q2tax += gross * _taxRate; bq2 = Math.max(0, bq2 - gross);
          incomeDelivered += after;
        }
      } else if (acct === 'roth' && br2 > 0) {
        const take = Math.min(stillNeed, br2);
        r2draw += take; br2 = Math.max(0, br2 - take); incomeDelivered += take;
      } else if (acct === 'nonq' && bn2 > 0) {
        if (liPool > 0) {
          // Draw only the net income needed — LI covers the LTCG tax
          const draw = Math.min(stillNeed, bn2);
          const taxOwed = draw * _cgRate;
          const liCover = Math.min(taxOwed, liPool);
          const uncoveredTax = taxOwed - liCover;
          liPool = Math.max(0, liPool - liCover);
          liPays += liCover;
          if (uncoveredTax > 0.01) {
            // Gross up to cover uncovered portion from the account
            const extraGross = _cgRate < 1 ? uncoveredTax / (1 - _cgRate) : uncoveredTax;
            const totalDraw = Math.min(draw + extraGross, bn2);
            const totalTax = totalDraw * _cgRate;
            const additionalLI = Math.min(totalTax - liCover, liPool);
            liPool = Math.max(0, liPool - additionalLI);
            liPays += additionalLI;
            n2draw += totalDraw; n2tax += totalTax; bn2 = Math.max(0, bn2 - totalDraw);
            incomeDelivered += totalDraw - (totalTax - liCover - additionalLI);
          } else {
            n2draw += draw; n2tax += taxOwed; bn2 = Math.max(0, bn2 - draw);
            incomeDelivered += draw;
          }
        } else {
          // No LI — standard gross-up
          const gross = _cgRate < 1 ? Math.min(stillNeed / (1 - _cgRate), bn2) : Math.min(bn2, stillNeed);
          const after = gross * (1 - _cgRate);
          n2draw += gross; n2tax += gross * _cgRate; bn2 = Math.max(0, bn2 - gross); incomeDelivered += after;
        }
      }
    }
    const shortfallB = incomeDelivered < yearTarget - 0.01;
    const invBalB  = Math.max(0,bq2) + Math.max(0,br2) + Math.max(0,bn2);
    const liPoolBal = Math.max(0, liPool);
    const endBalB  = invBalB + liPoolBal;
    bQB.push(Math.round(bq2));
    bLI.push(Math.round(liPool));
    liRows.push({ age, yearTarget, spRet: i < _spSeq.length ? SP500[_spSeq[i]] : null, calYear: _spSeq[i] || null,
      q2draw, q2tax, liPays, r2draw, n2draw, n2tax,
      totalD2: q2draw+r2draw+n2draw, afterTax2: incomeDelivered,
      shortfallB, bq2, br2, bn2, liPool: liPoolBal, endBalB, invBalB });
  }

  // ── SUGGESTED LI POOL BALANCE ────────────────────────────────────────────────
  // Goal: find the minimum cash value needed TODAY so that a life insurance
  // policy growing at 1.0% net (4.5% gross - 3.5% expenses) can pay every
  // year's projected tax bill throughout retirement without running out.
  // Tax schedule = Strategy A's yearTax per year = qualified ordinary income tax
  // + non-qualified LTCG tax combined. Both are covered by LI in Strategy B.
  const liNetRate = LI_NET; // 1.0% net — same rate used in the simulation above

  // Use Strategy A's full tax liability (qualified + non-qual LTCG) — pool-independent
  const taxSchedule = _rows.map(row => row.yearTax);

  function simulatePool(startBal) {
    // Grow through accumulation years first
    let pool = startBal * Math.pow(1 + liNetRate, _accumYrs);
    // Then pay taxes year by year through distribution
    for (let i = 0; i < taxSchedule.length; i++) {
      pool *= (1 + liNetRate);      // grow one year
      pool -= taxSchedule[i];       // pay that year's taxes
      if (pool < -0.01) return false;
    }
    return true;
  }

  // Binary search: upper bound = sum of all taxes (no growth assumed) as safe ceiling
  let lo = 0, hi = taxSchedule.reduce((s, t) => s + t, 0);
  for (let iter = 0; iter < 60; iter++) {
    const mid = (lo + hi) / 2;
    if (simulatePool(mid)) hi = mid; else lo = mid;
  }
  const suggestedBal = Math.ceil(hi / 100) * 100; // round up to nearest $100

  const sugEl = document.getElementById('liSuggestedBal');
  sugEl.style.display = 'block';
  sugEl.innerHTML = `
    <strong style="color:#fff;font-size:15px;">💡 Suggested starting balance: ${fmtFull(suggestedBal)}</strong><br>
    <span style="color:rgba(255,255,255,0.75);">The minimum life insurance cash value needed <em>today</em> so the policy — we are muting growth to help show a concept because your actual policy could vary greatly from our example. This means we are showing the cash value growing at 1.0% net per year (4.5% gross crediting rate minus 3.5% expenses) through ${_accumYrs} accumulation years and all ${_distYrs} retirement years — is projected to pay every projected tax bill for the years shown below. Covers both <strong style="color:#fff;">qualified ordinary income tax</strong> and <strong style="color:#fff;">non-qualified long-term capital gains tax</strong> each year.</span>
    <span style="display:inline-flex;align-items:center;gap:8px;margin-top:10px;">
      <span class="hv-fade" id="liSuggestedBtn" data-qb-click="applySuggestedBal" data-qb-click-args='[${suggestedBal}]' style="display:inline-block;padding:7px 16px;background:#fff;border-radius:8px;cursor:pointer;font-weight:700;color:#3730a3;font-size:13px;box-shadow:0 2px 8px rgba(0,0,0,0.15);transition:opacity .15s;">
        Use ${fmtFull(suggestedBal)} →
      </span>
      <span style="font-size:12px;color:rgba(255,255,255,0.6);">Click to apply this amount to the field above</span>
    </span>
  `;

  // Summary cards
  const totalTaxA   = _rows.reduce((s,r)=>s+r.yearTax, 0);
  const totalLIPays = liRows.reduce((s,r)=>s+r.liPays, 0);
  const shortfallB  = liRows.filter(r=>r.shortfallB).length;
  const lastRowB    = liRows.length > 0 ? liRows[liRows.length-1] : null;
  const endQualB    = lastRowB ? Math.max(0, lastRowB.bq2)   : 0;
  const endRothB    = lastRowB ? Math.max(0, lastRowB.br2)   : 0;
  const endNonqB    = lastRowB ? Math.max(0, lastRowB.bn2)   : 0;
  const endLIPool   = lastRowB ? Math.max(0, lastRowB.liPool): 0;
  const endTotalB   = endQualB + endRothB + endNonqB + endLIPool;
  const endQualA    = Math.max(0, _bQ[_bQ.length-1] || 0);
  const endRothA    = Math.max(0, _bR[_bR.length-1] || 0);
  const endNonqA    = Math.max(0, _bN[_bN.length-1] || 0);
  const endTotalA   = endQualA + endRothA + endNonqA;
  const balAdvantage   = endTotalB - endTotalA;
  const totalAdvantage = balAdvantage;

  document.getElementById('liCompareCards').innerHTML = `
    <div class="summary-card red"><div class="s-label">Strategy A — Total Tax Paid</div><div class="s-value">${fmtFull(totalTaxA)}</div><div class="s-sub">Paid from retirement accounts</div></div>
    <div class="summary-card" style="background:#f5f3ff;border-color:rgba(99,102,241,0.3);"><div class="s-label" style="color:#6366f1;">Strategy B — LI Covers Tax</div><div class="s-value" style="color:#4338ca;">${fmtFull(totalLIPays)}</div><div class="s-sub" style="color:#6366f1;">Paid from life insurance pool</div></div>
    <div class="summary-card" style="background:${balAdvantage>=0?'var(--green-light)':'#fef2f2'};border-color:${balAdvantage>=0?'rgba(22,163,74,.25)':'rgba(220,38,38,.2)'};"><div class="s-label" style="color:${balAdvantage>=0?'#15803d':'#dc2626'};">Balance Advantage (B vs A)</div><div class="s-value" style="color:${balAdvantage>=0?'#15803d':'#dc2626'};">${balAdvantage>=0?'+':''}${fmtFull(balAdvantage)}</div><div class="s-sub" style="color:${balAdvantage>=0?'#15803d':'#dc2626'};">Strategy B (${fmtFull(endTotalB)}) minus Strategy A (${fmtFull(endTotalA)}) at age ${_endAge}</div></div>
    <div class="summary-card red"><div class="s-label">Strategy A — Shortfall Years</div><div class="s-value">${_shortfallYrs}</div><div class="s-sub">Years income target not met</div></div>
    <div class="summary-card" style="background:#f5f3ff;border-color:rgba(99,102,241,0.3);"><div class="s-label" style="color:#6366f1;">Strategy B — Shortfall Years</div><div class="s-value" style="color:${shortfallB>0?'#dc2626':'#4338ca'}">${shortfallB}</div><div class="s-sub" style="color:#6366f1;">Years income target not met</div></div>
    <div class="summary-card" style="background:${totalAdvantage>=0?'var(--green-light)':'#fef2f2'};border-color:${totalAdvantage>=0?'rgba(22,163,74,.25)':'rgba(220,38,38,.2)'};"><div class="s-label" style="color:${totalAdvantage>=0?'#15803d':'#dc2626'};">Strategy B — Total Remaining Balance</div><div class="s-value" style="color:${totalAdvantage>=0?'#15803d':'#dc2626'};">${fmtFull(endTotalB)}</div><div class="s-sub" style="color:${totalAdvantage>=0?'#15803d':'#dc2626'};">All accts + LI pool at age ${_endAge} · ${totalAdvantage>=0?'+':''}${fmtFull(totalAdvantage)} vs Strategy A (${fmtFull(endTotalA)})</div></div>
  `;

  // Charts
  if (liCI) liCI.destroy();
  if (liBalCI) liBalCI.destroy();

  liCI = new Chart(document.getElementById('liChart'), {
    type: 'bar',
    data: {
      labels: _dLabels,
      datasets: [
        { type:'bar',  label:'A: Qual. Draw',  data: _dQW,                                   backgroundColor:'rgba(26,61,107,0.5)',  stack:'a', yAxisID:'y', order:4 },
        { type:'bar',  label:'B: Qual. Draw',  data: liRows.map(r=>Math.round(r.q2draw)),    backgroundColor:'rgba(99,102,241,0.7)', stack:'b', yAxisID:'y', order:3 },
        { type:'line', label:'A: Tax Paid',    data: _dTax,                                  borderColor:'#dc2626', backgroundColor:'transparent', borderWidth:2, pointRadius:3, tension:0.3, yAxisID:'y', order:1 },
        { type:'line', label:'B: LI Pays Tax', data: liRows.map(r=>Math.round(r.liPays)),    borderColor:'#7c3aed', backgroundColor:'transparent', borderWidth:2, pointRadius:3, tension:0.3, borderDash:[5,3], yAxisID:'y', order:2 },
        { type:'line', label:'B: Qual. Bal.',  data: bQB.slice(1),                           borderColor:'#16a34a', backgroundColor:'rgba(22,163,74,0.06)', borderWidth:2.5, pointRadius:2, tension:0.3, fill:true, yAxisID:'y2', order:0 }
      ]
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ display:false } },
      scales:{
        x:{ ticks:{ color:'#8a9ab5', font:{size:11}, maxRotation:45 } },
        y:{ position:'left',  ticks:{ color:'#8a9ab5', font:{size:11}, callback:v=>'$'+Math.round(v/1000)+'k' }, title:{ display:true, text:'Annual Distributions / Tax', color:'#8a9ab5', font:{size:11} } },
        y2:{ position:'right', grid:{ drawOnChartArea:false }, ticks:{ color:'#16a34a', font:{size:11}, callback:v=>'$'+Math.round(v/1000)+'k' }, title:{ display:true, text:'Qual. Balance — Strategy B', color:'#16a34a', font:{size:11} } }
      }
    }
  });

  liBalCI = new Chart(document.getElementById('liBalChart'), {
    type: 'line',
    data: {
      labels: [_retAge, ..._dLabels],
      datasets: [
        { label:'A: Qual. Balance', data: _bQ, borderColor:'#dc2626', backgroundColor:'rgba(220,38,38,0.06)', fill:true, tension:0.3, pointRadius:2, borderWidth:2.5, borderDash:[6,3] },
        { label:'B: Qual. Balance', data: bQB, borderColor:'#6366f1', backgroundColor:'rgba(99,102,241,0.08)',  fill:true, tension:0.3, pointRadius:2, borderWidth:2.5 },
        { label:'LI Pool',          data: bLI, borderColor:'#a78bfa', backgroundColor:'rgba(167,139,250,0.08)', fill:true, tension:0.3, pointRadius:2, borderWidth:1.5, borderDash:[3,2] }
      ]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ display:false } },
      scales:{
        x:{ ticks:{ color:'#8a9ab5', font:{size:11}, maxRotation:45, maxTicksLimit:16 } },
        y:{ ticks:{ color:'#8a9ab5', font:{size:11}, callback:v=>'$'+Math.round(v/1000)+'k' } }
      }
    }
  });

  // ── TWO DETAIL TABLES ────────────────────────────────────────────────────────
  const tbodyA = document.getElementById('liTableBodyA');
  const tbodyB = document.getElementById('liTableBodyB');
  tbodyA.innerHTML = ''; tbodyB.innerHTML = '';

  let ltAQD=0,ltAQT=0,ltARD=0,ltAND=0,ltANT=0,ltATT=0,ltAAT=0,ltAEB=0;
  let ltBQD=0,ltBLI=0,ltBRD=0,ltBND=0,ltBNT=0,ltBTT=0,ltBAT=0,ltBEB=0,ltBInv=0,ltBLIP=0;

  _rows.forEach((rowA, i) => {
    const rowB = liRows[i];
    if (!rowB) return;
    const endBalA = (_bQ[i+1]||0) + (_bR[i+1]||0) + (_bN[i+1]||0);
    const advantage = rowB.endBalB - endBalA;
    const retA = rowA.spRet;
    const retColor = retA != null ? (retA >= 0 ? 'color:#16a34a;font-weight:700' : 'color:#dc2626;font-weight:700') : 'color:#8a9ab5';
    const retStr = retA != null ? (retA >= 0 ? '+' : '') + retA.toFixed(2) + '%' : '—';
    const yearLabel = rowA.calYear ? ` <span style="color:#8a9ab5;font-size:11px;font-weight:400">(${rowA.calYear})</span>` : '';

    // Strategy A row
    const trA = document.createElement('tr');
    if (retA != null && retA < 0) trA.style.background = '#fef9f9';
    trA.innerHTML = `
      <td>Age ${rowA.age}${yearLabel}</td>
      <td style="${retColor}">${retStr}</td>
      <td>${fmtFull(rowA.qdraw)}</td>
      <td>${rowA.qtax > 0 ? '<span class="td-tax">'+fmtFull(rowA.qtax)+'</span>' : '<span class="td-zero">—</span>'}</td>
      <td>${rowA.rdraw > 0 ? '<span class="td-green">'+fmtFull(rowA.rdraw)+'</span>' : '<span class="td-zero">—</span>'}</td>
      <td>${rowA.ndraw > 0 ? fmtFull(rowA.ndraw) : '<span class="td-zero">—</span>'}</td>
      <td>${rowA.ntax > 0 ? '<span class="td-tax">'+fmtFull(rowA.ntax)+'</span>' : '<span class="td-zero">—</span>'}</td>
      <td><span class="td-tax">${fmtFull(rowA.yearTax)}</span></td>
      <td><span class="td-green">${fmtFull(rowA.afterTax)}</span></td>
      <td style="font-weight:700;color:#1a3d6b;">${fmtFull(endBalA)}</td>
    `;
    tbodyA.appendChild(trA);

    // Strategy B row
    const trB = document.createElement('tr');
    if (rowB.shortfallB) trB.style.background = '#fdf4ff';
    else if (retA != null && retA < 0) trB.style.background = '#fef9f9';
    trB.innerHTML = `
      <td>Age ${rowB.age}${yearLabel}${rowB.shortfallB ? ' <span style="color:#7c3aed;font-size:10px;font-weight:700">SHORTFALL</span>' : ''}</td>
      <td style="${retColor}">${retStr}</td>
      <td style="color:#4338ca;font-weight:600;line-height:1.6;">
        ${rowB.q2draw > 0 ? `<span style="color:#1a3d6b;"><sup style="font-size:7px;color:#4338ca;">¹</sup> ${fmtFull(rowB.q2draw)}</span>` : ''}
        ${rowB.r2draw > 0 ? `${rowB.q2draw > 0 ? '<br>' : ''}<span style="color:#16a34a;"><sup style="font-size:7px;color:#4338ca;">²</sup> ${fmtFull(rowB.r2draw)}</span>` : ''}
        ${rowB.n2draw > 0 ? `${(rowB.q2draw > 0 || rowB.r2draw > 0) ? '<br>' : ''}<span style="color:#d97706;"><sup style="font-size:7px;color:#4338ca;">³</sup> ${fmtFull(rowB.n2draw)}</span>` : ''}
        ${!rowB.q2draw && !rowB.r2draw && !rowB.n2draw ? '<span class="td-zero">—</span>' : ''}
      </td>
      <td>${(rowB.q2tax + rowB.n2tax) > 0 ? '<span class="td-tax">'+fmtFull(rowB.q2tax + rowB.n2tax)+'</span>' : '<span class="td-zero">—</span>'}</td>
      <td style="color:#7c3aed;font-weight:600;">${rowB.liPays > 0 ? fmtFull(rowB.liPays) : '<span class="td-zero">—</span>'}</td>
      <td><span class="td-green">${fmtFull(rowB.afterTax2)}</span></td>
      <td style="font-weight:700;color:#3730a3;">${fmtFull(rowB.endBalB)}<br><span style="font-size:10px;font-weight:400;color:#6366f1;">Inv: ${fmtFull(rowB.invBalB)} + LI: ${fmtFull(rowB.liPool)}</span></td>
      <td style="font-weight:700;color:${advantage>=0?'#16a34a':'#dc2626'}">${advantage>=0?'+':''}${fmtFull(advantage)}</td>
    `;
    tbodyB.appendChild(trB);

    ltAQD+=rowA.qdraw; ltAQT+=rowA.qtax; ltARD+=rowA.rdraw; ltAND+=rowA.ndraw;
    ltANT+=rowA.ntax; ltATT+=rowA.yearTax; ltAAT+=rowA.afterTax; ltAEB=endBalA;
    ltBQD+=rowB.q2draw; ltBLI+=rowB.liPays; ltBRD+=rowB.r2draw; ltBND+=rowB.n2draw;
    ltBNT+=rowB.n2tax; ltBTT+=(rowB.q2tax+rowB.n2tax); ltBAT+=rowB.afterTax2;
    ltBEB=rowB.endBalB; ltBInv=rowB.invBalB; ltBLIP=rowB.liPool;
  });

  // Totals rows
  const totA = document.createElement('tr');
  totA.innerHTML = `
    <td>Totals</td>
    <td>—</td>
    <td>${fmtFull(ltAQD)}</td>
    <td><span class="td-tax">${fmtFull(ltAQT)}</span></td>
    <td><span class="td-green">${fmtFull(ltARD)}</span></td>
    <td>${fmtFull(ltAND)}</td>
    <td><span class="td-tax">${fmtFull(ltANT)}</span></td>
    <td><span class="td-tax">${fmtFull(ltATT)}</span></td>
    <td><span class="td-green">${fmtFull(ltAAT)}</span></td>
    <td style="font-weight:700;color:#1a3d6b;">${fmtFull(ltAEB)}</td>
  `;
  tbodyA.appendChild(totA);

  const finalAdv = ltBEB - ltAEB;
  const totB = document.createElement('tr');
  totB.innerHTML = `
    <td>Totals</td>
    <td>—</td>
    <td style="line-height:1.6;">
      ${ltBQD > 0 ? `<span style="color:#1a3d6b;font-weight:600;"><sup style="font-size:7px;color:#4338ca;">¹</sup> ${fmtFull(ltBQD)}</span>` : ''}
      ${ltBRD > 0 ? `${ltBQD > 0 ? '<br>' : ''}<span style="color:#16a34a;font-weight:600;"><sup style="font-size:7px;color:#4338ca;">²</sup> ${fmtFull(ltBRD)}</span>` : ''}
      ${ltBND > 0 ? `${(ltBQD > 0 || ltBRD > 0) ? '<br>' : ''}<span style="color:#d97706;font-weight:600;"><sup style="font-size:7px;color:#4338ca;">³</sup> ${fmtFull(ltBND)}</span>` : ''}
    </td>
    <td><span class="td-tax">${fmtFull(ltBTT)}</span></td>
    <td style="color:#7c3aed;font-weight:600;">${fmtFull(ltBLI)}</td>
    <td><span class="td-green">${fmtFull(ltBAT)}</span></td>
    <td style="font-weight:700;color:#3730a3;">${fmtFull(ltBEB)}<br><span style="font-size:10px;font-weight:400;color:#6366f1;">Inv: ${fmtFull(ltBInv)} + LI: ${fmtFull(ltBLIP)}</span></td>
    <td style="font-weight:700;color:${finalAdv>=0?'#16a34a':'#dc2626'}">${finalAdv>=0?'+':''}${fmtFull(finalAdv)}</td>
  `;
  tbodyB.appendChild(totB);
}

function applySuggestedBal(amount) {
  const disp = document.getElementById('liPoolDisplay');
  const hid  = document.getElementById('liPool');
  hid.value  = amount;
  disp.value = Math.round(amount).toLocaleString('en-US');
  runLI();
}

// ── INPUT PANEL SHOW/HIDE ─────────────────────────────────────────────────────
function openInputPanel() {
  document.querySelector('.page-layout').classList.remove('inputs-hidden');
  document.getElementById('editInputsBar').classList.remove('visible');
}

function closeInputPanel() {
  document.querySelector('.page-layout').classList.add('inputs-hidden');
  const first = document.getElementById('contactFirst').value.trim();
  const last  = document.getElementById('contactLast').value.trim();
  const name  = (first + ' ' + last).trim() || 'your projection';
  document.getElementById('editInputsName').textContent = name;
  document.getElementById('editInputsBar').classList.add('visible');
}

// ── GATED CALCULATE — validates contact fields first ─────────────────────────
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
      productLine: 'INDEXED_UL',
      inputs: { accumulationYears: N('accumYrs'), distributionYears: N('distYrs'), state: V('contactState') },
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
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!emailOk) {
    errEl.textContent = '⚠ Please enter a valid email address.';
    errEl.style.display = 'block';
    return;
  }
  errEl.style.display = 'none';
  qbCaptureLead();
  document.getElementById('resultsLocked').style.display = 'none';
  closeInputPanel();
  runCalc();
}

// ── MAIN CALC ────────────────────────────────────────────────────────────────
function runCalc() {
  const curAge     = parseInt(document.getElementById('curAge').value) || 45;
  const retAge     = parseInt(document.getElementById('retAge').value) || 65;
  const endAge     = parseInt(document.getElementById('endAge').value) || 90;
  const target     = parseFloat(document.getElementById('targetIncome').value) || 80000;
  const inflRate   = parseFloat(inflSlider.value) / 100;
  const taxRate    = parseInt(slider.value) / 100;
  const cgRate     = parseFloat(document.getElementById('ltcgRate').value);

  const qualVal    = parseFloat(document.getElementById('qualVal').value) || 0;
  const rothVal    = parseFloat(document.getElementById('rothVal').value) || 0;
  const nonqVal    = parseFloat(document.getElementById('nonqVal').value) || 0;
  const qualGA     = parseFloat(document.getElementById('qualGrowAcc').value) / 100;
  const rothGA     = parseFloat(document.getElementById('rothGrowAcc').value) / 100;
  const nonqGA     = parseFloat(document.getElementById('nonqGrowAcc').value) / 100;

  const order = [...document.querySelectorAll('.drag-item')].map(el => el.dataset.acct);

  // save to shared state for runLI()
  _retAge=retAge; _endAge=endAge; _target=target; _inflRate=inflRate;
  _taxRate=taxRate; _cgRate=cgRate;
  _qualGA=qualGA; _rothGA=rothGA; _nonqGA=nonqGA;
  _order=order;

  const accumYrs = Math.max(0, retAge - curAge);
  const distYrs  = Math.max(0, endAge - retAge);

  // ── ACCUMULATION ──
  const aLabels = [], aQ = [], aR = [], aN = [];
  let q = qualVal, r = rothVal, n = nonqVal;
  for (let i = 0; i <= accumYrs; i++) {
    aLabels.push(curAge + i);
    aQ.push(Math.round(q)); aR.push(Math.round(r)); aN.push(Math.round(n));
    q *= (1 + qualGA); r *= (1 + rothGA); n *= (1 + nonqGA);
  }
  const retQ = aQ[accumYrs], retR = aR[accumYrs], retN = aN[accumYrs];
  _retQ=retQ; _retR=retR; _retN=retN; _distYrs=distYrs; _accumYrs=accumYrs;

  // ── DISTRIBUTION ──
  const dLabels = [], dQW = [], dRW = [], dNW = [], dTax = [];
  const bQ = [retQ], bR = [retR], bN = [retN];
  let dq = retQ, dr = retR, dn = retN;
  let totalTax = 0, totalAfterTax = 0, shortfallYrs = 0;
  const rows = [];

  // Build S&P sequence: most recent distYrs years ending 2024
  const spYearsSorted = Object.keys(SP500).map(Number).sort((a,b)=>a-b);
  const seqLen = Math.min(distYrs, spYearsSorted.length);
  const spSeq = spYearsSorted.slice(spYearsSorted.length - seqLen);

  for (let i = 0; i < distYrs; i++) {
    const age = retAge + i;
    const yearTarget = target * Math.pow(1 + inflRate, i);
    // Use actual S&P return for available years, fall back to assumed rate if plan > 97 yrs
    const spRet = i < spSeq.length ? SP500[spSeq[i]] / 100 : qualGA;
    const spRetR = spRet; // same S&P return applies to all accounts
    dq = Math.max(0, dq * (1 + spRet));
    dr = Math.max(0, dr * (1 + spRetR));
    dn = Math.max(0, dn * (1 + spRetR));
    let need = yearTarget;
    let qdraw = 0, rdraw = 0, ndraw = 0, qtax = 0, ntax = 0;

    for (const acct of order) {
      if (need <= 0.01) break;
      if (acct === 'qual' && dq > 0) {
        const gross = taxRate < 1 ? Math.min(need / (1 - taxRate), dq) : Math.min(dq, need);
        const after = gross * (1 - taxRate);
        qdraw += gross; qtax += gross * taxRate; dq = Math.max(0, dq - gross); need -= after;
      } else if (acct === 'roth' && dr > 0) {
        const take = Math.min(need, dr);
        rdraw += take; dr = Math.max(0, dr - take); need -= take;
      } else if (acct === 'nonq' && dn > 0) {
        const gross = cgRate < 1 ? Math.min(need / (1 - cgRate), dn) : Math.min(dn, need);
        const after = gross * (1 - cgRate);
        ndraw += gross; ntax += gross * cgRate; dn = Math.max(0, dn - gross); need -= after;
      }
    }
    if (need > 0.01) shortfallYrs++;

    const totalD = qdraw + rdraw + ndraw;
    const yearTax = qtax + ntax;
    const afterTax = totalD - yearTax;
    totalTax += yearTax; totalAfterTax += afterTax;

    dLabels.push(age);
    dQW.push(Math.round(qdraw)); dRW.push(Math.round(rdraw)); dNW.push(Math.round(ndraw));
    dTax.push(Math.round(yearTax));
    bQ.push(Math.round(dq)); bR.push(Math.round(dr)); bN.push(Math.round(dn));
    rows.push({ age, yearTarget, spRet: i < spSeq.length ? SP500[spSeq[i]] : null, calYear: spSeq[i] || null, qdraw, qtax, rdraw, ndraw, ntax, totalD, yearTax, afterTax });
  }

  const totalRetAssets = retQ + retR + retN;
  const totalDrawn = rows.reduce((s, r) => s + r.totalD, 0);

  // save to shared state for runLI()
  _rows=[...rows]; _bQ=[...bQ]; _dLabels=[...dLabels];
  _dQW=[...dQW]; _dTax=[...dTax]; _shortfallYrs=shortfallYrs;
  _bR=[...bR]; _bN=[...bN]; _spSeq=[...spSeq];

  // ── SUMMARY ──
  const taxPctStr = Math.round(taxRate * 100) + '%';
  const inflPctStr = (inflRate * 100).toFixed(1) + '%';
  const lastTarget = target * Math.pow(1 + inflRate, distYrs - 1);
  document.getElementById('summaryStrip').innerHTML = `
    <div class="summary-card accent">
      <div class="s-label">Total Assets at Retirement</div>
      <div class="s-value">${fmtFull(totalRetAssets)}</div>
      <div class="s-sub">Projected balance at age ${retAge}</div>
    </div>
    <div class="summary-card">
      <div class="s-label">Year 1 Income Target</div>
      <div class="s-value">${fmtFull(target)}</div>
      <div class="s-sub">Grows ${inflPctStr}/yr → ${fmtFull(lastTarget)} by age ${endAge - 1}</div>
    </div>
    <div class="summary-card">
      <div class="s-label">Distribution Years</div>
      <div class="s-value">${distYrs}</div>
      <div class="s-sub">${retAge} → ${endAge} · ${taxPctStr} tax rate</div>
    </div>
    <div class="summary-card red">
      <div class="s-label">Estimated Total Taxes Paid</div>
      <div class="s-value">${fmtFull(totalTax)}</div>
      <div class="s-sub">Over ${distYrs}-year distribution phase</div>
    </div>
    <div class="summary-card green">
      <div class="s-label">Total After-Tax Income</div>
      <div class="s-value">${fmtFull(totalAfterTax)}</div>
      <div class="s-sub">Cumulative net income received</div>
    </div>
    <div class="summary-card ${shortfallYrs > 0 ? 'red' : 'green'}">
      <div class="s-label">Shortfall Years</div>
      <div class="s-value">${shortfallYrs}</div>
      <div class="s-sub">${shortfallYrs > 0 ? 'Accounts run out before plan end' : 'Accounts last through plan end'}</div>
    </div>
  `;

  // ── DYNAMIC CALLOUT ──
  const taxEfficiency = totalTax / (totalTax + totalAfterTax) * 100;
  let callout = '';
  if (shortfallYrs > 0) {
    callout = `<div class="callout warning" style="margin-top:16px;"><div class="callout-label">⚠️ Shortfall Warning</div><p>At your Year 1 income target of ${fmtFull(target)}/year (growing at ${inflPctStr}/yr), your accounts are projected to run out <strong>${shortfallYrs} year${shortfallYrs > 1 ? 's' : ''}</strong> before your plan end age of ${endAge}. Consider reducing your income target, lowering the inflation assumption, or adding a tax-free supplemental income source such as life insurance cash value.</p></div>`;
  } else if (taxEfficiency > 30) {
    callout = `<div class="callout warning" style="margin-top:16px;"><div class="callout-label">💡 Tax Optimization Opportunity</div><p>Approximately <strong>${Math.round(taxEfficiency)}%</strong> of your total gross distributions will go to taxes — <strong>${fmtFull(totalTax)}</strong> over retirement. A tax-free income layer from life insurance cash value or a Roth conversion strategy could meaningfully reduce this drag. Talk to an advisor about reducing your qualified account dependency.</p></div>`;
  } else {
    callout = `<div class="callout success" style="margin-top:16px;"><div class="callout-label">✅ On Track</div><p>Your accounts are projected to last through age ${endAge} with an estimated <strong>${fmtFull(totalAfterTax)}</strong> in total after-tax retirement income. Your projected tax drag is <strong>${Math.round(taxEfficiency)}%</strong> of gross distributions. Consider a Roth conversion or life insurance strategy to reduce this further.</p></div>`;
  }
  document.getElementById('dynamicCallout').innerHTML = callout;

  // ── CHARTS ──
  if (accumCI) accumCI.destroy();
  if (distCI) distCI.destroy();
  if (balCI) balCI.destroy();
  if (liCI) liCI.destroy();
  if (liBalCI) liBalCI.destroy();

  accumCI = new Chart(document.getElementById('accumChart'), {
    type: 'bar',
    data: {
      labels: aLabels,
      datasets: [
        { label: 'Qualified', data: aQ, backgroundColor: '#1a3d6b', stack: 's' },
        { label: 'Roth IRA', data: aR, backgroundColor: '#16a34a', stack: 's' },
        { label: 'Non-Qualified', data: aN, backgroundColor: '#d97706', stack: 's' }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { stacked: true, ticks: { color: '#8a9ab5', font: { size: 11 }, maxRotation: 45, autoSkip: true, maxTicksLimit: 16 } },
        y: { stacked: true, ticks: { color: '#8a9ab5', font: { size: 11 }, callback: v => '$' + Math.round(v / 1000) + 'k' } }
      }
    }
  });

  distCI = new Chart(document.getElementById('distChart'), {
    type: 'bar',
    data: {
      labels: dLabels,
      datasets: [
        { label: 'Qualified', data: dQW, backgroundColor: '#1a3d6b', stack: 'draw', order: 2 },
        { label: 'Roth', data: dRW, backgroundColor: '#16a34a', stack: 'draw', order: 2 },
        { label: 'Non-Qualified', data: dNW, backgroundColor: '#d97706', stack: 'draw', order: 2 },
        { label: 'Tax Due', data: dTax, backgroundColor: 'rgba(220,38,38,0.75)', stack: 'tax', order: 1 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: {
          afterBody: ctx => {
            const i = ctx[0].dataIndex;
            const yt = rows[i] ? fmtFull(rows[i].yearTarget) : '';
            return yt ? [`Income target (inflation-adj.): ${yt}`] : [];
          }
        }}
      },
      scales: {
        x: { ticks: { color: '#8a9ab5', font: { size: 11 }, maxRotation: 45 } },
        y: { ticks: { color: '#8a9ab5', font: { size: 11 }, callback: v => '$' + Math.round(v / 1000) + 'k' } }
      }
    }
  });

  const bLabels = [retAge, ...dLabels];
  balCI = new Chart(document.getElementById('balChart'), {
    type: 'line',
    data: {
      labels: bLabels,
      datasets: [
        { label: 'Qualified', data: bQ, borderColor: '#1a3d6b', backgroundColor: 'rgba(26,61,107,0.06)', fill: true, tension: 0.3, pointRadius: 2 },
        { label: 'Roth IRA', data: bR, borderColor: '#16a34a', backgroundColor: 'rgba(22,163,74,0.06)', fill: true, tension: 0.3, pointRadius: 2 },
        { label: 'Non-Qualified', data: bN, borderColor: '#d97706', backgroundColor: 'rgba(217,119,6,0.06)', fill: true, tension: 0.3, pointRadius: 2 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#8a9ab5', font: { size: 11 }, maxRotation: 45, maxTicksLimit: 16 } },
        y: { ticks: { color: '#8a9ab5', font: { size: 11 }, callback: v => '$' + Math.round(v / 1000) + 'k' } }
      }
    }
  });

  // ── STRATEGY B: LIFE INSURANCE PAYS TAXES ───────────────────────────────────
  runLI();

  const area = document.getElementById('resultsArea');
  area.classList.add('visible');
  area.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* The markup names actions rather than carrying onclick attributes, which a
   Content-Security-Policy without 'unsafe-inline' blocks wherever they came
   from -- including markup this script builds itself. Only what is listed
   here can be reached from an attribute. */
window.qbActions.register({ applySuggestedBal: applySuggestedBal, openInputPanel: openInputPanel, runCalcGated: runCalcGated, toggleCard: toggleCard, toggleTableSection: toggleTableSection });
