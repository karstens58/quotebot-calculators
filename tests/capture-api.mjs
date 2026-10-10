/**
 * The shipped capture script, loaded, so tests use the real thing.
 *
 * WHY A LOADER AND NOT A STAND-IN. Two prefill tests asserted that a page
 * clears its address bar, against a `history.replaceState` stub that
 * simply blanked the search. They passed for months while the page threw
 * the affiliate's tracking code away with the answers, because a stub that
 * blanks everything agrees with a page that blanks everything.
 *
 * Now the page calls QuoteBot.tidyQuery(), and these tests load the actual
 * implementation. The assertion can be what it should always have been:
 * the answers are gone AND the code is still there.
 *
 * The shim is the smallest thing that lets the script load. readyState is
 * 'loading' so boot() waits for a DOMContentLoaded nothing fires — the
 * attribution read happens at parse time and needs no DOM, which is itself
 * one of the properties under test.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'site');

export const CAPTURE_SRC =
  fs.readFileSync(path.join(SITE, 'js/quotebot-capture.js'), 'utf8');

export function loadCaptureApi(startHref) {
  const store = new Map();
  let href = startHref;

  const win = {
    get location() { return new URL(href); },
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
    history: { replaceState: (_s, _t, to) => { href = new URL(to, href).href; } },
    URL, URLSearchParams, setTimeout, clearTimeout,
    fetch: async () => ({ ok: true }),
    navigator: { sendBeacon: () => true, userAgent: 'node' },
    addEventListener() {}, removeEventListener() {},
    matchMedia: () => ({ matches: false, addEventListener() {} }),
  };
  const doc = {
    readyState: 'loading', referrer: '',
    addEventListener() {}, removeEventListener() {},
    querySelectorAll: () => [], querySelector: () => null,
    getElementById: () => null,
    createElement: () => ({
      setAttribute() {}, style: {}, appendChild() {}, classList: { add() {} },
    }),
    head: { appendChild() {} }, body: { appendChild() {} },
    currentScript: { getAttribute: () => '' },
  };
  win.document = doc;
  win.window = win;

  const fn = new Function('window', 'document', 'history', 'localStorage',
    'navigator', 'location', `${CAPTURE_SRC}\nreturn window.QuoteBot;`);
  const api = fn(win, doc, win.history, win.localStorage, win.navigator, win.location);

  return { api, stored: store, hrefNow: () => href };
}
