# Influencer prospects — inviting creators who have not joined

Super admin → **Influencers → Prospects** (`/admin/influencers/prospects`).

Add a creator (name, email, Instagram, optional note), tick one or many, press
**Generate**, review, **Send**. One selected → a personal email written from
what you typed about them. Several → one template with `{{firstName}}` /
`{{instagram}}`, rendered and sent separately to each person.

It is built on the influencer-mail system (see `influencer-mail-setup.md`):
same SES sender, same Reply-To, same inbound pipeline, same `EmailThread`
store and `INF-` reference tokens. Classic style uses the influencer sender;
Personal style (the default) sends as a person — see below.

## Two styles: Personal (default) and Classic

The Generate dialog has a **Personal (recommended) / Classic** toggle. The
style is stored on each job and, once the first email goes, on the prospect
(`outreachStyle`): a follow-up or reply keeps the style — and so the sender —
the conversation started with.

**Why Personal exists.** Classic first emails landed in Gmail **Promotions**.
The signals responsible, strongest first: the `List-Unsubscribe` /
`-Post` headers (Gmail's bulk-mail marker), the newsletter footer (why-line,
unsubscribe link, business address, `Ref:` token), sales copy in a cold first
email (percentages, "free", a sign-up link), a role sender
(`influencer-support@`) under a brand-ish name, and the HTML part. Personal
style removes every one of them:

| | Personal | Classic |
|---|---|---|
| From | `PROSPECT_PERSONAL_FROM_NAME <PROSPECT_PERSONAL_FROM_EMAIL>` — Suyash Agrahari &lt;suyashagrahari@subhsandesh.in&gt; | `PROSPECT_FROM_NAME <INFLUENCER_FROM_EMAIL>` |
| Reply-To | `INFLUENCER_REPLY_TO_EMAIL` (the SES receiving address), else the From | same |
| Parts | text/plain only | text + HTML |
| Headers | none extra (threading only) | `List-Unsubscribe`, `List-Unsubscribe-Post` |
| Footer | none — just the signature `PROSPECT_PERSONAL_SIGNATURE` | why-line, unsubscribe link, address, `Ref:` |
| First email | 40–90 words, no links, no digits/₹/%, no pitch words, one question, ends with the opt-out line | 60–180 words, one subhsandesh.in link, the real % |
| Follow-up | 8–45 words, same thread (`Re:` + In-Reply-To/References), no link | 25–140 words |
| Reply (after they wrote) | may include the join link and the real commission % | same |

The linter has a personal profile (`lintOutreach(..., { style: "personal" })`)
that enforces the first-email rules on the server at send time and in the
worker; the dialog shows the same verdict plus an **Inbox check** list.

**Opt-out without a footer.** Every personal first email ends with one human
line — *If it's not for you, just reply "no" and I won't email again.* — and
`classifyProspectReply` turns a short "no", "nope", "no thanks", "not
interested", "not for me", "I'll pass" into `not_interested`, and "stop",
"remove me", "unsubscribe", "don't email me" into `unsubscribed`. Both are
suppressed for every future send. The public unsubscribe endpoint and SES
bounce/complaint suppression are unchanged.

**Matching replies without the `Ref:` token.** The thread still has its token
(stored, not printed). Replies match on In-Reply-To / References (SES's
reconstructed Message-ID), then on the sender address — see
`matchInfluencerInbound`. A reply from a different address with the headers
stripped lands in Unmatched; reassign it from there.

**The sender must be allowed by IAM.** The prod SES user's policy
(`SubhSandeshSesSendOnly`) restricts `ses:FromAddress`. Until the personal
address is on that list, SES refuses: the job waits in the queue (retried
hourly, never re-sent from another address), and the dialog and job show
"Personal sender isn't allowed yet". Fix: run
`/private/tmp/claude-501/sesfix/add-personal-sender.sh` (re-runnable; keeps
the existing five addresses, simulates all six at the end) — or switch to
Classic.

**Compliance.** Personal style drops the postal-address footer. India has no
equivalent rule for a one-to-one business note, but **CAN-SPAM requires a
valid physical postal address in commercial email to US recipients**. Set
`PROSPECT_PERSONAL_INCLUDE_ADDRESS=1` to append one plain line
("SubhSandesh, <postal address>") to the signature when emailing US creators.
Reply-to-opt-out and suppression stay in force either way.

## Pieces

| | |
|---|---|
| `models/InfluencerProspect.ts` | the person + status ladder (`new → contacted → replied → joined`, or `not_interested / bounced / unsubscribed`) |
| `models/ProspectMailJob.ts` | one queued email to one person; at most one live job per prospect (unique partial index) |
| `services/prospectMail.service.ts` | pure rules: input parsing, merge fields, **the spam linter**, the email (text + HTML + headers), contact limits, pacing, bounce parsing |
| `services/prospectAi.service.ts` | drafts (personal / template / follow-up / reply), reusing `influencerMailAi` guardrails |
| `services/prospect.service.ts` | DB transitions: add + duplicate check, reply / unsubscribe / bounce / join |
| `services/prospectQueue.service.ts` | the background sender (started in `server.ts`) |
| `controllers/prospect.controller.ts` | `/api/admin/super/prospects/*` + the public unsubscribe |

## Deliverability measures

- **Content**: 80–150 words (hard limits 60–180), greeting by first name, one
  ask, **one link only** (`PROSPECT_JOIN_URL`, full https on subhsandesh.in — no
  shorteners, no tracking redirects), no images, no attachments, no tracking
  pixel. The linter (`lintOutreach`) blocks Send for: spam phrases, ALL-CAPS
  words, `!!` / more than two `!`, repeated ₹/$, any % other than the real
  commission, foreign or http links, more than one link, HTML, fake `Re:` on a
  first email, unknown `{{fields}}`, long subjects. It runs on every
  recipient's rendered email at send time AND again in the worker — the UI
  shows the same verdict live, but cannot skip it.
- **AI**: the prompt describes a plain first-person voice and never names the
  banned phrases (naming them makes them likelier). Output is checked by the
  influencer guardrail (no invented ₹, only the commission %, only our links,
  no money/date promises) and by the linter; a failing draft is regenerated up
  to twice.
- **Format**: multipart text/plain + minimal HTML that mirrors it, signed
  `PROSPECT_SIGNATURE`, From display name `PROSPECT_FROM_NAME`. Footer: why
  they're getting it, the registered business name and address
  (`config/business.ts`, same as the site footer), an unsubscribe link, the
  `Ref: INF-…` token.
- **RFC 8058**: `List-Unsubscribe: <https://…/unsubscribe/TOKEN>, <mailto:reply-address?subject=unsubscribe>`
  and `List-Unsubscribe-Post: List-Unsubscribe=One-Click`. GET on the link only
  shows a confirm button (link scanners prefetch GETs); POST unsubscribes.
  A reply whose subject is "unsubscribe", or that is only "stop / remove me",
  also unsubscribes; "no thanks / not interested" marks not interested.
- **Never again**: `unsubscribed`, `bounced`, `not_interested`, `joined` are
  refused server-side for every send, checked when queueing and again right
  before each send. Deleting a prospect is a soft delete, so re-adding an
  unsubscribed address is refused.
- **Contact limits**: one first email, one follow-up after
  `PROSPECT_FOLLOWUP_DAYS` days of silence, nothing more unless they reply.
- **Warm-up**: the worker sends one email at a time, a random
  `PROSPECT_MIN_GAP_SECONDS`–`PROSPECT_MAX_GAP_SECONDS` apart (2–6 min, drawn
  once per send and stored on the job as `gapAfterMs`), only between
  `PROSPECT_SEND_START_HOUR` and `PROSPECT_SEND_END_HOUR` local time
  (09–21 IST), and at most `PROSPECT_DAILY_CAP` in any rolling 24 hours. A 50-person selection is spread over two days at the
  defaults. A job interrupted mid-send is marked failed, never retried
  blindly; throttling errors retry with backoff.

## Bounces and complaints

`sesInbound.controller` now reads SES bounce/complaint notifications on the
existing SNS webhook and marks matching prospects `bounced` (permanent bounces
only) or `unsubscribed` (complaints). **This only works once SES publishes
them to the topic the webhook already trusts** (`SES_INBOUND_TOPIC_ARN`):

- SES console → Verified identities → `subhsandesh.in` → Notifications →
  Feedback notifications → Bounce + Complaint → that SNS topic, **or**
- a configuration-set event destination (Bounce, Complaint) → that topic.

Until then, bounces are not seen; SES send refusals are still recorded on the
job ("failed" with SES's reason) and shown in the UI.

## Joining

`registerInfluencer` calls `markProspectJoined`: any prospect with the same
email or Instagram handle becomes `joined`, queued mail is cancelled, and the
prospect's thread is converted in place to an influencer thread for the new
user — the conversation appears on their influencer page.

## Environment

| Variable | Default |
|---|---|
| `PROSPECT_FROM_NAME` | `Suyash from SubhSandesh` |
| `PROSPECT_SIGNATURE` | `Suyash\nSubhSandesh` |
| `PROSPECT_JOIN_URL` | `https://subhsandesh.in/influencer` |
| `PROSPECT_DAILY_CAP` | `30` (0 pauses sending) |
| `PROSPECT_MIN_GAP_SECONDS` / `PROSPECT_MAX_GAP_SECONDS` | `120` / `360` (random gap per send) |
| `PROSPECT_SEND_START_HOUR` / `PROSPECT_SEND_END_HOUR` | `9` / `21` (equal = any time) |
| `PROSPECT_SEND_TZ_OFFSET_MINUTES` | `330` (IST) |
| `PROSPECT_PERSONAL_FROM_EMAIL` | `suyashagrahari@subhsandesh.in` (must be in the IAM `ses:FromAddress` list) |
| `PROSPECT_PERSONAL_FROM_NAME` | `Suyash Agrahari` |
| `PROSPECT_PERSONAL_SIGNATURE` | `Suyash\nSubhSandesh · subhsandesh.in` |
| `PROSPECT_PERSONAL_INCLUDE_ADDRESS` | off; `1` appends the postal line (CAN-SPAM, US recipients) |
| `PROSPECT_FOLLOWUP_DAYS` | `4` |
| `PUBLIC_API_URL` | derived: `api.subhsandesh.in` / `stag-api.subhsandesh.in` |

From and Reply-To are the influencer ones (`INFLUENCER_FROM_EMAIL`,
`INFLUENCER_REPLY_TO_EMAIL`).
