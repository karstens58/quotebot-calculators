/**
 * No page may link to a host we do not serve.
 *
 *   node --test tests/links-go-somewhere.test.mjs
 *
 * WHY THIS EXISTS. Thirteen buttons across nine calculators pointed at
 * app.quotebot.io, a host that does not exist. They were the Apply Now in
 * every rate card and the "Help Me With My Plan" band at the foot of the
 * page -- the highest-intent click on the whole site, and the one nobody who
 * works here ever presses, because we already know what the tools say. So it
 * could be dead indefinitely with nothing to catch it: the pages render, the
 * tests pass, the deploy is green, and the only person who finds out is the
 * one who wanted to buy something.
 *
 * A link checker that fetches is the wrong instrument -- it needs the network
 * in CI, it goes red when somebody else's site has a bad morning, and a
 * flaky gate gets switched off. This asks a narrower question with a certain
 * answer: is the host one we have decided to point at? A typo, a dead
 * internal host and a copy-paste from a half-built app all fail it; a
 * legitimate new destination fails it exactly once, until somebody adds it
 * here on purpose.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

const SITE = path.join(import.meta.dirname, '..', 'site');
const PAGES = fs.readdirSync(SITE).filter((f) => f.endsWith('.html'));

/**
 * Hosts a page is allowed to name. Everything here is either ours, a CDN the
 * pages load from, or a social profile the footer links to.
 *
 * `main.d32nxpxr4k5tgh.amplifyapp.com` is the marketing site's Amplify build
 * and is deliberately temporary -- apply-chrome.mjs carries the note about
 * swapping it for quote-bot.com at the DNS cutover. It is listed rather than
 * patterned so that the cutover changes this file too, which is the point.
 */
const ALLOWED = new Set([
  'quotebot.io', 'tools.quotebot.io',
  'quote-bot.com', 'www.quote-bot.com',
  'main.d32nxpxr4k5tgh.amplifyapp.com',
  'fonts.googleapis.com', 'fonts.gstatic.com', 'cdnjs.cloudflare.com',
  'www.facebook.com', 'www.instagram.com', 'www.linkedin.com',
  'www.youtube.com', 'x.com',
]);

/** Every absolute http(s) host named by a src or href, with its page. */
function hostsIn(file) {
  const src = fs.readFileSync(path.join(SITE, file), 'utf8');
  const out = [];
  const re = /(?:src|href)="(https?:\/\/[^"]+)"/gi;
  let m;
  while ((m = re.exec(src))) {
    try { out.push(new URL(m[1]).host); } catch { out.push(m[1]); }
  }
  return out;
}

test('EVERY ABSOLUTE LINK NAMES A HOST WE SERVE', () => {
  const bad = [];
  for (const page of PAGES) {
    for (const host of new Set(hostsIn(page))) {
      if (!ALLOWED.has(host)) bad.push(`${page} -> ${host}`);
    }
  }
  assert.deepEqual(bad, [],
    'these point somewhere we have not decided to point:\n  ' + bad.join('\n  '));
});

test('and app.quotebot.io in particular is gone and stays gone', () => {
  /*
   * Named on its own because it is the one that actually happened, and
   * because it reads like a real host -- which is why thirteen of them
   * survived review. A future copy-paste from the same source is caught by
   * the test above; this one says why out loud.
   */
  for (const page of PAGES) {
    const src = fs.readFileSync(path.join(SITE, page), 'utf8');
    assert.ok(!/app\.quotebot\.io/.test(src),
      `${page} points at app.quotebot.io, which does not exist`);
  }
});

test('the highest-intent buttons open something rather than going somewhere', () => {
  /*
   * The regression this pair is really guarding. An Apply Now that is an
   * anchor is an Apply Now that leaves, and leaving is how it came to be
   * pointed at nothing. They are buttons now, and a button cannot rot into
   * a dead URL.
   */
  for (const page of PAGES) {
    const src = fs.readFileSync(path.join(SITE, page), 'utf8');
    const anchors = src.match(/<a\b[^>]*>\s*(?:&#\d+;|\s)*Apply Now/gi) || [];
    assert.deepEqual(anchors, [],
      `${page} has an Apply Now that is a link rather than a button`);
  }
});

test('EVERY SELECT AND APPLY BUTTON IS WIRED TO SOMETHING', () => {
  /*
   * The quote tool's two Select buttons did nothing at all -- no handler, no
   * href, no listener. Press one and the page sat there. That is harder to
   * notice than a dead link, because a dead link at least navigates
   * somewhere and shows an error; a dead button looks like a slow page, so
   * the visitor presses it again and then leaves.
   *
   * Any button wearing the class that means "choose this one" has to carry
   * data-qb-apply. A new rate card copied from an old one fails here rather
   * than in front of somebody who wanted to buy.
   */
  const bad = [];
  for (const page of PAGES) {
    const src = fs.readFileSync(path.join(SITE, page), 'utf8');
    const re = /<button\b[^>]*class="[^"]*\bselect-btn\b[^"]*"[^>]*>/gi;
    let m;
    while ((m = re.exec(src))) {
      if (!/data-qb-apply/.test(m[0])) bad.push(`${page}: ${m[0].slice(0, 70)}…`);
    }
  }
  assert.deepEqual(bad, [],
    'these look like a choose-this button and do nothing:\n  ' + bad.join('\n  '));
});

test('THE MODAL STYLESHEET CLOSES EVERY RULE IT OPENS', () => {
  /*
   * The first version of this file was sliced out of mygacalculator.html by
   * grepping for lines starting ".qbm-", which stopped one line short of the
   * end of a rule -- and three lines short of the two footer buttons, whose
   * selectors are written "button.qbm-go" and never matched the pattern.
   *
   * An unclosed rule does not fail loudly. It swallows whatever CSS follows
   * it, so the damage lands on the next thing added rather than on the thing
   * that was cut, which is how "Not yet" and "Start my application" shipped
   * as unstyled browser buttons at the foot of a form asking for somebody's
   * date of birth.
   */
  const css = fs.readFileSync(
    path.join(SITE, 'css', 'quotebot-apply.css'), 'utf8');
  const open = (css.match(/\{/g) || []).length;
  const close = (css.match(/\}/g) || []).length;
  assert.equal(open, close,
    `${open} rules opened, ${close} closed -- an unclosed rule swallows the CSS after it`);
});

test('every class the modal wears has a rule somewhere', () => {
  const css = fs.readFileSync(
    path.join(SITE, 'css', 'quotebot-apply.css'), 'utf8');
  const markup = fs.readFileSync(
    path.join(SITE, 'dimeneedscalculator.html'), 'utf8');
  const used = new Set();
  const re = /class="([^"]*)"/g;
  let m;
  while ((m = re.exec(markup))) {
    for (const c of m[1].split(/\s+/)) if (/^qbm/.test(c)) used.add(c);
  }
  assert.ok(used.size > 5, 'found almost no modal classes -- is the modal still there?');

  /*
   * Comments stripped first, so a class named only in the prose above a rule
   * does not count as styled. Beyond that this asks the plain question --
   * does any rule mention this class -- and not the cleverer one about
   * whether that rule is the right one. The failure it exists for is a whole
   * block going missing, which is what happened; distinguishing a base rule
   * from a lone :disabled rule would be fitting the test to a mutant rather
   * than to a bug anybody has had.
   */
  const rules = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const unstyled = [...used].filter((c) => !new RegExp('\\.' + c + '(?![\\w-])').test(rules));
  assert.deepEqual(unstyled, [],
    'these are worn by the modal and styled by nothing: ' + unstyled.join(', '));
});

test('THE BUTTON RESET CANNOT OUT-RANK A PAGE CLASS', () => {
  /*
   * This reset exists to add what a converted anchor is missing, never to
   * remove what a real button already has. Written as a bare attribute
   * selector it scores the same as .select-btn -- and this stylesheet is
   * linked after each page's inline <style>, so it won on source order and
   * stripped the green, the white text, the radius and the padding off every
   * Select button on the quote tool.
   *
   * :where() scores zero: still beats the browser's defaults, loses to every
   * page class. The guard is on the selector rather than on any particular
   * property, because the next person to add a line inside this block should
   * not have to rediscover why.
   */
  const css = fs.readFileSync(
    path.join(SITE, 'css', 'quotebot-apply.css'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  /* :where(...) groups removed first, so the second selector INSIDE one is
     not mistaken for a bare selector of its own -- which is what the first
     version of this guard did, failing on the very file it was written to
     bless. */
  const outside = css.replace(/:where\([^)]*\)/g, '');
  const bare = outside.match(/\[data-qb-(apply|advisor)\]/g) || [];
  assert.deepEqual(bare, [],
    'a data-qb-* selector outside :where() will beat the page\'s own button classes');
  assert.ok(/:where\(\s*\[data-qb-apply\]/.test(css),
    'the reset is gone entirely -- converted anchors will wear the browser default border');
});

test('THE SMS DISCLOSURE DOES NOT ASK THE PAGE WHAT COLOUR TO BE', () => {
  /*
   * This is the A2P 10DLC express-written-consent disclosure, and an
   * unreadable disclosure undermines the consent it collects.
   *
   * It used to take its colour from var(--text), so that it would "still
   * work if a calculator is ever built dark". The hole in that: --text is a
   * PAGE token and legibility depends on the LOCAL surface. The FIA income
   * rider page is light overall with a dark navy unlock panel, and the
   * opt-in lives inside the panel -- so it rendered near-black on navy,
   * pinned with !important so the page could not correct it.
   *
   * It paints its own ground now. The guard is that it keeps doing so,
   * because the symptom is invisible to anybody who already knows what the
   * sentence says.
   */
  const js = fs.readFileSync(
    path.join(SITE, 'js', 'quotebot-capture.js'), 'utf8');
  const block = js.slice(js.indexOf('function injectSmsStyles'),
    js.indexOf('document.head.appendChild'));
  assert.ok(block, 'injectSmsStyles is gone -- this guard is watching nothing');
  assert.match(block, /\.qb-sms\{[^']*background:var\(--white/,
    'the disclosure no longer paints its own ground, so a dark panel can '
    + 'swallow it -- pinning the text colour alone does not help, because '
    + '--text is a page token and the surface is local');
});

test('A SCROLLING PANEL NEVER HIDES ITS OWN BUTTON', () => {
  /*
   * .left-panel is height:100vh with overflow-y:auto, so it scrolls inside
   * itself and the page scrollbar does not reach it. The Calculate button
   * is the last thing in that panel, so without a sticky rule it sat below
   * the fold of a column people may not realise is scrollable -- 589px
   * down on income floor, 989 on retirement distribution, 1312 on MYGA.
   *
   * Source-level, not rendered: these pages are static HTML and a CI run
   * with no browser cannot measure a scrollport. What it CAN check is that
   * every page which scrolls a panel internally also pins the button in
   * it, which is the property that was missing.
   */
  const bad = [];
  for (const page of PAGES) {
    const src = fs.readFileSync(path.join(SITE, page), 'utf8');
    const scrolls = /\.left-panel\s*\{[^}]*overflow-y:\s*auto/.test(src);
    const hasCta = /class="run-btn"/.test(src);
    if (!scrolls || !hasCta) continue;
    if (!/\.left-panel\s+\.run-btn\s*\{[^}]*position:\s*sticky/.test(src)) {
      bad.push(page);
    }
  }
  assert.deepEqual(bad, [],
    'these scroll their input panel internally and leave the button below '
    + 'its fold: ' + bad.join(', '));
});

test('NO CONVERTED BUTTON IS LEFT WITH NOTHING STYLING IT', () => {
  /*
   * The ten "help me" buttons used to be anchors. The conversion carried
   * over class and style attributes -- but one of them had neither, because
   * it was styled by element type: `.cta-section a { ... }`. Turning it into
   * a <button> orphaned it, and the [data-qb-*] reset then stripped the
   * browser's own button chrome as well, so the most enthusiastic CTA on
   * the income floor results page rendered as bare text on a dark band.
   *
   * A button is considered styled if it carries a class, carries an inline
   * style, or the page has a rule naming the data attribute. That is not a
   * rendering check -- it cannot be, in a CI run with no browser -- but it
   * is exactly the hole the conversion left.
   */
  const bad = [];
  for (const page of PAGES) {
    const src = fs.readFileSync(path.join(SITE, page), 'utf8');
    /* A :hover rule naming the attribute is not styling the button at rest.
       The first version of this check accepted one, so reverting only the
       base rule walked straight past it -- the mutant that proved the guard
       did not work. */
    const styledByAttr = (src.match(/\[data-qb-(?:advisor|apply)\][^{]*\{/g) || [])
      .some((sel) => !/:(hover|focus|active|visited)/.test(sel));
    const re = /<button\b[^>]*data-qb-(?:advisor|apply)[^>]*>/g;
    let m;
    while ((m = re.exec(src))) {
      const tag = m[0];
      if (/\bclass="/.test(tag) || /\bstyle="/.test(tag) || styledByAttr) continue;
      bad.push(`${page}: ${tag.slice(0, 64)}…`);
    }
  }
  assert.deepEqual(bad, [],
    'these buttons have no class, no inline style and no rule naming the '
    + 'attribute, so they render as bare text:\n  ' + bad.join('\n  '));
});

/*
 * A CTA THAT GOES NOWHERE.
 *
 * Retirement Distribution shipped two "Talk to an Advisor" buttons pointing
 * at href="#". They looked like working CTAs, sat in the dark band next to a
 * real one, and did nothing when pressed. The host allowlist above could not
 * see them, because "#" names no host.
 */
test('NO CTA LINKS TO href="#"', () => {
  const offenders = [];
  for (const f of PAGES) {
    const src = fs.readFileSync(path.join(SITE, f), 'utf8');
    for (const m of src.matchAll(/<a\s[^>]*href="#"[^>]*>([\s\S]{0,60}?)<\/a>/g)) {
      const label = m[1].replace(/<[^>]+>/g, '').trim();
      if (label) offenders.push(`${f}: "${label}"`);
    }
  }
  assert.deepEqual(offenders, [], `dead links:\n  ${offenders.join('\n  ')}`);
});

/*
 * THE MODAL'S SUMMARY MUST COME FROM THE PAGE.
 *
 * cfg.summary is a function and the config arrives as JSON, so for a long
 * while every calculator fell through to the module's generic rows and the
 * panel headed "What you worked out" told the visitor "The contract shown
 * above". A page that opens the apply modal has to declare its own figures.
 */
const AWAITING_SUMMARY = [
  'careltccalculator.html',
  'crosspurchasebuysellcalculator.html',
  'dimeneedscalculator.html',
  'keypersoncalculator.html',
  'ltcannuitytaxillustration.html',
  'mugcalculator.html',
  'quotetool.html',
  'retirementdistributioncalculator.html',
  'sequenceofreturnscalculator.html'
];

test('EVERY PAGE USING THE APPLY MODAL DECLARES ITS SUMMARY', () => {
  const srcOf = (f) => fs.readFileSync(path.join(SITE, f), 'utf8');
  const usesModal = PAGES.filter((f) => srcOf(f).includes('quotebot-apply.js'));

  const missing = usesModal
    .filter((f) => !srcOf(f).includes('data-qb-sum'))
    .filter((f) => !AWAITING_SUMMARY.includes(f));
  assert.deepEqual(missing, [], `no summary declared:\n  ${missing.join('\n  ')}`);

  /* The list above is work owed, not a permanent exemption: a page that has
     since been given its figures must come off it, or the next page added
     to the list hides behind a name nobody rechecks. */
  const stale = AWAITING_SUMMARY.filter((f) => !usesModal.includes(f) || srcOf(f).includes('data-qb-sum'));
  assert.deepEqual(stale, [], `remove from AWAITING_SUMMARY:\n  ${stale.join('\n  ')}`);
});
