/**
 * The Apply flow, once, for every calculator that has one.
 *
 *   <script src="js/quotebot-apply.js" defer></script>
 *
 * It began as 450 lines inside mygacalculator.html, which was right while one
 * page had it and wrong the moment a second did. Eleven pages copying a modal
 * is eleven places for a fix to be applied ten times.
 *
 * WHAT THE PAGE OWNS, and all it owns: what the visitor picked. Everything
 * else -- the review, the states, the beneficiaries, the owner, the
 * confirmation, the queueing -- is generic and lives here. A page declares
 * itself before this file loads:
 *
 *   <script>
 *   window.QB_APPLY = {
 *     productLine: 'TERM_LIFE',
 *     selection: function (override) {
 *       return { carrierName: ..., termYears: ..., rate: ..., premium: ... };
 *     },
 *     summary: function (sel) { return [['Carrier', sel.carrierName]]; },
 *     ownerDefault: 'other',          // key person: the company owns it
 *     ownerRelationship: 'Employer',
 *     ownerName: function () { return companyName(); },
 *   };
 *   </script>
 *
 * TWO BUTTONS, one modal. A rate card asks to apply for that card; the band
 * at the bottom asks for a Client Solutions Advisor. Both call
 * QuoteBot.apply, so both create the same record and fire the same
 * automations -- the difference is what we have the right to ask for yet,
 * and the agent can tell which conversation to open.
 *
 * APPLY MUST FOLLOW CAPTURE. The server records an apply only against a
 * QuoteRequest for the same session inside 24 hours, and QuoteBot.capture is
 * what writes one. An Apply button reachable before the email gate answers
 * 200 and records nothing -- deliberately, so that a public endpoint cannot
 * be used to test whether an address is in the system. Put the button where
 * the results are, never before them.
 */
(function () {
  'use strict';

  var cfg = window.QB_APPLY || {};

  /*
   * THE INTENT IS PER BUTTON, NOT PER PAGE.
   *
   * This was page-level for about an hour, which was wrong: most of these
   * pages carry both buttons. A rate card says "apply for this one", and the
   * band at the bottom says "help me work out what I need" -- the same
   * visitor, the same session, two different things to ask for, and an agent
   * who cannot tell them apart will open the wrong conversation.
   *
   *   'apply'    they picked something. Address, owner, beneficiaries.
   *   'advisor'  they want a Client Solutions Advisor to design the cover.
   *              Nothing has been chosen, so there is no contract to ask
   *              questions about -- name, phone, where they are, and what
   *              the tool worked out.
   */
  var intent = 'apply';

  /* The selection the review was OPENED for, held rather than re-read on
     submit: somebody can change the carrier on the page behind the modal,
     and what they confirm must be what they were shown when they pressed. */
  var qbmSel = null;

  function selectionNow(override) {
    var base = (override && typeof override === 'object') ? override
      : (override ? { termYears: override } : {});
    try {
      if (typeof cfg.selection !== 'function') return base;
      /* The page gets what the button said and may add to it -- the premium
         the engine computed, the term the page has selected elsewhere. It
         does not have to repeat what the button already carried. */
      return cfg.selection(base) || base;
    } catch (e) { return base; }
  }
  var usd = function (n) {
    return '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
  };

  function summaryRows(sel) {
    try {
      if (typeof cfg.summary === 'function') {
        var r = cfg.summary(sel);
        if (Array.isArray(r)) return r.filter(function (x) { return x && x[1]; });
      }
    } catch (e) { /* fall through to the generic rows below */ }
    /*
     * WHAT THE PAGE IS ALREADY SHOWING.
     *
     * cfg.summary is a function, and the config reaches these pages as JSON
     * (window.QB_APPLY = {...}), which cannot carry one. That is why no
     * calculator had a summary and all ten printed the generic rows below:
     * not ten authors forgetting, but a channel that could not express it.
     *
     * So the page declares its summary in markup instead -- data-qb-sum on
     * the element holding each value, with the label as the attribute. The
     * figures are read from the rendered results, so what the modal shows
     * is by construction the same arithmetic the visitor just read. A
     * summary that can drift from the page is worse than none, because
     * this is the panel someone checks before giving us their name.
     */
    var marked = document.querySelectorAll('[data-qb-sum]');
    if (marked.length) {
      var declared = [];
      for (var m = 0; m < marked.length && declared.length < 10; m += 1) {
        var el = marked[m];
        if (el.closest('.qbm-veil')) continue;
        var label = el.getAttribute('data-qb-sum');

        /* A form control holds its value in .value, not in textContent.
           Marking an input would otherwise read as empty and be dropped
           without a word -- which matters because on the pages whose
           summary IS what the visitor typed, every row is a control. */
        var tag = (el.tagName || '').toLowerCase();
        var value;
        if (tag === 'select') {
          /* A placeholder option has visible text and no value. Reading the
             text alone put "Select..." in the panel as though the visitor
             had answered, which is worse than leaving the row out. */
          var opt = el.options[el.selectedIndex];
          value = (el.value && opt) ? (opt.text || '').trim() : '';
        } else if (tag === 'input' || tag === 'textarea') {
          value = el.type === 'checkbox'
            ? (el.checked ? 'Yes' : 'No')
            : String(el.value == null ? '' : el.value).trim();
        } else {
          value = (el.textContent || '').trim();
        }

        /* The currency and percent marks on these pages are adornments
           beside the input, not part of its value, so a page says which
           one belongs to the number it just declared. */
        var pre = el.getAttribute('data-qb-sum-prefix');
        var suf = el.getAttribute('data-qb-sum-suffix');
        if (value && pre) value = pre + value;
        if (value && suf) value = value + suf;

        if (label && value) declared.push([label, value]);
      }
      if (declared.length) return declared;
    }

    /* What every one of these cards has, for a page that declares nothing. */
    var rows = [];
    if (sel.carrierName) rows.push(['Carrier', sel.carrierName]);
    if (sel.product) rows.push(['Product', sel.product]);
    if (num(sel.termYears)) rows.push(['Term', num(sel.termYears) + ' years']);
    if (num(sel.coverage)) rows.push(['Cover', usd(sel.coverage)]);
    if (num(sel.rate)) rows.push(['Rate', num(sel.rate).toFixed(2) + '%']);
    return rows;
  }
  var num = function (v) { var n = Number(v); return isFinite(n) ? n : null; };

  /*
   * BUTTONS ARE FOUND, NOT WIRED.
   *
   * Every rate card on these pages is built from a template string when the
   * engine answers, so a listener attached at load finds nothing and an
   * onclick attribute means serialising a selection into markup -- quoting a
   * carrier name like O'Brien & Sons into an attribute that then has to
   * survive two levels of escaping. One delegated listener on the document
   * reads the dataset off whichever button was pressed, so a card rendered
   * ten seconds from now works with no further thought.
   *
   *   <button type="button" data-qb-apply
   *           data-carrier-name="Foresters" data-term-years="20"
   *           data-premium="42.17" data-coverage="500000"
   *           data-person="1">Apply Now</button>
   *
   *   <button type="button" data-qb-advisor>Help me with my plan</button>
   *
   * The dataset keys ARE the selection field names, so a page that has
   * nothing unusual to say needs no selection() at all.
   */
  function datasetOf(el) {
    var out = {};
    if (!el || !el.dataset) return out;
    Object.keys(el.dataset).forEach(function (k) {
      if (k === 'qbApply' || k === 'qbAdvisor') return;
      var v = el.dataset[k];
      out[k] = (v !== '' && v !== null && isFinite(Number(v))) ? Number(v) : v;
    });
    return out;
  }

  document.addEventListener('click', function (ev) {
    var btn = ev.target && ev.target.closest
      ? ev.target.closest('[data-qb-apply],[data-qb-advisor]') : null;
    if (!btn) return;
    var over = datasetOf(btn);
    if (btn.hasAttribute('data-qb-advisor')) qbAskAdvisor(ev, over);
    else qbApplyNow(ev, over);
  });


  /* ── APPLY REVIEW ──────────────────────────────────────────────────────────
   * Pressing Apply opens the review rather than recording intent and stopping.
   *
   * What the old version did — a status change and a sentence — told an agent
   * somebody was interested and nothing else, so the agent rang them to ask for
   * the address and who was going to own it. That is what this collects, while
   * the person is still sitting in front of the form.
   *
   * Three rules it keeps from the version before it. The confirmation appears
   * whatever happens behind it, because somebody pressed a button and is owed
   * an answer. A compare row passes its own term, because the term is most of
   * what an agent needs and the headline may be showing another. And nothing is
   * sent without a captured email, which is what ties this to a real quote.
   * ---------------------------------------------------------------------- */

  /* The term and rate the review was opened for. Held rather than re-read on
     submit: somebody can change the carrier on the page behind the modal, and
     what they confirm must be what they were shown when they pressed. */
  var qbmTerm = null;
  var qbmRate = null;

  var QBM_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DC','DE','FL','GA','HI',
    'ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT',
    'NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD',
    'TN','TX','UT','VT','VA','WA','WV','WI','WY'];

  function qbApplyNow(ev, override) {
    if (ev) ev.preventDefault();
    intent = 'apply';
    qbOpenApply(override);
    return false;
  }

  /**
   * The "help me work this out" button, which used to be a broken link.
   *
   * Thirteen of these across nine pages pointed at app.quotebot.io, a host
   * that does not exist and, as far as anybody can tell, never did. So the
   * most enthusiastic button on each page -- the one pressed by the visitor
   * who had just been shown a number and wanted something done about it --
   * returned an error, and we recorded nothing.
   *
   * Worth sitting with, because the lesson is not "check your links". It is
   * that this was the highest-intent click on the site and the one nobody
   * ever made themselves, so it could be dead for however long it was dead
   * without a single test, review or page load catching it. The guard is
   * tests/links-go-somewhere.test.mjs, which fails the deploy on a host we
   * do not serve.
   *
   * Same modal as Apply, same record, one field different.
   */
  function qbAskAdvisor(ev, override) {
    if (ev) ev.preventDefault();
    intent = 'advisor';
    qbOpenApply(override);
    return false;
  }

  function qbOpenApply(termOverride) {
    /*
     * A NEEDS CALCULATOR MAY NOT ASK THESE.
     *
     * Owner and beneficiaries are questions about a contract. On a tool that
     * computed how much cover somebody needs, no contract has been chosen --
     * so the questions have no answers yet, and asking them is how a form
     * gets abandoned two fields from the end.
     *
     * Hidden rather than absent from the markup, so one partial serves both
     * both intents and a page cannot drift into having a different modal.
     */
    var advising = intent === 'advisor';
    ['owner', 'bens'].forEach(function (name) {
      var el = document.querySelector('[data-sec="' + name + '"]');
      if (el) el.hidden = advising;
    });
    var t = document.getElementById('qbm-title');
    if (t) {
      t.textContent = advising
        ? 'Let us help you design this'
        : "Let's check this before we start";
    }
    var go = document.getElementById('qbm-go');
    if (go) {
      go.textContent = advising
        ? 'Have an advisor contact me'
        : 'Start my application';
    }
    var h = document.querySelector('[data-sec="chosen"] h3');
    if (h) {
      h.textContent = advising ? 'What you worked out' : 'The contract you chose';
    }

    /*
     * WHO OWNS IT, when the answer is known in advance.
     *
     * On the key-person tool the applicant IS the company and the insured is
     * an employee, so "the owner is the person insured" is wrong before
     * anybody touches it. A default that has to be corrected on every single
     * submission is a default pointing the wrong way.
     */
    if (!advising && cfg.ownerDefault === 'other') {
      var other = document.querySelector('input[name="qbm-own"][value="other"]');
      if (other && !other.checked) { other.checked = true; qbOwnerChanged(); }
      var rel = document.getElementById('qbm-own-rel');
      if (rel && !rel.value) rel.value = cfg.ownerRelationship || 'Employer';
      if (typeof cfg.ownerName === 'function') {
        var nm = cfg.ownerName() || '';
        var of_ = document.getElementById('qbm-own-fname');
        if (of_ && !of_.value && nm) of_.value = nm;
      }
    }
    qbmSel = selectionNow(termOverride);
    qbmTerm = num(qbmSel.termYears);
    qbmRate = num(qbmSel.rate);

    qbFillStates('qbm-state');
    qbFillStates('qbm-signstate');

    /*
     * Everything they have already typed, carried over. Asking a second time
     * for a name they gave two minutes ago is how a form gets abandoned.
     *
     * One destination, SEVERAL possible sources, because the capture forms
     * were not built together and name their fields three different ways:
     * MYGA uses cf-*, the income pages use contactFirst/contactLast, and the
     * FIA rider page uses bare first/last/email. A single-convention map is
     * why the modal kept asking Income Floor visitors for a name the page
     * was already holding -- and why it looked broken rather than empty,
     * since the type-based pass below filled their email and phone anyway.
     */
    /* GENERATED, NOT LISTED.
     *
     * This map has now been wrong twice, both times because a page used a
     * naming convention nobody had thought of. There are five across the
     * site -- bare, cf-, f-, gate-, and contact -- and a hand-kept list
     * silently misses whichever one is added next. So the candidates are
     * every prefix crossed with every spelling of the field, and
     * capture-ids-are-reachable.test.mjs fails if any page carries a
     * capture field this rule cannot find. */
    var PREFIXES = ['', 'cf-', 'f-', 'gate-', 'contact'];
    function candidates(names) {
      var out = [];
      for (var p = 0; p < PREFIXES.length; p += 1) {
        for (var n = 0; n < names.length; n += 1) {
          /* contactFirst, not contactfirst -- that one camel-cases. */
          out.push(PREFIXES[p] === 'contact'
            ? 'contact' + names[n].charAt(0).toUpperCase() + names[n].slice(1)
            : PREFIXES[p] + names[n]);
        }
      }
      return out;
    }

    var copy = [
      ['qbm-fname', candidates(['first', 'fname', 'firstName'])],
      ['qbm-lname', candidates(['last', 'lname', 'lastName'])],
      ['qbm-dob',   candidates(['dob'])],
      ['qbm-phone', candidates(['phone'])],
      ['qbm-email', candidates(['email'])]
    ];
    copy.forEach(function (pair) {
      var to = document.getElementById(pair[0]);
      if (!to || to.value) return;
      for (var i = 0; i < pair[1].length; i += 1) {
        var from = document.getElementById(pair[1][i]);
        if (from && from.value && String(from.value).trim()) {
          to.value = from.value; return;
        }
      }
    });

    /*
     * THE SAME CARRY-OVER, ON PAGES THAT NAME THEIR FIELDS DIFFERENTLY.
     *
     * The ids above are MYGA's capture form. No other calculator has them,
     * so on the nine the modal opened blank and asked for an email the
     * person had typed into the gate ninety seconds earlier -- which is the
     * single most common place a form gets abandoned, and worse here than
     * anywhere, because an apply with no matching email is recorded as
     * nothing at all.
     *
     * Found by type rather than by id: the first filled email, tel and date
     * on the page outside this modal. Crude, and right far more often than
     * a list of ids that each page has to remember to match.
     */
    [['email','qbm-email'], ['tel','qbm-phone'], ['date','qbm-dob']]
      .forEach(function (pair) {
        var to = document.getElementById(pair[1]);
        if (!to || to.value) return;
        var all = document.querySelectorAll('input[type="' + pair[0] + '"]');
        for (var i = 0; i < all.length; i += 1) {
          if (all[i].closest('.qbm-veil')) continue;
          if (all[i].value && String(all[i].value).trim()) {
            to.value = all[i].value; return;
          }
        }
      });

    /* The state they gave the calculator is the state they are signing in —
       that is the question the rate lookup asked. The home state starts there
       too and can be changed, because most people live where they sign. */
    var quoted = '';
    ['rateState'].concat(candidates(['state'])).forEach(function (id) {
      if (quoted) return;
      var el = document.getElementById(id);
      if (el && el.value && String(el.value).trim()) quoted = el.value;
    });
    var sign = document.getElementById('qbm-signstate');
    var home = document.getElementById('qbm-state');
    if (sign && !sign.value) sign.value = quoted;
    if (home && !home.value) home.value = quoted;

    /* A joint person on the calculator is a joint owner here. Already typed,
       so it becomes the "somebody else owns it" answer rather than a second
       empty form. */
    var jf = (document.getElementById('cf-joint-fname') || {}).value || '';
    var jl = (document.getElementById('cf-joint-lname') || {}).value || '';
    if (jf && jl && !document.getElementById('qbm-own-fname').value) {
      document.getElementById('qbm-own-fname').value = jf;
      document.getElementById('qbm-own-lname').value = jl;
      var rel = (document.getElementById('cf-joint-relationship') || {}).value || '';
      document.getElementById('qbm-own-rel').value = rel;
    }

    qbRenderChosen();
    if (!document.querySelectorAll('#qbm-bens .qbm-ben').length) qbAddBeneficiary();
    qbBenTotal();

    document.getElementById('qbm-error').hidden = true;
    document.getElementById('qbm-veil').classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function qbCloseApply() {
    /* Closed, not cleared. Somebody who shuts this to check a number on the
       page behind it must not come back to an empty form. */
    document.getElementById('qbm-veil').classList.remove('open');
    document.body.style.overflow = '';
  }

  function qbFillStates(id) {
    var el = document.getElementById(id);
    if (!el || el.options.length) return;
    var blank = document.createElement('option');
    blank.value = ''; blank.textContent = 'Select…';
    el.appendChild(blank);
    QBM_STATES.forEach(function (code) {
      var o = document.createElement('option');
      o.value = code; o.textContent = code;
      el.appendChild(o);
    });
  }

  function qbRenderChosen() {
    var rows = summaryRows(qbmSel);
    var prem = num(qbmSel.premium);
    /* Formatted here rather than through the page's `money` helper, which is
       declared inside describeBand and is not reachable from this script. A
       modal that borrows a helper it cannot see is a modal that opens once and
       then throws for good. */
    /*
     * "AMOUNT" MEANS TWO DIFFERENT THINGS and this row used to call both the
     * same. On the annuity tools the premium IS the amount -- the money that
     * goes in, and the whole subject of the quote. On a life quote it is
     * what the policy costs per month, and labelling $42.17 "Amount" on the
     * line under "Cover $500,000" reads as a second, much smaller sum
     * insured. Somebody checking their own application would have to work
     * out which number was wrong.
     */
    if (prem) {
      var annuity = /^ANNUITY/.test(String(cfg.productLine || ''));
      rows.push([annuity ? 'Amount' : 'Monthly premium',
        '$' + Number(prem).toLocaleString('en-US',
          annuity ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 2 })]);
    }
    document.getElementById('qbm-chosen').innerHTML = rows.map(function (r) {
      return '<div class="qbm-row"><span class="k">' + r[0]
        + '</span><span class="v">' + r[1] + '</span></div>';
    }).join('') || '<div class="qbm-row"><span class="k">The contract shown above</span></div>';
  }

  function qbOwnerChanged() {
    var other = document.querySelector('input[name="qbm-own"]:checked').value === 'other';
    document.getElementById('qbm-owner-fields').hidden = !other;
  }

  function qbAddBeneficiary() {
    var wrap = document.getElementById('qbm-bens');
    var n = wrap.querySelectorAll('.qbm-ben').length + 1;
    var row = document.createElement('div');
    row.className = 'qbm-ben';
    row.innerHTML =
      '<div class="qbm-bh"><span class="n">Beneficiary ' + n + '</span>'
      + '<span class="sp"></span>'
      + '<button class="qbm-mini danger" type="button" onclick="qbRemoveBeneficiary(this)">Remove</button></div>'
      + '<div class="qbm-grid">'
      + '<div class="qbm-f"><label>First name</label><input type="text" data-b="firstName"'
      + ' autocomplete="section-ben' + n + ' given-name"></div>'
      + '<div class="qbm-f"><label>Last name</label><input type="text" data-b="lastName"'
      + ' autocomplete="section-ben' + n + ' family-name"></div>'
      + '<div class="qbm-f"><label>Relationship to you</label>'
      + '<input type="text" data-b="relationshipToInsured" autocomplete="off"'
      + ' placeholder="Spouse, child, trust…"></div>'
      + '<div class="qbm-f"><label>Share of the contract</label>'
      + '<input type="text" inputmode="decimal" data-b="sharePercent" placeholder="100"></div>'
      + '<div class="qbm-f"><label>Primary or contingent</label>'
      + '<select data-b="tier"><option value="PRIMARY">Primary</option>'
      + '<option value="CONTINGENT">Contingent</option></select></div>'
      + '</div>';
    wrap.appendChild(row);
    /* The first one is almost always the whole thing, so it is filled in
       rather than left for somebody to work out that 100 is the answer. */
    if (n === 1) row.querySelector('[data-b="sharePercent"]').value = '100';
    row.querySelectorAll('[data-b="sharePercent"], [data-b="tier"]').forEach(function (el) {
      el.addEventListener('input', qbBenTotal);
      el.addEventListener('change', qbBenTotal);
    });
    qbBenTotal();
  }

  function qbRemoveBeneficiary(btn) {
    var row = btn.closest('.qbm-ben');
    if (row) row.remove();
    /* Renumbered, because "Beneficiary 1, Beneficiary 3" reads as one that
       failed to save. */
    document.querySelectorAll('#qbm-bens .qbm-ben .n').forEach(function (el, i) {
      el.textContent = 'Beneficiary ' + (i + 1);
    });
    qbBenTotal();
  }

  function qbReadBeneficiaries() {
    return Array.prototype.map.call(
      document.querySelectorAll('#qbm-bens .qbm-ben'), function (row) {
        var out = {};
        row.querySelectorAll('[data-b]').forEach(function (el) {
          out[el.getAttribute('data-b')] = el.value;
        });
        out.sharePercent = Number(String(out.sharePercent || '').replace(/[^0-9.]/g, ''));
        return out;
      });
  }

  /* The running total, said out loud while they type.
   *
   * Each TIER is a complete instruction on its own — primary and contingent are
   * not two halves of one split — which is the server's rule and the rule an
   * agent's screen applies, so it is the one shown here. */
  function qbBenTotal() {
    var rows = qbReadBeneficiaries();
    var el = document.getElementById('qbm-bentotal');
    if (!el) return;
    var sum = function (tier) {
      return rows.filter(function (b) { return (b.tier || 'PRIMARY') === tier; })
        .reduce(function (n, b) { return n + (b.sharePercent || 0); }, 0);
    };
    var primary = Math.round(sum('PRIMARY') * 100) / 100;
    var contingent = Math.round(sum('CONTINGENT') * 100) / 100;
    var bits = ['Primary shares total <b>' + primary + '%</b>'];
    if (contingent) bits.push('contingent <b>' + contingent + '%</b>');
    el.innerHTML = bits.join(', ') + (primary === 100 ? '' : ' — each tier has to come to 100.');
    el.className = 'qbm-total' + (primary > 100 ? ' over' : (primary < 100 ? ' under' : ''));
  }

  var qbmSending = false;

  function qbSubmitApply() {
    if (qbmSending) return;
    var err = document.getElementById('qbm-error');
    var val = function (id) { return (document.getElementById(id).value || '').trim(); };

    var email = val('qbm-email');
    if (!email) { return qbApplyError('We need an email address to send your confirmation to.'); }

    var ownerOther = document.querySelector('input[name="qbm-own"]:checked').value === 'other';
    var details = {
      address: {
        line1: val('qbm-line1'), line2: val('qbm-line2'), city: val('qbm-city'),
        state: val('qbm-state'), postalCode: val('qbm-zip')
      },
      signedState: val('qbm-signstate'),
      ownerIsAnnuitant: !ownerOther,
      owner: ownerOther ? {
        firstName: val('qbm-own-fname'), lastName: val('qbm-own-lname'),
        relationshipToInsured: val('qbm-own-rel')
      } : null,
      beneficiaries: qbReadBeneficiaries()
    };

    /*
     * A 'need' answer is a request to be called, not a confirmed contract.
     *
     * The owner and beneficiary fields are hidden on that intent, so what
     * they hold is a default nobody typed -- "the owner is the annuitant" is
     * a statement this person never made. Sending it would put an unanswered
     * question into the record as an answer, and an agent would read it as
     * confirmed. Dropped rather than sent empty, for the same reason.
     */
    if (intent === 'advisor') {
      delete details.ownerIsAnnuitant;
      details.owner = null;
      details.beneficiaries = [];
      details.wantsAdvisor = true;
    }

    err.hidden = true;
    qbmSending = true;
    var go = document.getElementById('qbm-go');
    go.disabled = true;
    go.textContent = 'Sending…';

    var done = function (result) {
      qbmSending = false;
      go.disabled = false;
      go.textContent = 'Confirm and start';
      /* A REFUSAL STAYS IN THE MODAL with the server's own sentence. It is a
         thing this person can fix, and closing over it would lose everything
         they typed to fix it with. Anything else — a queued send, no capture
         script at all — still gets the confirmation: they pressed a button. */
      if (result && result.error) return qbApplyError(result.error);
      qbCloseApply();
      /* A QUEUED SEND STILL GETS THE CONFIRMATION. The network blipped, it will
         go, and the person did their part. Only a server that answered and told
         us it recorded nothing gets the other message -- saying "we have it"
         then would be the bug this replaces. */
      if (result && result.recorded === false && !result.queued) {
        return qbShowApplyNotice(result.message);
      }
      qbShowApplyConfirmation(qbmTerm, qbmRate);
    };

    if (window.QuoteBot && typeof window.QuoteBot.apply === 'function') {
      window.QuoteBot.apply({
        email: email,
        selection: {
          carrierName: qbmSel.carrierName || null,
          termYears: qbmTerm || null,
          rate: qbmRate || null,
          premium: num(qbmSel.premium),
          productLine: cfg.productLine || null
        },
        details: details
      }).then(done, function () { done(null); });
    } else {
      done(null);
    }
  }

  function qbApplyError(message) {
    var err = document.getElementById('qbm-error');
    err.textContent = message;
    err.hidden = false;
    err.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  /*
   * What to say when the server took it and recorded nothing.
   *
   * Not an error in the modal: an unmatched session or a quote gone stale is
   * not something the person at the screen can fix by retyping, so trapping
   * them in a form would be cruel and useless. And not the confirmation
   * either, which is what used to happen and is a lie -- it tells somebody
   * their application has started when no agent has anything to work from.
   *
   * So: the modal closes, their work is not thrown away, and the box says the
   * true thing. The server writes the sentence, because only the server knows
   * which of its three misses this was, and it deliberately says the same
   * thing for all three.
   */
  function qbShowApplyNotice(message) {
    var box = document.getElementById('qb-applied');
    if (!box) return;
    document.getElementById('qb-applied-title').textContent =
      'Thanks — we have your details.';
    document.getElementById('qb-applied-what').textContent = message
      || 'We could not match this to a recent quote of yours. Somebody will be in touch.';
    box.hidden = false;
    box.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function applicantName() {
    var e = document.getElementById('qbm-fname') || document.getElementById('cf-fname');
    return e ? String(e.value).trim() : '';
  }

  function qbCloseDone() {
    var v = document.getElementById('qbm-done-veil');
    if (v) v.classList.remove('open');
  }

  /*
   * The confirmation, wherever this page keeps one.
   *
   * MYGA has a panel under its results and keeps it -- it reads better
   * there, in the page, beside what they were looking at. The nine pages
   * that got the modal have no such panel, and without the fallback the
   * flow submitted and the box simply shut: somebody presses the biggest
   * button on the page, it disappears, nothing says whether it worked, and
   * they press it again. A duplicate application is the polite version of
   * what happens next.
   */
  function qbShowApplyConfirmation(term, rate) {
    var box = document.getElementById('qb-applied');
    if (!box) return qbShowDoneModal(term, rate);

    var name = applicantName();
    var bits = [];
    if (qbmSel && qbmSel.carrierName) bits.push(qbmSel.carrierName);
    if (term) bits.push(term + '-year');
    if (rate) bits.push(rate.toFixed(2) + '%');

    document.getElementById('qb-applied-title').textContent =
      name ? ('Thanks, ' + name + ' — we have it.') : 'Thanks — we have it.';
    document.getElementById('qb-applied-what').textContent = bits.length
      ? ('You asked to apply for the ' + bits.join(' ') + ' contract.')
      : 'You asked to apply for the contract shown above.';

    box.hidden = false;
    box.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function qbShowDoneModal(term, rate) {
    var v = document.getElementById('qbm-done-veil');
    if (!v) return;
    var bits = [];
    if (qbmSel && qbmSel.carrierName) bits.push(qbmSel.carrierName);
    if (term) bits.push(term + '-year');
    if (rate) bits.push(num(rate) ? num(rate).toFixed(2) + '%' : null);
    bits = bits.filter(Boolean);

    var who = applicantName();
    var t = document.getElementById('qbm-done-title');
    if (t) t.textContent = who ? ('Thanks, ' + who + ' — we have it.') : 'Thanks — we have it.';

    var what = document.getElementById('qbm-done-what');
    if (what) {
      what.textContent = intent === 'advisor'
        ? 'An advisor will go through what you worked out and help you design '
          + 'the cover around it.'
        : (bits.length
          ? ('You asked to apply for the ' + bits.join(' ') + ' policy.')
          : 'You asked to apply for the policy shown on this page.');
    }
    v.classList.add('open');
  }

  /* Escape closes it, like every other dialog anybody has used. */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape'
      && document.getElementById('qbm-veil').classList.contains('open')) {
      qbCloseApply();
    }
  });

  /* The markup calls these by name from onclick attributes, which is how the
     thirteen pages are written. Exported deliberately rather than by living
     at the top level, so that what the page may call is a list someone can
     read rather than whatever happened to be declared. */
  window.qbApplyNow = qbApplyNow;
  window.qbAskAdvisor = qbAskAdvisor;
  window.qbCloseApply = qbCloseApply;
  window.qbCloseDone = qbCloseDone;
  window.qbSubmitApply = qbSubmitApply;
  window.qbAddBeneficiary = qbAddBeneficiary;
  window.qbRemoveBeneficiary = qbRemoveBeneficiary;
  window.qbOwnerChanged = qbOwnerChanged;
}());
