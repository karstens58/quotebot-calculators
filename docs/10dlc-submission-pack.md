# 10DLC Registration Pack — Quote Bot SMS

**Prepared 26 September 2026 · Disclosure version `2026-09-a`**

Everything below is a factual description of what the calculators and the backend
actually do, verified against production at `tools.quotebot.io` on the date above —
not a legal opinion. Section 2 is the part to read first.

---

## 1. How to use this

**Readiness, plainly.** This is ready to circulate internally and to send to
counsel. It is **not ready to submit to Twilio**, and will not be until the items
in section 2 are closed — chiefly that STOP and HELP do not exist yet, and that
the brand details in section 3 are still blank. Section 9 carries two versions of
the flow description for exactly this reason: one that becomes true when QBP-105
ships, and one that needs QBP-107 and QBP-108 as well. Submitting a description
of behaviour that is not built is the one mistake in this process that is hard to
walk back.

Three audiences, one document:

- **Counsel** — sections 4, 5, 6 and 10. The question for them is whether the
  wording in 4 satisfies 47 CFR 64.1200(f)(9) and applicable state law, and
  whether the evidence we retain (section 6) is what they would want to rely on.
  Section 5.2 lists every place a phone number is collected, including the two
  that have no opt-in on them yet.
- **Whoever files the TCR campaign** — sections 3, 5, 7, 8 and 9 map onto the
  registration form's fields. Most can be pasted more or less as written.
- **Engineering** — section 7. There is work there that must land before the
  first message goes out.

Get counsel's answer on section 4 *before* filing, not after. The opt-in wording
goes into the campaign registration, so changing it later means revisiting what
you filed.

---

## 2. Before you submit — the honest list

**1. The wording has not been through counsel.** What is deployed encodes the
*shape* the FCC's definition of prior express written consent requires — a clear
disclosure naming automated marketing texts, and a statement that agreeing is not
a condition of purchase. Whether the specific sentence satisfies it is a lawyer's
call. Nobody has made it yet.

**2. STOP and HELP are not implemented.** This is the blocking one.

Every calculator now tells the consumer *"Reply STOP to opt out or HELP for
help."* Nothing in the system handles either. The only revocation path that
exists writes `revokedAt` from the **Mailgun email** webhook — there is no
equivalent for texts, because there is no inbound text handling at all yet.

Twilio's Advanced Opt-Out would stop delivery at their end once configured, but
our own `ConsentRecord` would still read as granted, so the CRM would go on
showing the lead as textable and an agent could keep trying. A promise made in
the disclosure that the system does not keep is worse than not making it.

**What has to be built:** an inbound webhook that recognises STOP / UNSUBSCRIBE /
CANCEL / END / QUIT and writes a revoking `ConsentRecord`, a HELP auto-reply
naming the brand and support contact, START / UNSTOP to re-subscribe, and **Y** —
the confirmation reply, which on an agent-recorded consent is what permits
marketing at all (5.4). `N` is accepted as an unadvertised synonym for STOP. The
send gate already refuses on `revokedAt` (section 10), so the gate is ready —
only the inbound path is missing.

**3. No SMS has ever been sent.** Twilio is registered in the integrations
directory as a coming-soon tile with no credentials and no send path. That is
accurate to state on the registration: this is a new campaign, not a migration of
existing traffic.

**4. Not every place we collect a phone number has an opt-in.** The twelve
calculators do. The chat widget and agent-entered leads do not — see section 5.2,
which lists every collection point rather than only the ones with a box on them.
Neither can be texted today, because the send gate reads consent records and
those leads have none, so the current position is safe. But a campaign
registration that describes only the calculators would be describing part of the
picture, and 5.2 exists so that does not happen.

**5. Two calculators show the privacy and terms references as plain words rather
than links** (`crosspurchasebuysellcalculator`, `keypersoncalculator`). The
consent language itself is correct on both. Worth fixing before filing if the
reviewer is strict about a clickable privacy policy at the point of collection.

---

## 3. Brand

| Field | Value |
|---|---|
| Legal entity | QB Insurance LLC |
| DBA / brand | Quote-Bot |
| Business type | Licensed insurance agency, licensed in all 50 states |
| Brand website | `https://quotebot.io` |
| Opt-in surface | `https://tools.quotebot.io` |
| Privacy Policy | `https://quotebot.io/Privacy-Policy` |
| Terms | `https://quotebot.io/Terms-Conditions` |
| Consumer support phone | (888) 804-8590 |
| Consumer support email | `info@quotebot.io` |
| EIN / registered address / brand contact | **you supply** |

Vertical is insurance, which some carriers treat as a regulated or
higher-scrutiny category. Expect the campaign to be reviewed rather than
auto-approved, and expect the opt-in evidence in section 5 to be looked at.

---

## 4. The disclosure, verbatim

Read from the deployed page, not from source. This is the exact text a consumer
sees beside the checkbox, and the exact text stored as evidence when they tick it.

**Checkbox label:**

> Text me quotes and offers

**Fine print directly beneath it:**

> I agree to receive automated marketing text messages from Quote Bot about my
> insurance quote and related offers. Message frequency varies. Message and data
> rates may apply. Reply STOP to opt out or HELP for help. Consent is not
> required to make a purchase.

**Version stamp:** `2026-09-a` — recorded on every consent record, so a record can
always name the wording that produced it. Bump it whenever the wording changes.

### Clause-by-clause

| Clause | Purpose |
|---|---|
| "automated marketing text messages" | Names both the automation and the marketing purpose |
| "from Quote Bot" | Identifies who is sending. Affiliates never text; co-branding on a calculator changes the logo, not the sender |
| "about my insurance quote and related offers" | Scope of content |
| "Message frequency varies" | Required disclosure |
| "Message and data rates may apply" | Required disclosure |
| "Reply STOP to opt out or HELP for help" | Opt-out instruction — **see section 2, item 2** |
| "Consent is not required to make a purchase" | The 64.1200(f)(9) not-a-condition clause |

**For counsel specifically:** the phrase "recurring" does not appear, and the
disclosure does not say "including messages sent by autodialer". An earlier draft
carried both. Worth a view on whether their absence matters for this use case.

---

## 5. How consent is collected

### 5.1 Mechanics

- A single **unticked** checkbox. Nothing pre-ticks it; the code sets
  `checked = false` explicitly and a test fails if anything sets it true.
- The box is **never `required`**. Results are not withheld from someone who
  leaves it alone.
- The **phone field itself is optional** on all twelve calculators. This was not
  true a week ago — five of them demanded a number in JavaScript with no
  `required` attribute to show for it. An opt-in sitting under a compulsory field
  reads as part of the toll, which contradicts the not-a-condition clause two
  lines below it.
- On a calculator, the consumer types their own number into the same form. On an
  agent-entered lead the agent types it from what the consumer gave them, which is
  exactly why that route requires a confirmation reply before anything is sent
  (5.4).
- **No purchased lists, no appended numbers, no third-party lead vendors** feed
  any collection point in 5.2. Every number came from the person it belongs to.
- Consent is per-person, captured at the moment of the quote request, and tied to
  that submission.

### 5.2 Every place a phone number is collected

Four surfaces create a lead. **Today only one carries the opt-in**, and a reviewer
should see all of them rather than infer that the calculator forms are the whole
system. Two tables below: what is true now, which is what the registration
describes, and what changes when the decided work ships.

**Inbound calls are not a separate category.** Somebody who rings (888) 804-8590
and gives their number to an agent becomes an agent-entered lead, and is governed
by exactly the rules that route has: an agent recording what a consumer said,
subject to the confirmation requirement in 5.4. The consumer having made the call
does not change what the evidence is — it is still an agent's account of a
conversation, and it is corroborated the same way.

Note the two chat widgets are **not the same build**. The one on the calculators
has a callback form that requires a phone number; the one on `quotebot.io` is a
different, smaller build with no phone field, so it is not an SMS collection
point at all. Anything done to the chat opt-in has to be done to the build that
actually has the form, and checked on the other.

**Nothing on this list can be texted today.** There is no Twilio integration and
no send path at all (section 2, item 3), so the practical answer for every row is
the same. The columns below are about *consent*, not capability.

#### Today — what the registration should describe

| Surface | Collects a phone | SMS opt-in captured |
|---|---|---|
| The twelve calculators | Optional field | **Yes** — ticked box, section 4 |
| **Chat callback form** (`tools.quotebot.io`) | **Required** — a callback needs a number to ring | **No** |
| Chat widget on `quotebot.io` | **No phone field at all** | n/a |
| **Agent-entered leads** (internal CRM) — including anyone who rings (888) 804-8590 and gives their number to an agent | Optional | **No** |

#### Once QBP-107 and QBP-108 ship

| Surface | Opt-in captured | What makes it actionable |
|---|---|---|
| The calculators | **Yes** — the consumer ticks | Nothing further. A soft confirmation is sent (5.4) |
| Chat callback form | **Yes** — the consumer ticks the same box, on a rendered form | Nothing further. Same soft confirmation |
| Agent-entered / inbound caller | **Recorded by the agent** — an assertion, not an act by the consumer | **The consumer's Y reply.** The agent's record alone permits nothing |
| Chat widget on `quotebot.io` | n/a — collects no number | — |

**Sending a confirmation message does not capture consent.** It is worth being
exact about this, because it is the whole basis for treating the two routes
differently. The outbound message is us *asking*; it is evidence that we asked
and nothing more. On the calculator and chat routes the consent was already
captured by the consumer's own tick, and the message merely notifies and verifies.
On the agent route there is no consumer act at all until the reply arrives — so
the reply is the capture that matters, and until it comes the record holds one
party's account of what another party said.

If an outbound message counted as capturing consent, consent could be
manufactured by texting people. It cannot, and the gate is built accordingly.

The two software doors without a box are that way deliberately, and the code says
so. The chat's lead-creation path carries this note:

> *No ConsentRecord is written. A visitor who typed their name into a chat box
> has not agreed to be called or texted, and the messaging gate reads consent
> records rather than the contact, so this lead correctly cannot be dialled until
> somebody captures that properly.*

That is the safe direction — those leads are unreachable rather than wrongly
reachable — but it is not a finished state. A consumer who asks the chat widget
for a callback, gives a phone number because the flow requires one, and is then
told someone will be in touch has a reasonable expectation of contact that the
system cannot currently honour by text.

**Decided, not yet built (QBP-107):** the same checkbox and wording go into the
chat's callback step, so it behaves as a consumer opt-in like any calculator.
That step is already a rendered form with real inputs, so the existing opt-in
element and the existing `readSmsOptIn()` drop in unchanged — the evidence
captured is identical in shape to a calculator's, down to the version stamp.

**The phone being required there is not a condition on consent.** A callback
needs a number to ring, and that is the service the consumer asked for. What
would condition consent is requiring the *tick*, and the tick stays optional —
exactly as on the calculators.
Agent-entered leads get a way to record how consent was obtained — verbal on a
recorded call, for example — with who recorded it, when, and against which script
version. That route is then subject to the confirmation requirement in 5.4:
**nothing is sent to an agent-recorded consent until the consumer replies Y.**

Until both ship, the honest description of this campaign is that opt-in is
collected **on the calculators only**, and that is how it should be represented on
the registration today.

### 5.3 Where the opt-in appears

All twelve calculators at `tools.quotebot.io`, each publicly reachable with no
login, which makes them usable directly as opt-in evidence if the reviewer wants
a URL instead of a screenshot:

```
careltccalculator.html            incomefloorcalculator.html
crosspurchasebuysellcalculator.html   keypersoncalculator.html
dimeneedscalculator.html          ltcannuitytaxillustration.html
fiaincomeridercalculator.html     mugcalculator.html
mygacalculator.html               quotetool.html
retirementdistributioncalculator.html  sequenceofreturnscalculator.html
```

`quotetool.html` is the representative one to submit — it is the main quote flow
and the opt-in sits directly beneath the phone field, above the submit button.

### 5.4 The message sent on opt-in, and what a reply means

**Decided, not yet built.** Wording approved by the business; still to go through
counsel with section 4, since it restates the consent and carries a required
disclosure.

Once a send path exists, an opt-in triggers one message immediately. **Which
message, and what happens next, depends on where the consent came from** — and
the split is deliberate: it tracks how strong the evidence behind the consent is.

#### The consumer ticked the box themselves (the calculators, and the chat callback form once QBP-107 ships)

> Quote Bot: You asked for texts about your insurance quote & offers. Reply with
> STOP at any time to opt out. Msg&data rates may apply. HELP for help.

148 characters, one GSM-7 segment. **Soft confirmation.** No reply is asked for
and silence changes nothing.

The evidence here is already strong: the consumer performed the affirmative act,
and we hold the disclosure verbatim, a server timestamp, a hashed origin IP and
the user agent (section 6). A confirmation reply would add little, and requiring
one would discard properly captured written consent because somebody ignored an
automated text. This message exists to notify, to verify the number reaches a
real handset, and to carry the opt-out keyword.

#### An agent entered the lead and recorded consent (5.2, QBP-107) — including inbound callers

> Quote Bot: You asked for texts about your insurance quote & offers. Reply Y to
> confirm or STOP to opt out. Msg&data rates may apply. HELP for help.

147 characters, one GSM-7 segment. **Hard confirmation: no Y reply, no marketing
texts.**

This is the one place in the system where the consent is a third party asserting
what somebody else said. A Y reply from the handset is exactly the corroboration
that assertion lacks — it turns an agent's claim into a first-party affirmative
act from the device. Without it there is nothing but the agent's word, and
marketing on that basis indefinitely is the manufactured-evidence shape this
whole area exists to avoid.

**A consumer who rang us is on this path too.** It is tempting to treat an
inbound caller as stronger — they initiated contact, after all — but that
improves the *context*, not the *evidence*. What we would hold is still an
agent's account of a conversation, recorded by the party who benefits from it.
Where the call was recorded, that recording is the corroboration a typed note is
not, and the record should point at it (QBP-107).

It also resolves the mis-keyed number. If an agent fat-fingers a digit, a
stranger receives a message saying they asked for insurance texts. Under a hard
confirmation they simply never reply and never hear from Quote Bot again; under a
soft one they would sit on the marketing list until they complained.

#### Both messages

**STOP, not a custom keyword, and these are the messages that must carry it.**
Twilio's messaging policy attaches the requirement to the first message a
recipient receives: *"The initial message that you send to a recipient needs to
include the following language: 'Reply STOP to unsubscribe.'"* This is that
message on either path, which is why both carry STOP and why routine messages
afterwards do not — see 8.1.

STOP is also the more robust decline path: Twilio blocks it at their level as
well as ours, so a bug in our inbound handler cannot silently keep messaging
somebody who declined. A custom keyword would only ever be caught by our code.
`N` is accepted as an unadvertised synonym because people will type it.

**Y** stamps the consent record as confirmed from the device. On the calculator
path that is a useful strengthening of a record that already stands on its own;
on the agent path it is what makes the record usable at all.

Both messages must stay inside the GSM-7 alphabet. A single curly quote or em
dash pushes them to UCS-2 at 70 characters per segment and turns one message into
three.

**The record must say which path produced it**, and therefore which of these two
messages the person received and what rule was applied to their silence. A
consent record that cannot say whether a human ticked a box or an agent typed it
in is not much of a record.

### 5.5 Screenshot

A production capture of `quotetool.html` accompanies this document, showing the
phone field with no required marker, the unticked box, the full fine print, and
the follow-up consent line beneath the CTA. It is a real render of the live page,
not a mockup.

---

## 6. What is recorded as evidence

One `ConsentRecord` row per consent, holding:

| Field | What it holds |
|---|---|
| `consentType` | `TCPA_SMS` — the only SMS consent type (section 10) |
| `granted` | `true` only from a genuinely ticked box, or from an agent recording a consent the consumer gave |
| `capturedAt` | **The server's** timestamp, never the browser's |
| `disclosureText` | The exact words on the screen, read back out of the DOM — not our copy of what we believe we showed |
| `disclosureVersion` | `2026-09-a` |
| `sourceUrl` | The calculator page the consent was given on. Null where there was no page — see provenance below |
| `userAgent` | Browser string. Null on an agent-recorded consent |
| `ipHash` | Origin IP, **hashed, never stored raw** |
| `sessionId`, `quoteRequestId`, `contactId` | Ties the consent to the submission, so the disclosure and the form data can be produced together rather than correlated by timestamp |
| `revokedAt` | Set on revocation — see section 2, item 2 |

**Provenance and confirmation — to be added, see 5.4 and QBP-107.** Two consent
routes now exist and they are not equivalent, so the record has to say which one
produced it: whether a consumer ticked a box or an agent recorded what somebody
said, and in the latter case which agent, when, by what means, and against which
version of the script they read. It also has to hold whether a confirmation reply
came back from the handset, because on the agent route that reply is what permits
marketing at all. A record that cannot distinguish the two is not much of a
record — it would present an agent's assertion and a consumer's own act as the
same thing.

Three properties worth stating to a reviewer:

**The timestamp is ours.** A client clock is a thing the client controls, and a
defence should not rest on one.

**The stored disclosure is verbatim.** It is read from the rendered page rather
than from a constant, so if a page ever overrode the wording the record carries
the override. It is capped in length but never normalised or tidied.

**Refusing is the default.** The capture path validates the submission before
writing anything, and refuses on a box that was not strictly ticked, a missing or
too-short disclosure, a disclosure that never mentions texting, a disclosure
missing the not-a-condition clause, a disclosure with no stop instruction, or a
consent with no phone number to attach it to. A refused opt-in records nothing at
all — the safe direction, since a weak record is worse than none.

---

## 7. Opt-out and HELP — current state

**Current state: not implemented.** See section 2, item 2.

What the registration will need once it is built, and what to build to match:

| Keyword | Required behaviour | Suggested reply |
|---|---|---|
| **Y, YES** (reply to the confirmation text, 5.4) | Stamp the record as confirmed from the device. On a calculator opt-in it strengthens a record that already stands; **on an agent-recorded consent it is what unlocks marketing at all**. Never creates consent on its own | "Quote Bot: Confirmed, thanks. Reply STOP to opt out at any time." |
| **N, NO** | Accepted as an unadvertised synonym for STOP, through the same code path. Not offered in any message | Same as the STOP reply below |
| STOP, UNSUBSCRIBE, CANCEL, END, QUIT | Stop all marketing texts immediately; write a revoking `ConsentRecord` | "Quote Bot: You're unsubscribed and won't get more texts from us. Reply START to resubscribe. Questions? (888) 804-8590" |
| HELP, INFO | Identify the brand and route to support | "Quote Bot (QB Insurance LLC): help at (888) 804-8590 or info@quotebot.io. Msg&data rates may apply. Reply STOP to opt out." |
| START, UNSTOP | Re-subscribe | "Quote Bot: You're resubscribed. Reply STOP to opt out." |

Two design notes for whoever builds it:

**A revocation must be a new row, not an edit.** Stamping `revokedAt` onto the
original grant would overwrite the proof that consent was ever given. The email
unsubscribe path already does this correctly and is the pattern to copy.

**A STOP stops everything.** Somebody who replies STOP did not mean "only the
campaign ones", and carriers do not read it that way either. The send gate
already enforces this — a revocation on either SMS consent type refuses both
marketing and transactional sends.

---

## 8. Sample messages

Drafts, consistent with the disclosure's stated scope. Confirm with counsel. Every
one identifies the brand; see 8.1 for which carry opt-out language and why the
rest do not.

**Confirmation after a consumer ticks the box on a calculator (5.4) — carries
STOP, required:**
> Quote Bot: You asked for texts about your insurance quote & offers. Reply with
> STOP at any time to opt out. Msg&data rates may apply. HELP for help.

**Confirmation after an agent records consent (5.4) — nothing else is sent unless
they reply Y:**
> Quote Bot: You asked for texts about your insurance quote & offers. Reply Y to
> confirm or STOP to opt out. Msg&data rates may apply. HELP for help.

**Quote follow-up:**
> Quote Bot: Your term life quote is ready - $34/mo for $500k, 20yr level.
> See it: quotebot.io/q/XXXX

**Marketing — rate change:**
> Quote Bot: Rates on 20-year term just dropped for your age band. Want us to
> re-run your quote? Reply YES or see quotebot.io

**Marketing — related product:**
> Quote Bot: You looked at life cover - many clients pair it with long-term care.
> 2-min estimate: quotebot.io/ltc

**Periodic reminder — carries STOP, roughly monthly (see 8.1):**
> Quote Bot: You're subscribed to quote and offer texts. Reply STOP to opt out or
> HELP for help. Msg&data rates may apply.

**Agent follow-up:**
> Quote Bot: This is Kennedy with Quote Bot following up on the quote you ran
> yesterday. Happy to answer questions - call (888) 804-8590.

Note the hyphens. Every one of these must stay inside GSM-7, and an em dash
silently triples the segment count (5.4).

### 8.1 Where opt-out language goes, and where it does not

**It is required on the first message and not on every message.** Twilio's
messaging policy attaches the requirement to the initial message — *"The initial
message that you send to a recipient needs to include the following language:
'Reply STOP to unsubscribe'"* — and for ongoing messages describes reminding the
recipient as *best practice* rather than a requirement. CTIA's Messaging
Principles require opt-out information in the confirmation message for recurring
programs and do not mandate repeating it in every subsequent message.

So the policy here is:

| Message | Opt-out language |
|---|---|
| Confirmation (the initial message) | **Required.** Carries "STOP to opt out" |
| Routine quote, agent and marketing messages | Omitted |
| Periodic reminder, roughly monthly | Carries it, as the best-practice reminder |
| Any reply to HELP | Carries it |

Two caveats worth keeping in view. Carrier filtering in practice can be stricter
than any published policy, and a campaign's sample messages are read during
vetting — if a reviewer expects opt-out language on the samples, adding it back
is cheaper than arguing. And this is a carrier-policy question rather than a
settled legal one, so it is in section 11 for counsel.

---

## 9. Message flow, as the form wants it

**Do not submit either version until the behaviour it describes is built.** The
registration is a description of a live system, and a reviewer can check it. See
section 2 for what is outstanding.

### 9.1 Submittable once QBP-105 ships (STOP and HELP)

This is the minimum honest version: it describes only the calculator opt-in and
the keyword handling, and claims nothing about confirmation messages or the
agent route.

> A consumer visits a Quote Bot insurance calculator at tools.quotebot.io and
> enters their own details to receive a quote. Beneath the phone number field is
> an unticked, optional checkbox reading "Text me quotes and offers", with the
> full disclosure displayed directly beneath it. Neither the checkbox nor the
> phone number is required to see results. If the consumer ticks the box and
> submits, a consent record is written capturing the exact disclosure shown, the
> page URL, a server-side timestamp, the browser user agent and a hashed origin
> IP. Only that ticked box produces consent to text; leads reaching Quote Bot by
> any other route are not sent messages. Consumers may opt out at any time by
> replying STOP, and request help by replying HELP.

### 9.2 The version to submit once QBP-107 and QBP-108 also ship

> …as above, and: a confirmation message is then sent immediately, identifying
> Quote Bot and telling the consumer they may reply STOP at any time to opt out.
>
> Quote Bot also receives leads by other routes, including a chat widget and
> agents entering them by hand. Those leads are not sent marketing messages on the
> strength of that alone. Where an agent records that a consumer gave consent
> verbally, a confirmation message is sent asking the consumer to reply Y, and no
> marketing message is sent to that number unless and until they do.

Two things in 9.2 are load-bearing and both will be true once it ships.

**Leads from other routes are not texted.** The send gate reads consent records,
and chat and agent-entered leads have none today — see 5.2. This is true in both
versions, and true today.

**The agent path requires an affirmative reply.** That is the asymmetry in 5.4: a
consumer who ticked a box on a calculator has already acted, so silence changes
nothing; a consumer an agent says gave verbal consent has not acted, so silence
means no marketing. Worth stating on the registration rather than leaving out,
because a reviewer who finds a second consent route you did not mention is
entitled to wonder what else was omitted.

Use case: **Marketing**. Now that the ticked box is the only consent that permits
a text (section 10), there is no separate transactional stream to argue about,
and a single marketing campaign describes the traffic accurately.

---

## 10. One consent, and what it took to get there

**The rule, once the change below ships: one consent type, `TCPA_SMS`. There is no
second, weaker permission that also allows a text.**

Two routes can produce that one consent, and the difference between them is not
in the record's type but in what it takes to act on it (5.4):

- **A consumer ticks the box** on a calculator — they have acted, and the record
  permits marketing on its own.
- **An agent records a consent** a consumer gave verbally — the record exists,
  but nothing is sent until the consumer replies Y from the handset.

One type, one bar, two ways of clearing it. That is the simplest thing to
describe to a reviewer and the easiest to hold to, and it is a deliberate
narrowing rather than the state we drifted into.

### Current state, accurately

Two consent types exist in the system today:

**`TCPA_SMS`** comes only from the ticked box beside the marketing wording in
section 4. It is the only one that opens a campaign, and it is the only one that
will survive the change.

**`TCPA_SMS_TRANSACTIONAL`** comes from the page's own consent line — *"you agree
to be contacted by a licensed Quote-Bot specialist by phone, SMS, or email to
follow up on this request."* It permits a text about the thing the person asked
for and permits no campaign at all.

### Why both exist, and why we are removing one

These were a single type until recently. That meant a visitor who ticked nothing
and only wanted their quote came out of the system looking like somebody who had
signed up for a campaign — evidence we generated ourselves, pointed at the gate
meant to stop us. Splitting them fixed that.

Collapsing back to one type is only safe in one direction: keeping the **stronger**
consent and deleting the weaker. The legal distinction between a follow-up reply
and a marketing campaign exists whether or not our data model records it; dropping
the distinction does not remove it, it only removes our ability to show which one
we held. So every text has to clear the marketing bar, which means the ticked box.

**The cost, stated plainly:** a consumer who gives a phone number and does not
tick cannot be texted at all, including a reply to the quote they just requested.
They can be called and emailed. That is a real reduction in how agents can reach
people, accepted in exchange for a consent model with exactly one rule in it.

### The send gate

Unchanged by any of this, and already built. Every send is refused on:
do-not-contact, no number on the channel, a dead or bounced number, no consent of
the required type, or any revocation. Where a person opted out and back in, the
newest record wins. Where they opted in and later out, they are out. A revocation
on either SMS type refuses both purposes — a STOP is a STOP.

---

## 11. Questions for counsel

1. Does the section 4 wording satisfy 47 CFR 64.1200(f)(9) for this use case?
2. Does the absence of "recurring" and of an autodialer reference matter here?
3. Any state-specific requirements — Florida and Oklahoma mini-TCPA in particular
   — that change the wording or the record we keep?
4. Is the evidence set in section 6 what you would want to rely on, and is the
   retention period defined anywhere it should be?
5. Is a hashed IP sufficient, or do you want the raw value retained despite the
   breach-reporting exposure?
6. We are narrowing to a single consent — the ticked box — and will no longer
   text anyone without it, including to reply about their own quote request
   (section 10). Any reason to keep a separate transactional permission you would
   want us to preserve?
7. For chat and agent-entered leads (5.2): what does an agent recording verbal
   consent on a call need to capture for that record to be worth anything — the
   call recording reference, a read-back of the disclosure, something else?
8. We plan to carry "Reply STOP to opt out" on the confirmation message and on a
   roughly monthly reminder, but not on routine messages (8.1). Carrier policy
   appears to require it only on the initial message. Are you comfortable with
   that, and does any state law we sell into require more?
9. Section 5.4 treats the two consent paths differently: a consumer who ticks the
   box on a calculator is textable without replying, while a lead an agent
   entered is not textable until they reply Y from the handset. Does that
   asymmetry sit right with you, and is a confirmed Y enough to make an
   agent-recorded verbal consent something you would rely on?

---

*Facts verified against production on 26 September 2026. Sections 2, 5.2, 5.4, 7
and 10 describe work that is decided but not built. None of it should be
represented as built — on the registration or to counsel — until it ships.*
