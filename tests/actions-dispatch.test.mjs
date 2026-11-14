/**
 * The action dispatcher, exercised rather than read.
 *
 * Every inline handler on this site is being replaced by a data- attribute
 * that this one file turns back into a function call. That makes it the
 * single point of failure for the lot, so it is worth more than a glance.
 *
 * The assertion that matters most is the last one. The short version of this
 * dispatcher would look the function up as window[name], and it would work
 * perfectly -- while handing anything that can write an attribute into the
 * page the ability to call any global function on it. The registry exists to
 * prevent exactly that, and a test that only checks registered actions run
 * would pass just as happily against the unsafe version.
 *
 *   node --test tests/actions-dispatch.test.mjs
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = fs.readFileSync(path.join(ROOT, 'site/js/qb-actions.js'), 'utf8');

/* A DOM small enough to read, faithful in the three ways this file depends
   on: attributes, closest() walking up the tree, and a value property. */
function el(attrs = {}, parent = null) {
  const node = {
    attrs, parent, value: attrs.value,
    getAttribute: (k) => (k in attrs ? attrs[k] : null),
    closest(sel) {
      const want = sel.slice(1, -1);            // '[data-qb-click]' -> name
      for (let n = node; n; n = n.parent) if (want in n.attrs) return n;
      return null;
    },
  };
  return node;
}

/** Load the dispatcher against a fresh fake document; return its handles. */
function boot() {
  const listeners = {};
  const errors = [];
  const ctx = {
    window: {},
    document: { addEventListener: (t, fn) => { (listeners[t] ||= []).push(fn); } },
    console: { error: (...a) => errors.push(a.join(' ')) },
  };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  return {
    errors,
    register: (m) => ctx.window.qbActions.register(m),
    fire: (type, target) => (listeners[type] || []).forEach((fn) => fn({ type, target })),
  };
}

test('a registered action runs, with the element as `this`', () => {
  const d = boot();
  let seenThis = null;
  d.register({ go() { seenThis = this; } });
  const node = el({ 'data-qb-click': 'go' });
  d.fire('click', node);
  assert.equal(seenThis, node);
});

test('arguments keep their JSON types', () => {
  const d = boot();
  let got;
  d.register({ go(...a) { got = a; } });
  d.fire('click', el({ 'data-qb-click': 'go', 'data-qb-click-args': '[3,"3",true,null]' }));
  assert.deepEqual(got, [3, '3', true, null]);
  assert.equal(typeof got[0], 'number', '3 must not arrive as a string');
  assert.equal(typeof got[1], 'string', '"3" must not arrive as a number');
});

test('@el, @event and @value are substituted', () => {
  const d = boot();
  let got;
  d.register({ go(...a) { got = a; } });
  const node = el({ 'data-qb-click': 'go', 'data-qb-click-args': '["@el","@event","@value",7]', value: 'hi' });
  d.fire('click', node);
  assert.equal(got[0], node);
  assert.equal(got[1].type, 'click');
  assert.equal(got[2], 'hi');
  assert.equal(got[3], 7);
});

test('the innermost action wins, so stopPropagation is not needed', () => {
  /* The case this replaces: an Apply button inside a clickable row, where
     both carried a handler and the inner one called stopPropagation. */
  const d = boot();
  const ran = [];
  d.register({ row() { ran.push('row'); }, apply() { ran.push('apply'); } });
  const row = el({ 'data-qb-click': 'row' });
  const button = el({ 'data-qb-click': 'apply' }, row);
  d.fire('click', button);
  assert.deepEqual(ran, ['apply'], 'the row behind the button must not also fire');
});

test('focus and blur are bound to their bubbling counterparts', () => {
  /* focus/blur do not bubble, so a document listener never sees them. */
  const d = boot();
  const ran = [];
  d.register({ f() { ran.push('focus'); }, b() { ran.push('blur'); } });
  d.fire('focusin', el({ 'data-qb-focus': 'f' }));
  d.fire('focusout', el({ 'data-qb-blur': 'b' }));
  assert.deepEqual(ran, ['focus', 'blur']);
});

test('a click on nothing in particular is not an error', () => {
  const d = boot();
  d.fire('click', el({}));
  d.fire('click', { nodeName: 'svg' });          // no closest()
  assert.deepEqual(d.errors, []);
});

test('unreadable args complain instead of throwing', () => {
  const d = boot();
  let ran = false;
  d.register({ go() { ran = true; } });
  d.fire('click', el({ 'data-qb-click': 'go', 'data-qb-click-args': '[1,' }));
  assert.equal(ran, false, 'a half-written args list must not call the action');
  assert.match(d.errors.join(''), /unreadable args/);
});

test('an unregistered name does nothing, loudly', () => {
  const d = boot();
  d.fire('click', el({ 'data-qb-click': 'nope' }));
  assert.match(d.errors.join(''), /no registered action named "nope"/);
});

test('THE REGISTRY IS AN ALLOWLIST, not a lookup of whatever exists', () => {
  /*
   * The whole security case for this file. A global function that was never
   * registered must be unreachable from an attribute -- otherwise anything
   * able to inject markup could call it, and removing the inline handlers
   * would have bought nothing.
   *
   * This fails against a dispatcher written as window[name](), which is the
   * obvious shortcut and the reason this test exists.
   */
  const listeners = {};
  const ctx = {
    window: {},
    document: { addEventListener: (t, fn) => { (listeners[t] ||= []).push(fn); } },
    console: { error() {} },
  };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);

  let reached = false;
  ctx.window.dangerous = () => { reached = true; };     // a global, never registered
  (listeners.click || []).forEach((fn) => fn({ type: 'click', target: el({ 'data-qb-click': 'dangerous' }) }));
  assert.equal(reached, false,
    'an unregistered global was callable from an attribute — the dispatcher is a lookup, not an allowlist');
});

test('the source does not reach into window by name', () => {
  /* Belt and braces: the behaviour above, asserted against the text too, so
     a refactor that reintroduces the shortcut is caught even if it is
     arranged so the test above passes. */
  const code = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(code, /window\s*\[/, 'the dispatcher indexes window by name');
});
