/*!
 * quotebot-embed.js — the quote tool, running inside a partner's website.
 *
 * QBP-633. Loaded by every copy of quotetool.html and does NOTHING unless
 * the page was opened with ?embed=1, which is how one page serves both the
 * tool at tools.quote-bot.com and the panel on a partner's site. A separate
 * embed page would be a second copy of a thousand lines of form, and the
 * two would drift -- a field added to one and not the other is a field
 * quietly no longer asked of half the people who quote.
 *
 * THREE JOBS.
 *
 *   The gate. Nothing is drawn until quotebot-embed-guard.js says the site
 *   framing us is one the partner registered. The guard reads the origin
 *   the BROWSER stamped on the host's greeting, never one the host claims,
 *   and that stamp is the whole security argument -- see its own header.
 *
 *   The geometry. The host's loader cannot see inside this document, so it
 *   is told: how tall to be, when to take the whole window, and when to
 *   give it back.
 *
 *   The modal. Results come back and take the viewport, which here means
 *   the host's window, because the iframe was told to fill it first.
 *
 * NOTHING IS POSTED TO '*'. Every message goes to the one origin the guard
 * confirmed. A message addressed to any origin is a message readable by
 * whatever ends up framing us next, and the contents of this page are a
 * person's quote.
 */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof root !== 'undefined' && root) root.QuoteBotEmbed = api;
  if (typeof document !== 'undefined' && document && document.documentElement) {
    api.boot();
  }
}(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  var DOC = typeof document !== 'undefined' ? document : null;

  /** Messages out. The host's loader knows these names. */
  var READY = 'quotebot:ready';
  var HEIGHT = 'quotebot:height';
  var EXPAND = 'quotebot:expand';
  var COLLAPSE = 'quotebot:collapse';
  var REFUSED = 'quotebot:refused';

  /** Where the partner manages the sites they have registered. */
  var PORTAL = 'https://partners.quote-bot.com/app/links';

  var hostOrigin = null;

  /**
   * Where the host put us, as the loader said in its greeting -- QBP-635.
   *
   * 'page' means the form has a resting place in their layout, so there is
   * nothing to dismiss: the only way out of the prices is back to the form,
   * which is also back to our resting size.
   *
   * 'bar' and 'button' mean the form is only ever in front of their page.
   * Then Back and Close are different things -- back to the form, or out
   * altogether -- and one control doing both is the bug this exists to fix:
   * a visitor who pressed "Back to the form" lost the form.
   *
   * A HINT, NOT A PERMISSION. It arrives in the body of a message, which a
   * hostile host writes. The worst it can do is put the wrong control on
   * our own page; the gate is the stamped origin and has not moved.
   */
  var placement = 'page';
  function restsOverTheirPage() {
    return placement === 'button' || placement === 'bar';
  }

  function guard() {
    return root && root.QuoteBotEmbedGuard;
  }

  /** Is this page being asked to run as an embed at all? */
  function wanted() {
    try {
      return new URLSearchParams(root.location.search).get('embed') === '1';
    } catch (e) {
      return false;
    }
  }

  /** The tracking code this embed belongs to. */
  function code() {
    try {
      var q = new URLSearchParams(root.location.search);
      return q.get('qb') || q.get('ref') || q.get('aff') || '';
    } catch (e) {
      return '';
    }
  }

  /**
   * Where to ask. Read off this script's own tag, like every other script
   * in this repo, so one file serves every environment.
   */
  function endpoint() {
    var el = DOC && DOC.currentScript;
    if (!el) {
      el = DOC && DOC.querySelector('script[src*="quotebot-embed.js"]');
    }
    var said = el && el.getAttribute('data-endpoint');
    return said || 'https://api.quote-bot.com/lead/';
  }

  function send(type, extra) {
    if (!hostOrigin) return;
    var body = { type: type };
    if (extra) {
      for (var k in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, k)) body[k] = extra[k];
      }
    }
    try {
      root.parent.postMessage(body, hostOrigin);
    } catch (e) { /* the frame went away mid-send */ }
  }

  /**
   * How tall the host should make us.
   *
   * MEASURED FROM THE CONTENT, not from the window: the window is whatever
   * height the host last gave us, so reading it back would make the frame
   * keep whatever size it already had. scrollHeight of the body is what
   * the form actually needs.
   */
  function height() {
    if (!DOC || !DOC.body) return 0;
    return Math.ceil(Math.max(
      DOC.body.scrollHeight,
      DOC.documentElement ? DOC.documentElement.scrollHeight : 0));
  }

  var lastSent = 0;
  function reportHeight() {
    /* Only when it actually moved, and never while the modal is open --
       then the frame is the whole viewport and a content height would
       shrink it back mid-scroll. */
    if (DOC.documentElement.classList.contains('qb-embed-open')) return;
    var now = height();
    if (!now || Math.abs(now - lastSent) < 2) return;
    lastSent = now;
    send(HEIGHT, { px: now });
  }

  function watchHeight() {
    if (typeof ResizeObserver === 'function') {
      try {
        new ResizeObserver(reportHeight).observe(DOC.body);
        return;
      } catch (e) { /* fall through to the interval */ }
    }
    /* A slow poll rather than nothing. A form whose height never reaches
       the host clips its own last field, which is worse than a timer. */
    setInterval(reportHeight, 500);
  }

  /** Open the results over the host page, and the way back. */
  function openResults() {
    if (DOC.documentElement.classList.contains('qb-embed-open')) return;
    DOC.documentElement.classList.add('qb-embed-open');
    send(EXPAND);
    try { root.scrollTo(0, 0); } catch (e) { /* not fatal */ }
  }

  /**
   * Back to the form.
   *
   * The results are hidden either way. The frame only moves when the form
   * has somewhere to go back TO in their page -- otherwise it stays exactly
   * where it is, showing the form the visitor already filled in.
   */
  function backToForm() {
    DOC.documentElement.classList.remove('qb-embed-open');
    if (restsOverTheirPage()) {
      /* Still in front of their page, now showing the form. Nothing to
         tell the host: its frame is already the size it should be. */
      return;
    }
    send(COLLAPSE);
    lastSent = 0;
    reportHeight();
  }

  /** Out altogether. Only reachable where there is no form in their page. */
  function dismiss() {
    DOC.documentElement.classList.remove('qb-embed-open');
    send(COLLAPSE);
  }

  /**
   * Watch for the results arriving.
   *
   * quotetool.js adds `show` to #resultsContent when prices are on screen
   * -- one line, in one place, and the only signal that does not depend on
   * guessing at how long an engine call takes. Watched rather than hooked,
   * because this file must not reach into that one: a page that works at
   * tools.quote-bot.com and breaks when embedded is the failure nobody
   * sees until a partner reports it.
   */
  function watchResults() {
    var panel = DOC.getElementById('resultsContent');
    if (!panel || typeof MutationObserver !== 'function') return;
    new MutationObserver(function () {
      if (panel.classList.contains('show')) openResults();
    }).observe(panel, { attributes: true, attributeFilter: ['class'] });
  }

  /**
   * The way out of the prices, which is two ways when we are in front of
   * their page -- QBP-635.
   *
   * Back always means back to the form. Where we rest in their layout that
   * is also a return to our resting size, so it collapses; where we rest in
   * front of their page it is a change of view and the frame does not move.
   * Close exists only in the second case, because in the first there is
   * nothing to close -- the form is part of their page.
   */
  function addControls() {
    var back = DOC.createElement('button');
    back.type = 'button';
    back.className = 'qb-embed-back';
    back.textContent = 'Back to the form';
    back.addEventListener('click', backToForm);
    DOC.body.appendChild(back);

    if (!restsOverTheirPage()) return;
    var close = DOC.createElement('button');
    close.type = 'button';
    close.className = 'qb-embed-close';
    close.setAttribute('aria-label', 'Close');
    close.textContent = '\u00d7';
    close.addEventListener('click', dismiss);
    DOC.body.appendChild(close);
  }

  /** Let the page be seen. */
  function reveal() {
    DOC.documentElement.classList.remove('qb-embed-waiting');
  }

  /**
   * What an unregistered site is shown.
   *
   * Scott, 23 November: say plainly that the site is not registered, with
   * a link to the portal. The partner who pasted the snippet on a domain
   * they have not added is overwhelmingly the person reading this, and a
   * vague message costs them a phone call. It does confirm to somebody who
   * copied a code that the code is real, which is the trade he made
   * knowingly.
   *
   * BUILT WITH textContent, never innerHTML with the origin in it. The
   * origin came from another website, and the one place it is shown is
   * the one place it would be injected.
   */
  function refuse(why) {
    reveal();
    var box = DOC.createElement('div');
    box.className = 'qb-embed-refusal';

    var head = DOC.createElement('h2');
    head.textContent = why === 'no-greeting'
      ? 'This form could not start'
      : 'This site is not registered for this Quote Bot form';
    box.appendChild(head);

    var said = DOC.createElement('p');
    said.textContent = why === 'no-greeting'
      ? 'The Quote Bot script did not load on this page, so the form cannot '
        + 'confirm where it is. Check that the embed snippet is on the page '
        + 'in full.'
      : 'Add this website in your Quote Bot partner portal and the form will '
        + 'appear here.';
    box.appendChild(said);

    if (why !== 'no-greeting' && hostOrigin) {
      var which = DOC.createElement('p');
      var lead = DOC.createTextNode('This page is on ');
      var where = DOC.createElement('code');
      where.textContent = hostOrigin;
      which.appendChild(lead);
      which.appendChild(where);
      which.appendChild(DOC.createTextNode('.'));
      box.appendChild(which);
    }

    var link = DOC.createElement('p');
    var a = DOC.createElement('a');
    a.href = PORTAL;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = 'Open your partner portal';
    link.appendChild(a);
    box.appendChild(link);

    DOC.body.replaceChildren(box);
    /* The host is told, so a loader can collapse the frame to the box
       rather than leaving a tall empty panel on somebody's page. */
    send(REFUSED, { why: why });
    lastSent = 0;
    reportHeight();
  }

  function start() {
    reveal();
    /* Marked once, so the stylesheet can draw the way out wherever we are
       in front of their page rather than only over the prices. */
    if (restsOverTheirPage()) {
      DOC.documentElement.classList.add('qb-embed-overlay');
    }
    addControls();
    watchResults();
    watchHeight();
    send(READY, { px: height() });
    reportHeight();
  }

  function whenReady(run) {
    if (DOC.readyState === 'loading') {
      DOC.addEventListener('DOMContentLoaded', run);
    } else {
      run();
    }
  }

  function boot() {
    if (!DOC || !wanted()) return;

    /*
     * MARKED BEFORE THE BODY EXISTS. This script is in the head, and the
     * waiting class is what keeps an unregistered site from seeing the
     * whole form for as long as the verdict takes. A reveal that happens
     * after paint is not a gate, it is a flicker.
     */
    DOC.documentElement.classList.add('qb-embed', 'qb-embed-waiting');

    var g = guard();
    /*
     * NO GUARD, NO FORM. If the file is missing or failed to load there is
     * nothing to decide whether this site may draw it, and the safe answer
     * to "I cannot tell" is no.
     */
    if (!g) {
      whenReady(function () { refuse('no-guard'); });
      return;
    }

    /* Not framed: our own page on our own domain, which is what a
       partner's hosted link already is. It draws. */
    if (!g.isFramed(root)) {
      whenReady(function () {
        DOC.documentElement.classList.remove('qb-embed-waiting');
      });
      return;
    }

    var asked = code();
    var where = endpoint();

    g.waitForHost({
      window: root,
      ask: function (origin) {
        hostOrigin = origin;
        return fetch(g.verdictUrl(where, asked, origin), {
          method: 'GET', credentials: 'omit',
        }).then(function (res) { return res.json(); });
      },
      onAllowed: function (_origin, said) {
        /* Strictly one of the three we draw for. A host that sends
           anything else gets the resting-in-their-page behaviour, which
           is the one that cannot strand a visitor. */
        var told = String((said && said.placement) || '');
        if (told === 'button' || told === 'bar') placement = told;
        whenReady(start);
      },
      onRefused: function (why) { whenReady(function () { refuse(why); }); },
    });
  }

  return {
    boot: boot,
    /* For the tests, which drive these without a browser. */
    _placement: function () { return placement; },
    _restsOverTheirPage: restsOverTheirPage,
    READY: READY, HEIGHT: HEIGHT, EXPAND: EXPAND,
    COLLAPSE: COLLAPSE, REFUSED: REFUSED,
    PORTAL: PORTAL,
    /* For the tests, which drive this without a browser. */
    _height: height,
    _refuse: refuse,
  };
}));
