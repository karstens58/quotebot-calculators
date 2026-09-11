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
  var FIRST_TOUCH_DAYS = 365;
  /* Long enough to swallow a double-click, short enough that a visitor who
     changes a number and recalculates is never silently dropped. */
  var DEDUPE_MS = 60 * 1000;

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
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return true;
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

  /* ---------- public API -------------------------------------------------- */

  var api = {
    config: config,

    /** Current attribution, if a page wants to display or forward it. */
    attribution: resolveAttribution,

    /**
     * Record the landing. Called automatically on load when a tracking code is
     * present; safe to call again.
     */
    trackClick: function () {
      var attr = resolveAttribution();
      var code = attr.current.trackingCode || (attr.last && attr.last.trackingCode);
      if (!code) return Promise.resolve(false);
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
     * @returns {Promise<boolean>} resolves false rather than rejecting
     */
    apply: function (intent) {
      try {
        if (!intent || !intent.email) { log('apply called without an email'); return Promise.resolve(false); }
        var attr = resolveAttribution();
        var body = {
          toolKey: config.toolKey,
          email: String(intent.email).trim().toLowerCase(),
          sessionId: attr.sessionId,
          selection: intent.selection || null,
          pressedAt: new Date().toISOString(),
          sourceUrl: window.location.href
        };
        /* Queued on failure like everything else here: the visitor sees their
           confirmation either way, and an application intent is the last thing
           we want to drop because a network blipped. */
        return post('/apply', body)
          .then(function () { log('apply recorded'); return true; })
          .catch(function (err) {
            log('apply failed, queued', err);
            enqueue('/apply', body);
            return false;
          });
      } catch (e) {
        log('apply threw', e);
        return Promise.resolve(false);
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

  window.QuoteBot = window.QuoteBot || api;

  function boot() {
    drainQueue();
    var attr = resolveAttribution();
    if (attr.current.trackingCode) api.trackClick();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window, document);
