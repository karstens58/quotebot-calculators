/**
 * A carrier logo that does not load — QBP-369.
 *
 * The row used to decide once: a logo address meant an <img>, no address
 * meant the initials block, and it never looked again. An address that was
 * present but did not resolve produced a broken <img>, and what the visitor
 * saw was then up to their browser. Scott saw Chrome's torn-page icon in one
 * browser and the alt text clipped to 58 pixels in another, on the same row,
 * and read it as a sizing fault.
 *
 * It was never a sizing fault — the box is 58x26 with object-fit: contain,
 * so any shape fits and nothing can crop. It was a broken image.
 *
 *   node --test tests/a-logo-that-fails-looks-deliberate.test.mjs
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const PAGE = readFileSync(new URL('../site/mygacalculator.html', import.meta.url), 'utf8');
const css = (sel) => {
  const re = new RegExp(`^\\${sel}\\s*\\{([^}]*)\\}`, 'm');
  const m = re.exec(PAGE);
  assert.ok(m, `${sel} is gone from the stylesheet`);
  return m[1];
};
const fnBody = (name) => {
  const at = PAGE.indexOf(`function ${name}(`);
  assert.notEqual(at, -1, `${name}() is gone`);
  const open = PAGE.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < PAGE.length; i += 1) {
    if (PAGE[i] === '{') depth += 1;
    else if (PAGE[i] === '}') { depth -= 1; if (!depth) return PAGE.slice(open, i + 1); }
  }
  throw new Error(`no end to ${name}()`);
};

test('THE IMAGE CARRIES WHAT IT WOULD FALL BACK TO', () => {
  /* The swap happens long after the row was built, so the data has to travel
     on the element rather than be looked up again from a closure that is
     gone. */
  const row = PAGE.slice(PAGE.indexOf('carrier-logo-img"><img'), PAGE.indexOf('carrier-logo-img"><img') + 300);
  assert.match(row, /data-initials=/, 'the image does not carry its initials');
  assert.match(row, /data-color=/, 'the image does not carry its colour');
});

test('and its alt is empty, because the carrier name is already in text', () => {
  /*
   * Decorative. An empty alt means a screen reader does not read the carrier
   * twice — and a failed image shows nothing rather than a flash of clipped
   * text, which is what Scott was looking at.
   */
  const row = PAGE.slice(PAGE.indexOf('carrier-logo-img"><img'), PAGE.indexOf('carrier-logo-img"><img') + 300);
  assert.match(row, /alt=""/, 'the logo still has descriptive alt text');
});

test('the attributes are escaped, because a carrier name is data', () => {
  const body = fnBody('wireLogoFallbacks');
  assert.ok(body, 'wireLogoFallbacks is gone');
  assert.match(PAGE, /function escAttr\(/, 'there is no attribute escaper');
  const row = PAGE.slice(PAGE.indexOf('carrier-logo-img"><img'), PAGE.indexOf('carrier-logo-img"><img') + 300);
  assert.match(row, /escAttr\(meta\.initials\)/);
  assert.match(row, /escAttr\(meta\.color\)/);
});

test('THE SWAP IS WIRED AFTER THE ROWS ARE IN THE DOM', () => {
  const body = fnBody('renderCompareList');
  const inject = body.indexOf("innerHTML = html");
  const wire = body.indexOf('wireLogoFallbacks(');
  assert.ok(inject > 0, 'the rows are no longer injected as html');
  assert.ok(wire > inject, 'the fallback is wired before the rows exist');
});

test('AN IMAGE THAT ALREADY FAILED IS CAUGHT TOO', () => {
  /*
   * The common case rather than the edge one: a cached 404 resolves before
   * the handler is attached, so waiting only for an 'error' event would miss
   * every repeat visit. complete && !naturalWidth is the only way to ask.
   */
  const body = fnBody('wireLogoFallbacks');
  assert.match(body, /\.complete\s*&&\s*!\s*\w+\.naturalWidth/,
    'only live failures are handled — a cached one stays broken');
  assert.match(body, /addEventListener\('error'/, 'live failures are not handled');
});

test('the swap puts back the same block the no-logo path draws', () => {
  const body = fnBody('wireLogoFallbacks');
  assert.match(body, /className\s*=\s*'carrier-logo'/,
    'the fallback is some other element, so the two paths can diverge');
  assert.match(body, /textContent\s*=/,
    'the initials are written as markup rather than as text');
});

test('AND THE FALLBACK HAS THE SAME FOOTPRINT AS A LOGO', () => {
  /*
   * A 28px circle beside 58px logo boxes left the carrier names on different
   * left edges, so a row with no logo read as a row that had gone wrong.
   * Consistency was the whole of what Scott asked for.
   */
  const box = css('.carrier-logo-img');
  const fallback = css('.carrier-logo');
  const width = (t) => /width:\s*([0-9]+)px/.exec(t)?.[1];
  const height = (t) => /height:\s*([0-9]+)px/.exec(t)?.[1];
  assert.equal(width(fallback), width(box), 'the fallback is a different width from a logo');
  assert.equal(height(fallback), height(box), 'the fallback is a different height from a logo');
});

test('a logo of any shape still fits its box without cropping', () => {
  /* The property that made "it renders wrong" a wrong diagnosis. Sagicor's
     is 887x290; the hardcoded ones are not. */
  const img = css('.carrier-logo-img img');
  assert.match(img, /object-fit:\s*contain/, 'a logo can now be cropped by its box');
  assert.match(img, /width:\s*100%/);
  assert.match(img, /height:\s*100%/);
});
