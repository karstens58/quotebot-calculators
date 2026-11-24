/*!
 * quotebot-embed-loader.js — the one tag a partner pastes.
 *
 * QBP-633. This is the only file of ours that runs on somebody else's
 * website, and everything about it is shaped by that.
 *
 *   <script src="https://tools.quote-bot.com/js/quotebot-embed-loader.js"
 *           data-code="DOE-TERM"></script>
 *
 * THREE PLACEMENTS, ONE IFRAME.
 *
 *   Inline        the form sits on their page, where the tag is, or in
 *                 whatever element data-target names.
 *   On their own  data-open names a selector. Their existing "Get a
 *   button        quote" button opens the form over the page, and no
 *                 form sits in the layout at all.
 *   The link      a plain <a> inside the tag's own markup. If this script
 *                 is stripped -- which WordPress does to post content for
 *                 anyone below admin, and which plenty of security
 *                 plugins do regardless -- the link is what remains, and
 *                 it goes to the hosted page the partner already has.
 *
 * WHY AN IFRAME AND NOT THEIR DOM. The form collects a date of birth,
 * gender, tobacco use and contact details. Rendered into their page, every
 * script on it can read those: analytics, chat widgets, ad pixels, and
 * session recorders that capture keystrokes by default. We do not control
 * that stack and cannot audit it. Across an origin boundary the browser
 * refuses all of it. It also puts the licence line somewhere no stylesheet
 * of theirs can reach.
 *
 * WHAT THIS FILE WILL NOT DO. It reads nothing from the host page, stores
 * nothing, and sends nothing anywhere. It creates a frame, tells it who is
 * hosting it, and resizes it. A loader that did more would be a script a
 * partner is asked to trust on every page of their site.
 */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof root !== 'undefined' && root) root.QuoteBotEmbedLoader = api;
  if (typeof document !== 'undefined' && document) {
    /* The tag that loaded us, when it carries the settings itself. */
    if (document.currentScript) api.boot(document.currentScript);
    /* And any placeholder on the page, once there is a page. */
    api.mountWhenReady(document);
  }
}(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  var DOC = typeof document !== 'undefined' ? document : null;

  /** Where the form is served from. The frame's origin, and nothing else. */
  var TOOLS = 'https://tools.quote-bot.com';
  var PAGE = '/quotetool.html';

  var HELLO = 'quotebot:hello';
  var READY = 'quotebot:ready';
  var HEIGHT = 'quotebot:height';
  var EXPAND = 'quotebot:expand';
  var COLLAPSE = 'quotebot:collapse';
  var REFUSED = 'quotebot:refused';

  /** Tall enough for the form on a narrow column, until it says otherwise. */
  var FIRST_HEIGHT = 560;

  /**
   * The address of the form, for one tracking code.
   *
   * THE ORIGIN IS FIXED HERE, never taken from the tag. A data-src would
   * let anything that can edit the partner's page point our snippet at a
   * page of its own, wearing our name and collecting the same answers.
   */
  function frameSrc(code) {
    return TOOLS + PAGE + '?embed=1&qb=' + encodeURIComponent(code);
  }

  function styles(el, rules) {
    for (var k in rules) {
      if (Object.prototype.hasOwnProperty.call(rules, k)) {
        el.style.setProperty(k, rules[k]);
      }
    }
  }

  function makeFrame(code, title, d) {
    var frame = (d || DOC).createElement('iframe');
    frame.src = frameSrc(code);
    frame.title = title || 'Life insurance quote';
    frame.setAttribute('loading', 'eager');
    frame.setAttribute('scrolling', 'no');
    frame.setAttribute('allowtransparency', 'true');
    styles(frame, {
      width: '100%',
      border: '0',
      display: 'block',
      height: FIRST_HEIGHT + 'px',
      'color-scheme': 'light',
    });
    return frame;
  }

  /**
   * One embed: a frame, and the conversation with it.
   *
   * EVERY MESSAGE IS CHECKED TWICE -- that it came from our origin, and
   * that it came from THIS frame. The first stops any other site on the
   * page from driving our panel; the second stops one embed on a page
   * with two of them from resizing the other.
   */
  function wire(frame, opts) {
    var options = opts || {};
    /* The window to listen on. Defaults to ours, which is the only answer
       in a browser; named here so a test can drive this without one. */
    var win = options.window || (frame.ownerDocument && frame.ownerDocument.defaultView) || root;
    var open = false;
    var heldOverflow = null;

    /*
     * THE GREETING SAYS WHERE WE PUT IT -- QBP-635.
     *
     * The frame has to tell Back from Close, and only this side knows
     * whether the form has a resting place in the page or only ever
     * appears in front of it. It is a hint about drawing: the frame's
     * permission to draw at all comes from the origin the browser stamps
     * on this message, which we do not write.
     */
    function hello() {
      try {
        frame.contentWindow.postMessage(
          { type: HELLO, placement: options.placement || 'page' }, TOOLS);
      } catch (e) { /* the frame is not there yet */ }
    }

    function expand() {
      if (open) return;
      open = true;
      styles(frame, {
        position: 'fixed', inset: '0', width: '100%', height: '100%',
        'z-index': '2147483000',
      });
      /* The host page must not scroll behind a full-window panel. Their
         own value is kept rather than assumed to be empty: a site with
         its own scroll handling gets it back exactly as it was. */
      try {
        heldOverflow = DOC.documentElement.style.overflow;
        DOC.documentElement.style.overflow = 'hidden';
      } catch (e) { /* not fatal */ }
      if (options.onExpand) options.onExpand();
    }

    /**
     * Back to our resting state, whatever that is here -- QBP-635.
     *
     * ONE MEANING, AND THIS SIDE DECIDES WHAT IT IS. In the page, resting
     * is the panel at content height. From a button, there is no resting
     * state at all and the caller's onCollapse takes the frame away. The
     * frame no longer has to know the difference, which is what let it
     * send "finished" when the visitor had asked to go back.
     */
    function collapse() {
      if (!open) return;
      open = false;
      styles(frame, {
        position: 'static', inset: 'auto', width: '100%',
        height: FIRST_HEIGHT + 'px', 'z-index': 'auto',
      });
      try {
        DOC.documentElement.style.overflow = heldOverflow || '';
      } catch (e) { /* not fatal */ }
      if (options.onCollapse) options.onCollapse();
    }

    function listen(event) {
      if (event.origin !== TOOLS) return;
      try {
        if (event.source !== frame.contentWindow) return;
      } catch (e) {
        return;
      }
      var data = event.data;
      if (!data || typeof data !== 'object') return;

      if (data.type === HEIGHT || data.type === READY || data.type === REFUSED) {
        /* A number, clamped. The frame is ours, but a height arriving as
           a string concatenates into "100px560" and a negative one
           collapses the panel to nothing. */
        var px = Number(data.px);
        if (!open && Number.isFinite(px) && px > 0) {
          frame.style.height = Math.min(Math.max(Math.round(px), 80), 20000) + 'px';
        }
        return;
      }
      if (data.type === EXPAND) expand();
      if (data.type === COLLAPSE) collapse();
    }

    win.addEventListener('message', listen);
    frame.addEventListener('load', hello);

    /*
     * AND A WAY TO STOP LISTENING. The modal placement builds a frame per
     * open and throws it away on close; without this, every open leaves
     * another message handler on the window, each one holding a dead
     * frame. Ten opens is ten listeners deciding they are not the one
     * being spoken to.
     */
    function stop() {
      win.removeEventListener('message', listen);
      frame.removeEventListener('load', hello);
    }
    return {
      hello: hello, expand: expand, collapse: collapse,
      listen: listen, stop: stop,
    };
  }

  /**
   * The modal placement: nothing in the layout until they click.
   *
   * The frame is built on the FIRST click rather than up front, so a
   * partner who puts this on every page of their site is not loading our
   * form on every page of their site.
   */
  function openable(code, title, d) {
    var doc = d || DOC;
    var frame = null;
    var box = null;
    return function openNow(e) {
      if (e && e.preventDefault) e.preventDefault();
      if (frame) return;
      box = doc.createElement('div');
      styles(box, {
        position: 'fixed', inset: '0', 'z-index': '2147482999',
        background: 'rgba(16, 20, 28, 0.55)',
      });
      frame = makeFrame(code, title, doc);
      var wired = wire(frame, {
        window: doc.defaultView || root,
        placement: 'button',
        onCollapse: function () {
          /* Out of the modal placement means GONE, not back to a panel
             nobody asked for -- and the frame goes with it, so the next
             open starts a fresh one rather than reviving a filled form a
             different visitor left behind. */
          if (box && box.parentNode) box.parentNode.removeChild(box);
          if (frame && frame.parentNode) frame.parentNode.removeChild(frame);
          wired.stop();
          frame = null;
          box = null;
        },
      });
      styles(frame, {
        position: 'fixed', inset: '0', width: '100%', height: '100%',
        'z-index': '2147483000',
      });
      doc.body.appendChild(box);
      doc.body.appendChild(frame);
    };
  }

  /**
   * THE OTHER WAY IN: a placeholder element -- QBP-633.
   *
   *   <div data-quotebot-embed data-code="DOE-TERM">
   *     <a href="https://tools.quote-bot.com/quotetool.html?qb=DOE-TERM">
   *       Get a life insurance quote</a>
   *   </div>
   *
   * WRITTEN FOR WORDPRESS AND BETTER EVERYWHERE. WordPress strips a
   * <script> out of post content for anyone below administrator, and
   * plenty of security plugins strip it whatever the role -- so a snippet
   * that IS a script tag is a snippet that silently does nothing for most
   * of the people pasting it. A plugin enqueues the script properly, where
   * nothing strips it, and puts one of these in the content, where a div
   * survives. Page builders are the same story.
   *
   * WHATEVER IS INSIDE IT IS THE FALLBACK. The placeholder holds a plain
   * link to the hosted page, and this empties it before putting the frame
   * in. So a visitor whose browser never ran our script sees the link,
   * and nobody sees both.
   */
  var MOUNTED = 'data-quotebot-mounted';

  function mountAll(d) {
    var doc = d || DOC;
    if (!doc || !doc.querySelectorAll) return 0;
    var found = doc.querySelectorAll('[data-quotebot-embed]');
    var made = 0;
    for (var i = 0; i < found.length; i += 1) {
      var el = found[i];
      /* Marked rather than counted, so a second call -- a page that fires
         DOMContentLoaded after we already ran, a builder that injects
         content later -- does not stack a second frame on the first. */
      if (el.getAttribute(MOUNTED)) continue;
      el.setAttribute(MOUNTED, '1');
      if (boot(el, doc)) made += 1;
    }
    return made;
  }

  function mountWhenReady(d) {
    var doc = d || DOC;
    if (!doc) return;
    if (doc.readyState === 'loading') {
      doc.addEventListener('DOMContentLoaded', function () { mountAll(doc); });
    } else {
      mountAll(doc);
    }
  }

  /** Read a setting off the tag, by either spelling. */
  function attr(tag, names) {
    for (var i = 0; i < names.length; i += 1) {
      var said = tag.getAttribute(names[i]);
      if (said) return said;
    }
    return '';
  }

  function boot(tag, d) {
    var doc = d || DOC;
    if (!doc || !tag) return null;

    var code = attr(tag, ['data-code', 'data-qb', 'data-tracking-code']);
    /*
     * NO CODE, NO FRAME, and nothing said on the page. A snippet pasted
     * without its code is the partner's mistake to find in their own
     * console, and an error box on a stranger's website is ours to
     * explain. The console line is addressed to whoever is editing the
     * page, which is exactly who can fix it.
     */
    if (!code) {
      if (root.console && root.console.warn) {
        root.console.warn('[quotebot] the embed tag has no data-code, so '
          + 'there is nothing to show. Copy the snippet again from your '
          + 'Quote Bot partner portal.');
      }
      return null;
    }

    var title = attr(tag, ['data-title']) || 'Life insurance quote';
    var opener = attr(tag, ['data-open']);

    /*
     * WHERE THE VISITOR REACHES THE FORM FROM -- QBP-636.
     *
     * Three, and the questions are the same in all of them: page, bar,
     * button. Anything else named here falls to the page, which is the
     * one that leaves something useful behind whatever the column turns
     * out to be.
     *
     * `data-open` on its own still means a button, because that is the
     * snippet already in partners' pages and it said exactly that.
     */
    var placement = attr(tag, ['data-placement']).toLowerCase();
    if (placement !== 'bar' && placement !== 'button') {
      placement = opener ? 'button' : 'page';
    }

    /*
     * THE LINK THE SNIPPET SHIPPED WITH. A partner pastes an anchor
     * alongside this tag so that a stripped script leaves something that
     * works. We are running, so it is ours to take away -- otherwise
     * every page carries a stray link under the form.
     */
    var fallback = attr(tag, ['data-fallback']);
    if (fallback) {
      var links = doc.querySelectorAll(fallback);
      for (var i = 0; i < links.length; i += 1) {
        links[i].style.setProperty('display', 'none');
      }
    }

    /* Their button, and nothing of ours in the layout. */
    if (placement === 'button') {
      var openNow = openable(code, title, doc);
      /* The class we hand them, unless they named one of their own. */
      var buttons = doc.querySelectorAll(opener || '.qb-quote');
      for (var b = 0; b < buttons.length; b += 1) {
        buttons[b].addEventListener('click', openNow);
      }
      return { placement: 'button', buttons: buttons.length };
    }

    /*
     * In their layout: the form on the page, or a bar across it. Both
     * mount the same way -- what differs is what the frame draws, and
     * the frame is told which in the greeting.
     *
     * A column too narrow for the form is NOT a placement. The frame
     * measures itself and opens over the page instead, because only it
     * knows how wide it ended up.
     */
    var where = attr(tag, ['data-target']);
    var host = where ? doc.querySelector(where) : null;
    var frame = makeFrame(code, title, doc);
    /* The window that owns this document, rather than whichever global
       this file happens to have been evaluated against. */
    wire(frame, { window: doc.defaultView || root, placement: placement });
    if (host) {
      host.appendChild(frame);
    } else if (tag.getAttribute('data-quotebot-embed') !== null) {
      /* A PLACEHOLDER HOLDS ITS OWN FALLBACK. Whatever is inside it is
         the link somebody sees when this script never runs, so it is
         cleared rather than pushed aside -- the alternative shows the
         visitor a form and a link to the same form. */
      while (tag.firstChild) tag.removeChild(tag.firstChild);
      tag.appendChild(frame);
    } else if (tag.parentNode) {
      tag.parentNode.insertBefore(frame, tag.nextSibling);
    } else {
      doc.body.appendChild(frame);
    }
    return { placement: placement, frame: frame };
  }

  return {
    boot: boot,
    mountAll: mountAll,
    mountWhenReady: mountWhenReady,
    wire: wire,
    frameSrc: frameSrc,
    TOOLS: TOOLS,
    HELLO: HELLO, READY: READY, HEIGHT: HEIGHT,
    EXPAND: EXPAND, COLLAPSE: COLLAPSE, REFUSED: REFUSED,
  };
}));
