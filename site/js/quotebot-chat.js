/*!
 * quotebot-chat.js — the Quote Bot assistant, for the public site and the tools.
 *
 * Drop into any page with one tag:
 *
 *   <script src="/js/quotebot-chat.js"
 *           data-endpoint="https://<chat-fn-url>.lambda-url.us-east-2.on.aws/"
 *           data-tool="myga"></script>
 *
 * No dependencies, no build step, one file. Same shape as quotebot-capture.js,
 * and it cooperates with it: a visitor who has just submitted a lead is never
 * interrupted by a chat invitation.
 *
 * WHAT IT WILL NOT DO
 *
 * It never opens itself on a timer alone. A visitor who has not touched
 * anything is not showing intent, and a greeting fired at somebody who is
 * still reading is the version of this everybody has learned to dismiss. The
 * bubble is always there to be clicked; the INVITATION only appears after the
 * person has done something that suggests a half-formed question — filled in
 * part of a calculator and stopped, or looked at results without acting.
 *
 * And it invites once. A dismissal is remembered for a week.
 *
 * THE DISCLOSURE IS NOT DECORATION
 *
 * Several states now require a clear, up-front disclosure that a consumer is
 * talking to software rather than a person — New York since November 2025,
 * California since January 2026, with Oregon, Washington and Nebraska
 * following. They are strictest where confusion with a human is likely, which
 * is exactly what an unprompted greeting creates. So the disclosure is part of
 * the opening line itself, not something that arrives after the first answer,
 * and it stays visible at the top of the panel for the whole conversation.
 *
 * That is also why the assistant has no human name. The console's assistant is
 * called Evan because the people using it are licensed staff who know what it
 * is. A visitor reasonably might not.
 */
(function (root, factory) {
  var api = factory(root);
  /* Exported for the test harness; the browser gets the namespace and boots. */
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof root !== 'undefined' && root) root.QuoteBotChat = api;
  if (typeof document !== 'undefined' && document && document.createElement) api.boot();
}(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* Constants                                                           */
  /* ------------------------------------------------------------------ */

  /**
   * MUST match CONSUMER_DISCLOSURE in
   * quotebot-backend/amplify/functions/chat/policy.ts.
   *
   * Duplicated rather than fetched because the invitation has to carry it
   * before any request is made — asking the server for the disclosure would
   * mean opening a conversation, and therefore writing a session row with a
   * hashed IP, for every visitor who is merely offered one.
   */
  var DISCLOSURE =
    'You are chatting with an automated assistant. It can explain how coverage works, '
    + 'but it cannot give advice or quote rates — a licensed agent does that, and you can '
    + 'ask for one at any point.';

  var BRAND = '#1e72b9';

  /**
   * Matches MAX_MESSAGE_CHARS in the chat Lambda's limits.ts.
   *
   * Enforced here as well as there so an honest visitor is stopped by the box
   * rather than by a round trip that comes back refusing them. The server cap
   * is the one that counts — this one is a courtesy, and anybody bypassing it
   * meets the real one.
   */
  var MAX_CHARS = 2000;

  /** Engaged, then idle this long → they are stuck rather than reading. */
  var STALL_MS = 45000;
  /** Results on screen and nothing done about them. */
  var RESULTS_MS = 25000;
  /** How long a "no thanks" is honoured. */
  var DISMISS_DAYS = 7;

  var K_DISMISSED = 'qb.chat.dismissed';
  var K_OFFERED = 'qb.chat.offered';
  var K_SESSION = 'qb.chat.session';

  /* ------------------------------------------------------------------ */
  /* When to offer                                                       */
  /* ------------------------------------------------------------------ */

  /**
   * Whether to show the invitation now, and why.
   *
   * Pure, and separated from everything else because it is the only part with
   * rules worth arguing about — and the only part worth testing. Returns a
   * reason rather than a boolean so the transcript records what prompted the
   * conversation, which is the difference between "chat converts" and knowing
   * WHICH moment converts.
   */
  function decideOffer(s, now) {
    /* They gave us their details. Interrupting somebody who has just converted
       is the one moment a chat invitation is purely a cost. */
    if (s.captured) return null;
    if (s.dismissedUntil && now < s.dismissedUntil) return null;
    if (s.offered) return null;
    /* Already talking, or already opened it themselves — the invitation would
       be an invitation to something they are looking at. */
    if (s.open || s.messages > 0) return null;

    /* The rule this whole function exists for: intent, not the clock. Nothing
       fires for a visitor who has not touched anything. */
    if (!s.engaged) return null;

    if (s.resultsAt && now - s.resultsAt >= RESULTS_MS) return 'results';
    if (s.lastInputAt && now - s.lastInputAt >= STALL_MS) return 'stalled';
    return null;
  }

  /** The invitation, which always carries the disclosure. */
  function invitation(reason) {
    var lead = reason === 'results'
      ? 'Questions about what these numbers mean?'
      : 'Stuck on any of this?';
    return lead + ' ' + DISCLOSURE;
  }

  /* ------------------------------------------------------------------ */
  /* Storage that never throws                                           */
  /* ------------------------------------------------------------------ */

  /*
   * Private browsing, blocked site data and a few embedded webviews all make
   * these throw rather than return null. A chat widget that breaks the page it
   * is on is worse than one that forgets whether it has already said hello.
   */
  function get(store, key) {
    try { return (root[store] || {}).getItem ? root[store].getItem(key) : null; }
    catch (e) { return null; }
  }
  function set(store, key, value) {
    try { if ((root[store] || {}).setItem) root[store].setItem(key, value); }
    catch (e) { /* nothing to do, and nothing worth breaking over */ }
  }

  /* ------------------------------------------------------------------ */
  /* Markup                                                              */
  /* ------------------------------------------------------------------ */

  var ICON = 'data:image/png;base64,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';

  function css() {
    return [
      '.qbc-btn{position:fixed;right:20px;bottom:20px;width:60px;height:60px;border-radius:50%;',
      'border:0;background:#fff;box-shadow:0 6px 22px rgba(16,32,56,.22);cursor:pointer;z-index:2147483000;',
      'display:flex;align-items:center;justify-content:center;padding:0;transition:transform .15s ease}',
      '.qbc-btn:hover{transform:scale(1.06)}',
      '.qbc-btn img{width:34px;height:auto;display:block}',
      '.qbc-btn:focus-visible{outline:3px solid ' + BRAND + ';outline-offset:3px}',

      '.qbc-invite{position:fixed;right:20px;bottom:92px;max-width:310px;background:#fff;',
      'border-radius:14px;box-shadow:0 10px 30px rgba(16,32,56,.22);padding:14px 16px;z-index:2147483000;',
      'font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#1d2733}',
      '.qbc-invite p{margin:0 0 4px}',
      '.qbc-invite .qbc-disc{font-size:11.5px;line-height:1.5;color:#5b6673;margin:0}',
      '.qbc-invite .qbc-row{display:flex;gap:8px;margin-top:11px}',
      '.qbc-invite button{font:inherit;font-size:13px;border-radius:8px;padding:7px 12px;cursor:pointer;border:1px solid #d6dde5;background:#fff;color:#1d2733}',
      '.qbc-invite button.qbc-yes{background:' + BRAND + ';border-color:' + BRAND + ';color:#fff}',

      '.qbc-panel{position:fixed;right:20px;bottom:20px;width:376px;max-width:calc(100vw - 32px);',
      'height:560px;max-height:calc(100vh - 40px);background:#fff;border-radius:16px;z-index:2147483000;',
      'box-shadow:0 18px 48px rgba(16,32,56,.28);display:flex;flex-direction:column;overflow:hidden;',
      'font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#1d2733}',
      '.qbc-head{display:flex;align-items:center;gap:10px;padding:13px 14px;border-bottom:1px solid #e8edf2}',
      '.qbc-head img{width:26px;height:auto}',
      '.qbc-head b{font-size:14px;flex:1}',
      '.qbc-head button{border:0;background:none;font-size:22px;line-height:1;cursor:pointer;color:#5b6673;padding:2px 6px}',
      '.qbc-disclosure{background:#f4f8fc;color:#41505f;font-size:11.5px;line-height:1.55;padding:9px 14px;border-bottom:1px solid #e8edf2}',
      '.qbc-log{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px}',
      '.qbc-msg{max-width:85%;padding:9px 12px;border-radius:13px;white-space:pre-wrap;word-wrap:break-word}',
      '.qbc-them{align-self:flex-start;background:#f1f4f8}',
      '.qbc-me{align-self:flex-end;background:' + BRAND + ';color:#fff}',
      '.qbc-meta{font-size:11px;color:#5b6673;margin-top:5px}',
      '.qbc-cite{font-size:11px;color:#5b6673;align-self:flex-start;max-width:85%}',
      '.qbc-hand{align-self:flex-start;margin-top:2px;font:inherit;font-size:13px;border:1px solid ' + BRAND + ';',
      'color:' + BRAND + ';background:#fff;border-radius:8px;padding:7px 12px;cursor:pointer}',
      '.qbc-ident{align-self:stretch;background:#f4f8fc;border:1px solid #dbe6f1;border-radius:12px;padding:12px}',
      '.qbc-ident b{display:block;font-size:13px;margin-bottom:3px}',
      '.qbc-ident p{margin:0 0 9px;font-size:12.5px;color:#41505f;line-height:1.55}',
      '.qbc-ident input{width:100%;box-sizing:border-box;font:inherit;font-size:13px;padding:7px 9px;',
      'border:1px solid #d6dde5;border-radius:8px;margin-bottom:7px}',
      '.qbc-ident .qbc-row{display:flex;gap:7px}',
      '.qbc-ident button{font:inherit;font-size:13px;border-radius:8px;padding:7px 12px;cursor:pointer;border:1px solid #d6dde5;background:#fff}',
      '.qbc-ident button.qbc-yes{background:' + BRAND + ';border-color:' + BRAND + ';color:#fff}',
      '.qbc-err{color:#8f2d24;font-size:12px;margin-top:4px}',
      '.qbc-foot{display:flex;gap:8px;padding:11px 12px;border-top:1px solid #e8edf2}',
      '.qbc-foot textarea{flex:1;font:inherit;font-size:13.5px;resize:none;height:38px;padding:9px 11px;',
      'border:1px solid #d6dde5;border-radius:10px;box-sizing:border-box}',
      '.qbc-foot button{border:0;background:' + BRAND + ';color:#fff;border-radius:10px;padding:0 15px;cursor:pointer;font:inherit;font-size:13.5px}',
      '.qbc-foot button[disabled]{opacity:.5;cursor:default}',
      '@media (max-width:420px){.qbc-panel{right:8px;bottom:8px;width:calc(100vw - 16px);height:calc(100vh - 16px)}}',
      '@media (prefers-reduced-motion:reduce){.qbc-btn{transition:none}}'
    ].join('');
  }

  /* ------------------------------------------------------------------ */
  /* The widget                                                          */
  /* ------------------------------------------------------------------ */

  var cfg = { endpoint: '', tool: 'web', trackingCode: null };
  var state = {
    engaged: false, lastInputAt: 0, resultsAt: 0,
    offered: false, open: false, messages: 0, captured: false, dismissedUntil: 0, origin: null
  };
  var sessionId = null;
  var el = {};
  var timer = null;

  function boot() {
    var s = document.currentScript;
    if (s) {
      cfg.endpoint = s.getAttribute('data-endpoint') || '';
      cfg.tool = s.getAttribute('data-tool') || 'web';
    }
    try {
      var m = /[?&]qb=([^&#]+)/.exec(root.location ? root.location.search : '');
      if (m) cfg.trackingCode = decodeURIComponent(m[1]);
    } catch (e) { /* attribution is a nicety, never a blocker */ }

    state.dismissedUntil = Number(get('localStorage', K_DISMISSED) || 0);
    state.offered = get('sessionStorage', K_OFFERED) === '1';
    sessionId = get('sessionStorage', K_SESSION) || null;

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', start);
    } else {
      start();
    }
  }

  function start() {
    if (!cfg.endpoint) {
      /* Loud in the console, silent on the page. A visitor should never see a
         chat button that cannot reach anything. */
      if (root.console && root.console.warn) {
        root.console.warn('quotebot-chat: no data-endpoint, widget not shown');
      }
      return;
    }
    var style = document.createElement('style');
    style.textContent = css();
    document.head.appendChild(style);

    el.btn = document.createElement('button');
    el.btn.className = 'qbc-btn';
    el.btn.setAttribute('aria-label', 'Open the Quote Bot assistant');
    el.btn.innerHTML = '<img src="' + ICON + '" alt="">';
    el.btn.addEventListener('click', function () { open('button'); });
    document.body.appendChild(el.btn);

    watchIntent();
    timer = root.setInterval(tick, 3000);
  }

  /**
   * What counts as intent.
   *
   * Any change to a form control on the page. Deliberately not scroll or mouse
   * movement: reading is not a question, and treating it as one is how a
   * widget ends up interrupting people who were perfectly happy.
   */
  function watchIntent() {
    var mark = function () {
      state.engaged = true;
      state.lastInputAt = Date.now();
    };
    document.addEventListener('change', mark, true);
    document.addEventListener('input', mark, true);

    /* Cooperate with quotebot-capture.js: a visitor who has just handed over
       their details has converted, and does not need inviting to chat. */
    document.addEventListener('quotebot:captured', function () { state.captured = true; });
    /* A calculator can say "results are on screen" explicitly. */
    document.addEventListener('quotebot:results', function () { state.resultsAt = Date.now(); });
  }

  /**
   * Stop watching once no invitation can ever be shown.
   *
   * Without this the interval runs for the life of the page — after they have
   * been invited, after they said no, after they opened it themselves. Small
   * on one page and not nothing on a calculator somebody leaves open, and it
   * is the kind of timer that quietly keeps a phone awake.
   */
  function stopWatching() {
    if (timer) { root.clearInterval(timer); timer = null; }
  }

  function tick() {
    if (state.offered || state.captured || state.open || state.messages > 0) {
      return stopWatching();
    }
    var reason = decideOffer(state, Date.now());
    if (reason) { offer(reason); stopWatching(); }
  }

  function offer(reason) {
    state.offered = true;
    set('sessionStorage', K_OFFERED, '1');

    el.invite = document.createElement('div');
    el.invite.className = 'qbc-invite';
    el.invite.setAttribute('role', 'status');

    var lead = document.createElement('p');
    lead.textContent = reason === 'results'
      ? 'Questions about what these numbers mean?'
      : 'Stuck on any of this?';
    var disc = document.createElement('p');
    disc.className = 'qbc-disc';
    disc.textContent = DISCLOSURE;

    var row = document.createElement('div');
    row.className = 'qbc-row';
    var yes = document.createElement('button');
    yes.className = 'qbc-yes';
    yes.textContent = 'Ask a question';
    yes.addEventListener('click', function () { closeInvite(); open(reason); });
    var no = document.createElement('button');
    no.textContent = 'No thanks';
    no.addEventListener('click', function () {
      /* Remembered, so the answer means something. */
      state.dismissedUntil = Date.now() + DISMISS_DAYS * 864e5;
      set('localStorage', K_DISMISSED, String(state.dismissedUntil));
      closeInvite();
      stopWatching();
    });
    row.appendChild(yes); row.appendChild(no);

    el.invite.appendChild(lead);
    el.invite.appendChild(disc);
    el.invite.appendChild(row);
    document.body.appendChild(el.invite);
  }

  function closeInvite() {
    if (el.invite && el.invite.parentNode) el.invite.parentNode.removeChild(el.invite);
    el.invite = null;
  }

  /* ------------------------------------------------------------------ */
  /* The panel                                                           */
  /* ------------------------------------------------------------------ */

  /**
   * `origin` is which moment brought them in — the button, or the invitation
   * and what prompted it. Carried on the session's surface so the reporting
   * can answer WHICH moment converts, not merely that chat does.
   */
  function open(origin) {
    if (state.open) return;
    state.open = true;
    state.origin = origin || 'button';
    closeInvite();
    el.btn.style.display = 'none';

    el.panel = document.createElement('div');
    el.panel.className = 'qbc-panel';
    el.panel.setAttribute('role', 'dialog');
    el.panel.setAttribute('aria-label', 'Quote Bot assistant');
    el.panel.innerHTML =
      '<div class="qbc-head"><img src="' + ICON + '" alt=""><b>Quote Bot assistant</b>'
      + '<button type="button" aria-label="Close">&times;</button></div>'
      + '<div class="qbc-disclosure"></div>'
      + '<div class="qbc-log" role="log" aria-live="polite"></div>'
      + '<div class="qbc-foot"><textarea rows="1" aria-label="Your question" '
      + 'maxlength="' + MAX_CHARS + '" '
      + 'placeholder="Ask about coverage, terms, how any of it works…"></textarea>'
      + '<button type="button">Send</button></div>';

    /* Always visible, not only on the first message. The requirement is that a
       consumer knows what they are talking to, which is a property of the
       whole conversation rather than of its opening line. */
    el.panel.querySelector('.qbc-disclosure').textContent = DISCLOSURE;

    el.log = el.panel.querySelector('.qbc-log');
    el.input = el.panel.querySelector('textarea');
    el.send = el.panel.querySelector('.qbc-foot button');

    el.panel.querySelector('.qbc-head button').addEventListener('click', close);
    el.send.addEventListener('click', send);
    el.input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });
    el.panel.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close();
    });

    document.body.appendChild(el.panel);
    el.input.focus();
  }

  function close() {
    state.open = false;
    if (el.panel && el.panel.parentNode) el.panel.parentNode.removeChild(el.panel);
    el.panel = null;
    el.btn.style.display = '';
    el.btn.focus();
  }

  function bubble(cls, text) {
    var d = document.createElement('div');
    d.className = 'qbc-msg ' + cls;
    d.textContent = text;
    el.log.appendChild(d);
    el.log.scrollTop = el.log.scrollHeight;
    return d;
  }

  function send() {
    var text = (el.input.value || '').trim();
    if (!text || el.send.disabled) return;
    el.input.value = '';
    bubble('qbc-me', text);
    state.messages++;
    ask({ message: text });
  }

  function ask(extra) {
    el.send.disabled = true;
    var thinking = bubble('qbc-them', '…');

    var body = {
      sessionId: sessionId,
      surface: cfg.tool + (state.origin && state.origin !== 'button' ? ':' + state.origin : ''),
      trackingCode: cfg.trackingCode
    };
    for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) body[k] = extra[k];

    root.fetch(cfg.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (r) { return r.json(); }).then(function (res) {
      thinking.parentNode.removeChild(thinking);
      if (res.sessionId) {
        sessionId = res.sessionId;
        set('sessionStorage', K_SESSION, sessionId);
      }
      if (res.reply) render(res);
      if (res.identityError) {
        var e = document.createElement('div');
        e.className = 'qbc-err';
        e.textContent = res.identityError;
        el.log.appendChild(e);
      }
      if (res.askIdentity) identity(res.askIdentity);
    }).catch(function () {
      thinking.textContent =
        'I could not reach the assistant just then. Try again, or ask for an agent and '
        + 'somebody will pick this up.';
    }).then(function () {
      el.send.disabled = false;
      el.log.scrollTop = el.log.scrollHeight;
    });
  }

  function render(res) {
    bubble('qbc-them', res.reply);

    if (res.sources && res.sources.length) {
      var c = document.createElement('div');
      c.className = 'qbc-cite';
      var titles = [];
      for (var i = 0; i < res.sources.length; i++) {
        if (res.sources[i] && res.sources[i].title) titles.push(res.sources[i].title);
      }
      if (titles.length) {
        c.textContent = 'From: ' + titles.join('; ');
        el.log.appendChild(c);
      }
    }

    /*
     * The handoff is a button, not a sentence.
     *
     * The gate refuses a question precisely when a licensed person is needed,
     * and telling somebody "an agent can help with that" while giving them no
     * way to reach one is where a refusal turns into a dead end.
     */
    if (res.handoff === 'agent') {
      var b = document.createElement('button');
      b.className = 'qbc-hand';
      b.textContent = 'Have an agent call me';
      b.addEventListener('click', function () {
        b.disabled = true;
        state.messages++;
        ask({ handoffRequested: true, message: 'Please have an agent contact me.' });
      });
      el.log.appendChild(b);
    }
  }

  /**
   * The name-and-email prompt.
   *
   * It never gates an answer. The next question is answered whether or not
   * this is filled in — a gate converts fewer of the people who would have
   * told us anyway, and an assistant that withholds insurance information
   * until it has your email is doing something we would not want described
   * back to us.
   */
  function identity(prompt) {
    var box = document.createElement('div');
    box.className = 'qbc-ident';
    box.innerHTML = '<b></b><p></p>'
      + '<input type="text" placeholder="First name" autocomplete="given-name">'
      + '<input type="text" placeholder="Last name" autocomplete="family-name">'
      + '<input type="email" placeholder="Email" autocomplete="email">'
      + '<div class="qbc-row"><button type="button" class="qbc-yes">Send it to me</button>'
      + '<button type="button">' + (prompt.dismiss || 'No thanks') + '</button></div>';
    box.querySelector('b').textContent = prompt.title || '';
    box.querySelector('p').textContent = prompt.body || '';

    var ins = box.querySelectorAll('input');
    var btns = box.querySelectorAll('button');
    btns[0].addEventListener('click', function () {
      box.parentNode.removeChild(box);
      ask({ identity: { firstName: ins[0].value, lastName: ins[1].value, email: ins[2].value } });
    });
    btns[1].addEventListener('click', function () {
      box.parentNode.removeChild(box);
      ask({ identityDeclined: true });
    });

    el.log.appendChild(box);
    el.log.scrollTop = el.log.scrollHeight;
  }

  /* ------------------------------------------------------------------ */

  return {
    boot: boot,
    /* Pure, and the only part with rules worth testing. */
    decideOffer: decideOffer,
    invitation: invitation,
    DISCLOSURE: DISCLOSURE,
    STALL_MS: STALL_MS,
    RESULTS_MS: RESULTS_MS,
    DISMISS_DAYS: DISMISS_DAYS,
    MAX_CHARS: MAX_CHARS,
    /* A calculator can drive it directly rather than waiting to be noticed. */
    open: function () { open('api'); },
    results: function () { state.resultsAt = Date.now(); },
    captured: function () { state.captured = true; }
  };
}));
