# Social cards

Every page in `site/` has a 2400x1260 Open Graph card in `site/og/`. This
folder is what draws them, so a copy change is a text edit and a re-run
rather than an afternoon in a graphics editor.

    cd tools/og
    npm install          # playwright + the two webfonts, into tools/og/node_modules
    npm run build        # the eleven typographic cards
    npm run shot-index   # index-card.png, which is a screenshot
    npm run meta         # writes the og:/twitter: tags into site/*.html

`cards.mjs` holds everything written, one entry per page: the eyebrow, the
headline broken into printed lines, the body, the three words in the navy rail,
and the three strings the scrapers read -- `title`, `description` and `alt`.
Both the picture and the tags come from that one file, so a copy change is one
edit in one place. `apply-meta.mjs` writes the tags in and takes the image's
width and height from the PNG's own header rather than trusting a number
someone typed; running it twice produces the same file, and `--check` reports
drift without writing. `render.mjs` holds the design and nothing else --
its colours and geometry were sampled from `site/og/quotetool-card.png`, the
card this set was grown from, so anything new sits beside it without looking
like a different house.

Two things worth knowing before editing:

- **Nothing here runs in CI.** `amplify.yml` only runs `node --test
  tests/*.test.mjs`, and `node_modules/` is gitignored, so the rendered PNGs
  are committed and the generator is never installed on the build machine. If
  you change copy, re-run the build and commit the PNGs it writes.
## Moving to a new domain

`origin.mjs` is the only place the domain is written down. To move the site:

    1. edit ORIGIN in tools/og/origin.mjs
    2. cd tools/og && npm run meta
    3. node --test tests/og-cards.test.mjs

Step 2 rewrites the twelve link-preview blocks and sweeps the canonical link on
every page, including pages that are not in `cards.mjs`. Step 3 is what makes
this safe rather than hopeful: the test checks every page's `og:url`, `og:image`
and canonical against `ORIGIN`, so anything step 2 did not reach fails the build
instead of shipping a preview that points at a host you no longer own.

**`quotetool.html` will not be reached.** Its tags are hand-written and it is
not in `cards.mjs`, so its three absolute urls have to be edited by hand. The
test names it, loudly, and will keep failing until they are -- that is the
design, not an oversight. (There is also one stale reference in a comment on
`index.html`, which is prose and harms nothing.)

## Notes

- **Do not hand-edit the tags in a page.** They are generated, and the next
  `npm run meta` will overwrite them. Edit `cards.mjs` instead.
- **`tests/og-cards.test.mjs` is the contract.** It checks that every declared
  `og:image` is an absolute https URL on tools.quotebot.io, that the file
  exists, that the declared width and height match the PNG's own header, that
  the ratio is about 1.91:1, and that no two pages share a card. Run
  `node --test tests/og-cards.test.mjs` after any change here.

The headline is hand-broken on purpose -- each array item is one printed
line -- because an automatic break puts the turn in the wrong place about
half the time. `render.mjs` starts at the 117px the original card uses and
steps the size down only if the longest line would run into the rail, so the
set stays visually even.

`index.html` is the one page whose card is not typographic. What the index is
selling is the shelf itself, so its card is a screenshot of the real page,
drawn by `shot-index.mjs`. That script hides the floating chat launcher, which
is a widget rather than content, and cuts just below the first row of tiles --
a card that slices the second row in half looks like a bug. If the index page
is ever restructured so the tiles are no longer found, the script fails loudly
instead of shipping a bad crop.

`quotetool.html` is left alone entirely. Its card predates this generator and
is still the hand-made original, and its tags are still hand-written. It is
deliberately not in `cards.mjs`: it is the reference the rest of the set was
measured against, and regenerating it would mean approving it a second time.
