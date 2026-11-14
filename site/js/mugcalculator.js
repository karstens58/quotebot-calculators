/*
 * mugcalculator.html's own script, which used to sit inline in the page.
 *
 * It had to move: a Content-Security-Policy without 'unsafe-inline' blocks an
 * inline <script>, so inline this page would have gone dead the moment the
 * policy went on -- quietly, with the markup looking perfectly correct.
 *
 * Moved verbatim.
 */
// ─── RATE TABLE ────────────────────────────────────────────────────────────────
// Monthly premium per $100 of monthly benefit
// Assumptions: 90-day elimination period, 24-month benefit period, illustrative
const RATES = {
  "5A": {a:1.20,b:1.50,c:1.90,d:2.40,e:3.10,f:4.00,g:5.20,h:6.80},
  "4A": {a:1.38,b:1.73,c:2.19,d:2.76,e:3.57,f:4.60,g:5.98,h:7.82},
  "3A": {a:1.62,b:2.03,c:2.57,d:3.24,e:4.19,f:5.40,g:7.02,h:9.18},
  "2A": {a:2.04,b:2.55,c:3.23,d:4.08,e:5.27,f:6.80,g:8.84,h:11.56},
  "1A": {a:3.00,b:3.75,c:4.75,d:6.00,e:7.75,f:10.00,g:13.00,h:17.00}
};

const OCC_INFO = {
  "5A": {label:"Class 5A · Professional",desc:"Physicians, surgeons, attorneys, CPAs, and senior executives. Most favorable rates. Own-occupation definition typically available.",badge:"c5a"},
  "4A": {label:"Class 4A · White Collar Professional",desc:"Engineers, managers, educators &amp; analysts. Own-occupation definition typically available.",badge:"c4a"},
  "3A": {label:"Class 3A · Sales &amp; Service",desc:"Real estate agents, financial advisors, retail managers, and similar roles. Moderate loading over professional classes.",badge:"c3a"},
  "2A": {label:"Class 2A · Skilled Trade",desc:"Electricians, plumbers, mechanics, and HVAC technicians. Higher physical risk reflects in premium. Modified own-occupation may apply.",badge:"c2a"},
  "1A": {label:"Class 1A · Manual &amp; Trade",desc:"Construction workers, warehouse associates, drivers, landscapers, and roofers. Any-occupation definition is standard. Contact an advisor for specialty options.",badge:"c1a"}
};

const OCC_DESCS = {
  "5A":"Physicians, attorneys, CPAs, and senior executives. Own-occupation coverage typically available with the most favorable rates.",
  "4A":"Engineers, managers, office professionals, educators, and salaried analysts. Own-occupation coverage typically available with favorable rates.",
  "3A":"Real estate agents, financial advisors, retail managers, and customer-facing sales roles. Moderate premium loading.",
  "2A":"Electricians, plumbers, mechanics, HVAC technicians, and similar skilled trades. Modified own-occupation definitions may apply.",
  "1A":"Construction workers, warehouse associates, delivery drivers, landscapers, and roofers. Any-occupation definitions are standard. Contact an advisor for specialty coverage options."
};

function getAgeBand(age) {
  if (age < 30) return "a";
  if (age < 35) return "b";
  if (age < 40) return "c";
  if (age < 45) return "d";
  if (age < 50) return "e";
  if (age < 55) return "f";
  if (age < 60) return "g";
  return "h";
}

// ─── STATE ──────────────────────────────────────────────────────────────────
let state = {
  mortgage: 2025,
  utilities: 420,
  groceries: 475,
  income: 63000,
  age: 35,
  occ: "4A",
  selfEmployed: false,
  gender: "male"
};

// ─── CALCULATIONS ───────────────────────────────────────────────────────────
function calculate() {
  const {mortgage, utilities, groceries, age, occ, selfEmployed} = state;
  const monthlyBenefit = mortgage + utilities + groceries;
  const totalCoverage   = monthlyBenefit * 24;

  const band = getAgeBand(age);
  const baseRate = RATES[occ][band];
  const empMult    = selfEmployed ? 1.20 : 1.00;
  const genderMult = state.gender === "female" ? 1.18 : state.gender === "na" ? 1.09 : 1.00;
  const multiplier = empMult * genderMult;
  const monthlyPremium = (monthlyBenefit / 100) * baseRate * multiplier;
  const annualPremium  = monthlyPremium * 12;

  // Use actual income from state
  const estAnnualIncome = state.income > 0 ? state.income : 63000;
  const pctIncome = estAnnualIncome > 0 ? (annualPremium / estAnnualIncome) * 100 : 0;
  const perDay = annualPremium / 365;

  return {monthlyBenefit, totalCoverage, monthlyPremium, annualPremium, pctIncome, perDay};
}

// ─── FORMAT HELPERS ─────────────────────────────────────────────────────────
function fmt(n) {
  return "$" + Math.round(n).toLocaleString("en-US");
}
function fmt2(n) {
  return n < 10 ? n.toFixed(2) : n.toFixed(1);
}

// ─── ANIMATED COUNTER ───────────────────────────────────────────────────────
const counters = {};
function animateTo(elId, targetVal, prefix, suffix, decimals) {
  if (counters[elId]) cancelAnimationFrame(counters[elId]);
  const el = document.getElementById(elId);
  if (!el) return;
  const start = parseFloat(el.dataset.val || 0);
  const delta = targetVal - start;
  const dur = 350;
  const startTime = performance.now();
  function step(now) {
    const t = Math.min((now - startTime) / dur, 1);
    const ease = 1 - Math.pow(1-t, 3);
    const cur = start + delta * ease;
    const display = decimals > 0 ? cur.toFixed(decimals) : Math.round(cur).toLocaleString("en-US");
    el.textContent = prefix + display + suffix;
    el.dataset.val = cur;
    if (t < 1) counters[elId] = requestAnimationFrame(step);
    else el.dataset.val = targetVal;
  }
  counters[elId] = requestAnimationFrame(step);
}

// ─── UPDATE UI ──────────────────────────────────────────────────────────────
function updateResults() {
  const r = calculate();
  const {mortgage, utilities, groceries, occ} = state;
  const total = r.monthlyBenefit;

  // Bars
  const maxBar = Math.max(total, 1);
  document.getElementById("bar-m").style.width = ((mortgage/maxBar)*100).toFixed(1)+"%";
  document.getElementById("bar-u").style.width = ((utilities/maxBar)*100).toFixed(1)+"%";
  document.getElementById("bar-g").style.width = ((groceries/maxBar)*100).toFixed(1)+"%";
  document.getElementById("bar-m-val").textContent = fmt(mortgage);
  document.getElementById("bar-u-val").textContent = fmt(utilities);
  document.getElementById("bar-g-val").textContent = fmt(groceries);

  // Benefit
  animateTo("benefit-display", r.monthlyBenefit, "$", "", 0);
  document.getElementById("coverage-pill").textContent = "✓ " + fmt(r.totalCoverage) + " total · 24-month protection";

  // Premium
  animateTo("premium-mo-display", r.monthlyPremium, "$", "", 0);
  document.getElementById("premium-yr-display").textContent = "~" + fmt(r.annualPremium);
  document.getElementById("pstat-pct").textContent = fmt2(r.pctIncome) + "%";
  document.getElementById("pstat-day").textContent = "$" + r.perDay.toFixed(2);

  // Occ badge + info
  const info = OCC_INFO[occ];
  const badge = document.getElementById("occ-badge");
  badge.textContent = "Class " + occ;
  badge.className = "occ-badge " + info.badge;

  document.getElementById("occ-info-box").innerHTML = "<strong>" + info.label + "</strong><br>" + info.desc;
}

// ─── SLIDER ↔ NUMBER SYNC ───────────────────────────────────────────────────
function syncExpense(key) {
  const slider = document.getElementById(key+"-slider");
  const num    = document.getElementById(key+"-num");
  const max    = parseFloat(slider.max);
  const val    = parseFloat(slider.value);
  const pct    = (val / max * 100).toFixed(1) + "%";
  const item   = document.getElementById("item-"+key[0]);
  if (item) item.querySelector(".expense-slider").style.setProperty("--pct", pct);
  num.value = val;
  state[key] = val;
  updateResults();
}

// ─── HELPERS: comma-formatted text inputs ───────────────────────────────────
function stripCommas(s) { return parseFloat(String(s).replace(/,/g,"")) || 0; }
function addCommas(n)   { return Math.round(n).toLocaleString("en-US"); }

["mortgage","utilities","groceries"].forEach(key => {
  const slider = document.getElementById(key+"-slider");
  const num    = document.getElementById(key+"-num");

  // Slider → text input
  slider.addEventListener("input", () => {
    const v = parseFloat(slider.value);
    state[key] = v;
    num.value = addCommas(v);
    const pct = (v / parseFloat(slider.max) * 100).toFixed(1) + "%";
    slider.style.setProperty("--pct", pct);
    updateResults();
  });

  // Text input: reformat with commas on blur
  num.addEventListener("blur", () => {
    let v = Math.max(0, Math.min(parseFloat(slider.max), stripCommas(num.value)));
    num.value = addCommas(v);
    slider.value = v;
    state[key] = v;
    const pct = (v / parseFloat(slider.max) * 100).toFixed(1) + "%";
    slider.style.setProperty("--pct", pct);
    updateResults();
  });

  // Text input: live update while typing (strip commas, allow only digits)
  num.addEventListener("input", () => {
    const raw = num.value.replace(/[^0-9]/g, "");
    const v   = parseFloat(raw) || 0;
    state[key] = v;
    if (v <= parseFloat(slider.max)) slider.value = v;
    const pct = (Math.min(v, parseFloat(slider.max)) / parseFloat(slider.max) * 100).toFixed(1) + "%";
    slider.style.setProperty("--pct", pct);
    updateResults();
  });

  // Reformat on focus-out handled by blur; strip commas on focus so user can edit cleanly
  num.addEventListener("focus", () => {
    num.value = String(stripCommas(num.value) || "");
  });
});

// ─── INCOME SLIDER + INPUT ─────────────────────────────────────────────────
const incomeSlider = document.getElementById("income-slider");
const incomeNum    = document.getElementById("income-num");

incomeSlider.addEventListener("input", () => {
  const v = parseFloat(incomeSlider.value);
  state.income = v;
  incomeNum.value = addCommas(v);
  const pct = ((v - 20000) / (500000 - 20000) * 100).toFixed(2) + "%";
  incomeSlider.style.background = "linear-gradient(to right,var(--accent) " + pct + ",var(--border) " + pct + ")";
  updateResults();
});

incomeNum.addEventListener("focus", () => {
  incomeNum.value = String(stripCommas(incomeNum.value) || "");
});

incomeNum.addEventListener("input", () => {
  const raw = incomeNum.value.replace(/[^0-9]/g, "");
  const v   = parseFloat(raw) || 0;
  state.income = v;
  if (v >= 20000 && v <= 500000) incomeSlider.value = v;
  const sliderVal = Math.min(Math.max(v, 20000), 500000);
  const pct = ((sliderVal - 20000) / (500000 - 20000) * 100).toFixed(2) + "%";
  incomeSlider.style.background = "linear-gradient(to right,var(--accent) " + pct + ",var(--border) " + pct + ")";
  updateResults();
});

incomeNum.addEventListener("blur", () => {
  let v = Math.max(0, stripCommas(incomeNum.value));
  incomeNum.value = addCommas(v);
  state.income = v;
  const sliderVal = Math.min(Math.max(v, 20000), 500000);
  incomeSlider.value = sliderVal;
  const pct = ((sliderVal - 20000) / (500000 - 20000) * 100).toFixed(2) + "%";
  incomeSlider.style.background = "linear-gradient(to right,var(--accent) " + pct + ",var(--border) " + pct + ")";
  updateResults();
});

// ─── AGE SLIDER ─────────────────────────────────────────────────────────────
const ageSlider = document.getElementById("age-slider");
ageSlider.addEventListener("input", () => {
  state.age = parseInt(ageSlider.value);
  document.getElementById("age-display").textContent = ageSlider.value;
  const pct = ((state.age-20)/(64-20)*100).toFixed(1)+"%";
  ageSlider.style.setProperty("--pct", pct);
  updateResults();
});

// ─── OCCUPATION ─────────────────────────────────────────────────────────────
document.getElementById("occ-select").addEventListener("change", function() {
  state.occ = this.value;
  document.getElementById("occ-desc").textContent = OCC_DESCS[this.value];
  updateResults();
});

// ─── EMPLOYMENT TOGGLE ───────────────────────────────────────────────────────
function setEmployment(type) {
  state.selfEmployed = (type === "self");
  document.getElementById("btn-w2").classList.toggle("active", type === "w2");
  document.getElementById("btn-self").classList.toggle("active", type === "self");
  updateResults();
}

// ─── RESET ──────────────────────────────────────────────────────────────────
function resetInput(key, defaultVal) {
  const slider = document.getElementById(key+"-slider");
  const num    = document.getElementById(key+"-num");
  slider.value = defaultVal;
  num.value    = addCommas(defaultVal);
  state[key]   = defaultVal;
  const pct = (defaultVal / parseFloat(slider.max) * 100).toFixed(1) + "%";
  slider.style.setProperty("--pct", pct);
  updateResults();
}

// ─── GENDER ──────────────────────────────────────────────────────────────────
function setGender(g) {
  state.gender = g;
  document.getElementById("btn-male").classList.toggle("active",   g === "male");
  document.getElementById("btn-female").classList.toggle("active", g === "female");
  updateResults();
}

// ─── STEP 4 FORM VALIDATION ──────────────────────────────────────────────────
const FIELDS = ["first","last","email","phone","state"];

function isValidEmail(v){ return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
function isValidPhone(v){ return v.replace(/\D/g,"").length >= 10; }

function formatPhone(input){
  let d = input.value.replace(/\D/g,"").slice(0,10);
  if(d.length >= 7) d = "("+d.slice(0,3)+") "+d.slice(3,6)+"-"+d.slice(6);
  else if(d.length >= 4) d = "("+d.slice(0,3)+") "+d.slice(3);
  else if(d.length > 0) d = "("+d;
  input.value = d;
}

function fieldStatus(id){
  const v = document.getElementById("f-"+id).value.trim();
  if(id==="first"||id==="last") return v.length > 0;
  if(id==="email")  return isValidEmail(v);
  if(id==="phone")  return isValidPhone(v);
  if(id==="state")  return v !== "";
  return false;
}

function validateField(id){
  const el  = document.getElementById("f-"+id);
  const err = document.getElementById("err-"+id);
  const ok  = fieldStatus(id);
  el.classList.toggle("f-valid",   ok);
  el.classList.toggle("f-invalid", !ok && el.value.trim() !== "");
  if(!ok && el.value.trim() !== ""){
    const msgs = {first:"Please enter your first name.",last:"Please enter your last name.",
      email:"Please enter a valid email address.",phone:"Please enter a valid 10-digit phone number.",
      state:"Please select your state."};
    err.textContent = msgs[id];
  } else { err.textContent = ""; }
  return ok;
}

function updateFormProgress(){
  const done = FIELDS.filter(id => fieldStatus(id)).length;
  const pct  = (done/5*100).toFixed(0)+"%";
  document.getElementById("form-prog-fill").style.width  = pct;
  document.getElementById("form-prog-label").textContent = done+" of 5 complete";
  FIELDS.forEach((id,i)=>{
    document.getElementById("ldot-"+(i+1)).classList.toggle("done", fieldStatus(id));
  });
  document.getElementById("lock-count").textContent = done+" of 5 fields complete";
  const btn = document.getElementById("unlock-btn");
  const txt = document.getElementById("unlock-btn-text");
  if(done === 5){
    btn.classList.add("btn-ready");
    txt.textContent = "&#128275; See My Results →";
    txt.innerHTML   = "&#128275; See My Results &rarr;";
  } else {
    btn.classList.remove("btn-ready");
    txt.textContent = "Complete All Fields to Unlock";
    txt.innerHTML   = "&#128274; Complete All Fields to Unlock";
  }
}

function tryUnlock(){
  let allOk = true;
  FIELDS.forEach(id => { if(!validateField(id)) allOk = false; });
  updateFormProgress();
  if(allOk) unlockResults();
}

/* ---- Quote Bot lead capture -------------------------------------------- */
/* Fires once, at the moment the gate opens and all five fields are valid.   */
/* Never blocks the reveal: capture() is fire-and-forget and swallows its    */
/* own errors, so a network failure still shows the user their results.      */
function qbCaptureLead(){
  if (!window.QuoteBot) return;
  try {
    var v = function(id){ var el = document.getElementById(id); return el ? el.value.trim() : ''; };
    var r = calculate();
    var consent = document.getElementById('qb-consent');
    window.QuoteBot.capture({
      email: v('f-email'),
      phone: v('f-phone'),
      firstName: v('f-first'),
      lastName: v('f-last'),
      productLine: 'DISABILITY_INCOME',
      inputs: {
        stateCode: v('f-state'),
        mortgage: state.mortgage, utilities: state.utilities, groceries: state.groceries,
        age: state.age, occupation: state.occ, selfEmployed: state.selfEmployed,
        gender: state.gender, annualIncome: state.income
      },
      results: {
        monthlyBenefit: r.monthlyBenefit, totalCoverage: r.totalCoverage,
        monthlyPremium: r.monthlyPremium, annualPremium: r.annualPremium
      },
      consentText: consent ? consent.textContent.replace(/\s+/g, ' ').trim() : null
    });
  } catch (e) { /* capture must never break the calculator */ }
}

function unlockResults(){
  qbCaptureLead();
  document.getElementById("results-lock-overlay").classList.add("unlocked");
  document.getElementById("results-content").classList.remove("locked");
  // Hide input column, expand results to full width
  document.querySelector(".inputs-col").classList.add("col-hidden");
  document.querySelector(".calc-grid").classList.add("results-revealed");
  // Show the Edit Inputs button
  document.getElementById("edit-inputs-btn").style.display = "inline-flex";
  // Scroll to results
  setTimeout(()=>{
    document.querySelector(".calc-wrapper").scrollIntoView({behavior:"smooth",block:"start"});
  },200);
}

function editInputs(){
  // Re-show inputs, restore two-column grid
  document.querySelector(".inputs-col").classList.remove("col-hidden");
  document.querySelector(".calc-grid").classList.remove("results-revealed");
  document.getElementById("edit-inputs-btn").style.display = "none";
  // Scroll back to top of calculator
  setTimeout(()=>{
    document.querySelector(".calc-wrapper").scrollIntoView({behavior:"smooth",block:"start"});
  },100);
}

// Attach live listeners to form fields
document.addEventListener("DOMContentLoaded", function(){
  FIELDS.forEach(id => {
    const el = document.getElementById("f-"+id);
    el.addEventListener("blur",  () => { validateField(id); updateFormProgress(); });
    el.addEventListener("input", () => {
      if(id==="phone") formatPhone(el);
      if(el.classList.contains("f-invalid")) validateField(id);
      updateFormProgress();
    });
  });
});

// ─── INIT ───────────────────────────────────────────────────────────────────
function init() {
  // Set initial slider track fills
  document.getElementById("mortgage-slider").style.setProperty("--pct", (2025/8000*100).toFixed(1)+"%");
  document.getElementById("utilities-slider").style.setProperty("--pct", (420/2000*100).toFixed(1)+"%");
  document.getElementById("groceries-slider").style.setProperty("--pct", (475/2000*100).toFixed(1)+"%");
  document.getElementById("age-slider").style.setProperty("--pct", ((35-20)/(64-20)*100).toFixed(1)+"%");
  updateResults();
}
init();

/* The markup names actions rather than carrying onclick attributes, which a
   Content-Security-Policy without 'unsafe-inline' blocks wherever they came
   from -- including markup this script builds itself. Only what is listed
   here can be reached from an attribute. */
window.qbActions.register({ editInputs: editInputs, resetInput: resetInput, setEmployment: setEmployment, setGender: setGender, tryUnlock: tryUnlock });
