# Quote Bot calculators

The consumer calculators served at **tools.quotebot.io**.

## Layout

    site/     everything that gets published. This folder IS the web root.
    tests/    run against the files in site/. Never published.

`amplify.yml` sets `baseDirectory: site`, so nothing outside `site/` can be
served. Put notes, scripts and fixtures anywhere else in the repo freely.

## Deploying

Push. Amplify builds from git and publishes `site/`.

There is no zip step any more, and that is deliberate. Deploys used to be made
by compressing this folder and uploading it by hand. On 24 September one of
those zips was built from the *folder* instead of its *contents*, which put
every page one level deep — `tools.quotebot.io/` returned 404 for every
visitor until it was rebuilt. Nothing checked, because there was nothing to
check against.

## Tests

    node --test tests/*.test.mjs

`tests/quotetool-cards.test.mjs` cuts `renderBest` straight out of
`site/quotetool.html` and runs it, rather than testing a copy, so it cannot
drift from the page that ships. Amplify runs it in `preBuild`, so a broken
card fails the deploy instead of reaching a customer.

## History before 25 September 2026

This folder was not under version control until then. The fourteen commits
dated 11–25 September are reconstructions, replayed in order from the
deployment zips that were the only record of what had been live. They are
accurate as to content and ordering; they are not what anyone typed at the
time.

## What lives here and what does not

Page code lives here. Anything an admin should be able to change without a
deploy — featured carriers and the reasons shown under them, carrier details,
rate tables — lives in the console and reaches these pages through the quote
engine at run time. If you find yourself editing this repo to change a
sentence a non-developer owns, that sentence is in the wrong place.
