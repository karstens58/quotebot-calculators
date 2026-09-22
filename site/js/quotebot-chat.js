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
   *
   * The match is now ENFORCED rather than requested: the backend repo's
   * tests/disclosure-matches.test.mjs reads both files and fails if they
   * differ by a character. For years this comment asked politely and nothing
   * checked, which is how the sentence on a live page and the sentence in the
   * source of truth come to say different things.
   *
   * The second sentence, added 22 September 2026, is why that matters more
   * than it used to. Staff can now read a conversation in progress and may
   * join one, and neither is covered by telling somebody they can ASK for a
   * human. "business hours" means the hours in OFFICE in the backend's
   * shared/callback.ts — Mon-Fri, 8am-5pm Mountain. Change the hours and this
   * sentence moves too.
   */
  var DISCLOSURE =
    'You are chatting with an automated assistant. It can explain how coverage works, '
    + 'but it cannot give advice or quote rates — a licensed agent does that, and you can '
    + 'ask for one at any point. A licensed agent may read this chat, and during business '
    + 'hours may check in on you.';

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

  /**
   * The states a visitor can pick from, and the reason it is a list.
   *
   * A typed state is the one field on this form that can fail silently: the
   * server normalizes "Colorado" and "co" alike, but "Colordao" normalizes to
   * nothing, and a callback with no state routes to whoever is next in the
   * rotation rather than to somebody licensed where this person lives. That
   * lead looks handled and is not. A list cannot be mistyped.
   */
  var STATES = ('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS '
    + 'MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY').split(' ');

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
      /* The callback form. Same furniture as the identity prompt, plus a
         select for the state — a typed state that does not resolve is a lead
         routed to nobody licensed, and a list makes that impossible. */
      '.qbc-cb select{width:100%;box-sizing:border-box;font:inherit;font-size:13px;padding:7px 9px;',
      'border:1px solid #d6dde5;border-radius:8px;margin-bottom:7px;background:#fff}',
      '.qbc-cb .qbc-half{display:flex;gap:7px}',
      '.qbc-cb .qbc-half input{flex:1}',
      '.qbc-cb[aria-busy="true"]{opacity:.6;pointer-events:none}',
      '.qbc-foot{display:flex;gap:8px;padding:11px 12px;border-top:1px solid #e8edf2}',
      '.qbc-foot textarea{flex:1;font:inherit;font-size:13.5px;resize:none;height:38px;padding:9px 11px;',
      'border:1px solid #d6dde5;border-radius:10px;box-sizing:border-box}',
      '.qbc-foot button{border:0;background:' + BRAND + ';color:#fff;border-radius:10px;padding:0 15px;cursor:pointer;font:inherit;font-size:13.5px}',
      '.qbc-foot button[disabled]{opacity:.5;cursor:default}',
      /* Keep the list's own scrolling to itself. Without this, reaching the
         top of the transcript hands the gesture to the page behind it and the
         calculator scrolls away under the panel. */
      '.qbc-log{overscroll-behavior:contain;-webkit-overflow-scrolling:touch}',

      /*
       * Phones.
       * ------
       * 560px, not 420px. A 428px iPhone reports 428 CSS pixels and was
       * getting the desktop panel — a 376px card floating inside a 428px
       * screen, with the page visible around it and a 13px input. The
       * breakpoint has to clear the largest phone, not the smallest.
       */
      '@media (max-width:560px){',
      /* Full screen, edge to edge. A floating card on a phone wastes the
         only dimension there is. */
      '.qbc-panel{inset:0;right:0;bottom:0;left:0;top:0;width:100%;max-width:100%;',
      'height:100vh;height:100dvh;max-height:100vh;max-height:100dvh;border-radius:0}',

      /*
       * 100dvh, with 100vh underneath it for browsers that do not know dvh.
       * On iOS Safari 100vh is the height WITHOUT the toolbars, so a panel
       * sized to it runs off the bottom of the screen and takes the message
       * box with it — the one control the whole thing exists for, unreachable
       * until you scroll a fixed element that does not scroll.
       */

      /* The home indicator sits over the send button otherwise. */
      '.qbc-foot{padding-bottom:calc(11px + env(safe-area-inset-bottom));',
      'padding-left:calc(12px + env(safe-area-inset-left));',
      'padding-right:calc(12px + env(safe-area-inset-right))}',
      '.qbc-head{padding-top:calc(13px + env(safe-area-inset-top))}',

      /*
       * 16px, and this is not a style preference.
       * iOS zooms the whole page when a field smaller than 16px takes focus,
       * and it does not zoom back out. Every input on this panel was 13px, so
       * tapping the message box left somebody looking at a magnified corner
       * of a chat they could no longer see.
       */
      '.qbc-foot textarea,.qbc-ident input,.qbc-cb select{font-size:16px}',
      '.qbc-foot textarea{height:44px;padding:12px 12px}',

      /* Thumbs, not cursors. 44px is the smallest target Apple and Google
         both call reliable, and the close button was about 26. */
      '.qbc-head button{font-size:26px;padding:6px 12px;min-width:44px;min-height:44px}',
      '.qbc-foot button{min-height:44px;padding:0 18px}',
      '.qbc-hand,.qbc-ident button,.qbc-invite button{min-height:44px;padding:11px 16px}',

      /* A bubble at 85% of a phone leaves a stripe of dead space; at 92% the
         text has somewhere to go. */
      '.qbc-msg,.qbc-cite{max-width:92%}',
      '.qbc-log{padding:12px;gap:9px}',
      '}',

      /* The launcher and the invite live above the home indicator too. */
      '@media (max-width:560px){',
      '.qbc-btn{right:16px;bottom:calc(16px + env(safe-area-inset-bottom));width:56px;height:56px}',
      '.qbc-invite{right:12px;left:12px;max-width:none;',
      'bottom:calc(84px + env(safe-area-inset-bottom))}',
      '}',

      /* Landscape on a phone is mostly keyboard. Give the transcript what is
         left rather than the disclosure and the header. */
      '@media (max-width:900px) and (max-height:460px) and (orientation:landscape){',
      '.qbc-disclosure{padding:6px 14px;font-size:11px}',
      '.qbc-head{padding:8px 14px}',
      '}',

      '@media (prefers-reduced-motion:reduce){.qbc-btn{transition:none}}'
    ].join('');
  }

  /**
   * Did they just ask for a person?
   *
   * Scott's ask was that somebody can type "Agent" at any point and be put
   * through, so the word has to work as well as the button. Kept here as a
   * plain match on the whole message rather than as a rule in the compliance
   * gate: the gate decides what may be ANSWERED, and this decides what the
   * visitor meant by asking. Confusing the two would put a keyword list in
   * the middle of the thing that has to be defensible to a regulator.
   *
   * Matched only when the request is the whole message. "Is an agent required
   * to sell an annuity?" is a question about agents, not a request for one,
   * and answering it with a callback form is the kind of thing that makes
   * people stop typing.
   */
  function wantsAgent(text) {
    var t = String(text || '').trim().toLowerCase().replace(/[.!?]+$/, '');
    if (!t || t.length > 40) return false;
    return /^(agent|human|a human|real person|person|rep|representative|a person|a human|a rep|an agent|a real person|live person|live agent|someone to talk to|talk to (an? )?(agent|human|person|someone|somebody)|speak (to|with) (an? )?(agent|human|person|someone|somebody)|(can|could) i (talk|speak) (to|with) (an? )?(agent|human|person|someone|somebody)|i want (to talk to )?(an? )?(agent|human|person)|call me|have (an? )?agent call me|get me (an? )?(agent|human|person))$/.test(t);
  }

  /**
   * The opening, said before anybody types.
   *
   * Written here rather than fetched, for the same reason the disclosure is:
   * asking the server for a greeting would open a conversation — and write a
   * session row with a hashed IP — for every visitor who opened the panel and
   * wandered off. Most of them do.
   *
   * No human name, and that is the rule rather than a preference. The
   * console's assistant is called Evan because the people using it are
   * licensed staff who know what it is; a visitor reasonably might not, and
   * several states now take a dim view of exactly that confusion.
   */
  var GREETING = 'Hi there! Before we get started, may I ask your first name?';

  /** After a name. Only ever used with a name that was actually given. */
  function thanks(name) {
    return 'Thanks, ' + name + '! How can I help?';
  }

  /**
   * The email ask, after the first real answer.
   *
   * Says what is true TODAY. When a transcript can actually be sent (QBP-46 —
   * SES is unverified, and until it is, a send is recorded and marked as not
   * sent), this is the one line that changes, and it should change by asking
   * the server rather than by somebody remembering. Promising a transcript
   * before then would be the /apply mistake: telling somebody something
   * happened when nothing did, to the people who trusted it enough to wait.
   */
  /**
   * How many real answers before the email is asked for.
   *
   * Two, not one. Asking straight after the first answer means somebody has
   * had one question answered and is immediately being asked for their
   * address, which reads as the price of the next one. A second answer is
   * enough for them to have decided whether this is worth anything, and the
   * ask lands as an offer rather than a toll.
   *
   * A name reply does not count — it is not an answer to anything.
   */
  var ASK_EMAIL_AFTER = 2;

  var EMAIL_ASK =
    'What\u2019s your email? That way an agent can pick up where we left off '
    + 'instead of starting over.';

  /**
   * Words that are not names, however much they look like one.
   *
   * Two kinds. The first is what people actually reply to a greeting —
   * "hi", "sure", "rather not". The second is this site's own vocabulary: a
   * visitor on a MYGA calculator who types "annuities" has named a topic, and
   * answering "Thanks, Annuities! How can I help?" is the sort of thing
   * people screenshot.
   *
   * The list is imperfect and will stay imperfect, which is survivable
   * because the two failures are not the same size. Missing a real name costs
   * nothing — the conversation carries on and the name is asked for again
   * later. Greeting somebody by a product name cannot be taken back. So when
   * this is unsure, it refuses.
   */
  var NOT_NAMES = [
    /* topics, not people */
    'annuity', 'annuities', 'insurance', 'life', 'life insurance', 'term',
    'term life', 'whole life', 'myga', 'iul', 'ltc', 'rates', 'rate', 'quote',
    'quotes', 'policy', 'policies', 'coverage', 'cover', 'premium', 'premiums',
    'retirement', 'income', 'beneficiary', 'surrender', 'help', 'info',
    'information', 'question', 'questions', 'pricing', 'price', 'cost',
    'money', 'claim', 'claims', 'account', 'application',
    'hi', 'hey', 'hello', 'yo', 'sup', 'thanks', 'thank you', 'ok', 'okay',
    'yes', 'yeah', 'yep', 'no', 'nope', 'sure', 'maybe', 'none', 'nothing',
    'anonymous', 'nobody', 'test', 'testing', 'na', 'n a', 'skip', 'rather not',
    'why', 'who', 'what', 'none of your business',
  ];

  /**
   * Did they answer with a name, and if so what is it?
   *
   * Returns the name or null, and the null cases are the ones that matter.
   * Replying "Thanks, Annuities! How can I help?" to somebody who typed a
   * question is the kind of thing people screenshot, so this refuses anything
   * it is not fairly sure about and the conversation simply carries on.
   *
   * Lives in the widget beside wantsAgent for the same reason that does: the
   * compliance gate decides what may be ANSWERED and has to stay defensible
   * to a regulator, and a guess at what somebody MEANT does not belong in the
   * middle of it.
   */
  function readName(text) {
    var raw = String(text || '').trim();
    if (!raw || raw.length > 40) return null;
    if (raw.indexOf('?') >= 0) return null;
    if (wantsAgent(raw)) return null;

    /* "I'm Dana", "my name is Dana", "this is Dana", "Dana here". */
    var lead = /^(?:i\s*a?m|i'm|my name is|name(?:'s| is)?|this is|it'?s|call me)\s+(.+)$/i;
    var m = lead.exec(raw);
    var body = m ? m[1] : raw;
    body = body.replace(/[.,!]+$/, '').replace(/\s+here$/i, '').trim();
    if (!body) return null;

    var low = body.toLowerCase();
    for (var i = 0; i < NOT_NAMES.length; i++) if (low === NOT_NAMES[i]) return null;

    /* Nobody is called "a something". An article is the cheapest available
       signal that this is a description rather than a name, and it catches
       the whole family at once instead of one phrase at a time. */
    if (/^(a|an|the|some|any|my|your)\s/i.test(low)) return null;

    /* At most two words, letters only, plus the punctuation real names carry.
       Three words is usually a sentence, and a sentence is usually a
       question somebody forgot the mark on. */
    var words = body.split(/\s+/);
    if (words.length > 2) return null;
    for (var j = 0; j < words.length; j++) {
      if (!/^[a-z][a-z'\u2019-]*$/i.test(words[j])) return null;
      if (words[j].length > 20) return null;
    }
    /* A single letter is an initial or a stray keystroke, not a name to
       greet somebody by. */
    if (body.replace(/[^a-z]/gi, '').length < 2) return null;

    /*
     * Title case, with the rest LOWERED, across the separators real names
     * carry.
     *
     * Two bugs live here and both were caught by tests rather than by
     * reading. Keeping the tail as typed greets "DANA" as "DANA", which reads
     * as the system shouting back. Lowering the tail without splitting on the
     * hyphen turns "Mary-Jane" into "Mary-jane", which is worse than either,
     * because it is a name somebody will see spelled wrong every turn.
     */
    return words
      .map(function (w) {
        return w.split(/([-'\u2019])/).map(function (part) {
          /* Tested for BEING a separator rather than for being short: the
             length guard that was here skipped the "o" of o'brien, which then
             kept its lower case forever. */
          if (/^[-'\u2019]$/.test(part)) return part;
          return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
        }).join('');
      })
      .join(' ');
  }

  /* ------------------------------------------------------------------ */
  /* The widget                                                          */
  /* ------------------------------------------------------------------ */

  var cfg = {
    endpoint: '', tool: 'web', trackingCode: null,
    /* Opt-in. Absent means this widget never looks at the host page's fields
       at all, which is the default on purpose — see readPage(). */
    scanPage: false,
    extra: { state: '', firstName: '', lastName: '', email: '' }
  };
  var state = {
    engaged: false, lastInputAt: 0, resultsAt: 0,
    offered: false, open: false, messages: 0, captured: false, dismissedUntil: 0, origin: null,
    /* What the host page has told us about the visitor. Only ever used to
       prefill a form they are already being shown; never sent on its own. */
    context: {},
    /* The opening. `greeted` stops it being said twice if the panel is closed
       and reopened; `named` is what they said to call them; `askedEmail`
       stops the email request repeating after every answer. */
    greeted: false, named: '', askedEmail: false, answers: 0
  };
  var sessionId = null;
  var el = {};
  var timer = null;

  function boot() {
    var s = document.currentScript;
    if (s) {
      cfg.endpoint = s.getAttribute('data-endpoint') || '';
      cfg.tool = s.getAttribute('data-tool') || 'web';
      /* data-context turns the scan on; the four optional selectors name
         fields the scan cannot find on its own — a state dropdown with no
         autocomplete attribute, typically. */
      cfg.scanPage = s.hasAttribute('data-context');
      cfg.extra.state = s.getAttribute('data-state') || '';
      cfg.extra.firstName = s.getAttribute('data-first') || '';
      cfg.extra.lastName = s.getAttribute('data-last') || '';
      cfg.extra.email = s.getAttribute('data-email') || '';
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

  /* ------------------------------------------------------------------ */
  /* Fitting the panel to what is actually on screen                     */
  /* ------------------------------------------------------------------ */

  /**
   * Below this the panel is full screen and the keyboard matters. Matches the
   * breakpoint in css().
   */
  var PHONE_MAX = 560;

  /**
   * Keep the panel inside the VISIBLE viewport, not the layout one.
   *
   * On a phone the panel is `position:fixed; inset:0; height:100dvh`, which is
   * right until the keyboard opens. iOS does not shrink the layout viewport
   * for the keyboard — it scrolls the document so the focused field is above
   * it. A fixed element is positioned against the layout viewport, so the
   * whole panel rides up with that scroll and its top goes off the screen:
   * the header, the disclosure and the welcome message, gone, with the
   * message box the only thing left. Which is exactly what somebody opening
   * the chat for the first time should NOT be looking at.
   *
   * `window.visualViewport` is the only thing that describes what is actually
   * visible. Sizing to `vv.height` and translating by `vv.offsetTop` puts the
   * panel over the visible strip and nowhere else, so the header stays put
   * and the transcript keeps whatever room the keyboard leaves it.
   *
   * 100dvh in the stylesheet still does the work before the keyboard appears,
   * and on anything without visualViewport. This adjusts; it does not replace.
   */
  function fitPanel(panel) {
    var node = panel || el.panel;
    if (!node) return;
    var vv = window.visualViewport;
    var phone = (window.innerWidth || 0) <= PHONE_MAX;
    if (!vv || !phone) {
      /* Cleared rather than left behind. A panel carrying a phone's height
         after a rotation to landscape, or on a desktop that was narrow for a
         moment, is worse than one that never had it — the stylesheet owns
         those cases and cannot override an inline style. */
      node.style.height = '';
      node.style.transform = '';
      return;
    }
    node.style.height = vv.height + 'px';
    /* offsetTop is how far the visible strip has moved down the layout
       viewport. Translating by it cancels the scroll iOS just performed. */
    node.style.transform = 'translateY(' + (vv.offsetTop || 0) + 'px)';
    if (el.log) el.log.scrollTop = el.log.scrollHeight;
  }

  /**
   * Bound while the panel is open and unbound when it closes.
   *
   * Both events are needed and they fire at different moments: `resize` when
   * the keyboard opens or closes, `scroll` when iOS moves the visible strip
   * around underneath it — dragging the page, or the keyboard's own
   * predictive bar appearing.
   */
  function watchViewport(on) {
    var vv = window.visualViewport;
    if (!vv) return;
    var how = on ? 'addEventListener' : 'removeEventListener';
    vv[how]('resize', fitPanel);
    vv[how]('scroll', fitPanel);
    window[how]('orientationchange', fitPanel);
  }

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

    /*
     * The opening, drawn locally and sent nowhere.
     *
     * Said once per visitor rather than once per open: somebody who closes
     * the panel and comes back has already been asked their name, and asking
     * again reads as a system with no memory of a conversation it is holding.
     */
    if (!state.greeted) {
      state.greeted = true;
      bubble('qbc-them', GREETING);
    }

    /* Before the focus below, so the first keyboard event is already being
       listened for rather than arriving at nothing. */
    watchViewport(true);
    fitPanel();

    el.input.focus();
    /* iOS settles the viewport a moment after the keyboard animates in, and
       the numbers during the animation are not the numbers afterwards. One
       late correction costs nothing and is the difference between a header
       that is visible and one that is half off the top. */
    setTimeout(fitPanel, 300);
  }

  function close() {
    state.open = false;
    watchViewport(false);
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

    /*
     * An answer to the greeting, if that is what it is.
     *
     * Only ever considered before they have said anything else — once a
     * conversation is under way, a one-word message is far more likely to be
     * a topic than a name, and "Thanks, Surrender!" is not recoverable.
     *
     * NOTE that this NEVER withholds an answer. If the reply is a question,
     * it goes straight through. session.ts puts it plainly: an assistant that
     * holds back insurance information until it has your details is doing
     * something we would not want described back to us.
     */
    var name = (!state.named && state.messages === 1) ? readName(text) : null;
    if (name) {
      state.named = name;
      bubble('qbc-them', thanks(name));
      /* Sent with no message: a name is not a question, and answering one
         would mean putting "Dana" to a model. */
      ask({ firstName: name });
      return;
    }

    /* Typing "agent" does what pressing the button does. The message still
       goes to the server and is still answered — asking for a person is not
       a reason to stop talking to them mid-sentence. */
    ask(wantsAgent(text) ? { message: text, handoffRequested: true } : { message: text });
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

    return root.fetch(cfg.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (r) { return r.json(); }).then(function (res) {
      thinking.parentNode.removeChild(thinking);
      if (res.sessionId) {
        sessionId = res.sessionId;
        set('sessionStorage', K_SESSION, sessionId);
      }
      /* The server's copy wins: it survives a reload, and this widget's does
         not. */
      if (res.firstName && !state.named) state.named = res.firstName;
      if (res.reply) render(res);
      if (res.identityError) {
        var e = document.createElement('div');
        e.className = 'qbc-err';
        e.textContent = res.identityError;
        el.log.appendChild(e);
      }
      /*
       * What came of a callback request. Rendered as an ordinary bubble
       * rather than a banner, because it is the answer to the thing they just
       * asked for and it carries a time they may want to scroll back to.
       */
      if (res.callbackTaken && res.callbackTaken.message) {
        bubble('qbc-them', res.callbackTaken.message);
      }
      /*
       * The callback form supersedes the identity prompt — it asks for
       * everything that one does and two more besides, so showing both would
       * ask the same person for their email twice in the same panel.
       */
      if (res.askCallback) callback(res.askCallback);
      else if (res.askIdentity) identity(res.askIdentity);

      /*
       * The email ask, once, after a real answer.
       *
       * After rather than before, and once rather than on every turn. It is
       * also skipped entirely when the server is already showing a form of
       * its own — being asked for an email in a sentence and in a box at the
       * same time reads as a system arguing with itself.
       */
      if (res.reply) state.answers++;
      if (state.answers >= ASK_EMAIL_AFTER && !state.askedEmail
          && !res.askCallback && !res.askIdentity && !res.callbackTaken) {
        state.askedEmail = true;
        bubble('qbc-them', EMAIL_ASK);
      }
      return res;
    }).catch(function () {
      if (thinking.parentNode) {
        thinking.textContent =
          'I could not reach the assistant just then. Try again, or ask for an agent and '
          + 'somebody will pick this up.';
      }
      /* Returned rather than rethrown, so a caller chaining on this (the
         callback form) gets a plain "nothing came back" instead of an
         unhandled rejection, and can say so where the person is looking. */
      return null;
    }).then(function (res) {
      el.send.disabled = false;
      el.log.scrollTop = el.log.scrollHeight;
      return res;
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
   * What the visitor has already typed into this page.
   *
   * Read at the moment the callback form is drawn, not watched — no
   * listeners, nothing stale, and whatever is on screen when they ask is what
   * they get back. Used for one thing only: not asking somebody twice for
   * something already in front of them.
   *
   * OFF unless the page says `data-context` on the script tag. A chat widget
   * that reads the fields of whatever page it is dropped into, without being
   * asked, is doing something nobody would want described back to them — and
   * this one is embedded on pages it did not write. The opt-in is the page
   * saying "these are mine and they are about this visitor".
   *
   * Sections are respected. The MYGA page marks its buyer fields
   * `section-buyer` and a second person's `section-joint`; the person asking
   * to be rung is the buyer, so a field belonging to any other section is
   * skipped rather than guessed at. That is the QBP-27 rule read from the
   * other end.
   */
  function readPage() {
    var found = { state: '', firstName: '', lastName: '', email: '' };
    if (!cfg.scanPage || !root.document) return found;

    var TOKENS = {
      firstName: 'given-name', lastName: 'family-name',
      email: 'email', state: 'address-level1'
    };

    for (var key in TOKENS) {
      if (!Object.prototype.hasOwnProperty.call(TOKENS, key)) continue;

      /* A selector the page named explicitly wins: it is there precisely
         because the scan below would not have found the field. */
      var sel = cfg.extra[key];
      if (sel) {
        /* Tried in the order the PAGE listed them, not document order. On the
           MYGA page "#cf-state,#rateState" means "what they told the lead
           form, and failing that what they picked to see rates" — handing
           that whole string to querySelector would silently reverse it, since
           the rate picker sits higher up the document. */
        var parts = sel.split(',');
        for (var j = 0; j < parts.length && !found[key]; j++) {
          var one = parts[j].trim();
          if (!one) continue;
          try {
            var named = root.document.querySelector(one);
            if (named && named.value) found[key] = String(named.value).trim();
          } catch (e) { /* a bad selector is the page's problem, not a crash */ }
        }
      }
      if (found[key]) continue;

      var nodes = root.document.querySelectorAll('[autocomplete~="' + TOKENS[key] + '"]');
      for (var i = 0; i < nodes.length; i++) {
        var ac = String(nodes[i].getAttribute('autocomplete') || '');
        var section = /(^|\s)(section-[^\s]+)/.exec(ac);
        if (section && section[2] !== 'section-buyer') continue;
        if (nodes[i].value) { found[key] = String(nodes[i].value).trim(); break; }
      }
    }

    if (found.state) found.state = found.state.toUpperCase().slice(0, 2);
    return found;
  }

  /**
   * The callback form, shown when they have asked for a human.
   *
   * Unlike the identity prompt, this one is a promise rather than an offer,
   * and the difference shows in what it insists on: a number to ring and a
   * state to be licensed in. The server refuses without either, so asking for
   * them here is not politeness — it is the difference between a callback
   * that reaches somebody who can write the business and one that sits with
   * an agent who cannot.
   *
   * The form STAYS PUT on a rejection. Re-drawing it empty because a phone
   * number was two digits short is how somebody who was willing to give you
   * their details stops being willing.
   *
   * On autofill: the fields carry plain person tokens with no section prefix,
   * the same as the identity prompt, and that is deliberate after QBP-27. The
   * calculator's own fields declare `section-buyer`, so the browser treats
   * these as a separate group and fills them from the visitor's own profile —
   * which is right, because the person asking to be rung is the person at the
   * keyboard, and not necessarily the person the quote was run for.
   */
  function callback(prompt) {
    var box = document.createElement('div');
    box.className = 'qbc-ident qbc-cb';

    var opts = '<option value="">State you live in…</option>';
    for (var i = 0; i < STATES.length; i++) {
      opts += '<option value="' + STATES[i] + '">' + STATES[i] + '</option>';
    }

    box.innerHTML = '<b></b><p></p>'
      + '<div class="qbc-half">'
      + '<input type="text" placeholder="First name" autocomplete="given-name">'
      + '<input type="text" placeholder="Last name" autocomplete="family-name">'
      + '</div>'
      + '<input type="email" placeholder="Email" autocomplete="email">'
      + '<input type="tel" placeholder="Phone" autocomplete="tel">'
      + '<select autocomplete="address-level1">' + opts + '</select>'
      + '<div class="qbc-err" hidden></div>'
      + '<div class="qbc-row"><button type="button" class="qbc-yes"></button>'
      + '<button type="button"></button></div>';

    box.querySelector('b').textContent = prompt.title || '';
    box.querySelector('p').textContent = prompt.body || '';

    var ins = box.querySelectorAll('input');
    var sel = box.querySelector('select');
    var err = box.querySelector('.qbc-err');
    var btns = box.querySelectorAll('button');
    btns[0].textContent = prompt.submit || 'Request a callback';
    btns[1].textContent = prompt.dismiss || 'No thanks';

    /* Whatever the page already knows. A state dropdown the visitor has
       already filled in once on the calculator is the field most likely to be
       abandoned, and asking twice for something on screen is its own answer
       about how much attention was paid. */
    var page = readPage();
    /* An explicit context() call beats the scan: a page that bothered to tell
       us knows something the fields do not. */
    var known = {
      state: state.context.state || page.state,
      firstName: state.context.firstName || page.firstName,
      lastName: state.context.lastName || page.lastName,
      email: state.context.email || page.email
    };
    if (known.state && STATES.indexOf(known.state) >= 0) sel.value = known.state;
    if (known.firstName && !ins[0].value) ins[0].value = known.firstName;
    if (known.lastName && !ins[1].value) ins[1].value = known.lastName;
    if (known.email && !ins[2].value) ins[2].value = known.email;

    btns[0].addEventListener('click', function () {
      err.hidden = true;
      box.setAttribute('aria-busy', 'true');
      ask({
        callback: {
          firstName: ins[0].value, lastName: ins[1].value, email: ins[2].value,
          phone: ins[3].value, state: sel.value
        }
      }).then(function (res) {
        box.removeAttribute('aria-busy');
        if (res && res.callbackTaken) {
          /* Done. The confirmation is already a bubble in the log, so the
             form goes rather than sitting there inviting a second one. */
          if (box.parentNode) box.parentNode.removeChild(box);
          return;
        }
        err.textContent = (res && res.callbackError)
          ? res.callbackError
          : 'That did not go through. Try once more, or call the number at the top of this page.';
        err.hidden = false;
        el.log.scrollTop = el.log.scrollHeight;
      });
    });

    btns[1].addEventListener('click', function () {
      if (box.parentNode) box.parentNode.removeChild(box);
    });

    el.log.appendChild(box);
    el.log.scrollTop = el.log.scrollHeight;
    ins[0].focus();
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
    /* Exported so the phone rules can be asserted rather than eyeballed on a
       handset — see tests/quotebot-chat.test.mjs. */
    css: css,
    PHONE_MAX: PHONE_MAX,
    fitPanel: fitPanel,
    watchViewport: watchViewport,
    wantsAgent: wantsAgent,
    readName: readName,
    GREETING: GREETING,
    EMAIL_ASK: EMAIL_ASK,
    ASK_EMAIL_AFTER: ASK_EMAIL_AFTER,
    STATES: STATES,
    readPage: readPage,
    invitation: invitation,
    DISCLOSURE: DISCLOSURE,
    STALL_MS: STALL_MS,
    RESULTS_MS: RESULTS_MS,
    DISMISS_DAYS: DISMISS_DAYS,
    MAX_CHARS: MAX_CHARS,
    /* A calculator can drive it directly rather than waiting to be noticed. */
    open: function () { open('api'); },
    /**
     * What the page already knows about the visitor — state, and a name or
     * email if the calculator has them.
     *
     * Used for one thing: prefilling the callback form so nobody is asked
     * twice for something already on their screen. It is NOT sent to the
     * server on its own, because a page can call this with anything and a
     * lead built from an unprompted claim is a lead nobody typed.
     */
    context: function (c) {
      if (!c) return;
      if (c.state) state.context.state = String(c.state).trim().toUpperCase().slice(0, 2);
      if (c.firstName) state.context.firstName = String(c.firstName);
      if (c.lastName) state.context.lastName = String(c.lastName);
      if (c.email) state.context.email = String(c.email);
    },
    results: function () { state.resultsAt = Date.now(); },
    captured: function () { state.captured = true; }
  };
}));
