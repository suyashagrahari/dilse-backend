# Influencer prospects — inviting creators who have not joined

Super admin → **Influencers → Prospects** (`/admin/influencers/prospects`).

Add a creator (name, email, Instagram, optional note), tick one or many, press
**Generate**, review, **Send**. One selected → a personal email written from
what you typed about them. Several → one template with `{{firstName}}` /
`{{instagram}}`, rendered and sent separately to each person.

It is built on the influencer-mail system (see `influencer-mail-setup.md`):
same SES sender, same Reply-To, same inbound pipeline, same `EmailThread`
store and `INF-` reference tokens. Nothing here adds a sender address.

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
- **Warm-up**: the worker sends one email at a time, at least
  `PROSPECT_MIN_GAP_SECONDS` apart, and at most `PROSPECT_DAILY_CAP` in any
  rolling 24 hours. A 50-person selection is spread over two days at the
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
| `PROSPECT_MIN_GAP_SECONDS` | `90` |
| `PROSPECT_FOLLOWUP_DAYS` | `4` |
| `PUBLIC_API_URL` | derived: `api.subhsandesh.in` / `stag-api.subhsandesh.in` |

From and Reply-To are the influencer ones (`INFLUENCER_FROM_EMAIL`,
`INFLUENCER_REPLY_TO_EMAIL`).
