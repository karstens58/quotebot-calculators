# Not served

`amplify.yml` takes its artifacts from `site/` and nothing else:

```yaml
  artifacts:
    baseDirectory: site
```

So a page here is in the repository and is **not** on tools.quote-bot.com.
That is the whole purpose of the folder. It is for a page that is finished
enough to review and not finished enough to publish — usually because it
shows a carrier's rates that are not yet the carrier's rates.

## Moving one back

Two steps, and the second is not optional:

1. `git mv preview/<page>.html site/<page>.html`
2. `node tools/apply-chrome.mjs`

The chrome tool walks `site/` only, so a page parked here stops being kept
in step with the top bar, the brand header and the footer the moment it
moves. That is survivable precisely because nothing here is served — but it
means the page coming back is a page whose chrome may be months stale, and
the run in step 2 is what fixes it. Do it before the push, not after.

## What is here, and why

### agentlessquote.html

The **Agent-less** Assurity term tool -- named that way wherever it
is listed, because Assurity let the whole thing finish online and a later
agent-assisted variant would be a different page, not a different mode. Built and styled; **its rates are an
illustrative table, not Assurity's.**

That is why it is here rather than in `site/`. A public page showing a
premium under a carrier's name, beneath that carrier's own compliance
wording, is not a draft — to anyone who finds it, it is a quote. The engine
behind the real quote tool already refuses to invent a premium in live mode
for the same reason: an honest error beats a confident wrong number.

It goes back to `site/` when QBP-557 lands and the numbers come from
Assurity's `/quotes` endpoint.

**The file name is deliberately carrier-neutral.** The URL names the flow,
not the carrier: if another carrier ever supports a full online finish it
joins this page rather than needing its own address, and a public URL does
not carry a carrier's trade name. Assurity stays visible on the page as the
issuing carrier, which is where it belongs. Note that the `<title>` still
names Assurity -- correct while it is the only carrier here, and the thing
to change first if a second one arrives.
