/**
 * The cookie banner, and the gate it controls — the calculators' copy.
 *
 * The same file as quotebot-web's public/js/consent.js, and deliberately a
 * copy rather than a shared build artifact: the two repos deploy on their own
 * cadences, and a calculator that cannot render until the site has shipped is
 * a worse failure than two files kept in step by hand. What actually has to
 * agree is the cookie they both read, and a test here pins that.
 *
 * Config comes off the script tag rather than a window global, matching how
 * quotebot-capture.js next door is configured.
 *
 * Runs on every page. It does two jobs that are easy to confuse: it asks the
 * question, and it is the thing that decides whether an analytics tag may load
 * at all. The second is the important one — a banner that records a preference
 * nobody enforces is theatre.
 *
 * Nothing here loads until there is something to gate. `window.QB_CONSENT.tags`
 * is empty while the site runs no analytics, and with nothing to gate the
 * banner does not appear: asking permission for tracking that does not exist
 * trains people to dismiss the question, and it would make this script the
 * first thing on the site to store anything.
 */
(function () {
  var SCRIPT = document.currentScript
    || document.querySelector('script[src*="quotebot-consent"]');
  var attr = function (n, d) {
    var v = SCRIPT && SCRIPT.getAttribute('data-' + n);
    return v === null || v === undefined || v === '' ? d : v;
  };
  var CFG = {
    version: attr('version', null),
    endpoint: attr('endpoint', null),
    text: attr('text', null),
    /* An analytics tag src. Absent means nothing to gate and so no banner —
       the same single switch consent.mjs is on the marketing site. */
    tags: attr('analytics-src', null)
      ? [{ category: 'analytics', src: attr('analytics-src', null) }]
      : [],
  };
  var KEY = 'qb_consent';
  /* Bump when the wording changes. A stored choice made under older wording is
     honoured but re-asked, because consent is to what was shown. */
  var VERSION = CFG.version || '2026-09-28';

  /* ---- storage ---------------------------------------------------------- */

  /**
   * A cookie on the registrable domain, mirrored to localStorage.
   *
   * localStorage is per-ORIGIN, so a choice stored there is invisible to the
   * calculators however they are hosted. A cookie scoped to the registrable
   * domain — `.example.com` from `sub.example.com` — is readable by every
   * subdomain, which is what "the answer carries over" actually requires.
   *
   * It bridges subdomains, not domains. While the calculators sit on a
   * different registrable domain nothing can share between them, and the two
   * surfaces keep their own answers; once they move onto a subdomain of this
   * one they share automatically, with no code change at the cutover. That is
   * the reason this is written now rather than then — the alternative was a
   * flag somebody has to remember to flip on the day, and the day is busy.
   *
   * Nothing is lost in the meantime: neither surface loads anything to gate
   * until an analytics tag is configured, and that comes after the move.
   *
   * localStorage stays as a mirror for the case a cookie cannot cover — a
   * browser refusing them — and as the migration path for anyone who answered
   * before this changed.
   */
  function domainAttr() {
    var h = location.hostname;
    if (h === 'localhost' || /^[0-9.]+$/.test(h)) return '';
    /* The registrable domain. Two labels is right for every host this runs
       on; a public-suffix list is the general answer and is not worth
       shipping for one domain. */
    var parts = h.split('.');
    return '; domain=.' + (parts.length > 2 ? parts.slice(-2).join('.') : h);
  }

  function read() {
    try {
      var m = document.cookie.match(new RegExp('(?:^|; )' + KEY + '=([^;]*)'));
      if (m) return JSON.parse(decodeURIComponent(m[1]));
    } catch (e) { /* fall through */ }
    try {
      var raw = window.localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function write(state) {
    try {
      /* A year, and Lax rather than Strict: the answer has to survive
         arriving from a link on another site, which is how most people reach
         the calculators. */
      document.cookie = KEY + '=' + encodeURIComponent(JSON.stringify(state))
        + '; path=/; max-age=31536000; SameSite=Lax' + domainAttr()
        + (location.protocol === 'https:' ? '; Secure' : '');
    } catch (e) { /* ignore */ }
    try { window.localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }

  /**
   * A random id for this browser, minted once.
   *
   * This — not the IP address — is what ties a choice made today to a form
   * filled in next month. An IP is shared by everyone behind one office router
   * and changes under a phone every few hours, so keying consent to it would
   * apply one person's rejection to their colleagues and lose their own within
   * the day. It is also personal data we would then have to hold.
   */
  function newId() {
    try {
      if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
      var a = new Uint8Array(16);
      window.crypto.getRandomValues(a);
      return Array.prototype.map.call(a, function (b) {
        return ('0' + b.toString(16)).slice(-2);
      }).join('');
    } catch (e) {
      return 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
    }
  }

  /* ---- the gate --------------------------------------------------------- */

  var state = read();

  /**
   * Global Privacy Control, honoured without being asked.
   *
   * The privacy policy says we do this, twice. A browser sending GPC has
   * already answered, so showing the banner anyway would be asking someone to
   * repeat themselves and would make a published statement untrue. Recorded as
   * a rejection made FOR them, which is what the `gpc` flag on the row means.
   */
  var gpc = navigator.globalPrivacyControl === true;

  function allowed(category) {
    if (gpc) return false;
    return !!(state && state.v === VERSION && state[category] === true);
  }

  /**
   * Load the tags the visitor agreed to.
   *
   * Each entry is {category, src, init}. Nothing is inlined and nothing runs
   * before this: a tag that loads and then checks consent has already sent the
   * first request, which is the whole thing consent was meant to prevent.
   */
  function applyTags() {
    (CFG.tags || []).forEach(function (tag) {
      if (!allowed(tag.category) || tag.loaded) return;
      tag.loaded = true;
      if (tag.src) {
        var s = document.createElement('script');
        s.async = true;
        s.src = tag.src;
        document.head.appendChild(s);
      }
      if (typeof tag.init === 'function') { try { tag.init(); } catch (e) { /* ignore */ } }
    });
  }

  /* ---- recording -------------------------------------------------------- */

  function record(choice, analytics, text) {
    var next = {
      v: VERSION,
      id: (state && state.id) || newId(),
      choice: choice,
      analytics: analytics,
      at: new Date().toISOString(),
    };
    state = next;
    write(next);
    applyTags();

    /* The server copy is evidence, and is allowed to fail. The browser has
       already applied the choice; refusing it because a network was down would
       mean the banner returns and the person answers twice. */
    if (!CFG.endpoint) return;
    try {
      var body = JSON.stringify({
        consentId: next.id,
        choice: choice,
        analytics: analytics,
        disclosureVersion: VERSION,
        disclosureText: text,
        sourceUrl: location.href,
        gpc: gpc,
      });
      /* sendBeacon survives the page being closed a moment later, which is
         exactly when someone clicks "reject" and leaves. */
      if (navigator.sendBeacon) {
        navigator.sendBeacon(CFG.endpoint, new Blob([body], { type: 'application/json' }));
      } else {
        fetch(CFG.endpoint, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: body, keepalive: true,
        }).catch(function () { /* evidence only */ });
      }
    } catch (e) { /* evidence only */ }
  }

  /**
   * The id, for anything that later identifies this person.
   *
   * A form that creates a contact sends it along, and the backend ties every
   * choice this browser has made to that person. Exposed rather than read out
   * of storage by each caller so there is one definition of where it lives.
   */
  window.qbConsentId = function () { return (read() || {}).id || null; };
  window.qbConsentAllows = allowed;

  /* ---- the banner ------------------------------------------------------- */

  function dismiss(el) { el.remove(); document.body.classList.remove('has-consent-bar'); }

  function show() {
    var text = CFG.text || 'We use analytics to understand how this site is '
      + 'used. Nothing is loaded until you choose.';
    var bar = document.createElement('div');
    bar.className = 'consent-bar';
    bar.setAttribute('role', 'dialog');
    bar.setAttribute('aria-label', 'Cookie choices');
    bar.innerHTML =
      '<div class="consent-inner">'
      + '<div class="consent-copy"><strong>Your choice about cookies</strong>'
      + '<p>' + text + ' <a href="/cookie-policy/">Cookie Policy</a></p></div>'
      + '<div class="consent-actions">'
      + '<button type="button" class="consent-btn consent-manage" data-a="manage">Manage</button>'
      + '<button type="button" class="consent-btn consent-reject" data-a="reject">Reject all</button>'
      + '<button type="button" class="consent-btn consent-accept" data-a="accept">Accept all</button>'
      + '</div></div>'
      + '<div class="consent-manage-panel" hidden>'
      + '<label class="consent-row"><input type="checkbox" checked disabled />'
      + '<span><strong>Strictly necessary</strong> — remembering this choice. '
      + 'Always on, because without it we would ask you again every page.</span></label>'
      + '<label class="consent-row"><input type="checkbox" id="consent-analytics" />'
      + '<span><strong>Analytics</strong> — how the site is used, so we can '
      + 'improve it. Off unless you turn it on.</span></label>'
      + '<button type="button" class="consent-btn consent-accept" data-a="save">Save my choices</button>'
      + '</div>';
    document.body.appendChild(bar);
    document.body.classList.add('has-consent-bar');

    bar.addEventListener('click', function (e) {
      var action = e.target && e.target.getAttribute && e.target.getAttribute('data-a');
      if (!action) return;
      if (action === 'manage') {
        var panel = bar.querySelector('.consent-manage-panel');
        panel.hidden = !panel.hidden;
        return;
      }
      if (action === 'accept') { record('ACCEPT_ALL', true, text); dismiss(bar); return; }
      if (action === 'reject') { record('REJECT_ALL', false, text); dismiss(bar); return; }
      if (action === 'save') {
        var on = !!bar.querySelector('#consent-analytics').checked;
        record('CUSTOM', on, text);
        dismiss(bar);
      }
    });
    /* Focus the first control so a keyboard user is not left hunting for it. */
    var first = bar.querySelector('.consent-btn');
    if (first) first.focus({ preventScroll: true });
  }

  /* ---- start ------------------------------------------------------------ */

  applyTags();

  /* Nothing to gate: no banner. Asking permission for tracking that does not
     exist is how people learn to click the first button without reading. */
  if (!(CFG.tags || []).length) return;

  if (gpc) {
    /* Answered by the browser. Recorded once so it is evidenced, then never
       asked. */
    if (!state || state.v !== VERSION || state.choice !== 'GPC') {
      state = { v: VERSION, id: (state && state.id) || newId(), choice: 'GPC', analytics: false, at: new Date().toISOString() };
      write(state);
      record('REJECT_ALL', false, 'Global Privacy Control signal honoured automatically.');
    }
    return;
  }

  if (!state || state.v !== VERSION) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', show);
    } else { show(); }
  }
})();
