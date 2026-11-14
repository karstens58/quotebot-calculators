/*
 * fiaincomeridercalculator.html's own script, which used to sit inline in the page.
 *
 * It had to move: a Content-Security-Policy without 'unsafe-inline' blocks an
 * inline <script>, so inline this page would have gone dead the moment the
 * policy went on -- quietly, with the markup looking perfectly correct.
 *
 * Moved verbatim.
 */
/* ============================================================
   FIA INCOME RIDER — model
   ============================================================ */
var STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"];

var STATE = { lifeMode:'single', rollType:'simple', payoutTouched:false };

function $(id){ return document.getElementById(id); }
function num(v){ return parseFloat(String(v).replace(/[^0-9.\-]/g,'')) || 0; }
function money(n){ return '$' + Math.round(n).toLocaleString('en-US'); }
function moneyShort(n){
  if (n >= 1e6) return '$' + (n/1e6).toFixed(n >= 1e7 ? 1 : 2) + 'M';
  if (n >= 1e3) return '$' + Math.round(n/1e3) + 'k';
  return '$' + Math.round(n);
}

/**
 * Typical industry shape: the payout factor rises with the age income starts,
 * and a joint payout is lower because two lives must be covered. Editable —
 * an agent comparing a real product should override it with that product's
 * actual factor.
 */
function autoPayout(age, mode){
  var f = 4.00 + 0.10 * (age - 55);
  f = Math.max(3.0, Math.min(7.5, f));
  if (mode === 'joint') f -= 0.50;
  return Math.round(f * 10) / 10;
}

/**
 * Project both tracks year by year from today to the income age.
 *
 * Benefit base: premium plus bonus, rolled up for the roll-up period only,
 * then flat. Simple roll-up accrues on the bonused premium; compound accrues
 * on the running base — the difference compounds badly over ten years, which
 * is exactly what this tool exists to make visible.
 *
 * Account value: the real money. Index credits applied to the account value,
 * rider charge deducted off the benefit base (the common design, and the
 * reason a flat index year still costs the contract money).
 */
function project(inp){
  var rows = [];
  var bb0 = inp.premium * (1 + inp.bonus / 100);
  var bb = bb0, av = inp.premium;

  for (var y = 0; y <= inp.deferYears; y++){
    var age = inp.curAge + y;
    if (y > 0){
      if (y <= inp.rollYears){
        if (inp.rollType === 'compound') bb = bb * (1 + inp.rollRate / 100);
        else bb = bb0 * (1 + (inp.rollRate / 100) * y);
      }
      av = av * (1 + inp.credit / 100) - bb * (inp.riderFee / 100);
      if (av < 0) av = 0;
    }
    rows.push({
      year: y, age: age, benefitBase: bb, accountValue: av,
      rollingStill: y < inp.rollYears,
      incomeIfStartedNow: bb * (autoPayoutFor(age) / 100)
    });
  }
  return rows;
}

function autoPayoutFor(age){
  // Used for the "if you started this year instead" column only. The headline
  // number always uses the payout factor showing on the slider.
  return autoPayout(age, STATE.lifeMode);
}

function getInputs(){
  var curAge = Math.max(18, Math.round(num($('curAge').value)));
  var incAge = Math.max(curAge, Math.round(num($('incAge').value)));
  return {
    premium: num($('premium').value),
    curAge: curAge,
    incAge: incAge,
    deferYears: incAge - curAge,
    lifeMode: STATE.lifeMode,
    rollRate: num($('rollRate').value),
    rollType: STATE.rollType,
    rollYears: Math.round(num($('rollYears').value)),
    bonus: num($('bonus').value),
    payout: num($('payout').value),
    riderFee: num($('riderFee').value),
    credit: num($('credit').value),
    lifeExp: Math.round(num($('lifeExp').value))
  };
}

/* ============================================================
   RENDER
   ============================================================ */
function calculate(){
  var inp = getInputs();
  var rows = project(inp);
  var last = rows[rows.length - 1];

  var income = last.benefitBase * (inp.payout / 100);
  var yearsPaid = Math.max(0, inp.lifeExp - inp.incAge);
  var totalIncome = income * yearsPaid;

  // Age at which cumulative income has returned the original premium.
  var breakAge = null;
  if (income > 0){
    var yrs = Math.ceil(inp.premium / income);
    breakAge = inp.incAge + yrs;
  }

  $('heroAge').textContent = inp.incAge;
  $('heroIncome').textContent = money(income);
  $('heroMonthly').textContent = money(income / 12);
  $('heroDefer').textContent = inp.deferYears;
  $('heroBB').textContent = moneyShort(last.benefitBase);
  $('heroTotal').textContent = moneyShort(totalIncome);
  $('heroLE').textContent = inp.lifeExp;
  $('heroBreak').textContent = breakAge ? breakAge : '—';

  $('cmpBB').textContent = money(last.benefitBase);
  $('cmpAV').textContent = money(last.accountValue);

  var gap = last.benefitBase - last.accountValue;
  var pct = last.benefitBase > 0 ? (gap / last.benefitBase * 100) : 0;
  $('gapCallout').querySelector('p').innerHTML =
    'At age <strong>' + inp.incAge + '</strong> the benefit base is <strong>' + money(last.benefitBase) +
    '</strong> but the contract is worth <strong>' + money(last.accountValue) + '</strong>. That ' +
    money(gap) + ' difference — ' + pct.toFixed(0) + '% of the headline figure — is not money in the account. ' +
    'It buys income and nothing else: it cannot be surrendered, and it is generally not what heirs receive.';

  renderChart(rows, inp);
  renderSchedule(rows, inp);
}

function renderSchedule(rows, inp){
  var html = '<thead><tr><th>Age</th><th>Year</th><th>Benefit base</th><th>Account value</th><th>Roll-up</th><th>Income if started</th></tr></thead><tbody>';
  rows.forEach(function(r){
    var isStart = r.age === inp.incAge;
    html += '<tr class="' + (isStart ? 'start-row' : '') + '">' +
      '<td>' + r.age + (isStart ? ' &larr; income starts' : '') + '</td>' +
      '<td>' + r.year + '</td>' +
      '<td>' + money(r.benefitBase) + '</td>' +
      '<td>' + money(r.accountValue) + '</td>' +
      '<td>' + (r.rollingStill ? 'accruing' : 'ended') + '</td>' +
      '<td>' + money(isStart ? r.benefitBase * (inp.payout/100) : r.incomeIfStartedNow) + '</td>' +
      '</tr>';
  });
  $('schedule').innerHTML = html + '</tbody>';
}

/**
 * Hand-drawn SVG so both series sit on one scale and every gridline label
 * names a value the chart actually reaches.
 */
function renderChart(rows, inp){
  var W = 640, H = 260, PAD_L = 62, PAD_R = 16, PAD_T = 14, PAD_B = 34;
  var iw = W - PAD_L - PAD_R, ih = H - PAD_T - PAD_B;
  var maxV = 0;
  rows.forEach(function(r){ maxV = Math.max(maxV, r.benefitBase, r.accountValue); });
  if (maxV <= 0) maxV = 1;
  var ceil = Math.ceil(maxV / 50000) * 50000;
  var n = Math.max(1, rows.length - 1);

  var x = function(i){ return PAD_L + (i / n) * iw; };
  var y = function(v){ return PAD_T + ih - (v / ceil) * ih; };

  var grid = '', ticks = 4;
  for (var g = 0; g <= ticks; g++){
    var val = (ceil / ticks) * g, yy = y(val);
    grid += '<line x1="' + PAD_L + '" y1="' + yy + '" x2="' + (W - PAD_R) + '" y2="' + yy +
            '" stroke="#d8e2f0" stroke-width="1"/>' +
            '<text x="' + (PAD_L - 8) + '" y="' + (yy + 4) + '" text-anchor="end" font-size="10" fill="#8a9ab5" font-family="Plus Jakarta Sans,sans-serif">' +
            moneyShort(val) + '</text>';
  }

  var pathBB = '', pathAV = '';
  rows.forEach(function(r, i){
    pathBB += (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(r.benefitBase).toFixed(1) + ' ';
    pathAV += (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(r.accountValue).toFixed(1) + ' ';
  });

  var xlabels = '';
  rows.forEach(function(r, i){
    if (i === 0 || i === rows.length - 1 || (rows.length > 6 && i === Math.floor(n/2))){
      xlabels += '<text x="' + x(i) + '" y="' + (H - 12) + '" text-anchor="middle" font-size="10" fill="#8a9ab5" font-family="Plus Jakarta Sans,sans-serif">Age ' + r.age + '</text>';
    }
  });

  var startX = x(n);
  var marker = '<line x1="' + startX + '" y1="' + PAD_T + '" x2="' + startX + '" y2="' + (PAD_T + ih) +
               '" stroke="#4a90d9" stroke-width="1.5" stroke-dasharray="4 3"/>';

  $('chart').innerHTML =
    '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="Benefit base and account value from age ' +
    inp.curAge + ' to ' + inp.incAge + '" style="display:block;min-width:520px;">' +
    grid + marker +
    '<path d="' + pathAV + '" fill="none" stroke="#0d9488" stroke-width="2.5" stroke-linejoin="round"/>' +
    '<path d="' + pathBB + '" fill="none" stroke="#d97706" stroke-width="2.5" stroke-linejoin="round"/>' +
    '<circle cx="' + startX + '" cy="' + y(rows[rows.length-1].benefitBase) + '" r="4" fill="#d97706"/>' +
    '<circle cx="' + startX + '" cy="' + y(rows[rows.length-1].accountValue) + '" r="4" fill="#0d9488"/>' +
    xlabels + '</svg>';
}

/* ============================================================
   LEAD GATE
   ============================================================ */
/*
 * WHAT WE WILL HOLD THE ILLUSTRATION BACK FOR, and what we will not.
 *
 * First name, email and state. The email is where it goes, the state
 * decides which carriers may even be shown, and the first name is what an
 * agent opens with. Three fields is the whole price of admission.
 *
 * Phone and last name are asked for and not demanded. A phone number is
 * the field people abandon a form over, and we have an email -- insisting
 * on it costs more leads than it gains calls. OPTIONAL IS NOT UNCHECKED
 * THOUGH: a phone number that was started and left half-typed is worse
 * than none, because it reaches nobody and looks like a real contact in
 * the record, so one that is present still has to be a phone number.
 */
var REQUIRED = ['first','email','state'];
var OPTIONAL = ['last','phone'];
var FIELDS = REQUIRED.concat(OPTIONAL);

function isValidEmail(v){ return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
function isValidPhone(v){ return v.replace(/\D/g,'').length >= 10; }

function fieldStatus(id){
  var v = $(id).value.trim();
  /* Left blank is fine on an optional field; filled in badly is not. */
  if (OPTIONAL.indexOf(id) !== -1 && v === '') return true;
  if (id === 'email') return isValidEmail(v);
  if (id === 'phone') return isValidPhone(v);
  return v.length > 0;
}

function updateFormProgress(){
  /* The dots count the REQUIRED fields only. Counting the optional ones
     would show "3 of 5" to somebody who has given us everything we asked
     for, which reads as a form that is not finished when it is. */
  var done = REQUIRED.filter(fieldStatus).length;
  REQUIRED.forEach(function(id, i){
    $('ldot-' + (i+1)).classList.toggle('done', fieldStatus(id));
  });
  $('lock-count').textContent = done + ' of ' + REQUIRED.length + ' required';
  var btn = $('unlock-btn'), txt = $('unlock-btn-text');
  var needsMore = done < REQUIRED.length;
  var badOptional = OPTIONAL.filter(function (id) { return !fieldStatus(id); });
  var ready = !needsMore && !badOptional.length;
  if (ready){
    btn.classList.add('btn-ready'); txt.innerHTML = '&#128275; See My Illustration &rarr;';
  } else {
    btn.classList.remove('btn-ready');
    /* "Complete the required fields" is a lie when the required fields ARE
       complete and it is the optional phone that is half-typed -- it sends
       somebody hunting through fields that are already right. Name what is
       actually wrong. */
    txt.innerHTML = needsMore
      ? '&#128274; Complete the required fields'
      : '&#128274; Check the phone number';
  }
}

function tryUnlock(){
  var allOk = true;
  FIELDS.forEach(function(id){
    var ok = fieldStatus(id);
    /* An empty optional field is not an error and must not be reddened --
       marking it would tell somebody to fix a field we just told them they
       could skip. */
    $('f-' + id).classList.toggle('has-error', !ok);
    if (!ok) allOk = false;
  });
  updateFormProgress();
  if (allOk) unlockResults();
}

/* ---- Quote Bot lead capture -------------------------------------------- */
function qbCaptureLead(){
  if (!window.QuoteBot) return;
  try {
    var inp = getInputs();
    var rows = project(inp);
    var last = rows[rows.length - 1];
    var income = last.benefitBase * (inp.payout / 100);
    var consent = $('qb-consent');
    window.QuoteBot.capture({
      email: $('email').value.trim(),
      phone: $('phone').value.trim(),
      firstName: $('first').value.trim(),
      lastName: $('last').value.trim(),
      productLine: 'ANNUITY_INDEXED',
      inputs: {
        state: $('state').value,
        initialDeposit: inp.premium,
        currentAge: inp.curAge,
        incomeStartAge: inp.incAge,
        deferralYears: inp.deferYears,
        lifeMode: inp.lifeMode,
        rollUpRatePercent: inp.rollRate,
        rollUpType: inp.rollType,
        rollUpPeriodYears: inp.rollYears,
        premiumBonusPercent: inp.bonus,
        payoutFactorPercent: inp.payout,
        riderChargePercent: inp.riderFee,
        assumedIndexCreditPercent: inp.credit
      },
      results: {
        benefitBaseAtIncome: last.benefitBase,
        accountValueAtIncome: last.accountValue,
        guaranteedAnnualIncome: income,
        guaranteedMonthlyIncome: income / 12,
        totalIncomeToAge: income * Math.max(0, inp.lifeExp - inp.incAge),
        throughAge: inp.lifeExp
      },
      consentText: consent ? consent.textContent.replace(/\s+/g,' ').trim() : null
    });
  } catch (e) { /* capture must never break the calculator */ }
}

/* The way back. unlockResults hides the inputs column and collapses the
   grid; this undoes exactly those two things and puts the visitor back at
   the form, scrolled to it rather than left at the top of the page
   wondering where it went. The captured details stay as typed -- they have
   already been sent, and clearing them would ask for them twice. */
function editInputs(){
  document.querySelector('.inputs-col').classList.remove('col-hidden');
  $('calcGrid').classList.remove('results-revealed');
  document.querySelector('.inputs-col').scrollIntoView({ behavior:'smooth', block:'start' });
}

function unlockResults(){
  qbCaptureLead();
  $('results-lock-overlay').classList.add('unlocked');
  $('results-content').classList.remove('locked');
  document.querySelector('.inputs-col').classList.add('col-hidden');
  $('calcGrid').classList.add('results-revealed');
  setTimeout(function(){
    document.querySelector('.calc-wrapper').scrollIntoView({ behavior:'smooth', block:'start' });
  }, 200);
}

/* ============================================================
   WIRING
   ============================================================ */
function syncPayoutHint(){
  var inp = getInputs();
  var auto = autoPayout(inp.incAge, STATE.lifeMode);
  $('payoutAuto').textContent = STATE.payoutTouched
    ? 'Typical for age ' + inp.incAge + ': ' + auto.toFixed(1) + '%'
    : 'Set automatically from age ' + inp.incAge + ' — drag to override';
  if (!STATE.payoutTouched){
    $('payout').value = auto;
    $('payoutVal').textContent = auto.toFixed(1) + '%';
  }
}

/*
 * The bottom of this slider is one year past the age they just told us.
 *
 * "Show income through age 60" on a 68-year-old is not a conservative
 * answer, it is an impossible one -- the lifetime total it produces is for
 * a period that has already passed, and it would quietly read as zero.
 * The floor moves with the age, and a value already below the new floor is
 * pushed up to it rather than left behind, because a slider whose handle
 * sits off the left end of its own track is how you get a number nobody
 * chose.
 *
 * 41 before an age is entered: the Current age field starts at 40, so that
 * is one year past the youngest person this tool will quote.
 */
function syncLifeExpRange(){
  var cur = Math.round(num($('curAge').value));
  var floor = cur >= 40 ? cur + 1 : 41;
  var el = $('lifeExp');
  el.min = floor;
  if (Math.round(num(el.value)) < floor) el.value = floor;
}

function refreshLabels(){
  syncLifeExpRange();
  $('lifeExpVal').textContent   = Math.round(num($('lifeExp').value));
  $('rollRateVal').textContent  = num($('rollRate').value).toFixed(2).replace(/\.?0+$/,'') + '%';
  $('rollYearsVal').textContent = Math.round(num($('rollYears').value)) + ' yrs';
  $('bonusVal').textContent     = Math.round(num($('bonus').value)) + '%';
  $('payoutVal').textContent    = num($('payout').value).toFixed(1) + '%';
  $('riderFeeVal').textContent  = num($('riderFee').value).toFixed(2) + '%';
  $('creditVal').textContent    = num($('credit').value).toFixed(2).replace(/\.?0+$/,'') + '%';
}

function liveUpdate(){ refreshLabels(); syncPayoutHint(); refreshLabels(); calculate(); }

document.addEventListener('DOMContentLoaded', function(){
  STATES.forEach(function(s){
    var o = document.createElement('option'); o.value = s; o.textContent = s; $('state').appendChild(o);
  });

  ['premium','curAge','incAge','lifeExp','rollRate','rollYears','bonus','riderFee','credit'].forEach(function(id){
    $(id).addEventListener('input', liveUpdate);
  });
  $('payout').addEventListener('input', function(){ STATE.payoutTouched = true; liveUpdate(); });

  $('premium').addEventListener('blur', function(){
    var v = num(this.value); this.value = v ? v.toLocaleString('en-US') : '';
    liveUpdate();
  });

  [['lifeSeg','lifeMode'],['rollTypeSeg','rollType']].forEach(function(pair){
    $(pair[0]).addEventListener('click', function(e){
      var b = e.target.closest('button'); if (!b) return;
      this.querySelectorAll('button').forEach(function(x){ x.classList.remove('active'); });
      b.classList.add('active');
      STATE[pair[1]] = b.dataset.val;
      if (pair[1] === 'lifeMode') STATE.payoutTouched = false;
      liveUpdate();
    });
  });

  FIELDS.forEach(function(id){
    $(id).addEventListener('input', function(){
      if (id === 'phone'){
        var d = this.value.replace(/\D/g,'').slice(0,10);
        this.value = d.length > 6 ? '(' + d.slice(0,3) + ') ' + d.slice(3,6) + '-' + d.slice(6)
                   : d.length > 3 ? '(' + d.slice(0,3) + ') ' + d.slice(3)
                   : d;
      }
      updateFormProgress();
    });
    $(id).addEventListener('change', updateFormProgress);
  });

  $('unlock-btn').addEventListener('click', tryUnlock);
  $('editInputsBtn').addEventListener('click', editInputs);

  liveUpdate();
  updateFormProgress();
});
