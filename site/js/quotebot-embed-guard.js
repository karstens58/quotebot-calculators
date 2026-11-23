/*!
 * quotebot-embed-guard.js — may this page draw where it has been put?
 *
 * QBP-633. The quote form can be embedded on a partner's website. This
 * decides whether the copy now loading is allowed to draw there, and it is
 * the whole of that decision: nothing else on the embed page renders a
 * field until this has said yes.
 *
 * THE BROWSER ANSWERS THE QUESTION, NOT THE PAGE ASKING IT.
 *
 * A site that frames us can write its own loader and say anything it likes
 * in a message -- including that it is somebody else's domain. So the
 * origin in the MESSAGE BODY is never read. What is read is the origin the
 * browser stamps on the message event itself, which the sender does not
 * write and cannot forge. That stamp is the entire security argument, and
 * every rule below exists to keep anything else from standing in for it.
 *
 * WHY THIS IS AS STRONG AS A frame-ancestors HEADER. The thing being
 * protected is the form drawing and collecting a date of birth, which is
 * itself something this script does. A check performed by the same script
 * sits at the same layer as the asset it guards, so there is no gap
 * between them for anybody to work in. A header refuses before any of our
 * code runs, which saves a brief flash of a form that then disappears --
 * worth having later as a second lock, and not worth bending the
 * architecture around, because the page stays a flat file this way.
 *
 * NOT FRAMED IS NOT A REFUSAL. Somebody opening the embed address directly
 * is looking at our own domain showing our own public quote form, which is
 * exactly what a partner's hosted link already is. It draws.
 *
 * THE LIST NEVER COMES DOWN THE WIRE. This sends the tracking code and the
 * stamped origin and is told yes or no. Fetching a partner's registered
 * websites in order to compare them here would hand that list to anybody
 * who asked, and it is their business, not ours to publish.
 */
(function (root, factory) {
  var api = factory(root);
  /* Exported for the test harness; the browser gets the namespace. */
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof root !== 'undefined' && root) root.QuoteBotEmbedGuard = api;
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** What the host says to announce itself, and what we answer with. */
  var HELLO = 'quotebot:hello';
  var READY = 'quotebot:ready';
  var REFUSED = 'quotebot:refused';

  /**
   * How long we wait for the host to say hello before giving up.
   *
   * A HOSTILE SITE SIMPLY NEVER GREETS US, so this timeout is a real part
   * of the gate rather than a nicety: without it, a page that stays silent
   * leaves the form sitting in a permanent loading state, which is at
   * least honest but tells a legitimate partner nothing when they have
   * pasted the snippet wrong.
   *
   * Long enough for a slow script on a slow connection to run, short
   * enough that a partner testing their page learns something before they
   * refresh.
   */
  var GREETING_MS = 8000;

  /**
   * Is this document inside somebody else's page?
   *
   * THE TRY/CATCH IS THE POINT. Reading `window.parent` across origins is
   * allowed, but enough embedded webviews and privacy modes make these
   * properties throw that an exception has to mean something, and the only
   * safe meaning is "yes, framed" -- the alternative is a throw being read
   * as "not framed" and the gate opening for everybody.
   */
  function isFramed(win) {
    try {
      return !!win && win.parent !== win;
    } catch (e) {
      return true;
    }
  }

  /**
   * An https origin, normalised the same way the server stores one.
   *
   * MUST AGREE WITH shared/embedorigins.ts in the backend. Two different
   * ideas of what "the same site" means is how a partner registers their
   * website and the form refuses to draw on it.
   */
  function originOf(value) {
    var raw = String(value == null ? '' : value).trim();
    if (!raw) return null;
    var url;
    try { url = new URL(raw); } catch (e) { return null; }
    if (url.protocol !== 'https:') return null;
    if (url.username || url.password) return null;
    var host = String(url.hostname || '').toLowerCase();
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(host)) {
      return null;
    }
    var port = url.port && url.port !== '443' ? ':' + url.port : '';
    return 'https://' + host + port;
  }

  /**
   * The origin of the page hosting us, read off a greeting, or null.
   *
   * THREE THINGS ARE CHECKED AND ONE IS DELIBERATELY NOT.
   *
   * Checked: that the message came from the window that actually frames
   * us, so a popup we opened or some other frame on the page cannot greet
   * us on the host's behalf; that it is a greeting rather than any other
   * message; and that the stamped origin is an https origin we can
   * normalise.
   *
   * Not checked, and never read: anything in the body claiming to be an
   * origin. A site that frames us writes the body. It does not write
   * `event.origin`.
   *
   * 'null' IS A REAL VALUE AND NOT A MISTAKE. A sandboxed frame, a
   * document opened from a file, and a few redirect shapes all arrive
   * with the literal string null as their origin. originOf refuses it
   * along with everything else that is not an https site, which is the
   * answer we want: an opaque origin is nobody's registered website.
   */
  function hostOriginOf(event, win) {
    if (!event || typeof event !== 'object') return null;
    var data = event.data;
    if (!data || typeof data !== 'object') return null;
    if (data.type !== HELLO) return null;
    try {
      if (!win || event.source !== win.parent) return null;
    } catch (e) {
      return null;
    }
    return originOf(event.origin);
  }

  /**
   * Did the server say yes?
   *
   * STRICTLY TRUE. An answer that arrived as a string, a 1, or an error
   * body with no verdict in it at all must read as no -- a truthy test
   * here would turn every shape of failure into permission.
   */
  function mayDraw(answer) {
    /* Wrapped, so the answer is a boolean rather than whatever the
       last term happened to be -- an absent `embed` made this return
       undefined, which is falsy and reads correctly in an if and
       wrongly everywhere a verdict is compared or logged. */
    return !!(answer && answer.embed && answer.embed.allowed === true);
  }

  /**
   * Where the verdict is asked for.
   *
   * The code and the origin both go over as query values, and both are
   * encoded: a tracking code is somebody's text, and an origin arrived
   * from another website.
   */
  function verdictUrl(endpoint, code, origin) {
    return String(endpoint || '').replace(/\/$/, '')
      + '/brand?qb=' + encodeURIComponent(String(code || ''))
      + '&embedOrigin=' + encodeURIComponent(String(origin || ''));
  }

  /**
   * Wait for the host, check it, and report.
   *
   * Returns a function that stops listening, so a page that is torn down
   * mid-handshake leaves nothing behind.
   *
   * ONE ANSWER, WHICHEVER ARRIVES FIRST. The greeting, the timeout and a
   * failed check all end the handshake, and `settled` is what stops a late
   * greeting from reopening a decision already made -- a second yes after
   * a no would draw the form on a page we had just refused.
   */
  function waitForHost(options) {
    var opts = options || {};
    var win = opts.window;
    var ask = opts.ask;
    var onAllowed = opts.onAllowed || function () {};
    var onRefused = opts.onRefused || function () {};
    var wait = typeof opts.timeoutMs === 'number' ? opts.timeoutMs : GREETING_MS;
    var settled = false;
    var timer = null;

    function stop() {
      if (timer !== null) { clearTimeout(timer); timer = null; }
      try { win.removeEventListener('message', listen); } catch (e) { /* gone */ }
    }

    function settle(ok, why, origin) {
      if (settled) return;
      settled = true;
      stop();
      if (ok) onAllowed(origin); else onRefused(why);
    }

    function listen(event) {
      if (settled) return;
      var origin = hostOriginOf(event, win);
      if (!origin) return;
      /* The greeting is answered only after the server agrees, so a site
         that is not registered never even learns that it reached us. */
      Promise.resolve()
        .then(function () { return ask(origin); })
        .then(function (answer) {
          if (mayDraw(answer)) settle(true, null, origin);
          else settle(false, 'not-registered', origin);
        })
        .catch(function () { settle(false, 'unreachable', origin); });
    }

    win.addEventListener('message', listen);
    if (wait > 0) {
      timer = setTimeout(function () { settle(false, 'no-greeting', null); }, wait);
    }
    return stop;
  }

  return {
    HELLO: HELLO,
    READY: READY,
    REFUSED: REFUSED,
    GREETING_MS: GREETING_MS,
    isFramed: isFramed,
    originOf: originOf,
    hostOriginOf: hostOriginOf,
    mayDraw: mayDraw,
    verdictUrl: verdictUrl,
    waitForHost: waitForHost,
  };
}));
