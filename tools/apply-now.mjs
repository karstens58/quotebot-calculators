/**
 * Give every calculator with an Apply or Advisor button the modal behind it.
 *
 *   node tools/apply-now.mjs
 *
 * Same arrangement as apply-chrome.mjs beside it, and for the same reason:
 * thirteen pages carry their own markup, so the way to keep them consistent
 * is a script that edits all of them rather than a person editing each.
 * Idempotent -- every step checks for what it is about to insert first, so
 * running it twice changes nothing the second time.
 *
 * WHAT A PAGE GETS, and only if it has a button that needs it:
 *
 *   1. the stylesheet, as a file rather than inlined thirteen times
 *   2. window.QB_APPLY, its own line, the only page-specific part
 *   3. js/quotebot-apply.js
 *   4. the modal markup before </body>
 *
 * The modal is the partial beside this file, not a copy per page. A page
 * that has drifted gets the partial again.
 *
 * PRODUCT LINE IS PER TOOL and is not guessable from the filename: the LTC
 * annuity illustration is an annuity, the C.A.R.E. tool is long-term care,
 * and the key-person tool insures an employee's life for a company. Wrong
 * here means an agent opens the wrong product.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(import.meta.dirname, '..');
const SITE = path.join(ROOT, 'site');
const PARTIALS = path.join(import.meta.dirname, 'partials');

/**
 * Each page's own line. `null` means the tool has no Apply of any kind and
 * is listed so that a page missing from this map is a mistake rather than a
 * silent skip.
 *
 * `ownerDefault: 'other'` is the key-person case: the applicant IS the
 * company and the insured is an employee, so "the owner is the person
 * insured" is wrong before anybody touches it. Buy-sell is the same shape --
 * the other owners buy the policy -- but the owner there is a person rather
 * than the company, so the relationship is left for them to type.
 */
const TOOLS = {
  'careltccalculator.html': { productLine: 'LONG_TERM_CARE' },
  'crosspurchasebuysellcalculator.html': { productLine: 'TERM_LIFE' },
  'dimeneedscalculator.html': { productLine: 'TERM_LIFE' },
  'incomefloorcalculator.html': { productLine: 'ANNUITY_FIXED' },
  'keypersoncalculator.html': {
    productLine: 'TERM_LIFE',
    ownerDefault: 'other',
    ownerRelationship: 'Employer',
  },
  'ltcannuitytaxillustration.html': { productLine: 'ANNUITY_FIXED' },
  'mugcalculator.html': { productLine: 'TERM_LIFE' },
  'mygacalculator.html': { productLine: 'ANNUITY_FIXED' },
  'quotetool.html': { productLine: 'TERM_LIFE' },
  'retirementdistributioncalculator.html': { productLine: 'ANNUITY_FIXED' },
  'sequenceofreturnscalculator.html': { productLine: 'ANNUITY_FIXED' },
  'fiaincomeridercalculator.html': { productLine: 'ANNUITY_FIXED' },
  'index.html': null,
};

const CSS_HREF = 'css/quotebot-apply.css';
const JS_SRC = 'js/quotebot-apply.js';
const MARK = 'data-qb-apply-modal';

const read = (p) => fs.readFileSync(p, 'utf8');

/* The stylesheet is published once. Thirteen inlined copies of 4kB is 52kB
   of duplicated CSS a browser would otherwise cache on the first page. */
function publishCss() {
  const out = path.join(SITE, 'css');
  fs.mkdirSync(out, { recursive: true });
  const dest = path.join(out, 'quotebot-apply.css');
  const want = read(path.join(PARTIALS, 'apply-modal.css'));
  if (!fs.existsSync(dest) || read(dest) !== want) {
    fs.writeFileSync(dest, want);
    return true;
  }
  return false;
}

function configLine(cfg) {
  return '  <script>window.QB_APPLY = ' + JSON.stringify(cfg) + ';</script>';
}

function apply(file, cfg) {
  const p = path.join(SITE, file);
  let s = read(p);
  const before = s;

  /* Nothing to open means nothing to insert. A page gets the modal when it
     grows a button, not because it is in the list. */
  if (!/data-qb-(apply|advisor)\b/.test(s)) return { file, skipped: true };

  if (!s.includes(CSS_HREF)) {
    s = s.replace('</head>',
      `  <link rel="stylesheet" href="${CSS_HREF}">\n</head>`);
  }

  /* The config BEFORE the script that reads it, because the script reads it
     at load. A defer on the script would not save it: the inline tag has to
     come first in document order either way, and putting it after is the
     kind of thing that works on one page and not the next. */
  if (!s.includes('window.QB_APPLY')) {
    s = s.replace('</head>', configLine(cfg) + '\n</head>');
  } else {
    s = s.replace(/ {2}<script>window\.QB_APPLY = .*?;<\/script>/s, configLine(cfg));
  }

  if (!s.includes(JS_SRC)) {
    s = s.replace('</head>',
      `  <script src="${JS_SRC}" defer></script>\n</head>`);
  }

  /*
   * THE PARTIAL WINS, EVERY RUN.
   *
   * The first version of this only inserted when the marker was absent, so
   * a page that already had the modal kept whatever version of it landed
   * the first time. That is precisely the drift this script exists to stop
   * -- and it bit immediately: the partial grew a confirmation card and
   * nine pages quietly did not get it.
   *
   * The region is delimited rather than guessed at, so replacing it cannot
   * eat markup that belongs to the page.
   */
  const START = '<!-- qb:apply-modal:start -->';
  const END = '<!-- qb:apply-modal:end -->';
  const modal = START + '\n'
    + read(path.join(PARTIALS, 'apply-modal.html'))
      .replace('<div class="qbm-veil"', `<div ${MARK} class="qbm-veil"`)
    + '\n' + END;

  const from = s.indexOf(START);
  if (from !== -1) {
    const to = s.indexOf(END, from);
    if (to === -1) throw new Error(`${file}: modal region opens and never closes`);
    s = s.slice(0, from) + modal + s.slice(to + END.length);
  } else if (s.includes(MARK)) {
    /* Inserted by the version of this script that had no delimiters. Its
       block ran from the marker to the last thing before </body>, which is
       where this script put it and nowhere else. */
    const at = s.indexOf(`<div ${MARK}`);
    const body = s.lastIndexOf('</body>');
    s = s.slice(0, at) + modal + '\n' + s.slice(body);
  } else {
    s = s.replace('</body>', modal + '\n</body>');
  }

  if (s !== before) fs.writeFileSync(p, s);
  return { file, changed: s !== before };
}

const cssChanged = publishCss();
const results = [];
for (const [file, cfg] of Object.entries(TOOLS)) {
  if (!cfg) continue;
  if (!fs.existsSync(path.join(SITE, file))) {
    throw new Error(`${file} is in TOOLS and not in site/ -- one of the two is wrong`);
  }
  results.push(apply(file, cfg));
}

/* A page in site/ that nobody listed. Thrown rather than warned: the whole
   point of the map is that adding a calculator makes somebody decide what
   product line it sells. */
const listed = new Set(Object.keys(TOOLS));
for (const f of fs.readdirSync(SITE).filter((x) => x.endsWith('.html'))) {
  if (!listed.has(f)) throw new Error(`${f} is not in TOOLS -- say what it sells`);
}

console.log(`stylesheet ${cssChanged ? 'written' : 'unchanged'}`);
for (const r of results) {
  console.log(`  ${r.file}: ${r.skipped ? 'no button yet' : r.changed ? 'wired' : 'already wired'}`);
}
