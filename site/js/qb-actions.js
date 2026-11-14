/*
 * One delegated dispatcher, replacing the inline event-handler attributes
 * these pages were built with.
 *
 * WHY NOT window[name]
 * --------------------
 * The short version of this file would read the attribute and call
 * window[thatName](). It would be a third the size and it would quietly give
 * back most of what removing the handlers buys: anything able to get an
 * attribute into the page could then call ANY global function, with arguments
 * of its choosing. That is not arbitrary code -- but it is a door, and the
 * whole point of the exercise is closing doors.
 *
 * So actions are registered explicitly. A name that was not registered does
 * nothing but complain. The registry is the allowlist.
 *
 * WHY DELEGATION
 * --------------
 * Some of this markup is built at render time and written in with innerHTML.
 * A Content-Security-Policy blocks an inline handler attribute however the
 * element reached the DOM, so those need converting too -- and an element
 * that does not exist yet cannot be bound directly. One listener on the
 * document covers markup that has not been written yet.
 *
 * WHAT closest() BUYS
 * -------------------
 * Two handlers here called event.stopPropagation() to stop a click on an
 * Apply button also triggering the row behind it. closest() finds the NEAREST
 * element carrying an action, so the inner one runs and the outer one does
 * not, without anything having to stop the event. Those calls are gone rather
 * than translated.
 *
 * WHY focusin/focusout
 * --------------------
 * focus and blur do not bubble, so a listener on the document never sees
 * them. Their bubbling counterparts do. This is the sort of thing that fails
 * silently and ships.
 *
 * ARGUMENTS
 * ---------
 * data-qb-click="fnName" names the action. data-qb-click-args, when present,
 * is a JSON array of its arguments. Three strings are substituted:
 *
 *   "@el"     the element carrying the attribute   (was `this`)
 *   "@event"  the event object                     (was `event`)
 *   "@value"  that element's current value         (was `this.value`)
 *
 * JSON rather than a looser format so that 3 stays a number and "3" stays a
 * string, which is what the handlers these replace relied on.
 */
(function () {
  'use strict';

  var REG = Object.create(null);

  /* Called by each page's own script with the functions that page offers.
     Later registrations win, so a page can override a shared action. */
  function register(map) {
    if (!map) return;
    for (var k in map) {
      if (Object.prototype.hasOwnProperty.call(map, k)) REG[k] = map[k];
    }
  }

  function run(e, attr) {
    var start = e.target;
    if (!start || !start.closest) return;
    var el = start.closest('[' + attr + ']');
    if (!el) return;

    var name = el.getAttribute(attr);
    var fn = REG[name];
    if (typeof fn !== 'function') {
      /* Loud on purpose. The failure this replaces -- a handler naming a
         function that does not exist -- was silent, and stayed that way on
         one page for months. */
      console.error('[quote-bot] no registered action named "' + name + '"', el);
      return;
    }

    var args = [];
    var raw = el.getAttribute(attr + '-args');
    if (raw) {
      try {
        args = JSON.parse(raw);
      } catch (err) {
        console.error('[quote-bot] action "' + name + '" has unreadable args: ' + raw, el);
        return;
      }
      if (!Array.isArray(args)) args = [args];
      for (var i = 0; i < args.length; i++) {
        if (args[i] === '@el') args[i] = el;
        else if (args[i] === '@event') args[i] = e;
        else if (args[i] === '@value') args[i] = el.value;
      }
    }

    /* `this` is the element, because that is what it was inside the attribute
       these replace, and some of these functions read it. */
    fn.apply(el, args);
  }

  function on(type, attr) {
    document.addEventListener(type, function (e) { run(e, attr); });
  }

  on('click', 'data-qb-click');
  on('change', 'data-qb-change');
  on('input', 'data-qb-input');
  on('focusin', 'data-qb-focus');
  on('focusout', 'data-qb-blur');

  window.qbActions = { register: register };
}());
