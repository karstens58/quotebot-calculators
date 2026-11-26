/*
 * The agentless quote page's script, which used to sit inline in the page.
 *
 * It had to move: a Content-Security-Policy without 'unsafe-inline' blocks an
 * inline <script>, and this one defines the page's only action as well as
 * everything else it does -- so inline, the page's buttons would have gone
 * dead the moment the policy went on. Verified in a browser under the real
 * policy rather than reasoned about.
 *
 * Moved verbatim. The only addition is the qbActions.register() call at the
 * end, which was already here.
 */
/* ---------- STATES ---------- */
const STATES = ["Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut","Delaware","District of Columbia","Florida","Georgia","Hawaii","Idaho","Illinois","Indiana","Iowa","Kansas","Kentucky","Louisiana","Maine","Maryland","Massachusetts","Michigan","Minnesota","Mississippi","Missouri","Montana","Nebraska","Nevada","New Hampshire","New Jersey","New Mexico","New York","North Carolina","North Dakota","Ohio","Oklahoma","Oregon","Pennsylvania","Rhode Island","South Carolina","South Dakota","Tennessee","Texas","Utah","Vermont","Virginia","Washington","West Virginia","Wisconsin","Wyoming"];
const stateSel = document.getElementById('state');
/* NO STATE IS PRESELECTED, and on this page that rule carries more than it
   does elsewhere. A quietly-defaulted state does not just price the wrong
   rates — it decides WHICH RIDERS ARE OFFERED and which approved wording
   goes behind each "?", because Assurity write different riders state by
   state. Somebody who never looked at this field would be reading
   Colorado's disclosures about a policy they cannot buy. */
stateSel.appendChild(Object.assign(document.createElement('option'),
  { value: '', textContent: 'Select your state', disabled: true, selected: true }));
STATES.forEach(s => { const o = document.createElement('option'); o.value = s; o.textContent = s; stateSel.appendChild(o); });

/* ---------- COVERAGE ---------- */
const COV_STOPS = [275000,300000,325000,350000,400000,450000,500000,550000,600000,650000,700000,750000,800000];

/*
 * THERE IS NO RATE ENGINE IN THIS PAGE ANY MORE, and that is the change.
 *
 * It used to hold one: a per-thousand curve with a health factor, a tobacco
 * multiplier and a gender factor, calibrated by hand to look plausible. It
 * was labelled an estimate, which was honest, and it still meant the first
 * thing a visitor saw was a number nobody had quoted -- replaced a second
 * later by Assurity's, which is worse than showing nothing at all, because
 * the two were different and both looked like a price.
 *
 * So the only number this page can display is one Assurity sent. Until it
 * arrives there is no figure to label, which is why the estimate warning
 * went with the engine rather than being switched off and left to rot.
 */

/*
 * TRUE UNTIL A CARRIER HAS ANSWERED, and that default is the point.
 *
 * The figure on this page is produced by the table above -- a hand-
 * calibrated curve, not Assurity's filed rates, and its yearly number is
 * the monthly times twelve, which is not how they price at all (their
 * monthly factor is 0.087). So the page says so, every time, in the words
 * keypersoncalculator.html settled on: "estimates" is the claim you can
 * always defend.
 *
 * This is NOT a temporary label to delete when /assurity-quote is wired
 * in. It is the permanent mechanism, defaulted to the safe side: only a
 * carrier answer may set it false, so a refusal, an outage or a state we
 * cannot price all leave the label up without anyone handling those cases.
 */
/*
 * WHAT THE PRICE BOX IS DOING. 'pricing' while a carrier answer is in
 * flight, 'priced' once one has arrived for exactly what is on screen,
 * 'failed' when one cannot be had, 'idle' before there is enough to ask
 * with. A number is shown in exactly one of these.
 */
let priceState = 'idle';
/* The carrier's last answer for exactly what is on screen, or null. */
let currentQuote = null;
let currentUnderwriting = null;

let sliderIndex = 6;      // $500,000
let selectedTerm = 15;
let billing = 'monthly';

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
    duration: parseInt(document.getElementById('duration').value),
  };
}
const fmt2 = n => '$' + n.toFixed(2);
const fmtCov = n => '$' + n.toLocaleString();
const stopLabel = v => '$' + (v/1000) + 'K';
const nearestStop = v => { let bi=0,bd=Infinity; COV_STOPS.forEach((s,i)=>{const d=Math.abs(s-v); if(d<bd){bd=d;bi=i;}}); return bi; };

/* ---------- RENDER ---------- */
function renderTicks(){
  document.getElementById('covTicks').innerHTML = COV_STOPS.map((v,i)=>
    `<div class="slider-tick ${i===sliderIndex?'active':''}">${stopLabel(v)}</div>`).join('');
}
function renderSliderFill(){
  const pct = (sliderIndex / (COV_STOPS.length-1)) * 100;
  document.getElementById('covSlider').style.background =
    `linear-gradient(to right, var(--accent) 0%, var(--accent) ${pct}%, var(--gray-light) ${pct}%, var(--gray-light) 100%)`;
}
function renderPrice(){
  const cov = COV_STOPS[sliderIndex];
  /*
   * THEIR NUMBER WHEN WE HAVE ONE, AND NEVER ARITHMETIC ON IT. Assurity
   * send a figure per payment frequency, and Monthly is NOT Annual over
   * twelve -- their monthly modal factor is 0.087, and their total is the
   * sum of the rounded parts rather than a factor applied to the annual. So
   * each is read from them, not derived from the other.
   */
  const amt = document.getElementById('priceAmt');
  if (currentQuote){
    amt.textContent = fmt2(billing === 'monthly'
      ? currentQuote.total.Monthly : currentQuote.total.Annual);
    amt.classList.remove('waiting');
  } else {
    /* NO NUMBER AT ALL until they have sent one. The page holds nothing it
       could put here, which is the point -- an invented figure replaced a
       second later by theirs is two prices for one policy. */
    amt.textContent = priceState === 'failed' ? '\u2014' : '\u00a0';
    amt.classList.toggle('waiting', priceState === 'pricing');
  }
  document.getElementById('pricePending').hidden = priceState !== 'pricing';

  const why = document.getElementById('priceProblem');
  why.hidden = !quoteProblem;
  why.textContent = quoteProblem || '';

  /* Which of Assurity's five they actually priced, and whether reaching it
     meant walking down from the class that was asked for. Saying so here is
     the whole point of the route returning it: better now than at
     underwriting. */
  /*
   * SHOWN WHENEVER THERE IS A CLASS, not only when one was approximated.
   *
   * It was built to confess an approximation, and with the control offering
   * Assurity's own five there is never one to confess -- which would have
   * left this element permanently hidden and the code behind it dead. On a
   * page featuring this carrier, naming the class their price is for is
   * worth saying in its own right.
   */
  const uw = document.getElementById('priceClass');
  uw.hidden = !currentUnderwriting?.riskClass;
  if (currentUnderwriting?.riskClass){
    /* It can only be the class they picked now, so this says so rather
       than apologising for a class this page can no longer offer. */
    uw.textContent = 'Priced at Assurity\u2019s ' + classLabel(currentUnderwriting.riskClass) + '.';
  }
  document.getElementById('ptMonthly').classList.toggle('active', billing==='monthly');
  document.getElementById('ptYearly').classList.toggle('active', billing==='yearly');
}
function renderTermCards(){
  const cov = COV_STOPS[sliderIndex];
  const others = [10,15,20,30].filter(t => t !== selectedTerm);
  document.getElementById('termCards').innerHTML = others.map(t => `
    <div class="term-card">
      <div class="term-card-head">${t} Year Term</div>
      <div class="term-row"><div class="lbl">Policy Term</div><div class="val">${t} Years</div></div>
      <div class="term-row"><div class="lbl">Base Coverage</div><div class="val">${fmtCov(cov)}</div></div>
      <div class="term-row total"><div class="lbl">Total</div><div class="val">${termPrice(t)}</div></div>
      <button class="term-select" type="button" data-term="${t}">Select</button>
    </div>`).join('');
  document.querySelectorAll('.term-select').forEach(b => b.addEventListener('click', () => {
    selectedTerm = parseInt(b.dataset.term);
    document.getElementById('termLength').value = selectedTerm;
    renderPrice(); renderTermCards(); loadPanel(); priceImmediately();
    document.querySelector('.cov-card').scrollIntoView({ behavior:'smooth', block:'start' });
  }));
}
/* ---------- RIDERS (from the carrier, via quote-engine) ---------- */
/*
 * THE RIDERS ARE NOT LISTED HERE, AND THE WORDS ARE NOT EITHER.
 *
 * Both come from GET /assurity-panel, which answers for one state and one
 * term together. Assurity do not write the same riders everywhere, and the
 * text they have approved varies by state as well -- so a list typed into
 * this file would be right in Colorado and quietly wrong in Florida, and the
 * approved wording would sit in a public repository with nothing checking it
 * had not drifted. quotebot-backend holds one copy, digest-verified.
 *
 * If the panel cannot be had, this shows NO riders. Not a cached list, not
 * the five we used to hardcode: a visitor who sees a rider offered has been
 * told it is available in their state, and we only know that from the
 * carrier.
 */
const STATE_CODES = {"Alabama":"AL","Alaska":"AK","Arizona":"AZ","Arkansas":"AR","California":"CA","Colorado":"CO","Connecticut":"CT","Delaware":"DE","District of Columbia":"DC","Florida":"FL","Georgia":"GA","Hawaii":"HI","Idaho":"ID","Illinois":"IL","Indiana":"IN","Iowa":"IA","Kansas":"KS","Kentucky":"KY","Louisiana":"LA","Maine":"ME","Maryland":"MD","Massachusetts":"MA","Michigan":"MI","Minnesota":"MN","Mississippi":"MS","Missouri":"MO","Montana":"MT","Nebraska":"NE","Nevada":"NV","New Hampshire":"NH","New Jersey":"NJ","New Mexico":"NM","New York":"NY","North Carolina":"NC","North Dakota":"ND","Ohio":"OH","Oklahoma":"OK","Oregon":"OR","Pennsylvania":"PA","Rhode Island":"RI","South Carolina":"SC","South Dakota":"SD","Tennessee":"TN","Texas":"TX","Utah":"UT","Vermont":"VT","Virginia":"VA","Washington":"WA","West Virginia":"WV","Wisconsin":"WI","Wyoming":"WY"};
/* Their spelling for a term, which is what the route takes. */
const TERM_PERIODS = { 10:'TenYears', 15:'FifteenYears', 20:'TwentyYears', 30:'ThirtyYears' };

let panel = null;          // the carrier's answer for the state+term showing
let panelKey = '';         // what that answer was for
let panelSeq = 0;          // so a slow reply cannot overwrite a newer one
const chosenRiders = new Set();

const esc = (v) => String(v ?? '').replace(/[&<>"']/g,
  (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

async function loadPanel(){
  const inp = getInputs();
  const state = STATE_CODES[inp.state];
  const term = TERM_PERIODS[selectedTerm];
  const key = state + '|' + term;
  if (!state || !term) { panel = null; panelKey = ''; return renderRiders(); }
  if (key === panelKey) return;                    // already showing this one

  const endpoint = window.QB_QUOTE_ENDPOINT || '';
  if (!/^https?:\/\//i.test(endpoint)) { panel = null; panelKey = ''; return renderRiders(); }

  const seq = ++panelSeq;
  try {
    const res = await fetch(endpoint.replace(/\/$/, '')
      + '/assurity-panel?state=' + encodeURIComponent(state) + '&term=' + encodeURIComponent(term));
    const data = await res.json().catch(() => ({}));
    if (seq !== panelSeq) return;                  // a newer ask has overtaken this
    /* A 502 means they offer something we hold no approved words for, a 503
       that the integration is not configured. Both are ours to fix and
       neither is the visitor's business -- what they must not get is a rider
       with nothing behind the "?". */
    panel = res.ok && data.panel ? data.panel : null;
    panelKey = panel ? key : '';
    if (!panel) console.warn('[quote-bot] no Assurity rider panel for ' + key, res.status, data.error || '');
  } catch (err) {
    if (seq !== panelSeq) return;
    panel = null; panelKey = '';
    console.warn('[quote-bot] the Assurity rider panel could not be reached', err);
  }
  renderRiders();
  /* The classes come from the same answer and for the same reason -- see
     the note on `classes` in the panel. */
  renderClasses();
}

/*
 * THE FIELDS A RIDER NEEDS, AND NOT ONE OF THEM IS DECIDED HERE.
 *
 *   amount          present only when the carrier gives this rider a
 *                   BenefitAmount range, with their own minimum, maximum and
 *                   increment. `amountFloor` means the minimum is OURS and
 *                   stricter than theirs, and the page says so rather than
 *                   passing off our conservatism as their filing.
 *   occupation      only when the panel says `needsOccupation`. Assurity's
 *                   spec marks it optional; their service answers 400
 *                   "'Occupation' must not be empty" without it, and the
 *                   two riders that need it are the two disability income
 *                   ones. The page does not hold that list -- the panel does.
 *
 * Which is why a rider the carrier stops writing, or starts writing with an
 * amount, changes this panel without anybody editing this file.
 */
/* Assurity's own names for their five classes. Shown only when the class we
   priced is not the one that was asked for. */
/*
 * THE NAMES ARE THE PANEL'S -- there is no copy here any more.
 *
 * There was one, and it had already drifted: this file said "Preferred Plus
 * Non-Tobacco" where the server says "Preferred Plus, non-tobacco". Two
 * vocabularies for five classes, on the page whose subject is that carrier.
 *
 * Read through classLabel() so a missing panel shows the raw class rather
 * than "undefined", which is what a lookup into an absent table gives.
 */
function classLabel(value) {
  const found = (panel && panel.classes ? panel.classes : [])
    .find((c) => c.value === value);
  return found ? found.label : String(value || '');
}

/*
 * ONLY THE CLASSES THIS CARRIER WRITES, and only the ones that match the
 * tobacco answer beside them.
 *
 * Assurity fold tobacco into the class -- five of them, three non-tobacco
 * and two tobacco -- so the two controls cannot be allowed to contradict
 * each other. The tobacco question stays because it is a question a visitor
 * expects and the lead carries it; it now decides which classes are on
 * offer rather than being mapped alongside them.
 */
function renderClasses() {
  const sel = document.getElementById('health');
  if (!sel) return;
  const smokes = (document.querySelector('#tobaccoSeg .active') || {}).dataset?.val === 'Yes';
  const offered = (panel && panel.classes ? panel.classes : [])
    .filter((c) => c.tobacco === smokes);

  const had = sel.value;
  sel.innerHTML = offered
    .map((c) => '<option value="' + c.value + '">' + c.label + '</option>')
    .join('');
  /* Keep their choice across a tobacco change where it still exists; the
     worst class otherwise, which is the safe end to land on. */
  if (offered.some((c) => c.value === had)) sel.value = had;
  else if (offered.length) sel.value = offered[offered.length - 1].value;
}
const money0 = (n) => '$' + Number(n).toLocaleString('en-US');
const riderAmounts = new Map();
const occupation = { grossMonthlyIncome: null, isSelfEmployed: false,
  isGovernmentEmployee: false, isRailroadWorker: false,
  isWorkingAtLeast30HoursAWeek: true };

/*
 * EVERY id IS SCOPED TO ITS RIDER. Both disability riders render their own
 * copy of these fields, so an unscoped `id="income"` appeared twice in the
 * document -- `getElementById` returns the first, a <label for> points at
 * whichever it finds, and the one a visitor can see may not be the one
 * being read. Only one of the two can ever be chosen, but both are in the
 * DOM.
 */
const YESNO = (lookup, name, key, yesFirst) => `
      <div class="rider-field">
        <label>${esc(name)}</label>
        <div class="rider-seg" data-occ="${esc(key)}" data-for="${esc(lookup)}">
          <button type="button" data-val="yes"${yesFirst ? ' class="active"' : ''}>Yes</button>
          <button type="button" data-val="no"${yesFirst ? '' : ' class="active"'}>No</button>
        </div>
      </div>`;

function fieldsHtml(r){
  if (!r.amount && !r.needsOccupation) return '';
  const parts = [];

  if (r.amount){
    const { minimum, maximum, increment } = r.amount;
    const steps = increment > 1 ? `, in ${money0(increment)} steps` : '';
    parts.push(`
      <div class="rider-field" data-amount="${esc(r.lookup)}">
        <label for="amt-${esc(r.lookup)}">Benefit amount</label>
        <div class="input-wrap"><span class="input-prefix">$</span>
          <input id="amt-${esc(r.lookup)}" inputmode="numeric" autocomplete="off"
                 value="${Number(riderAmounts.get(r.lookup) ?? minimum).toLocaleString('en-US')}">
        </div>
        <p class="rider-hint">${money0(minimum)} to ${money0(maximum)}${steps}.</p>
        ${r.amountFloor ? `<p class="rider-hint ours">Our minimum is ${money0(r.amountFloor.minimum)} &mdash; Assurity's quote service will accept less, but the product is not written below it, so a lower figure would be refused at underwriting.</p>` : ''}
      </div>`);
  }

  if (r.needsOccupation){
    parts.push(`
      <p class="rider-why">Assurity price this one against what you earn, so they need a few details about your work.</p>
      <div class="rider-field" data-income="1">
        <label for="income-${esc(r.lookup)}">Gross monthly income</label>
        <div class="input-wrap"><span class="input-prefix">$</span>
          <input id="income-${esc(r.lookup)}" inputmode="numeric" autocomplete="off"
                 value="${occupation.grossMonthlyIncome ? Number(occupation.grossMonthlyIncome).toLocaleString('en-US') : ''}" placeholder="6,000">
        </div>
        <p class="rider-hint">Before tax.</p>
      </div>`);
    parts.push(YESNO(r.lookup, 'Working 30+ hours a week', 'isWorkingAtLeast30HoursAWeek', occupation.isWorkingAtLeast30HoursAWeek));
    parts.push(YESNO(r.lookup, 'Self-employed', 'isSelfEmployed', occupation.isSelfEmployed));
    parts.push(YESNO(r.lookup, 'Government employee', 'isGovernmentEmployee', occupation.isGovernmentEmployee));
    parts.push(YESNO(r.lookup, 'Railroad worker', 'isRailroadWorker', occupation.isRailroadWorker));
  }

  parts.push(`<button type="button" class="rider-apply" data-apply="${esc(r.lookup)}">Apply</button>`);
  /*
   * The fields fold away once they have been applied, because a rider that
   * is settled is a line of fact, not a form. Five riders left open at once
   * push the one somebody is reading off the screen.
   *
   * What stays is the figure that was applied and a way back to it --
   * collapsing a panel that cannot be reopened is just losing it.
   */
  return `<div class="rider-fields" id="fields-${esc(r.lookup)}" hidden>${parts.join('')}</div>`
    + `<div class="rider-applied" id="applied-${esc(r.lookup)}" hidden>
         <span id="appliedText-${esc(r.lookup)}"></span>
         <button type="button" class="rider-edit" data-edit="${esc(r.lookup)}">Change</button>
       </div>`;
}

function noteHtml(d, stateName){
  const vars = (d.variations || []).map((t) =>
    `<p class="var"><b>In ${esc(stateName)}:</b> ${esc(t)}</p>`).join('');
  return `<div class="rider-note" id="note-${esc(d.lookup)}" hidden>
      <p>${esc(d.base)}</p>${vars}
      <p class="form">Assurity form ${esc(d.form)}</p>
    </div>`;
}

function renderRiders(){
  const list = document.getElementById('riderList');
  const incl = document.getElementById('riderIncluded');
  const stateName = getInputs().state;

  if (!panel){
    list.innerHTML = `<p class="rider-empty">Optional riders for ${esc(stateName)} aren't available to show right now. You can still continue — we'll go through them with you before anything is issued.</p>`;
    incl.hidden = true; incl.innerHTML = '';
    return;
  }

  list.innerHTML = panel.riders.map((r) => `
    <div class="rider-item">
      <div class="rider-row">
        <div class="rider-label">${esc(r.name)}
          <button type="button" class="rider-help" data-note="${esc(r.lookup)}"
                  aria-expanded="false" aria-controls="note-${esc(r.lookup)}"
                  aria-label="What ${esc(r.name)} covers">?</button>
        </div>
        <div class="rider-toggle" data-rider="${esc(r.lookup)}"
             data-exclusive="${esc((r.exclusiveWith || []).join(' '))}">
          <button type="button" data-val="yes"${chosenRiders.has(r.lookup) ? ' class="active"' : ''}>Yes</button>
          <button type="button" data-val="no"${chosenRiders.has(r.lookup) ? '' : ' class="active"'}>No</button>
        </div>
      </div>
      ${noteHtml(r.disclosure, stateName)}
      ${fieldsHtml(r)}
    </div>`).join('');

  /* Carried free by every policy and never in the carrier's options list, so
     a page built by walking that list drops it. It is a selling point. */
  const included = panel.included || [];
  incl.hidden = included.length === 0;
  incl.innerHTML = included.length === 0 ? '' :
    `<div class="rider-included-head">Included at no extra cost</div>` + included.map((i) => `
      <div class="rider-item">
        <div class="rider-row">
          <div class="rider-label">${esc(i.name)}
            <button type="button" class="rider-help" data-note="${esc(i.lookup)}"
                    aria-expanded="false" aria-controls="note-${esc(i.lookup)}"
                    aria-label="What ${esc(i.name)} covers">?</button>
          </div>
          <span class="included-pill">Included</span>
        </div>
        ${noteHtml(i.disclosure, stateName)}
      </div>`).join('');
}

/*
 * One listener per behaviour on the whole panel, so re-rendering the list
 * never leaves a dead "?" behind -- there is nothing bound to the rows.
 */
const riderPanel = document.querySelector('.cov-riders');

const noteFor = (help) => document.getElementById('note-' + help.dataset.note);
function showNote(help, show, pin){
  const note = noteFor(help);
  if (!note) return;
  if (!show && note.hasAttribute('data-pinned') && !pin) return;  // a pinned one stays
  note.hidden = !show;
  if (pin && show) note.setAttribute('data-pinned', '');
  if (!show) note.removeAttribute('data-pinned');
  help.setAttribute('aria-expanded', String(show));
}
function closeAll(except){
  riderPanel.querySelectorAll('.rider-note').forEach((n) => {
    if (n === except) return;
    n.hidden = true; n.removeAttribute('data-pinned');
  });
  riderPanel.querySelectorAll('.rider-help').forEach((h) => {
    if (noteFor(h) !== except) h.setAttribute('aria-expanded', 'false');
  });
}

/* HOVER IS AN ENHANCEMENT, NOT THE MECHANISM. Bound only where the browser
   says a fine pointer exists, so a touch screen never arms it -- and even
   then every one of these does the same thing a tap already does. */
const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
if (canHover){
  riderPanel.addEventListener('mouseover', (e) => {
    const help = e.target.closest('.rider-help');
    if (!help) return;
    closeAll(noteFor(help));
    showNote(help, true, false);
  });
  riderPanel.addEventListener('mouseout', (e) => {
    const item = e.target.closest('.rider-item');
    /* Only when the pointer has actually left the row -- the bubble is
       INSIDE .rider-item, so moving into it to read is not a leave. */
    if (!item || item.contains(e.relatedTarget)) return;
    const help = item.querySelector('.rider-help');
    if (help) showNote(help, false, false);
  });
}

/* ---------- PRICING (Assurity's own, via quote-engine) ---------- */
/*
 * THE ONLY NUMBER THIS PAGE CAN SHOW IS ONE ASSURITY SENT. There is no
 * fallback to fall back to any more. Until an answer arrives the box is
 * empty and says it is pricing; if one cannot be had it shows a dash and
 * why. ANY change to the ask empties it again, because their premium for
 * $500,000 is not their premium for $550,000 and leaving the old figure up
 * while the slider moves is the most believable wrong number this page
 * could show.
 */
const PRICED = new Map();          // the whole ask -> the carrier's answer
let priceSeq = 0;
let priceTimer = null;
let quoteProblem = null;

function riderPayload(){
  return [...chosenRiders].map((lookup) => {
    const r = panel?.riders.find((x) => x.lookup === lookup);
    const amount = riderAmounts.get(lookup);
    return r?.amount ? { lookup, amount } : { lookup };
  });
}

/** Null when there is not yet enough to ask with -- not an error, just early. */
function buildAsk(){
  const inp = getInputs();
  const state = STATE_CODES[inp.state];
  const term = TERM_PERIODS[selectedTerm];
  if (!state || !term || !inp.age || inp.age < 18) return null;
  const riders = riderPayload();
  const needsOcc = riders.some((r) =>
    panel?.riders.find((x) => x.lookup === r.lookup)?.needsOccupation);
  if (needsOcc && !occupation.grossMonthlyIncome) return null;
  return {
    state, term,
    faceAmount: COV_STOPS[sliderIndex],
    age: inp.age,
    gender: inp.gender,
    /*
     * ASSURITY'S OWN, SENT AS CHOSEN. The control offers nothing else, so
     * there is nothing to map and nothing to approximate -- the route takes
     * a riskClass as given and answers approximated: false.
     *
     * The tobacco answer still goes with it. It decided which classes were
     * on offer, and the lead carries it.
     */
    riskClass: inp.health,
    tobacco: inp.tobacco === 'Yes',
    riders,
    ...(needsOcc ? { occupation } : {}),
  };
}

/*
 * Anything that changes the ask makes the figure on screen wrong, so it goes
 * immediately -- and the spinner goes up in the same breath, because the gap
 * between "that number is stale" and "a new one is coming" is where a blank
 * box looks like a broken page.
 */
/* Clear the figure and come to rest. Nothing further is coming. */
function stopPricing(state){
  currentQuote = null;
  currentUnderwriting = null;
  quoteProblem = null;
  priceState = state;
  renderPrice();
}

function invalidatePrice(){
  currentQuote = null;
  currentUnderwriting = null;
  quoteProblem = null;
  /*
   * 'pricing' when a request is actually about to go, 'idle' when there is
   * not yet enough to ask with. Only the two functions below call this, and
   * both follow it with a request -- so the spinner can never be left
   * turning over something nobody is going to ask.
   */
  priceState = buildAsk() ? 'pricing' : 'idle';
  renderPrice();
}

async function priceNow(){
  const ask = buildAsk();
  /* Not an error -- a state or a date of birth has not been given yet, so
     there is nothing to ask and nothing is coming. */
  if (!ask) return stopPricing('idle');

  const endpoint = window.QB_QUOTE_ENDPOINT || '';
  /*
   * THIS ONE USED TO GO THROUGH invalidatePrice, WHICH TURNED THE SPINNER
   * ON. With no endpoint configured nothing was ever going to be asked, so
   * the dots ran over an empty box for as long as the page was open. It is
   * a failure, and it says so.
   */
  if (!/^https?:\/\//i.test(endpoint)) return stopPricing('failed');

  const key = JSON.stringify(ask);
  /* An exact repeat costs nothing. Somebody who moves the slider up and
     back, or switches a rider off and on, has already been priced for this
     and should not spend a carrier request to learn it twice. */
  if (PRICED.has(key)){
    applyQuote(PRICED.get(key));
    priceOtherTerms(ask);
    return;
  }

  const seq = ++priceSeq;
  if (priceState !== 'pricing'){ priceState = 'pricing'; renderPrice(); }
  try {
    const res = await fetch(endpoint.replace(/\/$/, '') + '/assurity-quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: key,
    });
    const data = await res.json().catch(() => ({}));
    if (seq !== priceSeq) return;        // a newer ask has overtaken this one

    if (!res.ok || !data.quote){
      /*
       * THE CARRIER'S OWN WORDS WHERE THERE ARE ANY. Their refusals name a
       * field and say what is wrong with it, which is the only part a
       * visitor can act on. A 403 means this deployment may not show their
       * rates at all, which is ours and not theirs to explain.
       */
      quoteProblem = res.status === 403
        ? null
        : (data.problems?.[0]?.message || data.refusals?.[0] || null);
      priceState = 'failed';
      currentQuote = null;
      PRICED.delete(key);
      renderPrice();
      return;
    }

    PRICED.set(key, data);
    applyQuote(data);
    priceOtherTerms(ask);
  } catch (err) {
    if (seq !== priceSeq) return;
    priceState = 'failed';
    currentQuote = null;
    quoteProblem = null;
    renderPrice();
  }
}

/*
 * THE OTHER THREE TERM CARDS, PRICED AFTER THE ONE ON SCREEN.
 *
 * Assurity price ONE TERM PER REQUEST -- the term rides on the Base
 * coverage -- so there is no equivalent of Compulife's single request
 * returning a whole table. Four terms are four calls.
 *
 * So they go second, never in the way: the term the visitor is actually
 * looking at is asked for on its own and rendered the moment it lands, and
 * the comparison cards fill in behind it. A card with no price yet shows a
 * dash rather than a guess, and an exact repeat is served from the same
 * cache as everything else, so moving the slider back and forth costs
 * nothing.
 */
const TERM_YEARS = [10, 15, 20, 30];
function priceOtherTerms(ask){
  for (const years of TERM_YEARS){
    if (years === selectedTerm) continue;
    const other = { ...ask, term: TERM_PERIODS[years] };
    const key = JSON.stringify(other);
    if (PRICED.has(key)) continue;
    const endpoint = (window.QB_QUOTE_ENDPOINT || '').replace(/\/$/, '');
    fetch(endpoint + '/assurity-quote', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: key,
    }).then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (!d?.quote) return;
      PRICED.set(key, d);
      renderTermCards();
    }).catch(() => {});
  }
}

/** The carrier's monthly figure for one term, or a dash. */
function termPrice(years){
  const ask = buildAsk();
  if (!ask) return '\u2014';
  const held = PRICED.get(JSON.stringify({ ...ask, term: TERM_PERIODS[years] }));
  return held ? fmt2(held.quote.total.Monthly) + '/mo' : '\u2014';
}

function applyQuote(data){
  currentQuote = data.quote;
  currentUnderwriting = data.underwriting ?? null;
  quoteProblem = null;
  priceState = 'priced';
  renderPrice();
  renderTermCards();
}

/*
 * TWO SPEEDS, AND THE DIFFERENCE IS WHETHER A PERSON HAS FINISHED DECIDING.
 *
 * A slider produces a position every few pixels and only the one it stops on
 * is worth a carrier request, so that waits. Choosing a term, a state, a
 * health class or pressing Apply is a finished decision, and making someone
 * wait out a debounce they did not cause is half a second of nothing for no
 * reason -- which is most of what "it takes a moment to show" was.
 *
 * Both put the spinner up straight away. Only the request is deferred.
 */
function pricePresently(){
  invalidatePrice();
  clearTimeout(priceTimer);
  priceTimer = setTimeout(priceNow, 450);
}

function priceImmediately(){
  invalidatePrice();
  clearTimeout(priceTimer);
  priceNow();
}

riderPanel.addEventListener('click', (e) => {
  const help = e.target.closest('.rider-help');
  if (help){
    const note = noteFor(help);
    if (!note) return;
    /* A click PINS, so the disclosure survives the pointer wandering off --
       nobody reads a paragraph holding the mouse still. A second click
       closes it. On touch this is the whole interaction. */
    const open = !note.hidden && note.hasAttribute('data-pinned');
    closeAll();
    showNote(help, !open, true);
    return;
  }
  const btn = e.target.closest('.rider-toggle button');
  if (!btn) return;
  const tg = btn.closest('.rider-toggle');
  const lookup = tg.dataset.rider;
  tg.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');

  const fieldsOf = (l) => document.getElementById('fields-' + l);

  if (btn.dataset.val === 'yes'){
    const fields = fieldsOf(lookup);
    if (fields){
      /*
       * SWITCHING IT ON DOES NOT ADD IT TO THE QUOTE. Apply does.
       *
       * The fields open and the price is left exactly as it is, because it
       * is still the right price for what has actually been applied. An
       * earlier version added the rider here and blanked the premium, which
       * left a spinner running over an empty box until somebody pressed a
       * button nobody had told them about -- and an amount of "whatever the
       * minimum happened to be" is not what they asked for either.
       */
      fields.hidden = false;
      document.getElementById('applied-' + lookup).hidden = true;
    } else {
      chosenRiders.add(lookup);
      /* An on-or-off rider: there is nothing to fill in, so switching it on
         IS the apply. Making somebody press a button under an empty panel
         would be ceremony. */
      priceImmediately();
    }
    /* ONE DISABILITY RIDER PER POLICY -- Assurity's rule, not ours, and it
       arrives with the panel rather than being typed here. Turning this one
       on turns the other one off, visibly, instead of letting an applicant
       pick a pair the carrier will not write. */
    let droppedOne = false;
    (tg.dataset.exclusive || '').split(' ').filter(Boolean).forEach((other) => {
      droppedOne = chosenRiders.delete(other) || droppedOne;
      const o = document.querySelector(`.rider-toggle[data-rider="${other}"]`);
      if (!o) return;
      o.querySelectorAll('button').forEach((b) =>
        b.classList.toggle('active', b.dataset.val === 'no'));
      const of = fieldsOf(other);
      if (of) of.hidden = true;
      const oa = document.getElementById('applied-' + other);
      if (oa) oa.hidden = true;
    });
    /* The dropped rider WAS in the quote, so the price has changed even
       though nothing has been applied yet. */
    if (droppedOne) priceImmediately();
  } else {
    const wasInTheQuote = chosenRiders.delete(lookup);
    const fields = fieldsOf(lookup);
    if (fields) fields.hidden = true;
    const applied = document.getElementById('applied-' + lookup);
    if (applied) applied.hidden = true;
    /* Only if it was actually in the quote. Switching off a rider that was
       opened and never applied changes nothing about the price, and asking
       the carrier to tell us so is a request for no reason. */
    if (wasInTheQuote) priceImmediately();
  }
});

/* ---------- the rider fields ---------- */

const digits = (v) => String(v ?? '').replace(/[^0-9]/g, '');

/*
 * DOWN TO THE CARRIER'S INCREMENT, NEVER UP. Every limit on these riders is
 * a ceiling -- Scott's reasoning, and the general one -- so rounding down is
 * the only direction that cannot breach one. Assurity's service refuses an
 * off-increment amount rather than tidying it, so this is what stops a
 * visitor being refused for typing a round number.
 */
function settleAmount(lookup, raw){
  const r = panel?.riders.find((x) => x.lookup === lookup);
  if (!r?.amount) return null;
  const { minimum, maximum, increment } = r.amount;
  const n = Number(digits(raw));
  if (!Number.isFinite(n) || n <= 0) return null;
  const capped = Math.min(n, maximum);
  if (capped < minimum) return minimum;
  return minimum + Math.floor((capped - minimum) / increment) * increment;
}

riderPanel.addEventListener('input', (e) => {
  const el = e.target;
  if (el.id?.startsWith('income-')){
    el.value = digits(el.value) ? Number(digits(el.value)).toLocaleString('en-US') : '';
    return;
  }
  if (el.id?.startsWith('amt-')){
    el.value = digits(el.value) ? Number(digits(el.value)).toLocaleString('en-US') : '';
  }
});

riderPanel.addEventListener('click', (e) => {
  /* The Yes/No answers about work. They feed the quote, never the page. */
  const seg = e.target.closest('.rider-seg');
  if (seg && e.target.tagName === 'BUTTON'){
    const answer = e.target.dataset.val === 'yes';
    occupation[seg.dataset.occ] = answer;
    /* The same answer in every copy of these fields. It is one person's
       employment, and both disability riders render their own set -- a
       divergence between them would show one answer and send the other. */
    riderPanel.querySelectorAll(`.rider-seg[data-occ="${seg.dataset.occ}"]`)
      .forEach((other) => other.querySelectorAll('button').forEach((b) =>
        b.classList.toggle('active', (b.dataset.val === 'yes') === answer)));
    return;
  }

  const edit = e.target.closest('.rider-edit');
  if (edit){
    document.getElementById('fields-' + edit.dataset.edit).hidden = false;
    document.getElementById('applied-' + edit.dataset.edit).hidden = true;
    return;
  }

  const apply = e.target.closest('.rider-apply');
  if (!apply) return;
  const lookup = apply.dataset.apply;
  const fields = document.getElementById('fields-' + lookup);
  const amountField = fields.querySelector('[data-amount]');
  const incomeField = fields.querySelector('[data-income]');

  let ok = true;
  if (amountField){
    const input = amountField.querySelector('input');
    const settled = settleAmount(lookup, input.value);
    if (settled === null){ amountField.classList.add('bad'); ok = false; }
    else {
      amountField.classList.remove('bad');
      /* Shown back as it will be ASKED FOR, not as it was typed. Somebody
         who enters 1,250 on a $100 increment is quoted 1,200, and seeing
         1,250 on screen beside a premium for 1,200 is how a page lies
         quietly. */
      input.value = settled.toLocaleString('en-US');
      riderAmounts.set(lookup, settled);
    }
  }
  if (incomeField){
    const n = Number(digits(incomeField.querySelector('input').value));
    if (!Number.isFinite(n) || n <= 0){ incomeField.classList.add('bad'); ok = false; }
    else {
      incomeField.classList.remove('bad');
      occupation.grossMonthlyIncome = n;
      /* And into the other rider's copy, for the same reason. */
      riderPanel.querySelectorAll('[data-income] input')
        .forEach((i) => { i.value = n.toLocaleString('en-US'); });
    }
  }
  if (!ok) return;

  /*
   * FOLDED AWAY ONLY ONCE IT IS VALID. An Apply that was refused for a
   * missing income leaves the fields open with the bad one marked, because
   * collapsing a panel somebody still has to fix is how a form loses
   * someone.
   */
  chosenRiders.add(lookup);

  const summary = [];
  if (amountField) summary.push(money0(riderAmounts.get(lookup)));
  if (incomeField) summary.push(money0(occupation.grossMonthlyIncome) + '/mo income');
  document.getElementById('appliedText-' + lookup).innerHTML =
    summary.map((v) => `<b>${esc(v)}</b>`).join(' &middot; ');
  fields.hidden = true;
  document.getElementById('applied-' + lookup).hidden = false;

  /* Apply does not wait out the debounce either. It is a deliberate press. */
  priceImmediately();
});
function renderWelcome(){
  const inp = getInputs();
  const name = inp.firstName || 'there';
  document.getElementById('welcomeName').textContent = `Welcome ${name}!`;
}
function renderAll(){
  renderWelcome(); renderTicks(); renderSliderFill(); renderPrice(); renderTermCards();
}

/* ---------- SEED FROM INTAKE & REVEAL ---------- */
function seedFromIntake(){
  const inp = getInputs();
  selectedTerm = [10,15,20,30].includes(inp.duration) ? inp.duration : 15;
  document.getElementById('termLength').value = selectedTerm;
  if (inp.coverage) sliderIndex = nearestStop(inp.coverage);
  document.getElementById('covSlider').value = sliderIndex;
  document.getElementById('covAmount').value = COV_STOPS[sliderIndex].toLocaleString();
}

/* ---------- INTERACTIONS ---------- */
// segmented toggles (left panel)
document.querySelectorAll('.inputs-panel .seg').forEach(seg => {
  seg.addEventListener('click', e => {
    if (e.target.tagName !== 'BUTTON') return;
    seg.querySelectorAll('button').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    /* Tobacco decides which of Assurity's five are on offer, so the control
       is rebuilt before anything is priced from it. Harmless on the gender
       toggle beside it, and cheaper than knowing which seg was clicked. */
    renderClasses();
    if (shown()) { renderAll(); priceImmediately(); }
  });
});
document.getElementById('dob').addEventListener('change', () => {
  /* The pill showed a hardcoded "Age 48" in the markup, which was fine while a
     date of birth was typed into the page and wrong the moment it was not: an
     empty field beside a confident age nobody entered. It now appears only
     once there is a date to compute from. */
  const dobValue = document.getElementById('dob').value;
  const agePill = document.getElementById('agePill');
  const years = computeAge(dobValue);
  agePill.hidden = !dobValue || !Number.isFinite(years) || years <= 0;
  agePill.textContent = agePill.hidden ? '' : 'Age ' + years;
  if (shown()) { renderAll(); priceImmediately(); }
});
// left-panel coverage formatting
document.getElementById('coverage').addEventListener('input', e => {
  const n = e.target.value.replace(/[^0-9]/g,'');
  e.target.value = n ? parseInt(n).toLocaleString() : '';
});
['state','health'].forEach(id => document.getElementById(id).addEventListener('change', () => { if (shown()) { renderAll(); loadPanel(); priceImmediately(); } }));
['firstName'].forEach(id => document.getElementById(id).addEventListener('input', () => { if (shown()) renderWelcome(); }));

// coverage slider
const slider = document.getElementById('covSlider');
slider.addEventListener('input', () => {
  sliderIndex = parseInt(slider.value);
  document.getElementById('covAmount').value = COV_STOPS[sliderIndex].toLocaleString();
  renderTicks(); renderSliderFill(); renderPrice(); renderTermCards(); pricePresently();
});
document.getElementById('covDown').addEventListener('click', () => { if (sliderIndex>0){ sliderIndex--; slider.value=sliderIndex; slider.dispatchEvent(new Event('input')); } });
document.getElementById('covUp').addEventListener('click', () => { if (sliderIndex<COV_STOPS.length-1){ sliderIndex++; slider.value=sliderIndex; slider.dispatchEvent(new Event('input')); } });

// coverage amount field (in card)
document.getElementById('covAmount').addEventListener('input', e => {
  const n = e.target.value.replace(/[^0-9]/g,'');
  e.target.value = n ? parseInt(n).toLocaleString() : '';
  if (n) { sliderIndex = nearestStop(parseInt(n)); slider.value = sliderIndex; renderTicks(); renderSliderFill(); renderPrice(); renderTermCards(); pricePresently(); }
});
// term length select (card)
document.getElementById('termLength').addEventListener('change', e => {
  selectedTerm = parseInt(e.target.value);
  renderPrice(); renderTermCards(); loadPanel(); priceImmediately();
});
// monthly/yearly toggle
document.getElementById('ptMonthly').addEventListener('click', () => { billing='monthly'; renderPrice(); });
document.getElementById('ptYearly').addEventListener('click', () => { billing='yearly'; renderPrice(); });

function shown(){ return document.getElementById('resultsContent').classList.contains('show'); }

// MAIN reveal
document.getElementById('quoteBtn').addEventListener('click', () => {
  seedFromIntake();
  renderRiders();          // the empty state, until the carrier answers
  loadPanel();
  renderAll();
  /* Price the policy itself straight away -- no debounce, nobody is still
     deciding. The premium is what they came for. */
  priceImmediately();
  document.getElementById('emptyState').style.display = 'none';
  document.getElementById('resultsContent').classList.add('show');
  document.querySelector('.quote-grid').classList.add('results-mode');
  window.scrollTo({ top: 0, behavior: 'smooth' });
});
// Edit -> bring inputs back
function editInputs(){
  document.querySelector('.quote-grid').classList.remove('results-mode');
  document.querySelector('.inputs-panel').scrollIntoView({ behavior:'smooth', block:'start' });
}

/* The markup names actions rather than carrying onclick attributes, because
   a Content-Security-Policy without 'unsafe-inline' blocks those. Only what
   is registered here can be reached from an attribute. */
window.qbActions.register({ editInputs: editInputs });
