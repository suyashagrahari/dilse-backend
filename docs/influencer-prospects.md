# Influencer prospects — inviting creators who have not joined

Super admin → **Influencers → Prospects** (`/admin/influencers/prospects`).

Add a creator (name, email, Instagram, optional note), tick one or many, press
**Generate**, review, **Send**. One selected → an email written for them from
what you typed about them. Several → one template with `{{firstName}}` /
`{{instagram}}`, rendered and sent separately to each person.

It is built on the influencer-mail system (see `influencer-mail-setup.md`):
same SES, same Reply-To, same inbound pipeline, same `EmailThread` store and
`INF-` reference tokens.

## Who it comes from: the team

Every prospect email comes from **SubhSandesh Team &lt;team@subhsandesh.in&gt;**
and is signed **Team SubhSandesh** (one plain line). The AI writes as the team
— "we", "our team" — never as one named person. Defaults are in
`config/env.ts` (`PROSPECT_TEAM_DEFAULTS`); the box env can still override
them. The dialog and the list header show the From line exactly as the server
reports it (status endpoint → `personal.fromName/fromAddress`), never a
hard-coded string.

## Kinds of email (intents) — send again any time

| Intent | When | Subject | Threading | Link (team note) |
|---|---|---|---|---|
| **First email** | never emailed | its own, 4–8 words | new thread | none |
| **Follow-up** | already emailed | `Re: <their last subject>` | same thread: In-Reply-To + References | none in follow-up #1; one subhsandesh.in link allowed from #2 |
| **New email** (`fresh`) | already emailed | a new meaningful subject | **a new thread in their inbox** (no In-Reply-To), appended to the same conversation in the admin | one allowed |
| **Reply** | they wrote back | `Re: …` | same thread | the join link + the real % |

*Why New email starts a new inbox thread:* Gmail threads by subject as well as
headers, so a new subject under In-Reply-To would split anyway; a clean new
email is honest about being one. In the admin it stays in the prospect's one
conversation, and their answer to either email lands there (matched by
In-Reply-To/References, then by sender address).

There is **no cap** after the first email. `canEmailProspect` returns every
intent allowed now:

- **Hard blocks** (with the reason shown): unsubscribed, complained (stored as
  unsubscribed + `complainedAt`), bounced, joined, deleted, dead address.
- **Not interested**: allowed only after an explicit confirm (the sheet asks;
  the dialog has a checkbox). The job carries `override: true`; without it the
  worker skips them — so a "no" that lands after queueing still wins.
- **Within 48 h of the last email**: a warning, never a block.
- **Follow-up due**: a contacted prospect quiet for `PROSPECT_FOLLOWUP_DAYS`
  gets the "Follow-up due" chip/filter. Advice only.

**Mixed selections** (`planSelection`): one intent per send. The dialog shows
an intent picker with how many of the selection each intent reaches (default:
the most common stage). Everyone the intent doesn't fit is listed under
"Not included" with the reason ("Already emailed — use Follow-up or New
email", "Not emailed yet — needs a first email", "Unsubscribed…"). Nobody is
dropped silently. Replies stay one at a time.

The dialog also shows, per person, how many emails were already sent and when,
and warns above 10 recipients at once (≈15/day keeps a young domain healthy).

## Two styles: Team note (default) and Classic

The Generate dialog has a **Team note (recommended) / Classic** toggle. The
style is stored on each job and, once the first email goes, on the prospect
(`outreachStyle`): later emails keep the style — and so the sender — the
conversation started with.

**Why the team note.** Classic first emails landed in Gmail **Promotions**.
The signals responsible, strongest first: the `List-Unsubscribe` /
`-Post` headers (Gmail's bulk-mail marker), the newsletter footer, sales copy
in a cold first email (percentages, "free", a sign-up link), and the HTML
part. A team address is a little less "personal" than a named person, so the
team note compensates on every other signal:

| | Team note | Classic |
|---|---|---|
| From | `PROSPECT_PERSONAL_FROM_NAME <PROSPECT_PERSONAL_FROM_EMAIL>` — SubhSandesh Team &lt;team@subhsandesh.in&gt; | `PROSPECT_FROM_NAME <INFLUENCER_FROM_EMAIL>` |
| Reply-To | `INFLUENCER_REPLY_TO_EMAIL` (the SES receiving address), else the From | same |
| Parts | text/plain only — no HTML, images or tracking | text + HTML |
| Headers | none extra (threading only) | `List-Unsubscribe`, `List-Unsubscribe-Post` |
| Footer | none — just `Team SubhSandesh` | why-line, unsubscribe link, address, `Ref:` |
| Subject (first / new email) | 4–8 words, specific, sentence case, no `Re:`, no emoji / `!` / ALL CAPS, no ad words (free, earn, offer, opportunity, guaranteed, money, %, ₹), not generic ("quick question", "hi", "collab") | same rules |
| First email | 50–110 words, no links, no digits/₹/%, no pitch words, one soft question, **no "reply no" line** | 60–180 words, one subhsandesh.in link, the real % |
| Follow-up | 25–60 words, same thread; no link in #1, one allowed from #2 | 25–140 words |
| New email | 40–100 words, new subject, ≤1 link | 40–160 words |
| Reply (after they wrote) | answers their questions, then the join link + the real % | same |

**Subjects.** The model is asked for a specific 4–8 word subject naming the
collaboration and, when we can, the creator ("Collab idea for @theecouple__",
"SubhSandesh x Om & Diya — a paid collab?", "A creator collab with
SubhSandesh"). If what comes back fails `subjectIssues`, `fallbackSubject`
replaces it deterministically (no retry).

**Two drafts.** Generate asks the model for two angles in parallel (A: the
specific line about them first; B: a concrete reel idea first) and the dialog
switches between them; Regenerate draws a new pair.

**Opt-out without a footer — silent.** The team note carries no "reply no /
I won't email again / unsubscribe" line (the owner's call: it reads like a
mass mailing). The linter refuses one (`opt_out_line`) and the parser strips
one the model adds. The protection stays: `classifyProspectReply` turns a
short "no", "nope", "no thanks", "not interested", "not for me", "I'll pass"
into `not_interested`, and "stop", "remove me", "unsubscribe", "don't email
me" into `unsubscribed`. The public unsubscribe endpoint and SES
bounce/complaint suppression are unchanged.

**Matching replies without the `Ref:` token.** The thread still has its token
(stored, not printed). Replies match on In-Reply-To / References (SES's
reconstructed Message-ID), then on the sender address — see
`matchInfluencerInbound`. A reply from a different address with the headers
stripped lands in Unmatched; reassign it from there.

**The sender must be allowed by IAM.** The prod SES user's policy
(`SubhSandeshSesSendOnly`) restricts `ses:FromAddress`; team@ is on it. If the
address is ever changed to one that isn't, SES refuses: the job waits in the
queue (retried hourly, never re-sent from another address), and the dialog
and job show "Sender isn't allowed yet".

**Compliance.** The team note drops the postal-address footer. India has no
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
| `services/prospectMail.service.ts` | pure rules: input parsing, merge fields, **the spam linter**, subjects (`subjectIssues`, `fallbackSubject`), the email (text + HTML + headers), contact rules (`canEmailProspect`, `planSelection`), pacing, bounce parsing |
| `services/prospectAi.service.ts` | drafts (personal / template / follow-up / new email / reply, two angles), reusing `influencerMailAi` guardrails |
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
- **AI**: the prompt describes a plain team voice ("we") and never names the
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
- **Never again**: `unsubscribed` (incl. complaints), `bounced`, `joined` are
  refused server-side for every send, checked when queueing and again right
  before each send; `not_interested` only with an explicit confirm. Deleting a
  prospect is a soft delete, so re-adding an unsubscribed address is refused.
- **Contact limits**: none after the first email — see "Kinds of email".
  Under 48 h since the last email is a warning; above 10 recipients at once
  the dialog recommends ≤15/day.
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
| `PROSPECT_FROM_NAME` | `SubhSandesh Team` (classic) |
| `PROSPECT_SIGNATURE` | `Team SubhSandesh` (classic) |
| `PROSPECT_JOIN_URL` | `https://subhsandesh.in/influencer` |
| `PROSPECT_DAILY_CAP` | `30` (0 pauses sending) |
| `PROSPECT_MIN_GAP_SECONDS` / `PROSPECT_MAX_GAP_SECONDS` | `120` / `360` (random gap per send) |
| `PROSPECT_SEND_START_HOUR` / `PROSPECT_SEND_END_HOUR` | `9` / `21` (equal = any time) |
| `PROSPECT_SEND_TZ_OFFSET_MINUTES` | `330` (IST) |
| `PROSPECT_PERSONAL_FROM_EMAIL` | `team@subhsandesh.in` (must be in the IAM `ses:FromAddress` list) |
| `PROSPECT_PERSONAL_FROM_NAME` | `SubhSandesh Team` |
| `PROSPECT_PERSONAL_SIGNATURE` | `Team SubhSandesh` |
| `PROSPECT_SIGNATURE_SITE_LINE` | off; `1` adds a plain `subhsandesh.in` line under the signature (mail clients linkify it) |
| `PROSPECT_PERSONAL_INCLUDE_ADDRESS` | off; `1` appends the postal line (CAN-SPAM, US recipients) |
| `PROSPECT_FOLLOWUP_DAYS` | `4` — when "Follow-up due" shows; advice only |
| `PROSPECT_INSTANT` | on — Send goes out immediately; `0` brings back the paced queue |
| `PUBLIC_API_URL` | derived: `api.subhsandesh.in` / `stag-api.subhsandesh.in` |

Classic From is `INFLUENCER_FROM_EMAIL`; Reply-To is `INFLUENCER_REPLY_TO_EMAIL`
for both styles.
