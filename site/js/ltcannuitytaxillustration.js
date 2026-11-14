/*
 * ltcannuitytaxillustration.html's own script, which used to sit inline in the page.
 *
 * It had to move: a Content-Security-Policy without 'unsafe-inline' blocks an
 * inline <script>, so inline this page would have gone dead the moment the
 * policy went on -- quietly, with the markup looking perfectly correct.
 *
 * Moved verbatim.
 */
// ─── HELPERS ──────────────────────────────────────────────────────────────
function fmt(n){ return "$" + Math.round(n).toLocaleString("en-US"); }
function parseNum(v){ return parseFloat((v+"").replace(/[^0-9.]/g,"")) || 0; }

// ─── ELEMENTS ─────────────────────────────────────────────────────────────
const E = {
  ageI: document.getElementById("age-input"),
  valI: document.getElementById("value-input"),
  basI: document.getElementById("basis-input"),
  ratI: document.getElementById("rate-input"),
  disI: document.getElementById("dist-input"),
};
function getInputs(){
  return {
    age:   parseNum(E.ageI.value),
    value: parseNum(E.valI.value),
    basis: parseNum(E.basI.value),
    rate:  Math.min(parseNum(E.ratI.value), 99) / 100,
    dist:  parseNum(E.disI.value),
  };
}

// ─── YEAR-BY-YEAR SCHEDULE (gains-first / LIFO) ─────────────────────────────
const MAX_YEARS = 30;
function buildSchedule(){
  const i = getInputs();
  let remValue = i.value;
  let remGain  = Math.max(0, i.value - i.basis);
  const rows = [];
  const totals = { dist:0, taxable:0, taxStd:0, taxLtc:0, saved:0 };
  let year = 0;

  if(i.dist > 0 && remValue > 0){
    while(remValue > 0.5 && year < MAX_YEARS){
      year++;
      const age = i.age + (year - 1);
      const dist = Math.min(i.dist, remValue);
      const taxable = Math.min(dist, remGain);
      const incomeTax = taxable * i.rate;
      const penalty = age < 59.5 ? taxable * 0.10 : 0;
      const taxStd = incomeTax + penalty;
      const saved = taxStd;                 // LTC tax is $0
      rows.push({ year, age, dist, taxable, taxStd, saved });
      remValue -= dist; remGain -= taxable;
      totals.dist += dist; totals.taxable += taxable;
      totals.taxStd += taxStd; totals.saved += saved;
    }
  }
  const truncated = (remValue > 0.5 && i.dist > 0 && year >= MAX_YEARS);
  return { rows, totals, truncated, i };
}

// ─── RENDER ──────────────────────────────────────────────────────────────
function render(){
  const i = getInputs();
  const gain = Math.max(0, i.value - i.basis);

  // Readout
  document.getElementById("ro-basis").textContent = fmt(i.basis);
  document.getElementById("ro-gain").textContent  = fmt(gain);
  document.getElementById("ro-value").textContent = fmt(i.value);
  document.getElementById("penalty-flag").classList.toggle("show", i.age < 59.5);

  const sch = buildSchedule();
  const t = sch.totals;

  // Banner
  document.getElementById("hl-savings").textContent = fmt(t.saved);
  document.getElementById("hl-sub").textContent = (t.saved <= 0)
    ? "These distributions are entirely a return of your cost basis, so there's no current tax to save. The PPA advantage grows with your taxable gain."
    : "Across the full payout, by using a PPA long-term care annuity for qualified care instead of standard taxable distributions.";

  // Tiles
  document.getElementById("tile-std").textContent = fmt(t.dist - t.taxStd);
  document.getElementById("tile-std-sub").textContent = "of " + fmt(t.dist) + " distributed";
  document.getElementById("tile-ltc").textContent = fmt(t.dist);

  // Table body
  const tbody = document.getElementById("year-tbody");
  const tfoot = document.getElementById("year-tfoot");
  if(sch.rows.length === 0){
    tbody.innerHTML = '<tr><td class="col-left" colspan="6"><div class="empty-note">Enter an annuity value and an annual distribution amount to see the year-by-year schedule.</div></td></tr>';
    tfoot.innerHTML = "";
    document.getElementById("table-note").textContent = "";
    return;
  }
  let html = "";
  sch.rows.forEach(r => {
    html += "<tr>"
      + '<td class="col-left">' + r.year + "</td>"
      + '<td class="col-age">' + r.age + "</td>"
      + "<td>" + fmt(r.dist) + "</td>"
      + '<td class="col-std">' + (r.taxStd > 0 ? "−" + fmt(r.taxStd) : "$0")
        + '<span class="gain-q" tabindex="0" data-tip="Taxable gain this year: ' + fmt(r.taxable) + '">i</span></td>'
      + '<td class="col-ltc">$0</td>'
      + '<td class="col-save">' + fmt(r.saved) + "</td>"
      + "</tr>";
  });
  tbody.innerHTML = html;

  tfoot.innerHTML = "<tr>"
    + '<td class="col-left" colspan="2">Totals</td>'
    + "<td>" + fmt(t.dist) + "</td>"
    + '<td class="col-std">' + (t.taxStd > 0 ? "−" + fmt(t.taxStd) : "$0")
      + '<span class="gain-q" tabindex="0" data-tip="Total taxable gain: ' + fmt(t.taxable) + '">i</span></td>'
    + '<td class="col-ltc">$0</td>'
    + '<td class="col-save">' + fmt(t.saved) + "</td>"
    + "</tr>";

  document.getElementById("table-note").textContent = sch.truncated
    ? "Schedule capped at " + MAX_YEARS + " years; at this distribution rate the annuity has not been fully depleted."
    : "Schedule runs until the annuity value is fully distributed. The final year may be a partial distribution.";
}

// ─── INPUT FORMATTING (typed-only) ─────────────────────────────────────────
function fmtCents(n){ return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

function bindField(input, type){
  function reformatLive(){
    if(type === "cents"){
      let v = input.value.replace(/[^0-9.]/g, "");
      const fd = v.indexOf(".");
      if(fd !== -1) v = v.slice(0, fd + 1) + v.slice(fd + 1).replace(/\./g, "");
      const parts = v.split(".");
      const intDigits = parts[0].replace(/^0+(?=\d)/, "");
      const intFmt = intDigits ? parseInt(intDigits, 10).toLocaleString("en-US") : (parts.length > 1 ? "0" : "");
      input.value = (parts.length > 1) ? intFmt + "." + parts[1].slice(0, 2) : intFmt;
    } else if(type === "currency"){
      const d = input.value.split(".")[0].replace(/[^0-9]/g, "");
      input.value = d === "" ? "" : parseInt(d, 10).toLocaleString("en-US");
    } else if(type === "rate"){
      let v = input.value.replace(/[^0-9.]/g, "");
      const fd = v.indexOf(".");
      if(fd !== -1) v = v.slice(0, fd + 1) + v.slice(fd + 1).replace(/\./g, "");
      const parts = v.split(".");
      input.value = (parts.length > 1) ? parts[0] + "." + parts[1].slice(0, 2) : parts[0];
    } else { // int
      input.value = input.value.split(".")[0].replace(/[^0-9]/g, "");
    }
  }
  input.addEventListener("input", () => { reformatLive(); render(); });
  if(type === "cents"){
    input.addEventListener("blur", () => {
      if(input.value.trim() !== "") input.value = fmtCents(parseNum(input.value));
      render();
    });
  }
}
bindField(E.ageI, "int");
bindField(E.ratI, "int");
bindField(E.valI, "currency");
bindField(E.basI, "currency");
bindField(E.disI, "currency");

// ─── LEAD GATE ──────────────────────────────────────────────────────────────
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
  if(id==="state") return v.length > 0;
  if(id==="email") return isValidEmail(v);
  if(id==="phone") return isValidPhone(v);
  return false;
}
function validateField(id){
  const el = document.getElementById("f-"+id);
  const err = document.getElementById("err-"+id);
  const ok = fieldStatus(id);
  el.classList.toggle("f-valid", ok);
  el.classList.toggle("f-invalid", !ok && el.value.trim() !== "");
  if(!ok && el.value.trim() !== ""){
    const msgs = {first:"Please enter your first name.", last:"Please enter your last name.",
      email:"Please enter a valid email address.", phone:"Please enter a valid 10-digit phone number.",
      state:"Please choose your state."};
    err.textContent = msgs[id];
  } else { err.textContent = ""; }
  return ok;
}
function updateFormProgress(){
  const done = FIELDS.filter(id => fieldStatus(id)).length;
  document.getElementById("form-prog-fill").style.width = (done/FIELDS.length*100) + "%";
  document.getElementById("form-prog-label").textContent = done + " of " + FIELDS.length + " complete";
  FIELDS.forEach((id,idx) => {
    document.getElementById("ldot-"+(idx+1)).classList.toggle("done", fieldStatus(id));
  });
  document.getElementById("lock-count").textContent = done + " of " + FIELDS.length + " fields complete";
  const btn = document.getElementById("unlock-btn");
  if(done === FIELDS.length){ btn.classList.add("btn-ready"); btn.textContent = "🔓 View My Results →"; }
  else { btn.classList.remove("btn-ready"); btn.textContent = "🔒 Complete All Fields to Unlock"; }
}
function tryUnlock(){
  let allOk = true;
  FIELDS.forEach(id => { if(!validateField(id)) allOk = false; });
  updateFormProgress();
  if(allOk) unlockResults();
}
/* ---- Quote Bot lead capture ------------------------------------------ */
function qbCaptureLead(){
  if (!window.QuoteBot) return;
  try {
    var V = function(id){ var e=document.getElementById(id); return e ? String(e.value).trim() : ""; };
    var N = function(id){ var e=document.getElementById(id); return e ? (parseFloat(String(e.value).replace(/[^0-9.\-]/g,""))||0) : null; };
    var C = function(sel){ var e=document.querySelector(sel); return e ? e.textContent.replace(/\s+/g," ").trim() : null; };
    if (!V('f-email')) return;
    window.QuoteBot.capture({
      email: V('f-email'), phone: V('f-phone'),
      firstName: V('f-first'), lastName: V('f-last'),
      productLine: 'LONG_TERM_CARE',
      inputs: {
        age: N('age-input'), creditedRatePercent: N('rate-input'),
        accountValue: N('value-input'), costBasis: N('basis-input'),
        annualDistribution: N('dist-input'), state: V('f-state')
      },
      results: null,
      consentText: C('#qb-consent')
    });
  } catch (e) { /* capture must never break the calculator */ }
}

function unlockResults(){
  qbCaptureLead();
  document.getElementById("results-lock-overlay").classList.add("unlocked");
  document.getElementById("results-content").classList.remove("locked");
  syncResultsHeight();
  setTimeout(() => {
    const col = document.querySelector(".results-col");
    if(col) col.scrollIntoView({ behavior: "smooth", block: "start" });
  }, 250);
}
document.addEventListener("DOMContentLoaded", () => {
  FIELDS.forEach(id => {
    const el = document.getElementById("f-"+id);
    el.addEventListener("blur", () => { validateField(id); updateFormProgress(); });
    el.addEventListener("input", () => {
      if(id==="phone") formatPhone(el);
      if(el.classList.contains("f-invalid")) validateField(id);
      updateFormProgress();
    });
  });
});

// ─── STYLED TOOLTIP FOR GAIN "?" (body-level, no clipping) ──────────────────
const gqTip = document.createElement("div");
gqTip.className = "gq-tip";
document.body.appendChild(gqTip);
function showGqTip(el){
  const txt = el.getAttribute("data-tip");
  if(!txt) return;
  gqTip.textContent = txt;
  const r = el.getBoundingClientRect();
  gqTip.classList.remove("below");
  gqTip.style.left = (r.left + r.width / 2) + "px";
  gqTip.classList.add("show");
  const th = gqTip.offsetHeight;
  let top = r.top - th - 9;
  if(top < 6){ top = r.bottom + 9; gqTip.classList.add("below"); }
  gqTip.style.top = top + "px";
}
function hideGqTip(){ gqTip.classList.remove("show"); }
document.addEventListener("mouseover", e => { const q = e.target.closest && e.target.closest(".gain-q"); if(q) showGqTip(q); });
document.addEventListener("mouseout",  e => { const q = e.target.closest && e.target.closest(".gain-q"); if(q) hideGqTip(); });
document.addEventListener("focusin",   e => { const q = e.target.closest && e.target.closest(".gain-q"); if(q) showGqTip(q); });
document.addEventListener("focusout",  e => { const q = e.target.closest && e.target.closest(".gain-q"); if(q) hideGqTip(); });
document.addEventListener("scroll", hideGqTip, true);
window.addEventListener("resize", hideGqTip);

// ─── MATCH RESULTS HEIGHT TO INPUT COLUMN ───────────────────────────────────
function syncResultsHeight(){
  const inputs = document.querySelector(".inputs-col");
  const panel = document.querySelector(".results-panel");
  if(!inputs || !panel) return;
  panel.style.height = "";
  panel.style.minHeight = (window.innerWidth > 700) ? inputs.offsetHeight + "px" : "";
}
window.addEventListener("resize", syncResultsHeight);
if(window.ResizeObserver){
  const ro = new ResizeObserver(() => syncResultsHeight());
  const ic = document.querySelector(".inputs-col");
  if(ic) ro.observe(ic);
}
window.addEventListener("load", () => requestAnimationFrame(syncResultsHeight));

// ─── INIT ──────────────────────────────────────────────────────────────────
render();
syncResultsHeight();

/* The markup names actions rather than carrying onclick attributes, which a
   Content-Security-Policy without 'unsafe-inline' blocks wherever they came
   from -- including markup this script builds itself. Only what is
   registered here can be reached from an attribute. */
window.qbActions.register({ tryUnlock: tryUnlock });
