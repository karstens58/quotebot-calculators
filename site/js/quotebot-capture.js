/*!
 * quotebot-capture.js — lead capture and attribution for the Quote Bot tools.
 *
 * Drop into any calculator page with one tag, before your own script:
 *
 *   <script src="/js/quotebot-capture.js"
 *           data-endpoint="https://<your-fn-url>.lambda-url.us-east-1.on.aws/"
 *           data-tool="dime"></script>
 *
 * Then, at the point where the tool currently unlocks results behind the
 * email/phone gate, call:
 *
 *   QuoteBot.capture({
 *     email, phone, firstName, lastName,
 *     productLine: 'TERM_LIFE',
 *     inputs: getInputs(),            // whatever the tool already computed
 *     consentText: document.getElementById('tcpa-disclosure').textContent
 *   });
 *
 * It is fire-and-forget: it never blocks the UI, never throws into your code,
 * and queues to localStorage if the network fails so a blip does not lose the
 * lead. No dependencies, no build step, ~4 KB.
 */
(function (window, document) {
  'use strict';

  var SCRIPT = document.currentScript;
  var QUEUE_KEY = 'qb.capture.queue';
  var FIRST_KEY = 'qb.attr.first';
  var LAST_KEY = 'qb.attr.last';
  var SESSION_KEY = 'qb.session';
  var SENT_KEY = 'qb.sent';
  var CLICKED_KEY = 'qb.clicked';
  var FIRST_TOUCH_DAYS = 365;
  /* Long enough to swallow a double-click, short enough that a visitor who
     changes a number and recalculates is never silently dropped. */
  var DEDUPE_MS = 60 * 1000;

  /* ---------- the SMS opt-in ----------------------------------------------
   *
   * ONE WORDING, DEFINED ONCE, FOR EVERY CALCULATOR.
   *
   * Not because consistency is tidy, but because the record we write stores a
   * version stamp so that a year from now it can say this person saw these
   * words. Thirteen calculators with thirteen sentences means a version per
   * calculator per revision and the stamp means nothing. There are already
   * ten distinct disclosure texts across these pages, one of which grabs the
   * wrong paragraph entirely, so this is the current state rather than a
   * hypothetical.
   *
   * It also has to keep passing the server's checks, which refuse an opt-in
   * whose wording omits "not a condition of purchase" or how to stop. A
   * refusal is silent by design -- the server logs and records nothing -- so
   * a hand-edited variant would look like a working form that collects no
   * consent. tests/sms-disclosure-mirror.test.mjs holds this string to the
   * backend's copy.
   *
   * IT ALWAYS NAMES QUOTE BOT, including on affiliate-branded pages. The TCPA
   * wants the person to know who is texting them, and the texts come from
   * Quote Bot; affiliates never text. Co-branding changes the logo on the
   * page, not who is asking for permission.
   */
  var SMS_DISCLOSURE_VERSION = '2026-09-a';

  /*
   * Short beside the box, the required wording underneath it.
   *
   * The label can be four words. The disclosure cannot: express written
   * consent has to state that agreeing is not a condition of purchase and
   * how to stop, and a label that omits them is not consent however briefly
   * it is phrased. So the affirmative act sits beside the box and the fine
   * print sits under it, both on screen, both captured.
   *
   * The label says "offers" rather than "updates" deliberately. It has to be
   * honest that this is marketing, because the fine print says so and a
   * label that reads transactional while the small text says marketing is
   * the kind of mismatch that voids the consent it collects.
   *
   * Mind the contraction. "Consent isn't required to buy" reads better and
   * fails the server's check, which looks for "not required to buy" -- so an
   * innocent copy edit would leave a form that collects nothing and says
   * nothing about it.
   */
  var SMS_OPTIN_LABEL = 'Text me quotes and offers';
  var SMS_FINE_PRINT =
    'I agree to receive automated marketing text messages from Quote Bot about '
    + 'my insurance quote and related offers. Message frequency varies. Message '
    + 'and data rates may apply. Reply STOP to opt out or HELP for help. '
    + 'Consent is not required to make a purchase.';
  /* What the record stores: everything the visitor had in front of them. */
  var SMS_DISCLOSURE = SMS_OPTIN_LABEL + ' ' + SMS_FINE_PRINT;

  var config = {
    endpoint: (SCRIPT && SCRIPT.getAttribute('data-endpoint')) || '',
    toolKey: (SCRIPT && SCRIPT.getAttribute('data-tool')) || 'unknown',
    debug: !!(SCRIPT && SCRIPT.getAttribute('data-debug'))
  };

  /*
   * A stable string for an inputs object, for dedupe keys only.
   *
   * JSON.stringify alone will not do: these tools rebuild their inputs object
   * on every calculate, and V8 preserves insertion order, so two identical
   * submissions can serialise to different strings and defeat the dedupe
   * entirely. Sorting the keys is what makes "the same numbers" compare equal.
   *
   * Depth is capped because one bad tool passing a circular or enormous object
   * must not throw inside capture() or fill localStorage.
   */
  function stableKey(value, depth) {
    depth = depth || 0;
    if (value === null || value === undefined) return '';
    if (depth > 4) return '~';
    if (typeof value !== 'object') return String(value);
    if (Object.prototype.toString.call(value) === '[object Array]') {
      return '[' + value.map(function (v) { return stableKey(v, depth + 1); }).join(',') + ']';
    }
    var keys = Object.keys(value).sort();
    var parts = [];
    for (var i = 0; i < keys.length && i < 40; i++) {
      parts.push(keys[i] + ':' + stableKey(value[keys[i]], depth + 1));
    }
    return '{' + parts.join(',') + '}';
  }

  function log() {
    if (config.debug && window.console) {
      console.log.apply(console, ['[QuoteBot]'].concat([].slice.call(arguments)));
    }
  }

  /* ---------- storage helpers (never throw; private mode, ITP, etc.) ------ */

  function read(key) {
    try {
      var raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function write(key, value) {
    try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }

  function remove(key) {
    try { window.localStorage.removeItem(key); } catch (e) {}
  }

  function uuid() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  /* ---------- attribution ------------------------------------------------- */

  function currentParams() {
    var p;
    try { p = new URLSearchParams(window.location.search); } catch (e) { return {}; }
    var get = function (k) { return p.get(k) || undefined; };
    return {
      // The agent or affiliate tracking code. `qb` is the canonical param;
      // `ref` and `aff` are accepted so existing links keep working.
      trackingCode: get('qb') || get('ref') || get('aff'),
      source: get('utm_source'),
      medium: get('utm_medium'),
      campaign: get('utm_campaign'),
      term: get('utm_term'),
      content: get('utm_content'),
      gclid: get('gclid'),
      fbclid: get('fbclid'),
      landingPage: window.location.pathname + window.location.search,
      referrer: document.referrer || undefined,
      capturedAt: new Date().toISOString()
    };
  }

  function hasSignal(a) {
    return !!(a.trackingCode || a.source || a.campaign || a.gclid || a.fbclid);
  }

  function sessionId() {
    var s = read(SESSION_KEY);
    var now = Date.now();
    // 30-minute rolling session, the usual analytics convention.
    if (s && s.id && now - s.at < 30 * 60 * 1000) {
      write(SESSION_KEY, { id: s.id, at: now });
      return s.id;
    }
    var id = uuid();
    write(SESSION_KEY, { id: id, at: now });
    return id;
  }

  /**
   * First touch is what earns an affiliate credit; last touch is what explains
   * the conversion. Both are sent, and the server decides which one pays.
   */
  function resolveAttribution() {
    var now = currentParams();
    var first = read(FIRST_KEY);

    if (hasSignal(now)) {
      write(LAST_KEY, now);
      if (!first) { write(FIRST_KEY, now); first = now; }
    }

    if (first && first.capturedAt) {
      var age = Date.now() - new Date(first.capturedAt).getTime();
      if (age > FIRST_TOUCH_DAYS * 864e5) { remove(FIRST_KEY); first = null; }
    }

    return {
      first: first || null,
      last: read(LAST_KEY) || (hasSignal(now) ? now : null),
      current: now,
      sessionId: sessionId()
    };
  }

  /* ---------- carrying the code across the site --------------------------- */

  /*
   * A visitor who lands on tools.quotebot.io/?qb=AT-TOOLS and clicks through to
   * a calculator used to arrive at a bare URL. Attribution survived in
   * localStorage, but the address bar did not, so a bookmarked, copied or
   * shared link lost the affiliate entirely — and any visitor whose storage is
   * partitioned or cleared (ITP, private mode) lost the credit outright.
   *
   * So the code rides the links. Same-origin anchors get ?qb= appended before
   * the visitor clicks, which keeps the URL honest all the way through.
   *
   * The code stamped on a link is the one on the CURRENT page, falling back to
   * the last touch only inside the session window. A month-old code must never
   * reappear in the address bar of someone who came back on their own.
   */
  var PROPAGATE_MS = 30 * 60 * 1000;

  function propagationCode() {
    var here = currentParams();
    if (here.trackingCode) return here.trackingCode;
    var last = read(LAST_KEY);
    if (last && last.trackingCode && last.capturedAt) {
      var age = Date.now() - new Date(last.capturedAt).getTime();
      if (age >= 0 && age < PROPAGATE_MS) return last.trackingCode;
    }
    return null;
  }

  /*
   * Deliberately NOT rewritten: other hosts (the code is ours, not theirs),
   * mailto/tel/javascript, in-page anchors, downloads, and anything that
   * already carries a code — including a hand-built link on the page that
   * names a different affiliate, which must win over the ambient one.
   */
  function decorate(anchor, code) {
    try {
      if (!anchor || anchor.hasAttribute('data-qb-skip')) return false;
      var raw = anchor.getAttribute('href');
      if (!raw || /^\s*(#|mailto:|tel:|sms:|javascript:|data:|blob:)/i.test(raw)) return false;

      var url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return false;
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
      if (url.searchParams.get('qb') || url.searchParams.get('ref') || url.searchParams.get('aff')) {
        return false;
      }

      url.searchParams.set('qb', code);
      anchor.setAttribute('href', url.pathname + url.search + url.hash);
      return true;
    } catch (e) { return false; }
  }

  /*
   * Render the opt-in into any [data-qb-sms-optin] on the page.
   *
   * Built here rather than copied into each calculator's markup, so the
   * wording has one home. A page opts in to having it by placing one empty
   * element; everything else -- the box, the label, the id, the unticked
   * state -- comes from this file.
   *
   * UNTICKED, AND NOT REQUIRED. A pre-ticked box is not express written
   * consent, it is the single most common way this is done wrong, and making
   * it a condition of seeing the quote would void the consent it collects.
   */
  function mountSmsOptIn() {
    var slots = document.querySelectorAll('[data-qb-sms-optin]');
    if (!slots.length) return 0;
    injectSmsStyles();
    var n = 0;
    for (var i = 0; i < slots.length; i++) {
      var slot = slots[i];
      if (slot.getAttribute('data-qb-mounted') === '1') continue;

      var id = 'qb-sms-optin' + (i ? '-' + i : '');

      /* One wrapper marked as the disclosure, holding BOTH the label and the
         fine print, because that is what the visitor read. Capturing only one
         half would store either an affirmative act with no disclosure or a
         disclosure nobody agreed to. */
      var wrap = document.createElement('div');
      wrap.className = 'qb-sms';
      wrap.setAttribute('data-qb-sms-text', '1');

      var label = document.createElement('label');
      label.className = 'qb-sms-label';
      label.setAttribute('for', id);

      var box = document.createElement('input');
      box.type = 'checkbox';
      box.id = id;
      box.checked = false;
      box.setAttribute('data-qb-sms-box', '1');

      var lead = document.createElement('span');
      lead.setAttribute('data-qb-sms-lead', '1');
      /* textContent, never innerHTML: this is read back out of the DOM and
         stored as evidence, and markup in it would be stored too. */
      lead.textContent = SMS_OPTIN_LABEL;

      label.appendChild(box);
      label.appendChild(lead);

      var fine = document.createElement('p');
      fine.className = 'qb-sms-fine';
      fine.setAttribute('data-qb-sms-fine', '1');
      fine.textContent = SMS_FINE_PRINT;

      wrap.appendChild(label);
      wrap.appendChild(fine);
      slot.appendChild(wrap);

      /*
       * A grid parent places this slot as a CELL, not as a line under the
       * phone field.
       *
       * careltc's .contact-grid is two columns, so the marker landed in the
       * right-hand column level with the phone LABEL -- reading as a separate
       * offer floating beside the form, with the fine print clipped by the
       * column width. It looked correct in the markup and correct on the two
       * single-column pages this was first checked against.
       *
       * Spanning every column puts it back on its own row directly beneath
       * the field. Done here rather than in each page's CSS because the next
       * calculator built on a grid would otherwise hit this the same way, and
       * the symptom does not look like a placement bug -- it looks like a
       * design decision somebody made.
       */
      var parent = slot.parentNode;
      if (parent && parent.nodeType === 1 && window.getComputedStyle) {
        var pd = window.getComputedStyle(parent).display;
        if (pd === 'grid' || pd === 'inline-grid') {
          slot.style.gridColumn = '1 / -1';
        }
      }

      slot.setAttribute('data-qb-mounted', '1');
      n++;
    }
    log('mounted ' + n + ' SMS opt-in(s)');
    return n;
  }

  /*
   * Enough styling that it sits under a phone field without each calculator
   * restyling it, and little enough that it inherits the page's type.
   */
  function injectSmsStyles() {
    if (document.getElementById('qb-sms-styles')) return;
    var css = document.createElement('style');
    css.id = 'qb-sms-styles';
    css.textContent =
      /*
       * text-transform and letter-spacing are reset explicitly. quotetool's
       * own label styling uppercases its field labels, and the opt-in landed
       * inside that scope and came out shouting "TEXT ME QUOTES AND OFFERS".
       * The stored evidence was unaffected -- textContent ignores
       * text-transform -- but a disclosure that shouts reads as a banner ad,
       * which is the opposite of what it is for.
       */
      /* More room below than above, deliberately. Proximity is what tells
         a reader which field this belongs to, and with 8px above and 0
         below the block sat closer to the NEXT field than to the phone
         number it is asking about -- on careltc it read as attached to
         Date of Birth. */
      '.qb-sms{margin:8px 0 20px;text-align:left}'
      + '.qb-sms .qb-sms-label{display:flex;align-items:center;gap:8px;'
      + 'font-size:14px;line-height:1.3;cursor:pointer;font-weight:500;'
      /* !important, on the typography resets only.
         quotetool has `.field label { text-transform: uppercase }`, which is
         (0,1,1) and beats a single class. This script is injected into pages
         whose stylesheets it cannot know, so raising specificity is a race
         it can always lose -- the next page will have `.form .field label`.
         Layout below stays unforced; only the properties that decide whether
         the disclosure is legible are held down. */
      + 'text-transform:none!important;letter-spacing:normal!important;'
      /* Colour is held down for the same reason as the typography above.
         myga styles `.field label` with --gray-mid (#8a9ab5), about 2.8:1
         on its background -- below AA -- and the opt-in label inherited it.
         That label IS the affirmative act, so it has to be readable.
         var(--text) rather than a literal: it takes the page's own text
         colour where one is defined, so this still works if a calculator
         is ever built dark, and falls back only when nothing is set. */
      + 'color:var(--text,#1c2a3a)!important}'
      + '.qb-sms-label input{width:16px;height:16px;margin:0;flex:none;cursor:pointer}'
      + '.qb-sms .qb-sms-fine{margin:4px 0 0 24px;font-size:11px;line-height:1.45;'
      + 'color:var(--text,#1c2a3a)!important;opacity:.75;text-transform:none!important;letter-spacing:normal!important;'
      + 'font-weight:400!important}';
    document.head.appendChild(css);
  }

  /*
   * What the visitor actually did, read back off the page.
   *
   * The TEXT is read from the DOM rather than from the constant above, on
   * purpose. The record is supposed to say what was on the screen; if a page
   * overrode the wording, the evidence should carry the override rather than
   * our copy of what we believe we showed them.
   */
  function readSmsOptIn() {
    /*
     * The box the visitor could actually see.
     *
     * A page can mount more than one -- sequenceofreturns has two gates, and
     * both are the same markup. Taking the first would read an empty box
     * while the one they ticked sat further down the page, throwing away the
     * consent they just gave. So: the first TICKED box if there is one, and
     * otherwise the first box at all, which reports an honest false.
     */
    var boxes = document.querySelectorAll('[data-qb-sms-box]');
    if (!boxes.length) return null;
    var box = boxes[0];
    for (var b = 0; b < boxes.length; b++) {
      if (boxes[b].checked) { box = boxes[b]; break; }
    }
    /*
     * The two halves, joined by a space.
     *
     * textContent on the wrapper concatenates them with nothing between,
     * which stored "...quotes and offersRecurring automated marketing...".
     * They are separate blocks on screen with a line between them, so a
     * space is the faithful reading -- and this is the text somebody reads
     * aloud one day to say what the person agreed to.
     */
    var group = box.closest ? box.closest('[data-qb-sms-text]') : null;
    var parts = [];
    var nodes = (group || document)
      .querySelectorAll('[data-qb-sms-lead],[data-qb-sms-fine]');
    for (var j = 0; j < nodes.length; j++) {
      var t = nodes[j].textContent.replace(/\s+/g, ' ').trim();
      if (t) parts.push(t);
    }
    return {
      agreed: box.checked === true,
      disclosureText: parts.join(' '),
      disclosureVersion: SMS_DISCLOSURE_VERSION,
      sourceUrl: window.location.href,
      userAgent: navigator.userAgent,
      grantedAt: new Date().toISOString()
    };
  }

  function decorateAll() {
    var code = propagationCode();
    if (!code) return 0;
    var links = document.getElementsByTagName('a');
    var n = 0;
    for (var i = 0; i < links.length; i++) { if (decorate(links[i], code)) n++; }
    log('carried ' + code + ' onto ' + n + ' link(s)');
    return n;
  }

  /*
   * The pass above catches the links present at load. This catches the rest:
   * links a tool renders later, and links whose href its own script rewrote.
   * Capture phase, so it runs before any handler that might navigate.
   */
  function onClickAnywhere(e) {
    var code = propagationCode();
    if (!code) return;
    var el = e.target;
    while (el && el !== document && el.nodeName !== 'A') { el = el.parentNode; }
    if (el && el.nodeName === 'A') decorate(el, code);
  }

  /* ---------- transport --------------------------------------------------- */

  /**
   * The endpoint must be an absolute http(s) URL. Anything else — an empty
   * attribute, or a deploy where the placeholder was never substituted —
   * would otherwise resolve as a RELATIVE path and quietly POST leads at the
   * marketing site, where they 404 and nobody notices. Fail loudly instead.
   */
  function endpointOk() {
    return /^https?:\/\//i.test(config.endpoint || '');
  }

  function post(path, body, useBeacon) {
    if (!endpointOk()) {
      if (window.console && window.console.error) {
        console.error('[QuoteBot] data-endpoint is not an absolute URL ("' +
          (config.endpoint || '') + '"). Lead NOT sent; queued locally.');
      }
      return Promise.reject(new Error('bad endpoint'));
    }
    var url = config.endpoint.replace(/\/$/, '') + path;
    var payload = JSON.stringify(body);

    // On unload, sendBeacon is the only thing that reliably survives.
    if (useBeacon && navigator.sendBeacon) {
      try {
        var ok = navigator.sendBeacon(url, new Blob([payload], { type: 'application/json' }));
        if (ok) return Promise.resolve(true);
      } catch (e) {}
    }

    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true,
      mode: 'cors'
    }).then(function (r) {
      /* THE BODY, not a bare `true`.
       *
       * A 200 used to mean "sent" and nothing more, so a caller could not
       * tell "we recorded it" from "we took it and did nothing with it" --
       * which is how the Apply modal came to thank people whose application
       * had not started. Callers that ignore the value are unaffected. */
      if (r.ok) return r.json().catch(function () { return null; });
      /* The server's own sentence, where it sent one.
       *
       * "HTTP 400" is unusable to the person in front of the screen. These
       * endpoints answer a refusal with { error: "..." } written to be read
       * — beneficiary shares that do not total 100, a missing ZIP — and
       * throwing the status threw that away. The status is carried too, so a
       * caller can tell a refusal it should show from an outage it should
       * queue through. */
      return r.json().catch(function () { return null; }).then(function (body) {
        var err = new Error((body && body.error) || ('HTTP ' + r.status));
        err.status = r.status;
        err.refused = r.status >= 400 && r.status < 500;
        throw err;
      });
    });
  }

  /*
   * In-session retry for the queue.
   *
   * A queued lead used to wait for the visitor's NEXT page load, because boot()
   * was the only thing that ever called drainQueue(). On a single-page visit —
   * which is most of them, since people run one calculator and leave — that
   * meant a lead lost to one flaky request, one Lambda cold start or one
   * momentary offline was not late, it was gone. From the console it looked
   * exactly like capture being slow or unreliable.
   *
   * So a failed send now retries a few times within the session, backing off,
   * and the queue still survives to the next page load as the last resort.
   * Retries are capped: a genuinely broken endpoint must not spin.
   */
  var retryTimer = null;
  var retryDelay = 5000;
  var RETRY_MAX = 60000;

  function scheduleRetry() {
    if (retryTimer) return;
    if (retryDelay > RETRY_MAX) return;
    retryTimer = setTimeout(function () {
      retryTimer = null;
      var before = (read(QUEUE_KEY) || []).length;
      if (!before) { retryDelay = 5000; return; }
      drainQueue();
      retryDelay *= 2;
      scheduleRetry();
    }, retryDelay);
  }

  function enqueue(path, body) {
    var q = read(QUEUE_KEY) || [];
    q.push({ path: path, body: body, at: Date.now() });
    // Bound the queue — a permanently broken endpoint must not fill storage.
    write(QUEUE_KEY, q.slice(-20));
  }

  function drainQueue() {
    var q = read(QUEUE_KEY);
    if (!q || !q.length) return;
    remove(QUEUE_KEY);
    q.forEach(function (item) {
      // Drop anything older than 7 days; a stale lead is worse than none.
      if (Date.now() - item.at > 7 * 864e5) return;
      post(item.path, item.body).catch(function () {
        enqueue(item.path, item.body);
        scheduleRetry();
      });
    });
  }

  /* ---------- co-branding ------------------------------------------------- */

  /*
   * The affiliate's name, on the page their link produced.
   *
   * The calculators are static files; the name lives in DynamoDB. So the page
   * asks, once, who the code belongs to, and draws a thin strip above the
   * content if the answer is anybody.
   *
   * Three things this deliberately does not do:
   *
   *  - It does not block rendering. The lookup is fired after load and the
   *    strip is inserted when it answers. A slow or dead endpoint costs the
   *    visitor nothing; they see the calculator either way.
   *  - It does not use innerHTML for the name. That string is free text typed
   *    into the admin console and served from a public endpoint; textContent
   *    is the only reason a company name cannot become a script tag.
   *  - It does not ask again on every page. The answer for a code is the same
   *    all day, and a visitor moving through five calculators should not cost
   *    five Lambda invocations.
   */
  var BRAND_KEY = 'qb.brand';
  var BRAND_TTL = 6 * 3600 * 1000;

  function cachedBrand(code) {
    var all = read(BRAND_KEY);
    var hit = all && all[code];
    if (!hit || Date.now() - hit.at > BRAND_TTL) return null;
    return hit;
  }

  function cacheBrand(code, brand) {
    var all = read(BRAND_KEY) || {};
    var now = Date.now();
    // Bound it. A visitor should not accumulate every affiliate they ever saw.
    Object.keys(all).forEach(function (k) { if (now - all[k].at > BRAND_TTL) delete all[k]; });
    all[code] = { name: (brand && brand.name) || null, at: now };
    write(BRAND_KEY, all);
  }

  /*
   * Inserted at the top of <body> in normal flow, not fixed or floating: these
   * thirteen pages were laid out without it, and a bar that overlays the top
   * of the document would cover a heading on one and a nav on another. Pushing
   * the page down is the one behaviour that is correct everywhere.
   */
  function drawStrip(name) {
    try {
      if (!name || document.getElementById('qb-cobrand')) return;
      var body = document.body;
      if (!body) return;

      var bar = document.createElement('div');
      bar.id = 'qb-cobrand';
      bar.setAttribute('role', 'note');
      bar.style.cssText = [
        'font:500 13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
        'color:#2c3e58', 'background:#eef1f6', 'border-bottom:1px solid #d8e2f0',
        'padding:8px 16px', 'text-align:center', 'letter-spacing:.01em',
      ].join(';');

      var lead = document.createElement('span');
      lead.style.cssText = 'color:#8a9ab5;margin-right:6px';
      lead.textContent = 'Presented by';

      var who = document.createElement('strong');
      who.style.cssText = 'font-weight:600';
      who.textContent = name;          // never innerHTML — see the note above

      bar.appendChild(lead);
      bar.appendChild(who);
      body.insertBefore(bar, body.firstChild);
    } catch (e) { log('co-brand strip failed', e); }
  }

  function loadBrand() {
    var code = propagationCode();
    if (!code || !endpointOk()) return;

    var hit = cachedBrand(code);
    if (hit) { drawStrip(hit.name); return; }

    var url = config.endpoint.replace(/\/$/, '') + '/brand?qb=' + encodeURIComponent(code);
    fetch(url, { method: 'GET', mode: 'cors' })
      .then(function (r) { return r.ok ? r.json() : {}; })
      .then(function (brand) { cacheBrand(code, brand); drawStrip(brand && brand.name); })
      .catch(function (e) { log('brand lookup failed', e); });
  }

  /* ---------- public API -------------------------------------------------- */

  var api = {
    config: config,

    /** Current attribution, if a page wants to display or forward it. */
    attribution: resolveAttribution,

    /**
     * Re-run the link pass. Call this after rendering links into the page;
     * the click handler is a safety net, not a substitute.
     * @returns {number} how many links were rewritten
     */
    decorateLinks: decorateAll,

    /** Re-run the co-brand lookup and strip. */
    brand: loadBrand,

    /**
     * The same-site URL with the tracking code attached, for code that builds
     * a destination rather than an anchor. Returns the input unchanged when
     * there is no code to carry.
     * @param {string} href
     * @returns {string}
     */
    link: function (href) {
      var code = propagationCode();
      if (!code || !href) return href;
      try {
        var url = new URL(href, window.location.href);
        if (url.origin !== window.location.origin) return href;
        if (url.searchParams.get('qb') || url.searchParams.get('ref') || url.searchParams.get('aff')) {
          return href;
        }
        url.searchParams.set('qb', code);
        return url.pathname + url.search + url.hash;
      } catch (e) { return href; }
    },

    /**
     * Record the landing. Called automatically on load when a tracking code is
     * present; safe to call again.
     */
    trackClick: function (options) {
      var attr = resolveAttribution();
      var code = attr.current.trackingCode || (attr.last && attr.last.trackingCode);
      if (!code) return Promise.resolve(false);

      /*
       * One click per link per session.
       *
       * The code now rides the links from page to page, so every calculator a
       * visitor opens carries ?qb= and would otherwise report its own click.
       * A single visitor browsing five tools would show as five clicks on one
       * affiliate link, and the dashboard would be counting page views under
       * the name "clicks". The server stores sessionId on every LinkClick, so
       * it can tighten this further; this keeps the obvious inflation off the
       * wire in the first place.
       */
      if (!(options && options.force)) {
        var seen = read(CLICKED_KEY) || {};
        var now = Date.now();
        Object.keys(seen).forEach(function (k) { if (now - seen[k] > 864e5) delete seen[k]; });
        var key = attr.sessionId + '|' + code;
        if (seen[key]) { log('click already reported this session', key); return Promise.resolve(false); }
        seen[key] = now;
        write(CLICKED_KEY, seen);
      }

      var body = {
        trackingCode: code,
        sessionId: attr.sessionId,
        landingPage: attr.current.landingPage,
        referrer: attr.current.referrer,
        userAgent: navigator.userAgent,
        occurredAt: new Date().toISOString(),
        toolKey: config.toolKey
      };
      return post('/click', body).catch(function () { enqueue('/click', body); return false; });
    },

    /**
     * The visitor pressed Apply.
     *
     * Separate from capture() on purpose. capture() says "somebody was
     * quoted"; this says "somebody wants to buy", which is a different and
     * much rarer event, and the two must not be confused in the funnel.
     *
     * The email and sessionId are what let the server find the quote this
     * belongs to - it refuses anything it cannot tie to a real recent quote
     * by the same visitor. So call it only after capture() has run.
     *
     * Not deduped the way capture() is: pressing Apply twice is a person
     * being unsure, and the server is idempotent about the status anyway.
     *
     * @param {object} intent
     * @param {string} intent.email       the address they were quoted under
     * @param {object} [intent.selection] what they had selected
     * @param {object} [intent.details]   what they confirmed: address, parties,
     *                                    beneficiaries. Optional — a tool with
     *                                    no confirmation step sends none and
     *                                    behaves exactly as it always has.
     * @returns {Promise<{ok:boolean, error:(string|null), queued:boolean}>}
     *   Resolves rather than rejecting, always.
     *
     *   An OBJECT rather than the boolean this used to return, because a
     *   confirmation step has to tell three outcomes apart: it was recorded,
     *   it was refused and the person needs to fix something, or the network
     *   failed and it is queued. A boolean said "no" to all three.
     */
    apply: function (intent) {
      try {
        if (!intent || !intent.email) {
          log('apply called without an email');
          return Promise.resolve({ ok: false, error: null, queued: false, recorded: false, message: null });
        }
        var attr = resolveAttribution();
        var body = {
          toolKey: config.toolKey,
          email: String(intent.email).trim().toLowerCase(),
          sessionId: attr.sessionId,
          selection: intent.selection || null,
          intent: intent.details || null,
          pressedAt: new Date().toISOString(),
          sourceUrl: window.location.href
        };
        /* Queued on failure like everything else here: the visitor sees their
           confirmation either way, and an application intent is the last thing
           we want to drop because a network blipped. */
        return post('/apply', body)
          .then(function (res) {
            /* `recorded` is the server saying it did something with this, as
               opposed to merely receiving it. A miss answers 200 on purpose --
               a public endpoint must not confirm whose email is in the system
               -- so the 200 is not the thing to read. An older deployment
               sends no `recorded` at all; that is treated as recorded, which
               is what it meant before the field existed. */
            var recorded = !(res && res.recorded === false);
            if (recorded) { log('apply recorded'); }
            else { log('apply not matched'); }
            return {
              ok: recorded,
              error: null,
              queued: false,
              recorded: recorded,
              message: (res && res.message) || null
            };
          })
          .catch(function (err) {
            /* A REFUSAL IS NOT QUEUED. Retrying a 400 retries it forever: the
               address is still incomplete tomorrow. It goes back to the
               person, who is the only one who can fix it. */
            if (err && err.refused) {
              log('apply refused', err.message);
              return { ok: false, error: err.message, queued: false, recorded: false, message: null };
            }
            log('apply failed, queued', err);
            enqueue('/apply', body);
            return { ok: false, error: null, queued: true, recorded: false, message: null };
          });
      } catch (e) {
        log('apply threw', e);
        return Promise.resolve({ ok: false, error: null, queued: false, recorded: false, message: null });
      }
    },

    /**
     * The lead. Call this where the tool currently unlocks results.
     *
     * @param {object} lead
     * @param {string} lead.email
     * @param {string} [lead.phone]
     * @param {string} [lead.firstName]
     * @param {string} [lead.lastName]
     * @param {string} [lead.productLine]  a ProductLine enum value
     * @param {object} [lead.inputs]       whatever the tool computed
     * @param {object} [lead.results]      what it showed the user
     * @param {string} [lead.consentText]  the disclosure exactly as rendered
     * @returns {Promise<boolean>} resolves false rather than rejecting
     */
    capture: function (lead) {
      try {
        if (!lead || !lead.email) { log('capture called without an email'); return Promise.resolve(false); }
        var attr = resolveAttribution();

        /*
         * Tell anything else on the page that this visitor has just handed
         * over their details.
         *
         * quotebot-chat.js listens for this and stops offering to chat: a
         * person who has converted is the one moment an invitation is purely
         * an interruption. Fired here rather than after the network call
         * because the visitor has done their part either way — whether our
         * POST succeeds is our problem, not a reason to nag them.
         *
         * Dispatched in its own try/catch, like everything else in this file:
         * a listener that throws must not stop a lead being sent.
         */
        try {
          window.dispatchEvent(new CustomEvent('quotebot:captured', {
            detail: { toolKey: config.toolKey }
          }));
          document.dispatchEvent(new CustomEvent('quotebot:captured', {
            detail: { toolKey: config.toolKey }
          }));
        } catch (evtErr) { log('captured event not dispatched', evtErr); }

        var body = {
          toolKey: config.toolKey,
          submittedAt: new Date().toISOString(),
          sessionId: attr.sessionId,
          applicant: {
            email: String(lead.email).trim().toLowerCase(),
            phone: lead.phone,
            firstName: lead.firstName,
            lastName: lead.lastName
          },
          productLine: lead.productLine,
          inputs: lead.inputs || null,
          results: lead.results || null,
          attribution: {
            first: attr.first,
            last: attr.last,
            landingPage: attr.current.landingPage,
            referrer: attr.current.referrer
          },
          /*
           * The separate, explicit opt-in. Null when the page has no box.
           *
           * Sent even when unticked: the server refuses it, which is the
           * correct outcome and is worth being explicit about rather than
           * silently omitting the field.
           */
          smsOptIn: readSmsOptIn(),
          // TCPA evidence. The server adds the hashed IP and its own timestamp;
          // the client cannot be trusted for either.
          consent: {
            disclosureText: lead.consentText || null,
            userAgent: navigator.userAgent,
            sourceUrl: window.location.href,
            grantedAt: new Date().toISOString()
          }
        };

        /*
         * Dedupe: identical submission, twice, within a minute.
         *
         * This used to key on tool + email for THIRTY MINUTES, which is a far
         * bigger net than the problem. What it was written for is a visitor
         * double-clicking "Calculate" — tens of milliseconds apart, same
         * numbers. What it actually suppressed was anyone who ran the tool,
         * looked at the answer, changed their coverage amount or term and ran
         * it again: a different quote, silently never sent, for half an hour.
         * Testing the form repeatedly with your own address looked exactly
         * like the endpoint being broken or lagging, because nothing left the
         * browser and nothing said so.
         *
         * So the key now covers the inputs, and the window is 60 seconds. A
         * changed figure is a new quote request and goes; an unchanged one
         * inside a minute is the double-click. Dedupe happens AFTER the body
         * is built precisely so the inputs can be part of the key.
         */
        var dedupeKey = config.toolKey + '|'
          + body.applicant.email + '|'
          + stableKey(body.inputs);
        var sent = read(SENT_KEY) || {};
        var now = Date.now();
        Object.keys(sent).forEach(function (k) { if (now - sent[k] > DEDUPE_MS) delete sent[k]; });
        if (sent[dedupeKey]) { log('duplicate submission suppressed', dedupeKey); return Promise.resolve(false); }
        sent[dedupeKey] = now;
        write(SENT_KEY, sent);

        return post('/lead', body)
          .then(function () { log('captured', body.applicant.email); return true; })
          .catch(function (err) {
            log('capture failed, queued', err);
            enqueue('/lead', body);
            scheduleRetry();
            return false;
          });
      } catch (e) {
        log('capture threw', e);
        return Promise.resolve(false);
      }
    }
  };

  /* ---------- boot -------------------------------------------------------- */

  /* Exposed so a tool that renders its form late can mount the box itself,
     and so the wording can be asserted against the backend's copy. */
  api.mountSmsOptIn = mountSmsOptIn;
  /* Exposed so what the payload carries can be read back and checked, rather
     than a test re-deriving it from the DOM and agreeing with itself. */
  api.readSmsOptIn = readSmsOptIn;
  api.SMS_DISCLOSURE = SMS_DISCLOSURE;
  api.SMS_DISCLOSURE_VERSION = SMS_DISCLOSURE_VERSION;

  window.QuoteBot = window.QuoteBot || api;

  function boot() {
    drainQueue();
    var attr = resolveAttribution();
    if (attr.current.trackingCode) api.trackClick();
    decorateAll();
    mountSmsOptIn();
    loadBrand();
  }

  // Registered outside boot so a link clicked before DOMContentLoaded fires
  // still carries the code. auxclick covers middle-click "open in new tab".
  document.addEventListener('click', onClickAnywhere, true);
  document.addEventListener('auxclick', onClickAnywhere, true);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window, document);
