# Influencer prospects — inviting creators who have not joined

Super admin → **Influencers → Prospects** (`/admin/influencers/prospects`).

Add a creator (name, email, Instagram, optional note), tick one or many, press
**Generate**, review, **Send**. One selected → an email written for them from
what you typed about them. Several → one template with `{{firstName}}` /
`{{instagram}}`, rendered and sent separately to each person.

It is built on the influencer-mail system (see `influencer-mail-setup.md`):
same SES, same Reply-To, same inbound pipeline, same `EmailThread` store and
`INF-` reference tokens.

## Who it comes from: Yash

Every personal-style prospect email (the default) comes from **Yash from
SubhSandesh &lt;yash@subhsandesh.in&gt;** and is signed

    Yash
    SubhSandesh

(plain text — the company, not a web address; `PROSPECT_SIGNATURE_COMPANY_LINE=0`
drops the second line). The AI writes **as Yash, in the first person** — "I'm
Yash from SubhSandesh", "I"; "we" only for the company — never as "the team",
and never signs "Team SubhSandesh" (the linter refuses that line in personal
mail). Classic style keeps the team (`SubhSandesh Team`, `Team SubhSandesh`).
Defaults are in `config/env.ts` (`PROSPECT_PERSONAL_DEFAULTS`,
`PROSPECT_TEAM_DEFAULTS`); **the box env still overrides them**, so a box that
sets `PROSPECT_PERSONAL_FROM_EMAIL=team@…` keeps sending as the team until
those lines are removed. The dialog and the list header show the From line
exactly as the server reports it (status endpoint →
`personal.fromName/fromAddress/signature/writer`), never a hard-coded string.

## Kinds of email (intents) — send again any time

| Intent | When | Subject | Threading | Link (note from Yash) |
|---|---|---|---|---|
| **First email** | never emailed | its own, 2–6 words, human ("Hey Om and Diya") | new thread | none |
| **Follow-up** | already emailed | `Re: <their last subject>` | same thread: In-Reply-To + References | none in follow-up #1; one subhsandesh.in link allowed from #2 |
| **New email** (`fresh`) | already emailed | a new short subject ("One more reel idea") | **a new thread in their inbox** (no In-Reply-To), appended to the same conversation in the admin | one allowed |
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

## Connect: the default first email (a hello, no pitch)

A personal first email is a **Connect** note unless the admin picks **Pitch**
in the Generate dialog. It only asks to connect, so the creator replies:

- "Hey <first name(s)>," → one genuine line about THEIR content (from the
  admin note / niche / handle only; follower counts are scrubbed before the
  model sees them) → "I'm Yash" → would love to connect, there's something to
  run by them → ONE easy question. 35–70 words, signed just "Yash".
- Subject (deterministic): A "Om & Diya, would love to connect", B "Hey Om &
  Diya, quick hello from Yash" (`{{firstName}}` in a template).
- Linter profile `connect` (`lintOutreach(…, { touch: "connect" })`): every
  personal first-touch rule plus no "SubhSandesh" in the body, no product /
  money / pitch words (`CONNECT_BANNED_WORDS` + collab…/partner…/promot…/
  sponsor…/brand…), no numbers at all (traction numbers included), no links,
  a question mark required. The prompt never names the company or a banned word.
- No numbers, no screenshot: forced off ("Saved for after they reply").
- Follow-up to a Connect note: same thread ("Re: …"), 20–45 words, still no
  pitch, no link. It stays Connect until they reply (`touchFor`).
- When they reply, the Reply draft knows the first email was only a hello
  (`afterConnect`): it answers them first, then who Yash works for, what
  SubhSandesh makes, why it fits them, the real numbers (+ screenshot, both on
  by default for replies), the paid reel idea, their link + commission and a
  next step.
- From name: `PROSPECT_CONNECT_FROM_NAME` (empty = the normal From name).
- The prospect records `firstTouch` (`connect` | `pitch`); each job records
  `touch`. The sheet shows "Connect sent" / "Pitch sent".

## Two styles: Note from Yash (default) and Classic

The Generate dialog has a **Personal (recommended) / Classic** toggle. The
style is stored on each job and, once the first email goes, on the prospect
(`outreachStyle`): later emails keep the style — and so the sender — the
conversation started with.

**Why a note from Yash.** Gmail filed the team invites in **Promotions**. The
diagnosis: a brand sender ("SubhSandesh Team"), sales vocabulary in the first
email ("paid collab", "website", "create a reel", "special occasions"), and
SES's default configuration set with open tracking + VDM engagement metrics.
(Plain text, no `List-Unsubscribe`, no links in the first email were already
right and stay.) So personal style is now a note from one person, then a light
pitch, on a quiet sending lane:

| | Personal (Yash) | Classic |
|---|---|---|
| From | `PROSPECT_PERSONAL_FROM_NAME <PROSPECT_PERSONAL_FROM_EMAIL>` — Yash from SubhSandesh &lt;yash@subhsandesh.in&gt; | `PROSPECT_FROM_NAME <INFLUENCER_FROM_EMAIL>` |
| Voice | Yash, first person ("I'm Yash"); "we" = the company | the team ("we") |
| Reply-To | `INFLUENCER_REPLY_TO_EMAIL` (the SES receiving address), else the From | same |
| Parts | text/plain only — no HTML or images | text + HTML |
| Headers | none extra (threading only) | `List-Unsubscribe`, `List-Unsubscribe-Post` |
| SES configuration set | `PROSPECT_SES_CONFIGURATION_SET` (`outreach`) — the quiet lane | same |
| Footer | none — just `Yash` / `SubhSandesh` | why-line, unsubscribe link, address, `Ref:` |
| Subject (first / new email) | **2–6 words**, the way a person writes one: "Hey Om and Diya", "Loved your couple reels", "A reel idea for you two", "From Yash at SubhSandesh". Sentence case, no `Re:`, no emoji / `!` / digits / ALL CAPS, no pitch or ad words, not "quick question" / "hi" / "hello" alone | 4–8 words, specific ("Collab idea for @handle") |
| First email | **50–100 words**: "Hey <first name(s)>," → "I'm Yash from SubhSandesh." → one genuine line about their content (from the note/handle only) → one plain sentence on what SubhSandesh makes → a soft question about making a reel together; paying may be mentioned **once**, casually ("happy to pay for it, of course"). No links, digits, ₹, %, emoji, more than one `!`, **no pitch words**, **no "reply no" line** | 60–180 words, one subhsandesh.in link, the real % |
| Follow-up | 20–60 words, same thread ("Re:"), no pitch words; no link in #1, one allowed from #2 | 25–140 words |
| New email | 40–100 words, new short subject, ≤1 link, no pitch words | 40–160 words |
| Reply (after they wrote) | answers their questions, then the join link + the real % (the only place for them) | same |

**Pitch words** (`PERSONAL_PITCH_WORDS`, refused in personal first emails,
follow-ups and new emails — never in the prompt): collab / collaboration,
partnership, opportunity, brand, promote / promotion, offer, deal, sponsored,
campaign, website, platform, exclusive, limited, earn, commission, free, sign
up, programme, affiliate, referral, payout, income… "partner" alone is fine
(people send these pages to their partner). Other personal-only checks:
`no_intro` (a first email must say "I'm Yash" / "Yash here"), `team_signoff`,
`pay_twice`, `emoji` (none), `bangs` (at most one `!`). A follow-up's subject
is inherited ("Re: <first subject>"), so only its body is checked for pitch
words — old threads under "Collab idea for @x" still accept a follow-up.

**Subjects.** The model is asked for a 2–6 word human subject. If what comes
back fails `subjectIssues(subject, "personal")` (or has a digit),
`fallbackSubject({ style: "personal" })` replaces it deterministically (no
retry): "Hey Om and Diya" (angle A) / "A reel idea for you two" (angle B);
"One more idea, Priya" for a new email. Classic keeps its 4–8 word rules and
"Collab idea for @handle" fallback.

## The quiet sending lane (no open tracking)

The domain identity's default configuration set (`my-first-configuration-set`)
has an OPEN event destination, and the account has VDM engagement metrics on —
both add open tracking. Every prospect send (both styles) therefore names its
own set, `PROSPECT_SES_CONFIGURATION_SET` (default `outreach`), which overrides
the identity default. Create it once (us-east-1), with no tracking and VDM
engagement metrics off:

    aws sesv2 create-configuration-set --configuration-set-name outreach \
      --vdm-options 'DashboardOptions={EngagementMetrics=DISABLED}'

Optionally add a Bounce + Complaint (never Open / Click) event destination to
the SNS topic `sesInbound` trusts — or rely on the identity's feedback
notifications (see "Bounces and complaints"). The send-only IAM policy must
also allow `ses:SendEmail` on `arn:aws:ses:us-east-1:<acct>:configuration-set/outreach`.

**Until it exists.** If SES answers that the set does not exist
(`NotFoundException` / `ConfigurationSetDoesNotExist`) or the IAM policy does
not cover it, `sendInfluencerMail` retries the send **once** without the
override (the old behaviour: the identity default applies), logs a warning,
and the status endpoint reports `quietLane.state = "missing"` — the Inbox check
shows **⚠ Quiet lane not set up yet**. Any other SES error is not retried on
another lane. `PROSPECT_SES_CONFIGURATION_SET=off` sends on the default lane on
purpose (the Inbox check says so).

**Two drafts.** Generate asks the model for two angles in parallel (A: the
specific line about them first; B: a concrete reel idea first) and the dialog
switches between them; Regenerate draws a new pair.

**Opt-out without a footer — silent.** The personal note carries no "reply no /
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
(`SubhSandeshSesSendOnly`) restricts `ses:FromAddress`; **yash@ must be added
to it** (`add-personal-sender.sh`) — team@ was on it. Until it is, SES refuses: the job waits in the
queue (retried hourly, never re-sent from another address), and the dialog
and job show "Sender isn't allowed yet".

**Compliance.** The personal note drops the postal-address footer. India has no
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
| `models/OutreachProof.ts` | a traction screenshot + the numbers the admin confirmed |
| `services/outreachProof.service.ts` | sniff / strip / resize / store the screenshot, vision extraction, prompt facts, the allowed-number list, the inline image |
| `services/prospectModel.service.ts` | which OpenAI model drafts (best on the key, cached; `PROSPECT_AI_MODEL` overrides) |
| `services/mime.service.ts` | raw MIME for an email with an inline image (nodemailer MailComposer) |
| `controllers/outreachProof.controller.ts` | `/api/admin/super/prospects/proofs*` |

## Traction: real numbers in the email

Prospects → **Traction**. Upload a Google Search Console / Google Analytics
screenshot (PNG/JPG/WebP, ≤ 5 MB). The server checks the bytes (not the
declared type), applies EXIF orientation and drops all metadata, resizes to
≤ 1600 px wide, re-encodes as PNG (JPEG if the PNG would exceed ~1.2 MB), and
stores it at `gifts-media/outreach-proof/<id>.png` → `https://cdn.subhsandesh.in/…`.
The vision model then reads the headline totals and pre-fills a form. **Nothing
is usable until the admin presses Confirm numbers** (`active: true`); an upload
that is discarded is deleted from the CDN too. One confirmed proof is the
default (preselected in Generate). Replace swaps the image and asks for a
re-confirm; Delete removes the row and the object (queued emails keep their
snapshot and fail visibly if the image is gone).

In **Generate**: *Show our numbers* (+ which proof) and *Attach the screenshot*.

- The AI gets the confirmed **counts** only (never CTR %, average position,
  rates) with what each one truthfully means: Search Console clicks = visits
  from Google Search (not users), impressions = times shown in Google, GA users
  = people. It writes ONE line, e.g. "In the last 3 months about 52K people
  found us through Google Search alone, mostly couples planning birthdays and
  anniversaries."
- The linter (`allowedNumbers`) lets exactly those values through — `52.2K`,
  the rounded `52K`, `52.2 thousand`, `2.75M`/`2.8M`/`2.7M`/`2.75 million`, and
  the period's `3 months` — and still refuses every other digit, %, ₹ and the
  pitch words. A first email with numbers may be 70–120 words (a follow-up
  30–80).
- *Attach the screenshot* (personal style only): the email goes as raw MIME —
  `multipart/alternative` = `text/plain` (with "(screenshot of our Google
  Search stats attached)" above the signature) + `multipart/related`
  (`text/html` mirroring the text, `<img src="cid:…">`, the PNG inline). No
  remote image, no designed template. Threading headers, Reply-To and the
  quiet configuration set are kept. The Inbox check warns: images can nudge
  Gmail toward Promotions; numbers in the text alone are safest for a first
  email.
- Defaults (remembered per browser, separately for first emails and later
  ones): numbers on; image **off** for a first email, **on** for follow-ups,
  new emails and replies.
- The preview renders the HTML twin with the CDN URL in place of `cid:` — the
  email exactly as sent, image included — plus From / Reply-To / Subject.
- Each queued job carries a snapshot of the proof (`job.proof`), so the
  send-time linter checks the same numbers and later edits change nothing
  already queued. The image is fetched from our CDN at send time (≤ 3 MB,
  cached); if it can't be fetched the email is retried, then failed — never
  sent without the screenshot its text mentions.

### Which model writes

`PROSPECT_AI_MODEL` if set; otherwise the models list is read once per process
and the newest bare GPT-5-family model is used (`gpt-5.5` on the current key —
never -mini/-nano/-pro/-codex/dated/experimental), else o3, else gpt-4.1, else
gpt-4o. Reasoning models get `reasoning_effort: low` and
`max_completion_tokens`; a model that refuses the request falls back to gpt-4o
once. The choice is logged (`[prospect AI] drafting with …`). Screenshot
extraction uses the same model (image input).

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
- **AI**: classic's prompt describes a plain team voice ("we"); personal's
  writes as Yash in the first person. Neither names the banned phrases (naming them makes them likelier). Output is checked by the
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
| `PROSPECT_PERSONAL_FROM_EMAIL` | `yash@subhsandesh.in` (must be in the IAM `ses:FromAddress` list) |
| `PROSPECT_PERSONAL_FROM_NAME` | `Yash from SubhSandesh` |
| `PROSPECT_CONNECT_FROM_NAME` | empty = Connect notes use `PROSPECT_PERSONAL_FROM_NAME`; set `Yash` to send the hello (and its follow-ups) from plain "Yash" |
| `PROSPECT_PERSONAL_SIGNATURE` | `Yash` (its first word is who the AI writes as, and who "I'm …" must name) |
| `PROSPECT_SIGNATURE_COMPANY_LINE` | on — a plain `SubhSandesh` second line; `0` drops it |
| `PROSPECT_SIGNATURE_SITE_LINE` | off; `1` adds a plain `subhsandesh.in` line under the signature (mail clients linkify it) |
| `PROSPECT_SES_CONFIGURATION_SET` | `outreach` — the quiet lane; `off` = the identity's default set |
| `PROSPECT_PERSONAL_INCLUDE_ADDRESS` | off; `1` appends the postal line (CAN-SPAM, US recipients) |
| `PROSPECT_FOLLOWUP_DAYS` | `4` — when "Follow-up due" shows; advice only |
| `PROSPECT_INSTANT` | on — Send goes out immediately; `0` brings back the paced queue |
| `PUBLIC_API_URL` | derived: `api.subhsandesh.in` / `stag-api.subhsandesh.in` |
| `PROSPECT_AI_MODEL` | unset — best model on the key (see "Which model writes") |
| `S3_*` / `S3_PUBLIC_BASE_URL` | the existing media bucket; traction screenshots need `s3:PutObject` + `s3:DeleteObject` on `gifts-media/outreach-proof/*` |

Classic From is `INFLUENCER_FROM_EMAIL`; Reply-To is `INFLUENCER_REPLY_TO_EMAIL`
for both styles.
